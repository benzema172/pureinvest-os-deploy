const { json, sb, MAX_GMAIL_CONNECTIONS } = require('./_pi-gmail-shared');
const { requireAdmin } = require('./_pi-security');

exports.handler = async function(event){
  if(event.httpMethod !== 'GET') return json(405, { ok:false, message:'Użyj GET.' });
  const requester = await requireAdmin(event);
  if(!requester) return json(401, { ok:false, message:'Brak autoryzacji administratora.' });
  try{
    const rows = await sb(`gmail_connections?status=eq.active&order=connected_at.asc&limit=${MAX_GMAIL_CONNECTIONS}&select=id,gmail_email,status,connected_at,last_scan_at,initial_scan_from,scan_interval_hours,last_scan_status,last_scan_summary,last_scan_error`, { prefer:null });
    const connections = Array.isArray(rows) ? rows : [];
    if(!connections.length) return json(200, { ok:true, connected:false, connected_count:0, max_connections:MAX_GMAIL_CONNECTIONS, connections:[], message:'Gmail nie jest jeszcze połączony.' });
    return json(200, { ok:true, connected:true, connected_count:connections.length, max_connections:MAX_GMAIL_CONNECTIONS, connection:connections[0], connections });
  }catch(e){
    const requestId=require('crypto').randomBytes(8).toString('hex'); console.error('GMAIL_STATUS_ERROR',requestId,e); return json(500, { ok:false, connected:false, message:'Nie udało się sprawdzić połączenia Gmail.', requestId });
  }
};
