(function(){
  if(window.__PI_V773_FINAL_CLOSURE__) return;
  window.__PI_V773_FINAL_CLOSURE__ = true;
  window.PI_APP_VERSION = window.PI_RELEASE?.version || '1.9.19';

  const STORAGE_BUCKETS = new Set(['property-documents','property-photos','transaction-attachments']);
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function toast(msg,type='info'){
    try{ if(typeof window.piToastV770 === 'function') return window.piToastV770(msg,type); }catch(_){ }
    try{ if(typeof window.piToastV760 === 'function') return window.piToastV760(msg,type); }catch(_){ }
    console.log('[PureInvest]', msg);
  }
  async function authHeaders(extra){
    if(typeof window.piAuthHeadersV762 === 'function') return window.piAuthHeadersV762(extra || {});
    if(typeof window.piAuthHeadersV760 === 'function') return window.piAuthHeadersV760(extra || {});
    return Object.assign({'Accept':'application/json'}, extra || {});
  }
  function roleName(){ try{return String(typeof window.piRole === 'function' ? window.piRole() : (window.piCurrentRole || '')).toLowerCase();}catch(_){return '';} }
  function isAdmin(){ return roleName()==='admin' || roleName()==='super_admin'; }

  function ensureModalHost(){
    let host = $('piModalV772') || $('piModalV773');
    if(!host){ host = document.createElement('div'); host.id='piModalV772'; host.className='pi-modal-v772 hidden'; document.body.appendChild(host); }
    return host;
  }
  window.piConfirmModalV773 = function(message, opts={}){
    if(typeof window.piConfirmModalV772 === 'function') return window.piConfirmModalV772(message, opts);
    return new Promise(resolve=>{
      const host = ensureModalHost();
      host.innerHTML = `<div class="pi-modal-v772-backdrop"></div><div class="pi-modal-v772-card"><h3>${esc(opts.title||'Potwierdź działanie')}</h3><p>${esc(message)}</p><div class="pi-modal-v772-actions"><button type="button" class="subtle-link-btn" data-no>${esc(opts.cancelText||'Anuluj')}</button><button type="button" data-yes>${esc(opts.okText||'Potwierdzam')}</button></div></div>`;
      host.classList.remove('hidden');
      const close = val => { host.classList.add('hidden'); host.innerHTML=''; resolve(!!val); };
      host.querySelector('[data-no]').onclick = () => close(false);
      host.querySelector('[data-yes]').onclick = () => close(true);
      host.querySelector('.pi-modal-v772-backdrop').onclick = () => close(false);
    });
  };
  window.piPromptModalV773 = function(message, opts={}){
    return new Promise(resolve=>{
      const host = ensureModalHost();
      host.innerHTML = `<div class="pi-modal-v772-backdrop"></div><div class="pi-modal-v772-card"><h3>${esc(opts.title||'Uzupełnij dane')}</h3><p>${esc(message)}</p><input class="pi-modal-input-v773" data-input value="${esc(opts.value||'')}" placeholder="${esc(opts.placeholder||'')}" /><div class="pi-modal-v772-actions"><button type="button" class="subtle-link-btn" data-no>${esc(opts.cancelText||'Anuluj')}</button><button type="button" data-yes>${esc(opts.okText||'Zapisz')}</button></div></div>`;
      host.classList.remove('hidden');
      const input = host.querySelector('[data-input]');
      setTimeout(()=>input && input.focus(), 40);
      const close = val => { const out = val ? String(input?.value ?? '') : null; host.classList.add('hidden'); host.innerHTML=''; resolve(out); };
      host.querySelector('[data-no]').onclick = () => close(false);
      host.querySelector('[data-yes]').onclick = () => close(true);
      host.querySelector('.pi-modal-v772-backdrop').onclick = () => close(false);
      input?.addEventListener('keydown', ev=>{ if(ev.key==='Enter') close(true); if(ev.key==='Escape') close(false); });
    });
  };

  function parseStorageValue(value){
    if(!value) return null;
    let u; try{ u = new URL(value, location.origin); }catch(_){ return null; }
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if(!m) return null;
    const bucket = decodeURIComponent(m[1] || '');
    let path = decodeURIComponent(m[2] || '');
    path = path.replace(/\?.*$/, '');
    if(!STORAGE_BUCKETS.has(bucket) || !path || path.includes('..')) return null;
    return {bucket,path};
  }
  async function signedUrl(bucket, path){
    if(typeof window.piSignedStorageUrlV772 === 'function') return window.piSignedStorageUrlV772(bucket, path);
    const headers = await authHeaders({'Content-Type':'application/json'});
    const res = await fetch('/.netlify/functions/storage-url', {method:'POST', headers, body:JSON.stringify({bucket,path,expiresIn:900})});
    const body = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź storage-url.'}));
    if(!res.ok || !body.ok || !body.signedUrl) throw new Error(body.message || body.details || ('HTTP '+res.status));
    return body.signedUrl;
  }
  window.piSignedStorageUrlV773 = signedUrl;

  async function signElement(el){
    if(!el || el.dataset.piSignedV773 === 'done' || el.dataset.piSignedV773 === 'loading') return;
    const attr = el.tagName === 'IMG' ? 'src' : 'href';
    const val = el.getAttribute(attr);
    const parsed = parseStorageValue(val);
    if(!parsed) return;
    el.dataset.piSignedV773 = 'loading';
    try{
      if(el.tagName === 'IMG'){
        el.classList.add('pi-img-signing-v773');
        el.alt = el.alt || 'Zdjęcie PureInvest';
      }
      const url = await signedUrl(parsed.bucket, parsed.path);
      el.setAttribute(attr, url);
      el.dataset.piSignedV773 = 'done';
      el.classList.remove('pi-img-signing-v773');
    }catch(e){
      el.dataset.piSignedV773 = 'error';
      if(el.tagName === 'IMG') el.classList.add('pi-img-sign-error-v773');
      console.warn('PureInvest signed thumbnail skipped:', e?.message || e);
    }
  }
  function scanSignedStorage(root=document){
    try{ root.querySelectorAll?.('img[src],a[href]').forEach(el=>signElement(el)); }catch(_){ }
  }
  window.piRefreshSignedStorageV773 = scanSignedStorage;
  const observer = new MutationObserver(muts=>{
    if(window.__piSignedScanQueuedV773) return;
    window.__piSignedScanQueuedV773 = true;
    setTimeout(()=>{ window.__piSignedScanQueuedV773=false; scanSignedStorage(document); }, 120);
  });
  document.addEventListener('DOMContentLoaded',()=>{
    scanSignedStorage(document);
    try{ observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','href']}); }catch(_){ }
  });

  async function fileToBase64(file){
    const buf = await file.arrayBuffer();
    let binary='';
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for(let i=0;i<bytes.length;i+=chunk){ binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk)); }
    return btoa(binary);
  }
  window.piStorageUploadV773 = async function({file,bucket,propertyId,folder,tenantToken}){
    if(!file) return null;
    const base64 = await fileToBase64(file);
    const headers = await authHeaders({'Content-Type':'application/json'});
    const res = await fetch('/.netlify/functions/storage-upload', {method:'POST', headers, body:JSON.stringify({bucket, propertyId, folder, tenantToken, fileName:file.name, contentType:file.type || 'application/octet-stream', base64})});
    const data = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź uploadu.'}));
    if(!res.ok || !data.ok) throw new Error(data.message || data.details || ('HTTP '+res.status));
    return { attachment_url:data.attachment_url, attachment_path:data.attachment_path, attachment_name:data.attachment_name };
  };

  window.tenantSubmitIssueV54 = async function(){
    const msg = $('tenantIssueMsg');
    const session = JSON.parse(sessionStorage.getItem('piTenantSessionV54') || 'null');
    if(!session || !session.property){ if(msg) msg.textContent='Sesja najemcy wygasła. Zaloguj się ponownie.'; return; }
    const title = $('tenantIssueTitle')?.value.trim() || '';
    const description = $('tenantIssueDescription')?.value.trim() || '';
    const file = $('tenantIssuePhoto')?.files?.[0] || null;
    if(!title || !description){ if(msg) msg.textContent='Podaj krótki tytuł i opis awarii.'; return; }
    try{
      if(msg) msg.textContent = file ? 'Wysyłam zdjęcie i zgłoszenie...' : 'Wysyłam zgłoszenie...';
      let attachment = null;
      if(file){
        attachment = await window.piStorageUploadV773({file, bucket:'property-documents', propertyId:session.property.id, folder:'maintenance', tenantToken:session.tenantToken});
      }
      const res = await fetch('/.netlify/functions/tenant-maintenance', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({propertyId:session.property.id, tenantToken:session.tenantToken, title, description, attachment})});
      const data = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź serwera.'}));
      if(!res.ok || !data.ok) throw new Error(data.message || data.details || 'Nie udało się wysłać zgłoszenia.');
      if($('tenantIssueTitle')) $('tenantIssueTitle').value='';
      if($('tenantIssueDescription')) $('tenantIssueDescription').value='';
      if($('tenantIssuePhoto')) $('tenantIssuePhoto').value='';
      if(msg) msg.textContent=data.sandbox ? 'Zgłoszenie dodano demonstracyjnie — bez zapisu w bazie.' : 'Zgłoszenie zostało wysłane.';
      session.issues = data.issues || session.issues || [];
      sessionStorage.setItem('piTenantSessionV54', JSON.stringify(session));
      if(typeof window.renderTenantPortalV54 === 'function') window.renderTenantPortalV54(session);
      scanSignedStorage(document);
    }catch(e){ if(msg) msg.textContent='Nie udało się wysłać zgłoszenia: '+String(e.message||e); }
  };

  function tryDb(){ return window.db || window.piDb || window.supabaseClient || null; }
  async function refreshAfterTx(){
    try{ if(typeof window.refreshDashboard === 'function') await window.refreshDashboard(); }catch(_){ }
    try{ if(typeof window.refreshRentEngine === 'function') await window.refreshRentEngine(); }catch(_){ }
    try{ if(typeof window.piRenderPropertyFinance === 'function') await window.piRenderPropertyFinance(true); }catch(_){ }
    try{ if(typeof window.piRenderActivityLog === 'function') await window.piRenderActivityLog(); }catch(_){ }
  }
  window.piPropertyFinanceDelete = async function(table,id){
    try{
      if(typeof window.piRequireManager === 'function' && !window.piRequireManager('usunięcia transakcji')) return;
      const ok = await window.piConfirmModalV773('Ukryć tę transakcję? Rekord zostanie zachowany w bazie jako usunięty, bez fizycznego kasowania.', {title:'Ukryć transakcję?', okText:'Ukryj'});
      if(!ok) return;
      const db = tryDb(); if(!db) throw new Error('Brak połączenia z Supabase.');
      const {error} = await db.from(table).update({is_deleted:true, deleted_at:new Date().toISOString(), deleted_note:'Ukryto w aplikacji PureInvest'}).eq('id', id);
      if(error) throw error;
      toast('Transakcja została ukryta.', 'success');
      await refreshAfterTx();
    }catch(e){ toast('Nie udało się ukryć transakcji: '+String(e.message||e), 'error'); }
  };
  window.deleteTransaction = function(table,id){ return window.piPropertyFinanceDelete(table,id); };
  window.piDeleteFromTransactionEditModal = async function(){
    const tx = window.__piEditingTransaction; if(!tx) return;
    await window.piPropertyFinanceDelete(tx.table, tx.id);
    try{ if(typeof window.piCloseTransactionEditModal === 'function') window.piCloseTransactionEditModal(); }catch(_){ }
  };

  const oldDeleteLibraryItem = window.deleteLibraryItem;
  window.deleteLibraryItem = async function(kind,id,path){
    const ok = await window.piConfirmModalV773('Usunąć materiał z biblioteki?', {title:'Usunąć materiał?', okText:'Usuń'});
    if(!ok) return;
    if(typeof oldDeleteLibraryItem === 'function'){
      const nativeConfirm = window.confirm;
      window.confirm = () => true;
      try{ return await oldDeleteLibraryItem.apply(this, arguments); }
      finally{ window.confirm = nativeConfirm; }
    }
  };

  const oldMailDelete = window.piMailDeleteSender;
  window.piMailDeleteSender = async function(id){
    const ok = await window.piConfirmModalV773('Usunąć zaufanego nadawcę Gmail?', {title:'Usunąć nadawcę?', okText:'Usuń'});
    if(!ok) return;
    const nativeConfirm = window.confirm; window.confirm = () => true;
    try{ if(typeof oldMailDelete === 'function') return await oldMailDelete(id); }
    finally{ window.confirm = nativeConfirm; }
  };
  const oldMailDisconnect = window.piMailDisconnectGmail;
  window.piMailDisconnectGmail = async function(id){
    const ok = await window.piConfirmModalV773('Odłączyć konto Gmail od PureInvest?', {title:'Odłączyć Gmail?', okText:'Odłącz'});
    if(!ok) return;
    const nativeConfirm = window.confirm; window.confirm = () => true;
    try{ if(typeof oldMailDisconnect === 'function') return await oldMailDisconnect(id); }
    finally{ window.confirm = nativeConfirm; }
  };
  const oldMailTest = window.piMailAddTestCandidate;
  window.piMailAddTestCandidate = async function(){
    const raw = await window.piPromptModalV773('Kwota testowego kosztu:', {title:'Testowy koszt Gmail', placeholder:'123,45', value:'123.45', okText:'Dodaj test'});
    if(raw === null) return;
    const nativePrompt = window.prompt; window.prompt = () => raw;
    try{ if(typeof oldMailTest === 'function') return await oldMailTest(); }
    finally{ window.prompt = nativePrompt; }
  };

  const oldSeed = window.piSeedDemoDataV770;
  window.piSeedDemoDataV770 = async function(){
    if(!isAdmin()){ toast('Dane demo może dodać tylko administrator.', 'error'); return; }
    const typed = await window.piPromptModalV773('To doda przykładowe mieszkanie, płatności i koszty do AKTUALNEJ bazy. Wpisz DEMO, aby potwierdzić.', {title:'Ostateczne potwierdzenie danych demo', placeholder:'DEMO', okText:'Potwierdzam'});
    if(String(typed || '').trim().toUpperCase() !== 'DEMO') { toast('Dodawanie danych demo anulowane.', 'warn'); return; }
    if(typeof oldSeed === 'function') return oldSeed.apply(this, arguments);
    toast('Brak funkcji dodawania danych demo.', 'error');
  };

  document.addEventListener('DOMContentLoaded',()=>{
    const releaseName = window.PI_RELEASE?.name || 'PureInvest OS 1.9.19';
    document.querySelectorAll('[data-app-version], .pi-app-version').forEach(el=>{ el.textContent=releaseName; });
    const diagTitle = $('dashboardTenant'); if(diagTitle && /PureInvest OS/i.test(diagTitle.textContent||'')) diagTitle.textContent=releaseName + ' — uproszczone rozliczenia';
  });
})();
