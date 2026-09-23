(function(){
  if(window.__PI_FRIEND_SANDBOX__) return;
  window.__PI_FRIEND_SANDBOX__ = true;

  const SESSION_KEY = 'piFriendSessionV1';
  const toast = (msg,type='info') => {
    try{ if(typeof window.piToastV760 === 'function') return window.piToastV760(msg,type); }catch(_){}
    try{ if(typeof window.piToastV770 === 'function') return window.piToastV770(msg,type); }catch(_){}
    console.log('[PureInvest Friend]', msg);
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function currentSession(){
    try{
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    }catch(_){ return null; }
  }
  function currentToken(){
    const session=currentSession();
    return session?.friendToken || '';
  }
  window.piFriendSandboxActive = function(){
    return !!currentToken();
  };
  window.piFriendSandboxLabel = function(){
    return currentSession()?.demoManager ? 'Zarządca demonstracyjny' : 'Gość — tryb podglądu';
  };

  async function friendSelect(body){
    const res = await fetch('/.netlify/functions/friend-data', {
      method:'POST',
      headers:{'Content-Type':'application/json','X-PI-Session-Token':currentToken()},
      body:JSON.stringify(body || {})
    });
    const out = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź friend-data.'}));
    if(!res.ok || !out.ok) return {data:null,error:{message:out.message || out.details || ('HTTP '+res.status)}};
    return {data:out.data || [], error:null, count:out.count || 0};
  }

  function fakeMutation(action, payload){
    toast('Tryb gościa: "'+action+'" zostało tylko zasymulowane. Baza i portfel nie zostały zmienione.', 'warn');
    const rows = Array.isArray(payload) ? payload : (payload ? [payload] : []);
    return Promise.resolve({data:rows.map((x,i)=>({id:'sandbox_'+Date.now()+'_'+i, ...(x || {})})), error:null, sandbox:true});
  }

  class FriendQuery {
    constructor(table){
      this.body = {table, action:'select', select:'*', filters:[], order:null, limit:null};
      this._mutationPayload = null;
    }
    select(cols){ if(!this.body.action || this.body.action === 'select') this.body.action='select'; this.body.select=cols || '*'; return this; }
    eq(column,value){ this.body.filters.push({column,op:'eq',value}); return this; }
    neq(column,value){ this.body.filters.push({column,op:'neq',value}); return this; }
    gte(column,value){ this.body.filters.push({column,op:'gte',value}); return this; }
    gt(column,value){ this.body.filters.push({column,op:'gt',value}); return this; }
    lte(column,value){ this.body.filters.push({column,op:'lte',value}); return this; }
    lt(column,value){ this.body.filters.push({column,op:'lt',value}); return this; }
    in(column,values){ this.body.filters.push({column,op:'in',values}); return this; }
    is(column,value){ this.body.filters.push({column,op:'is',value}); return this; }
    or(){ return this; }
    order(column,opts={}){ this.body.order={column,ascending:opts.ascending !== false}; return this; }
    limit(n){ this.body.limit=n; return this; }
    range(from,to){ this.body.range={from:Number(from)||0,to:Number(to)||0}; this.body.limit=Math.max(1, (Number(to)||0)-(Number(from)||0)+1); return this; }
    insert(payload){ this.body.action='insert'; this._mutationPayload=payload; return this; }
    update(payload){ this.body.action='update'; this._mutationPayload=payload; return this; }
    upsert(payload){ this.body.action='upsert'; this._mutationPayload=payload; return this; }
    delete(){ this.body.action='delete'; return this; }
    async execute(){
      if(this.body.action && this.body.action !== 'select') return fakeMutation(this.body.action, this._mutationPayload);
      return friendSelect(this.body);
    }
    then(resolve,reject){ return this.execute().then(resolve,reject); }
    async maybeSingle(){
      const res = await this.limit(1).execute();
      if(res.error) return {data:null,error:res.error};
      return {data:(res.data || [])[0] || null,error:null};
    }
    async single(){
      const res = await this.limit(1).execute();
      if(res.error) return {data:null,error:res.error};
      const row = (res.data || [])[0] || null;
      return row ? {data:row,error:null} : {data:null,error:{message:'Brak danych w trybie podglądu.'}};
    }
  }

  function createFriendDbProxy(){
    return {
      from(table){ return new FriendQuery(table); },
      auth:{
        async getSession(){ return {data:{session:{access_token:'friend-sandbox'}}, error:null}; },
        async getUser(){ const session=currentSession() || {}; return {data:{user:{id:'friend-sandbox',email:session.user?.email || session.user?.login || 'admin',user_metadata:{display_name:session.user?.display_name || 'Gość — tryb podglądu'}}},error:null}; },
        async signOut(){ sessionStorage.removeItem(SESSION_KEY); return {error:null}; },
        async signInWithPassword(){ return {data:null,error:{message:'Tryb gościa loguje się loginem admin i hasłem admin.'}}; }
      },
      storage:{
        from(bucket){
          return {
            async upload(path,file){ toast('Tryb gościa: upload pliku został zasymulowany.', 'warn'); return {data:{path},error:null}; },
            async remove(paths){ toast('Tryb gościa: usunięcie pliku zostało zasymulowane.', 'warn'); return {data:paths,error:null}; },
            getPublicUrl(path){
              const base = (window.PI_CONFIG && window.PI_CONFIG.SUPABASE_URL) || '';
              return {data:{publicUrl: base ? base.replace(/\/$/,'') + '/storage/v1/object/public/' + bucket + '/' + path : '#'}};
            }
          };
        }
      }
    };
  }

  window.piEnableFriendSandbox = async function(session){
    const stored = session || JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if(!stored || !stored.friendToken) return false;
    window.piFriendSessionV1 = stored;
    window.piFriendDbProxy = createFriendDbProxy();
    window.db = window.piDb = window.piFriendDbProxy;
    try{ db = window.piFriendDbProxy; }catch(_){}
    document.body.dataset.piFriendSandbox = 'true';
    document.body.classList.add('pi-friend-sandbox-mode','authenticated');

    let banner=document.getElementById('piFriendSandboxBanner');
    if(!banner){ banner=document.createElement('div'); banner.id='piFriendSandboxBanner'; banner.className='pi-friend-sandbox-banner'; document.body.appendChild(banner); }
    banner.innerHTML=stored.demoManager
      ? '<b>Konto demonstracyjne zarządcy</b><span>25 fikcyjnych lokali i historia od stycznia 2026. Zapisy są symulowane i nie wpływają na prawdziwe dane.</span>'
      : '<b>Tryb gościa / podgląd</b><span>Możesz sprawdzać wszystkie funkcje, ale zapisy są symulowane i nie wpływają na portfel.</span>';
    return true;
  };

  window.piFriendLogin = async function(login,password){
    const res = await fetch('/.netlify/functions/friend-login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({login,password})
    });
    const out = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź friend-login.'}));
    if(!res.ok || !out.ok) throw new Error(out.message || 'Nie udało się uruchomić trybu gościa.');
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(out));
    await window.piEnableFriendSandbox(out);
    return out;
  };

  window.piFriendRenderAccessCard = function(){
    const users = document.getElementById('piAdminSubtab-users');
    if(!users || document.getElementById('piFriendAccessCard')) return;
    const card = document.createElement('div');
    card.id = 'piFriendAccessCard';
    card.className = 'card pi-friend-access-card';
    const demo=currentSession()?.demoManager;
    card.innerHTML = demo ? `
      <div class="card-title">Konto demonstracyjnego zarządcy</div>
      <p>Portfel pokazowy: <b>25 lokali</b> · Historia od: <b>1 stycznia 2026</b></p>
      <p class="pi-muted">Wszystkie osoby, adresy pomocnicze i operacje finansowe są syntetyczne. Zapisy, usuwanie, import i edycja są symulowane — nie zmieniają bazy Supabase.</p>
      <div class="pi-friend-access-badges"><span>Pełny panel zarządcy</span><span>25 lokali</span><span>Bezpieczny sandbox</span></div>` : `
      <div class="card-title">Dostęp gościa — tryb podglądu</div>
      <p>Login: <b>admin</b> · Hasło: <b>admin</b></p>
      <p class="pi-muted">Ten dostęp działa jak pełny podgląd aplikacji. Operacje zapisu, usuwania, importu i edycji są symulowane lokalnie — nie zmieniają portfela, raportów ani bazy Supabase.</p>
      <div class="pi-friend-access-badges"><span>Pełny podgląd</span><span>Bez wpływu na finanse</span><span>Sandbox</span></div>`;
    users.insertBefore(card, users.firstElementChild);
  };

  document.addEventListener('DOMContentLoaded',()=>{
    if(window.piFriendSandboxActive()) setTimeout(()=>window.piEnableFriendSandbox(), 0);
    setTimeout(window.piFriendRenderAccessCard, 700);
  });
})();
