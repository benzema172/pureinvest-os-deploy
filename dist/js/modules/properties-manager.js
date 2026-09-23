(function(){
  if(window.__PI_PROPERTIES_MANAGER__) return;
  window.__PI_PROPERTIES_MANAGER__ = true;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, mark => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[mark]));
  const dbClient = () => window.db || window.piDb || (typeof db !== 'undefined' ? db : null);
  const toNumber = value => {
    if(value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
  };
  const text = id => ($(id)?.value || '').trim();
  const nullableText = id => text(id) || null;
  const dateValue = id => text(id) || null;
  const money = value => Number(value || 0).toLocaleString('pl-PL', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' zł';
  const settlementItemsFor = property => {
    try{
      if(typeof window.piAutoMigrateLegacySettlement === 'function') window.piAutoMigrateLegacySettlement(property);
      if(typeof window.piGetEffectiveSettlementItems === 'function') return window.piGetEffectiveSettlementItems(property) || [];
      if(window.piSettlementDictionary?.effectiveMonthlyItems) return window.piSettlementDictionary.effectiveMonthlyItems(property) || [];
    }catch(_){ }
    return [];
  };
  const settlementTotalsFor = property => {
    const items = settlementItemsFor(property).filter(x => x && x.active !== false && x.recurring === 'monthly' && x.tenant_due !== false && x.payer !== 'owner');
    if(items.length){
      return items.reduce((out,item)=>{
        const amount = Number(String(item.default_amount || 0).replace(',', '.')) || 0;
        if(item.kind === 'income' && /^(owner|owner_rent)$/i.test(String(item.component || ''))) out.owner += amount;
        else out.fees += amount;
        return out;
      }, {owner:0, fees:0, source:'settlement'});
    }
    const owner = Number(property?.owner_rent || property?.owner_monthly_rent || property?.rent || 0) || 0;
    const fees = (Number(property?.community_rent || 0) || 0) + (Number(property?.electricity_expected || 0) || 0) + (Number(property?.water_expected || 0) || 0) + (Number(property?.gas_expected || 0) || 0);
    const fallbackOwner = owner || ((fees <= 0.009) ? (Number(property?.rent_amount || property?.monthly_rent || 0) || 0) : 0);
    return {owner:fallbackOwner, fees, source:'legacy'};
  };

  let selectedPropertyId = null;
  let lastProperties = [];

  function toast(message, type){
    if(typeof window.piToastV770 === 'function') return window.piToastV770(message, type || 'info');
    if(typeof window.piToastV760 === 'function') return window.piToastV760(message, type || 'info');
    console.log(message);
  }

  function roleName(){
    try{ return String(typeof piRole === 'function' ? piRole() : (document.body.dataset.piRole || '')).toLowerCase(); }
    catch(_){ return ''; }
  }
  function canManage(){ return roleName() === 'admin' || roleName() === 'super_admin'; }

  function getActivePropertyId(){
    try{ if(typeof activeProperty !== 'undefined' && activeProperty) return String(activeProperty); }catch(_){ }
    return window.activeProperty ? String(window.activeProperty?.id || window.activeProperty) : '';
  }

  function setActivePropertyCache(property){
    if(!property) return;
    try{ activeProperty = property.id; activePropertyData = property; }catch(_){ }
    window.activeProperty = property.id;
    window.activePropertyData = property;
    if($('dashboardTitle')) $('dashboardTitle').textContent=property.name || property.address || 'Mieszkanie';
  }

  function propertyStatus(property){
    const status = String(property?.status || property?.property_status || '').toLowerCase();
    if(property?.is_archived || property?.archived_at || status === 'archived') return {key:'archived', label:'Archiwalne'};
    if(property?.tenant_name) return {key:'rented', label:'Wynajęte'};
    return {key:'vacant', label:'Wolne'};
  }

  function ensureLayout(){
    const tab = $('tab-properties');
    if(!tab) return false;
    if($('piPropertiesManager')) return true;
    tab.innerHTML = `
      <div id="piPropertiesManager" class="pi-properties-manager">
        <div class="context-header pi-properties-header">
          <div class="pi-properties-intro">
            <h2>Nieruchomości</h2>
            <p>Zarządzaj mieszkaniami, najemcami, opłatami, metrażem, dostępami i statusem portfela.</p>
          </div>
          <div class="pi-properties-actions">
            <button type="button" class="pi-primary-btn" data-pi-prop-action="create">+ Dodaj mieszkanie</button>
            <button type="button" class="subtle-link-btn" data-pi-prop-action="refresh">Odśwież dane</button>
            <button type="button" class="subtle-link-btn" data-pi-prop-action="export">Eksport listy</button>
          </div>
        </div>

        <div class="pi-properties-layout">
          <div class="card pi-properties-list-card">
            <div class="card-title">Lista nieruchomości</div>
            <div id="propertiesList"></div>
          </div>
          <div class="card pi-property-details-card">
            <div class="card-title">Szczegóły mieszkania</div>
            <div id="piPropertyDetails">Wybierz mieszkanie z listy, żeby zobaczyć szczegóły.</div>
          </div>
        </div>
      </div>`;
    return true;
  }

  function ensureDialog(){
    if($('piPropertyDialog')) return;
    const dialog = document.createElement('div');
    dialog.id = 'piPropertyDialog';
    dialog.className = 'pi-modal-overlay pi-property-dialog-overlay hidden';
    dialog.innerHTML = `
      <div class="pi-modal pi-property-modal">
        <div class="pi-modal-head">
          <div><h3 id="piPropertyDialogTitle">Mieszkanie</h3><p id="piPropertyDialogHint">Zmieniaj dane bez opuszczania listy nieruchomości.</p></div>
          <button type="button" class="pi-modal-close" data-pi-prop-action="closeForm">×</button>
        </div>
        <form id="piPropertyForm">
          <input type="hidden" id="piPropertyFormId">
          <div class="pi-form-section"><h4>Dane podstawowe</h4><div class="pi-form-grid">
            <label>Nazwa mieszkania<input id="piPropName" required placeholder="np. Gdańska 95/100"></label>
            <label>Status<select id="piPropStatus"><option value="active">Aktywne</option><option value="vacant">Puste / bez najemcy</option><option value="archived">Archiwalne</option></select></label>
            <label>Adres<input id="piPropAddress" placeholder="Ulica, numer"></label>
            <label>Miasto<input id="piPropCity" placeholder="Miasto"></label>
            <label>Kod pocztowy<input id="piPropPostal" placeholder="00-000"></label>
            <label>Metraż m²<input id="piPropArea" type="number" min="0" step="0.01" placeholder="np. 47"></label>
          </div></div>

          <div class="pi-form-section"><h4>Zakup i rentowność</h4><div class="pi-form-grid">
            <label>Data zakupu<input id="piPropPurchaseDate" type="date"></label>
            <label>Cena zakupu<input id="piPropPurchasePrice" inputmode="decimal" placeholder="np. 320000"></label>
            <label>Kapitał własny / wkład<input id="piPropEquity" inputmode="decimal" placeholder="opcjonalnie"></label>
          </div></div>

          <div class="pi-form-section"><h4>Najemca i termin najmu</h4><div class="pi-form-grid">
            <label>Najemca<input id="piPropTenantName" placeholder="Imię i nazwisko"></label>
            <label>Telefon najemcy<input id="piPropTenantPhone" inputmode="tel"></label>
            <label>E-mail najemcy<input id="piPropTenantEmail" type="email"></label>
            <label>Start najmu<input id="piPropLeaseStart" type="date"></label>
            <label>Dzień płatności<input id="piPropPaymentDay" type="number" min="1" max="31" placeholder="np. 10"></label>
          </div><p class="pi-form-note">Kwoty najmu, czynszu, mediów, śmieci i innych stałych opłat ustawiasz w sekcji Finanse → Stałe rozliczenia. Dzięki temu opłaty nie dublują się w kilku miejscach.</p></div>

          <div class="pi-form-section"><h4>Dane do płatności</h4><div class="pi-form-grid">
            <label>Numer konta<input id="piPropPaymentAccount" placeholder="PL..."></label>
            <label>Odbiorca przelewu<input id="piPropPaymentOwner" placeholder="np. Wiktor Purczyński"></label>
            <label>Tytuł / etykieta przelewu<input id="piPropPaymentLabel" placeholder="np. Najem - Gdańska"></label>
            <label>Notatka dla najemcy<input id="piPropPaymentNote" placeholder="opcjonalnie"></label>
          </div></div>


          <div class="pi-modal-actions">
            <button type="button" class="subtle-link-btn" data-pi-prop-action="closeForm">Anuluj</button>
            <button type="submit" class="pi-primary-btn">Zapisz mieszkanie</button>
          </div>
          <div id="piPropertyFormStatus" class="pi-form-status"></div>
        </form>
      </div>`;
    document.body.appendChild(dialog);
    $('piPropertyForm')?.addEventListener('submit', event => { event.preventDefault(); savePropertyForm(); });
  }

  function setFormStatus(message, type){
    const box = $('piPropertyFormStatus');
    if(!box) return;
    box.className = 'pi-form-status ' + (type || '');
    box.textContent = message || '';
  }

  function applyAutoRentAmount(){
    const target = $('piPropRentAmount');
    if(!target || String(target.value || '').trim()) return;
    const sum = ['piPropOwnerRent','piPropCommunityRent','piPropElectricity','piPropWater','piPropGas'].reduce((total, id) => total + (toNumber($(id)?.value) || 0), 0);
    if(sum > 0) target.value = String(sum.toFixed(2));
  }

  function fillForm(property){
    const p = property || {};
    const set = (id, value) => { const node = $(id); if(node) node.value = value ?? ''; };
    const status = propertyStatus(p).key === 'archived' ? 'archived' : (p.status || p.property_status || (p.tenant_name ? 'active' : 'vacant'));
    set('piPropertyFormId', p.id || '');
    set('piPropName', p.name || '');
    set('piPropStatus', status);
    set('piPropAddress', p.address || '');
    set('piPropCity', p.city || '');
    set('piPropPostal', p.postal_code || '');
    set('piPropArea', p.area_m2 || '');
    set('piPropPurchaseDate', p.purchase_date || '');
    set('piPropPurchasePrice', p.purchase_price || '');
    set('piPropEquity', p.equity_invested || '');
    set('piPropTenantName', p.tenant_name || '');
    set('piPropTenantPhone', p.tenant_phone || '');
    set('piPropTenantEmail', p.tenant_email || '');
    set('piPropLeaseStart', p.lease_start || '');
    set('piPropPaymentDay', p.payment_day || p.rent_due_day || '');
    set('piPropOwnerRent', p.owner_rent || p.monthly_rent || '');
    set('piPropCommunityRent', p.community_rent || '');
    set('piPropElectricity', p.electricity_expected || '');
    set('piPropWater', p.water_expected || '');
    set('piPropGas', p.gas_expected || '');
    set('piPropDeposit', p.deposit_amount || '');
    set('piPropRentAmount', p.rent_amount || p.monthly_rent || '');
    set('piPropPaymentAccount', p.payment_account || p.payment_account_number || '');
    set('piPropPaymentOwner', p.payment_account_owner || '');
    set('piPropPaymentLabel', p.payment_account_label || p.payment_note || '');
    set('piPropPaymentNote', p.payment_note || '');
  }

  function formPayload(){
    const day = toNumber($('piPropPaymentDay')?.value) || null;
    const status = text('piPropStatus') || 'active';
    const payload = {
      name: nullableText('piPropName'),
      status,
      property_status: status,
      is_archived: status === 'archived',
      archived_at: status === 'archived' ? new Date().toISOString() : null,
      address: nullableText('piPropAddress'),
      city: nullableText('piPropCity'),
      postal_code: nullableText('piPropPostal'),
      area_m2: toNumber($('piPropArea')?.value),
      purchase_date: dateValue('piPropPurchaseDate'),
      purchase_price: toNumber($('piPropPurchasePrice')?.value),
      equity_invested: toNumber($('piPropEquity')?.value),
      tenant_name: nullableText('piPropTenantName'),
      tenant_phone: nullableText('piPropTenantPhone'),
      tenant_email: nullableText('piPropTenantEmail'),
      lease_start: dateValue('piPropLeaseStart'),
      payment_day: day,
      rent_due_day: day,
      payment_account: nullableText('piPropPaymentAccount'),
      payment_account_number: nullableText('piPropPaymentAccount'),
      payment_account_owner: nullableText('piPropPaymentOwner'),
      payment_account_label: nullableText('piPropPaymentLabel'),
      payment_note: nullableText('piPropPaymentNote')
    };
    Object.keys(payload).forEach(key => { if(payload[key] === '') payload[key] = null; });
    return payload;
  }

  function parseMissingColumn(error){
    const message = String(error?.message || '');
    const match = message.match(/Could not find the '([^']+)' column|column "([^"]+)"|column ([a-zA-Z0-9_]+) does not exist/i);
    return match && (match[1] || match[2] || match[3]);
  }

  async function saveWithColumnFallback(mode, propertyId, payload){
    const client = dbClient();
    let body = {...payload};
    const removed = [];
    for(let attempt = 0; attempt < 24; attempt++){
      let response;
      if(mode === 'insert'){
        response = await client.from('properties').insert([body]).select('*').single();
      }else{
        // Update bez wymuszania zwrotu rekordu. W Supabase/RLS zapis może przejść,
        // ale select po update potrafi zwrócić pusty wynik i wygląda wtedy jak brak zapisu.
        response = await client.from('properties').update(body).eq('id', propertyId);
      }
      if(!response.error){
        if(mode === 'insert') return {data: response.data, removed};
        let fresh = null;
        try{
          const read = await client.from('properties').select('*').eq('id', propertyId).maybeSingle();
          if(!read.error && read.data) fresh = read.data;
        }catch(_){ }
        if(!fresh){
          const previous = (typeof selectedProperty === 'function' ? selectedProperty(propertyId) : null) || {};
          fresh = Object.assign({}, previous, body, {id: propertyId});
        }
        return {data: fresh, removed};
      }
      const missing = parseMissingColumn(response.error);
      if(missing && Object.prototype.hasOwnProperty.call(body, missing)){
        removed.push(missing);
        delete body[missing];
        continue;
      }
      throw response.error;
    }
    throw new Error('Nie udało się zapisać mieszkania po dopasowaniu kolumn. Uruchom aktualne migracje SQL.');
  }

  async function logPropertyChange(propertyId, action, beforeData, afterData){
    try{
      await dbClient().from('activity_log').insert([{
        action,
        entity_type: 'property',
        entity_id: String(propertyId),
        property_id: propertyId,
        actor_role: roleName() || 'admin',
        before_data: beforeData || null,
        after_data: afterData || null
      }]);
    }catch(_){ }
  }

  async function saveOwnerAccess(propertyId){
    const display = nullableText('piPropOwnerDisplay');
    const phone = nullableText('piPropOwnerPhone');
    const email = nullableText('piPropOwnerEmail');
    const pin = text('piPropOwnerPin');
    const role = text('piPropOwnerRole') || 'owner';
    if(!display && !phone && !email && !pin) return;
    if(!phone) throw new Error('Dla dostępu właściciela podaj telefon do logowania. E-mail jest opcjonalny.');
    const payload = {property_id: propertyId, access_role: role, status:'active', display_name: display, user_email: email, user_phone: phone, pin:pin || null};
    let existing = null;
    try{
      const res = await dbClient().from('pi_property_access').select('id').eq('property_id', propertyId).eq('status','active').in('access_role',['owner','viewer']).limit(1).maybeSingle();
      existing = res.data || null;
    }catch(_){ }
    if(typeof window.piSecureAccessSave !== 'function') throw new Error('Brak bezpiecznej funkcji zapisu dostępu.');
    await window.piSecureAccessSave(payload,existing?.id || null);

    // pi_property_access jest jedynym źródłem prawdy; nie zapisujemy równolegle do historycznej tabeli property_access.
  }

  async function reloadAfterSave(property){
    if(property) setActivePropertyCache(property);
    // Po zapisie wymuszamy świeże pobranie listy. Bez tego panel mógł pokazywać stare
    // dane z pamięci i sprawiać wrażenie, że edycja się nie zapisała.
    try{ await loadProperties(true); }catch(_){ }
    try{ await window.loadPropertyTiles?.(); }catch(_){ }
    try{ await loadProperties(true); }catch(_){ }
    if(property) selectedPropertyId = property.id;
    renderRows(filteredRows());
    const current = property ? (selectedProperty(property.id) || property) : null;
    if(current) renderDetails(current);
    try{ window.hydratePropertyForms?.(); }catch(_){ }
    try{ window.renderPortfolio?.(); }catch(_){ }
    try{ window.refreshDashboard?.(); }catch(_){ }
  }

  async function savePropertyForm(){
    if(!canManage()){ toast('Edycja nieruchomości jest dostępna tylko dla administratora.', 'warn'); return; }
    const id = text('piPropertyFormId');
    const payload = formPayload();
    if(!payload.name){ setFormStatus('Podaj nazwę mieszkania.', 'error'); return; }
    setFormStatus('Zapisuję mieszkanie...', '');
    const previous = id ? lastProperties.find(item => String(item.id) === String(id)) : null;
    try{
      const result = await saveWithColumnFallback(id ? 'update' : 'insert', id, payload);
      await loadProperties(true).catch(()=>null);
      const saved = selectedProperty(result.data.id) || result.data;
      await logPropertyChange(result.data.id, id ? 'property.update' : 'property.create', previous, saved);
      closeForm();
      toast(id ? 'Zapisano zmiany mieszkania.' : 'Dodano nowe mieszkanie.', 'success');
      await reloadAfterSave(saved);
    }catch(error){
      console.error(error);
      setFormStatus('Nie udało się zapisać: ' + (error.message || error), 'error');
      toast('Nie udało się zapisać mieszkania.', 'error');
    }
  }

  function openForm(property){
    if(!canManage()){ toast('Dodawanie i edycja mieszkań jest dostępna tylko dla administratora.', 'warn'); return; }
    ensureDialog();
    const edit = !!property?.id;
    $('piPropertyDialogTitle').textContent = edit ? 'Edytuj mieszkanie' : 'Dodaj mieszkanie';
    $('piPropertyDialogHint').textContent = edit ? 'Zmieniasz dane techniczne i dane najemcy. Dostępy ustawiaj w sekcji Dostępy, a kwoty miesięczne w Finanse → Stałe rozliczenia.' : 'Nowe mieszkanie trafi do sekcji Nieruchomości, Portfela i listy wyboru.';
    fillForm(property || {});
    setFormStatus('', '');
    $('piPropertyDialog')?.classList.remove('hidden');
    document.body.classList.add('pi-modal-open');
    setTimeout(() => $('piPropName')?.focus(), 50);
  }

  function closeForm(){ $('piPropertyDialog')?.classList.add('hidden'); document.body.classList.remove('pi-modal-open'); }
  window.piOpenPropertyForm = openForm;
  window.piClosePropertyForm = closeForm;

  function filteredRows(){
    return [...lastProperties]
      .filter(property => propertyStatus(property).key !== 'archived')
      .sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'pl'));
  }

  function renderDetails(property){
    const box = $('piPropertyDetails');
    if(!box) return;
    if(!property){ box.innerHTML = 'Wybierz mieszkanie z listy, żeby zobaczyć szczegóły.'; return; }
    const status = propertyStatus(property);
    const dueDay = property.payment_day || property.rent_due_day || '—';
    const settlementTotals = settlementTotalsFor(property);
    const ownerRent = settlementTotals.owner;
    const media = settlementTotals.fees;
    box.innerHTML = `
      <div class="pi-property-details-title"><b>${esc(property.name || 'Bez nazwy')}</b><span class="pi-status-pill ${status.key}">${status.label}</span></div>
      <div class="pi-property-detail-grid">
        <div><small>Adres</small><b>${esc(property.address || '—')}</b></div>
        <div><small>Miasto</small><b>${esc(property.city || '—')}</b></div>
        <div><small>Metraż</small><b>${property.area_m2 ? Number(property.area_m2).toLocaleString('pl-PL') + ' m²' : '—'}</b></div>
        <div><small>Najemca</small><b>${esc(property.tenant_name || 'Brak')}</b></div>
        <div><small>Dzień płatności</small><b>${esc(dueDay)}</b></div>
        <div><small>Najem wg stałego rozliczenia</small><b>${money(ownerRent)}</b></div>
        <div><small>Opłaty wg stałego rozliczenia</small><b>${money(media)}</b></div>
        <div class="pi-tenant-panel-detail pi-tenant-panel-detail-slim">
          <small>Panel najemcy</small>
          <div class="pi-tenant-panel-slim-head">
            <b>Dostępy i najem</b>
            <button type="button" class="pi-mini-toggle-btn is-off" data-pi-prop-action="access" data-id="${esc(property.id)}">Otwórz</button>
          </div>
        </div>
      </div>
      ${settlementTotals.source === 'legacy' && media > 0 ? `<div class="pi-clean-note"><b>Uwaga:</b> opłaty pochodzą ze starszych pól mieszkania. Przejdź do Stałego rozliczenia, gdzie pozycje są przenoszone do edytowalnej listy.</div>` : ''}
      <div class="pi-property-detail-actions">
        ${canManage() ? `<button type="button" class="pi-primary-btn" data-pi-prop-action="edit" data-id="${esc(property.id)}">Edytuj dane</button>` : ''}
        <button type="button" class="subtle-link-btn" data-pi-prop-action="settlement" data-id="${esc(property.id)}">Stałe rozliczenie</button>
        <button type="button" class="subtle-link-btn" data-pi-prop-action="finance" data-id="${esc(property.id)}">Finanse</button>
        <button type="button" class="subtle-link-btn" data-pi-prop-action="docs" data-id="${esc(property.id)}">Dokumenty</button>
      </div>`;
  }

  function renderRows(rows){
    const box = $('propertiesList');
    if(!box) return;
    if(!rows.length){
      box.innerHTML = `<div class="pi-empty-state"><b>Brak mieszkań w tym widoku</b><span>Dodaj pierwsze mieszkanie, żeby rozpocząć pracę z portfelem.</span></div>`;
      renderDetails(null);
      return;
    }
    const activeId = selectedPropertyId || getActivePropertyId() || rows[0]?.id;
    const active = rows.find(item => String(item.id) === String(activeId)) || rows[0];
    selectedPropertyId = active?.id || null;
    box.innerHTML = `<div class="pi-properties-list-shell">${rows.map(property => {
      const status = propertyStatus(property);
      const selected = String(property.id) === String(selectedPropertyId) ? 'selected' : '';
      const rent = settlementTotalsFor(property).owner;
      const meta = [];
      if(property.postal_code || property.city) meta.push(`${esc(property.postal_code || '')} ${esc(property.city || '')}`.trim());
      if(property.address) meta.push(esc(property.address));
      if(property.area_m2) meta.push(`${Number(property.area_m2).toLocaleString('pl-PL')} m²`);
      if(property.tenant_name) meta.push(`Najemca: ${esc(property.tenant_name)}`);
      return `<div class="pi-property-row ${selected}" data-id="${esc(property.id)}" data-pi-prop-action="select">
        <div class="pi-property-main">
          <div class="pi-property-title-line">
            <b>${esc(property.name || 'Bez nazwy')}</b>
            <span class="pi-status-pill ${status.key}">${status.label}</span>
          </div>
          <small>${meta.length ? meta.join(' · ') : 'Brak uzupełnionych danych mieszkania'}</small>
        </div>
        <div class="pi-property-meta">
          <span>Czynsz właściciela</span>
          <b>${money(rent)}</b>
        </div>
        <div class="pi-property-actions-trigger">
          <button type="button" class="pi-property-actions-btn" data-pi-prop-action="toggleActions" data-id="${esc(property.id)}" aria-expanded="false">
            Akcje <span aria-hidden="true">⌄</span>
          </button>
        </div>
        <div class="pi-property-inline-actions" data-pi-prop-menu="${esc(property.id)}" hidden>
          <button type="button" data-pi-prop-action="dashboard" data-id="${esc(property.id)}">Dashboard</button>
          ${canManage() ? `<button type="button" data-pi-prop-action="archive" data-id="${esc(property.id)}">Archiwizuj</button><button type="button" class="danger" data-pi-prop-action="delete" data-id="${esc(property.id)}">Usuń trwale</button>` : ''}
        </div>
      </div>`;
    }).join('')}</div>`;
    renderDetails(active);
  }

  async function loadProperties(force){
    if(!force && Array.isArray(window.loadedProperties) && window.loadedProperties.length){
      lastProperties = window.loadedProperties;
      return lastProperties;
    }
    const client = dbClient();
    if(!client) throw new Error('Brak klienta Supabase.');
    let result;
    if(typeof window.piSelectProperties === 'function') result = await window.piSelectProperties();
    else result = await client.from('properties').select('*').order('created_at', {ascending:false});
    if(result.error) throw result.error;
    lastProperties = result.data || [];
    try{ loadedProperties = lastProperties; }catch(_){ }
    window.loadedProperties = lastProperties;
    return lastProperties;
  }

  async function renderPropertiesList(force){
    if(!ensureLayout()) return;
    selectedPropertyId=getActivePropertyId() || selectedPropertyId;
    ensureDialog();
    try{
      await loadProperties(force);
      renderRows(filteredRows());
      document.querySelectorAll('.pi-properties-actions [data-pi-prop-action="create"]').forEach(button => { button.style.display = canManage() ? '' : 'none'; });
    }catch(error){
      console.error(error);
      const box = $('propertiesList');
      if(box) box.innerHTML = `<div class="pi-empty-state error"><b>Nie udało się pobrać nieruchomości</b><span>${esc(error.message || error)}</span></div>`;
    }
  }

  function selectedProperty(id){ return lastProperties.find(item => String(item.id) === String(id)) || null; }

  async function archiveProperty(id){
    if(!canManage()){ toast('Archiwizacja jest dostępna tylko dla administratora.', 'warn'); return; }
    const property = selectedProperty(id);
    const ok = await confirmModal('Archiwizować mieszkanie?', 'Mieszkanie zniknie z aktywnego widoku, ale transakcje, dokumenty i historia pozostaną w systemie.');
    if(!ok) return;
    try{
      const payload = {status:'archived', property_status:'archived', is_archived:true, archived_at:new Date().toISOString()};
      await saveWithColumnFallback('update', id, payload);
      await logPropertyChange(id, 'property.archive', property, payload);
      toast('Mieszkanie zarchiwizowane.', 'success');
      await loadProperties(true);
      renderPropertiesList();
    }catch(error){ toast('Nie udało się zarchiwizować: ' + (error.message || error), 'error'); }
  }

  async function deleteProperty(id){
    if(!canManage()){ toast('Usuwanie jest dostępne tylko dla administratora.', 'warn'); return; }
    const property = selectedProperty(id);
    const answer = await inputModal('Trwałe usunięcie mieszkania', `Operacji nie da się cofnąć. Wpisz USUŃ, aby usunąć: ${property?.name || id}.`, 'USUŃ');
    if(answer !== 'USUŃ') return;
    try{
      const result = await dbClient().from('properties').delete().eq('id', id);
      if(result.error) throw result.error;
      await logPropertyChange(id, 'property.delete', property, null);
      toast('Mieszkanie usunięte.', 'success');
      selectedPropertyId = null;
      await loadProperties(true);
      renderPropertiesList();
      try{ window.loadPropertyTiles?.(); }catch(_){ }
    }catch(error){ toast('Nie udało się usunąć: ' + (error.message || error), 'error'); }
  }

  function generateTenantPin(){
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async function toggleTenantPanel(id){
    if(!canManage()){ toast('Panel najemcy może włączać lub wyłączać tylko administrator.', 'warn'); return; }
    const property = selectedProperty(id);
    if(!property){ toast('Nie znaleziono mieszkania.', 'error'); return; }
    const next = !property.tenant_access_enabled;
    const payload = {tenant_access_enabled: next};
    let generatedPin = '';
    try{
      const accessRows=await dbClient().from('pi_property_access').select('id,property_id,access_role,status,user_phone').eq('property_id',id).eq('access_role','tenant').eq('status','active');
      const currentAccess=(accessRows.data || [])[0] || null;
      if(next && !currentAccess){
        const phone=String(property.tenant_phone || '').replace(/\D/g,'');
        if(!phone) throw new Error('Najpierw uzupełnij telefon najemcy w karcie najmu.');
        generatedPin=generateTenantPin();
        await window.piSecureAccessSave({property_id:id,tenancy_id:property.tenancy_id || null,access_role:'tenant',status:'active',display_name:property.tenant_name || null,user_email:property.tenant_email || null,user_phone:phone,pin:generatedPin});
      }
      if(!next && currentAccess) await window.piSecureAccessRevoke(currentAccess.id);
      const result = await saveWithColumnFallback('update', id, payload);
      const updated = Object.assign({}, property, payload, result.data || {});
      await logPropertyChange(id, next ? 'tenant_panel.enable' : 'tenant_panel.disable', property, updated);
      const idx = lastProperties.findIndex(item => String(item.id) === String(id));
      if(idx >= 0) lastProperties[idx] = updated;
      try{ window.loadedProperties = lastProperties; loadedProperties = lastProperties; }catch(_){ window.loadedProperties = lastProperties; }
      renderRows(filteredRows());
      try{ window.hydratePropertyForms?.(); }catch(_){ }
      try{ window.renderAccessRoles?.(); }catch(_){ }
      toast(next ? ('Panel najemcy włączony.' + (generatedPin ? ' Wygenerowano PIN: ' + generatedPin : '')) : 'Panel najemcy wyłączony.', 'success');
    }catch(error){
      console.error(error);
      toast('Nie udało się zmienić statusu panelu najemcy: ' + (error.message || error), 'error');
    }
  }

  function exportProperties(){
    const rows = filteredRows();
    if(!rows.length){ toast('Brak danych do eksportu.', 'warn'); return; }
    const header = ['Nazwa','Adres','Miasto','Kod','Metraż','Najemca','Czynsz właściciela','Status'];
    const csv = [header].concat(rows.map(p => [p.name, p.address, p.city, p.postal_code, p.area_m2, p.tenant_name, p.owner_rent || p.rent_amount, propertyStatus(p).label]))
      .map(line => line.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pureinvest_nieruchomosci.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function confirmModal(title, message){
    return new Promise(resolve => {
      const overlay = modalBase(title, message, `<button type="button" class="subtle-link-btn" data-result="no">Anuluj</button><button type="button" class="pi-primary-btn" data-result="yes">Potwierdzam</button>`);
      overlay.addEventListener('click', event => {
        const action = event.target?.dataset?.result;
        if(!action) return;
        overlay.remove();
        resolve(action === 'yes');
      });
    });
  }

  function inputModal(title, message, expected){
    return new Promise(resolve => {
      const overlay = modalBase(title, message + `<input id="piPropertyModalInput" placeholder="${esc(expected || '')}">`, `<button type="button" class="subtle-link-btn" data-result="cancel">Anuluj</button><button type="button" class="pi-primary-btn" data-result="ok">Potwierdź</button>`);
      setTimeout(() => $('piPropertyModalInput')?.focus(), 40);
      overlay.addEventListener('click', event => {
        const action = event.target?.dataset?.result;
        if(!action) return;
        const value = $('piPropertyModalInput')?.value || '';
        overlay.remove();
        resolve(action === 'ok' ? value.trim() : null);
      });
    });
  }

  function modalBase(title, body, actions){
    const overlay = document.createElement('div');
    overlay.className = 'pi-modal-overlay';
    overlay.innerHTML = `<div class="pi-modal pi-small-modal"><div class="pi-modal-head"><div><h3>${esc(title)}</h3></div></div><div class="pi-modal-body">${body}</div><div class="pi-modal-actions">${actions}</div></div>`;
    document.body.appendChild(overlay);
    return overlay;
  }


  function navForTab(tab){
    return Array.from(document.querySelectorAll('.nav-item')).find(item => String(item.getAttribute('onclick') || '').includes("'" + tab + "'") || String(item.getAttribute('onclick') || '').includes('"' + tab + '"')) || null;
  }

  function forceSingleTab(tab){
    const targetId = 'tab-' + tab;
    document.querySelectorAll('.tab-view').forEach(view => {
      const active = view.id === targetId;
      view.classList.toggle('active', active);
      view.style.display = active ? '' : 'none';
    });
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const nav = navForTab(tab);
    if(nav) nav.classList.add('active');
    document.body.classList.toggle('tab-dashboard-active', tab === 'dashboard');
  }

  function openTenantSettlementPanel(){
    forceSingleTab('transactions');
    const btn = document.getElementById('piTransactionsFixedSettlementsTopBtn') || Array.from(document.querySelectorAll('#tab-transactions .pi-admin-tab-btn')).find(item => (item.textContent || '').toLowerCase().includes('stałe')) || null;
    try{ window.piTransactionsTogglePanel?.('piTenantMonthlyCollapse', btn, 'fixedSettlements'); }catch(_){ }
    const panel = document.getElementById('piTenantMonthlyCollapse');
    if(panel){
      document.querySelectorAll('#tab-transactions .pi-transactions-collapse').forEach(item => {
        const active = item.id === 'piTenantMonthlyCollapse';
        item.classList.toggle('active', active);
        item.classList.toggle('hidden', !active);
        item.style.display = active ? '' : 'none';
      });
      if(btn){
        document.querySelectorAll('#tab-transactions .pi-admin-tab-btn').forEach(item=>item.classList.remove('active'));
        btn.classList.add('active');
      }
    }
    try{ window.piSettlementDictionary?.refresh?.(); }catch(_){ }
    try{ window.piTransactionTypesRefreshV160?.(); }catch(_){ }
    setTimeout(()=>{ try{ document.getElementById('tab-transactions')?.scrollIntoView({block:'start'}); }catch(_){ } }, 20);
  }

  async function activatePropertyContext(id){
    if(!id) return null;
    let property = selectedProperty(id) || (Array.isArray(window.loadedProperties) ? window.loadedProperties.find(item => String(item.id) === String(id)) : null);
    if(!property){
      try{
        const rows = await loadProperties(true);
        property = (rows || []).find(item => String(item.id) === String(id)) || null;
      }catch(_){ }
    }
    if(property){
      selectedPropertyId = property.id;
      setActivePropertyCache(property);
      renderDetails(property);
      try{ renderRows(filteredRows()); }catch(_){ }
      return property;
    }
    toast('Nie udało się ustawić aktywnego mieszkania dla skrótu.', 'warn');
    return null;
  }

  function navButtonFor(tab){
    return document.querySelector(`.nav-item[onclick*="${tab}"]`) || null;
  }

  function openSectionOnly(tab){
    try{ window.switchTab?.(tab, navButtonFor(tab)); }catch(_){ }
    forceSingleTab(tab);
    setTimeout(()=>forceSingleTab(tab), 80);
    setTimeout(()=>forceSingleTab(tab), 220);
  }

  async function openPropertyFinanceOverview(id){
    const property = await activatePropertyContext(id);
    if(!property) return;
    openSectionOnly('transactions');
    try{ window.piFinanceReorganize?.(false); }catch(_){ }
    const btn = document.getElementById('piFinanceOverviewTopBtn');
    try{ window.piFinanceGroupOpen?.('piTransactionsFinanceProPanel', btn, 'financePro'); }catch(_){ }
    try{ window.renderFinancePro?.(); }catch(_){ }
    try{ window.piRenderPropertyFinance?.(true); }catch(_){ }
    try{ window.refreshDashboard?.(); }catch(_){ }
    setTimeout(()=>{
      try{ window.piFinanceReorganize?.(false); window.piFinanceGroupOpen?.('piTransactionsFinanceProPanel', document.getElementById('piFinanceOverviewTopBtn'), 'financePro'); }catch(_){ }
      document.getElementById('tab-transactions')?.scrollIntoView({block:'start'});
    }, 120);
  }

  async function openPropertyFixedSettlements(id){
    const property = await activatePropertyContext(id);
    if(!property) return;
    openSectionOnly('transactions');
    try{ window.piFinanceReorganize?.(false); }catch(_){ }
    openTenantSettlementPanel();
    setTimeout(openTenantSettlementPanel, 120);
    setTimeout(openTenantSettlementPanel, 350);
  }

  async function openPropertyDocuments(id){
    const property = await activatePropertyContext(id);
    if(!property) return;
    openSectionOnly('documents');
    try{ window.loadLibrary?.(); }catch(_){ }
    setTimeout(()=>{
      openSectionOnly('documents');
      try{ window.loadLibrary?.(); }catch(_){ }
      try{ document.getElementById('tab-documents')?.scrollIntoView({block:'start'}); }catch(_){ }
    }, 180);
  }

  async function openPropertyAccess(id){
    const property = await activatePropertyContext(id);
    if(!property) return;
    openSectionOnly('access');
    try{ window.piRefreshAccessPanel?.(); }catch(_){ }
    setTimeout(()=>{
      openSectionOnly('access');
      try{ window.piRefreshAccessPanel?.(); }catch(_){ }
      try{ document.getElementById('tab-access')?.scrollIntoView({block:'start'}); }catch(_){ }
    }, 120);
  }

  document.addEventListener('click', async event => {
    if(event.target?.id === 'piPropertyDialog') return closeForm();
    const button = event.target?.closest?.('[data-pi-prop-action]');
    if(!button) return;
    const action = button.dataset.piPropAction;
    const id = button.dataset.id || button.closest('[data-id]')?.dataset.id;
    if(action === 'toggleActions'){
      event.preventDefault();
      event.stopPropagation();
      const row = button.closest('.pi-property-row');
      const wasOpen = row?.classList.contains('actions-open');
      document.querySelectorAll('.pi-property-row.actions-open').forEach(item => {
        item.classList.remove('actions-open');
        item.querySelector('.pi-property-inline-actions')?.setAttribute('hidden', '');
        const trigger = item.querySelector('.pi-property-actions-btn');
        if(trigger) trigger.setAttribute('aria-expanded', 'false');
      });
      if(row && !wasOpen){
        row.classList.add('actions-open');
        row.querySelector('.pi-property-inline-actions')?.removeAttribute('hidden');
        button.setAttribute('aria-expanded', 'true');
      }
      return;
    }
    if(action !== 'select') document.querySelectorAll('.pi-property-row.actions-open').forEach(item => {
      item.classList.remove('actions-open');
      item.querySelector('.pi-property-inline-actions')?.setAttribute('hidden', '');
      const trigger = item.querySelector('.pi-property-actions-btn');
      if(trigger) trigger.setAttribute('aria-expanded', 'false');
    });
    if(action === 'create') return openForm(null);
    if(action === 'closeForm') return closeForm();
    if(action === 'refresh') return renderPropertiesList(true).then(() => toast('Odświeżono nieruchomości.', 'success'));
    if(action === 'export') return exportProperties();
    if(action === 'select'){
      selectedPropertyId = id;
      await activatePropertyContext(id);
      const property = selectedProperty(id);
      if(property) renderDetails(property);
      renderRows(filteredRows());
      return;
    }
    if(action === 'edit') {
      event.preventDefault();
      event.stopPropagation();
      await activatePropertyContext(id);
      return openForm(selectedProperty(id) || window.activePropertyData || null);
    }
    if(action === 'dashboard') return window.openDashboard?.(id);
    if(action === 'settlement'){
      event.preventDefault();
      event.stopPropagation();
      return openPropertyFixedSettlements(id);
    }
    if(action === 'finance'){
      event.preventDefault();
      event.stopPropagation();
      return openPropertyFinanceOverview(id);
    }
    if(action === 'docs'){
      event.preventDefault();
      event.stopPropagation();
      return openPropertyDocuments(id);
    }
    if(action === 'access'){
      event.preventDefault();
      event.stopPropagation();
      return openPropertyAccess(id);
    }
    if(action === 'archive') return archiveProperty(id);
    if(action === 'delete') return deleteProperty(id);
    if(action === 'toggleTenantPanel') return window.switchTab?.('access', document.querySelector('.nav-item[onclick*=access]'));
  });

  window.piActivatePropertyContext = activatePropertyContext;
  window.renderPropertiesList = renderPropertiesList;
  window.piRenderPropertiesManager = renderPropertiesList;
  window.addProperty = function(){ openForm(null); };

  document.addEventListener('DOMContentLoaded', () => {
    ensureLayout();
    ensureDialog();
    setTimeout(() => renderPropertiesList(false), 350);
  });
})();
