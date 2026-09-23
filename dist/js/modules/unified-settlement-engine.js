(function(){
  if(window.__PI_UNIFIED_SETTLEMENT_ENGINE_190__) return;
  window.__PI_UNIFIED_SETTLEMENT_ENGINE_190__ = true;

  const TAX_RATE = 0.085;
  const TAX_HIGH_RATE = 0.125;
  const TAX_THRESHOLD = 100000;
  const COMPONENT_LABELS = {
    owner:'Najem właścicielski', owner_rent:'Najem właścicielski', community:'Czynsz administracyjny',
    electricity:'Prąd', gas:'Gaz', water:'Woda', media:'Media', trash:'Śmieci', garbage:'Śmieci',
    waste:'Śmieci', internet:'Internet', surcharge:'Dopłata', adjustment:'Korekta', renovation:'Remont',
    service:'Serwis', insurance:'Ubezpieczenie', tax:'Podatek', other:'Pozostałe'
  };
  const TENANT_DUE_EXPENSES = new Set(['community','electricity','gas','water','media','trash','garbage','waste','surcharge','adjustment','other']);
  const OWNER_COST_COMPONENTS = new Set(['renovation','service','insurance','tax','owner_cost','maintenance']);
  const EXCLUDED_STATUSES = new Set(['draft','rejected','duplicate','archived']);

  function num(v){
    if(v === null || v === undefined || v === '') return 0;
    if(typeof window.PureInvestFinanceCore?.num === 'function') return window.PureInvestFinanceCore.num(v);
    const n = Number(String(v).replace(/\s/g,'').replace(',', '.').replace(/zł|pln/ig,'').replace(/[^0-9.\-]/g,''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  function round(v){ return Math.round(num(v) * 100) / 100; }
  function money(v){
    try{ if(typeof window.money === 'function') return window.money(v); }catch(_){ }
    return num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' zł';
  }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function monthKey(value){
    if(!value) return '';
    if(typeof value === 'string' && /^\d{4}-\d{2}/.test(value)){
      const direct=value.slice(0,7), month=Number(direct.slice(5,7));
      return month>=1 && month<=12 ? direct : '';
    }
    const d = value instanceof Date ? value : new Date(value);
    if(!Number.isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }
  function currentMonth(){ return monthKey(new Date()); }
  function addMonth(key, delta){
    const y=Number(String(key).slice(0,4)), m=Number(String(key).slice(5,7));
    const d=new Date(y || new Date().getFullYear(), (m || 1)-1+(Number(delta)||0), 1);
    return monthKey(d);
  }
  function monthRange(start,end){
    const out=[]; let key=String(start || currentMonth()).slice(0,7); const last=String(end || key).slice(0,7);
    let guard=0; while(key && key<=last && guard++<600){ out.push(key); key=addMonth(key,1); }
    return out;
  }
  function rowDate(row){ return row?.payment_date || row?.expense_date || row?.date || row?.paid_at || row?.issued_at || row?.created_at || row?.createdAt || row?.updated_at || null; }
  function rowMonth(row){
    try{ if(window.PureInvestPaymentPeriod?.allocationMonth) return window.PureInvestPaymentPeriod.allocationMonth(row) || monthKey(rowDate(row)); }catch(_){ }
    return monthKey(rowDate(row));
  }
  function actualMonth(row){
    try{ if(window.PureInvestPaymentPeriod?.actualMonth) return window.PureInvestPaymentPeriod.actualMonth(row) || monthKey(rowDate(row)); }catch(_){ }
    return monthKey(rowDate(row));
  }
  function liveRows(rows){
    return (rows || []).filter(row => row && row.is_deleted !== true && !row.deleted_at && !EXCLUDED_STATUSES.has(String(row.transaction_status || '').toLowerCase()) && (!Object.prototype.hasOwnProperty.call(row,'amount') || num(row.amount)>0));
  }
  function rowPropertyId(row){ return String(row?.property_id ?? row?.propertyId ?? ''); }
  function sameProperty(row, property){ return !!String(property?.id ?? '') && rowPropertyId(row)===String(property?.id ?? ''); }
  function rowsForMonth(rows, property, key){ return liveRows(rows).filter(row=>sameProperty(row,property) && rowMonth(row)===key); }
  function cashRowsForMonth(rows, property, key){ return liveRows(rows).filter(row=>sameProperty(row,property) && actualMonth(row)===key); }
  function textOf(row){ return String([row?.settlement_component,row?.category,row?.source,row?.vendor,row?.note,row?.name,row?.description].filter(Boolean).join(' ')).toLowerCase(); }
  function normalizeComponent(value, fallbackText=''){
    const raw=String(value || '').toLowerCase().trim().replace('owner_rent','owner');
    if(['owner','community','electricity','gas','water','media','trash','garbage','waste','surcharge','adjustment','renovation','service','insurance','tax','internet'].includes(raw)) return raw;
    const t=String(fallbackText || '').toLowerCase();
    if(/najem|odstępne|odstepne|czynsz najmu|rent/.test(t)) return 'owner';
    if(/wspól|wspol|czynsz|administr|spółdziel|spoldziel/.test(t)) return 'community';
    if(/prąd|prad|energia|pge|enea|energa|tauron/.test(t)) return 'electricity';
    if(/gaz|pgnig/.test(t)) return 'gas';
    if(/woda|wodoci/.test(t)) return 'water';
    if(/śmieci|smieci|odpady|garbage|trash/.test(t)) return 'trash';
    if(/dopłat|dopl|korekt|rozlicz/.test(t)) return 'surcharge';
    if(/remont|napraw|serwis|meble|wyposaż|wyposaz|inwestyc/.test(t)) return 'renovation';
    if(/ubezpiec/.test(t)) return 'insurance';
    if(/podatek/.test(t)) return 'tax';
    if(/internet|media|rachun|opłat|oplata/.test(t)) return 'media';
    return 'other';
  }
  function componentLabel(component,row){
    const key=normalizeComponent(component,textOf(row));
    return COMPONENT_LABELS[key] || String(row?.name || row?.category || row?.source || 'Pozostałe');
  }
  function propertyStartMonth(property){
    const candidates=[property?.tenancy_start,property?.lease_start,property?.rent_start,property?.management_start].filter(Boolean);
    for(const value of candidates){ const key=monthKey(value); if(key) return key; }
    return '';
  }
  function activeInMonth(property,key){
    const start=propertyStartMonth(property); if(start && key<start) return false;
    const end=monthKey(property?.tenancy_end || property?.lease_end || property?.rent_end || property?.management_end || '');
    return !(end && key>end);
  }
  function dueDay(property){ return Math.max(1,Math.min(31,Number(property?.payment_day || property?.rent_due_day || property?.payment_due_day || 10)||10)); }
  function dueDate(key,property){
    const y=Number(String(key).slice(0,4)),m=Number(String(key).slice(5,7)),last=new Date(y,m,0).getDate();
    return new Date(y,m-1,Math.min(dueDay(property),last),23,59,59,999);
  }
  function dueDateLabel(key,property){
    const d=dueDate(key,property); return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
  }
  function settlementItems(property,key){
    let rows=[];
    try{ if(typeof window.piGetEffectiveSettlementItems==='function') rows=window.piGetEffectiveSettlementItems(property,key)||[]; }catch(_){ }
    try{ if(!rows.length && window.piSettlementDictionary?.effectiveMonthlyItems) rows=window.piSettlementDictionary.effectiveMonthlyItems(property,key)||[]; }catch(_){ }
    if(!rows.length && Array.isArray(property?.settlement_items)) rows=property.settlement_items;
    const selected=String(key || currentMonth()).slice(0,7);
    return rows.filter(item=>{
      if(!item) return false;
      const from=monthKey(item.effective_from || item.valid_from || item.start_date || '');
      const to=monthKey(item.effective_to || item.valid_to || item.end_date || '');
      return (!from || from<=selected) && (!to || to>=selected);
    });
  }
  function legacyItems(property){
    const p=property || {},out=[];
    const add=(kind,name,component,amount,payer='tenant',tenant_due=true,taxable=false)=>{ const value=num(amount); if(value>0.009) out.push({kind,name,component,default_amount:value,recurring:'monthly',payer,tenant_due,taxable,source:'legacy'}); };
    add('income','Najem właścicielski','owner',p.owner_rent ?? p.owner_monthly_rent ?? p.rent ?? p.monthly_rent,'tenant',true,true);
    if(!out.some(x=>x.component==='owner')){
      const total=num(p.rent_amount),extras=num(p.community_rent)+num(p.electricity_expected)+num(p.gas_expected)+num(p.water_expected)+num(p.trash_expected ?? p.garbage_expected ?? p.waste_expected);
      if(total>extras+0.009) add('income','Najem właścicielski','owner',total-extras,'tenant',true,true);
    }
    add('expense','Czynsz administracyjny','community',p.community_rent);
    add('expense','Prąd','electricity',p.electricity_expected);
    add('expense','Gaz','gas',p.gas_expected);
    add('expense','Woda','water',p.water_expected);
    add('expense','Śmieci','trash',p.trash_expected ?? p.garbage_expected ?? p.waste_expected);
    return out;
  }
  function fixedRows(property,key){
    if(!property || !activeInMonth(property,key)) return [];
    let items=settlementItems(property,key).filter(item=>item && item.active!==false && item.recurring==='monthly');
    if(!items.length) items=legacyItems(property);
    return items.map(item=>{
      const component=normalizeComponent(item.component || item.settlement_component,item.name || '');
      const kind=String(item.kind || (component==='owner'?'income':'expense')).toLowerCase();
      const tenantDue=item.tenant_due!==false && item.payer!=='owner';
      return {key:component,component,label:COMPONENT_LABELS[component] || item.name || componentLabel(component),amount:num(item.default_amount ?? item.amount),kind,payer:item.payer || (tenantDue?'tenant':'owner'),tenant_due:tenantDue,taxable:item.taxable!==false && component==='owner',source:item.source || 'fixed',effective_from:item.effective_from || null,effective_to:item.effective_to || null};
    }).filter(row=>row.amount>0.009);
  }
  function isPaymentEligible(row){
    if(num(row?.amount)<=0 || EXCLUDED_STATUSES.has(String(row?.transaction_status || '').toLowerCase())) return false;
    const component=normalizeComponent(row?.settlement_component,textOf(row));
    return component!=='deposit' && !/kaucj|deposit/.test(textOf(row));
  }
  function isOwnerPayment(row){ return normalizeComponent(row?.settlement_component,textOf(row))==='owner' || row?.taxable===true || /najem|czynsz najmu|odstępne|odstepne/.test(textOf(row)); }
  function isTenantDueExpense(row){
    if(!row || num(row.amount)<=0) return false;
    if(row.tenant_due===true && row.payer!=='owner') return true;
    if(row.tenant_due===false || row.payer==='owner') return false;
    const component=normalizeComponent(row.settlement_component,textOf(row));
    if(OWNER_COST_COMPONENTS.has(component) || component==='owner') return false;
    if(TENANT_DUE_EXPENSES.has(component)) return true;
    return /czynsz|administr|wspól|wspol|spółdziel|spoldziel|prąd|prad|energia|gaz|woda|śmieci|smieci|odpady|media|rachun|dopłat|dopl|rozlicz/.test(textOf(row));
  }
  function isOwnerCost(row){ return num(row?.amount)>0 && !isTenantDueExpense(row); }
  function bucketByComponent(rows){
    const map=new Map(); (rows || []).forEach(row=>{ const component=normalizeComponent(row.settlement_component,textOf(row)); const current=map.get(component)||{component,label:componentLabel(component,row),amount:0,rows:[]}; current.amount+=num(row.amount); current.rows.push(row); map.set(component,current); }); return map;
  }
  function taxBaseFromPaymentRows(paymentRows,options={}){
    const groups=new Map();
    liveRows(paymentRows || []).filter(isPaymentEligible).forEach(row=>{
      if(row.taxable===false) return;
      const key=rowMonth(row) || actualMonth(row);
      const group=groups.get(key) || {specific:0,generic:0};
      const component=normalizeComponent(row?.settlement_component,textOf(row));
      if(component==='owner' || row.taxable===true) group.specific+=num(row.amount);
      else if(component==='other') group.generic+=num(row.amount);
      groups.set(key,group);
    });
    let total=0;
    groups.forEach((group,key)=>{
      const due=options.property ? ownerRentDueForMonth(options.property,key) : num(options.ownerRentDue);
      // Explicit rent can cover several periods; never cap it at one month's rent.
      // Unclassified combined payments use only the remaining rent for their settlement period.
      total+=group.specific+Math.min(group.generic,Math.max(0,due-group.specific));
    });
    return round(total);
  }
  function annualTax(base){ const value=Math.max(0,num(base)); return round(Math.min(value,TAX_THRESHOLD)*TAX_RATE+Math.max(0,value-TAX_THRESHOLD)*TAX_HIGH_RATE); }
  function calcTax(base,priorBase=0){
    const current=Math.max(0,num(base)),prior=Math.max(0,num(priorBase));
    try{ if(typeof window.PureInvestTaxPolicy?.incrementalTax==='function') return round(window.PureInvestTaxPolicy.incrementalTax(current,prior)); }catch(_){ }
    return round(annualTax(prior+current)-annualTax(prior));
  }
  function ownerRentDueForMonth(property,key){ return round(fixedRows(property,key).filter(row=>row.kind==='income' && row.tenant_due!==false && row.payer!=='owner').reduce((sum,row)=>sum+row.amount,0)); }
  function taxBaseForActualMonth(property,key,payments){ return taxBaseFromPaymentRows(cashRowsForMonth(payments,property,key),{property}); }
  function priorTaxBase(property,key,payments){
    const year=String(key).slice(0,4),month=Number(String(key).slice(5,7)); let total=0;
    for(let index=1;index<month;index++) total+=taxBaseForActualMonth(property,year+'-'+String(index).padStart(2,'0'),payments);
    return round(total);
  }
  function portfolioTaxForMonth(properties,key,payments){
    const current=(properties || []).reduce((sum,p)=>sum+taxBaseForActualMonth(p,key,payments),0);
    const prior=(properties || []).reduce((sum,p)=>sum+priorTaxBase(p,key,payments),0);
    return calcTax(current,prior);
  }
  function statusFor(snapshot){
    const missing=Math.max(0,num(snapshot.missingAfter ?? snapshot.arrears)),credit=Math.max(0,num(snapshot.overpaymentAfter ?? snapshot.overpayment));
    if(snapshot.key>currentMonth() && snapshot.paid<=0.009 && snapshot.carryBefore<=0.009) return {code:'future',label:'Zaplanowane',tone:'neutral'};
    if(snapshot.totalDue<=0.009 && snapshot.paid<=0.009 && credit<=0.009) return {code:'no-data',label:'Brak należności',tone:'warn'};
    const late=new Date()>snapshot.dueDate && missing>0.009;
    if(snapshot.paid<=0.009 && snapshot.totalDue>0.009) return {code:late?'late':'unpaid',label:late?'Po terminie':'Brak wpłaty',tone:late?'bad':'warn'};
    if(missing>0.009) return {code:late?'late-partial':'partial',label:late?'Po terminie — niepełna':'Niepełna płatność',tone:late?'bad':'warn'};
    if(credit>0.009) return {code:'overpaid',label:'Nadpłata',tone:'ok'};
    if(snapshot.paidLate) return {code:'paid-late',label:'Opłacone po terminie',tone:'warn'};
    return {code:'ok',label:'Opłacone',tone:'ok'};
  }
  function monthly(property,key,payments=[],expenses=[],options={}){
    const selected=String(key || currentMonth()).slice(0,7),active=activeInMonth(property,selected),fixed=fixedRows(property,selected);
    const monthPayments=rowsForMonth(payments,property,selected).filter(isPaymentEligible),monthExpenses=rowsForMonth(expenses,property,selected);
    const actualPaymentRows=cashRowsForMonth(payments,property,selected).filter(isPaymentEligible),actualExpenseRows=cashRowsForMonth(expenses,property,selected);
    const tenantExpenseRows=active?monthExpenses.filter(isTenantDueExpense):[],ownerCostRows=monthExpenses.filter(row=>active?isOwnerCost(row):num(row?.amount)>0),actualTenantExpenseRows=active?actualExpenseRows.filter(isTenantDueExpense):[],actualOwnerCostRows=actualExpenseRows.filter(row=>active?isOwnerCost(row):num(row?.amount)>0);
    const actualTenantBuckets=bucketByComponent(tenantExpenseRows);
    const fixedOwnerRows=fixed.filter(row=>row.kind==='income' && row.tenant_due!==false && row.payer!=='owner');
    const fixedPassRows=fixed.filter(row=>row.kind!=='income' && row.tenant_due!==false && row.payer!=='owner');
    const fixedOwnerCostRows=fixed.filter(row=>row.kind!=='income' && (row.payer==='owner' || row.tenant_due===false));
    const ownerRentDue=round(fixedOwnerRows.reduce((sum,row)=>sum+row.amount,0)),passThroughRows=[];
    fixedPassRows.forEach(item=>{ const actual=actualTenantBuckets.get(item.component); const amount=actual && actual.amount>0.009?actual.amount:item.amount; passThroughRows.push({component:item.component,label:item.label,amount:round(amount),source:actual?'actual':'fixed'}); if(actual) actualTenantBuckets.delete(item.component); });
    actualTenantBuckets.forEach(actual=>passThroughRows.push({component:actual.component,label:actual.label,amount:round(actual.amount),source:'actual'}));
    const fixedOwnerBuckets=new Map(); fixedOwnerCostRows.forEach(row=>{ const current=fixedOwnerBuckets.get(row.component)||{component:row.component,label:row.label,amount:0}; current.amount+=num(row.amount); fixedOwnerBuckets.set(row.component,current); });
    const actualOwnerBuckets=bucketByComponent(ownerCostRows),ownerCostBreakdown=[];
    fixedOwnerBuckets.forEach(item=>{ const actual=actualOwnerBuckets.get(item.component); ownerCostBreakdown.push({component:item.component,label:item.label,amount:round(actual && actual.amount>0.009?actual.amount:item.amount),source:actual?'actual':'fixed'}); if(actual) actualOwnerBuckets.delete(item.component); });
    actualOwnerBuckets.forEach(actual=>ownerCostBreakdown.push({component:actual.component,label:actual.label,amount:round(actual.amount),source:'actual'}));
    const passThroughDue=round(passThroughRows.reduce((sum,row)=>sum+row.amount,0)),ownerCostsForecast=round(ownerCostBreakdown.reduce((sum,row)=>sum+row.amount,0)),tenantDue=round(ownerRentDue+passThroughDue);
    const paid=round(monthPayments.reduce((sum,row)=>sum+num(row.amount),0)),carryBefore=round(options.carryBefore || 0),totalDue=round(Math.max(0,tenantDue+carryBefore));
    const ownerRentPaidBase=taxBaseFromPaymentRows(actualPaymentRows,{property}),taxBaseBefore=options.taxableBaseBefore===undefined?priorTaxBase(property,selected,payments):num(options.taxableBaseBefore),tax=calcTax(ownerRentPaidBase,taxBaseBefore);
    const actualPaymentDates=monthPayments.map(row=>{ try{ return window.PureInvestPaymentPeriod?.actualDate?window.PureInvestPaymentPeriod.actualDate(row):rowDate(row); }catch(_){ return rowDate(row); } }).filter(Boolean).map(value=>new Date(value)).filter(date=>Number.isFinite(date.getTime()));
    const latestPaymentDate=actualPaymentDates.length?new Date(Math.max(...actualPaymentDates.map(date=>date.getTime()))):null,paidLate=!!(latestPaymentDate && latestPaymentDate>dueDate(selected,property));
    const cashInflow=round(actualPaymentRows.reduce((sum,row)=>sum+num(row.amount),0)),passThroughCosts=round(actualTenantExpenseRows.reduce((sum,row)=>sum+num(row.amount),0)),ownerCosts=round(actualOwnerCostRows.reduce((sum,row)=>sum+num(row.amount),0)),expensesTotal=round(passThroughCosts+ownerCosts);
    const netResult=round(cashInflow-expensesTotal-tax),ownerResult=round(ownerRentPaidBase-ownerCosts-tax),balanceBeforeCarry=round(tenantDue-paid),balance=round(tenantDue+carryBefore-paid),arrears=round(Math.max(0,balance)),overpayment=round(Math.max(0,-balance)),missingAfter=arrears,overpaymentAfter=overpayment;
    const dueRows=[...fixedOwnerRows.map(row=>({key:'owner',component:'owner',label:row.label,amount:row.amount,source:row.source || 'fixed'})),...passThroughRows.map(row=>({key:row.component,component:row.component,label:row.label,amount:row.amount,source:row.source || 'fixed'}))];
    const snapshot={property,propertyId:String(property?.id ?? ''),key:selected,month:selected,label:selected,active,dueRows,passThroughRows,ownerCostBreakdown,fixedRows:fixed,payments:monthPayments,expenses:monthExpenses,actualPaymentRows,actualExpenseRows,tenantExpenseRows,ownerCostRows,actualTenantExpenseRows,actualOwnerCostRows,ownerRentDue,passThroughDue,tenantDue,baseDue:tenantDue,paid,allocatedPaid:paid,carryBefore,openingBalance:carryBefore,openingCarry:carryBefore,openingArrears:Math.max(0,carryBefore),openingCredit:Math.max(0,-carryBefore),totalDue,ownerRentPaidBase,taxBaseBefore,tax,ownerCosts,ownerCostsForecast,passThroughCosts,expensesTotal,cashInflow,netResult,cashNet:netResult,ownerResult,balanceBeforeCarry,balance,closingBalance:balance,arrears,overpayment,missing:arrears,overpaid:overpayment,missingAfter:arrears,overpaymentAfter:overpayment,settlement:{due:tenantDue,allocatedPaid:paid,openingBalance:carryBefore,closingBalance:balance},cashflow:{inflow:cashInflow,expenses:expensesTotal,passThroughCosts,ownerCosts,tax,net:netResult},forecast:{tenantDue,passThroughDue,ownerCosts:ownerCostsForecast},dueDate:dueDate(selected,property),dueDateLabel:dueDateLabel(selected,property),latestPaymentDate,paidLate};
    snapshot.statusObject=statusFor(snapshot); snapshot.status=snapshot.statusObject.label; snapshot.code=snapshot.statusObject.code; snapshot.tone=snapshot.statusObject.tone;
    return snapshot;
  }
  function decorateOutstandingHistory(history,openingBalance=0){
    const rows=Array.isArray(history)?history:[],obligations=[];
    let credit=Math.max(0,-round(openingBalance || 0));
    if(round(openingBalance || 0)>0.009) obligations.push({row:null,remaining:round(openingBalance),settled:0});
    rows.forEach(row=>{
      const due=Math.max(0,round(row?.tenantDue ?? row?.baseDue ?? 0));
      const obligation={row,remaining:due,settled:0};
      obligations.push(obligation);
      let available=round(Math.max(0,num(row?.paid))+credit);
      credit=0;
      for(const item of obligations){
        if(available<=0.009) break;
        if(item.remaining<=0.009) continue;
        const used=round(Math.min(item.remaining,available));
        item.remaining=round(item.remaining-used);
        item.settled=round(item.settled+used);
        available=round(available-used);
      }
      if(available>0.009) credit=available;
      row.periodDue=due;
      row.periodPaidAtClose=round(obligation.settled);
      row.periodMissingAtClose=round(obligation.remaining);
    });
    obligations.forEach(item=>{
      if(!item.row) return;
      const row=item.row,dueRows=Array.isArray(row.dueRows)?row.dueRows:[];
      row.settledAmount=round(item.settled);
      row.openAmount=round(item.remaining);
      let settledLeft=row.settledAmount;
      row.outstandingRows=dueRows.map(componentRow=>{
        const amount=Math.max(0,round(componentRow?.amount ?? componentRow?.due ?? 0));
        const paid=round(Math.min(amount,settledLeft));
        settledLeft=round(Math.max(0,settledLeft-paid));
        return Object.assign({},componentRow,{due:amount,paid,missing:round(Math.max(0,amount-paid))});
      }).filter(componentRow=>componentRow.missing>0.009);
    });
    return rows;
  }
  function propertyHistory(property,targetMonth,payments=[],expenses=[],options={}){
    const target=String(targetMonth || currentMonth()).slice(0,7),configured=propertyStartMonth(property);
    const candidates=[...liveRows(payments),...liveRows(expenses)].filter(row=>sameProperty(row,property)).map(row=>rowMonth(row) || actualMonth(row)).filter(Boolean).sort();
    const start=options.startMonth || configured || candidates[0] || target,keys=monthRange(start,target); let carry=round(options.openingBalance || 0);
    const history=keys.map(key=>{ const snapshot=monthly(property,key,payments,expenses,{carryBefore:carry}); carry=snapshot.balance; return snapshot; });
    return decorateOutstandingHistory(history,options.openingBalance || 0);
  }
  function aggregate(properties=[],payments=[],expenses=[],keys=[],config={}){
    const props=(properties || []).filter(Boolean),monthKeys=(keys && keys.length?keys:[currentMonth()]).map(key=>String(key).slice(0,7));
    const out={keys:monthKeys,properties:props,income:0,paid:0,allocatedPaid:0,cashInflow:0,expensesTotal:0,passThroughDue:0,passThroughCosts:0,ownerCosts:0,ownerCostsForecast:0,ownerRentDue:0,ownerRentPaidBase:0,tenantDue:0,expected:0,tax:0,balance:0,netResult:0,cashNet:0,ownerResult:0,arrears:0,overpayment:0,categoryTotals:{},snapshots:[]};
    props.forEach(property=>{
      const ordered=[...new Set(monthKeys)].sort(),last=ordered[ordered.length-1];
      // Saldo wybranego miesiaca musi uwzgledniac cala dostepna historie
      // najmu, nawet gdy agregujemy tylko jeden miesiac.
      const selected=new Set(monthKeys),history=propertyHistory(property,last,payments,expenses,{startMonth:config.startMonth || ''});
      history.filter(snapshot=>selected.has(snapshot.key)).forEach(snapshot=>{
      out.snapshots.push(snapshot);
      out.paid+=snapshot.paid; out.allocatedPaid+=snapshot.paid; out.income+=snapshot.cashInflow; out.cashInflow+=snapshot.cashInflow; out.expensesTotal+=snapshot.expensesTotal; out.passThroughDue+=snapshot.passThroughDue; out.passThroughCosts+=snapshot.passThroughCosts; out.ownerCosts+=snapshot.ownerCosts; out.ownerCostsForecast+=snapshot.ownerCostsForecast; out.ownerRentDue+=snapshot.ownerRentDue; out.ownerRentPaidBase+=snapshot.ownerRentPaidBase; out.tenantDue+=snapshot.tenantDue; out.expected+=snapshot.tenantDue;
      snapshot.passThroughRows.forEach(row=>{ out.categoryTotals[row.label]=round((out.categoryTotals[row.label] || 0)+row.amount); });
      snapshot.ownerCostBreakdown.forEach(row=>{ out.categoryTotals[row.label]=round((out.categoryTotals[row.label] || 0)+num(row.amount)); });
      });
    });
    props.forEach(property=>{
      const latest=out.snapshots.filter(row=>row.propertyId===String(property.id)).sort((a,b)=>a.key.localeCompare(b.key)).at(-1);
      if(latest){ out.arrears+=latest.arrears; out.overpayment+=latest.overpayment; }
    });
    out.tax=round([...new Set(monthKeys)].reduce((sum,key)=>sum+portfolioTaxForMonth(props,key,payments),0));
    out.netResult=round(out.cashInflow-out.expensesTotal-out.tax); out.cashNet=out.netResult; out.balance=out.netResult;
    out.ownerResult=round(out.snapshots.reduce((sum,row)=>sum+row.ownerRentPaidBase,0)-out.ownerCosts-out.tax);
    ['income','paid','allocatedPaid','cashInflow','expensesTotal','passThroughDue','passThroughCosts','ownerCosts','ownerCostsForecast','ownerRentDue','ownerRentPaidBase','tenantDue','expected','tax','balance','netResult','cashNet','ownerResult','arrears','overpayment'].forEach(key=>out[key]=round(out[key]));
    return out;
  }
  function audit(properties=[],payments=[],expenses=[],months=[currentMonth()]){
    const rows=[]; (properties || []).forEach(property=>(months || [currentMonth()]).forEach(key=>{ const snapshot=monthly(property,key,payments,expenses); rows.push({mieszkanie:property?.name || property?.address || property?.id,miesiac:key,naleznosc:snapshot.tenantDue,najem:snapshot.ownerRentDue,oplaty:snapshot.passThroughDue,wplacono:snapshot.paid,gotowka:snapshot.cashInflow,koszty:snapshot.expensesTotal,podatek:snapshot.tax,netto:snapshot.netResult,zaleglosc:snapshot.arrears,status:snapshot.status}); }));
    try{ console.table(rows); }catch(_){ } return rows;
  }

  window.PureInvestSettlementEngine={version:'1.9.21',TAX_RATE,TAX_HIGH_RATE,TAX_THRESHOLD,monthKey,currentMonth,addMonth,monthRange,rowMonth,actualMonth,liveRows,normalizeComponent,componentLabel,fixedRows,monthly,decorateOutstandingHistory,propertyHistory,aggregate,annualTax,calcTax,taxBaseFromPaymentRows,taxBaseForActualMonth,portfolioTaxForMonth,audit,money,num,esc};
  window.piSettlementEngine=window.PureInvestSettlementEngine;
})();
