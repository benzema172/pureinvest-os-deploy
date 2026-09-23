const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const { requireRequester } = require('./_pi-security');

const cors = {
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store'
};
const json = (statusCode, body) => ({statusCode, headers:cors, body:JSON.stringify(body)});
function cleanString(v, max=120){ return String(v || '').slice(0, max); }
function cleanJson(value){
  if(value === null || value === undefined) return null;
  try{ const text=JSON.stringify(value); return text.length<=12000 ? JSON.parse(text) : {truncated:true}; }catch(_){ return null; }
}
function cleanUuid(v){
  const s = String(v || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}
function allowedPropertyFor(requester, requested){
  if(!requester) return null;
  if(requester.role === 'admin') return cleanUuid(requested);
  const s = requester.session || {};
  if(requester.role === 'tenant') return cleanUuid(s.propertyId);
  if(requester.role === 'owner'){
    const ids = Array.isArray(s.propertyIds) ? s.propertyIds.map(String) : [];
    if(requested && ids.includes(String(requested))) return cleanUuid(requested);
    return cleanUuid(ids[0] || '');
  }
  return null;
}
async function insertRow(row){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
    method:'POST',
    headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}`, 'Content-Type':'application/json', Prefer:'return=minimal' },
    body:JSON.stringify([row])
  });
  if(!res.ok) throw new Error(await res.text());
}

exports.handler = async function(event){
  if(event.httpMethod === 'OPTIONS') return {statusCode:204, headers:cors, body:''};
  if(event.httpMethod !== 'POST') return json(405, {ok:false, message:'Use POST.'});
  if(!SUPABASE_URL || !SERVICE_KEY) return json(200, {ok:false, skipped:true, reason:'missing_backend_env'});

  let body = {};
  try{ body = JSON.parse(event.body || '{}'); }catch(_){ return json(400, {ok:false, message:'Invalid JSON.'}); }

  const requester = await requireRequester(event, { roles:['admin','owner','tenant'] });
  if(!requester) return json(403, {ok:false, message:'Activity log requires a valid session.'});

  const requestedProperty = cleanUuid(body.property_id);
  const propertyId = allowedPropertyFor(requester, requestedProperty);
  if(requester.role !== 'admin' && requestedProperty && !propertyId){
    return json(403, {ok:false, message:'Brak dostępu do tego mieszkania w dzienniku aktywności.'});
  }

  const row = {
    action: cleanString(body.action, 80),
    entity_type: cleanString(body.entity_type, 80),
    entity_id: cleanString(body.entity_id, 120),
    property_id: propertyId,
    actor_role: cleanString(requester.role || 'unknown', 40),
    actor_id: requester.session?.phone || requester.user?.id || requester.type || null,
    actor_user_id: requester.user?.id || null,
    before_data: cleanJson(body.before_data),
    after_data: cleanJson(body.after_data),
    created_at: new Date().toISOString()
  };

  try{
    await insertRow(row);
    return json(200, {ok:true});
  }catch(e){
    const requestId=require('crypto').randomBytes(8).toString('hex'); console.error('ACTIVITY_LOG_ERROR',requestId,e);
    return json(500, {ok:false, message:'Nie udało się zapisać dziennika aktywności.', requestId});
  }
};
