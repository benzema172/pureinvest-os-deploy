window.APP_VERSION=window.PI_RELEASE?.version || '1.9.19';
window.APP_BUILD=window.PI_RELEASE?.build || '2026-08-11-tenant-session-guard-v1919';
window.APP_RELEASE_NAME=window.PI_RELEASE?.name || 'PureInvest OS 1.9.19';
document.addEventListener('DOMContentLoaded',()=>{
  const footer=document.createElement('div');
  footer.id='adminVersionFooter';
  footer.style.cssText='position:fixed;bottom:6px;right:10px;font-size:11px;color:#888;z-index:9999';
  if(!document.getElementById(footer.id)) document.body.appendChild(footer);
  setInterval(()=>{
    try{
      const role=(window.currentUserRole||localStorage.getItem('currentUserRole')||'').toLowerCase();
      footer.style.display = role==='admin' ? 'block' : 'none';
      footer.textContent = window.APP_RELEASE_NAME + ' • Build ' + window.APP_BUILD;
    }catch(_){ footer.style.display='none'; }
  },1000);
});
