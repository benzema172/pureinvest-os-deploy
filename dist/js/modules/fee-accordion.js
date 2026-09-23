(function(){
  if(window.__PI_FEE_ACCORDION_1921__) return;
  window.__PI_FEE_ACCORDION_1921__=true;
  const $=id=>document.getElementById(id);
  const panels=()=>Array.from(document.querySelectorAll('#tab-fee-breakdowns [data-pi-fee-panel]'));

  function setOpen(panel,open){
    if(!panel) return;
    const body=panel.querySelector('[data-pi-fee-panel-body]');
    const toggle=panel.querySelector('[data-pi-fee-panel-toggle]');
    panel.classList.toggle('is-open',!!open);
    panel.classList.toggle('is-collapsed',!open);
    if(body) body.hidden=!open;
    if(toggle){
      toggle.setAttribute('aria-expanded',open?'true':'false');
      const label=toggle.querySelector('[data-pi-fee-toggle-label]');
      if(label) label.textContent=open?'Zwiń':'Rozwiń';
    }
  }
  function toggle(panel){
    const open=!panel?.classList.contains('is-open');
    panels().forEach(item=>setOpen(item,item===panel?open:false));
  }
  function setText(node,text){ if(node && node.textContent!==text) node.textContent=text; }
  function summary(){
    const feeRows=document.querySelectorAll('#piFeeItemsBody tr').length;
    const mediaRows=document.querySelectorAll('#piMediaItemsBody tr').length;
    const historyRows=document.querySelectorAll('#piFeeHistory .pi-fee-history-row').length;
    const items=$('piFeeItemsSum')?.textContent?.trim()||'0,00 zł';
    const media=$('piMediaSettlementTotal')?.textContent?.trim()||'0,00 zł';
    const status=$('piFeeConsistencyStatus')?.textContent?.trim()||'Nie uzupełniono';
    const tenant=$('piFeeTenantVisible')?.checked?'widoczny dla najemcy':'tylko administrator';
    setText($('piFeePanelSummaryRent'),`${feeRows} poz. • ${items} • ${status}`);
    setText($('piFeePanelSummaryMedia'),`${mediaRows} mediów • ${media}`);
    setText($('piFeePanelSummaryHistory'),historyRows?`${historyRows} zapisanych wersji`:'Brak zapisanych wersji');
    setText($('piFeePanelSummaryReport'),`PDF • ${tenant}`);
  }
  function bind(){
    panels().forEach(panel=>{
      if(panel.dataset.piFeeAccordionBound==='1') return;
      panel.dataset.piFeeAccordionBound='1';
      setOpen(panel,false);
      const head=panel.querySelector('[data-pi-fee-panel-head]');
      if(head){
        head.addEventListener('click',event=>{
          if(event.target.closest('button,input,select,textarea,a,label')){
            if(event.target.closest('[data-pi-fee-panel-toggle]')) toggle(panel);
            return;
          }
          toggle(panel);
        });
        head.addEventListener('keydown',event=>{
          if((event.key==='Enter'||event.key===' ') && event.target===head){ event.preventDefault(); toggle(panel); }
        });
      }
    });
    const tab=$('tab-fee-breakdowns');
    if(tab && !tab.dataset.piFeeSummaryObserver){
      tab.dataset.piFeeSummaryObserver='1';
      const observer=new MutationObserver(()=>summary());
      observer.observe(tab,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','checked']});
      tab.addEventListener('input',summary,true);
      tab.addEventListener('change',summary,true);
    }
    summary();
  }
  window.piFeeAccordion1921={bind,summary,setOpen};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
  window.addEventListener('pageshow',bind);
})();
