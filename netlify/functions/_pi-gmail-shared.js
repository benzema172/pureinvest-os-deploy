const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const TOKEN_SECRET = process.env.PI_GMAIL_TOKEN_SECRET || process.env.PI_TOKEN_SECRET || '';
const INITIAL_SCAN_FROM = process.env.PI_GMAIL_INITIAL_SCAN_FROM || '2026-05-01';
const MAX_INITIAL_MESSAGES = Number(process.env.PI_GMAIL_MAX_INITIAL_MESSAGES || 200);
const MAX_SCAN_MESSAGES = Number(process.env.PI_GMAIL_MAX_SCAN_MESSAGES || 200);
const SCAN_INTERVAL_HOURS = Number(process.env.PI_GMAIL_SCAN_INTERVAL_HOURS || 12);
const MAX_GMAIL_CONNECTIONS = Number(process.env.PI_GMAIL_MAX_CONNECTIONS || 2);

function json(statusCode, body, extraHeaders = {}){
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }, body: JSON.stringify(body) };
}
function redirect(location){ return { statusCode: 302, headers: { Location: location, 'Cache-Control': 'no-store' }, body: '' }; }
function requireEnv(){
  const missing=[];
  if(!SUPABASE_URL) missing.push('SUPABASE_URL');
  if(!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if(!GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if(!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if(!TOKEN_SECRET || TOKEN_SECRET.length < 16) missing.push('PI_GMAIL_TOKEN_SECRET');
  if(missing.length) throw new Error('Brakuje zmiennych Netlify: '+missing.join(', '));
}
function getBaseUrl(event){
  return (process.env.APP_BASE_URL || process.env.SITE_URL || process.env.URL || `https://${event.headers.host}`).replace(/\/$/, '');
}
function getRedirectUri(event){ return `${getBaseUrl(event)}/.netlify/functions/gmail-auth-callback`; }
function appReturnUrl(event, params = {}){
  const base = process.env.PI_APP_RETURN_URL || getBaseUrl(event);
  const url = new URL(base);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  return url.toString();
}
function sbHeaders(prefer='return=representation'){
  if(!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) };
}
async function sb(path, options = {}){
  if(!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...sbHeaders(options.prefer), ...(options.headers || {}) }});
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(_) { data = text; }
  if(!res.ok){
    const message = typeof data === 'string' ? data : (data && (data.message || data.details || data.hint || data.error_description || data.error)) || `SUPABASE_HTTP_${res.status}`;
    throw new Error(message);
  }
  return data;
}
function key(){ return crypto.createHash('sha256').update(String(TOKEN_SECRET)).digest(); }
function encryptText(value){
  if(value == null) return null;
  if(!TOKEN_SECRET || TOKEN_SECRET.length < 16) throw new Error('PI_GMAIL_TOKEN_SECRET_MISSING_OR_TOO_SHORT');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join(':');
}
function decryptText(payload){
  if(!payload) return null;
  if(!TOKEN_SECRET || TOKEN_SECRET.length < 16) throw new Error('PI_GMAIL_TOKEN_SECRET_MISSING_OR_TOO_SHORT');
  const [v, ivB64, tagB64, encB64] = String(payload).split(':');
  if(v !== 'v1') throw new Error('TOKEN_FORMAT_UNSUPPORTED');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64url')), decipher.final()]).toString('utf8');
}
async function googleTokenExchange(params){
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error_description || data.error || `GOOGLE_TOKEN_HTTP_${res.status}`);
  return data;
}
async function getGoogleProfile(accessToken){
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` }});
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error_description || data.error || `GOOGLE_PROFILE_HTTP_${res.status}`);
  return data;
}
async function refreshAccessToken(connection){
  const refreshToken = decryptText(connection.refresh_token_encrypted);
  if(!refreshToken) throw new Error('Brak refresh tokenu Gmail. Połącz Gmail ponownie z opcją zgody.');
  const token = await googleTokenExchange({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString();
  await sb(`gmail_connections?id=eq.${encodeURIComponent(connection.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ access_token_encrypted: encryptText(token.access_token), token_expires_at: expiresAt, updated_at: new Date().toISOString(), status: 'active' }),
  });
  return token.access_token;
}
async function getActiveConnection(){
  const rows = await sb('gmail_connections?status=eq.active&order=connected_at.desc&limit=1&select=*', { prefer: null });
  if(!Array.isArray(rows) || !rows.length) return null;
  return rows[0];
}
async function getActiveConnections(limit = MAX_GMAIL_CONNECTIONS){
  const safeLimit = Math.max(1, Math.min(Number(limit || MAX_GMAIL_CONNECTIONS), MAX_GMAIL_CONNECTIONS));
  const rows = await sb(`gmail_connections?status=eq.active&order=connected_at.asc&limit=${safeLimit}&select=*`, { prefer: null });
  return Array.isArray(rows) ? rows : [];
}
async function getAccessToken(connection){
  const expires = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if(connection.access_token_encrypted && expires > Date.now() + 120000){
    try { return decryptText(connection.access_token_encrypted); } catch(_) {}
  }
  return refreshAccessToken(connection);
}
function gmailDateFrom(dateValue){
  const d = new Date(dateValue || INITIAL_SCAN_FROM);
  if(Number.isNaN(d.getTime())) return '2026/5/1';
  return `${d.getUTCFullYear()}/${d.getUTCMonth()+1}/${d.getUTCDate()}`;
}
function decodeB64Url(data){
  if(!data) return '';
  try { return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch(_) { return ''; }
}
function stripHtml(html){ return String(html || '').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim(); }
function header(headers, name){ return (headers || []).find(h => String(h.name || '').toLowerCase() === String(name).toLowerCase())?.value || ''; }
function extractEmail(from){ const m=String(from||'').match(/<([^>]+)>/); return (m ? m[1] : from).trim().toLowerCase(); }
function collectTextAndAttachments(payload, out = { text: [], attachments: [] }){
  if(!payload) return out;
  const mime = payload.mimeType || '';
  const filename = payload.filename || '';
  if(filename) out.attachments.push(filename);
  const data = payload.body && payload.body.data;
  if(data && (mime.includes('text/plain') || mime.includes('text/html'))){
    const decoded = decodeB64Url(data);
    out.text.push(mime.includes('html') ? stripHtml(decoded) : decoded);
  }
  (payload.parts || []).forEach(part => collectTextAndAttachments(part, out));
  return out;
}
function normalizeAmount(raw){
  if(!raw) return null;
  const cleaned = String(raw).replace(/\s|\u00a0/g,'').replace(',', '.').replace(/[^0-9.]/g,'');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function detectAmount(text){
  const s = String(text || '');
  const strong = s.match(/(?:do\s+zap[łl]aty|kwota\s+do\s+zap[łl]aty|nale[żz]no[śs][ćc]|razem\s+do\s+zap[łl]aty|warto[śs][ćc]\s+brutto|suma)\D{0,60}(\d{1,3}(?:[\s\u00a0]?\d{3})*[,.]\d{2})\s*(?:z[łl]|pln)?/i);
  if(strong) return normalizeAmount(strong[1]);
  const all = [...s.matchAll(/(\d{1,3}(?:[\s\u00a0]?\d{3})*[,.]\d{2})\s*(?:z[łl]|pln)/gi)].map(m=>normalizeAmount(m[1])).filter(Boolean);
  if(!all.length) return null;
  return Math.max(...all.filter(x => x < 100000));
}
function isoDateFromDMY(d,m,y){
  const yy = Number(y), mm = Number(m), dd = Number(d);
  if(!yy || !mm || !dd || mm>12 || dd>31) return null;
  return `${yy.toString().padStart(4,'0')}-${mm.toString().padStart(2,'0')}-${dd.toString().padStart(2,'0')}`;
}
function detectDueDate(text){
  const s = String(text || '');
  const near = s.match(/(?:termin\s+p[łl]atno[śs]ci|p[łl]atne\s+do|zap[łl]a[ćc]\s+do|do\s+dnia)\D{0,50}(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/i);
  if(near) return isoDateFromDMY(near[1], near[2], near[3]);
  const nearIso = s.match(/(?:termin\s+p[łl]atno[śs]ci|p[łl]atne\s+do|zap[łl]a[ćc]\s+do|do\s+dnia)\D{0,50}(\d{4})-(\d{1,2})-(\d{1,2})/i);
  if(nearIso) return `${nearIso[1]}-${nearIso[2].padStart(2,'0')}-${nearIso[3].padStart(2,'0')}`;
  return null;
}
function detectInvoiceNumber(text){
  const s = String(text || '');
  const m = s.match(/(?:nr\s+faktury|numer\s+faktury|faktura\s+(?:nr|numer)?|fv\s+nr)\D{0,20}([A-Z0-9][A-Z0-9\/-]{2,40})/i);
  return m ? m[1].replace(/[,.]$/,'') : null;
}
function excerpt(text, max=420){ return String(text || '').replace(/\s+/g,' ').trim().slice(0,max); }
async function gmailFetch(accessToken, url){
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }});
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error?.message || data.error_description || data.error || `GMAIL_HTTP_${res.status}`);
  return data;
}
async function createScanLog(payload){
  try { const rows = await sb('gmail_scan_runs', { method:'POST', body: JSON.stringify([payload]) }); return Array.isArray(rows) ? rows[0] : null; } catch(e){ console.warn('SCAN_LOG_CREATE_FAILED', e.message); return null; }
}
async function updateScanLog(id, payload){
  if(!id) return;
  try { await sb(`gmail_scan_runs?id=eq.${encodeURIComponent(id)}`, { method:'PATCH', body: JSON.stringify(payload) }); } catch(e){ console.warn('SCAN_LOG_UPDATE_FAILED', e.message); }
}

module.exports = {
  json, redirect, requireEnv, getBaseUrl, getRedirectUri, appReturnUrl,
  sb, encryptText, decryptText, googleTokenExchange, getGoogleProfile,
  getActiveConnection, getActiveConnections, getAccessToken, gmailDateFrom, header, extractEmail,
  collectTextAndAttachments, stripHtml, detectAmount, detectDueDate, detectInvoiceNumber, excerpt,
  gmailFetch, INITIAL_SCAN_FROM, MAX_INITIAL_MESSAGES, MAX_SCAN_MESSAGES, SCAN_INTERVAL_HOURS, MAX_GMAIL_CONNECTIONS,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
  createScanLog, updateScanLog
};
