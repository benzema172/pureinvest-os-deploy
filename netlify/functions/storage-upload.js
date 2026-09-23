const { requireRoles, verifySession, tenantSessionIsActive, sbAdminClient } = require('./_pi-security');
const { verifyDemoTenantToken } = require('./_pi-demo-tenant');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const ALLOWED_BUCKETS = new Set(['property-documents','property-photos','transaction-attachments']);
const json = (statusCode, body) => ({ statusCode, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}, body:JSON.stringify(body) });
function clean(v){ return String(v || '').replace(/^\/+/, '').replace(/\.\./g, '').trim(); }
function safeFileName(v){ return String(v || 'plik').normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,140) || 'plik'; }
function isAllowedContentType(bucket, type){
  const value = String(type || '').toLowerCase();
  if(bucket === 'property-photos') return value.startsWith('image/');
  if(bucket === 'transaction-attachments') return value.startsWith('image/') || value === 'application/pdf';
  return value.startsWith('image/') || value === 'application/pdf' || value.includes('word') || value.includes('officedocument') || value === 'text/plain';
}
function hasAccess(requester, propertyId){
  if(!requester) return false;
  if(requester.role === 'admin') return true;
  const s = requester.session || {};
  if(requester.role === 'owner') return Array.isArray(s.propertyIds) && s.propertyIds.map(String).includes(String(propertyId));
  if(requester.role === 'tenant') return String(s.propertyId || '') === String(propertyId);
  return false;
}
async function resolveRequester(event, body){
  const byHeader = await requireRoles(event, ['admin','owner','tenant']).catch(()=>null);
  if(byHeader) return byHeader;
  const propertyId = String(body.propertyId || '');
  const tenantToken = String(body.tenantToken || '');
  if(tenantToken && propertyId){
    const session = verifySession(tenantToken, {roles:['tenant'], propertyId});
    if(session) return { ok:true, type:'body_tenant_token', role:'tenant', session };
  }
  return null;
}
async function uploadObject(bucket, path, buf, contentType){
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
    method:'POST',
    headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}`, 'Content-Type':contentType || 'application/octet-stream', 'x-upsert':'false' },
    body:buf
  });
  const text = await res.text(); let body=null; try{ body=text?JSON.parse(text):null; }catch(_){ body=text; }
  if(!res.ok) throw new Error(typeof body === 'string' ? body : (body && (body.message || body.error || body.error_description)) || `STORAGE_HTTP_${res.status}`);
  return body;
}
exports.handler = async function(event){
  if(event.httpMethod !== 'POST') return json(405,{ok:false,message:'Użyj POST.'});
  let body={}; try{ body=JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane wejściowe.'}); }
  const bucket = String(body.bucket || '').trim();
  const propertyId = clean(body.propertyId || '');
  const folder = clean(body.folder || 'uploads').replace(/[^a-zA-Z0-9/_-]/g,'_') || 'uploads';
  const contentType = String(body.contentType || 'application/octet-stream').slice(0,120);
  const fileName = safeFileName(body.fileName || 'plik');
  const base64 = String(body.base64 || '').replace(/^data:[^;]+;base64,/, '');
  if(!ALLOWED_BUCKETS.has(bucket)) return json(400,{ok:false,message:'Nieobsługiwany bucket.'});
  if(!propertyId) return json(400,{ok:false,message:'Brakuje propertyId.'});
  if(!base64) return json(400,{ok:false,message:'Brakuje danych pliku.'});
  if(!isAllowedContentType(bucket, contentType)) return json(415,{ok:false,message:'Nieobsługiwany typ pliku dla tego modułu.'});
  const estimatedBytes = Math.ceil(base64.length * 3 / 4);
  if(estimatedBytes > 4.5 * 1024 * 1024) return json(413,{ok:false,message:'Plik jest zbyt duży. Limit dla zgłoszenia to około 4,5 MB.'});
  const demoRequester=verifyDemoTenantToken(body.tenantToken,propertyId);
  if(demoRequester){
    if(bucket !== 'property-documents' || folder !== 'maintenance') return json(403,{ok:false,message:'Najemca może dodawać pliki wyłącznie do swoich zgłoszeń.'});
    const path = `${propertyId}/${folder}/demo_${Date.now()}_${fileName}`;
    return json(200,{ok:true,sandbox:true,simulated:true,bucket,path,fileName,contentType,attachment_path:path,attachment_name:fileName,attachment_url:null});
  }
  if(!SUPABASE_URL || !SERVICE_KEY) return json(500,{ok:false,message:'Brakuje konfiguracji Supabase po stronie Netlify.'});
  const requester = await resolveRequester(event, body);
  if(requester?.role === 'tenant' && (bucket !== 'property-documents' || folder !== 'maintenance')) return json(403,{ok:false,message:'Najemca może dodawać pliki wyłącznie do swoich zgłoszeń.'});
  if(!requester || !hasAccess(requester, propertyId)) return json(403,{ok:false,message:'Brak dostępu do uploadu dla tego mieszkania.'});
  if(requester.role==='tenant' && !await tenantSessionIsActive(sbAdminClient(SUPABASE_URL,SERVICE_KEY),requester.session,propertyId)) return json(403,{ok:false,message:'Umowa najmu nie jest już aktywna.'});
  try{
    const buf = Buffer.from(base64, 'base64');
    const path = `${propertyId}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}_${fileName}`;
    await uploadObject(bucket, path, buf, contentType);
    return json(200,{ok:true,bucket,path,fileName,contentType,attachment_path:path,attachment_name:fileName,attachment_url:null});
  }catch(e){ const requestId=require('crypto').randomBytes(8).toString('hex'); console.error('STORAGE_UPLOAD_ERROR',requestId,e); return json(500,{ok:false,message:'Nie udało się przesłać pliku.',requestId}); }
};
