const crypto=require('crypto');
const {verifySession,tenantSessionIsActive}=require('./_pi-security');
const {demoTenantRows,verifyDemoTenantToken}=require('./_pi-demo-tenant');
const SUPABASE_URL=process.env.SUPABASE_URL,SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const json=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
function num(value){ if(value===null || value===undefined || value==='') return null; const result=Number(String(value).replace(',', '.').replace(/[^0-9.\-]/g,'')); return Number.isFinite(result) && result>=0 && result<=1e12?result:null; }
function safe(row){ return {id:row?.id,property_id:row?.property_id,tenancy_id:row?.tenancy_id || null,meter_type:row?.meter_type || null,reading_value:row?.reading_value ?? null,electricity_reading:row?.electricity_reading ?? null,water_reading:row?.water_reading ?? null,gas_reading:row?.gas_reading ?? null,reading_date:row?.reading_date || null,note:row?.note || null,created_at:row?.created_at || null}; }
async function sb(path,options={}){ const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers || {})}}); const text=await response.text(); let data=null; try{ data=text?JSON.parse(text):null; }catch(_){ data=text; } if(!response.ok) throw new Error(typeof data==='string'?data:(data && (data.message || data.details || data.error)) || `SUPABASE_HTTP_${response.status}`); return data; }
exports.handler=async function(event){
  if(event.httpMethod!=='POST') return json(405,{ok:false,message:'Użyj POST.'}); let body={}; try{ body=JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane.'}); }
  const propertyId=String(body.propertyId || '');
  const demoToken=verifyDemoTenantToken(body.tenantToken,propertyId);
  const token=demoToken || verifySession(body.tenantToken,{roles:['tenant'],propertyId});
  if(!token || (!demoToken && !await tenantSessionIsActive(sb,token,propertyId))) return json(403,{ok:false,message:'Sesja najemcy wygasła. Zaloguj się ponownie.'});
  const electricity=num(body.electricity),water=num(body.water),gas=num(body.gas); if(electricity===null && water===null && gas===null) return json(400,{ok:false,message:'Wpisz co najmniej jeden nieujemny odczyt licznika.'});
  if(demoToken){
    const existing=demoTenantRows(new Date()).meterReadings,previous=existing[0] || null,decreases=[];
    if(electricity!==null && previous?.electricity_reading!==null && electricity<Number(previous.electricity_reading)) decreases.push('prąd');
    if(water!==null && previous?.water_reading!==null && water<Number(previous.water_reading)) decreases.push('woda');
    if(gas!==null && previous?.gas_reading!==null && gas<Number(previous.gas_reading)) decreases.push('gaz');
    if(decreases.length) return json(409,{ok:false,message:'Nowy odczyt nie może być niższy od poprzedniego: '+decreases.join(', ')+'.'});
    const now=new Date().toISOString();
    const meterReading=safe({id:`demo-meter-session-${crypto.randomBytes(6).toString('hex')}`,property_id:propertyId,tenancy_id:demoToken.tenancyId,meter_type:'combined',reading_value:electricity,electricity_reading:electricity,water_reading:water,gas_reading:gas,note:String(body.note || '').trim().slice(0,1000) || null,reading_date:now.slice(0,10),created_at:now});
    return json(200,{ok:true,sandbox:true,simulated:true,meterReading,meterReadings:[meterReading,...existing].slice(0,12)});
  }
  const trace=crypto.randomBytes(8).toString('hex');
  try{
    const tenancyFilter=token.tenancyId?`&tenancy_id=eq.${encodeURIComponent(token.tenancyId)}`:'';
    const previous=(await sb(`meter_readings?property_id=eq.${encodeURIComponent(propertyId)}${tenancyFilter}&order=reading_date.desc,created_at.desc&limit=1&select=*`).catch(()=>[]))?.[0] || null;
    const decreases=[]; if(electricity!==null && previous?.electricity_reading!==null && electricity<Number(previous.electricity_reading)) decreases.push('prąd'); if(water!==null && previous?.water_reading!==null && water<Number(previous.water_reading)) decreases.push('woda'); if(gas!==null && previous?.gas_reading!==null && gas<Number(previous.gas_reading)) decreases.push('gaz');
    if(decreases.length) return json(409,{ok:false,message:'Nowy odczyt nie może być niższy od poprzedniego: '+decreases.join(', ')+'.'});
    const rows=await sb('meter_readings',{method:'POST',body:JSON.stringify([{property_id:propertyId,tenancy_id:token.tenancyId || null,tenant_phone:token.phone || null,electricity_reading:electricity,water_reading:water,gas_reading:gas,note:String(body.note || '').trim().slice(0,1000) || null,reading_date:new Date().toISOString().slice(0,10),created_at:new Date().toISOString()}])});
    const readings=await sb(`meter_readings?property_id=eq.${encodeURIComponent(propertyId)}${tenancyFilter}&order=reading_date.desc,created_at.desc&limit=12&select=*`).catch(()=>rows || []);
    return json(200,{ok:true,meterReading:safe(rows?.[0]),meterReadings:(readings || []).map(safe)});
  }catch(error){ console.error('TENANT_METER_ERROR',trace,error); return json(500,{ok:false,message:'Nie udało się zapisać odczytu.',requestId:trace}); }
};
