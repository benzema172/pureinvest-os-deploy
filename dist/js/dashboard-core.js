(function(){
  if(window.__PI_V754_DASHBOARD_CORE__) return;
  window.__PI_V754_DASHBOARD_CORE__ = true;

  const $ = id => document.getElementById(id);
  const Core = () => window.PureInvestFinanceCore || {};
  const Period = () => window.PureInvestPaymentPeriod || {};
  const dbClient = () => window.db || window.piDb || window.supabaseClient || (typeof db !== 'undefined' ? db : null);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeUrl = value => { try{ const url = new URL(String(value || ''), location.origin); return ['http:','https:'].includes(url.protocol) ? url.href : ''; }catch(_){ return ''; } };
  const js = v => JSON.stringify(v ?? '').replaceAll('<','\\u003C').replaceAll('>','\\u003E');
  const num = v => Core().num ? Core().num(v) : Number(v || 0) || 0;
  const money = v => Core().money ? Core().money(v) : (num(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł');
  const liveRows = rows => Core().liveRows ? Core().liveRows(rows) : (rows||[]).filter(r=>r && r.is_deleted !== true && !r.deleted_at);
  const monthKey = v => { try{ if(window.monthKey) return window.monthKey(v); const d=new Date(v); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }catch(_){ return ''; } };
  const yearKey = v => { try{ if(window.yearKey) return window.yearKey(v); return String(new Date(v).getFullYear()); }catch(_){ return ''; } };
  const todayDate = () => { try{ return window.todayDate ? window.todayDate() : new Date().toISOString().slice(0,10); }catch(_){ return new Date().toISOString().slice(0,10); } };
  const safeCall = (fn,...args) => { try{ if(typeof fn === 'function') return fn(...args); }catch(e){ console.warn('PureInvest dashboard-core skipped:', e); } };
  const paymentPeriod = row => { try{ return Period().settlementMonth ? Period().settlementMonth(row) : monthKey(row?.payment_date || row?.created_at); }catch(_){ return monthKey(row?.payment_date || row?.created_at); } };
  const cleanNote = note => { try{ return Period().cleanNote ? Period().cleanNote(note) : String(note || ''); }catch(_){ return String(note || ''); } };
  const settlementPeriodLabel = key => { try{ return Period().label ? Period().label(key) : key; }catch(_){ return key; } };

  function setGlobal(name, value){ window[name]=value; }
  function getGlobal(name, fallback){ return window[name] ?? fallback; }
  function activeId(){ return window.activeProperty || getGlobal('activeProperty', null); }
  function activeData(){ return window.activePropertyData || getGlobal('activePropertyData', null); }
  function properties(){ return window.loadedProperties || getGlobal('loadedProperties', []) || []; }
  function el(id){ return $(id); }

  function requireDb(){ const client=dbClient(); if(!client) throw new Error('Brak połączenia Supabase. Odśwież aplikację.'); return client; }
  function ownerSession(){ try{return JSON.parse(sessionStorage.getItem('piOwnerSessionV570') || 'null');}catch(_){return null;} }
  function isOwnerPinSession(){ const o=ownerSession(); return !!(o && o.ownerToken); }
  async function activityHeaders(){
    const headers = {'Content-Type':'application/json'};
    try{ const res = await dbClient()?.auth?.getSession?.(); const token = res?.data?.session?.access_token; if(token) headers.Authorization = 'Bearer ' + token; }catch(_){ }
    try{ const o=ownerSession(); if(o?.ownerToken) headers['x-pi-session-token'] = o.ownerToken; }catch(_){ }
    return headers;
  }
  async function ownerData(kind, payload){
    const r = await fetch('/.netlify/functions/owner-data', { method:'POST', headers: await activityHeaders(), body: JSON.stringify(Object.assign({kind}, payload || {})) });
    const data = await r.json().catch(()=>null);
    if(!r.ok || !data || !data.ok) throw new Error((data && (data.message || data.details)) || 'Nie udało się pobrać danych ownera.');
    return data;
  }
  async function selectTransactionRows(propertyId){
    if(isOwnerPinSession()){
      const data = await ownerData('transactions', propertyId ? {propertyId} : {});
      return {payments:liveRows(data.payments||[]), expenses:liveRows(data.expenses||[])};
    }
    if(propertyId){
      const [pRes,eRes]=await Promise.all([requireDb().from('payments').select('*').eq('property_id',propertyId), requireDb().from('expenses').select('*').eq('property_id',propertyId)]);
      if(pRes.error) throw pRes.error; if(eRes.error) throw eRes.error;
      return {payments:liveRows(pRes.data||[]), expenses:liveRows(eRes.data||[])};
    }
    const [pRes,eRes]=await Promise.all([requireDb().from('payments').select('*'), requireDb().from('expenses').select('*')]);
    if(pRes.error) throw pRes.error; if(eRes.error) throw eRes.error;
    return {payments:liveRows(pRes.data||[]), expenses:liveRows(eRes.data||[])};
  }
  function isNajemRow(x){ try{ return window.isNajem ? window.isNajem(x) : /najem|czynsz najmu|rent/i.test(String(x?.source||x?.category||'')); }catch(_){ return false; } }
  function taxFromPayments(rows, opts){ try{ const cfg=Object.assign({property:activeData()||{}}, opts || {}); return window.piCalcTenantRentTax ? window.piCalcTenantRentTax(rows, cfg) : 0; }catch(_){ return 0; } }
  function taxBase(rows){ try{ return window.piTaxBaseFromPaymentRows ? window.piTaxBaseFromPaymentRows(rows) : rows.filter(isNajemRow).reduce((a,b)=>a+num(b.amount),0); }catch(_){ return 0; } }
  function calcTax(v){ try{ return window.PureInvestTaxPolicy?.annualTax ? window.PureInvestTaxPolicy.annualTax(v) : (window.calcTax ? window.calcTax(v) : Math.min(num(v),100000)*0.085+Math.max(num(v)-100000,0)*0.125); }catch(_){ return Math.min(num(v),100000)*0.085+Math.max(num(v)-100000,0)*0.125; } }
  async function ensureChart(){ if(window.ensureChart) return window.ensureChart(); if(!window.Chart) throw new Error('Chart.js niedostępny'); return window.Chart; }

  window.fillFilters = function(){
    const rawPayments = getGlobal('rawPayments', []), rawExpenses = getGlobal('rawExpenses', []);
    const monthFilter=el('monthFilter'), yearFilter=el('yearFilter'), historyCategoryFilter=el('historyCategoryFilter');
    if(!monthFilter || !yearFilter || !historyCategoryFilter) return;
    const oldMonth=monthFilter.value, oldYear=yearFilter.value, oldCat=historyCategoryFilter.value;
    const months=new Set(), years=new Set(), cats=new Set();
    rawPayments.forEach(x=>{const k=paymentPeriod(x); months.add(k); years.add(String(k||'').slice(0,4)); if(x.source) cats.add(x.source);});
    rawExpenses.forEach(x=>{const d=x.expense_date || x.date || x.created_at; months.add(monthKey(d));years.add(yearKey(d)); if(x.category) cats.add(x.category);});
    monthFilter.innerHTML='<option value="all">Wszystkie miesiące</option>';
    [...months].filter(Boolean).sort().reverse().forEach(m=>monthFilter.innerHTML+=`<option value="${esc(m)}">${esc(m)}</option>`);
    monthFilter.value=[...monthFilter.options].some(o=>o.value===oldMonth)?oldMonth:'all';
    yearFilter.innerHTML='<option value="all">Wszystkie lata</option>';
    [...years].filter(Boolean).sort().reverse().forEach(y=>yearFilter.innerHTML+=`<option value="${esc(y)}">${esc(y)}</option>`);
    yearFilter.value=[...yearFilter.options].some(o=>o.value===oldYear)?oldYear:'all';
    historyCategoryFilter.innerHTML='<option value="all">Wszystkie kategorie</option>';
    [...cats].filter(Boolean).sort((a,b)=>String(a).localeCompare(String(b),'pl')).forEach(c=>historyCategoryFilter.innerHTML+=`<option value="${esc(c)}">${esc(c)}</option>`);
    historyCategoryFilter.value=[...historyCategoryFilter.options].some(o=>o.value===oldCat)?oldCat:'all';
  };

  window.updateYearSummary = function(){
    const rawPayments = getGlobal('rawPayments', []), rawExpenses = getGlobal('rawExpenses', []);
    const y=(el('yearFilter')?.value==='all' || !el('yearFilter')) ? String(new Date().getFullYear()) : el('yearFilter').value;
    const pCash=rawPayments.filter(x=>yearKey(Period().actualDate ? Period().actualDate(x) : (x.payment_date || x.created_at))===y);
    const e=rawExpenses.filter(x=>yearKey(x.expense_date || x.date || x.created_at)===y);
    const inc=pCash.reduce((a,b)=>a+num(b.amount),0), cos=e.reduce((a,b)=>a+num(b.amount),0), tax=taxFromPayments(pCash);
    if(el('yearIncome')) el('yearIncome').innerText=money(inc);
    if(el('yearCost')) el('yearCost').innerText=money(cos);
    if(el('yearProfit')) el('yearProfit').innerText=money(inc-cos-tax);
    // Podatek pozostaje przypisany do faktycznej daty wpływu, nie do miesiąca rozliczeniowego.
    if(el('yearTax')) el('yearTax').innerText=money(tax);
  };

  window.renderPaymentAlert = function(){
    const rawPayments = getGlobal('rawPayments', []);
    const p=activeData() || {};
    const now=new Date(), current=monthKey(now), hasRent=rawPayments.some(x=>paymentPeriod(x)===current && isNajemRow(x));
    const day=num(p.payment_day || p.rent_due_day || 0), late=day && now.getDate()>day && !hasRent;
    const paymentAlert=el('paymentAlert');
    if(paymentAlert){ paymentAlert.className='quick'+(late?' alert':''); paymentAlert.innerHTML=late?'<div class="pi-quick-title">⚠️ Płatności i zaległości</div><div class="pi-quick-value">Brak wpłaty najmu</div><div class="pi-quick-meta">Bieżący miesiąc bez zaksięgowanej wpłaty</div>':'<div class="pi-quick-title">✅ Płatności i zaległości</div><div class="pi-quick-value">OK</div><div class="pi-quick-meta">Brak braków w bieżącym rozliczeniu</div>'; }
    if(el('tenantStatusBox')) el('tenantStatusBox').innerHTML=p.tenant_name?'<div class="pi-quick-title">🏠 Status najmu</div><div class="pi-quick-value">Wynajęte</div><div class="pi-quick-meta">Najemca: '+esc(p.tenant_name || '—')+'</div>':'<div class="pi-quick-title">🏚️ Status najmu</div><div class="pi-quick-value">Wolne</div>';
    if(el('quickRentInfo')){ let rentBase=0; try{ rentBase = window.piTenantRentTaxBase?.(p) || 0; }catch(_){ } if(!rentBase) rentBase = num(p.owner_rent || p.owner_monthly_rent || p.rent || 0); el('quickRentInfo').innerHTML='<div class="pi-quick-title">💰 Najem właścicielski</div><div class="pi-quick-value">'+money(rentBase)+'</div>'; }
  };

  window.renderTransactions = function(paymentsRows, expensesRows){
    let all=[];
    (paymentsRows||[]).forEach(x=>all.push({table:'payments',id:x.id,type:'income',amount:num(x.amount),name:x.source||'Wpłata najmu',date:(Period().actualDate?Period().actualDate(x):x.created_at),settlement_month:paymentPeriod(x),note:cleanNote(x.note),attachment_url:x.attachment_url||'',attachment_path:x.attachment_path||'',attachment_name:x.attachment_name||'',transaction_status:x.transaction_status,transaction_source:x.transaction_source,settlement_component:x.settlement_component}));
    (expensesRows||[]).forEach(x=>all.push({table:'expenses',id:x.id,type:'expense',amount:num(x.amount),name:x.category||'Koszt',date:x.expense_date || x.date || x.created_at,note:cleanNote(x.note),attachment_url:x.attachment_url||'',attachment_path:x.attachment_path||'',attachment_name:x.attachment_name||'',transaction_status:x.transaction_status,transaction_source:x.transaction_source,settlement_component:x.settlement_component}));
    const type=el('historyTypeFilter')?.value || 'all';
    const cat=el('historyCategoryFilter')?.value || 'all';
    if(type!=='all') all=all.filter(x=>x.type===type);
    if(cat!=='all') all=all.filter(x=>x.name===cat);
    const sortMode=el('transactionSort')?.value || 'newest';
    const limitMode=el('transactionLimit')?.value || '10';
    const categoryEl=el('transactionCategoryFilter');
    if(categoryEl){
      const old=categoryEl.value || 'all';
      const cats=[...new Set(all.map(x=>x.name).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pl'));
      categoryEl.innerHTML='<option value="all">Kategoria: wszystkie</option>'+cats.map(c=>`<option value="${esc(c)}">Kategoria: ${esc(c)}</option>`).join('');
      categoryEl.value=cats.includes(old)?old:'all';
    }
    const sorters={newest:(a,b)=>new Date(b.date)-new Date(a.date),oldest:(a,b)=>new Date(a.date)-new Date(b.date),amount_desc:(a,b)=>num(b.amount)-num(a.amount),amount_asc:(a,b)=>num(a.amount)-num(b.amount),name_asc:(a,b)=>(a.name||'').localeCompare(b.name||'','pl'),name_desc:(a,b)=>(b.name||'').localeCompare(a.name||'','pl')};
    all.sort(sorters[sortMode] || sorters.newest);
    let transactionList=[...all];
    const transactionCategory=categoryEl ? (categoryEl.value||'all') : 'all';
    if(transactionCategory!=='all') transactionList=transactionList.filter(x=>x.name===transactionCategory);
    const visible=limitMode==='all'?transactionList:transactionList.slice(0,Number(limitMode||10));
    const item=x=>`<div class="transaction"><div><div class="transaction-title">${esc(x.name)}</div><div class="transaction-date">Data wpływu: ${esc(new Date(x.date).toLocaleString('pl-PL'))}${x.type==='income'&&x.settlement_month?` <span class="pi-settlement-period-hint">Rozliczenie: ${esc(settlementPeriodLabel(x.settlement_month))}</span>`:''}</div>${x.note?`<div class="transaction-note">${esc(x.note)}</div>`:''}${safeUrl(x.attachment_url)?`<a class="attachment-link" href="${esc(safeUrl(x.attachment_url))}" target="_blank" rel="noopener noreferrer">📎 Otwórz załącznik</a>`:''}<div class="actions"><button class="small-btn" onclick='piOpenTransactionEditModal(${js(x.table)},${js(x.id)})'>Edytuj</button><button class="small-btn danger" onclick='piPropertyFinanceDelete(${js(x.table)},${js(x.id)})'>Usuń</button></div></div><div class="${x.type==='income'?'plus':'minus'}">${x.type==='income'?'+':'-'}${money(x.amount)}</div></div>`;
    const latest=[...all].sort(sorters.newest).slice(0,3);
    if(el('transactionsDashboard')) el('transactionsDashboard').innerHTML=latest.map(item).join('')+(all.length>3?`<button class="subtle-link-btn" style="margin-top:12px" onclick="openTab('transactions')">Pokaż wszystkie transakcje →</button>`:'');
    if(el('transactions')) el('transactions').innerHTML=visible.map(item).join('') || '<div class="transactions-info">Brak transakcji do wyświetlenia.</div>';
    if(el('transactionsInfo')) el('transactionsInfo').innerHTML=`Wyświetlono ${visible.length} z ${transactionList.length} transakcji.${transactionCategory!=='all'?' Kategoria: '+esc(transactionCategory)+'.':''}`;
  };

  window.renderChart = async function(paymentsRows, expensesRows){
    const canvas=el('financeChart'); if(!canvas) return;
    try{
      await ensureChart(); const months={};
      (paymentsRows||[]).forEach(x=>{const k=monthKey(Period().actualDate ? Period().actualDate(x) : (x.payment_date || x.created_at)); if(!k) return; if(!months[k]) months[k]={income:0,cost:0}; months[k].income+=num(x.amount);});
      (expensesRows||[]).forEach(x=>{const k=monthKey(x.expense_date || x.date || x.created_at); if(!k) return; if(!months[k]) months[k]={income:0,cost:0}; months[k].cost+=num(x.amount);});
      const labels=Object.keys(months).sort();
      let chart=getGlobal('chart', null); if(chart) chart.destroy();
      chart=new Chart(canvas,{type:'line',data:{labels,datasets:[{label:'Przychody',data:labels.map(m=>months[m].income),borderWidth:4,tension:.35},{label:'Koszty',data:labels.map(m=>months[m].cost),borderWidth:4,tension:.35}]},options:{responsive:true,maintainAspectRatio:false}});
      setGlobal('chart', chart);
    }catch(e){ console.warn('chart skipped', e); }
  };

  function financeComponent(row, fallback){
    try{
      const core = window.PureInvestFinanceCore || {};
      const v = core.component ? core.component(row, fallback) : '';
      if(v) return String(v).replace('owner_rent','owner');
    }catch(_){ }
    const t = String([row?.settlement_component,row?.category,row?.source,row?.note,row?.name].filter(Boolean).join(' ')).toLowerCase();
    if(/najem|odstępne|odstepne|rent/.test(t)) return 'owner';
    if(/wspól|wspol|czynsz|administr|spółdziel|spoldziel/.test(t)) return 'community';
    if(/prąd|prad|energia|pge|enea|energa|tauron/.test(t)) return 'electricity';
    if(/gaz|pgnig/.test(t)) return 'gas';
    if(/woda|wodoci/.test(t)) return 'water';
    if(/remont|napraw|serwis|meble|wyposaż|wyposaz|inwestyc/.test(t)) return 'renovation';
    return 'other';
  }
  function isMediaBillComponent(comp){
    comp = String(comp || '').replace('owner_rent','owner');
    return ['electricity','gas','water','media','other'].includes(comp);
  }
  function isAdminRentComponent(comp){
    comp = String(comp || '').replace('owner_rent','owner');
    return comp === 'community';
  }
  function financeComponentLabel(comp){
    const labels = (window.PureInvestFinanceCore && window.PureInvestFinanceCore.componentLabels) || {};
    comp = String(comp || '').replace('owner_rent','owner');
    if(comp === 'community') return 'Czynsz administracyjny';
    if(comp === 'electricity') return 'Prąd';
    if(comp === 'gas') return 'Gaz';
    if(comp === 'water') return 'Woda';
    if(comp === 'other' || comp === 'media') return 'Media / pozostałe rachunki';
    if(comp === 'renovation') return 'Remont / koszt właściciela';
    if(comp === 'service') return 'Serwis';
    return labels[comp] || comp || 'Inne';
  }

  window.renderCostPie = async function(expensesRows){
    const canvas=el('costPieChart'); if(!canvas) return;
    try{
      await ensureChart(); const grouped={};
      (expensesRows||[]).forEach(x=>{
        const comp = financeComponent(x,'expense');
        const label = financeComponentLabel(comp);
        grouped[label]=(grouped[label]||0)+num(x.amount);
      });
      const labels=Object.keys(grouped), data=labels.map(k=>grouped[k]);
      let costPie=getGlobal('costPie', null); if(costPie) costPie.destroy();
      costPie=new Chart(canvas,{type:'doughnut',data:{labels,datasets:[{data}]},options:{responsive:true,maintainAspectRatio:false}});
      setGlobal('costPie', costPie);
    }catch(e){ console.warn('cost pie skipped', e); }
  };

  async function getFinanceScopeData(){
    const scope = el('financeScope')?.value || 'property';
    const rawPayments=getGlobal('rawPayments', []), rawExpenses=getGlobal('rawExpenses', []);
    if(scope==='all'){
      try{
        const rows = await selectTransactionRows(null);
        return {payments:rows.payments,expenses:rows.expenses,scope:'all'};
      }catch(e){
        console.warn('finance all scope fallback', e);
        return {payments:rawPayments,expenses:rawExpenses,scope:'property'};
      }
    }
    return {payments:rawPayments,expenses:rawExpenses,scope:'property'};
  }


  function financeActualDate(row, payment=false){
    try{
      const value = payment && Period().actualDate ? Period().actualDate(row) : (row?.expense_date || row?.payment_date || row?.date || row?.paid_at || row?.created_at);
      const d = value ? new Date(value) : null;
      return d && Number.isFinite(d.getTime()) ? d : null;
    }catch(_){ return null; }
  }
  function financeRowsToCutoff(rows, cutoff, payment=false){
    if(!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) return rows || [];
    return (rows || []).filter(row=>{ const d=financeActualDate(row,payment); return !d || d<=cutoff; });
  }
  function splitActualTenantCosts(agg, Engine, cutoff){
    let community=0, media=0;
    (agg?.snapshots || []).forEach(snapshot=>{
      (snapshot?.actualTenantExpenseRows || []).forEach(row=>{
        const d=financeActualDate(row,false);
        if(d && cutoff && d>cutoff) return;
        const comp=String(Engine?.normalizeComponent?.(row?.settlement_component, [row?.category,row?.source,row?.note,row?.name].filter(Boolean).join(' ')) || financeComponent(row,'expense')).replace('owner_rent','owner');
        if(comp==='community') community+=num(row?.amount); else media+=num(row?.amount);
      });
    });
    return {community:Math.round(community*100)/100,media:Math.round(media*100)/100};
  }
  function ownerRentAllocatedForYear(props, payments, year, Engine, cutoff){
    if(!Engine || typeof Engine.taxBaseFromPaymentRows!=='function') return 0;
    let total=0;
    const live=typeof Engine.liveRows==='function'?Engine.liveRows(payments || []):(payments || []);
    (props || []).forEach(property=>{
      const rows=live.filter(row=>{
        if(String(row?.property_id ?? row?.propertyId ?? '')!==String(property?.id ?? '')) return false;
        let allocation=''; try{ allocation=Engine.rowMonth?.(row) || paymentPeriod(row) || ''; }catch(_){ allocation=paymentPeriod(row) || ''; }
        if(String(allocation).slice(0,4)!==String(year)) return false;
        const d=financeActualDate(row,true);
        return !d || !cutoff || d<=cutoff;
      });
      total+=num(Engine.taxBaseFromPaymentRows(rows,{property}));
    });
    return Math.round(total*100)/100;
  }

  window.renderFinancePro = async function(){
    if(!document.body.classList.contains('authenticated')) return;
    const data=await getFinanceScopeData();
    const paymentsData=data.payments||[], expensesData=data.expenses||[];
    const scopeLabel=data.scope==='all'?'całego portfela':'wybranego mieszkania';
    const y=el('yearFilter')?.value==='all' || !el('yearFilter') ? String(new Date().getFullYear()) : el('yearFilter').value;
    const labels=['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
    const Engine = window.PureInvestSettlementEngine;
    if(Engine && typeof Engine.aggregate === 'function'){
      let props = [];
      try{ if(data.scope === 'all' && Array.isArray(window.loadedProperties)) props = window.loadedProperties; }catch(_){ }
      if(!props.length){
        try{ if(window.activePropertyData?.id) props = [window.activePropertyData]; }catch(_){ }
      }
      if(!props.length){
        try{ if(Array.isArray(window.loadedProperties) && window.loadedProperties.length) props = [window.loadedProperties[0]]; }catch(_){ }
      }
      if(props.length){
        const monthly=[];
        const today=new Date(),selectedYear=Number(y),currentYear=today.getFullYear(),currentMonthNumber=today.getMonth()+1;
        const cutoff=selectedYear<currentYear?new Date(selectedYear,11,31,23,59,59,999):(selectedYear===currentYear?new Date(today.getFullYear(),today.getMonth(),today.getDate(),23,59,59,999):new Date(selectedYear,0,1,0,0,0,0));
        const metricPayments=selectedYear>currentYear?[]:financeRowsToCutoff(paymentsData,cutoff,true);
        const metricExpenses=selectedYear>currentYear?[]:financeRowsToCutoff(expensesData,cutoff,false);
        for(let i=1;i<=12;i++){
          const key=y+'-'+String(i).padStart(2,'0');
          const agg=Engine.aggregate(props, metricPayments, metricExpenses, [key], {type:data.scope==='all'?'portfolio':'property'});
          const actual=selectedYear<currentYear || (selectedYear===currentYear && i<=currentMonthNumber);
          const future=selectedYear>currentYear || (selectedYear===currentYear && i>currentMonthNumber);
          const isCurrent=selectedYear===currentYear && i===currentMonthNumber;
          const split=actual?splitActualTenantCosts(agg,Engine,cutoff):{community:0,media:0};
          monthly.push({label:labels[i-1],key,actual,future,isCurrent,rent:agg.ownerRentDue,community:split.community,media:split.media,ownerCosts:actual?agg.ownerCosts:0,ownerCostsForecast:agg.ownerCostsForecast,tax:actual?agg.tax:0,taxBase:actual?agg.ownerRentPaidBase:0,balance:actual?agg.cashNet:0,paid:actual?agg.cashInflow:0,allocatedPaid:agg.allocatedPaid,due:agg.expected});
        }
        if(el('monthlyTable') && !window.piRenderMonthlyAutopilotTable) el('monthlyTable').innerHTML=monthly.map(m=>`<tr><td>${esc(m.label)}</td><td>${money(m.due)}</td><td>${money(m.paid)}</td><td>${money(m.community+m.media)}</td><td>${money(m.balance)}</td><td>${money(m.tax)}</td></tr>`).join('');
        const ownerRentAllocatedYearToDate=selectedYear===currentYear?ownerRentAllocatedForYear(props,paymentsData,y,Engine,cutoff):(selectedYear<currentYear?ownerRentAllocatedForYear(props,paymentsData,y,Engine,cutoff):0);
        const Metrics=window.PureInvestFinanceDashboardMetrics;
        const metrics=Metrics?.compute?Metrics.compute({monthly,selectedYear,currentYear,ownerRentAllocatedYearToDate,annualTax:base=>window.PureInvestTaxPolicy?.annualTax?window.PureInvestTaxPolicy.annualTax(base):calcTax(base)}):null;
        const rentTotal=metrics?.rentTotal ?? monthly.reduce((a,b)=>a+b.rent,0);
        const paidTotal=metrics?.paidTotal ?? monthly.filter(m=>m.actual).reduce((a,b)=>a+b.paid,0);
        const communityTotal=metrics?.communityTotal ?? monthly.filter(m=>m.actual).reduce((a,b)=>a+b.community,0);
        const mediaTotal=metrics?.mediaTotal ?? monthly.filter(m=>m.actual).reduce((a,b)=>a+b.media,0);
        const ownerCostTotal=metrics?.ownerCostTotal ?? monthly.filter(m=>m.actual).reduce((a,b)=>a+b.ownerCosts,0);
        const yearlyCost=metrics?.yearlyCost ?? communityTotal+mediaTotal+ownerCostTotal;
        const yearlyProfit=metrics?.yearlyProfit ?? monthly.filter(m=>m.actual).reduce((a,b)=>a+b.balance,0);
        const yearlyTax=metrics?.yearlyTax ?? monthly.filter(m=>m.actual).reduce((a,b)=>a+b.tax,0);
        const forecast=metrics?.forecast ?? yearlyProfit;
        if(el('yearIncome')) el('yearIncome').innerText=money(paidTotal);
        if(el('yearCost')) el('yearCost').innerText=money(yearlyCost);
        if(el('yearProfit')) el('yearProfit').innerText=money(yearlyProfit);
        if(el('yearTax')) el('yearTax').innerText=money(yearlyTax);
        if(el('rentIncomeKpi')) el('rentIncomeKpi').innerText=money(rentTotal);
        if(el('communityCostKpi')) el('communityCostKpi').innerText=money(communityTotal);
        if(el('mediaIncomeKpi')) el('mediaIncomeKpi').innerText=money(mediaTotal);
        if(el('ownerCostKpi')) el('ownerCostKpi').innerText=money(ownerCostTotal);
        if(el('forecastKpi')) el('forecastKpi').innerText=money(forecast);
        if(el('financeSummary')) el('financeSummary').innerHTML=`<div class="report-row"><b>Zakres</b><span>${esc(scopeLabel)}</span></div><div class="report-row"><b>Rok</b><span>${esc(y)}</span></div><div class="report-row"><b>Należny najem — cały rok</b><span>${money(rentTotal)}</span></div><div class="report-row"><b>Wpływy otrzymane YTD</b><span>${money(paidTotal)}</span></div><div class="report-row"><b>Czynsz administracyjny YTD</b><span>${money(communityTotal)}</span></div><div class="report-row"><b>Media / rachunki YTD</b><span>${money(mediaTotal)}</span></div><div class="report-row"><b>Koszty właściciela YTD</b><span>${money(ownerCostTotal)}</span></div><div class="report-row"><b>Cashflow netto YTD</b><span>${money(yearlyProfit)}</span></div><div class="report-row"><b>Prognoza końca roku</b><span>${money(forecast)}</span></div><div class="report-row"><b>Podatek od otrzymanego najmu YTD</b><span>${money(yearlyTax)}</span></div>`;
        window.renderCostPie(metricExpenses.filter(x=>yearKey(x.expense_date || x.date || x.created_at)===y));
        return;
      }
    }
    const monthly=[]; let taxableBaseBefore=0;
    for(let i=1;i<=12;i++){
      const key=y+'-'+String(i).padStart(2,'0');
      const p=paymentsData.filter(x=>monthKey(Period().actualDate ? Period().actualDate(x) : (x.payment_date || x.created_at))===key), e=expensesData.filter(x=>monthKey(x.expense_date || x.date || x.created_at)===key);
      const rent=p.filter(x=>financeComponent(x,'payment')==='owner' || isNajemRow(x)).reduce((a,b)=>a+num(b.amount),0);
      const mediaBills=e.filter(x=>isMediaBillComponent(financeComponent(x,'expense'))).reduce((a,b)=>a+num(b.amount),0);
      const adminRent=e.filter(x=>isAdminRentComponent(financeComponent(x,'expense'))).reduce((a,b)=>a+num(b.amount),0);
      const otherOwnerCosts=e.filter(x=>!isMediaBillComponent(financeComponent(x,'expense')) && !isAdminRentComponent(financeComponent(x,'expense'))).reduce((a,b)=>a+num(b.amount),0);
      const monthTaxBase=taxBase(p),tax=calcTax(taxableBaseBefore+monthTaxBase)-calcTax(taxableBaseBefore); taxableBaseBefore+=monthTaxBase;
      monthly.push({label:labels[i-1],rent,media:mediaBills,costs:adminRent,otherOwnerCosts,tax,balance:rent-mediaBills-adminRent-otherOwnerCosts-tax});
    }
    if(el('monthlyTable') && !window.piRenderMonthlyAutopilotTable) el('monthlyTable').innerHTML=monthly.map(m=>`<tr><td>${esc(m.label)}</td><td>${money(m.rent)}</td><td>${money(m.media)}</td><td>${money(m.costs)}</td><td>${money(m.balance)}</td><td>${money(m.tax)}</td></tr>`).join('');
    const rentTotal=monthly.reduce((a,b)=>a+b.rent,0), mediaTotal=monthly.reduce((a,b)=>a+b.media,0), adminTotal=monthly.reduce((a,b)=>a+b.costs,0), otherOwnerTotal=monthly.reduce((a,b)=>a+b.otherOwnerCosts,0), yearlyCost=mediaTotal+adminTotal+otherOwnerTotal, yearlyTax=monthly.reduce((a,b)=>a+b.tax,0), yearlyProfit=rentTotal-yearlyCost-yearlyTax;
    const monthsWithData=monthly.filter(m=>m.rent||m.media||m.costs||m.otherOwnerCosts).length||1, forecast=(monthly.reduce((a,b)=>a+b.balance,0)/monthsWithData)*12;
    if(el('yearIncome')) el('yearIncome').innerText=money(rentTotal); if(el('yearCost')) el('yearCost').innerText=money(yearlyCost); if(el('yearProfit')) el('yearProfit').innerText=money(yearlyProfit); if(el('yearTax')) el('yearTax').innerText=money(yearlyTax);
    if(el('rentIncomeKpi')) el('rentIncomeKpi').innerText=money(rentTotal); if(el('communityCostKpi')) el('communityCostKpi').innerText=money(adminTotal); if(el('mediaIncomeKpi')) el('mediaIncomeKpi').innerText=money(mediaTotal); if(el('ownerCostKpi')) el('ownerCostKpi').innerText=money(otherOwnerTotal); if(el('forecastKpi')) el('forecastKpi').innerText=money(forecast);
    if(el('financeSummary')) el('financeSummary').innerHTML=`<div class="report-row"><b>Zakres</b><span>${esc(scopeLabel)}</span></div><div class="report-row"><b>Rok</b><span>${esc(y)}</span></div><div class="report-row"><b>Przychód z najmu</b><span>${money(rentTotal)}</span></div><div class="report-row"><b>Media / rachunki</b><span>${money(mediaTotal)}</span></div><div class="report-row"><b>Czynsz administracyjny</b><span>${money(adminTotal)}</span></div>${otherOwnerTotal ? `<div class="report-row"><b>Inne koszty właściciela</b><span>${money(otherOwnerTotal)}</span></div>` : ''}<div class="report-row"><b>Saldo po kosztach</b><span>${money(yearlyProfit)}</span></div><div class="report-row"><b>Prognoza roczna</b><span>${money(forecast)}</span></div><div class="report-row"><b>Podatek od najmu</b><span>${money(yearlyTax)}</span></div>`;
    window.renderCostPie(expensesData.filter(x=>yearKey(x.expense_date || x.date || x.created_at)===y));
  };

  function sameId(a,b){ return String(a ?? '') === String(b ?? ''); }
  function rowDate(row){ return row?.payment_date || row?.expense_date || row?.date || row?.paid_at || row?.issued_at || row?.created_at || row?.createdAt || null; }
  function safeMonth(row){
    try{
      const d = rowDate(row);
      if(!d) return '';
      const key = monthKey(d);
      return /^\d{4}-\d{2}$/.test(String(key)) ? String(key) : '';
    }catch(_){ return ''; }
  }
  function monthLabel(key){
    const names=['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
    const m=Number(String(key).slice(5,7));
    const y=String(key).slice(0,4);
    return (names[m-1] || key) + ' ' + y;
  }
  function ensurePortfolioEmptyBox(){
    const canvas=el('portfolioChart'); if(!canvas) return null;
    let box=el('portfolioChartEmpty');
    if(!box){
      box=document.createElement('div');
      box.id='portfolioChartEmpty';
      box.className='transactions-info pi-portfolio-empty';
      box.style.marginTop='10px';
      canvas.parentElement?.appendChild(box);
    }
    return box;
  }
  function setPortfolioEmpty(message){
    const canvas=el('portfolioChart'), box=ensurePortfolioEmptyBox();
    if(box){ box.innerHTML=message || ''; box.style.display=message ? '' : 'none'; }
    if(canvas) canvas.style.display = message ? 'none' : '';
  }

  const PI_PORTFOLIO_PERIODS = { month:'Ten miesiąc', year:'Ten rok', history:'Cała historia' };
  function setText(id, value){ const node=el(id); if(node) node.innerText = value ?? ''; }
  function setHtml(id, value){ const node=el(id); if(node) node.innerHTML = value ?? ''; }
  function currentMonth(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function currentYear(){ return String(new Date().getFullYear()); }
  function fullMonthLabel(key){
    const names=['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
    const m=Number(String(key).slice(5,7));
    const y=String(key).slice(0,4);
    return (names[m-1] || String(key)) + ' ' + y;
  }
  function periodLabel(period){
    if(period === 'month') return fullMonthLabel(currentMonth());
    if(period === 'year') return 'Rok ' + currentYear();
    return 'Cała historia';
  }
  function periodShortLabel(period){ return PI_PORTFOLIO_PERIODS[period] || 'Ten miesiąc'; }
  function propTitle(prop){ return prop ? (prop.name || prop.address || 'Mieszkanie') : 'Wybrane mieszkanie'; }
  function rowInPeriod(row, period){
    if(period === 'history') return true;
    const d = rowDate(row);
    if(!d) return false;
    if(period === 'year') return yearKey(d) === currentYear();
    return monthKey(d) === currentMonth();
  }

  function portfolioSettlementItems(prop){
    try{
      if(typeof window.piAutoMigrateLegacySettlement === 'function') window.piAutoMigrateLegacySettlement(prop);
      if(typeof window.piGetEffectiveSettlementItems === 'function') return window.piGetEffectiveSettlementItems(prop) || [];
      if(window.piSettlementDictionary?.effectiveMonthlyItems) return window.piSettlementDictionary.effectiveMonthlyItems(prop) || [];
    }catch(_){ }
    return [];
  }
  function isOwnerRentExpense(row){
    if(!row) return false;
    const core = window.PureInvestFinanceCore || {};
    let comp = String(row.settlement_component || '').toLowerCase();
    try{ comp = String(core.component ? core.component(row,'expense') : comp).toLowerCase(); }catch(_){ }
    if(comp === 'owner' || comp === 'owner_rent') return true;
    const txt = String([row.category,row.source,row.name,row.description,row.note].filter(Boolean).join(' ')).toLowerCase();
    return /(najem\s*(dla|do)?\s*właśc|najem\s*(dla|do)?\s*wlasc|czynsz\s*najmu\s*właśc|czynsz\s*najmu\s*wlasc|owner\s*rent)/i.test(txt);
  }
  function portfolioExpectedPlan(prop){
    const items = portfolioSettlementItems(prop).filter(x => x && x.active !== false && x.recurring === 'monthly' && x.tenant_due !== false && x.payer !== 'owner');
    let income = 0, cost = 0;
    items.forEach(item=>{
      const amount = num(item.default_amount);
      income += amount;
      if(String(item.kind || '').toLowerCase() === 'expense') cost += amount;
    });
    if(income <= 0.009){
      const owner = num(prop?.owner_rent ?? prop?.rent_amount ?? prop?.monthly_rent ?? prop?.owner_monthly_rent ?? prop?.rent ?? 0);
      const admin = num(prop?.community_rent);
      const media = num(prop?.electricity_expected) + num(prop?.gas_expected) + num(prop?.water_expected) + num(prop?.other_expected);
      income = owner + admin + media;
      cost = admin + media;
    }
    return {income:num(income), cost:num(cost), profit:num(income-cost)};
  }
  function portfolioCashModel(prop, period, payments, expenses){
    const actualIncome = (payments || []).reduce((a,b)=>a+num(b.amount),0);
    const actualCost = (expenses || []).filter(x=>!isOwnerRentExpense(x)).reduce((a,b)=>a+num(b.amount),0);
    const plan = portfolioExpectedPlan(prop);
    // Actual receipts and expenses remain actual, including a valid zero.
    return {income:actualIncome, cost:actualCost, actualIncome, actualCost, plannedIncome:plan.income, plannedCost:plan.cost, usedPlan:false};
  }
  function portfolioSelectedProperty(props){
    const select = el('portfolioPropertyFilter');
    const wanted = activeId() || select?.value || (props[0] && props[0].id) || ''; // active property is the source of truth
    return (props || []).find(p=>sameId(p.id, wanted)) || props[0] || null;
  }
  function setPortfolioActiveProperty(prop){
    if(!prop) return;
    try{ activeProperty = prop.id; }catch(_){ }
    try{ activePropertyData = prop; }catch(_){ }
    window.activeProperty = prop.id;
    window.activePropertyData = prop;
  }
  function syncPortfolioControls(props){
    const propSelect = el('portfolioPropertyFilter');
    if(propSelect){
      // The active apartment selected in the app header is the source of truth.
      // Earlier the dropdown kept its old DOM value, so the Portfolio section could show Żeglarska
      // while the user was already inside Piaseczno. Always prefer activeProperty here.
      const preferred = activeId() || propSelect.value || (props[0] && props[0].id) || '';
      propSelect.innerHTML = (props || []).length
        ? props.map(p=>`<option value="${esc(p.id)}">${esc(propTitle(p))}</option>`).join('')
        : '<option value="">Brak mieszkań</option>';
      const next = (props || []).some(p=>sameId(p.id, preferred)) ? preferred : ((props[0] && props[0].id) || '');
      propSelect.value = next;
    }
    const periodSelect = el('portfolioPeriodFilter');
    if(periodSelect && !periodSelect.value) periodSelect.value = 'month';
    const scopeSelect = el('portfolioScopeFilter');
    if(scopeSelect && !scopeSelect.value) scopeSelect.value = 'property';
  }
  function chartKeysForPeriod(pRows, eRows, period){
    const tx = [...(pRows || []), ...(eRows || [])];
    const set = new Set();
    tx.forEach(row=>{ const k=safeMonth(row); if(k && rowInPeriod(row, period)) set.add(k); });
    return [...set].sort().slice(-18);
  }
  function updatePortfolioTexts(scope, period, selectedProp, visibleCount){
    const scopeIsProperty = scope === 'property';
    const selectedName = propTitle(selectedProp);
    const scopeName = scopeIsProperty ? selectedName : 'wszystkie mieszkania';
    const periodName = periodLabel(period);
    const periodShort = periodShortLabel(period);
    setText('portfolioContextTitle', (scopeIsProperty ? selectedName : 'Wszystkie mieszkania') + ' · ' + periodName);
    setText('portfolioContextHint', `Podsumowanie pokazuje ${scopeName} oraz okres: ${periodName}. Analiza Rent Engine niżej zawsze dotyczy wybranego mieszkania i bieżącego miesiąca.`);
    setText('portfolioIncomeLabel', scopeIsProperty ? 'Otrzymane wpłaty — mieszkanie' : 'Otrzymane wpłaty — portfel');
    setText('portfolioCostLabel', scopeIsProperty ? 'Poniesione koszty — mieszkanie' : 'Poniesione koszty — portfel');
    setText('portfolioProfitLabel', scopeIsProperty ? 'Przepływ przed podatkiem — mieszkanie' : 'Przepływ przed podatkiem — portfel');
    setText('portfolioCountLabel', scopeIsProperty ? 'Wybrane mieszkanie' : 'Liczba mieszkań w portfelu');
    setText('portfolioIncomeHint', periodName);
    setText('portfolioCostHint', periodName);
    setText('portfolioProfitHint', periodName);
    setText('portfolioCountHint', scopeIsProperty ? selectedName : `${visibleCount} aktywne`);
    setText('portfolioSelectedPropertyContext', selectedProp ? `${selectedName} · bieżący miesiąc` : 'Wybierz mieszkanie, aby zobaczyć bieżący wynik lokalu.');
    setText('portfolioChartTitle', scopeIsProperty ? `Historia mieszkania — ${selectedName}` : 'Historia portfela — wszystkie mieszkania');
    setText('portfolioChartHint', `Przychody, koszty i saldo miesięczne. Zakres: ${scopeName}. Okres: ${periodShort}.`);
    setText('portfolioRankingTitle', scopeIsProperty ? 'Wynik wybranego mieszkania' : 'Ranking mieszkań według salda');
    setText('portfolioRankingHint', periodName);
  }
  window.piPortfolioSetSelectedProperty = function(id){
    const props = properties();
    const prop = (props || []).find(p=>sameId(p.id, id));
    if(prop){ setPortfolioActiveProperty(prop); }
    safeCall(window.renderV7RentEngine);
    setTimeout(()=>safeCall(window.renderPortfolio), 0);
  };

  window.renderPortfolio = async function(){
    if(!document.body.classList.contains('authenticated')) return;
    try{
      const props = properties();
      syncPortfolioControls(props);
      const selectedProp = portfolioSelectedProperty(props);
      const scope = el('portfolioScopeFilter')?.value === 'property' ? 'property' : 'all';
      const period = el('portfolioPeriodFilter')?.value || 'month';
      if(selectedProp && !sameId(activeId(), selectedProp.id)) setPortfolioActiveProperty(selectedProp);

      const visibleProps = scope === 'property' && selectedProp ? [selectedProp] : props;
      const visibleIds = new Set((visibleProps || []).map(x=>String(x.id)));
      const allowedIds = new Set((props || []).map(x=>String(x.id)));
      const txRows = await selectTransactionRows(null);
      let p = liveRows(txRows.payments || []), e = liveRows(txRows.expenses || []);
      if(allowedIds.size){
        p = p.filter(x=>allowedIds.has(String(x.property_id)));
        e = e.filter(x=>allowedIds.has(String(x.property_id)));
      }
      if(visibleIds.size){
        p = p.filter(x=>visibleIds.has(String(x.property_id)));
        e = e.filter(x=>visibleIds.has(String(x.property_id)));
      }
      p = p.filter(x=>rowInPeriod(x, period));
      e = e.filter(x=>rowInPeriod(x, period));

      updatePortfolioTexts(scope, period, selectedProp, (props || []).length);
      const rows = (visibleProps || []).map(prop=>{
        const pp = p.filter(x=>sameId(x.property_id, prop.id));
        const peRows = e.filter(x=>sameId(x.property_id, prop.id));
        const model = portfolioCashModel(prop, period, pp, peRows);
        return Object.assign({}, prop, {income:model.income, cost:model.cost, profit:model.income-model.cost, actualIncome:model.actualIncome, actualCost:model.actualCost, plannedIncome:model.plannedIncome, plannedCost:model.plannedCost, usedPlan:model.usedPlan});
      }).sort((a,b)=>b.profit-a.profit);

      const inc = rows.reduce((a,b)=>a+num(b.income),0);
      const cos = rows.reduce((a,b)=>a+num(b.cost),0);
      setText('portfolioIncome', money(inc));
      setText('portfolioCost', money(cos));
      setText('portfolioProfit', money(inc-cos));
      setText('portfolioCount', scope === 'property' ? (selectedProp ? '1' : '0') : String(props.length));

      if(el('portfolioRanking')) el('portfolioRanking').innerHTML = rows.length
        ? rows.map((r,i)=>{
            const tone = r.profit < 0 ? 'pi-negative' : (r.profit > 0 ? 'pi-positive' : '');
            const flag = r.profit < 0 ? '<small class="pi-row-flag">wymaga uwagi</small>' : '';
            return `<div class="ranking-item ${tone}"><b>${i+1}. ${esc(propTitle(r))}${flag}</b><span>${money(r.profit)}</span></div>`;
          }).join('')
        : '<div class="transactions-info">Brak mieszkań do rankingu w wybranym zakresie.</div>';

      const canvas = el('portfolioChart');
      if(!canvas) return;
      const keys = chartKeysForPeriod(p, e, period);
      let portfolioChart = getGlobal('portfolioChartObj', null);
      if(!keys.length){
        if(portfolioChart){ try{ portfolioChart.destroy(); }catch(_){} setGlobal('portfolioChartObj', null); }
        setPortfolioEmpty('Brak zaksięgowanych transakcji w wybranym zakresie. Zmień okres albo dodaj wpływ/koszt.');
        return;
      }

      const income = keys.map(k=>p.filter(x=>safeMonth(x)===k).reduce((a,b)=>a+num(b.amount),0));
      const costs = keys.map(k=>e.filter(x=>safeMonth(x)===k && !isOwnerRentExpense(x)).reduce((a,b)=>a+num(b.amount),0));
      const balance = keys.map((_,i)=>income[i]-costs[i]);
      try{
        setPortfolioEmpty('');
        await ensureChart();
        if(portfolioChart) portfolioChart.destroy();
        portfolioChart = new Chart(canvas, {
          type:'bar',
          data:{
            labels:keys.map(monthLabel),
            datasets:[
              {label:'Przychody',data:income,borderWidth:2},
              {label:'Koszty',data:costs,borderWidth:2},
              {label:'Saldo',data:balance,type:'line',borderWidth:4,tension:.35}
            ]
          },
          options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{legend:{position:'bottom'}},
            scales:{y:{beginAtZero:true,ticks:{callback:v=>Number(v||0).toLocaleString('pl-PL')+' zł'}}}
          }
        });
        setGlobal('portfolioChartObj', portfolioChart);
      }catch(e){
        console.warn('portfolio chart skipped', e);
        setPortfolioEmpty('Nie udało się załadować wykresu portfela. Odśwież stronę albo sprawdź połączenie z internetem.');
      }
    }catch(e){
      console.warn('portfolio render failed', e);
      setText('portfolioIncome', money(0));
      setText('portfolioCost', money(0));
      setText('portfolioProfit', money(0));
      setHtml('portfolioRanking','<div class="transactions-info">Nie udało się pobrać danych portfela. Szczegóły: '+esc(e.message||e)+'</div>');
      setPortfolioEmpty('Nie udało się pobrać danych do wykresu miesięcznego portfela. Szczegóły: '+esc(e.message||e));
    }
  };

  window.refreshDashboard = async function(){
    if(!document.body.classList.contains('authenticated')) return;
    const pid=activeId(); if(!pid) return;
    const txRows = await selectTransactionRows(pid);
    const rawPayments=liveRows(txRows.payments||[]), rawExpenses=liveRows(txRows.expenses||[]);
    setGlobal('rawPayments', rawPayments); setGlobal('rawExpenses', rawExpenses);
    window.fillFilters();
    const month=el('monthFilter')?.value || 'all', year=el('yearFilter')?.value || 'all';
    let p=rawPayments, e=rawExpenses;
    if(year!=='all'){ p=p.filter(x=>yearKey(Period().actualDate ? Period().actualDate(x) : (x.payment_date || x.created_at))===year); e=e.filter(x=>yearKey(x.expense_date || x.date || x.created_at)===year); }
    if(month!=='all'){ p=p.filter(x=>monthKey(Period().actualDate ? Period().actualDate(x) : (x.payment_date || x.created_at))===month); e=e.filter(x=>monthKey(x.expense_date || x.date || x.created_at)===month); }
    const inc=p.reduce((a,b)=>a+num(b.amount),0), cos=e.reduce((a,b)=>a+num(b.amount),0);
    if(el('income')) el('income').innerText=money(inc); if(el('cost')) el('cost').innerText=money(cos); if(el('profit')) el('profit').innerText=money(inc-cos); if(el('tax')) el('tax').innerText=money(taxFromPayments(p,{fallbackMonths:month!=='all'?1:0}));
    window.updateYearSummary();
    window.renderTransactions(p,e);
    window.renderChart(rawPayments,rawExpenses);
    safeCall(window.renderFinanceSummary); safeCall(window.renderReport); safeCall(window.renderPropertiesList); safeCall(window.renderTenantDetails); window.renderPaymentAlert(); window.renderFinancePro(); window.renderPortfolio(); safeCall(window.renderCommandCenter,p,e);
    if(document.getElementById('tab-documents')?.classList.contains('active')) safeCall(window.loadLibrary);
  };

  window.PureInvestDashboardCore = {refreshDashboard:window.refreshDashboard, renderTransactions:window.renderTransactions, renderPortfolio:window.renderPortfolio, renderFinancePro:window.renderFinancePro};
})();
