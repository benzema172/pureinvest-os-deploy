'use strict';

const { requireRoles } = require('./_pi-security');
const { buildDemoData } = require('./_pi-demo-data');

const json = (statusCode, body) => ({
  statusCode,
  headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
  body:JSON.stringify(body)
});

const SAFE = {
  properties:['id','name','address','city','postal_code','area_m2','area','size_m2','purchase_price','market_value','purchase_date','equity_invested','owner_rent','monthly_rent','rent_amount','community_rent','electricity_expected','gas_expected','water_expected','trash_expected','garbage_expected','waste_expected','payment_day','rent_due_day','lease_start','rent_start','lease_end','tenant_name','tenant_phone','tenant_email','tenant_access_enabled','payment_account','payment_account_label','payment_account_number','payment_account_owner','payment_note','bank_account','bank_account_label','settlement_items','created_at','updated_at'],
  payments:['id','property_id','tenancy_id','amount','payment_date','date','source','category','note','month','settlement_month','created_at','updated_at','deleted_at','is_deleted','deleted_note','transaction_status','transaction_source','settlement_component','tenant_due','payer','taxable','attachment_url','attachment_path','attachment_name'],
  expenses:['id','property_id','tenancy_id','amount','expense_date','date','category','vendor','note','month','settlement_month','created_at','updated_at','deleted_at','is_deleted','deleted_note','transaction_status','transaction_source','settlement_component','tenant_due','payer','taxable','attachment_url','attachment_path','attachment_name'],
  property_documents:['id','property_id','title','name','file_name','file_url','file_path','category','note','mime_type','size_bytes','tenant_visible','owner_visible','created_at','updated_at'],
  property_photos:['id','property_id','title','name','file_name','file_url','file_path','category','note','mime_type','size_bytes','tenant_visible','owner_visible','created_at','updated_at'],
  maintenance_requests:['id','property_id','tenant_phone','title','description','status','priority','created_by_role','attachment_url','attachment_path','attachment_name','created_at','updated_at'],
  meter_readings:['id','property_id','tenant_phone','meter_type','reading_value','electricity_reading','water_reading','gas_reading','reading_date','note','created_by_role','created_at','updated_at'],
  pi_property_access:['id','property_id','user_id','user_email','user_phone','display_name','access_role','status','created_by','tenancy_id','created_at','updated_at'],
  pi_tenancies:['id','property_id','tenant_name','tenant_phone','tenant_phone_norm','tenant_email','start_date','end_date','payment_day','status','created_at','updated_at'],
  pi_settlement_items:['id','property_id','tenancy_id','scope','kind','name','component','default_amount','recurring','payer','tenant_due','taxable','effective_from','effective_to','active','created_at','updated_at'],
  pi_fee_breakdowns:['id','property_id','effective_month','base_amount','items','media_items','notes','tenant_visible','source','created_at','updated_at'],
  activity_log:['id','action','entity_type','entity_id','property_id','actor_role','before_data','after_data','created_at'],
  payment_reminder_log:['id','property_id','channel','recipient','status','payload','created_at'],
  generated_reports:['id','report_type','report_action','report_scope','report_period','balance','property_id','file_path','created_at'],
  trusted_email_senders:['id','email','sender_email','vendor_name','sender_name','default_category','default_property_id','read_pdf','scan_interval_hours','is_active','created_at','updated_at'],
  email_cost_candidates:['id','connection_id','gmail_message_id','gmail_thread_id','gmail_account_email','sender_email','subject','detected_amount','detected_vendor','detected_category','detected_due_date','detected_invoice_number','confidence','raw_excerpt','attachment_name','source','status','approved_transaction_id','expense_id','created_at','updated_at']
};
const OPS = new Set(['eq','neq','gte','gt','lte','lt','in','is']);
const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
let cache={month:'',data:null};

function demoData(){
  const month=new Date().toISOString().slice(0,7);
  if(!cache.data || cache.month !== month) cache={month,data:buildDemoData(new Date())};
  return cache.data;
}
function safeSelect(table, select){
  const cols = SAFE[table] || [];
  const requested = String(select || '').split(',').map(value=>value.trim()).filter(Boolean);
  if(!requested.length || requested.includes('*')) return cols;
  const allowed = new Set(cols);
  const chosen = requested.filter(column=>SAFE_COL.test(column) && allowed.has(column));
  return chosen.length ? chosen : cols;
}
function compare(a,b,ascending){
  const av = a === undefined || a === null ? '' : a;
  const bv = b === undefined || b === null ? '' : b;
  if(av === bv) return 0;
  return (av > bv ? 1 : -1) * (ascending === false ? -1 : 1);
}
function filterRows(rows, filter){
  const column=String(filter.column || ''),op=String(filter.op || ''),value=filter.value ?? filter.values;
  if(!SAFE_COL.test(column) || !OPS.has(op)) return rows;
  return rows.filter(row=>{
    const actual=row[column];
    if(op === 'eq') return String(actual) === String(value);
    if(op === 'neq') return String(actual) !== String(value);
    if(op === 'gte') return String(actual) >= String(value);
    if(op === 'gt') return String(actual) > String(value);
    if(op === 'lte') return String(actual) <= String(value);
    if(op === 'lt') return String(actual) < String(value);
    if(op === 'in') return (Array.isArray(value) ? value : [value]).map(String).includes(String(actual));
    if(op === 'is') return value === null || value === 'null' ? actual === null || actual === undefined : String(actual) === String(value);
    return true;
  });
}
function applyDemoQuery(body){
  const table=String(body.table || '');
  if(!SAFE[table]) throw new Error('FRIEND_TABLE_NOT_ALLOWED');
  let rows=Array.from(demoData()[table] || []);
  for(const filter of Array.isArray(body.filters) ? body.filters : []){
    if((SAFE[table] || []).includes(String(filter.column || ''))) rows=filterRows(rows,filter);
  }
  if(body.order && SAFE_COL.test(String(body.order.column || '')) && SAFE[table].includes(String(body.order.column))){
    const column=String(body.order.column);
    rows.sort((a,b)=>compare(a[column],b[column],body.order.ascending !== false));
  }
  if(body.range && Number.isFinite(Number(body.range.from)) && Number.isFinite(Number(body.range.to))){
    rows=rows.slice(Number(body.range.from),Number(body.range.to)+1);
  }else if(body.limit){
    rows=rows.slice(0,Math.max(1,Math.min(1000,Number(body.limit)||100)));
  }
  const selected=safeSelect(table,body.select);
  return rows.map(row=>Object.fromEntries(selected.map(column=>[column,row[column] ?? null])));
}

exports.handler = async function(event){
  if(event.httpMethod !== 'POST') return json(405,{ok:false,message:'Użyj POST.'});
  const requester = await requireRoles(event,['friend']);
  if(!requester || requester.role !== 'friend') return json(401,{ok:false,message:'Brak aktywnego trybu demonstracyjnego.'});
  let body={};
  try{ body=JSON.parse(event.body || '{}'); }
  catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane wejściowe.'}); }
  const action=String(body.action || 'select').toLowerCase();
  if(action !== 'select') return json(200,{ok:true,sandbox:true,data:[],message:'Konto demonstracyjne: operacja została zasymulowana bez zapisu do bazy.'});
  try{
    const data=applyDemoQuery(body);
    return json(200,{ok:true,data,count:data.length,sandbox:true,demo:true,message:'Bezpieczne dane demonstracyjne PureInvest.'});
  }catch(_){
    return json(400,{ok:false,message:'Nieprawidłowe zapytanie konta demonstracyjnego.'});
  }
};

exports.__demo={SAFE,demoData,applyDemoQuery};
