const { requireRoles, tenantSessionIsActive } = require('./_pi-security');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const ALLOWED_BUCKETS = new Set(['property-documents','property-photos','transaction-attachments']);
const json = (statusCode, body) => ({ statusCode, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}, body:JSON.stringify(body) });
function cleanPath(v){ return String(v || '').replace(/^\/+/, '').replace(/\.\./g, '').trim(); }
function firstFolder(path){ return cleanPath(path).split('/')[0] || ''; }
function hasPathAccess(requester, propertyId){
  if(!requester) return false;
  if(requester.role === 'admin') return true;
  const s = requester.session || {};
  if(requester.role === 'owner') return Array.isArray(s.propertyIds) && s.propertyIds.map(String).includes(String(propertyId));
  if(requester.role === 'tenant') return String(s.propertyId || '') === String(propertyId);
  return false;
}

async function restRows(path){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}`, 'Content-Type':'application/json' }
  });
  const text = await res.text();
  let body = null; try{ body = text ? JSON.parse(text) : null; }catch(_){ body = text; }
  if(!res.ok) throw new Error(typeof body === 'string' ? body : (body && (body.message || body.error)) || `REST_HTTP_${res.status}`);
  return Array.isArray(body) ? body : [];
}
async function hasVisibilityAccess(requester, bucket, propertyId, path){
  if(!requester) return false;
  if(requester.role === 'admin') return true;
  if(bucket === 'transaction-attachments') return requester.role !== 'tenant' && hasPathAccess(requester, propertyId);
  if(bucket === 'property-documents' && path.startsWith(String(propertyId) + '/maintenance/')){
    const session=requester.session || {};
    const tenancyFilter=requester.role === 'tenant' && session.tenancyId ? `&tenancy_id=eq.${encodeURIComponent(session.tenancyId)}` : '';
    const rows=await restRows(`maintenance_requests?property_id=eq.${encodeURIComponent(propertyId)}&attachment_path=eq.${encodeURIComponent(path)}${tenancyFilter}&select=id&limit=1`);
    return rows.length > 0;
  }
  const table = bucket === 'property-photos' ? 'property_photos' : bucket === 'property-documents' ? 'property_documents' : '';
  if(!table) return false;
  const field = requester.role === 'tenant' ? 'tenant_visible' : requester.role === 'owner' ? 'owner_visible' : '';
  if(!field) return false;
  const tenancyFilter=requester.role === 'tenant' && requester.session?.tenancyId ? `&tenancy_id=eq.${encodeURIComponent(requester.session.tenancyId)}` : '';
  const rows = await restRows(`${table}?property_id=eq.${encodeURIComponent(propertyId)}&file_path=eq.${encodeURIComponent(path)}&${field}=eq.true${tenancyFilter}&select=id&limit=1`);
  return rows.length > 0;
}

async function createSignedUrl(bucket, path, expiresIn){
  const endpoint = `${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(endpoint, { method:'POST', headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}`, 'Content-Type':'application/json' }, body:JSON.stringify({ expiresIn }) });
  const text = await res.text(); let body=null; try{ body=text?JSON.parse(text):null; }catch(_){ body=text; }
  if(!res.ok) throw new Error(typeof body === 'string' ? body : (body && (body.message || body.error || body.error_description)) || `STORAGE_HTTP_${res.status}`);
  const signed = body && (body.signedURL || body.signedUrl || body.url);
  if(!signed) throw new Error('SIGNED_URL_EMPTY');
  if(/^https?:\/\//i.test(signed)) return signed;
  return `${SUPABASE_URL}/storage/v1${signed.startsWith('/') ? signed : '/' + signed}`;
}
exports.handler = async function(event){
  if(event.httpMethod !== 'POST') return json(405,{ok:false,message:'Użyj POST.'});
  if(!SUPABASE_URL || !SERVICE_KEY) return json(500,{ok:false,message:'Brakuje konfiguracji Supabase po stronie Netlify.'});
  const requester = await requireRoles(event, ['admin','owner','tenant']);
  if(!requester) return json(401,{ok:false,message:'Brak dostępu do pliku.'});
  let body={}; try{ body=JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane wejściowe.'}); }
  const bucket = String(body.bucket || '').trim();
  const path = cleanPath(body.path || '');
  const expiresIn = Math.max(60, Math.min(60*60, Number(body.expiresIn || 600)));
  if(!ALLOWED_BUCKETS.has(bucket)) return json(400,{ok:false,message:'Nieobsługiwany bucket.'});
  if(!path || path.includes('..')) return json(400,{ok:false,message:'Nieprawidłowa ścieżka pliku.'});
  const propertyId = firstFolder(path);
  if(!hasPathAccess(requester, propertyId)) return json(403,{ok:false,message:'Brak dostępu do tego pliku.'});
  if(requester.role==='tenant' && !await tenantSessionIsActive(restRows,requester.session,propertyId)) return json(403,{ok:false,message:'Umowa najmu nie jest już aktywna.'});
  if(!await hasVisibilityAccess(requester, bucket, propertyId, path)) return json(403,{ok:false,message:'Ten plik nie jest udostępniony dla tej roli.'});
  try{
    const signedUrl = await createSignedUrl(bucket, path, expiresIn);
    return json(200,{ok:true,signedUrl,expiresIn});
  }catch(e){ const requestId=require('crypto').randomBytes(8).toString('hex'); console.error('STORAGE_URL_ERROR',requestId,e); return json(500,{ok:false,message:'Nie udało się utworzyć bezpiecznego linku do pliku.',requestId}); }
};
