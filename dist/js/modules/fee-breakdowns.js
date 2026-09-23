(function(){
  if(window.__PI_FEE_BREAKDOWNS_1917__) return;
  window.__PI_FEE_BREAKDOWNS_1917__ = true;

  const TABLE = 'pi_fee_breakdowns';
  const LOCAL_KEY = 'piFeeBreakdownsV192';
  const BUILD = '1.9.21';
  const MIRROR_CATEGORY = 'pi_fee_media_report';
  const MIRROR_PREFIX = 'PI_FEE_REPORT_V1:';
  const state = { propertyId:'', month:'', records:[], source:'server', inherited:false, loadedRecord:null, hydrating:false, autosaveTimer:null, saving:false, saveQueued:false, dirty:false, tenantFetches:new Map(), meterReadings:[], meterPropertyId:'', loadingMeterReadings:false };
  const meterBridge = () => window.piFeeMeterBridgeV1917 || null;
  function scheduleAutoSave(){
    if(state.hydrating || !canEdit()) return;
    state.dirty=true;
    clearTimeout(state.autosaveTimer);
    setStatus('Zmiany oczekują na zapis…','pending');
    state.autosaveTimer=setTimeout(()=>saveCurrent({auto:true}),650);
  }
  const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
  async function waitForSave(){
    let guard=0;
    while(state.saving && guard<120){ await sleep(50); guard+=1; }
  }
  async function flushAutoSave(){
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer=null;
    await waitForSave();
    if(state.dirty) await saveCurrent({auto:true});
    await waitForSave();
  }
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = value => {
    if(value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/\s/g,'').replace(',','.'));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const nullableNum = value => (value === null || value === undefined || String(value).trim() === '') ? null : num(value);
  const round2 = value => Math.round((num(value) + Number.EPSILON) * 100) / 100;
  const round3 = value => Math.round((num(value) + Number.EPSILON) * 1000) / 1000;
  const money = value => num(value).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł';
  const decimal = (value,digits=3) => num(value).toLocaleString('pl-PL',{minimumFractionDigits:0,maximumFractionDigits:digits});
  const monthKey = value => String(value || '').slice(0,7);
  const monthDate = value => /^\d{4}-\d{2}$/.test(String(value || '')) ? String(value)+'-01' : '';
  const currentMonth = () => new Date().toISOString().slice(0,7);
  const uid = prefix => (window.crypto?.randomUUID?.() || ((prefix || 'fee')+'-'+Date.now()+'-'+Math.random().toString(16).slice(2)));
  const dbClient = () => {
    try{ if(typeof db !== 'undefined' && db) return db; }catch(_){ }
    return window.db || window.piDb || null;
  };
  async function adminHeaders(){
    const headers={'Content-Type':'application/json'};
    try{
      const result=await dbClient()?.auth?.getSession?.();
      const token=result?.data?.session?.access_token;
      state.cacheOwner=result?.data?.session?.user?.id || '';
      if(token) headers.Authorization='Bearer '+token;
    }catch(_){ }
    return headers;
  }
  async function feeAdminApi(action,payload={}){
    const response=await fetch('/.netlify/functions/fee-breakdowns-admin',{
      method:'POST',
      headers:await adminHeaders(),
      body:JSON.stringify({action,...payload}),
      cache:'no-store'
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok || !data?.ok){
      const error=new Error(data?.message || 'Nie udało się zsynchronizować raportu z Supabase.');
      error.code=data?.code || '';
      error.status=response.status;
      throw error;
    }
    return data;
  }
  const properties = () => {
    try{ if(Array.isArray(loadedProperties)) return loadedProperties; }catch(_){ }
    return Array.isArray(window.loadedProperties) ? window.loadedProperties : [];
  };
  const propertyIdValue = value => {
    if(value === null || value === undefined || value === '') return '';
    if(typeof value === 'object') return String(value.id || value.property_id || '');
    return String(value);
  };
  const activeId = () => {
    const candidates = [];
    try{ if(typeof activePropertyData !== 'undefined') candidates.push(activePropertyData); }catch(_){ }
    candidates.push(window.activePropertyData);
    try{ if(typeof activeProperty !== 'undefined') candidates.push(activeProperty); }catch(_){ }
    candidates.push(window.activeProperty);
    for(const candidate of candidates){
      const id = propertyIdValue(candidate);
      if(id) return id;
    }
    return '';
  };
  const activeProperty = () => properties().find(p => String(p.id) === String(state.propertyId)) || null;
  const canEdit = () => {
    try{ return typeof piCanEditFinancials === 'function' ? !!piCanEditFinancials() : true; }catch(_){ return true; }
  };

  const categoryLabels = Object.freeze({
    media:'Media i zaliczki',operations:'Eksploatacja',waste:'Odpady',heating:'Ogrzewanie',
    renovation:'Fundusz remontowy',management:'Zarządzanie',parking:'Miejsce postojowe',other:'Inne'
  });
  const unitLabels = Object.freeze({m3:'m³',kwh:'kWh',gj:'GJ',unit:'szt.',person:'os.',month:'mies.',other:'j.m.'});
  const isolationConfirmation = 'Nie zmienił kwoty czynszu ani rozliczeń finansowych';

  function normalizeItems(items){
    const rows = Array.isArray(items) ? items : [];
    return rows.map((item,index)=>({
      id: String(item?.id || uid('fee')),
      name: String(item?.name || '').trim(),
      category: String(item?.category || 'other'),
      amount: Math.max(0, round2(item?.amount)),
      sort_order: Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) : index
    })).filter(item => item.name || item.amount > 0).sort((a,b)=>a.sort_order-b.sort_order);
  }

  function mediaMath(item){
    const start = nullableNum(item?.start_reading);
    const end = nullableNum(item?.end_reading);
    let consumption = Math.max(0, num(item?.consumption));
    if(start !== null && end !== null && end >= start) consumption = round3(end-start);
    const unitPrice = Math.max(0, num(item?.unit_price));
    const actualCost = round2(consumption * unitPrice);
    const advances = Math.max(0, round2(item?.advances));
    return {start,end,consumption,unitPrice,actualCost,advances,settlement:round2(actualCost-advances)};
  }

  function normalizeMediaItems(items){
    const rows = Array.isArray(items) ? items : [];
    return rows.map((item,index)=>{
      const calc = mediaMath(item);
      const component=String(item?.component || meterBridge()?.componentOf?.(item) || '');
      return {
        id:String(item?.id || uid('media')),
        name:String(item?.name || '').trim(),
        component,
        unit:String(item?.unit || (component==='electricity'?'kwh':'m3')),
        period_from:String(item?.period_from || '').slice(0,10),
        period_to:String(item?.period_to || '').slice(0,10),
        start_reading:calc.start,
        end_reading:calc.end,
        consumption:calc.consumption,
        unit_price:calc.unitPrice,
        actual_cost:calc.actualCost,
        advances:calc.advances,
        settlement:calc.settlement,
        meter_source:item?.meter_source && typeof item.meter_source==='object' ? {...item.meter_source} : null,
        sort_order:Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) : index
      };
    }).filter(item => item.name || item.consumption > 0 || item.actual_cost > 0 || item.advances > 0)
      .sort((a,b)=>a.sort_order-b.sort_order);
  }

  function normalizeRecord(row){
    if(!row || typeof row !== 'object') return null;
    return {
      ...row,
      items:normalizeItems(row.items),
      media_items:normalizeMediaItems(row.media_items),
      tenant_visible:row.tenant_visible !== false
    };
  }

  function reportFromMirrorDocument(row){
    if(!row || row.category!==MIRROR_CATEGORY || row.tenant_visible===false) return null;
    const note=String(row.note || '');
    if(!note.startsWith(MIRROR_PREFIX)) return null;
    try{
      const parsed=JSON.parse(note.slice(MIRROR_PREFIX.length));
      return normalizeRecord({...parsed,id:parsed.id || `mirror:${row.id}`,property_id:row.property_id,tenant_visible:true,created_at:row.created_at,updated_at:row.updated_at || row.created_at,source:'property_documents'});
    }catch(_){ return null; }
  }
  function mirrorReportsFromDocuments(documents){
    return (Array.isArray(documents)?documents:[]).map(reportFromMirrorDocument).filter(Boolean);
  }
  function mergeReportSources(...sources){
    const byMonth=new Map();
    sources.flat().map(normalizeRecord).filter(Boolean).forEach(row=>{
      const key=monthKey(row.effective_month);
      if(!key) return;
      const existing=byMonth.get(key);
      if(!existing){ byMonth.set(key,row); return; }
      const oldTime=Date.parse(existing.updated_at || existing.created_at || 0) || 0;
      const newTime=Date.parse(row.updated_at || row.created_at || 0) || 0;
      if(newTime>oldTime || (newTime===oldTime && row.source==='pi_fee_breakdowns')) byMonth.set(key,row);
    });
    return [...byMonth.values()].sort((a,b)=>String(b.effective_month || '').localeCompare(String(a.effective_month || '')));
  }
  async function activeTenancyIdDirect(propertyId){
    const client=dbClient();
    if(!client || typeof client.from!=='function') return null;
    try{
      const today=new Date().toISOString().slice(0,10);
      const result=await client.from('pi_tenancies').select('id,start_date').eq('property_id',propertyId).in('status',['active','notice']).or(`end_date.is.null,end_date.gte.${today}`).order('start_date',{ascending:false}).limit(1);
      if(result?.error) throw result.error;
      return result?.data?.[0]?.id || null;
    }catch(_){ return null; }
  }
  async function fetchMirrorReportsDirect(propertyId){
    const client=dbClient();
    if(!client || typeof client.from!=='function') return [];
    try{
      const result=await client.from('property_documents').select('id,property_id,category,note,tenant_visible,created_at,updated_at').eq('property_id',propertyId).eq('category',MIRROR_CATEGORY).order('created_at',{ascending:false});
      if(result?.error) throw result.error;
      return mirrorReportsFromDocuments(result?.data || []);
    }catch(error){ console.warn('PureInvest fee mirror read skipped:',error); return []; }
  }
  async function upsertMirrorDirect(report){
    const client=dbClient();
    if(!client || typeof client.from!=='function') return null;
    const propertyId=String(report?.property_id || '');
    const key=monthKey(report?.effective_month);
    if(!propertyId || !key) return null;
    const fileName=`pi-fee-report-${key}.json`;
    const tenancyId=await activeTenancyIdDirect(propertyId);
    const payload={
      property_id:propertyId,
      tenancy_id:tenancyId,
      title:`Raport opłat i mediów ${key}`,
      name:`Raport opłat i mediów ${key}`,
      file_name:fileName,
      category:MIRROR_CATEGORY,
      note:MIRROR_PREFIX+JSON.stringify({...normalizeRecord(report),effective_month:monthDate(key),source:'property_documents'}),
      mime_type:'application/vnd.pureinvest.fee-report+json',
      tenant_visible:report.tenant_visible!==false,
      owner_visible:true,
      updated_at:new Date().toISOString()
    };
    try{
      const existing=await client.from('property_documents').select('id').eq('property_id',propertyId).eq('category',MIRROR_CATEGORY).eq('file_name',fileName).limit(1);
      if(existing?.error) throw existing.error;
      let result;
      if(existing?.data?.[0]?.id) result=await client.from('property_documents').update(payload).eq('id',existing.data[0].id).select('*').single();
      else result=await client.from('property_documents').insert([{...payload,created_at:new Date().toISOString()}]).select('*').single();
      if(result?.error) throw result.error;
      return result.data;
    }catch(error){ console.warn('PureInvest fee mirror write skipped:',error); return null; }
  }
  async function verifyPublishedDirect(propertyId,effectiveMonth){
    const key=monthKey(effectiveMonth),client=dbClient();
    let table=null,mirror=null;
    if(client && typeof client.from==='function'){
      try{
        const result=await client.from(TABLE).select('id,property_id,effective_month,tenant_visible,items,media_items,updated_at').eq('property_id',propertyId).eq('effective_month',monthDate(key)).limit(1);
        if(!result?.error) table=result?.data?.[0] || null;
      }catch(_){ }
      try{
        const fileName=`pi-fee-report-${key}.json`;
        const result=await client.from('property_documents').select('id,property_id,category,note,tenant_visible,created_at,updated_at').eq('property_id',propertyId).eq('category',MIRROR_CATEGORY).eq('file_name',fileName).limit(1);
        if(!result?.error) mirror=result?.data?.[0] || null;
      }catch(_){ }
    }
    return {ok:!!(table || mirror),table,mirror};
  }

  function localCacheKey(){ return state.cacheOwner ? LOCAL_KEY+':v1921:'+location.origin+':'+state.cacheOwner : null; }
  function readLocal(){
    try{
      const key=localCacheKey();
      const parsed = key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
      return Array.isArray(parsed) ? parsed.map(normalizeRecord).filter(Boolean) : [];
    }catch(_){ return []; }
  }
  function writeLocal(rows){
    try{ const key=localCacheKey(); if(key) localStorage.setItem(key, JSON.stringify(rows || [])); }catch(_){ }
  }
  function localRowsFor(propertyId){
    return readLocal().filter(row => String(row.property_id) === String(propertyId)).sort((a,b)=>String(b.effective_month).localeCompare(String(a.effective_month)));
  }
  function localUpsert(payload){
    const rows = readLocal();
    const index = rows.findIndex(row => String(row.property_id)===String(payload.property_id) && monthKey(row.effective_month)===monthKey(payload.effective_month));
    const now = new Date().toISOString();
    const record = normalizeRecord({...(index>=0 ? rows[index] : {}), ...payload, id:(index>=0 ? rows[index].id : uid('fee')), updated_at:now, created_at:(index>=0 ? rows[index].created_at : now)});
    if(index>=0) rows[index] = record; else rows.push(record);
    writeLocal(rows);
    return record;
  }
  function localDelete(propertyId,effectiveMonth){
    writeLocal(readLocal().filter(row => !(String(row.property_id)===String(propertyId) && monthKey(row.effective_month)===monthKey(effectiveMonth))));
  }

  function isMissingTable(error){
    const text = String(error?.message || error?.details || error?.hint || error || '').toLowerCase();
    return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204' || text.includes('could not find the table') || text.includes('could not find the') || text.includes('relation "public.pi_fee_breakdowns" does not exist') || text.includes('schema cache');
  }

  async function syncLocalReportsToDatabase(propertyId, remoteRows){
    // Recovery is explicit. Reading a report must never write local data to the server.
    return (remoteRows || []).map(normalizeRecord).filter(Boolean);
  }

  function renderDraftRecovery(){
    let box=$('piFeeDraftRecovery');
    if(!box){
      box=document.createElement('div'); box.id='piFeeDraftRecovery'; box.className='pi-fee-notice warning';
      $('piFeeNotice')?.after(box);
    }
    box.replaceChildren();
    const draft=localRowsFor(state.propertyId).find(row=>monthKey(row.effective_month)===state.month);
    box.hidden=!draft;
    if(!draft) return;
    const label=document.createElement('span');
    label.textContent='Zachowano niezapisane zmiany z tej przeglądarki. ';
    const restore=document.createElement('button'); restore.type='button'; restore.className='subtle-link-btn'; restore.textContent='Otwórz lokalny szkic';
    restore.addEventListener('click',()=>{ renderCurrent(draft,false); state.dirty=false; setStatus('Szkic lokalny — nieudostępniony. Zapis sprawdzi zgodność wersji.','pending'); });
    const remote=document.createElement('button'); remote.type='button'; remote.className='subtle-link-btn'; remote.textContent='Pobierz wersję z bazy';
    remote.addEventListener('click',()=>loadCurrent());
    box.append(label,restore,remote);
  }

  function setNotice(text,type='info'){
    const box = $('piFeeNotice');
    if(!box) return;
    box.className = 'pi-fee-notice '+type;
    box.textContent = text || '';
    box.classList.toggle('hidden', !text);
  }
  function setStatus(text,type=''){
    const box = $('piFeeSaveStatus');
    if(!box) return;
    box.textContent = text || '';
    box.className = 'pi-fee-save-status '+type;
  }

  async function ensureProperties(){
    if(properties().length) return properties();
    try{
      if(typeof window.piSelectProperties === 'function'){
        const result = await window.piSelectProperties();
        if(!result?.error && Array.isArray(result?.data)){
          try{ loadedProperties = result.data; }catch(_){ }
          window.loadedProperties = result.data;
          return result.data;
        }
      }
    }catch(error){ console.warn('PureInvest fee breakdown properties:', error); }
    return properties();
  }

  function preferredPropertyId(rows,currentStateId,currentActiveId,preferActive){
    const list = Array.isArray(rows) ? rows : [];
    const firstId = String(list[0]?.id || '');
    const active = String(currentActiveId || '');
    const current = String(currentStateId || '');
    const wanted = preferActive ? (active || current || firstId) : (current || active || firstId);
    return list.some(property=>String(property.id)===wanted) ? wanted : firstId;
  }

  function populatePropertySelect(options={}){
    const select = $('piFeeProperty');
    if(!select) return;
    const rows = properties();
    const currentActiveId = activeId();
    const wanted = preferredPropertyId(rows,state.propertyId,currentActiveId,!!options.preferActive);
    select.innerHTML = rows.length ? rows.map(p=>`<option value="${esc(p.id)}">${esc(p.name || p.address || 'Mieszkanie')}</option>`).join('') : '<option value="">Brak mieszkań</option>';
    const nextId = wanted;
    select.value = nextId;
    state.propertyId = nextId;
  }

  async function fetchRecords(propertyId){
    if(!propertyId) return [];
    const directMirrorsPromise=fetchMirrorReportsDirect(propertyId);
    try{
      const response=await feeAdminApi('list',{propertyId});
      state.source='server';
      setNotice('', 'info');
      const remote=mergeReportSources(response.reports || [],await directMirrorsPromise);
      return await syncLocalReportsToDatabase(propertyId,remote);
    }catch(serverError){
      console.warn('PureInvest fee report server read fallback:',serverError);
      const client=dbClient();
      if(client && typeof client.from==='function'){
        try{
          const [result,mirrors]=await Promise.all([
            client.from(TABLE).select('*').eq('property_id', propertyId).order('effective_month',{ascending:false}),
            directMirrorsPromise
          ]);
          if(result?.error) throw result.error;
          state.source='db';
          setNotice('Raport jest połączony bezpośrednio z Supabase.','warning');
          const remote=mergeReportSources(result?.data || [],mirrors);
          return await syncLocalReportsToDatabase(propertyId,remote);
        }catch(dbError){
          console.warn('PureInvest fee report direct read fallback:',dbError);
          const mirrors=await directMirrorsPromise;
          if(mirrors.length){
            state.source='mirror';
            setNotice('Raport odczytano z bezpiecznej kopii publikacyjnej w dokumentach.','warning');
            return await syncLocalReportsToDatabase(propertyId,mirrors);
          }
        }
      }
      state.source='local';
      setNotice('Raport działa obecnie tylko lokalnie i NIE JEST widoczny dla najemcy. Zapis publikacyjny nie został potwierdzony.','error');
      return localRowsFor(propertyId);
    }
  }

  async function fetchMeterReadings(propertyId){
    if(!propertyId) return [];
    state.loadingMeterReadings=true;
    updateMeterReadingStatus();
    try{
      if(canEdit()){
        try{
          const response=await feeAdminApi('meter-readings',{propertyId});
          state.meterPropertyId=String(propertyId);
          state.meterReadings=Array.isArray(response.readings)?response.readings:[];
          return state.meterReadings;
        }catch(error){ console.warn('PureInvest meter readings server read fallback:',error); }
      }
      const client=dbClient();
      if(client && typeof client.from==='function'){
        const result=await client.from('meter_readings').select('*').eq('property_id',propertyId).order('reading_date',{ascending:false}).limit(240);
        if(result?.error) throw result.error;
        state.meterPropertyId=String(propertyId);
        state.meterReadings=Array.isArray(result?.data)?result.data:[];
        return state.meterReadings;
      }
      state.meterPropertyId=String(propertyId);
      state.meterReadings=[];
      return [];
    }catch(error){
      console.warn('PureInvest meter readings unavailable:',error);
      state.meterPropertyId=String(propertyId);
      state.meterReadings=[];
      return [];
    }finally{
      state.loadingMeterReadings=false;
      updateMeterReadingStatus();
    }
  }

  function setMeterReadingStatus(text,type=''){
    const box=$('piMediaReadingStatus');
    if(!box) return;
    box.textContent=text || '';
    box.className='pi-media-reading-status'+(type ? ' '+type : '');
  }
  function currentMeterMerge(){
    const bridge=meterBridge();
    if(!bridge || String(state.meterPropertyId)!==String(state.propertyId)) return null;
    return bridge.mergeMediaItems(collectMediaItems(),state.meterReadings,state.month || currentMonth());
  }
  function updateMeterReadingStatus(){
    const button=$('piMediaImportBtn');
    if(state.loadingMeterReadings){
      if(button) button.disabled=true;
      setMeterReadingStatus('Sprawdzam odczyty liczników dla wybranego miesiąca…');
      return;
    }
    const result=currentMeterMerge();
    if(!result || !result.available){
      if(button) button.disabled=true;
      setMeterReadingStatus('Brak odczytu liczników w wybranym miesiącu. Raport zachowuje dotychczasowe wartości.','warning');
      return;
    }
    const importable=result.readingFields>0 || result.added>0;
    if(button){
      button.disabled=!canEdit() || !importable;
      button.textContent=importable ? (canEdit()?'Pobierz odczyty najemcy':'Zatwierdza administrator') : 'Odczyty są już w raporcie';
    }
    if(importable){
      const dates=Object.values(result.suggestions).map(item=>item.meter_source?.end_date).filter(Boolean).sort();
      const lastDate=dates.at(-1);
      if(canEdit()) setMeterReadingStatus(`${result.available} ${result.available===1?'medium ma':'media mają'} odczyty najemcy${lastDate?' (najnowszy: '+formatDate(lastDate)+')':''}. Import uzupełni tylko puste pola i nie nadpisze ręcznych danych.`,'ready');
      else setMeterReadingStatus(`${result.available} ${result.available===1?'medium ma':'media mają'} odczyty najemcy${lastDate?' (najnowszy: '+formatDate(lastDate)+')':''}. Zostaną zapisane w raporcie po zatwierdzeniu przez administratora.`,'warning');
    }else{
      setMeterReadingStatus('Stany liczników z panelu najemcy są już uwzględnione w tym raporcie.','ready');
    }
  }

  function recordForMonth(records,month){
    const target = String(month || currentMonth());
    const sorted = (records || []).slice().sort((a,b)=>String(b.effective_month).localeCompare(String(a.effective_month)));
    const exact = sorted.find(row => monthKey(row.effective_month) === target);
    if(exact) return {record:exact,inherited:false};
    const inherited = sorted.find(row => monthKey(row.effective_month) <= target);
    return {record:inherited || null,inherited:!!inherited};
  }

  function categoryOptions(selected){
    return Object.entries(categoryLabels).map(([value,label])=>`<option value="${value}"${value===selected?' selected':''}>${label}</option>`).join('');
  }
  function unitOptions(selected){
    return Object.entries(unitLabels).map(([value,label])=>`<option value="${value}"${value===selected?' selected':''}>${label}</option>`).join('');
  }

  function renderRows(items){
    const body = $('piFeeItemsBody');
    if(!body) return;
    const rows = Array.isArray(items) && items.length ? items : [{id:uid('fee'),name:'',category:'other',amount:''}];
    body.innerHTML = rows.map((item,index)=>`
      <tr data-fee-row="${esc(item.id || uid('fee'))}">
        <td class="pi-fee-order">${index+1}</td>
        <td><input class="pi-fee-name" type="text" maxlength="120" value="${esc(item.name || '')}" placeholder="np. Zaliczka na wodę"></td>
        <td><select class="pi-fee-category">${categoryOptions(item.category || 'other')}</select></td>
        <td><input class="pi-fee-amount" type="text" inputmode="decimal" value="${item.amount === '' ? '' : esc(num(item.amount).toFixed(2).replace('.',','))}" placeholder="0,00"></td>
        <td><button type="button" class="pi-fee-icon-btn" data-fee-remove title="Usuń składnik" aria-label="Usuń składnik">×</button></td>
      </tr>`).join('');
    body.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',()=>{ updateSummary(); scheduleAutoSave(); }));
    body.querySelectorAll('[data-fee-remove]').forEach(button=>button.addEventListener('click',()=>{
      button.closest('tr')?.remove();
      if(!body.querySelector('tr')) addRow();
      renumberRows();
      updateSummary();
      scheduleAutoSave();
    }));
    updateSummary();
  }

  function renumberRows(){
    $('piFeeItemsBody')?.querySelectorAll('tr').forEach((row,index)=>{ const cell=row.querySelector('.pi-fee-order'); if(cell) cell.textContent=String(index+1); });
  }

  function collectItems(){
    return Array.from($('piFeeItemsBody')?.querySelectorAll('tr') || []).map((row,index)=>({
      id: row.dataset.feeRow || uid('fee'),
      name: String(row.querySelector('.pi-fee-name')?.value || '').trim(),
      category: String(row.querySelector('.pi-fee-category')?.value || 'other'),
      amount: Math.max(0, round2(row.querySelector('.pi-fee-amount')?.value)),
      sort_order:index
    })).filter(item=>item.name || item.amount > 0);
  }

  function mediaRowHtml(item,index){
    const calc = mediaMath(item);
    const value = v => (v === null || v === undefined || v === '') ? '' : esc(String(v).replace('.',','));
    const source=item?.meter_source && typeof item.meter_source==='object' ? encodeURIComponent(JSON.stringify(item.meter_source)) : '';
    const component=String(item?.component || meterBridge()?.componentOf?.(item) || '');
    return `<tr data-media-row="${esc(item.id || uid('media'))}" data-media-component="${esc(component)}" data-meter-source="${esc(source)}">
      <td class="pi-fee-order" data-label="Numer">${index+1}</td>
      <td data-label="Medium"><input class="pi-media-name" aria-label="Nazwa medium" type="text" maxlength="120" value="${esc(item.name || '')}" placeholder="np. Woda zimna"></td>
      <td data-label="Okres od"><input class="pi-media-from" aria-label="Początek okresu" type="date" value="${esc(item.period_from || '')}"></td>
      <td data-label="Okres do"><input class="pi-media-to" aria-label="Koniec okresu" type="date" value="${esc(item.period_to || '')}"></td>
      <td data-label="Jednostka"><select class="pi-media-unit" aria-label="Jednostka">${unitOptions(item.unit || 'm3')}</select></td>
      <td data-label="Odczyt początkowy"><input class="pi-media-start" aria-label="Odczyt początkowy" type="text" inputmode="decimal" value="${value(calc.start)}" placeholder="—"></td>
      <td data-label="Odczyt końcowy"><input class="pi-media-end" aria-label="Odczyt końcowy" type="text" inputmode="decimal" value="${value(calc.end)}" placeholder="—"></td>
      <td data-label="Zużycie"><input class="pi-media-consumption" aria-label="Zużycie" type="text" inputmode="decimal" value="${value(calc.consumption || '')}" placeholder="0"></td>
      <td data-label="Stawka za jednostkę (zł)"><input class="pi-media-rate" aria-label="Stawka za jednostkę" type="text" inputmode="decimal" value="${value(calc.unitPrice || '')}" placeholder="0,00"></td>
      <td data-label="Koszt rzeczywisty"><output class="pi-media-actual">${esc(money(calc.actualCost))}</output></td>
      <td data-label="Wpłacone zaliczki (zł)"><input class="pi-media-advances" aria-label="Wpłacone zaliczki" type="text" inputmode="decimal" value="${value(calc.advances || '')}" placeholder="0,00"></td>
      <td data-label="Rozliczenie"><output class="pi-media-settlement ${calc.settlement>0.009?'due':calc.settlement<-0.009?'over':'ok'}">${esc(settlementLabel(calc.settlement))}</output></td>
      <td data-label="Działania"><button type="button" class="pi-fee-icon-btn" data-media-remove title="Usuń medium" aria-label="Usuń medium">×</button></td>
    </tr>`;
  }

  function settlementLabel(value){
    const amount = round2(value);
    if(amount > 0.009) return 'Dopłata '+money(amount);
    if(amount < -0.009) return 'Nadpłata '+money(Math.abs(amount));
    return 'Rozliczone';
  }

  function syncMediaRow(row,sourceClass){
    if(!row) return;
    const start = nullableNum(row.querySelector('.pi-media-start')?.value);
    const end = nullableNum(row.querySelector('.pi-media-end')?.value);
    const consumptionInput = row.querySelector('.pi-media-consumption');
    let consumption = Math.max(0,num(consumptionInput?.value));
    if(consumptionInput) consumptionInput.readOnly=start !== null && end !== null && end >= start;
    if(start !== null && end !== null && end >= start){
      consumption = round3(end-start);
      if(consumptionInput) consumptionInput.value = String(consumption).replace('.',',');
    }
    const rate = Math.max(0,num(row.querySelector('.pi-media-rate')?.value));
    const advances = Math.max(0,round2(row.querySelector('.pi-media-advances')?.value));
    const actual = round2(consumption*rate);
    const settlement = round2(actual-advances);
    const actualBox = row.querySelector('.pi-media-actual');
    const settlementBox = row.querySelector('.pi-media-settlement');
    if(actualBox) actualBox.textContent = money(actual);
    if(settlementBox){
      settlementBox.textContent = settlementLabel(settlement);
      settlementBox.className = 'pi-media-settlement '+(settlement>0.009?'due':settlement<-0.009?'over':'ok');
    }
    updateMediaSummary();
  }

  function bindMediaRow(row){
    if(!row) return;
    row.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',()=>{ syncMediaRow(row,input.classList[0] || ''); updateMeterReadingStatus(); scheduleAutoSave(); }));
    row.querySelector('[data-media-remove]')?.addEventListener('click',()=>{
      row.remove();
      if(!$('piMediaItemsBody')?.querySelector('tr')) addMediaRow();
      renumberMediaRows();
      updateMediaSummary();
      updateMeterReadingStatus();
      scheduleAutoSave();
    });
    syncMediaRow(row,'init');
  }

  function renderMediaRows(items){
    const body = $('piMediaItemsBody');
    if(!body) return;
    const rows = Array.isArray(items) && items.length ? items : [{id:uid('media'),name:'',unit:'m3',period_from:'',period_to:'',start_reading:null,end_reading:null,consumption:'',unit_price:'',advances:''}];
    body.innerHTML = rows.map(mediaRowHtml).join('');
    body.querySelectorAll('tr').forEach(bindMediaRow);
    updateMediaSummary();
  }

  function renumberMediaRows(){
    $('piMediaItemsBody')?.querySelectorAll('tr').forEach((row,index)=>{ const cell=row.querySelector('.pi-fee-order'); if(cell) cell.textContent=String(index+1); });
  }

  function collectMediaItems(){
    return Array.from($('piMediaItemsBody')?.querySelectorAll('tr') || []).map((row,index)=>{
      let meterSource=null;
      try{ meterSource=row.dataset.meterSource ? JSON.parse(decodeURIComponent(row.dataset.meterSource)) : null; }catch(_){ meterSource=null; }
      const raw = {
        id:row.dataset.mediaRow || uid('media'),
        name:String(row.querySelector('.pi-media-name')?.value || '').trim(),
        component:String(row.dataset.mediaComponent || meterBridge()?.componentOf?.(row.querySelector('.pi-media-name')?.value || '') || ''),
        unit:String(row.querySelector('.pi-media-unit')?.value || 'm3'),
        period_from:String(row.querySelector('.pi-media-from')?.value || '').slice(0,10),
        period_to:String(row.querySelector('.pi-media-to')?.value || '').slice(0,10),
        start_reading:nullableNum(row.querySelector('.pi-media-start')?.value),
        end_reading:nullableNum(row.querySelector('.pi-media-end')?.value),
        consumption:Math.max(0,num(row.querySelector('.pi-media-consumption')?.value)),
        unit_price:Math.max(0,num(row.querySelector('.pi-media-rate')?.value)),
        advances:Math.max(0,num(row.querySelector('.pi-media-advances')?.value)),
        meter_source:meterSource,
        sort_order:index
      };
      return normalizeMediaItems([raw])[0];
    }).filter(Boolean);
  }

  function addMediaRow(prefill){
    const body = $('piMediaItemsBody');
    if(!body) return;
    const item = prefill || {id:uid('media'),name:'',unit:'m3',period_from:'',period_to:'',start_reading:null,end_reading:null,consumption:'',unit_price:'',advances:''};
    const wrapper = document.createElement('tbody');
    wrapper.innerHTML = mediaRowHtml(item,body.querySelectorAll('tr').length);
    const row = wrapper.firstElementChild;
    body.appendChild(row);
    bindMediaRow(row);
    row.querySelector('.pi-media-name')?.focus();
    updateMediaSummary();
    updateMeterReadingStatus();
    scheduleAutoSave();
  }

  function importMeterReadings(){
    if(!canEdit()) return;
    const bridge=meterBridge();
    if(!bridge) return setMeterReadingStatus('Mechanizm łączenia odczytów nie został załadowany. Odśwież aplikację.','error');
    const result=bridge.mergeMediaItems(collectMediaItems(),state.meterReadings,state.month || currentMonth());
    if(!result.available) return updateMeterReadingStatus();
    if(!result.readingFields && !result.added) return updateMeterReadingStatus();
    state.hydrating=true;
    renderMediaRows(result.items);
    state.hydrating=false;
    setMeterReadingStatus(`Uzupełniono odczyty dla ${result.available} ${result.available===1?'medium':'mediów'}. Ręczne wartości pozostały bez zmian. Zapis zachowa wybrane ustawienie widoczności.`,'ready');
    scheduleAutoSave();
  }

  function updateMediaSummary(){
    const rows = collectMediaItems();
    const actual = round2(rows.reduce((sum,item)=>sum+num(item.actual_cost),0));
    const advances = round2(rows.reduce((sum,item)=>sum+num(item.advances),0));
    const settlement = round2(actual-advances);
    if($('piMediaActualTotal')) $('piMediaActualTotal').textContent = money(actual);
    if($('piMediaAdvancesTotal')) $('piMediaAdvancesTotal').textContent = money(advances);
    if($('piMediaSettlementTotal')){
      $('piMediaSettlementTotal').textContent = settlementLabel(settlement);
      $('piMediaSettlementTotal').className = 'pi-media-total-value '+(settlement>0.009?'due':settlement<-0.009?'over':'ok');
    }
    refreshPdfButton();
  }

  function currentBase(){ return num(activeProperty()?.community_rent); }
  function sumItems(){ return collectItems().reduce((sum,item)=>sum+num(item.amount),0); }

  function statusMeta(base,sum){
    const difference = round2(sum-base);
    if(Math.abs(difference) < 0.01) return {label:'Zgodne',className:'ok',difference:0,text:'Suma składników odpowiada kwocie czynszu w danych mieszkania.'};
    if(difference < 0) return {label:'Brakuje '+money(Math.abs(difference)),className:'warning',difference,text:'Rozpisano mniej niż wynosi czynsz administracyjny.'};
    return {label:'Za dużo o '+money(difference),className:'danger',difference,text:'Suma składników przekracza czynsz administracyjny.'};
  }

  function refreshPdfButton(){
    const button=$('piFeeDownloadPdfBtn');
    if(!button || button.textContent==='Tworzę PDF…') return;
    button.disabled = !(state.loadedRecord || collectItems().length || collectMediaItems().length);
  }

  function updateSummary(){
    const base = currentBase();
    const sum = sumItems();
    const meta = statusMeta(base,sum);
    if($('piFeeBaseAmount')) $('piFeeBaseAmount').textContent = money(base);
    if($('piFeeItemsSum')) $('piFeeItemsSum').textContent = money(sum);
    if($('piFeeDifference')) $('piFeeDifference').textContent = money(Math.abs(meta.difference));
    if($('piFeeDifferenceLabel')) $('piFeeDifferenceLabel').textContent = meta.difference === 0 ? 'Brak różnicy' : (meta.difference < 0 ? 'Brakuje w rozpisce' : 'Nadwyżka rozpiski');
    const status = $('piFeeConsistencyStatus');
    if(status){ status.textContent=meta.label; status.className='pi-fee-status '+meta.className; }
    if($('piFeeConsistencyText')) $('piFeeConsistencyText').textContent = meta.text;
    refreshPdfButton();
  }

  function renderCurrent(record,inherited){
    state.hydrating = true;
    record = normalizeRecord(record);
    state.loadedRecord = record || null;
    state.inherited = !!inherited;
    state.expectedUpdatedAt = inherited ? null : (record && Object.prototype.hasOwnProperty.call(record,'base_updated_at') ? record.base_updated_at : record?.updated_at || null);
    const selectedMonth = state.month || currentMonth();
    const effective = record ? monthKey(record.effective_month) : '';
    if($('piFeeEffectiveMonth')) $('piFeeEffectiveMonth').textContent = effective ? formatMonth(effective) : 'Brak rozpiski';
    if($('piFeeOriginBadge')){
      $('piFeeOriginBadge').textContent = record ? (inherited ? 'Wersja odziedziczona' : 'Wersja tego miesiąca') : 'Nie uzupełniono';
      $('piFeeOriginBadge').className = 'badge '+(record ? (inherited ? 'gray' : 'green-badge') : 'gray');
    }
    if($('piFeeNotes')) $('piFeeNotes').value = record?.notes || '';
    if($('piFeeTenantVisible')) $('piFeeTenantVisible').checked = record ? record.tenant_visible === true : false;
    renderRows(record?.items || []);
    renderMediaRows(record?.media_items || []);
    const save = $('piFeeSaveBtn');
    const remove = $('piFeeDeleteBtn');
    if(save){ save.disabled=!canEdit(); save.textContent = record && !inherited ? 'Zapisz zmiany' : 'Utwórz wersję od '+formatMonth(selectedMonth); }
    if(remove){ remove.disabled=!canEdit() || !record || inherited; remove.title = inherited ? 'Wybrany miesiąc korzysta z wcześniejszej wersji. Nie ma osobnego rekordu do usunięcia.' : ''; }
    if($('piFeeDownloadPdfBtn')) $('piFeeDownloadPdfBtn').disabled = !record && !collectItems().length && !collectMediaItems().length;
    const editHint = $('piFeeEditHint');
    if(editHint){
      editHint.textContent = inherited ? `Pokazywany raport obowiązuje od ${formatMonth(effective)}. Zapis utworzy nową wersję od ${formatMonth(selectedMonth)}.` : (record ? `Edytujesz raport obowiązujący od ${formatMonth(effective)}.` : `Możesz opcjonalnie rozpisać czynsz i media dla ${formatMonth(selectedMonth)}.`);
    }
    updateSummary();
    updateMediaSummary();
    state.hydrating = false;
    updateMeterReadingStatus();
  }

  function formatMonth(value){
    if(!/^\d{4}-\d{2}$/.test(String(value || ''))) return '—';
    const [year,month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('pl-PL',{month:'long',year:'numeric'}).format(new Date(year,month-1,1));
  }
  function formatDate(value){
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : '—';
  }

  function renderHistory(){
    const box = $('piFeeHistory');
    if(!box) return;
    if(!state.records.length){ box.innerHTML='<div class="pi-fee-empty">Brak zapisanych wersji raportu dla tego mieszkania.</div>'; return; }
    box.innerHTML = state.records.map(record=>{
      const fees = normalizeItems(record.items);
      const media = normalizeMediaItems(record.media_items);
      const sum = fees.reduce((total,item)=>total+num(item.amount),0);
      const base = num(record.base_amount);
      const meta = statusMeta(base,sum);
      const mediaSettlement = round2(media.reduce((total,item)=>total+num(item.settlement),0));
      return `<button type="button" class="pi-fee-history-row" data-fee-history-month="${esc(monthKey(record.effective_month))}">
        <span><b>${esc(formatMonth(monthKey(record.effective_month)))}</b><small>${fees.length} składników opłat • ${media.length} pozycji mediów</small></span>
        <span><b>${esc(money(sum))}</b><small>${esc(settlementLabel(mediaSettlement))}</small></span>
        <span class="pi-fee-status ${meta.className}">${esc(meta.label)}</span>
      </button>`;
    }).join('');
    box.querySelectorAll('[data-fee-history-month]').forEach(button=>button.addEventListener('click',async()=>{
      const month = button.dataset.feeHistoryMonth;
      await flushAutoSave();
      if($('piFeeMonth')) $('piFeeMonth').value = month;
      state.month = month;
      loadCurrent();
    }));
  }

  async function loadCurrent(){
    const loadId=state.loadId=(state.loadId || 0)+1;
    state.propertyId = $('piFeeProperty')?.value || state.propertyId || activeId();
    state.month = $('piFeeMonth')?.value || state.month || currentMonth();
    if(!state.propertyId){
      state.meterReadings=[]; state.meterPropertyId='';
      setNotice('Dodaj lub wybierz mieszkanie, aby utworzyć raport opłat i mediów.','warning');
      renderCurrent(null,false); renderHistory(); return;
    }
    setStatus('Ładowanie...');
    const [records]=await Promise.all([fetchRecords(state.propertyId),fetchMeterReadings(state.propertyId)]);
    if(loadId!==state.loadId) return;
    state.records = records;
    state.dirty=false;
    const match = recordForMonth(state.records,state.month);
    renderCurrent(match.record,match.inherited);
    renderHistory();
    setStatus('');
    renderDraftRecovery();
  }

  async function saveCurrent(options={}){
    const auto=!!options.auto;
    if(state.saving){ state.saveQueued=true; return; }
    if(!canEdit()) return auto ? undefined : alert('Raport opłat może edytować administrator PureInvest.');
    const propertyId = state.propertyId;
    const selectedMonth = state.month;
    if(!propertyId || !/^\d{4}-\d{2}$/.test(selectedMonth)) return auto ? undefined : setStatus('Wybierz mieszkanie i prawidłowy miesiąc.','error');
    const items = collectItems();
    const mediaItems = collectMediaItems();
    const notes = String($('piFeeNotes')?.value || '').trim();
    const exactExisting = state.records.some(row=>monthKey(row.effective_month)===selectedMonth);
    if(!items.length && !mediaItems.length && !notes && !exactExisting){
      state.dirty=false;
      if(!auto) setStatus('Dodaj co najmniej jeden składnik opłaty lub pozycję zużycia mediów.','error');
      else setStatus('Brak danych do zapisania.','');
      return;
    }
    if(items.some(item=>!item.name)){ setStatus('Uzupełnij nazwę składnika, aby zapisać zmiany.','error'); return; }
    if(mediaItems.some(item=>!item.name)){ setStatus('Uzupełnij nazwę medium, aby zapisać zmiany.','error'); return; }
    if(mediaItems.some(item=>item.start_reading!==null && item.end_reading!==null && item.end_reading<item.start_reading)){ if(!auto) setStatus('Stan końcowy licznika nie może być niższy od stanu początkowego.','error'); return; }
    const payload = {
      property_id:propertyId,
      effective_month:monthDate(selectedMonth),
      base_amount:currentBase(),
      items,
      media_items:mediaItems,
      tenant_visible:$('piFeeTenantVisible')?.checked !== false,
      notes,
      updated_at:new Date().toISOString()
    };
    state.saving=true;
    setStatus(auto?'Zapisywanie automatyczne…':'Zapisywanie...','saving');
    let saved=null;
    const expectedUpdatedAt=state.expectedUpdatedAt || null;
    try{
      await adminHeaders();
      const client=dbClient();
      if(typeof client?.rpc!=='function') throw new Error('Brak połączenia z bazą. Zmiany zachowano jako szkic.');
      const result=await client.rpc('pi_save_fee_report', {p_report:payload,p_expected_updated_at:expectedUpdatedAt});
      if(result?.error) throw result.error;
      if(!result?.data?.report || !result.data.verified?.table || !result.data.verified?.mirror) throw new Error('Serwer nie potwierdził zapisu raportu i jego widoczności.');
      saved=normalizeRecord(result.data.report);
      state.source='db';
      state.expectedUpdatedAt=saved.updated_at;
      localDelete(propertyId,selectedMonth);
      setNotice(saved.tenant_visible===true ? 'Zapisano raport i udostępniono najemcy.' : 'Zapisano szkic w bazie. Raport nie jest widoczny dla najemcy.','info');
    }catch(error){
      const conflict=error?.code==='40001';
      localUpsert({...payload,base_updated_at:expectedUpdatedAt});
      state.source=conflict?'conflict':'local';
      state.dirty=false;
      state.saving=false;
      state.saveQueued=false;
      clearTimeout(state.autosaveTimer);
      setStatus(conflict ? 'Konflikt wersji — nowszy raport pozostał bez zmian.' : 'Nie zapisano w bazie — szkic lokalny.','error');
      setNotice(conflict ? 'Raport zmieniono w innej sesji. Twoje zmiany zachowano lokalnie. Pobierz wersję z bazy i porównaj ją ze szkicem przed ponowną edycją.' : 'Nie udało się zapisać raportu. Twoje zmiany zachowano w tej przeglądarce. Spróbuj ponownie po odzyskaniu połączenia.','error');
      renderDraftRecovery();
      return;
    }
    state.loadedRecord=saved;
    const idx=state.records.findIndex(r=>monthKey(r.effective_month)===selectedMonth);
    if(idx>=0) state.records[idx]=saved; else state.records.unshift(saved);
    state.records.sort((a,b)=>String(b.effective_month).localeCompare(String(a.effective_month)));
    state.inherited=false;
    renderHistory();
    if($('piFeeOriginBadge')){ $('piFeeOriginBadge').textContent='Wersja tego miesiąca'; $('piFeeOriginBadge').className='badge green-badge'; }
    if($('piFeeEffectiveMonth')) $('piFeeEffectiveMonth').textContent=formatMonth(selectedMonth);
    state.dirty=false;
    setStatus((saved.tenant_visible===true?'Udostępniono najemcy':'Szkic zapisany')+' • '+new Date().toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}),state.source==='local'?'error':'success');
    state.saving=false;
    if(state.saveQueued){ state.saveQueued=false; scheduleAutoSave(); }
    refreshPdfButton();
    renderDraftRecovery();
  }

  async function deleteCurrent(){
    if(!canEdit()) return alert('Raport opłat może edytować administrator PureInvest.');
    const propertyId = $('piFeeProperty')?.value || state.propertyId;
    const selectedMonth = $('piFeeMonth')?.value || state.month;
    const exact = state.records.find(row=>monthKey(row.effective_month)===selectedMonth);
    if(!exact) return setStatus('Dla wybranego miesiąca nie ma osobnej wersji do usunięcia.','error');
    if(!confirm(`Usunąć raport opłat obowiązujący od ${formatMonth(selectedMonth)}? Kwota czynszu i rozliczenia finansowe pozostaną bez zmian.`)) return;
    clearTimeout(state.autosaveTimer); state.dirty=false;
    setStatus('Usuwanie...');
    let deletedRemotely=false;
    try{
      await feeAdminApi('delete',{propertyId,effectiveMonth:monthDate(selectedMonth)});
      state.source='server';
      deletedRemotely=true;
    }catch(serverError){
      console.warn('PureInvest fee breakdown server delete fallback:',serverError);
      const client=dbClient();
      if(client && typeof client.from==='function'){
        try{
          const result=await client.from(TABLE).delete().eq('property_id',propertyId).eq('effective_month',monthDate(selectedMonth));
          if(result?.error) throw result.error;
          await client.from('property_documents').delete().eq('property_id',propertyId).eq('category',MIRROR_CATEGORY).eq('file_name',`pi-fee-report-${selectedMonth}.json`);
          state.source='db';
          deletedRemotely=true;
        }catch(dbError){ console.warn('PureInvest fee breakdown direct delete fallback:',dbError); }
      }
    }
    localDelete(propertyId,selectedMonth);
    if(!deletedRemotely) setNotice('Usunięto wyłącznie lokalną kopię. Rekord w Supabase mógł pozostać bez zmian.','warning');
    state.records = await fetchRecords(propertyId);
    const match = recordForMonth(state.records,selectedMonth);
    renderCurrent(match.record,match.inherited); renderHistory();
    setStatus(deletedRemotely?'Wersja raportu została usunięta.':'Nie potwierdzono usunięcia raportu.',deletedRemotely?'success':'error');
  }

  function addRow(prefill){
    const body = $('piFeeItemsBody');
    if(!body) return;
    const item = prefill || {id:uid('fee'),name:'',category:'other',amount:''};
    const wrapper = document.createElement('tbody');
    wrapper.innerHTML = `<tr data-fee-row="${esc(item.id || uid('fee'))}">
      <td class="pi-fee-order">${body.querySelectorAll('tr').length+1}</td>
      <td><input class="pi-fee-name" type="text" maxlength="120" value="${esc(item.name || '')}" placeholder="np. Zaliczka na wodę"></td>
      <td><select class="pi-fee-category">${categoryOptions(item.category || 'other')}</select></td>
      <td><input class="pi-fee-amount" type="text" inputmode="decimal" value="${item.amount === '' ? '' : esc(num(item.amount).toFixed(2).replace('.',','))}" placeholder="0,00"></td>
      <td><button type="button" class="pi-fee-icon-btn" data-fee-remove title="Usuń składnik" aria-label="Usuń składnik">×</button></td>
    </tr>`;
    const row = wrapper.firstElementChild;
    body.appendChild(row);
    row.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',()=>{ updateSummary(); scheduleAutoSave(); }));
    row.querySelector('[data-fee-remove]')?.addEventListener('click',()=>{ row.remove(); if(!body.querySelector('tr')) addRow(); renumberRows(); updateSummary(); scheduleAutoSave(); });
    row.querySelector('.pi-fee-name')?.focus();
    updateSummary();
    scheduleAutoSave();
  }

  function resetDraft(){
    if(!confirm('Wyczyścić wszystkie składniki, odczyty mediów i notatkę dla tego miesiąca? Zmiana zapisze się automatycznie.')) return;
    renderRows([]);
    renderMediaRows([]);
    if($('piFeeNotes')) $('piFeeNotes').value='';
    if($('piFeeTenantVisible')) $('piFeeTenantVisible').checked=true;
    setStatus('Wyczyszczono dane. Zapisywanie…','pending');
    scheduleAutoSave();
  }

  function reportDraft(){
    return normalizeRecord({
      id:state.loadedRecord?.id || uid('report'),
      property_id:state.propertyId,
      effective_month:monthDate(state.month || currentMonth()),
      base_amount:currentBase(),
      items:collectItems(),
      media_items:collectMediaItems(),
      tenant_visible:$('piFeeTenantVisible')?.checked !== false,
      notes:String($('piFeeNotes')?.value || '').trim()
    });
  }

  const PDFMAKE = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js';
  const PDFVFS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js';
  function loadScript(src,test){
    return new Promise((resolve,reject)=>{
      try{ if(test?.()) return resolve(true); }catch(_){ }
      const existing = Array.from(document.scripts).find(s=>s.src===src || s.dataset.piFeePdf===src);
      if(existing){ existing.addEventListener('load',()=>resolve(true),{once:true}); existing.addEventListener('error',()=>reject(new Error('Nie udało się załadować biblioteki PDF.')),{once:true}); return; }
      const script=document.createElement('script'); script.src=src; script.async=true; script.dataset.piFeePdf=src;
      script.onload=()=>resolve(true); script.onerror=()=>reject(new Error('Nie udało się załadować biblioteki PDF.')); document.head.appendChild(script);
    });
  }
  async function ensurePdfMake(){
    await loadScript(PDFMAKE,()=>!!window.pdfMake);
    await loadScript(PDFVFS,()=>!!window.pdfMake?.vfs);
    if(!window.pdfMake?.vfs) throw new Error('Biblioteka PDF nie została załadowana.');
    return window.pdfMake;
  }
  function safeFileName(record,property){
    const base=`PureInvest raport opłat ${property?.name || property?.address || 'mieszkanie'} ${monthKey(record?.effective_month) || currentMonth()}`;
    return base.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,'_').slice(0,120)+'.pdf';
  }
  function pdfTable(body,widths){
    return {table:{headerRows:1,widths,body},layout:{fillColor:rowIndex=>rowIndex===0?'#f4e9dd':null,hLineColor:'#dfd5ca',vLineColor:'#dfd5ca'},fontSize:8,margin:[0,4,0,10]};
  }
  function propertyLine(property){ return [property?.name,property?.address,property?.area_m2 ? decimal(property.area_m2,2)+' m²' : null].filter(Boolean).join(' • '); }
  function reportDefinition(record,property,requestedMonth){
    record=normalizeRecord(record) || {items:[],media_items:[],base_amount:0};
    const fees=normalizeItems(record.items),media=normalizeMediaItems(record.media_items);
    const feeSum=round2(fees.reduce((sum,item)=>sum+num(item.amount),0));
    const actual=round2(media.reduce((sum,item)=>sum+num(item.actual_cost),0));
    const advances=round2(media.reduce((sum,item)=>sum+num(item.advances),0));
    const settlement=round2(actual-advances);
    const content=[
      {columns:[{stack:[{text:'PureInvest OS',fontSize:10,bold:true,color:'#b8642a'},{text:'Raport opłat i zużycia mediów',fontSize:20,bold:true,color:'#17120f',margin:[0,3,0,2]},{text:propertyLine(property) || 'Mieszkanie',fontSize:9,color:'#6b6258'}]},{width:170,stack:[{text:'Raport obowiązuje od',fontSize:8,color:'#786c62',alignment:'right'},{text:formatMonth(monthKey(record.effective_month)),fontSize:12,bold:true,alignment:'right'},{text:requestedMonth && requestedMonth!==monthKey(record.effective_month) ? 'Podgląd dla: '+formatMonth(requestedMonth) : '',fontSize:8,color:'#786c62',alignment:'right'}]}],margin:[0,0,0,14]},
      {table:{widths:['*','*','*','*'],body:[[
        {stack:[{text:'Czynsz administracyjny',fontSize:8,color:'#6b6258'},{text:money(record.base_amount),fontSize:13,bold:true}]},
        {stack:[{text:'Suma składników',fontSize:8,color:'#6b6258'},{text:money(feeSum),fontSize:13,bold:true}]},
        {stack:[{text:'Koszt mediów',fontSize:8,color:'#6b6258'},{text:money(actual),fontSize:13,bold:true}]},
        {stack:[{text:'Rozliczenie mediów',fontSize:8,color:'#6b6258'},{text:settlementLabel(settlement),fontSize:13,bold:true,color:settlement>0.009?'#b42323':settlement<-0.009?'#16723a':'#17120f'}]}
      ]]},layout:{fillColor:'#fff8f0',hLineColor:'#e8d9ca',vLineColor:'#e8d9ca'},margin:[0,0,0,16]}
    ];
    if(fees.length){
      content.push({text:'Składniki czynszu administracyjnego',fontSize:13,bold:true,margin:[0,3,0,5]});
      content.push(pdfTable([
        ['Składnik','Kategoria',{text:'Kwota',alignment:'right'}],
        ...fees.map(item=>[item.name,categoryLabels[item.category] || 'Inne',{text:money(item.amount),alignment:'right'}]),
        [{text:'Razem',colSpan:2,bold:true},'',{text:money(feeSum),alignment:'right',bold:true}]
      ],['*',130,85]));
    }
    if(media.length){
      content.push({text:'Zużycie i rozliczenie mediów',fontSize:13,bold:true,margin:[0,8,0,5]});
      content.push(pdfTable([
        ['Medium','Okres','Stany licznika','Zużycie','Stawka','Koszt','Zaliczki','Rozliczenie'],
        ...media.map(item=>[
          item.name,
          `${formatDate(item.period_from)} – ${formatDate(item.period_to)}`,
          `${item.start_reading===null?'—':decimal(item.start_reading)} → ${item.end_reading===null?'—':decimal(item.end_reading)}`,
          `${decimal(item.consumption)} ${unitLabels[item.unit] || 'j.m.'}`,
          `${money(item.unit_price)} / ${unitLabels[item.unit] || 'j.m.'}`,
          {text:money(item.actual_cost),alignment:'right'},
          {text:money(item.advances),alignment:'right'},
          {text:settlementLabel(item.settlement),alignment:'right',color:item.settlement>0.009?'#b42323':item.settlement<-0.009?'#16723a':'#17120f'}
        ]),
        [{text:'Razem',colSpan:5,bold:true},'','','','',{text:money(actual),alignment:'right',bold:true},{text:money(advances),alignment:'right',bold:true},{text:settlementLabel(settlement),alignment:'right',bold:true}]
      ],[90,90,80,70,80,65,65,85]));
    }
    if(record.notes) content.push({text:'Informacja dodatkowa',fontSize:11,bold:true,margin:[0,10,0,4]},{text:String(record.notes),fontSize:9,color:'#514940'});
    content.push({text:'Raport ma charakter informacyjny. Nie zmienia należności, zaległości ani zapisów finansowych w PureInvest OS.',fontSize:7,color:'#7b7066',margin:[0,16,0,0]});
    return {pageOrientation:'landscape',pageSize:'A4',pageMargins:[28,28,28,25],defaultStyle:{font:'Roboto'},content,footer:(page,pages)=>({text:`PureInvest OS ${BUILD} • ${page}/${pages}`,alignment:'right',fontSize:7,color:'#8a8179',margin:[0,0,28,0]})};
  }
  async function downloadPdf(record,property,requestedMonth){
    record=normalizeRecord(record);
    if(!record || (!record.items.length && !record.media_items.length)) throw new Error('Brak danych do raportu PDF.');
    const pdfMake=await ensurePdfMake();
    pdfMake.createPdf(reportDefinition(record,property,requestedMonth)).download(safeFileName(record,property));
  }
  async function downloadAdminPdf(){
    const record=reportDraft();
    const property=activeProperty();
    const button=$('piFeeDownloadPdfBtn');
    try{ if(button){button.disabled=true;button.textContent='Tworzę PDF…';} await downloadPdf(record,property,state.month); setStatus('Raport PDF został przygotowany.','success'); }
    catch(error){ console.error('PI_FEE_PDF_ERROR',error); setStatus(error.message || 'Nie udało się przygotować PDF.','error'); }
    finally{ if(button){button.disabled=false;button.textContent='Pobierz raport PDF';} }
  }

  function tenantSessionData(){
    try{ return JSON.parse(sessionStorage.getItem('piTenantSessionV54') || 'null'); }catch(_){ return null; }
  }
  function persistTenantFeeReports(data,reports){
    if(!data || !data.property) return;
    data.feeBreakdowns=Array.isArray(reports)?reports:[];
    data._feeReportsFetchedAt=Date.now();
    try{
      const stored=tenantSessionData();
      if(stored?.property && String(stored.property.id)===String(data.property.id)){
        stored.feeBreakdowns=data.feeBreakdowns;
        stored._feeReportsFetchedAt=data._feeReportsFetchedAt;
        sessionStorage.setItem('piTenantSessionV54',JSON.stringify(stored));
      }
    }catch(_){ }
  }
  async function fetchTenantFeeReports(data,force=false){
    const propertyId=String(data?.property?.id || '');
    const token=String(data?.tenantToken || tenantSessionData()?.tenantToken || '');
    if(!propertyId || !token) return Array.isArray(data?.feeBreakdowns)?data.feeBreakdowns:[];
    const last=Number(data?._feeReportsFetchedAt || 0);
    if(!force && last && Date.now()-last<30000) return Array.isArray(data?.feeBreakdowns)?data.feeBreakdowns:[];
    if(state.tenantFetches.has(propertyId) && !force) return state.tenantFetches.get(propertyId);
    const request=(async()=>{
      const response=await fetch('/.netlify/functions/tenant-fee-reports',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-pi-session-token':token},
        body:JSON.stringify({propertyId}),
        cache:'no-store'
      });
      const payload=await response.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź serwera.'}));
      if(!response.ok || !payload?.ok){
        const error=new Error(payload?.message || 'Nie udało się pobrać raportów opłat i mediów.');
        error.code=payload?.code || '';
        error.status=response.status;
        throw error;
      }
      const reports=mergeReportSources(Array.isArray(payload.reports)?payload.reports:[],mirrorReportsFromDocuments(data?.documents));
      persistTenantFeeReports(data,reports);
      return reports;
    })().finally(()=>state.tenantFetches.delete(propertyId));
    state.tenantFetches.set(propertyId,request);
    return request;
  }
  function tenantRecordByMonth(records,month){
    const visible=(records || []).map(normalizeRecord).filter(row=>row && row.tenant_visible!==false).sort((a,b)=>String(b.effective_month).localeCompare(String(a.effective_month)));
    return recordForMonth(visible,month).record || visible[0] || null;
  }
  function tenantMediaTable(media){
    if(!media.length) return '<div class="pi-tenant-muted">W tym raporcie nie wpisano rozliczenia zużycia mediów.</div>';
    return `<div class="pi-tenant-fee-table-wrap"><table class="pi-tenant-fee-table pi-tenant-media-report-table"><thead><tr><th>Medium</th><th>Okres</th><th>Stan pocz.</th><th>Stan końc.</th><th>Zużycie</th><th>Koszt</th><th>Zaliczki</th><th>Rozliczenie</th></tr></thead><tbody>${media.map(item=>`<tr><td><b>${esc(item.name)}</b><small>${esc(money(item.unit_price))} / ${esc(unitLabels[item.unit] || 'j.m.')}</small>${item.meter_source?.source==='tenant_meter_readings'?`<small class="pi-tenant-media-source">Odczyt z panelu najemcy${item.meter_source.end_date?' • '+esc(formatDate(item.meter_source.end_date)):''}</small>`:''}</td><td>${esc(formatDate(item.period_from))}<br>${esc(formatDate(item.period_to))}</td><td>${item.start_reading===null?'—':esc(decimal(item.start_reading))}</td><td>${item.end_reading===null?'—':esc(decimal(item.end_reading))}</td><td>${esc(decimal(item.consumption))} ${esc(unitLabels[item.unit] || 'j.m.')}</td><td>${esc(money(item.actual_cost))}</td><td>${esc(money(item.advances))}</td><td><span class="pi-tenant-fee-settlement ${item.settlement>0.009?'due':item.settlement<-0.009?'over':'ok'}">${esc(settlementLabel(item.settlement))}</span></td></tr>`).join('')}</tbody></table></div>`;
  }
  function tenantFeeTable(items){
    if(!items.length) return '<div class="pi-tenant-muted">W tym raporcie nie wpisano szczegółowego rozbicia czynszu.</div>';
    const total=round2(items.reduce((sum,item)=>sum+num(item.amount),0));
    return `<div class="pi-tenant-fee-table-wrap"><table class="pi-tenant-fee-table"><thead><tr><th>Składnik</th><th>Kategoria</th><th>Kwota</th></tr></thead><tbody>${items.map(item=>`<tr><td>${esc(item.name)}</td><td>${esc(categoryLabels[item.category] || 'Inne')}</td><td><b>${esc(money(item.amount))}</b></td></tr>`).join('')}<tr class="total"><td colspan="2">Razem</td><td>${esc(money(total))}</td></tr></tbody></table></div>`;
  }
  function renderTenantRecord(record,data,requestedMonth){
    const content=$('tenantFeeReportContentV193');
    const subtitle=$('tenantFeeReportSubtitleV193');
    if(!content || !record) return;
    const bridge=meterBridge();
    const meterMonth=/^\d{4}-\d{2}$/.test(String(requestedMonth || '')) ? requestedMonth : monthKey(record.effective_month);
    if(bridge && Array.isArray(data?.meterReadings)){
      const merged=bridge.mergeMediaItems(record.media_items,data.meterReadings,meterMonth);
      record=normalizeRecord({...record,media_items:merged.items});
    }
    const fees=normalizeItems(record.items),media=normalizeMediaItems(record.media_items);
    const feeSum=round2(fees.reduce((sum,item)=>sum+num(item.amount),0));
    const actual=round2(media.reduce((sum,item)=>sum+num(item.actual_cost),0));
    const advances=round2(media.reduce((sum,item)=>sum+num(item.advances),0));
    const settlement=round2(actual-advances);
    if(subtitle) subtitle.textContent=`Raport obowiązuje od ${formatMonth(monthKey(record.effective_month))}${requestedMonth && requestedMonth!==monthKey(record.effective_month) ? ' • podgląd dla '+formatMonth(requestedMonth) : ''}.`;
    content.classList.remove('pi-tenant-fee-loading-v198');
    content.innerHTML=`
      <div class="pi-tenant-fee-kpis">
        <div><span>Czynsz administracyjny</span><b>${esc(money(record.base_amount))}</b></div>
        <div><span>Suma składników</span><b>${esc(money(feeSum))}</b></div>
        <div><span>Koszt mediów</span><b>${esc(money(actual))}</b></div>
        <div><span>Rozliczenie mediów</span><b class="${settlement>0.009?'due':settlement<-0.009?'over':'ok'}">${esc(settlementLabel(settlement))}</b></div>
      </div>
      <div class="pi-tenant-fee-section"><h4>Składniki opłat</h4>${tenantFeeTable(fees)}</div>
      <div class="pi-tenant-fee-section"><h4>Zużycie i rozliczenie mediów</h4>${tenantMediaTable(media)}</div>
      ${record.notes ? `<div class="pi-tenant-fee-note"><b>Informacja dodatkowa</b><span>${esc(record.notes)}</span></div>` : ''}`;
    const button=$('tenantFeePdfBtnV193');
    if(button){ button.disabled=false; button.onclick=async()=>{ try{ button.disabled=true;button.textContent='Tworzę PDF…'; await downloadPdf(record,data?.property || {},requestedMonth); }catch(error){ alert(error.message || 'Nie udało się przygotować raportu PDF.'); }finally{button.disabled=false;button.textContent='Pobierz PDF';} }; }
  }
  function renderTenantFeeReport(data,options={}){
    data=data && data.property ? data : tenantSessionData();
    const card=$('tenantFeeReportCardV193');
    const select=$('tenantFeeReportMonthV193');
    const content=$('tenantFeeReportContentV193');
    const subtitle=$('tenantFeeReportSubtitleV193');
    const pdfButton=$('tenantFeePdfBtnV193');
    const refreshButton=$('tenantFeeRefreshBtnV198');
    if(!card || !select || !content) return;
    if(!data?.property){ card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    const records=mergeReportSources(Array.isArray(data?.feeBreakdowns)?data.feeBreakdowns:[],mirrorReportsFromDocuments(data?.documents)).filter(row=>row && row.tenant_visible!==false);
    if(!records.length){
      select.innerHTML='<option value="">Brak raportów</option>';
      select.disabled=true;
      if(pdfButton) pdfButton.disabled=true;
      if(subtitle) subtitle.textContent='Raporty udostępnione przez właściciela lub zarządcę pojawią się tutaj.';
      content.innerHTML='<div class="pi-tenant-fee-empty-v198">Brak udostępnionego raportu opłat i zużycia mediów dla tego mieszkania.</div>';
    }else{
      select.disabled=false;
      const target=currentMonth();
      const months=[...new Set(records.map(row=>monthKey(row.effective_month)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
      select.innerHTML=months.map(month=>`<option value="${esc(month)}">${esc(formatMonth(month))}</option>`).join('');
      const applicable=recordForMonth(records,target).record || records[0];
      select.value=monthKey(applicable.effective_month);
      select.onchange=()=>{
        const requested=select.value;
        const selected=records.find(row=>monthKey(row.effective_month)===requested) || tenantRecordByMonth(records,requested);
        renderTenantRecord(selected,data,requested);
      };
      renderTenantRecord(applicable,data,target);
    }
    if(refreshButton){
      refreshButton.onclick=async()=>{
        refreshButton.disabled=true;
        const old=refreshButton.textContent;
        refreshButton.textContent='Odświeżam…';
        try{
          const reports=await fetchTenantFeeReports(data,true);
          data.feeBreakdowns=reports;
          renderTenantFeeReport(data,{skipRemote:true});
        }catch(error){
          if(subtitle) subtitle.textContent=error.message || 'Nie udało się pobrać raportów.';
        }finally{ refreshButton.disabled=false;refreshButton.textContent=old; }
      };
    }
    if(!options.skipRemote){
      content.classList.add('pi-tenant-fee-loading-v198');
      fetchTenantFeeReports(data,!!options.forceRemote).then(reports=>{
        data.feeBreakdowns=reports;
        renderTenantFeeReport(data,{skipRemote:true});
      }).catch(error=>{
        content.classList.remove('pi-tenant-fee-loading-v198');
        if(!records.length){
          if(subtitle) subtitle.textContent=error.message || 'Nie udało się pobrać raportów.';
          content.innerHTML=`<div class="pi-tenant-fee-empty-v198 pi-tenant-fee-error-v1910"><b>Raport nie został opublikowany w bazie.</b><span>${esc(error.message || 'Nie udało się pobrać raportów.')}</span></div>`;
          select.innerHTML='<option value="">Brak raportów w bazie</option>';
          select.disabled=true;
          if(pdfButton) pdfButton.disabled=true;
        }
      });
    }
  }

  async function render(options={}){
    await ensureProperties();
    if(options.preferActive){
      const currentActiveId = activeId();
      const exists = properties().some(property=>String(property.id)===String(currentActiveId));
      if(currentActiveId && exists && String(state.propertyId || '') !== String(currentActiveId)){
        await flushAutoSave();
        state.propertyId = String(currentActiveId);
      }
    }
    populatePropertySelect({preferActive:!!options.preferActive});
    const monthInput = $('piFeeMonth');
    if(monthInput && !monthInput.value) monthInput.value = state.month || currentMonth();
    state.month = monthInput?.value || currentMonth();
    await loadCurrent();
    const editable = canEdit();
    document.querySelectorAll('#tab-fee-breakdowns [data-fee-edit]').forEach(el=>{ el.disabled=!editable; el.title=editable?'':'Edycja dostępna tylko dla administratora.'; });
    document.querySelectorAll('#piFeeItemsBody input,#piFeeItemsBody select,#piMediaItemsBody input,#piMediaItemsBody select,#piFeeNotes,#piFeeTenantVisible').forEach(el=>{ el.disabled=!editable; });
    updateMeterReadingStatus();
  }

  function bind(){
    $('piFeeProperty')?.addEventListener('change',async()=>{ await flushAutoSave(); state.propertyId=$('piFeeProperty').value; await loadCurrent(); });
    $('piFeeMonth')?.addEventListener('change',async()=>{ await flushAutoSave(); state.month=$('piFeeMonth').value; await loadCurrent(); });
    $('piFeeAddRowBtn')?.addEventListener('click',()=>addRow());
    $('piMediaAddRowBtn')?.addEventListener('click',()=>addMediaRow());
    $('piMediaImportBtn')?.addEventListener('click',importMeterReadings);
    $('piFeeSaveBtn')?.addEventListener('click',()=>saveCurrent({auto:false}));
    $('piFeeNotes')?.addEventListener('input',scheduleAutoSave);
    $('piFeeTenantVisible')?.addEventListener('change',scheduleAutoSave);
    $('piFeeDeleteBtn')?.addEventListener('click',deleteCurrent);
    $('piFeeResetBtn')?.addEventListener('click',resetDraft);
    $('piFeeDownloadPdfBtn')?.addEventListener('click',async()=>{ await flushAutoSave(); await downloadAdminPdf(); });
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden' && state.dirty) saveCurrent({auto:true}); });
  }

  window.piFeePreferredPropertyIdV1912 = preferredPropertyId;
  window.piRenderFeeBreakdowns = options => render(options || {});
  window.piFeeAddRow = addRow;
  window.piMediaAddRowV193 = addMediaRow;
  window.piFeeSave = saveCurrent;
  window.piFeeDelete = deleteCurrent;
  window.piDownloadFeeBreakdownPdfV193 = downloadPdf;
  window.piRenderTenantFeeReportV193 = renderTenantFeeReport;

  const originalSwitch = window.switchTab;
  if(typeof originalSwitch === 'function' && !originalSwitch.__piFeeBreakdown193){
    const wrapped = function(tab,navEl){
      const result = originalSwitch.apply(this,arguments);
      if(tab === 'fee-breakdowns') setTimeout(()=>render({preferActive:true}),60);
      return result;
    };
    wrapped.__piFeeBreakdown193 = true;
    window.switchTab = wrapped;
  }

  function wrapTenantRender(name){
    const original=window[name];
    if(typeof original!=='function' || original.__piFeeTenant193) return;
    const wrapped=function(data){
      const result=original.apply(this,arguments);
      setTimeout(()=>renderTenantFeeReport(data),20);
      return result;
    };
    wrapped.__piFeeTenant193=true;
    window[name]=wrapped;
  }
  function connectTenant(){
    wrapTenantRender('showTenantPortalV54');
    wrapTenantRender('renderTenantPortalV54');
    renderTenantFeeReport();
  }

  document.addEventListener('DOMContentLoaded',()=>{ bind(); connectTenant(); });
  window.addEventListener('pageshow',connectTenant);
  window.addEventListener('pi:tenant-session-rendered',event=>{
    const data=event?.detail?.data;
    setTimeout(()=>renderTenantFeeReport(data,{forceRemote:true}),0);
  });
  setTimeout(connectTenant,250);
})();
