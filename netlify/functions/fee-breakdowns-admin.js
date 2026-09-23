const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const {requireRoles,sbAdminClient}=require('./_pi-security');

const MIRROR_CATEGORY='pi_fee_media_report';
const MIRROR_PREFIX='PI_FEE_REPORT_V1:';

const json=(statusCode,body)=>({
  statusCode,
  headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate'},
  body:JSON.stringify(body)
});
const monthDate=value=>{
  const raw=String(value || '').slice(0,10);
  if(/^\d{4}-\d{2}$/.test(raw)) return raw+'-01';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(0,7)+'-01' : '';
};
const monthKey=value=>String(value || '').slice(0,7);
const safeArray=value=>Array.isArray(value)?value:[];
const safeReport=row=>({
  id:row?.id || null,
  property_id:row?.property_id || null,
  effective_month:row?.effective_month || null,
  base_amount:Number(row?.base_amount || 0),
  items:safeArray(row?.items),
  media_items:safeArray(row?.media_items),
  notes:row?.notes || '',
  tenant_visible:row?.tenant_visible !== false,
  created_at:row?.created_at || null,
  updated_at:row?.updated_at || null,
  source:row?.source || 'pi_fee_breakdowns'
});
const safeMeterReading=row=>({
  id:row?.id || null,
  property_id:row?.property_id || null,
  tenancy_id:row?.tenancy_id || null,
  meter_type:row?.meter_type || null,
  reading_value:row?.reading_value ?? null,
  electricity_reading:row?.electricity_reading ?? null,
  water_reading:row?.water_reading ?? null,
  gas_reading:row?.gas_reading ?? null,
  reading_date:row?.reading_date || null,
  note:row?.note || null,
  created_by_role:row?.created_by_role || null,
  created_at:row?.created_at || null,
  updated_at:row?.updated_at || null
});
function parseMirror(row){
  if(!row || row.category!==MIRROR_CATEGORY) return null;
  const note=String(row.note || '');
  if(!note.startsWith(MIRROR_PREFIX)) return null;
  try{
    const parsed=JSON.parse(note.slice(MIRROR_PREFIX.length));
    return safeReport({...parsed,id:parsed.id || `mirror:${row.id}`,property_id:row.property_id,tenant_visible:row.tenant_visible!==false,created_at:row.created_at,updated_at:row.updated_at || row.created_at,source:'property_documents'});
  }catch(_){ return null; }
}
function mergeReports(primary,mirrors){
  const byMonth=new Map();
  [...(mirrors || []),...(primary || [])].forEach(raw=>{
    const row=safeReport(raw);
    const key=monthKey(row.effective_month);
    if(!key) return;
    const existing=byMonth.get(key);
    if(!existing){ byMonth.set(key,row); return; }
    const existingTime=Date.parse(existing.updated_at || existing.created_at || 0) || 0;
    const nextTime=Date.parse(row.updated_at || row.created_at || 0) || 0;
    const existingScore=safeArray(existing.items).length+safeArray(existing.media_items).length*2;
    const nextScore=safeArray(row.items).length+safeArray(row.media_items).length*2;
    if(row.source==='pi_fee_breakdowns' || nextTime>existingTime || nextScore>existingScore) byMonth.set(key,row);
  });
  return [...byMonth.values()].sort((a,b)=>String(b.effective_month || '').localeCompare(String(a.effective_month || '')));
}
async function activeTenancyId(sb,propertyId){
  const today=new Date().toISOString().slice(0,10);
  const rows=await sb(`pi_tenancies?property_id=eq.${encodeURIComponent(propertyId)}&status=in.(active,notice)&or=(end_date.is.null,end_date.gte.${today})&order=start_date.desc&select=id&limit=1`,{prefer:null}).catch(()=>[]);
  return rows?.[0]?.id || null;
}
async function upsertMirror(sb,report){
  const propertyId=String(report.property_id || '');
  const effectiveMonth=monthDate(report.effective_month);
  const key=monthKey(effectiveMonth);
  const fileName=`pi-fee-report-${key}.json`;
  const tenancyId=await activeTenancyId(sb,propertyId);
  const existing=await sb(`property_documents?property_id=eq.${encodeURIComponent(propertyId)}&category=eq.${encodeURIComponent(MIRROR_CATEGORY)}&file_name=eq.${encodeURIComponent(fileName)}&select=id&limit=1`,{prefer:null}).catch(()=>[]);
  const now=new Date().toISOString();
  const payload={
    property_id:propertyId,
    tenancy_id:tenancyId,
    title:`Raport opłat i mediów ${key}`,
    name:`Raport opłat i mediów ${key}`,
    file_name:fileName,
    category:MIRROR_CATEGORY,
    note:MIRROR_PREFIX+JSON.stringify({...safeReport(report),effective_month:effectiveMonth,source:'property_documents'}),
    mime_type:'application/vnd.pureinvest.fee-report+json',
    tenant_visible:report.tenant_visible!==false,
    owner_visible:true,
    updated_at:now
  };
  let rows;
  if(existing?.[0]?.id){
    rows=await sb(`property_documents?id=eq.${encodeURIComponent(existing[0].id)}&select=*`,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)
    });
  }else{
    rows=await sb('property_documents?select=*',{
      method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{...payload,created_at:now}])
    });
  }
  const mirror=Array.isArray(rows)?rows[0]:rows;
  return {id:mirror?.id || null,tenancy_id:tenancyId,file_name:fileName};
}
async function listMirrors(sb,propertyId){
  const rows=await sb(`property_documents?property_id=eq.${encodeURIComponent(propertyId)}&category=eq.${encodeURIComponent(MIRROR_CATEGORY)}&order=created_at.desc&limit=120&select=*`,{prefer:null}).catch(()=>[]);
  return (rows || []).map(parseMirror).filter(Boolean);
}

exports.handler=async function(event){
  if(event.httpMethod!=='POST') return json(405,{ok:false,message:'Użyj POST.'});
  let body={};
  try{ body=JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowe dane.'}); }
  try{
    const requester=await requireRoles(event,['admin'],{supabaseUrl:SUPABASE_URL,serviceKey:SERVICE_KEY});
    if(!requester?.ok || requester.role!=='admin') return json(401,{ok:false,message:'Wymagane jest aktywne logowanie administratora.'});
    const sb=sbAdminClient(SUPABASE_URL,SERVICE_KEY);
    const action=String(body.action || 'list');
    const propertyId=String(body.propertyId || body.report?.property_id || '').trim();
    if(!propertyId) return json(400,{ok:false,message:'Brak identyfikatora mieszkania.'});

    if(action==='meter-readings'){
      try{
        const rows=await sb(`meter_readings?property_id=eq.${encodeURIComponent(propertyId)}&order=reading_date.desc,created_at.desc&limit=240&select=*`,{prefer:null});
        return json(200,{ok:true,readings:(rows || []).map(safeMeterReading),count:(rows || []).length});
      }catch(error){
        console.error('FEE_METER_READINGS_ERROR',error);
        return json(502,{ok:false,code:'METER_READINGS_UNAVAILABLE',message:'Nie udało się pobrać odczytów liczników dla wybranego mieszkania.'});
      }
    }

    if(action==='list'){
      const [rows,mirrors]=await Promise.all([
        sb(`pi_fee_breakdowns?property_id=eq.${encodeURIComponent(propertyId)}&order=effective_month.desc&limit=120&select=*`,{prefer:null}).catch(()=>[]),
        listMirrors(sb,propertyId)
      ]);
      return json(200,{ok:true,reports:mergeReports((rows || []).map(safeReport),mirrors),sources:{table:(rows || []).length,mirror:mirrors.length}});
    }

    if(action==='upsert'){
      const report=body.report && typeof body.report==='object' ? body.report : {};
      const effectiveMonth=monthDate(report.effective_month || body.effectiveMonth);
      if(!effectiveMonth) return json(400,{ok:false,message:'Nieprawidłowy miesiąc raportu.'});
      const payload={
        property_id:propertyId,
        effective_month:effectiveMonth,
        base_amount:Number(report.base_amount || 0),
        items:safeArray(report.items),
        media_items:safeArray(report.media_items),
        tenant_visible:report.tenant_visible !== false,
        notes:String(report.notes || '').trim() || null,
        updated_at:new Date().toISOString()
      };
      let tableReport=null;
      let tableError=null;
      try{
        const rows=await sb('pi_fee_breakdowns?on_conflict=property_id,effective_month&select=*',{
          method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([payload])
        });
        tableReport=safeReport(Array.isArray(rows)?rows[0]:rows);
      }catch(error){ tableError=error; }
      const mirror=await upsertMirror(sb,{...(tableReport || payload),source:'property_documents'});
      const verifiedMirrors=await listMirrors(sb,propertyId);
      const verifiedMirror=verifiedMirrors.find(row=>monthKey(row.effective_month)===monthKey(effectiveMonth));
      if(!tableReport && !verifiedMirror) throw tableError || new Error('REPORT_WRITE_NOT_VERIFIED');
      return json(200,{ok:true,report:safeReport(tableReport || verifiedMirror),published:true,verified:{table:!!tableReport,mirror:!!verifiedMirror,mirror_id:mirror.id,tenancy_id:mirror.tenancy_id},warning:tableError?'Główna tabela była niedostępna, ale raport opublikowano w bezpiecznej kopii dokumentowej.':null});
    }

    if(action==='delete'){
      const effectiveMonth=monthDate(body.effectiveMonth || body.report?.effective_month);
      if(!effectiveMonth) return json(400,{ok:false,message:'Nieprawidłowy miesiąc raportu.'});
      const key=monthKey(effectiveMonth);
      const fileName=`pi-fee-report-${key}.json`;
      await Promise.all([
        sb(`pi_fee_breakdowns?property_id=eq.${encodeURIComponent(propertyId)}&effective_month=eq.${encodeURIComponent(effectiveMonth)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(()=>null),
        sb(`property_documents?property_id=eq.${encodeURIComponent(propertyId)}&category=eq.${encodeURIComponent(MIRROR_CATEGORY)}&file_name=eq.${encodeURIComponent(fileName)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(()=>null)
      ]);
      return json(200,{ok:true});
    }

    return json(400,{ok:false,message:'Nieobsługiwana operacja.'});
  }catch(error){
    console.error('FEE_BREAKDOWNS_ADMIN_ERROR',error);
    const message=String(error?.message || '');
    if(message.includes('pi_fee_breakdowns') || message.includes('media_items')){
      return json(409,{ok:false,code:'FEE_REPORT_SCHEMA_MISSING',message:'Tabela raportów mediów nie ma wymaganych kolumn. Uruchom SQL_NAPRAWA_RAPORTOW_MEDIA_1_9_10.sql.'});
    }
    return json(500,{ok:false,code:'FEE_REPORT_PUBLISH_FAILED',message:'Nie udało się opublikować raportu w bazie. Zapis nie został potwierdzony.'});
  }
};
