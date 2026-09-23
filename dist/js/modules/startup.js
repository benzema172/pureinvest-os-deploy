(function(){
  if(window.__PI_STARTUP_FINAL__) return;
  window.__PI_STARTUP_FINAL__ = true;
  const start = async () => {
    if(typeof window.checkSession !== 'function' && typeof checkSession !== 'function'){
      console.error('PureInvest: brak funkcji startowej checkSession.');
      return;
    }
    try{ await (window.checkSession || checkSession)(); }
    catch(error){ console.error('PureInvest: nie udało się uruchomić aplikacji.', error); }
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
