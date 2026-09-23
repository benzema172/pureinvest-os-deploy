const { signSession } = require('./_pi-security');
const { DEMO_MANAGER_LOGIN, DEMO_MANAGER_PASSWORD } = require('./_pi-demo-data');

const json = (statusCode, body) => ({
  statusCode,
  headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
  body:JSON.stringify(body)
});

exports.handler = async function(event){
  if(event.httpMethod !== 'POST') return json(405,{ok:false,message:'Użyj POST.'});
  let body={}; try{ body=JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane.'}); }

  const configuredLogin = process.env.PI_FRIEND_LOGIN || '';
  const configuredPassword = process.env.PI_FRIEND_PASSWORD || '';
  const login = String(body.login || '').trim();
  const normalizedLogin = login.toLowerCase();
  const password = String(body.password || '');

  // Hardfix: admin/admin ma działać zawsze jako sandbox, niezależnie od ENV.
  const defaultSandbox = normalizedLogin === 'admin' && password === 'admin';
  const envSandbox = configuredLogin && configuredPassword && login === configuredLogin && password === configuredPassword;
  const demoManager = normalizedLogin === DEMO_MANAGER_LOGIN && password === DEMO_MANAGER_PASSWORD;

  if(!defaultSandbox && !envSandbox && !demoManager){
    return json(403,{ok:false,message:'Nieprawidłowy login lub hasło konta demonstracyjnego.'});
  }

  const displayName = demoManager ? 'Zarządca demonstracyjny' : 'Gość — tryb podglądu';
  const accountType = demoManager ? 'demo_manager' : 'guest_preview';

  let token;
  try{
    token = signSession({
      role:'friend',
      displayName,
      sandbox:true,
      demoManager,
      accountType,
      login:normalizedLogin
    }, 8*60*60);
  }catch(e){
    return json(500,{ok:false,message:'Brak konfiguracji PI_SESSION_SECRET. Ustaw zmienną Netlify o długości minimum 32 znaków, aby tryb gościa mógł wygenerować bezpieczny token.'});
  }

  return json(200,{
    ok:true,
    friendToken:token,
    role:'friend',
    sandbox:true,
    demoManager,
    accountType,
    portfolio:{properties:25,historyFrom:'2026-01-01'},
    user:{login:normalizedLogin, email:demoManager ? normalizedLogin : null, display_name:displayName},
    message:demoManager
      ? 'Konto demonstracyjnego zarządcy aktywne. Zapisy są bezpiecznie symulowane.'
      : 'Tryb podglądu aktywny. Zmiany będą symulowane i nie trafią do bazy.'
  });
};
