
(function(){
  if(window.__PI_OS15_STABILIZATION__) return;
  window.__PI_OS15_STABILIZATION__ = true;

  const BUILD = window.PI_RELEASE?.name || 'PureInvest OS 1.9.0 Final';
  const CACHE_KEY = 'piOs15StabilizationApplied';
  const $ = (id)=>document.getElementById(id);

  function toast(message, type='ok'){
    try{
      if(typeof window.toast === 'function') return window.toast(message, type);
    }catch(_){ }
    try{
      let box = document.getElementById('piOs15Toast');
      if(!box){
        box = document.createElement('div');
        box.id = 'piOs15Toast';
        box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:999999;background:#111;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:12px 14px;font:700 13px/1.35 system-ui,Arial;box-shadow:0 18px 55px rgba(0,0,0,.25);max-width:360px;opacity:0;transform:translateY(8px);transition:.22s ease;';
        document.body.appendChild(box);
      }
      box.textContent = String(message || 'Gotowe');
      box.style.borderColor = type === 'error' ? 'rgba(220,38,38,.45)' : type === 'warn' ? 'rgba(217,119,6,.45)' : 'rgba(34,197,94,.35)';
      box.style.opacity = '1';
      box.style.transform = 'translateY(0)';
      clearTimeout(box.__piTimer);
      box.__piTimer = setTimeout(()=>{ box.style.opacity='0'; box.style.transform='translateY(8px)'; }, 2600);
    }catch(_){ }
  }

  function removeTechnicalUpdateUI(){
    try{
      document.querySelectorAll('#piOs11UpdateBanner,.pi-os11-update-banner,.pi-update-banner,[data-pi-update-banner]').forEach(el=>el.remove());
      document.querySelectorAll('button').forEach(btn=>{
        const txt=(btn.textContent||'').trim().toLowerCase();
        if(txt === 'wyczyść cache' || txt === 'wyczysc cache') btn.remove();
      });
    }catch(_){ }
  }

  async function refreshPwaCache(){
    removeTechnicalUpdateUI();
    try{
      if('serviceWorker' in navigator){
        const registration = await navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'});
        await registration.update().catch(()=>null);
      }
      localStorage.setItem(CACHE_KEY, BUILD);
    }catch(e){ console.warn('PureInvest cache refresh skipped:', e); }
  }

  function activePropertyId(){
    try{ if(typeof activeProperty !== 'undefined' && activeProperty) return String(activeProperty?.id || activeProperty); }catch(_){ }
    try{ if(window.activeProperty) return String(window.activeProperty?.id || window.activeProperty); }catch(_){ }
    try{ if(window.activePropertyData?.id) return String(window.activePropertyData.id); }catch(_){ }
    return '';
  }

  function setPropertyStatus(message, ok=true){
    const el = $('propertySaveStatusV727');
    if(!el) return;
    el.textContent = message || '';
    el.style.color = ok ? '#166534' : '#b45309';
  }

  async function refreshPropertyViews(){
    const jobs = [];
    try{ if(typeof window.loadPropertyTiles === 'function') jobs.push(window.loadPropertyTiles()); }catch(_){ }
    try{ if(typeof window.reloadActiveProperty === 'function') jobs.push(window.reloadActiveProperty()); }catch(_){ }
    try{ if(typeof window.renderPropertiesList === 'function') jobs.push(window.renderPropertiesList(true)); }catch(_){ }
    try{ if(typeof window.loadDashboard === 'function') jobs.push(window.loadDashboard()); }catch(_){ }
    await Promise.allSettled(jobs);
  }

  function wrapPropertySave(){
    if(typeof window.updateProperty !== 'function' || window.updateProperty.__piOs15Wrapped) return false;
    const original = window.updateProperty;
    async function updatePropertyOs15(){
      const id = activePropertyId();
      if(!id) return original.apply(this, arguments);
      setPropertyStatus('Zapisywanie zmian…', true);
      try{
        const result = await original.apply(this, arguments);
        await refreshPropertyViews();
        setPropertyStatus('Zapisano zmiany i odświeżono dane mieszkania.', true);
        toast('Zapisano mieszkanie');
        return result;
      }catch(e){
        const msg = e?.message || String(e || 'Nieznany błąd zapisu');
        setPropertyStatus('Nie udało się zapisać: ' + msg, false);
        toast('Nie udało się zapisać mieszkania', 'error');
        throw e;
      }
    }
    updatePropertyOs15.__piOs15Wrapped = true;
    window.updateProperty = updatePropertyOs15;
    return true;
  }

  function wrapReportPdf(){
    if(typeof window.piReportsDownloadPdf !== 'function' || window.piReportsDownloadPdf.__piOs15Wrapped) return false;
    const original = window.piReportsDownloadPdf;
    async function pdfOs15(){
      const status = $('piReportsStatus');
      if(status) status.textContent = 'Przygotowuję PDF…';
      try{
        if(typeof window.piReportsRefresh === 'function') await window.piReportsRefresh(true);
        const result = await original.apply(this, arguments);
        if(status) status.textContent = 'PDF gotowy';
        toast('Raport PDF został wygenerowany');
        return result;
      }catch(e){
        if(status) status.textContent = 'Błąd PDF';
        toast('Nie udało się wygenerować PDF', 'error');
        throw e;
      }
    }
    pdfOs15.__piOs15Wrapped = true;
    window.piReportsDownloadPdf = pdfOs15;
    return true;
  }

  function redirectOldPdfGenerators(){
    const names = ['generateAnnualPdf','generateTaxPdf','generateCategoryPdf'];
    names.forEach(name=>{
      if(typeof window[name] !== 'function' || window[name].__piOs15Redirected) return;
      const fn = async function(){
        try{ if(typeof window.switchTab === 'function') window.switchTab('reports', document.querySelector('.nav-item[onclick*=reports]')); }catch(_){ }
        await new Promise(r=>setTimeout(r,80));
        try{ if(typeof window.piReportsRefresh === 'function') await window.piReportsRefresh(true); }catch(_){ }
        if(typeof window.piReportsDownloadPdf === 'function') return window.piReportsDownloadPdf();
        toast('Przejdź do sekcji Raporty PRO v2 i pobierz PDF.', 'warn');
      };
      fn.__piOs15Redirected = true;
      window[name] = fn;
    });
  }

  function improveReportsUi(){
    try{
      const badge = document.querySelector('.reports-pro-badge');
      if(badge) badge.textContent = 'Reports PRO v2 · OS 1.7';
      const status = $('piReportsStatus');
      if(status && !status.dataset.piOs15) {
        status.dataset.piOs15 = 'true';
        status.title = 'Raporty PRO v2 działają w trybie HTML → PDF z obsługą polskich znaków.';
      }
      ['piReportIncludeCharts','piReportIncludeInsights','piReportIncludeFooter'].forEach(id=>{
        const el=$(id); if(el) el.checked = true;
      });
    }catch(_){ }
  }

  function init(){
    document.body.dataset.piVersion = 'os-1-9-final';
    removeTechnicalUpdateUI();
    refreshPwaCache();
    wrapPropertySave();
    wrapReportPdf();
    redirectOldPdfGenerators();
    improveReportsUi();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    init();
    setTimeout(init, 600);
    setTimeout(init, 1800);
    setInterval(removeTechnicalUpdateUI, 1500);
  });
  window.addEventListener('load',()=>setTimeout(init, 300));
})();
