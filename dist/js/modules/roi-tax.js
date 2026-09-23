(function(){
  const TAX_RATE = 0.085;
  const fmt = v => (typeof money === 'function' ? money(v||0) : (Number(v||0).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł'));
  const n = v => Number(v || 0);
  const clean = v => String(v ?? '').trim();

  function activeProp(){
    try{
      if(typeof activePropertyData !== 'undefined' && activePropertyData) return activePropertyData;
      const id = (typeof activeProperty !== 'undefined' && activeProperty) ? activeProperty : window.activeProperty;
      if(id && Array.isArray(loadedProperties)){
        const found = loadedProperties.find(p=>String(p.id)===String(id));
        if(found) return found;
      }
    }catch(e){}
    return window.activePropertyData || null;
  }
  function activePropId(property){
    try{
      return property?.id || ((typeof activeProperty !== 'undefined' && activeProperty) ? activeProperty : window.activeProperty) || '';
    }catch(e){ return property?.id || window.activeProperty || ''; }
  }
  function monthStartISO(){ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0).toISOString(); }
  function nextMonthStartISO(){ const d=new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 1, 0,0,0,0).toISOString(); }
  function currentMonthKey(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function mkey(v){ try{ return (typeof monthKey==='function') ? monthKey(v) : new Date(v).toISOString().slice(0,7); }catch(e){ return ''; } }
  function paymentMonth(row){
    try{ return window.PureInvestPaymentPeriod?.settlementMonth?.(row) || mkey(row?.payment_date || row?.created_at); }
    catch(_){ return mkey(row?.payment_date || row?.created_at); }
  }
  const norm = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const settlementItems = property => {
    try{
      if(typeof window.piAutoMigrateLegacySettlement === 'function') window.piAutoMigrateLegacySettlement(property);
      if(typeof window.piGetEffectiveSettlementItems === 'function') return window.piGetEffectiveSettlementItems(property) || [];
      if(window.piSettlementDictionary?.effectiveMonthlyItems) return window.piSettlementDictionary.effectiveMonthlyItems(property) || [];
    }catch(e){}
    return [];
  };
  function isRentPayment(x){
    const src = clean(x?.source || x?.category || x?.note).toLowerCase();
    const comp = clean(x?.settlement_component).toLowerCase();
    return comp === 'owner' || comp === 'owner_rent' || src.includes('najem') || src.includes('czynsz najmu') || src.includes('rent');
  }
  function expectedIncome(property, expenses=[]){
    if(!property) return 0;
    try{
      const due = Core().dueComponents?.(property, expenses || []);
      const total = ['owner','community','electricity','gas','water','other'].reduce((s,k)=>s+n(due?.[k]),0);
      if(total > 0) return total;
    }catch(e){}
    const items = settlementItems(property).filter(x => x && x.active !== false && x.recurring === 'monthly' && x.tenant_due !== false && x.payer !== 'owner');
    if(items.length) return items.reduce((s,x)=>s+n(x.default_amount),0);
    const split = n(property.owner_rent)+n(property.community_rent)+n(property.electricity_expected)+n(property.gas_expected)+n(property.water_expected);
    if(split > 0) return split;
    return n(property.rent_amount || property.monthly_rent);
  }
  function ownerRentBase(property){
    try{ const v = window.piTenantRentTaxBase?.(property); if(n(v)>0) return n(v); }catch(e){}
    const items = settlementItems(property).filter(x => x && x.active !== false && x.recurring === 'monthly' && x.tenant_due !== false && x.payer !== 'owner');
    const ownerItem = items.find(x => x.kind === 'income' && /^(owner|owner_rent)$/i.test(String(x.component || '')));
    if(ownerItem) return n(ownerItem.default_amount);
    return n(property?.owner_rent || property?.owner_monthly_rent || property?.rent || 0);
  }
  function isTenantPassThroughExpense(row, property){
    const name = norm(row?.category || row?.source || row?.name || '');
    const items = settlementItems(property).filter(x => x && x.kind === 'expense' && x.active !== false && x.recurring === 'monthly');
    const match = items.find(x => norm(x.name) === name);
    if(match) return match.tenant_due !== false && match.payer !== 'owner';
    const comp = String(row?.settlement_component || '').toLowerCase();
    if(['community','electricity','gas','water'].includes(comp)) return true;
    const txt = norm([row?.category,row?.source,row?.note].filter(Boolean).join(' '));
    return /(czynsz|administr|wspol|prad|energia|gaz|woda|smieci|odpady)/.test(txt);
  }
  async function monthRows(table, propertyId){
    if(!window.db || !propertyId) return [];
    let query=db.from(table).select('*').eq('property_id',propertyId);
    if(table !== 'payments') query=query.gte('created_at',monthStartISO()).lt('created_at',nextMonthStartISO());
    const {data,error}=await query;
    if(error){ console.warn('Month rows', table, error); return []; }
    const rows=data || [];
    return table === 'payments' ? rows.filter(row=>paymentMonth(row)===currentMonthKey()) : rows;
  }
  async function v7AnalyzeProperty(property){
    property = property || activeProp();
    const pid = activePropId(property);
    let payments = [], expenses = [];
    try{
      const current = currentMonthKey();
      if(Array.isArray(rawPayments) && String(pid)===String(activePropId(activeProp()))){
        payments = rawPayments.filter(x=>paymentMonth(x)===current);
      }
      if(Array.isArray(rawExpenses) && String(pid)===String(activePropId(activeProp()))){
        expenses = rawExpenses.filter(x=>mkey(x.created_at)===current);
      }
    }catch(e){}
    if(!payments.length && !expenses.length){
      [payments, expenses] = await Promise.all([monthRows('payments', pid), monthRows('expenses', pid)]);
    }
    const expected = expectedIncome(property, expenses);
    const paid = payments.reduce((a,b)=>a+n(b.amount),0);
    const paidRent = payments.filter(isRentPayment).reduce((a,b)=>a+n(b.amount),0) || Math.min(paid, ownerRentBase(property) || paid);
    const costs = expenses.reduce((a,b)=>a+n(b.amount),0);
    const passThroughCosts = expenses.filter(x=>isTenantPassThroughExpense(x, property)).reduce((a,b)=>a+n(b.amount),0);
    const ownerCosts = Math.max(0, costs - passThroughCosts);
    const rentBase = ownerRentBase(property);

    const rentIncomeForRoi = rentBase > 0 ? rentBase : (paidRent > 0 ? paidRent : 0);
    const taxableBase = rentIncomeForRoi;
    const tax = window.PureInvestTaxPolicy?.annualTax ? window.PureInvestTaxPolicy.annualTax(taxableBase * 12) / 12 : taxableBase * TAX_RATE;
    const missing = Math.max(expected-paid,0);
    const gross = rentIncomeForRoi - ownerCosts;
    const net = gross - tax;
    const roiMonthlyNet = rentIncomeForRoi - tax - ownerCosts;
    const projectedNet = roiMonthlyNet;
    const purchase = n(property?.purchase_price || property?.market_value || property?.investment_value);
    const equity = n(property?.equity_invested) || purchase;
    const annualNet = roiMonthlyNet * 12;
    const roi = purchase > 0 ? (annualNet / purchase) * 100 : null;
    const roe = equity > 0 ? (annualNet / equity) * 100 : null;
    const paybackYears = purchase > 0 && annualNet > 0 ? (purchase / annualNet) : null;
    const arrears = (()=>{ try{ const r=window.PureInvestArrears; return r && String(r.propertyId || pid || '')===String(pid || r.propertyId || '') ? r : null; }catch(_){ return null; } })();
    const cumulativeMissing = Math.max(missing, n(arrears?.totalMissing));
    const arrearsMonths = Array.isArray(arrears?.months) ? arrears.months : [];
    let health='warn', status='Wymaga danych', title='Zdrowie mieszkania', text='Uzupełnij cenę zakupu i pełny podział najmu, aby ROI było precyzyjne.';
    if(expected>0 && cumulativeMissing > 0){
      health='bad'; status='Zaległość';
      const oldest = arrearsMonths[0]?.shortLabel || '';
      const months = arrearsMonths.map(m=>m.shortLabel).join(', ');
      text = arrearsMonths.length
        ? `Brakuje ${fmt(cumulativeMissing)} łącznie do pełnych należności najemcy. Najstarsza zaległość: <b>${oldest}</b>. Miesiące z brakiem: ${months}. System liczy narastająco: najem + czynsz administracyjny + media/rachunki obciążające najemcę.`
        : `Łącznie do rozliczenia ${fmt(cumulativeMissing)} za bieżący i wcześniejsze miesiące: najem + czynsz administracyjny + media/rachunki obciążające najemcę.`;
    }
    else if(paid===0 && expected===0){ health='warn'; status='Brak danych'; text='Brak wpłat i oczekiwanej należności dla bieżącego miesiąca. Uzupełnij najem albo dodaj wpłatę.'; }
    else if(roi !== null && roi >= 7){ health='good'; status='Zdrowe'; text=`Mieszkanie wygląda zdrowo: najem z karty ${fmt(rentIncomeForRoi)}, prognozowany zysk z najmu po podatku ${fmt(roiMonthlyNet)}, ROI ok. ${roi.toFixed(1)}%.`; }
    else if(roi !== null && roi < 5){ health='warn'; status='Niska rentowność'; text=`ROI ok. ${roi.toFixed(1)}% liczone tylko od najmu z karty. Sprawdź stawkę najmu lub cenę zakupu.`; }
    else if(paid > 0){ health='good'; status='Operacyjnie OK'; text=`Wpłaty są zaksięgowane. Prognozowany zysk z najmu po podatku: ${fmt(roiMonthlyNet)}.`; }
    return {expected, paid, paidRent, costs, passThroughCosts, ownerCosts, rentBase, rentIncomeForRoi, tax, missing:cumulativeMissing, currentMissing:missing, arrearsMonths, gross, net, roiMonthlyNet, projectedNet, purchase, equity, annualNet, roi, roe, paybackYears, health, status, title, text, payments, expenses};
  }
  window.PureInvestV7RentEngine = { analyzeProperty:v7AnalyzeProperty, expectedIncome };
  async function renderV7RentEngine(){
    const property = activeProp();
    if(!property) return;
    const r = await v7AnalyzeProperty(property);
    const set=(id,val)=>{const el=document.getElementById(id); if(el) el.innerText=val;};
    set('v7MonthlyIncome', fmt(r.rentIncomeForRoi));
    set('v7MonthlyCosts', fmt(r.ownerCosts));
    set('v7MonthlyNet', fmt(r.net));
    set('v7Roi', r.roi===null ? '—' : r.roi.toFixed(1)+'%');
    set('v7RoiHint', r.roi===null ? 'Uzupełnij cenę zakupu mieszkania.' : `ROI z najmu: ${fmt(r.rentIncomeForRoi)} - podatek ${fmt(r.tax)} = ${fmt(r.roiMonthlyNet)}/mc`);
    const box=document.getElementById('v7HealthBox');
    if(box){ box.classList.remove('good','warn','bad'); box.classList.add(r.health); }
    set('v7HealthStatus', r.status);
    set('v7HealthTitle', r.title);
    const txt=document.getElementById('v7HealthText'); if(txt) txt.innerHTML=r.text;
    renderV7Parobek(r);
  }
  window.renderV7RentEngine = renderV7RentEngine;
  function renderV7Parobek(r){
    const set=(id,val)=>{const el=document.getElementById(id); if(el) el.innerHTML=val;};
    if(!document.getElementById('v7AiUrgent')) return;
    if(r.expected>0 && r.missing>0){ set('v7AiUrgent',`Brakuje <b>${fmt(r.missing)}</b> do pełnej należności najemcy: najem + opłaty + media. Sprawdź wpłatę najemcy.`); set('v7AiUrgentMeta',`Wpłacono ${fmt(r.paid)} z ${fmt(r.expected)}`); }
    else if(r.paid>0){ set('v7AiUrgent',`Brak pilnej akcji. W tym miesiącu zaksięgowano wpłaty: <b>${fmt(r.paid)}</b>.`); set('v7AiUrgentMeta','Bieżący miesiąc'); }
    else { set('v7AiUrgent','Brak wpłaty w bieżącym miesiącu. Jeżeli termin już minął, skontaktuj się z najemcą.'); set('v7AiUrgentMeta','Monitoring płatności'); }
    if(r.net<0){ set('v7AiFinancial',`Mieszkanie jest na minusie po podatku: <b>${fmt(r.net)}</b>. Sprawdź koszty.`); }
    else { set('v7AiFinancial',`Prognozowany zysk po podatku: <b>${fmt(r.net)}</b>. Koszty właściciela: ${fmt(r.ownerCosts)}. Opłaty zwrotne najemcy: ${fmt(r.passThroughCosts)}.`); }
    set('v7AiFinancialMeta',`Podatek 8,5% od najmu z karty: ${fmt(r.tax)}`);
    if(r.roi===null){
      set('v7AiInvestment','Brakuje ceny zakupu. Uzupełnij ją w danych mieszkania, aby AIos\' policzył ROI.');
    }
    else if(r.roi<5){
      set('v7AiInvestment',`ROI ok. <b>${r.roi.toFixed(1)}%</b>. Rentowność wymaga analizy czynszu i kosztów.`);
    }
    else if(r.roi>=8){
      set('v7AiInvestment',`ROI ok. <b>${r.roi.toFixed(1)}%</b>. Lokal wygląda inwestycyjnie mocno.`);
    }
    else {
      set('v7AiInvestment',`ROI ok. <b>${r.roi.toFixed(1)}%</b>. Wynik stabilny, ale jest miejsce na optymalizację.`);
    }
    const annualLine = r.annualNet ? `Prognozowany zysk z najmu netto rocznie: <b>${fmt(r.annualNet)}</b>` : 'Prognozowany zysk z najmu netto rocznie: brak danych';
    const paybackLine = r.paybackYears ? `Zwrot inwestycji: ok. <b>${r.paybackYears.toFixed(1)} lat</b>` : 'Zwrot inwestycji: brak danych';
    set('v7AiInvestmentMeta',`${annualLine}<br>${paybackLine}`);
  }
;
  const oldOpenDashboard = window.openDashboard;
  if(typeof oldOpenDashboard === 'function' && !window.__piV711OpenDashboardHook){
    window.__piV711OpenDashboardHook = true;

  }
  const oldHydrate = window.hydratePropertyForms;
  if(typeof oldHydrate === 'function' && !window.__piV711HydrateHook){
    window.__piV711HydrateHook = true;

  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
    if(document.body.classList.contains('authenticated')) renderV7RentEngine();
  },800));
})();
