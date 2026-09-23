const { json, sb } = require('./_pi-gmail-shared');
const { requireAdmin } = require('./_pi-security');

exports.handler = async function(event){
  if(event.httpMethod !== 'POST') return json(405, { ok:false, message:'Użyj POST.' });
  const requester = await requireAdmin(event);
  if(!requester) return json(401, { ok:false, message:'Brak autoryzacji administratora.' });
  try{
    const body = event.body ? JSON.parse(event.body) : {};
    const id = String(body.id || '').trim();
    if(!id) return json(400, { ok:false, message:'Brak ID połączenia Gmail.' });
    await sb(`gmail_connections?id=eq.${encodeURIComponent(id)}`, {
      method:'PATCH',
      body: JSON.stringify({ status:'disabled', access_token_encrypted:null, refresh_token_encrypted:null, updated_at:new Date().toISOString(), last_scan_status:'disabled' })
    });
    return json(200, { ok:true, message:'Konto Gmail zostało odłączone.' });
  }catch(e){
    const requestId=require('crypto').randomBytes(8).toString('hex'); console.error('GMAIL_DISCONNECT_ERROR',requestId,e); return json(500, { ok:false, message:'Nie udało się odłączyć konta Gmail.', requestId });
  }
};
