const crypto = require('crypto');
const { requireRoles, sbAdminClient } = require('./_pi-security');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

const SAFE_TABLES = {
  properties: {
    propertyColumn: 'id',
    select: [
      'id','name','address','city','postal_code','area_m2','area','size_m2','purchase_price','market_value','purchase_date','equity_invested',
      'owner_rent','monthly_rent','rent_amount','community_rent','electricity_expected','gas_expected','water_expected','trash_expected','payment_day','rent_due_day','lease_start','lease_end','deposit_amount',
      'tenant_name','tenant_phone','tenant_email','tenant_access_enabled',
      'payment_account','payment_account_label','payment_account_number','payment_account_owner','payment_note','bank_account','bank_account_label','status','property_status','is_archived','archived_at',
      'created_at','updated_at'
    ]
  },
  payments: {
    propertyColumn: 'property_id',
    select: ['id','property_id','tenancy_id','amount','payment_date','date','source','category','note','settlement_month','transaction_status','transaction_source','settlement_component','settlement_type_id','tenant_due','taxable','is_deleted','deleted_at','attachment_url','attachment_path','attachment_name','created_at','updated_at']
  },
  expenses: {
    propertyColumn: 'property_id',
    select: ['id','property_id','tenancy_id','amount','expense_date','date','category','vendor','note','transaction_status','transaction_source','settlement_component','settlement_type_id','tenant_due','payer','is_deleted','deleted_at','attachment_url','attachment_path','attachment_name','created_at','updated_at']
  },
  property_documents: {
    propertyColumn: 'property_id',
    requireOwnerVisible: true,
    select: ['id','property_id','title','name','file_name','file_url','file_path','category','note','mime_type','size_bytes','tenant_visible','owner_visible','created_at','updated_at']
  },
  property_photos: {
    propertyColumn: 'property_id',
    requireOwnerVisible: true,
    select: ['id','property_id','title','name','file_name','file_url','file_path','category','note','mime_type','size_bytes','tenant_visible','owner_visible','created_at','updated_at']
  },
  maintenance_requests: {
    propertyColumn: 'property_id',
    select: ['id','property_id','title','description','status','priority','tenant_phone','attachment_url','attachment_path','attachment_name','created_at','updated_at']
  },
  meter_readings: {
    propertyColumn: 'property_id',
    select: ['id','property_id','meter_type','reading_value','reading_date','electricity_reading','water_reading','gas_reading','tenant_phone','note','created_at','updated_at']
  },
  pi_property_access: {
    propertyColumn: 'property_id',
    select: ['id','property_id','tenancy_id','user_email','user_phone','display_name','access_role','status','created_at','updated_at']
  },
  pi_tenancies: {
    propertyColumn: 'property_id',
    select: ['id','property_id','tenant_name','tenant_phone','tenant_email','start_date','end_date','payment_day','status','deposit_amount','created_at','updated_at']
  },
  pi_settlement_items: {
    propertyColumn: 'property_id',
    select: ['id','property_id','tenancy_id','scope','kind','name','component','default_amount','recurring','payer','tenant_due','taxable','effective_from','effective_to','active','created_at','updated_at']
  },
  generated_reports: {
    propertyColumn: 'property_id',
    select: ['id','report_type','report_action','report_scope','report_period','balance','property_id','file_path','created_at']
  }
};

const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const OPS = new Set(['eq', 'neq', 'gte', 'gt', 'lte', 'lt', 'in']);
function enc(value) { return encodeURIComponent(String(value)); }
function allowedProperties(session) { return new Set((session?.propertyIds || []).map(String).filter(Boolean)); }
function filterValue(op, value) {
  if (op === 'in') return `in.(${(Array.isArray(value) ? value : [value]).map(enc).join(',')})`;
  return `${op}.${enc(value)}`;
}
function filterValues(filter) {
  const op = String(filter?.op || '');
  const value = filter?.value ?? filter?.values;
  if (op === 'eq') return [String(value)].filter(Boolean);
  if (op === 'in') return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
  return [];
}
function intersectPropertyIds(filters, propertyColumn, allowed) {
  let requested = null;
  for (const filter of filters) {
    if (!filter || String(filter.column || '') !== propertyColumn) continue;
    const op = String(filter.op || '');
    if (op !== 'eq' && op !== 'in') continue;
    const values = filterValues(filter);
    requested = new Set(values.filter(v => allowed.has(String(v))));
  }
  return requested || allowed;
}
function selectFor(meta, requestedSelect) {
  const safe = meta.select || ['*'];
  const requested = String(requestedSelect || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!requested.length || requested.includes('*')) return safe.join(',');
  const allowed = new Set(safe);
  const chosen = requested.filter(c => SAFE_COL.test(c) && allowed.has(c));
  return (chosen.length ? chosen : safe).join(',');
}
function selectPath(table, meta, body, allowed) {
  const filters = Array.isArray(body.filters) ? body.filters : [];
  const targetIds = intersectPropertyIds(filters, meta.propertyColumn, allowed);
  const params = [`select=${encodeURIComponent(selectFor(meta, body.select))}`];

  if (!targetIds.size) params.push(`${meta.propertyColumn}=in.(__none__)`);
  else params.push(`${meta.propertyColumn}=in.(${[...targetIds].map(enc).join(',')})`);

  if (meta.requireOwnerVisible) params.push('owner_visible=eq.true');

  for (const filter of filters) {
    const column = String(filter.column || '');
    const op = String(filter.op || '');
    if (column === meta.propertyColumn) continue;
    if (column === 'tenant_visible' || column === 'owner_visible') continue;
    if (!SAFE_COL.test(column) || !OPS.has(op)) continue;
    if (!(meta.select || []).includes(column)) continue;
    params.push(`${column}=${filterValue(op, filter.value ?? filter.values)}`);
  }

  if (body.order && SAFE_COL.test(String(body.order.column || '')) && (meta.select || []).includes(String(body.order.column))) {
    params.push(`order=${body.order.column}.${body.order.ascending === false ? 'desc' : 'asc'}`);
  }
  if (body.limit) params.push(`limit=${Math.max(1, Math.min(500, Number(body.limit) || 50))}`);
  return `${table}?${params.join('&')}`;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Użyj POST.' });
  const requester = await requireRoles(event, ['owner']);
  if (!requester || requester.role !== 'owner') return json(401, { ok: false, message: 'Brak aktywnej sesji ownera.' });

  const allowed = allowedProperties(requester.session || {});
  if (!allowed.size) return json(403, { ok: false, message: 'Sesja ownera nie ma przypisanych mieszkań.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { ok: false, message: 'Nieprawidłowe dane wejściowe.' }); }
  const sb = sbAdminClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const legacyKind = String(body.kind || '').toLowerCase();

    if (legacyKind === 'transactions') {
      const requested = body.propertyId ? String(body.propertyId) : '';
      const ids = requested ? (allowed.has(requested) ? [requested] : []) : [...allowed];
      if (!ids.length) return json(403, { ok: false, message: 'Brak dostępu do wybranego mieszkania.' });

      const propertyFilter = `property_id=in.(${ids.map(enc).join(',')})`;
      const range = [];
      if (body.start) range.push(`created_at=gte.${enc(body.start)}`);
      if (body.end) range.push(`created_at=lte.${enc(body.end)}`);
      const paySelect = SAFE_TABLES.payments.select.join(',');
      const expSelect = SAFE_TABLES.expenses.select.join(',');
      const [payments, expenses] = await Promise.all([
        sb(`payments?${propertyFilter}&${range.join('&')}${range.length?'&':''}select=${encodeURIComponent(paySelect)}&order=created_at.desc`, { prefer: null }),
        sb(`expenses?${propertyFilter}&${range.join('&')}${range.length?'&':''}select=${encodeURIComponent(expSelect)}&order=created_at.desc`, { prefer: null })
      ]);
      return json(200, { ok: true, payments: Array.isArray(payments) ? payments : [], expenses: Array.isArray(expenses) ? expenses : [] });
    }

    if (legacyKind === 'properties') {
      const select = encodeURIComponent(SAFE_TABLES.properties.select.join(','));
      const data = await sb(`properties?id=in.(${[...allowed].map(enc).join(',')})&select=${select}`, { prefer: null });
      return json(200, { ok: true, properties: Array.isArray(data) ? data : [], data: Array.isArray(data) ? data : [] });
    }

    const table = String(body.table || '');
    const meta = SAFE_TABLES[table];
    if (!meta) return json(400, { ok: false, message: 'Tabela nie jest dostępna w owner proxy.' });
    if (String(body.action || 'select').toLowerCase() !== 'select') {
      return json(403, { ok: false, message: 'Owner ma w tej wersji tylko bezpieczny podgląd danych.' });
    }

    const data = await sb(selectPath(table, meta, body, allowed), { prefer: null });
    return json(200, { ok: true, data: Array.isArray(data) ? data : [], count: Array.isArray(data) ? data.length : 0 });
  } catch (error) {
    const requestId=crypto.randomBytes(8).toString('hex');
    console.error('OWNER_DATA_ERROR',requestId,error);
    return json(500, { ok: false, message: 'Owner proxy nie wykonał operacji.', requestId });
  }
};
