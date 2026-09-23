const crypto=require('crypto');
const {verifySession,tenantSessionIsActive}=require('./_pi-security');
const {demoTenantRows,verifyDemoTenantToken}=require('./_pi-demo-tenant');
const SUPABASE_URL=process.env.SUPABASE_URL,SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const json=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)}),enc=value=>encodeURIComponent(String(value)),clean=(value,max=2000)=>String(value ?? '').trim().slice(0,max);
function safeIssue(row){ return {id:row?.id,property_id:row?.property_id,tenancy_id:row?.tenancy_id || null,title:row?.title,description:row?.description,status:row?.status,priority:row?.priority,category:row?.category,room:row?.room || row?.location || null,permission_to_enter:row?.permission_to_enter===true,attachment_url:row?.attachment_url || null,attachment_path:row?.attachment_path || null,attachment_name:row?.attachment_name || null,created_at:row?.created_at,updated_at:row?.updated_at}; }
async function sb(path,options={}){ const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers || {})}}); const text=await response.text(); let data=null; try{ data=text?JSON.parse(text):null; }catch(_){ data=text; } if(!response.ok) throw new Error(typeof data==='string'?data:(data && (data.message || data.details || data.error)) || `SUPABASE_HTTP_${response.status}`); return data; }
exports.handler=async function(event){
  if(event.httpMethod!=='POST') return json(405,{ok:false,message:'Użyj POST.'}); let body={}; try{ body=JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane.'}); }
  const propertyId=String(body.propertyId || '');
  const demoToken=verifyDemoTenantToken(body.tenantToken,propertyId);
  const token=demoToken || verifySession(body.tenantToken,{roles:['tenant'],propertyId});
  if(!token || (!demoToken && !await tenantSessionIsActive(sb,token,propertyId))) return json(403,{ok:false,message:'Sesja najemcy wygasła. Zaloguj się ponownie.'});
  const title=clean(body.title,240),description=clean(body.description,5000); if(!title || !description) return json(400,{ok:false,message:'Podaj tytuł i opis zgłoszenia.'});
  if(demoToken){
    const attachment=body.attachment || {},path=String(attachment.attachment_path || '');
    if(path && (!path.startsWith(propertyId+'/maintenance/') || path.includes('..'))) return json(400,{ok:false,message:'Nieprawidłowy załącznik zgłoszenia.'});
    const now=new Date().toISOString(),priority=clean(body.priority || 'normal',40).toLowerCase();
    const issue=safeIssue({
      id:`demo-maintenance-session-${crypto.randomBytes(6).toString('hex')}`,property_id:propertyId,tenancy_id:demoToken.tenancyId,
      title,description,status:'new',priority:['low','normal','medium','high','critical','urgent'].includes(priority)?priority:'normal',
      category:clean(body.category || 'Usterka',120),room:clean(body.room || body.location || '',160),permission_to_enter:body.permissionToEnter===true,
      attachment_url:null,attachment_path:path || null,attachment_name:clean(attachment.attachment_name,180) || null,created_at:now,updated_at:now
    });
    return json(200,{ok:true,sandbox:true,simulated:true,issue,issues:[issue,...demoTenantRows(new Date()).issues].slice(0,20)});
  }
  const trace=crypto.randomBytes(8).toString('hex');
  try{
    const attachment=body.attachment || {},path=String(attachment.attachment_path || '');
    if(path && (!path.startsWith(propertyId+'/maintenance/') || path.includes('..'))) return json(400,{ok:false,message:'Nieprawidłowy załącznik zgłoszenia.'});
    const priority=clean(body.priority || 'normal',40).toLowerCase(),payload={property_id:propertyId,tenancy_id:token.tenancyId || null,tenant_phone:token.phone || null,title,description,status:'new',priority:['low','normal','medium','high','critical','urgent'].includes(priority)?priority:'normal',category:clean(body.category || 'Usterka',120),room:clean(body.room || body.location || '',160),permission_to_enter:body.permissionToEnter===true,created_by_role:'tenant',attachment_url:null,attachment_path:path || null,attachment_name:clean(attachment.attachment_name,180) || null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const rows=await sb('maintenance_requests',{method:'POST',body:JSON.stringify([payload])});
    const scope=token.tenancyId?`tenancy_id=eq.${enc(token.tenancyId)}`:`tenant_phone=eq.${enc(token.phone || '')}`;
    const issues=await sb(`maintenance_requests?property_id=eq.${enc(propertyId)}&${scope}&order=created_at.desc&limit=20&select=*`).catch(()=>rows || []);
    return json(200,{ok:true,issue:safeIssue(rows?.[0]),issues:(issues || []).map(safeIssue)});
  }catch(error){ console.error('TENANT_MAINTENANCE_ERROR',trace,error); return json(500,{ok:false,message:'Nie udało się zapisać zgłoszenia.',requestId:trace}); }
};
