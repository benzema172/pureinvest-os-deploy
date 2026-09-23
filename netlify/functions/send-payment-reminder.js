const { requireRoles, sbAdminClient } = require('./_pi-security');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

const cors = {
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store'
};
const json = (statusCode, body) => ({ statusCode, headers:cors, body:JSON.stringify(body) });

function clean(v, max=2000){ return String(v ?? '').trim().slice(0, max); }
function normEmail(v){ const s=clean(v,240).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; }
function normPhone(v){ return String(v || '').replace(/[^\d+]/g,'').slice(0,24); }
function money(v){ const n=Number(v||0); return Number.isFinite(n) ? n.toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł' : ''; }
function hasPropertyAccess(requester, propertyId){
  if(!propertyId) return false;
  if(requester && requester.role === 'admin') return true;
  const ids = requester && requester.session && Array.isArray(requester.session.propertyIds) ? requester.session.propertyIds.map(String) : [];
  return ids.includes(String(propertyId));
}
async function logReminder(row){
  if(!SUPABASE_URL || !SERVICE_KEY) return;
  const sb = sbAdminClient(SUPABASE_URL, SERVICE_KEY);
  try{
    await sb('payment_reminder_log', { method:'POST', body:JSON.stringify([{
      property_id:row.property_id || null,channel:row.channel || null,recipient:row.recipient || null,
      status:row.status || 'unknown',payload:row,created_at:row.created_at || new Date().toISOString()
    }]) });
  }catch(_){
    try{
      await sb('activity_log', { method:'POST', body:JSON.stringify([{
        property_id: row.property_id || null,
        action: 'payment_reminder_'+row.channel,
        entity_type: 'rent_autopilot',
        entity_id: row.month || null,
        before_data: null,
        after_data: row
      }]) });
    }catch(__){}
  }
}
async function sendResend({to, subject, message}){
  const key = process.env.RESEND_API_KEY;
  if(!key) return { configured:false, provider:'resend', message:'Brak konfiguracji RESEND_API_KEY.' };
  const from = process.env.REMINDER_EMAIL_FROM || process.env.RESEND_FROM || 'PureInvest OS <noreply@pure-invest.pl>';
  const res = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ from, to:[to], subject, text:message })
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.message || data.error || `RESEND_HTTP_${res.status}`);
  return { configured:true, provider:'resend', external_id:data.id || null };
}
async function sendSmsApi({to, message}){
  const key = process.env.SMSAPI_TOKEN || process.env.SMSAPI_ACCESS_TOKEN;
  if(!key) return { configured:false, provider:'smsapi', message:'Brak konfiguracji SMSAPI_TOKEN.' };
  const params = new URLSearchParams();
  params.set('to', to);
  params.set('message', message);
  if(process.env.SMSAPI_FROM) params.set('from', process.env.SMSAPI_FROM);
  params.set('format', 'json');
  const res = await fetch('https://api.smsapi.pl/sms.do', {
    method:'POST',
    headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/x-www-form-urlencoded' },
    body:params.toString()
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok || data.error) throw new Error(data.message || data.error || `SMSAPI_HTTP_${res.status}`);
  return { configured:true, provider:'smsapi', external_id:data.list && data.list[0] && data.list[0].id || null };
}
async function sendTwilio({to, message}){
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if(!sid || !token || !from) return { configured:false, provider:'twilio', message:'Brak konfiguracji TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM.' };
  const params = new URLSearchParams();
  params.set('To', to);
  params.set('From', from);
  params.set('Body', message);
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method:'POST',
    headers:{ Authorization:`Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded' },
    body:params.toString()
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.message || `TWILIO_HTTP_${res.status}`);
  return { configured:true, provider:'twilio', external_id:data.sid || null };
}

exports.handler = async function(event){
  if(event.httpMethod === 'OPTIONS') return { statusCode:204, headers:cors, body:'' };
  if(event.httpMethod !== 'POST') return json(405, { ok:false, message:'Użyj POST.' });

  const requester = await requireRoles(event, ['admin','owner']);
  if(!requester) return json(401, { ok:false, message:'Brak uprawnień do wysyłania przypomnień.' });

  let body = {};
  try{ body = JSON.parse(event.body || '{}'); }catch(_){ return json(400, { ok:false, message:'Nieprawidłowy JSON.' }); }

  const channel = clean(body.channel, 16);
  const propertyId = clean(body.property_id, 80);
  if(!['email','sms'].includes(channel)) return json(400, { ok:false, message:'Nieprawidłowy kanał wysyłki.' });
  if(!hasPropertyAccess(requester, propertyId)) return json(403, { ok:false, message:'Brak dostępu do tego mieszkania.' });

  const subject = clean(body.subject || 'Przypomnienie o płatności', 180);
  const message = clean(body.message, channel === 'sms' ? 900 : 5000);
  if(!message) return json(400, { ok:false, message:'Brak treści wiadomości.' });

  const recipient = channel === 'sms' ? normPhone(body.to) : normEmail(body.to);
  if(!recipient) return json(400, { ok:false, message: channel === 'sms' ? 'Brak poprawnego numeru telefonu.' : 'Brak poprawnego adresu e-mail.' });

  const logBase = {
    property_id: propertyId || null,
    channel,
    recipient,
    subject,
    message_preview: message.slice(0, 500),
    month: clean(body.month, 16),
    property_name: clean(body.property_name, 180),
    tenant_name: clean(body.tenant_name, 180),
    due_amount: Number(body.due_amount || 0),
    paid_amount: Number(body.paid_amount || 0),
    missing_amount: Number(body.missing_amount || 0),
    due_date: clean(body.due_date, 80),
    requested_by_role: requester.role,
    status: 'attempted',
    created_at: new Date().toISOString()
  };

  try{
    let result;
    if(channel === 'email'){
      result = await sendResend({ to:recipient, subject, message });
    }else{
      result = process.env.SMSAPI_TOKEN || process.env.SMSAPI_ACCESS_TOKEN
        ? await sendSmsApi({ to:recipient, message })
        : await sendTwilio({ to:recipient, message });
    }

    if(result && result.configured === false){
      await logReminder({ ...logBase, status:'not_configured', provider:result.provider });
      return json(200, { ok:false, configured:false, provider:result.provider, message:result.message });
    }

    await logReminder({ ...logBase, status:'sent', provider:result.provider, external_id:result.external_id || null });
    return json(200, { ok:true, sent:true, provider:result.provider, external_id:result.external_id || null, message: channel === 'sms' ? 'SMS wysłany.' : 'E-mail wysłany.' });
  }catch(e){
    await logReminder({ ...logBase, status:'error', error_message:String(e.message || e).slice(0, 500) });
    const requestId=require('crypto').randomBytes(8).toString('hex'); console.error('PAYMENT_REMINDER_ERROR',requestId,e); return json(500, { ok:false, message:'Nie udało się wysłać przypomnienia.', requestId });
  }
};
