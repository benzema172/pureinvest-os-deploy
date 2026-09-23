(function(){
  const BUILD = window.PI_RELEASE?.build || '2026-09-23-auth-runtime-stability-v1927';
  function removeLegacyBanner(){ document.querySelectorAll('#piOs11UpdateBanner,.pi-os11-update-banner').forEach(el=>el.remove()); }
  document.addEventListener('DOMContentLoaded',()=>{
    try{ localStorage.setItem('piBuildCacheGuard',BUILD); }catch(_){ }
    removeLegacyBanner();
    setInterval(removeLegacyBanner,1200);
  });
})();
