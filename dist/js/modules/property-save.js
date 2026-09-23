(function(){
  const $ = (id)=>document.getElementById(id);
  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const clean = (id)=>($(id)?.value || '').trim();
  function setStatus(msg, good=false){
    const el=$('propertySaveStatusV727');
    if(!el) return;
    el.innerHTML = msg || '';
    el.style.color = good ? '#166534' : '#6b6258';
  }
  function parseMoneyPL(value){
    let raw = String(value ?? '').trim();
    if(!raw) return null;
    raw = raw.replace(/zł|pln/ig,'').replace(/\s+/g,'').replace(/\u00A0/g,'');
    if(raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g,'').replace(',', '.');
    else if(raw.includes(',')) raw = raw.replace(',', '.');
    if(/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g,'');
    raw = raw.replace(/[^0-9.\-]/g,'');
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  function fmtPLN(n){
    const v=Number(n||0);
    if(!Number.isFinite(v) || v<=0) return '—';
    return v.toLocaleString('pl-PL',{maximumFractionDigits:2})+' zł';
  }
  function getActivePropertyIdV727(){
    try{ if(typeof activeProperty !== 'undefined' && activeProperty) return String(activeProperty?.id || activeProperty); }catch(e){}
    try{ if(typeof activePropertyData !== 'undefined' && activePropertyData?.id) return String(activePropertyData.id); }catch(e){}
    if(window.activePropertyData?.id) return String(window.activePropertyData.id);
    if(window.activeProperty) return String(window.activeProperty?.id || window.activeProperty);
    return '';
  }
  function getActivePropertyDataV727(){
    try{ if(typeof activePropertyData !== 'undefined' && activePropertyData) return activePropertyData; }catch(e){}
    if(window.activePropertyData) return window.activePropertyData;
    const id=getActivePropertyIdV727();
    try{
      if(id && typeof loadedProperties !== 'undefined' && Array.isArray(loadedProperties)) return loadedProperties.find(p=>String(p.id)===String(id)) || null;
    }catch(e){}
    return null;
  }
  function syncInvestmentFieldsV727(){
    const p=getActivePropertyDataV727() || {};
    if($('editPurchasePrice')) $('editPurchasePrice').value = p.purchase_price || p.market_value || '';
    if($('editPurchaseDate')) $('editPurchaseDate').value = p.purchase_date || '';
    if($('editEquityInvested')) $('editEquityInvested').value = p.equity_invested || '';
    if($('propertySaveStatusV727')) setStatus('Cena zakupu zasila ROI i rekomendacje Parobka AI.');
  }
  async function savePropertyPayloadV727(propertyId, payload){
    let body={...payload};
    const removed=[];
    for(let i=0;i<10;i++){
      const res = await db.from('properties').update(body).eq('id', propertyId).select('*').maybeSingle();
      if(!res.error){
        if(!res.data) throw new Error('Supabase nie zwrócił zapisanego rekordu. Sprawdź RLS dla tabeli properties oraz aktualne migracje PureInvest OS.');
        return {data:res.data, removed};
      }
      const msg = res.error.message || '';
      const m = msg.match(/Could not find the '([^']+)' column|column "([^"]+)"|column ([a-zA-Z0-9_]+) does not exist/i);
      const col = m && (m[1] || m[2] || m[3]);
      if(col === 'market_value' && Object.prototype.hasOwnProperty.call(body, col)){
        removed.push(col); delete body[col]; continue;
      }
      if(['purchase_price','purchase_date','equity_invested','area_m2'].includes(col)){
        throw new Error('Brakuje kolumny '+col+' w tabeli properties. Uruchom aktualne migracje PureInvest OS w Supabase.');
      }
      throw res.error;
    }
    throw new Error('Nie udało się dopasować zapisu mieszkania do schematu Supabase.');
  }

  const oldHydrate = window.hydratePropertyForms;
  if(typeof oldHydrate === 'function' && !window.__piHydrateV727){
    window.__piHydrateV727 = true;

  }
  const oldSwitch = window.switchTab;
  if(typeof oldSwitch === 'function' && !window.__piSwitchV727){
    window.__piSwitchV727 = true;

  }
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(syncInvestmentFieldsV727, 900));
})();
