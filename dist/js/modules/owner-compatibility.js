(function(){
  if(window.__PI_V762_COMPATIBILITY__) return;
  window.__PI_V762_COMPATIBILITY__ = true;

  const OWNER_TABLES = new Set(['properties','payments','expenses','property_documents','property_photos','maintenance_requests','meter_readings','pi_property_access','pi_tenancies','pi_settlement_items']);
  const READONLY_TABLES = new Set(['properties','property_documents','property_photos','maintenance_requests','meter_readings','pi_property_access','pi_tenancies','pi_settlement_items']);

  function ownerSession(){
    try{return window.piOwnerSessionV570 || JSON.parse(sessionStorage.getItem('piOwnerSessionV570')||'null');}catch(_){return null;}
  }
  function isOwnerSession(){ const s=ownerSession(); return !!(s && s.ownerToken && Array.isArray(s.propertyIds) && s.propertyIds.length); }
  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function money(v){const n=Number(v||0);return n.toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł';}
  function toast(msg,type){ try{ if(typeof piToastV761==='function') return piToastV761(msg,type); }catch(_){} console.log(msg); }

  const __piAuthHeadersBaseV762 = (typeof window.piAuthHeadersV761 === 'function' && window.piAuthHeadersV761 !== window.piAuthHeadersV762)
    ? window.piAuthHeadersV761
    : (typeof window.piAuthHeadersV760 === 'function' && window.piAuthHeadersV760 !== window.piAuthHeadersV762)
      ? window.piAuthHeadersV760
      : null;

  window.piAuthHeadersV762 = async function(extra){
    const headers = __piAuthHeadersBaseV762
      ? await __piAuthHeadersBaseV762(extra || {})
      : Object.assign({'Accept':'application/json'}, extra || {});

    try{
      const owner = JSON.parse(sessionStorage.getItem('piOwnerSessionV570') || 'null');
      if(owner && owner.ownerToken) headers['X-PI-Session-Token'] = owner.ownerToken;
    }catch(_){}
    try{
      const tenant = JSON.parse(sessionStorage.getItem('piTenantSessionV54') || sessionStorage.getItem('piTenantSessionV570') || 'null');
      if(tenant && tenant.tenantToken && !headers['X-PI-Session-Token']) headers['X-PI-Session-Token'] = tenant.tenantToken;
    }catch(_){}
    try{
      const friend = JSON.parse(sessionStorage.getItem('piFriendSessionV1') || 'null');
      if(friend && friend.friendToken && !headers['X-PI-Session-Token']) headers['X-PI-Session-Token'] = friend.friendToken;
    }catch(_){}
    return headers;
  };
  window.piAuthHeadersV761 = window.piAuthHeadersV762;
  if(!window.piAuthHeadersV760) window.piAuthHeadersV760 = window.piAuthHeadersV762;

  function normalizeFilters(filters){ return (filters||[]).filter(f=>f && f.column && f.op); }
  function ownerQuery(table){
    const q={table, action:'select', select:'*', filters:[], order:null, limit:null, payload:null};
    let executed=false;
    const api={
      select(cols){ q.select=cols||'*'; return api; },
      insert(payload){ q.action='insert'; q.payload=payload; return api; },
      update(payload){ q.action='update'; q.payload=payload||{}; return api; },
      delete(){ q.action='delete'; return api; },
      eq(column,value){ q.filters.push({op:'eq',column,value}); return api; },
      neq(column,value){ q.filters.push({op:'neq',column,value}); return api; },
      in(column,values){ q.filters.push({op:'in',column,values:Array.isArray(values)?values:[values]}); return api; },
      gte(column,value){ q.filters.push({op:'gte',column,value}); return api; },
      gt(column,value){ q.filters.push({op:'gt',column,value}); return api; },
      lte(column,value){ q.filters.push({op:'lte',column,value}); return api; },
      lt(column,value){ q.filters.push({op:'lt',column,value}); return api; },
      order(column,options){ q.order={column, ascending:!(options&&options.ascending===false), nullsFirst:!!(options&&options.nullsFirst)}; return api; },
      limit(n){ q.limit=Number(n)||null; return api; },
      range(from,to){ q.range={from:Number(from)||0,to:Number(to)||0}; return api; },
      maybeSingle(){ return exec().then(r=> r.error ? r : {data:Array.isArray(r.data)?(r.data[0]||null):r.data||null,error:null}); },
      single(){ return exec().then(r=> r.error ? r : {data:Array.isArray(r.data)?(r.data[0]||null):r.data,error:null}); },
      then(resolve,reject){ return exec().then(resolve,reject); },
      catch(reject){ return exec().catch(reject); }
    };
    async function exec(){
      if(executed && q.action !== 'select') return {data:null,error:{message:'Zapytanie owner zostało już wykonane.'}};
      executed=true;
      try{
        const headers = await window.piAuthHeadersV762({'Content-Type':'application/json'});
        const res = await fetch('/.netlify/functions/owner-data',{method:'POST',headers,body:JSON.stringify({...q, filters:normalizeFilters(q.filters)})});
        const body = await res.json().catch(()=>({ok:false,message:'Nieprawidłowa odpowiedź owner-data.'}));
        if(!res.ok || !body.ok) return {data:null,error:{message:body.message||body.details||('owner-data HTTP '+res.status)}};
        return {data:body.data,error:null,count:body.count||null};
      }catch(e){ return {data:null,error:{message:String(e.message||e)}}; }
    }
    return api;
  }

  function installOwnerDbProxy(){
    if(!isOwnerSession()) return;
    const client = window.db || window.piDb;
    if(!client || client.__piOwnerProxyV762) return;
    const originalFrom = client.from.bind(client);
    client.__piOriginalFromV762 = originalFrom;
    client.from = function(table){
      if(isOwnerSession() && OWNER_TABLES.has(String(table))) return ownerQuery(String(table));
      return originalFrom(table);
    };
    client.__piOwnerProxyV762 = true;
    if(window.piDb === client) window.piDb = client;
    if(window.db === client) window.db = client;
  }

  window.piInstallOwnerDbProxyV762 = installOwnerDbProxy;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(installOwnerDbProxy,100));
  const oldShowWelcome = window.showWelcome;
  if(typeof oldShowWelcome === 'function'){
    window.showWelcome = function(){ installOwnerDbProxy(); return oldShowWelcome.apply(this, arguments); };
  }
  const oldOpenDashboard = window.openDashboard;
  if(typeof oldOpenDashboard === 'function'){
    window.openDashboard = function(){ installOwnerDbProxy(); return oldOpenDashboard.apply(this, arguments); };
  }

  const oldRequireManager = window.piRequireManager;
  window.piRequireManager = function(actionName){
    try{ if(typeof piRole === 'function' && piRole() === 'admin') return true; }catch(_){}
    if(isOwnerSession()){
      toast('Ten dostęp owner jest w trybem bezpiecznego podglądu. Edycję wykonuje administrator.', 'warn');
      return false;
    }
    return typeof oldRequireManager === 'function' ? oldRequireManager(actionName) : false;
  };

  window.piExportPropertyFinanceCsv = function(){
    const rows = Array.isArray(window.__piPropertyFinanceLastVisible) ? window.__piPropertyFinanceLastVisible : [];
    if(!rows.length){ toast('Brak danych do eksportu CSV.', 'warn'); return; }
    const header=['Data','Typ','Nazwa','Kwota','Status','Źródło','Składnik','Notatka'];
    const csv=[header].concat(rows.map(r=>[
      r.date||'', r.type==='income'?'Wpływ':'Koszt', r.name||'', Number(r.amount||0).toFixed(2).replace('.',','), r.transaction_status||'', r.transaction_source||'', r.settlement_component||'', String(r.note||'').replace(/\r?\n/g,' ')
    ])).map(line=>line.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='PureInvest_finanse_mieszkania.csv'; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},500);
  };

  window.piExportPropertyFinancePdf = async function(){
    const rows = Array.isArray(window.__piPropertyFinanceLastVisible) ? window.__piPropertyFinanceLastVisible : [];
    if(!rows.length){ toast('Brak danych do eksportu PDF.', 'warn'); return; }
    try{
      const lib = window.jspdf || window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
      const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      if(!jsPDF) throw new Error('Biblioteka jsPDF nie jest załadowana.');
      const doc = new jsPDF();
      let y=16;
      doc.setFontSize(14); doc.text('PureInvest - Finanse mieszkania', 14, y); y+=8;
      doc.setFontSize(9);
      const selected=document.getElementById('piPropertyFinanceSelect')?.selectedOptions?.[0]?.textContent||'';
      if(selected){ doc.text('Mieszkanie: '+selected.slice(0,80),14,y); y+=7; }
      rows.slice(0,80).forEach((r,i)=>{
        if(y>280){ doc.addPage(); y=16; }
        const line = `${i+1}. ${String(r.date||'').slice(0,10)} | ${r.type==='income'?'Wpływ':'Koszt'} | ${r.name||''} | ${money(r.amount||0)}`;
        doc.text(line.slice(0,110),14,y); y+=5;
        if(r.note){ doc.text(('Notatka: '+String(r.note).replace(/\s+/g,' ')).slice(0,110),18,y); y+=5; }
      });
      doc.save('PureInvest_finanse_mieszkania.pdf');
    }catch(e){ toast('Nie udało się wygenerować PDF: '+(e.message||e), 'warn'); }
  };

  const oldRenderPF = window.piRenderPropertyFinance;
  if(typeof oldRenderPF === 'function'){
    window.piRenderPropertyFinance = async function(){
      const out = await oldRenderPF.apply(this, arguments);
      if(isOwnerSession()) document.querySelectorAll('[data-pi-tx-edit], [data-pi-tx-delete]').forEach(b=>{ b.disabled=true; b.title='Edycja dostępna tylko dla administratora.'; b.style.opacity='.45'; });
      return out;
    };
  }
})();
