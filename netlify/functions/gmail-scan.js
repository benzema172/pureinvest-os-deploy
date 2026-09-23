const {
  json, requireEnv, sb, getActiveConnections, getAccessToken, gmailDateFrom,
  header, extractEmail, collectTextAndAttachments, detectAmount, detectDueDate,
  detectInvoiceNumber, excerpt, gmailFetch, INITIAL_SCAN_FROM, MAX_INITIAL_MESSAGES,
  MAX_SCAN_MESSAGES, SCAN_INTERVAL_HOURS, MAX_GMAIL_CONNECTIONS, createScanLog, updateScanLog
} = require('./_pi-gmail-shared');
const { requireAdmin } = require('./_pi-security');

exports.config = { schedule: '0 */12 * * *' };

function senderLimit(totalSenders, totalCap){
  if(!totalSenders) return 0;
  return Math.max(5, Math.min(30, Math.ceil(totalCap / totalSenders)));
}
function getHeaderDate(message){
  const d = header(message.payload?.headers, 'Date');
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? new Date(Number(message.internalDate || Date.now())).toISOString() : parsed.toISOString();
}

function normalizePIText(value){
  return String(value || '')
    .toLowerCase()
    .replace(/ł/g,'l')
    .replace(/ą/g,'a').replace(/ć/g,'c').replace(/ę/g,'e').replace(/ń/g,'n')
    .replace(/ó/g,'o').replace(/ś/g,'s').replace(/ź/g,'z').replace(/ż/g,'z')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
const PI_PROPERTY_STOPWORDS = new Set(['mieszkanie','lokal','nieruchomosc','ul','ulica','al','aleja','os','osiedle','nr','m','lok','lokalu','apt','apartment','pureinvest','pure','invest','w','na','dla','czynsz','oplata','oplaty','rachunek','faktura','administracja','wspolnota']);
function propertyTokens(property){
  const base = [property?.name, property?.address].filter(Boolean).join(' ');
  const normalized = normalizePIText(base);
  return normalized.split(' ').filter(t => t.length >= 3 && !PI_PROPERTY_STOPWORDS.has(t));
}
function scorePropertyFromSubject(subject, property){
  const ns = normalizePIText(subject);
  const name = normalizePIText(property?.name);
  const address = normalizePIText(property?.address);
  let score = 0;
  const hits = [];
  if(name && name.length >= 3 && ns.includes(name)){ score += 90; hits.push(property.name); }
  if(address && address.length >= 3 && ns.includes(address)){ score += 80; hits.push(property.address); }
  const tokens = propertyTokens(property);
  for(const token of tokens){
    if(ns.includes(token)){
      score += token.length >= 7 ? 28 : 16;
      hits.push(token);
    }
  }
  return { score, hits: [...new Set(hits)].slice(0,4) };
}
function detectPropertyFromSubject(subject, properties){
  if(!Array.isArray(properties) || !properties.length) return null;
  const ranked = properties
    .map(p => ({ property:p, ...scorePropertyFromSubject(subject, p) }))
    .filter(x => x.score >= 28)
    .sort((a,b) => b.score - a.score);
  if(!ranked.length) return null;
  if(ranked[1] && ranked[0].score - ranked[1].score < 12) return null;
  return ranked[0];
}
async function loadPropertiesForMatching(){
  try{
    const rows = await sb('properties?select=id,name,address&limit=500', { prefer:null });
    return Array.isArray(rows) ? rows : [];
  }catch(e){
    console.warn('PI_GMAIL_PROPERTIES_MATCH_WARN', e.message || e);
    return [];
  }
}
async function getApprovedHistory(senderEmail, propertyId, category){
  if(!senderEmail || !propertyId) return [];
  try{
    const rows = await sb(`email_cost_candidates?sender_email=eq.${encodeURIComponent(senderEmail)}&status=eq.approved&detected_amount=gt.0&select=detected_amount,approved_at,received_at,subject,property_id,suggested_property_id,detected_category&order=approved_at.desc&limit=30`, { prefer:null });
    const data = Array.isArray(rows) ? rows : [];
    return data.filter(r => String(r.property_id || r.suggested_property_id || '') === String(propertyId))
      .filter(r => !category || !r.detected_category || String(r.detected_category).toLowerCase() === String(category).toLowerCase());
  }catch(e){
    console.warn('PI_GMAIL_HISTORY_WARN', e.message || e);
    return [];
  }
}
function suggestedAmountFromHistory(history){
  const amounts = (history || []).map(r => Number(r.detected_amount || 0)).filter(n => Number.isFinite(n) && n > 0).slice(0,5);
  if(!amounts.length) return null;
  const last = amounts[0];
  if(amounts.length >= 3){
    const avg = amounts.slice(0,3).reduce((a,b)=>a+b,0) / 3;
    const stable = amounts.slice(0,3).every(n => Math.abs(n - avg) <= Math.max(30, avg * 0.20));
    if(stable) return Math.round(last * 100) / 100;
  }
  return Math.round(last * 100) / 100;
}
async function messageExists(connectionId, messageId){
  if(!messageId) return false;
  const rows = await sb(`email_cost_candidates?connection_id=eq.${encodeURIComponent(connectionId)}&gmail_message_id=eq.${encodeURIComponent(messageId)}&select=id&limit=1`, { prefer:null });
  return Array.isArray(rows) && rows.length > 0;
}
async function insertCandidate(candidate){
  try{
    await sb('email_cost_candidates', { method:'POST', body: JSON.stringify([candidate]) });
    return true;
  }catch(e){
    const msg = String(e.message || e);
    if(msg.includes('duplicate') || msg.includes('unique') || msg.includes('idx_email_cost_candidates')) return false;
    throw e;
  }
}

function collectAttachmentParts(payload, out = []){
  if(!payload) return out;
  const filename = payload.filename || '';
  const attachmentId = payload.body && payload.body.attachmentId;
  if(filename && attachmentId){
    out.push({ filename, mimeType: payload.mimeType || '', attachmentId, size: payload.body.size || 0 });
  }
  (payload.parts || []).forEach(part => collectAttachmentParts(part, out));
  return out;
}
function decodeAttachmentData(data){
  if(!data) return Buffer.alloc(0);
  return Buffer.from(String(data).replace(/-/g,'+').replace(/_/g,'/'), 'base64');
}
async function gmailAttachmentText(accessToken, messageId, part){
  try{
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.attachmentId)}`;
    const att = await gmailFetch(accessToken, url);
    const buffer = decodeAttachmentData(att.data || '');
    if(!buffer.length) return '';
    const lower = String(part.filename || '').toLowerCase();
    const mime = String(part.mimeType || '').toLowerCase();
    if(mime.includes('text/') || lower.endsWith('.txt') || lower.endsWith('.csv') || lower.endsWith('.xml')){
      return buffer.toString('utf8');
    }
    if(mime.includes('html') || lower.endsWith('.html') || lower.endsWith('.htm')){
      return String(buffer.toString('utf8')).replace(/<[^>]+>/g,' ');
    }
    if(lower.endsWith('.docx') || mime.includes('wordprocessingml.document')){
      try{
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return result && result.value ? result.value : '';
      }catch(e){
        return `DOCX ${part.filename}: parser mammoth niedostępny lub dokument nieczytelny.`;
      }
    }
    if(lower.endsWith('.pdf') || mime.includes('pdf')){
      try{
        const pdfParse = require('pdf-parse');
        const result = await pdfParse(buffer);
        return result && result.text ? result.text : '';
      }catch(e){
        return `PDF ${part.filename}: brak tekstowej warstwy lub parser pdf-parse niedostępny.`;
      }
    }
    return '';
  }catch(e){
    return `Załącznik ${part.filename || ''}: nie udało się odczytać (${String(e.message||e).slice(0,80)}).`;
  }
}
async function collectAttachmentTexts(accessToken, message, limit = 5){
  const parts = collectAttachmentParts(message.payload).slice(0, limit);
  const out = [];
  for(const part of parts){
    const text = await gmailAttachmentText(accessToken, message.id, part);
    if(text && text.trim()) out.push(`ZAŁĄCZNIK ${part.filename}:\n${text}`);
  }
  return out;
}
async function buildCandidateFromMessage(message, senderRule, connection, properties = [], accessToken = null){
  const headers = message.payload?.headers || [];
  const subject = header(headers, 'Subject') || '(bez tematu)';
  const fromRaw = header(headers, 'From');
  const sender = extractEmail(fromRaw || senderRule.email);
  const receivedAt = getHeaderDate(message);
  const collected = collectTextAndAttachments(message.payload);
  const attachmentTexts = accessToken ? await collectAttachmentTexts(accessToken, message, 5) : [];
  const text = [subject, message.snippet || '', ...collected.text, ...attachmentTexts].join('\n');
  let amount = detectAmount(text);
  const due = detectDueDate(text);
  const invoice = detectInvoiceNumber(text);
  const category = senderRule.default_category || 'Inne';

  const subjectMatch = detectPropertyFromSubject(subject, properties);
  let propertyId = subjectMatch?.property?.id || senderRule.default_property_id || null;
  const aiNotes = [];
  let propertySource = 'none';

  if(subjectMatch?.property?.id){
    propertySource = 'subject';
    const label = subjectMatch.property.name || subjectMatch.property.address || 'mieszkanie';
    aiNotes.push(`PureInvest AI: mieszkanie rozpoznane z tytułu wiadomości jako „${label}”${subjectMatch.hits?.length ? ' (trafienie: '+subjectMatch.hits.join(', ')+')' : ''}.`);
  }else if(senderRule.default_property_id){
    propertySource = 'sender_default';
    aiNotes.push('PureInvest AI: mieszkanie ustawione z domyślnej reguły zaufanego nadawcy.');
  }else{
    aiNotes.push('PureInvest AI: nie rozpoznano mieszkania z tytułu — wymagana decyzja w panelu.');
  }

  let amountSource = amount ? 'message_or_attachment_text' : 'none';
  if(!amount && propertyId){
    const history = await getApprovedHistory(sender, propertyId, category);
    const historicalAmount = suggestedAmountFromHistory(history);
    if(historicalAmount){
      amount = historicalAmount;
      amountSource = 'approved_history';
      aiNotes.push(`PureInvest AI: kwota podpowiedziana z historii zatwierdzonych faktur od tego nadawcy dla tego mieszkania: ${historicalAmount.toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})} zł.`);
    }
  }

  let confidence = 25;
  if(propertySource === 'subject') confidence += 45;
  else if(propertySource === 'sender_default') confidence += 25;
  if(amountSource === 'message_or_attachment_text') confidence += 16;
  if(amountSource === 'approved_history') confidence += 9;
  if(due) confidence += 7;
  if(invoice) confidence += 7;
  if(collected.attachments.length) confidence += 5;
  if(attachmentTexts.length) confidence += 8;
  confidence = Math.min(confidence, 96);

  return {
    connection_id: connection.id,
    property_id: null,
    suggested_property_id: propertyId,
    gmail_message_id: message.id,
    gmail_thread_id: message.threadId || null,
    gmail_account_email: connection.gmail_email || null,
    sender_email: sender,
    subject,
    received_at: receivedAt,
    detected_vendor: senderRule.vendor_name || senderRule.email || sender,
    detected_amount: amount,
    detected_due_date: due,
    detected_invoice_number: invoice,
    detected_category: category,
    confidence,
    status: propertyId && amount ? 'new' : 'needs_review',
    raw_excerpt: excerpt([aiNotes.join(' '), text].filter(Boolean).join('\n')),
    attachment_name: collected.attachments.slice(0,5).join(', ') || null,
    source: attachmentTexts.length && amountSource === 'message_or_attachment_text' ? 'gmail_attachment_ai' : (amountSource === 'approved_history' ? 'gmail_history_ai' : 'gmail_subject_ai')
  };
}

async function runScanForConnection(connection, trusted, runType, properties = []){
  const startedAt = new Date();
  const firstScan = !connection.last_scan_at;
  const fromDate = firstScan ? (connection.initial_scan_from || INITIAL_SCAN_FROM) : connection.last_scan_at;
  const after = gmailDateFrom(fromDate);
  const totalCap = firstScan ? MAX_INITIAL_MESSAGES : MAX_SCAN_MESSAGES;
  const perSender = senderLimit(trusted.length, totalCap);
  const log = await createScanLog({
    connection_id: connection.id,
    run_type: runType,
    status: 'running',
    started_at: startedAt.toISOString(),
    from_date: fromDate,
    trusted_senders_count: trusted.length,
    messages_seen: 0,
    candidates_created: 0,
    duplicates_skipped: 0
  });

  const accessToken = await getAccessToken(connection);
  let messagesSeen = 0, created = 0, duplicates = 0, skipped = 0;
  const notes = [];

  try{
    for(const sender of trusted){
      if(messagesSeen >= totalCap) break;
      const q = `from:${sender.email} after:${after}`;
      const maxResults = Math.max(1, Math.min(perSender, totalCap - messagesSeen));
      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`;
      const list = await gmailFetch(accessToken, listUrl);
      const messages = Array.isArray(list.messages) ? list.messages : [];
      if(messages.length) notes.push(`${sender.email}: ${messages.length}`);
      for(const item of messages){
        if(messagesSeen >= totalCap) break;
        messagesSeen++;
        if(await messageExists(connection.id, item.id)){ duplicates++; continue; }
        const msg = await gmailFetch(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`);
        const candidate = await buildCandidateFromMessage(msg, sender, connection, properties, accessToken);
        if(await insertCandidate(candidate)) created++; else duplicates++;
      }
    }

    const finishedAt = new Date().toISOString();
    const summary = { gmail_email: connection.gmail_email, first_scan:firstScan, from_date:fromDate, after_query:after, trusted_senders:trusted.length, messages_seen:messagesSeen, candidates_created:created, duplicates_skipped:duplicates, skipped, notes };
    await sb(`gmail_connections?id=eq.${encodeURIComponent(connection.id)}`, {
      method:'PATCH',
      body: JSON.stringify({ last_scan_at: finishedAt, last_scan_status:'ok', last_scan_summary: summary, last_scan_error:null, updated_at: finishedAt })
    });
    await updateScanLog(log?.id, { status:'ok', finished_at:finishedAt, messages_seen:messagesSeen, candidates_created:created, duplicates_skipped:duplicates, summary });
    return { ok:true, gmail_email:connection.gmail_email, first_scan:firstScan, from_date:fromDate, messages_seen:messagesSeen, candidates_created:created, duplicates_skipped:duplicates };
  }catch(e){
    const finishedAt = new Date().toISOString();
    await sb(`gmail_connections?id=eq.${encodeURIComponent(connection.id)}`, { method:'PATCH', body: JSON.stringify({ last_scan_status:'error', last_scan_error:String(e.message||e), updated_at: finishedAt }) }).catch(()=>{});
    await updateScanLog(log?.id, { status:'error', finished_at:finishedAt, messages_seen:messagesSeen, candidates_created:created, duplicates_skipped:duplicates, error_message:String(e.message||e) });
    return { ok:false, gmail_email:connection.gmail_email, message:String(e.message||e), messages_seen:messagesSeen, candidates_created:created, duplicates_skipped:duplicates };
  }
}

async function runScan(runType){
  requireEnv();
  const connections = await getActiveConnections(MAX_GMAIL_CONNECTIONS);
  if(!connections.length) return { ok:false, code:'NO_GMAIL_CONNECTION', message:'Gmail nie jest jeszcze połączony. Kliknij „Połącz Gmail”.' };

  const trusted = await sb('trusted_email_senders?is_active=eq.true&order=created_at.asc&limit=20&select=*', { prefer:null });
  if(!Array.isArray(trusted) || !trusted.length){
    return { ok:false, code:'NO_TRUSTED_SENDERS', message:'Dodaj najpierw zaufanych nadawców rachunków.' };
  }

  const properties = await loadPropertiesForMatching();
  const results = [];
  for(const connection of connections){
    results.push(await runScanForConnection(connection, trusted, runType, properties));
  }
  const totalSeen = results.reduce((s,r)=>s+Number(r.messages_seen||0),0);
  const totalCreated = results.reduce((s,r)=>s+Number(r.candidates_created||0),0);
  const totalDuplicates = results.reduce((s,r)=>s+Number(r.duplicates_skipped||0),0);
  const failed = results.filter(r=>!r.ok);
  return {
    ok: failed.length === 0,
    partial_ok: failed.length > 0 && failed.length < results.length,
    message: `Skan zakończony dla ${results.length} kont Gmail. Przejrzano ${totalSeen} wiadomości, dodano ${totalCreated} kandydatów, pominięto duplikaty: ${totalDuplicates}. PureInvest AI rozpoznaje mieszkanie z tytułu wiadomości i uzupełnia kwotę z historii, gdy odczyt kwoty się nie uda.`,
    accounts_scanned: results.length,
    accounts_failed: failed.length,
    results,
    messages_seen: totalSeen,
    candidates_created: totalCreated,
    duplicates_skipped: totalDuplicates,
    schedule:`co ${SCAN_INTERVAL_HOURS}h`
  };
}

exports.handler = async function(event){
  const isScheduled = !!event.scheduled;
  if(!isScheduled && event.httpMethod !== 'POST') return json(405, { ok:false, message:'Użyj POST albo harmonogramu Netlify.' });
  if(!isScheduled){
    const requester = await requireAdmin(event);
    if(!requester) return json(401, { ok:false, message:'Brak autoryzacji administratora.' });
  }
  try{
    const result = await runScan(isScheduled ? 'scheduled' : 'manual');
    return json(result.ok || result.partial_ok ? 200 : 400, result);
  }catch(e){
    const requestId=require('crypto').randomBytes(8).toString('hex'); console.error('GMAIL_SCAN_ERROR',requestId,e); return json(500, { ok:false, message:'Nie udało się przeskanować Gmaila.', requestId });
  }
};
