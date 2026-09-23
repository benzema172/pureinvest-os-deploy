(function(){
  if(window.PureInvestFinanceCore && window.PureInvestFinanceCore.__version === '7.5.2') return;

  const COMPONENTS = ['owner','community','electricity','gas','water','other'];
  const componentLabels = {
    owner:'Najem',
    owner_rent:'Najem właścicielski',
    community:'Czynsz administracyjny',
    electricity:'Prąd',
    gas:'Gaz',
    water:'Woda',
    media:'Media / rachunki',
    other:'Pozostałe rachunki',
    deposit:'Kaucja',
    renovation:'Remont / koszt właściciela',
    service:'Serwis'
  };
  const sourceLabels = {manual:'Ręcznie', gmail:'Gmail', ocr:'OCR', import:'Import', system:'System'};
  const statusLabels = {draft:'Robocza', approved:'Zatwierdzona', rejected:'Odrzucona', duplicate:'Duplikat', archived:'Archiwalna'};

  function num(v){
    if(v === null || v === undefined || v === '') return 0;
    if(typeof v === 'number') return Number.isFinite(v) ? Math.round(v*100)/100 : 0;
    let s = String(v).trim().replace(/\s/g,'').replace(/zł|pln/ig,'');
    if(s.includes(',') && s.includes('.')) s = s.replace(/\./g,'').replace(',','.');
    else s = s.replace(',','.');
    s = s.replace(/[^0-9.\-]/g,'');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n*100)/100 : 0;
  }
  function money(v){ return num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' zł'; }
  function liveRows(rows){
    const excluded=new Set(['draft','rejected','duplicate','archived']);
    return (rows||[]).filter(r => r && r.is_deleted !== true && !r.deleted_at && !excluded.has(String(r.transaction_status || '').toLowerCase()));
  }
  function text(row){ return String([row?.settlement_component,row?.source,row?.category,row?.note,row?.attachment_name,row?.description,row?.name].filter(Boolean).join(' ')).toLowerCase(); }
  function normalizeComponent(value){
    const hard = String(value || '').trim();
    if(hard === 'owner') return 'owner';
    if(hard === 'owner_rent') return 'owner';
    if(hard === 'community') return 'community';
    if(hard === 'electricity') return 'electricity';
    if(hard === 'gas') return 'gas';
    if(hard === 'water') return 'water';
    if(hard === 'media') return 'other';
    if(hard === 'deposit') return 'deposit';
    if(hard === 'renovation') return 'renovation';
    if(hard === 'service') return 'service';
    return hard || '';
  }
  function component(row, fallbackType){
    const hard = normalizeComponent(row?.settlement_component);
    if(hard) return hard;
    const t = text(row);
    if(/(prąd|prad|energia|energa|enea|pge|tauron|electric)/i.test(t)) return 'electricity';
    if(/(gaz|pgnig|gas)/i.test(t)) return 'gas';
    if(/(woda|wodoci|water)/i.test(t)) return 'water';
    if(/(wspól|wspol|czynsz|administr|spółdziel|spoldziel|community)/i.test(t)) return 'community';
    if(/(najem|odstępne|odstepne|rent)/i.test(t)) return 'owner';
    if(/(kaucj|deposit)/i.test(t)) return 'deposit';
    if(/(remont|napraw|serwis|meble|wyposaż|wyposaz|inwestyc)/i.test(t)) return fallbackType === 'expense' ? 'renovation' : 'other';
    if(/(media|opłat|oplata|opłata|zaliczka)/i.test(t)) return 'other';
    return fallbackType === 'payment' ? 'owner' : 'other';
  }
  function blankComponents(){ return {owner:0, community:0, electricity:0, gas:0, water:0, other:0}; }
  function componentSum(c){ return COMPONENTS.reduce((a,k)=>a+num(c?.[k]),0); }
  function expenseComponents(expenses){
    const c = blankComponents();
    liveRows(expenses).forEach(row=>{
      const comp = component(row,'expense');
      if(['renovation','service','deposit'].includes(comp)) return;
      const key = comp === 'media' ? 'other' : comp;
      if(c[key] !== undefined && key !== 'owner') c[key] += num(row.amount);
    });
    return c;
  }
  function dueComponents(property, expenses){
    const p = property || {};
    const fromExpenses = expenseComponents(expenses || []);
    const owner = num(p.owner_rent ?? p.rent_amount ?? p.monthly_rent ?? p.owner_monthly_rent ?? p.rent ?? 0);
    return {
      owner,
      community: Math.max(num(p.community_rent), fromExpenses.community),
      electricity: Math.max(num(p.electricity_expected), fromExpenses.electricity),
      gas: Math.max(num(p.gas_expected), fromExpenses.gas),
      water: Math.max(num(p.water_expected), fromExpenses.water),
      other: fromExpenses.other
    };
  }
  function allocatePayments(payments, due){
    const paid = blankComponents();
    const d = Object.assign(blankComponents(), due || {});
    const addCapped = (key, amount)=>{
      const cap = Math.max(0, num(d[key]) - num(paid[key]));
      const used = Math.min(Math.max(0, amount), cap);
      paid[key] += used;
      return amount - used;
    };
    liveRows(payments).forEach(row=>{
      let amount = num(row.amount);
      const comp = component(row,'payment');
      const key = comp === 'media' ? 'other' : (comp === 'owner_rent' ? 'owner' : comp);
      if(key === 'owner'){
        amount = addCapped('owner', amount);
        for(const k of ['community','electricity','gas','water','other']) amount = addCapped(k, amount);
        if(amount > 0) paid.other += amount;
      }else if(['community','electricity','gas','water'].includes(key)){
        paid[key] += amount;
      }else if(key === 'other'){
        for(const k of ['community','electricity','gas','water','other']) amount = addCapped(k, amount);
        if(amount > 0) paid.other += amount;
      }else if(key === 'deposit'){
        paid.other += amount;
      }else{
        paid.other += amount;
      }
    });
    return paid;
  }
  function settlementTable(property, payments, expenses, targetMonth){
    const Engine = window.PureInvestSettlementEngine;
    if(Engine && typeof Engine.monthly === 'function'){
      const key = targetMonth || (Engine.currentMonth ? Engine.currentMonth() : (new Date().toISOString().slice(0,7)));
      const snap = Engine.monthly(property, key, payments || [], expenses || []);
      const due = blankComponents();
      (snap.dueRows || []).forEach(row=>{
        const comp = component({settlement_component:row.component || row.key, source:row.label}, 'expense');
        const k = comp === 'owner_rent' ? 'owner' : (comp === 'media' ? 'other' : comp);
        if(due[k] !== undefined) due[k] += num(row.amount);
        else due.other += num(row.amount);
      });
      const paid = allocatePayments(snap.payments || [], due);
      const rows = COMPONENTS.map(key=>({ key, label:componentLabels[key] || key, due:num(due[key]), paid:num(paid[key]), missing:Math.max(0,num(due[key])-num(paid[key])), overpaid:Math.max(0,num(paid[key])-num(due[key])) }));
      const totals = rows.reduce((a,r)=>{ a.due+=r.due; a.paid+=r.paid; a.missing+=r.missing; a.overpaid+=r.overpaid; return a; }, {due:0,paid:0,missing:0,overpaid:0});
      return {due, paid, rows, totals, unified:true, snapshot:snap};
    }
    const due = dueComponents(property, expenses);
    const paid = allocatePayments(payments, due);
    const rows = COMPONENTS.map(key=>({
      key,
      label: componentLabels[key] || key,
      due: num(due[key]),
      paid: num(paid[key]),
      missing: Math.max(0, num(due[key]) - num(paid[key])),
      overpaid: Math.max(0, num(paid[key]) - num(due[key]))
    }));
    const totals = rows.reduce((a,r)=>{
      a.due += r.due; a.paid += r.paid; a.missing += r.missing; a.overpaid += r.overpaid; return a;
    },{due:0,paid:0,missing:0,overpaid:0});
    return {due, paid, rows, totals};
  }
  function propertyFinanceModel(property, payments, expenses){
    const baseRent = num(property?.owner_rent ?? property?.rent_amount ?? property?.monthly_rent ?? property?.owner_monthly_rent ?? property?.rent ?? 0);
    const annualTax = window.PureInvestTaxPolicy?.annualTax ? window.PureInvestTaxPolicy.annualTax(baseRent * 12) : Math.min(baseRent * 12,100000)*0.085 + Math.max(baseRent * 12-100000,0)*0.125;
    const monthlyTax = Math.round((annualTax / 12) * 100) / 100;
    const annualNetRent = Math.max(0, baseRent - monthlyTax) * 12;
    const purchase = num(property?.purchase_price ?? property?.market_value ?? 0);
    const roi = purchase > 0 ? (annualNetRent / purchase) * 100 : null;
    return {baseRent, monthlyTax, annualNetRent, purchase, roi};
  }
  function rowToFinance(table, row){
    const isPayment = table === 'payments';
    return {
      table,
      id: row.id,
      type: isPayment ? 'income' : 'expense',
      property_id: row.property_id,
      amount: num(row.amount),
      name: isPayment ? (row.source || 'Wpłata') : (row.category || 'Koszt'),
      date: (window.PureInvestPaymentPeriod?.actualDate ? window.PureInvestPaymentPeriod.actualDate(row) : (row.payment_date || row.created_at)),
      settlement_month: (window.PureInvestPaymentPeriod?.settlementMonth ? window.PureInvestPaymentPeriod.settlementMonth(row) : ''),
      note: (window.PureInvestPaymentPeriod?.cleanNote ? window.PureInvestPaymentPeriod.cleanNote(row.note || '') : (row.note || '')),
      attachment_url: row.attachment_url || '',
      attachment_path: row.attachment_path || '',
      attachment_name: row.attachment_name || '',
      transaction_status: row.transaction_status || 'approved',
      transaction_source: row.transaction_source || guessSource(row),
      settlement_component: row.settlement_component || (component(row, isPayment ? 'payment' : 'expense') === 'owner' ? 'owner_rent' : component(row, isPayment ? 'payment' : 'expense')),
      raw: row
    };
  }
  function guessSource(row){
    const s = String(row?.transaction_source || '').trim();
    if(s) return s;
    const t = text(row);
    if(/gmail|mail|poczta/i.test(t)) return 'gmail';
    if(/ocr|skan/i.test(t)) return 'ocr';
    if(/import/i.test(t)) return 'import';
    return 'manual';
  }

  window.PureInvestFinanceCore = {
    __version:'7.5.2', num, money, liveRows, text, component, normalizeComponent,
    blankComponents, componentSum, expenseComponents, dueComponents, allocatePayments,
    settlementTable, propertyFinanceModel, rowToFinance, guessSource,
    componentLabels, sourceLabels, statusLabels
  };
  window.piLiveTxRows = liveRows;
  window.piRentEngineNum = num;
  window.piRentEngineComponent = row => component(row, row?.source !== undefined ? 'payment' : 'expense');
  window.piRentEngineDueComponents = dueComponents;
  window.piRentEngineAllocatePayments = allocatePayments;
  window.piRentEngineExpenseComponents = expenseComponents;
  window.piRentEngineComponentSum = componentSum;
})();
