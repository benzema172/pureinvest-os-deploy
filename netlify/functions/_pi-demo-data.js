'use strict';

const DEMO_MANAGER_LOGIN = 'demo@pure-invest.pl';
const DEMO_MANAGER_PASSWORD = 'PureInvestDemo2026!';
const DEMO_START = '2026-01-01';
const DEMO_TENANT_PHONE = '500000101';
const DEMO_TENANT_PIN = '2026';
const DEMO_TENANT_PROPERTY_ID = 'demo-property-01';
const DEMO_TENANT_TENANCY_ID = 'demo-tenancy-01';

const ADDRESSES = [
  ['Żeglarska 8/20A','ul. Żeglarska 8/20A','Chojnice','89-600'],
  ['Gdańska 95/10','ul. Gdańska 95/10','Chojnice','89-600'],
  ['Młyńska 14/6','ul. Młyńska 14/6','Bydgoszcz','85-082'],
  ['Toruńska 32/18','ul. Toruńska 32/18','Bydgoszcz','85-023'],
  ['Długa 41/7','ul. Długa 41/7','Gdańsk','80-831'],
  ['Chmielna 72/12','ul. Chmielna 72/12','Gdańsk','80-748'],
  ['Kościuszki 51/9','ul. Kościuszki 51/9','Gdynia','81-391'],
  ['Świętojańska 88/14','ul. Świętojańska 88/14','Gdynia','81-389'],
  ['Grunwaldzka 63/11','ul. Grunwaldzka 63/11','Poznań','60-311'],
  ['Półwiejska 22/8','ul. Półwiejska 22/8','Poznań','61-888'],
  ['Piotrkowska 126/16','ul. Piotrkowska 126/16','Łódź','90-006'],
  ['Wólczańska 74/5','ul. Wólczańska 74/5','Łódź','90-516'],
  ['Krucza 17/24','ul. Krucza 17/24','Warszawa','00-525'],
  ['Grochowska 210/31','ul. Grochowska 210/31','Warszawa','04-357'],
  ['Puławska 48/19','ul. Puławska 48/19','Warszawa','02-559'],
  ['Wrocławska 39/12','ul. Wrocławska 39/12','Kraków','30-011'],
  ['Starowiślna 63/8','ul. Starowiślna 63/8','Kraków','31-038'],
  ['Legnicka 55/27','ul. Legnicka 55/27','Wrocław','54-203'],
  ['Jedności Narodowej 91/13','ul. Jedności Narodowej 91/13','Wrocław','50-262'],
  ['Jagiellońska 31/15','ul. Jagiellońska 31/15','Szczecin','70-382'],
  ['Zwycięstwa 44/6','ul. Zwycięstwa 44/6','Koszalin','75-037'],
  ['Słowackiego 19/9','ul. Słowackiego 19/9','Toruń','87-100'],
  ['Lipowa 28/4','ul. Lipowa 28/4','Białystok','15-427'],
  ['Narutowicza 36/17','ul. Narutowicza 36/17','Lublin','20-016'],
  ['Piaseczno 137A/5','Piaseczno 137A/5','Piaseczno','05-500']
];

const TENANTS = [
  'Anna Kowalska','Marek Nowak','Julia Wiśniewska','Tomasz Wójcik','Zofia Kamińska',
  'Piotr Lewandowski','Natalia Zielińska','Krzysztof Szymański','Aleksandra Woźniak','Paweł Dąbrowski',
  'Magdalena Kozłowska','Michał Jankowski','Karolina Mazur','Łukasz Krawczyk','Weronika Piotrowska',
  'Jakub Grabowski','Oliwia Pawłowska','Mateusz Michalski','Emilia Król','Adam Wieczorek',
  'Wiktoria Jabłońska','Bartosz Wróbel','Amelia Nowakowska','Kamil Majewski','Monika Olszewska'
];

const round = value => Math.round(Number(value || 0) * 100) / 100;
const pad = value => String(value).padStart(2, '0');
const monthKey = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
const dateInMonth = (key, day) => {
  const [year, month] = key.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${key}-${pad(Math.max(1, Math.min(last, Number(day) || 1)))}`;
};
const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
};

function monthKeysUntil(referenceDate = new Date()){
  const reference = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const end = Number.isFinite(reference.getTime()) && reference >= new Date(`${DEMO_START}T00:00:00.000Z`)
    ? monthKey(reference)
    : '2026-01';
  const rows=[];
  let year=2026, month=1, guard=0;
  while(guard++ < 240){
    const key=`${year}-${pad(month)}`;
    rows.push(key);
    if(key >= end) break;
    month++;
    if(month>12){ month=1; year++; }
  }
  return rows;
}

function settlementItemsFor(property){
  const defs = [
    ['owner','income','Najem właścicielski',property.owner_rent,true,true],
    ['community','expense','Czynsz administracyjny',property.community_rent,true,false],
    ['electricity','expense','Energia elektryczna',property.electricity_expected,true,false],
    ['water','expense','Woda i kanalizacja',property.water_expected,true,false],
    ['gas','expense','Gaz',property.gas_expected,true,false],
    ['trash','expense','Odpady komunalne',property.trash_expected,true,false]
  ];
  return defs.filter(row=>row[3] > 0).map((row,index)=>({
    id:`item-${property.id}-${row[0]}`,
    property_id:property.id,
    tenancy_id:`demo-tenancy-${pad(property.__index)}`,
    scope:'property',
    component:row[0],
    kind:row[1],
    name:row[2],
    default_amount:row[3],
    recurring:'monthly',
    payer:'tenant',
    tenant_due:row[4],
    taxable:row[5],
    effective_from:DEMO_START,
    effective_to:null,
    active:true,
    created_at:`2026-01-01T0${index}:00:00.000Z`,
    updated_at:`2026-01-01T0${index}:00:00.000Z`
  }));
}

function buildProperty(index, nowIso){
  const [name,street,city,postal] = ADDRESSES[index - 1];
  const area = 28 + ((index * 7) % 55);
  const owner = 1325 + index * 47 + (index % 4) * 55;
  const community = 265 + (index % 7) * 31;
  const electricity = 74 + (index % 6) * 13;
  const water = 58 + (index % 5) * 12;
  const gas = index % 3 === 0 ? 0 : 39 + (index % 4) * 11;
  const trash = 31 + (index % 3) * 7;
  const total = round(owner + community + electricity + water + gas + trash);
  const property={
    __index:index,
    id:`demo-property-${pad(index)}`,
    name,
    address:`${street}, ${postal} ${city}`,
    city,
    postal_code:postal,
    area_m2:area,
    area,
    size_m2:area,
    purchase_price:185000 + index * 19750,
    market_value:242000 + index * 23800,
    purchase_date:`202${index % 5}-${pad((index % 12) + 1)}-15`,
    equity_invested:round((185000 + index * 19750) * (0.22 + (index % 4) * 0.03)),
    owner_rent:owner,
    monthly_rent:owner,
    rent_amount:total,
    community_rent:community,
    electricity_expected:electricity,
    gas_expected:gas,
    water_expected:water,
    trash_expected:trash,
    garbage_expected:trash,
    waste_expected:trash,
    payment_day:5 + (index % 8),
    rent_due_day:5 + (index % 8),
    lease_start:DEMO_START,
    rent_start:DEMO_START,
    lease_end:null,
    tenant_name:TENANTS[index - 1],
    tenant_phone:`+48 500 000 ${String(100 + index).slice(-3)}`,
    tenant_email:`najemca${pad(index)}@example.invalid`,
    tenant_access_enabled:true,
    payment_account:'PL00 0000 0000 0000 0000 0000 0000',
    payment_account_label:'Rachunek demonstracyjny',
    payment_account_number:'PL00 0000 0000 0000 0000 0000 0000',
    payment_account_owner:'PureInvest — dane demonstracyjne',
    payment_note:`Najem ${name} — DEMO`,
    bank_account:'PL00 0000 0000 0000 0000 0000 0000',
    bank_account_label:'Rachunek demonstracyjny',
    created_at:`2026-01-${pad(Math.min(index, 28))}T08:00:00.000Z`,
    updated_at:nowIso
  };
  property.settlement_items=settlementItemsFor(property);
  return property;
}

function expenseRows(property, key, todayIso, nowIso){
  const rows=[];
  const defs=[
    ['community','Czynsz administracyjny','Wspólnota mieszkaniowa',property.community_rent],
    ['electricity','Energia elektryczna','Dostawca energii — DEMO',property.electricity_expected],
    ['water','Woda i kanalizacja','Zakład wodociągów — DEMO',property.water_expected],
    ['gas','Gaz','Dostawca gazu — DEMO',property.gas_expected],
    ['trash','Odpady komunalne','Urząd miasta — DEMO',property.trash_expected]
  ];
  defs.filter(row=>row[3] > 0).forEach((row,index)=>{
    const planned=dateInMonth(key,1 + index);
    const expenseDate=planned > todayIso ? todayIso : planned;
    rows.push({
    id:`expense-${property.id}-${key}-${row[0]}`,
    property_id:property.id,
    tenancy_id:`demo-tenancy-${pad(property.__index)}`,
    amount:round(row[3]),
    expense_date:expenseDate,
    date:expenseDate,
    category:row[1],
    vendor:row[2],
    note:`Dokument demonstracyjny za ${key}`,
    month:key,
    settlement_month:key,
    created_at:`${expenseDate}T08:00:00.000Z`,
    updated_at:nowIso,
    deleted_at:null,
    is_deleted:false,
    deleted_note:null,
    transaction_status:'approved',
    transaction_source:'demo',
    settlement_component:row[0],
    tenant_due:true,
    payer:'tenant',
    taxable:false,
    attachment_url:null,
    attachment_path:null,
    attachment_name:null
  });
  });
  if((property.__index + Number(key.slice(5))) % 9 === 0 && dateInMonth(key,18) <= todayIso){
    rows.push({
      id:`expense-${property.id}-${key}-service`,property_id:property.id,tenancy_id:`demo-tenancy-${pad(property.__index)}`,
      amount:145 + property.__index * 3,expense_date:dateInMonth(key,18),date:dateInMonth(key,18),category:'Serwis i konserwacja',vendor:'Serwis techniczny — DEMO',note:'Koszt właściciela — dane demonstracyjne',month:key,settlement_month:key,
      created_at:`${dateInMonth(key,18)}T10:00:00.000Z`,updated_at:nowIso,deleted_at:null,is_deleted:false,deleted_note:null,transaction_status:'approved',transaction_source:'demo',settlement_component:'maintenance',tenant_due:false,payer:'owner',taxable:false,attachment_url:null,attachment_path:null,attachment_name:null
    });
  }
  return rows;
}

function paymentRows(property, key, currentKey, todayIso, nowIso){
  const due=property.rent_amount;
  const dueDate=dateInMonth(key,property.payment_day);
  const past=key < currentKey;
  let parts=[];
  if(past){
    if((property.__index + Number(key.slice(5))) % 8 === 0){
      parts=[[round(due * 0.45),addDays(dueDate,-2),'partial'],[round(due - round(due * 0.45)),addDays(dueDate,3),'approved']];
    }else if((property.__index + Number(key.slice(5))) % 6 === 0){
      parts=[[due,addDays(dueDate,2),'approved']];
    }else{
      parts=[[due,addDays(dueDate,-1 - (property.__index % 2)),'approved']];
    }
  }else if(dueDate > todayIso){
    parts=[];
  }else if(property.__index % 11 === 0){
    parts=[];
  }else if(property.__index % 7 === 0){
    parts=[[round(due * 0.55),addDays(dueDate,-1),'partial']];
  }else if(property.__index % 8 === 0){
    parts=[[round(due + 150),addDays(dueDate,-1),'approved']];
  }else{
    const late = property.__index % 9 === 0 && addDays(dueDate,2) <= todayIso;
    parts=[[due,late ? addDays(dueDate,2) : addDays(dueDate,-1),'approved']];
  }
  return parts.filter(part=>part[1] <= todayIso).map((part,index)=>({
    id:`payment-${property.id}-${key}-${index + 1}`,
    property_id:property.id,
    tenancy_id:`demo-tenancy-${pad(property.__index)}`,
    amount:round(part[0]),
    payment_date:part[1],
    date:part[1],
    source:'Najem i opłaty',
    category:'Wpłata najemcy',
    note:`Wpłata demonstracyjna za ${key}`,
    month:key,
    settlement_month:key,
    created_at:`${part[1]}T10:30:00.000Z`,
    updated_at:nowIso,
    deleted_at:null,
    is_deleted:false,
    deleted_note:null,
    transaction_status:part[2],
    transaction_source:'demo',
    settlement_component:'owner',
    tenant_due:true,
    payer:'tenant',
    taxable:true,
    attachment_url:null,
    attachment_path:null,
    attachment_name:null
  }));
}

function buildDemoData(referenceDate = new Date()){
  const parsed = referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date(referenceDate);
  const now = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const nowIso=now.toISOString();
  const todayIso=nowIso.slice(0,10);
  const months=monthKeysUntil(now);
  const currentKey=months.at(-1);
  const properties=Array.from({length:25},(_,index)=>buildProperty(index + 1,nowIso));
  const payments=[],expenses=[],meterReadings=[],feeBreakdowns=[],settlementItems=[];

  for(const property of properties){
    settlementItems.push(...property.settlement_items.map(item=>({...item})));
    let previousReading=null;
    for(const key of months){
      payments.push(...paymentRows(property,key,currentKey,todayIso,nowIso));
      expenses.push(...expenseRows(property,key,todayIso,nowIso));
      const monthNo=Number(key.slice(5));
      const plannedReadingDate=dateInMonth(key,Math.min(28,property.payment_day + 12));
      const readingDate=plannedReadingDate > todayIso ? todayIso : plannedReadingDate;
      const currentReading={
        id:`meter-${property.id}-${key}`,property_id:property.id,tenant_phone:property.tenant_phone,meter_type:'combined',
        reading_value:1000 + property.__index * 47 + monthNo * 16,electricity_reading:1000 + property.__index * 47 + monthNo * 16,
        water_reading:40 + property.__index * 3 + monthNo * 2,gas_reading:property.gas_expected ? 300 + property.__index * 9 + monthNo * 5 : null,
        reading_date:readingDate,note:`Odczyt demonstracyjny ${key}`,created_by_role:'tenant',created_at:`${readingDate}T18:00:00.000Z`,updated_at:nowIso
      };
      meterReadings.push(currentReading);
      const items=property.settlement_items.map(item=>({component:item.component,name:item.name,amount:item.default_amount,payer:item.payer,tenant_due:item.tenant_due}));
      const mediaConfig={
        electricity:{column:'electricity_reading',unit:'kwh',unitPrice:1.18},
        water:{column:'water_reading',unit:'m3',unitPrice:16.57},
        gas:{column:'gas_reading',unit:'m3',unitPrice:3.11}
      };
      const mediaItems=items.filter(item=>mediaConfig[item.component]).map((item,index)=>{
        const config=mediaConfig[item.component];
        const start=previousReading?.[config.column] ?? null;
        const end=currentReading[config.column] ?? null;
        const consumption=start!==null && end!==null && end>=start ? round(end-start) : 0;
        const actualCost=round(consumption*config.unitPrice);
        return {
          ...item,id:`media-${property.id}-${key}-${item.component}`,unit:config.unit,
          period_from:previousReading?.reading_date || `${key}-01`,period_to:currentReading.reading_date,
          start_reading:start,end_reading:end,consumption,unit_price:config.unitPrice,actual_cost:actualCost,
          advances:item.amount,settlement:round(actualCost-item.amount),sort_order:index,
          meter_source:{source:'tenant_meter_readings',start_id:previousReading?.id || null,start_date:previousReading?.reading_date || null,end_id:currentReading.id,end_date:currentReading.reading_date}
        };
      });
      feeBreakdowns.push({
        id:`fee-${property.id}-${key}`,property_id:property.id,effective_month:key,base_amount:property.owner_rent,
        items,media_items:mediaItems,notes:`Opłaty demonstracyjne za ${key}`,
        tenant_visible:true,source:'pi_fee_breakdowns',created_at:`${dateInMonth(key,1)}T07:00:00.000Z`,updated_at:nowIso
      });
      previousReading=currentReading;
    }
    delete property.__index;
  }

  const tenancies=properties.map((property,index)=>({
    id:`demo-tenancy-${pad(index + 1)}`,property_id:property.id,tenant_name:property.tenant_name,
    tenant_phone:property.tenant_phone,tenant_phone_norm:property.tenant_phone.replace(/\D/g,''),tenant_email:property.tenant_email,
    start_date:DEMO_START,end_date:null,payment_day:property.payment_day,status:'active',created_at:'2026-01-01T08:00:00.000Z',updated_at:nowIso
  }));
  const access=properties.map((property,index)=>({
    id:`demo-access-${pad(index + 1)}`,property_id:property.id,user_id:`demo-tenant-${pad(index + 1)}`,user_email:property.tenant_email,user_phone:property.tenant_phone,
    display_name:property.tenant_name,access_role:'tenant',status:'active',created_by:'demo-manager',tenancy_id:`demo-tenancy-${pad(index + 1)}`,created_at:'2026-01-01T08:00:00.000Z',updated_at:nowIso
  }));
  const documents=properties.map((property,index)=>({
    id:`demo-document-${pad(index + 1)}`,property_id:property.id,title:`Umowa najmu — ${property.name}`,name:`Umowa najmu — ${property.name}`,
    file_name:`umowa-najmu-${pad(index + 1)}.pdf`,file_url:'',file_path:'',category:'Umowa najmu',note:'Metadane dokumentu demonstracyjnego — bez rzeczywistego pliku.',
    mime_type:'application/pdf',size_bytes:0,tenant_visible:true,owner_visible:true,created_at:'2026-01-01T09:00:00.000Z',updated_at:nowIso
  }));
  const maintenance=properties.filter((_,index)=>index % 2 === 0).map((property,index)=>({
    id:`demo-maintenance-${pad(index + 1)}`,property_id:property.id,tenant_phone:property.tenant_phone,
    title:['Cieknący kran','Regulacja okna','Kontrola domofonu','Przegląd ogrzewania'][index % 4],
    description:'Przykładowe zgłoszenie w demonstracyjnym portfelu. Nie dotyczy prawdziwego lokalu.',
    status:['open','in_progress','resolved'][index % 3],priority:['normal','low','high'][index % 3],created_by_role:'tenant',attachment_url:null,attachment_path:null,attachment_name:null,
    created_at:`2026-${pad(1 + (index % Math.max(1,months.length)))}-${pad(4 + (index % 20))}T09:00:00.000Z`,updated_at:nowIso
  }));
  const reports=months.map((key,index)=>({
    id:`demo-report-${key}`,report_type:'portfolio',report_action:'preview',report_scope:'demo-manager',report_period:key,
    balance:round(payments.filter(row=>row.settlement_month===key).reduce((sum,row)=>sum+row.amount,0)-expenses.filter(row=>row.settlement_month===key).reduce((sum,row)=>sum+row.amount,0)),
    property_id:null,file_path:null,created_at:`${dateInMonth(key,Math.min(28,20 + index % 5))}T12:00:00.000Z`
  }));
  const activityLog=properties.slice(0,20).map((property,index)=>({
    id:`demo-activity-${pad(index + 1)}`,action:index % 3 === 0 ? 'payment_added' : index % 3 === 1 ? 'expense_added' : 'property_reviewed',entity_type:index % 3 === 0 ? 'payment' : index % 3 === 1 ? 'expense' : 'property',
    entity_id:property.id,property_id:property.id,actor_role:'manager',before_data:null,after_data:{demo:true,property_name:property.name},created_at:`${dateInMonth(months[Math.max(0,months.length - 1 - (index % Math.min(4,months.length)))],Math.min(28,index + 1))}T10:00:00.000Z`
  }));

  return {
    properties,payments,expenses,property_documents:documents,property_photos:[],maintenance_requests:maintenance,meter_readings:meterReadings,
    pi_property_access:access,pi_tenancies:tenancies,pi_settlement_items:settlementItems,pi_fee_breakdowns:feeBreakdowns,generated_reports:reports,
    activity_log:activityLog,payment_reminder_log:[],
    trusted_email_senders:[{id:'demo-sender-01',email:'faktury@example.invalid',sender_email:'faktury@example.invalid',vendor_name:'Dostawca demonstracyjny',sender_name:'Faktury DEMO',default_category:'Media',default_property_id:properties[0].id,read_pdf:true,scan_interval_hours:12,is_active:true,created_at:DEMO_START+'T08:00:00.000Z',updated_at:nowIso}],
    email_cost_candidates:[{id:'demo-candidate-01',connection_id:'demo',gmail_message_id:'demo-message',gmail_thread_id:'demo-thread',gmail_account_email:'demo@example.invalid',sender_email:'faktury@example.invalid',subject:'Faktura demonstracyjna za energię',detected_amount:96.45,detected_vendor:'Dostawca demonstracyjny',detected_category:'Energia elektryczna',detected_due_date:dateInMonth(currentKey,14),detected_invoice_number:`DEMO/${currentKey}`,confidence:0.92,raw_excerpt:'Wyłącznie dane demonstracyjne.',attachment_name:'faktura-demo.pdf',source:'demo',status:'new',approved_transaction_id:null,expense_id:null,created_at:nowIso,updated_at:nowIso}]
  };
}

module.exports={
  DEMO_MANAGER_LOGIN,
  DEMO_MANAGER_PASSWORD,
  DEMO_START,
  DEMO_TENANT_PHONE,
  DEMO_TENANT_PIN,
  DEMO_TENANT_PROPERTY_ID,
  DEMO_TENANT_TENANCY_ID,
  monthKeysUntil,
  buildDemoData
};
