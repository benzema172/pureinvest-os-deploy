(function(){
  if(window.__PI_V753_APP_CORE__) return;
  window.__PI_V753_APP_CORE__ = true;

  const $ = id => document.getElementById(id);
  const dbClient = () => window.db || window.piDb || (typeof db !== 'undefined' ? db : null);
  const safeCall = (fn, ...args) => { try{ if(typeof fn === 'function') return fn(...args); }catch(e){ console.warn('PureInvest core refresh skipped:', e); } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const asNum = v => { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; };
  const moneyLocal = v => {
    try{ return typeof money === 'function' ? money(v) : asNum(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł'; }
    catch(_){ return asNum(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł'; }
  };
  function currentProperties(){
    try{ if(Array.isArray(loadedProperties)) return loadedProperties; }catch(_){ }
    return Array.isArray(window.loadedProperties) ? window.loadedProperties : [];
  }
  function setLoadedProperties(rows){
    try{ loadedProperties = rows; }catch(_){ }
    window.loadedProperties = rows;
  }
  function currentActiveProperty(){
    try{ if(typeof activeProperty !== 'undefined') return activeProperty; }catch(_){ }
    return window.activeProperty || null;
  }
  function setActiveProperty(id, data){
    try{ activeProperty = id; }catch(_){ }
    try{ activePropertyData = data || null; }catch(_){ }
    window.activeProperty = id;
    window.activePropertyData = data || null;
  }
  function activeData(){
    try{ if(typeof activePropertyData !== 'undefined') return activePropertyData || window.activePropertyData || null; }catch(_){ }
    return window.activePropertyData || null;
  }
  function setScreen(mode){
    document.body.classList.remove('welcome-mode','in-app');
    document.body.classList.add(mode === 'app' ? 'in-app' : 'welcome-mode');
    if(mode === 'app') document.body.classList.add('authenticated');
  }
  function hideLogin(){
    const login = $('loginScreen');
    if(login){ login.classList.add('hidden'); login.style.display='none'; login.style.visibility='hidden'; login.style.pointerEvents='none'; }
  }
  function showLogin(){
    const login = $('loginScreen');
    if(login){ login.classList.remove('hidden'); login.style.display=''; login.style.visibility=''; login.style.pointerEvents=''; }
  }
  function dashboardSubtitle(p){
    if(!p) return '👤 Brak najemcy • Wolne';
    const area = Number(p.area_m2 || p.area || 0);
    return '👤 '+(p.tenant_name || 'Brak najemcy')+' • '+(p.tenant_name ? 'Wynajęte' : 'Wolne')+(area>0 ? ' • 📐 '+area.toLocaleString('pl-PL')+' m²' : '');
  }

  window.showWelcome = function(options={}){
    document.body.classList.add('authenticated');
    setScreen('welcome');
    hideLogin();
    $('appScreen')?.classList.add('hidden');
    $('welcomeScreen')?.classList.remove('hidden');
    document.body.classList.add('tab-dashboard-active');
    safeCall(window.piSyncParobekAuthVisibility);
    if(!options.deferData) safeCall(window.loadPropertyTiles);
    if(!$('piRoleLabel')){
      const target = document.querySelector('#welcomeScreen h1, #welcomeScreen h2, .welcome-title, .brand');
      if(target){
        const badge=document.createElement('span');
        badge.id='piRoleLabel'; badge.className='pi-role-badge';
        try{ badge.textContent = typeof piRole === 'function' ? piRole() : ''; }catch(_){ badge.textContent=''; }
        target.appendChild(badge);
      }
    }
    safeCall(window.piApplyRoleUi);
  };

  window.backToWelcome = function(){
    $('appScreen')?.classList.add('hidden');
    $('welcomeScreen')?.classList.remove('hidden');
    setScreen('welcome');
    safeCall(window.renderPortfolio);
    safeCall(window.piMobileLoginSafeGuard);
    safeCall(window.piSyncParobekAuthVisibility);
  };

  window.logout = async function(){
    try{
      sessionStorage.removeItem('piOwnerSessionV570');
      sessionStorage.removeItem('piTenantSessionV54');
      sessionStorage.removeItem('piTenantSessionV551');
      sessionStorage.removeItem('piTenantMultiSessionV551');
      sessionStorage.removeItem('piFriendSessionV1');
      sessionStorage.removeItem('piAuthHandoffV1919');
    }catch(_){ }
    try{ await dbClient()?.auth?.signOut?.(); }catch(_){ }
    try{ delete document.body.dataset.piFriendSandbox; document.body.classList.remove('pi-friend-sandbox-mode'); }catch(_){ }
    try{ document.getElementById('piFriendSandboxBanner')?.remove(); }catch(_){ }
    document.body.classList.remove('authenticated','in-app','welcome-mode','mobile-menu-open');
    $('welcomeScreen')?.classList.add('hidden');
    $('appScreen')?.classList.add('hidden');
    showLogin();
    safeCall(window.piSyncParobekAuthVisibility);
  };

  window.loadPropertyTiles = async function(){
    const tiles = $('propertyTiles');
    if(!tiles) return;
    tiles.innerHTML = 'Ładowanie mieszkań...';
    try{
      let data=[], error=null;
      if(typeof piSelectProperties === 'function'){
        const res = await piSelectProperties(); data = res.data || []; error = res.error || null;
      }else{
        const res = await dbClient().from('properties').select('*').order('created_at',{ascending:false}); data=res.data||[]; error=res.error||null;
      }
      if(error) throw error;
      setLoadedProperties(data || []);
      if(!data?.length){
        tiles.innerHTML = '<div class="card"><div class="card-title">Brak mieszkań</div>Dodaj pierwsze mieszkanie poniżej.</div>';
      }else{
        const styles=['tile-blue','tile-orange','tile-purple','tile-green'];
        tiles.innerHTML = data.map((p,i)=>`<div class="tile ${styles[i%styles.length]}" role="button" tabindex="0" data-pi-property-id="${esc(p.id)}"><small>Nieruchomość</small><h3>${esc(p.name || 'Bez nazwy')}</h3><small>👤 ${esc(p.tenant_name || 'Brak najemcy')}</small>${p.area_m2 ? `<small>📐 ${Number(p.area_m2).toLocaleString('pl-PL')} m²</small>` : ''}<div class="status">${p.tenant_name ? 'Wynajęte' : 'Wolne'}</div><div class="tile-footer">Otwórz dashboard →</div></div>`).join('');
        tiles.querySelectorAll('[data-pi-property-id]').forEach(tile=>{
          const open = ()=>window.openDashboard(tile.dataset.piPropertyId);
          tile.addEventListener('click', open);
          tile.addEventListener('keydown', event=>{ if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); open(); } });
        });
      }
      safeCall(window.renderPropertiesList);
      safeCall(window.renderPortfolio);
      safeCall(window.decoratePropertyTilesWithDocs);
    }catch(e){
      console.error(e);
      tiles.textContent = 'Błąd ładowania mieszkań: '+(e.message || e);
    }
  };

  window.openDashboard = async function(id){
    const rows = currentProperties();
    const p = rows.find(x=>String(x.id)===String(id)) || null;
    setActiveProperty(id, p);
    if($('dashboardTitle')) $('dashboardTitle').innerText = p?.name || 'Dashboard';
    if($('dashboardTenant')) $('dashboardTenant').innerText = dashboardSubtitle(p);
    $('welcomeScreen')?.classList.add('hidden');
    $('appScreen')?.classList.remove('hidden');
    setScreen('app');
    safeCall(window.hydratePropertyForms);
    window.switchTab('dashboard', document.querySelector('.nav-item'));
    setTimeout(()=>{
      safeCall(window.refreshDashboard);
      safeCall(window.refreshRentEngine);
      safeCall(window.renderV7RentEngine);
      safeCall(window.renderOwnerRentPanel);
      safeCall(window.loadLibrary);
      safeCall(window.fillStaticSelects);
      safeCall(window.updateVisibility);
      safeCall(window.piMobileLoginSafeGuard);
      safeCall(window.decoratePropertyTilesWithDocs);
    },150);
  };

  window.switchTab = function(tab, navEl){
    if(tab === 'tenants'){
      tab = 'access';
      navEl = document.querySelector('.nav-item[onclick*=access]') || navEl;
      setTimeout(()=>{
        const btn = Array.from(document.querySelectorAll('#tab-access .pi-admin-tab-btn')).find(b => (b.textContent || '').toLowerCase().includes('najem'));
        safeCall(window.piAccessSwitchSubtab, 'tenancy', btn);
      },180);
    }
    if(tab === 'finance'){
      tab = 'transactions';
      navEl = document.querySelector('.nav-item[onclick*=transactions]') || navEl;
      setTimeout(()=>safeCall(window.piOpenTransactionsFinancePro),180);
    }
    document.querySelectorAll('.tab-view').forEach(x=>{
      const isTarget = x.id === 'tab-'+tab;
      x.classList.toggle('active', isTarget);
      x.style.display = isTarget ? '' : 'none';
    });
    const target = $('tab-'+tab);
    if(target){ target.classList.add('active'); target.style.display = ''; }
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
    if(navEl) navEl.classList.add('active');
    document.body.classList.toggle('tab-dashboard-active', tab === 'dashboard');
    if(tab === 'documents'){
      try{ const role = (typeof piRole === 'function' ? piRole() : '').toLowerCase(); if(role === 'tenant') return alert('Biblioteka jest dostępna tylko dla administratora i zarządcy.'); }catch(_){ }
      setTimeout(()=>safeCall(window.loadLibrary),80);
    }
    if(tab === 'portfolio') setTimeout(()=>safeCall(window.renderPortfolio),80);
    if(tab === 'transactions') setTimeout(()=>{ safeCall(window.piMailLoadAll); safeCall(window.piRenderPropertyFinance,true); safeCall(window.renderFinancePro); safeCall(window.piRenderActivityLog); safeCall(window.piTransactionTypesRefreshV160); safeCall(window.renderOwnerRentPanel); const btn=document.getElementById('piTransactionsFinanceProTopBtn'); if(typeof window.piTransactionsTogglePanel==='function') window.piTransactionsTogglePanel('piTransactionsFinanceProPanel', btn, 'financePro'); },120);
    if(tab === 'properties') setTimeout(()=>{ safeCall(window.renderPropertiesList); safeCall(window.syncInvestmentFieldsV727); },80);
    if(tab === 'fee-breakdowns') setTimeout(()=>safeCall(window.piRenderFeeBreakdowns,{preferActive:true}),80);
    if(tab === 'tenants') setTimeout(()=>safeCall(window.renderOwnerRentPanel),100);
  };

  window.hydratePropertyForms = function(){
    const p = activeData() || {};
    const setVal = (id,val)=>{ const n=$(id); if(n) n.value = val ?? ''; };
    setVal('editPropertyName', p.name || '');
    setVal('editPropertyAddress', p.address || '');
    setVal('editPropertyArea', p.area_m2 || p.area || '');
    setVal('editPurchasePrice', p.purchase_price || p.market_value || '');
    setVal('editPurchaseDate', p.purchase_date || '');
    setVal('editEquityInvested', p.equity_invested || '');
    setVal('tenantNameInput', p.tenant_name || '');
    setVal('tenantPhoneInput', p.tenant_phone || '');
    setVal('tenantEmailInput', p.tenant_email || '');
    setVal('leaseStartInput', p.lease_start || '');
    setVal('paymentAccountInput', p.payment_account || p.bank_account || '');
    setVal('paymentAccountLabelInput', p.payment_account_label || p.bank_account_label || '');
    setVal('rentAmountInput', p.rent_amount || '');
    setVal('paymentDayInput', p.payment_day || p.rent_due_day || '');
    setVal('ownerRentInput', p.owner_rent || p.owner_monthly_rent || p.rent || '');
    setVal('communityRentInput', p.community_rent || '');
    setVal('electricityExpectedInput', p.electricity_expected || '');
    setVal('gasExpectedInput', p.gas_expected || '');
    setVal('waterExpectedInput', p.water_expected || '');
    setVal('rentDueDayInput', p.rent_due_day || p.payment_day || '');
    setTimeout(()=>{ safeCall(window.renderOwnerRentPanel); safeCall(window.syncInvestmentFieldsV727); },0);
  };

  window.updateTenant = async function(){
    const id = currentActiveProperty();
    if(!id) return alert('Najpierw wybierz mieszkanie.');
    const payload = {
      tenant_name: $('tenantNameInput')?.value || null,
      tenant_phone: $('tenantPhoneInput')?.value || null,
      tenant_email: $('tenantEmailInput')?.value || null,
      lease_start: $('leaseStartInput')?.value || null,
      payment_account: ($('paymentAccountInput')?.value || '').trim() || null,
      payment_account_label: ($('paymentAccountLabelInput')?.value || '').trim() || null,
      rent_amount: asNum($('rentAmountInput')?.value),
      payment_day: asNum($('paymentDayInput')?.value),
      owner_rent: asNum($('ownerRentInput')?.value || $('rentAmountInput')?.value),
      community_rent: asNum($('communityRentInput')?.value),
      electricity_expected: asNum($('electricityExpectedInput')?.value),
      gas_expected: asNum($('gasExpectedInput')?.value),
      water_expected: asNum($('waterExpectedInput')?.value),
      rent_due_day: asNum($('rentDueDayInput')?.value || $('paymentDayInput')?.value)
    };
    const {error} = await dbClient().from('properties').update(payload).eq('id', id);
    if(error) return alert('Nie udało się zapisać najemcy / rozliczenia: '+error.message);
    await window.reloadActiveProperty?.();
  };

  window.updateProperty = async function(){
    if(typeof piRequireManager === 'function' && !piRequireManager('edycji nieruchomości')) return;
    const id = currentActiveProperty();
    if(!id) return alert('Najpierw wybierz mieszkanie.');
    let payload = {
      name: $('editPropertyName')?.value || null,
      address: $('editPropertyAddress')?.value || null,
      area_m2: asNum($('editPropertyArea')?.value) > 0 ? asNum($('editPropertyArea')?.value) : null,
      purchase_price: asNum($('editPurchasePrice')?.value) > 0 ? asNum($('editPurchasePrice')?.value) : null,
      purchase_date: $('editPurchaseDate')?.value || null,
      equity_invested: asNum($('editEquityInvested')?.value) > 0 ? asNum($('editEquityInvested')?.value) : null
    };
    for(let i=0;i<12;i++){
      const {error}=await dbClient().from('properties').update(payload).eq('id',id);
      if(!error){
        try{ await window.loadPropertyTiles?.(); }catch(_){ }
        await window.reloadActiveProperty?.();
        try{ await window.renderPropertiesList?.(true); }catch(_){ }
        return;
      }
      const msg=String(error.message||'');
      const m=msg.match(/Could not find the '([^']+)' column|column "([^"]+)"|column ([a-zA-Z0-9_]+) does not exist/i);
      const col=m && (m[1]||m[2]||m[3]);
      if(col && Object.prototype.hasOwnProperty.call(payload,col)){ delete payload[col]; continue; }
      return alert('Nie udało się zapisać mieszkania: '+error.message);
    }
    alert('Nie udało się zapisać mieszkania po dopasowaniu kolumn.');
  };

  window.addProperty = async function(){
    if(typeof piRequireManager === 'function' && !piRequireManager('dodawania nieruchomości')) return;
    let payload = null;
    try{ if(typeof piBuildNewPropertyPayload === 'function') payload = piBuildNewPropertyPayload(); }catch(_){ }
    if(!payload){
      const ownerRent=asNum($('newOwnerRent')?.value), community=asNum($('newCommunityRent')?.value), electricity=asNum($('newElectricityExpected')?.value), gas=asNum($('newGasExpected')?.value), water=asNum($('newWaterExpected')?.value);
      payload={
        name: ($('newPropertyName')?.value || '').trim(),
        address: ($('newPropertyAddress')?.value || '').trim(),
        area_m2: asNum($('newPropertyArea')?.value) || null,
        tenant_name: ($('newTenantName')?.value || '').trim() || null,
        rent_amount: asNum($('newRentAmount')?.value) || ownerRent+community+electricity+gas+water,
        owner_rent: ownerRent, community_rent: community, electricity_expected: electricity, gas_expected: gas, water_expected: water,
        rent_due_day: asNum($('newRentDueDay')?.value) || 10,
        payment_account: ($('newPaymentAccount')?.value || '').trim() || null,
        payment_account_label: ($('newPaymentAccountLabel')?.value || '').trim() || null
      };
    }
    if(!payload.name) return alert('Podaj nazwę mieszkania.');
    try{ if(typeof piCurrentUser !== 'undefined' && piCurrentUser?.id) payload.owner_user_id = payload.owner_user_id || piCurrentUser.id; }catch(_){ }
    let {error}=await dbClient().from('properties').insert([payload]);
    if(error && String(error.message||'').includes('owner_user_id')){ delete payload.owner_user_id; ({error}=await dbClient().from('properties').insert([payload])); }
    if(error) return alert('Nie udało się dodać mieszkania: '+error.message);
    safeCall(window.closeAddPropertyModal);
    safeCall(window.piClearNewPropertyForm);
    await window.loadPropertyTiles();
  };

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{ safeCall(window.piMobileLoginSafeGuard); safeCall(window.decoratePropertyTilesWithDocs); },300);
  });
})();
