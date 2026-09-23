(function(){
  const PI_MAIL_CATEGORIES = ['Prąd','Gaz','Woda','Czynsz','Remont','Ubezpieczenie','Internet','Podatek','Inne'];
  const PI_MAIL_MAX_SENDERS = 20;
  const PI_MAIL_SCAN_HOURS = 12;
  let piMailSenders = [];
  let piMailCandidates = [];
  let piMailApprovedCandidates = [];
  let piMailConnections = [];
  let piMailReady = false;

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
  function moneyPL(v){ const n=Number(v||0); return n.toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł'; }
  function inputMoneyPL(v){ const n=Number(v||0); return n ? n.toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''; }
  function parseMoneyPL(v){
    let raw=String(v ?? '').trim();
    if(!raw) return 0;
    raw=raw.replace(/\s/g,'').replace(/zł|pln/ig,'');
    if(raw.includes(',') && raw.includes('.')) raw=raw.replace(/\./g,'').replace(',', '.');
    else raw=raw.replace(',', '.');
    raw=raw.replace(/[^0-9.\-]/g,'');
    const n=Number(raw);
    return Number.isFinite(n) ? Math.round(n*100)/100 : 0;
  }
  function removeCandidateFromPending(id){
    const sid=String(id);
    const removed=piMailCandidates.find(x=>String(x.id)===sid) || null;
    piMailCandidates=piMailCandidates.filter(x=>String(x.id)!==sid);
    return removed;
  }
  function setCandidateBusy(id,busy=true){
    const safeId=String(id).replace(/[^a-zA-Z0-9_-]/g,'');
    ['piMailApprove_'+safeId,'piMailDuplicate_'+safeId,'piMailReview_'+safeId,'piMailReject_'+safeId].forEach(btnId=>{ const b=$(btnId); if(b) b.disabled=!!busy; });
  }
  function isAdmin(){ try{ if(typeof piIsAdminLike==='function') return !!piIsAdminLike(); if(typeof piRole==='function') return piRole()==='admin'; }catch(_){} return false; }
  function props(){ return Array.isArray(window.loadedProperties) ? window.loadedProperties : (Array.isArray(loadedProperties) ? loadedProperties : []); }
  function propName(id){ const p=props().find(x=>String(x.id)===String(id)); return p ? (p.name||p.address||'Mieszkanie') : 'Nie wybrano'; }
  function statusClass(status){ return {new:'new',needs_review:'review',approved:'approved',rejected:'rejected',duplicate:'duplicate'}[status] || 'new'; }
  function statusLabel(status){ return {new:'Nowe',needs_review:'Do sprawdzenia',approved:'Zatwierdzone',rejected:'Odrzucone',duplicate:'Duplikat'}[status] || 'Nowe'; }
  function sourceLabel(source){ return {gmail_subject_ai:'AI: temat wiadomości',gmail_history_ai:'AI: temat + historia',gmail:'Gmail',manual_test:'Test ręczny'}[source] || ''; }
  function setStatus(text,type=''){ const el=$('piMailStatus'); if(!el) return; el.className='pi-mail-status '+(type||''); el.textContent=text; }
  function propertyOptions(selected='', includeAuto=true){
    let html = includeAuto ? '<option value="">Rozpoznaj automatycznie / wybierz później</option>' : '<option value="">Wybierz mieszkanie</option>';
    html += props().map(p=>`<option value="${esc(p.id)}" ${String(selected||'')===String(p.id)?'selected':''}>${esc(p.name||p.address||'Mieszkanie')}</option>`).join('');
    return html;
  }
  function categoryOptions(selected=''){
    return PI_MAIL_CATEGORIES.map(c=>`<option value="${esc(c)}" ${String(selected||'')===c?'selected':''}>${esc(c)}</option>`).join('');
  }
  function updateVisibility(){
    const card=$('piMailCostImportCard'); if(!card) return;
    const show=isAdmin();
    card.classList.toggle('hidden', !show);
    if(show && !piMailReady){ piMailReady=true; piMailInit(); }
  }
  function fillStaticSelects(){
    const cat=$('piMailSenderCategory'); if(cat && !cat.dataset.ready){ cat.innerHTML=categoryOptions('Prąd'); cat.dataset.ready='1'; }
    const prop=$('piMailSenderProperty'); if(prop) prop.innerHTML=propertyOptions('', true);
  }
  async function dbSelect(table, query){
    if(!window.db && typeof db==='undefined') throw new Error('Brak połączenia Supabase.');
    return query;
  }
  async function loadSenders(){
    const {data,error}=await db.from('trusted_email_senders').select('*').order('created_at',{ascending:false});
    if(error) throw error;
    piMailSenders=data||[];
  }
  async function loadCandidates(){
    const pending=await db.from('email_cost_candidates')
      .select('*')
      .in('status',['new','needs_review'])
      .order('created_at',{ascending:false})
      .limit(50);
    if(pending.error) throw pending.error;
    piMailCandidates=pending.data||[];

    const approved=await db.from('email_cost_candidates')
      .select('*')
      .eq('status','approved')
      .order('approved_at',{ascending:false, nullsFirst:false})
      .limit(8);
    if(approved.error) throw approved.error;
    piMailApprovedCandidates=approved.data||[];
  }
  function renderSenders(){
    const sc=$('piMailSendersCounter'); if(sc) sc.textContent=`${piMailSenders.length}/${PI_MAIL_MAX_SENDERS}`;
    const box=$('piMailSendersList'); if(!box) return;
    if(!piMailSenders.length){ box.innerHTML='<div class="pi-mail-muted-box">Nie dodano jeszcze zaufanych nadawców. Dodaj np. adres dostawcy prądu, gazu, wspólnoty albo zarządcy.</div>'; return; }
    box.innerHTML=piMailSenders.map(s=>`
      <div class="pi-mail-sender">
        <b>${esc(s.vendor_name || s.email)}</b>
        <small>${esc(s.email)} • ${esc(s.default_category || 'Inne')} • ${s.default_property_id ? esc(propName(s.default_property_id)) : 'bez stałego mieszkania'} • PDF: ${s.read_pdf===false?'nie':'tak'}</small>
        <div class="pi-mail-mini-actions">
          <span class="pi-mail-pill ${s.is_active===false?'rejected':'approved'}">${s.is_active===false?'Wyłączony':'Aktywny'}</span>
          <button type="button" class="subtle-link-btn" onclick="piMailToggleSender('${esc(s.id)}', ${s.is_active===false?'true':'false'})">${s.is_active===false?'Włącz':'Wyłącz'}</button>
          <button type="button" class="small-btn danger" onclick="piMailDeleteSender('${esc(s.id)}')">Usuń</button>
        </div>
      </div>`).join('');
  }

  function renderConnections(){
    const max=2;
    const count=Array.isArray(piMailConnections)?piMailConnections.length:0;
    const c1=$('piMailConnectionsCounter'); if(c1) c1.textContent=`${count}/${max}`;
    const c2=$('piMailConnectionsTitleCounter'); if(c2) c2.textContent=`${count}/${max}`;
    const box=$('piMailConnectionsList'); if(!box) return;
    if(!count){
      box.innerHTML='<div class="pi-mail-muted-box">Nie podłączono jeszcze żadnego konta Gmail. Użyj przycisku „Połącz Gmail” na górze modułu.</div>';
      return;
    }
    box.innerHTML=piMailConnections.map(c=>{
      const last=c.last_scan_at ? new Date(c.last_scan_at).toLocaleString('pl-PL') : 'brak skanu';
      const first=c.initial_scan_from || '2026-05-01';
      const st=c.last_scan_status ? ` • status: ${esc(c.last_scan_status)}` : '';
      return `<div class="pi-mail-account">
        <b>${esc(c.gmail_email || 'konto Gmail')}</b>
        <small>Aktywne • ostatni skan: ${esc(last)}${st}<br>Pierwszy skan od ${esc(first)}</small>
        <div class="pi-mail-mini-actions">
          <span class="pi-mail-pill approved">Aktywne</span>
          <button type="button" class="small-btn danger" onclick="piMailDisconnectGmail('${esc(c.id)}')">Odłącz</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderCandidates(){
    const box=$('piMailCandidatesList');
    const approvedBox=$('piMailApprovedList');
    const count=$('piMailCandidatesCounter');
    const approvedCount=$('piMailApprovedCounter');
    if(count) count.textContent=String(piMailCandidates.length);
    if(approvedCount) approvedCount.textContent=String(piMailApprovedCandidates.length);

    if(box){
      if(!piMailCandidates.length){
        box.innerHTML='<div class="pi-mail-muted-box">Brak faktur oczekujących na akceptację. Nowe rachunki z Gmaila pojawią się tutaj po skanie.</div>';
      }else{
        box.innerHTML=piMailCandidates.map(c=>{
          const safeId=String(c.id).replace(/[^a-zA-Z0-9_-]/g,'');
          const propSelId='piMailProp_'+safeId;
          const catSelId='piMailCat_'+safeId;
          const amountInputId='piMailAmount_'+safeId;
          const propertyId=c.suggested_property_id || c.property_id || '';
          const category=c.detected_category || 'Inne';
          const amount=Number(c.detected_amount||0);
          const needsAmount=!amount;
          const account=c.gmail_account_email ? ` → Gmail: ${esc(c.gmail_account_email)}` : '';
          return `<div class="pi-mail-candidate" id="piMailCandidate_${safeId}">
            <div class="pi-mail-candidate-top">
              <div><b>${esc(c.subject || 'Rachunek z poczty')}</b><small>${esc(c.sender_email || '')}${account} • ${c.received_at ? new Date(c.received_at).toLocaleString('pl-PL') : 'brak daty'}</small></div>
              <div class="pi-mail-amount">${moneyPL(c.detected_amount)}</div>
            </div>
            <div>
              <span class="pi-mail-pill ${statusClass(c.status)}">${statusLabel(c.status)}</span>
              <span class="pi-mail-pill">${esc(category)}</span>
              <span class="pi-mail-pill">Pewność: ${Number(c.confidence||0)}%</span>
              ${sourceLabel(c.source)?`<span class="pi-mail-pill approved">${esc(sourceLabel(c.source))}</span>`:''}
              ${needsAmount?`<span class="pi-mail-pill review">Wpisz kwotę ręcznie</span>`:''}
              ${c.detected_due_date?`<span class="pi-mail-pill">Termin: ${esc(c.detected_due_date)}</span>`:''}
              ${c.detected_invoice_number?`<span class="pi-mail-pill">FV: ${esc(c.detected_invoice_number)}</span>`:''}
            </div>
            ${c.raw_excerpt?`<small style="margin-top:8px;">${esc(c.raw_excerpt).slice(0,260)}</small>`:''}
            <div class="pi-mail-approve-row">
              <select id="${propSelId}">${propertyOptions(propertyId,false)}</select>
              <select id="${catSelId}">${categoryOptions(category)}</select>
              <div>
                <input id="${amountInputId}" class="pi-mail-amount-input ${needsAmount?'pi-mail-amount-warn':''}" inputmode="decimal" placeholder="Kwota zł" value="${esc(inputMoneyPL(amount))}">
                ${needsAmount?'<div class="pi-mail-field-note">AI nie odczytało kwoty — wpisz ręcznie.</div>':''}
              </div>
              <button id="piMailApprove_${safeId}" class="pi-mail-approve-btn" type="button" onclick="piMailApproveCandidate('${esc(c.id)}')">Zatwierdź koszt</button>
              <button id="piMailDuplicate_${safeId}" type="button" class="subtle-link-btn" onclick="piMailMarkCandidate('${esc(c.id)}','duplicate')">Duplikat</button>
            </div>
            <div class="pi-mail-mini-actions">
              <button id="piMailReview_${safeId}" type="button" class="subtle-link-btn" onclick="piMailMarkCandidate('${esc(c.id)}','needs_review')">Do sprawdzenia</button>
              <button id="piMailReject_${safeId}" type="button" class="small-btn danger" onclick="piMailMarkCandidate('${esc(c.id)}','rejected')">Odrzuć</button>
            </div>
          </div>`;
        }).join('');
      }
    }

    if(approvedBox){
      if(!piMailApprovedCandidates.length){
        approvedBox.innerHTML='<div class="pi-mail-muted-box">Brak zatwierdzonych faktur w ostatniej historii.</div>';
      }else{
        approvedBox.innerHTML=piMailApprovedCandidates.map(c=>{
          const account=c.gmail_account_email ? ` • ${esc(c.gmail_account_email)}` : '';
          const when=c.approved_at ? new Date(c.approved_at).toLocaleString('pl-PL') : (c.received_at ? new Date(c.received_at).toLocaleString('pl-PL') : 'brak daty');
          return `<div class="pi-mail-approved-item">
            <div class="pi-mail-candidate-top">
              <div><b>${esc(c.subject || 'Zatwierdzona faktura')}</b><small>${esc(c.sender_email || '')}${account} • ${when} • ${esc(propName(c.property_id || c.suggested_property_id))}</small></div>
              <div class="pi-mail-amount">${moneyPL(c.detected_amount)}</div>
            </div>
          </div>`;
        }).join('');
      }
    }
  }
  async function loadAll(){
    updateVisibility(); fillStaticSelects();
    if(!isAdmin()) return;
    try{
      await Promise.all([loadSenders(), loadCandidates()]);
      renderSenders(); renderCandidates(); renderConnections();
      setStatus(`Moduł gotowy. PureInvest AI czyta temat wiadomości i rozpoznaje mieszkanie, a kwotę może podpowiedzieć z historii wcześniejszych faktur. Zaufani nadawcy: ${piMailSenders.length}/${PI_MAIL_MAX_SENDERS}. Automat docelowo: co ${PI_MAIL_SCAN_HOURS}h.`, 'ok');
      await refreshGmailStatus();
    }catch(e){
      console.warn('PI_MAIL_LOAD_WARN', e);
      renderSenders(); renderCandidates(); renderConnections();
      setStatus('Brakuje tabel Supabase dla importu poczty. Uruchom aktualne migracje modułu Gmail. Szczegóły: '+(e.message||e), 'warn');
    }
  }
  async function addSender(){
    if(!isAdmin()) return alert('Moduł dostępny tylko dla administratora.');
    const email=($('piMailSenderEmail')?.value||'').trim().toLowerCase();
    const vendor=($('piMailSenderVendor')?.value||'').trim();
    const category=$('piMailSenderCategory')?.value||'Inne';
    const propertyId=$('piMailSenderProperty')?.value||null;
    const readPdf=!!$('piMailSenderReadPdf')?.checked;
    if(!email || !email.includes('@')) return alert('Podaj poprawny adres e-mail nadawcy.');
    if(piMailSenders.length>=PI_MAIL_MAX_SENDERS) return alert('Limit MVP to 20 zaufanych nadawców.');
    const payload={email,vendor_name:vendor||email,default_category:category,default_property_id:propertyId,read_pdf:readPdf,is_active:true,scan_interval_hours:PI_MAIL_SCAN_HOURS};
    const {error}=await db.from('trusted_email_senders').insert([payload]);
    if(error) return alert('Nie udało się dodać nadawcy. Uruchom aktualne migracje albo sprawdź duplikat. '+error.message);
    ['piMailSenderEmail','piMailSenderVendor'].forEach(id=>{const el=$(id); if(el) el.value='';});
    await loadAll();
  }
  async function toggleSender(id,active){
    const {error}=await db.from('trusted_email_senders').update({is_active:!!active,updated_at:new Date().toISOString()}).eq('id',id);
    if(error) return alert(error.message);
    await loadAll();
  }
  async function deleteSender(id){
    if(!(await window.piConfirmV770('Usunąć zaufanego nadawcę?'))) return;
    const {error}=await db.from('trusted_email_senders').delete().eq('id',id);
    if(error) return alert(error.message);
    await loadAll();
  }
  async function addTestCandidate(){
    if(!isAdmin()) return alert('Moduł dostępny tylko dla administratora.');
    const sender=piMailSenders[0] || null;
    const rawAmount = typeof window.piPromptV770 === 'function' ? await window.piPromptV770('Kwota testowego kosztu:', {title:'Testowy koszt Gmail', value:'123.45', placeholder:'123,45', okText:'Dodaj test'}) : '0';
    const amount=Number(String(rawAmount||0).replace(',', '.'));
    if(!(amount>0)) return alert('Kwota testowego kosztu musi być większa od 0.');
    const propertyId=$('piMailSenderProperty')?.value || sender?.default_property_id || activeProperty || null;
    const category=$('piMailSenderCategory')?.value || sender?.default_category || 'Inne';
    const payload={
      sender_email: sender?.email || 'test@pure-invest.pl',
      subject: 'Testowy rachunek z poczty - PureInvest OS',
      received_at: new Date().toISOString(),
      detected_vendor: sender?.vendor_name || 'Test',
      detected_amount: amount,
      detected_due_date: new Date(Date.now()+7*86400000).toISOString().slice(0,10),
      detected_category: category,
      suggested_property_id: propertyId,
      confidence: propertyId ? 82 : 40,
      status: propertyId ? 'new' : 'needs_review',
      raw_excerpt: 'Pozycja testowa utworzona ręcznie w module Import kosztów z poczty. Służy do sprawdzenia zatwierdzania kosztu.',
      source: 'manual_test'
    };
    const {error}=await db.from('email_cost_candidates').insert([payload]);
    if(error) return alert('Nie udało się dodać kandydata. Uruchom aktualne migracje PureInvest OS. '+error.message);
    await loadAll();
  }
  async function approveCandidate(id){
    const c=piMailCandidates.find(x=>String(x.id)===String(id)); if(!c) return alert('Nie znaleziono kandydata.');
    const safeId=String(id).replace(/[^a-zA-Z0-9_-]/g,'');
    const propertyId=$('piMailProp_'+safeId)?.value || c.suggested_property_id || c.property_id;
    const category=$('piMailCat_'+safeId)?.value || c.detected_category || 'Inne';
    const manualAmount=parseMoneyPL($('piMailAmount_'+safeId)?.value);
    const amount=manualAmount || Number(c.detected_amount||0);
    if(!propertyId) return alert('Wybierz mieszkanie dla kosztu.');
    if(!amount || amount<=0) return alert('Wpisz kwotę kosztu. Możesz ręcznie poprawić 0,00 zł w polu „Kwota zł”.');
    setCandidateBusy(id,true);
    const note=[
      'Import z poczty',
      c.sender_email ? 'Nadawca: '+c.sender_email : '',
      c.subject ? 'Temat: '+c.subject : '',
      c.detected_invoice_number ? 'Nr faktury: '+c.detected_invoice_number : '',
      c.detected_due_date ? 'Termin: '+c.detected_due_date : '',
      manualAmount ? 'Kwota zatwierdzona ręcznie: '+moneyPL(amount) : ''
    ].filter(Boolean).join('\n');
    const actualDate=String(c.received_at || new Date().toISOString()).slice(0,10);
    const tenancy=typeof window.piFindActiveTenancy==='function' ? await window.piFindActiveTenancy(propertyId).catch(()=>null) : null;
    let payload={property_id:propertyId,tenancy_id:tenancy?.id || null,amount,category,expense_date:actualDate,created_at:c.received_at||new Date().toISOString(),note,transaction_status:"approved",transaction_source:"gmail"};
    try{ if(window.piSettlementDictionary?.ensurePayload) payload=window.piSettlementDictionary.ensurePayload(payload, 'expense', category); }catch(_){ }
    const ins=window.piSettlementDictionary?.insertWithFallback
      ? await window.piSettlementDictionary.insertWithFallback('expenses', payload, {select:'id',single:true})
      : await db.from('expenses').insert([payload]).select('id').single();
    if(ins.error){ setCandidateBusy(id,false); return alert('Nie udało się dodać kosztu: '+ins.error.message); }
    const approvedAt=new Date().toISOString();
    const approvedPayload={status:'approved',property_id:propertyId,suggested_property_id:propertyId,detected_amount:amount,detected_category:category,approved_at:approvedAt,approved_transaction_id:ins.data?.id?String(ins.data.id):null};
    const upd=await db.from('email_cost_candidates').update(approvedPayload).eq('id',id);
    if(upd.error){ setCandidateBusy(id,false); return alert('Koszt dodany, ale nie udało się oznaczyć kandydata: '+upd.error.message); }

    const removed=removeCandidateFromPending(id) || c;
    piMailApprovedCandidates=[{...removed,...approvedPayload}, ...piMailApprovedCandidates].slice(0,8);
    renderCandidates();
    setStatus('Koszt zatwierdzony i przeniesiony do ostatnio zatwierdzonych faktur.', 'ok');
    if(typeof refreshDashboard==='function') await refreshDashboard();
    loadCandidates().then(renderCandidates).catch(e=>console.warn('PI_MAIL_REFRESH_AFTER_APPROVE_WARN', e));
  }
  async function markCandidate(id,status){
    setCandidateBusy(id,true);
    const {error}=await db.from('email_cost_candidates').update({status}).eq('id',id);
    if(error){ setCandidateBusy(id,false); return alert(error.message); }
    removeCandidateFromPending(id);
    renderCandidates();
    setStatus(status==='rejected' ? 'Faktura odrzucona i usunięta z listy do akceptacji.' : status==='duplicate' ? 'Faktura oznaczona jako duplikat i usunięta z listy do akceptacji.' : 'Status faktury zaktualizowany.', 'ok');
    loadCandidates().then(renderCandidates).catch(e=>console.warn('PI_MAIL_REFRESH_AFTER_MARK_WARN', e));
  }
  async function refreshGmailStatus(){
    if(!isAdmin()) return;
    try{
      const res=await fetch('/.netlify/functions/gmail-status',{method:'GET',headers: await window.piAuthHeadersV760()});
      const data=await res.json().catch(()=>({}));
      piMailConnections = Array.isArray(data.connections) ? data.connections : (data.connection ? [data.connection] : []);
      renderConnections();
      const badge=$('piMailScannerState');
      const count=piMailConnections.length;
      const max=Number(data.max_connections||2);
      if(data.connected && count){
        if(badge) badge.textContent=`Gmail: ${count}/${max} połączone`;
        const lastAll=piMailConnections.map(c=>c.last_scan_at).filter(Boolean).sort().pop();
        const last=lastAll ? new Date(lastAll).toLocaleString('pl-PL') : 'brak';
        setStatus(`Gmail połączony: ${count}/${max}. Pierwszy skan każdego konta od 2026-05-01, kolejne od ostatniego skanu danego konta. Ostatni skan: ${last}.`, piMailConnections.some(c=>c.last_scan_status==='error')?'warn':'ok');
      }else{
        if(badge) badge.textContent='Gmail: niepołączony';
      }
    }catch(e){
      const badge=$('piMailScannerState'); if(badge) badge.textContent='Gmail: wymaga konfiguracji';
      console.warn('PI_MAIL_STATUS_WARN', e);
    }
  }

  async function connectGmail(){
    if(!isAdmin()) return alert('Moduł dostępny tylko dla administratora.');
    setStatus('Przekierowuję do Google OAuth. Po zalogowaniu wrócisz do PureInvest OS. Tokeny nie są zapisywane w HTML.', 'warn');
    const authRes=await fetch('/.netlify/functions/gmail-auth-start?json=1',{method:'GET',headers: await window.piAuthHeadersV760()});
    const authData=await authRes.json().catch(()=>({}));
    if(!authRes.ok || !authData.ok || !authData.auth_url) return alert(authData.message || 'Nie udało się rozpocząć połączenia Gmail.');
    window.location.href=authData.auth_url;
  }
  async function scanNow(){
    if(!isAdmin()) return alert('Moduł dostępny tylko dla administratora.');
    setStatus('Skanuję Gmaila: tylko zaufani nadawcy. PureInvest AI rozpoznaje mieszkanie z tytułu wiadomości i w razie braku kwoty korzysta z historii zatwierdzonych faktur...', 'warn');
    try{
      const res=await fetch('/.netlify/functions/gmail-scan',{method:'POST',headers: await window.piAuthHeadersV760({'Content-Type':'application/json'}),body:JSON.stringify({mode:'manual',source:'pureinvest-ui',initial_scan_from:'2026-05-01'})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok || !data.ok){
        setStatus((data.message||'Skan nie powiódł się.')+' '+(data.details||''), 'warn');
      }else{
        setStatus(data.message || `Skan zakończony. Dodano ${data.candidates_created||0} kandydatów.`, 'ok');
      }
      await loadAll();
      await refreshGmailStatus();
    }catch(e){
      setStatus('Nie udało się uruchomić skanowania Gmaila. Sprawdź funkcje Netlify, zmienne środowiskowe i aktualne migracje. '+(e.message||e), 'warn');
    }
  }

  function togglePanel(id, btn){
    const el=$(id); if(!el) return;
    const isHidden=el.classList.toggle('hidden');
    if(btn) btn.classList.toggle('active', !isHidden);
  }
  async function disconnectGmail(id){
    if(!isAdmin()) return alert('Moduł dostępny tylko dla administratora.');
    if(!(await window.piConfirmV770('Odłączyć to konto Gmail od PureInvest OS?'))) return;
    try{
      const res=await fetch('/.netlify/functions/gmail-disconnect',{method:'POST',headers: await window.piAuthHeadersV760({'Content-Type':'application/json'}),body:JSON.stringify({id})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok || !data.ok) return alert(data.message || data.details || 'Nie udało się odłączyć konta Gmail.');
      setStatus(data.message || 'Konto Gmail zostało odłączone.', 'ok');
      await refreshGmailStatus();
    }catch(e){
      alert('Nie udało się odłączyć konta Gmail. '+(e.message||e));
    }
  }

  function handleGmailReturnParams(){
    try{
      const params=new URLSearchParams(window.location.search||'');
      if(params.get('gmail')==='connected'){
        setTimeout(()=>{setStatus('Gmail został połączony. Możesz kliknąć „Skanuj teraz”.', 'ok'); refreshGmailStatus();},800);
        params.delete('gmail'); params.delete('gmail_email');
        const clean=window.location.pathname+(params.toString()?('?'+params.toString()):'')+window.location.hash;
        history.replaceState(null,'',clean);
      }
      if(params.get('gmail')==='error'){
        const reason=params.get('reason')||'Nieznany błąd Google OAuth.';
        setTimeout(()=>setStatus('Nie udało się połączyć Gmaila: '+reason, 'warn'),800);
      }
    }catch(_){ }
  }
  function piMailInit(){ fillStaticSelects(); handleGmailReturnParams(); loadAll(); }
  window.piMailLoadAll=loadAll;
  window.piMailAddSender=addSender;
  window.piMailToggleSender=toggleSender;
  window.piMailDeleteSender=deleteSender;
  window.piMailAddTestCandidate=addTestCandidate;
  window.piMailApproveCandidate=approveCandidate;
  window.piMailMarkCandidate=markCandidate;
  window.piMailConnectGmail=connectGmail;
  window.piMailTogglePanel=togglePanel;
  window.piMailDisconnectGmail=disconnectGmail;
  window.piMailScanNow=scanNow;

  const oldSwitch=window.switchTab;
  if(typeof oldSwitch==='function' && !window.__piMailSwitchHook){
    window.__piMailSwitchHook=true;

  }
  const oldOpenDash=window.openDashboard;
  if(typeof oldOpenDash==='function' && !window.__piMailOpenDashHook){
    window.__piMailOpenDashHook=true;

  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{fillStaticSelects(); updateVisibility(); handleGmailReturnParams();},900));
  window.addEventListener('load',()=>setTimeout(()=>{fillStaticSelects(); updateVisibility();},1400));
})();
