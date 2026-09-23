const Period=require('./_pi-payment-period');

const EXCLUDED=new Set(['draft','rejected','duplicate','archived']);
const OWNER_COSTS=new Set(['renovation','service','insurance','tax','owner_cost','maintenance']);
const LABELS={owner:'Najem właścicielski',community:'Czynsz administracyjny',electricity:'Prąd',gas:'Gaz',water:'Woda',media:'Media',trash:'Śmieci',surcharge:'Dopłata',adjustment:'Korekta',other:'Pozostałe'};
const n=value=>{ const number=Number(String(value ?? 0).replace(/\s/g,'').replace(',', '.').replace(/[^0-9.\-]/g,'')); return Number.isFinite(number)?Math.round(number*100)/100:0; };
const round=value=>Math.round(n(value)*100)/100;
const month=value=>Period.normalizeMonth(value);
function addMonth(key,delta){ const y=Number(key.slice(0,4)),m=Number(key.slice(5,7)); return month(new Date(y,m-1+delta,1)); }
function range(start,end){ const rows=[]; let key=start,guard=0; while(key && key<=end && guard++<600){ rows.push(key); key=addMonth(key,1); } return rows; }
function component(row){
  const direct=String(row?.component || row?.settlement_component || '').toLowerCase().replace('owner_rent','owner');
  if(direct) return direct;
  const text=String([row?.name,row?.category,row?.source,row?.note].filter(Boolean).join(' ')).toLowerCase();
  if(/najem|czynsz najmu|rent/.test(text)) return 'owner'; if(/administr|wspól|wspol|spółdz|spoldz/.test(text)) return 'community'; if(/prąd|prad|energia/.test(text)) return 'electricity'; if(/gaz/.test(text)) return 'gas'; if(/woda/.test(text)) return 'water'; if(/śmieci|smieci|odpady/.test(text)) return 'trash'; if(/media|rachun/.test(text)) return 'media'; return 'other';
}
function live(row){ return row && row.is_deleted!==true && !row.deleted_at && !EXCLUDED.has(String(row.transaction_status || '').toLowerCase()); }
function paymentEligible(row){
  if(!live(row) || n(row?.amount)<=0) return false;
  const key=component(row),text=String([row?.name,row?.category,row?.source,row?.note,row?.description].filter(Boolean).join(' ')).toLowerCase();
  return key!=='deposit' && !/kaucj|deposit/.test(text);
}
function tenantExpense(row){
  if(n(row?.amount)<=0) return false;
  if(row?.tenant_due===true && row?.payer!=='owner') return true;
  if(row?.tenant_due===false || row?.payer==='owner') return false;
  const key=component(row); return !OWNER_COSTS.has(key) && ['community','electricity','gas','water','media','trash','surcharge','adjustment','other'].includes(key);
}
function legacyItems(property){
  const rows=[]; const add=(name,key,value,kind='expense',taxable=false)=>{ if(n(value)>0) rows.push({name,component:key,default_amount:n(value),kind,recurring:'monthly',payer:'tenant',tenant_due:true,taxable,active:true}); };
  let owner=n(property?.owner_rent ?? property?.owner_monthly_rent ?? property?.rent);
  const extras=n(property?.community_rent)+n(property?.electricity_expected)+n(property?.gas_expected)+n(property?.water_expected)+n(property?.trash_expected ?? property?.garbage_expected ?? property?.waste_expected);
  if(!owner && n(property?.rent_amount)>extras) owner=n(property.rent_amount)-extras;
  add('Najem właścicielski','owner',owner,'income',true); add('Czynsz administracyjny','community',property?.community_rent); add('Prąd','electricity',property?.electricity_expected); add('Gaz','gas',property?.gas_expected); add('Woda','water',property?.water_expected); add('Śmieci','trash',property?.trash_expected ?? property?.garbage_expected ?? property?.waste_expected);
  return rows;
}
function itemsForMonth(items,property,key){
  const source=Array.isArray(items)&&items.length?items:legacyItems(property);
  return source.filter(item=>{
    const from=month(item.effective_from || item.valid_from),to=month(item.effective_to || item.valid_to);
    return item.active!==false && item.recurring==='monthly' && item.tenant_due!==false && item.payer!=='owner' && (!from || from<=key) && (!to || to>=key);
  });
}
function dueDate(key,property){ const y=Number(key.slice(0,4)),m=Number(key.slice(5,7)),day=Math.max(1,Math.min(31,Number(property?.payment_day || property?.rent_due_day || 10)||10)); return new Date(y,m-1,Math.min(day,new Date(y,m,0).getDate()),23,59,59,999); }
function decorateOutstandingHistory(history){
  const rows=Array.isArray(history)?history:[],obligations=[]; let credit=0;
  rows.forEach(row=>{
    const due=Math.max(0,round(row?.tenantDue ?? 0)),obligation={row,remaining:due,settled:0}; obligations.push(obligation);
    let available=round(Math.max(0,n(row?.paid))+credit); credit=0;
    for(const item of obligations){
      if(available<=0.009) break;
      if(item.remaining<=0.009) continue;
      const used=round(Math.min(item.remaining,available)); item.remaining=round(item.remaining-used); item.settled=round(item.settled+used); available=round(available-used);
    }
    if(available>0.009) credit=available;
    row.periodDue=due; row.periodPaidAtClose=round(obligation.settled); row.periodMissingAtClose=round(obligation.remaining);
  });
  obligations.forEach(item=>{
    const row=item.row; row.settledAmount=round(item.settled); row.openAmount=round(item.remaining); let settledLeft=row.settledAmount;
    row.outstandingRows=(Array.isArray(row.dueRows)?row.dueRows:[]).map(componentRow=>{
      const amount=Math.max(0,round(componentRow?.amount ?? 0)),paid=round(Math.min(amount,settledLeft)); settledLeft=round(Math.max(0,settledLeft-paid));
      return {...componentRow,due:amount,paid,missing:round(Math.max(0,amount-paid))};
    }).filter(componentRow=>componentRow.missing>0.009);
  });
  return rows;
}
function history({property,tenancy,settlementItems,payments,expenses,targetMonth,months=12}){
  const target=month(targetMonth || new Date()),start=month(tenancy?.start_date || property?.lease_start || property?.rent_start) || addMonth(target,-(months-1)),end=month(tenancy?.end_date) || target;
  const last=end<target?end:target,keys=range(start,last),paymentRows=(payments||[]).filter(paymentEligible),expenseRows=(expenses||[]).filter(row=>live(row)&&tenantExpense(row)); let carry=0;
  const all=keys.map(key=>{
    const configured=itemsForMonth(settlementItems,property,key),dueRows=configured.map(item=>({key:component(item),component:component(item),label:LABELS[component(item)] || item.name || 'Należność',amount:n(item.default_amount ?? item.amount),source:'fixed'}));
    const expenseByComponent=new Map(); expenseRows.filter(row=>month(row.expense_date || row.date || row.created_at)===key).forEach(row=>{ const c=component(row); expenseByComponent.set(c,round((expenseByComponent.get(c)||0)+n(row.amount))); });
    dueRows.forEach(row=>{ if(row.component!=='owner' && expenseByComponent.has(row.component)){ row.amount=expenseByComponent.get(row.component); row.source='actual'; expenseByComponent.delete(row.component); } });
    expenseByComponent.forEach((amount,c)=>dueRows.push({key:c,component:c,label:LABELS[c] || 'Pozostałe',amount,source:'actual'}));
    const tenantDue=round(dueRows.reduce((sum,row)=>sum+n(row.amount),0)),monthPayments=paymentRows.filter(row=>Period.settlementMonth(row)===key),paid=round(monthPayments.reduce((sum,row)=>sum+n(row.amount),0)),opening=carry,balance=round(tenantDue+opening-paid),missing=Math.max(0,balance),credit=Math.max(0,-balance),due=dueDate(key,property),future=key>month(new Date());
    const dates=monthPayments.map(Period.actualDate).filter(Boolean).map(value=>new Date(value)).filter(date=>Number.isFinite(date.getTime())),latest=dates.length?new Date(Math.max(...dates.map(date=>date.getTime()))):null;
    let status='Opłacone',code='ok',tone='ok';
    if(future && paid<=0.009 && opening<=0.009){ status='Zaplanowane'; code='future'; tone='neutral'; }
    else if(missing>0.009 && paid<=0.009){ code=new Date()>due?'late':'unpaid'; status=code==='late'?'Po terminie':'Brak wpłaty'; tone=code==='late'?'bad':'warn'; }
    else if(missing>0.009){ code=new Date()>due?'late-partial':'partial'; status=code==='late-partial'?'Po terminie — niepełna':'Niepełna płatność'; tone=code==='late-partial'?'bad':'warn'; }
    else if(credit>0.009){ status='Nadpłata'; code='overpaid'; }
    else if(latest && latest>due){ status='Opłacone po terminie'; code='paid-late'; tone='warn'; }
    carry=balance;
    return {key,month:key,tenantDue,totalDue:Math.max(0,round(tenantDue+opening)),paid,allocatedPaid:paid,carryBefore:opening,openingBalance:opening,balance,closingBalance:balance,arrears:missing,missingAfter:missing,overpayment:credit,overpaymentAfter:credit,status,code,tone,dueDateLabel:String(due.getDate()).padStart(2,'0')+'.'+String(due.getMonth()+1).padStart(2,'0')+'.'+due.getFullYear(),dueRows,payments:monthPayments.map(row=>({id:row.id,amount:n(row.amount),payment_date:Period.actualDate(row),settlement_month:key,source:row.source || row.category || 'Wpłata',transaction_status:row.transaction_status || null,settlement_component:row.settlement_component || null}))};
  });
  return decorateOutstandingHistory(all).slice(-Math.max(1,Math.min(60,Number(months)||12)));
}

module.exports={history,decorateOutstandingHistory,live,paymentEligible,tenantExpense,legacyItems,itemsForMonth,component};
