(function(){
  if(window.__PI_FINANCE_REORG_1730__) return;
  window.__PI_FINANCE_REORG_1730__ = true;
  const $ = id => document.getElementById(id);
  const TOP_IDS = ['piTransactionsFinanceProPanel','piTransactionsOperationsPanel','piTenantMonthlyCollapse','piFinanceFeeBreakdownsPanel','piTransactionsHistoryGroupPanel'];
  const INNER_OPS = ['piFinanceQuickOpsPanel','piTransactionsMailPanel'];
  const INNER_HISTORY = ['piTransactionsHistoryCollapse','piTransactionsActivityLogPanel'];
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function hide(el){ if(!el) return; el.classList.add('hidden'); el.classList.remove('active'); el.style.display='none'; }
  function show(el){ if(!el) return; el.classList.remove('hidden'); el.classList.add('active'); el.style.display=''; }
  function ensureShell(id, html){
    let el = $(id);
    const root = $('tab-transactions');
    if(!root) return null;
    if(!el){ el = document.createElement('div'); el.id=id; el.innerHTML=html || ''; root.appendChild(el); }
    el.classList.add('pi-transactions-collapse','pi-admin-subtab','pi-finance-group-panel');
    return el;
  }
  function cleanTopTabs(){
    const tabs=document.querySelector('#tab-transactions .pi-transactions-admin-toggles');
    if(!tabs) return;
    tabs.classList.add('pi-finance-main-tabs');
    const items=[
      ['piFinanceOverviewTopBtn','Przegląd','piTransactionsFinanceProPanel','financePro'],
      ['piFinanceOperationsTopBtn','Operacje','piTransactionsOperationsPanel','operations'],
      ['piTransactionsFixedSettlementsTopBtn','Stałe rozliczenia','piTenantMonthlyCollapse','fixedSettlements'],
      ['piFinanceFeesTopBtn','Opłaty i media','piFinanceFeeBreakdownsPanel','fees'],
      ['piFinanceHistoryTopBtn','Historia','piTransactionsHistoryGroupPanel','history']
    ];
    const activeId = Array.from(tabs.querySelectorAll('.pi-admin-tab-btn.active')).map(b=>b.id)[0] || 'piFinanceOverviewTopBtn';
    tabs.innerHTML='';
    items.forEach(([id,label,panel,refresh],idx)=>{
      const btn=document.createElement('button'); btn.type='button'; btn.id=id; btn.className='pi-admin-tab-btn'; btn.textContent=label;
      btn.onclick=()=>window.piFinanceGroupOpen(panel,btn,refresh);
      if(id===activeId || (!$(activeId) && idx===0)) btn.classList.add('active');
      tabs.appendChild(btn);
    });
  }
  function prepInnerPanel(el){
    if(!el) return;
    el.classList.remove('pi-transactions-collapse','pi-admin-subtab','pi-mail-collapse');
    el.classList.add('pi-finance-inner-panel','hidden');
    el.style.display='none';
  }
  function ensureQuickOpsPanel(){
    let q=$('piFinanceQuickOpsPanel');
    if(q) return q;
    q=document.createElement('div'); q.id='piFinanceQuickOpsPanel'; q.className='pi-finance-inner-panel hidden'; q.style.display='none';
    q.innerHTML=`<div class="card pi-finance-quick-card pi-finance-ops-hub">
      <div class="pi-finance-ops-hub-head">
        <div>
          <div class="card-title">Operacje finansowe</div>
          <div class="pi-muted">Jedno miejsce do dodawania kosztów, wpłat, OCR oraz importu faktur z poczty.</div>
        </div>
        <span class="pi-finance-ops-pill">Wpływy • koszty • OCR • Gmail</span>
      </div>
      <div class="pi-finance-quick-grid pi-finance-ops-grid">
        <button type="button" onclick="piFinanceOpenInlineAction('cost')">Dodaj koszt</button>
        <button type="button" onclick="piFinanceOpenInlineAction('payment')">Dodaj wpłatę</button>
        <button type="button" class="subtle-link-btn" onclick="piFinanceOpenInlineAction('ocr')">OCR PRO</button>
        <button type="button" class="subtle-link-btn" onclick="piFinanceToggleMailImport()">Import z poczty</button>
      </div>
      <div id="piFinanceInlineOpsPanel" class="pi-finance-inline-ops hidden">
        <div id="piFinanceInlineCost" class="pi-finance-inline-pane hidden">
          <div class="pi-finance-inline-title">Dodaj koszt w finansach</div>
          <div class="pi-finance-inline-grid">
            <select id="piFinanceCostCategory"></select>
            <input type="number" id="piFinanceCostAmount" placeholder="Kwota">
            <input type="date" id="piFinanceCostDate">
          </div>
          <textarea id="piFinanceCostNote" placeholder="Notatka"></textarea>
          <input type="file" id="piFinanceCostAttachment" accept="image/*,.pdf">
          <button type="button" onclick="piFinanceAddCostInline()">Dodaj koszt</button>
          <div id="piFinanceCostMsg" class="pi-finance-inline-msg"></div>
        </div>
        <div id="piFinanceInlinePayment" class="pi-finance-inline-pane hidden">
          <div class="pi-finance-inline-title">Dodaj wpłatę w finansach</div>
          <div class="pi-finance-inline-grid">
            <select id="piFinancePaymentSource"></select>
            <input type="number" id="piFinancePaymentAmount" placeholder="Kwota">
            <input type="date" id="piFinancePaymentDate" aria-label="Data wpływu środków">
            <input type="month" id="piFinancePaymentSettlementMonth" aria-label="Rozliczenie za miesiąc">
          </div>
          <div class="pi-finance-period-hint">Data wpływu pokazuje, kiedy środki faktycznie wpłynęły. Pole miesiąca wskazuje, którą należność ma rozliczyć wpłata.</div>
          <textarea id="piFinancePaymentNote" placeholder="Notatka"></textarea>
          <input type="file" id="piFinancePaymentAttachment" accept="image/*,.pdf">
          <div class="pi-finance-inline-actions">
            <button type="button" onclick="piFinanceAddPaymentInline()">Dodaj wpłatę</button>
            <button type="button" class="subtle-link-btn" onclick="piFinanceQuickMonthlyRentInline()">Szybko dodaj najem za ten miesiąc</button>
          </div>
          <div id="piFinancePaymentMsg" class="pi-finance-inline-msg"></div>
        </div>
        <div id="piFinanceInlineOcr" class="pi-finance-inline-pane hidden">
          <div class="pi-finance-inline-title">OCR PRO w finansach</div>
          <div class="ocr-dropzone pi-finance-ocr-dropzone">
            <div>📄</div>
            <b>Przeciągnij dokumenty tutaj albo wybierz pliki</b>
            <input type="file" id="piFinanceOcrInvoiceFile" accept="image/*,.pdf,.doc,.docx" multiple>
          </div>
          <button type="button" onclick="piFinanceRunOCRInline()">Uruchom OCR PRO</button>
          <div id="piFinanceOcrStatus" class="ocr-status"></div>
          <div id="piFinanceOcrPreview" class="ocr-preview hidden"></div>
          <div id="piFinanceOcrLog" class="ocr-engine-log"></div>
        </div>
      </div>
    </div>`;
    return q;
  }
  function activePropertyId(){
    try{ if(typeof activeProperty !== 'undefined' && activeProperty) return activeProperty; }catch(_){ }
    return window.activeProperty || null;
  }
  function todayLocal(){
    try{ return typeof todayDate === 'function' ? todayDate() : new Date().toISOString().slice(0,10); }
    catch(_){ return new Date().toISOString().slice(0,10); }
  }
  function setInlineMsg(id, text, type){
    const el=$(id); if(!el) return;
    el.textContent=text||''; el.dataset.type=type||'';
  }
  function cloneOptions(fromId, toId, fallback){
    const to=$(toId); if(!to) return;
    const from=$(fromId);
    const previous=to.value;
    if(from && from.options && from.options.length){
      to.innerHTML=Array.from(from.options).map(o=>`<option value="${esc(o.value || o.textContent)}">${esc(o.textContent || o.value)}</option>`).join('');
    }else{
      to.innerHTML=(fallback||[]).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    }
    if(previous && Array.from(to.options).some(o=>o.value===previous)) to.value=previous;
  }
  function refreshInlineOptions(){
    cloneOptions('costCategory','piFinanceCostCategory',['Prąd','Woda','Gaz','Czynsz','Remont']);
    cloneOptions('paymentSource','piFinancePaymentSource',['Najem','Czynsz','Media']);
    const cd=$('piFinanceCostDate'); if(cd && !cd.value) cd.value=todayLocal();
    const pd=$('piFinancePaymentDate'); if(pd && !pd.value) pd.value=todayLocal();
    const pm=$('piFinancePaymentSettlementMonth'); if(pm && !pm.value) pm.value=todayLocal().slice(0,7);
  }
  window.piFinanceOpenInlineAction=function(kind){
    refreshInlineOptions();
    const host=$('piFinanceInlineOpsPanel'); if(!host) return;
    host.classList.remove('hidden'); host.style.display='';
    ['piFinanceInlineCost','piFinanceInlinePayment','piFinanceInlineOcr'].forEach(id=>hide($(id)));
    const target={cost:'piFinanceInlineCost',payment:'piFinanceInlinePayment',ocr:'piFinanceInlineOcr'}[kind] || 'piFinanceInlineCost';
    show($(target));
    const mail=$('piTransactionsMailPanel'); if(mail) hide(mail);
    try{ host.scrollIntoView({behavior:'smooth', block:'start'}); }catch(_){ }
  };
  window.piFinanceAddCostInline=async function(){
    const propertyId=activePropertyId();
    if(!propertyId) return alert('Najpierw wybierz mieszkanie.');
    const amount=Number($('piFinanceCostAmount')?.value || 0);
    if(!(amount>0)) return alert('Podaj kwotę kosztu większą od 0.');
    setInlineMsg('piFinanceCostMsg','Zapisuję koszt...', 'info');
    try{
      const file=$('piFinanceCostAttachment')?.files?.[0];
      const attachment = typeof uploadAttachment === 'function' ? await uploadAttachment(file,'expenses') : {};
      const actualDate=$('piFinanceCostDate')?.value || todayLocal();
      let payload={property_id:propertyId,amount,category:$('piFinanceCostCategory')?.value || 'Koszt',expense_date:actualDate,created_at:actualDate,note:$('piFinanceCostNote')?.value || '',transaction_status:'approved',transaction_source:'manual',...attachment};
      try{ if(window.piSettlementDictionary?.ensurePayload) payload = window.piSettlementDictionary.ensurePayload(payload, 'expense', payload.category); }catch(_){ }
      const res = window.piSettlementDictionary?.insertWithFallback ? await window.piSettlementDictionary.insertWithFallback('expenses', payload) : await db.from('expenses').insert([payload]);
      if(res.error) throw res.error;
      ['piFinanceCostAmount','piFinanceCostNote','piFinanceCostAttachment'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
      const d=$('piFinanceCostDate'); if(d) d.value=todayLocal();
      setInlineMsg('piFinanceCostMsg','Koszt dodany w sekcji Finanse.', 'success');
      try{ await refreshDashboard?.(); }catch(_){ }
      try{ renderFinancePro?.(); }catch(_){ }
      try{ piRenderPropertyFinance?.(true); }catch(_){ }
    }catch(e){ setInlineMsg('piFinanceCostMsg','Błąd zapisu: '+(e.message||e), 'error'); alert('Błąd zapisu kosztu: '+(e.message||e)); }
  };
  window.piFinanceAddPaymentInline=async function(){
    const propertyId=activePropertyId();
    if(!propertyId) return alert('Najpierw wybierz mieszkanie.');
    const amount=Number($('piFinancePaymentAmount')?.value || 0);
    if(!(amount>0)) return alert('Podaj kwotę wpłaty większą od 0.');
    setInlineMsg('piFinancePaymentMsg','Zapisuję wpłatę...', 'info');
    try{
      const file=$('piFinancePaymentAttachment')?.files?.[0];
      const attachment = typeof uploadAttachment === 'function' ? await uploadAttachment(file,'payments') : {};
      const actualDate=$('piFinancePaymentDate')?.value || todayLocal();
      const settlementMonth=$('piFinancePaymentSettlementMonth')?.value || actualDate.slice(0,7);
      let payload={property_id:propertyId,amount,source:$('piFinancePaymentSource')?.value || 'Wpłata',created_at:actualDate,payment_date:actualDate,note:$('piFinancePaymentNote')?.value || '',transaction_status:'approved',transaction_source:'manual',...attachment};
      try{ if(window.piSettlementDictionary?.ensurePayload) payload = window.piSettlementDictionary.ensurePayload(payload, 'income', payload.source); }catch(_){ }
      try{ if(window.PureInvestPaymentPeriod?.applyToPayload) payload = window.PureInvestPaymentPeriod.applyToPayload(payload, settlementMonth); }catch(_){ }
      const res = window.piSettlementDictionary?.insertWithFallback ? await window.piSettlementDictionary.insertWithFallback('payments', payload) : await db.from('payments').insert([payload]);
      if(res.error) throw res.error;
      ['piFinancePaymentAmount','piFinancePaymentNote','piFinancePaymentAttachment'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
      const d=$('piFinancePaymentDate'); if(d) d.value=todayLocal();
      const pm=$('piFinancePaymentSettlementMonth'); if(pm) pm.value=todayLocal().slice(0,7);
      setInlineMsg('piFinancePaymentMsg','Wpłata dodana w sekcji Finanse.', 'success');
      try{ await refreshDashboard?.(); }catch(_){ }
      try{ renderFinancePro?.(); }catch(_){ }
      try{ piRenderPropertyFinance?.(true); }catch(_){ }
    }catch(e){ setInlineMsg('piFinancePaymentMsg','Błąd zapisu: '+(e.message||e), 'error'); alert('Błąd zapisu wpłaty: '+(e.message||e)); }
  };
  window.piFinanceQuickMonthlyRentInline=async function(){
    try{
      if(typeof quickMonthlyRent === 'function') await quickMonthlyRent();
      setInlineMsg('piFinancePaymentMsg','Dodano miesięczny najem.', 'success');
      try{ await refreshDashboard?.(); }catch(_){ }
      try{ renderFinancePro?.(); }catch(_){ }
    }catch(e){ setInlineMsg('piFinancePaymentMsg','Błąd: '+(e.message||e), 'error'); }
  };
  function ocrInlineLog(message){
    const log=$('piFinanceOcrLog');
    if(log) log.innerHTML += `<div>${esc(message)}</div>`;
  }
  window.piFinanceRunOCRInline=async function(){
    const input=$('piFinanceOcrInvoiceFile');
    const files=[...(input?.files || [])];
    if(!files.length) return alert('Dodaj dokumenty do OCR PRO.');
    const status=$('piFinanceOcrStatus');
    const preview=$('piFinanceOcrPreview');
    const log=$('piFinanceOcrLog');
    if(status) status.textContent='OCR PRO uruchomiony: '+files.length+' plików.';
    if(preview){ preview.innerHTML=''; preview.classList.remove('hidden'); }
    if(log) log.innerHTML='';
    let saved=0, skipped=0;
    for(const file of files){
      try{
        ocrInlineLog('Analiza: '+file.name);
        const text = typeof ocr3ReadFile === 'function' ? await ocr3ReadFile(file) : '';
        const parsed = typeof ocr3Parse === 'function' ? ocr3Parse(text) : {};
        if(preview){
          preview.innerHTML += `<div style="padding:8px;border-bottom:1px solid #eee7de;"><b>${esc(file.name)}</b><br>${parsed.amount ? money(parsed.amount) : 'Brak kwoty'} • ${esc(parsed.category || 'Brak kategorii')} • ${parsed.date || 'Brak daty'} • ${parsed.confidence || 0}%</div>`;
        }
        const result = typeof ocr3Save === 'function' ? await ocr3Save(parsed, file) : {saved:false};
        if(result.saved){ saved++; ocrInlineLog('Zaksięgowano: '+file.name); }
        else{ skipped++; ocrInlineLog('Pominięto: '+file.name); }
      }catch(e){ skipped++; ocrInlineLog('Błąd '+file.name+': '+(e.message||e)); }
    }
    if(status) status.textContent='Gotowe. Zaksięgowano: '+saved+', pominięto: '+skipped+'.';
    try{ await refreshDashboard?.(); }catch(_){ }
    try{ renderFinancePro?.(); }catch(_){ }
  };
  window.piFinanceToggleMailImport=function(){
    const panel=$('piTransactionsMailPanel');
    if(!panel) return;
    const inline=$('piFinanceInlineOpsPanel');
    if(inline){ inline.classList.add('hidden'); inline.style.display='none'; }
    panel.classList.toggle('hidden');
    panel.classList.toggle('active', !panel.classList.contains('hidden'));
    panel.style.display = panel.classList.contains('hidden') ? 'none' : '';
    try{ window.piMailLoadAll?.(); }catch(_){ }
    if(!panel.classList.contains('hidden')) panel.scrollIntoView({behavior:'smooth', block:'start'});
  };
  function innerNav(containerId, buttons){
    let nav=$(containerId);
    if(nav) return nav;
    nav=document.createElement('div'); nav.id=containerId; nav.className='pi-finance-inner-tabs';
    buttons.forEach(([id,label,refresh])=>{
      const b=document.createElement('button'); b.type='button'; b.className='pi-admin-tab-btn'; b.textContent=label; b.dataset.target=id; b.onclick=()=>openInner(id,b,refresh); nav.appendChild(b);
    });
    return nav;
  }
  function openInner(id, btn, refresh){
    const panel=$(id); if(!panel) return;
    const group = panel.closest('.pi-finance-group-panel') || $('tab-transactions');
    group.querySelectorAll('.pi-finance-inner-panel').forEach(hide);
    show(panel);
    const nav=btn?.closest('.pi-finance-inner-tabs');
    if(nav) nav.querySelectorAll('.pi-admin-tab-btn').forEach(b=>b.classList.toggle('active', b===btn));
    try{
      if(refresh==='mail') window.piMailLoadAll?.();
      if(refresh==='propertyFinance') window.piRenderPropertyFinance?.(true);
      if(refresh==='history') window.refreshDashboard?.();
      if(refresh==='activityLog') window.piRenderActivityLog?.();
      if(refresh==='settlementDictionary') window.piTransactionTypesRefreshV160?.();
    }catch(e){ console.warn('[Finance inner refresh]', e); }
  }
  function buildOperations(){
    const panel=ensureShell('piTransactionsOperationsPanel', '<div class="context-header pi-finance-subheader"><h2>Operacje</h2><p>Dodawanie kosztów, wpłat, OCR i importu z poczty w jednym miejscu.</p></div>');
    if(!panel) return;
    const oldNav=$('piFinanceOperationsInnerTabs');
    if(oldNav) oldNav.remove();
    const quick=ensureQuickOpsPanel();
    if(quick.parentElement!==panel) panel.appendChild(quick);
    quick.classList.remove('hidden'); quick.classList.add('active'); quick.style.display='';
    const mail=$('piTransactionsMailPanel');
    if(mail){ prepInnerPanel(mail); if(mail.parentElement!==panel) panel.appendChild(mail); hide(mail); }
    const duplicate=$('piTransactionsPropertyFinancePanel');
    if(duplicate){ hide(duplicate); duplicate.classList.add('pi-finance-duplicate-hidden'); }
  }
  function buildFixed(){
    const fixed=$('piTenantMonthlyCollapse'); if(!fixed) return;
    fixed.classList.add('pi-transactions-collapse','pi-admin-subtab','pi-finance-group-panel');
    const root=$('tab-transactions'); if(root && fixed.parentElement!==root) root.appendChild(fixed);
    let head=fixed.querySelector('.pi-finance-fixed-head');
    if(!head){
      head=document.createElement('div'); head.className='context-header pi-finance-fixed-head';
      head.innerHTML='<h2>Stałe rozliczenia</h2><p>Kwoty miesięczne, typy rozliczeń i słownik pozycji w jednym miejscu.</p>';
      fixed.insertBefore(head,fixed.firstChild);
    }
    const dict=$('piTransactionsSettlementDictionaryPanel');
    if(dict){
      dict.classList.remove('pi-transactions-collapse','pi-admin-subtab','hidden');
      dict.classList.add('pi-finance-dictionary-inline');
      dict.style.display='';
      let details=$('piFinanceDictionaryDetails');
      if(!details){
        details=document.createElement('details'); details.id='piFinanceDictionaryDetails'; details.className='card pi-finance-details';
        details.innerHTML='<summary>Słownik rozliczeń · zaawansowane</summary><div id="piFinanceDictionaryHost"></div>';
        fixed.appendChild(details);
      }
      const host=$('piFinanceDictionaryHost'); if(host && dict.parentElement!==host) host.appendChild(dict);
    }
  }
  function embedLegacySection(sectionId, host, options={}){
    const section=$(sectionId); if(!section || !host) return null;
    section.classList.remove('tab-view','active','hidden');
    section.classList.add('pi-finance-embedded-section');
    section.style.display='';
    if(options.className) section.classList.add(options.className);
    if(options.title){
      const title=section.querySelector('.context-header h2');
      if(title) title.textContent=options.title;
    }
    if(options.description){
      const copy=section.querySelector('.context-header p');
      if(copy) copy.textContent=options.description;
    }
    if(section.parentElement!==host) host.appendChild(section);
    return section;
  }
  function removeLegacyNav(){
    Array.from(document.querySelectorAll('.nav-item')).forEach(item=>{
      const action=String(item.getAttribute('onclick')||'');
      if(action.includes("'portfolio'") || action.includes("'fee-breakdowns'")) item.remove();
    });
  }
  function buildPortfolioOverview(){
    const overview=$('piTransactionsFinanceProPanel'); if(!overview) return;
    const section=embedLegacySection('tab-portfolio',overview,{
      className:'pi-finance-portfolio-embedded',
      title:'Portfel i rentowność',
      description:'Przychody, koszty, saldo, zysk po podatku i ROI dla wybranego mieszkania lub całego portfela.'
    });
    if(section){
      const header=section.querySelector('.pi-portfolio-header');
      if(header) header.classList.add('pi-finance-embedded-header');
    }
  }
  function buildFees(){
    const panel=ensureShell('piFinanceFeeBreakdownsPanel',''); if(!panel) return;
    const section=embedLegacySection('tab-fee-breakdowns',panel,{className:'pi-finance-fees-embedded'});
    if(section){
      try{ window.piFeeAccordion1921?.bind?.(); window.piFeeAccordion1921?.summary?.(); }catch(_){ }
    }
  }
  function buildHistory(){
    const panel=ensureShell('piTransactionsHistoryGroupPanel','<div class="context-header pi-finance-subheader"><h2>Historia</h2><p>Historia transakcji i dziennik zmian w jednym miejscu.</p></div>');
    if(!panel) return;
    const nav=innerNav('piFinanceHistoryInnerTabs', [
      ['piTransactionsHistoryCollapse','Historia transakcji','history'],
      ['piTransactionsActivityLogPanel','Dziennik zmian','activityLog']
    ]);
    if(nav.parentElement!==panel) panel.insertBefore(nav,panel.firstChild);
    INNER_HISTORY.forEach(id=>{ const el=$(id); if(el){ prepInnerPanel(el); if(el.parentElement!==panel) panel.appendChild(el); } });
    if(!panel.querySelector('.pi-finance-inner-panel.active') && $('piTransactionsHistoryCollapse')) openInner('piTransactionsHistoryCollapse', nav.querySelector('[data-target="piTransactionsHistoryCollapse"]'), 'history');
  }
  function removeLegacyButtons(){
    const tabs=document.querySelector('#tab-transactions .pi-transactions-admin-toggles'); if(!tabs) return;
    Array.from(tabs.querySelectorAll('.pi-admin-tab-btn')).forEach(btn=>{
      if(!['piFinanceOverviewTopBtn','piFinanceOperationsTopBtn','piTransactionsFixedSettlementsTopBtn','piFinanceFeesTopBtn','piFinanceHistoryTopBtn'].includes(btn.id)) btn.remove();
    });
  }
  function normalizeOverview(){
    const panel=$('piTransactionsFinanceProPanel');
    if(panel){ panel.classList.add('pi-transactions-collapse','pi-admin-subtab','pi-finance-group-panel'); }
    buildPortfolioOverview();
  }
  function bindLegacyToggle(){
    window.piFinanceGroupOpen = function(panelId, btn, refreshType){
      organizeFinanceSection(false);
      const target=$(panelId); if(!target) return;
      TOP_IDS.forEach(id=>hide($(id)));
      show(target);
      const tabs=document.querySelector('#tab-transactions .pi-transactions-admin-toggles');
      if(tabs){
        tabs.querySelectorAll('.pi-admin-tab-btn').forEach(b=>b.classList.remove('active'));
        const idMap={piTransactionsFinanceProPanel:'piFinanceOverviewTopBtn',piTransactionsOperationsPanel:'piFinanceOperationsTopBtn',piTenantMonthlyCollapse:'piTransactionsFixedSettlementsTopBtn',piFinanceFeeBreakdownsPanel:'piFinanceFeesTopBtn',piTransactionsHistoryGroupPanel:'piFinanceHistoryTopBtn'};
        // organizeFinanceSection() przebudowuje belkę, więc kliknięty przycisk może być już odpięty z DOM.
        // Zawsze pobieramy aktualny przycisk po ID, a dopiero awaryjnie używamy btn.
        const activeBtn=$(idMap[panelId]) || btn;
        if(activeBtn) activeBtn.classList.add('active');
      }
      try{
        if(refreshType==='financePro') window.renderFinancePro?.();
        if(refreshType==='operations'){
          show($('piFinanceQuickOpsPanel'));
        }
        if(refreshType==='fixedSettlements'){
          window.piTransactionTypesRefreshV160?.(); window.renderOwnerRentPanel?.();
          setTimeout(()=>organizeFinanceSection(false),80);
        }
        if(refreshType==='fees'){
          window.piRenderFeeBreakdowns?.({preferActive:true});
          window.piFeeAccordion1921?.bind?.();
          window.piFeeAccordion1921?.summary?.();
        }
        if(refreshType==='history'){
          const hist=$('piTransactionsHistoryGroupPanel');
          const active=hist?.querySelector('.pi-finance-inner-panel.active')?.id || 'piTransactionsHistoryCollapse';
          const b=hist?.querySelector(`[data-target="${active}"]`);
          openInner(active,b,active==='piTransactionsActivityLogPanel'?'activityLog':'history');
        }
      }catch(e){ console.warn('[Finance group refresh]', e); }
    };
    window.piTransactionsTogglePanel = function(id, btn, refreshType){
      const map={
        piTransactionsFinanceProPanel:['piTransactionsFinanceProPanel','financePro'],
        piTransactionsOperationsPanel:['piTransactionsOperationsPanel','operations'],
        piTransactionsMailPanel:['piTransactionsOperationsPanel','operations','piTransactionsMailPanel','mail'],
        piTransactionsPropertyFinancePanel:['piTransactionsHistoryGroupPanel','history','piTransactionsHistoryCollapse','history'],
        piTenantMonthlyCollapse:['piTenantMonthlyCollapse','fixedSettlements'],
        piTransactionsSettlementDictionaryPanel:['piTenantMonthlyCollapse','fixedSettlements'],
        piFinanceFeeBreakdownsPanel:['piFinanceFeeBreakdownsPanel','fees'],
        'tab-fee-breakdowns':['piFinanceFeeBreakdownsPanel','fees'],
        'tab-portfolio':['piTransactionsFinanceProPanel','financePro'],
        piTransactionsHistoryCollapse:['piTransactionsHistoryGroupPanel','history','piTransactionsHistoryCollapse','history'],
        piTransactionsActivityLogPanel:['piTransactionsHistoryGroupPanel','history','piTransactionsActivityLogPanel','activityLog'],
        piTransactionsHistoryGroupPanel:['piTransactionsHistoryGroupPanel','history']
      }[id] || [id, refreshType];
      const topBtnMap={piTransactionsFinanceProPanel:'piFinanceOverviewTopBtn',piTransactionsOperationsPanel:'piFinanceOperationsTopBtn',piTenantMonthlyCollapse:'piTransactionsFixedSettlementsTopBtn',piFinanceFeeBreakdownsPanel:'piFinanceFeesTopBtn',piTransactionsHistoryGroupPanel:'piFinanceHistoryTopBtn'};
      window.piFinanceGroupOpen(map[0], $(topBtnMap[map[0]]) || btn, map[1]);
      if(map[2]){
        const innerBtn=document.querySelector(`[data-target="${CSS.escape(map[2])}"]`);
        setTimeout(()=>openInner(map[2], innerBtn, map[3]),20);
      }
    };
  }
  function organizeFinanceSection(openDefault=true){
    removeLegacyNav(); cleanTopTabs(); normalizeOverview(); buildOperations(); buildFixed(); buildFees(); buildHistory(); removeLegacyButtons(); bindLegacyToggle();
    if(openDefault){
      const anyOpen=TOP_IDS.some(id=>{ const p=$(id); return p && p.classList.contains('active') && !p.classList.contains('hidden') && p.style.display!=='none'; });
      if(!anyOpen) window.piFinanceGroupOpen('piTransactionsFinanceProPanel',$('piFinanceOverviewTopBtn'),'financePro');
    }
  }
  function bindLegacyRoutes(){
    const original=window.switchTab;
    if(typeof original!=='function' || original.__piFinanceUnified1923) return;
    const wrapped=function(tab,navEl){
      const legacyPortfolio=tab==='portfolio';
      const legacyFees=tab==='fee-breakdowns';
      if(legacyPortfolio || legacyFees){
        const financeNav=document.querySelector('.nav-item[onclick*=transactions]') || navEl;
        const out=original.call(this,'transactions',financeNav);
        setTimeout(()=>{
          if(legacyFees) window.piFinanceGroupOpen?.('piFinanceFeeBreakdownsPanel',$('piFinanceFeesTopBtn'),'fees');
          else { window.piFinanceGroupOpen?.('piTransactionsFinanceProPanel',$('piFinanceOverviewTopBtn'),'financePro'); window.renderPortfolio?.(); }
        },40);
        return out;
      }
      const out=original.apply(this,arguments);
      if(tab==='transactions'){
        setTimeout(()=>{
          try{ organizeFinanceSection(true); }
          catch(e){ console.warn('[Finance organize on navigation]', e); }
        },40);
      }
      return out;
    };
    wrapped.__piFinanceUnified1923=true;
    window.switchTab=wrapped;
  }
  window.piFinanceReorganize = organizeFinanceSection;
  document.addEventListener('DOMContentLoaded',()=>{
    bindLegacyRoutes();
    try{
      removeLegacyNav();
      organizeFinanceSection(true);
    }catch(e){ console.warn('[Finance nav cleanup]', e); }
  });
})();
