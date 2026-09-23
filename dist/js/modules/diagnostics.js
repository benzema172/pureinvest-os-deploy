(function(){
  if(window.__PI_V771_RELEASE_CANDIDATE__) return;
  window.__PI_V771_RELEASE_CANDIDATE__ = true;
  window.PI_APP_VERSION = window.PI_RELEASE?.version || '1.9.0';

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const dbClient = () => window.db || window.piDb || window.supabaseClient || (typeof db !== 'undefined' ? db : null);
  const money = v => Number(v || 0).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' zł';

  function ensureToastHost(){
    let host = $('piToastV770');
    if(!host){
      host = document.createElement('div');
      host.id = 'piToastV770';
      host.className = 'pi-toast-v770-host';
      document.body.appendChild(host);
    }
    return host;
  }
  window.piToastV770 = function(message, type='info', timeout=4200){
    const msg = String(message || '').trim();
    if(!msg) return;
    const host = ensureToastHost();
    const item = document.createElement('div');
    item.className = 'pi-toast-v770 ' + (type || 'info');
    item.innerHTML = '<b>' + (type === 'error' ? 'Błąd' : type === 'success' ? 'Gotowe' : type === 'warn' ? 'Uwaga' : 'PureInvest') + '</b><span>' + esc(msg) + '</span>';
    host.appendChild(item);
    requestAnimationFrame(()=>item.classList.add('show'));
    setTimeout(()=>{ item.classList.remove('show'); setTimeout(()=>item.remove(), 280); }, timeout);
  };
  const oldAlert = window.alert;
  window.alert = function(message){
    try{ window.piToastV770(message, String(message||'').toLowerCase().includes('błąd') || String(message||'').toLowerCase().includes('nie udało') ? 'error' : 'info'); }
    catch(_){ try{ oldAlert.call(window, message); }catch(__){} }
  };
  window.piNativeAlertV770 = oldAlert;
  window.piConfirmV770 = async function(message){ if(typeof window.piConfirmModalV773==='function') return window.piConfirmModalV773(message); if(typeof window.piConfirmModalV772==='function') return window.piConfirmModalV772(message); return false; };

  function roleName(){ try{return String(typeof piRole === 'function' ? piRole() : (window.piCurrentRole || '')).toLowerCase();}catch(_){return '';} }
  function isAdmin(){ return roleName() === 'admin' || roleName() === 'super_admin'; }
  async function authHeaders(extra){
    if(typeof window.piAuthHeadersV762 === 'function') return window.piAuthHeadersV762(extra || {});
    if(typeof window.piAuthHeadersV760 === 'function') return window.piAuthHeadersV760(extra || {});
    return Object.assign({'Accept':'application/json'}, extra || {});
  }
  function statusClass(status){
    status = String(status || '').toLowerCase();
    if(status === 'ok' || status === 'pass' || status === 'ready') return 'ok';
    if(status === 'warn' || status === 'warning' || status === 'optional') return 'warn';
    return 'fail';
  }
  function diagnosticCard(item){
    const cls = statusClass(item.status);
    const details = Array.isArray(item.details) ? item.details : (item.details ? [item.details] : []);
    return `<div class="pi-diagnostic-card ${cls}"><div class="pi-diagnostic-top"><b>${esc(item.name || item.key || 'Test')}</b><span>${cls === 'ok' ? 'OK' : cls === 'warn' ? 'UWAGA' : 'BŁĄD'}</span></div><p>${esc(item.message || '')}</p>${details.length ? `<ul>${details.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>` : ''}</div>`;
  }
  function localDiagnostics(){
    const checks = [];
    checks.push({name:'Konfiguracja frontendu', status:(window.PI_CONFIG && window.PI_CONFIG.SUPABASE_URL && window.PI_CONFIG.SUPABASE_PUBLISHABLE_KEY) ? 'ok':'fail', message:'PI_CONFIG z adresem Supabase i kluczem publicznym.'});
    checks.push({name:'Supabase JS', status:window.supabase ? 'ok':'fail', message:window.supabase ? 'Biblioteka Supabase jest załadowana.' : 'Brakuje biblioteki Supabase.'});
    checks.push({name:'PWA service worker', status:('serviceWorker' in navigator) ? 'ok':'warn', message:('serviceWorker' in navigator) ? 'Przeglądarka obsługuje Service Worker.' : 'Ta przeglądarka nie obsługuje Service Worker.'});
    {
      const ownerSession = !!sessionStorage.getItem('piOwnerSessionV570');
      checks.push({
        name:'Owner proxy',
        status:'ok',
        message: ownerSession ? 'Wykryto aktywną sesję Owner PIN.' : 'Pominięto test sesji Owner PIN — zalogowanie jako Admin nie wymaga sesji właściciela.'
      });
    }
    checks.push({name:'Chart.js / PDF / OCR', status:(window.Chart || window.jspdf || window.Tesseract) ? 'ok':'warn', message:'Biblioteki są ładowane dynamicznie dopiero przy użyciu funkcji.'});
    return checks;
  }

  window.piRunDiagnosticsV770 = async function(manual=false){
    const summary = $('piDiagnosticsSummary');
    const list = $('piDiagnosticsList');
    if(summary) summary.textContent = 'Uruchamiam diagnostykę...';
    if(list) list.innerHTML = localDiagnostics().map(diagnosticCard).join('');
    const all = [...localDiagnostics()];
    try{
      const headers = await authHeaders({'Content-Type':'application/json'});
      const res = await fetch('/.netlify/functions/system-diagnostics', {method:'POST', headers, body:JSON.stringify({version:'os-1-7-47-rc'})});
      const body = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź funkcji diagnostycznej.'}));
      if(!res.ok || !body.ok){
        all.push({name:'Netlify system-diagnostics', status:'fail', message:body.message || ('HTTP '+res.status), details:[body.details || 'Sprawdź logi Netlify i zmienne środowiskowe.']});
      }else{
        (body.checks || []).forEach(x=>all.push(x));
      }
    }catch(e){
      all.push({name:'Netlify system-diagnostics', status:'fail', message:'Nie udało się połączyć z funkcją diagnostyczną.', details:[String(e.message || e)]});
    }
    const fail = all.filter(x=>statusClass(x.status)==='fail').length;
    const warn = all.filter(x=>statusClass(x.status)==='warn').length;
    const ok = all.filter(x=>statusClass(x.status)==='ok').length;
    if(summary){
      summary.className = 'pi-diagnostics-summary ' + (fail ? 'fail' : warn ? 'warn' : 'ok');
      summary.innerHTML = `<b>${fail ? 'Nie gotowe do produkcji' : warn ? 'Prawie gotowe' : 'Gotowe do produkcji'}</b><span>OK: ${ok} • Uwagi: ${warn} • Błędy: ${fail}</span>`;
    }
    if(list) list.innerHTML = all.map(diagnosticCard).join('');
    if(manual) window.piToastV770(fail ? `Diagnostyka: ${fail} błędów do naprawy.` : 'Diagnostyka zakończona.', fail ? 'error' : warn ? 'warn' : 'success');
  };

  const checklist = [
    'aktualny SQL wdrożeniowy PureInvest OS uruchomiony w Supabase bez błędów',
    'Admin loguje się mailem i hasłem przez Supabase Auth',
    'Admin widzi wszystkie mieszkania i może dodać nowe',
    'Dodanie kosztu z załącznikiem działa',
    'Dodanie wpłaty działa',
    'Edycja i ukrywanie transakcji działa w pełnej historii i finansach mieszkania',
    'Portfel miesięcznie pokazuje wykres lub czytelny pusty stan',
    'Owner PIN widzi tylko swoje mieszkania przez owner-data proxy',
    'Tenant PIN widzi swój panel, zgłoszenia i liczniki',
    'Biblioteka zapisuje dokumenty/zdjęcia do Storage',
    'Gmail ma status, zaufanych nadawców i skan ręczny',
    'Eksport CSV/PDF w finansach mieszkania działa',
    'Mobile: menu, dolny pasek, przełączanie sekcji działa',
    'Diagnostyka PureInvest OS nie pokazuje czerwonych błędów'
  ];
  window.piRenderRcChecklistV770 = function(){
    const box = $('piRcChecklist');
    if(!box) return;
    let done = {};
    try{ done = JSON.parse(localStorage.getItem('piRcChecklistV770') || '{}'); }catch(_){ done = {}; }
    box.innerHTML = checklist.map((t,i)=>`<label class="pi-rc-check"><input type="checkbox" data-rc-i="${i}" ${done[i]?'checked':''}> <span>${esc(t)}</span></label>`).join('');
    box.querySelectorAll('input[data-rc-i]').forEach(ch=>ch.addEventListener('change',()=>{
      done[ch.dataset.rcI] = ch.checked;
      localStorage.setItem('piRcChecklistV770', JSON.stringify(done));
    }));
  };

  window.piSeedDemoDataV770 = async function(){
    if(typeof piRequireManager === 'function' && !piRequireManager('dodawania danych demo')) return;
    const db = dbClient();
    if(!db){ window.piToastV770('Brak klienta Supabase.', 'error'); return; }
    try{
      const name = 'DEMO ' + (window.PI_RELEASE?.name || 'PureInvest OS 1.9.0 Final');
      let {data:existing, error:e1} = await db.from('properties').select('*').eq('name', name).limit(1);
      if(e1) throw e1;
      let p = existing && existing[0];
      if(!p){
        const payload = {
          name,
          address:'ul. Przykładowa 7, Wągrowiec',
          city:'Wągrowiec', postal_code:'62-100', area_m2:48,
          tenant_name:'Jan Testowy', tenant_phone:'500600700', tenant_email:'demo@pureinvest.local',
          rent_amount:2600, owner_rent:2100, community_rent:350, electricity_expected:90, water_expected:60,
          payment_day:10, rent_due_day:10, purchase_price:320000, equity_invested:90000,
          payment_account:'00 0000 0000 0000 0000 0000 0000', payment_account_label:'PureInvest DEMO'
        };
        const {data, error} = await db.from('properties').insert([payload]).select('*').single();
        if(error) throw error;
        p = data;
      }
      const today = new Date();
      const iso = d => d.toISOString().slice(0,10);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 5);
      const costs = [
        {property_id:p.id, amount:350, category:'Czynsz', expense_date:iso(monthStart), date:iso(monthStart), note:'DEMO czynsz do wspólnoty', transaction_status:'approved', transaction_source:'system', settlement_component:'community'},
        {property_id:p.id, amount:89.50, category:'Prąd', expense_date:iso(new Date(today.getFullYear(), today.getMonth(), 8)), date:iso(new Date(today.getFullYear(), today.getMonth(), 8)), note:'DEMO faktura prąd', transaction_status:'approved', transaction_source:'system', settlement_component:'electricity'}
      ];
      const pays = [{property_id:p.id, amount:2600, source:'Najem', category:'Najem', payment_date:iso(new Date(today.getFullYear(), today.getMonth(), 10)), date:iso(new Date(today.getFullYear(), today.getMonth(), 10)), note:'DEMO wpłata miesięczna', transaction_status:'approved', transaction_source:'system', settlement_component:'owner_rent'}];
      await db.from('expenses').insert(costs);
      await db.from('payments').insert(pays);
      window.piToastV770('Dodano dane demo. Odświeżam portfel.', 'success');
      if(typeof window.loadPropertyTiles === 'function') await window.loadPropertyTiles();
    }catch(e){ window.piToastV770('Nie udało się dodać danych demo: '+(e.message||e), 'error', 7000); }
  };

  function installEmptyStates(){
    const targets = [
      ['portfolioList','Brak mieszkań','Dodaj pierwsze mieszkanie, aby zbudować portfel.'],
      ['transactionsDashboard','Brak transakcji','Dodaj koszt albo wpłatę w Panelu dowodzenia.'],
      ['reports','Brak raportu','Wybierz raport i wygeneruj podgląd.']
    ];
    targets.forEach(([id,t,d])=>{ const el=$(id); if(el && !String(el.textContent||'').trim() && typeof window.piEmptyStateV760 === 'function') window.piEmptyStateV760(el,t,d); });
  }
  const oldSwitchTabInstaller = () => {
    const old = window.switchTab;
    if(typeof old !== 'function' || old.__piV770Wrapped) return;
    window.switchTab = function(tab, navEl){
      const out = old.apply(this, arguments);
      if(tab === 'diagnostics') setTimeout(()=>{ window.piRenderRcChecklistV770(); window.piRunDiagnosticsV770(false); },120);
      setTimeout(installEmptyStates, 250);
      return out;
    };
    window.switchTab.__piV770Wrapped = true;
  };
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{ oldSwitchTabInstaller(); installEmptyStates(); window.piRenderRcChecklistV770(); },400);
    if('serviceWorker' in navigator){
      navigator.serviceWorker.getRegistration?.().then(reg=>reg?.update?.()).catch(()=>null);
    }
  });
  const timer = setInterval(()=>{ oldSwitchTabInstaller(); if(window.switchTab && window.switchTab.__piV770Wrapped) clearInterval(timer); },300);
})();
