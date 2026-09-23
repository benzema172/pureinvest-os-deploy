const crypto = require('crypto');

function sessionSecret(){
  const secret = process.env.PI_SESSION_SECRET || '';
  if(!secret || secret.length < 32) throw new Error('PI_SESSION_SECRET_REQUIRED_MIN_32');
  return secret;
}
function b64json(obj){ return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function signSession(payload, ttlSeconds = 8 * 60 * 60){
  const secret = sessionSecret();
  const now = Date.now();
  const body = Object.assign({}, payload || {}, { iat: now, exp: now + ttlSeconds * 1000, v: '1.9.0' });
  const data = b64json(body);
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}
function verifySession(token, opts = {}){
  let secret; try{ secret = sessionSecret(); }catch(_){ return null; }
  const parts = String(token || '').split('.');
  if(parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected || '');
  if(a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  let body = null;
  try { body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')); } catch(_) { return null; }
  if(!body || !body.exp || Date.now() > Number(body.exp)) return null;
  if(opts.roles && opts.roles.length && !opts.roles.includes(body.role)) return null;
  if(opts.propertyId && String(body.propertyId || '') !== String(opts.propertyId)) return null;
  return body;
}
function normPhone(v){ return String(v || '').replace(/\D/g, ''); }
function clientIp(event){ return String((event.headers && (event.headers['x-forwarded-for'] || event.headers['client-ip'] || event.headers['x-real-ip'])) || 'ip').split(',')[0].trim(); }
function hashAttemptKey(event, phone, channel){
  return crypto.createHash('sha256').update(`${channel}|${clientIp(event)}|${normPhone(phone)}`).digest('hex');
}
async function durableTooManyAttempts(sb, event, phone, channel, max = 5, windowMinutes = 15){
  try{
    const key = hashAttemptKey(event, phone, channel);
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const rows = await sb(`pi_login_attempts?attempt_key=eq.${encodeURIComponent(key)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id&limit=${max + 1}`, { prefer:null });
    return Array.isArray(rows) && rows.length >= max;
  }catch(_){ return false; }
}
async function recordDurableAttempt(sb, event, phone, channel, success){
  try{
    const key = hashAttemptKey(event, phone, channel);
    await sb('pi_login_attempts', { method:'POST', body: JSON.stringify([{ attempt_key:key, channel, phone_hash: crypto.createHash('sha256').update(normPhone(phone)).digest('hex'), ip_hash: crypto.createHash('sha256').update(clientIp(event)).digest('hex'), success: !!success, created_at: new Date().toISOString() }]) });
  }catch(_){ }
}
async function tenantSessionIsActive(sb, session, propertyId){
  if(!session || session.role!=='tenant' || !session.tenancyId || String(session.propertyId || '')!==String(propertyId || '')) return false;
  try{
    const today=new Date().toISOString().slice(0,10);
    const rows=await sb(`pi_tenancies?id=eq.${encodeURIComponent(session.tenancyId)}&property_id=eq.${encodeURIComponent(propertyId)}&status=in.(active,notice)&or=(end_date.is.null,end_date.gte.${today})&select=id&limit=1`,{prefer:null});
    return Array.isArray(rows) && rows.length===1;
  }catch(_){ return false; }
}
async function activeOwnerScope(sb, session){
  if(!session || session.role!=='owner' || !session.phone || !Array.isArray(session.propertyIds) || !session.propertyIds.length) return [];
  try{
    const ids=session.propertyIds.map(String).filter(Boolean);
    const rows=await sb(`pi_property_access?user_phone_norm=eq.${encodeURIComponent(normPhone(session.phone))}&access_role=eq.owner&status=eq.active&property_id=in.(${ids.map(encodeURIComponent).join(',')})&select=property_id`,{prefer:null});
    const active=new Set((rows || []).map(row=>String(row.property_id)));
    return ids.filter(id=>active.has(id));
  }catch(_){ return []; }
}
async function verifySupabaseUser(event, supabaseUrl, serviceKey){
  try{
    const auth = event.headers && (event.headers.authorization || event.headers.Authorization);
    if(!auth || !String(auth).startsWith('Bearer ')) return null;
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, { headers:{ apikey: serviceKey, Authorization: auth } });
    if(!res.ok) return null;
    return await res.json().catch(()=>null);
  }catch(_){ return null; }
}

function headerValue(event, name){
  const h = (event && event.headers) || {};
  const lower = String(name || '').toLowerCase();
  for(const key of Object.keys(h)){
    if(String(key).toLowerCase() === lower) return h[key];
  }
  return '';
}
function getSessionToken(event){
  return headerValue(event, 'x-pi-session-token') || headerValue(event, 'x-pi-session') || '';
}
function sbAdminClient(supabaseUrl, serviceKey){
  return async function sb(path, options = {}){
    if(!supabaseUrl) throw new Error('SUPABASE_URL_MISSING');
    if(!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers:{ apikey:serviceKey, Authorization:`Bearer ${serviceKey}`, 'Content-Type':'application/json', Prefer:'return=representation', ...(options.headers||{}) }
    });
    const text = await res.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; }catch(_){ data = text; }
    if(!res.ok) throw new Error(typeof data === 'string' ? data : (data && (data.message || data.details || data.error)) || `SUPABASE_HTTP_${res.status}`);
    return data;
  };
}
function configuredAdminEmails(){
  return String(process.env.PLATFORM_ADMIN_EMAIL || process.env.PI_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '')
    .split(/[;,\s]+/).map(value=>value.trim().toLowerCase()).filter(Boolean);
}
async function adminRoleFromTables(user, sb){
  if(!user || !user.id) return null;
  const normalizedEmail=String(user.email || '').trim().toLowerCase();
  if(normalizedEmail && configuredAdminEmails().includes(normalizedEmail)) return 'admin';
  const uid = encodeURIComponent(user.id);
  const email = encodeURIComponent(normalizedEmail);
  const roleNames = ['admin','super_admin'];

  try{
    const rows = await sb(`pi_user_roles?or=(user_id.eq.${uid},email.eq.${email})&role=in.(admin,super_admin)&is_active=eq.true&select=id,role&limit=1`, { prefer:null });
    if(Array.isArray(rows) && rows[0] && roleNames.includes(String(rows[0].role))) return rows[0].role;
  }catch(_){ }

  try{
    const rows = await sb(`profiles?or=(id.eq.${uid},user_id.eq.${uid},email.eq.${email})&role=in.(admin,super_admin)&select=id,role&limit=1`, { prefer:null });
    if(Array.isArray(rows) && rows[0] && roleNames.includes(String(rows[0].role))) return rows[0].role;
  }catch(_){ }

  return null;
}
async function requireRequester(event, opts = {}){
  const roles = Array.isArray(opts.roles) ? opts.roles : [];
  const supabaseUrl = opts.supabaseUrl || process.env.SUPABASE_URL;
  const serviceKey = opts.serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

  const sessionToken = getSessionToken(event);
  if(sessionToken){
    const signed = verifySession(sessionToken, { roles: roles.filter(r => r !== 'admin') });
    if(signed && (!roles.length || roles.includes(signed.role))){
      const sb=sbAdminClient(supabaseUrl,serviceKey);
      if(signed.role==='tenant' && !await tenantSessionIsActive(sb,signed,signed.propertyId)) return null;
      if(signed.role==='owner'){
        const propertyIds=await activeOwnerScope(sb,signed); if(!propertyIds.length) return null;
        signed.propertyIds=propertyIds;
      }
      return { ok:true, type:'pi_session', role:signed.role, session:signed };
    }
  }

  if(!roles.length || roles.includes('admin')){
    const user = await verifySupabaseUser(event, supabaseUrl, serviceKey);
    if(user && user.id){
      const sb = sbAdminClient(supabaseUrl, serviceKey);
      const adminRole = await adminRoleFromTables(user, sb);
      if(adminRole) return { ok:true, type:'supabase_auth', role:'admin', adminRole, user };
    }
  }

  const bypass = process.env.PI_ADMIN_BYPASS_TOKEN || '';
  const supplied = headerValue(event, 'x-pi-admin-token') || '';
  if(bypass && supplied && bypass.length >= 24){
    const a = Buffer.from(bypass);
    const b = Buffer.from(supplied);
    if(a.length === b.length && crypto.timingSafeEqual(a, b)){
      return { ok:true, type:'admin_bypass', role:'admin' };
    }
  }

  return null;
}
async function requireAdmin(event, opts = {}){
  return requireRequester(event, { ...opts, roles:['admin'] });
}
async function requireRoles(event, roles, opts = {}){
  return requireRequester(event, { ...opts, roles });
}

module.exports = { signSession, verifySession, normPhone, durableTooManyAttempts, recordDurableAttempt, tenantSessionIsActive, activeOwnerScope, verifySupabaseUser, sessionSecret, requireRequester, requireAdmin, requireRoles, headerValue, getSessionToken, sbAdminClient, adminRoleFromTables };
