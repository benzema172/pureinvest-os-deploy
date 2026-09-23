(function(){
  const REPORT_VERSION = 'PureInvest OS — raport właścicielski';
  const HISTORY_KEY = 'pureinvest_reports_history_v1';

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = v => { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; };
  const dbClient = () => window.db || window.piDb || (typeof db !== 'undefined' ? db : null);
  const MONTHS = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
  const MONTHS_SHORT = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

  const moneyFmt = v => {
    try{ return typeof money === 'function' ? money(v) : num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł'; }
    catch(_){ return num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł'; }
  };

  function ownerRentNum(id){ return num($(id)?.value); }
  window.ownerRentNum = window.ownerRentNum || ownerRentNum;

  function calculateTenantExpectedFromInputs(){
    return ownerRentNum('ownerRentInput') + ownerRentNum('communityRentInput') + ownerRentNum('electricityExpectedInput') + ownerRentNum('gasExpectedInput') + ownerRentNum('waterExpectedInput');
  }
  window.calculateTenantExpectedFromInputs = calculateTenantExpectedFromInputs;

  function renderOwnerRentPanel(){
    const p = window.activePropertyData || (typeof activePropertyData !== 'undefined' ? activePropertyData : {}) || {};
    const owner = num(p.owner_rent || p.rent_amount || p.monthly_rent || 0);
    const community = num(p.community_rent || 0);
    const electricity = num(p.electricity_expected || 0);
    const gas = num(p.gas_expected || 0);
    const water = num(p.water_expected || 0);
    const total = owner + community + electricity + gas + water;
    const setText = (id,val)=>{ const el=$(id); if(el) el.innerText=moneyFmt(val); };
    const setVal = (id,val)=>{ const el=$(id); if(el) el.value = val || ''; };
    setVal('ownerRentInput', owner);
    setVal('communityRentInput', community);
    setVal('electricityExpectedInput', electricity);
    setVal('gasExpectedInput', gas);
    setVal('waterExpectedInput', water);
    setVal('rentDueDayInput', p.rent_due_day || p.payment_day || '');
    setVal('rentAmountInput', total);
    setText('tenantExpectedTotal', total);
    setText('piTenantCardExpectedTotal', total);
    setText('tenantOwnerRentView', owner);
    setText('tenantCommunityRentView', community);
    setText('tenantElectricityView', electricity);
    setText('tenantGasView', gas);
    setText('tenantWaterView', water);
  }
  window.renderOwnerRentPanel = renderOwnerRentPanel;

  ['ownerRentInput','communityRentInput','electricityExpectedInput','gasExpectedInput','waterExpectedInput'].forEach(id=>{
    document.addEventListener('input', e=>{
      if(!e.target || e.target.id !== id) return;
      const total = calculateTenantExpectedFromInputs();
      const rentAmount = $('rentAmountInput');
      if(rentAmount) rentAmount.value = total;
      const totalView = $('tenantExpectedTotal');
      if(totalView) totalView.innerText = moneyFmt(total);
      const pairs = [['tenantOwnerRentView','ownerRentInput'],['tenantCommunityRentView','communityRentInput'],['tenantElectricityView','electricityExpectedInput'],['tenantGasView','gasExpectedInput'],['tenantWaterView','waterExpectedInput']];
      pairs.forEach(([view,input])=>{ const el=$(view); if(el) el.innerText = moneyFmt(ownerRentNum(input)); });
    });
  });

  function toast(message, type='ok'){
    if(typeof window.piToast === 'function') return window.piToast(message, type);
    const box = document.createElement('div');
    box.className = 'pi-toast pi-toast-'+type;
    box.textContent = message;
    document.body.appendChild(box);
    setTimeout(()=>box.remove(),3200);
  }

  function dateValue(row){ return row?.payment_date || row?.expense_date || row?.date || row?.created_at || row?.updated_at || ''; }
  function ymd(row){ return String(dateValue(row) || '').slice(0,10); }
  function ym(row){
    try{
      const period=window.PureInvestPaymentPeriod;
      if(period?.isPaymentRow?.(row)) return period.actualMonth?.(row) || String(dateValue(row) || '').slice(0,7);
    }catch(_){ }
    return String(dateValue(row) || '').slice(0,7);
  }
  function yyyy(row){ return String(ym(row) || '').slice(0,4); }
  function currentMonth(){ return new Date().toISOString().slice(0,7); }
  function currentYear(){ return String(new Date().getFullYear()); }
  function monthKey(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
  function monthDate(key){ const [y,m] = String(key || currentMonth()).split('-').map(Number); return new Date(y || new Date().getFullYear(), (m || 1)-1, 1); }
  function addMonths(key, delta){ const d = monthDate(key); d.setMonth(d.getMonth()+delta); return monthKey(d); }
  function monthLabel(key){ const [y,m] = String(key || '').split('-'); const idx = Number(m)-1; return `${MONTHS_SHORT[idx] || m} ${String(y || '').slice(-2)}`; }

  function propertiesFromState(){
    try{ if(Array.isArray(loadedProperties) && loadedProperties.length) return loadedProperties; }catch(_){ }
    if(Array.isArray(window.loadedProperties) && window.loadedProperties.length) return window.loadedProperties;
    return [];
  }

  async function loadProperties(){
    const existing = propertiesFromState();
    if(existing.length) return existing;
    const client = dbClient();
    if(!client) return [];
    const {data,error} = await client.from('properties').select('*').order('created_at',{ascending:false});
    if(error) throw error;
    try{ loadedProperties = data || []; }catch(_){ }
    window.loadedProperties = data || [];
    return data || [];
  }

  async function loadTransactions(){
    const client = dbClient();
    if(!client) return {payments:[], expenses:[]};
    const [pRes,eRes] = await Promise.all([
      client.from('payments').select('*').order('created_at',{ascending:false}),
      client.from('expenses').select('*').order('created_at',{ascending:false})
    ]);
    if(pRes.error) throw pRes.error;
    if(eRes.error) throw eRes.error;
    return {
      payments: (pRes.data || []).filter(x=>!x.is_deleted && !x.deleted_at),
      expenses: (eRes.data || []).filter(x=>!x.is_deleted && !x.deleted_at)
    };
  }

  function periodLabel(config){
    if(config.period === 'month'){
      const [y,m] = String(config.month || currentMonth()).split('-');
      return `${MONTHS[Number(m)-1] || m} ${y}`;
    }
    if(config.period === 'year') return `rok ${config.year || currentYear()}`;
    return 'cała historia';
  }

  function periodMonthCount(config){
    if(config.period === 'month') return 1;
    if(config.period === 'year') return 12;
    return 0;
  }

  function filterPeriod(rows, config){
    if(config.period === 'month') return rows.filter(row => ym(row) === config.month);
    if(config.period === 'year') return rows.filter(row => yyyy(row) === String(config.year));
    return rows.slice();
  }

  function filterScope(rows, config){
    if(config.type === 'portfolio') return rows.slice();
    if(!config.propertyId) return [];
    return rows.filter(row => String(row.property_id || '') === String(config.propertyId));
  }

  function sourceLabel(row, type){
    if(type === 'payment') return row.source || row.category || row.settlement_component || 'Wpłata';
    return row.category || row.vendor || row.settlement_component || 'Koszt';
  }

  function groupByCategory(expenses){
    return expenses.reduce((acc,row)=>{
      const key = row.category || row.vendor || row.settlement_component || 'Inne';
      acc[key] = (acc[key] || 0) + num(row.amount);
      return acc;
    },{});
  }

  function expectedMonthlyProperty(p){
    if(!p) return 0;
    const owner = num(p.owner_rent || p.monthly_rent || p.rent_amount || p.rent || 0);
    const community = num(p.community_rent || 0);
    const electricity = num(p.electricity_expected || 0);
    const gas = num(p.gas_expected || 0);
    const water = num(p.water_expected || 0);
    return owner + community + electricity + gas + water;
  }

  function expectedFor(config, property, properties){
    const months = periodMonthCount(config);
    if(!months) return 0;
    if(config.type === 'portfolio') return properties.reduce((s,p)=>s+expectedMonthlyProperty(p),0) * months;
    return expectedMonthlyProperty(property) * months;
  }

  function statusFor(balance, payments, expenses, arrears){
    if(arrears > 0) return {label:'Zaległość', cls:'danger', text:'W raporcie widoczna jest różnica między oczekiwanym wpływem a zaksięgowanymi wpłatami. Warto zweryfikować płatność najemcy.'};
    if(balance < 0) return {label:'Wymaga uwagi', cls:'danger', text:'Wynik jest ujemny. Warto przejrzeć koszty, zaległości albo poprawność zaksięgowania wpływów.'};
    if(payments.length === 0 && expenses.length > 0) return {label:'Do obserwacji', cls:'warn', text:'W analizowanym okresie widoczne są koszty bez zaksięgowanego wpływu.'};
    return {label:'Zdrowe', cls:'ok', text:'Wynik jest dodatni, a dane nie wskazują na pilną interwencję.'};
  }

  function buildConfig(){
    return {
      type: $('piReportType')?.value || 'property',
      propertyId: $('piReportProperty')?.value || '',
      period: $('piReportPeriod')?.value || 'month',
      month: $('piReportMonth')?.value || currentMonth(),
      year: $('piReportYear')?.value || currentYear(),
      includeTransactions: !!$('piReportIncludeTransactions')?.checked,
      includeCategories: !!$('piReportIncludeCategories')?.checked,
      includeCharts: $('piReportIncludeCharts') ? !!$('piReportIncludeCharts')?.checked : true,
      includeInsights: !!$('piReportIncludeInsights')?.checked,
      includeAiCommentary: $('piReportIncludeAICommentary') ? !!$('piReportIncludeAICommentary')?.checked : true,
      includeFooter: !!$('piReportIncludeFooter')?.checked,
      managerNote: ($('piReportManagerNote')?.value || '').trim(),
      marketTrend: ($('piReportMarketTrend')?.value || '').trim(),
      costTrend: ($('piReportCostTrend')?.value || '').trim(),
      marketSource: ($('piReportMarketSource')?.value || '').trim(),
      marketNote: ($('piReportMarketNote')?.value || '').trim(),
      marketRentPerM2: num($('piReportMarketRentPerM2')?.value || 0),
      marketSalePerM2: num($('piReportMarketSalePerM2')?.value || 0),
      marketRentYoY: num($('piReportMarketRentYoY')?.value || 0),
      marketPriceYoY: num($('piReportMarketPriceYoY')?.value || 0),
      marketUpdatedAt: ($('piReportMarketUpdatedAt')?.value || '').trim()
    };
  }

  function reportTitle(type){
    if(type === 'portfolio') return 'Raport portfela';
    if(type === 'owner') return 'Raport właścicielski';
    return 'Raport miesięczny mieszkania';
  }

  function propertyName(p){ return p?.name || p?.address || 'Wybrana nieruchomość'; }
  function propertyLine(p){ return [p?.postal_code, p?.city, p?.address].filter(Boolean).join(' · ') || 'Brak pełnego adresu'; }

  function calcReportTax(rows, options={}){
    const paymentRows = Array.isArray(rows) ? rows : [];
    const config = options.config || {};
    const property = options.property || null;
    const properties = Array.isArray(options.properties) ? options.properties : [];
    try{
      if(config.type === 'portfolio' && properties.length){
        const total = properties.reduce((sum, p)=>{
          const pid = String(p?.id ?? '');
          const scoped = paymentRows.filter(row => String(row?.property_id ?? row?.propertyId ?? '') === pid);
          if(!scoped.length) return sum;
          if(typeof window.piCalcTenantRentTax === 'function') return sum + num(window.piCalcTenantRentTax(scoped, {property:p}));
          const base = typeof window.piTaxBaseFromPaymentRows === 'function'
            ? num(window.piTaxBaseFromPaymentRows(scoped, {property:p}))
            : scoped.reduce((acc,row)=>acc + num(row?.amount), 0);
          const tax = typeof window.calcTax === 'function' ? num(window.calcTax(base)) : Math.round(base * 0.085 * 100) / 100;
          return sum + tax;
        }, 0);
        return Math.round(total * 100) / 100;
      }
      if(typeof window.piCalcTenantRentTax === 'function') return num(window.piCalcTenantRentTax(paymentRows, {property}));
      const base = typeof window.piTaxBaseFromPaymentRows === 'function'
        ? num(window.piTaxBaseFromPaymentRows(paymentRows, {property}))
        : paymentRows.reduce((acc,row)=>acc + num(row?.amount), 0);
      return typeof window.calcTax === 'function' ? num(window.calcTax(base)) : Math.round(base * 0.085 * 100) / 100;
    }catch(_){
      return 0;
    }
  }

  function buildTrendRows(config, payments, expenses){
    const scopedP = filterScope(payments, config);
    const scopedE = filterScope(expenses, config);
    let keys = [];
    if(config.period === 'year'){
      for(let i=1;i<=12;i++) keys.push(`${config.year || currentYear()}-${String(i).padStart(2,'0')}`);
    }else if(config.period === 'month'){
      for(let i=-5;i<=0;i++) keys.push(addMonths(config.month || currentMonth(), i));
    }else{
      const found = Array.from(new Set([...scopedP.map(ym), ...scopedE.map(ym)].filter(Boolean))).sort();
      keys = found.length ? found.slice(-12) : Array.from({length:6},(_,i)=>addMonths(currentMonth(), i-5));
    }
    return keys.map(key=>{
      const monthPayments = scopedP.filter(row=>ym(row)===key);
      const income = monthPayments.reduce((s,row)=>s+num(row.amount),0);
      const expensesTotal = scopedE.filter(row=>ym(row)===key).reduce((s,row)=>s+num(row.amount),0);
      const tax = calcReportTax(monthPayments, {config, property: config.type === 'property' ? (config.__reportProperty || null) : null, properties: config.__reportProperties || []});
      return {key, label: monthLabel(key), income, expenses: expensesTotal, tax, balance: income - expensesTotal - tax};
    });
  }

  function buildRecommendations(report){
    const rec = [];
    const categoryRows = Object.entries(report.categoryTotals).sort((a,b)=>b[1]-a[1]);
    const topCat = categoryRows[0];
    const latest = report.trendRows[report.trendRows.length-1];
    const prev = report.trendRows[report.trendRows.length-2];
    if(report.arrears > 0) rec.push(`Zweryfikuj płatność najemcy — szacowana zaległość za raportowany okres wynosi ${moneyFmt(report.arrears)}.`);
    if(report.balance < 0) rec.push('Przejrzyj koszty i kompletność wpływów, ponieważ wynik netto w raporcie jest ujemny.');
    if(topCat && report.expensesTotal > 0 && topCat[1] / report.expensesTotal >= 0.45) rec.push(`Największy udział w kosztach ma kategoria „${topCat[0]}”. Warto sprawdzić, czy to koszt jednorazowy, czy stały trend.`);
    if(prev && latest && latest.balance < prev.balance * 0.75) rec.push('Ostatni miesiąc wygląda słabiej niż poprzedni. Warto porównać wpływy i koszty miesiąc do miesiąca.');
    if(report.balance >= 0 && report.arrears <= 0) rec.push('Nieruchomość/portfel wygląda stabilnie. Rekomendowana jest okresowa kontrola stawki najmu i kosztów administracyjnych.');
    if(report.config.type !== 'portfolio' && expectedMonthlyProperty(report.property) === 0) rec.push('Uzupełnij oczekiwany czynsz i opłaty dla nieruchomości, aby raport dokładniej pokazywał zaległości.');
    return rec.slice(0,4);
  }

  function renderMarketIntelligence(report){
    const mi = report.marketIntelligence || buildMarketIntelligence(report);
    if(!mi) return '';
    const c = report.config || {};
    const diff = Number.isFinite(mi.rentDiffPct) ? signedPct(mi.rentDiffPct) : '—';
    const marketRange = mi.marketRentMonthly ? `${moneyFmt(mi.marketRentMin)}–${moneyFmt(mi.marketRentMax)}` : '—';
    const cards = [
      ['Stawka lokalu', numberPerM2Maybe(mi.currentRentM2), mi.totalArea ? `${mi.totalArea.toLocaleString('pl-PL',{maximumFractionDigits:2})} m²` : 'brak metrażu', 'neutral'],
      ['Benchmark najmu', numberPerM2Maybe(mi.marketRentM2), mi.source, mi.marketRentM2 ? 'positive' : 'warn'],
      ['Różnica do rynku', diff, mi.rentStatus, mi.rentTone],
      ['Szacowany najem', marketRange, 'przedział miesięczny ±5%', mi.marketRentMonthly ? 'positive' : 'neutral'],
      ['Wartość lokalu', numberMoneyMaybe(mi.estimatedValue), mi.valueSource, mi.estimatedValue ? 'positive' : 'warn'],
      ['Rentowność brutto', pctFmtMaybe(mi.grossYield), 'roczny najem / wartość', mi.grossYield ? 'positive' : 'neutral']
    ];
    return `<section class="pi-report-v2-section pi-report-market-intelligence">
      <div class="pi-report-v2-section-title">
        <h4>Market Intelligence — dane rynkowe i ocena stawki</h4>
        <p>Konkretne wskaźniki dla właściciela: stawka za m², benchmark, szacowany najem, wartość i rentowność.</p>
      </div>
      <div class="pi-report-market-meta"><span>Źródło: ${esc(mi.source)}</span><span>Aktualizacja: ${esc(mi.updatedAt)}</span><span>Zakres: ${esc(c.type === 'portfolio' ? 'portfel' : propertyName(report.property))}</span></div>
      <div class="pi-report-market-cards">${cards.map(([label,value,hint,tone])=>`<div class="${esc(tone)}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></div>`).join('')}</div>
      <div class="pi-report-market-table">${mi.rows.map(([label,value,hint])=>`<div><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(hint)}</small></div>`).join('')}</div>
      <div class="pi-report-market-conclusion ${esc(mi.rentTone)}"><b>${esc(mi.rentStatus)}</b><p>${esc(mi.conclusion)}</p>${mi.note?`<small>${esc(mi.note)}</small>`:''}</div>
    </section>`;
  }

  function autoNote(report){
    const {config, property, balance, status, countProperties, arrears, roiLike} = report;
    if(config.type === 'portfolio'){
      if(balance >= 0 && arrears <= 0) return `Portfel obejmuje ${countProperties} nieruchomości i w okresie ${periodLabel(config)} wygenerował dodatni wynik. Najważniejsze parametry pozostają pod kontrolą, a raport pozwala porównać mieszkania według salda i kosztów.`;
      return `Portfel obejmuje ${countProperties} nieruchomości i w okresie ${periodLabel(config)} wymaga uwagi. Warto sprawdzić zaległości, mieszkania z najniższym saldem oraz największe kategorie kosztów.`;
    }
    const name = propertyName(property);
    const rentSignal = roiLike > 0 ? ` Szacunkowa rentowność operacyjna za okres wynosi ${roiLike.toFixed(1).replace('.',',')}%.` : '';
    if(balance >= 0 && arrears <= 0) return `${name} w okresie ${periodLabel(config)} wygenerowało dodatnie saldo. ${status.text}${rentSignal}`;
    return `${name} w okresie ${periodLabel(config)} wymaga kontroli. ${status.text}${rentSignal}`;
  }

  async function buildReport(){
    const config = buildConfig();
    const [properties, tx] = await Promise.all([loadProperties(), loadTransactions()]);
    if(!config.propertyId && config.type !== 'portfolio' && properties[0]) config.propertyId = properties[0].id;
    const property = properties.find(p => String(p.id) === String(config.propertyId)) || null;
    await ensureAutoMarketIntelligence(config, properties, property, false);
    const scopedPayments = filterPeriod(filterScope(tx.payments, config), config);
    const scopedExpenses = filterPeriod(filterScope(tx.expenses, config), config);
    const income = scopedPayments.reduce((sum,row)=>sum+num(row.amount),0);
    const expensesTotal = scopedExpenses.reduce((sum,row)=>sum+num(row.amount),0);
    const balance = income - expensesTotal;
    const expected = expectedFor(config, property, properties);
    const arrears = expected > 0 ? Math.max(expected - income, 0) : 0;
    const status = statusFor(balance, scopedPayments, scopedExpenses, arrears);
    const categoryTotals = groupByCategory(scopedExpenses);
    const trendRows = buildTrendRows({...config, __reportProperty: property, __reportProperties: properties}, tx.payments, tx.expenses);
    const propertyBalances = properties.map(p=>{
      const c = {...config, propertyId:p.id, type:'property'};
      const pp = filterPeriod(tx.payments.filter(x=>String(x.property_id)===String(p.id)), config).reduce((s,x)=>s+num(x.amount),0);
      const ee = filterPeriod(tx.expenses.filter(x=>String(x.property_id)===String(p.id)), config).reduce((s,x)=>s+num(x.amount),0);
      const exp = expectedFor(c, p, properties);
      const propertyPayments = filterPeriod(tx.payments.filter(x=>String(x.property_id)===String(p.id)), config);
      const propertyTax = calcReportTax(propertyPayments, {config:{...config, type:'property'}, property:p, properties});
      return {property:p, income:pp, expenses:ee, tax:propertyTax, balance:pp-ee-propertyTax, arrears: exp > 0 ? Math.max(exp-pp,0) : 0};
    }).sort((a,b)=>b.balance-a.balance);
    const roiBase = expected || income;
    const roiLike = roiBase > 0 ? (balance / roiBase) * 100 : 0;
    const report = {config, properties, property, payments:scopedPayments, expenses:scopedExpenses, income, expensesTotal, balance, expected, arrears, status, categoryTotals, trendRows, propertyBalances, countProperties:properties.length, roiLike};
    report.note = config.managerNote || autoNote(report);
    report.recommendations = buildRecommendations(report);
    report.aiCommentary = config.includeAiCommentary ? buildAiCommentary(report) : null;
    return report;
  }

  function kpi(label, value, hint, cls=''){
    return `<div class="reports-pro-kpi ${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
  }

  function maxVal(rows, keys){ return Math.max(1, ...rows.flatMap(row => keys.map(k => Math.abs(num(row[k]))))); }

  function renderTrendChart(report){
    const rows = report.trendRows || [];
    if(!rows.length) return '<div class="reports-pro-empty">Brak danych do wykresu trendu.</div>';
    const max = maxVal(rows, ['income','expenses']);
    const last = rows[rows.length-1] || {};
    const avgBalance = rows.reduce((s,r)=>s+r.balance,0) / Math.max(rows.length,1);
    return `<div class="reports-pro-chart-card reports-pro-chart-card-wide">
      <div class="reports-pro-chart-head"><div><h5>Trend miesięczny</h5><p>Wpływy, koszty i wynik netto w czasie.</p></div><strong class="${last.balance < 0 ? 'is-negative' : 'is-positive'}">${esc(moneyFmt(last.balance || 0))}</strong></div>
      <div class="reports-pro-trend-chart" role="img" aria-label="Wykres trendu miesięcznego">
        ${rows.map(row=>{
          const incomeH = Math.max(4, Math.round((num(row.income)/max)*100));
          const expenseH = Math.max(4, Math.round((num(row.expenses)/max)*100));
          return `<div class="reports-pro-trend-col">
            <div class="reports-pro-trend-bars"><i class="income" style="height:${incomeH}%"></i><i class="expense" style="height:${expenseH}%"></i></div>
            <b class="${row.balance < 0 ? 'is-negative' : 'is-positive'}">${esc(moneyFmt(row.balance))}</b>
            <span>${esc(row.label)}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="reports-pro-chart-legend"><span><i class="income"></i>Wpływy</span><span><i class="expense"></i>Koszty</span><span>Średni wynik: <b>${esc(moneyFmt(avgBalance))}</b></span></div>
    </div>`;
  }

  function renderCategoryChart(report){
    const rows = Object.entries(report.categoryTotals).sort((a,b)=>b[1]-a[1]).slice(0,7);
    if(!rows.length) return '<div class="reports-pro-empty">Brak kosztów do wykresu kategorii.</div>';
    const max = Math.max(1, ...rows.map(x=>x[1]));
    return `<div class="reports-pro-chart-card"><div class="reports-pro-chart-head"><div><h5>Struktura kosztów</h5><p>Największe pozycje kosztowe.</p></div></div>
      <div class="reports-pro-horizontal-chart">${rows.map(([name,total])=>`<div class="reports-pro-bar-row"><span>${esc(name)}</span><div><i style="width:${Math.max(2,Math.round(total/max*100))}%"></i></div><b>${esc(moneyFmt(total))}</b></div>`).join('')}</div>
    </div>`;
  }

  function renderPortfolioChart(report){
    const rows = report.propertyBalances.slice(0,8);
    if(!rows.length) return '<div class="reports-pro-empty">Brak mieszkań do wykresu portfela.</div>';
    const max = Math.max(1, ...rows.map(x=>Math.abs(x.balance)));
    return `<div class="reports-pro-chart-card"><div class="reports-pro-chart-head"><div><h5>Ranking portfela</h5><p>Saldo według nieruchomości.</p></div></div>
      <div class="reports-pro-horizontal-chart">${rows.map(row=>`<div class="reports-pro-bar-row"><span>${esc(propertyName(row.property))}</span><div><i class="${row.balance < 0 ? 'negative' : 'positive'}" style="width:${Math.max(2,Math.round(Math.abs(row.balance)/max*100))}%"></i></div><b class="${row.balance < 0 ? 'is-negative' : 'is-positive'}">${esc(moneyFmt(row.balance))}</b></div>`).join('')}</div>
    </div>`;
  }

  function renderExecutiveSummary(report){
    const margin = report.income ? (report.balance / report.income) * 100 : 0;
    const expenseShare = report.income ? (report.expensesTotal / report.income) * 100 : 0;
    return `<section class="reports-pro-summary-strip">
      <div><span>Marża netto</span><b class="${margin < 0 ? 'is-negative' : 'is-positive'}">${esc(margin.toFixed(1).replace('.',','))}%</b></div>
      <div><span>Udział kosztów</span><b>${esc(expenseShare.toFixed(1).replace('.',','))}%</b></div>
      <div><span>Oczekiwane wpływy</span><b>${esc(report.expected ? moneyFmt(report.expected) : '—')}</b></div>
      <div><span>Liczba transakcji</span><b>${esc(String(report.payments.length + report.expenses.length))}</b></div>
    </section>`;
  }

  function renderRecommendations(report){
    if(!report.recommendations?.length) return '';
    return `<div class="reports-pro-recommendations">${report.recommendations.map((txt,i)=>`<div><span>${i+1}</span><p>${esc(txt)}</p></div>`).join('')}</div>`;
  }

  function renderTransactionTable(report){
    const rows = [
      ...report.payments.map(row => ({kind:'Wpływ', date:ymd(row), label:sourceLabel(row,'payment'), amount:num(row.amount), note:row.note || ''})),
      ...report.expenses.map(row => ({kind:'Koszt', date:ymd(row), label:sourceLabel(row,'expense'), amount:-num(row.amount), note:row.note || ''}))
    ].sort((a,b)=>String(a.date).localeCompare(String(b.date)) || a.kind.localeCompare(b.kind));
    if(!rows.length) return '<div class="reports-pro-empty">Brak transakcji w wybranym okresie.</div>';
    return `<div class="reports-pro-table"><div class="reports-pro-table-head"><span>Data</span><span>Typ</span><span>Opis</span><span>Kwota</span></div>${rows.slice(0,80).map(row=>`<div class="reports-pro-table-row"><span>${esc(row.date || '—')}</span><span>${esc(row.kind)}</span><span>${esc(row.label)}${row.note ? `<small>${esc(row.note)}</small>` : ''}</span><b class="${row.amount < 0 ? 'is-negative' : 'is-positive'}">${esc(moneyFmt(row.amount))}</b></div>`).join('')}</div>`;
  }

  function renderCategoryTable(report){
    const rows = Object.entries(report.categoryTotals).sort((a,b)=>b[1]-a[1]);
    if(!rows.length) return '<div class="reports-pro-empty">Brak kosztów do pogrupowania.</div>';
    return `<div class="reports-pro-mini-list">${rows.map(([name,total])=>`<div><span>${esc(name)}</span><b>${esc(moneyFmt(total))}</b></div>`).join('')}</div>`;
  }

  function renderPortfolioRanking(report){
    const rows = report.propertyBalances.slice(0,8);
    if(!rows.length) return '<div class="reports-pro-empty">Brak mieszkań w portfelu.</div>';
    return `<div class="reports-pro-ranking">${rows.map((row,i)=>`<div class="reports-pro-ranking-row"><div><b>${i+1}. ${esc(propertyName(row.property))}</b><small>${esc(propertyLine(row.property))}</small></div><strong class="${row.balance < 0 ? 'is-negative' : 'is-positive'}">${esc(moneyFmt(row.balance))}</strong></div>`).join('')}</div>`;
  }

  function renderCharts(report){
    return `<section class="reports-pro-section reports-pro-charts-section"><h4>Analiza i wykresy</h4><div class="reports-pro-chart-grid">
      ${renderTrendChart(report)}
      ${report.config.type === 'portfolio' ? renderPortfolioChart(report) : renderCategoryChart(report)}
    </div></section>`;
  }

  function renderPreview(report){
    const {config, property, income, expensesTotal, balance, status, arrears} = report;
    const scope = config.type === 'portfolio' ? 'Wszystkie nieruchomości' : propertyName(property);
    const context = `${reportTitle(config.type)} · ${scope} · ${periodLabel(config)}`;
    const ctx = $('piReportsContext'); if(ctx) ctx.textContent = context;
    const statusEl = $('piReportsStatus'); if(statusEl) statusEl.textContent = status.label;
    const target = $('reports'); if(!target) return;
    target.innerHTML = `
      <article class="reports-pro-document reports-pro-document-v2">
        <header class="reports-pro-doc-header reports-pro-doc-header-v2">
          <div><div class="reports-pro-brand">PureInvest</div><h3>${esc(reportTitle(config.type))}</h3><p>${esc(periodLabel(config))}</p></div>
          <div class="reports-pro-doc-meta"><span>Wygenerowano</span><b>${esc(new Date().toLocaleDateString('pl-PL'))}</b><span>Status</span><b class="status-${status.cls}">${esc(status.label)}</b></div>
        </header>
        <section class="reports-pro-subject">
          <div><span>Zakres raportu</span><strong>${esc(scope)}</strong><small>${esc(config.type === 'portfolio' ? `${report.countProperties} nieruchomości` : propertyLine(property))}</small></div>
          ${property && config.type !== 'portfolio' ? `<div><span>Najemca</span><strong>${esc(property.tenant_name || 'Brak najemcy')}</strong><small>${esc(property.tenant_phone || property.tenant_email || 'Brak kontaktu')}</small></div>` : `<div><span>Tryb raportu</span><strong>${esc(config.type === 'portfolio' ? 'Portfel nieruchomości' : 'Właścicielski')}</strong><small>${esc(periodLabel(config))}</small></div>`}
        </section>
        <section class="reports-pro-kpis reports-pro-kpis-v2">
          ${kpi('Przychody', moneyFmt(income), periodLabel(config))}
          ${kpi('Koszty', moneyFmt(expensesTotal), periodLabel(config))}
          ${kpi('Wynik netto', moneyFmt(balance), balance >= 0 ? 'wynik dodatni' : 'wynik ujemny', balance < 0 ? 'negative' : 'positive')}
          ${kpi('Zaległości', moneyFmt(arrears), report.expected ? 'względem oczekiwanych wpłat' : 'uzupełnij czynsz oczekiwany', arrears > 0 ? 'negative' : 'positive')}
        </section>
        ${renderExecutiveSummary(report)}
        ${config.includeCharts ? renderCharts(report) : ''}
        ${config.includeInsights ? `<section class="reports-pro-section"><h4>Podsumowanie zarządcze</h4><p>${esc(report.note)}</p>${renderRecommendations(report)}</section>` : ''}
        ${config.type === 'portfolio' ? `<section class="reports-pro-section"><h4>Ranking mieszkań według salda</h4>${renderPortfolioRanking(report)}</section>` : ''}
        ${config.includeTransactions ? `<section class="reports-pro-section"><h4>Lista transakcji</h4>${renderTransactionTable(report)}</section>` : ''}
        ${config.includeFooter ? `<footer class="reports-pro-footer">Raport wygenerowany automatycznie w systemie PureInvest. Dane pochodzą z zapisanych transakcji i konfiguracji nieruchomości. Wnioski mają charakter pomocniczy i powinny być weryfikowane z dokumentami źródłowymi.</footer>` : ''}
      </article>`;
  }

  function setLoading(isLoading){
    const status = $('piReportsStatus');
    if(status) status.textContent = isLoading ? 'Ładowanie...' : 'Gotowe';
  }

  function getHistory(){ try{ return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }catch(_){ return []; } }
  function normalizeHistoryRow(row){
    return { id: row.id || row.created_at || Date.now(), action: row.action || row.report_action || 'generated', type: row.type || row.report_type || 'Raport', scope: row.scope || row.property_name || row.report_scope || '—', period: row.period || row.report_period || '—', balance: num(row.balance), date: row.date || (row.created_at ? new Date(row.created_at).toLocaleString('pl-PL') : new Date().toLocaleString('pl-PL')) };
  }
  function persistHistoryEntry(entry){
    const db = dbClient();
    if(!db || !db.from) return;
    try{
      db.from('generated_reports').insert([{ report_type: entry.type, report_action: entry.action, report_scope: entry.scope, report_period: entry.period, balance: entry.balance, property_id: window.piLastReportsPro?.property?.id || null, created_at: new Date().toISOString() }]).then(({error}) => { if(error) console.warn('Report history save skipped:', error.message || error); });
    }catch(e){ console.warn('Report history save skipped:', e.message || e); }
  }
  function saveHistoryEntry(report, action){
    const entry = { id: Date.now(), action, type: reportTitle(report.config.type), scope: report.config.type === 'portfolio' ? 'Wszystkie nieruchomości' : propertyName(report.property), period: periodLabel(report.config), balance: report.balance, date: new Date().toLocaleString('pl-PL') };
    const next = [entry, ...getHistory()].slice(0,12);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    persistHistoryEntry(entry);
    renderHistory();
  }
  async function loadRemoteHistory(){
    const db = dbClient(); if(!db || !db.from) return null;
    try{
      const {data, error} = await db.from('generated_reports').select('id,report_type,report_action,report_scope,report_period,balance,property_id,created_at').order('created_at', {ascending:false}).limit(12);
      if(error) throw error;
      return (data || []).map(normalizeHistoryRow);
    }catch(e){ console.warn('Report history read skipped:', e.message || e); return null; }
  }
  function renderHistoryRows(rows){
    const box = $('piReportsHistory'); if(!box) return;
    if(!rows.length){ box.innerHTML = '<div class="reports-pro-empty">Historia raportów pojawi się po wygenerowaniu PDF albo CSV.</div>'; return; }
    box.innerHTML = rows.map(row=>`<div class="reports-pro-history-row"><div><b>${esc(row.type)}</b><small>${esc(row.scope)} · ${esc(row.period)} · ${esc(row.date)}</small></div><strong>${esc(moneyFmt(row.balance))}</strong></div>`).join('');
  }
  function renderHistory(){
    const localRows = getHistory().map(normalizeHistoryRow);
    renderHistoryRows(localRows);
    loadRemoteHistory().then(remoteRows => { if(Array.isArray(remoteRows) && remoteRows.length) renderHistoryRows(remoteRows); });
  }

  async function refreshReports(showToast=false){
    setLoading(true);
    try{
      const report = await buildReport();
      window.piLastReportsPro = report;
      renderPreview(report);
      if(showToast) toast('Podgląd raportu został odświeżony.');
    }catch(error){
      console.error(error);
      const target = $('reports');
      if(target) target.innerHTML = `<div class="reports-pro-error">Nie udało się przygotować raportu: ${esc(error.message || error)}</div>`;
      const status = $('piReportsStatus'); if(status) status.textContent = 'Błąd';
    }finally{ setLoading(false); }
  }
  window.piReportsRefresh = refreshReports;

  function togglePeriod(){
    const period = $('piReportPeriod')?.value || 'month';
    $('piReportMonthWrap')?.classList.toggle('hidden', period !== 'month');
    $('piReportYearWrap')?.classList.toggle('hidden', period !== 'year');
  }
  window.piReportsTogglePeriod = togglePeriod;

  async function initReports(){
    const month = $('piReportMonth'); if(month && !month.value) month.value = currentMonth();
    const year = $('piReportYear'); if(year && !year.value) year.value = currentYear();
    togglePeriod();
    try{
      const properties = await loadProperties();
      const select = $('piReportProperty');
      if(select){
        const activeId = window.activeProperty || window.activePropertyData?.id || (typeof activeProperty !== 'undefined' ? activeProperty : '') || '';
        select.innerHTML = properties.map(p=>`<option value="${esc(p.id)}">${esc(propertyName(p))}</option>`).join('');
        if(activeId && properties.some(p=>String(p.id)===String(activeId))) select.value = activeId;
      }
      renderHistory();
      await refreshReports(false);
    }catch(error){
      console.error(error);
      const target = $('reports');
      if(target) target.innerHTML = `<div class="reports-pro-error">Nie udało się załadować danych raportów: ${esc(error.message || error)}</div>`;
    }
  }
  window.piReportsInit = initReports;

  async function exportCsv(){
    try{
      const report = window.piLastReportsPro || await buildReport();
      const rows = [
        ['Typ raportu', reportTitle(report.config)], ['Zakres', report.config.type === 'portfolio' ? 'Wszystkie nieruchomości' : propertyName(report.property)], ['Okres', periodLabel(report.config)], ['Przychody', String(report.income).replace('.',',')], ['Koszty', String(report.expensesTotal).replace('.',',')], ['Wynik netto', String(report.balance).replace('.',',')], ['Zaległości', String(report.arrears).replace('.',',')], [], ['Data','Typ','Opis','Kwota']
      ];
      report.payments.forEach(row=>rows.push([ymd(row),'Wpływ',sourceLabel(row,'payment'),String(num(row.amount)).replace('.',',')]));
      report.expenses.forEach(row=>rows.push([ymd(row),'Koszt',sourceLabel(row,'expense'),String(-num(row.amount)).replace('.',',')]));
      const csv = '\ufeff' + rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g,'""')}"`).join(';')).join('\n');
      const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `PureInvest_raport_${Date.now()}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      saveHistoryEntry(report,'csv');
      toast('Eksport CSV został przygotowany.');
    }catch(error){ console.error(error); toast('Nie udało się przygotować CSV: '+(error.message || error), 'error'); }
  }
  window.piReportsExportCsv = exportCsv;

  function hookSwitchTab(){
    const old = window.switchTab;
    if(typeof old !== 'function' || old.__piReportsProHooked) return;
    window.switchTab = function(tab, navEl){
      const result = old.apply(this, arguments);
      if(tab === 'reports') setTimeout(()=>initReports(),80);
      return result;
    };
    window.switchTab.__piReportsProHooked = true;
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const month = $('piReportMonth'); if(month && !month.value) month.value = currentMonth();
    const year = $('piReportYear'); if(year && !year.value) year.value = currentYear();
    hookSwitchTab();
    if($('tab-reports')?.classList.contains('active')) setTimeout(()=>initReports(),100);
  });
  setTimeout(hookSwitchTab,500);
})();


/* PureInvest PDF Polish characters fix - HTML render export
   Problem: jsPDF built-in Helvetica does not support Polish glyphs (ą, ć, ę, ł, ń, ó, ś, ź, ż).
   Fix: render the existing report preview with the browser engine via html2canvas, then place it into PDF pages.
   Result: Polish characters are preserved exactly as seen in the preview. */
(function(){
  function piPdfToast(message, type='ok'){
    if(typeof window.piToast === 'function') return window.piToast(message, type);
    console.log('[PureInvest PDF]', message);
  }

  function piLoadScriptOnce(src, marker){
    return new Promise((resolve, reject)=>{
      if(marker && window[marker]) return resolve(window[marker]);
      const existing = document.querySelector(`script[data-pi-loader="${marker || src}"]`);
      if(existing){
        existing.addEventListener('load', ()=>resolve(marker ? window[marker] : true), {once:true});
        existing.addEventListener('error', reject, {once:true});
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.piLoader = marker || src;
      script.onload = ()=>resolve(marker ? window[marker] : true);
      script.onerror = ()=>reject(new Error('Nie udało się załadować biblioteki PDF.'));
      document.head.appendChild(script);
    });
  }

  async function piEnsurePdfDeps(){
    if(!window.jspdf?.jsPDF){
      await piLoadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
    }
    if(!window.html2canvas){
      await piLoadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
    }
    if(!window.jspdf?.jsPDF || !window.html2canvas){
      throw new Error('Brak wymaganych bibliotek PDF.');
    }
    return { jsPDF: window.jspdf.jsPDF, html2canvas: window.html2canvas };
  }

  function piSafePdfName(){
    const ctx = document.getElementById('piReportsContext')?.textContent || 'PureInvest raport';
    const cleaned = String(ctx)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(0,120);
    return `${cleaned || 'PureInvest_raport'}_${new Date().toISOString().slice(0,10)}.pdf`;
  }

  function piStoreReportHistory(){
    try{
      const report = window.piLastReportsPro;
      if(!report) return;
      const key = 'pureinvest_reports_history_v1';
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      const moneyValue = Number(report.balance || 0);
      const type = document.querySelector('#piReportType option:checked')?.textContent || 'Raport PDF';
      const scope = document.getElementById('piReportProperty')?.selectedOptions?.[0]?.textContent || 'Wszystkie nieruchomości';
      const period = document.getElementById('piReportsContext')?.textContent?.split('·')?.pop()?.trim() || '—';
      rows.unshift({ id: Date.now(), action:'pdf', type, scope, period, balance: moneyValue, date: new Date().toLocaleString('pl-PL') });
      localStorage.setItem(key, JSON.stringify(rows.slice(0,12)));
      if(typeof window.piReportsInit === 'function') setTimeout(()=>window.piReportsInit(), 120);
    }catch(_){ }
  }

  async function piReportsDownloadPdfPolish(){
    try{
      piPdfToast('Przygotowuję PDF z polskimi znakami...');
      if(typeof window.piReportsRefresh === 'function'){
        await window.piReportsRefresh(false);
        await new Promise(resolve => setTimeout(resolve, 180));
      }
      const source = document.querySelector('#reports .reports-pro-document');
      if(!source) throw new Error('Brak podglądu raportu do eksportu.');

      const { jsPDF, html2canvas } = await piEnsurePdfDeps();

      const holder = document.createElement('div');
      holder.setAttribute('aria-hidden','true');
      holder.style.position = 'fixed';
      holder.style.left = '-12000px';
      holder.style.top = '0';
      holder.style.width = '900px';
      holder.style.background = '#f7f3ee';
      holder.style.padding = '24px';
      holder.style.zIndex = '-1';

      const clone = source.cloneNode(true);
      clone.style.width = '900px';
      clone.style.maxWidth = '900px';
      clone.style.margin = '0';
      clone.style.boxSizing = 'border-box';
      holder.appendChild(clone);
      document.body.appendChild(holder);

      const canvas = await html2canvas(clone, {
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        backgroundColor: '#f7f3ee',
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: 980
      });

      holder.remove();

      const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait', compress:true });
      const pageW = 210;
      const pageH = 297;
      const margin = 8;
      const imgW = pageW - margin * 2;
      const imgH = canvas.height * imgW / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.94);

      let y = margin;
      let remaining = imgH;
      pdf.addImage(imgData, 'JPEG', margin, y, imgW, imgH, undefined, 'FAST');
      remaining -= (pageH - margin * 2);
      while(remaining > 0){
        pdf.addPage();
        y = margin - (imgH - remaining);
        pdf.addImage(imgData, 'JPEG', margin, y, imgW, imgH, undefined, 'FAST');
        remaining -= (pageH - margin * 2);
      }

      const pages = pdf.internal.getNumberOfPages();
      for(let i=1;i<=pages;i++){
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(120,112,102);
        pdf.text(`${i}/${pages}`, pageW - margin - 10, pageH - 5);
      }

      pdf.save(piSafePdfName());
      piStoreReportHistory();
      piPdfToast('Raport PDF został wygenerowany z polskimi znakami.');
    }catch(error){
      console.error(error);
      piPdfToast('Nie udało się wygenerować PDF: '+(error.message || error), 'error');
    }
  }

  window.piReportsDownloadPdf = piReportsDownloadPdfPolish;
})();

/* ============================================================
   PureInvest — raport właścicielski — owner-grade reports
   Warstwa nadpisująca v1 bez ruszania reszty aplikacji.
   ============================================================ */
(function(){
  const REPORT_VERSION = 'PureInvest OS — raport właścicielski';
  const HISTORY_KEY = 'pureinvest_reports_history_v1';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = v => { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; };
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const dbClient = () => window.db || window.piDb || (typeof db !== 'undefined' ? db : null);
  const MONTHS = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
  const MONTHS_SHORT = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

  const moneyFmt = v => {
    try{ return typeof money === 'function' ? money(v) : num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł'; }
    catch(_){ return num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł'; }
  };
  const percentFmt = v => `${num(v).toFixed(1).replace('.',',')}%`;

  function toast(message, type='ok'){
    if(typeof window.piToast === 'function') return window.piToast(message, type);
    const box = document.createElement('div');
    box.className = 'pi-toast pi-toast-'+type;
    box.textContent = message;
    document.body.appendChild(box);
    setTimeout(()=>box.remove(),3200);
  }

  function dateValue(row){ return row?.payment_date || row?.expense_date || row?.date || row?.created_at || row?.updated_at || ''; }
  function ymd(row){ return String(dateValue(row) || '').slice(0,10); }
  function ym(row){
    try{
      const period=window.PureInvestPaymentPeriod;
      if(period?.isPaymentRow?.(row)) return period.actualMonth?.(row) || String(dateValue(row) || '').slice(0,7);
    }catch(_){ }
    return String(dateValue(row) || '').slice(0,7);
  }
  function yyyy(row){ return String(ym(row) || '').slice(0,4); }
  function currentMonth(){ return new Date().toISOString().slice(0,7); }
  function currentYear(){ return String(new Date().getFullYear()); }
  function monthKey(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
  function monthDate(key){ const [y,m] = String(key || currentMonth()).split('-').map(Number); return new Date(y || new Date().getFullYear(), (m || 1)-1, 1); }
  function addMonths(key, delta){ const d = monthDate(key); d.setMonth(d.getMonth()+delta); return monthKey(d); }
  function monthLabel(key){ const [y,m] = String(key || '').split('-'); const idx = Number(m)-1; return `${MONTHS_SHORT[idx] || m} ${String(y || '').slice(-2)}`; }
  function periodLabel(config){
    if(config.period === 'month'){
      const [y,m] = String(config.month || currentMonth()).split('-');
      return `${MONTHS[Number(m)-1] || m} ${y}`;
    }
    if(config.period === 'year') return `rok ${config.year || currentYear()}`;
    return 'cała historia';
  }
  function periodMonthCount(config){ if(config.period === 'month') return 1; if(config.period === 'year') return 12; return 0; }

  function propertiesFromState(){
    try{ if(Array.isArray(loadedProperties) && loadedProperties.length) return loadedProperties; }catch(_){ }
    if(Array.isArray(window.loadedProperties) && window.loadedProperties.length) return window.loadedProperties;
    return [];
  }
  async function loadProperties(){
    const existing = propertiesFromState();
    if(existing.length) return existing;
    const client = dbClient();
    if(!client) return [];
    const {data,error} = await client.from('properties').select('*').order('created_at',{ascending:false});
    if(error) throw error;
    try{ loadedProperties = data || []; }catch(_){ }
    window.loadedProperties = data || [];
    return data || [];
  }
  async function loadTransactions(){
    const client = dbClient();
    if(!client) return {payments:[], expenses:[]};
    const [pRes,eRes] = await Promise.all([
      client.from('payments').select('*').order('created_at',{ascending:false}),
      client.from('expenses').select('*').order('created_at',{ascending:false})
    ]);
    if(pRes.error) throw pRes.error;
    if(eRes.error) throw eRes.error;
    return {
      payments: (pRes.data || []).filter(x=>!x.is_deleted && !x.deleted_at),
      expenses: (eRes.data || []).filter(x=>!x.is_deleted && !x.deleted_at)
    };
  }
  function filterPeriod(rows, config){
    if(config.period === 'month') return rows.filter(row => ym(row) === config.month);
    if(config.period === 'year') return rows.filter(row => yyyy(row) === String(config.year));
    return rows.slice();
  }
  function filterScope(rows, config){
    if(config.type === 'portfolio') return rows.slice();
    if(!config.propertyId) return [];
    return rows.filter(row => String(row.property_id || '') === String(config.propertyId));
  }
  function sourceLabel(row, type){
    if(type === 'payment') return row.source || row.category || row.payment_type || row.settlement_component || 'Wpłata';
    return row.category || row.vendor || row.settlement_component || 'Koszt';
  }
  function propertyName(p){ return p?.name || p?.address || 'Wybrana nieruchomość'; }
  function propertyLine(p){ return [p?.postal_code, p?.city, p?.address].filter(Boolean).join(' · ') || 'Brak pełnego adresu'; }
  function calcReportTax(rows, options={}){
    const paymentRows = Array.isArray(rows) ? rows : [];
    const config = options.config || {};
    const property = options.property || null;
    const properties = Array.isArray(options.properties) ? options.properties : [];
    try{
      if(config.type === 'portfolio' && properties.length){
        const total = properties.reduce((sum, p)=>{
          const pid = String(p?.id ?? '');
          const scoped = paymentRows.filter(row => String(row?.property_id ?? row?.propertyId ?? '') === pid);
          if(!scoped.length) return sum;
          if(typeof window.piCalcTenantRentTax === 'function') return sum + num(window.piCalcTenantRentTax(scoped, {property:p}));
          const base = typeof window.piTaxBaseFromPaymentRows === 'function'
            ? num(window.piTaxBaseFromPaymentRows(scoped, {property:p}))
            : scoped.reduce((acc,row)=>acc + num(row?.amount), 0);
          const tax = typeof window.calcTax === 'function' ? num(window.calcTax(base)) : Math.round(base * 0.085 * 100) / 100;
          return sum + tax;
        }, 0);
        return Math.round(total * 100) / 100;
      }
      if(typeof window.piCalcTenantRentTax === 'function') return num(window.piCalcTenantRentTax(paymentRows, {property}));
      const base = typeof window.piTaxBaseFromPaymentRows === 'function'
        ? num(window.piTaxBaseFromPaymentRows(paymentRows, {property}))
        : paymentRows.reduce((acc,row)=>acc + num(row?.amount), 0);
      return typeof window.calcTax === 'function' ? num(window.calcTax(base)) : Math.round(base * 0.085 * 100) / 100;
    }catch(_){
      return 0;
    }
  }
  function reportFixedSettlementRows(property){
    const p = property || {};
    const normalizeComponent = value => {
      const raw = String(value || '').trim().toLowerCase();
      if(raw === 'owner_rent') return 'owner';
      if(raw === 'media') return 'other';
      if(['owner','community','electricity','gas','water','other','trash','garbage','waste','surcharge','adjustment','tax','insurance','renovation','service','deposit'].includes(raw)) return raw;
      return raw || 'other';
    };
    try{
      const items = (typeof window.piGetEffectiveSettlementItems === 'function'
        ? window.piGetEffectiveSettlementItems(p)
        : (window.piSettlementDictionary?.effectiveMonthlyItems ? window.piSettlementDictionary.effectiveMonthlyItems(p) : [])) || [];
      const rows = items.filter(item => item && item.active !== false && item.recurring === 'monthly' && item.tenant_due !== false && item.payer !== 'owner')
        .map(item => ({
          kind: item.kind === 'income' ? 'income' : 'expense',
          component: normalizeComponent(item.component || item.settlement_component || item.id || item.name),
          label: item.name || item.label || item.category || item.source || 'Stała pozycja',
          amount: num(item.default_amount ?? item.amount ?? item.monthly_amount)
        }))
        .filter(row => row.amount > 0.009);
      if(rows.length) return rows;
    }catch(_){ }
    const rows = [];
    const add = (kind, component, label, value)=>{ const amount = num(value); if(amount > 0.009) rows.push({kind, component, label, amount}); };
    add('income','owner','Najem właścicielski', p.owner_rent ?? p.owner_monthly_rent ?? p.monthly_rent ?? p.rent ?? 0);
    add('expense','community','Czynsz administracyjny', p.community_rent);
    add('expense','electricity','Prąd', p.electricity_expected);
    add('expense','gas','Gaz', p.gas_expected);
    add('expense','water','Woda', p.water_expected);
    add('expense','other','Pozostałe opłaty', p.other_expected ?? p.media_expected);
    const totalFromRentAmount = num(p.rent_amount);
    const known = rows.reduce((s,r)=>s+num(r.amount),0);
    if(totalFromRentAmount > known + 0.009) add('expense','other','Pozostałe opłaty', totalFromRentAmount - known);
    return rows;
  }
  function reportFixedExpenseRows(property){
    return reportFixedSettlementRows(property).filter(row => row.kind === 'expense' && !['owner','owner_rent','tax','insurance','renovation','service','deposit'].includes(String(row.component || '').toLowerCase()));
  }
  function reportExpenseComponent(row){
    try{
      const core = window.PureInvestFinanceCore || {};
      if(typeof core.component === 'function'){
        const comp = String(core.component(row, 'expense') || '').toLowerCase();
        if(comp) return comp === 'media' ? 'other' : (comp === 'owner_rent' ? 'owner' : comp);
      }
    }catch(_){ }
    const hard = String(row?.settlement_component || '').toLowerCase();
    if(hard) return hard === 'media' ? 'other' : (hard === 'owner_rent' ? 'owner' : hard);
    const txt = String([row?.category,row?.source,row?.vendor,row?.note,row?.name,row?.description].filter(Boolean).join(' ')).toLowerCase();
    if(/wspól|wspol|czynsz|administr|spółdziel|spoldziel/.test(txt)) return 'community';
    if(/prąd|prad|energia|enea|energa|tauron|pge/.test(txt)) return 'electricity';
    if(/gaz|pgnig/.test(txt)) return 'gas';
    if(/woda|wodoci/.test(txt)) return 'water';
    if(/śmieci|smieci|odpady|media|opłat|oplata|opłata/.test(txt)) return 'other';
    if(/remont|napraw|serwis|meble|wyposaż|wyposaz|inwestyc/.test(txt)) return 'renovation';
    return 'other';
  }
  function isReportTenantExpense(row){
    const comp = reportExpenseComponent(row);
    if(['owner','owner_rent','renovation','service','deposit','insurance','tax'].includes(comp)) return false;
    if(['community','electricity','gas','water','other','trash','garbage','waste','surcharge','adjustment'].includes(comp)) return true;
    return false;
  }
  function reportRowPropertyId(row){ return String(row?.property_id ?? row?.propertyId ?? ''); }
  function reportSameProperty(row, property){ return String(property?.id ?? '') && reportRowPropertyId(row) === String(property?.id ?? ''); }
  function reportPeriodKeys(config, payments=[], expenses=[]){
    if(config.period === 'month') return [config.month || currentMonth()];
    if(config.period === 'year') return Array.from({length:12}, (_,i)=>`${config.year || currentYear()}-${String(i+1).padStart(2,'0')}`);
    const found = Array.from(new Set([...(payments||[]).map(ym), ...(expenses||[]).map(ym)].filter(Boolean))).sort();
    return found.length ? found.slice(-12) : [currentMonth()];
  }
  function reportFirstMonthForProperty(property){
    const candidates = [property?.lease_start, property?.rent_start, property?.created_at, property?.purchase_date].filter(Boolean);
    for(const value of candidates){
      const d = new Date(value);
      if(Number.isFinite(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    }
    return '';
  }
  function reportPropertyActiveInMonth(property, key){
    const start = reportFirstMonthForProperty(property);
    return !start || String(key) >= start;
  }
  function reportVirtualFixedExpenseForMonth(property, key, allExpenses){
    if(!property || !reportPropertyActiveInMonth(property, key)) return 0;
    const actualRows = (allExpenses || []).filter(row => ym(row) === key && reportSameProperty(row, property) && isReportTenantExpense(row));
    return reportFixedExpenseRows(property).reduce((sum, fixed)=>{
      const comp = String(fixed.component || 'other').toLowerCase();
      const actual = actualRows.filter(row => reportExpenseComponent(row) === comp).reduce((s,row)=>s+num(row.amount),0);
      return sum + Math.max(0, num(fixed.amount) - actual);
    },0);
  }
  function reportVirtualFixedExpenseForPeriod(config, property, properties, allPayments, allExpenses){
    const props = config.type === 'portfolio' ? (properties || []) : (property ? [property] : []);
    const keys = reportPeriodKeys(config, allPayments || [], allExpenses || []);
    return props.reduce((sum, p)=> sum + keys.reduce((m,key)=>m + reportVirtualFixedExpenseForMonth(p, key, allExpenses), 0), 0);
  }
  function reportTitle(type){ if(type === 'portfolio') return 'Raport portfela'; if(type === 'owner') return 'Raport właścicielski'; return 'Raport nieruchomości'; }
  function expectedMonthlyProperty(p){
    if(!p) return 0;
    const rows = reportFixedSettlementRows(p);
    if(rows.length) return rows.reduce((s,row)=>s+num(row.amount),0);
    const owner = num(p.owner_rent || p.monthly_rent || p.rent_amount || p.rent || 0);
    const community = num(p.community_rent || 0);
    const electricity = num(p.electricity_expected || 0);
    const gas = num(p.gas_expected || 0);
    const water = num(p.water_expected || 0);
    return owner + community + electricity + gas + water;
  }
  function expectedFor(config, property, properties){
    const keys = reportPeriodKeys(config, [], []);
    if(!keys.length) return 0;
    if(config.type === 'portfolio'){
      return (properties || []).reduce((sum,p)=> sum + keys.filter(key=>reportPropertyActiveInMonth(p,key)).length * expectedMonthlyProperty(p), 0);
    }
    return keys.filter(key=>reportPropertyActiveInMonth(property,key)).length * expectedMonthlyProperty(property);
  }
  function groupByCategory(expenses){
    return expenses.reduce((acc,row)=>{
      const key = row.category || row.vendor || row.settlement_component || 'Inne';
      acc[key] = (acc[key] || 0) + num(row.amount);
      return acc;
    },{});
  }
  function buildTrendRows(config, payments, expenses){
    const Engine = window.PureInvestSettlementEngine;
    if(Engine && typeof Engine.monthly === 'function'){
      let keys = [];
      if(config.period === 'year') for(let i=1;i<=12;i++) keys.push(`${config.year || currentYear()}-${String(i).padStart(2,'0')}`);
      else if(config.period === 'month') for(let i=-5;i<=0;i++) keys.push(addMonths(config.month || currentMonth(), i));
      else{
        const scopedP0 = filterScope(payments, config), scopedE0 = filterScope(expenses, config);
        const found = Array.from(new Set([...scopedP0.map(ym), ...scopedE0.map(ym)].filter(Boolean))).sort();
        keys = found.length ? found.slice(-12) : Array.from({length:6},(_,i)=>addMonths(currentMonth(), i-5));
      }
      const props = config.type === 'portfolio' ? (config.__reportProperties || []) : (config.__reportProperty ? [config.__reportProperty] : []);
      if(props.length){
        return keys.map(key=>{
          const agg = Engine.aggregate(props, payments || [], expenses || [], [key], config);
          return {key, label: monthLabel(key), income:agg.income, expenses:agg.expensesTotal, fixedExpenses:agg.passThroughCosts, tax:agg.tax, balance:agg.netResult};
        });
      }
    }
    const scopedP = filterScope(payments, config);
    const scopedE = filterScope(expenses, config);
    let keys = [];
    if(config.period === 'year') for(let i=1;i<=12;i++) keys.push(`${config.year || currentYear()}-${String(i).padStart(2,'0')}`);
    else if(config.period === 'month') for(let i=-5;i<=0;i++) keys.push(addMonths(config.month || currentMonth(), i));
    else{
      const found = Array.from(new Set([...scopedP.map(ym), ...scopedE.map(ym)].filter(Boolean))).sort();
      keys = found.length ? found.slice(-12) : Array.from({length:6},(_,i)=>addMonths(currentMonth(), i-5));
    }
    return keys.map(key=>{
      const monthPayments = scopedP.filter(row=>ym(row)===key);
      const income = monthPayments.reduce((s,row)=>s+num(row.amount),0);
      const actualExpenses = scopedE.filter(row=>ym(row)===key).reduce((s,row)=>s+num(row.amount),0);
      const props = config.type === 'portfolio' ? (config.__reportProperties || []) : (config.__reportProperty ? [config.__reportProperty] : []);
      const virtualFixed = props.reduce((s,p)=>s + reportVirtualFixedExpenseForMonth(p, key, expenses), 0);
      const expensesTotal = actualExpenses + virtualFixed;
      const tax = calcReportTax(monthPayments, {config, property: config.type === 'property' ? (config.__reportProperty || null) : null, properties: config.__reportProperties || []});
      return {key, label: monthLabel(key), income, expenses: expensesTotal, fixedExpenses: virtualFixed, tax, balance: income-expensesTotal-tax};
    });
  }
  function buildConfig(){
    return {
      type: $('piReportType')?.value || 'property',
      propertyId: $('piReportProperty')?.value || '',
      period: $('piReportPeriod')?.value || 'month',
      month: $('piReportMonth')?.value || currentMonth(),
      year: $('piReportYear')?.value || currentYear(),
      includeTransactions: !!$('piReportIncludeTransactions')?.checked,
      includeCategories: !!$('piReportIncludeCategories')?.checked,
      includeCharts: $('piReportIncludeCharts') ? !!$('piReportIncludeCharts')?.checked : true,
      includeInsights: !!$('piReportIncludeInsights')?.checked,
      includeAiCommentary: $('piReportIncludeAICommentary') ? !!$('piReportIncludeAICommentary')?.checked : true,
      includeFooter: !!$('piReportIncludeFooter')?.checked,
      managerNote: ($('piReportManagerNote')?.value || '').trim(),
      marketTrend: ($('piReportMarketTrend')?.value || '').trim(),
      costTrend: ($('piReportCostTrend')?.value || '').trim(),
      marketSource: ($('piReportMarketSource')?.value || '').trim(),
      marketNote: ($('piReportMarketNote')?.value || '').trim(),
      marketRentPerM2: num($('piReportMarketRentPerM2')?.value || 0),
      marketSalePerM2: num($('piReportMarketSalePerM2')?.value || 0),
      marketRentYoY: num($('piReportMarketRentYoY')?.value || 0),
      marketPriceYoY: num($('piReportMarketPriceYoY')?.value || 0),
      marketUpdatedAt: ($('piReportMarketUpdatedAt')?.value || '').trim()
    };
  }
  function statusFor(report){
    if(report.arrears > 0) return {label:'Zaległość', cls:'danger', tone:'Wymaga kontaktu', text:'W raportowanym okresie widoczna jest różnica między oczekiwanymi wpływami a zaksięgowanymi wpłatami.'};
    if(report.balance < 0) return {label:'Wymaga uwagi', cls:'warn', tone:'Kontrola kosztów', text:'Wynik netto jest ujemny. Warto sprawdzić koszty, kompletność wpływów i charakter wydatków.'};
    if(report.income === 0 && report.expensesTotal > 0) return {label:'Do weryfikacji', cls:'warn', tone:'Brak wpływów', text:'W okresie są koszty, ale nie ma zaksięgowanych wpływów. To może być kwestia braku danych albo zaległości.'};
    if(report.paidLate) return {label:'Opłacone po terminie', cls:'warn', tone:'Terminowość do obserwacji', text:'Należność została uregulowana, ale faktyczna data wpływu była późniejsza niż termin płatności.'};
    return {label:'Stabilne', cls:'ok', tone:'Pod kontrolą', text:'Wynik jest dodatni, a raport nie wskazuje pilnej interwencji.'};
  }
  function completenessScore(property, config){
    if(config.type === 'portfolio') return 100;
    const checks = [property?.name, property?.address, expectedMonthlyProperty(property)>0, property?.tenant_name, property?.rent_due_day || property?.payment_day, property?.area_m2 || property?.area];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }
  function buildHealth(report){
    const rawPaymentDiscipline = report.expected > 0 ? (report.income / report.expected) * 100 : (report.income > 0 ? 100 : 0);
    // Właścicielsko pokazujemy maks. 100%. Nadpłata nie oznacza lepszej „dyscypliny”, tylko wpłatę ponad plan.
    const paymentDiscipline = clamp(rawPaymentDiscipline, 0, 100);
    const paymentOverage = report.expected > 0 ? Math.max(report.income - report.expected, 0) : 0;
    const costRatio = report.income > 0 ? (report.expensesTotal / report.income) * 100 : (report.expensesTotal > 0 ? 100 : 0);
    const categoryRows = Object.entries(report.categoryTotals).sort((a,b)=>b[1]-a[1]);
    const topShare = report.expensesTotal > 0 && categoryRows[0] ? (categoryRows[0][1] / report.expensesTotal) * 100 : 0;
    const positiveMonths = report.trendRows.filter(r=>r.balance >= 0 && (r.income || r.expenses)).length;
    const activeMonths = report.trendRows.filter(r=>r.income || r.expenses).length;
    const stability = activeMonths ? (positiveMonths / activeMonths) * 100 : (report.balance >= 0 ? 100 : 0);
    const dataQuality = completenessScore(report.property, report.config);
    let score = 100;
    if(report.arrears > 0) score -= clamp((report.arrears / Math.max(report.expected,1))*60, 15, 55);
    if(report.balance < 0) score -= 25;
    if(costRatio > 65) score -= 12;
    if(topShare > 60) score -= 8;
    if(dataQuality < 70) score -= 8;
    score = Math.round(clamp(score, 0, 100));
    return {score, paymentDiscipline, rawPaymentDiscipline, paymentOverage, costRatio, topShare, stability, dataQuality};
  }
  function buildForecast(report){
    const active = report.trendRows.filter(r=>r.income || r.expenses).slice(-3);
    const avgIncome = active.reduce((s,r)=>s+r.income,0) / Math.max(active.length,1);
    const avgExpenses = active.reduce((s,r)=>s+r.expenses,0) / Math.max(active.length,1);
    const avgBalance = avgIncome - avgExpenses;
    return {avgIncome, avgExpenses, avgBalance, next3: avgBalance*3, next12: avgBalance*12};
  }
  function ownerMonthlyRentValue(p){
    if(!p) return 0;
    return num(p.owner_rent || p.owner_monthly_rent || p.monthly_rent || p.rent_amount || p.rent || 0);
  }
  function propertyAreaValue(p){ return num(p?.area_m2 || p?.area || p?.surface_m2 || 0); }
  function propertyPurchaseValue(p){ return num(p?.purchase_price || p?.market_value || p?.estimated_value || p?.value || 0); }
  function pctFmtMaybe(value){ return Number.isFinite(value) ? percentFmt(value) : '—'; }
  function signedPct(value){
    if(!Number.isFinite(value)) return '—';
    return (value > 0 ? '+' : '') + percentFmt(value);
  }
  function numberMoneyMaybe(value){ return value && Number.isFinite(value) ? moneyFmt(value) : '—'; }
  function numberPerM2Maybe(value){ return value && Number.isFinite(value) ? moneyFmt(value).replace(' zł',' zł/m²') : '—'; }
  function buildMarketIntelligence(report){
    const c = report.config || {};
    const props = c.type === 'portfolio'
      ? (report.properties || [])
      : [report.property].filter(Boolean);
    const totalArea = props.reduce((s,p)=>s+propertyAreaValue(p),0);
    const ownerRentMonthly = props.reduce((s,p)=>s+ownerMonthlyRentValue(p),0);
    const expectedMonthly = props.reduce((s,p)=>s+expectedMonthlyProperty(p),0);
    const passThroughMonthly = Math.max(expectedMonthly - ownerRentMonthly, 0);
    const purchaseValue = props.reduce((s,p)=>s+propertyPurchaseValue(p),0);
    const currentRentM2 = totalArea > 0 ? ownerRentMonthly / totalArea : null;
    const marketRentM2 = num(c.marketRentPerM2 || 0) || null;
    const marketSaleM2 = num(c.marketSalePerM2 || 0) || null;
    const marketRentMonthly = marketRentM2 && totalArea ? marketRentM2 * totalArea : null;
    const marketRentMin = marketRentMonthly ? marketRentMonthly * 0.95 : null;
    const marketRentMax = marketRentMonthly ? marketRentMonthly * 1.05 : null;
    const rentDiffPct = marketRentM2 && currentRentM2 ? ((currentRentM2 - marketRentM2) / marketRentM2) * 100 : null;
    const marketValue = marketSaleM2 && totalArea ? marketSaleM2 * totalArea : null;
    const estimatedValue = marketValue || purchaseValue || null;
    const valueSource = marketValue ? 'średnia cena rynkowa × metraż' : (purchaseValue ? 'cena/wartość z karty nieruchomości' : 'brak wartości lokalu');
    const annualOwnerRent = ownerRentMonthly * 12;
    const grossYield = estimatedValue ? (annualOwnerRent / estimatedValue) * 100 : null;
    const netYieldAfterTax = estimatedValue ? ((annualOwnerRent * 0.915) / estimatedValue) * 100 : null;
    const marketGrossYield = estimatedValue && marketRentMonthly ? (marketRentMonthly * 12 / estimatedValue) * 100 : null;
    let rentStatus = 'Brak benchmarku';
    let rentTone = 'neutral';
    if(Number.isFinite(rentDiffPct)){
      if(rentDiffPct <= -10){ rentStatus = 'Poniżej rynku'; rentTone = 'negative'; }
      else if(rentDiffPct >= 10){ rentStatus = 'Powyżej rynku'; rentTone = 'warn'; }
      else { rentStatus = 'Rynkowo'; rentTone = 'positive'; }
    }
    const source = c.marketSource || (marketRentM2 || marketSaleM2 || c.marketRentYoY || c.marketPriceYoY ? 'Automatyczny Market Intelligence' : 'PureInvest OS — dane lokalu');
    const updatedAt = c.marketUpdatedAt ? new Date(c.marketUpdatedAt).toLocaleDateString('pl-PL') : 'brak daty aktualizacji';
    let conclusion = '';
    if(marketRentMonthly && Number.isFinite(rentDiffPct)){
      if(rentDiffPct <= -10) conclusion = `Aktualny najem jest około ${signedPct(rentDiffPct)} względem benchmarku. Przy aneksie lub zmianie najemcy warto rozważyć przedział ${moneyFmt(marketRentMin)}–${moneyFmt(marketRentMax)} miesięcznie, ale dopiero po uporządkowaniu ewentualnych zaległości.`;
      else if(rentDiffPct >= 10) conclusion = `Aktualna stawka jest około ${signedPct(rentDiffPct)} względem benchmarku. Priorytetem powinno być utrzymanie jakości najemcy i terminowości płatności, a nie automatyczne podnoszenie czynszu.`;
      else conclusion = `Aktualna stawka jest blisko benchmarku rynkowego. Najważniejsza dźwignia wyniku to kompletność płatności i kontrola kosztów właścicielskich.`;
    }else{
      conclusion = 'Automatyczne źródła nie zwróciły pełnego benchmarku zł/m². Raport pokazuje konkretne liczby z aplikacji i nie udaje precyzyjnej wyceny względem rynku.';
    }
    if(report.arrears > 0) conclusion += ` Dodatkowo raport wskazuje zaległość ${moneyFmt(report.arrears)}, więc działania windykacyjne mają wyższy priorytet niż sama zmiana stawki.`;
    const rows = [
      ['Aktualny najem właścicielski', moneyFmt(ownerRentMonthly), 'z konfiguracji lokalu / portfela'],
      ['Metraż analizowany', totalArea ? `${totalArea.toLocaleString('pl-PL',{maximumFractionDigits:2})} m²` : '—', 'potrzebny do porównania zł/m²'],
      ['Stawka lokalu', numberPerM2Maybe(currentRentM2), 'aktualny najem / m²'],
      ['Benchmark najmu', numberPerM2Maybe(marketRentM2), 'zewnętrzne dane rynkowe'],
      ['Szacowany najem rynkowy', marketRentMonthly ? `${moneyFmt(marketRentMin)}–${moneyFmt(marketRentMax)}` : '—', '±5% od benchmarku'],
      ['Opłaty zwrotne miesięczne', moneyFmt(passThroughMonthly), 'czynsz administracyjny/media przenoszone na najemcę'],
      ['Szacowana wartość', numberMoneyMaybe(estimatedValue), valueSource],
      ['Rentowność brutto', pctFmtMaybe(grossYield), 'roczny najem właścicielski / wartość'],
      ['Rentowność po podatku 8,5%', pctFmtMaybe(netYieldAfterTax), 'bez kosztów właścicielskich'],
      ['Zmiana najmu r/r', c.marketRentYoY ? signedPct(c.marketRentYoY) : '—', 'automatyczny wskaźnik rynkowy'],
      ['Zmiana cen mieszkań r/r', c.marketPriceYoY ? signedPct(c.marketPriceYoY) : '—', 'automatyczny wskaźnik rynkowy']
    ];
    return {
      totalArea, ownerRentMonthly, currentRentM2, marketRentM2, marketSaleM2, marketRentMonthly, marketRentMin, marketRentMax,
      rentDiffPct, rentStatus, rentTone, estimatedValue, valueSource, annualOwnerRent, grossYield, netYieldAfterTax, marketGrossYield,
      source, updatedAt, conclusion, rows,
      hasMarketNumbers: !!(marketRentM2 || marketSaleM2 || c.marketRentYoY || c.marketPriceYoY),
      note: c.marketNote || ''
    };
  }

  function renderMarketIntelligence(report){
    const mi = report.marketIntelligence || buildMarketIntelligence(report);
    if(!mi) return '';
    const c = report.config || {};
    const diff = Number.isFinite(mi.rentDiffPct) ? signedPct(mi.rentDiffPct) : '—';
    const marketRange = mi.marketRentMonthly ? `${moneyFmt(mi.marketRentMin)}–${moneyFmt(mi.marketRentMax)}` : '—';
    const cards = [
      ['Stawka lokalu', numberPerM2Maybe(mi.currentRentM2), mi.totalArea ? `${mi.totalArea.toLocaleString('pl-PL',{maximumFractionDigits:2})} m²` : 'brak metrażu', 'neutral'],
      ['Benchmark najmu', numberPerM2Maybe(mi.marketRentM2), mi.source, mi.marketRentM2 ? 'positive' : 'warn'],
      ['Różnica do rynku', diff, mi.rentStatus, mi.rentTone],
      ['Szacowany najem', marketRange, 'przedział miesięczny ±5%', mi.marketRentMonthly ? 'positive' : 'neutral'],
      ['Wartość lokalu', numberMoneyMaybe(mi.estimatedValue), mi.valueSource, mi.estimatedValue ? 'positive' : 'warn'],
      ['Rentowność brutto', pctFmtMaybe(mi.grossYield), 'roczny najem / wartość', mi.grossYield ? 'positive' : 'neutral']
    ];
    return `<section class="pi-report-v2-section pi-report-market-intelligence">
      <div class="pi-report-v2-section-title">
        <h4>Market Intelligence — dane rynkowe i ocena stawki</h4>
        <p>Konkretne wskaźniki dla właściciela: stawka za m², benchmark, szacowany najem, wartość i rentowność.</p>
      </div>
      <div class="pi-report-market-meta"><span>Źródło: ${esc(mi.source)}</span><span>Aktualizacja: ${esc(mi.updatedAt)}</span><span>Zakres: ${esc(c.type === 'portfolio' ? 'portfel' : propertyName(report.property))}</span></div>
      <div class="pi-report-market-cards">${cards.map(([label,value,hint,tone])=>`<div class="${esc(tone)}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></div>`).join('')}</div>
      <div class="pi-report-market-table">${mi.rows.map(([label,value,hint])=>`<div><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(hint)}</small></div>`).join('')}</div>
      <div class="pi-report-market-conclusion ${esc(mi.rentTone)}"><b>${esc(mi.rentStatus)}</b><p>${esc(mi.conclusion)}</p>${mi.note?`<small>${esc(mi.note)}</small>`:''}</div>
    </section>`;
  }


  function isFixedPassThroughCategory(name){
    const s = String(name || '').toLowerCase();
    return s.includes('czynsz administracyjny') || s.includes('czynsz do wspólnoty') || s.includes('wspólnot') || s.includes('opłaty zwrotne') || s.includes('opłata zwrotna');
  }
  function buildRecommendations(report){
    const categoryRows = Object.entries(report.categoryTotals).sort((a,b)=>b[1]-a[1]);
    const actionableTop = categoryRows.find(([name,value]) => value > 0 && !isFixedPassThroughCategory(name));
    const rec = [];
    rec.push({type:'Pilne', title: report.arrears > 0 ? 'Zweryfikuj zaległość' : 'Brak pilnej interwencji', text: report.arrears > 0 ? `Skontaktuj się z najemcą i potwierdź płatność. Szacowana zaległość wynosi ${moneyFmt(report.arrears)}.` : 'Nie widać krytycznych zaległości. Wystarczy standardowa kontrola płatności i dokumentów.'});
    rec.push({type:'Finanse', title: report.balance < 0 ? 'Przejrzyj wynik i wpływy' : 'Utrzymaj kontrolę marży', text: report.balance < 0 ? 'Wynik netto jest ujemny — w pierwszej kolejności sprawdź kompletność wpłat i koszty właścicielskie, a nie stałe opłaty przenoszone na najemcę.' : `Wynik netto wynosi ${moneyFmt(report.balance)}. W kolejnym okresie warto porównać trend i kompletność wpłat.`});
    if(actionableTop){
      rec.push({type:'Koszty właściciela', title:'Sprawdź koszt do decyzji', text:`Największy koszt wymagający decyzji właściciela to „${actionableTop[0]}” (${moneyFmt(actionableTop[1])}). Oceń, czy można go ograniczyć albo lepiej zaplanować.`});
    }
    if(report.health.score < 65) rec.push({type:'Ryzyko', title:'Podnieś priorytet kontroli', text:'Ocena zdrowia finansowego jest obniżona. Warto przejść po płatnościach, kosztach właścicielskich i danych nieruchomości.'});
    return rec;
  }

  function classifyAiRisk(report){
    const h = report.health || {};
    if(report.arrears > 0 || report.balance < 0 || (h.score || 100) < 65) return {label:'Podwyższone ryzyko', cls:'negative', short:'wymaga reakcji'};
    if((h.costRatio || 0) > 55 || (h.score || 100) < 80) return {label:'Umiarkowane ryzyko', cls:'warn', short:'do obserwacji'};
    return {label:'Niskie ryzyko', cls:'positive', short:'stabilnie'};
  }

  function describeMarketTrend(config){
    const rent = config.marketTrend || '';
    const cost = config.costTrend || '';
    const parts = [];
    if(rent) parts.push(`trend najmu: ${rent}`);
    if(cost) parts.push(`trend kosztów: ${cost}`);
    return parts.length ? parts.join(' · ') : 'brak zewnętrznych danych rynkowych — komentarz oparty głównie o dane PureInvest OS';
  }

  function buildAiCommentary(report){
    const c = report.config || {};
    const risk = classifyAiRisk(report);
    const scope = c.type === 'portfolio' ? `portfela ${report.countProperties || 0} nieruchomości` : `lokalu ${propertyName(report.property)}`;
    const top = Object.entries(report.categoryTotals || {}).sort((a,b)=>b[1]-a[1])[0];
    const h = report.health || {};
    const f = report.forecast || {};
    const expectedLabel = report.expected ? moneyFmt(report.expected) : 'brak pełnej konfiguracji oczekiwanych wpływów';
    const trendLine = describeMarketTrend(c);
    const mi = report.marketIntelligence || buildMarketIntelligence(report);
    const evidence = [
      `Wpływy: ${moneyFmt(report.income)}; koszty: ${moneyFmt(report.expensesTotal)}; wynik netto: ${moneyFmt(report.balance)}.`,
      report.expected ? `Oczekiwane wpływy w okresie: ${expectedLabel}; zaległość: ${moneyFmt(report.arrears)}.` : `Oczekiwane wpływy: ${expectedLabel}.`,
      top ? (isFixedPassThroughCategory(top[0]) ? `Największa pozycja to stała opłata zwrotna: ${top[0]} (${moneyFmt(top[1])}).` : `Największa kategoria kosztowa: ${top[0]} (${moneyFmt(top[1])}).`) : 'Brak kosztów do rozbicia na kategorie.',
      `Ocena zdrowia finansowego: ${h.score || 0}/100; udział kosztów: ${percentFmt(h.costRatio || 0)}.`,
      `Stawka lokalu: ${numberPerM2Maybe(mi.currentRentM2)}; benchmark najmu: ${numberPerM2Maybe(mi.marketRentM2)}; różnica: ${Number.isFinite(mi.rentDiffPct) ? signedPct(mi.rentDiffPct) : 'brak benchmarku'}.`
    ];

    const paragraphs = [];
    const monthLabel = periodLabel(c);
    const rentDiffText = Number.isFinite(mi.rentDiffPct) ? signedPct(mi.rentDiffPct) : '';
    const currentRateText = numberPerM2Maybe(mi.currentRentM2);
    const marketRateText = numberPerM2Maybe(mi.marketRentM2);
    if(report.arrears > 0){
      paragraphs.push(`W ${monthLabel} lokal wymaga reakcji przede wszystkim z powodu zaległości ${moneyFmt(report.arrears)}. To najważniejsza sprawa do domknięcia, bo bez pełnej wpłaty wynik z najmu będzie wyglądał słabo niezależnie od tego, że sama stawka najmu jest ustawiona poprawnie.`);
      paragraphs.push(`Warto oddzielić w komunikacji dwie rzeczy: najem właścicielski oraz opłaty przenoszone na najemcę. Czynsz administracyjny i media nie są kosztem do „optymalizacji”, tylko elementem miesięcznego rozliczenia, który powinien zostać opłacony razem z należnością za lokal.`);
    }else if(report.balance < 0){
      paragraphs.push(`W ${monthLabel} lokal zamyka się wynikiem ${moneyFmt(report.balance)}. Nie wygląda to jak problem rynkowej stawki, tylko jak sygnał do sprawdzenia, czy wszystkie wpływy i koszty zostały poprawnie przypisane do właściwego miesiąca.`);
      paragraphs.push(`Najpierw warto uporządkować rozliczenie miesiąca, a dopiero później wyciągać wnioski inwestycyjne. Pojedynczy gorszy okres nie musi oznaczać problemu z lokalem, ale powinien być jasno opisany właścicielowi.`);
    }else if(report.paidLate){
      paragraphs.push(`W ${monthLabel} należność została ostatecznie rozliczona w całości, ale wpłata dotarła po terminie. Finansowo miesiąc jest zamknięty, natomiast terminowość warto obserwować przy kolejnych płatnościach.`);
      paragraphs.push(`Dobra wiadomość jest taka, że zaległość nie pozostaje otwarta. W historii zachowujemy jednocześnie faktyczną datę wpływu oraz miesiąc, którego dotyczyła wpłata, więc raport nie wymaga przesuwania daty bankowej.`);
    }else{
      paragraphs.push(`W ${monthLabel} rozliczenie lokalu wygląda stabilnie. Wpływy pokrywają bieżący miesiąc, a raport nie pokazuje pilnego problemu, który wymagałby natychmiastowej decyzji właściciela.`);
      paragraphs.push(`Najważniejsze jest utrzymanie regularnej kontroli płatności i kosztów stałych. Przy takim układzie lokal można traktować jako spokojnie pracujący składnik portfela.`);
    }

    if(mi.hasMarketNumbers){
      if(Number.isFinite(mi.rentDiffPct) && mi.rentDiffPct > 10 && report.arrears > 0){
        paragraphs.push(`Rynkowo stawka wygląda dobrze: obecnie ${currentRateText}, przy benchmarku ${marketRateText}, czyli około ${rentDiffText} względem modelu. Nie rekomendowałbym teraz automatycznego podnoszenia czynszu — najpierw trzeba uporządkować zaległość i potwierdzić stabilność najemcy.`);
      }else if(Number.isFinite(mi.rentDiffPct) && mi.rentDiffPct < -8){
        paragraphs.push(`Na tle benchmarku stawka wygląda ostrożnie: obecnie ${currentRateText}, przy punkcie odniesienia ${marketRateText}. Przy kolejnym aneksie albo zmianie najemcy warto sprawdzić, czy lokal nie może pracować na wyższym czynszu.`);
      }else{
        paragraphs.push(`Na tle rynku stawka wygląda rozsądnie: obecnie ${currentRateText}, przy benchmarku ${marketRateText}. To oznacza, że decyzje powinny dotyczyć głównie jakości rozliczeń i najemcy, a nie gwałtownej zmiany ceny.`);
      }
    }else if(c.marketNote || c.marketTrend || c.costTrend){
      paragraphs.push(`Dostępny kontekst rynkowy traktujemy jako tło: ${[c.marketNote, trendLine].filter(Boolean).join(' · ')}. Bez pełnego benchmarku zł/m² raport nie powinien sugerować konkretnej zmiany czynszu.`);
    }else{
      paragraphs.push(`W tej wersji komentarz bazuje głównie na danych lokalu i rozliczeń. Wniosek właścicielski powinien więc koncentrować się na płatnościach, kosztach i porządku dokumentów, a nie na deklaratywnej ocenie rynku.`);
    }

    const actions = [];
    const actionableTop = top && !isFixedPassThroughCategory(top[0]) ? top : null;
    if(report.arrears > 0) actions.push(`Wysłać krótkie przypomnienie do najemcy i wskazać kwotę do uregulowania: ${moneyFmt(report.arrears)}.`);
    if(report.paidLate && report.arrears <= 0) actions.push('Przy kolejnej płatności sprawdzić terminowość. Ten miesiąc jest rozliczony, ale wpłata wpłynęła po terminie.');
    if(report.arrears > 0) actions.push('Rozdzielić w wiadomości najem właścicielski, czynsz administracyjny i media, żeby nie było wątpliwości, czego dotyczy zaległość.');
    if(actionableTop && report.expensesTotal > 0) actions.push(`Sprawdzić koszt „${actionableTop[0]}”, bo to realna pozycja właścicielska, a nie opłata przenoszona na najemcę.`);
    if((f.avgBalance || 0) < 0) actions.push('Porównać bieżący miesiąc z poprzednimi, żeby sprawdzić, czy to jednorazowe odchylenie, czy powtarzalny problem.');
    if(!actions.length) actions.push('Zostawić lokal w standardowej kontroli i wrócić do analizy przy kolejnym miesięcznym rozliczeniu.');
    actions.push('Zmianę stawki najmu rozważać dopiero przy aneksie lub zmianie najemcy, po uporządkowaniu płatności.');

    return {
      risk,
      source: c.marketSource || (c.marketTrend || c.costTrend || c.marketNote ? 'Dane lokalu PureInvest OS + automatyczny kontekst rynkowy' : 'Dane lokalu i rozliczeń z PureInvest OS'),
      marketLine: trendLine,
      evidence,
      paragraphs,
      actions: actions.slice(0,4)
    };
  }

  function renderAiCommentary(report){
    const ai = report.aiCommentary;
    if(!ai) return '';
    return `<section class="pi-report-v2-section pi-report-ai-section">
      <div class="pi-report-v2-section-title">
        <h4>Komentarz AI PRO</h4>
        <p>Krótki komentarz dla właściciela lub zarządcy — z naciskiem na to, co naprawdę wymaga uwagi i co warto zrobić dalej.</p>
      </div>
      <div class="pi-report-ai-body">
        <div class="pi-report-ai-text">${ai.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</div>
      </div>
      <div class="pi-report-ai-actions">
        <h5>Co warto zrobić teraz</h5>
        ${ai.actions.map((x,i)=>`<div><b>${i+1}</b><span>${esc(x)}</span></div>`).join('')}
      </div>
    </section>`;
  }

  function autoNote(report){
    const name = report.config.type === 'portfolio' ? `Portfel obejmujący ${report.countProperties} nieruchomości` : propertyName(report.property);
    const f = report.forecast;
    const trend = f.avgBalance >= 0 ? `Średni ostatni wynik miesięczny jest dodatni i wynosi około ${moneyFmt(f.avgBalance)}.` : `Średni ostatni wynik miesięczny jest ujemny i wynosi około ${moneyFmt(f.avgBalance)}.`;
    if(report.health.score >= 75 && report.balance >= 0 && report.arrears <= 0) return `${name} w okresie ${periodLabel(report.config)} wygląda stabilnie. Raport wskazuje dodatni wynik netto, dobrą kontrolę wpływów i brak pilnych zaległości. ${trend}`;
    return `${name} w okresie ${periodLabel(report.config)} wymaga dokładniejszej kontroli. Najważniejsze obszary to płatności, poziom kosztów oraz kompletność danych. ${trend}`;
  }

  const MARKET_AUTO_CACHE_KEY = 'pureinvest_market_intelligence_auto_v1';
  const MARKET_AUTO_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  function marketAutoPropClean(p){
    if(!p) return null;
    return {
      id:p.id, name:p.name, address:p.address, city:p.city, postal_code:p.postal_code,
      area_m2:p.area_m2 || p.area || p.size_m2,
      owner_rent:p.owner_rent || p.monthly_rent || p.rent_amount,
      market_value:p.market_value, purchase_price:p.purchase_price
    };
  }
  function marketAutoScopeKey(config, properties, property){
    if(config?.type === 'portfolio'){
      return 'portfolio:' + (properties||[]).map(p=>String(p.id||p.name||p.address||'')).sort().join('|');
    }
    const p = property || {};
    return 'property:' + String(p.id || config?.propertyId || p.name || p.address || 'current');
  }
  function marketAutoReadCache(key){
    try{
      const raw = localStorage.getItem(MARKET_AUTO_CACHE_KEY);
      const all = raw ? JSON.parse(raw) : {};
      const item = all[key];
      if(!item || !item.savedAt || !item.data) return null;
      if(Date.now() - new Date(item.savedAt).getTime() > MARKET_AUTO_TTL_MS) return null;
      return item.data;
    }catch(_){ return null; }
  }
  function marketAutoWriteCache(key, data){
    try{
      const raw = localStorage.getItem(MARKET_AUTO_CACHE_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[key] = {savedAt:new Date().toISOString(), data};
      localStorage.setItem(MARKET_AUTO_CACHE_KEY, JSON.stringify(all));
    }catch(_){ }
  }
  function marketAutoSetField(id, value){
    const node = $(id);
    if(!node) return;
    if(node.tagName === 'SELECT'){
      const v = String(value || '');
      if([...node.options].some(o=>o.value === v)) node.value = v;
      else node.value = '';
    }else node.value = value ?? '';
  }
  function marketAutoApply(data){
    if(!data) return;
    marketAutoSetField('piReportMarketTrend', data.marketTrend || '');
    marketAutoSetField('piReportCostTrend', data.costTrend || '');
    marketAutoSetField('piReportMarketSource', data.marketSource || '');
    marketAutoSetField('piReportMarketRentPerM2', data.marketRentPerM2 || '');
    marketAutoSetField('piReportMarketSalePerM2', data.marketSalePerM2 || '');
    marketAutoSetField('piReportMarketRentYoY', data.marketRentYoY || '');
    marketAutoSetField('piReportMarketPriceYoY', data.marketPriceYoY || '');
    marketAutoSetField('piReportMarketUpdatedAt', data.marketUpdatedAt || '');
    marketAutoSetField('piReportMarketNote', data.marketNote || '');
    const status = $('piMarketIntelligenceAutoStatus');
    if(status){
      status.dataset.type = data.marketRentPerM2 || data.marketSalePerM2 ? 'success' : 'warn';
      status.textContent = data.marketRentPerM2 || data.marketSalePerM2
        ? `Dane automatyczne: ${data.city || 'rynek'} · ${data.reliability || 'snapshot'} · aktualizacja ${data.marketUpdatedAt || '—'}`
        : 'Nie udało się pobrać pełnych danych rynkowych. Raport używa danych lokalu i oznacza benchmark jako orientacyjny.';
    }
    const preview = $('piMarketIntelligenceAutoPreview');
    if(preview){
      const fmt = v => v ? Number(v).toLocaleString('pl-PL',{maximumFractionDigits:2}) : '—';
      preview.innerHTML = `<div><span>Najem rynkowy</span><b>${fmt(data.marketRentPerM2)} zł/m²</b></div><div><span>Cena mieszkań</span><b>${fmt(data.marketSalePerM2)} zł/m²</b></div><div><span>Najem r/r</span><b>${data.marketRentYoY ? (data.marketRentYoY>0?'+':'')+fmt(data.marketRentYoY)+'%' : '—'}</b></div><div><span>Ceny r/r</span><b>${data.marketPriceYoY ? (data.marketPriceYoY>0?'+':'')+fmt(data.marketPriceYoY)+'%' : '—'}</b></div>`;
    }
  }
  async function marketAutoFetch(config, properties, property){
    const payload = {
      type: config?.type || 'property',
      property: marketAutoPropClean(property),
      properties: config?.type === 'portfolio' ? (properties||[]).map(marketAutoPropClean).filter(Boolean) : [],
      city: property?.city || property?.address || ''
    };
    const headers = typeof window.piAuthHeadersV760 === 'function'
      ? await window.piAuthHeadersV760({'Content-Type':'application/json'})
      : {'Content-Type':'application/json'};
    const res = await fetch('/.netlify/functions/market-intelligence', {
      method:'POST',
      headers,
      body:JSON.stringify(payload)
    });
    const body = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź Market Intelligence.'}));
    if(!res.ok || !body.ok || !body.data) throw new Error(body.message || 'Nie udało się pobrać danych rynkowych.');
    return body.data;
  }
  async function ensureAutoMarketIntelligence(config, properties, property, force=false){
    const key = marketAutoScopeKey(config, properties, property);
    if(!force){
      const cached = marketAutoReadCache(key);
      if(cached){ marketAutoApply(cached); Object.assign(config, cached); return cached; }
    }
    const status = $('piMarketIntelligenceAutoStatus');
    if(status){ status.dataset.type='loading'; status.textContent='Pobieram dane rynkowe automatycznie...'; }
    try{
      const data = await marketAutoFetch(config, properties, property);
      marketAutoWriteCache(key, data);
      marketAutoApply(data);
      Object.assign(config, data);
      return data;
    }catch(e){
      const cached = marketAutoReadCache(key);
      if(cached){ marketAutoApply(cached); Object.assign(config, cached); return cached; }
      if(status){ status.dataset.type='warn'; status.textContent='Automatyczne źródła nie odpowiedziały. Raport nie będzie udawał danych rynkowych.'; }
      return null;
    }
  }
  window.piMarketIntelligenceSync = async function(force){
    const config = buildConfig();
    const properties = await loadProperties();
    if(!config.propertyId && config.type !== 'portfolio' && properties[0]) config.propertyId = properties[0].id;
    const property = properties.find(p=>String(p.id)===String(config.propertyId)) || null;
    await ensureAutoMarketIntelligence(config, properties, property, !!force);
    if(typeof window.piReportsRefresh === 'function') await window.piReportsRefresh(false);
  };
  async function buildReport(){
    const config = buildConfig();
    const [properties, tx] = await Promise.all([loadProperties(), loadTransactions()]);
    if(!config.propertyId && config.type !== 'portfolio' && properties[0]) config.propertyId = properties[0].id;
    const property = properties.find(p => String(p.id) === String(config.propertyId)) || null;
    await ensureAutoMarketIntelligence(config, properties, property, false);
    const scopedPayments = filterPeriod(filterScope(tx.payments, config), config);
    const scopedExpenses = filterPeriod(filterScope(tx.expenses, config), config);
    const Engine = window.PureInvestSettlementEngine;
    const reportProps = config.type === 'portfolio' ? properties : (property ? [property] : []);
    const periodKeys = reportPeriodKeys(config, tx.payments, tx.expenses);
    let settlement = null;
    if(Engine && typeof Engine.aggregate === 'function' && reportProps.length){
      settlement = Engine.aggregate(reportProps, tx.payments, tx.expenses, periodKeys, config);
    }
    const actualExpensesTotal = scopedExpenses.reduce((s,r)=>s+num(r.amount),0);
    const virtualFixedExpensesTotal = settlement ? Math.max(0, num(settlement.expensesTotal) - actualExpensesTotal) : reportVirtualFixedExpenseForPeriod(config, property, properties, tx.payments, tx.expenses);
    const income = settlement ? num(settlement.income) : scopedPayments.reduce((s,r)=>s+num(r.amount),0);
    const expensesTotal = settlement ? num(settlement.expensesTotal) : actualExpensesTotal + virtualFixedExpensesTotal;
    const taxTotal = settlement ? num(settlement.tax) : calcReportTax(scopedPayments, {config, property, properties});
    const balance = settlement ? num(settlement.netResult) : income-expensesTotal-taxTotal;
    const expected = settlement ? num(settlement.expected) : expectedFor(config, property, properties);
    const arrears = settlement ? num(settlement.arrears) : (expected > 0 ? Math.max(expected-income,0) : 0);
    const categoryTotals = settlement ? (settlement.categoryTotals || {}) : groupByCategory(scopedExpenses);
    const trendRows = buildTrendRows({...config, __reportProperty: property, __reportProperties: properties}, tx.payments, tx.expenses);
    const propertyBalances = properties.map(p=>{
      const c = {...config, type:'property', propertyId:p.id};
      const agg = Engine && typeof Engine.aggregate === 'function' ? Engine.aggregate([p], tx.payments, tx.expenses, periodKeys, c) : null;
      if(agg) return {property:p, income:agg.income, expenses:agg.expensesTotal, fixedExpenses:agg.passThroughCosts, tax:agg.tax, balance:agg.netResult, arrears:agg.arrears, expected:agg.expected};
      const pp = filterPeriod(tx.payments.filter(x=>String(x.property_id)===String(p.id)), config).reduce((s,x)=>s+num(x.amount),0);
      const actualEe = filterPeriod(tx.expenses.filter(x=>String(x.property_id)===String(p.id)), config).reduce((s,x)=>s+num(x.amount),0);
      const fixedEe = reportVirtualFixedExpenseForPeriod(c, p, properties, tx.payments, tx.expenses);
      const ee = actualEe + fixedEe;
      const exp = expectedFor(c,p,properties);
      const propertyPayments = filterPeriod(tx.payments.filter(x=>String(x.property_id)===String(p.id)), config);
      const propertyTax = calcReportTax(propertyPayments, {config:{...config, type:'property'}, property:p, properties});
      return {property:p, income:pp, expenses:ee, fixedExpenses:fixedEe, tax:propertyTax, balance:pp-ee-propertyTax, arrears: exp>0 ? Math.max(exp-pp,0) : 0, expected:exp};
    }).sort((a,b)=>b.balance-a.balance);
    const paidLate = !!(settlement && Array.isArray(settlement.snapshots) && settlement.snapshots.some(s=>s && s.paidLate));
    const report = {config, properties, property, payments:scopedPayments, expenses:scopedExpenses, income, actualExpensesTotal, virtualFixedExpensesTotal, expensesTotal, taxTotal, balance, expected, arrears, paidLate, categoryTotals, trendRows, propertyBalances, settlement, countProperties:properties.length};
    report.status = statusFor(report);
    report.health = buildHealth(report);
    report.forecast = buildForecast(report);
    report.marketIntelligence = buildMarketIntelligence(report);
    report.note = config.managerNote || autoNote(report);
    report.recommendations = buildRecommendations(report);
    report.aiCommentary = config.includeAiCommentary ? buildAiCommentary(report) : null;
    return report;
  }

  function metricCard(label, value, hint, tone='neutral'){
    return `<div class="pi-report-v2-metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${hint?`<small>${esc(hint)}</small>`:''}</div>`;
  }
  function signalCard(label, value, hint, tone='neutral'){
    return `<div class="pi-report-v2-signal ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></div>`;
  }
  function maxVal(rows, keys){ return Math.max(1, ...rows.flatMap(row=>keys.map(k=>Math.abs(num(row[k]))))); }
  function renderComboChart(report){
    const rows = (report.trendRows || []).slice(-12);
    if(!rows.length) return `<div class="reports-pro-empty">Brak danych do trendu finansowego.</div>`;
    const active = rows.filter(r => num(r.income) || num(r.expenses) || num(r.balance));
    const scored = active.length ? active : rows;
    const best = scored.reduce((a,b)=>num(b.balance) > num(a.balance) ? b : a, scored[0]);
    const worst = scored.reduce((a,b)=>num(b.balance) < num(a.balance) ? b : a, scored[0]);
    const positiveMonths = scored.filter(r=>num(r.balance) >= 0 && (num(r.income) || num(r.expenses))).length;
    const max = Math.max(1, ...rows.flatMap(r=>[Math.abs(num(r.income)), Math.abs(num(r.expenses)), Math.abs(num(r.balance))]));
    const avg = report.forecast?.avgBalance ?? 0;
    return `<div class="pi-report-v2-chart-card wide pi-report-v2-trend-premium">
      <div class="pi-report-v2-chart-head pi-trend-premium-head">
        <div><h5>Trend finansowy</h5><p>Prestiżowe podsumowanie miesięcy: wpływy, koszty i wynik właściciela.</p></div>
        <b class="${avg < 0 ? 'is-negative' : 'is-positive'}">${esc(moneyFmt(avg))}<small>średni wynik</small></b>
      </div>
      <div class="pi-trend-premium-summary">
        <div><span>Najlepszy miesiąc</span><strong class="${num(best.balance)<0?'is-negative':'is-positive'}">${esc(moneyFmt(best.balance))}</strong><small>${esc(best.label || '—')}</small></div>
        <div><span>Najsłabszy miesiąc</span><strong class="${num(worst.balance)<0?'is-negative':'is-positive'}">${esc(moneyFmt(worst.balance))}</strong><small>${esc(worst.label || '—')}</small></div>
        <div><span>Miesiące dodatnie</span><strong>${esc(String(positiveMonths))}/${esc(String(scored.length || rows.length))}</strong><small>w analizowanym okresie</small></div>
      </div>
      <div class="pi-trend-premium-ledger">
        ${rows.map(r=>{
          const incomeW = Math.max(num(r.income) > 0 ? 5 : 0, Math.round(Math.abs(num(r.income))/max*100));
          const expenseW = Math.max(num(r.expenses) > 0 ? 5 : 0, Math.round(Math.abs(num(r.expenses))/max*100));
          const balanceW = Math.max(Math.abs(num(r.balance)) > 0 ? 5 : 0, Math.round(Math.abs(num(r.balance))/max*100));
          const balanceClass = num(r.balance) < 0 ? 'negative' : 'positive';
          return `<div class="pi-trend-premium-row ${balanceClass}">
            <div class="pi-trend-premium-month"><b>${esc(r.label)}</b><small>${esc(moneyFmt(r.balance))}</small></div>
            <div class="pi-trend-premium-lines">
              <div><span>Wpływy</span><i><em class="income" style="width:${incomeW}%"></em></i><strong>${esc(moneyFmt(r.income))}</strong></div>
              <div><span>Koszty</span><i><em class="expense" style="width:${expenseW}%"></em></i><strong>${esc(moneyFmt(r.expenses))}</strong></div>
              <div><span>Netto</span><i><em class="net ${balanceClass}" style="width:${balanceW}%"></em></i><strong class="${num(r.balance)<0?'is-negative':'is-positive'}">${esc(moneyFmt(r.balance))}</strong></div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="pi-report-v2-legend pi-trend-premium-legend"><span><i class="income"></i>Wpływy</span><span><i class="expense"></i>Koszty</span><span><i class="net"></i>Wynik netto</span></div>
    </div>`;
  }
  function renderCostDonut(report){
    const rows = Object.entries(report.categoryTotals).sort((a,b)=>b[1]-a[1]).slice(0,6);
    if(!rows.length) return `<div class="pi-report-v2-chart-card"><div class="reports-pro-empty">Brak kosztów do analizy struktury.</div></div>`;
    const total = rows.reduce((s,x)=>s+x[1],0) || 1;
    let start = 0;
    const stops = rows.map(([,value], i)=>{ const deg = value/total*360; const str = `var(--pi-rp-c${(i%6)+1}) ${start}deg ${start+deg}deg`; start += deg; return str; }).join(',');
    return `<div class="pi-report-v2-chart-card"><div class="pi-report-v2-chart-head"><div><h5>Struktura kosztów</h5><p>Największe kategorie i ich udział.</p></div></div><div class="pi-report-v2-donut-wrap"><div class="pi-report-v2-donut" style="background:conic-gradient(${stops})"><span>${esc(percentFmt(report.health.topShare))}<small>największa pozycja</small></span></div><div class="pi-report-v2-donut-list">${rows.map(([name,value],i)=>`<div><i style="background:var(--pi-rp-c${(i%6)+1})"></i><span>${esc(name)}</span><b>${esc(moneyFmt(value))}</b></div>`).join('')}</div></div></div>`;
  }
  function renderWaterfall(report){
    const max = Math.max(1, report.expected, report.income, report.expensesTotal, Math.abs(report.balance));
    const items = [
      ['Oczekiwane', report.expected, 'neutral'],
      ['Wpłacone', report.income, 'positive'],
      ['Koszty', report.expensesTotal, 'negative'],
      ['Netto', report.balance, report.balance<0?'negative':'positive']
    ];
    return `<div class="pi-report-v2-chart-card"><div class="pi-report-v2-chart-head"><div><h5>Most finansowy</h5><p>Od oczekiwanych wpływów do wyniku netto.</p></div></div><div class="pi-report-v2-waterfall">${items.map(([label,value,tone])=>`<div><span>${esc(label)}</span><i class="${tone}" style="height:${Math.max(8,Math.round(Math.abs(value)/max*100))}%"></i><b class="${value<0?'is-negative':'is-positive'}">${esc(moneyFmt(value))}</b></div>`).join('')}</div></div>`;
  }
  function renderPortfolioMatrix(report){
    if(report.config.type !== 'portfolio') return '';
    const rows = report.propertyBalances.slice(0,12);
    if(!rows.length) return '';
    return `<section class="pi-report-v2-section"><div class="pi-report-v2-section-title"><h4>Mapa portfela</h4><p>Ranking mieszkań według wyniku, wpływów i zaległości.</p></div><div class="pi-report-v2-matrix"><div class="head"><span>Nieruchomość</span><span>Wpływy</span><span>Koszty</span><span>Netto</span><span>Zaległość</span></div>${rows.map((r,i)=>`<div><span><b>${i+1}. ${esc(propertyName(r.property))}</b><small>${esc(propertyLine(r.property))}</small></span><span>${esc(moneyFmt(r.income))}</span><span>${esc(moneyFmt(r.expenses))}</span><strong class="${r.balance<0?'is-negative':'is-positive'}">${esc(moneyFmt(r.balance))}</strong><strong class="${r.arrears>0?'is-negative':'is-positive'}">${esc(moneyFmt(r.arrears))}</strong></div>`).join('')}</div></section>`;
  }
  function renderActionPlan(report){
    return `<section class="pi-report-v2-section pi-report-v2-actions"><div class="pi-report-v2-section-title"><h4>Plan działań PureInvest</h4><p>Priorytety na kolejny okres: pilne, finansowe i inwestycyjne.</p></div><div class="pi-report-v2-action-grid">${report.recommendations.map(r=>`<div><span>${esc(r.type)}</span><h5>${esc(r.title)}</h5><p>${esc(r.text)}</p></div>`).join('')}</div></section>`;
  }
  function renderActionPlanPanel(report){
    const rows = Array.isArray(report.recommendations) ? report.recommendations.slice(0,4) : [];
    if(!rows.length) return '';
    return `<aside class="pi-report-v2-action-panel">
      <div class="pi-report-v2-action-panel-head"><span>Plan działań</span><b>PureInvest</b><small>Priorytety na kolejny okres</small></div>
      <div class="pi-report-v2-action-panel-list">${rows.map((r,i)=>`<div><em>${i+1}</em><section><span>${esc(r.type)}</span><h5>${esc(r.title)}</h5><p>${esc(r.text)}</p></section></div>`).join('')}</div>
    </aside>`;
  }
  function renderTransactions(report){
    const rows = [
      ...report.payments.map(row=>({kind:'Wpływ', date:ymd(row), label:sourceLabel(row,'payment'), amount:num(row.amount), note:row.note||''})),
      ...report.expenses.map(row=>({kind:'Koszt', date:ymd(row), label:sourceLabel(row,'expense'), amount:-num(row.amount), note:row.note||''}))
    ].sort((a,b)=>String(a.date).localeCompare(String(b.date)) || a.kind.localeCompare(b.kind));
    if(!rows.length) return `<div class="reports-pro-empty">Brak transakcji w wybranym okresie.</div>`;
    return `<div class="pi-report-v2-table"><div class="head"><span>Data</span><span>Typ</span><span>Opis</span><span>Kwota</span></div>${rows.slice(0,100).map(r=>`<div><span>${esc(r.date||'—')}</span><span>${esc(r.kind)}</span><span><b>${esc(r.label)}</b>${r.note?`<small>${esc(r.note)}</small>`:''}</span><strong class="${r.amount<0?'is-negative':'is-positive'}">${esc(moneyFmt(r.amount))}</strong></div>`).join('')}</div>${rows.length>100?`<p class="pi-report-v2-muted">Pokazano 100 z ${rows.length} transakcji. Pełny zakres można wyeksportować do CSV.</p>`:''}`;
  }
  function renderCategoryTable(report){
    const rows = Object.entries(report.categoryTotals).sort((a,b)=>b[1]-a[1]);
    if(!rows.length) return `<div class="reports-pro-empty">Brak kosztów do pogrupowania.</div>`;
    return `<div class="pi-report-v2-category-list">${rows.map(([name,total])=>`<div><span>${esc(name)}</span><b>${esc(moneyFmt(total))}</b><em>${esc(percentFmt(report.expensesTotal?total/report.expensesTotal*100:0))}</em></div>`).join('')}</div>`;
  }
  function renderReport(report){
    const c = report.config;
    const scope = c.type === 'portfolio' ? 'Wszystkie nieruchomości' : propertyName(report.property);
    const context = `${reportTitle(c.type)} · ${scope} · ${periodLabel(c)}`;
    const ctx = $('piReportsContext'); if(ctx) ctx.textContent = context;
    const statusEl = $('piReportsStatus'); if(statusEl) statusEl.textContent = report.status.label;
    const target = $('reports'); if(!target) return;
    const margin = report.income ? report.balance / report.income * 100 : 0;
    const h = report.health;
    const ownerLabel = c.type === 'portfolio' ? `${report.countProperties} nieruchomości` : propertyLine(report.property);
    target.innerHTML = `<article class="reports-pro-document pi-report-v2-doc">
      <header class="pi-report-v2-cover">
        <div class="pi-report-v2-cover-top"><span>PureInvest</span><b>${esc(REPORT_VERSION)}</b></div>
        <div class="pi-report-v2-cover-main"><div><p>Raport zarządczy</p><h3>${esc(reportTitle(c.type))}</h3><strong>${esc(scope)}</strong><small>${esc(ownerLabel)}</small></div><aside><span>Okres</span><b>${esc(periodLabel(c))}</b><span>Status</span><b class="status-${report.status.cls}">${esc(report.status.label)}</b><span>Wygenerowano</span><b>${esc(new Date().toLocaleDateString('pl-PL'))}</b></aside></div>
      </header>
      <section class="pi-report-v2-exec"><div><span>Podsumowanie dla właściciela</span><p>${esc(report.note)}</p></div><aside><b>${esc(report.status.tone)}</b><small>${esc(report.status.text)}</small></aside></section>
      <section class="pi-report-v2-metrics">
        ${metricCard('Przychody', moneyFmt(report.income), periodLabel(c), 'positive')}
        ${metricCard('Koszty', moneyFmt(report.expensesTotal), 'wydatki zaksięgowane', report.expensesTotal>report.income?'negative':'neutral')}
        ${metricCard('Wynik netto', moneyFmt(report.balance), percentFmt(margin)+' marży netto', report.balance<0?'negative':'positive')}
        ${metricCard('Zaległości', moneyFmt(report.arrears), report.expected?'względem oczekiwanych wpływów':'brak danych oczekiwanych', report.arrears>0?'negative':'positive')}
        ${metricCard('Prognoza 3 mies.', moneyFmt(report.forecast.next3), 'na bazie ostatnich danych', report.forecast.next3<0?'negative':'positive')}
        ${metricCard('Oczekiwane wpływy', report.expected?moneyFmt(report.expected):'—', 'wg konfiguracji nieruchomości', 'neutral')}
      </section>
      <section class="pi-report-v2-signals">
        ${signalCard('Ocena zdrowia', `${h.score}/100`, 'łączna kondycja okresu', h.score<65?'negative':h.score<80?'warn':'positive')}
        ${signalCard('Pokrycie płatności', percentFmt(h.paymentDiscipline), h.paymentOverage > 0 ? `nadpłata ${moneyFmt(h.paymentOverage)}` : 'wpływy / oczekiwane wpływy', h.paymentDiscipline<85?'negative':h.paymentDiscipline<100?'warn':'positive')}
        ${signalCard('Udział kosztów', percentFmt(h.costRatio), 'koszty / przychody', h.costRatio>70?'negative':h.costRatio>45?'warn':'positive')}
        ${signalCard('Jakość danych', `${h.dataQuality}/100`, 'kompletność danych do raportu', h.dataQuality<70?'warn':'positive')}
      </section>
      ${c.includeAiCommentary ? renderAiCommentary(report) : ''}
      ${c.includeCharts?`<section class="pi-report-v2-section"><div class="pi-report-v2-section-title"><h4>Panel analityczny</h4><p>Trend finansowy i najważniejsze działania dla właściciela.</p></div><div class="pi-report-v2-chart-grid pi-report-v2-chart-grid-with-actions">${renderComboChart(report)}${c.includeInsights?renderActionPlanPanel(report):''}</div></section>`:''}
      ${renderPortfolioMatrix(report)}
      ${c.includeTransactions?`<section class="pi-report-v2-section"><div class="pi-report-v2-section-title"><h4>Rejestr transakcji</h4><p>Wpływy i koszty z analizowanego okresu.</p></div>${renderTransactions(report)}</section>`:''}
      ${c.includeFooter?`<footer class="pi-report-v2-footer"><b>PureInvest</b><span>Raport wygenerowany automatycznie w systemie PureInvest. Dane pochodzą z zapisanych transakcji i konfiguracji nieruchomości. Wnioski są materiałem pomocniczym do decyzji zarządczych.</span></footer>`:''}
    </article>`;
  }
  async function refreshReports(showToast=false){
    const status = $('piReportsStatus'); if(status) status.textContent = 'Ładowanie...';
    try{
      const report = await buildReport();
      window.piLastReportsPro = report;
      renderReport(report);
      if(showToast) toast('Raport PRO v2 został odświeżony.');
    }catch(error){
      console.error(error);
      const target = $('reports'); if(target) target.innerHTML = `<div class="reports-pro-error">Nie udało się przygotować raportu v2: ${esc(error.message || error)}</div>`;
      if(status) status.textContent = 'Błąd';
    }finally{ const st=$('piReportsStatus'); if(st && st.textContent==='Ładowanie...') st.textContent='Gotowe'; }
  }
  function togglePeriod(){
    const period = $('piReportPeriod')?.value || 'month';
    $('piReportMonthWrap')?.classList.toggle('hidden', period !== 'month');
    $('piReportYearWrap')?.classList.toggle('hidden', period !== 'year');
  }
  async function initReports(){
    const month = $('piReportMonth'); if(month && !month.value) month.value = currentMonth();
    const year = $('piReportYear'); if(year && !year.value) year.value = currentYear();
    togglePeriod();
    try{
      const properties = await loadProperties();
      const select = $('piReportProperty');
      if(select){
        const current = select.value;
        const activeId = window.activeProperty || window.activePropertyData?.id || (typeof activeProperty !== 'undefined' ? activeProperty : '') || '';
        select.innerHTML = properties.map(p=>`<option value="${esc(p.id)}">${esc(propertyName(p))}</option>`).join('');
        if(current && properties.some(p=>String(p.id)===String(current))) select.value=current;
        else if(activeId && properties.some(p=>String(p.id)===String(activeId))) select.value=activeId;
      }
      await refreshReports(false);
      renderHistory();
    }catch(e){ console.error(e); const target=$('reports'); if(target) target.innerHTML = `<div class="reports-pro-error">Nie udało się załadować raportów v2: ${esc(e.message || e)}</div>`; }
  }
  function getHistory(){ try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');}catch(_){return [];} }
  function renderHistory(){
    const box = $('piReportsHistory'); if(!box) return;
    const rows = getHistory().slice(0,12);
    if(!rows.length){ box.innerHTML = '<div class="reports-pro-empty">Historia raportów pojawi się po wygenerowaniu PDF albo CSV.</div>'; return; }
    box.innerHTML = rows.map(r=>`<div class="reports-pro-history-row"><div><b>${esc(r.type||'Raport')}</b><small>${esc(r.scope||'—')} · ${esc(r.period||'—')} · ${esc(r.date||'—')}</small></div><strong>${esc(moneyFmt(r.balance||0))}</strong></div>`).join('');
  }
  async function exportCsv(){
    try{
      const report = window.piLastReportsPro || await buildReport();
      const rows = [
        ['PureInvest — raport właścicielski'], ['Typ raportu', reportTitle(report.config.type)], ['Zakres', report.config.type==='portfolio'?'Wszystkie nieruchomości':propertyName(report.property)], ['Okres', periodLabel(report.config)], ['Przychody', String(report.income).replace('.',',')], ['Koszty', String(report.expensesTotal).replace('.',',')], ['Wynik netto', String(report.balance).replace('.',',')], ['Zaległości', String(report.arrears).replace('.',',')], ['Ocena zdrowia', report.health.score+'/100'], [], ['Data','Typ','Opis','Kwota']
      ];
      report.payments.forEach(row=>rows.push([ymd(row),'Wpływ',sourceLabel(row,'payment'),String(num(row.amount)).replace('.',',')]));
      report.expenses.forEach(row=>rows.push([ymd(row),'Koszt',sourceLabel(row,'expense'),String(-num(row.amount)).replace('.',',')]));
      const csv = '\ufeff' + rows.map(row=>row.map(cell=>`"${String(cell??'').replace(/"/g,'""')}"`).join(';')).join('\n');
      const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
      const link = document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=`PureInvest_raport_PRO_v2_${Date.now()}.csv`; document.body.appendChild(link); link.click(); link.remove();
      toast('Eksport CSV PRO v2 został przygotowany.');
    }catch(error){ console.error(error); toast('Nie udało się przygotować CSV: '+(error.message||error),'error'); }
  }
  window.piReportsRefresh = refreshReports;
  window.piReportsInit = initReports;
  window.piReportsTogglePeriod = togglePeriod;
  window.piReportsExportCsv = exportCsv;

  function hookSwitchTabV2(){
    const old = window.switchTab;
    if(typeof old !== 'function' || old.__piReportsV2Hooked) return;
    window.switchTab = function(tab, navEl){
      const res = old.apply(this, arguments);
      if(tab === 'reports') setTimeout(()=>window.piReportsInit && window.piReportsInit(),180);
      return res;
    };
    window.switchTab.__piReportsV2Hooked = true;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    hookSwitchTabV2();
    if($('tab-reports')?.classList.contains('active')) setTimeout(initReports,180);
  });
  setTimeout(hookSwitchTabV2,700);
})();

/* === PureInvest OS PDF Unicode exporter - pdfMake ===
   Cel: koniec problemów z polskimi znakami w raportach PDF.
   Nie używamy już Helvetica/jsPDF text ani awaryjnego renderowania HTML jako obrazu.
   PDF jest generowany przez pdfMake z wbudowanym fontem Roboto VFS, który obsługuje ą ć ę ł ń ó ś ź ż. */
(function(){
  if(window.__PI_PDF_UNICODE_151__) return;
  window.__PI_PDF_UNICODE_151__ = true;

  const CDN_PDFMAKE = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js';
  const CDN_VFS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js';

  function $(id){ return document.getElementById(id); }
  function num(v){ const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }
  function moneyFmt(v){
    try{ return typeof window.money === 'function' ? window.money(v) : num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' zł'; }
    catch(_){ return num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' zł'; }
  }
  function percentFmt(v){ return `${num(v).toFixed(1).replace('.', ',')}%`; }
  function ymd(row){ return String(row?.payment_date || row?.expense_date || row?.date || row?.created_at || row?.updated_at || '').slice(0,10) || '—'; }
  function safeText(v){ return String(v ?? '—'); }
  function propertyName(p){ return p?.name || p?.address || 'Wybrana nieruchomość'; }
  function propertyLine(p){ return [p?.postal_code, p?.city, p?.address].filter(Boolean).join(' · ') || 'Brak pełnego adresu'; }
  function sourceLabel(row, type){
    if(type === 'payment') return row?.source || row?.category || row?.payment_type || row?.settlement_component || 'Wpłata';
    return row?.category || row?.vendor || row?.settlement_component || 'Koszt';
  }
  function reportTitle(type){
    if(type === 'portfolio') return 'Raport portfela';
    if(type === 'owner') return 'Raport właścicielski';
    return 'Raport nieruchomości';
  }
  function periodLabel(config){
    const months = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
    if(config?.period === 'month'){
      const [y,m] = String(config.month || new Date().toISOString().slice(0,7)).split('-');
      return `${months[Number(m)-1] || m} ${y}`;
    }
    if(config?.period === 'year') return `rok ${config.year || new Date().getFullYear()}`;
    return 'cała historia';
  }
  function toast(message, type='ok'){
    try{ if(typeof window.piToast === 'function') return window.piToast(message, type); }catch(_){ }
    try{ if(typeof window.toast === 'function') return window.toast(message, type); }catch(_){ }
    console.log('[PureInvest PDF]', message);
  }

  function loadScript(src, testFn){
    return new Promise((resolve, reject)=>{
      try{ if(testFn && testFn()) return resolve(true); }catch(_){ }
      const existing = Array.from(document.scripts).find(s=>s.src === src || s.dataset.piPdfUnicodeSrc === src);
      if(existing){
        existing.addEventListener('load', ()=>resolve(true), {once:true});
        existing.addEventListener('error', ()=>reject(new Error('Nie udało się załadować biblioteki PDF.')), {once:true});
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.piPdfUnicodeSrc = src;
      s.onload = ()=>resolve(true);
      s.onerror = ()=>reject(new Error('Nie udało się załadować biblioteki PDF.'));
      document.head.appendChild(s);
    });
  }
  async function ensurePdfMake(){
    await loadScript(CDN_PDFMAKE, ()=>!!window.pdfMake);
    await loadScript(CDN_VFS, ()=>!!window.pdfMake?.vfs);
    if(!window.pdfMake || !window.pdfMake.vfs) throw new Error('Biblioteka PDF nie została załadowana poprawnie.');
    return window.pdfMake;
  }

  function safePdfName(report){
    const scope = report?.config?.type === 'portfolio' ? 'portfel' : propertyName(report?.property);
    const base = `PureInvest Raport PRO ${scope} ${periodLabel(report?.config)}`;
    return base.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,'_').slice(0,120) + '.pdf';
  }
  function ownerScope(report){
    if(report?.config?.type === 'portfolio') return `${report?.countProperties || report?.properties?.length || 0} nieruchomości`;
    return propertyLine(report?.property);
  }
  function barLine(label, value, max, color){
    const width = Math.max(4, Math.round(Math.abs(num(value)) / Math.max(max,1) * 190));
    return {
      columns:[
        {width:74, text:safeText(label), fontSize:8, color:'#5f554b', margin:[0,2,0,0]},
        {width:200, canvas:[{type:'rect', x:0, y:4, w:190, h:8, r:4, color:'#f1e6d9'}, {type:'rect', x:0, y:4, w:width, h:8, r:4, color}]},
        {width:'*', text:moneyFmt(value), fontSize:8, bold:true, alignment:'right', color:num(value)<0?'#b42318':'#1f2937', margin:[0,2,0,0]}
      ],
      margin:[0,2,0,2]
    };
  }
  function kpi(label, value, hint, tone){
    const fill = tone === 'negative' ? '#fff1f1' : tone === 'positive' ? '#eefaf2' : '#fffaf4';
    const color = tone === 'negative' ? '#9f1239' : tone === 'positive' ? '#166534' : '#8a3f15';
    return {fillColor:fill, margin:[0,0,0,0], stack:[
      {text:label, color:'#6b6258', fontSize:8, bold:true, margin:[0,0,0,4]},
      {text:value, color, fontSize:15, bold:true},
      {text:hint || '—', color:'#70665d', fontSize:7, margin:[0,4,0,0]}
    ]};
  }
  function sectionTitle(title, subtitle){
    return {stack:[{text:title, fontSize:13, bold:true, color:'#171717'}, subtitle ? {text:subtitle, fontSize:8, color:'#6b6258', margin:[0,2,0,0]} : null].filter(Boolean), margin:[0,18,0,8]};
  }
  function buildTrendTable(report){
    const rows = (report.trendRows || []).slice(-12);
    if(!rows.length) return [{text:'Brak danych do trendu.', color:'#6b6258', fontSize:9}];
    const max = Math.max(1, ...rows.flatMap(r=>[Math.abs(num(r.income)), Math.abs(num(r.expenses)), Math.abs(num(r.balance))]));
    return [
      {text:'Trend miesięczny', fontSize:11, bold:true, margin:[0,0,0,6]},
      ...rows.map(r=>barLine(r.label || r.key, num(r.balance), max, num(r.balance)<0?'#dc2626':'#d66f22')),
      {table:{headerRows:1, widths:['*','auto','auto','auto'], body:[
        [{text:'Miesiąc', style:'tableHead'}, {text:'Wpływy', style:'tableHead'}, {text:'Koszty', style:'tableHead'}, {text:'Wynik', style:'tableHead'}],
        ...rows.map(r=>[safeText(r.label || r.key), moneyFmt(r.income), moneyFmt(r.expenses), {text:moneyFmt(r.balance), bold:true, color:num(r.balance)<0?'#b42318':'#166534'}])
      ]}, layout:'lightHorizontalLines', margin:[0,8,0,0]}
    ];
  }
  function buildMarketIntelligencePdf(report){
    const mi = report.marketIntelligence || buildMarketIntelligence(report);
    if(!mi) return [];
    const rows = [
      ['Stawka lokalu', numberPerM2Maybe(mi.currentRentM2), 'aktualny najem / m²'],
      ['Benchmark najmu', numberPerM2Maybe(mi.marketRentM2), mi.source],
      ['Różnica do rynku', Number.isFinite(mi.rentDiffPct) ? signedPct(mi.rentDiffPct) : '—', mi.rentStatus],
      ['Szacowany najem', mi.marketRentMonthly ? `${moneyFmt(mi.marketRentMin)}–${moneyFmt(mi.marketRentMax)}` : '—', 'przedział miesięczny ±5%'],
      ['Wartość lokalu', numberMoneyMaybe(mi.estimatedValue), mi.valueSource],
      ['Rentowność brutto', pctFmtMaybe(mi.grossYield), 'roczny najem / wartość'],
      ['Rentowność po podatku 8,5%', pctFmtMaybe(mi.netYieldAfterTax), 'bez kosztów właścicielskich'],
      ['Zmiana najmu r/r', report.config?.marketRentYoY ? signedPct(report.config.marketRentYoY) : '—', 'automatyczny wskaźnik rynkowy'],
      ['Zmiana cen r/r', report.config?.marketPriceYoY ? signedPct(report.config.marketPriceYoY) : '—', 'automatyczny wskaźnik rynkowy']
    ];
    return [sectionTitle('Market Intelligence', `Źródło: ${mi.source}; aktualizacja: ${mi.updatedAt}`),
      {table:{headerRows:1, widths:['*','auto','*'], body:[
        [{text:'Wskaźnik', style:'tableHead'}, {text:'Wartość', style:'tableHead'}, {text:'Komentarz', style:'tableHead'}],
        ...rows.map(r=>[safeText(r[0]), {text:safeText(r[1]), bold:true}, safeText(r[2])])
      ]}, layout:'lightHorizontalLines'},
      {text:safeText(`${mi.rentStatus}: ${mi.conclusion}`), color: mi.rentTone === 'negative' ? '#b42318' : mi.rentTone === 'positive' ? '#166534' : '#7c2d12', fontSize:9, margin:[0,8,0,0]}
    ];
  }

  function buildCostStructure(report){
    const rows = Object.entries(report.categoryTotals || {}).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if(!rows.length) return [{text:'Brak kosztów do rozbicia według kategorii.', color:'#6b6258', fontSize:9}];
    const max = Math.max(1, ...rows.map(r=>Math.abs(num(r[1]))));
    return [
      {text:'Struktura kosztów', fontSize:11, bold:true, margin:[0,0,0,6]},
      ...rows.map(([name,total])=>barLine(name, total, max, '#a16207')),
      {table:{headerRows:1, widths:['*','auto','auto'], body:[
        [{text:'Kategoria', style:'tableHead'}, {text:'Kwota', style:'tableHead'}, {text:'Udział', style:'tableHead'}],
        ...rows.map(([name,total])=>[safeText(name), moneyFmt(total), percentFmt(report.expensesTotal ? total/report.expensesTotal*100 : 0)])
      ]}, layout:'lightHorizontalLines', margin:[0,8,0,0]}
    ];
  }
  function buildPortfolioRanking(report){
    const rows = (report.propertyBalances || []).slice(0,8);
    if(!rows.length) return [];
    return [sectionTitle('Ranking portfela', 'Saldo nieruchomości w wybranym okresie.'), {
      table:{headerRows:1, widths:[20,'*','auto','auto','auto'], body:[
        [{text:'#', style:'tableHead'}, {text:'Nieruchomość', style:'tableHead'}, {text:'Wpływy', style:'tableHead'}, {text:'Koszty', style:'tableHead'}, {text:'Saldo', style:'tableHead'}],
        ...rows.map((r,i)=>[String(i+1), {text:propertyName(r.property), bold:true}, moneyFmt(r.income), moneyFmt(r.expenses), {text:moneyFmt(r.balance), bold:true, color:num(r.balance)<0?'#b42318':'#166534'}])
      ]}, layout:'lightHorizontalLines'
    }];
  }
  function buildActionPlan(report){
    const rows = Array.isArray(report.recommendations) ? report.recommendations : [];
    if(!rows.length) return [];
    return [sectionTitle('Plan działań PureInvest', 'Najważniejsze rekomendacje na kolejny okres.'), {
      table:{widths:['auto','*'], body: rows.map(r=>[
        {text:safeText(r.type), bold:true, color:'#d66f22', margin:[0,3,0,3]},
        {stack:[{text:safeText(r.title), bold:true, color:'#171717'}, {text:safeText(r.text), color:'#5f554b', fontSize:9, margin:[0,2,0,0]}], margin:[0,3,0,3]}
      ])}, layout:{hLineColor:()=> '#eadfce', vLineColor:()=> '#eadfce', paddingLeft:()=>8, paddingRight:()=>8, paddingTop:()=>6, paddingBottom:()=>6}
    }];
  }
  function buildTransactions(report){
    const rows = [
      ...(report.payments || []).map(row=>({date:ymd(row), type:'Wpływ', desc:sourceLabel(row,'payment'), amount:num(row.amount)})),
      ...(report.expenses || []).map(row=>({date:ymd(row), type:'Koszt', desc:sourceLabel(row,'expense'), amount:-num(row.amount)}))
    ].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,70);
    if(!rows.length) return [];
    return [sectionTitle('Rejestr transakcji', 'Wpływy i koszty ujęte w raporcie.'), {
      table:{headerRows:1, widths:['auto','auto','*','auto'], body:[
        [{text:'Data', style:'tableHead'}, {text:'Typ', style:'tableHead'}, {text:'Opis', style:'tableHead'}, {text:'Kwota', style:'tableHead'}],
        ...rows.map(r=>[r.date, r.type, safeText(r.desc), {text:moneyFmt(r.amount), bold:true, color:r.amount<0?'#b42318':'#166534'}])
      ]}, layout:'lightHorizontalLines'
    }];
  }
  function buildDocDefinition(report){
    const cfg = report.config || {};
    const margin = report.income ? report.balance / report.income * 100 : 0;
    const health = report.health || {};
    const scope = cfg.type === 'portfolio' ? 'Wszystkie nieruchomości' : propertyName(report.property);
    const content = [
      {columns:[
        {width:'*', stack:[{text:'PureInvest', fontSize:13, bold:true, color:'#d66f22'}, {text:'Raport zarządczy', fontSize:8, color:'#6b6258', margin:[0,2,0,10]}, {text:reportTitle(cfg.type), fontSize:25, bold:true, color:'#101010'}, {text:scope, fontSize:12, bold:true, color:'#2b2118', margin:[0,4,0,0]}, {text:ownerScope(report), fontSize:9, color:'#6b6258', margin:[0,3,0,0]}]},
        {width:150, table:{widths:['*'], body:[[ {stack:[{text:'Okres', style:'metaLabel'}, {text:periodLabel(cfg), style:'metaValue'}, {text:'Status', style:'metaLabel', margin:[0,9,0,0]}, {text:safeText(report.status?.label || '—'), style:'metaValue'}, {text:'Wygenerowano', style:'metaLabel', margin:[0,9,0,0]}, {text:new Date().toLocaleDateString('pl-PL'), style:'metaValue'}], fillColor:'#fff7ed', border:[false,false,false,false], margin:[10,10,10,10]} ]]}, layout:'noBorders'}
      ], margin:[0,0,0,18]},
      {table:{widths:['*'], body:[[ {stack:[{text:'Podsumowanie dla właściciela', fontSize:10, bold:true, color:'#8a3f15'}, {text:safeText(report.note), fontSize:10, color:'#2b2118', lineHeight:1.25, margin:[0,5,0,0]}, {text:safeText(report.status?.text || ''), fontSize:8, color:'#6b6258', margin:[0,6,0,0]}], fillColor:'#fffaf4', margin:[12,10,12,10]} ]]}, layout:{hLineColor:()=> '#eadfce', vLineColor:()=> '#eadfce'}},
      {margin:[0,14,0,0], table:{widths:['*','*','*'], body:[
        [kpi('Przychody', moneyFmt(report.income), periodLabel(cfg), 'positive'), kpi('Koszty', moneyFmt(report.expensesTotal), 'wydatki zaksięgowane', report.expensesTotal>report.income?'negative':'neutral'), kpi('Wynik netto', moneyFmt(report.balance), `${percentFmt(margin)} marży netto`, report.balance<0?'negative':'positive')],
        [kpi('Zaległości', moneyFmt(report.arrears), report.expected?'względem oczekiwanych wpływów':'brak danych oczekiwanych', report.arrears>0?'negative':'positive'), kpi('Prognoza 3 mies.', moneyFmt(report.forecast?.next3 || 0), 'na bazie ostatnich danych', (report.forecast?.next3 || 0)<0?'negative':'positive'), kpi('Ocena zdrowia', `${Math.round(num(health.score))}/100`, 'syntetyczna ocena raportu', num(health.score)<65?'negative':'positive')]
      ]}, layout:{hLineColor:()=> '#eadfce', vLineColor:()=> '#eadfce', paddingLeft:()=>8, paddingRight:()=>8, paddingTop:()=>8, paddingBottom:()=>8}},
      sectionTitle('Sygnały zarządcze', 'Ocena jakości danych, kosztów i płatności.'),
      {table:{widths:['*','*','*','*'], body:[[ 
        {text:[{text:'Pokrycie płatności\n', style:'signalLabel'}, {text:percentFmt(health.paymentDiscipline || 0), style:'signalValue'}, {text:`\n${num(health.paymentOverage) > 0 ? 'nadpłata ' + moneyFmt(health.paymentOverage) : 'wpływy / plan'}`, style:'signalHint'}]},
        {text:[{text:'Udział kosztów\n', style:'signalLabel'}, {text:percentFmt(health.costRatio || 0), style:'signalValue'}, {text:'\nw relacji do wpływów', style:'signalHint'}]},
        {text:[{text:'Stabilność miesięcy\n', style:'signalLabel'}, {text:percentFmt(health.stability || 0), style:'signalValue'}, {text:'\nmiesiące dodatnie', style:'signalHint'}]},
        {text:[{text:'Jakość danych\n', style:'signalLabel'}, {text:percentFmt(health.dataQuality || 0), style:'signalValue'}, {text:'\nkompletność karty', style:'signalHint'}]}
      ]]}, layout:{hLineColor:()=> '#eadfce', vLineColor:()=> '#eadfce', paddingLeft:()=>8, paddingRight:()=>8, paddingTop:()=>8, paddingBottom:()=>8}},
      ...(cfg.includeCharts !== false ? [
        sectionTitle('Panel analityczny', 'Trend finansowy: wpływy, koszty i wynik netto w czasie.'),
        {stack:buildTrendTable(report), margin:[0,0,0,12]}
      ] : [])
    ];
    content.push(...buildActionPlan(report));
    if(cfg.type === 'portfolio') content.push(...buildPortfolioRanking(report));
    content.push(...buildTransactions(report));
    if(cfg.includeFooter !== false){
      content.push({text:'Raport wygenerowany automatycznie w systemie PureInvest. Dane pochodzą z zapisanych transakcji i konfiguracji nieruchomości. Wnioski mają charakter pomocniczy i powinny być weryfikowane z dokumentami źródłowymi.', fontSize:8, color:'#7c7268', margin:[0,18,0,0]});
    }
    return {
      pageSize:'A4',
      pageMargins:[34,34,34,42],
      info:{title:`PureInvest - ${reportTitle(cfg.type)}`, author:'PureInvest'},
      defaultStyle:{font:'Roboto', fontSize:9, color:'#171717'},
      footer:function(currentPage,pageCount){ return {text:`PureInvest · Raport PRO v2 · ${currentPage}/${pageCount}`, alignment:'right', margin:[0,0,34,0], fontSize:7, color:'#8a8178'}; },
      content,
      styles:{
        metaLabel:{fontSize:7, color:'#7c7268', bold:true},
        metaValue:{fontSize:10, color:'#171717', bold:true},
        tableHead:{fontSize:8, color:'#6b6258', bold:true, fillColor:'#f6efe7'},
        signalLabel:{fontSize:7, color:'#6b6258', bold:true},
        signalValue:{fontSize:13, color:'#171717', bold:true},
        signalHint:{fontSize:7, color:'#7c7268'}
      }
    };
  }
  function storeHistory(report){
    try{
      const key = 'pureinvest_reports_history_v1';
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      rows.unshift({id:Date.now(), action:'pdf-unicode', type:reportTitle(report.config?.type), scope:report.config?.type==='portfolio'?'Wszystkie nieruchomości':propertyName(report.property), period:periodLabel(report.config), balance:num(report.balance), date:new Date().toLocaleString('pl-PL')});
      localStorage.setItem(key, JSON.stringify(rows.slice(0,12)));
      if(typeof window.piReportsInit === 'function') setTimeout(()=>window.piReportsInit(), 120);
    }catch(_){ }
  }
  async function piReportsDownloadPdfUnicode151(){
    const status = $('piReportsStatus');
    try{
      if(status) status.textContent = 'Przygotowuję PDF z pełną obsługą polskich znaków…';
      if(typeof window.piReportsRefresh === 'function'){
        await window.piReportsRefresh(false);
        await new Promise(r=>setTimeout(r,120));
      }
      const report = window.piLastReportsPro;
      if(!report) throw new Error('Brak danych raportu do eksportu.');
      const pdfMake = await ensurePdfMake();
      const docDefinition = buildDocDefinition(report);
      pdfMake.createPdf(docDefinition).download(safePdfName(report));
      storeHistory(report);
      if(status) status.textContent = 'PDF gotowy - raport uporządkowany';
      toast('Raport PDF został wygenerowany z pełną obsługą polskich znaków.');
    }catch(error){
      console.error(error);
      if(status) status.textContent = 'Błąd PDF';
      toast('Nie udało się wygenerować PDF: '+(error.message || error), 'error');
    }
  }
  piReportsDownloadPdfUnicode151.__piUnicode151 = true;
  window.piReportsDownloadPdf = piReportsDownloadPdfUnicode151;
})();
