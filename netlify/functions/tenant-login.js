const crypto=require('crypto');
const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const {signSession,normPhone,durableTooManyAttempts,recordDurableAttempt,sessionSecret}=require('./_pi-security');
const Period=require('./_pi-payment-period');
const Settlement=require('./_pi-settlement');
const {DEMO_TENANT_PHONE,DEMO_TENANT_PIN,buildDemoTenantSession}=require('./_pi-demo-tenant');
const json=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
const LOGIN_ATTEMPTS=globalThis.__PI_TENANT_LOGIN_ATTEMPTS__ || (globalThis.__PI_TENANT_LOGIN_ATTEMPTS__=new Map());
const requestId=()=>crypto.randomBytes(8).toString('hex');
function clientKey(event,phone){ return `${event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'ip'}:${phone || 'unknown'}`; }
function tooManyAttempts(key){ const now=Date.now(),item=LOGIN_ATTEMPTS.get(key)||{count:0,first:now}; if(now-item.first>15*60*1000){ LOGIN_ATTEMPTS.set(key,{count:0,first:now}); return false; } return item.count>=5; }
function recordAttempt(key,success){ if(success){ LOGIN_ATTEMPTS.delete(key); return; } const now=Date.now(),item=LOGIN_ATTEMPTS.get(key)||{count:0,first:now}; if(now-item.first>15*60*1000) LOGIN_ATTEMPTS.set(key,{count:1,first:now}); else{ item.count+=1; LOGIN_ATTEMPTS.set(key,item); } }
async function sb(path,options={}){
  if(!SUPABASE_URL) throw new Error('SUPABASE_URL_MISSING'); if(!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
  const text=await response.text(); let data=null; try{ data=text?JSON.parse(text):null; }catch(_){ data=text; }
  if(!response.ok) throw new Error(typeof data==='string'?data:(data && (data.message || data.error_description || data.error)) || `SUPABASE_HTTP_${response.status}`);
  return data;
}
async function rpc(name,payload){ return sb(`rpc/${name}`,{method:'POST',body:JSON.stringify(payload || {})}); }
function liveRows(rows){ return (rows || []).filter(Settlement.live); }
function withinTenancy(row,tenancy){
  if(!tenancy) return true;
  if(tenancy.id) return !!row?.tenancy_id && String(row.tenancy_id)===String(tenancy.id);
  const value=Period.normalizeMonth(row?.settlement_month || row?.payment_date || row?.expense_date || row?.date || row?.created_at);
  const start=Period.normalizeMonth(tenancy.start_date),end=Period.normalizeMonth(tenancy.end_date);
  return (!start || !value || value>=start) && (!end || !value || value<=end);
}
function safePayment(row){ return {id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,amount:row.amount,payment_date:Period.actualDate(row),date:Period.actualDate(row),source:row.source || row.category || 'Wpłata',category:row.category || null,settlement_month:Period.settlementMonth(row),note:Period.markerMonth(row.note)?`[[PI:SETTLEMENT_MONTH=${Period.markerMonth(row.note)}]]`:null,transaction_status:row.transaction_status || null,settlement_component:row.settlement_component || null,created_at:row.created_at || Period.actualDate(row)}; }
function safeExpense(row){ return {id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,amount:row.amount,expense_date:row.expense_date || row.date || row.created_at || null,date:row.date || row.expense_date || row.created_at || null,category:row.category || 'Opłata',tenant_due:true,payer:'tenant',transaction_status:row.transaction_status || null,settlement_component:row.settlement_component || null,created_at:row.created_at || row.expense_date || row.date || null}; }
function safeIssue(row){ return {id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,title:row.title,description:row.description,status:row.status,priority:row.priority,category:row.category,room:row.room || row.location || null,permission_to_enter:row.permission_to_enter===true,attachment_url:row.attachment_url || null,attachment_path:row.attachment_path || null,attachment_name:row.attachment_name || null,created_at:row.created_at,updated_at:row.updated_at}; }
function safeMeterReading(row){ return {id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,meter_type:row.meter_type || null,reading_value:row.reading_value ?? null,electricity_reading:row.electricity_reading ?? null,water_reading:row.water_reading ?? null,gas_reading:row.gas_reading ?? null,reading_date:row.reading_date || null,note:row.note || null,created_at:row.created_at || null}; }
function safeDocument(row){ return {id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,title:row.title || row.name || row.file_name,name:row.name || row.title || row.file_name,file_name:row.file_name,file_url:row.file_url,file_path:row.file_path,category:row.category,note:row.note,mime_type:row.mime_type,size_bytes:row.size_bytes,tenant_visible:true,created_at:row.created_at,kind:row.kind}; }
const FEE_MIRROR_CATEGORY='pi_fee_media_report';
const FEE_MIRROR_PREFIX='PI_FEE_REPORT_V1:';
function safeFeeBreakdown(row){ const items=Array.isArray(row?.items)?row.items:[]; const mediaItems=Array.isArray(row?.media_items)?row.media_items:[]; return {id:row?.id,property_id:row?.property_id,effective_month:row?.effective_month,base_amount:Number(row?.base_amount || 0),items,media_items:mediaItems,notes:row?.notes || null,tenant_visible:row?.tenant_visible !== false,updated_at:row?.updated_at || null,source:row?.source || 'pi_fee_breakdowns'}; }
function feeFromDocument(row){
  if(!row || row.category!==FEE_MIRROR_CATEGORY || row.tenant_visible===false) return null;
  const note=String(row.note || '');
  if(!note.startsWith(FEE_MIRROR_PREFIX)) return null;
  try{
    const parsed=JSON.parse(note.slice(FEE_MIRROR_PREFIX.length));
    return safeFeeBreakdown({...parsed,id:parsed.id || `mirror:${row.id}`,property_id:row.property_id,tenant_visible:true,updated_at:row.updated_at || row.created_at,source:'property_documents'});
  }catch(_){ return null; }
}
function mergeFeeBreakdowns(primary,mirrors){
  const byMonth=new Map();
  [...(mirrors || []),...(primary || [])].forEach(raw=>{
    const row=safeFeeBreakdown(raw),key=Period.normalizeMonth(row.effective_month);
    if(!key) return;
    const existing=byMonth.get(key);
    if(!existing){ byMonth.set(key,row); return; }
    const oldTime=Date.parse(existing.updated_at || 0) || 0,newTime=Date.parse(row.updated_at || 0) || 0;
    const oldScore=(existing.items?.length || 0)+(existing.media_items?.length || 0)*2;
    const newScore=(row.items?.length || 0)+(row.media_items?.length || 0)*2;
    if(row.source==='pi_fee_breakdowns' || newTime>oldTime || newScore>oldScore) byMonth.set(key,row);
  });
  return [...byMonth.values()].sort((a,b)=>String(b.effective_month || '').localeCompare(String(a.effective_month || '')));
}
function safeProperty(property,tenancy,items){
  const start=tenancy?.start_date || property.lease_start || property.rent_start || null,end=tenancy?.end_date || property.lease_end || property.rent_end || null;
  return {id:property.id,name:property.name,address:property.address,area_m2:property.area_m2,tenant_name:tenancy?.tenant_name || property.tenant_name,rent_amount:property.rent_amount,owner_rent:property.owner_rent || property.owner_monthly_rent || property.monthly_rent || property.rent || null,monthly_rent:property.monthly_rent || null,community_rent:property.community_rent || null,electricity_expected:property.electricity_expected || null,gas_expected:property.gas_expected || null,water_expected:property.water_expected || null,trash_expected:property.trash_expected || property.garbage_expected || property.waste_expected || null,payment_day:tenancy?.payment_day || property.payment_day || property.rent_due_day,rent_due_day:tenancy?.payment_day || property.rent_due_day,tenancy_id:tenancy?.id || null,tenancy_start:start,tenancy_end:end,lease_start:start,lease_end:end,settlement_items:items,payment_account_number:property.payment_account_number || property.payment_account || property.bank_account || null,payment_account_owner:property.payment_account_owner || property.payment_account_label || property.bank_account_label || null,payment_account_note:property.payment_account_note || null,payment_account:property.payment_account || property.payment_account_number || property.bank_account || null,payment_account_label:property.payment_account_label || property.payment_account_owner || property.bank_account_label || null,owner_phone:property.owner_phone || property.contact_phone || property.manager_phone || null,owner_email:property.owner_email || property.contact_email || property.manager_email || null};
}
async function tenancyFor(property,phone,access){
  if(access?.tenancy_id){ const rows=await sb(`pi_tenancies?id=eq.${encodeURIComponent(access.tenancy_id)}&status=in.(active,notice)&or=(end_date.is.null,end_date.gte.${new Date().toISOString().slice(0,10)})&select=*&limit=1`).catch(()=>[]); return rows?.[0] || null; }
  const rows=await sb(`pi_tenancies?property_id=eq.${encodeURIComponent(property.id)}&tenant_phone_norm=eq.${encodeURIComponent(phone)}&status=in.(active,notice)&order=start_date.desc&select=*&limit=1`).catch(()=>[]);
  return rows?.[0] || null;
}
async function buildTenantSession(property,phone,access){
  const tenancy=await tenancyFor(property,phone,access),propertyId=encodeURIComponent(property.id);
  if(!tenancy) return null;
  const [docsRaw,photosRaw,paymentsRaw,expensesRaw,issuesRaw,meterRaw,itemsRaw,feeBreakdownsRaw]=await Promise.all([
    sb(`property_documents?property_id=eq.${propertyId}&tenant_visible=eq.true&order=created_at.desc&limit=100&select=*`).catch(()=>[]),
    sb(`property_photos?property_id=eq.${propertyId}&tenant_visible=eq.true&order=created_at.desc&limit=100&select=*`).catch(()=>[]),
    sb(`payments?property_id=eq.${propertyId}&order=created_at.asc&limit=1000&select=*`).catch(()=>[]),
    sb(`expenses?property_id=eq.${propertyId}&order=created_at.asc&limit=1000&select=*`).catch(()=>[]),
    sb(`maintenance_requests?property_id=eq.${propertyId}&tenant_phone=eq.${encodeURIComponent(phone)}&order=created_at.desc&limit=50&select=*`).catch(()=>[]),
    sb(`meter_readings?property_id=eq.${propertyId}&tenant_phone=eq.${encodeURIComponent(phone)}&order=reading_date.desc,created_at.desc&limit=50&select=*`).catch(()=>[]),
    sb(`pi_settlement_items?property_id=eq.${propertyId}&active=eq.true&order=effective_from.asc,created_at.asc&limit=200&select=*`).catch(()=>[]),
    sb(`pi_fee_breakdowns?property_id=eq.${propertyId}&tenant_visible=eq.true&order=effective_month.desc&limit=36&select=id,property_id,effective_month,base_amount,items,media_items,notes,tenant_visible,updated_at`).catch(()=>[])
  ]);
  const payments=liveRows(paymentsRaw).filter(row=>withinTenancy(row,tenancy)),expenses=liveRows(expensesRaw).filter(row=>withinTenancy(row,tenancy) && Settlement.tenantExpense(row));
  const items=(itemsRaw || []).filter(row=>!row.tenancy_id || !tenancy?.id || String(row.tenancy_id)===String(tenancy.id));
  const propertyView=safeProperty(property,tenancy,items),settlementHistory=Settlement.history({property:propertyView,tenancy,settlementItems:items,payments,expenses,targetMonth:new Date(),months:12}),current=settlementHistory.find(row=>row.key===Period.normalizeMonth(new Date())) || settlementHistory.at(-1) || null;
  const feeMirrorDocs=(docsRaw || []).filter(row=>row?.category===FEE_MIRROR_CATEGORY && row?.tenant_visible!==false && (!row?.tenancy_id || !tenancy?.id || String(row.tenancy_id)===String(tenancy.id)));
  const documentRows=[...(docsRaw || []).filter(row=>row?.category!==FEE_MIRROR_CATEGORY),...(photosRaw || []).map(row=>({...row,kind:'photo'}))].filter(row=>withinTenancy(row,tenancy)).map(safeDocument);
  const issues=(issuesRaw || []).filter(row=>withinTenancy(row,tenancy)).map(safeIssue),meterReadings=(meterRaw || []).filter(row=>withinTenancy(row,tenancy)).slice(0,12).map(safeMeterReading);
  const feeRows=mergeFeeBreakdowns((feeBreakdownsRaw || []).filter(row=>row?.tenant_visible!==false).map(safeFeeBreakdown),feeMirrorDocs.map(feeFromDocument).filter(Boolean));
  const feeStart=Period.normalizeMonth(tenancy?.start_date),feeEnd=Period.normalizeMonth(tenancy?.end_date);
  const feeInRange=feeRows.filter(row=>{ const month=Period.normalizeMonth(row.effective_month); return (!feeStart || !month || month>=feeStart) && (!feeEnd || !month || month<=feeEnd); });
  const feeBaseline=feeStart ? feeRows.find(row=>{ const month=Period.normalizeMonth(row.effective_month); return month && month<feeStart; }) : null;
  const feeBreakdowns=[...feeInRange,...(feeBaseline && !feeInRange.some(row=>String(row.id)===String(feeBaseline.id)) ? [feeBaseline] : [])].sort((a,b)=>String(b.effective_month || '').localeCompare(String(a.effective_month || '')));
  const visibleMonths=new Set(settlementHistory.map(row=>row.key)),safePayments=payments.filter(row=>visibleMonths.has(Period.settlementMonth(row))).map(safePayment),safeExpenses=expenses.filter(row=>visibleMonths.has(Period.normalizeMonth(row.expense_date || row.date || row.created_at))).map(safeExpense);
  const tenantToken=signSession({role:'tenant',propertyId:property.id,tenancyId:tenancy?.id || null,phone},8*60*60);
  return {ok:true,_clientVersion:'1.9.19',property:propertyView,tenancy:{id:tenancy?.id || null,start_date:tenancy?.start_date || null,end_date:tenancy?.end_date || null,status:tenancy?.status || 'active'},documents:documentRows,issues,meterReadings,feeBreakdowns,payments:safePayments,expenses:safeExpenses,settlementHistory,currentSettlement:current,paidThisMonth:!!(current && ['ok','overpaid','paid-late'].includes(current.code)),tenantToken,sessionExpiresInHours:8};
}

exports.handler=async function(event){
  if(event.httpMethod!=='POST') return json(405,{ok:false,message:'Użyj POST.'});
  let body={}; try{ body=JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane.'}); }
  const phone=normPhone(body.phone),pin=String(body.pin || '').trim(); if(!phone || !pin) return json(400,{ok:false,message:'Podaj numer telefonu i kod dostępu.'});
  try{ sessionSecret(); }catch(_){ return json(500,{ok:false,message:'Panel najemcy jest chwilowo niedostępny.'}); }
  if(phone===DEMO_TENANT_PHONE || phone===`48${DEMO_TENANT_PHONE}`){
    if(pin!==DEMO_TENANT_PIN) return json(403,{ok:false,message:'Nieprawidłowy numer telefonu lub PIN konta demonstracyjnego.'});
    return json(200,buildDemoTenantSession(new Date()));
  }
  const attemptKey=clientKey(event,phone); if(tooManyAttempts(attemptKey) || await durableTooManyAttempts(sb,event,phone,'tenant')) return json(429,{ok:false,message:'Zbyt wiele błędnych prób. Spróbuj ponownie za kilka minut.'});
  const trace=requestId();
  try{
    const access=await rpc('pi_verify_tenant_login',{p_phone:phone,p_pin:pin});
    if(!Array.isArray(access) || !access.length){ recordAttempt(attemptKey,false); await recordDurableAttempt(sb,event,phone,'tenant',false); return json(403,{ok:false,message:'Brak aktywnego dostępu dla podanego numeru lub PIN-u.'}); }
    const sessions=[];
    for(const row of access){
      if(!row.property_id) continue;
      const properties=await sb(`properties?id=eq.${encodeURIComponent(row.property_id)}&select=*&limit=1`); if(properties?.[0]){ const session=await buildTenantSession(properties[0],phone,row); if(session) sessions.push(session); }
    }
    if(!sessions.length){ recordAttempt(attemptKey,false); return json(403,{ok:false,message:'Dostęp nie ma przypisanej aktywnej umowy najmu.'}); }
    recordAttempt(attemptKey,true); await recordDurableAttempt(sb,event,phone,'tenant',true);
    if(sessions.length===1) return json(200,sessions[0]);
    return json(200,{ok:true,multiple:true,properties:sessions.map(session=>session.property),sessions});
  }catch(error){ console.error('TENANT_LOGIN_ERROR',trace,error); return json(500,{ok:false,message:'Panel najemcy jest chwilowo niedostępny. Spróbuj ponownie później.',requestId:trace}); }
};
