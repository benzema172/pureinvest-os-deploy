(function(){
  if(window.__PI_TENANCY_SYNC_190__) return;
  window.__PI_TENANCY_SYNC_190__=true;
  const client=()=>window.db || window.piDb || (typeof db!=='undefined'?db:null);
  const phone=value=>String(value || '').replace(/\D/g,'');
  const today=()=>new Date().toISOString().slice(0,10);
  function propertyData(){ try{ return window.activePropertyData || activePropertyData || null; }catch(_){ return window.activePropertyData || null; } }
  async function activeForProperty(propertyId){
    const database=client(); if(!database || !propertyId) return null;
    const result=await database.from('pi_tenancies').select('*').eq('property_id',propertyId).in('status',['active','notice']).order('start_date',{ascending:false}).limit(1).maybeSingle();
    if(result.error && !/pi_tenancies/i.test(result.error.message || '')) throw result.error;
    return result.data || null;
  }
  async function sync(property){
    const database=client(),p=property || propertyData(); if(!database || !p?.id) return null;
    const tenantName=String(p.tenant_name || '').trim(),tenantPhone=String(p.tenant_phone || '').trim(),tenantEmail=String(p.tenant_email || '').trim().toLowerCase(),normalized=phone(tenantPhone),start=String(p.lease_start || p.rent_start || today()).slice(0,10),end=String(p.lease_end || p.rent_end || '').slice(0,10) || null,paymentDay=Number(p.payment_day || p.rent_due_day || 10) || 10;
    const existing=await activeForProperty(p.id);
    if(!tenantName && !normalized && !tenantEmail){
      if(existing){
        const requestedEnd=end || today(),closeDate=requestedEnd<existing.start_date?existing.start_date:requestedEnd;
        const result=await database.from('pi_tenancies').update({status:'ended',end_date:closeDate,updated_at:new Date().toISOString()}).eq('id',existing.id); if(result.error) throw result.error;
        const revoked=await database.from('pi_property_access').update({status:'revoked',updated_at:new Date().toISOString()}).eq('tenancy_id',existing.id).eq('access_role','tenant').eq('status','active'); if(revoked.error) throw revoked.error;
      }
      window.piActiveTenancyId=null; return null;
    }
    const changedTenant=!!(existing && ((existing.tenant_phone_norm || '')!==normalized || String(existing.start_date || '').slice(0,10)!==start));
    if(changedTenant){
      const startDate=new Date(start+'T12:00:00'),previousEnd=new Date(startDate.getTime()-86400000).toISOString().slice(0,10);
      const proposedEnd=existing.end_date && existing.end_date<previousEnd ? existing.end_date : previousEnd;
      const closeDate=proposedEnd<existing.start_date?existing.start_date:proposedEnd;
      const closed=await database.from('pi_tenancies').update({status:'ended',end_date:closeDate,updated_at:new Date().toISOString()}).eq('id',existing.id); if(closed.error) throw closed.error;
      const revoked=await database.from('pi_property_access').update({status:'revoked',updated_at:new Date().toISOString()}).eq('tenancy_id',existing.id).eq('access_role','tenant').eq('status','active'); if(revoked.error) throw revoked.error;
    }
    let row=changedTenant?null:existing;
    const payload={property_id:p.id,tenant_name:tenantName || null,tenant_phone:tenantPhone || null,tenant_phone_norm:normalized || null,tenant_email:tenantEmail || null,start_date:start,end_date:end,payment_day:Math.max(1,Math.min(31,paymentDay)),status:end && end<today()?'ended':'active',updated_at:new Date().toISOString()};
    if(row){ const result=await database.from('pi_tenancies').update(payload).eq('id',row.id).select('*').maybeSingle(); if(result.error) throw result.error; row=result.data; }
    else{ const result=await database.from('pi_tenancies').insert([{...payload,created_at:new Date().toISOString()}]).select('*').single(); if(result.error) throw result.error; row=result.data; }
    window.piActiveTenancyId=row?.id || null; p.tenancy_id=row?.id || null; p.tenancy_start=row?.start_date || start; p.tenancy_end=row?.end_date || end; return row;
  }
  async function load(){ const p=propertyData(); if(!p?.id) return null; const row=await activeForProperty(p.id).catch(()=>null); window.piActiveTenancyId=row?.id || null; if(row){ p.tenancy_id=row.id; p.tenancy_start=row.start_date; p.tenancy_end=row.end_date; } return row; }
  window.piSyncTenancyForProperty=sync; window.piLoadActiveTenancy=load; window.piFindActiveTenancy=activeForProperty;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(load,250));
})();
