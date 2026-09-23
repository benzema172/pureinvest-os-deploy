const { requireRoles, sbAdminClient } = require('./_pi-security');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const json = (statusCode, body) => ({ statusCode, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}, body:JSON.stringify(body) });

const REQUIRED = {
  properties:['id','name','address','city','postal_code','area_m2','rent_amount','owner_rent','community_rent','electricity_expected','gas_expected','water_expected','payment_day','rent_due_day','tenant_name','tenant_phone','tenant_email','tenant_access_enabled','payment_account','payment_account_label','purchase_price','purchase_date','equity_invested'],
  payments:['id','property_id','tenancy_id','amount','payment_date','date','source','category','note','settlement_month','transaction_status','transaction_source','settlement_component','is_deleted','deleted_at','attachment_url','attachment_path','attachment_name'],
  expenses:['id','property_id','tenancy_id','amount','expense_date','date','category','vendor','note','transaction_status','transaction_source','settlement_component','tenant_due','payer','is_deleted','deleted_at','attachment_url','attachment_path','attachment_name'],
  pi_user_roles:['id','user_id','email','role','is_active','created_at','updated_at'],
  profiles:['id','user_id','email','display_name','role','status'],
  pi_tenancies:['id','property_id','tenant_name','tenant_phone_norm','start_date','end_date','payment_day','status'],
  pi_settlement_items:['id','property_id','tenancy_id','kind','name','component','default_amount','payer','tenant_due','effective_from','effective_to','active'],
  pi_property_access:['id','property_id','tenancy_id','access_role','status','display_name','user_email','user_phone','user_phone_norm','access_pin_hash'],
  property_documents:['id','property_id','tenancy_id','title','name','file_name','file_url','file_path','category','note','mime_type','size_bytes','tenant_visible','owner_visible'],
  property_photos:['id','property_id','tenancy_id','title','name','file_name','file_url','file_path','category','note','mime_type','size_bytes','tenant_visible','owner_visible'],
  maintenance_requests:['id','property_id','tenancy_id','title','description','status','priority','tenant_phone','attachment_url','attachment_path','attachment_name'],
  meter_readings:['id','property_id','tenancy_id','meter_type','reading_value','reading_date','electricity_reading','water_reading','gas_reading','tenant_phone','note'],
  activity_log:['id','action','entity_type','entity_id','property_id','actor_role','before_data','after_data','created_at'],
  pi_login_attempts:['id','attempt_key','channel','phone_hash','ip_hash','success','created_at'],
  payment_reminder_log:['id','property_id','channel','recipient','status','payload','created_at'],
  generated_reports:['id','report_type','report_action','report_scope','report_period','balance','property_id','created_at']
};
const OPTIONAL = {
  gmail_connections:['id','gmail_email','status','access_token_encrypted','refresh_token_encrypted','initial_scan_from','scan_interval_hours','last_scan_at','last_scan_status'],
  gmail_scan_runs:['id','connection_id','status','run_type','started_at','finished_at','from_date','scan_from','scan_to','messages_checked','messages_seen','candidates_created','duplicates_skipped','trusted_senders_count','error'],
  trusted_email_senders:['id','email','sender_email','vendor_name','sender_name','default_category','default_property_id','read_pdf','scan_interval_hours','is_active'],
  email_cost_candidates:['id','connection_id','gmail_message_id','gmail_thread_id','gmail_account_email','sender_email','subject','detected_amount','detected_vendor','detected_category','detected_due_date','detected_invoice_number','confidence','raw_excerpt','attachment_name','source','status','approved_transaction_id','expense_id']
};
const BUCKETS = ['property-documents','property-photos','transaction-attachments'];
function envCheck(name, ok, message, optional=false){ return {name, status: ok ? 'ok' : optional ? 'warn' : 'fail', message}; }
async function rest(path, options={}){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}`, 'Content-Type':'application/json', Prefer:'return=representation', ...(options.headers||{}) } });
  const text = await res.text(); let body=null;
  try{ body = text ? JSON.parse(text) : null; }catch(_){ body=text; }
  if(!res.ok) throw new Error(typeof body === 'string' ? body : (body && (body.message || body.details || body.error)) || `HTTP_${res.status}`);
  return body;
}
async function tableCheck(table, cols, optional=false){
  try{
    await rest(`${table}?select=${encodeURIComponent(cols.join(','))}&limit=1`, { headers:{ Prefer:'' } });
    return {name:`SQL tabela ${table}`, status:'ok', message:`Tabela i wymagane kolumny są dostępne.`, details:[`${cols.length} kolumn sprawdzonych`]};
  }catch(e){
    return {name:`SQL tabela ${table}`, status:optional?'warn':'fail', message:optional?`Opcjonalny moduł ${table} nie jest skonfigurowany.`:`Brak tabeli albo kolumn w ${table}.`, details:[String(e.message || e)]};
  }
}
async function bucketCheck(bucket){
  try{
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(bucket)}`, { headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
    const text = await res.text(); let body=null; try{ body=text?JSON.parse(text):null; }catch(_){ body=text; }
    if(!res.ok) throw new Error(`HTTP_${res.status}`);
    const isPublic = !!(body && body.public);
    return {name:`Storage ${bucket}`, status:isPublic?'fail':'ok', message:isPublic?'Bucket istnieje, ale jest publiczny — Aplikacja wymaga prywatnego Storage.':'Bucket istnieje i jest prywatny.'};
  }catch(e){ return {name:`Storage ${bucket}`, status:'fail', message:'Brak bucketa albo polityki Storage.', details:[String(e.message || e)]}; }
}
async function functionCheck(name){
  try{
    const res = await fetch(`${process.env.URL || ''}/.netlify/functions/${name}`, { method:'OPTIONS' }).catch(()=>null);
    return {name:`Netlify ${name}`, status:'warn', message:'Funkcja powinna istnieć po deployu. Jeżeli diagnostyka działa lokalnie, sprawdź na domenie produkcyjnej.', details:[`Sprawdź /.netlify/functions/${name}`]};
  }catch(_){ return {name:`Netlify ${name}`, status:'warn', message:'Nie sprawdzono funkcji pomocniczej.'}; }
}
exports.handler = async function(event){
  if(event.httpMethod !== 'POST') return json(405,{ok:false,message:'Użyj POST.'});
  const requester = await requireRoles(event, ['admin']);
  if(!requester) return json(401,{ok:false,message:'Diagnostyka serwerowa jest dostępna tylko dla administratora.'});
  const checks = [];
  checks.push(envCheck('SUPABASE_URL', !!SUPABASE_URL, SUPABASE_URL ? 'Zmienna Supabase URL jest ustawiona.' : 'Brakuje SUPABASE_URL w Netlify.'));
  checks.push(envCheck('SUPABASE_SERVICE_ROLE_KEY', !!SERVICE_KEY, SERVICE_KEY ? 'Service role key jest ustawiony po stronie Netlify.' : 'Brakuje service role key w Netlify.'));
  checks.push(envCheck('PI_SESSION_SECRET', !!(process.env.PI_SESSION_SECRET && process.env.PI_SESSION_SECRET.length >= 32), 'Sekret sesji owner/tenant ma min. 32 znaki.'));
  checks.push(envCheck('Gmail OAuth', !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), 'Gmail wymaga GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET.', true));
  checks.push(envCheck('Public config safety', true, 'Publiczna konfiguracja frontendu jest w js/config.js, a sekrety zostają w Netlify ENV.'));
  if(SUPABASE_URL && SERVICE_KEY){
    for(const [t, cols] of Object.entries(REQUIRED)) checks.push(await tableCheck(t, cols));
    for(const [t, cols] of Object.entries(OPTIONAL)) checks.push(await tableCheck(t, cols, true));
    for(const bucket of BUCKETS) checks.push(await bucketCheck(bucket));
    try{
      await rest('pi_user_roles?role=eq.admin&is_active=eq.true&select=id,email,user_id&limit=1', { headers:{ Prefer:'' } });
      checks.push({name:'Admin role', status:'ok', message:'Tabela ról admina odpowiada poprawnie.'});
    }catch(e){ checks.push({name:'Admin role', status:'fail', message:'Nie udało się sprawdzić roli admina.', details:[String(e.message||e)]}); }
  }
  checks.push({name:'Signed storage URL', status:'ok', message:'Prywatne pliki są obsługiwane przez bezpieczne signed URLs.'});
  const fail = checks.filter(c => c.status === 'fail').length;
  const warn = checks.filter(c => c.status === 'warn').length;
  return json(200,{ok:true,version:'1.9.0',build:'2026-08-03-final-data-model',summary:{fail,warn,ok:checks.length-fail-warn},checks});
};
