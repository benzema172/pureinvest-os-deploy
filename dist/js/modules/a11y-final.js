(function(){
  if(window.__PI_A11Y_FINAL_190__) return;
  window.__PI_A11Y_FINAL_190__=true;
  const controlLabel=element=>element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name') || String(element.id || '').replace(/([a-z])([A-Z])/g,'$1 $2') || 'Pole formularza';
  function enhance(root=document){
    root.querySelectorAll?.('input,select,textarea').forEach(element=>{
      if(!element.id || !document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) if(!element.hasAttribute('aria-label')) element.setAttribute('aria-label',controlLabel(element));
      if(/amount|kwota/i.test(element.id || element.name || '')){ element.setAttribute('min','0.01'); if(element.type==='number') element.setAttribute('step','0.01'); }
      if(/meter|reading|licznik/i.test(element.id || element.name || '')) element.setAttribute('min','0');
    });
    root.querySelectorAll?.('[onclick]').forEach(element=>{
      if(/^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(element.tagName)) return;
      if(!element.hasAttribute('role')) element.setAttribute('role','button'); if(!element.hasAttribute('tabindex')) element.tabIndex=0;
    });
    root.querySelectorAll?.('[id$="Msg"],[id$="Message"],#msg,.toast-container,.pi-toast-root').forEach(element=>{ if(!element.hasAttribute('role')) element.setAttribute('role','status'); element.setAttribute('aria-live','polite'); element.setAttribute('aria-atomic','true'); });
    root.querySelectorAll?.('.modal,.pi-modal,.drawer,.pi-drawer,[id$="Modal"],[id$="Drawer"]').forEach(element=>{ element.setAttribute('role','dialog'); element.setAttribute('aria-modal','true'); if(!element.hasAttribute('tabindex')) element.tabIndex=-1; });
  }
  document.addEventListener('keydown',event=>{
    const actionable=event.target?.closest?.('[role="button"]'); if(actionable && (event.key==='Enter' || event.key===' ')){ event.preventDefault(); actionable.click(); return; }
    if(event.key!=='Tab') return; const dialog=event.target?.closest?.('[role="dialog"]'); if(!dialog) return;
    const focusable=[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node=>node.offsetParent!==null); if(!focusable.length) return;
    const first=focusable[0],last=focusable.at(-1); if(event.shiftKey && document.activeElement===first){ event.preventDefault(); last.focus(); } else if(!event.shiftKey && document.activeElement===last){ event.preventDefault(); first.focus(); }
  });
  document.addEventListener('DOMContentLoaded',()=>{ enhance(); const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{ if(node.nodeType===1) enhance(node); }))); observer.observe(document.body,{childList:true,subtree:true}); });
})();
