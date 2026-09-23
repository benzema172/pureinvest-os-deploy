(function(){
  if(window.__PI_V752_TRANSACTIONS__) return;
  window.__PI_V752_TRANSACTIONS__ = true;

  const Core = () => window.PureInvestFinanceCore || {};
  const Period = () => window.PureInvestPaymentPeriod || {};
  const $ = id => document.getElementById(id);
  const db = () => window.db || window.piDb || window.supabaseClient;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeUrl = value => { try{ const url = new URL(String(value || ''), location.origin); return ['http:','https:'].includes(url.protocol) ? url.href : ''; }catch(_){ return ''; } };
  const js = v => JSON.stringify(v ?? '').replaceAll('<','\\u003C').replaceAll('>','\\u003E');
  const num = v => Core().num ? Core().num(v) : Number(v||0);
  const money = v => Core().money ? Core().money(v) : (num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł');
  const liveRows = rows => Core().liveRows ? Core().liveRows(rows) : (rows||[]).filter(r=>r && r.is_deleted !== true && !r.deleted_at);
  const componentLabels = Core().componentLabels || {};
  const sourceLabels = Core().sourceLabels || {};
  const statusLabels = Core().statusLabels || {};
  const components = ['owner','community','electricity','gas','water','other'];

  function props(){ try{return window.loadedProperties || loadedProperties || [];}catch(_){return window.loadedProperties || [];} }
  function activePid(){ try{return window.activeProperty || activeProperty || window.activePropertyData?.id || activePropertyData?.id || null;}catch(_){return window.activeProperty || null;} }
  function propById(id){ return props().find(p=>String(p.id)===String(id)) || null; }
  function propName(id){ const p=propById(id); return p ? (p.name || p.address || 'Mieszkanie') : (id || '—'); }
  function isoDate(v){ try{return new Date(v || Date.now()).toISOString().slice(0,10);}catch(_){return new Date().toISOString().slice(0,10);} }
  function displayDate(v){ try{return new Date(v || Date.now()).toLocaleString('pl-PL');}catch(_){return String(v||'');} }
  function yearKey(v){ try{return String(new Date(v).getFullYear());}catch(_){return '';} }
  function monthKey(v){ try{const d=new Date(v); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}catch(_){return '';} }
  function requireDb(){ const client = db(); if(!client) throw new Error('Brak połączenia Supabase w aplikacji. Odśwież panel.'); return client; }
  async function requireSqlColumnError(error){
    const msg = String(error?.message || error || '');
    if(/settlement_component|transaction_status|transaction_source|attachment_|deleted_at|is_deleted|updated_at|column/i.test(msg)){
      throw new Error('Brakuje aktualnego SQL wdrożeniowego PureInvest OS w Supabase. Uruchom wymagane migracje i odśwież aplikację. Szczegóły: '+msg);
    }
    throw error;
  }
  function componentForDb(value, table){
    const v = String(value || '').trim();
    if(v === 'owner') return 'owner_rent';
    if(!v) return table === 'payments' ? 'owner_rent' : 'other';
    return v;
  }
  function txTypeLabel(table){ return table === 'payments' ? 'Wpływ' : 'Koszt'; }

  function txToast(message, type){
    try{ if(typeof window.piToastV770 === 'function') return window.piToastV770(message, type || 'info'); }catch(_){ }
    try{ if(typeof window.piToastV760 === 'function') return window.piToastV760(message, type || 'info'); }catch(_){ }
    console.log(message);
  }
  async function txConfirm(message, opts){
    try{ if(typeof window.piConfirmModalV773 === 'function') return await window.piConfirmModalV773(message, opts || {}); }catch(_){ }
    try{ if(typeof window.piConfirmModalV772 === 'function') return await window.piConfirmModalV772(message, opts || {}); }catch(_){ }
    return typeof window.piConfirmV770 === 'function' ? await window.piConfirmV770(message, opts || {}) : false;
  }
  function txSummaryText(tx){
    const property = propName(tx?.property_id);
    const label = tx?.table === 'payments' ? 'Wpływ' : 'Koszt';
    return `${label} · ${property} · ${money(tx?.amount || 0)}`;
  }

  async function piActivityHeaders(){
    const headers = {'Content-Type':'application/json'};
    try{ const res = await db()?.auth?.getSession?.(); const token = res?.data?.session?.access_token; if(token) headers.Authorization = 'Bearer ' + token; }catch(_){ }
    try{ const owner = JSON.parse(sessionStorage.getItem('piOwnerSessionV570') || 'null'); if(owner?.ownerToken) headers['x-pi-session-token'] = owner.ownerToken; }catch(_){ }
    try{ const tenant = JSON.parse(sessionStorage.getItem('piTenantSessionV570') || 'null'); if(tenant?.tenantToken) headers['x-pi-session-token'] = tenant.tenantToken; }catch(_){ }
    return headers;
  }
  async function piLogActivity(action, entityType, entityId, beforeData, afterData){
    try{
      await fetch('/.netlify/functions/activity-log', {
        method:'POST', headers: await piActivityHeaders(),
        body: JSON.stringify({action, entity_type:entityType, entity_id:String(entityId||''), property_id: afterData?.property_id || beforeData?.property_id || null, before_data: beforeData || null, after_data: afterData || null})
      });
    }catch(e){ console.warn('activity log skipped', e?.message || e); }
  }
  window.piLogActivity = piLogActivity;

  function ownerSession(){ try{return JSON.parse(sessionStorage.getItem('piOwnerSessionV570') || 'null');}catch(_){return null;} }
  function isOwnerPinSession(){ const o=ownerSession(); return !!(o && o.ownerToken); }
  async function ownerData(kind, payload){
    const r = await fetch('/.netlify/functions/owner-data', {
      method:'POST',
      headers: await piActivityHeaders(),
      body: JSON.stringify(Object.assign({kind}, payload || {}))
    });
    const data = await r.json().catch(()=>null);
    if(!r.ok || !data || !data.ok) throw new Error((data && (data.message || data.details)) || 'Nie udało się pobrać danych ownera.');
    return data;
  }

  function ensureTransactionUx(){
    ensureTxModal();
    ensureActivityPanel();
    ensureTopTransactionNavigation();
    ensureRentBreakdown();
    bindPropertyFinanceActionDelegation();
  }

  function bindPropertyFinanceActionDelegation(){
    if(window.__PI_V7510_PROPERTY_FINANCE_ACTIONS__) return;
    window.__PI_V7510_PROPERTY_FINANCE_ACTIONS__ = true;
    document.addEventListener('click', function(ev){
      const editBtn = ev.target.closest?.('[data-pi-tx-edit]');
      const delBtn = ev.target.closest?.('[data-pi-tx-delete]');
      const btn = editBtn || delBtn;
      if(!btn) return;
      const scope = document.getElementById('piTransactionsPropertyFinancePanel');
      if(scope && !scope.contains(btn)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const table = btn.getAttribute('data-table');
      const id = btn.getAttribute('data-id');
      if(!table || !id) return;
      if(editBtn) window.piOpenTransactionEditModal(table, id);
      else window.piPropertyFinanceDelete(table, id);
    }, true);
  }

  function ensureTxModal(){
    let m=$('piTransactionEditModal');
    if(!m){ m=document.createElement('div'); m.id='piTransactionEditModal'; document.body.appendChild(m); }
    m.className='pi-tx-edit-overlay hidden';
    m.innerHTML = `
      <div class="pi-tx-edit-backdrop" data-pi-tx-close="1"></div>
      <aside class="pi-tx-edit-drawer" role="dialog" aria-modal="true" aria-labelledby="piTxEditTitle">
        <header class="pi-tx-edit-head">
          <div class="pi-tx-edit-titlebox">
            <span class="pi-tx-edit-eyebrow">Transakcja</span>
            <h3 id="piTxEditTitle">Edytuj transakcję</h3>
            <p id="piTxEditSummary">Zmień kwotę, datę, kategorię, mieszkanie albo składnik rozliczenia.</p>
          </div>
          <button type="button" class="pi-tx-edit-close" aria-label="Zamknij" data-pi-tx-close="1">×</button>
        </header>

        <section class="pi-tx-edit-snapshot" aria-label="Podsumowanie transakcji">
          <div><span>Typ</span><b id="piTxEditSummaryType">—</b></div>
          <div><span>Mieszkanie</span><b id="piTxEditSummaryProperty">—</b></div>
          <div><span>Kwota</span><b id="piTxEditSummaryAmount">—</b></div>
        </section>

        <nav class="pi-tx-edit-tabs" aria-label="Zakładki edycji transakcji">
          <button type="button" class="active" data-panel="basic">Podstawowe</button>
          <button type="button" data-panel="settlement">Rozliczenie</button>
          <button type="button" data-panel="document">Załącznik</button>
        </nav>

        <div class="pi-tx-edit-content">
          <section id="piTxEditPanelBasic" class="pi-tx-edit-panel active" data-panel="basic">
            <div class="pi-tx-edit-section-title">Dane podstawowe</div>
            <div class="pi-tx-form-grid">
              <label>Kwota<input id="piTxEditAmount" inputmode="decimal" placeholder="np. 1800,00"></label>
              <label>Data<input id="piTxEditDate" type="date"></label>
              <label>Typ<select id="piTxEditType"><option value="payments">Wpływ</option><option value="expenses">Koszt</option></select></label>
              <label>Kategoria / nazwa<input id="piTxEditName" placeholder="np. Najem, prąd, czynsz"></label>
              <label class="wide">Mieszkanie<select id="piTxEditProperty"></select></label>
              <label class="wide">Notatka<textarea id="piTxEditNote" placeholder="Krótka notatka do transakcji"></textarea></label>
            </div>
          </section>

          <section id="piTxEditPanelSettlement" class="pi-tx-edit-panel" data-panel="settlement">
            <div class="pi-tx-edit-section-title">Rozliczenie i Rent Engine</div>
            <div class="pi-tx-form-grid">
              <label class="wide">Składnik rozliczenia<select id="piTxEditComponent"><option value="owner_rent">Najem właścicielski</option><option value="community">Czynsz administracyjny</option><option value="electricity">Prąd</option><option value="gas">Gaz</option><option value="water">Woda</option><option value="media">Media / rachunki</option><option value="deposit">Kaucja</option><option value="renovation">Remont / koszt właściciela</option><option value="service">Serwis</option><option value="other">Inne</option></select></label>
              <label id="piTxEditSettlementMonthWrap" class="wide">Rozliczenie za miesiąc<input id="piTxEditSettlementMonth" type="month"><small>Może być inny niż data faktycznego wpływu. To pole decyduje, który miesiąc zostanie oznaczony jako opłacony.</small></label>
              <label>Status<select id="piTxEditStatus"><option value="approved">Zatwierdzona</option><option value="draft">Robocza</option><option value="rejected">Odrzucona</option><option value="duplicate">Duplikat</option><option value="archived">Archiwalna</option></select></label>
              <label>Źródło<select id="piTxEditSource"><option value="manual">Ręcznie</option><option value="gmail">Gmail</option><option value="ocr">OCR</option><option value="import">Import</option><option value="system">System</option></select></label>
              <div class="wide pi-tx-edit-hint">Składnik rozliczenia określa rodzaj należności. Dla wpłaty miesiąc rozliczeniowy jest niezależny od daty wpływu, dzięki czemu spóźniona wpłata może zamknąć wcześniejszy miesiąc bez fałszowania daty bankowej.</div>
            </div>
          </section>

          <section id="piTxEditPanelDocument" class="pi-tx-edit-panel" data-panel="document">
            <div class="pi-tx-edit-section-title">Załącznik i źródło dokumentu</div>
            <div class="pi-tx-form-grid">
              <label>Nazwa załącznika<input id="piTxEditAttachmentName" placeholder="np. faktura.pdf"></label>
              <label>URL załącznika<input id="piTxEditAttachmentUrl" placeholder="https://..."></label>
              <details class="wide pi-tx-technical-details">
                <summary>Dane techniczne</summary>
                <div class="pi-tx-form-grid single">
                  <label>Ścieżka pliku w Storage<input id="piTxEditAttachmentPath" placeholder="documents/.../plik.pdf"></label>
                  <label>ID transakcji<input id="piTxEditTechnicalId" disabled></label>
                  <label>Tabela<input id="piTxEditTechnicalTable" disabled></label>
                </div>
              </details>
            </div>
          </section>

          <div id="piTxEditWarning" class="pi-tx-edit-warning"></div>
        </div>

        <footer class="pi-tx-edit-actions">
          <button type="button" class="pi-tx-danger-link" onclick="piDeleteFromTransactionEditModal()">Ukryj transakcję</button>
          <div>
            <button type="button" class="pi-tx-secondary" onclick="piCloseTransactionEditModal()">Anuluj</button>
            <button type="button" class="pi-tx-primary" onclick="piSaveTransactionEditModal()">Zapisz zmiany</button>
          </div>
        </footer>
      </aside>`;
    if(!window.__PI_TX_EDIT_BINDINGS__){
      window.__PI_TX_EDIT_BINDINGS__ = true;
      document.addEventListener('click', function(ev){
        const close = ev.target.closest?.('[data-pi-tx-close]');
        if(close && $('piTransactionEditModal') && !$('piTransactionEditModal').classList.contains('hidden')) window.piCloseTransactionEditModal();
        const tab = ev.target.closest?.('#piTransactionEditModal .pi-tx-edit-tabs button');
        if(tab){ ev.preventDefault(); window.piTxEditSwitch(tab.dataset.panel); }
      });
      document.addEventListener('keydown', function(ev){
        if(ev.key === 'Escape' && $('piTransactionEditModal') && !$('piTransactionEditModal').classList.contains('hidden')) window.piCloseTransactionEditModal();
      });
      document.addEventListener('change', function(ev){
        if(ev.target?.id === 'piTxEditType') syncSettlementMonthVisibility(ev.target.value);
      });
    }
  }
  window.piTxEditSwitch = function(panel){
    document.querySelectorAll('#piTransactionEditModal .pi-tx-edit-tabs button').forEach(b=>b.classList.toggle('active', b.dataset.panel === panel));
    document.querySelectorAll('#piTransactionEditModal .pi-tx-edit-panel').forEach(p=>p.classList.toggle('active', p.dataset.panel === panel));
  };
  window.piCloseTransactionEditModal = function(){
    $('piTransactionEditModal')?.classList.add('hidden');
    document.body.classList.remove('pi-tx-edit-open');
    window.__piEditingTransaction = null;
  };
  function fillProps(selected){
    const el=$('piTxEditProperty'); if(!el) return;
    el.innerHTML = props().map(p=>`<option value="${esc(p.id)}" ${String(selected||'')===String(p.id)?'selected':''}>${esc(p.name||p.address||'Mieszkanie')}</option>`).join('');
  }
  async function getTx(table,id){
    const local = (window.__piPropertyFinanceAllRowsV741||[]).concat(window.__piPropertyFinanceLastVisible||[]).find(x=>String(x.table)===String(table)&&String(x.id)===String(id));
    if(local) return local;
    const {data,error}=await requireDb().from(table).select('*').eq('id',id).maybeSingle();
    if(error) throw error;
    if(!data) throw new Error('Nie znaleziono transakcji.');
    return Core().rowToFinance ? Core().rowToFinance(table,data) : data;
  }
  function syncSettlementMonthVisibility(table){
    const isPayment = String(table || $('piTxEditType')?.value || '') === 'payments';
    const wrap = $('piTxEditSettlementMonthWrap');
    if(wrap) wrap.style.display = isPayment ? '' : 'none';
  }
  window.piOpenTransactionEditModal = async function(table,id){
    try{
      ensureTxModal();
      const tx = await getTx(table,id);
      window.__piEditingTransaction = tx;
      fillProps(tx.property_id);
      $('piTxEditAmount').value = String(tx.amount||0).replace('.',',');
      $('piTxEditDate').value = isoDate(Period().actualDate ? Period().actualDate(tx.raw || tx) : (tx.date || tx.created_at));
      $('piTxEditType').value = table;
      $('piTxEditName').value = tx.name || '';
      $('piTxEditProperty').value = tx.property_id || '';
      $('piTxEditStatus').value = tx.transaction_status || 'approved';
      $('piTxEditSource').value = tx.transaction_source || 'manual';
      $('piTxEditComponent').value = tx.settlement_component || (table==='payments'?'owner_rent':'other');
      $('piTxEditNote').value = Period().cleanNote ? Period().cleanNote(tx.note || tx.raw?.note || '') : (tx.note || '');
      if($('piTxEditSettlementMonth')) $('piTxEditSettlementMonth').value = Period().settlementMonth ? (Period().settlementMonth(tx.raw || tx) || monthKey(tx.date || tx.created_at)) : monthKey(tx.date || tx.created_at);
      syncSettlementMonthVisibility(table);
      $('piTxEditAttachmentName').value = tx.attachment_name || '';
      $('piTxEditAttachmentUrl').value = tx.attachment_url || '';
      $('piTxEditAttachmentPath').value = tx.attachment_path || '';
      $('piTxEditTechnicalId').value = tx.id || id || '';
      $('piTxEditTechnicalTable').value = table;
      if($('piTxEditSummary')) $('piTxEditSummary').textContent = txSummaryText(tx);
      if($('piTxEditSummaryType')) $('piTxEditSummaryType').textContent = table === 'payments' ? 'Wpływ' : 'Koszt';
      if($('piTxEditSummaryProperty')) $('piTxEditSummaryProperty').textContent = propName(tx.property_id);
      if($('piTxEditSummaryAmount')) $('piTxEditSummaryAmount').textContent = money(tx.amount || 0);
      $('piTxEditWarning').textContent = '';
      window.piTxEditSwitch('basic');
      $('piTransactionEditModal').classList.remove('hidden');
      document.body.classList.add('pi-tx-edit-open');
      setTimeout(()=>{ try{ $('piTxEditAmount')?.focus(); $('piTxEditAmount')?.select(); }catch(_){} }, 80);
    }catch(e){ txToast('Nie udało się otworzyć edycji transakcji: '+(e.message||e), 'error'); }
  };
  function buildPayload(table){
    const amount = num($('piTxEditAmount')?.value);
    if(!(amount > 0)) throw new Error('Podaj kwotę większą od 0.');
    const name = String($('piTxEditName')?.value || '').trim();
    const date = $('piTxEditDate')?.value || new Date().toISOString().slice(0,10);
    const createdAt = new Date(date + 'T12:00:00').toISOString();
    const payload = {
      property_id: $('piTxEditProperty')?.value || activePid(),
      amount,
      created_at: createdAt,
      date,
      note: $('piTxEditNote')?.value || '',
      transaction_status: $('piTxEditStatus')?.value || 'approved',
      transaction_source: $('piTxEditSource')?.value || 'manual',
      settlement_component: componentForDb($('piTxEditComponent')?.value, table),
      attachment_name: $('piTxEditAttachmentName')?.value || null,
      attachment_url: $('piTxEditAttachmentUrl')?.value || null,
      attachment_path: $('piTxEditAttachmentPath')?.value || null
    };
    if(table === 'payments') {
      payload.source = name || 'Wpłata';
      payload.payment_date = date;
      const settlementMonth = $('piTxEditSettlementMonth')?.value || date.slice(0,7);
      try{ if(Period().applyToPayload) return Period().applyToPayload(payload, settlementMonth); }catch(_){ }
    }else{
      payload.category = name || 'Koszt'; payload.expense_date = date;
    }
    return payload;
  }
  async function softDeleteOnly(table,id,before){
    const {error}=await requireDb().from(table).update({is_deleted:true, deleted_at:new Date().toISOString(), deleted_note:'Ukryto w aplikacji PureInvest'}).eq('id',id);
    if(error) await requireSqlColumnError(error);
    await piLogActivity('transaction_soft_delete', table, id, before||null, {id, is_deleted:true, property_id:before?.property_id||null});
  }
  function missingColumn(error){
    const msg=String(error?.message || error || '');
    const m=msg.match(/Could not find the '([^']+)' column|column "([^"]+)"|column ([a-zA-Z0-9_]+) does not exist/i);
    return m && (m[1] || m[2] || m[3]);
  }
  async function updateWithFallback(table,id,payload){
    let body={...payload};
    for(let i=0;i<12;i++){
      const {error}=await requireDb().from(table).update(body).eq('id',id);
      if(!error) return body;
      const col=missingColumn(error);
      if(col && Object.prototype.hasOwnProperty.call(body,col)){ delete body[col]; continue; }
      await requireSqlColumnError(error);
    }
    throw new Error('Nie udało się dopasować pól transakcji do schematu Supabase.');
  }
  async function insertWithFallback(table,payload){
    let body={...payload};
    for(let i=0;i<12;i++){
      const {data,error}=await requireDb().from(table).insert([body]).select('id').single();
      if(!error) return {data,body};
      const col=missingColumn(error);
      if(col && Object.prototype.hasOwnProperty.call(body,col)){ delete body[col]; continue; }
      await requireSqlColumnError(error);
    }
    throw new Error('Nie udało się dopasować pól transakcji do schematu Supabase.');
  }
  async function saveSame(table,id,payload,before){
    const saved=await updateWithFallback(table,id,payload);
    await piLogActivity('transaction_update', table, id, before||null, saved);
  }
  async function moveTx(oldTable,id,newTable,payload,before){
    const result=await insertWithFallback(newTable,payload);
    await softDeleteOnly(oldTable,id,before);
    await piLogActivity('transaction_move', oldTable+'->'+newTable, id, before||null, Object.assign({new_id:result.data?.id},result.body));
  }
  window.piSaveTransactionEditModal = async function(){
    try{
      if(typeof piRequireManager==='function' && !piRequireManager('edycji transakcji')) return;
      const tx=window.__piEditingTransaction; if(!tx) return;
      const newTable=$('piTxEditType')?.value || tx.table;
      const payload=buildPayload(newTable);
      if(newTable === tx.table) await saveSame(tx.table,tx.id,payload,tx); else await moveTx(tx.table,tx.id,newTable,payload,tx);
      window.piCloseTransactionEditModal();
      txToast('Zapisano zmiany transakcji.', 'success');
      await afterFinanceChange();
    }catch(e){
      if($('piTxEditWarning')) $('piTxEditWarning').textContent = 'Nie udało się zapisać: ' + (e.message || e);
      txToast('Nie udało się zapisać edycji: '+(e.message||e), 'error');
    }
  };
  window.piDeleteFromTransactionEditModal = async function(){
    const tx=window.__piEditingTransaction; if(!tx) return;
    const ok = await txConfirm('Ukryć tę transakcję? Rekord zostanie zachowany w bazie jako usunięty, bez fizycznego kasowania.', {title:'Ukryć transakcję?', okText:'Ukryj'});
    if(!ok) return;
    await window.piPropertyFinanceDelete(tx.table,tx.id, true); window.piCloseTransactionEditModal();
  };
  window.piPropertyFinanceDelete = async function(table,id, skipConfirm){
    try{
      if(typeof piRequireManager==='function' && !piRequireManager('usunięcia transakcji')) return;
      const before=await getTx(table,id).catch(()=>null);
      if(!skipConfirm){
        const ok = await txConfirm('Ukryć tę transakcję? Nie zostanie skasowana fizycznie z bazy.', {title:'Ukryć transakcję?', okText:'Ukryj'});
        if(!ok) return;
      }
      await softDeleteOnly(table,id,before);
      txToast('Transakcja została ukryta.', 'success');
      await afterFinanceChange();
    }catch(e){ txToast('Nie udało się ukryć transakcji: '+(e.message||e), 'error'); }
  };
  async function afterFinanceChange(){
    try{ if(typeof refreshDashboard==='function') await refreshDashboard(); }catch(_){ }
    try{ if(typeof refreshRentEngine==='function') await refreshRentEngine(); }catch(_){ }
    try{ if(window.piRenderPropertyFinance) await window.piRenderPropertyFinance(true); }catch(_){ }
    try{ if(window.piRenderActivityLog) await window.piRenderActivityLog(); }catch(_){ }
  }
  window.editTransaction = function(table,id){ window.piOpenTransactionEditModal(table,id); };
  window.deleteTransaction = function(table,id){ window.piPropertyFinanceDelete(table,id); };
  window.piPropertyFinanceEdit = function(table,id){ window.piOpenTransactionEditModal(table,id); };

  function ensureActivityPanel(){
    const tabs = document.querySelector('#tab-transactions .pi-transactions-admin-toggles') || document.querySelector('#tab-transactions .pi-mail-actions');
    if(tabs && !$('piTransactionsActivityLogTopBtn')){
      const btn=document.createElement('button');
      btn.id='piTransactionsActivityLogTopBtn'; btn.type='button'; btn.className='pi-admin-tab-btn';
      btn.textContent='Dziennik zmian';
      btn.onclick=function(){ window.piTransactionsTogglePanel('piTransactionsActivityLogPanel', btn, 'activityLog'); };
      tabs.appendChild(btn);
    }
    const section = $('tab-transactions');
    if(section && !$('piTransactionsActivityLogPanel')){
      const panel=document.createElement('div');
      panel.id='piTransactionsActivityLogPanel';
      panel.className='pi-transactions-collapse pi-admin-subtab hidden';
      panel.innerHTML=`<div class="card"><div class="card-title">Dziennik zmian</div><div class="pi-mail-muted-box">Historia zmian transakcji i działań finansowych. Dane pochodzą z activity_log.</div><div class="pi-property-finance-subbar"><select id="piActivityPropertyFilter" onchange="piRenderActivityLog()"><option value="all">Wszystkie mieszkania</option></select><select id="piActivityLimit" onchange="piRenderActivityLog()"><option value="25">25 ostatnich</option><option value="50">50</option><option value="100">100</option></select><button type="button" class="subtle-link-btn" onclick="piRenderActivityLog()">Odśwież dziennik</button></div><div id="piActivityLogList"><div class="transactions-info">Otwórz dziennik, aby pobrać historię zmian.</div></div></div>`;
      section.appendChild(panel);
    }
  }
  async function fillActivityPropertyFilter(){
    const el=$('piActivityPropertyFilter'); if(!el) return;
    const old=el.value || 'all';
    el.innerHTML='<option value="all">Wszystkie mieszkania</option>'+props().map(p=>`<option value="${esc(p.id)}">${esc(p.name||p.address||'Mieszkanie')}</option>`).join('');
    if([...el.options].some(o=>o.value===old)) el.value=old;
  }
  function activityActionLabel(action){
    const map={transaction_update:'Edycja transakcji',transaction_move:'Przeniesienie transakcji',transaction_soft_delete:'Ukrycie transakcji'};
    return map[action] || action || 'Zdarzenie';
  }
  function valueLabel(key, val){
    if(key==='amount') return money(val);
    if(key==='property_id') return propName(val);
    if(key==='transaction_status') return statusLabels[val] || val;
    if(key==='transaction_source') return sourceLabels[val] || val;
    if(key==='settlement_component') return componentLabels[val] || val;
    if(key==='created_at') return displayDate(val);
    if(key==='settlement_month') return Period().label ? Period().label(val) : String(val||'—');
    if(key==='note') return Period().cleanNote ? Period().cleanNote(val) : String(val||'—');
    return String(val ?? '—');
  }
  function humanDiff(before, after){
    before=before||{}; after=after||{};
    const fields=[
      ['amount','kwotę'],['created_at','datę wpływu'],['settlement_month','miesiąc rozliczeniowy'],['source','nazwę/kategorię'],['category','nazwę/kategorię'],['property_id','mieszkanie'],['transaction_status','status'],['transaction_source','źródło'],['settlement_component','składnik rozliczenia'],['note','notatkę'],['attachment_name','załącznik']
    ];
    const comparable=(obj,k)=>k==='note' && Period().cleanNote ? Period().cleanNote(obj?.[k]||'') : String(obj?.[k]??'');
    const changed=fields.filter(([k])=>comparable(before,k)!==comparable(after,k) && (before[k]!==undefined || after[k]!==undefined));
    if(!changed.length) return '<p>Zapisano zmianę transakcji.</p>';
    return changed.map(([k,label])=>`<p>Zmieniono ${esc(label)}: <b>${esc(valueLabel(k,before[k]))}</b> → <b>${esc(valueLabel(k,after[k]))}</b></p>`).join('');
  }
  window.piRenderActivityLog = async function(){
    const box=$('piActivityLogList'); if(!box) return;
    try{
      await fillActivityPropertyFilter();
      box.innerHTML='<div class="transactions-info">Ładowanie dziennika zmian...</div>';
      let q=requireDb().from('activity_log').select('*').order('created_at',{ascending:false}).limit(Number($('piActivityLimit')?.value || 25));
      const pid=$('piActivityPropertyFilter')?.value || 'all';
      if(pid !== 'all') q=q.eq('property_id',pid);
      const {data,error}=await q; if(error) throw error;
      const rows=data||[];
      if(!rows.length){ box.innerHTML='<div class="transactions-info">Brak wpisów w dzienniku zmian.</div>'; return; }
      box.innerHTML=rows.map(r=>{
        const before=r.before_data||{}, after=r.after_data||{};
        const pid=after.property_id || before.property_id || r.property_id;
        return `<div class="pi-v750-log-row"><div><b>${esc(activityActionLabel(r.action))}</b><span>${esc(displayDate(r.created_at))}</span></div>${humanDiff(before,after)}<small>Mieszkanie: ${esc(propName(pid))}<br>Rekord: ${esc(r.entity_type||'')} ${esc(r.entity_id||'')}</small></div>`;
      }).join('');
    }catch(e){ box.innerHTML='<div class="transactions-info">Nie udało się pobrać dziennika zmian. Sprawdź SQL activity_log i uprawnienia. Szczegóły: '+esc(e.message||e)+'</div>'; }
  };

  const oldTransactionsToggle = window.piTransactionsTogglePanel;
  window.piTransactionsTogglePanel = function(id, btn, refreshType){
    if(typeof oldTransactionsToggle === 'function') oldTransactionsToggle(id, btn, refreshType);
    else{
      document.querySelectorAll('#tab-transactions .pi-transactions-collapse').forEach(p=>{p.classList.add('hidden');p.classList.remove('active');p.style.display='none';});
      const panel=$(id); if(panel){panel.classList.remove('hidden');panel.classList.add('active');panel.style.display='';}
      (btn?.parentElement||document).querySelectorAll?.('.pi-admin-tab-btn')?.forEach(b=>b.classList.remove('active'));
      if(btn) btn.classList.add('active');
    }
    if(id==='piTransactionsPropertyFinancePanel') window.piRenderPropertyFinance(true);
    if(id==='piTransactionsFinanceProPanel') window.renderFinancePro?.();
    if(id==='piTenantMonthlyCollapse'){
      window.piTransactionTypesRefreshV160?.();
      window.renderOwnerRentPanel?.();
    }
    if(id==='piTransactionsActivityLogPanel') window.piRenderActivityLog();
    if(id==='piTransactionsSettlementDictionaryPanel') window.piTransactionTypesRefreshV160?.();
    if(id==='piTransactionsHistoryCollapse' && typeof refreshDashboard==='function') refreshDashboard();
  };


  window.piOpenTransactionsFinancePro = function(){
    try{ window.switchTab?.('transactions', document.querySelector('.nav-item[onclick*=transactions]')); }catch(_){ }
    setTimeout(()=>{
      const btn=$('piTransactionsFinanceProTopBtn');
      if(typeof window.piTransactionsTogglePanel === 'function') window.piTransactionsTogglePanel('piTransactionsFinanceProPanel', btn, 'financePro');
      try{ window.renderFinancePro?.(); }catch(_){ }
    },160);
  };

  async function fetchRows(propertyId){
    if(isOwnerPinSession()){
      const data = await ownerData('transactions', {propertyId});
      return {payments:liveRows(data.payments||[]), expenses:liveRows(data.expenses||[])};
    }
    const [p,e]=await Promise.all([
      requireDb().from('payments').select('*').eq('property_id',propertyId).order('created_at',{ascending:false}),
      requireDb().from('expenses').select('*').eq('property_id',propertyId).order('created_at',{ascending:false})
    ]);
    if(p.error) throw p.error; if(e.error) throw e.error;
    return {payments:liveRows(p.data||[]), expenses:liveRows(e.data||[])};
  }
  function toFinanceRows(data){
    const rowToFinance = Core().rowToFinance;
    return (data.payments||[]).map(x=>rowToFinance ? rowToFinance('payments',x) : x)
      .concat((data.expenses||[]).map(x=>rowToFinance ? rowToFinance('expenses',x) : x));
  }
  function financePeriodKey(row){
    if(row?.type === 'income') return Period().normalizeMonth ? (Period().normalizeMonth(row.settlement_month) || Period().settlementMonth?.(row.raw || row) || monthKey(row.date)) : monthKey(row.date);
    return monthKey(row?.date);
  }
  function settlementBadge(row){
    if(row?.type !== 'income') return '';
    const period=financePeriodKey(row), actual=monthKey(row.date);
    if(!period) return '';
    const label=Period().label ? Period().label(period) : period;
    const cls=period!==actual ? ' pi-settlement-period-late' : '';
    return '<span class="pi-settlement-period-hint'+cls+'">Rozliczenie: '+esc(label)+'</span>';
  }
  function fillSelect(el, values, placeholder, old){
    if(!el) return;
    el.innerHTML='<option value="all">'+esc(placeholder)+'</option>'+values.map(v=>`<option value="${esc(v.value||v)}">${esc(v.label||v)}</option>`).join('');
    if([...el.options].some(o=>String(o.value)===String(old))) el.value=old;
  }
  async function hydratePropertyFinanceSelect(){
    const select=$('piPropertyFinanceSelect'); if(!select) return;
    const old=select.value || activePid();
    select.innerHTML = props().map(p=>`<option value="${esc(p.id)}" ${String(old)===String(p.id)?'selected':''}>${esc(p.name||p.address||'Mieszkanie')}</option>`).join('');
    if(!select.value && select.options.length) select.selectedIndex=0;
  }
  window.piRenderPropertyFinance = async function(){
    const box=$('piPropertyFinanceList'); if(!box) return;
    try{
      await hydratePropertyFinanceSelect();
      const pid=$('piPropertyFinanceSelect')?.value;
      if(!pid){ box.innerHTML='<div class="pi-v741-ledger-empty">Brak mieszkań do wyświetlenia.</div>'; return; }
      box.innerHTML='<div class="transactions-info">Ładowanie finansów mieszkania...</div>';
      const data=await fetchRows(pid);
      const all=toFinanceRows(data);
      window.__piPropertyFinanceAllRowsV741=all;
      const ySel=$('piPropertyFinanceYear'), mSel=$('piPropertyFinanceMonth'), tSel=$('piPropertyFinanceType'), sortSel=$('piPropertyFinanceSort'), limitSel=$('piPropertyFinanceLimit');
      const oldY=ySel?.value||'all', oldM=mSel?.value||'all';
      fillSelect(ySel,[...new Set(all.map(x=>String(financePeriodKey(x)).slice(0,4)).filter(Boolean))].sort().reverse().map(x=>({value:x,label:x})),'Wszystkie lata',oldY);
      fillSelect(mSel,[...new Set(all.map(financePeriodKey).filter(Boolean))].sort().reverse().map(x=>({value:x,label:x})),'Wszystkie miesiące',oldM);
      const year=ySel?.value||'all', month=mSel?.value||'all', type=tSel?.value||'all';
      let filtered=all.filter(x=>(year==='all'||String(financePeriodKey(x)).slice(0,4)===year) && (month==='all'||financePeriodKey(x)===month) && (type==='all'||x.type===type));
      const income=filtered.filter(x=>x.type==='income').reduce((a,b)=>a+num(b.amount),0);
      const cost=filtered.filter(x=>x.type==='expense').reduce((a,b)=>a+num(b.amount),0);
      const set=(id,val)=>{const el=$(id); if(el) el.innerText=val;};
      set('piPropertyFinanceIncome',money(income)); set('piPropertyFinanceCost',money(cost)); set('piPropertyFinanceBalance',money(income-cost)); set('piPropertyFinanceCount',String(filtered.length));
      const sorters={newest:(a,b)=>new Date(b.date)-new Date(a.date),oldest:(a,b)=>new Date(a.date)-new Date(b.date),amount_desc:(a,b)=>b.amount-a.amount,amount_asc:(a,b)=>a.amount-b.amount};
      filtered.sort(sorters[sortSel?.value||'newest']||sorters.newest);
      const limit=limitSel?.value||'25'; const visible=limit==='all'?filtered:filtered.slice(0,Number(limit||25));
      const model=Core().propertyFinanceModel ? Core().propertyFinanceModel(propById(pid),data.payments,data.expenses) : {};
      const summary='<div class="pi-clean-note"><b>Model finansowy:</b> Podatek i ROI prognozowane liczone są z najmu właścicielskiego z karty najemcy: <b>'+money(model.baseRent||0)+'</b>. Media i opłaty administracyjne są neutralne dla ROI. Podatek prognozowany/mc: <b>'+money(model.monthlyTax||0)+'</b>. ROI prognozowane: <b>'+(model.roi==null?'brak ceny zakupu':model.roi.toFixed(1)+'%')+'</b>.</div>';
      const tools='<div class="pi-v741-ledger-tools"><button type="button" class="subtle-link-btn" onclick="piExportPropertyFinanceCsv()">Eksport CSV</button><button type="button" class="subtle-link-btn" onclick="piExportPropertyFinancePdf()">Eksport PDF</button><button type="button" class="subtle-link-btn" onclick="piRenderPropertyFinance(true)">Odśwież</button></div>';
      const row=x=>'<div class="pi-property-finance-row" data-table="'+esc(x.table)+'" data-id="'+esc(x.id)+'"><div><div class="pi-property-finance-title">'+esc(x.name)+' <span class="pi-v741-pill">'+esc(sourceLabels[x.transaction_source]||x.transaction_source||'Ręcznie')+'</span> <span class="pi-v741-pill">'+esc(componentLabels[x.settlement_component]||x.settlement_component||'Inne')+'</span> <span class="pi-v741-pill">'+esc(statusLabels[x.transaction_status]||x.transaction_status||'Zatwierdzona')+'</span></div><div class="pi-property-finance-meta">Data wpływu: '+esc(displayDate(x.date))+' • '+(x.type==='income'?'Wpływ':'Koszt')+settlementBadge(x)+(x.note?' • '+esc(x.note):'')+'</div>'+(safeUrl(x.attachment_url)?'<a class="attachment-link" href="'+esc(safeUrl(x.attachment_url))+'" target="_blank" rel="noopener noreferrer">📎 '+esc(x.attachment_name||'Załącznik')+'</a>':'')+'<div class="pi-property-finance-actions"><button type="button" class="small-btn" data-pi-tx-edit="1" data-table="'+esc(x.table)+'" data-id="'+esc(x.id)+'">Edytuj</button><button type="button" class="small-btn danger" data-pi-tx-delete="1" data-table="'+esc(x.table)+'" data-id="'+esc(x.id)+'">Usuń</button></div></div><div class="pi-property-finance-amount '+(x.type==='income'?'income':'expense')+'">'+(x.type==='income'?'+':'-')+money(x.amount)+'</div></div>';
      box.innerHTML=summary+tools+(visible.length?visible.map(row).join(''):'<div class="pi-v741-ledger-empty">Brak transakcji dla wybranych filtrów.</div>');
      const info=$('piPropertyFinanceInfo'); if(info) info.innerHTML='Mieszkanie: <b>'+esc($('piPropertyFinanceSelect')?.selectedOptions?.[0]?.textContent||'')+'</b>. Wyświetlono '+visible.length+' z '+filtered.length+' pasujących pozycji.';
      window.__piPropertyFinanceLastVisible=visible;
    }catch(e){ console.error('Finance render error',e); box.innerHTML='<div class="transactions-info">Nie udało się załadować finansów mieszkania: '+esc(e.message||e)+'</div>'; }
  };

  function ensureRentBreakdown(){
    const box=document.querySelector('#rentEngineCard .rent-strip-breakdown');
    if(!box) return;
    const currentMonth = new Date().toISOString().slice(0,7);
    if(box.dataset.v752 !== '1'){
      box.dataset.v752='1';
      box.innerHTML=`<div class="pi-v751-rent-period"><label>Rozliczenie za</label><input id="piRentEngineMonthSelect" type="month" value="${currentMonth}" onchange="refreshRentEngine()"></div><div class="pi-v750-rent-breakdown" id="piRentSettlementBreakdown">
        <div class="pi-v750-rent-row pi-v750-rent-head"><span>Składnik</span><span>Należne</span><span>Wpłacone</span><span>Brakuje</span></div>
        ${components.map(k=>`<div class="pi-v750-rent-row" data-key="${k}"><span>${esc(componentLabels[k]||k)}</span><b id="rentDue_${k}">0 zł</b><b id="rentPaid_${k}">0 zł</b><b id="rentMissing_${k}">0 zł</b></div>`).join('')}
      </div><div id="piMonthlySettlementPreview" class="pi-v752-settlement-preview"></div>`;
    }
  }
  function selectedRentMonthRange(){
    const input = $('piRentEngineMonthSelect');
    const raw = input?.value || new Date().toISOString().slice(0,7);
    const [y,m] = String(raw).split('-').map(Number);
    const start = new Date(y || new Date().getFullYear(), (m || (new Date().getMonth()+1))-1, 1, 0,0,0);
    const end = new Date(start.getFullYear(), start.getMonth()+1, 1, 0,0,0);
    return {label:start.toLocaleDateString('pl-PL',{month:'long',year:'numeric'}), startISO:start.toISOString(), endISO:end.toISOString(), raw};
  }
  async function currentMonthRows(table, propertyId){
    const range = selectedRentMonthRange();
    const broad = Period().queryRange ? Period().queryRange(range.raw, {monthsBack:36}) : {startISO:range.startISO,endISO:range.endISO};
    const start = table === 'payments' ? broad.startISO : range.startISO;
    const end = table === 'payments' ? broad.endISO : range.endISO;
    let rows=[];
    if(isOwnerPinSession()){
      const data = await ownerData('transactions', {propertyId, start, end});
      rows=liveRows((table === 'payments' ? data.payments : data.expenses) || []);
    }else{
      const {data,error}=await requireDb().from(table).select('*').eq('property_id',propertyId).gte('created_at',start).lt('created_at',end);
      if(error) throw error; rows=liveRows(data||[]);
    }
    return rows.filter(row => table === 'payments'
      ? ((Period().settlementMonth ? Period().settlementMonth(row) : monthKey(row.payment_date || row.created_at)) === range.raw)
      : monthKey(row.expense_date || row.date || row.created_at) === range.raw);
  }
  function renderMonthlySettlementPreview(range, table, property){
    const box=$('piMonthlySettlementPreview'); if(!box) return;
    const status = table.totals.missing <= 0 ? 'Rozliczone' : (table.totals.paid > table.totals.due ? 'Nadpłata' : 'Do dopłaty');
    const rows=table.rows.filter(r=>r.due>0 || r.paid>0 || r.missing>0).map(r=>`<div><span>${esc(r.label)}</span><b>${money(r.due)}</b><b>${money(r.paid)}</b><b>${money(r.missing)}</b></div>`).join('');
    box.innerHTML = `<div class="pi-clean-note"><b>Podgląd zamknięcia miesiąca — ${esc(range.label)}</b><br>Mieszkanie: <b>${esc(property?.name||property?.address||'')}</b>. Status: <b>${esc(status)}</b>. Ten podgląd nie zapisuje nic w bazie — służy do szybkiego sprawdzenia rozliczenia przed wysłaniem/eksportem.</div><div class="pi-v752-month-close"><div class="head"><span>Składnik</span><b>Należne</b><b>Wpłacone</b><b>Brakuje</b></div>${rows || '<div><span>Brak składników do rozliczenia.</span><b>0 zł</b><b>0 zł</b><b>0 zł</b></div>'}<div class="sum"><span>Razem</span><b>${money(table.totals.due)}</b><b>${money(table.totals.paid)}</b><b>${money(table.totals.missing)}</b></div></div>`;
  }
  window.refreshRentEngine = async function(){
    const property = window.activePropertyData || (typeof activePropertyData !== 'undefined' ? activePropertyData : null);
    if(!property) return;
    if(!$('rentEngineCard')) return;
    ensureRentBreakdown();
    const range=selectedRentMonthRange();
    const [paymentsRows, expensesRows] = await Promise.all([currentMonthRows('payments', property.id), currentMonthRows('expenses', property.id)]);
    const table = Core().settlementTable ? Core().settlementTable(property, paymentsRows, expensesRows, range.raw) : {rows:[],totals:{due:0,paid:0,missing:0}};
    const set=(id,val)=>{const el=$(id); if(el) el.innerText=val;};
    table.rows.forEach(r=>{ set('rentDue_'+r.key, money(r.due)); set('rentPaid_'+r.key, money(r.paid)); set('rentMissing_'+r.key, money(r.missing)); });
    const expected=table.totals.due, paid=table.totals.paid, missing=Math.max(0, expected-paid);
    window.RentEngine = Object.assign(window.RentEngine||{}, {expected, paid, missing, percentage: expected>0?Math.min(100,Math.round((paid/expected)*100)):0, dueComponents:table.due, paidComponents:table.paid});
    set('rentExpectedTotal', money(expected)); set('rentPaidTotal', money(paid)); set('rentMissingTotal', money(missing));
    const progress=$('rentProgressBar'); if(progress){ const pct=window.RentEngine.percentage; progress.style.width=pct+'%'; progress.style.background = pct>=100?'linear-gradient(90deg,#16a34a,#22c55e)':(pct>=70?'linear-gradient(90deg,#f59e0b,#fbbf24)':'linear-gradient(90deg,#dc2626,#ef4444)'); }
    const alert=$('rentAlertBox'), pill=$('rentStatusPill');
    if(alert){ alert.classList.remove('ok'); if(missing<=0){ alert.classList.add('ok'); alert.innerHTML='✅ Wszystkie należności za '+esc(range.label)+' zostały opłacone.'; } else { const parts=table.rows.filter(r=>r.missing>0.009).map(r=>r.label+': '+money(r.missing)); alert.innerHTML='⚠️ Najemca ma zaległość: <b>'+money(missing)+'</b><br>Wpłacono '+window.RentEngine.percentage+'% należności za '+esc(range.label)+'.'+(parts.length?'<br><small>Brakuje: '+parts.join(' • ')+'</small>':''); } }
    if(pill){ pill.classList.remove('rent-ok','rent-warn','rent-bad'); if(expected<=0){ pill.classList.add('rent-warn'); pill.innerText='Brak danych'; } else if(missing<=0){ pill.classList.add('rent-ok'); pill.innerText='Opłacone'; } else if(window.RentEngine.percentage>=70){ pill.classList.add('rent-warn'); pill.innerText='Częściowo'; } else { pill.classList.add('rent-bad'); pill.innerText='Zaległość'; } }
    renderMonthlySettlementPreview(range, table, property);
  };

  function ensureTopTransactionNavigation(){
    const tabs=document.querySelector('#tab-transactions .pi-transactions-admin-toggles');
    const root=$('tab-transactions');
    if(!tabs || !root) return;
    const add=(id,label,panelId,refresh)=>{
      let btn=$(id);
      if(!btn){
        btn=document.createElement('button'); btn.type='button'; btn.id=id; btn.className='pi-admin-tab-btn'; btn.textContent=label;
        btn.onclick=function(){ window.piTransactionsTogglePanel(panelId, btn, refresh); };
        tabs.appendChild(btn);
      }
      return btn;
    };
    const financePro=add('piTransactionsFinanceProTopBtn','Finanse PRO','piTransactionsFinanceProPanel','financePro');
    const mailBtn=Array.from(tabs.querySelectorAll('.pi-admin-tab-btn')).find(b=>(b.textContent||'').trim()==='Import kosztów z poczty');
    const propertyFinanceBtn=Array.from(tabs.querySelectorAll('.pi-admin-tab-btn')).find(b=>(b.textContent||'').trim()==='Finanse mieszkania');
    const fixed=add('piTransactionsFixedSettlementsTopBtn','Stałe rozliczenia','piTenantMonthlyCollapse','fixedSettlements');
    if(financePro && financePro.parentElement===tabs) tabs.insertBefore(financePro, tabs.firstElementChild);
    if(mailBtn && financePro && mailBtn.previousElementSibling!==financePro) tabs.insertBefore(mailBtn, financePro.nextSibling);
    if(propertyFinanceBtn && mailBtn && propertyFinanceBtn.previousElementSibling!==mailBtn) tabs.insertBefore(propertyFinanceBtn, mailBtn.nextSibling);
    if(fixed && propertyFinanceBtn && fixed.previousElementSibling!==propertyFinanceBtn) tabs.insertBefore(fixed, propertyFinanceBtn.nextSibling);
    const financeProPanel=$('piTransactionsFinanceProPanel');
    if(financeProPanel){ financeProPanel.classList.add('pi-transactions-collapse','pi-admin-subtab'); if(financeProPanel.parentElement !== root) root.appendChild(financeProPanel); }
    const fixedPanel=$('piTenantMonthlyCollapse');
    if(fixedPanel){
      fixedPanel.classList.remove('active');
      fixedPanel.classList.add('pi-transactions-collapse','pi-admin-subtab','hidden');
      if(fixedPanel.parentElement !== root){
        const mail=$('piTransactionsMailPanel');
        root.insertBefore(fixedPanel, mail || root.firstChild);
      }
    }
    const history=$('piTransactionsHistoryCollapse');
    if(history){ history.classList.remove('pi-mail-collapse'); history.classList.add('pi-transactions-collapse','pi-admin-subtab','hidden'); if(history.parentElement !== root) root.appendChild(history); }
    add('piTransactionsActivityLogTopBtn','Dziennik zmian','piTransactionsActivityLogPanel','activityLog');
    add('piTransactionsHistoryTopBtn','Pełna historia','piTransactionsHistoryCollapse','history');
  }

  function downloadTextFile(filename, content, mime){
    const blob = new Blob([content], {type: mime || 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 250);
  }
  window.piExportPropertyFinanceCsv = function(){
    const rows = window.__piPropertyFinanceLastVisible || window.__piPropertyFinanceAllRowsV741 || [];
    if(!rows.length){ alert('Brak danych do eksportu CSV.'); return; }
    const header = ['data_wplywu','miesiac_rozliczeniowy','typ','nazwa','kwota','status','zrodlo','skladnik','notatka'];
    const csv = [header.join(';')].concat(rows.map(x => [
      displayDate(x.date),
      x.type === 'income' ? (Period().label ? Period().label(financePeriodKey(x)) : financePeriodKey(x)) : '',
      x.type === 'income' ? 'Wplyw' : 'Koszt',
      x.name || '',
      String(num(x.amount)).replace('.',','),
      statusLabels[x.transaction_status] || x.transaction_status || '',
      sourceLabels[x.transaction_source] || x.transaction_source || '',
      componentLabels[x.settlement_component] || x.settlement_component || '',
      x.note || ''
    ].map(v => '"'+String(v ?? '').replace(/"/g,'""')+'"').join(';'))).join('\n');
    const pid = $('piPropertyFinanceSelect')?.value || 'mieszkanie';
    downloadTextFile('pureinvest_finanse_'+pid+'.csv', '\ufeff'+csv, 'text/csv;charset=utf-8');
  };
  window.piExportPropertyFinancePdf = function(){
    const rows = window.__piPropertyFinanceLastVisible || window.__piPropertyFinanceAllRowsV741 || [];
    if(!rows.length){ alert('Brak danych do eksportu PDF.'); return; }
    const title = 'PureInvest — Finanse mieszkania';
    const htmlRows = rows.map(x => `<tr><td>${esc(displayDate(x.date))}</td><td>${esc(x.type === 'income' ? (Period().label ? Period().label(financePeriodKey(x)) : financePeriodKey(x)) : '—')}</td><td>${esc(x.type === 'income' ? 'Wpływ' : 'Koszt')}</td><td>${esc(x.name||'')}</td><td style="text-align:right">${esc(money(x.amount))}</td><td>${esc(x.note||'')}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:8px;font-size:12px}th{text-align:left;background:#f5f5f5}</style></head><body><h2>${title}</h2><p>Wygenerowano: ${esc(new Date().toLocaleString('pl-PL'))}</p><table><thead><tr><th>Data wpływu</th><th>Miesiąc rozliczeniowy</th><th>Typ</th><th>Nazwa</th><th>Kwota</th><th>Notatka</th></tr></thead><tbody>${htmlRows}</tbody></table><script>window.print()</script></body></html>`;
    const w = window.open('', '_blank');
    if(!w){ alert('Przeglądarka zablokowała okno eksportu PDF. Zezwól na wyskakujące okna.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  window.PureInvestTransactions = {
    refreshRentEngine: window.refreshRentEngine,
    renderPropertyFinance: window.piRenderPropertyFinance,
    openEditModal: window.piOpenTransactionEditModal,
    renderActivityLog: window.piRenderActivityLog
  };
  document.addEventListener('DOMContentLoaded',()=>{
    ensureTransactionUx();
    setTimeout(()=>{ try{ ensureTransactionUx(); }catch(_){} }, 900);
    setTimeout(()=>{
      try{
        const tab=document.getElementById('tab-transactions');
        if(tab && tab.classList.contains('active')){
          const btn=document.getElementById('piTransactionsFinanceProTopBtn');
          window.piTransactionsTogglePanel?.('piTransactionsFinanceProPanel', btn, 'financePro');
        }
      }catch(_){}
    }, 1050);
  });
})();
