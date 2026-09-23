function el(id){return document.getElementById(id)}
window.PI_CONFIG = Object.assign({
  SUPABASE_URL: "",
  SUPABASE_PUBLISHABLE_KEY: ""
}, window.PI_CONFIG || {});
if(!window.PI_CONFIG.SUPABASE_URL || !window.PI_CONFIG.SUPABASE_PUBLISHABLE_KEY){
  console.warn('PureInvest: uzupełnij js/config.js: SUPABASE_URL i SUPABASE_PUBLISHABLE_KEY.');
}

if(!window.supabase || typeof window.supabase.createClient !== 'function'){
  console.warn('PureInvest: nie udało się załadować biblioteki Supabase z CDN. Aplikacja działa w trybie ograniczonym do czasu odświeżenia strony.');
  window.supabase = {
    createClient(){
      const emptyQuery = {
        select(){ return this; }, order(){ return Promise.resolve({data:[], error:{message:'Brak biblioteki Supabase CDN.'}}); }, eq(){ return this; }, neq(){ return this; }, gte(){ return this; }, gt(){ return this; }, lte(){ return this; }, lt(){ return this; }, in(){ return this; }, is(){ return this; }, limit(){ return this; }, range(){ return this; }, insert(){ return this; }, update(){ return this; }, upsert(){ return this; }, delete(){ return this; }, maybeSingle(){ return Promise.resolve({data:null, error:{message:'Brak biblioteki Supabase CDN.'}}); }, single(){ return Promise.resolve({data:null, error:{message:'Brak biblioteki Supabase CDN.'}}); }, then(resolve,reject){ return Promise.resolve({data:[], error:{message:'Brak biblioteki Supabase CDN.'}}).then(resolve,reject); }
      };
      return {
        auth:{ getSession:async()=>({data:{session:null},error:null}), getUser:async()=>({data:{user:null},error:null}), signInWithPassword:async()=>({data:null,error:{message:'Brak biblioteki Supabase CDN.'}}), signOut:async()=>({error:null}) },
        from(){ return Object.assign({}, emptyQuery); },
        storage:{ from(){ return { upload:async()=>({data:null,error:{message:'Brak biblioteki Supabase CDN.'}}), remove:async()=>({data:null,error:{message:'Brak biblioteki Supabase CDN.'}}), getPublicUrl:()=>({data:{publicUrl:'#'}}) }; } }
      };
    }
  };
}

let db = supabase.createClient(
  window.PI_CONFIG.SUPABASE_URL || "https://example.supabase.co",
  window.PI_CONFIG.SUPABASE_PUBLISHABLE_KEY || "missing-publishable-key"
);
window.db = db;
window.piDb = db;
function piIsLiveTx(row){ return !!row && row.is_deleted !== true && !row.deleted_at; }
function piLiveTxRows(rows){ return (rows || []).filter(piIsLiveTx); }

function piRentEngineMonthRange(date){
  const d = date ? new Date(date) : new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
  const end = new Date(d.getFullYear(), d.getMonth()+1, 1, 0,0,0,0);
  return {startISO:start.toISOString(), endISO:end.toISOString()};
}
function piRentEngineNum(v){
  const n = Number(String(v ?? '0').replace(/\s/g,'').replace(',','.'));
  return Number.isFinite(n) ? n : 0;
}
function piRentEngineBlankComponents(){ return {owner:0, community:0, electricity:0, gas:0, water:0, other:0}; }
function piRentEngineText(row){
  return String([row?.source,row?.category,row?.note,row?.attachment_name,row?.description,row?.name].filter(Boolean).join(' ')).toLowerCase();
}
function piRentEngineComponent(row){
  const t = piRentEngineText(row);
  if(/(prąd|prad|energia|energa|enea|pge|tauron|electric)/i.test(t)) return 'electricity';
  if(/(gaz|pgnig|pgni[gż]|gas)/i.test(t)) return 'gas';
  if(/(woda|wodoci|water)/i.test(t)) return 'water';
  if(/(wspól|wspol|czynsz|administr|spółdziel|spoldziel|community)/i.test(t)) return 'community';
  if(/(najem|odstępne|odstepne|rent)/i.test(t)) return 'owner';
  if(/(media|opłat|oplata|opłata|zaliczka)/i.test(t)) return 'other';
  return 'other';
}
function piRentEngineExpenseComponents(expenses){
  const c = piRentEngineBlankComponents();
  piLiveTxRows(expenses||[]).forEach(row=>{
    const key = piRentEngineComponent(row);
    const txt = piRentEngineText(row);
    if(/(remont|napraw|serwis|meble|wyposaż|wyposaz|inwestyc)/i.test(txt)) return;
    if(key !== 'owner') c[key] += piRentEngineNum(row.amount);
  });
  return c;
}
function piRentEngineDueComponents(property, expenses){
  const p = property || {};
  const fromExpenses = piRentEngineExpenseComponents(expenses||[]);
  const owner = piRentEngineNum(p.owner_rent ?? p.rent_amount ?? p.monthly_rent ?? p.owner_monthly_rent ?? p.rent ?? 0);
  return {
    owner,
    community: Math.max(piRentEngineNum(p.community_rent), fromExpenses.community),
    electricity: Math.max(piRentEngineNum(p.electricity_expected), fromExpenses.electricity),
    gas: Math.max(piRentEngineNum(p.gas_expected), fromExpenses.gas),
    water: Math.max(piRentEngineNum(p.water_expected), fromExpenses.water),
    other: fromExpenses.other
  };
}
function piRentEngineAllocatePayments(payments, due){
  const paid = piRentEngineBlankComponents();
  const d = Object.assign(piRentEngineBlankComponents(), due||{});
  const addCapped = (key, amount)=>{
    const cap = Math.max(0, piRentEngineNum(d[key]) - piRentEngineNum(paid[key]));
    const used = Math.min(Math.max(0, amount), cap);
    paid[key] += used;
    return amount - used;
  };
  piLiveTxRows(payments||[]).forEach(row=>{
    let amount = piRentEngineNum(row.amount);
    const key = piRentEngineComponent(row);
    if(key === 'owner'){
      amount = addCapped('owner', amount);
      for(const k of ['community','electricity','gas','water','other']) amount = addCapped(k, amount);
      if(amount > 0) paid.other += amount;
    }else if(key === 'other'){
      for(const k of ['community','electricity','gas','water','other']) amount = addCapped(k, amount);
      if(amount > 0) paid.other += amount;
    }else{
      paid[key] += amount;
    }
  });
  return paid;
}
function piRentEngineComponentSum(c){ return ['owner','community','electricity','gas','water','other'].reduce((a,k)=>a+piRentEngineNum(c?.[k]),0); }
function piRentEngineDisplayComponent(paid, due, key){
  const paidVal = piRentEngineNum(paid?.[key]);
  const dueVal = piRentEngineNum(due?.[key]);
  return paidVal > 0 ? paidVal : dueVal;
}
async function piActivityHeaders(){
  const headers = {'Content-Type':'application/json'};
  try{
    const res = await db.auth.getSession();
    const token = res?.data?.session?.access_token;
    if(token) headers.Authorization = 'Bearer ' + token;
  }catch(_){ }
  try{
    const owner = JSON.parse(sessionStorage.getItem('piOwnerSessionV570') || 'null');
    if(owner?.ownerToken) headers['x-pi-session-token'] = owner.ownerToken;
  }catch(_){ }
  try{
    const tenant = JSON.parse(sessionStorage.getItem('piTenantSessionV54') || 'null');
    if(tenant?.tenantToken && !headers['x-pi-session-token']) headers['x-pi-session-token'] = tenant.tenantToken;
  }catch(_){ }
  return headers;
}

const BUCKET="transaction-attachments";
const DOC_BUCKET="property-documents";
const PHOTO_BUCKET="property-photos";
let deferredInstallPrompt=null;
var activeProperty=null, activePropertyData=null, loadedProperties=[], chart=null, costPie=null, portfolioChartObj=null, rawPayments=[], rawExpenses=[];

const PI_ROLES = Object.freeze({ ADMIN:'admin', OWNER:'owner', TENANT:'tenant', GUEST:'guest' });
let piCurrentUser = null;
let piCurrentProfile = { role: PI_ROLES.GUEST, display_name:'Brak roli', access_property_ids:[], source:'safe_default' };
let piRoleReady = false;

function piRole(){ return piCurrentProfile?.role || PI_ROLES.GUEST; }
function piIsAdminLike(){ return piRole() === PI_ROLES.ADMIN; }
function piIsOwnerClient(){ return piRole() === PI_ROLES.OWNER; }
function piCanEditFinancials(){ return piRole() === PI_ROLES.ADMIN; }
function piCanEditProperty(){ return piRole() === PI_ROLES.ADMIN; }
function piCanSeeAllProperties(){ return piRole() === PI_ROLES.ADMIN; }

async function piLoadRoleContext(){
  if(typeof window.piFriendSandboxActive === 'function' && window.piFriendSandboxActive()){
    try{ await window.piEnableFriendSandbox(); }catch(_){}
    let sandboxSession={}; try{ sandboxSession=JSON.parse(sessionStorage.getItem('piFriendSessionV1') || '{}'); }catch(_){}
    piCurrentUser = {id:'friend-sandbox',email:sandboxSession.user?.email || sandboxSession.user?.login || 'admin'};
    piCurrentProfile = {role:PI_ROLES.ADMIN,display_name:sandboxSession.user?.display_name || 'Gość — tryb podglądu',access_property_ids:null,source:'friend_sandbox',demo_manager:!!sandboxSession.demoManager};
    piRoleReady = true; piApplyRoleUi(); return piCurrentProfile;
  }
  if(window.piOwnerSessionV570 || sessionStorage.getItem('piOwnerSessionV570')){
    try{ window.piOwnerSessionV570 = window.piOwnerSessionV570 || JSON.parse(sessionStorage.getItem('piOwnerSessionV570')||'null'); }catch(_){ }
    piCurrentUser = {id:null,email:window.piOwnerSessionV570?.owner?.email||null,phone:window.piOwnerSessionV570?.owner?.phone||null};
    piCurrentProfile = { role: PI_ROLES.OWNER, display_name:window.piOwnerSessionV570?.owner?.name || 'Owner', access_property_ids:(window.piOwnerSessionV570?.propertyIds||[]), source:'owner_pin' };
    piRoleReady = true; piApplyRoleUi(); return piCurrentProfile;
  }
  try{
    const userRes = await db.auth.getUser();
    piCurrentUser = userRes?.data?.user || null;
    if(!piCurrentUser){ piRoleReady = true; return piCurrentProfile; }

    let roleRow = null;
    try{
      const byUid = await db.from('pi_user_roles').select('role,email,user_id,is_active').eq('user_id', piCurrentUser.id).eq('is_active', true).maybeSingle();
      if(!byUid.error && byUid.data) roleRow = byUid.data;
    }catch(e){ console.warn('PureInvest pi_user_roles uid skipped:', e?.message || e); }
    if(!roleRow && piCurrentUser.email){
      try{
        const byEmail = await db.from('pi_user_roles').select('role,email,user_id,is_active').eq('email', String(piCurrentUser.email).toLowerCase()).eq('is_active', true).maybeSingle();
        if(!byEmail.error && byEmail.data) roleRow = byEmail.data;
      }catch(e){ console.warn('PureInvest pi_user_roles email skipped:', e?.message || e); }
    }

    let profile = null;
    try{
      const profileById = await db.from('profiles').select('id,email,display_name,role,status,user_id').eq('id', piCurrentUser.id).maybeSingle();
      if(!profileById.error && profileById.data) profile = profileById.data;
    }catch(e){ console.warn('PureInvest profiles id skipped:', e?.message || e); }
    if(!profile && piCurrentUser.email){
      try{
        const profileByEmail = await db.from('profiles').select('id,email,display_name,role,status,user_id').eq('email', String(piCurrentUser.email).toLowerCase()).maybeSingle();
        if(!profileByEmail.error && profileByEmail.data) profile = profileByEmail.data;
      }catch(e){ console.warn('PureInvest profiles email skipped:', e?.message || e); }
    }

    const storedRole = String(roleRow?.role || profile?.role || PI_ROLES.GUEST).toLowerCase();
    const resolvedRole = storedRole === 'super_admin' ? PI_ROLES.ADMIN : storedRole;
    piCurrentProfile = {
      role: [PI_ROLES.ADMIN, PI_ROLES.OWNER, PI_ROLES.TENANT].includes(resolvedRole) ? resolvedRole : PI_ROLES.GUEST,
      display_name: profile?.display_name || profile?.email || piCurrentUser.email || 'Użytkownik',
      access_property_ids: [],
      source: roleRow ? 'pi_user_roles' : (profile ? 'profiles' : 'safe_no_role')
    };

    // Dostępy ownera i najemcy obsługuje wyłącznie pi_property_access
    // przez kontrolowane funkcje Netlify. Supabase Auth jest panelem administratora.
    piCurrentProfile.access_property_ids = piCanSeeAllProperties() ? null : [];
  }catch(e){
    console.warn('PureInvest role context fallback:', e);
    piCurrentProfile = { role: PI_ROLES.GUEST, display_name:'Brak roli', access_property_ids:[], source:'safe_error' };
  }
  piRoleReady = true;
  piApplyRoleUi();
  return piCurrentProfile;
}

function piApplyRoleUi(){
  document.body.dataset.piRole = piRole();
  const roleLabel = document.getElementById('piRoleLabel');
  if(roleLabel){
    const labels = {admin:'Administrator', owner:'Owner / właściciel', tenant:'Najemca', guest:'Brak roli'};
    roleLabel.textContent = (piCurrentProfile?.source === 'friend_sandbox') ? (piCurrentProfile.display_name || 'Gość — podgląd') : (labels[piRole()] || piRole());
  }
  if(piIsOwnerClient()){
    document.querySelectorAll('[data-admin-only="true"]').forEach(btn=>{
      btn.disabled = true;
      btn.title = 'Dostęp tylko dla administratora PureInvest';
      btn.style.opacity = '.55';
      btn.style.cursor = 'not-allowed';
    });
  }
}

async function piSelectProperties(){
  if(!piRoleReady) await piLoadRoleContext();
  if(window.piOwnerSessionV570 && Array.isArray(window.piOwnerSessionV570.properties)){
    return {data:window.piOwnerSessionV570.properties, error:null};
  }
  let query = db.from('properties').select('*');
  if(!piCanSeeAllProperties()){
    const ids = piCurrentProfile.access_property_ids || [];
    if(!ids.length) return { data:[], error:null };
    query = query.in('id', ids);
  }
  return await query.order('created_at', { ascending:false });
}

function piRequireManager(actionName='tej operacji'){
  if(piCanEditFinancials()) return true;
  alert('Brak uprawnień do '+actionName+'. Ten widok jest przeznaczony dla zarządcy PureInvest.');
  return false;
}

function money(v){return Number(v||0).toFixed(2)+" zł"}
function piEsc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]||m))}
function piSafeUrl(v){
  try{
    const url=new URL(String(v||""),window.location.origin);
    return (url.protocol==="http:"||url.protocol==="https:")?url.href:"";
  }catch(_){return "";}
}
function monthKey(d){const x=new Date(d);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")}
function yearKey(d){return String(new Date(d).getFullYear())}
function actualPaymentDate(row){return window.PureInvestPaymentPeriod?.actualDate?.(row)||row?.payment_date||row?.date||row?.created_at}
function actualExpenseDate(row){return row?.expense_date||row?.date||row?.created_at}
function todayDate(){return new Date().toISOString().slice(0,10)}
function isNajem(x){return String(x.source||"").toLowerCase()==="najem"}
function isMediaIncome(x){const s=String(x.source||"").toLowerCase();return s==="media"||s==="czynsz"}
function calcTax(najem){return Math.min(najem,100000)*0.085 + Math.max(najem-100000,0)*0.125}

function piNum(v){
  if(v===null || v===undefined || v==='') return 0;
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  let t=String(v).trim().replace(/\s/g,'');
  if(t.includes(',') && t.includes('.')) t=t.replace(/\./g,'').replace(',','.');
  else t=t.replace(',','.');
  const out=Number(t);
  return Number.isFinite(out)?out:0;
}
function piTenantRentTaxBase(property){
  const p = property || (typeof activePropertyData!=='undefined' ? activePropertyData : null) || window.activePropertyData || {};
  try{
    const due = window.PureInvestFinanceCore?.dueComponents?.(p, []);
    const owner = piNum(due && (due.owner ?? due.owner_rent));
    if(owner > 0) return owner;
  }catch(_){}
  const direct = piNum(p.owner_rent ?? p.owner_monthly_rent ?? p.rent);
  if(direct > 0) return direct;
  const extras = piNum(p.community_rent)+piNum(p.electricity_expected)+piNum(p.gas_expected)+piNum(p.water_expected);
  const rentAmount = piNum(p.rent_amount || p.monthly_rent);
  return extras <= 0.009 ? rentAmount : 0;
}
function piRentPaymentMonths(rows){
  const set=new Set();
  (rows||[]).forEach(x=>{ try{ if(isNajem(x)) set.add(monthKey(x.payment_date||x.created_at)); }catch(e){} });
  return set.size;
}
function piTaxBaseFromPaymentRows(rows, opts={}){
  const base = piTenantRentTaxBase(opts.property);
  if(base>0){
    const months = piRentPaymentMonths(rows);
    const fallbackMonths = Number(opts.fallbackMonths || 0);
    const count = months || fallbackMonths;
    return count>0 ? base * count : 0;
  }
  return (rows||[]).filter(isNajem).reduce((a,b)=>a+piNum(b.amount),0);
}
function piCalcTenantRentTax(rows, opts={}){
  return calcTax(piTaxBaseFromPaymentRows(rows, opts));
}

window.addEventListener("load",()=>{
  if(costDate) costDate.value=todayDate();
  if(paymentDate) paymentDate.value=todayDate();
  const settlementMonth=document.getElementById('paymentSettlementMonth');
  if(settlementMonth && !settlementMonth.value) settlementMonth.value=todayDate().slice(0,7);
});

async function login(){
  const emailInput = el("email");
  const passwordInput = el("password");
  const msg = el("authMsg");

  const loginValue = emailInput ? emailInput.value.trim() : "";
  const secretValue = passwordInput ? passwordInput.value : "";

  if(!loginValue || !secretValue){
    if(msg) msg.innerText = "Podaj login i hasło/PIN.";
    return;
  }

  const normalizedSandboxLogin=loginValue.toLowerCase();
  const isSandboxLogin=(normalizedSandboxLogin === 'admin' && secretValue === 'admin') || normalizedSandboxLogin === 'demo@pure-invest.pl';
  if(isSandboxLogin){
    try{
      if(msg) msg.innerText = normalizedSandboxLogin === 'demo@pure-invest.pl' ? 'Uruchamiam konto demonstracyjnego zarządcy...' : 'Uruchamiam tryb gościa...';
      let friendSession = null;
      if(typeof window.piFriendLogin === 'function'){
        friendSession = await window.piFriendLogin(loginValue, secretValue);
      }else{
        const friendRes = await fetch('/.netlify/functions/friend-login', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({login:loginValue,password:secretValue}),
          cache:'no-store'
        });
        const friendData = await friendRes.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź friend-login.'}));
        if(!friendRes.ok || !friendData.ok) throw new Error(friendData.message || 'Nie udało się uruchomić trybu gościa.');
        sessionStorage.setItem('piFriendSessionV1', JSON.stringify(friendData));
        friendSession = friendData;
        if(typeof window.piEnableFriendSandbox === 'function') await window.piEnableFriendSandbox(friendData);
      }

      sessionStorage.setItem('piFriendSessionV1', JSON.stringify(friendSession));
      sessionStorage.removeItem('piOwnerSessionV570');
      sessionStorage.removeItem('piTenantSessionV54');
      sessionStorage.removeItem('piTenantMultiSessionV551');
      window.piFriendSessionV1 = friendSession;
      piCurrentUser = {id:'friend-sandbox',email:friendSession.user?.email || friendSession.user?.login || 'admin'};
      piCurrentProfile = {role:PI_ROLES.ADMIN,display_name:friendSession.user?.display_name || 'Gość — tryb podglądu',access_property_ids:null,source:'friend_sandbox',demo_manager:!!friendSession.demoManager};
      piRoleReady = true;
      try{ if(typeof window.piEnableFriendSandbox === 'function') await window.piEnableFriendSandbox(friendSession); }catch(_){ }
      try{ piApplyRoleUi(); }catch(_){ }
      document.body.classList.add('authenticated');
      if(msg) msg.innerText = '';
      showWelcome();
      setTimeout(()=>{ if(typeof loadPropertyTiles==='function') loadPropertyTiles(); if(typeof piRefreshAccessPanel==='function') piRefreshAccessPanel(); },250);
      return;
    }catch(friendError){
      if(msg) msg.innerText = friendError.message || 'Nie udało się uruchomić trybu gościa.';
      return;
    }
  }

  const isEmailLogin = loginValue.includes("@");
  const normalizedPhone = String(loginValue || "").replace(/\D/g, "");

  try{
    if(isEmailLogin){
      const {error}=await db.auth.signInWithPassword({
        email: loginValue,
        password: secretValue
      });

      if(error){
        if(msg) msg.innerText="Nieprawidłowy login lub hasło administratora. Zarządca loguje się numerem telefonu i PIN-em.";
        return;
      }

      sessionStorage.removeItem('piOwnerSessionV570');
      sessionStorage.removeItem('piTenantSessionV54');
      if(msg) msg.innerText="";
      await piLoadRoleContext();
      showWelcome();
      return;
    }

    if(!normalizedPhone){
      if(msg) msg.innerText="Wpisz numer telefonu jako login.";
      return;
    }

    const r = await fetch('/.netlify/functions/owner-login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({phone:normalizedPhone,pin:secretValue})
    });
    const data = await r.json().catch(()=>null);

    if(!data || !data.ok){
      if(msg) msg.innerText=(data && data.message) || "Brak aktywnego konta zarządcy dla podanego telefonu lub PIN-u.";
      return;
    }

    sessionStorage.setItem('piOwnerSessionV570', JSON.stringify(data));
    sessionStorage.removeItem('piTenantSessionV54');
    sessionStorage.removeItem('piTenantMultiSessionV551');
    window.piOwnerSessionV570 = data;
    piCurrentUser = { id:null, email:data?.owner?.email || null, phone:data?.owner?.phone || null };
    piCurrentRole = 'owner';
    document.body.classList.add('authenticated');
    if(msg) msg.innerText="";
    showWelcome();
    setTimeout(()=>{ if(typeof loadPropertyTiles==='function') loadPropertyTiles(); if(typeof piRefreshAccessPanel==='function') piRefreshAccessPanel(); },250);
  }catch(e){
    if(msg) msg.innerText="Błąd logowania zarządcy: "+(e.message || e);
  }
}

async function signup(){
  const emailInput = el("email");
  const passwordInput = el("password");
  const msg = el("authMsg");

  const emailValue = emailInput ? emailInput.value.trim() : "";
  const passwordValue = passwordInput ? passwordInput.value : "";

  if(!emailValue || !passwordValue){
    if(msg) msg.innerText = "Podaj email i hasło.";
    return;
  }

  try{
    const {error}=await db.auth.signUp({
      email: emailValue,
      password: passwordValue
    });

    if(!error){
      try{
        const user = (await db.auth.getUser())?.data?.user;
        if(user){
          await db.from('profiles').upsert({ id:user.id, email:user.email, role:'owner', status:'active' }, { onConflict:'id' });
        }
      }catch(profileErr){ console.warn('Nie utworzono profilu roli automatycznie:', profileErr); }
    }
    if(msg) msg.innerText=error?error.message:"Konto utworzone.";
  }catch(e){
    if(msg) msg.innerText="Błąd rejestracji: "+e.message;
  }
}

const PI_AUTH_HANDOFF_KEY='piAuthHandoffV1919';
async function piStartupSupabaseSession(){
  let handoff=null;
  try{ handoff=JSON.parse(sessionStorage.getItem(PI_AUTH_HANDOFF_KEY) || 'null'); }catch(_){ }
  const fresh=Number(handoff?.createdAt || 0)>0 && Date.now()-Number(handoff.createdAt)<60000;
  const attempts=fresh?8:1;
  let result={data:{session:null},error:null};
  for(let attempt=0;attempt<attempts;attempt++){
    try{ result=await db.auth.getSession(); }catch(error){ result={data:{session:null},error}; }
    if(result?.data?.session){
      try{ sessionStorage.removeItem(PI_AUTH_HANDOFF_KEY); }catch(_){ }
      return result;
    }
    if(attempt<attempts-1) await new Promise(resolve=>setTimeout(resolve,180));
  }
  if(!fresh){ try{ sessionStorage.removeItem(PI_AUTH_HANDOFF_KEY); }catch(_){ } }
  return result;
}

async function checkSession(){
  const storedFriendSessionV1 = sessionStorage.getItem('piFriendSessionV1');
  if(storedFriendSessionV1 && typeof window.piEnableFriendSandbox === 'function'){
    try{
      await window.piEnableFriendSandbox(JSON.parse(storedFriendSessionV1));
      const friendSession=JSON.parse(storedFriendSessionV1);
      piCurrentUser = {id:'friend-sandbox',email:friendSession.user?.email || friendSession.user?.login || 'admin'};
      piCurrentProfile = {role:PI_ROLES.ADMIN,display_name:friendSession.user?.display_name || 'Gość — tryb podglądu',access_property_ids:null,source:'friend_sandbox',demo_manager:!!friendSession.demoManager};
      piRoleReady = true;
      document.body.classList.add('authenticated');
      const login = el('loginScreen');
      if(login){login.classList.add('hidden');login.style.display='none';login.style.visibility='hidden';login.style.pointerEvents='none';}
      showWelcome();
      setTimeout(()=>{ if(typeof loadPropertyTiles==='function') loadPropertyTiles(); if(typeof piRefreshAccessPanel==='function') piRefreshAccessPanel(); },250);
      return;
    }catch(e){ sessionStorage.removeItem('piFriendSessionV1'); }
  }
  const storedOwnerSessionV570 = sessionStorage.getItem('piOwnerSessionV570');
  if(storedOwnerSessionV570){
    try{
      window.piOwnerSessionV570 = JSON.parse(storedOwnerSessionV570);
      piCurrentUser = { id:null, email:window.piOwnerSessionV570?.owner?.email || null, phone:window.piOwnerSessionV570?.owner?.phone || null };
      piCurrentRole = 'owner';
      document.body.classList.add('authenticated');
      const login = el('loginScreen');
      if(login){login.classList.add('hidden');login.style.display='none';login.style.visibility='hidden';login.style.pointerEvents='none';}
      showWelcome();
      setTimeout(()=>{ if(typeof loadPropertyTiles==='function') loadPropertyTiles(); if(typeof piRefreshAccessPanel==='function') piRefreshAccessPanel(); },250);
      return;
    }catch(e){ sessionStorage.removeItem('piOwnerSessionV570'); }
  }
  const storedTenantSessionV54=sessionStorage.getItem('piTenantSessionV54');
  if(storedTenantSessionV54){
    try{
      const tenantSession=JSON.parse(storedTenantSessionV54);
      if(!tenantSession?.property || !tenantSession?.tenantToken) throw new Error('INVALID_TENANT_SESSION');
      tenantSession._clientVersion='1.9.19';
      sessionStorage.setItem('piTenantSessionV54',JSON.stringify(tenantSession));
      document.body.classList.add('authenticated');
      const tenantLogin=el('loginScreen');
      if(tenantLogin){tenantLogin.classList.add('hidden');tenantLogin.style.display='none';tenantLogin.style.visibility='hidden';tenantLogin.style.pointerEvents='none';}
      if(typeof window.showTenantPortalV54==='function') window.showTenantPortalV54(tenantSession);
      return;
    }catch(error){
      console.warn('PureInvest tenant session restore skipped:',error?.message || error);
      sessionStorage.removeItem('piTenantSessionV54');
    }
  }
  const login = el("loginScreen");
  const welcome = el("welcomeScreen");
  const app = el("appScreen");

  try{
    const {data,error}=await piStartupSupabaseSession();

    if(error){
      console.warn("Błąd sprawdzania sesji:", error);
    }

    if(data && data.session){
      document.body.classList.add("authenticated");
      if(login){
        login.classList.add("hidden");
        login.style.display = "none";
        login.style.visibility = "hidden";
        login.style.pointerEvents = "none";
      }
      // 1.9.24: pokaż powłokę natychmiast. Pobranie roli/danych nie może blokować całego UI po logowaniu.
      showWelcome({deferData:true});
      try{
        await piLoadRoleContext();
      }catch(roleError){
        console.warn('PureInvest: kontekst roli nie załadował się podczas startu.', roleError);
      }
      try{ piApplyRoleUi(); }catch(_){ }
      try{ if(typeof loadPropertyTiles === 'function') loadPropertyTiles(); }catch(_){ }
      return;
    }
  }catch(e){
    console.warn("Błąd checkSession:", e);
  }

  document.body.classList.remove("authenticated", "in-app", "welcome-mode");
  if(app) app.classList.add("hidden");
  if(welcome) welcome.classList.add("hidden");
  if(login){
    login.style.display = "";
    login.style.visibility = "";
    login.style.pointerEvents = "";
    login.classList.remove("hidden");
  }
  if(typeof window.piSyncParobekAuthVisibility === "function") window.piSyncParobekAuthVisibility();
}

async function loadRanking(){
  return;
}

function openTab(tab){
  const item=document.querySelector(`.nav-item[onclick*="${tab}"]`);
  switchTab(tab,item);
}

async function reloadActiveProperty(){
  const {data}=await db.from("properties").select("*").eq("id",activeProperty).single();
  activePropertyData=data;dashboardTitle.innerText=data.name;dashboardTenant.innerText="👤 "+(data.tenant_name||"Brak najemcy")+" • "+(data.tenant_name?"Wynajęte":"Wolne");
  hydratePropertyForms();refreshDashboard();alert("Zapisano.");
}

async function uploadAttachment(file,tableName){
  if(!file)return {};
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=`${activeProperty}/${tableName}/${Date.now()}_${safeName}`;
  const {error}=await db.storage.from(BUCKET).upload(path,file,{upsert:false});
  if(error)throw error;
  const {data}=db.storage.from(BUCKET).getPublicUrl(path);
  return {attachment_url:data.publicUrl,attachment_path:path,attachment_name:file.name};
}

const PI_ASSET_CACHE = {};
function piLoadScript(src, globalName){
  if(globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if(PI_ASSET_CACHE[src]) return PI_ASSET_CACHE[src];
  PI_ASSET_CACHE[src] = new Promise((resolve,reject)=>{
    const existing = Array.from(document.scripts).find(s => s.src === src);
    if(existing){
      existing.addEventListener('load',()=>resolve(globalName ? window[globalName] : true),{once:true});
      existing.addEventListener('error',reject,{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=src;
    script.async=true;
    script.onload=()=>resolve(globalName ? window[globalName] : true);
    script.onerror=()=>reject(new Error('Nie udało się załadować biblioteki: '+src));
    document.head.appendChild(script);
  });
  return PI_ASSET_CACHE[src];
}
async function ensureChart(){
  if(!window.Chart) await piLoadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.9','Chart');
  return window.Chart;
}

async function ensureTesseract(){
  if(!window.Tesseract) await piLoadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','Tesseract');
  return window.Tesseract;
}
async function ensurePdfJs(){
  if(!window.pdfjsLib) await piLoadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js','pdfjsLib');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  return window.pdfjsLib;
}
async function ensureJsPdf(){
  if(!window.jspdf) await piLoadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js','jspdf');
  return window.jspdf;
}

async function fileToOcrImage(file){
  if(!file) return null;

  if(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")){
    const pdfjsLib = await ensurePdfJs();

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: buffer}).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({scale: 2});
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({canvasContext: ctx, viewport}).promise;

    return await new Promise(resolve => canvas.toBlob(resolve, "image/png", 0.95));
  }

  return file;
}

function parseMoneyValue(value){
  if(!value) return null;
  let cleaned = String(value)
    .replace(/\s/g, "")
    .replace(/zł|zl|pln/gi, "")
    .replace(/,/g, ".");

  if((cleaned.match(/\./g)||[]).length > 1){
    const last = cleaned.lastIndexOf(".");
    cleaned = cleaned.slice(0,last).replace(/\./g, "") + cleaned.slice(last);
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeDateForInput(raw){
  if(!raw) return null;
  const s = String(raw).trim();

  let m = s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(m){
    return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
  }

  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);
  if(m){
    return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  }

  return null;
}

function detectCostCategory(text){
  const t = (text || "").toLowerCase();
  const rules = [
    {cat:"Prąd", words:["energia", "prąd", "prad", "tauron", "enea", "pge", "energa", "energia elektryczna"]},
    {cat:"Woda", words:["woda", "wodociąg", "wodociag", "kanalizacja", "ścieki", "scieki"]},
    {cat:"Gaz", words:["gaz", "pgnig", "gen gaz", "paliwo gazowe"]},
    {cat:"Czynsz", words:["czynsz", "wspólnota", "wspolnota", "spółdzielnia", "spoldzielnia", "administracja"]},
    {cat:"Remont", words:["remont", "materiały", "materialy", "budowl", "castorama", "leroy", "obi", "usługa", "usluga"]}
  ];

  for(const rule of rules){
    if(rule.words.some(w => t.includes(w))) return rule.cat;
  }

  return "Remont";
}

function parseInvoiceText(text){
  const raw = text || "";
  const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  const moneyRegex = /(\d{1,3}(?:[\s.]\d{3})*(?:[,.]\d{2})|\d+[,.]\d{2})\s*(?:zł|zl|pln)?/gi;
  const priorityWords = /(do zapłaty|do zaplaty|razem|suma|brutto|należność|naleznosc|wartość|wartosc|kwota)/i;

  let priorityAmounts = [];
  let allAmounts = [];

  for(const line of lines){
    const matches = [...line.matchAll(moneyRegex)].map(m => parseMoneyValue(m[1])).filter(v => v !== null && v > 0);
    allAmounts.push(...matches);
    if(priorityWords.test(line)) priorityAmounts.push(...matches);
  }

  const amountPool = priorityAmounts.length ? priorityAmounts : allAmounts;
  const amount = amountPool.length ? Math.max(...amountPool) : null;

  const dateMatch = raw.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2}/);
  const date = dateMatch ? normalizeDateForInput(dateMatch[0]) : null;

  return {
    amount,
    date,
    category: detectCostCategory(raw),
    text: raw
  };
}

async function runInvoiceOCR(){
  const file = ocrInvoiceFile.files[0] || costAttachment.files[0];
  if(!file){
    alert("Wybierz plik faktury/paragonu do OCR.");
    return;
  }

  try{
    await ensureTesseract();
    ocrStatus.innerText = "Przygotowuję plik do OCR...";
    ocrPreview.classList.add("hidden");
    ocrPreview.innerText = "";

    const imageSource = await fileToOcrImage(file);

    const result = await Tesseract.recognize(
      imageSource,
      "pol+eng",
      {
        logger: m => {
          if(m.status){
            const progress = m.progress ? ` ${Math.round(m.progress*100)}%` : "";
            ocrStatus.innerText = `OCR: ${m.status}${progress}`;
          }
        }
      }
    );

    const parsed = parseInvoiceText(result.data.text || "");

    if(parsed.amount){
      costAmount.value = parsed.amount.toFixed(2);
    }

    if(parsed.date){
      costDate.value = parsed.date;
    }

    if(parsed.category){
      costCategory.value = parsed.category;
    }

    const shortText = (parsed.text || "").replace(/\s+/g," ").trim().slice(0,700);
    const oldNote = costNote.value ? costNote.value + "\n" : "";
    costNote.value = oldNote + `OCR: ${file.name}` + (shortText ? `\nFragment: ${shortText}` : "");

    ocrStatus.innerText = `Gotowe. Odczytano: kwota ${parsed.amount ? money(parsed.amount) : "nie wykryto"}, data ${parsed.date || "nie wykryto"}, kategoria ${parsed.category || "nie wykryto"}. Sprawdź dane przed zapisem.`;
    ocrPreview.innerText = parsed.text || "Brak tekstu OCR.";
    ocrPreview.classList.remove("hidden");

  }catch(e){
    console.error(e);
    ocrStatus.innerText = "Błąd OCR: " + e.message;
    alert("Błąd OCR: " + e.message);
  }
}

async function addCost(){
  const amount=Number(costAmount.value);if(!(amount>0))return alert("Podaj kwotę większą od 0.");
  try{
    const attachment=await uploadAttachment(costAttachment.files[0],"expenses");
    const actualDate=costDate.value||todayDate();
    let payload={property_id:activeProperty,amount,category:costCategory.value,expense_date:actualDate,created_at:actualDate,note:costNote.value, transaction_status:"approved", transaction_source:"manual", ...attachment};
    try{ if(window.piSettlementDictionary?.ensurePayload) payload = window.piSettlementDictionary.ensurePayload(payload, "expense", costCategory.value); }catch(_){ }
    const res = window.piSettlementDictionary?.insertWithFallback ? await window.piSettlementDictionary.insertWithFallback("expenses", payload) : await db.from("expenses").insert([payload]);
    if(res.error)return alert(res.error.message);
    costAmount.value="";costNote.value="";costDate.value=todayDate();costAttachment.value="";refreshDashboard();
  }catch(e){
    const message=String(e?.message||e||"Nieznany błąd");
    if(/settlement_component/i.test(message)) return alert("Błąd schematu kosztów: "+message+"\n\nUruchom w Supabase plik docs/SQL_HOTFIX_SETTLEMENT_COMPONENT_1_9_0.sql.");
    alert("Błąd zapisu kosztu: "+message);
  }
}

async function addPayment(){
  const amount=Number(paymentAmount.value);if(!(amount>0))return alert("Podaj kwotę większą od 0.");
  try{
    const attachment=await uploadAttachment(paymentAttachment.files[0],"payments");
    const actualDate=paymentDate.value||todayDate();
    const settlementMonth=document.getElementById('paymentSettlementMonth')?.value || actualDate.slice(0,7);
    let payload={property_id:activeProperty,amount,source:paymentSource.value,created_at:actualDate,payment_date:actualDate,note:paymentNote.value, transaction_status:"approved", transaction_source:"manual", ...attachment};
    try{ if(window.piSettlementDictionary?.ensurePayload) payload = window.piSettlementDictionary.ensurePayload(payload, "income", paymentSource.value); }catch(_){ }
    try{ if(window.PureInvestPaymentPeriod?.applyToPayload) payload = window.PureInvestPaymentPeriod.applyToPayload(payload, settlementMonth); }catch(_){ }
    const res = window.piSettlementDictionary?.insertWithFallback ? await window.piSettlementDictionary.insertWithFallback("payments", payload) : await db.from("payments").insert([payload]);
    if(res.error)return alert(res.error.message);
    paymentAmount.value="";paymentNote.value="";paymentDate.value=todayDate();paymentAttachment.value="";
    const period=document.getElementById('paymentSettlementMonth'); if(period) period.value=todayDate().slice(0,7);
    refreshDashboard();
  }catch(e){alert("Błąd zapisu wpłaty: "+e.message)}
}

async function quickMonthlyRent(){
  try{
    const rentItem = window.piSettlementDictionary?.effectiveMonthlyItems?.().find(x=>x.kind==="income" && (x.component==="owner" || x.component==="owner_rent") && x.tenant_due !== false);
    if(rentItem){
      const amount=Number(rentItem.default_amount||0); if(!(amount>0))return alert("Najpierw ustaw miesięczny najem w zakładce Najemcy.");
      const now=new Date();
      let payload={property_id:activeProperty,amount,source:rentItem.name,created_at:now.toISOString(),payment_date:todayDate(),note:"Automatyczna wpłata najmu za bieżący miesiąc", transaction_status:"approved", transaction_source:"manual"};
      payload = window.piSettlementDictionary.ensurePayload(payload, "income", rentItem.name);
      try{ if(window.PureInvestPaymentPeriod?.applyToPayload) payload=window.PureInvestPaymentPeriod.applyToPayload(payload, todayDate().slice(0,7)); }catch(_){ }
      const res = window.piSettlementDictionary?.insertWithFallback ? await window.piSettlementDictionary.insertWithFallback("payments", payload) : await db.from("payments").insert([payload]);
      if(res.error)return alert(res.error.message);return refreshDashboard();
    }
  }catch(_){ }
  const rent=Number(window.piTenantRentTaxBase?.(activePropertyData)||activePropertyData?.owner_rent||0);if(!rent)return alert("Najpierw ustaw miesięczny najem w sekcji Finanse → Stałe rozliczenia.");
  let fallbackPayload={property_id:activeProperty,tenancy_id:window.piActiveTenancyId || null,amount:rent,source:"Najem",created_at:new Date().toISOString(),payment_date:todayDate(),note:"Automatyczna wpłata najmu za bieżący miesiąc", transaction_status:"approved", transaction_source:"manual", settlement_component:"owner_rent"};
  try{ if(window.PureInvestPaymentPeriod?.applyToPayload) fallbackPayload=window.PureInvestPaymentPeriod.applyToPayload(fallbackPayload, todayDate().slice(0,7)); }catch(_){ }
  const res = window.piSettlementDictionary?.insertWithFallback ? await window.piSettlementDictionary.insertWithFallback("payments", fallbackPayload) : await db.from("payments").insert([fallbackPayload]);
  if(res.error)return alert(res.error.message);refreshDashboard();
}

async function getFinanceScopeData(){
  const scope = (document.getElementById("financeScope")?.value) || "property";

  if(scope === "all"){
    const {data:payments,error:payError}=await db.from("payments").select("*");
    const {data:expenses,error:expError}=await db.from("expenses").select("*");

    if(payError || expError){
      console.log(payError || expError);
      return {payments:rawPayments, expenses:rawExpenses, scope:"property"};
    }

    return {payments:piLiveTxRows(payments||[]), expenses:piLiveTxRows(expenses||[]), scope:"all"};
  }

  return {payments:rawPayments, expenses:rawExpenses, scope:"property"};
}

function renderPropertiesList(){propertiesList.innerHTML=loadedProperties.map(p=>{const area=p.area_m2?`<br>📐 ${Number(p.area_m2).toLocaleString('pl-PL')} m²`:'';return `<div class="property-row"><div><b>${piEsc(p.name||"Bez nazwy")}</b><br><span style="color:#6b6258">📍 ${piEsc(p.address||"Brak adresu")}${area}<br>👤 ${piEsc(p.tenant_name||"Brak najemcy")}</span></div><div><span class="badge ${p.tenant_name?"green-badge":"gray"}">${p.tenant_name?"Wynajęte":"Wolne"}</span></div></div>`}).join("")}
function renderTenantDetails(){tenantDetails.innerHTML=`<div class="report-row"><b>Najemca</b><span>${piEsc(activePropertyData?.tenant_name||"Brak")}</span></div><div class="report-row"><b>Telefon</b><span>${piEsc(activePropertyData?.tenant_phone||"Brak")}</span></div><div class="report-row"><b>Email</b><span>${piEsc(activePropertyData?.tenant_email||"Brak")}</span></div><div class="report-row"><b>Start najmu</b><span>${piEsc(activePropertyData?.lease_start||"Brak")}</span></div><div class="report-row"><b>Miesięczny najem</b><span>${money((window.piTenantRentTaxBase?.(activePropertyData)||activePropertyData?.owner_rent||0))}</span></div><div class="report-row"><b>Dzień płatności</b><span>${piEsc(activePropertyData?.payment_day||"Brak")}</span></div><div class="report-row"><b>Konto do wpłat</b><span>${piEsc(activePropertyData?.payment_account||activePropertyData?.bank_account||"Brak")}</span></div>`}
function renderFinanceSummary(){const inc=rawPayments.reduce((a,b)=>a+Number(b.amount),0),cos=rawExpenses.reduce((a,b)=>a+Number(b.amount),0),najem=rawPayments.filter(isNajem).reduce((a,b)=>a+Number(b.amount),0),taxBase=piTaxBaseFromPaymentRows(rawPayments),taxVal=calcTax(taxBase);financeSummary.innerHTML=`<div class="report-row"><b>Łączny przychód</b><span>${money(inc)}</span></div><div class="report-row"><b>Łączne koszty</b><span>${money(cos)}</span></div><div class="report-row"><b>Łączny wynik</b><span>${money(inc-cos)}</span></div><div class="report-row"><b>Podatek od najmu</b><span>${money(taxVal)}</span></div><div class="report-row"><b>Podstawa podatku</b><span>${money(taxBase)}</span></div>`}
function renderReport(){const y=yearFilter.value==="all"?String(new Date().getFullYear()):yearFilter.value,p=rawPayments.filter(x=>yearKey(actualPaymentDate(x))===y),e=rawExpenses.filter(x=>yearKey(actualExpenseDate(x))===y),inc=p.reduce((a,b)=>a+Number(b.amount),0),cos=e.reduce((a,b)=>a+Number(b.amount),0),najem=p.filter(isNajem).reduce((a,b)=>a+Number(b.amount),0),taxBase=piTaxBaseFromPaymentRows(p),taxVal=calcTax(taxBase);reports.innerHTML=`<div class="report-row"><b>Rok</b><span>${y}</span></div><div class="report-row"><b>Przychody</b><span>${money(inc)}</span></div><div class="report-row"><b>Koszty</b><span>${money(cos)}</span></div><div class="report-row"><b>Zysk</b><span>${money(inc-cos)}</span></div><div class="report-row"><b>Podstawa podatku</b><span>${money(taxBase)}</span></div><div class="report-row"><b>Podatek</b><span>${money(taxVal)}</span></div>`}

function groupBy(arr,key){return arr.reduce((acc,x)=>{const k=x[key]||"Inne";acc[k]=(acc[k]||0)+Number(x.amount);return acc},{})}
function pdfHeader(doc,title){doc.setFontSize(18);doc.text("PureInvest",14,16);doc.setFontSize(13);doc.text(title,14,26);doc.setFontSize(9);doc.text("Wygenerowano: "+new Date().toLocaleString("pl-PL"),14,33)}
function pdfLine(doc,y,left,right){doc.setFontSize(10);doc.text(left,14,y);doc.text(String(right),140,y);return y+7}
function pdfSave(doc,name){doc.save(name.replaceAll(" ","_")+".pdf")}

async function generateAnnualPdf(){const {jsPDF}=await ensureJsPdf(),doc=new jsPDF(),year=yearFilter.value==="all"?String(new Date().getFullYear()):yearFilter.value,p=rawPayments.filter(x=>yearKey(actualPaymentDate(x))===year),e=rawExpenses.filter(x=>yearKey(actualExpenseDate(x))===year),inc=p.reduce((a,b)=>a+Number(b.amount),0),cos=e.reduce((a,b)=>a+Number(b.amount),0);let y=44;pdfHeader(doc,"Raport roczny - "+dashboardTitle.innerText+" - "+year);y=pdfLine(doc,y,"Przychody:",money(inc));y=pdfLine(doc,y,"Koszty:",money(cos));y=pdfLine(doc,y,"Saldo:",money(inc-cos));pdfSave(doc,"PureInvest raport roczny "+year)}
async function generateTaxPdf(){const {jsPDF}=await ensureJsPdf(),doc=new jsPDF(),year=yearFilter.value==="all"?String(new Date().getFullYear()):yearFilter.value,p=rawPayments.filter(x=>yearKey(x.payment_date||x.created_at)===year),najem=p.filter(isNajem).reduce((a,b)=>a+Number(b.amount),0),taxBase=piTaxBaseFromPaymentRows(p),taxVal=calcTax(taxBase);let y=44;pdfHeader(doc,"Raport podatkowy - "+dashboardTitle.innerText+" - "+year);y=pdfLine(doc,y,"Wpłaty oznaczone jako Najem",money(najem));y=pdfLine(doc,y,"Podstawa podatku: kwota najmu z karty najemcy",money(taxBase));y=pdfLine(doc,y,"Podatek:",money(taxVal));pdfSave(doc,"PureInvest raport podatkowy "+year)}
async function generateCategoryPdf(){const {jsPDF}=await ensureJsPdf(),doc=new jsPDF(),year=yearFilter.value==="all"?String(new Date().getFullYear()):yearFilter.value,p=rawPayments.filter(x=>yearKey(actualPaymentDate(x))===year),e=rawExpenses.filter(x=>yearKey(actualExpenseDate(x))===year);let y=44;pdfHeader(doc,"Raport kategorii - "+dashboardTitle.innerText+" - "+year);doc.setFontSize(12);doc.text("Wpływy",14,y);y+=8;const gbp=groupBy(p,"source");Object.keys(gbp).forEach(k=>y=pdfLine(doc,y,k,money(gbp[k])));y+=8;doc.setFontSize(12);doc.text("Koszty",14,y);y+=8;const gbe=groupBy(e,"category");Object.keys(gbe).forEach(k=>y=pdfLine(doc,y,k,money(gbe[k])));pdfSave(doc,"PureInvest raport kategorii "+year)}

function filterTransactionsFromSearch(){
  const q=(globalSearch?.value||"").toLowerCase().trim();
  if(!q){renderTransactions(rawPayments,rawExpenses);return;}
  const p=rawPayments.filter(x=>String(x.source||"").toLowerCase().includes(q)||String(x.note||"").toLowerCase().includes(q));
  const e=rawExpenses.filter(x=>String(x.category||"").toLowerCase().includes(q)||String(x.note||"").toLowerCase().includes(q));
  renderTransactions(p,e);
}

function renderCommandCenter(p,e){
  const commandAlertsEl=document.getElementById("commandAlerts");
  if(!commandAlertsEl)return;
  const now=new Date();
  const current=monthKey(now);
  const hasRent=rawPayments.some(x=>{ try{return (window.PureInvestPaymentPeriod?.settlementMonth?.(x)||monthKey(x.created_at))===current && isNajem(x);}catch(_){return monthKey(x.created_at)===current && isNajem(x);} });
  const day=Number(activePropertyData?.payment_day||0);
  const late=day && now.getDate()>day && !hasRent;
  const inc=p.reduce((a,b)=>a+Number(b.amount),0);
  const cos=e.reduce((a,b)=>a+Number(b.amount),0);
  const balance=inc-cos;
  const najem=p.filter(isNajem).reduce((a,b)=>a+Number(b.amount),0);
  const attachments=[...p,...e].filter(x=>x.attachment_url).length;

  // Panel 1.7.11: usunięto zbędne kafle informacyjne z centrum dowodzenia
  // (Płatności pod kontrolą / saldo okresu / załączniki).
  commandAlertsEl.innerHTML='';
  commandAlertsEl.classList.add('hidden');

  const currentMonthCost=e.filter(x=>monthKey(actualExpenseDate(x))===current).reduce((a,b)=>a+Number(b.amount),0);
  const prevDate=new Date(now.getFullYear(),now.getMonth()-1,1);
  const prevKey=prevDate.getFullYear()+"-"+String(prevDate.getMonth()+1).padStart(2,"0");
  const prevCost=rawExpenses.filter(x=>monthKey(actualExpenseDate(x))===prevKey).reduce((a,b)=>a+Number(b.amount),0);
  const costJump=prevCost && currentMonthCost>prevCost*1.2;
  const attentionListEl=document.getElementById('attentionList');
  if(attentionListEl) attentionListEl.innerHTML=`
    <div class="report-row"><b>${late?'Brak wpłaty najmu':'Wpłata najmu'}</b><span class="badge ${late?'red':'green-badge'}">${late?'Pilne':'OK'}</span></div>
    <div class="report-row"><b>Koszty miesiąca</b><span class="badge ${costJump?'red':'gray'}">${costJump?'Wzrost':'Stabilnie'}</span></div>
    <div class="report-row"><b>Podatek od najmu</b><span>${money(piCalcTenantRentTax(p,{fallbackMonths:1}))}</span></div>`;

  const events=[];
  p.forEach(x=>events.push({kind:'+',title:'Dodano wpłatę '+(x.source||''),text:money(x.amount)+(x.note?' • '+x.note:''),date:x.created_at,att:x.attachment_url}));
  e.forEach(x=>events.push({kind:'-',title:'Dodano koszt '+(x.category||''),text:money(x.amount)+(x.note?' • '+x.note:''),date:x.created_at,att:x.attachment_url}));
  events.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const commandTimelineEl=document.getElementById('commandTimeline');
  if(commandTimelineEl) commandTimelineEl.innerHTML=(events.slice(0,6).map(ev=>`
    <div class="command-event"><div class="command-dot">${ev.att?'📎':ev.kind}</div><div><b>${ev.title}</b><span>${ev.text}</span><br><small>${new Date(ev.date).toLocaleString('pl-PL')}</small></div></div>
  `).join('')) || `<div class="command-event"><div class="command-dot">•</div><div><b>Brak aktywności</b><span>Dodaj pierwszą wpłatę lub koszt.</span></div></div>`;

  const focus=[];
  focus.push({label:'Aktywne mieszkanie',title:activePropertyData?.name||'—',value:money(balance)});
  focus.push({label:'Najemca',title:activePropertyData?.tenant_name||'Brak najemcy',value:activePropertyData?.tenant_name?'Wynajęte':'Wolne'});
  focus.push({label:'Miesięczny najem',title:money((window.piTenantRentTaxBase?.(activePropertyData)||activePropertyData?.owner_rent||0)),value:'Dzień płatności: '+(activePropertyData?.payment_day||'—')});
  const commandFocusEl=document.getElementById('commandFocus');
  if(commandFocusEl) commandFocusEl.innerHTML=focus.map(f=>`<div class="focus-card"><small>${f.label}</small><h3>${f.title}</h3><b>${f.value}</b></div>`).join('');
}

window.addEventListener("beforeinstallprompt", (event)=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  const btn=document.getElementById("installAppBtn");
  if(btn) btn.style.display="block";
});

async function installPWA(){
  if(!deferredInstallPrompt){
    alert("Na iPhone: otwórz w Safari → Udostępnij → Dodaj do ekranu początkowego.");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt=null;
  const btn=document.getElementById("installAppBtn");
  if(btn) btn.style.display="none";
}

// Wersjonowany Service Worker utrzymuje spójny shell aplikacji i aktualizuje go po wdrożeniu.
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>null);
  });
}

async function addLibraryFiles(){
  if(!activeProperty)return alert("Najpierw wybierz mieszkanie.");
  const files=[...(libraryFiles.files||[])];
  if(!files.length)return alert("Wybierz plik albo zdjęcie.");

  const titleBase=(libraryTitle.value||"").trim();
  const category=libraryCategory.value||"Inne";
  const note=libraryNote.value||"";

  for(const file of files){
    const isImage=file.type && file.type.startsWith("image/");
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");

    if(isImage){
      const path=`${activeProperty}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
      const {error:uploadError}=await db.storage.from(PHOTO_BUCKET).upload(path,file,{upsert:false});
      if(uploadError){alert("Błąd uploadu zdjęcia: "+uploadError.message);return;}
      const {data:urlData}=db.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      const {error:insertError}=await db.from("property_photos").insert([{
        property_id:activeProperty,
        tenancy_id:window.piActiveTenancyId || null,
        title:titleBase||file.name,
        category,
        note,
        file_name:file.name,
        file_path:path,
        file_url:urlData.publicUrl
      }]);
      if(insertError){alert("Błąd zapisu zdjęcia: "+insertError.message);return;}
    }else{
      const path=`${activeProperty}/${Date.now()}_${safeName}`;
      const {error:uploadError}=await db.storage.from(DOC_BUCKET).upload(path,file,{upsert:false});
      if(uploadError){alert("Błąd uploadu dokumentu: "+uploadError.message);return;}
      const {data:urlData}=db.storage.from(DOC_BUCKET).getPublicUrl(path);
      const {error:insertError}=await db.from("property_documents").insert([{
        property_id:activeProperty,
        tenancy_id:window.piActiveTenancyId || null,
        title:titleBase||file.name,
        category,
        file_name:file.name,
        file_path:path,
        file_url:urlData.publicUrl
      }]);
      if(insertError){alert("Plik przesłany, ale zapis dokumentu w tabeli nie działa: "+insertError.message);return;}
    }
  }

  libraryTitle.value="";
  libraryNote.value="";
  libraryFiles.value="";
  loadLibrary();
}

async function loadLibrary(){
  if(!document.getElementById("libraryList"))return;
  if(!activeProperty){libraryList.innerHTML="Wybierz mieszkanie.";return;}

  const filter=document.getElementById("libraryFilter")?.value || "all";

  let docsQuery=db.from("property_documents").select("*").eq("property_id",activeProperty).order("created_at",{ascending:false});
  let photosQuery=db.from("property_photos").select("*").eq("property_id",activeProperty).order("created_at",{ascending:false});

  if(filter!=="all"){
    docsQuery=docsQuery.eq("category",filter);
    photosQuery=photosQuery.eq("category",filter);
  }

  const [{data:docs,error:docsError},{data:photos,error:photosError}]=await Promise.all([docsQuery,photosQuery]);

  if(docsError||photosError){
    libraryList.innerHTML="Błąd ładowania biblioteki: "+((docsError||photosError).message);
    return;
  }

  const items=[
    ...(docs||[]).filter(x=>x?.category!=="pi_fee_media_report").map(x=>({...x,kind:"document",kindLabel:"Dokument"})),
    ...(photos||[]).map(x=>({...x,kind:"photo",kindLabel:"Zdjęcie"}))
  ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  if(!items.length){libraryList.innerHTML="Brak materiałów dla tego mieszkania.";return;}

  libraryList.innerHTML=items.map(item=>{
    const isPhoto=item.kind==="photo";
    const title=item.title||item.file_name||"Materiał";
    const category=item.category||"Inne";
    const date=item.created_at?new Date(item.created_at).toLocaleString("pl-PL"):"";
    const fileUrl=piSafeUrl(item.file_url);
    const note=item.note?`<small>${piEsc(item.note)}</small>`:"";
    const preview=isPhoto&&fileUrl
      ? `<a href="${piEsc(fileUrl)}" target="_blank" rel="noopener noreferrer"><img src="${piEsc(fileUrl)}" alt="${piEsc(title)}"></a>`
      : `<div style="height:150px;border-radius:18px;background:#faf7f2;border:1px solid #eee7de;display:flex;align-items:center;justify-content:center;font-weight:900;color:#8a3f15;">📄 Dokument</div>`;
    return `
      <div class="photo-card">
        ${preview}
        <div class="photo-info">
          <b>${piEsc(title)}</b>
          <small>${piEsc(item.kindLabel)} • ${piEsc(category)} • ${piEsc(date)}</small>
          ${note}
          <div class="photo-actions">
            ${fileUrl?`<a href="${piEsc(fileUrl)}" target="_blank" rel="noopener noreferrer">Otwórz</a>`:'<span>Brak podglądu</span>'}
            <button class="danger" onclick="deleteLibraryItem('${item.kind}','${item.id}','${item.file_path||""}')">Usuń</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

async function deleteLibraryItem(kind,id,path){
  if(!(await window.piConfirmV770('Usunąć materiał?'))) return;
  const table=kind==="photo"?"property_photos":"property_documents";
  const bucket=kind==="photo"?PHOTO_BUCKET:DOC_BUCKET;
  const {error}=await db.from(table).delete().eq("id",id);
  if(error)return alert(error.message);
  if(path)await db.storage.from(bucket).remove([path]);
  loadLibrary();
}

async function addPropertyDocument(){
  if(!activeProperty)return alert("Najpierw wybierz mieszkanie.");
  const file=docFile.files[0];
  if(!file)return alert("Wybierz plik.");
  const title=(docTitle.value||file.name).trim();
  const category=docCategory.value;
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=`${activeProperty}/${Date.now()}_${safeName}`;
  const {error:uploadError}=await db.storage.from(DOC_BUCKET).upload(path,file,{upsert:false});
  if(uploadError)return alert("Błąd uploadu dokumentu: "+uploadError.message);
  const {data:urlData}=db.storage.from(DOC_BUCKET).getPublicUrl(path);
  const {error}=await db.from("property_documents").insert([{
    property_id:activeProperty,
    tenancy_id:window.piActiveTenancyId || null,
    title,
    category,
    file_name:file.name,
    file_path:path,
    file_url:urlData.publicUrl
  }]);
  if(error)return alert("Plik przesłany, ale zapis dokumentu w tabeli nie działa: "+error.message);
  docTitle.value="";
  docFile.value="";
  loadDocuments();
}

async function loadDocuments(){
  if(!document.getElementById("documentsList"))return;
  if(!activeProperty){documentsList.innerHTML="Wybierz mieszkanie.";return;}
  const {data,error}=await db.from("property_documents").select("*").eq("property_id",activeProperty).order("created_at",{ascending:false});
  if(error){documentsList.innerHTML="Błąd ładowania dokumentów: "+error.message;return;}
  if(!data||!data.length){documentsList.innerHTML="Brak dokumentów dla tego mieszkania.";return;}
  documentsList.innerHTML=data.map(d=>`
    <div class="doc-card">
      <b>${piEsc(d.title||d.file_name||"Dokument")}</b>
      <small>${piEsc(d.category||"Inne")}</small>
      <small>${piEsc(new Date(d.created_at).toLocaleString("pl-PL"))}</small>
      <small>${piEsc(d.file_name||"")}</small>
      <div class="doc-actions">
        ${piSafeUrl(d.file_url)?`<a href="${piEsc(piSafeUrl(d.file_url))}" target="_blank" rel="noopener noreferrer">Otwórz</a>`:'<span>Brak podglądu</span>'}
        <button class="danger" onclick="deleteDocument('${d.id}','${d.file_path||""}')">Usuń</button>
      </div>
    </div>`).join("");
}

async function deleteDocument(id,path){
  if(!(await window.piConfirmV770('Usunąć dokument?'))) return;
  const {error}=await db.from("property_documents").delete().eq("id",id);
  if(error)return alert(error.message);
  if(path)await db.storage.from(DOC_BUCKET).remove([path]);
  loadDocuments();
}

async function addPropertyPhotos(){
  if(!activeProperty)return alert("Najpierw wybierz mieszkanie.");
  const files=[...(photoFiles.files||[])];
  if(!files.length)return alert("Wybierz przynajmniej jedno zdjęcie.");
  const title=photoTitle.value||"Zdjęcie mieszkania";
  const category=photoCategory.value||"Ogólne";
  const note=photoNote.value||"";

  for(const file of files){
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=`${activeProperty}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
    const {error:uploadError}=await db.storage.from(PHOTO_BUCKET).upload(path,file,{upsert:false});
    if(uploadError){alert("Błąd uploadu zdjęcia: "+uploadError.message);return;}
    const {data:urlData}=db.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    const {error:insertError}=await db.from("property_photos").insert([{
      property_id:activeProperty,
      tenancy_id:window.piActiveTenancyId || null,
      title,
      category,
      note,
      file_name:file.name,
      file_path:path,
      file_url:urlData.publicUrl
    }]);
    if(insertError){alert("Błąd zapisu zdjęcia: "+insertError.message);return;}
  }

  photoFiles.value="";
  photoTitle.value="";
  photoNote.value="";
  loadPhotos();
}

async function loadPhotos(){
  if(!activeProperty){
    if(typeof photosList!=="undefined")photosList.innerHTML="Najpierw wybierz mieszkanie.";
    return;
  }

  let query=db.from("property_photos")
    .select("*")
    .eq("property_id",activeProperty)
    .order("created_at",{ascending:false});

  if(photoFilter && photoFilter.value && photoFilter.value!=="all"){
    query=query.eq("category",photoFilter.value);
  }

  const {data,error}=await query;
  if(error){photosList.innerHTML="Błąd ładowania zdjęć: "+error.message;return;}
  if(!data||!data.length){photosList.innerHTML="Brak zdjęć dla tego mieszkania.";return;}

  photosList.innerHTML=data.map(p=>`
    <div class="photo-card">
      ${piSafeUrl(p.file_url)?`<a href="${piEsc(piSafeUrl(p.file_url))}" target="_blank" rel="noopener noreferrer"><img src="${piEsc(piSafeUrl(p.file_url))}" alt="${piEsc(p.title||p.file_name||"Zdjęcie mieszkania")}"></a>`:''}
      <div class="photo-info">
        <b>${piEsc(p.title||"Zdjęcie mieszkania")}</b>
        <small>${piEsc(p.category||"Ogólne")} • ${piEsc(new Date(p.created_at).toLocaleString("pl-PL"))}</small>
        ${p.note?`<small>${piEsc(p.note)}</small>`:""}
        <div class="photo-actions">
          ${piSafeUrl(p.file_url)?`<a href="${piEsc(piSafeUrl(p.file_url))}" target="_blank" rel="noopener noreferrer">Podgląd</a>`:'<span>Brak podglądu</span>'}
          <button class="danger" onclick="deletePhoto('${p.id}','${p.file_path||""}')">Usuń</button>
        </div>
      </div>
    </div>`).join("");
}

async function deletePhoto(id,path){
  if(!(await window.piConfirmV770('Usunąć zdjęcie?'))) return;
  const {error}=await db.from("property_photos").delete().eq("id",id);
  if(error)return alert(error.message);
  if(path)await db.storage.from(PHOTO_BUCKET).remove([path]);
  loadPhotos();
}

window.addEventListener("DOMContentLoaded",()=>{
  const lb = el("loginBtn");
  if(lb) lb.addEventListener("click",(ev)=>{ ev.preventDefault(); login(); });
  const p = el("password");
  if(p) p.addEventListener("keydown",(ev)=>{ if(ev.key==="Enter"){ ev.preventDefault(); login(); }});
});

function cleanupCommandHeader(){
  document.querySelectorAll(".command-search").forEach(n=>n.remove());
}
window.addEventListener("DOMContentLoaded", cleanupCommandHeader);
