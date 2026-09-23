'use strict';

const {
  DEMO_START,
  DEMO_TENANT_PHONE,
  DEMO_TENANT_PIN,
  DEMO_TENANT_PROPERTY_ID,
  DEMO_TENANT_TENANCY_ID,
  buildDemoData
}=require('./_pi-demo-data');
const {signSession,verifySession}=require('./_pi-security');
const Period=require('./_pi-payment-period');
const Settlement=require('./_pi-settlement');

function safePayment(row){
  return {id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,amount:row.amount,payment_date:Period.actualDate(row),date:Period.actualDate(row),source:row.source || row.category || 'Wpłata',category:row.category || null,settlement_month:Period.settlementMonth(row),note:Period.markerMonth(row.note)?`[[PI:SETTLEMENT_MONTH=${Period.markerMonth(row.note)}]]`:null,transaction_status:row.transaction_status || null,settlement_component:row.settlement_component || null,created_at:row.created_at || Period.actualDate(row)};
}
function safeExpense(row){
  return {id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,amount:row.amount,expense_date:row.expense_date || row.date || row.created_at || null,date:row.date || row.expense_date || row.created_at || null,category:row.category || 'Opłata',tenant_due:true,payer:'tenant',transaction_status:row.transaction_status || null,settlement_component:row.settlement_component || null,created_at:row.created_at || row.expense_date || row.date || null};
}
function safeIssue(row){
  return {id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,title:row.title,description:row.description,status:row.status,priority:row.priority,category:row.category || 'Usterka',room:row.room || row.location || null,permission_to_enter:row.permission_to_enter===true,attachment_url:null,attachment_path:row.attachment_path || null,attachment_name:row.attachment_name || null,created_at:row.created_at,updated_at:row.updated_at};
}
function safeMeter(row){
  return {id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,meter_type:row.meter_type || null,reading_value:row.reading_value ?? null,electricity_reading:row.electricity_reading ?? null,water_reading:row.water_reading ?? null,gas_reading:row.gas_reading ?? null,reading_date:row.reading_date || null,note:row.note || null,created_at:row.created_at || null};
}
function safeDocument(row){
  return {id:row.id,property_id:row.property_id,tenancy_id:row.tenancy_id || null,title:row.title || row.name || row.file_name,name:row.name || row.title || row.file_name,file_name:row.file_name,file_url:'',file_path:'',category:row.category,note:row.note,mime_type:row.mime_type,size_bytes:row.size_bytes,tenant_visible:true,created_at:row.created_at,kind:row.kind};
}
function safeFeeReport(row){
  return {id:row.id,property_id:row.property_id,effective_month:row.effective_month,base_amount:Number(row.base_amount || 0),items:Array.isArray(row.items)?row.items:[],media_items:Array.isArray(row.media_items)?row.media_items:[],notes:row.notes || null,tenant_visible:true,updated_at:row.updated_at || null,source:'pi_fee_breakdowns'};
}
function safeProperty(property,tenancy,items){
  return {
    id:property.id,name:property.name,address:property.address,area_m2:property.area_m2,
    tenant_name:tenancy.tenant_name,rent_amount:property.rent_amount,owner_rent:property.owner_rent,
    monthly_rent:property.monthly_rent,community_rent:property.community_rent,
    electricity_expected:property.electricity_expected,gas_expected:property.gas_expected,
    water_expected:property.water_expected,trash_expected:property.trash_expected,
    payment_day:tenancy.payment_day,rent_due_day:tenancy.payment_day,
    tenancy_id:tenancy.id,tenancy_start:tenancy.start_date,tenancy_end:tenancy.end_date,
    lease_start:tenancy.start_date,lease_end:tenancy.end_date,settlement_items:items,
    payment_account_number:property.payment_account_number,payment_account_owner:property.payment_account_owner,
    payment_account_note:property.payment_note,payment_account:property.payment_account,
    payment_account_label:property.payment_account_label,owner_phone:null,owner_email:'demo@pure-invest.pl'
  };
}

function demoTenantRows(referenceDate=new Date()){
  const data=buildDemoData(referenceDate);
  const property=data.properties.find(row=>row.id===DEMO_TENANT_PROPERTY_ID);
  const tenancy=data.pi_tenancies.find(row=>row.id===DEMO_TENANT_TENANCY_ID);
  if(!property || !tenancy) throw new Error('DEMO_TENANT_DATA_MISSING');
  const items=data.pi_settlement_items.filter(row=>row.property_id===property.id && (!row.tenancy_id || row.tenancy_id===tenancy.id));
  const propertyView=safeProperty(property,tenancy,items);
  const payments=data.payments.filter(row=>row.property_id===property.id && row.tenancy_id===tenancy.id && Settlement.live(row));
  const expenses=data.expenses.filter(row=>row.property_id===property.id && row.tenancy_id===tenancy.id && Settlement.live(row) && Settlement.tenantExpense(row));
  const settlementHistory=Settlement.history({property:propertyView,tenancy,settlementItems:items,payments,expenses,targetMonth:referenceDate,months:12});
  const currentKey=Period.normalizeMonth(referenceDate);
  const currentSettlement=settlementHistory.find(row=>row.key===currentKey) || settlementHistory.at(-1) || null;
  return {
    data,property,tenancy,items,propertyView,payments,expenses,settlementHistory,currentSettlement,
    documents:data.property_documents.filter(row=>row.property_id===property.id && row.tenant_visible!==false).map(safeDocument),
    issues:data.maintenance_requests.filter(row=>row.property_id===property.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).map(safeIssue),
    meterReadings:data.meter_readings.filter(row=>row.property_id===property.id).sort((a,b)=>String(b.reading_date || b.created_at).localeCompare(String(a.reading_date || a.created_at))).slice(0,12).map(safeMeter),
    feeBreakdowns:data.pi_fee_breakdowns.filter(row=>row.property_id===property.id && row.tenant_visible!==false).sort((a,b)=>String(b.effective_month).localeCompare(String(a.effective_month))).map(safeFeeReport)
  };
}

function buildDemoTenantSession(referenceDate=new Date()){
  const rows=demoTenantRows(referenceDate);
  const tenantToken=signSession({role:'tenant_demo',demoTenant:true,sandbox:true,propertyId:rows.property.id,tenancyId:rows.tenancy.id,phone:DEMO_TENANT_PHONE},8*60*60);
  return {
    ok:true,_clientVersion:'1.9.19',accountType:'demo_tenant',demoTenant:true,sandbox:true,
    property:rows.propertyView,
    tenancy:{id:rows.tenancy.id,start_date:rows.tenancy.start_date,end_date:rows.tenancy.end_date,status:rows.tenancy.status},
    documents:rows.documents,issues:rows.issues,meterReadings:rows.meterReadings,feeBreakdowns:rows.feeBreakdowns,
    payments:rows.payments.map(safePayment),expenses:rows.expenses.map(safeExpense),
    settlementHistory:rows.settlementHistory,currentSettlement:rows.currentSettlement,
    paidThisMonth:!!(rows.currentSettlement && ['ok','overpaid','paid-late'].includes(rows.currentSettlement.code)),
    tenantToken,sessionExpiresInHours:8,
    demoNotice:'Konto demonstracyjne. Zmiany są symulowane i nie są zapisywane w bazie produkcyjnej.'
  };
}

function verifyDemoTenantToken(token,propertyId){
  const session=verifySession(token,{roles:['tenant_demo'],propertyId});
  return session && session.demoTenant===true && session.sandbox===true && session.tenancyId===DEMO_TENANT_TENANCY_ID ? session : null;
}

module.exports={
  DEMO_START,DEMO_TENANT_PHONE,DEMO_TENANT_PIN,DEMO_TENANT_PROPERTY_ID,DEMO_TENANT_TENANCY_ID,
  buildDemoTenantSession,demoTenantRows,verifyDemoTenantToken,safeIssue,safeMeter,safeFeeReport
};
