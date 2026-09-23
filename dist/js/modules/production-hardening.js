(function(){
  if(window.__PI_PRODUCTION_HARDENING_V156__) return;
  window.__PI_PRODUCTION_HARDENING_V156__ = true;

  const VERSION = window.PI_RELEASE?.name || 'PureInvest OS 1.9.0 Final';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const attr = value => esc(value).replace(/`/g, '&#96;');
  const asNum = value => {
    const n = Number(String(value ?? '').replace(/\s/g,'').replace(',','.'));
    return Number.isFinite(n) ? n : 0;
  };
  const safeCall = (fn, ...args) => { try{ if(typeof fn === 'function') return fn(...args); }catch(e){ console.warn('[PureInvest hardening]', e); } };
  const toast = (message, type='warn') => {
    try{ if(typeof window.piToastV770 === 'function') return window.piToastV770(String(message), type); }catch(_){ }
    try{ if(typeof window.piToastV761 === 'function') return window.piToastV761(String(message), type); }catch(_){ }
    try{ if(typeof window.piToastV760 === 'function') return window.piToastV760(String(message), type); }catch(_){ }
    console[type === 'warn' ? 'warn' : 'log']('[PureInvest]', message);
  };
  const dbClient = () => window.db || window.piDb || (typeof db !== 'undefined' ? db : null);
  const currentProperties = () => {
    try{ if(Array.isArray(loadedProperties)) return loadedProperties; }catch(_){ }
    return Array.isArray(window.loadedProperties) ? window.loadedProperties : [];
  };
  function setLoadedProperties(rows){
    try{ loadedProperties = rows; }catch(_){ }
    window.loadedProperties = Array.isArray(rows) ? rows : [];
  }
  function setActiveProperty(id, row){
    try{ activeProperty = id; }catch(_){ }
    try{ activePropertyData = row || null; }catch(_){ }
    window.activeProperty = id;
    window.activePropertyData = row || null;
  }
  function money(v){
    return asNum(v).toLocaleString('pl-PL', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' zł';
  }
  function subtitle(p){
    if(!p) return '👤 Brak najemcy • Wolne';
    const area = asNum(p.area_m2 || p.area || p.size_m2 || 0);
    return '👤 ' + (p.tenant_name || 'Brak najemcy') + ' • ' + (p.tenant_name ? 'Wynajęte' : 'Wolne') + (area > 0 ? ' • 📐 ' + area.toLocaleString('pl-PL') + ' m²' : '');
  }
  function roleLabel(){
    try{
      if(typeof window.piFriendSandboxActive === 'function' && window.piFriendSandboxActive()) return 'gość';
      if(typeof piRole === 'function') return piRole();
    }catch(_){ }
    return '';
  }
  function checkFriendTokenFreshness(){
    try{
      const raw = sessionStorage.getItem('piFriendSessionV1');
      if(!raw) return;
      const token = JSON.parse(raw || '{}').friendToken || '';
      const body = token.split('.')[0] || '';
      if(!body) return;
      const parsed = JSON.parse(atob(body.replace(/-/g,'+').replace(/_/g,'/')) || '{}');
      if(parsed.exp && Date.now() > Number(parsed.exp)){
        sessionStorage.removeItem('piFriendSessionV1');
        document.body.classList.remove('pi-friend-sandbox-mode');
        document.body.removeAttribute('data-pi-friend-sandbox');
      }
    }catch(_){ }
  }

  window.piEscapeHtml = window.piEscapeHtml || esc;
  window.piMoneyPL = window.piMoneyPL || money;

  function installSafePropertyTiles(){
    window.loadPropertyTiles = async function(){
      const tiles = $('propertyTiles');
      if(!tiles) return;
      tiles.textContent = 'Ładowanie mieszkań...';
      try{
        let data = [], error = null;
        if(typeof window.piSelectProperties === 'function'){
          const res = await window.piSelectProperties();
          data = res?.data || [];
          error = res?.error || null;
        }else{
          const client = dbClient();
          if(!client || typeof client.from !== 'function') throw new Error('Brak klienta bazy danych. Odśwież stronę albo sprawdź konfigurację Supabase.');
          const res = await client.from('properties').select('*').order('created_at', {ascending:false});
          data = res?.data || [];
          error = res?.error || null;
        }
        if(error) throw error;
        data = Array.isArray(data) ? data : [];
        setLoadedProperties(data);
        if(!data.length){
          tiles.innerHTML = '<div class="card"><div class="card-title">Brak mieszkań</div><p>Dodaj pierwsze mieszkanie poniżej.</p></div>';
        }else{
          const styles = ['tile-blue','tile-orange','tile-purple','tile-green'];
          tiles.innerHTML = data.map((p,i)=>{
            const id = attr(p.id || '');
            const area = asNum(p.area_m2 || p.area || p.size_m2 || 0);
            const rent = asNum(p.rent_amount || p.owner_rent || 0);
            return `<div class="tile ${styles[i % styles.length]} pi-property-tile" role="button" tabindex="0" data-pi-property-id="${id}">
              <small>Nieruchomość</small>
              <h3>${esc(p.name || 'Bez nazwy')}</h3>
              <small>👤 ${esc(p.tenant_name || 'Brak najemcy')}</small>
              ${area > 0 ? `<small>📐 ${area.toLocaleString('pl-PL')} m²</small>` : ''}
              ${rent > 0 ? `<small>💰 ${money(rent)}</small>` : ''}
              <div class="status">${p.tenant_name ? 'Wynajęte' : 'Wolne'}</div>
              <div class="tile-footer">Otwórz dashboard →</div>
            </div>`;
          }).join('');
          tiles.querySelectorAll('[data-pi-property-id]').forEach(tile=>{
            const open=()=>window.openDashboard && window.openDashboard(tile.getAttribute('data-pi-property-id'));
            tile.addEventListener('click', open);
            tile.addEventListener('keydown', ev => {
              if(ev.key === 'Enter' || ev.key === ' '){
                ev.preventDefault();
                open();
              }
            });
          });
        }
        safeCall(window.renderPropertiesList);
        safeCall(window.renderPortfolio);
        safeCall(window.decoratePropertyTilesWithDocs);
        safeCall(window.piApplyRoleUi);
      }catch(e){
        console.error(e);
        tiles.innerHTML = '<div class="card pi-error-card"><div class="card-title">Nie udało się załadować mieszkań</div><p>'+esc(e.message || e)+'</p><button type="button" onclick="loadPropertyTiles()">Spróbuj ponownie</button></div>';
      }
    };
  }

  function installRobustDashboardOpen(){
    const original = window.openDashboard;
    window.openDashboard = async function(id){
      const sid = String(id || '');
      if(!sid){ toast('Nie wybrano mieszkania.', 'warn'); return; }
      let rows = currentProperties();
      let row = rows.find(x => String(x.id) === sid) || null;
      if(!row){
        try{
          const client = dbClient();
          if(client && typeof client.from === 'function'){
            const res = await client.from('properties').select('*').eq('id', sid).maybeSingle();
            if(!res?.error && res?.data){ row = res.data; setLoadedProperties([row, ...rows.filter(x => String(x.id) !== sid)]); }
          }
        }catch(_){ }
      }
      setActiveProperty(sid, row);
      if(original && original !== window.openDashboard){
        try{ return await original.call(this, sid); }catch(e){ console.warn('[PureInvest hardening openDashboard fallback]', e); }
      }
      if($('dashboardTitle')) $('dashboardTitle').textContent = row?.name || 'Dashboard';
      if($('dashboardTenant')) $('dashboardTenant').textContent = subtitle(row);
      $('welcomeScreen')?.classList.add('hidden');
      $('appScreen')?.classList.remove('hidden');
      document.body.classList.add('authenticated','in-app');
      document.body.classList.remove('welcome-mode');
      safeCall(window.hydratePropertyForms);
      safeCall(window.switchTab, 'dashboard', document.querySelector('.nav-item'));
      setTimeout(()=>{
        safeCall(window.refreshDashboard);
        safeCall(window.refreshRentEngine);
        safeCall(window.renderV7RentEngine);
        safeCall(window.renderOwnerRentPanel);
        safeCall(window.loadLibrary);
        safeCall(window.fillStaticSelects);
        safeCall(window.updateVisibility);
        safeCall(window.piMobileLoginSafeGuard);
      },120);
    };
  }

  function installLogoutCleanup(){
    const original = window.logout;
    window.logout = async function(){
      try{ await original?.apply(this, arguments); }catch(e){ console.warn('[PureInvest logout]', e); }
      try{ sessionStorage.removeItem('piFriendSessionV1'); sessionStorage.removeItem('piOwnerSessionV570'); sessionStorage.removeItem('piTenantSessionV54'); sessionStorage.removeItem('piTenantMultiSessionV551'); sessionStorage.removeItem('piAuthHandoffV1919'); }catch(_){ }
      setLoadedProperties([]);
      setActiveProperty(null, null);
      window.piCurrentUser = null;
      document.body.classList.remove('pi-friend-sandbox-mode','authenticated','in-app','welcome-mode','mobile-menu-open');
      document.body.removeAttribute('data-pi-friend-sandbox');
      $('piFriendSandboxBanner')?.remove();
    };
  }

  function installGlobalErrorBoundary(){
    if(window.__PI_ERROR_BOUNDARY_V156__) return;
    window.__PI_ERROR_BOUNDARY_V156__ = true;
    window.addEventListener('error', ev => {
      const msg = ev?.message || 'Nieznany błąd aplikacji.';
      console.error('[PureInvest error]', msg, ev?.error || '');
      if(document.body.classList.contains('authenticated')) toast('Wykryto błąd interfejsu. Odśwież moduł albo wróć do panelu.', 'warn');
    });
    window.addEventListener('unhandledrejection', ev => {
      const reason = ev?.reason?.message || ev?.reason || 'Nieobsłużony błąd operacji.';
      console.error('[PureInvest promise]', reason);
      if(document.body.classList.contains('authenticated')) toast('Operacja nie została wykonana poprawnie: ' + String(reason).slice(0,140), 'warn');
    });
  }

  function installClientAudit(){
    window.piRunClientAuditV156 = window.piRunClientAuditV154 = function(){
      const ids = new Map();
      document.querySelectorAll('[id]').forEach(node=>{
        const id = node.id;
        ids.set(id, (ids.get(id) || 0) + 1);
      });
      const duplicateIds = [...ids.entries()].filter(([,count]) => count > 1).map(([id,count]) => ({id,count}));
      const scriptsMissing = Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src')).filter(src => src && !/^https?:/i.test(src)).filter(src => !document.querySelector(`script[src="${CSS.escape(src)}"]`));
      const required = ['loginScreen','welcomeScreen','appScreen','propertyTiles','dashboardTitle','dashboardTenant'];
      const missingRequiredIds = required.filter(id => !$(id));
      return {
        version: VERSION,
        role: roleLabel(),
        duplicateIds,
        missingRequiredIds,
        scriptsMissing,
        hasFriendSession: !!sessionStorage.getItem('piFriendSessionV1'),
        hasOwnerSession: !!sessionStorage.getItem('piOwnerSessionV570'),
        hasTenantSession: !!sessionStorage.getItem('piTenantSessionV54'),
        timestamp: new Date().toISOString()
      };
    };
  }



  function installGuestIntegrationStubs(){
    const isFriend = () => { try{ return typeof window.piFriendSandboxActive === 'function' && window.piFriendSandboxActive(); }catch(_){ return false; } };
    const setMailStatus = (text, type='warn') => {
      const el = $('piMailStatus');
      if(el){ el.className = 'pi-mail-status ' + type; el.textContent = text; }
    };
    const oldConnect = window.piMailConnectGmail;
    window.piMailConnectGmail = async function(){
      if(isFriend()){
        setMailStatus('Tryb gościa: połączenie Gmail OAuth jest wyłączone. Użyj „Dodaj testowy koszt”, aby sprawdzić przepływ akceptacji faktury.', 'warn');
        toast('Tryb gościa nie łączy prawdziwego Gmaila.', 'warn');
        return;
      }
      return oldConnect?.apply(this, arguments);
    };
    const oldScan = window.piMailScanNow;
    window.piMailScanNow = async function(){
      if(isFriend()){
        try{ if(typeof window.piMailAddTestCandidate === 'function') await window.piMailAddTestCandidate(); }catch(_){ }
        setMailStatus('Tryb gościa: skan Gmail został zasymulowany. Dodano albo odświeżono testowy koszt do akceptacji.', 'ok');
        return;
      }
      return oldScan?.apply(this, arguments);
    };
  }

  function applyVersionLabels(){
    try{ document.title = VERSION; }catch(_){ }
    document.querySelectorAll('[data-app-version], .pi-app-version').forEach(node => { node.textContent = VERSION; });
    const dash = $('dashboardTenant');
    if(dash && /PureInvest OS/i.test(dash.textContent || '')) dash.textContent = VERSION + ' — dokumenty, finanse i diagnostyka';
  }

  checkFriendTokenFreshness();
  installGlobalErrorBoundary();
  installSafePropertyTiles();
  installRobustDashboardOpen();
  installLogoutCleanup();
  installClientAudit();
  installGuestIntegrationStubs();

  document.addEventListener('DOMContentLoaded', () => {
    applyVersionLabels();
    checkFriendTokenFreshness();
    setTimeout(()=>{
      safeCall(window.piApplyRoleUi);
      safeCall(window.piFriendRenderAccessCard);
    }, 250);
  });
})();
