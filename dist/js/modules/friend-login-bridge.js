(function(){
  if(window.__PI_FRIEND_LOGIN_BRIDGE__) return;
  window.__PI_FRIEND_LOGIN_BRIDGE__ = true;

  const DEMO_LOGIN='demo@pure-invest.pl';
  function get(id){ return document.getElementById(id); }
  function fields(){ return {loginEl:get('email') || get('ownerLogin'),passEl:get('password') || get('ownerSecret')}; }
  function isSandboxLogin(login,password){
    const normalized=String(login || '').trim().toLowerCase();
    return (normalized==='admin' && password==='admin') || normalized===DEMO_LOGIN;
  }
  function toast(message,type){
    try{ if(typeof window.piToastV761 === 'function') return window.piToastV761(String(message),type || 'info'); }catch(_){}
    try{ if(typeof window.piToastV770 === 'function') return window.piToastV770(String(message),type || 'info'); }catch(_){}
    console.log('[PureInvest Demo Login]',message);
  }
  async function runFriendLoginIfNeeded(){
    const {loginEl,passEl}=fields(),msg=get('authMsg');
    const login=String(loginEl?.value || '').trim(),password=String(passEl?.value || '');
    if(!isSandboxLogin(login,password)) return false;
    const demoManager=login.toLowerCase()===DEMO_LOGIN;
    try{
      if(msg) msg.innerText=demoManager?'Uruchamiam konto demonstracyjnego zarządcy...':'Uruchamiam tryb gościa...';
      let session=null;
      if(typeof window.piFriendLogin === 'function') session=await window.piFriendLogin(login,password);
      else{
        const response=await fetch('/.netlify/functions/friend-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password}),cache:'no-store'});
        const output=await response.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź serwera logowania.'}));
        if(!response.ok || !output.ok) throw new Error(output.message || 'Nie udało się uruchomić konta demonstracyjnego.');
        sessionStorage.setItem('piFriendSessionV1',JSON.stringify(output));
        session=output;
      }
      sessionStorage.removeItem('piOwnerSessionV570');
      sessionStorage.removeItem('piTenantSessionV54');
      sessionStorage.removeItem('piTenantMultiSessionV551');
      if(session) sessionStorage.setItem('piFriendSessionV1',JSON.stringify(session));
      if(session && typeof window.piEnableFriendSandbox === 'function') await window.piEnableFriendSandbox(session);
      if(typeof window.piLoadRoleContext === 'function') await window.piLoadRoleContext();
      if(typeof window.showWelcome === 'function') window.showWelcome();
      if(msg) msg.innerText='';
      toast(demoManager?'Konto demonstracyjnego zarządcy jest aktywne.':'Tryb gościa jest aktywny.','success');
      setTimeout(()=>{
        try{ if(typeof window.loadPropertyTiles === 'function') window.loadPropertyTiles(); }catch(_){}
        try{ if(typeof window.piRefreshAccessPanel === 'function') window.piRefreshAccessPanel(); }catch(_){}
      },250);
      return true;
    }catch(error){
      const message=error?.message || 'Nie udało się uruchomić konta demonstracyjnego.';
      if(msg) msg.innerText=message;
      toast(message,'warn');
      return true;
    }
  }
  function intercept(event){
    const {loginEl,passEl}=fields();
    if(!isSandboxLogin(loginEl?.value,passEl?.value)) return;
    event.preventDefault();
    event.stopPropagation();
    if(typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    runFriendLoginIfNeeded();
  }
  document.addEventListener('click',event=>{ if(event.target?.closest?.('#loginBtn')) intercept(event); },true);
  document.addEventListener('keydown',event=>{
    if(event.key !== 'Enter' || !['email','password','ownerLogin','ownerSecret'].includes(document.activeElement?.id)) return;
    intercept(event);
  },true);
  window.piFriendLoginBridgeRun=runFriendLoginIfNeeded;
  window.piIsSandboxLogin=isSandboxLogin;
})();
