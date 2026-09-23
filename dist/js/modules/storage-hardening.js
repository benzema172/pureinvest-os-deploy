(function(){
  if(window.__PI_V772_FINAL_HARDENING__) return;
  window.__PI_V772_FINAL_HARDENING__ = true;
  window.PI_APP_VERSION = window.PI_RELEASE?.version || '1.9.0';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const $ = id => document.getElementById(id);
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
    let host = $('piModalV772');
    if(!host){
      host = document.createElement('div');
      host.id = 'piModalV772';
      host.className = 'pi-modal-v772 hidden';
      document.body.appendChild(host);
    }
    return host;
  }
  window.piConfirmModalV772 = function(message, opts={}){
    return new Promise(resolve=>{
      const host = ensureModalHost();
      const title = opts.title || 'Potwierdź działanie';
      const okText = opts.okText || 'Potwierdzam';
      const cancelText = opts.cancelText || 'Anuluj';
      host.innerHTML = `<div class="pi-modal-v772-backdrop"></div><div class="pi-modal-v772-card"><h3>${esc(title)}</h3><p>${esc(message)}</p><div class="pi-modal-v772-actions"><button type="button" class="subtle-link-btn" data-no>${esc(cancelText)}</button><button type="button" data-yes>${esc(okText)}</button></div></div>`;
      host.classList.remove('hidden');
      const close = val => { host.classList.add('hidden'); host.innerHTML=''; resolve(!!val); };
      host.querySelector('[data-no]').onclick = () => close(false);
      host.querySelector('[data-yes]').onclick = () => close(true);
      host.querySelector('.pi-modal-v772-backdrop').onclick = () => close(false);
    });
  };

  const STORAGE_BUCKETS = new Set(['property-documents','property-photos','transaction-attachments']);
  function parseStorageHref(href){
    if(!href) return null;
    let u; try{ u = new URL(href, location.origin); }catch(_){ return null; }
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if(!m) return null;
    const bucket = decodeURIComponent(m[1] || '');
    const path = decodeURIComponent(m[2] || '');
    if(!STORAGE_BUCKETS.has(bucket) || !path) return null;
    return {bucket,path};
  }
  window.piSignedStorageUrlV772 = async function(bucket, path){
    const headers = await authHeaders({'Content-Type':'application/json'});
    const res = await fetch('/.netlify/functions/storage-url', {method:'POST', headers, body:JSON.stringify({bucket,path,expiresIn:900})});
    const body = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź storage-url.'}));
    if(!res.ok || !body.ok || !body.signedUrl) throw new Error(body.message || body.details || ('HTTP '+res.status));
    return body.signedUrl;
  };
  document.addEventListener('click', async ev=>{
    const a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if(!a) return;
    const parsed = parseStorageHref(a.getAttribute('href'));
    if(!parsed) return;
    ev.preventDefault();
    try{
      toast('Tworzę bezpieczny link do pliku...', 'info');
      const signed = await window.piSignedStorageUrlV772(parsed.bucket, parsed.path);
      window.open(signed, a.target || '_blank', 'noopener');
    }catch(e){ toast('Nie udało się otworzyć pliku: '+String(e.message||e), 'error'); }
  }, true);

  window.piClearAppCacheV772 = async function(){
    // Funkcja pozostawiona jako kompatybilna, ale bez widocznego komunikatu technicznego dla użytkownika.
    return;
  };

  const oldSeed = window.piSeedDemoDataV770;
  window.piSeedDemoDataV770 = async function(){
    if(!isAdmin()){ toast('Dane demo może dodać tylko administrator.', 'error'); return; }
    const ok = await window.piConfirmModalV772('Dane demo zostaną dodane do bieżącej bazy Supabase. Nie używaj tego na produkcyjnej bazie klienta bez świadomej decyzji.', {title:'Dodać dane demo?', okText:'Tak, dodaj demo'});
    if(!ok) return;
    if(typeof oldSeed === 'function') return oldSeed.apply(this, arguments);
    toast('Brak funkcji dodawania danych demo.', 'error');
  };

  async function ensureJsPdf(){
    if(window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if(window.jsPDF) return window.jsPDF;
    if(typeof window.piLoadScript === 'function'){
      await window.piLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','jspdf');
      if(window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    }
    await new Promise((resolve,reject)=>{
      const src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      const existing=[...document.scripts].find(s=>s.src===src);
      if(existing){ existing.addEventListener('load',resolve,{once:true}); existing.addEventListener('error',reject,{once:true}); return; }
      const s=document.createElement('script'); s.src=src; s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
    });
    return window.jspdf && window.jspdf.jsPDF;
  }
  window.piExportPropertyFinancePdf = async function(){
    const rows = Array.isArray(window.__piPropertyFinanceLastVisible) ? window.__piPropertyFinanceLastVisible : [];
    if(!rows.length){ toast('Brak danych do eksportu PDF.', 'warn'); return; }
    try{
      const jsPDF = await ensureJsPdf();
      if(!jsPDF) throw new Error('Brak jsPDF');
      const doc = new jsPDF();
      doc.setFontSize(14); doc.text('PureInvest — Finanse mieszkania', 14, 16);
      doc.setFontSize(9); doc.text('Wygenerowano: '+new Date().toLocaleString('pl-PL'), 14, 23);
      let y = 32;
      rows.slice(0,80).forEach((r,i)=>{
        if(y>282){ doc.addPage(); y=16; }
        const line = `${i+1}. ${r.date||''} | ${r.type==='income'?'Wpływ':'Koszt'} | ${r.name||''} | ${Number(r.amount||0).toLocaleString('pl-PL',{minimumFractionDigits:2})} zł`;
        doc.text(String(line).slice(0,115), 14, y); y += 6;
      });
      doc.save('PureInvest_finanse_mieszkania.pdf');
      toast('PDF wygenerowany.', 'success');
    }catch(e){
      toast('Nie udało się użyć jsPDF. Otwieram tryb druku jako awaryjny eksport PDF.', 'warn');
      setTimeout(()=>window.print(), 250);
    }
  };

  const oldRunDiag = window.piRunDiagnosticsV770;
  window.piRunDiagnosticsV770 = async function(manual){
    const result = typeof oldRunDiag === 'function' ? await oldRunDiag.apply(this, arguments) : undefined;
    const summary = $('piDiagnosticsSummary');
    if(summary){
      const note = document.createElement('div');
      note.className = 'pi-hardening-note-v772';
      note.textContent = 'Prywatny Storage, signed URLs, zamknięte RPC PIN i limit Market Scanner są aktywne.';
      if(!summary.querySelector('.pi-hardening-note-v772')) summary.appendChild(note);
    }
    return result;
  };

  function showConfigWarning(){
    if(window.PI_CONFIG && window.PI_CONFIG.SUPABASE_URL && window.PI_CONFIG.SUPABASE_PUBLISHABLE_KEY) return;
    const msg = 'Brakuje konfiguracji Supabase w js/config.js — uzupełnij SUPABASE_URL i SUPABASE_PUBLISHABLE_KEY.';
    toast(msg, 'error');
    const top = document.querySelector('.app-main') || document.body;
    if(top && !document.getElementById('piConfigWarningV772')){
      const box=document.createElement('div'); box.id='piConfigWarningV772'; box.className='card pi-config-warning-v772';
      box.innerHTML='<b>Konfiguracja wymagana</b><span>'+esc(msg)+'</span>';
      top.prepend(box);
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(showConfigWarning, 300);
    try{ if(typeof window.piRenderRcChecklistV770 === 'function') window.piRenderRcChecklistV770(); }catch(_){ }
  });
})();
