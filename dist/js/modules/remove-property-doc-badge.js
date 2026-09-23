(function(){
  if(window.__PI_REMOVE_PROPERTY_DOC_BADGE__) return;
  window.__PI_REMOVE_PROPERTY_DOC_BADGE__ = true;

  function looksLikeDocBadge(el){
    if(!el) return false;
    const txt = String(el.textContent || '').replace(/\s+/g,' ').trim();
    if(!txt) return false;
    if(/^📁?\s*\d+\s*\/\s*18$/.test(txt)) return true;
    if(/^📂?\s*\d+\s*\/\s*18$/.test(txt)) return true;
    if(/^\d+\s*\/\s*18$/.test(txt) && /badge|doc|tile|pill|status/i.test(String(el.className || ''))) return true;
    return false;
  }

  function removePropertyDocBadges(){
    try{
      document.querySelectorAll('#propertyTiles .pi-doc-tile-badge, #propertyTiles [data-pi-doc-badge], #propertyTiles .tile-doc-badge, #propertyTiles .doc-completion-badge').forEach(x=>x.remove());
      document.querySelectorAll('#propertyTiles .tile span, #propertyTiles .tile small, #propertyTiles .tile div, #propertyTiles .tile b').forEach(el=>{
        if(looksLikeDocBadge(el)) el.remove();
      });
    }catch(e){ console.warn('PureInvest: doc badge cleanup skipped', e); }
  }

  window.removePropertyDocBadges = removePropertyDocBadges;
  window.decoratePropertyTilesWithDocs = async function(){ removePropertyDocBadges(); };

  document.addEventListener('DOMContentLoaded',()=>{
    removePropertyDocBadges();
    setTimeout(removePropertyDocBadges,150);
    setTimeout(removePropertyDocBadges,700);
    setTimeout(removePropertyDocBadges,1500);
    try{
      const root=document.getElementById('propertyTiles') || document.body;
      const obs=new MutationObserver(()=>removePropertyDocBadges());
      obs.observe(root,{childList:true,subtree:true,characterData:true});
    }catch(_){ }
  });
  window.addEventListener('load',()=>setTimeout(removePropertyDocBadges,250));
})();
