(function(){
  if(window.__PI_OS_1_0_BETA__) return;
  window.__PI_OS_1_0_BETA__ = true;
  const release = window.PI_RELEASE || {version:'1.9.0',name:'PureInvest OS 1.9.0 Final'};
  window.PI_APP_VERSION = release.version;
  window.APP_VERSION = release.version;
  window.APP_RELEASE_NAME = release.name;
  function apply(){
    try{ document.title = release.name; }catch(_){ }
    document.querySelectorAll('[data-app-version], .pi-app-version').forEach(el=>{ el.textContent = release.name; });
    const pageSub = document.getElementById('dashboardTenant');
    if(pageSub && /PureInvest/i.test(pageSub.textContent||'')) pageSub.textContent = release.name + ' — bezpieczeństwo i stabilność';
    const diagCards = Array.from(document.querySelectorAll('.card-title'));
    diagCards.forEach(el=>{
      if((el.textContent||'').trim()==='PureInvest OS 1.0 Beta') el.textContent=release.name;
    });
  }
  document.addEventListener('DOMContentLoaded', apply);
  setTimeout(apply, 600);
})();
