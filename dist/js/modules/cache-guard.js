(function(){
  const BUILD = window.PI_RELEASE?.build || '2026-09-23-interaction-recovery-v1926';
  function removeLegacyBanner(){ document.querySelectorAll('#piOs11UpdateBanner,.pi-os11-update-banner').forEach(el=>el.remove()); }
  async function disableLegacyOfflineCache(){
    try{
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations().catch(()=>[]);
        await Promise.all((regs||[]).map(reg=>reg.unregister().catch(()=>false)));
      }
      if('caches' in window){
        const keys=await caches.keys().catch(()=>[]);
        await Promise.all((keys||[]).filter(k=>String(k).startsWith('pureinvest-')).map(k=>caches.delete(k).catch(()=>false)));
      }
      localStorage.setItem('piBuildCacheGuard',BUILD);
    }catch(error){ console.warn('PureInvest cache cleanup skipped:',error); }
  }
  document.addEventListener('DOMContentLoaded',()=>{ disableLegacyOfflineCache(); removeLegacyBanner(); setInterval(removeLegacyBanner,1200); });
})();
