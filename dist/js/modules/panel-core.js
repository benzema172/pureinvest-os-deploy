(function(){
  if(window.__PI_V759_PANEL_CORE__) return;
  window.__PI_V759_PANEL_CORE__ = true;
  const $ = id => document.getElementById(id);
  function openDashboardForm(id,btn){
    let dialog=$('piDashboardActionDialog');
    if(!dialog){
      dialog=document.createElement('dialog'); dialog.id='piDashboardActionDialog'; dialog.className='pi-action-dialog';
      dialog.setAttribute('aria-labelledby','piDashboardActionTitle');
      dialog.innerHTML='<div class="pi-action-dialog-head"><div><h2 id="piDashboardActionTitle"></h2><p id="piDashboardActionContext"></p></div><button type="button" class="pi-action-dialog-close" aria-label="Zamknij formularz">×</button></div><div class="pi-action-dialog-body"></div>';
      $('tab-dashboard').appendChild(dialog);
      dialog.querySelector('.pi-action-dialog-close').addEventListener('click',()=>dialog.close());
      ['piDashboardCostCollapse','piDashboardPaymentCollapse'].forEach(key=>{
        const panel=$(key); if(panel) dialog.querySelector('.pi-action-dialog-body').appendChild(panel);
      });
    }
    ['piDashboardCostCollapse','piDashboardPaymentCollapse'].forEach(key=>{
      const panel=$(key); if(!panel) return;
      panel.classList.toggle('hidden',key!==id); panel.classList.toggle('active',key===id);
      panel.style.display=key===id?'block':'none';
    });
    $('piDashboardActionTitle').textContent=id==='piDashboardPaymentCollapse'?'Dodaj wpłatę':'Dodaj koszt';
    $('piDashboardActionContext').textContent=$('dashboardTitle')?.textContent || window.activePropertyData?.name || 'Aktywne mieszkanie';
    if(!dialog.open) dialog.showModal();
    $(id)?.querySelector('input,select')?.focus();
  }
  function openPanel(rootSelector, panelSelector, id, btn, refreshType, allowClose){
    const root = document.querySelector(rootSelector);
    const panel = $(id);
    if(!root || !panel) return;

    const btnRoot = btn?.parentElement || root;
    const isOpen = panel.classList.contains('active') && !panel.classList.contains('hidden') && panel.style.display !== 'none';

    root.querySelectorAll(panelSelector).forEach(p=>{
      p.classList.add('hidden');
      p.classList.remove('active');
      p.style.display = 'none';
    });
    btnRoot.querySelectorAll('.pi-admin-tab-btn,.pi-mail-tab-btn').forEach(b=>b.classList.remove('active'));

    if(allowClose && isOpen){
      return;
    }

    panel.classList.remove('hidden');
    panel.classList.add('active');
    panel.style.display = '';
    if(btn) btn.classList.add('active');
    try{
      if(refreshType === 'properties' && typeof loadPropertyTiles === 'function') loadPropertyTiles();
      if(refreshType === 'propertyEdit' && typeof hydratePropertyForms === 'function') hydratePropertyForms();
      if(refreshType === 'library' && typeof loadLibrary === 'function') loadLibrary();
      if(refreshType === 'mail' && typeof piMailLoadAll === 'function') piMailLoadAll();
      if(refreshType === 'propertyFinance' && typeof window.piRenderPropertyFinance === 'function') window.piRenderPropertyFinance(true);
      if(refreshType === 'fixedSettlements'){
        if(typeof window.piTransactionTypesRefreshV160 === 'function') window.piTransactionTypesRefreshV160();
        if(typeof window.renderOwnerRentPanel === 'function') window.renderOwnerRentPanel();
      }
      if(refreshType === 'history' && typeof refreshDashboard === 'function') refreshDashboard();
      if(refreshType === 'activityLog' && typeof window.piRenderActivityLog === 'function') window.piRenderActivityLog();
    }catch(e){ console.warn('Panel refresh skipped', e); }
  }
  window.piTenantTogglePanel = (id,btn,refreshType)=>{ try{ window.piAccessSwitchSubtab?.('tenancy', btn); }catch(_){ } const panel=document.getElementById(id); if(panel){ panel.classList.remove('hidden'); panel.classList.add('active'); panel.style.display=''; } };
  window.piSectionTogglePanel = (id,btn,refreshType)=>{
    const panel=$(id);
    const root = panel?.closest('#tab-properties,#tab-documents') || document.querySelector('#tab-properties');
    const selector = root?.id === 'tab-documents' ? '#tab-documents .pi-section-collapse' : '#tab-properties .pi-section-collapse';
    openPanel(root ? '#'+root.id : '#tab-properties', selector, id, btn, refreshType);
  };
  window.piCommandTogglePanel = (id,btn,refreshType)=>{
    if(['piDashboardCostCollapse','piDashboardPaymentCollapse'].includes(id)) return openDashboardForm(id,btn);
    return openPanel('#tab-dashboard','#tab-dashboard .pi-command-collapse',id,btn,refreshType,true);
  };
  window.piTransactionsTogglePanel = (id,btn,refreshType)=>openPanel('#tab-transactions','#tab-transactions .pi-transactions-collapse',id,btn,refreshType);
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{
      try{
        document.querySelectorAll('#tab-documents .pi-section-collapse').forEach(p=>p.classList.add('pi-admin-subtab'));
      }catch(_){}
    },700);
  });
})();
