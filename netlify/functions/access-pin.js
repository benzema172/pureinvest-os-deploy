const crypto=require('crypto');
const {requireAdmin,normPhone,sbAdminClient}=require('./_pi-security');
const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const json=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
const clean=(value,max=160)=>String(value || '').trim().slice(0,max);
function safe(row){ return row?{id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,access_role:row.access_role,status:row.status,display_name:row.display_name || null,user_email:row.user_email || null,user_phone:row.user_phone || null,user_phone_norm:row.user_phone_norm || null,has_pin:!!row.access_pin_hash,created_at:row.created_at || null,updated_at:row.updated_at || null}:null; }

exports.handler=async function(event){
  if(event.httpMethod!=='POST') return json(405,{ok:false,message:'Użyj POST.'});
  const requester=await requireAdmin(event); if(!requester) return json(401,{ok:false,message:'Tylko administrator może zarządzać dostępami.'});
  let body={}; try{ body=JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane.'}); }
  const action=clean(body.action,20),requestId=crypto.randomBytes(8).toString('hex');
  try{
    const sb=sbAdminClient(SUPABASE_URL,SERVICE_KEY);
    if(action==='revoke'){
      const id=clean(body.id,80); if(!id) return json(400,{ok:false,message:'Brak identyfikatora dostępu.'});
      const rows=await sb(`pi_property_access?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'revoked',access_pin:null,access_pin_hash:null,updated_at:new Date().toISOString()})});
      return json(200,{ok:true,access:safe(rows?.[0])});
    }
    if(action!=='upsert') return json(400,{ok:false,message:'Nieobsługiwana operacja.'});
    const phone=normPhone(body.user_phone),pin=clean(body.pin,32),role=['owner','tenant'].includes(body.access_role)?body.access_role:'';
    if(!body.property_id || !phone || !role) return json(400,{ok:false,message:'Podaj mieszkanie, rolę i telefon.'});
    if(!body.id && (pin.length<6 || pin.length>12 || !/^\d+$/.test(pin))) return json(400,{ok:false,message:'Nowy PIN musi mieć od 6 do 12 cyfr.'});
    if(pin && (pin.length<6 || pin.length>12 || !/^\d+$/.test(pin))) return json(400,{ok:false,message:'PIN musi mieć od 6 do 12 cyfr.'});
    const rows=await sb('rpc/pi_admin_upsert_property_access',{method:'POST',body:JSON.stringify({p_id:body.id || null,p_property_id:body.property_id,p_tenancy_id:body.tenancy_id || null,p_access_role:role,p_status:['active','revoked','suspended'].includes(body.status)?body.status:'active',p_display_name:clean(body.display_name,120) || null,p_user_email:clean(body.user_email,200).toLowerCase() || null,p_user_phone:phone,p_pin:pin || null})});
    return json(200,{ok:true,access:safe(Array.isArray(rows)?rows[0]:rows)});
  }catch(error){ console.error('ACCESS_PIN_ERROR',requestId,error); return json(500,{ok:false,message:'Nie udało się zapisać dostępu. Sprawdź, czy migracja 1.9.0 została uruchomiona.',requestId}); }
};
