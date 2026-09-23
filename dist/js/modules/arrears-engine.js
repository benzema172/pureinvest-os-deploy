(function(){
  if(window.__PI_ARREARS_ENGINE_V191__) return;
  window.__PI_ARREARS_ENGINE_V191__ = true;

  const $ = id => document.getElementById(id);
  const Core = () => window.PureInvestFinanceCore || {};
  const num = v => Core().num ? Core().num(v) : (Number(String(v ?? '').replace(',', '.')) || 0);
  const money = v => Core().money ? Core().money(v) : (num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const liveRows = rows => Core().liveRows ? Core().liveRows(rows) : (rows || []).filter(r => r && r.is_deleted !== true && !r.deleted_at && r.transaction_status !== 'archived');

  function activeProperty(){
    return window.activePropertyData || (typeof activePropertyData !== 'undefined' ? activePropertyData : null) || {};
  }
  function rowDate(row){
    return row?.payment_date || row?.date || row?.created_at || row?.paid_at || row?.createdAt || null;
  }
  function settlementMonth(row){
    try{ if(window.PureInvestPaymentPeriod?.settlementMonth) return window.PureInvestPaymentPeriod.settlementMonth(row); }catch(_){ }
    return monthKeyFromDate(rowDate(row));
  }
  function monthKeyFromDate(value){
    if(!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if(!Number.isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }
  function monthLabel(key){
    const names=['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
    const y=String(key).slice(0,4), m=Number(String(key).slice(5,7));
    return (names[m-1] || key) + ' ' + y;
  }
  function shortMonthLabel(key){
    const names=['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
    const y=String(key).slice(0,4), m=Number(String(key).slice(5,7));
    return (names[m-1] || key) + ' ' + y;
  }
  function firstMonth(property){
    const now = new Date();
    const candidates = [property?.tenancy_start, property?.lease_start, property?.rent_start, property?.management_start].filter(Boolean);
    for(const c of candidates){
      const d = new Date(c);
      if(Number.isFinite(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(now.getFullYear(), now.getMonth()-11, 1);
  }
  function addMonth(date){ return new Date(date.getFullYear(), date.getMonth()+1, 1); }
  function dueDateFor(key, day){
    const y=Number(String(key).slice(0,4)), m=Number(String(key).slice(5,7));
    const last=new Date(y, m, 0).getDate();
    return new Date(y, m-1, Math.min(Math.max(1, Number(day)||10), last), 23,59,59,999);
  }
  function monthsToCheck(property){
    const now=new Date();
    const months=[];
    let d=firstMonth(property);
    const end=new Date(now.getFullYear(), now.getMonth(), 1);
    // Bezpiecznik: maksymalnie 36 miesięcy, żeby błędna data najmu nie tworzyła śmieciowej listy.
    // Zaległości liczymy od razu za każdy miesiąc objęty najmem, niezależnie od dnia płatności.
    const min=new Date(end.getFullYear(), end.getMonth()-35, 1);
    if(d < min) d = min;
    while(d <= end){
      const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      months.push(key);
      d=addMonth(d);
    }
    return months;
  }
  function tableForMonth(property, payments, expenses, month){
    const rows = liveRows(payments).filter(row => settlementMonth(row) === month);
    const expenseRows = liveRows(expenses || []).filter(row => monthKeyFromDate(rowDate(row)) === month);
    if(Core().settlementTable) return Core().settlementTable(property, rows, expenseRows, month);
    const due = num(property?.rent_amount || property?.owner_rent || property?.monthly_rent || 0);
    const paid = rows.reduce((s,r)=>s+num(r.amount),0);
    return {rows:[{key:'owner',label:'Najem',due,paid,missing:Math.max(0,due-paid)}], totals:{due,paid,missing:Math.max(0,due-paid),overpaid:Math.max(0,paid-due)}};
  }
  function calculate(property, payments, expenses){
    if(!property?.id) return {propertyId:'',totalDue:0,totalPaid:0,totalMissing:0,months:[]};
    const Engine=window.PureInvestSettlementEngine;
    if(Engine && typeof Engine.propertyHistory==='function'){
      const keys=monthsToCheck(property),start=keys[0],end=keys[keys.length-1];
      const history=Engine.propertyHistory(property,end,liveRows(payments),liveRows(expenses || []),{startMonth:start});
      const current=history[history.length-1];
      if(!current) return {propertyId:String(property.id),totalDue:0,totalPaid:0,totalMissing:0,months:[]};
      const months=history.filter(row=>num(row.openAmount)>0.009).map(row=>({
        key:row.key,
        label:monthLabel(row.key),
        shortLabel:shortMonthLabel(row.key),
        due:num(row.periodDue ?? row.tenantDue),
        paid:num(row.settledAmount ?? Math.max(0,num(row.tenantDue)-num(row.openAmount))),
        missing:num(row.openAmount),
        rows:(row.outstandingRows || []).map(componentRow=>({
          key:componentRow.key || componentRow.component || 'other',
          label:componentRow.label || 'Należność',
          due:num(componentRow.due ?? componentRow.amount),
          paid:num(componentRow.paid),
          missing:num(componentRow.missing)
        })).filter(componentRow=>componentRow.missing>0.009)
      }));
      const totals=months.reduce((sum,row)=>{ sum.totalDue+=row.due; sum.totalPaid+=row.paid; sum.totalMissing+=row.missing; return sum; },{totalDue:0,totalPaid:0,totalMissing:0});
      return {propertyId:String(property.id),totalDue:totals.totalDue,totalPaid:totals.totalPaid,totalMissing:totals.totalMissing,months};
    }
    const out=[];
    for(const key of monthsToCheck(property)){
      const table=tableForMonth(property, payments, expenses, key);
      const due=num(table?.totals?.due), paid=num(table?.totals?.paid), missing=Math.max(0, num(table?.totals?.missing ?? (due-paid)));
      if(due > 0.009 && missing > 0.009){
        out.push({key,label:monthLabel(key),shortLabel:shortMonthLabel(key),due,paid,missing,rows:(table.rows||[]).filter(r=>num(r.missing)>0.009)});
      }
    }
    const totals=out.reduce((a,m)=>{a.totalDue+=m.due; a.totalPaid+=m.paid; a.totalMissing+=m.missing; return a;},{totalDue:0,totalPaid:0,totalMissing:0});
    totals.months=out;
    totals.propertyId = String(property?.id || '');
    return totals;
  }

  function updateHealthBox(result){
    try{
      const box=$('v7HealthBox'), status=$('v7HealthStatus'), text=$('v7HealthText');
      if(!box || !status || !text) return;
      if(!result || result.totalMissing <= 0.009) return;
      box.classList.remove('good','warn','bad');
      box.classList.add('bad');
      status.textContent='Zaległość';
      const oldest=result.months?.[0]?.shortLabel || '';
      const months=(result.months||[]).map(m=>m.shortLabel).join(', ');
      text.innerHTML='Brakuje '+money(result.totalMissing)+' łącznie do pełnych należności najemcy.'+
        (oldest ? ' Najstarsza zaległość: <b>'+esc(oldest)+'</b>.' : '')+
        (months ? ' Miesiące z brakiem: '+esc(months)+'.' : '')+
        ' System liczy narastająco: najem + czynsz administracyjny + media/rachunki obciążające najemcę.';
    }catch(e){ console.warn('arrears health update skipped', e); }
  }

  function render(){
    const property=activeProperty();
    const payments=window.rawPayments || (typeof rawPayments !== 'undefined' ? rawPayments : []);
    const expenses=window.rawExpenses || (typeof rawExpenses !== 'undefined' ? rawExpenses : []);
    const result=calculate(property, payments, expenses);
    window.PureInvestArrears = result;
    updateHealthBox(result);

    const payment=$('paymentAlert');
    if(payment){
      if(result.totalMissing > 0.009){
        payment.className='quick alert pi-arrears-quick';
        const months=result.months.slice(-3).map(m=>m.shortLabel).join(', ');
        const oldest=result.months[0]?.shortLabel || result.months[result.months.length-1]?.shortLabel || '';
        payment.innerHTML='<div class="pi-quick-title">⚠️ Płatności i zaległości</div><div class="pi-quick-value">'+money(result.totalMissing)+'</div><div class="pi-quick-meta">Najstarszy brak: '+esc(oldest)+(months ? ' · Miesiące: '+esc(months) : '')+'</div>';
      }else{
        payment.className='quick ok';
        payment.innerHTML='<div class="pi-quick-title">✅ Płatności i zaległości</div><div class="pi-quick-value">OK</div><div class="pi-quick-meta">Brak zaległości w bieżących rozliczeniach</div>';
      }
    }

    const panel=$('tenantArrearsPanel');
    if(panel){
      if(result.totalMissing <= 0.009){
        panel.classList.add('hidden');
        panel.innerHTML='';
      }else{
        panel.classList.remove('hidden');
        const rows=result.months.map(m=>{
          const parts=m.rows.map(r=>`${esc(r.label)}: ${money(r.missing)}`).join(' · ');
          return `<div class="pi-arrears-row"><div><b>${esc(m.label)}</b><small>${parts || 'Brak szczegółów składników'}</small></div><div><span>Należne ${money(m.due)}</span><span>Rozliczono ${money(m.paid)}</span><strong>${money(m.missing)}</strong></div></div>`;
        }).join('');
        panel.innerHTML=`<div class="pi-arrears-head"><div><div class="card-title">Zaległości najemcy</div><p>Każdy wiersz pokazuje wyłącznie należność i nierozliczoną kwotę danego miesiąca. Łączna zaległość jest sumą otwartych miesięcy.</p></div><strong>${money(result.totalMissing)}</strong></div><div class="pi-arrears-list">${rows}</div>`;
      }
    }
    return result;
  }

  window.piCalculateTenantArrears = calculate;
  window.piRenderTenantArrears = render;

  const oldRefresh=window.refreshDashboard;
  if(typeof oldRefresh === 'function'){
    window.refreshDashboard = async function(){
      const r = await oldRefresh.apply(this, arguments);
      try{ render(); }catch(e){ console.warn('arrears render skipped', e); }
      return r;
    };
  }
  const oldRenderPaymentAlert=window.renderPaymentAlert;
  if(typeof oldRenderPaymentAlert === 'function'){
    window.renderPaymentAlert = function(){
      const r = oldRenderPaymentAlert.apply(this, arguments);
      try{ render(); }catch(e){ console.warn('arrears payment skipped', e); }
      return r;
    };
  }
  setTimeout(()=>{ try{ render(); }catch(_){ } }, 300);
})();
