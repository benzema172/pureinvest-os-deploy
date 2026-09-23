const { requireRoles, sbAdminClient } = require('./_pi-security');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const json = (statusCode, body) => ({ statusCode, headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }, body:JSON.stringify(body) });
const enc = v => encodeURIComponent(String(v));
const cleanText = (v, max=2000) => String(v ?? '').trim().slice(0, max);
const allowedStatus = new Set(['new','accepted','in_progress','scheduled','waiting_tenant','resolved','rejected','closed','done']);
const allowedPriority = new Set(['low','normal','medium','high','critical','urgent']);

function propertyIdsFor(requester){
  if(!requester) return [];
  if(requester.role === 'admin') return null;
  const ids = requester.session && Array.isArray(requester.session.propertyIds) ? requester.session.propertyIds : [];
  return ids.map(String).filter(Boolean);
}
function hasPropertyAccess(requester, propertyId){
  if(requester.role === 'admin') return true;
  return propertyIdsFor(requester).includes(String(propertyId));
}
function missingColumn(error){
  const msg = String(error && (error.message || error.details || error) || '');
  const m = msg.match(/Could not find the '([^']+)' column|column "([^"]+)"|column ([a-zA-Z0-9_]+) does not exist/i);
  return m && (m[1] || m[2] || m[3]);
}
function withoutEmpty(obj){
  const out = {};
  for(const [k,v] of Object.entries(obj || {})){
    if(v === undefined) continue;
    if(v === '') continue;
    out[k] = v;
  }
  return out;
}
async function insertWithFallback(sb, table, payload){
  let body = withoutEmpty({...payload});
  for(let i=0;i<18;i++){
    try{ return await sb(table, { method:'POST', body:JSON.stringify([body]) }); }
    catch(e){
      const col = missingColumn(e);
      if(col && Object.prototype.hasOwnProperty.call(body, col)){ delete body[col]; continue; }
      throw e;
    }
  }
  throw new Error('Nie udało się dopasować pól zgłoszenia do schematu bazy.');
}
async function updateWithFallback(sb, id, payload){
  let body = withoutEmpty({...payload});
  if(!Object.keys(body).length) return [];
  for(let i=0;i<18;i++){
    try{ return await sb(`maintenance_requests?id=eq.${enc(id)}`, { method:'PATCH', body:JSON.stringify(body) }); }
    catch(e){
      const col = missingColumn(e);
      if(col && Object.prototype.hasOwnProperty.call(body, col)){ delete body[col]; if(!Object.keys(body).length) return []; continue; }
      throw e;
    }
  }
  throw new Error('Nie udało się dopasować aktualizacji do schematu bazy.');
}
async function getTicket(sb, id){
  const rows = await sb(`maintenance_requests?id=eq.${enc(id)}&select=*&limit=1`, { prefer:null });
  return Array.isArray(rows) ? rows[0] : null;
}
async function listTickets(sb, requester, propertyId, limit){
  const ids = propertyIdsFor(requester);
  const max = Math.max(1, Math.min(500, Number(limit) || 250));
  let propertyFilter = '';
  if(propertyId){
    if(!hasPropertyAccess(requester, propertyId)) throw Object.assign(new Error('Brak dostępu do wybranego mieszkania.'), { code:'FORBIDDEN' });
    propertyFilter = `property_id=eq.${enc(propertyId)}&`;
  }else if(ids && ids.length){
    propertyFilter = `property_id=in.(${ids.map(enc).join(',')})&`;
  }else if(ids && !ids.length){
    return [];
  }
  const path = `maintenance_requests?${propertyFilter}order=created_at.desc&limit=${max}&select=*`;
  const rows = await sb(path, { prefer:null });
  return Array.isArray(rows) ? rows : [];
}
function normalizePatch(input){
  const patch = input || {};
  const status = cleanText(patch.status, 40);
  const priority = cleanText(patch.priority, 40);
  const out = {
    updated_at: new Date().toISOString(),
    updated_by_role: 'manager'
  };
  if(status){
    const v = status.toLowerCase();
    out.status = allowedStatus.has(v) ? v : status;
    if(['resolved','closed','done'].includes(v)) out.closed_at = new Date().toISOString();
  }
  if(priority){
    const v = priority.toLowerCase();
    out.priority = allowedPriority.has(v) ? v : priority;
  }
  if(Object.prototype.hasOwnProperty.call(patch, 'category')) out.category = cleanText(patch.category, 120);
  if(Object.prototype.hasOwnProperty.call(patch, 'room')) out.room = cleanText(patch.room, 160);
  if(Object.prototype.hasOwnProperty.call(patch, 'location')) out.location = cleanText(patch.location, 160);
  if(Object.prototype.hasOwnProperty.call(patch, 'managerNote')) out.manager_note = cleanText(patch.managerNote, 3000);
  if(Object.prototype.hasOwnProperty.call(patch, 'adminNote')) out.admin_note = cleanText(patch.adminNote, 3000);
  if(Object.prototype.hasOwnProperty.call(patch, 'resolutionNote')) out.resolution_note = cleanText(patch.resolutionNote, 3000);
  if(Object.prototype.hasOwnProperty.call(patch, 'assigneeName')) out.assignee_name = cleanText(patch.assigneeName, 160);
  if(Object.prototype.hasOwnProperty.call(patch, 'dueDate')) out.due_date = cleanText(patch.dueDate, 40) || null;
  return out;
}

exports.handler = async function(event){
  if(event.httpMethod !== 'POST') return json(405, { ok:false, message:'Użyj POST.' });
  if(!SUPABASE_URL || !SERVICE_KEY) return json(500, { ok:false, message:'Brakuje konfiguracji Supabase po stronie Netlify.' });

  const requester = await requireRoles(event, ['admin','owner']).catch(()=>null);
  if(!requester) return json(401, { ok:false, message:'Brak aktywnej sesji administratora albo ownera.' });

  let body = {};
  try{ body = JSON.parse(event.body || '{}'); }catch(_){ return json(400, { ok:false, message:'Nieprawidłowe dane wejściowe.' }); }
  const action = String(body.action || 'list').toLowerCase();
  const sb = sbAdminClient(SUPABASE_URL, SERVICE_KEY);

  try{
    if(action === 'list'){
      const tickets = await listTickets(sb, requester, cleanText(body.propertyId, 120), body.limit);
      return json(200, { ok:true, tickets, count:tickets.length });
    }

    if(action === 'create'){
      const propertyId = cleanText(body.propertyId, 120);
      if(!propertyId) return json(400, { ok:false, message:'Brakuje propertyId.' });
      if(!hasPropertyAccess(requester, propertyId)) return json(403, { ok:false, message:'Brak dostępu do wybranego mieszkania.' });
      const title = cleanText(body.title, 240);
      const description = cleanText(body.description, 5000);
      if(!title || !description) return json(400, { ok:false, message:'Podaj tytuł i opis zgłoszenia.' });
      const attachment = body.attachment || {};
      const priority = cleanText(body.priority || 'normal', 40).toLowerCase();
      const status = cleanText(body.status || 'new', 40).toLowerCase();
      const payload = {
        property_id: propertyId,
        title,
        description,
        status: allowedStatus.has(status) ? status : 'new',
        priority: allowedPriority.has(priority) ? priority : 'normal',
        category: cleanText(body.category || 'Usterka', 120),
        room: cleanText(body.room || body.location || '', 160),
        location: cleanText(body.room || body.location || '', 160),
        tenant_phone: cleanText(body.tenantPhone || body.tenant_phone || '', 80) || null,
        created_by_role: requester.role === 'owner' ? 'owner' : 'admin',
        updated_by_role: requester.role === 'owner' ? 'owner' : 'admin',
        manager_note: cleanText(body.managerNote || '', 3000),
        due_date: cleanText(body.dueDate || '', 40) || null,
        attachment_url: attachment.attachment_url || null,
        attachment_path: attachment.attachment_path || null,
        attachment_name: attachment.attachment_name || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const rows = await insertWithFallback(sb, 'maintenance_requests', payload);
      const tickets = await listTickets(sb, requester, propertyId, 250).catch(()=>rows || []);
      return json(200, { ok:true, ticket:Array.isArray(rows) ? rows[0] : null, tickets });
    }

    if(action === 'update'){
      const id = cleanText(body.id, 160);
      if(!id) return json(400, { ok:false, message:'Brakuje id zgłoszenia.' });
      const existing = await getTicket(sb, id);
      if(!existing) return json(404, { ok:false, message:'Nie znaleziono zgłoszenia.' });
      if(!hasPropertyAccess(requester, existing.property_id)) return json(403, { ok:false, message:'Brak dostępu do zgłoszenia.' });
      const patch = normalizePatch(body.patch || {});
      patch.updated_by_role = requester.role === 'owner' ? 'owner' : 'admin';
      const rows = await updateWithFallback(sb, id, patch);
      const ticket = Array.isArray(rows) && rows[0] ? rows[0] : await getTicket(sb, id);
      const tickets = await listTickets(sb, requester, cleanText(body.propertyId || existing.property_id, 120), 250).catch(()=>[]);
      return json(200, { ok:true, ticket, tickets });
    }

    return json(400, { ok:false, message:'Nieobsługiwana akcja.' });
  }catch(error){
    const status = error && error.code === 'FORBIDDEN' ? 403 : 500;
    const requestId=require('crypto').randomBytes(8).toString('hex'); console.error('MAINTENANCE_TICKET_ERROR',requestId,error); return json(status, { ok:false, message:'Moduł zgłoszeń nie wykonał operacji.', requestId });
  }
};
