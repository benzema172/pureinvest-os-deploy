(function(){
  if(window.__PI_SETTLEMENT_DICTIONARY_V167__) return;
  window.__PI_SETTLEMENT_DICTIONARY_V167__ = true;

  const STORE_KEY = 'piSettlementDictionaryV161';
  const LEGACY_KEY = 'piTransactionTypesV160';
  const META_KEY = 'settlement_dictionary_v161';
  const OLD_META_KEY = 'transaction_types_v160';

  const COMPONENT_LABELS = {
    owner:'Najem właścicielski', owner_rent:'Najem właścicielski', community:'Czynsz administracyjny',
    electricity:'Prąd', gas:'Gaz', water:'Woda', media:'Media inne', other:'Inne',
    deposit:'Kaucja', renovation:'Remont / koszt właściciela', service:'Serwis', tax:'Podatek', insurance:'Ubezpieczenie'
  };
  const BUILTIN = [
    {id:'sys-income-owner', kind:'income', name:'Najem', component:'owner', taxable:true, tenant_due:true, recurring:'monthly', payer:'tenant', builtin:true, active:true, scope:'system'},
    {id:'sys-income-media', kind:'income', name:'Media', component:'media', taxable:false, tenant_due:false, recurring:'', payer:'tenant', builtin:true, active:true, scope:'system'},
    {id:'sys-income-deposit', kind:'income', name:'Kaucja', component:'deposit', taxable:false, tenant_due:false, recurring:'', payer:'tenant', builtin:true, active:true, scope:'system'},
    {id:'sys-income-refund', kind:'income', name:'Zwrot kosztów', component:'other', taxable:false, tenant_due:false, recurring:'', payer:'tenant', builtin:true, active:true, scope:'system'},
    {id:'sys-exp-community', kind:'expense', name:'Czynsz administracyjny', component:'community', taxable:false, tenant_due:true, recurring:'monthly', payer:'tenant', builtin:true, active:true, scope:'system'},
    {id:'sys-exp-electricity', kind:'expense', name:'Prąd', component:'electricity', taxable:false, tenant_due:true, recurring:'monthly', payer:'tenant', builtin:true, active:true, scope:'system'},
    {id:'sys-exp-gas', kind:'expense', name:'Gaz', component:'gas', taxable:false, tenant_due:true, recurring:'monthly', payer:'tenant', builtin:true, active:true, scope:'system'},
    {id:'sys-exp-water', kind:'expense', name:'Woda', component:'water', taxable:false, tenant_due:true, recurring:'monthly', payer:'tenant', builtin:true, active:true, scope:'system'},
    {id:'sys-exp-trash', kind:'expense', name:'Śmieci', component:'other', taxable:false, tenant_due:true, recurring:'monthly', payer:'tenant', builtin:true, active:true, scope:'system'},
    {id:'sys-exp-internet', kind:'expense', name:'Internet', component:'other', taxable:false, tenant_due:false, recurring:'monthly', payer:'owner', builtin:true, active:true, scope:'system'},
    {id:'sys-exp-parking', kind:'expense', name:'Parking', component:'other', taxable:false, tenant_due:false, recurring:'monthly', payer:'owner', builtin:true, active:true, scope:'system'},
    {id:'sys-exp-renovation', kind:'expense', name:'Remont', component:'renovation', taxable:false, tenant_due:false, recurring:'', payer:'owner', builtin:true, active:true, scope:'system'},
    {id:'sys-exp-insurance', kind:'expense', name:'Ubezpieczenie', component:'insurance', taxable:false, tenant_due:false, recurring:'yearly', payer:'owner', builtin:true, active:true, scope:'system'},
    {id:'sys-exp-tax', kind:'expense', name:'Podatek', component:'tax', taxable:false, tenant_due:false, recurring:'monthly', payer:'owner', builtin:true, active:true, scope:'system'}
  ];

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, mark => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[mark]));
  const norm = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const uid = (p='pi_settlement') => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  const toNum = value => {
    if(value === null || value === undefined || value === '') return 0;
    if(typeof value === 'number') return Number.isFinite(value) ? Math.round(value*100)/100 : 0;
    let raw = String(value).trim().replace(/\s/g,'').replace(/zł|pln/ig,'');
    if(raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g,'').replace(',', '.'); else raw = raw.replace(',', '.');
    raw = raw.replace(/[^0-9.\-]/g,'');
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n*100)/100 : 0;
  };
  const money = value => toNum(value).toLocaleString('pl-PL', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' zł';
  const toast = (message, type) => {
    try{ if(typeof window.piToastV770 === 'function') return window.piToastV770(message, type || 'info'); }catch(_){ }
    try{ if(typeof window.piToast === 'function') return window.piToast(message, type || 'info'); }catch(_){ }
    console.log('[PureInvest]', message);
  };
  const dbClient = () => window.db || window.piDb || (typeof db !== 'undefined' ? db : null);
  const isFriend = () => { try{return typeof window.piFriendSandboxActive === 'function' && window.piFriendSandboxActive();}catch(_){return false;} };

  function activePropertyObj(){
    try{ if(typeof activePropertyData !== 'undefined' && activePropertyData) return activePropertyData; }catch(_){ }
    return window.activePropertyData || null;
  }
  function activePropertyId(){
    const p = activePropertyObj(); if(p?.id) return String(p.id);
    try{ if(typeof activeProperty !== 'undefined' && activeProperty) return String(activeProperty?.id || activeProperty); }catch(_){ }
    return window.activeProperty ? String(window.activeProperty?.id || window.activeProperty) : '';
  }
  function activePropertyName(){
    const p = activePropertyObj();
    return p ? (p.name || p.address || 'wybrane mieszkanie') : 'wybrane mieszkanie';
  }

  function componentGuess(kind, name){
    const n = norm(name);
    if(kind === 'income'){
      if(/kaucj|deposit/.test(n)) return 'deposit';
      if(/media|doplat|zalicz/.test(n)) return 'media';
      if(/najem|czynsz|odstepne|rent/.test(n)) return 'owner';
      return 'other';
    }
    if(/prad|energia|enea|energa|tauron|pge|electric/.test(n)) return 'electricity';
    if(/gaz|pgnig/.test(n)) return 'gas';
    if(/woda|wodoci/.test(n)) return 'water';
    if(/wspol|czynsz|administr|spoldziel/.test(n)) return 'community';
    if(/remont|napraw|serwis|meble|wyposaz/.test(n)) return 'renovation';
    if(/podatek/.test(n)) return 'tax';
    if(/ubezpiecz/.test(n)) return 'insurance';
    return 'other';
  }
  function normalizeComponent(v, kind, name){
    const raw = String(v || '').trim();
    const map = {owner_rent:'owner', owner:'owner', community:'community', electricity:'electricity', gas:'gas', water:'water', media:'media', other:'other', deposit:'deposit', renovation:'renovation', service:'service', tax:'tax', insurance:'insurance'};
    return map[raw] || componentGuess(kind, name);
  }
  function normalizeEntry(raw, fallbackKind){
    const name = String(raw?.name || raw?.label || raw?.category || raw?.source || '').trim();
    if(!name) return null;
    const kind = raw.kind === 'income' ? 'income' : (raw.kind === 'expense' ? 'expense' : (fallbackKind || 'expense'));
    const component = normalizeComponent(raw.component || raw.settlement_component, kind, name);
    const amount = toNum(raw.default_amount ?? raw.amount ?? raw.monthly_amount);
    const tenantDue = raw.tenant_due !== undefined ? !!raw.tenant_due : (raw.affects_tenant !== undefined ? !!raw.affects_tenant : (kind === 'income' ? component === 'owner' : ['community','electricity','gas','water'].includes(component)));
    const createdAt = raw.created_at || new Date().toISOString();
    return {
      id: raw.id || uid(kind),
      kind, name, component,
      default_amount: amount > 0 ? amount : null,
      recurring: raw.recurring || (raw.is_recurring ? 'monthly' : ''),
      payer: raw.payer || (tenantDue ? 'tenant' : 'owner'),
      tenant_due: tenantDue,
      taxable: raw.taxable !== undefined ? !!raw.taxable : (kind === 'income' && component === 'owner'),
      active: raw.active !== false,
      builtin: !!raw.builtin,
      scope: raw.scope || 'property',
      property_id: raw.property_id || null,
      tenancy_id: raw.tenancy_id || null,
      effective_from: raw.effective_from || raw.valid_from || null,
      effective_to: raw.effective_to || raw.valid_to || null,
      note: String(raw.note || '').trim(),
      created_at: createdAt,
      updated_at: raw.updated_at || createdAt
    };
  }
  function blankStore(){ return {version:'1.6.7', global:[], properties:{}}; }
  function loadJSON(key){ try{return JSON.parse(localStorage.getItem(key) || 'null');}catch(_){return null;} }
  function saveJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function normalizeStore(store){
    const out = blankStore();
    (store?.global || []).forEach(x=>{ const e=normalizeEntry({...x, scope:'global'}, x?.kind); if(e) out.global.push(e); });
    const props = store?.properties && typeof store.properties === 'object' ? store.properties : {};
    Object.keys(props).forEach(pid=>{
      const rawItems = Array.isArray(props[pid]) ? props[pid] : (Array.isArray(props[pid]?.items) ? props[pid].items : []);
      const items = rawItems.map(x=>normalizeEntry({...x, scope:'property', property_id:pid}, x?.kind)).filter(Boolean);
      if(items.length || props[pid]?.legacy_migrated) out.properties[String(pid)] = {items, legacy_migrated:!!props[pid]?.legacy_migrated, migrated_at:props[pid]?.migrated_at || null};
    });
    return dedupeStore(out);
  }
  function dedupeStore(store){
    const dedupe = arr => {
      const map = new Map();
      (arr||[]).forEach(item=>{
        const e=normalizeEntry(item, item.kind); if(!e) return;
        const key = e.id || (e.kind+'|'+norm(e.name)+'|'+e.scope+'|'+(e.property_id||''));
        const previous = map.get(key);
        const previousTime = Date.parse(previous?.updated_at || previous?.created_at || 0) || 0;
        const nextTime = Date.parse(e.updated_at || e.created_at || 0) || 0;
        if(!previous || nextTime >= previousTime) map.set(key, {...(previous||{}), ...e});
      });
      return Array.from(map.values());
    };
    store.global = dedupe(store.global);
    Object.keys(store.properties||{}).forEach(pid=>{
      const previous = store.properties[pid] || {};
      const items = dedupe(previous.items || []);
      store.properties[pid] = {items, legacy_migrated:!!previous.legacy_migrated, migrated_at:previous.migrated_at || null};
      if(!store.properties[pid].items.length && !store.properties[pid].legacy_migrated) delete store.properties[pid];
    });
    return store;
  }
  function migrateLegacy(){
    const legacy = loadJSON(LEGACY_KEY);
    if(!legacy) return [];
    const out = [];
    const collect = arr => (arr||[]).forEach(x=>{ const e=normalizeEntry(x, x?.kind); if(e) out.push(e); });
    collect(legacy.global);
    Object.keys(legacy.properties || {}).forEach(pid => (legacy.properties[pid] || []).forEach(x=>{
      const e=normalizeEntry({...x, scope:'property', property_id:pid}, x?.kind); if(e) out.push(e);
    }));
    return out;
  }
  function loadStore(){
    const existing = loadJSON(STORE_KEY);
    if(existing) return normalizeStore(existing);
    const store = blankStore();
    const migrated = migrateLegacy();
    migrated.forEach(e=>{
      if(e.scope === 'global') store.global.push(e);
      else if(e.property_id){ if(!store.properties[e.property_id]) store.properties[e.property_id]={items:[]}; store.properties[e.property_id].items.push(e); }
    });
    saveStore(store, false);
    return normalizeStore(store);
  }
  function saveStore(store, remote=true){
    const clean = normalizeStore(store || blankStore());
    saveJSON(STORE_KEY, clean);
    if(remote) persistRemoteStore(clean).catch(()=>{});
    return clean;
  }
  let remoteLoaded=false, remoteLoading=null;
  function mergeStores(local, remote){
    const out = normalizeStore(local || blankStore());
    const r = normalizeStore(remote || blankStore());
    out.global = dedupeStore({global:[...out.global,...r.global], properties:{}}).global;
    Object.keys(r.properties || {}).forEach(pid=>{
      if(!out.properties[pid]) out.properties[pid]={items:[]};
      const mergedBucket = dedupeStore({global:[], properties:{[pid]:{items:[...out.properties[pid].items, ...r.properties[pid].items], legacy_migrated:!!(out.properties[pid].legacy_migrated || r.properties[pid].legacy_migrated), migrated_at:out.properties[pid].migrated_at || r.properties[pid].migrated_at || null}}}).properties[pid];
      out.properties[pid] = mergedBucket || {items:[], legacy_migrated:!!(out.properties[pid].legacy_migrated || r.properties[pid].legacy_migrated)};
    });
    return out;
  }
  async function fetchRemoteStore(force){
    if(remoteLoaded && !force) return loadStore();
    if(remoteLoading && !force) return remoteLoading;
    remoteLoading = (async()=>{
      const client = dbClient();
      if(!client || isFriend()){ remoteLoaded=true; return loadStore(); }
      try{
        const relational = await client.from('pi_settlement_items').select('*').order('updated_at',{ascending:true});
        if(!relational.error && Array.isArray(relational.data) && relational.data.length){
          const remote = blankStore();
          relational.data.forEach(raw=>{
            const entry=normalizeEntry(raw,raw.kind); if(!entry) return;
            if(entry.scope==='global' || !entry.property_id) remote.global.push(entry);
            else{ const pid=String(entry.property_id); if(!remote.properties[pid]) remote.properties[pid]={items:[]}; remote.properties[pid].items.push(entry); }
          });
          const merged=mergeStores(loadStore(),remote); saveStore(merged,false); remoteLoaded=true; return merged;
        }
        let {data, error} = await client.from('pi_app_meta').select('value').eq('key', META_KEY).maybeSingle();
        if(error) throw error;
        if(!data){
          const old = await client.from('pi_app_meta').select('value').eq('key', OLD_META_KEY).maybeSingle();
          if(!old.error && old.data) data = old.data;
        }
        const merged = mergeStores(loadStore(), data?.value || null);
        saveStore(merged, false);
        remoteLoaded=true;
        return merged;
      }catch(e){
        remoteLoaded=true;
        console.warn('PureInvest: zdalny słownik rozliczeń niedostępny, używam localStorage.', e?.message || e);
        return loadStore();
      }finally{ remoteLoading=null; }
    })();
    return remoteLoading;
  }
  async function persistRemoteStore(store){
    const client = dbClient(); if(!client || isFriend()) return;
    try{
      const clean=normalizeStore(store);
      const items=[...(clean.global||[]),...Object.values(clean.properties||{}).flatMap(bucket=>bucket.items||[])].map(item=>({
        id:item.id,property_id:item.property_id || null,tenancy_id:item.tenancy_id || null,scope:item.scope || (item.property_id?'property':'global'),kind:item.kind,name:item.name,component:item.component,default_amount:item.default_amount,recurring:item.recurring || '',payer:item.payer || 'tenant',tenant_due:item.tenant_due!==false,taxable:!!item.taxable,active:item.active!==false,effective_from:item.effective_from || null,effective_to:item.effective_to || null,note:item.note || null,created_at:item.created_at || new Date().toISOString(),updated_at:item.updated_at || new Date().toISOString()
      }));
      if(items.length){ const relational=await client.from('pi_settlement_items').upsert(items,{onConflict:'id'}); if(relational.error && !/pi_settlement_items/i.test(relational.error.message || '')) throw relational.error; }
      const payload = {key:META_KEY, value:normalizeStore(store), updated_at:new Date().toISOString()};
      const res = await client.from('pi_app_meta').upsert(payload, {onConflict:'key'});
      if(res.error) throw res.error;
    }catch(e){ console.warn('PureInvest: nie zapisano słownika rozliczeń w Supabase.', e?.message || e); }
  }

  function propertyBucket(pid=activePropertyId()){
    const store = loadStore();
    return store.properties[String(pid)] || null;
  }
  function propertyItems(pid=activePropertyId()){
    const store = loadStore();
    return (store.properties[String(pid)]?.items || []).map(x=>normalizeEntry({...x, scope:'property', property_id:pid}, x.kind)).filter(Boolean);
  }
  function globalItems(){ return loadStore().global.map(x=>normalizeEntry({...x, scope:'global'}, x.kind)).filter(Boolean); }
  function allDefinitions(kind, includeInactive=false){
    const map = new Map();
    [...BUILTIN, ...globalItems(), ...propertyItems()].forEach(raw=>{
      const e = normalizeEntry(raw, raw.kind); if(!e || e.kind !== kind || (!includeInactive && e.active === false)) return;
      const key = norm(e.name);
      if(!map.has(key) || !e.builtin) map.set(key, e);
    });
    return Array.from(map.values());
  }
  function findDefinition(kind, name){
    const key = norm(name);
    return allDefinitions(kind, true).find(x=>norm(x.name) === key) || null;
  }
  function tenantRecurringItems(pid=activePropertyId()){
    return propertyItems(pid).filter(x => x.active !== false && x.recurring === 'monthly' && x.tenant_due !== false && x.payer !== 'owner');
  }
  function ownerRecurringItems(pid=activePropertyId()){
    return propertyItems(pid).filter(x => x.active !== false && x.recurring === 'monthly' && (x.payer === 'owner' || x.tenant_due === false));
  }
  function hasCustomMonthlyItems(pid=activePropertyId()){
    return propertyItems(pid).some(x=>x.active !== false && x.recurring === 'monthly');
  }
  function legacyItemsFromProperty(property=activePropertyObj()){
    const p = property || {}; const pid = String(p.id || activePropertyId() || '');
    const list = [];
    const add = (id, kind, name, component, amount, payer='tenant', tenant_due=true, taxable=false) => {
      const n = toNum(amount); if(n <= 0) return;
      list.push(normalizeEntry({id:'legacy-'+id, kind, name, component, default_amount:n, recurring:'monthly', payer, tenant_due, taxable, scope:'property', property_id:pid, active:true, note:'Pozycja utworzona automatycznie ze starych pól mieszkania.'}));
    };
    add('owner','income','Najem','owner', p.owner_rent ?? p.rent_amount ?? p.monthly_rent, 'tenant', true, true);
    add('community','expense','Czynsz administracyjny','community', p.community_rent, 'tenant', true, false);
    add('electricity','expense','Prąd','electricity', p.electricity_expected, 'tenant', true, false);
    add('gas','expense','Gaz','gas', p.gas_expected, 'tenant', true, false);
    add('water','expense','Woda','water', p.water_expected, 'tenant', true, false);
    return list;
  }
  function effectiveMonthlyItems(property=activePropertyObj(), key){
    const pid = String(property?.id || activePropertyId() || '');
    const selected=String(key || (window.PureInvestPaymentPeriod?.normalizeMonth?.(new Date()) || new Date().toISOString().slice(0,7))).slice(0,7);
    const own = propertyItems(pid).filter(x => {
      if(x.active === false || x.recurring !== 'monthly') return false;
      const from=String(x.effective_from || '').slice(0,7), to=String(x.effective_to || '').slice(0,7);
      return (!from || from<=selected) && (!to || to>=selected);
    });
    const bucket = propertyBucket(pid);
    if(own.length || bucket?.legacy_migrated) return own;
    return legacyItemsFromProperty(property).map(item=>({...item,effective_from:property?.lease_start || property?.rent_start || null}));
  }
  function autoMigrateLegacyForProperty(property=activePropertyObj()){
    const pid = String(property?.id || activePropertyId() || '');
    if(!pid) return false;
    const store = loadStore();
    const bucket = store.properties[pid] || {};
    const own = (bucket.items || []).filter(x => normalizeEntry({...x, scope:'property', property_id:pid}, x.kind)?.recurring === 'monthly');
    if(own.length || bucket.legacy_migrated) return false;
    const legacy = legacyItemsFromProperty(property).filter(Boolean);
    if(!legacy.length) return false;
    store.properties[pid] = Object.assign({}, bucket, {
      legacy_migrated:true,
      migrated_at:new Date().toISOString(),
      items: legacy.map(item => Object.assign({}, item, {
        id: uid('fixed'),
        builtin:false,
        definition_id:null,
        scope:'property',
        property_id:pid,
        effective_from:item.effective_from || property?.lease_start || property?.rent_start || null,
        note: item.note || 'Przeniesione automatycznie ze starych pól mieszkania, aby można było edytować pozycję w Stałym rozliczeniu.'
      }))
    });
    saveStore(store);
    return true;
  }
  function monthlyTenantTotal(property=activePropertyObj()){
    return effectiveMonthlyItems(property).filter(x=>x.tenant_due !== false && x.payer !== 'owner').reduce((s,x)=>s+toNum(x.default_amount),0);
  }
  function legacyTotalsFromItems(items){
    const totals = {owner_rent:0, community_rent:0, electricity_expected:0, gas_expected:0, water_expected:0, other_expected:0, rent_amount:0};
    (items||[]).forEach(item=>{
      if(item.active === false || item.recurring !== 'monthly' || item.tenant_due === false || item.payer === 'owner') return;
      const amount = toNum(item.default_amount);
      if(item.kind === 'income' && item.component === 'owner') totals.owner_rent += amount;
      else if(item.component === 'community') totals.community_rent += amount;
      else if(item.component === 'electricity') totals.electricity_expected += amount;
      else if(item.component === 'gas') totals.gas_expected += amount;
      else if(item.component === 'water') totals.water_expected += amount;
      else totals.other_expected += amount;
    });
    totals.rent_amount = totals.owner_rent + totals.community_rent + totals.electricity_expected + totals.gas_expected + totals.water_expected + totals.other_expected;
    return totals;
  }
  function syncLegacyInputs(items=effectiveMonthlyItems()){
    const totals = legacyTotalsFromItems(items);
    const set = (id,val)=>{ const el=$(id); if(el) el.value = val ? String(val) : ''; };
    set('ownerRentInput', totals.owner_rent);
    set('communityRentInput', totals.community_rent);
    set('electricityExpectedInput', totals.electricity_expected);
    set('gasExpectedInput', totals.gas_expected);
    set('waterExpectedInput', totals.water_expected);
    set('rentAmountInput', totals.rent_amount);
    const total = $('tenantExpectedTotal'); if(total) total.textContent = money(totals.rent_amount);
    const mini = $('piTenantCardExpectedTotal'); if(mini) mini.textContent = money(totals.rent_amount);
    const pairs = [['tenantOwnerRentView',totals.owner_rent],['tenantCommunityRentView',totals.community_rent],['tenantElectricityView',totals.electricity_expected],['tenantGasView',totals.gas_expected],['tenantWaterView',totals.water_expected]];
    pairs.forEach(([id,val])=>{ const el=$(id); if(el) el.textContent = money(val); });
  }
  function componentOptions(selected){
    return Object.keys(COMPONENT_LABELS).filter(k=>k !== 'owner_rent').map(k=>`<option value="${esc(k)}" ${String(selected||'')===k?'selected':''}>${esc(COMPONENT_LABELS[k])}</option>`).join('');
  }
  function kindLabel(kind){ return kind === 'income' ? 'Wpływ' : 'Koszt'; }
  function recurringLabel(v){ return {monthly:'co miesiąc', quarterly:'co kwartał', yearly:'co rok'}[v] || 'ręcznie'; }
  function payerLabel(item){ if(item.tenant_due !== false && item.payer !== 'owner') return 'płaci najemca'; return 'koszt właściciela / poza należnością'; }

  function fixedDefinitionRows(){
    const rows=[...BUILTIN, ...globalItems()].filter(x=>x.active!==false);
    const seen=new Set();
    return rows.filter(item=>{
      const key=item.kind+'|'+norm(item.name);
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function fillTenantDefinitionSelect(){
    const select=$('piTenantSettlementDefinition'); if(!select) return;
    const previous=select.value;
    const rows=fixedDefinitionRows();
    const groups={income:[], expense:[]}; rows.forEach(x=>groups[x.kind].push(x));
    const render=(label, arr)=> arr.length ? `<optgroup label="${esc(label)}">${arr.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · ${esc(COMPONENT_LABELS[item.component] || item.component)}</option>`).join('')}</optgroup>` : '';
    select.innerHTML='<option value="">Wybierz typ ze słownika albo wpisz nowy niżej</option>'+render('Wpływy', groups.income)+render('Koszty', groups.expense);
    if(previous) select.value=previous;
  }
  function applyTenantDefinition(id){
    const item=fixedDefinitionRows().find(x=>String(x.id)===String(id)); if(!item) return;
    if($('piTenantSettlementKind')) $('piTenantSettlementKind').value=item.kind;
    if($('piTenantSettlementName')) $('piTenantSettlementName').value=item.name;
    if($('piTenantSettlementComponent')) $('piTenantSettlementComponent').value=item.component || (item.kind==='income'?'owner':'other');
    if($('piTenantSettlementPayer')) $('piTenantSettlementPayer').value=(item.payer === 'owner' || item.tenant_due === false) ? 'owner' : 'tenant';
    if($('piTenantSettlementTaxable')) $('piTenantSettlementTaxable').value=item.taxable ? 'yes' : 'no';
    if($('piTenantSettlementNote') && item.note && !$('piTenantSettlementNote').value) $('piTenantSettlementNote').value=item.note;
  }

  function fillSelect(select, kind){
    if(!select) return;
    const previous = select.value;
    const rows = allDefinitions(kind, false);
    const system = rows.filter(x=>x.builtin);
    const global = rows.filter(x=>!x.builtin && x.scope === 'global');
    const property = rows.filter(x=>!x.builtin && x.scope === 'property');
    const html = [];
    const group = (label, arr) => { if(!arr.length) return; html.push(`<optgroup label="${esc(label)}">`); arr.forEach(item=>html.push(`<option value="${esc(item.name)}" data-component="${esc(item.component)}">${esc(item.name)}${item.default_amount ? ' · '+esc(money(item.default_amount)) : ''}</option>`)); html.push('</optgroup>'); };
    group('Systemowe', system); group('Słownik globalny', global); group('Stałe pozycje mieszkania', property);
    if(previous && !rows.some(x=>norm(x.name)===norm(previous))) html.push(`<option value="${esc(previous)}">${esc(previous)}</option>`);
    select.innerHTML = html.join('') || '<option>Inne</option>';
    if(previous) select.value = previous;
    if(!select.dataset.piSettlementBound){
      select.dataset.piSettlementBound = '1';
      select.addEventListener('change', () => applyTemplateToForm(kind, select.value));
    }
  }
  function syncAllSelects(){
    fillSelect($('costCategory'), 'expense');
    fillSelect($('paymentSource'), 'income');
    const mail = $('piMailSenderCategory');
    if(mail){ fillSelect(mail, 'expense'); mail.dataset.ready='1'; }
    const txCat = $('transactionCategoryFilter');
    if(txCat && !txCat.dataset.piSettlementFilterBound){
      txCat.dataset.piSettlementFilterBound='1';
      setTimeout(fillTransactionFilter, 50);
    }
  }
  function fillTransactionFilter(){
    const el = $('transactionCategoryFilter'); if(!el) return;
    const previous = el.value || 'all';
    const names = new Set(['all']);
    try{ (window.rawPayments || rawPayments || []).forEach(x=>names.add(x.source || x.category || 'Wpłata')); }catch(_){ }
    try{ (window.rawExpenses || rawExpenses || []).forEach(x=>names.add(x.category || x.source || 'Koszt')); }catch(_){ }
    [...allDefinitions('income',false),...allDefinitions('expense',false)].forEach(x=>names.add(x.name));
    el.innerHTML = Array.from(names).map(v=>`<option value="${esc(v)}" ${previous===v?'selected':''}>${v==='all'?'Wszystkie kategorie':esc(v)}</option>`).join('');
  }
  function applyTemplateToForm(kind, name){
    const item = findDefinition(kind, name); if(!item) return;
    const amountEl = $(kind === 'income' ? 'paymentAmount' : 'costAmount');
    const noteEl = $(kind === 'income' ? 'paymentNote' : 'costNote');
    if(amountEl && item.default_amount && !String(amountEl.value || '').trim()) amountEl.value = item.default_amount;
    if(noteEl && item.note && !String(noteEl.value || '').trim()) noteEl.value = item.note;
  }
  function ensureSettlementComponentOnPayload(payload, kind, selectedName){
    const item = findDefinition(kind, selectedName);
    if(item){
      payload.settlement_component = item.component === 'owner' ? 'owner_rent' : item.component;
      payload.settlement_type_id = item.id;
      payload.taxable = !!item.taxable;
      payload.tenant_due = !!item.tenant_due;
    }
    if(window.piActiveTenancyId) payload.tenancy_id=window.piActiveTenancyId;
    return payload;
  }
  function wrapManualAdders(){
    if(window.__piSettlementWrappedAddersV161) return;
    window.__piSettlementWrappedAddersV161 = true;
    const oldAddCost = window.addCost;
    if(typeof oldAddCost === 'function'){
      window.addCost = async function(){
        try{
          const selected = $('costCategory')?.value || '';
          const item = findDefinition('expense', selected);
          if(item && $('costNote') && !String($('costNote').value||'').includes('Typ rozliczenia:')){
            $('costNote').value = (String($('costNote').value||'').trim() ? String($('costNote').value).trim()+'\n' : '') + 'Typ rozliczenia: '+item.name;
          }
        }catch(_){ }
        return oldAddCost.apply(this, arguments);
      };
    }
    const oldAddPayment = window.addPayment;
    if(typeof oldAddPayment === 'function'){
      window.addPayment = async function(){
        try{
          const selected = $('paymentSource')?.value || '';
          const item = findDefinition('income', selected);
          if(item && $('paymentNote') && !String($('paymentNote').value||'').includes('Typ rozliczenia:')){
            $('paymentNote').value = (String($('paymentNote').value||'').trim() ? String($('paymentNote').value).trim()+'\n' : '') + 'Typ rozliczenia: '+item.name;
          }
        }catch(_){ }
        return oldAddPayment.apply(this, arguments);
      };
    }
    const oldQuick = window.quickMonthlyRent;
    if(typeof oldQuick === 'function'){
      window.quickMonthlyRent = async function(){
        const rentItem = effectiveMonthlyItems().find(x=>x.kind==='income' && x.component==='owner' && x.tenant_due !== false);
        if(!rentItem) return oldQuick.apply(this, arguments);
        const propertyId = activePropertyId(); const amount = toNum(rentItem.default_amount);
        if(!propertyId || !(amount>0)) return oldQuick.apply(this, arguments);
        try{
          let payload={property_id:propertyId,tenancy_id:window.piActiveTenancyId || rentItem.tenancy_id || null,amount,source:rentItem.name,created_at:new Date().toISOString(),payment_date:new Date().toISOString().slice(0,10),note:'Automatyczna wpłata najmu za bieżący miesiąc',transaction_status:'approved',transaction_source:'manual',settlement_component:'owner_rent',settlement_type_id:rentItem.id,taxable:!!rentItem.taxable,tenant_due:true};
          try{ if(window.PureInvestPaymentPeriod?.applyToPayload) payload=window.PureInvestPaymentPeriod.applyToPayload(payload, new Date().toISOString().slice(0,7)); }catch(_){ }
          const result=await insertWithFallback('payments', payload);
          if(result?.error) throw result.error;
          toast('Dodano miesięczny najem: '+money(amount), 'success');
          if(typeof window.refreshDashboard === 'function') return window.refreshDashboard();
        }catch(e){ alert(e.message || e); }
      };
    }
  }

  function ensureDashboardDictionary(){
    const tab = $('tab-transactions');
    const toggles = document.querySelector('#tab-transactions .pi-transactions-admin-toggles');
    if(!tab || !toggles) return false;

    // Po przeniesieniu słownika do Transakcji usuń ewentualny stary przycisk z Panelu dowodzenia.
    document.querySelectorAll('[data-pi-settlement-toggle]').forEach(oldBtn=>{
      if(!oldBtn.closest('#tab-transactions')) oldBtn.remove();
    });

    // Po przebudowie sekcji Finanse słownik nie jest osobną zakładką na belce.
    // Żyje wewnątrz: Finanse → Stałe rozliczenia → Słownik rozliczeń · zaawansowane.
    const btn = $('piTransactionsSettlementDictionaryTopBtn');
    if(btn) btn.remove();

    const old = $('piDashboardTypesCollapse'); if(old) old.remove();
    const oldDashboardPanel = $('piSettlementDictionaryCollapse');
    if(oldDashboardPanel && !oldDashboardPanel.closest('#tab-transactions')) oldDashboardPanel.remove();

    if(!$('piTransactionsSettlementDictionaryPanel')){
      const panel=document.createElement('div');
      panel.id='piTransactionsSettlementDictionaryPanel';
      panel.className='pi-transactions-collapse pi-admin-subtab hidden';
      panel.innerHTML = `
        <div class="card pi-settlement-card">
          <div class="card-title">Słownik rozliczeń</div>
          <p class="pi-muted pi-settlement-hint">Zaawansowany katalog typów kosztów i wpływów. Na co dzień najwygodniej dodajesz kwoty w Finanse → Stałe rozliczenia, a tutaj porządkujesz nazwy, składniki i podatkowość dla transakcji.</p>
          <div class="pi-settlement-form" id="piSettlementTypeForm">
            <input type="hidden" id="piSettlementEditId"><input type="hidden" id="piSettlementEditScope">
            <div class="pi-settlement-grid pi-settlement-grid-dictionary">
              <label>Typ<select id="piSettlementKind"><option value="expense">Koszt</option><option value="income">Wpływ</option></select></label>
              <label>Nazwa<input id="piSettlementName" placeholder="np. Śmieci, Internet, Dopłata za media"></label>
              <label>Składnik<select id="piSettlementComponent"></select></label>
              <label>Podatek<select id="piSettlementTaxable"><option value="no">Nie licz do ryczałtu</option><option value="yes">Licz do ryczałtu 8,5%</option></select></label>
            </div>
            <input type="hidden" id="piSettlementAmount"><input type="hidden" id="piSettlementRecurring"><input type="hidden" id="piSettlementScope" value="global"><input type="hidden" id="piSettlementPayer" value="tenant">
            <textarea id="piSettlementNote" placeholder="Notatka / reguła rozliczenia, opcjonalnie"></textarea>
            <div class="pi-settlement-actions"><button type="button" class="pi-primary-btn" data-pi-settlement-action="save-type">Zapisz w słowniku</button><button type="button" class="subtle-link-btn" data-pi-settlement-action="clear-type">Wyczyść</button></div>
            <div id="piSettlementStatus" class="pi-form-status"></div>
          </div>
          <div id="piSettlementDictionaryList" class="pi-settlement-list"></div>
        </div>`;
      tab.appendChild(panel);
    }
    const comp = $('piSettlementComponent'); if(comp && !comp.dataset.ready){ comp.innerHTML = componentOptions('other'); comp.dataset.ready='1'; }
    return true;
  }
  function clearDictionaryForm(){
    ['piSettlementEditId','piSettlementEditScope','piSettlementName','piSettlementAmount','piSettlementNote'].forEach(id=>{const el=$(id); if(el) el.value='';});
    if($('piSettlementKind')) $('piSettlementKind').value='expense';
    if($('piSettlementComponent')) $('piSettlementComponent').value='other';
    if($('piSettlementRecurring')) $('piSettlementRecurring').value='';
    if($('piSettlementScope')) $('piSettlementScope').value='global';
    if($('piSettlementPayer')) $('piSettlementPayer').value='tenant';
    if($('piSettlementTaxable')) $('piSettlementTaxable').value='no';
    const b=document.querySelector('[data-pi-settlement-action="save-type"]'); if(b) b.textContent='Zapisz w słowniku';
  }
  function saveDictionaryEntry(){
    const id=$('piSettlementEditId')?.value || uid('type');
    const scope='global';
    const payer='tenant';
    const kind=$('piSettlementKind')?.value === 'income' ? 'income' : 'expense';
    const entry=normalizeEntry({id, kind, name:$('piSettlementName')?.value, component:$('piSettlementComponent')?.value, default_amount:null, recurring:'', scope, payer, tenant_due:true, taxable:$('piSettlementTaxable')?.value==='yes', note:$('piSettlementNote')?.value, active:true});
    if(!entry) return alert('Podaj nazwę pozycji.');
    const store=loadStore();
    const editId=$('piSettlementEditId')?.value || '';
    const oldScope=$('piSettlementEditScope')?.value || scope;
    if(editId){
      store.global = (store.global||[]).filter(x=>x.id!==editId);
      Object.keys(store.properties||{}).forEach(pid=>{ store.properties[pid].items = (store.properties[pid].items||[]).filter(x=>x.id!==editId); });
    }
    if(scope==='global') store.global.push(entry);
    else{
      const pid=activePropertyId(); if(!pid) return alert('Najpierw wybierz mieszkanie.');
      entry.property_id=pid; if(!store.properties[pid]) store.properties[pid]={items:[]}; store.properties[pid].items.push(entry);
    }
    saveStore(store);
    clearDictionaryForm(); renderDashboardDictionary(); renderTenantSettlementPanel(); syncAllSelects(); patchFinanceCore();
    toast('Zapisano w słowniku: '+entry.name, 'success');
  }
  function editDictionaryEntry(id){
    const row=[...globalItems(), ...propertyItems()].find(x=>x.id===id); if(!row) return;
    ensureDashboardDictionary();
    $('piSettlementEditId').value=row.id; $('piSettlementEditScope').value=row.scope || 'property';
    $('piSettlementKind').value=row.kind; $('piSettlementName').value=row.name; $('piSettlementComponent').value=row.component || 'other';
    $('piSettlementAmount').value=row.default_amount || ''; $('piSettlementRecurring').value=row.recurring || '';
    $('piSettlementScope').value=row.scope === 'global' ? 'global' : 'property'; $('piSettlementPayer').value=(row.payer === 'owner' || row.tenant_due === false) ? 'owner' : 'tenant';
    $('piSettlementTaxable').value=row.taxable ? 'yes' : 'no'; $('piSettlementNote').value=row.note || '';
    const b=document.querySelector('[data-pi-settlement-action="save-type"]'); if(b) b.textContent='Zapisz zmiany';
  }
  function deleteDictionaryEntry(id){
    if(!id || !confirm('Usunąć pozycję ze słownika? Istniejące transakcje zostaną bez zmian.')) return;
    const store=loadStore(),stamp=new Date().toISOString();
    store.global=(store.global||[]).map(x=>x.id===id?{...x,active:false,updated_at:stamp}:x);
    Object.keys(store.properties||{}).forEach(pid=>{store.properties[pid].items=(store.properties[pid].items||[]).map(x=>x.id===id?{...x,active:false,updated_at:stamp}:x);});
    saveStore(store); renderDashboardDictionary(); renderTenantSettlementPanel(); syncAllSelects(); patchFinanceCore();
  }
  function useDictionaryEntry(id, book){
    const item=[...globalItems(), ...propertyItems()].find(x=>x.id===id) || BUILTIN.find(x=>x.id===id); if(!item) return;
    const kind=item.kind; syncAllSelects();
    const select=$(kind==='income'?'paymentSource':'costCategory'); if(select) select.value=item.name;
    const amount=$(kind==='income'?'paymentAmount':'costAmount'); if(amount && item.default_amount) amount.value=item.default_amount;
    const note=$(kind==='income'?'paymentNote':'costNote'); if(note && !String(note.value||'').trim()) note.value=item.note || 'Typ rozliczenia: '+item.name;
    if(book) return bookNow(item);
    const target=kind==='income'?'piDashboardPaymentCollapse':'piDashboardCostCollapse';
    const toggle=Array.from(document.querySelectorAll('.pi-command-admin-toggles button')).find(b=>(b.textContent||'').toLowerCase().includes(kind==='income'?'wpłat':'koszt'));
    try{ window.piCommandTogglePanel?.(target, toggle || null); }catch(_){ }
  }

  function settlementConstraintError(error){
    const msg=String(error?.message || error || '');
    return /settlement_component/i.test(msg) && /(violates check constraint|check constraint|_chk|_check)/i.test(msg);
  }
  function legacyDbComponent(value){
    const component=String(value || '').trim();
    if(component === 'owner') return 'owner_rent';
    if(['owner_rent','community','electricity','gas','water','other'].includes(component)) return component;
    return 'other';
  }
  function preserveComponentMarker(body, original){
    const value=String(original || '').trim();
    if(!value || value === 'other') return body;
    const marker='[[PI:SETTLEMENT_COMPONENT='+value.replace(/[^a-zA-Z0-9_-]/g,'')+']]';
    if(!String(body.note || '').includes(marker)) body.note=[body.note,marker].filter(Boolean).join('\n');
    return body;
  }
  async function insertWithFallback(table, payload, options={}){
    const client=dbClient();
    if(!client) throw new Error('Brak połączenia z bazą.');
    let body={...payload};
    let componentFallbackStage=0;
    for(let i=0;i<18;i++){
      let query=client.from(table).insert([body]);
      if(options?.select) query=query.select(options.select);
      if(options?.single) query=query.single();
      else if(options?.maybeSingle) query=query.maybeSingle();
      const res=await query;
      if(!res.error) return res;
      const msg=String(res.error.message || '');
      if(table==='expenses' && /expenses_type_check/i.test(msg)){
        throw new Error('Supabase ma nieaktualne ograniczenie expenses_type_check. Uruchom plik docs/SQL_HOTFIX_EXPENSES_TYPE_1_9_0.sql. Szczegóły: '+msg);
      }
      if(settlementConstraintError(res.error)){
        const original=body.settlement_component;
        if(componentFallbackStage===0 && Object.prototype.hasOwnProperty.call(body,'settlement_component')){
          preserveComponentMarker(body, original);
          body.settlement_component=legacyDbComponent(original);
          componentFallbackStage=1;
          continue;
        }
        if(componentFallbackStage<=1 && Object.prototype.hasOwnProperty.call(body,'settlement_component')){
          preserveComponentMarker(body, original);
          delete body.settlement_component;
          componentFallbackStage=2;
          continue;
        }
        throw new Error('Supabase ma nieaktualne ograniczenie settlement_component. Uruchom plik docs/SQL_HOTFIX_SETTLEMENT_COMPONENT_1_9_0.sql. Szczegóły: '+msg);
      }
      const m=msg.match(/Could not find the '([^']+)' column|column "([^"]+)"|column ([a-zA-Z0-9_]+) does not exist/i);
      const col=m && (m[1] || m[2] || m[3]);
      if(col && Object.prototype.hasOwnProperty.call(body, col)){ delete body[col]; continue; }
      throw res.error;
    }
    throw new Error('Nie udało się dopasować pól transakcji do schematu Supabase.');
  }

  async function bookNow(item){
    const pid=activePropertyId(); if(!pid) return alert('Najpierw wybierz mieszkanie.');
    const amount=toNum(item.default_amount || prompt('Kwota dla pozycji '+item.name, item.default_amount || '')); if(!(amount>0)) return;
    const table=item.kind==='income'?'payments':'expenses';
    const today=new Date().toISOString().slice(0,10);
    let payload={property_id:pid,tenancy_id:window.piActiveTenancyId || item.tenancy_id || null,amount,created_at:new Date().toISOString(),note:(item.note || 'Słownik rozliczeń: '+item.name),transaction_status:'approved',transaction_source:'manual',settlement_component:item.component==='owner'?'owner_rent':item.component,settlement_type_id:item.id,taxable:!!item.taxable,tenant_due:!!item.tenant_due,payer:item.payer || (item.tenant_due===false?'owner':'tenant')};
    if(item.kind==='income'){
      payload.source=item.name;
      payload.payment_date=today;
      try{ if(window.PureInvestPaymentPeriod?.applyToPayload) payload=window.PureInvestPaymentPeriod.applyToPayload(payload, new Date().toISOString().slice(0,7)); }catch(_){ }
    }else{ payload.category=item.name; payload.expense_date=today; }
    try{ await insertWithFallback(table, payload); toast('Zaksięgowano: '+item.name, 'success'); await window.refreshDashboard?.(); window.piRenderPropertyFinance?.(true); }catch(e){ alert('Nie udało się zaksięgować: '+(e.message||e)); }
  }
  function renderDashboardDictionary(){
    if(!ensureDashboardDictionary()) return;
    const list=$('piSettlementDictionaryList'); if(!list) return;
    const custom=globalItems().filter(x=>x.active!==false);
    const rows=[...BUILTIN, ...custom];
    const renderRows = (items, allowActions=true) => items.map(item=>`
      <div class="pi-settlement-row">
        <div><b>${esc(item.name)}</b><small>${esc(kindLabel(item.kind))} · ${esc(COMPONENT_LABELS[item.component] || item.component)} · ${esc(item.scope==='global'?'cały portfel':item.builtin?'system':activePropertyName())} · ${esc(recurringLabel(item.recurring))} · ${esc(payerLabel(item))}${item.taxable?' · ryczałt 8,5%':''}${item.default_amount?' · '+esc(money(item.default_amount)):''}</small>${item.note?`<em>${esc(item.note)}</em>`:''}</div>
        <div class="pi-settlement-row-actions">
          ${!item.builtin?`<button type="button" class="small-btn" data-pi-settlement-action="use-type" data-id="${esc(item.id)}">Użyj</button><button type="button" class="small-btn" data-pi-settlement-action="edit-type" data-id="${esc(item.id)}">Edytuj</button><button type="button" class="small-btn danger" data-pi-settlement-action="delete-type" data-id="${esc(item.id)}">Usuń</button>`:`<button type="button" class="small-btn" data-pi-settlement-action="use-type" data-id="${esc(item.id)}">Użyj</button>`}
        </div>
      </div>`).join('');
    const expenses=rows.filter(x=>x.kind==='expense'); const incomes=rows.filter(x=>x.kind==='income');
    list.innerHTML=`<div class="pi-settlement-section"><h4>Koszty</h4>${renderRows(expenses)}</div><div class="pi-settlement-section"><h4>Wpływy</h4>${renderRows(incomes)}</div>`;
  }
  function copyBuiltin(id){
    const item=BUILTIN.find(x=>x.id===id); if(!item) return;
    const copy=normalizeEntry({...item, id:uid('settlement'), builtin:false, scope:'property', property_id:activePropertyId(), default_amount:null, note:''}, item.kind);
    if(!copy.property_id) return alert('Najpierw wybierz mieszkanie.');
    const store=loadStore(); if(!store.properties[copy.property_id]) store.properties[copy.property_id]={items:[]}; store.properties[copy.property_id].items.push(copy); saveStore(store);
    renderDashboardDictionary(); renderTenantSettlementPanel(); syncAllSelects();
  }

  function ensureTenantSettlementPanel(){
    const card=$('piTenantMonthlyCollapse')?.querySelector('.card'); if(!card) return false;
    if(card.dataset.piSettlementReady === '1') return true;
    card.dataset.piSettlementReady='1';
    const legacy = card.querySelector('.owner-rent-panel');
    if(legacy) legacy.classList.add('pi-legacy-rent-hidden');
    const wrap=document.createElement('div'); wrap.id='piTenantSettlementManager'; wrap.className='pi-tenant-settlement-manager';
    wrap.innerHTML=`
      <div class="pi-tenant-settlement-head pi-plan-monthly-head">
        <div><b>Plan miesięczny tego mieszkania</b><span>Ustaw tu bazowe należności i koszty. Faktyczne wpłaty oraz rachunki dodajesz w Operacjach, a porównanie zobaczysz w Rozliczeniu miesiąca.</span></div>
        <div class="pi-plan-total"><span>Należność najemcy / mies.</span><strong id="piTenantSettlementTotal">0,00 zł</strong></div>
      </div>
      <div id="piTenantSettlementList" class="pi-tenant-settlement-list"></div>
      <div class="pi-tenant-settlement-form pi-smart-settlement-form pi-plan-monthly-form">
        <input type="hidden" id="piTenantSettlementEditId">
        <div class="pi-plan-form-title"><b>Dodaj pozycję do planu</b><span>Wybierz gotowy typ albo wpisz własną nazwę. Pozycja od razu dotyczy aktualnego mieszkania.</span></div>
        <div class="pi-settlement-grid compact pi-fixed-settlement-grid pi-plan-main-grid">
          <label>Gotowy typ<select id="piTenantSettlementDefinition"></select></label>
          <label>Rodzaj<select id="piTenantSettlementKind"><option value="income">Należność / wpływ</option><option value="expense">Koszt</option></select></label>
          <label>Nazwa pozycji<input id="piTenantSettlementName" placeholder="np. Najem, Śmieci, Internet"></label>
          <label>Kwota planowana / mies.<input id="piTenantSettlementAmount" inputmode="decimal" placeholder="0,00"></label>
          <label>Kto płaci<select id="piTenantSettlementPayer"><option value="tenant">Najemca</option><option value="owner">Właściciel</option></select></label>
        </div>
        <details class="pi-plan-advanced">
          <summary>Ustawienia zaawansowane</summary>
          <div class="pi-settlement-grid compact pi-plan-advanced-grid">
            <label>Składnik systemowy<select id="piTenantSettlementComponent"></select></label>
            <label>Podatek<select id="piTenantSettlementTaxable"><option value="no">Nie</option><option value="yes">Tak, 8,5%</option></select></label>
          </div>
          <textarea id="piTenantSettlementNote" placeholder="Notatka do pozycji, opcjonalnie"></textarea>
        </details>
        <div class="pi-settlement-actions"><button type="button" class="pi-primary-btn" data-pi-settlement-action="save-fixed">Dodaj do planu</button><button type="button" class="subtle-link-btn" data-pi-settlement-action="clear-fixed">Wyczyść</button><button type="button" class="subtle-link-btn" data-pi-settlement-action="save-tenant">Zapisz plan i dane najemcy</button></div>
      </div>`;
    card.insertBefore(wrap, card.firstChild.nextSibling);
    const c=$('piTenantSettlementComponent'); if(c) c.innerHTML=componentOptions('owner');
    fillTenantDefinitionSelect();
    return true;
  }
  function clearFixedForm(){
    ['piTenantSettlementEditId','piTenantSettlementName','piTenantSettlementAmount','piTenantSettlementNote'].forEach(id=>{const el=$(id); if(el) el.value='';});
    if($('piTenantSettlementDefinition')) $('piTenantSettlementDefinition').value='';
    if($('piTenantSettlementKind')) $('piTenantSettlementKind').value='income';
    if($('piTenantSettlementComponent')) $('piTenantSettlementComponent').value='owner';
    if($('piTenantSettlementPayer')) $('piTenantSettlementPayer').value='tenant';
    if($('piTenantSettlementTaxable')) $('piTenantSettlementTaxable').value='yes';
    const b=document.querySelector('[data-pi-settlement-action="save-fixed"]'); if(b) b.textContent='Dodaj do planu';
  }
  function ensureDefinitionFromFixedForm(store, pid){
    const kind=$('piTenantSettlementKind')?.value === 'expense' ? 'expense' : 'income';
    const name=String($('piTenantSettlementName')?.value || '').trim();
    if(!name) return null;
    const existing=fixedDefinitionRows().find(x=>x.kind===kind && norm(x.name)===norm(name));
    if(existing) return existing;
    const payer=$('piTenantSettlementPayer')?.value === 'owner' ? 'owner' : 'tenant';
    const entry=normalizeEntry({
      id:uid('type'), kind, name,
      component:$('piTenantSettlementComponent')?.value || componentGuess(kind, name),
      default_amount:null, recurring:'', scope:'global', payer,
      tenant_due:payer==='tenant', taxable:$('piTenantSettlementTaxable')?.value==='yes',
      note:$('piTenantSettlementNote')?.value || '', active:true
    }, kind);
    if(!entry) return null;
    store.global = store.global || [];
    store.global.push(entry);
    return entry;
  }

  function saveFixedItem(){
    const pid=activePropertyId(); if(!pid) return alert('Najpierw wybierz mieszkanie.');
    const defId=$('piTenantSettlementDefinition')?.value || '';
    let def=defId ? fixedDefinitionRows().find(x=>String(x.id)===String(defId)) : null;
    if(def && !$('piTenantSettlementName')?.value) applyTenantDefinition(defId);
    const store=loadStore(); if(!store.properties[pid]) store.properties[pid]={items:[]};
    if(!def) def = ensureDefinitionFromFixedForm(store, pid);
    const payer=$('piTenantSettlementPayer')?.value === 'owner' ? 'owner' : 'tenant';
    const editId=$('piTenantSettlementEditId')?.value || '';
    const existing=(store.properties[pid].items||[]).find(x=>String(x.id)===String(editId));
    const currentMonth=window.PureInvestPaymentPeriod?.normalizeMonth?.(new Date()) || new Date().toISOString().slice(0,7);
    const property=activePropertyObj() || {};
    const effectiveFrom=existing?.effective_from || property.lease_start || property.rent_start || currentMonth+'-01';
    const changed=!!(existing && ['kind','name','component','default_amount','payer','tenant_due','taxable'].some(key=>String(existing[key] ?? '')!==String(({kind:$('piTenantSettlementKind')?.value || def?.kind,name:$('piTenantSettlementName')?.value || def?.name,component:$('piTenantSettlementComponent')?.value || def?.component,default_amount:toNum($('piTenantSettlementAmount')?.value || def?.default_amount),payer,tenant_due:payer==='tenant',taxable:$('piTenantSettlementTaxable')?.value==='yes'})[key] ?? '')));
    const versioned=changed && String(effectiveFrom).slice(0,7)<currentMonth;
    const item=normalizeEntry({definition_id:def?.id || null, id:versioned?uid('fixed'):editId || uid('fixed'), kind:$('piTenantSettlementKind')?.value || def?.kind, name:$('piTenantSettlementName')?.value || def?.name, component:$('piTenantSettlementComponent')?.value || def?.component, default_amount:$('piTenantSettlementAmount')?.value || def?.default_amount, recurring:'monthly', payer, tenant_due:payer==='tenant', taxable:$('piTenantSettlementTaxable')?.value==='yes', scope:'property', property_id:pid, note:$('piTenantSettlementNote')?.value, active:true, effective_from:versioned?currentMonth+'-01':effectiveFrom, effective_to:null, updated_at:new Date().toISOString()});
    if(!item) return alert('Podaj nazwę stałej pozycji.');
    if(!item.default_amount) return alert('Podaj kwotę miesięczną.');
    if(editId){
      if(versioned){
        const previousMonth=new Date(Number(currentMonth.slice(0,4)),Number(currentMonth.slice(5,7))-1,0).toISOString().slice(0,10);
        store.properties[pid].items=(store.properties[pid].items||[]).map(row=>String(row.id)===String(editId)?{...row,effective_to:previousMonth,updated_at:new Date().toISOString()}:row);
      }else store.properties[pid].items=(store.properties[pid].items||[]).filter(x=>x.id!==editId);
    }
    store.properties[pid].items.push(item); saveStore(store);
    clearFixedForm(); fillTenantDefinitionSelect(); renderTenantSettlementPanel(); renderDashboardDictionary(); syncAllSelects(); patchFinanceCore();
    toast('Dodano pozycję do mieszkania: '+item.name+(def && !def.builtin ? ' · typ dostępny w słowniku' : ''), 'success');
  }
  function editFixedItem(id){
    const item=propertyItems().find(x=>x.id===id); if(!item) return;
    ensureTenantSettlementPanel();
    if($('piTenantSettlementDefinition')) $('piTenantSettlementDefinition').value=''; $('piTenantSettlementEditId').value=item.id; $('piTenantSettlementKind').value=item.kind; $('piTenantSettlementName').value=item.name; $('piTenantSettlementComponent').value=item.component || 'other'; $('piTenantSettlementAmount').value=item.default_amount || ''; $('piTenantSettlementPayer').value=(item.payer==='owner'||item.tenant_due===false)?'owner':'tenant'; $('piTenantSettlementTaxable').value=item.taxable?'yes':'no'; $('piTenantSettlementNote').value=item.note || '';
    const b=document.querySelector('[data-pi-settlement-action="save-fixed"]'); if(b) b.textContent='Zapisz pozycję planu';
  }
  function deleteFixedItem(id){
    if(!id || !confirm('Usunąć stałą pozycję z mieszkania?')) return;
    const pid=activePropertyId(); const store=loadStore();
    if(store.properties[pid]){
      const currentMonth=window.PureInvestPaymentPeriod?.normalizeMonth?.(new Date()) || new Date().toISOString().slice(0,7);
      const previousMonth=new Date(Number(currentMonth.slice(0,4)),Number(currentMonth.slice(5,7))-1,0).toISOString().slice(0,10);
      store.properties[pid].items=(store.properties[pid].items||[]).map(row=>{
        if(String(row.id)!==String(id)) return row;
        const from=String(row.effective_from || '').slice(0,7);
        return from && from<currentMonth ? {...row,effective_to:previousMonth,updated_at:new Date().toISOString()} : {...row,active:false,updated_at:new Date().toISOString()};
      });
    }
    saveStore(store);
    renderTenantSettlementPanel(); renderDashboardDictionary(); syncAllSelects(); patchFinanceCore();
  }
  function renderTenantSettlementPanel(){
    autoMigrateLegacyForProperty();
    if(!ensureTenantSettlementPanel()) return;
    const list=$('piTenantSettlementList'); if(!list) return;
    const items=effectiveMonthlyItems();
    const tenantTotal=items.filter(x=>x.tenant_due !== false && x.payer !== 'owner').reduce((s,x)=>s+toNum(x.default_amount),0);
    const total=$('piTenantSettlementTotal'); if(total) total.textContent=money(tenantTotal);
    fillTenantDefinitionSelect();
    syncLegacyInputs(items);
    if(!propertyItems().length && legacyItemsFromProperty().length){
      list.innerHTML=`<div class="pi-empty-state"><b>Używam starych pól mieszkania jako stałego rozliczenia.</b><span>Zapisz lub dodaj nową pozycję, aby przejść na centralny słownik rozliczeń.</span></div>` + renderFixedRows(items, true);
      return;
    }
    if(!items.length){ list.innerHTML='<div class="pi-empty-state"><b>Brak pozycji w planie miesięcznym.</b><span>Dodaj najem, czynsz, media albo koszt właściciela. Faktyczne kwoty będziesz później porównywać z tym planem.</span></div>'; return; }
    list.innerHTML=renderFixedRows(items, false);
  }
  function planCharacterLabel(item){
    const component=String(item?.component || '').toLowerCase();
    if(item?.kind==='income') return 'Należność';
    if(['electricity','gas','water','media'].includes(component)) return 'Zmienna / zaliczka';
    if(item?.payer==='owner' || item?.tenant_due===false) return 'Koszt właściciela';
    return 'Stała miesięczna';
  }
  function renderFixedRows(items, legacy){
    return `<div class="pi-tenant-settlement-rows pi-plan-rows">${items.map(item=>`
      <div class="pi-tenant-settlement-row pi-plan-row ${item.tenant_due!==false && item.payer!=='owner'?'is-tenant':'is-owner'}">
        <div class="pi-plan-row-copy">
          <div class="pi-plan-row-title"><b>${esc(item.name)}</b><span class="pi-plan-pill">${esc(planCharacterLabel(item))}</span><span class="pi-plan-pill payer">${esc(item.payer==='owner'||item.tenant_due===false?'Płaci właściciel':'Płaci najemca')}</span></div>
          <small>${esc(COMPONENT_LABELS[item.component] || item.component)}${item.taxable?' · ryczałt 8,5%':''}</small>
          ${item.note?`<em>${esc(item.note)}</em>`:''}
        </div>
        <div class="pi-plan-row-amount"><span>Plan / miesiąc</span><strong>${esc(money(item.default_amount))}</strong></div>
        <div class="pi-settlement-row-actions">${legacy?`<button type="button" class="small-btn" data-pi-settlement-action="copy-legacy">Przenieś do planu</button>`:`<button type="button" class="small-btn" data-pi-settlement-action="edit-fixed" data-id="${esc(item.id)}">Edytuj</button><button type="button" class="small-btn danger" data-pi-settlement-action="delete-fixed" data-id="${esc(item.id)}">Usuń</button>`}</div>
      </div>`).join('')}</div>`;
  }
  function copyLegacyToStore(){
    const pid=activePropertyId(); if(!pid) return;
    const items=legacyItemsFromProperty().map(x=>({...x, id:uid('fixed'), builtin:false, scope:'property', property_id:pid}));
    const store=loadStore(); store.properties[pid]={items, legacy_migrated:true, migrated_at:new Date().toISOString()}; saveStore(store); renderTenantSettlementPanel(); renderDashboardDictionary(); syncAllSelects();
  }

  function wrapTenantSave(){
    if(window.__piSettlementWrappedTenantSaveV161) return;
    window.__piSettlementWrappedTenantSaveV161=true;
    const original=window.updateTenant;
    window.updateTenant = async function(){
      const pid=activePropertyId(); if(!pid) return original ? original.apply(this, arguments) : alert('Najpierw wybierz mieszkanie.');
      syncLegacyInputs(effectiveMonthlyItems());
      const totals=legacyTotalsFromItems(effectiveMonthlyItems());
      const payload={
        tenant_name:$('tenantNameInput')?.value || null, tenant_phone:$('tenantPhoneInput')?.value || null, tenant_email:$('tenantEmailInput')?.value || null, lease_start:$('leaseStartInput')?.value || null,
        payment_account:($('paymentAccountInput')?.value || '').trim() || null, payment_account_label:($('paymentAccountOwnerInput')?.value || $('paymentAccountLabelInput')?.value || '').trim() || null, payment_day:toNum($('paymentDayInput')?.value) || toNum($('rentDueDayInput')?.value) || null,
        rent_amount:totals.rent_amount || null, monthly_rent:totals.rent_amount || null, owner_rent:totals.owner_rent || null, community_rent:totals.community_rent || null, electricity_expected:totals.electricity_expected || null, gas_expected:totals.gas_expected || null, water_expected:totals.water_expected || null, rent_due_day:toNum($('rentDueDayInput')?.value || $('paymentDayInput')?.value) || null
      };
      const client=dbClient();
      if(!client) return alert('Brak połączenia z bazą.');
      let body={...payload};
      try{
        for(let i=0;i<16;i++){
          const res=await client.from('properties').update(body).eq('id',pid).select('*').maybeSingle();
          if(!res.error){
            if(res.data){ window.activePropertyData=res.data; try{ activePropertyData=res.data; }catch(_){ } }
            await window.piSyncTenancyForProperty?.(res.data || body);
            await fetchRemoteStore(true).catch(()=>{}); renderTenantSettlementPanel(); toast('Zapisano dane najmu.', 'success'); await window.reloadActiveProperty?.(); return;
          }
          const msg=res.error.message || ''; const m=msg.match(/Could not find the '([^']+)' column|column "([^"]+)"/i); const col=m && (m[1]||m[2]);
          if(col && Object.prototype.hasOwnProperty.call(body,col)){ delete body[col]; continue; }
          if(/payment_account_number|payment_account_owner|payment_account_note/i.test(msg)){ delete body.payment_account_number; delete body.payment_account_owner; delete body.payment_account_note; continue; }
          throw res.error;
        }
      }catch(e){ return alert('Nie udało się zapisać rozliczenia: '+(e.message || e)); }
    };
  }

  function patchFinanceCore(){
    const Core=window.PureInvestFinanceCore; if(!Core || Core.__settlementV161) return;
    const oldComponent=Core.component?.bind(Core);
    const oldDueComponents=Core.dueComponents?.bind(Core);
    const oldSettlementTable=Core.settlementTable?.bind(Core);
    const oldRowToFinance=Core.rowToFinance?.bind(Core);
    const liveRows=Core.liveRows || (rows=>(rows||[]));
    function component(row, fallbackType){
      const hard=normalizeComponent(row?.settlement_component, row?.source !== undefined ? 'income' : 'expense', row?.source || row?.category || row?.name || '');
      if(row?.settlement_component) return hard;
      const kind = row?.source !== undefined || fallbackType === 'payment' || fallbackType === 'income' ? 'income' : 'expense';
      const name = kind === 'income' ? (row?.source || row?.category || row?.name || '') : (row?.category || row?.source || row?.name || '');
      const def = findDefinition(kind, name);
      if(def) return def.component === 'owner' ? 'owner' : def.component;
      return oldComponent ? oldComponent(row, fallbackType) : normalizeComponent('', kind, name);
    }
    function expenseTenantDueComponents(expenses){
      const c={owner:0, community:0, electricity:0, gas:0, water:0, other:0};
      liveRows(expenses||[]).forEach(row=>{
        const comp=component(row,'expense');
        const txt=String([row?.settlement_component,row?.category,row?.source,row?.name,row?.vendor,row?.note].filter(Boolean).join(' ')).toLowerCase();
        const isOwnerCost = /remont|napraw|serwis|ubezpiec|podatek|wyposaż|wyposaz|meble|inwestyc/.test(txt) || comp === 'renovation' || comp === 'insurance' || comp === 'tax';
        const isTenantDue = row?.tenant_due === true || ['community','electricity','gas','water','media'].includes(comp) || /czynsz|administr|wspól|wspol|spółdziel|spoldziel|prąd|prad|energia|pge|enea|energa|tauron|gaz|pgnig|woda|wodoci|śmieci|smieci|odpady|internet|media|rachun/.test(txt);
        if(isOwnerCost || !isTenantDue) return;
        const k=['community','electricity','gas','water'].includes(comp) ? comp : 'other';
        c[k]+=toNum(row.amount);
      });
      return c;
    }
    function dueComponents(property, expenses){
      const items=effectiveMonthlyItems(property).filter(x=>x.active!==false && x.recurring==='monthly' && x.tenant_due !== false && x.payer !== 'owner');
      const c={owner:0, community:0, electricity:0, gas:0, water:0, other:0};
      items.forEach(item=>{
        const k=item.kind==='income' && item.component==='owner' ? 'owner' : (['community','electricity','gas','water'].includes(item.component) ? item.component : 'other');
        c[k]+=toNum(item.default_amount);
      });
      if(!items.length && oldDueComponents) return oldDueComponents(property, expenses);
      const actual=expenseTenantDueComponents(expenses || []);
      ['community','electricity','gas','water','other'].forEach(k=>{ c[k]=Math.max(toNum(c[k]), toNum(actual[k])); });
      return c;
    }
    function settlementTable(property, payments, expenses, targetMonth){
      // Centralny silnik rozliczeń z finance-core pozostaje jedynym źródłem prawdy.
      // Ten moduł rozszerza słownik składników, ale nie może nadpisywać logiki miesiąca.
      if(oldSettlementTable) return oldSettlementTable(property, payments, expenses, targetMonth);
      const due=dueComponents(property, expenses);
      const paid={owner:0, community:0, electricity:0, gas:0, water:0, other:0};
      liveRows(payments||[]).forEach(row=>{
        let amount=toNum(row.amount); const comp=component(row,'payment'); const key=comp==='owner_rent'?'owner':(comp==='owner'?'owner':(['community','electricity','gas','water'].includes(comp)?comp:'other'));
        if(key==='owner'){
          const cap=Math.max(0,due.owner-paid.owner); const used=Math.min(amount, cap); paid.owner+=used; amount-=used;
          for(const k of ['community','electricity','gas','water','other']){ const cap2=Math.max(0,due[k]-paid[k]); const used2=Math.min(amount,cap2); paid[k]+=used2; amount-=used2; }
          if(amount>0) paid.other+=amount;
        }else paid[key]+=amount;
      });
      const labels={owner:'Najem', community:'Czynsz administracyjny', electricity:'Prąd', gas:'Gaz', water:'Woda', other:'Media / pozostałe rachunki'};
      const rows=Object.keys(due).filter(k=>toNum(due[k]) || toNum(paid[k])).map(k=>({key:k,label:labels[k]||k,due:toNum(due[k]),paid:toNum(paid[k]),missing:Math.max(0,toNum(due[k])-toNum(paid[k])),overpaid:Math.max(0,toNum(paid[k])-toNum(due[k]))}));
      const totals=rows.reduce((a,r)=>{a.due+=r.due; a.paid+=r.paid; a.missing+=r.missing; a.overpaid+=r.overpaid; return a;},{due:0,paid:0,missing:0,overpaid:0});
      return {due, paid, rows, totals};
    }
    function rowToFinance(table, row){
      const out=oldRowToFinance ? oldRowToFinance(table,row) : {...row, table, type:table==='payments'?'income':'expense', name:table==='payments'?(row.source||'Wpłata'):(row.category||'Koszt'), amount:toNum(row.amount)};
      const kind=table==='payments'?'income':'expense'; const name=kind==='income'?(row.source||out.name):(row.category||out.name); const def=findDefinition(kind,name);
      if(def){ out.settlement_component=def.component==='owner'?'owner_rent':def.component; out.settlement_type_id=def.id; out.taxable=def.taxable; out.tenant_due=def.tenant_due; }
      return out;
    }
    Core.component=component; Core.dueComponents=dueComponents; Core.settlementTable=settlementTable; Core.rowToFinance=rowToFinance; Core.__settlementV161=true;
    window.piRentEngineComponent=row=>component(row,row?.source!==undefined?'payment':'expense');
    window.piRentEngineDueComponents=dueComponents;
  }

  function bindEvents(){
    if(window.__piSettlementEventsBoundV161) return; window.__piSettlementEventsBoundV161=true;
    document.addEventListener('click', event=>{
      const btn=event.target.closest('[data-pi-settlement-action]'); if(!btn) return;
      const action=btn.dataset.piSettlementAction; const id=btn.dataset.id;
      if(action==='save-type') return saveDictionaryEntry();
      if(action==='clear-type') return clearDictionaryForm();
      if(action==='edit-type') return editDictionaryEntry(id);
      if(action==='delete-type') return deleteDictionaryEntry(id);
      if(action==='use-type') return useDictionaryEntry(id, false);
      if(action==='book-type') return useDictionaryEntry(id, true);
      if(action==='copy-builtin') return copyBuiltin(id);
      if(action==='save-fixed') return saveFixedItem();
      if(action==='clear-fixed') return clearFixedForm();
      if(action==='edit-fixed') return editFixedItem(id);
      if(action==='delete-fixed') return deleteFixedItem(id);
      if(action==='copy-legacy') return copyLegacyToStore();
      if(action==='save-tenant') return window.updateTenant?.();
    });
    document.addEventListener('change', event=>{
      if(event.target?.id === 'piSettlementKind'){
        if($('piSettlementComponent')) $('piSettlementComponent').value = event.target.value === 'income' ? 'owner' : 'other';
        if($('piSettlementTaxable')) $('piSettlementTaxable').value = event.target.value === 'income' ? 'yes' : 'no';
      }
      if(event.target?.id === 'piTenantSettlementDefinition'){
        applyTenantDefinition(event.target.value);
      }
      if(event.target?.id === 'piTenantSettlementKind'){
        if($('piTenantSettlementComponent')) $('piTenantSettlementComponent').value = event.target.value === 'income' ? 'owner' : 'other';
        if($('piTenantSettlementTaxable')) $('piTenantSettlementTaxable').value = event.target.value === 'income' ? 'yes' : 'no';
      }
    });
  }
  function hookLifecycle(){
    if(window.__piSettlementLifecycleV161) return; window.__piSettlementLifecycleV161=true;
    const oldOpen=window.openDashboard;
    if(typeof oldOpen==='function') window.openDashboard=async function(){ const r=await oldOpen.apply(this,arguments); setTimeout(refreshUI,180); return r; };
    const oldRefresh=window.refreshDashboard;
    if(typeof oldRefresh==='function') window.refreshDashboard=async function(){ const r=await oldRefresh.apply(this,arguments); setTimeout(()=>{syncAllSelects(); fillTransactionFilter(); patchFinanceCore();},80); return r; };
    const oldSwitch=window.switchTab;
    if(typeof oldSwitch==='function') window.switchTab=function(tab, navEl){ const r=oldSwitch.apply(this,arguments); if(['dashboard','tenants','access','transactions'].includes(tab)) setTimeout(refreshUI,140); return r; };
    const oldMailLoad=window.piMailLoadAll;
    if(typeof oldMailLoad==='function') window.piMailLoadAll=async function(){ const r=await oldMailLoad.apply(this,arguments); setTimeout(syncAllSelects,60); return r; };
  }
  function refreshUI(){ ensureDashboardDictionary(); renderDashboardDictionary(); ensureTenantSettlementPanel(); fillTenantDefinitionSelect(); renderTenantSettlementPanel(); syncAllSelects(); fillTransactionFilter(); wrapManualAdders(); wrapTenantSave(); patchFinanceCore(); setTimeout(()=>{ try{ window.renderPropertiesList?.(false); }catch(_){ } try{ window.renderV7RentEngine?.(); }catch(_){ } },60); }

  window.piGetEffectiveSettlementItems = effectiveMonthlyItems;
  window.piGetMonthlyTenantTotal = monthlyTenantTotal;
  window.piGetLegacySettlementTotals = () => legacyTotalsFromItems(effectiveMonthlyItems());
  window.piAutoMigrateLegacySettlement = autoMigrateLegacyForProperty;
  window.piSettlementDictionary = {
    version:'1.7.4', loadStore, saveStore, fetchRemoteStore, definitions:allDefinitions, propertyItems, effectiveMonthlyItems, monthlyTenantTotal, findDefinition, autoMigrateLegacyForProperty,
    refresh:refreshUI,
    getLegacyTotals:()=>legacyTotalsFromItems(effectiveMonthlyItems()),
    ensurePayload:ensureSettlementComponentOnPayload,
    insertWithFallback
  };
  window.piTransactionTypesRefreshV160 = refreshUI;
  window.piTransactionTypesExportV160 = () => loadStore();
  window.piRunSettlementAuditV167 = function(){
    const checks=[];
    checks.push({name:'Słownik rozliczeń', ok:!!window.piSettlementDictionary});
    checks.push({name:'Formularz kosztu korzysta ze słownika', ok:!!$('costCategory')?.dataset.piSettlementBound});
    checks.push({name:'Formularz wpłaty korzysta ze słownika', ok:!!$('paymentSource')?.dataset.piSettlementBound});
    checks.push({name:'Panel stałych pozycji', ok:!!$('piTenantSettlementManager')});
    checks.push({name:'Finance Core połączony ze słownikiem', ok:!!window.PureInvestFinanceCore?.__settlementV161});
    console.table(checks); return checks;
  };

  document.addEventListener('DOMContentLoaded',()=>{
    bindEvents(); hookLifecycle(); fetchRemoteStore().finally(()=>setTimeout(refreshUI,300));
  });
  setTimeout(()=>{ bindEvents(); hookLifecycle(); fetchRemoteStore().finally(refreshUI); }, 900);
})();
