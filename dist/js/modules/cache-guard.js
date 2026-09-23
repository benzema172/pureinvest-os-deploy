(function(){
  const BUILD = window.PI_RELEASE?.build || '2026-08-03-final-data-model';

  function removeLegacyBanner(){
    document.querySelectorAll('#piOs11UpdateBanner,.pi-os11-update-banner').forEach(el=>el.remove());
  }

  async function keepApplicationCurrent(){
    removeLegacyBanner();
    try{
      if(!('serviceWorker' in navigator)) return;
      const registration = await navigator.serviceWorker.register('/service-worker.js', {updateViaCache:'none'});
      await registration.update().catch(()=>null);
      localStorage.setItem('piBuildCacheGuard', BUILD);
    }catch(error){
      console.warn('PureInvest offline cache unavailable:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    keepApplicationCurrent();
    removeLegacyBanner();
    setInterval(removeLegacyBanner, 1200);
  });
})();
