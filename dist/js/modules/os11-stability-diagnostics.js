(function(){
  if(window.__PI_OS11_STABILITY_DIAGNOSTICS__) return;
  window.__PI_OS11_STABILITY_DIAGNOSTICS__ = true;

  const OS11_VERSION = window.PI_RELEASE?.name || 'PureInvest OS 1.9.0 Final';
  const BUILD_ID = 'os15-stabilization-cleanup-no-market-scanner';

  function patchLabels(){
    const h = document.querySelector('#tab-diagnostics .context-header h2');
    if(h) h.textContent = 'Diagnostyka PureInvest OS 1.9.0';
    const p = document.querySelector('#tab-diagnostics .context-header p');
    if(p) p.textContent = 'Stabilność aplikacji, Netlify Functions, Supabase, logowanie, Gmail i Storage.';
    const title = document.querySelector('#tab-diagnostics .pi-diagnostics-toolbar .card-title');
    if(title) title.textContent = OS11_VERSION;
    const marketCard = document.getElementById('piOs11MarketDiagCard');
    if(marketCard) marketCard.remove();
  }

  window.piOs11HardRefresh = async function(){
    try{
      if('caches' in window){
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if(navigator.serviceWorker?.getRegistrations){
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.update().catch(()=>null)));
      }
    }catch(e){ console.warn('OS cache clear skipped:', e); }
    location.reload(true);
  };

  window.piOs11CheckVersion = async function(){ return; };

  document.addEventListener('DOMContentLoaded', patchLabels);
  window.addEventListener('load', patchLabels);
  window.PI_OS11 = { version:OS11_VERSION, build:BUILD_ID, checkVersion:window.piOs11CheckVersion };
})();
