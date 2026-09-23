(function(){
  if(window.__PI_RENT_AUTOPILOT_1751__) return;
  window.__PI_RENT_AUTOPILOT_1751__ = true;

  const $ = id => document.getElementById(id);
  const Core = () => window.PureInvestFinanceCore || {};
  const STATE = { properties: [], payments: [], expenses: [], rows: [], month: currentMonthKey(), loading:false, onlyIssues:false, lastRenderedAt:null };
  const COMPONENT_LABELS = {
    owner:'Najem właścicielski', owner_rent:'Najem właścicielski', community:'Czynsz administracyjny', electricity:'Prąd', gas:'Gaz', water:'Woda', media:'Media', trash:'Śmieci', garbage:'Śmieci', rubbish:'Śmieci', waste:'Śmieci', surcharge:'Dopłaty', adjustment:'Dopłaty', other:'Pozostałe opłaty'
  };

  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function num(v){ return Core().num ? Core().num(v) : (Number(String(v ?? '').replace(/\s/g,'').replace(',','.').replace(/[^0-9.\-]/g,'')) || 0); }
  function money(v){ return Core().money ? Core().money(v) : (num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł'); }
  function liveRows(rows){ return Core().liveRows ? Core().liveRows(rows) : (rows||[]).filter(r => r && r.is_deleted !== true && !r.deleted_at && !['archived','rejected','duplicate'].includes(String(r.transaction_status||'').toLowerCase())); }
  function rowDate(row){ return row?.payment_date || row?.expense_date || row?.date || row?.paid_at || row?.issued_at || row?.created_at || row?.createdAt || null; }
  function monthKey(value){
    const d = value instanceof Date ? value : new Date(value || Date.now());
    if(!Number.isFinite(d.getTime())) return '';
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function currentMonthKey(){ return monthKey(new Date()); }
  function monthLabel(key){
    const names=['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
    const y=String(key).slice(0,4), m=Number(String(key).slice(5,7));
    return (names[m-1] || key)+' '+y;
  }
  function shortMonthLabel(key){
    const names=['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
    const y=String(key).slice(0,4), m=Number(String(key).slice(5,7));
    return (names[m-1] || key)+' '+y;
  }
  function addMonthKey(key, delta){
    const y=Number(String(key).slice(0,4)), m=Number(String(key).slice(5,7));
    const d=new Date(y, m-1+(Number(delta)||0), 1);
    return monthKey(d);
  }
  function firstMonthForProperty(property, targetMonth){
    const target = new Date(Number(String(targetMonth).slice(0,4)), Number(String(targetMonth).slice(5,7))-1, 1);
    const candidates = [property?.lease_start, property?.rent_start, property?.created_at, property?.purchase_date].filter(Boolean);
    for(const c of candidates){
      const d = new Date(c);
      if(Number.isFinite(d.getTime())){
        const x = new Date(d.getFullYear(), d.getMonth(), 1);
        const min = new Date(target.getFullYear(), target.getMonth()-35, 1);
        return x < min ? min : x;
      }
    }
    return new Date(target.getFullYear(), 0, 1);
  }
  function monthsUntil(property, targetMonth){
    const target = new Date(Number(String(targetMonth).slice(0,4)), Number(String(targetMonth).slice(5,7))-1, 1);
    let d = firstMonthForProperty(property, targetMonth);
    const out=[];
    while(d <= target){ out.push(monthKey(d)); d = new Date(d.getFullYear(), d.getMonth()+1, 1); }
    return out;
  }
  function dueDate(key, property){
    const y=Number(String(key).slice(0,4)), m=Number(String(key).slice(5,7));
    const day = Math.max(1, Math.min(31, Number(property?.payment_day || property?.rent_due_day || property?.payment_due_day || 10) || 10));
    const last = new Date(y, m, 0).getDate();
    return new Date(y, m-1, Math.min(day,last), 23,59,59,999);
  }
  function dueDateLabel(key, property){
    const d=dueDate(key, property);
    return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
  }
  function sameProp(row, property){ return String(row?.property_id || '') === String(property?.id || ''); }
  function allocationMonth(row){
    try{ if(window.PureInvestPaymentPeriod?.allocationMonth) return window.PureInvestPaymentPeriod.allocationMonth(row); }catch(_){ }
    return monthKey(rowDate(row));
  }
  function rowsFor(rows, property, key){ return liveRows(rows).filter(r => sameProp(r, property) && allocationMonth(r) === key); }
  function allPaymentsFor(property){ return liveRows(STATE.payments).filter(r => sameProp(r, property) && isPaymentEligible(r)); }
  function isPaymentEligible(row){
    const status = String(row?.transaction_status || '').toLowerCase();
    if(['rejected','duplicate','archived'].includes(status)) return false;
    const comp = String(row?.settlement_component || '').toLowerCase();
    if(comp === 'deposit') return false;
    const txt = String([row?.source,row?.category,row?.note,row?.name].filter(Boolean).join(' ')).toLowerCase();
    if(/kaucj|deposit/.test(txt)) return false;
    return true;
  }
  function componentLabel(item){
    const key = String(item?.component || item?.settlement_component || '').toLowerCase();
    if(COMPONENT_LABELS[key]) return COMPONENT_LABELS[key];
    const name = String(item?.name || item?.category || item?.source || '').trim();
    if(name) return name;
    return COMPONENT_LABELS.other;
  }
  function settlementItems(property){
    try{
      if(typeof window.piGetEffectiveSettlementItems === 'function') return (window.piGetEffectiveSettlementItems(property) || []).filter(Boolean);
      if(window.piSettlementDictionary?.effectiveMonthlyItems) return (window.piSettlementDictionary.effectiveMonthlyItems(property) || []).filter(Boolean);
    }catch(_){ }
    return [];
  }
  function staticDueRows(property){
    const items = settlementItems(property).filter(x => x && x.active !== false && x.recurring === 'monthly' && x.tenant_due !== false && x.payer !== 'owner');
    if(items.length){
      return items.map(item => ({
        key: String(item.component || item.id || item.name || 'other').toLowerCase(),
        label: componentLabel(item),
        amount: num(item.default_amount),
        source:'fixed'
      })).filter(x=>x.amount>0.009);
    }
    const rows=[];
    const add=(key,label,value)=>{ const amount=num(value); if(amount>0.009) rows.push({key,label,amount,source:'property'}); };
    add('owner','Najem właścicielski', property?.owner_rent ?? property?.owner_monthly_rent ?? property?.monthly_rent ?? property?.rent ?? 0);
    add('community','Czynsz administracyjny', property?.community_rent);
    add('electricity','Prąd', property?.electricity_expected);
    add('gas','Gaz', property?.gas_expected);
    add('water','Woda', property?.water_expected);
    add('trash','Śmieci', property?.trash_expected ?? property?.garbage_expected ?? property?.waste_expected);
    const totalFromRentAmount = num(property?.rent_amount);
    const split = rows.reduce((s,r)=>s+r.amount,0);
    if(totalFromRentAmount > split + 0.009) add('other','Pozostałe opłaty', totalFromRentAmount - split);
    return rows;
  }
  function isTenantDueExpense(row){
    const status = String(row?.transaction_status || '').toLowerCase();
    if(['rejected','duplicate','archived'].includes(status)) return false;
    const comp = String(row?.settlement_component || '').toLowerCase();
    if(['renovation','service','owner','owner_rent','deposit'].includes(comp)) return false;
    if(['community','electricity','gas','water','media','other','trash','garbage','waste','surcharge','adjustment'].includes(comp)) return true;
    const txt = String([row?.category,row?.source,row?.note,row?.name,row?.description,row?.vendor].filter(Boolean).join(' ')).toLowerCase();
    if(/remont|napraw|serwis|meble|wyposaż|wyposaz|inwestyc|kaucj/.test(txt)) return false;
    return /(czynsz|administr|wspól|wspol|prąd|prad|energia|gaz|woda|media|śmieci|smieci|odpady|dopłat|dopl|rozlicz)/.test(txt);
  }
  function extraDueRowsFromExpenses(property, key, fixedRows){
    const rows = rowsFor(STATE.expenses, property, key).filter(isTenantDueExpense);
    const fixedKeys = new Set((fixedRows||[]).map(r=>String(r.key||'').toLowerCase()));
    const buckets = new Map();
    rows.forEach(row=>{
      let comp = String(row.settlement_component || '').toLowerCase();
      if(!comp && Core().component) comp = Core().component(row,'expense');
      if(comp === 'media') comp = 'other';
      if(['community','electricity','gas','water'].includes(comp) && fixedKeys.has(comp)) return;
      const txt = String([row.category,row.note,row.name,row.description].filter(Boolean).join(' ')).toLowerCase();
      if(/śmieci|smieci|odpady/.test(txt)) comp='trash';
      else if(/dopłat|dopl|rozlicz/.test(txt)) comp='surcharge';
      else if(!comp || ['owner','owner_rent'].includes(comp)) comp='other';
      const label = comp === 'trash' ? 'Śmieci' : (comp === 'surcharge' ? 'Dopłaty / korekty' : (COMPONENT_LABELS[comp] || 'Dopłaty / rachunki'));
      const prev = buckets.get(label) || 0;
      buckets.set(label, prev + num(row.amount));
    });
    return Array.from(buckets.entries()).map(([label,amount])=>({key:label.toLowerCase(), label, amount, source:'expense'})).filter(x=>x.amount>0.009);
  }
  function mergeDueRows(rows){
    const map = new Map();
    (rows||[]).forEach(row=>{
      const label = row.label || 'Opłata';
      const key = String(row.key || label).toLowerCase();
      const current = map.get(key) || {key, label, amount:0, source:row.source||''};
      current.amount += num(row.amount);
      map.set(key, current);
    });
    return Array.from(map.values()).filter(x=>x.amount>0.009);
  }
  function dueRowsForMonth(property, key){
    const fixed = staticDueRows(property);
    const extra = extraDueRowsFromExpenses(property, key, fixed);
    return mergeDueRows([...fixed, ...extra]);
  }
  function paidForMonth(property, key){ return rowsFor(STATE.payments, property, key).filter(isPaymentEligible).reduce((s,r)=>s+num(r.amount),0); }
  function calculateProperty(property, targetMonth=STATE.month){
    const Engine = window.PureInvestSettlementEngine;
    if(Engine && typeof Engine.propertyHistory === 'function'){
      const history = Engine.propertyHistory(property, targetMonth, STATE.payments, STATE.expenses).map(s => ({
        key:s.key, label:monthLabel(s.key), dueRows:s.dueRows || [], baseDue:s.tenantDue, openingCarry:s.carryBefore || 0,
        totalDue:s.totalDue, paid:s.paid, balance:s.balance, missingAfter:s.missingAfter, overpaymentAfter:s.overpaymentAfter,
        ownerRentDue:s.ownerRentDue, reimbursables:s.passThroughDue, ownerCosts:s.ownerCosts, tax:s.tax,
        ownerResult:s.ownerResult, netResult:s.netResult, passThroughCosts:s.passThroughCosts, latestPaymentDate:s.latestPaymentDate || null, paidLate:!!s.paidLate, engineSnapshot:s
      }));
      const current = history[history.length-1] || {key:targetMonth,dueRows:[],baseDue:0,openingCarry:0,totalDue:0,paid:0,balance:0,missingAfter:0,overpaymentAfter:0,ownerRentDue:0,reimbursables:0,ownerCosts:0,tax:0,ownerResult:0,netResult:0};
      const snap = current.engineSnapshot || Engine.monthly(property, targetMonth, STATE.payments, STATE.expenses);
      return Object.assign({}, current, { property, month:targetMonth, dueDate:snap.dueDate || dueDate(targetMonth, property), dueDateLabel:snap.dueDateLabel || dueDateLabel(targetMonth, property), status:snap.status || 'Opłacone', code:snap.code || 'ok', tone:snap.tone || 'ok', history, carryBefore:current.openingCarry, missing:current.missingAfter, overpaid:current.overpaymentAfter, engineSnapshot:snap });
    }
    const months = monthsUntil(property, targetMonth);
    let carry = 0;
    const history=[];
    for(const key of months){
      const dueRows = dueRowsForMonth(property, key);
      const baseDue = dueRows.reduce((s,r)=>s+num(r.amount),0);
      const paid = paidForMonth(property, key);
      const openingCarry = carry;
      const totalDue = Math.max(0, baseDue + carry);
      const balance = totalDue - paid;
      const overpaymentAfter = Math.max(0, -balance);
      const missingAfter = Math.max(0, balance);
      const item = { key, label:monthLabel(key), dueRows, baseDue, openingCarry, totalDue, paid, balance, missingAfter, overpaymentAfter };
      history.push(item);
      carry = balance;
    }
    const current = history[history.length-1] || {key:targetMonth,dueRows:[],baseDue:0,openingCarry:0,totalDue:0,paid:0,balance:0,missingAfter:0,overpaymentAfter:0};
    const now = new Date();
    const due = dueDate(targetMonth, property);
    const hasPastDue = now > due && current.missingAfter > 0.009;
    let code='ok', status='Opłacone', tone='ok';
    if(current.baseDue <= 0.009){ code='no-data'; status='Brak należności'; tone='warn'; }
    else if(current.paid <= 0.009 && current.totalDue > 0.009){ code=hasPastDue?'late':'unpaid'; status=hasPastDue?'Po terminie':'Brak wpłaty'; tone=hasPastDue?'bad':'warn'; }
    else if(current.missingAfter > 0.009){ code=hasPastDue?'late-partial':'partial'; status=hasPastDue?'Po terminie — niepełna':'Niepełna płatność'; tone=hasPastDue?'bad':'warn'; }
    else if(current.overpaymentAfter > 0.009){ code='overpaid'; status='Nadpłata'; tone='ok'; }
    return Object.assign({}, current, { property, month:targetMonth, dueDate:due, dueDateLabel:dueDateLabel(targetMonth, property), status, code, tone, history, carryBefore:current.openingCarry, missing:current.missingAfter, overpaid:current.overpaymentAfter });
  }
  function calculateAll(properties=STATE.properties, targetMonth=STATE.month){ return (properties||[]).map(p=>calculateProperty(p,targetMonth)); }

  function activePropertyId(){
    try{ if(window.activeProperty) return String(window.activeProperty); }catch(_){ }
    try{ if(typeof activeProperty !== 'undefined' && activeProperty) return String(activeProperty); }catch(_){ }
    try{ if(window.activePropertyData?.id) return String(window.activePropertyData.id); }catch(_){ }
    return '';
  }
  function financeYear(){
    const raw = $('yearFilter')?.value;
    if(raw && raw !== 'all') return String(raw);
    return String(new Date().getFullYear());
  }
  function financeScope(){
    return $('financeScope')?.value === 'all' ? 'all' : 'property';
  }
  function financeMonthlyProperties(){
    const props = (STATE.properties && STATE.properties.length ? STATE.properties : propertyListFromState()) || [];
    if(financeScope() === 'all') return props;
    const id = activePropertyId();
    const selected = props.find(p => String(p?.id || '') === id);
    return selected ? [selected] : (props[0] ? [props[0]] : []);
  }
  function ownerRentDue(row){
    return (row?.dueRows || []).reduce((s,item)=>{
      const key = String(item?.key || '').toLowerCase();
      const label = String(item?.label || '').toLowerCase();
      if(key === 'owner' || key === 'owner_rent' || /najem właśc|najem wlasc|czynsz najmu/.test(label)) return s + num(item.amount);
      return s;
    },0);
  }
  function ownerCostsForMonth(property, key){
    return rowsFor(STATE.expenses, property, key).filter(r => !isTenantDueExpense(r)).reduce((s,r)=>s+num(r.amount),0);
  }
  function monthHasRows(properties, key){
    return (properties||[]).some(p => rowsFor(STATE.payments, p, key).length || rowsFor(STATE.expenses, p, key).length);
  }
  function monthlyStatus(snapshot, key){
    if(snapshot.future) return {label:'Przyszły', tone:'neutral'};
    if(snapshot.due <= 0.009 && snapshot.paid <= 0.009 && snapshot.ownerCosts <= 0.009) return {label:'Brak danych', tone:'neutral'};
    if(snapshot.missing > 0.009) return {label:'Braki', tone:'bad'};
    if(snapshot.overpaid > 0.009) return {label:'Nadpłata', tone:'ok'};
    if(snapshot.paidLate) return {label:'Opłacone po terminie', tone:'warn'};
    if(snapshot.paid > 0.009 || snapshot.due > 0.009) return {label:'Opłacone', tone:'ok'};
    return {label:'Kontrola', tone:'warn'};
  }
  function monthlySnapshot(properties, key){
    const Engine = window.PureInvestSettlementEngine;
    if(Engine && typeof Engine.monthly === 'function'){
      const future = key > currentMonthKey() && !monthHasRows(properties, key);
      const out = {key, due:0, paid:0, missing:0, overpaid:0, ownerRent:0, reimbursables:0, ownerCosts:0, tax:0, ownerResult:0, paidLate:false, future};
      if(future) return Object.assign(out, {status:monthlyStatus(out, key)});
      (properties||[]).forEach(property=>{
        const s = Engine.propertyHistory(property, key, STATE.payments, STATE.expenses).at(-1) || Engine.monthly(property, key, STATE.payments, STATE.expenses);
        out.due += num(s.tenantDue);
        out.paid += num(s.periodPaidAtClose ?? s.settledAmount ?? s.paid);
        out.missing += num(s.periodMissingAtClose ?? s.openAmount ?? Math.max(0,s.tenantDue-s.paid));
        out.overpaid += Math.max(0,num(s.overpayment)-num(s.openingCredit));
        out.ownerRent += num(s.ownerRentDue);
        out.reimbursables += num(s.passThroughDue);
        out.ownerCosts += num(s.ownerCosts);
        out.tax += num(s.tax);
        out.ownerResult += num(s.netResult);
        out.paidLate = out.paidLate || !!s.paidLate;
      });
      out.status = monthlyStatus(out, key);
      return out;
    }
    const future = key > currentMonthKey() && !monthHasRows(properties, key);
    const out = {key, due:0, paid:0, missing:0, overpaid:0, ownerRent:0, reimbursables:0, ownerCosts:0, tax:0, ownerResult:0, paidLate:false, future};
    if(future) return Object.assign(out, {status:monthlyStatus(out, key)});
    (properties||[]).forEach(property=>{
      const row = calculateProperty(property, key);
      const monthlyDue = num(row.baseDue); // Roczna historia pokazuje dany miesiąc osobno, bez doliczania zaległości/nadpłat z poprzednich miesięcy.
      const paid = num(row.paid);
      const ownerBase = ownerRentDue(row);
      const reimbursable = Math.max(0, monthlyDue - ownerBase);
      const ownerCosts = ownerCostsForMonth(property, key);
      const ownerPaidBase = Math.min(Math.max(0, paid), ownerBase);
      const tax = window.PureInvestTaxPolicy?.incrementalTax ? window.PureInvestTaxPolicy.incrementalTax(ownerPaidBase,0) : ownerPaidBase * 0.085;
      out.due += monthlyDue;
      out.paid += paid;
      out.missing += Math.max(0, monthlyDue - paid);
      out.overpaid += Math.max(0, paid - monthlyDue);
      out.ownerRent += ownerBase;
      out.reimbursables += reimbursable;
      out.ownerCosts += ownerCosts;
      out.tax += tax;
      out.ownerResult += ownerPaidBase - ownerCosts - tax;
    });
    out.status = monthlyStatus(out, key);
    return out;
  }
  function renderMonthlyAutopilotTable(){
    const body = $('monthlyTable');
    if(!body) return;
    const props = financeMonthlyProperties();
    const year = financeYear();
    const keys = Array.from({length:12}, (_,i)=>year+'-'+String(i+1).padStart(2,'0'));
    if(!props.length){
      body.innerHTML = '<tr><td colspan="10"><div class="transactions-info">Brak mieszkania do pokazania rocznej historii rozliczeń.</div></td></tr>';
      return;
    }
    const rows = keys.map(key => monthlySnapshot(props, key));
    body.innerHTML = rows.map(s=>{
      const diff = s.missing > 0.009 ? '<b class="bad">'+money(s.missing)+'</b>' : (s.overpaid > 0.009 ? '<b class="ok">+'+money(s.overpaid)+'</b>' : money(0));
      const status = s.status || monthlyStatus(s, s.key);
      const muted = s.future ? ' class="pi-monthly-future-row"' : '';
      return '<tr'+muted+'><td><b>'+esc(shortMonthLabel(s.key))+'</b></td><td>'+money(s.due)+'</td><td>'+money(s.paid)+'</td><td>'+diff+'</td><td>'+money(s.ownerRent)+'</td><td>'+money(s.reimbursables)+'</td><td>'+money(s.ownerCosts)+'</td><td>'+money(s.tax)+'</td><td><b class="'+(s.ownerResult < -0.009 ? 'bad' : 'ok')+'">'+money(s.ownerResult)+'</b></td><td><span class="pi-monthly-status '+esc(status.tone)+'">'+esc(status.label)+'</span></td></tr>';
    }).join('');
  }

  function propertyListFromState(){
    try{ if(Array.isArray(window.loadedProperties) && window.loadedProperties.length) return window.loadedProperties; }catch(_){ }
    try{ if(typeof loadedProperties !== 'undefined' && Array.isArray(loadedProperties) && loadedProperties.length) return loadedProperties; }catch(_){ }
    try{ if(window.piOwnerSessionV570 && Array.isArray(window.piOwnerSessionV570.properties)) return window.piOwnerSessionV570.properties; }catch(_){ }
    return [];
  }
  function ownerSession(){ try{ return window.piOwnerSessionV570 || JSON.parse(sessionStorage.getItem('piOwnerSessionV570') || 'null'); }catch(_){ return null; } }
  async function ownerProxy(kind, payload){
    const res = await fetch('/.netlify/functions/owner-data', { method:'POST', headers: await (window.piActivityHeaders ? window.piActivityHeaders() : Promise.resolve({'Content-Type':'application/json'})), body: JSON.stringify(Object.assign({kind}, payload||{})) });
    const data = await res.json().catch(()=>null);
    if(!res.ok || !data || !data.ok) throw new Error(data?.message || data?.details || 'Owner proxy error');
    return data;
  }
  async function loadProperties(){
    let props = propertyListFromState();
    if(props.length) return props;
    if(ownerSession()){
      const data = await ownerProxy('properties');
      props = data.properties || data.data || [];
      try{ window.loadedProperties = props; }catch(_){ }
      return props;
    }
    if(window.db){
      const res = await db.from('properties').select('*').order('created_at',{ascending:false});
      if(res.error) throw res.error;
      props = res.data || [];
      try{ window.loadedProperties = props; }catch(_){ }
      return props;
    }
    return [];
  }
  function rangeForMonth(targetMonth){
    const y=Number(String(targetMonth).slice(0,4)), m=Number(String(targetMonth).slice(5,7));
    const start = new Date(y, m-1-35, 1).toISOString();
    const nextMonth = new Date(y, m, 1);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(0,0,0,0);
    const end = (tomorrow > nextMonth ? tomorrow : nextMonth).toISOString();
    return {start,end};
  }
  async function loadTransactions(targetMonth=STATE.month){
    const {start,end} = rangeForMonth(targetMonth);
    if(ownerSession()){
      const data = await ownerProxy('transactions', {start, end});
      return {payments:data.payments||[], expenses:data.expenses||[]};
    }
    if(window.db){
      const [pay, exp] = await Promise.all([
        db.from('payments').select('*').gte('created_at', start).lt('created_at', end),
        db.from('expenses').select('*').gte('created_at', start).lt('created_at', end)
      ]);
      if(pay.error) throw pay.error;
      if(exp.error) throw exp.error;
      return {payments:pay.data||[], expenses:exp.data||[]};
    }
    return {payments:[], expenses:[]};
  }
  function ensureOverviewShell(){
    const panel = $('piTransactionsFinanceProPanel');
    if(!panel) return null;
    let box = $('piRentAutopilotOverview');
    if(box) return box;
    box = document.createElement('div');
    box.id = 'piRentAutopilotOverview';
    box.className = 'card pi-rent-autopilot-card';
    box.innerHTML = '<div class="pi-rent-auto-loading">Ładowanie Rent Autopilot...</div>';
    const summary = $('financeSummary')?.closest('.card');
    if(summary && summary.parentElement === panel) panel.insertBefore(box, summary);
    else {
      const layout = panel.querySelector('.layout');
      if(layout && layout.parentElement === panel) panel.insertBefore(box, layout);
      else panel.appendChild(box);
    }
    return box;
  }
  function totals(rows){
    return rows.reduce((a,r)=>{ a.due+=num(r.totalDue); a.paid+=num(r.paid); a.missing+=num(r.missing); a.overpaid+=num(r.overpaid); return a; }, {due:0,paid:0,missing:0,overpaid:0});
  }
  function statusBadge(row){ return '<span class="pi-rent-status '+esc(row.tone)+'">'+esc(row.status)+'</span>'; }
  function carryText(row){
    if(row.carryBefore > 0.009) return '<span class="bad">Zaległość z poprzednich miesięcy: '+money(row.carryBefore)+'</span>';
    if(row.carryBefore < -0.009) return '<span class="ok">Nadpłata z poprzednich miesięcy: '+money(Math.abs(row.carryBefore))+'</span>';
    return '<span>Brak przeniesień</span>';
  }
  function componentDetails(row){
    const parts = (row.dueRows || []).map(x=>'<span>'+esc(x.label)+': <b>'+money(x.amount)+'</b></span>');
    if(row.carryBefore > 0.009) parts.push('<span>Zaległości: <b>'+money(row.carryBefore)+'</b></span>');
    if(row.carryBefore < -0.009) parts.push('<span>Nadpłata przeniesiona: <b>-'+money(Math.abs(row.carryBefore))+'</b></span>');
    return parts.join('');
  }
  function reminderText(row){
    const p = row.property || {};
    const tenant = p.tenant_name || 'Dzień dobry';
    const missing = row.missing;
    const total = row.totalDue;
    const paid = row.paid;
    const place = p.name || p.address || 'mieszkanie';
    const carry = row.carryBefore > 0.009 ? ' Kwota obejmuje również zaległość z poprzednich miesięcy: '+money(row.carryBefore)+'.' : (row.carryBefore < -0.009 ? ' Uwzględniono nadpłatę z poprzednich miesięcy: '+money(Math.abs(row.carryBefore))+'.' : '');
    if(missing <= 0.009){
      return tenant+',\n\npłatność za '+monthLabel(row.month)+' dla lokalu '+place+' jest rozliczona. System pokazuje wpłacono '+money(paid)+' przy należności '+money(total)+'.\n\nPozdrawiam';
    }
    return tenant+',\n\nprzypomnienie o płatności za '+monthLabel(row.month)+' dla lokalu '+place+'.\n\nNajemca powinien zapłacić '+money(total)+'. Wpłacono '+money(paid)+'. Brakuje '+money(missing)+'. To nie jest pełna płatność.'+carry+'\n\nTermin płatności: '+row.dueDateLabel+'. Proszę o dopłatę brakującej kwoty.\n\nPozdrawiam';
  }
  function reminderSubject(row){
    const p = row.property || {};
    const place = p.name || p.address || 'mieszkanie';
    return 'Przypomnienie o płatności — '+place+' — '+monthLabel(row.month);
  }
  function reminderRecipient(row, channel){
    const p = row.property || {};
    if(channel === 'sms') return p.tenant_phone || p.phone || p.tenantPhone || '';
    return p.tenant_email || p.email || p.tenantEmail || '';
  }
  function renderReminder(row){
    const box = $('piRentAutopilotReminderBox');
    if(!box) return;
    const p = row.property || {};
    const email = reminderRecipient(row, 'email');
    const phone = reminderRecipient(row, 'sms');
    window.__piRentAutopilotReminderRow = row;
    box.classList.remove('hidden');
    box.innerHTML = '<div class="pi-rent-reminder-head"><div><b>Przypomnienie płatności</b><small>'+esc(p.name || p.address || 'Mieszkanie')+' · '+esc(monthLabel(row.month))+' · email albo SMS</small></div><button type="button" class="subtle-link-btn" onclick="piRentAutopilotCloseReminder()">Zamknij</button></div>'
      + '<div class="pi-rent-reminder-grid">'
        + '<label>Email najemcy<input id="piRentAutopilotReminderEmail" type="email" value="'+esc(email)+'" placeholder="np. najemca@email.pl"></label>'
        + '<label>Telefon SMS<input id="piRentAutopilotReminderPhone" inputmode="tel" value="'+esc(phone)+'" placeholder="np. 500600700"></label>'
        + '<label class="wide">Temat wiadomości<input id="piRentAutopilotReminderSubject" value="'+esc(reminderSubject(row))+'"></label>'
        + '<label class="wide">Treść wiadomości<textarea id="piRentAutopilotReminderText" rows="8">'+esc(reminderText(row))+'</textarea></label>'
      + '</div>'
      + '<div class="pi-rent-reminder-actions pi-rent-reminder-actions-pro">'
        + '<button type="button" onclick="piRentAutopilotSendReminder(\'email\')">Wyślij e-mail</button>'
        + '<button type="button" class="subtle-link-btn" onclick="piRentAutopilotSendReminder(\'sms\')">Wyślij SMS</button>'
        + '<button type="button" class="subtle-link-btn" onclick="piRentAutopilotCopyReminder()">Kopiuj tekst</button>'
        + '<button type="button" class="subtle-link-btn" onclick="piRentAutopilotOpenNativeReminder(\'email\')">Otwórz pocztę</button>'
        + '<button type="button" class="subtle-link-btn" onclick="piRentAutopilotOpenNativeReminder(\'sms\')">Otwórz SMS</button>'
        + '<span id="piRentAutopilotReminderMsg"></span>'
      + '</div>'
      + '<div class="pi-rent-reminder-hint">Wysyłka działa przez funkcję Netlify. E-mail wymaga konfiguracji RESEND_API_KEY, a SMS wymaga SMSAPI_TOKEN albo Twilio. Bez konfiguracji zostają przyciski Kopiuj / Otwórz pocztę / Otwórz SMS.</div>';
    try{ box.scrollIntoView({behavior:'smooth', block:'nearest'}); }catch(_){ }
  }
  function renderOverview(){
    const box = ensureOverviewShell();
    if(!box) return;
    const rowsAll = STATE.rows || [];
    const rows = STATE.onlyIssues ? rowsAll.filter(r=>r.missing>0.009 || r.overpaid>0.009 || ['no-data'].includes(r.code)) : rowsAll;
    const t = totals(rowsAll);
    const issuesCount = rowsAll.filter(r=>r.missing>0.009).length;
    const overCount = rowsAll.filter(r=>r.overpaid>0.009).length;
    const propertyOptions = rowsAll.length ? '' : '<div class="transactions-info">Brak mieszkań do rozliczenia.</div>';
    const table = rows.length ? '<div class="pi-rent-auto-table-wrap"><table class="pi-rent-auto-table"><thead><tr><th>Mieszkanie</th><th>Najemca</th><th>Powinien zapłacić</th><th>Wpłacił</th><th>Brakuje / nadpłata</th><th>Status</th><th>Akcja</th></tr></thead><tbody>'+rows.map((r,idx)=>{
      const p=r.property||{};
      const delta = r.missing>0.009 ? '<b class="bad">Brakuje '+money(r.missing)+'</b>' : (r.overpaid>0.009 ? '<b class="ok">Nadpłata '+money(r.overpaid)+'</b>' : '<b class="ok">0,00 zł</b>');
      return '<tr><td><b>'+esc(p.name||p.address||'Mieszkanie')+'</b><small>'+esc(p.address||'')+'</small><div class="pi-rent-components">'+componentDetails(r)+'</div></td><td>'+esc(p.tenant_name||'Brak najemcy')+'</td><td><b>'+money(r.totalDue)+'</b><small>Baza: '+money(r.baseDue)+'<br>'+carryText(r)+'</small></td><td><b>'+money(r.paid)+'</b><small>'+esc(monthLabel(r.month))+(r.latestPaymentDate ? '<br>Wpływ: '+esc(new Date(r.latestPaymentDate).toLocaleDateString('pl-PL')) : '')+'</small></td><td>'+delta+'</td><td>'+statusBadge(r)+'<small>Termin: '+esc(r.dueDateLabel)+'</small></td><td><button type="button" class="subtle-link-btn" onclick="piRentAutopilotShowReminder('+idx+')">Wyślij przypomnienie</button></td></tr>';
    }).join('')+'</tbody></table></div>' : '<div class="transactions-info">Brak pozycji po aktualnym filtrze.</div>';
    box.innerHTML = '<div class="pi-rent-auto-head"><div><div class="card-title">Rent Autopilot</div><p>Pełna należność vs wpłaty: najem, czynsz, media, śmieci, dopłaty, zaległości i nadpłaty.</p></div><div class="pi-rent-auto-controls"><label>Miesiąc<input id="piRentAutopilotMonth" type="month" value="'+esc(STATE.month)+'"></label><button type="button" onclick="piRentAutopilotRefresh(true)">Odśwież</button><button type="button" class="subtle-link-btn" onclick="piRentAutopilotToggleIssues()">'+(STATE.onlyIssues?'Pokaż wszystko':'Tylko braki / nadpłaty')+'</button></div></div><div class="pi-rent-auto-kpis"><div><span>Należne</span><b>'+money(t.due)+'</b></div><div><span>Wpłacono</span><b>'+money(t.paid)+'</b></div><div><span>Brakuje</span><b class="'+(t.missing>0.009?'bad':'ok')+'">'+money(t.missing)+'</b></div><div><span>Nadpłaty</span><b>'+money(t.overpaid)+'</b></div></div><div class="pi-rent-auto-note">'+(issuesCount ? 'Do działania: '+issuesCount+' mieszkań z brakującą płatnością.' : 'Brak brakujących płatności w aktualnym przeglądzie.')+(overCount ? ' Nadpłaty: '+overCount+'.' : '')+'</div>'+table+propertyOptions+'<div id="piRentAutopilotReminderBox" class="pi-rent-reminder-box hidden"></div>';
    const input = $('piRentAutopilotMonth');
    if(input) input.onchange = ()=>{ STATE.month = input.value || currentMonthKey(); window.piRentAutopilotRefresh(true); };
    window.__piRentAutopilotRows = rows;
  }
  async function refreshOverview(force){
    if(STATE.loading && !force) return;
    const box = ensureOverviewShell();
    if(box && !STATE.rows.length) box.innerHTML = '<div class="pi-rent-auto-loading">Ładowanie Rent Autopilot...</div>';
    STATE.loading = true;
    try{
      STATE.month = $('piRentAutopilotMonth')?.value || STATE.month || currentMonthKey();
      STATE.properties = await loadProperties();
      const tx = await loadTransactions(STATE.month);
      STATE.payments = tx.payments || [];
      STATE.expenses = tx.expenses || [];
      STATE.rows = calculateAll(STATE.properties, STATE.month);
      STATE.lastRenderedAt = new Date().toISOString();
      renderOverview();
      renderMonthlyAutopilotTable();
    }catch(e){
      console.warn('Rent Autopilot refresh failed', e);
      if(box) box.innerHTML = '<div class="pi-rent-auto-head"><div><div class="card-title">Rent Autopilot</div><p>Nie udało się pobrać danych rozliczeniowych.</p></div></div><div class="transactions-info">'+esc(e.message || e)+'</div>';
    }finally{ STATE.loading=false; }
  }

  window.piRentAutopilotRefresh = refreshOverview;
  window.piRentAutopilotToggleIssues = function(){ STATE.onlyIssues = !STATE.onlyIssues; renderOverview(); };
  window.piRentAutopilotShowReminder = function(index){ const row = (window.__piRentAutopilotRows || [])[Number(index)]; if(row) renderReminder(row); };
  window.piRentAutopilotCloseReminder = function(){ $('piRentAutopilotReminderBox')?.classList.add('hidden'); };
  window.piRentAutopilotCopyReminder = function(){
    const text = $('piRentAutopilotReminderText')?.value || '';
    const msg = $('piRentAutopilotReminderMsg');
    const done = t => { if(msg) msg.textContent = t; };
    if(!text) return done('Brak tekstu.');
    navigator.clipboard?.writeText(text).then(()=>done('Skopiowano.')).catch(()=>{ try{ $('piRentAutopilotReminderText')?.select(); document.execCommand('copy'); done('Skopiowano.'); }catch(_){ done('Zaznacz i skopiuj ręcznie.'); } });
  };
  function reminderCurrentPayload(channel){
    const row = window.__piRentAutopilotReminderRow || null;
    const p = row?.property || {};
    const msg = $('piRentAutopilotReminderMsg');
    const message = $('piRentAutopilotReminderText')?.value || '';
    const subject = $('piRentAutopilotReminderSubject')?.value || (row ? reminderSubject(row) : 'Przypomnienie o płatności');
    const email = $('piRentAutopilotReminderEmail')?.value || reminderRecipient(row || {}, 'email');
    const phone = $('piRentAutopilotReminderPhone')?.value || reminderRecipient(row || {}, 'sms');
    if(!row){
      if(msg) msg.textContent = 'Nie wybrano przypomnienia.';
      return null;
    }
    return {
      channel,
      to: channel === 'sms' ? phone : email,
      subject,
      message,
      property_id: p.id || p.property_id || '',
      property_name: p.name || p.address || 'Mieszkanie',
      tenant_name: p.tenant_name || '',
      tenant_email: email,
      tenant_phone: phone,
      month: row.month,
      due_amount: row.totalDue,
      paid_amount: row.paid,
      missing_amount: row.missing,
      due_date: row.dueDateLabel
    };
  }
  window.piRentAutopilotSendReminder = async function(channel){
    const msg = $('piRentAutopilotReminderMsg');
    const setMsg = (text, tone) => { if(msg){ msg.textContent = text; msg.dataset.type = tone || ''; } };
    const payload = reminderCurrentPayload(channel);
    if(!payload) return;
    if(!payload.message) return setMsg('Brak treści wiadomości.', 'error');
    if(channel === 'email' && !payload.to) return setMsg('Uzupełnij e-mail najemcy.', 'error');
    if(channel === 'sms' && !payload.to) return setMsg('Uzupełnij numer telefonu najemcy.', 'error');
    setMsg(channel === 'sms' ? 'Wysyłam SMS...' : 'Wysyłam e-mail...', 'loading');
    try{
      const headers = window.piActivityHeaders ? await window.piActivityHeaders({'Content-Type':'application/json'}) : {'Content-Type':'application/json'};
      const res = await fetch('/.netlify/functions/send-payment-reminder', { method:'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź serwera.'}));
      if(!res.ok || !data.ok){
        if(data && data.configured === false){
          return setMsg((data.message || 'Wysyłka nie jest skonfigurowana.')+' Możesz użyć przycisku Kopiuj albo Otwórz pocztę/SMS.', 'warn');
        }
        throw new Error(data.message || data.details || 'Nie udało się wysłać przypomnienia.');
      }
      setMsg(channel === 'sms' ? 'SMS wysłany.' : 'E-mail wysłany.', 'success');
      try{ refreshOverview(true); }catch(_){ }
    }catch(e){
      setMsg('Nie udało się wysłać: '+String(e.message || e), 'error');
    }
  };
  window.piRentAutopilotOpenNativeReminder = function(channel){
    const payload = reminderCurrentPayload(channel);
    if(!payload) return;
    if(channel === 'sms'){
      if(!payload.to) return alert('Uzupełnij numer telefonu najemcy.');
      const href = 'sms:'+encodeURIComponent(payload.to)+'?&body='+encodeURIComponent(payload.message || '');
      window.location.href = href;
      return;
    }
    if(!payload.to) return alert('Uzupełnij e-mail najemcy.');
    const href = 'mailto:'+encodeURIComponent(payload.to)+'?subject='+encodeURIComponent(payload.subject || '')+'&body='+encodeURIComponent(payload.message || '');
    window.location.href = href;
  };
  window.piRentAutopilotCalculate = calculateProperty;
  window.piRentAutopilotCalculateAll = calculateAll;
  window.piRenderMonthlyAutopilotTable = renderMonthlyAutopilotTable;

  function tenantPaymentsFromData(data){ return Array.isArray(data?.payments) ? data.payments : []; }
  function tenantExpensesFromData(data){ return Array.isArray(data?.expenses) ? data.expenses : []; }
  function renderTenantAutopilot(data){
    const box = $('tenantPortalPayments');
    if(!box || !data || !data.property) return false;
    const old = { properties:STATE.properties, payments:STATE.payments, expenses:STATE.expenses, month:STATE.month };
    try{
      STATE.properties = [data.property];
      STATE.payments = tenantPaymentsFromData(data);
      STATE.expenses = tenantExpensesFromData(data);
      STATE.month = currentMonthKey();
      const row = calculateProperty(data.property, STATE.month);
      const remaining = row.missing;
      const pill = row.missing > 0.009 ? '<span class="pi-tenant-pill warn">'+esc(row.status)+'</span>' : '<span class="pi-tenant-pill">'+esc(row.status)+'</span>';
      const over = row.overpaid > 0.009 ? '<div class="pi-tenant-status-row"><span>Nadpłata</span><b>'+money(row.overpaid)+'</b></div>' : '';
      const carry = row.carryBefore > 0.009 ? '<div class="pi-tenant-status-row"><span>Zaległość przeniesiona</span><b>'+money(row.carryBefore)+'</b></div>' : (row.carryBefore < -0.009 ? '<div class="pi-tenant-status-row"><span>Nadpłata przeniesiona</span><b>'+money(Math.abs(row.carryBefore))+'</b></div>' : '');
      box.innerHTML = '<div class="pi-tenant-autopilot-title">Autopilot najmu — '+esc(monthLabel(row.month))+'</div><div class="pi-tenant-status-row"><span>Do zapłaty</span><b>'+money(row.totalDue)+'</b></div><div class="pi-tenant-status-row"><span>Wpłacono</span><b>'+money(row.paid)+'</b></div><div class="pi-tenant-status-row"><span>Pozostało</span><b class="'+(remaining>0.009?'bad':'ok')+'">'+money(remaining)+'</b></div>'+over+carry+'<div class="pi-tenant-status-row"><span>Termin</span><b>'+esc(row.dueDateLabel)+'</b></div><div class="pi-tenant-status-row"><span>Status</span>'+pill+'</div><div class="pi-tenant-autopilot-note">'+(remaining>0.009 ? ('System pokazuje, że brakuje jeszcze '+money(remaining)+' do pełnej płatności.') : 'Płatność za ten miesiąc wygląda na rozliczoną.')+'</div>';
      return true;
    }catch(e){ console.warn('Tenant Autopilot skipped', e); return false; }
    finally{ STATE.properties=old.properties; STATE.payments=old.payments; STATE.expenses=old.expenses; STATE.month=old.month; }
  }
  window.piRenderTenantAutopilot = renderTenantAutopilot;

  const oldTenantRender = window.renderTenantPortalV54;
  if(typeof oldTenantRender === 'function' && !window.__PI_RENT_AUTOPILOT_TENANT_WRAP__){
    window.__PI_RENT_AUTOPILOT_TENANT_WRAP__ = true;
    window.renderTenantPortalV54 = function(data){
      const result = oldTenantRender.apply(this, arguments);
      try{ renderTenantAutopilot(data); }catch(e){ console.warn('Tenant Autopilot render failed', e); }
      return result;
    };
  }

  const oldRenderFinancePro = window.renderFinancePro;
  if(typeof oldRenderFinancePro === 'function' && !window.__PI_RENT_AUTOPILOT_FINANCE_WRAP__){
    window.__PI_RENT_AUTOPILOT_FINANCE_WRAP__ = true;
    window.renderFinancePro = async function(){
      const result = await oldRenderFinancePro.apply(this, arguments);
      try{ refreshOverview(false); }catch(e){ console.warn('Rent Autopilot after finance skipped', e); }
      return result;
    };
  }
  const oldOpen = window.piFinanceGroupOpen;
  if(typeof oldOpen === 'function' && !window.__PI_RENT_AUTOPILOT_OPEN_WRAP__){
    window.__PI_RENT_AUTOPILOT_OPEN_WRAP__ = true;
    window.piFinanceGroupOpen = function(id, btn, refreshType){
      const result = oldOpen.apply(this, arguments);
      if(id === 'piTransactionsFinanceProPanel') setTimeout(()=>refreshOverview(false), 80);
      return result;
    };
  }
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(()=>{ if(document.body.classList.contains('authenticated') && $('piTransactionsFinanceProPanel')) refreshOverview(false); }, 900);
    setTimeout(()=>{
      try{
        const stored = JSON.parse(sessionStorage.getItem('piTenantSessionV54') || 'null');
        if(stored && stored.property && !$('tenantPortalScreen')?.classList.contains('hidden')) renderTenantAutopilot(stored);
      }catch(_){ }
    }, 1100);
  });
})();
