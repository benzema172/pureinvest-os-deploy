(function(){
  if(window.__PI_PAYMENT_PERIOD_1791__) return;
  window.__PI_PAYMENT_PERIOD_1791__ = true;

  // 1.9.0 writes one canonical marker, but still reads the legacy marker used
  // by earlier tenant-history builds. This keeps old payments correctly
  // allocated while ensuring every new write converges on one representation.
  const MARKER_RE = /\s*\[\[(?:PI:SETTLEMENT_MONTH=|PI_SETTLEMENT_MONTH:)(\d{4}-\d{2})\]\]\s*/gi;
  const MONTH_FIELDS = ['settlement_month','accounting_month','period_month','applies_to_month','rent_month'];
  const MONTH_NAMES = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];

  function normalizeMonth(value){
    if(value === null || value === undefined || value === '') return '';
    const raw = String(value).trim();
    const direct = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
    if(direct){
      const m = Number(direct[2]);
      if(m >= 1 && m <= 12) return direct[1] + '-' + direct[2];
    }
    const d = value instanceof Date ? value : new Date(value);
    if(!Number.isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }
  function actualDate(row){
    if(!row) return null;
    return row.payment_date || row.paid_at || row.received_at || row.created_at || row.date || row.createdAt || null;
  }
  function markerMonth(note){
    const match = String(note || '').match(/\[\[(?:PI:SETTLEMENT_MONTH=|PI_SETTLEMENT_MONTH:)(\d{4}-\d{2})\]\]/i);
    return match ? normalizeMonth(match[1]) : '';
  }
  function settlementMonth(row){
    if(!row) return '';
    for(const field of MONTH_FIELDS){
      const value = normalizeMonth(row[field]);
      if(value) return value;
    }
    const fromNote = markerMonth(row.note);
    if(fromNote) return fromNote;
    return normalizeMonth(actualDate(row) || row.expense_date || row.issued_at || row.updated_at);
  }
  function cleanNote(note){
    return String(note || '').replace(MARKER_RE, ' ').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/[ \t]{2,}/g,' ').trim();
  }
  function withMarker(note, month){
    const clean = cleanNote(note);
    const normalized = normalizeMonth(month);
    if(!normalized) return clean;
    return (clean ? clean + '\n' : '') + '[[PI:SETTLEMENT_MONTH=' + normalized + ']]';
  }
  function applyToPayload(payload, month){
    const body = Object.assign({}, payload || {});
    const normalized = normalizeMonth(month) || normalizeMonth(body.payment_date || body.created_at || new Date());
    if(normalized){
      body.settlement_month = normalized;
      body.note = withMarker(body.note, normalized);
    }
    return body;
  }
  function label(month, short=false){
    const normalized = normalizeMonth(month);
    if(!normalized) return '—';
    const y = normalized.slice(0,4), m = Number(normalized.slice(5,7));
    const name = MONTH_NAMES[m-1] || normalized;
    return short ? name.slice(0,3) + ' ' + y : name + ' ' + y;
  }
  function differsFromActual(row){
    const settlement = settlementMonth(row);
    const actual = normalizeMonth(actualDate(row));
    return !!(settlement && actual && settlement !== actual);
  }
  function actualMonth(row){ return normalizeMonth(actualDate(row)); }
  function isPaymentRow(row){
    if(!row) return false;
    if(row.__pi_table === 'payments' || row.table === 'payments' || row.type === 'income') return true;
    if(row.expense_date || row.vendor) return false;
    if(markerMonth(row.note)) return true;
    return ['payment_date','paid_at','received_at','payment_type','source'].some(field=>Object.prototype.hasOwnProperty.call(row,field));
  }
  function allocationMonth(row){ return isPaymentRow(row) ? settlementMonth(row) : normalizeMonth(row?.expense_date || row?.date || row?.created_at || row?.issued_at || row?.updated_at); }
  function queryRange(targetMonth, options={}){
    const normalized = normalizeMonth(targetMonth) || normalizeMonth(new Date());
    const [y,m] = normalized.split('-').map(Number);
    const monthsBack = Number(options.monthsBack ?? 12);
    const start = new Date(y, m-1-monthsBack, 1, 0,0,0,0);
    const next = new Date(y, m, 1, 0,0,0,0);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(0,0,0,0);
    const end = tomorrow > next ? tomorrow : next;
    return {startISO:start.toISOString(), endISO:end.toISOString()};
  }

  window.PureInvestPaymentPeriod = {
    version:'1.9.0', normalizeMonth, actualDate, actualMonth, settlementMonth, allocationMonth,
    cleanNote, withMarker, applyToPayload, label, differsFromActual, markerMonth, isPaymentRow, queryRange
  };
  window.piPaymentPeriod = window.PureInvestPaymentPeriod;
})();
