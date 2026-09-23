const CANONICAL_MARKER = 'PI:SETTLEMENT_MONTH=';
const MARKER_RE = /\s*\[\[(?:PI:SETTLEMENT_MONTH=|PI_SETTLEMENT_MONTH:)(\d{4}-\d{2})\]\]\s*/gi;

function normalizeMonth(value){
  if(value === null || value === undefined || value === '') return '';
  const direct=String(value).trim().match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if(direct && Number(direct[2])>=1 && Number(direct[2])<=12) return `${direct[1]}-${direct[2]}`;
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime())) return '';
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
}
function actualDate(row){ return row?.payment_date || row?.paid_at || row?.received_at || row?.date || row?.created_at || row?.createdAt || null; }
function markerMonth(note){
  const match=String(note || '').match(/\[\[(?:PI:SETTLEMENT_MONTH=|PI_SETTLEMENT_MONTH:)(\d{4}-\d{2})\]\]/i);
  return match?normalizeMonth(match[1]):'';
}
function settlementMonth(row){
  for(const field of ['settlement_month','accounting_month','period_month','applies_to_month','rent_month']){
    const value=normalizeMonth(row?.[field]); if(value) return value;
  }
  return markerMonth(row?.note) || normalizeMonth(actualDate(row));
}
function cleanNote(note){ return String(note || '').replace(MARKER_RE,' ').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/[ \t]{2,}/g,' ').trim(); }
function withMarker(note,month){
  const clean=cleanNote(note),normalized=normalizeMonth(month);
  if(!normalized) return clean;
  return `${clean?clean+'\n':''}[[${CANONICAL_MARKER}${normalized}]]`;
}

module.exports={CANONICAL_MARKER,MARKER_RE,normalizeMonth,actualDate,markerMonth,settlementMonth,allocationMonth:settlementMonth,cleanNote,withMarker};
