const crypto=require('crypto');
const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const {signSession,normPhone,durableTooManyAttempts,recordDurableAttempt,sessionSecret}=require('./_pi-security');
const json=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
const LOGIN_ATTEMPTS=globalThis.__PI_OWNER_LOGIN_ATTEMPTS__ || (globalThis.__PI_OWNER_LOGIN_ATTEMPTS__=new Map());
function clientKey(event,phone){ return `${event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'ip'}:${phone || 'unknown'}`; }
function tooManyAttempts(key){ const now=Date.now(),item=LOGIN_ATTEMPTS.get(key)||{count:0,first:now}; if(now-item.first>15*60*1000){ LOGIN_ATTEMPTS.set(key,{count:0,first:now}); return false; } return item.count>=5; }
function recordAttempt(key,success){ if(success){ LOGIN_ATTEMPTS.delete(key); return; } const now=Date.now(),item=LOGIN_ATTEMPTS.get(key)||{count:0,first:now}; if(now-item.first>15*60*1000) LOGIN_ATTEMPTS.set(key,{count:1,first:now}); else{ item.count+=1; LOGIN_ATTEMPTS.set(key,item); } }
function sanitizeOwnerProperty(property){
  if(!property) return null; const blocked=new Set(['tenant_pin','tenant_access_pin','tenant_pin_hash','tenant_phone_norm','access_pin','access_pin_hash']),out={}; Object.keys(property).forEach(key=>{ if(!blocked.has(key)) out[key]=property[key]; }); return out;
}
function sanitizeAccessRow(row){ return row?{id:row.id || null,property_id:row.property_id || null,tenancy_id:row.tenancy_id || null,access_role:row.access_role || 'owner',status:row.status || 'active',display_name:row.display_name || null,user_email:row.user_email || null,user_phone:row.user_phone || null,created_at:row.created_at || null,updated_at:row.updated_at || null}:null; }
async function sb(path,options={}){
  if(!SUPABASE_URL) throw new Error('SUPABASE_URL_MISSING'); if(!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
  const text=await response.text(); let data=null; try{ data=text?JSON.parse(text):null; }catch(_){ data=text; }
  if(!response.ok) throw new Error(typeof data==='string'?data:(data && (data.message || data.error_description || data.error)) || `SUPABASE_HTTP_${response.status}`); return data;
}
async function rpc(name,payload){ return sb(`rpc/${name}`,{method:'POST',body:JSON.stringify(payload || {})}); }

exports.handler=async function(event){
  if(event.httpMethod!=='POST') return json(405,{ok:false,message:'Użyj POST.'});
  let body={}; try{ body=JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane.'}); }
  const phone=normPhone(body.phone),pin=String(body.pin || '').trim(); if(!phone || !pin) return json(400,{ok:false,message:'Podaj telefon i PIN.'});
  try{ sessionSecret(); }catch(_){ return json(500,{ok:false,message:'Panel właściciela jest chwilowo niedostępny.'}); }
  const attemptKey=clientKey(event,phone); if(tooManyAttempts(attemptKey) || await durableTooManyAttempts(sb,event,phone,'owner')) return json(429,{ok:false,message:'Zbyt wiele błędnych prób. Spróbuj ponownie za kilka minut.'});
  const requestId=crypto.randomBytes(8).toString('hex');
  try{
    const access=await rpc('pi_verify_owner_login',{p_phone:phone,p_pin:pin});
    if(!Array.isArray(access) || !access.length){ recordAttempt(attemptKey,false); await recordDurableAttempt(sb,event,phone,'owner',false); return json(403,{ok:false,message:'Brak aktywnego konta właściciela dla podanego telefonu lub PIN-u.'}); }
    const ids=[...new Set(access.map(row=>row.property_id).filter(Boolean))]; if(!ids.length) return json(403,{ok:false,message:'Właściciel nie ma przypisanego mieszkania.'});
    const [properties,settlementItems,tenancies]=await Promise.all([
      sb(`properties?id=in.(${ids.map(encodeURIComponent).join(',')})&select=*`).catch(()=>[]),
      sb(`pi_settlement_items?property_id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,property_id,tenancy_id,scope,kind,name,component,default_amount,recurring,payer,tenant_due,taxable,effective_from,effective_to,active,created_at,updated_at&order=effective_from.asc`).catch(()=>[]),
      sb(`pi_tenancies?property_id=in.(${ids.map(encodeURIComponent).join(',')})&status=in.(active,notice)&or=(end_date.is.null,end_date.gte.${new Date().toISOString().slice(0,10)})&select=id,property_id,start_date,end_date,payment_day,status&order=start_date.desc`).catch(()=>[])
    ]);
    const enriched=(properties || []).map(property=>{
      const tenancy=(tenancies || []).find(row=>String(row.property_id)===String(property.id));
      return {...property,tenancy_id:tenancy?.id || null,tenancy_start:tenancy?.start_date || property.lease_start || null,tenancy_end:tenancy?.end_date || property.lease_end || null,settlement_items:(settlementItems || []).filter(row=>String(row.property_id)===String(property.id))};
    });
    recordAttempt(attemptKey,true); await recordDurableAttempt(sb,event,phone,'owner',true);
    const ownerToken=signSession({role:'owner',phone,propertyIds:ids},8*60*60),safeAccess=access.map(sanitizeAccessRow).filter(Boolean);
    return json(200,{ok:true,role:'owner',owner:{name:access[0].display_name || 'Właściciel',phone,email:access[0].user_email || null},access:safeAccess,propertyIds:ids,properties:enriched.map(sanitizeOwnerProperty).filter(Boolean),ownerToken,sessionExpiresInHours:8});
  }catch(error){ console.error('OWNER_LOGIN_ERROR',requestId,error); return json(500,{ok:false,message:'Panel właściciela jest chwilowo niedostępny. Spróbuj ponownie później.',requestId}); }
};
