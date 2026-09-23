(function(){
  if(window.__PI_V180_TICKETS__) return;
  window.__PI_V180_TICKETS__ = true;

  const $ = id => document.getElementById(id);
  const STATE = { tickets: [], properties: [], lastScope:'current', loading:false };
  const STATUS = {
    new:{label:'Nowe', cls:'new'}, nowe:{label:'Nowe', cls:'new'},
    accepted:{label:'Przyjęte', cls:'accepted'}, przyjete:{label:'Przyjęte', cls:'accepted'}, przyjęte:{label:'Przyjęte', cls:'accepted'},
    in_progress:{label:'W realizacji', cls:'progress'}, progress:{label:'W realizacji', cls:'progress'}, realizacja:{label:'W realizacji', cls:'progress'},
    scheduled:{label:'Umówione', cls:'scheduled'}, umowione:{label:'Umówione', cls:'scheduled'}, umówione:{label:'Umówione', cls:'scheduled'},
    waiting_tenant:{label:'Czeka na najemcę', cls:'waiting'}, waiting:{label:'Czeka', cls:'waiting'},
    resolved:{label:'Zakończone', cls:'done'}, done:{label:'Zakończone', cls:'done'}, closed:{label:'Zakończone', cls:'done'}, zakonczone:{label:'Zakończone', cls:'done'}, zakończone:{label:'Zakończone', cls:'done'},
    rejected:{label:'Odrzucone', cls:'rejected'}
  };
  const PRIORITY = {
    low:{label:'Niskie', cls:'low'}, normal:{label:'Normalne', cls:'normal'}, medium:{label:'Normalne', cls:'normal'}, high:{label:'Pilne', cls:'high'}, critical:{label:'Awaryjne', cls:'critical'}, urgent:{label:'Awaryjne', cls:'critical'}
  };
  const CATEGORIES = ['Usterka','Hydraulika','Elektryka','Ogrzewanie','AGD / wyposażenie','Administracja','Drzwi / okna','Wilgoć / zalanie','Internet / domofon','Inne'];

  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeUrl = v => { try{ const url=new URL(String(v||''),window.location.origin); return ['http:','https:'].includes(url.protocol)?url.href:''; }catch(_){ return ''; } };
  const norm = v => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s-]+/g,'_');
  const shortDate = v => v ? String(v).slice(0,10) : '—';
  const fullDate = v => { try{return v ? new Date(v).toLocaleString('pl-PL') : '—';}catch(_){return shortDate(v);} };
  const roleName = () => { try{return String(typeof window.piRole === 'function' ? window.piRole() : (document.body.dataset.piRole || window.piCurrentRole || '')).toLowerCase();}catch(_){return '';} };
  const isTenant = () => roleName() === 'tenant' || !!sessionStorage.getItem('piTenantSessionV54');
  const isDone = t => ['resolved','done','closed','zakonczone','zakończone'].includes(norm(t && t.status));
  const propLabel = p => [p?.name, p?.address].filter(Boolean).join(' • ') || 'Mieszkanie';
  const activeId = () => String(window.activeProperty || (window.activePropertyData && window.activePropertyData.id) || '').trim();
  const activeProperty = () => {
    const id = activeId();
    const list = getProperties();
    return list.find(p => String(p.id) === String(id)) || window.activePropertyData || null;
  };
  function getProperties(){
    let rows = [];
    try{ if(Array.isArray(window.loadedProperties)) rows = window.loadedProperties; }catch(_){ }
    if((!rows || !rows.length) && window.piOwnerSessionV570 && Array.isArray(window.piOwnerSessionV570.properties)) rows = window.piOwnerSessionV570.properties;
    STATE.properties = rows || [];
    return STATE.properties;
  }
  function toast(msg,type='info'){
    try{ if(typeof window.piToastV761 === 'function') return window.piToastV761(msg,type); }catch(_){ }
    try{ if(typeof window.piToastV760 === 'function') return window.piToastV760(msg,type); }catch(_){ }
    console.log(msg);
  }
  async function authHeaders(extra){
    if(typeof window.piAuthHeadersV762 === 'function') return window.piAuthHeadersV762(extra || {});
    if(typeof window.piAuthHeadersV760 === 'function') return window.piAuthHeadersV760(extra || {});
    return Object.assign({'Accept':'application/json'}, extra || {});
  }
  async function api(action, payload={}){
    const res = await fetch('/.netlify/functions/maintenance-ticket', {
      method:'POST',
      headers: await authHeaders({'Content-Type':'application/json'}),
      body: JSON.stringify(Object.assign({action}, payload))
    });
    const body = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź serwera.'}));
    if(!res.ok || !body.ok) throw new Error(body.message || body.details || ('HTTP '+res.status));
    return body;
  }

  function injectTicketsMarkup(){
    const tab = $('tab-tickets');
    if(!tab || tab.dataset.ticketsReady === '1') return;
    tab.dataset.ticketsReady = '1';
    tab.innerHTML = `
      <div class="context-header pi-tickets-header pi-tickets-header-compact">
        <h2>Zgłoszenia</h2>
      </div>
      <div class="pi-ticket-kpi-grid">
        <div class="pi-ticket-kpi"><span>Aktywne</span><b id="piTicketKpiOpen">0</b><small>Nowe i w realizacji</small></div>
        <div class="pi-ticket-kpi urgent"><span>Pilne</span><b id="piTicketKpiUrgent">0</b><small>High / awaryjne</small></div>
        <div class="pi-ticket-kpi waiting"><span>Czekają</span><b id="piTicketKpiWaiting">0</b><small>Na najemcę lub termin</small></div>
        <div class="pi-ticket-kpi done"><span>Zamknięte</span><b id="piTicketKpiDone">0</b><small>Rozwiązane</small></div>
      </div>
      <div class="pi-admin-tabs pi-unified-tabs pi-section-admin-toggles pi-ticket-tabs">
        <button type="button" class="pi-admin-tab-btn active" data-ticket-panel="piTicketsListPanel">Lista zgłoszeń</button>
        <button type="button" class="pi-admin-tab-btn" data-ticket-panel="piTicketsAddPanel">Dodaj zgłoszenie</button>
        <button type="button" class="pi-admin-tab-btn" data-ticket-panel="piTicketsFlowPanel">Proces obsługi</button>
      </div>
      <div id="piTicketsListPanel" class="pi-section-collapse pi-admin-subtab active">
        <div class="card pi-ticket-toolbar">
          <div class="pi-ticket-toolbar-grid">
            <label>Zakres
              <select id="piTicketScope" onchange="piTicketsLoad(true)">
                <option value="current">Aktualne mieszkanie</option>
                <option value="all">Wszystkie dostępne</option>
              </select>
            </label>
            <label>Status
              <select id="piTicketFilterStatus" onchange="piTicketsRenderList()">
                <option value="all">Wszystkie statusy</option>
                <option value="open">Aktywne</option>
                <option value="new">Nowe</option>
                <option value="in_progress">W realizacji</option>
                <option value="waiting_tenant">Czekają</option>
                <option value="done">Zakończone</option>
              </select>
            </label>
            <label>Pilność
              <select id="piTicketFilterPriority" onchange="piTicketsRenderList()">
                <option value="all">Każda</option><option value="critical">Awaryjne</option><option value="high">Pilne</option><option value="normal">Normalne</option><option value="low">Niskie</option>
              </select>
            </label>
            <label>Szukaj
              <input id="piTicketSearch" oninput="piTicketsRenderList()" placeholder="tytuł, opis, kategoria">
            </label>
          </div>
          <div class="pi-ticket-toolbar-actions">
            <button type="button" onclick="piTicketsLoad(true)">Odśwież</button>
            <button type="button" class="subtle-link-btn" onclick="piTicketsOpenAdd()">Nowe zgłoszenie</button>
          </div>
        </div>
        <div id="piTicketsList" class="pi-ticket-list">Ładowanie zgłoszeń...</div>
      </div>
      <div id="piTicketsAddPanel" class="pi-section-collapse pi-admin-subtab">
        <div class="card pi-ticket-add-card">
          <div class="card-title">Dodaj zgłoszenie po stronie zarządcy</div>
          <div class="transactions-info" style="margin-bottom:12px;">Użyj, gdy problem został zgłoszony telefonicznie, wykryty na przeglądzie albo pochodzi od właściciela.</div>
          <div class="pi-ticket-form-grid">
            <label>Mieszkanie<select id="piTicketFormProperty"></select></label>
            <label>Kategoria<select id="piTicketFormCategory"></select></label>
            <label>Pilność<select id="piTicketFormPriority"><option value="normal">Normalne</option><option value="high">Pilne</option><option value="critical">Awaryjne</option><option value="low">Niskie</option></select></label>
            <label>Status<select id="piTicketFormStatus"><option value="new">Nowe</option><option value="accepted">Przyjęte</option><option value="in_progress">W realizacji</option><option value="scheduled">Umówione</option></select></label>
            <label class="wide">Tytuł<input id="piTicketFormTitle" placeholder="np. Przeciek pod zlewem"></label>
            <label>Pomieszczenie<input id="piTicketFormRoom" placeholder="np. kuchnia"></label>
            <label>Telefon / kontakt<input id="piTicketFormTenantPhone" placeholder="opcjonalnie"></label>
            <label>Termin / deadline<input id="piTicketFormDue" type="date"></label>
            <label class="wide">Opis<textarea id="piTicketFormDescription" placeholder="Co się stało, od kiedy, jakie są objawy, ustalenia z najemcą"></textarea></label>
            <label class="wide">Notatka zarządcy<textarea id="piTicketFormManagerNote" placeholder="Notatka wewnętrzna, np. umówiony hydraulik, kosztorys, dalszy krok"></textarea></label>
            <label class="wide">Zdjęcie / załącznik<input id="piTicketFormFile" type="file" accept="image/*,.pdf"></label>
          </div>
          <button type="button" onclick="piTicketsCreate()">Dodaj zgłoszenie</button>
          <div id="piTicketFormMsg" class="transactions-info"></div>
        </div>
      </div>
      <div id="piTicketsFlowPanel" class="pi-section-collapse pi-admin-subtab">
        <div class="card pi-ticket-flow-card">
          <div class="card-title">Proces obsługi zgłoszenia</div>
          <div class="pi-ticket-flow">
            <div><b>1. Nowe</b><span>Najemca albo zarządca dodaje problem. System zapisuje kategorię, opis i załącznik.</span></div>
            <div><b>2. Przyjęte</b><span>Zgłoszenie jest potwierdzone. Właściciel/zarządca decyduje, czy potrzebny jest serwis.</span></div>
            <div><b>3. W realizacji</b><span>Trwa kontakt z wykonawcą, najemcą lub administracją. W notatce zapisujesz dalsze kroki.</span></div>
            <div><b>4. Czeka</b><span>Brakuje informacji, terminu, dostępu do lokalu albo decyzji kosztowej.</span></div>
            <div><b>5. Zakończone</b><span>Problem rozwiązany. Zgłoszenie zostaje w historii lokalu.</span></div>
          </div>
        </div>
      </div>`;
    bindTabs(tab);
    fillFormSelects();
  }

  function bindTabs(root){
    root.querySelectorAll('[data-ticket-panel]').forEach(btn=>{
      btn.onclick = () => {
        root.querySelectorAll('.pi-ticket-tabs .pi-admin-tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        root.querySelectorAll('.pi-section-collapse.pi-admin-subtab').forEach(x=>x.classList.remove('active'));
        const panel = $(btn.dataset.ticketPanel);
        if(panel) panel.classList.add('active');
      };
    });
  }
  function fillFormSelects(){
    const props = getProperties();
    const active = activeId();
    const pSel = $('piTicketFormProperty');
    if(pSel){
      pSel.innerHTML = props.length ? props.map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(active)?'selected':''}>${esc(propLabel(p))}</option>`).join('') : '<option value="">Wybierz mieszkanie</option>';
    }
    const cSel = $('piTicketFormCategory');
    if(cSel) cSel.innerHTML = CATEGORIES.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const chip = $('piTicketPropertyChip');
    const p = activeProperty();
    if(chip) chip.textContent = p ? ('Mieszkanie: '+propLabel(p)) : 'Zakres: wszystkie dostępne';
    const scope = $('piTicketScope');
    if(scope && !active) scope.value = 'all';
  }

  function summarize(tickets){
    const done = tickets.filter(isDone).length;
    const open = tickets.length - done;
    const urgent = tickets.filter(t=>['high','critical','urgent'].includes(norm(t.priority))).filter(t=>!isDone(t)).length;
    const waiting = tickets.filter(t=>['waiting_tenant','waiting','scheduled'].includes(norm(t.status))).filter(t=>!isDone(t)).length;
    setText('piTicketKpiOpen', open);
    setText('piTicketKpiUrgent', urgent);
    setText('piTicketKpiWaiting', waiting);
    setText('piTicketKpiDone', done);
  }
  function setText(id, value){ const el=$(id); if(el) el.textContent = value; }

  function ticketStatus(t){
    const key = norm(t && t.status) || 'new';
    return STATUS[key] || {label: String(t?.status || 'Nowe'), cls:'new'};
  }
  function ticketPriority(t){
    const key = norm(t && t.priority) || 'normal';
    return PRIORITY[key] || {label: String(t?.priority || 'Normalne'), cls:'normal'};
  }
  function ticketCategory(t){ return t.category || t.issue_category || t.type || 'Usterka'; }
  function ticketRoom(t){ return t.room || t.location || t.place || ''; }
  function propertyNameFor(id){
    const p = getProperties().find(x=>String(x.id)===String(id));
    return p ? propLabel(p) : (activeProperty()?.id === id ? propLabel(activeProperty()) : 'Mieszkanie');
  }
  function filterTickets(rows){
    const status = $('piTicketFilterStatus')?.value || 'all';
    const priority = $('piTicketFilterPriority')?.value || 'all';
    const search = String($('piTicketSearch')?.value || '').toLowerCase().trim();
    return (rows || []).filter(t=>{
      const s = norm(t.status);
      if(status === 'open' && isDone(t)) return false;
      if(status === 'done' && !isDone(t)) return false;
      if(['new','in_progress','waiting_tenant'].includes(status) && s !== status && !(status==='new' && ['nowe'].includes(s))) return false;
      if(priority !== 'all' && norm(t.priority) !== priority) return false;
      if(search){
        const blob = [t.title,t.description,t.manager_note,t.resolution_note,ticketCategory(t),ticketRoom(t),propertyNameFor(t.property_id)].join(' ').toLowerCase();
        if(!blob.includes(search)) return false;
      }
      return true;
    });
  }

  window.piTicketsRenderList = function(){
    const box = $('piTicketsList');
    if(!box) return;
    const rows = filterTickets(STATE.tickets);
    summarize(STATE.tickets);
    if(!rows.length){
      box.innerHTML = '<div class="card pi-ticket-empty"><b>Brak zgłoszeń w wybranym zakresie.</b><span>Po zgłoszeniu usterki przez najemcę albo dodaniu ręcznym pojawi się tutaj karta ticketu.</span></div>';
      return;
    }
    box.innerHTML = rows.map(t=>ticketCard(t)).join('');
    bindTicketActions(box);
    hydrateTicketLinks(box);
  };

  function ticketCard(t){
    const st = ticketStatus(t), pr = ticketPriority(t);
    const id = esc(t.id || '');
    const property = propertyNameFor(t.property_id);
    const room = ticketRoom(t);
    const phone = t.tenant_phone || t.contact_phone || '';
    const source = t.created_by_role === 'tenant' ? 'Najemca' : (t.created_by_role === 'owner' ? 'Owner / zarządca' : 'Administrator');
    const attachment = safeUrl(t.attachment_url || t.file_url);
    const note = t.manager_note || t.admin_note || '';
    const resolution = t.resolution_note || '';
    const due = t.due_date ? `<span>Termin: <b>${esc(shortDate(t.due_date))}</b></span>` : '';
    return `<div class="pi-ticket-card status-${esc(st.cls)} priority-${esc(pr.cls)}" data-ticket-id="${id}">
      <div class="pi-ticket-card-head">
        <div>
          <div class="pi-ticket-badges"><span class="pi-ticket-status ${esc(st.cls)}">${esc(st.label)}</span><span class="pi-ticket-priority ${esc(pr.cls)}">${esc(pr.label)}</span><span>${esc(ticketCategory(t))}</span></div>
          <h3>${esc(t.title || 'Zgłoszenie')}</h3>
          <div class="pi-ticket-meta"><span>${esc(property)}</span>${room?`<span>${esc(room)}</span>`:''}<span>Dodano: ${esc(shortDate(t.created_at))}</span><span>Źródło: ${esc(source)}</span>${phone?`<span>Tel: ${esc(phone)}</span>`:''}${due}</div>
        </div>
        <div class="pi-ticket-id">#${esc(String(t.id || '').slice(0,8))}</div>
      </div>
      <p>${esc(t.description || 'Brak opisu.')}</p>
      ${attachment ? `<div class="pi-ticket-attachment"><a href="${esc(attachment)}" target="_blank" rel="noopener noreferrer" data-pi-ticket-attachment="1" data-path="${esc(t.attachment_path || '')}">Otwórz załącznik</a>${t.attachment_name?`<span>${esc(t.attachment_name)}</span>`:''}</div>` : ''}
      ${note ? `<div class="pi-ticket-note"><b>Notatka zarządcy</b><span>${esc(note)}</span></div>` : ''}
      ${resolution ? `<div class="pi-ticket-note done"><b>Rozwiązanie</b><span>${esc(resolution)}</span></div>` : ''}
      <div class="pi-ticket-actions">
        <button type="button" data-ticket-status="accepted">Przyjmij</button>
        <button type="button" data-ticket-status="in_progress">W realizacji</button>
        <button type="button" data-ticket-status="waiting_tenant">Czeka</button>
        <button type="button" data-ticket-status="resolved" class="success">Zakończ</button>
        <button type="button" data-ticket-note="manager">Notatka</button>
      </div>
    </div>`;
  }
  function bindTicketActions(root){
    root.querySelectorAll('[data-ticket-status]').forEach(btn=>{
      btn.onclick = () => {
        const card = btn.closest('[data-ticket-id]');
        const id = card?.dataset.ticketId;
        if(id) window.piTicketsSetStatus(id, btn.dataset.ticketStatus);
      };
    });
    root.querySelectorAll('[data-ticket-note]').forEach(btn=>{
      btn.onclick = () => {
        const card = btn.closest('[data-ticket-id]');
        const id = card?.dataset.ticketId;
        if(id) window.piTicketsAddNote(id);
      };
    });
  }
  async function hydrateTicketLinks(root){
    const nodes = Array.from(root.querySelectorAll('[data-pi-ticket-attachment][data-path]')).filter(a=>a.dataset.path);
    for(const a of nodes){
      try{
        let signed='';
        if(typeof window.piSignedStorageUrlV773 === 'function') signed = await window.piSignedStorageUrlV773('property-documents', a.dataset.path);
        else if(typeof window.piSignedStorageUrlV772 === 'function') signed = await window.piSignedStorageUrlV772('property-documents', a.dataset.path);
        a.href = safeUrl(signed) || '#';
      }catch(_){ }
    }
  }

  window.piTicketsLoad = async function(force){
    injectTicketsMarkup();
    if(isTenant()){
      const box = $('piTicketsList');
      if(box) box.innerHTML = '<div class="card">Zgłoszenia dla najemcy są dostępne w panelu najemcy.</div>';
      return;
    }
    if(STATE.loading && !force) return;
    STATE.loading = true;
    const box = $('piTicketsList');
    if(box) box.innerHTML = 'Ładowanie zgłoszeń...';
    try{
      if(!getProperties().length && typeof window.loadPropertyTiles === 'function'){
        try{ await window.loadPropertyTiles(); }catch(_){ }
      }
      fillFormSelects();
      const scope = $('piTicketScope')?.value || (activeId() ? 'current' : 'all');
      const propertyId = scope === 'current' ? activeId() : '';
      if(scope === 'current' && !propertyId){
        STATE.tickets = [];
        if(box) box.innerHTML = '<div class="card pi-ticket-empty"><b>Wybierz mieszkanie.</b><span>Ticketing działa w kontekście lokalu albo całego dostępnego portfela.</span></div>';
        summarize([]);
        return;
      }
      const data = await api('list', { propertyId, limit: 250 });
      STATE.tickets = Array.isArray(data.tickets) ? data.tickets : [];
      window.piTicketsRenderList();
    }catch(e){
      if(box) box.innerHTML = '<div class="card pi-ticket-empty error"><b>Nie udało się załadować zgłoszeń.</b><span>'+esc(e.message || e)+'</span></div>';
      summarize([]);
    }finally{ STATE.loading = false; }
  };

  window.piTicketsOpenAdd = function(){
    const root = $('tab-tickets');
    const btn = root && Array.from(root.querySelectorAll('[data-ticket-panel]')).find(b=>b.dataset.ticketPanel === 'piTicketsAddPanel');
    if(btn) btn.click();
    setTimeout(()=>$('piTicketFormTitle')?.focus(),50);
  };

  function extendedDescription(room, permission, description){
    const extra = [];
    if(room) extra.push('Miejsce: '+room);
    if(permission) extra.push('Dostęp serwisu: najemca wyraził zgodę na wejście po wcześniejszym kontakcie');
    return (extra.length ? extra.join('\n')+'\n\n' : '') + String(description || '').trim();
  }

  window.piTicketsCreate = async function(){
    const msg = $('piTicketFormMsg');
    const propertyId = $('piTicketFormProperty')?.value || activeId();
    const title = $('piTicketFormTitle')?.value.trim() || '';
    const descriptionRaw = $('piTicketFormDescription')?.value.trim() || '';
    const category = $('piTicketFormCategory')?.value || 'Usterka';
    const priority = $('piTicketFormPriority')?.value || 'normal';
    const status = $('piTicketFormStatus')?.value || 'new';
    const room = $('piTicketFormRoom')?.value.trim() || '';
    const tenantPhone = $('piTicketFormTenantPhone')?.value.trim() || '';
    const managerNote = $('piTicketFormManagerNote')?.value.trim() || '';
    const dueDate = $('piTicketFormDue')?.value || '';
    const file = $('piTicketFormFile')?.files?.[0] || null;
    if(!propertyId) return msg && (msg.textContent = 'Wybierz mieszkanie.');
    if(!title || !descriptionRaw) return msg && (msg.textContent = 'Podaj tytuł i opis zgłoszenia.');
    try{
      if(msg) msg.textContent = file ? 'Przesyłam załącznik i zapisuję zgłoszenie...' : 'Zapisuję zgłoszenie...';
      let attachment = null;
      if(file && typeof window.piStorageUploadV773 === 'function'){
        attachment = await window.piStorageUploadV773({file, bucket:'property-documents', propertyId, folder:'maintenance'});
      }
      const description = extendedDescription(room, false, descriptionRaw);
      await api('create', { propertyId, title, description, category, room, priority, status, tenantPhone, managerNote, dueDate, attachment });
      ['piTicketFormTitle','piTicketFormDescription','piTicketFormRoom','piTicketFormTenantPhone','piTicketFormManagerNote','piTicketFormDue','piTicketFormFile'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
      if(msg) msg.textContent = 'Zgłoszenie dodane.';
      await window.piTicketsLoad(true);
      const root = $('tab-tickets'); const btn = root && Array.from(root.querySelectorAll('[data-ticket-panel]')).find(b=>b.dataset.ticketPanel === 'piTicketsListPanel'); if(btn) btn.click();
    }catch(e){ if(msg) msg.textContent = 'Nie udało się dodać zgłoszenia: '+String(e.message || e); }
  };

  window.piTicketsSetStatus = async function(id, status){
    try{
      let payload = { status };
      if(status === 'resolved'){
        const note = await promptValue('Krótka notatka końcowa / co zrobiono?', {title:'Zamknij zgłoszenie', okText:'Zakończ'});
        if(note === null) return;
        payload.resolutionNote = note || 'Zgłoszenie zakończone.';
      }
      await api('update', { id, patch: payload });
      toast('Status zgłoszenia zaktualizowany.', 'success');
      await window.piTicketsLoad(true);
    }catch(e){ toast('Nie udało się zaktualizować statusu: '+String(e.message || e), 'error'); }
  };
  window.piTicketsAddNote = async function(id){
    const ticket = STATE.tickets.find(t=>String(t.id)===String(id)) || {};
    const note = await promptValue('Dodaj albo zmień notatkę zarządcy.', {title:'Notatka do zgłoszenia', value: ticket.manager_note || ticket.admin_note || '', okText:'Zapisz'});
    if(note === null) return;
    try{
      await api('update', { id, patch:{ managerNote: note } });
      toast('Notatka zapisana.', 'success');
      await window.piTicketsLoad(true);
    }catch(e){ toast('Nie udało się zapisać notatki: '+String(e.message || e), 'error'); }
  };
  async function promptValue(message, opts={}){
    if(typeof window.piPromptModalV773 === 'function') return window.piPromptModalV773(message, opts);
    const out = window.prompt(message, opts.value || '');
    return out === null ? null : out;
  }

  function patchTenantPortal(){
    const oldRender = window.renderTenantPortalV54;
    if(typeof oldRender === 'function' && !oldRender.__piTicketsWrapped){
      const wrapped = function(data){
        const result = oldRender.apply(this, arguments);
        try{ renderTenantIssueHistory(data || {}); }catch(e){ console.warn('ticket tenant history render skipped', e); }
        return result;
      };
      wrapped.__piTicketsWrapped = true;
      window.renderTenantPortalV54 = wrapped;
    }
    window.tenantSubmitIssueV54 = tenantSubmitIssueEnhanced;
  }
  function renderTenantIssueHistory(data){
    const box = $('tenantPortalIssues');
    if(!box) return;
    const issues = data.issues || [];
    if(!issues.length){ box.innerHTML = '<div class="pi-tenant-muted">Brak zgłoszeń.</div>'; return; }
    box.innerHTML = issues.map(i=>{
      const st = ticketStatus(i), pr = ticketPriority(i);
      const room = ticketRoom(i);
      const attachmentUrl = safeUrl(i.attachment_url);
      const attachment = attachmentUrl ? '<br><a href="'+esc(attachmentUrl)+'" target="_blank" rel="noopener noreferrer">Załącznik</a>' : '';
      return '<div class="pi-tenant-issue pi-tenant-ticket-item"><div><b>'+esc(i.title||'Zgłoszenie')+'</b><span class="pi-tenant-pill '+(isDone(i)?'':'warn')+'">'+esc(st.label)+'</span></div><small>'+esc(ticketCategory(i))+' • '+esc(pr.label)+' • '+esc(shortDate(i.created_at))+(room?' • '+esc(room):'')+'</small>'+(i.description?'<p>'+esc(String(i.description).slice(0,220))+'</p>':'')+attachment+'</div>';
    }).join('');
  }
  async function tenantSubmitIssueEnhanced(){
    const msg = $('tenantIssueMsg');
    const session = JSON.parse(sessionStorage.getItem('piTenantSessionV54') || 'null');
    if(!session || !session.property){ if(msg) msg.textContent='Sesja najemcy wygasła. Zaloguj się ponownie.'; return; }
    const title = $('tenantIssueTitle')?.value.trim() || '';
    const descriptionRaw = $('tenantIssueDescription')?.value.trim() || '';
    const category = $('tenantIssueCategory')?.value || 'Usterka';
    const priority = $('tenantIssuePriority')?.value || 'normal';
    const room = $('tenantIssueRoom')?.value.trim() || '';
    const permission = !!$('tenantIssuePermission')?.checked;
    const file = $('tenantIssuePhoto')?.files?.[0] || null;
    if(!title || !descriptionRaw){ if(msg) msg.textContent='Podaj krótki tytuł i opis problemu.'; return; }
    try{
      if(msg) msg.textContent = file ? 'Wysyłam zdjęcie i zgłoszenie...' : 'Wysyłam zgłoszenie...';
      let attachment = null;
      if(file && typeof window.piStorageUploadV773 === 'function'){
        attachment = await window.piStorageUploadV773({file, bucket:'property-documents', propertyId:session.property.id, folder:'maintenance', tenantToken:session.tenantToken});
      }
      const body = {
        propertyId: session.property.id,
        tenantToken: session.tenantToken,
        title,
        description: extendedDescription(room, permission, descriptionRaw),
        category,
        room,
        priority,
        permissionToEnter: permission,
        attachment
      };
      const res = await fetch('/.netlify/functions/tenant-maintenance', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      const data = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź serwera.'}));
      if(!res.ok || !data.ok) throw new Error(data.message || data.details || 'Nie udało się wysłać zgłoszenia.');
      ['tenantIssueTitle','tenantIssueDescription','tenantIssueRoom','tenantIssuePhoto'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
      const perm = $('tenantIssuePermission'); if(perm) perm.checked = false;
      if(msg) msg.textContent=data.sandbox ? 'Zgłoszenie dodano demonstracyjnie — bez zapisu w bazie.' : 'Zgłoszenie zostało wysłane. Status zobaczysz w historii poniżej.';
      session.issues = data.issues || session.issues || [];
      sessionStorage.setItem('piTenantSessionV54', JSON.stringify(session));
      if(typeof window.renderTenantPortalV54 === 'function') window.renderTenantPortalV54(session);
    }catch(e){ if(msg) msg.textContent='Nie udało się wysłać zgłoszenia: '+String(e.message||e); }
  }

  function hookNavigation(){
    const oldSwitch = window.switchTab;
    if(typeof oldSwitch === 'function' && !oldSwitch.__piTicketsHook){
      const wrapped = function(tab, navEl){
        const res = oldSwitch.apply(this, arguments);
        if(tab === 'tickets') setTimeout(()=>window.piTicketsLoad(false),80);
        return res;
      };
      wrapped.__piTicketsHook = true;
      window.switchTab = wrapped;
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{ injectTicketsMarkup(); hookNavigation(); patchTenantPortal(); },700);
  });
  window.addEventListener('load',()=>setTimeout(()=>{ injectTicketsMarkup(); hookNavigation(); patchTenantPortal(); },1200));
})();
