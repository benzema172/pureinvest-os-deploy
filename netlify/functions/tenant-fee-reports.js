const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const {requireRoles,sbAdminClient,getSessionToken}=require('./_pi-security');
const {demoTenantRows,verifyDemoTenantToken}=require('./_pi-demo-tenant');

const MIRROR_CATEGORY='pi_fee_media_report';
const MIRROR_PREFIX='PI_FEE_REPORT_V1:';
const json=(statusCode,body)=>({
  statusCode,
  headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate'},
  body:JSON.stringify(body)
});
const month=value=>String(value || '').slice(0,7);
function safeReport(row){
  return {
    id:row?.id || null,
    property_id:row?.property_id || null,
    effective_month:row?.effective_month || null,
    base_amount:Number(row?.base_amount || 0),
    items:Array.isArray(row?.items)?row.items:[],
    media_items:Array.isArray(row?.media_items)?row.media_items:[],
    notes:row?.notes || null,
    tenant_visible:row?.tenant_visible !== false,
    updated_at:row?.updated_at || null,
    source:row?.source || 'pi_fee_breakdowns'
  };
}
function parseMirror(row){
  if(!row || row.category!==MIRROR_CATEGORY || row.tenant_visible===false) return null;
  const note=String(row.note || '');
  if(!note.startsWith(MIRROR_PREFIX)) return null;
  try{
    const parsed=JSON.parse(note.slice(MIRROR_PREFIX.length));
    return safeReport({...parsed,id:parsed.id || `mirror:${row.id}`,property_id:row.property_id,tenant_visible:true,updated_at:row.updated_at || row.created_at,source:'property_documents'});
  }catch(_){ return null; }
}
function mergeReports(primary,mirrors){
  const byMonth=new Map();
  [...(mirrors || []),...(primary || [])].forEach(raw=>{
    const row=safeReport(raw);
    const key=month(row.effective_month);
    if(!key) return;
    const existing=byMonth.get(key);
    if(!existing){ byMonth.set(key,row); return; }
    const existingTime=Date.parse(existing.updated_at || 0) || 0;
    const nextTime=Date.parse(row.updated_at || 0) || 0;
    const existingScore=(existing.items?.length || 0)+(existing.media_items?.length || 0)*2;
    const nextScore=(row.items?.length || 0)+(row.media_items?.length || 0)*2;
    if(row.source==='pi_fee_breakdowns' || nextTime>existingTime || nextScore>existingScore) byMonth.set(key,row);
  });
  return [...byMonth.values()].sort((a,b)=>String(b.effective_month || '').localeCompare(String(a.effective_month || '')));
}

exports.handler=async function(event){
  if(event.httpMethod!=='POST') return json(405,{ok:false,message:'Użyj POST.'});
  let body={};
  try{ body=JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane.'}); }
  const propertyId=String(body.propertyId || '').trim();
  if(!propertyId) return json(400,{ok:false,message:'Brak identyfikatora mieszkania.'});
  const demoRequester=verifyDemoTenantToken(getSessionToken(event) || body.tenantToken);
  if(demoRequester){
    if(String(demoRequester.propertyId)!==propertyId) return json(403,{ok:false,message:'Brak dostępu do raportów tego mieszkania.'});
    const reports=demoTenantRows(new Date()).feeBreakdowns;
    return json(200,{ok:true,sandbox:true,reports,count:reports.length,sources:{table:reports.length,mirror:0}});
  }
  try{
    const requester=await requireRoles(event,['tenant'],{supabaseUrl:SUPABASE_URL,serviceKey:SERVICE_KEY});
    if(!requester?.ok || requester.role!=='tenant') return json(401,{ok:false,message:'Sesja najemcy wygasła. Zaloguj się ponownie.'});
    if(String(requester.session?.propertyId || '')!==propertyId) return json(403,{ok:false,message:'Brak dostępu do raportów tego mieszkania.'});
    const sb=sbAdminClient(SUPABASE_URL,SERVICE_KEY);
    const [tableRows,documentRows]=await Promise.all([
      sb(`pi_fee_breakdowns?property_id=eq.${encodeURIComponent(propertyId)}&tenant_visible=eq.true&order=effective_month.desc&limit=120&select=id,property_id,effective_month,base_amount,items,media_items,notes,tenant_visible,updated_at`,{prefer:null}).catch(()=>[]),
      sb(`property_documents?property_id=eq.${encodeURIComponent(propertyId)}&category=eq.${encodeURIComponent(MIRROR_CATEGORY)}&tenant_visible=eq.true&order=created_at.desc&limit=120&select=id,property_id,category,note,tenant_visible,created_at,updated_at`,{prefer:null}).catch(()=>[])
    ]);
    const mirrorRows=(documentRows || []).map(parseMirror).filter(Boolean);
    const rows=mergeReports((tableRows || []).map(safeReport),mirrorRows);
    let start='',end='';
    if(requester.session?.tenancyId){
      const tenancies=await sb(`pi_tenancies?id=eq.${encodeURIComponent(requester.session.tenancyId)}&property_id=eq.${encodeURIComponent(propertyId)}&select=start_date,end_date&limit=1`,{prefer:null}).catch(()=>[]);
      start=month(tenancies?.[0]?.start_date);
      end=month(tenancies?.[0]?.end_date);
    }
    const visible=rows.filter(row=>{
      if(row?.tenant_visible===false) return false;
      const key=month(row?.effective_month);
      return (!start || !key || key>=start) && (!end || !key || key<=end);
    });
    const baseline=start ? rows.find(row=>row?.tenant_visible!==false && month(row?.effective_month) && month(row.effective_month)<start) : null;
    if(baseline && !visible.some(row=>String(row.id)===String(baseline.id))) visible.push(baseline);
    visible.sort((a,b)=>String(b.effective_month || '').localeCompare(String(a.effective_month || '')));
    return json(200,{ok:true,reports:visible.map(safeReport),count:visible.length,sources:{table:(tableRows || []).length,mirror:mirrorRows.length}});
  }catch(error){
    console.error('TENANT_FEE_REPORTS_ERROR',error);
    return json(500,{ok:false,code:'FEE_REPORT_FETCH_FAILED',message:'Nie udało się pobrać raportów opłat i mediów.'});
  }
};
