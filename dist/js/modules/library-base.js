window.PureInvestOCR3 = {
  suppliers: {
    "enea": {category:"Prąd", supplier:"ENEA"},
    "energa": {category:"Prąd", supplier:"ENERGA"},
    "tauron": {category:"Prąd", supplier:"TAURON"},
    "pge": {category:"Prąd", supplier:"PGE"},
    "pgnig": {category:"Gaz", supplier:"PGNiG"},
    "orange": {category:"Internet", supplier:"Orange"},
    "play": {category:"Internet", supplier:"Play"},
    "vectra": {category:"Internet", supplier:"Vectra"},
    "inea": {category:"Internet", supplier:"INEA"},
    "wspólnota": {category:"Czynsz", supplier:"Wspólnota"},
    "wspolnota": {category:"Czynsz", supplier:"Wspólnota"},
    "spółdzielnia": {category:"Czynsz", supplier:"Spółdzielnia"},
    "spoldzielnia": {category:"Czynsz", supplier:"Spółdzielnia"},
    "castorama": {category:"Remont", supplier:"Castorama"},
    "leroy": {category:"Remont", supplier:"Leroy Merlin"},
    "obi": {category:"Remont", supplier:"OBI"},
    "ikea": {category:"Wyposażenie", supplier:"IKEA"}
  }
};

function ocr3SafeText(value){
  return String(value || "").replace(/[<>]/g, "");
}

function ocr3Log(message){
  const box = document.getElementById("ocrEngineLog");
  if(!box) return;
  const time = new Date().toLocaleTimeString();
  box.innerHTML += `<div class="ocr-pro3-log-row">[${time}] ${ocr3SafeText(message)}</div>`;
  box.scrollTop = box.scrollHeight;
}

function ocr3SetStatus(message){
  const status = document.getElementById("ocrStatus");
  if(status) status.innerText = message;
}

function ocr3SetSummary(parsed, fileName){
  const box = document.getElementById("ocrPro3Summary");
  if(!box) return;

  const confidenceClass = parsed.confidence >= 80 ? "ocr-confidence-high" : parsed.confidence >= 60 ? "ocr-confidence-mid" : "ocr-confidence-low";

  box.classList.remove("hidden");
  box.innerHTML = `
    <b>${ocr3SafeText(fileName)}</b>
    Kwota: ${parsed.amount ? money(parsed.amount) : "—"} •
    Data: ${parsed.date || "—"} •
    Kat.: ${ocr3SafeText(parsed.category || "—")} •
    <span class="${confidenceClass}">${parsed.confidence || 0}%</span>
  `;
}

function ocr3DetectSupplier(text){
  const t = String(text || "").toLowerCase();
  for(const key in PureInvestOCR3.suppliers){
    if(t.includes(key)){
      return PureInvestOCR3.suppliers[key];
    }
  }
  return null;
}

function ocr3DetectInvoiceNumber(text){
  const raw = String(text || "");
  const patterns = [
    /(?:faktura|fv|nr|numer)\s*[:\-]?\s*([A-Z0-9\/\-]{4,})/i,
    /([A-Z]{1,4}\/\d{2,6}\/\d{2,4})/i
  ];

  for(const p of patterns){
    const m = raw.match(p);
    if(m && m[1]) return m[1].trim();
  }

  return null;
}

function ocr3DetectNip(text){
  const raw = String(text || "");
  const m = raw.match(/(?:NIP|nip)\s*[:\-]?\s*([0-9\-\s]{10,14})/);
  return m ? m[1].replace(/\D/g,"") : null;
}

function ocr3DetectPeriod(text){
  const raw = String(text || "");
  const m = raw.match(/(?:okres|za okres|rozliczeniowy)\s*[:\-]?\s*([0-9.\-\/\s]{8,25})/i);
  return m ? m[1].trim() : null;
}

function ocr3DetectApartment(text){
  const t = String(text || "").toLowerCase();

  const found = (loadedProperties || []).find(p => {
    const name = String(p.name || "").toLowerCase();
    const address = String(p.address || "").toLowerCase();

    return (name && t.includes(name)) || (address && t.includes(address));
  });

  return found || activePropertyData || null;
}

function ocr3Confidence(parsed){
  let score = 35;
  if(parsed.amount) score += 20;
  if(parsed.date) score += 14;
  if(parsed.category) score += 12;
  if(parsed.supplier) score += 8;
  if(parsed.invoiceNumber) score += 5;
  if(parsed.nip) score += 3;
  if(parsed.property) score += 3;
  return Math.min(score, 99);
}

function ocr3DuplicateKey(parsed){
  return [
    parsed.property?.id || activeProperty || "no-property",
    parsed.amount || "no-amount",
    parsed.date || "no-date",
    parsed.invoiceNumber || parsed.supplier || "no-doc"
  ].join("|");
}

async function ocr3CheckDuplicate(parsed){
  if(!parsed.amount || !(parsed.property?.id || activeProperty)) return false;

  let query = db
    .from("expenses")
    .select("*")
    .eq("amount", parsed.amount)
    .eq("property_id", parsed.property?.id || activeProperty);

  if(parsed.date){
    query = query.eq("created_at", parsed.date);
  }

  const {data,error} = await query;

  if(error){
    ocr3Log("Nie udało się sprawdzić duplikatu: " + error.message);
    return false;
  }

  return piLiveTxRows(data || []).length > 0;
}

async function ocr3ExtractTextFromDoc(file){
  return "DOC/DOCX: " + file.name;
}

async function ocr3ReadFile(file){
  const lower = file.name.toLowerCase();

  if(lower.endsWith(".doc") || lower.endsWith(".docx")){
    return await ocr3ExtractTextFromDoc(file);
  }

  const imageSource = await fileToOcrImage(file);
  await ensureTesseract();

  const result = await Tesseract.recognize(
    imageSource,
    "pol+eng",
    {
      logger:m=>{
        if(m.status){
          const progress = m.progress ? " " + Math.round(m.progress * 100) + "%" : "";
          ocr3SetStatus("OCR PRO 3.0: " + m.status + progress);
        }
      }
    }
  );

  return result.data.text || "";
}

function ocr3Parse(text){
  const base = parseInvoiceText(text || {});
  const supplier = ocr3DetectSupplier(text);
  const property = ocr3DetectApartment(text);

  if(supplier){
    base.supplier = supplier.supplier;
    base.category = supplier.category;
  }

  base.invoiceNumber = ocr3DetectInvoiceNumber(text);
  base.nip = ocr3DetectNip(text);
  base.period = ocr3DetectPeriod(text);
  base.property = property;
  base.confidence = ocr3Confidence(base);
  base.rawText = text || "";

  return base;
}

async function ocr3Save(parsed, file){
  if(!parsed.amount || parsed.amount <= 0){
    ocr3Log("Pominięto: brak kwoty w " + file.name);
    return {saved:false, reason:"no_amount"};
  }

  const duplicate = await ocr3CheckDuplicate(parsed);

  if(duplicate){
    ocr3Log("Duplikat: " + file.name + " — pominięto księgowanie.");
    return {saved:false, reason:"duplicate"};
  }

  const payload = {
    property_id: parsed.property?.id || activeProperty,
    amount: Number(parsed.amount),
    category: parsed.category || "Remont",
    created_at: parsed.date || todayDate(),
    note:
      "OCR PRO 3.0 AUTO: " + file.name +
      "\\nDostawca: " + (parsed.supplier || "-") +
      "\\nNumer dokumentu: " + (parsed.invoiceNumber || "-") +
      "\\nNIP: " + (parsed.nip || "-") +
      "\\nOkres: " + (parsed.period || "-") +
      "\\nConfidence: " + (parsed.confidence || 0) + "%"
  };

  let compatiblePayload=payload;
  try{ if(window.piSettlementDictionary?.ensurePayload) compatiblePayload=window.piSettlementDictionary.ensurePayload({...payload}, "expense", payload.category); }catch(_){ }
  const result=window.piSettlementDictionary?.insertWithFallback
    ? await window.piSettlementDictionary.insertWithFallback("expenses", compatiblePayload)
    : await db.from("expenses").insert([compatiblePayload]);
  const error=result?.error;

  if(error){
    ocr3Log("Błąd zapisu: " + error.message);
    return {saved:false, reason:error.message};
  }

  ocr3Log("Zaksięgowano: " + money(payload.amount) + " • " + payload.category);
  return {saved:true};
}

async function runInvoiceOCRPro(){
  const input = document.getElementById("ocrInvoiceFile");
  const files = [...(input?.files || [])];

  if(!files.length){
    alert("Dodaj dokumenty do OCR PRO.");
    return;
  }

  const preview = document.getElementById("ocrPreview");
  const log = document.getElementById("ocrEngineLog");
  const summary = document.getElementById("ocrPro3Summary");

  if(preview){
    preview.classList.remove("hidden");
    preview.innerHTML = "";
  }

  if(log) log.innerHTML = "";
  if(summary) summary.classList.add("hidden");

  ocr3SetStatus("OCR PRO 3.0 uruchomiony: " + files.length + " plików.");
  ocr3Log("Start kolejki OCR PRO 3.0.");

  let saved = 0;
  let skipped = 0;

  for(const file of files){
    try{
      ocr3Log("Analiza: " + file.name);
      const text = await ocr3ReadFile(file);
      const parsed = ocr3Parse(text);

      ocr3SetSummary(parsed, file.name);

      if(preview){
        preview.innerHTML += `
          <div style="padding:8px;border-bottom:1px solid #eee7de;">
            <b>${ocr3SafeText(file.name)}</b><br>
            ${parsed.amount ? money(parsed.amount) : "Brak kwoty"} •
            ${ocr3SafeText(parsed.category || "Brak kategorii")} •
            ${parsed.date || "Brak daty"} •
            ${parsed.confidence || 0}%
          </div>
        `;
      }

      const result = await ocr3Save(parsed, file);
      if(result.saved) saved++;
      else skipped++;

    }catch(e){
      skipped++;
      ocr3Log("Błąd " + file.name + ": " + e.message);
    }
  }

  ocr3SetStatus("Gotowe. Zaksięgowano: " + saved + ", pominięto: " + skipped + ".");
  ocr3Log("Koniec kolejki OCR.");

  if(typeof refreshDashboard === "function"){
    refreshDashboard();
  }
}

window.openQuickActionsView = function(){
  switchTab('dashboard', document.querySelector('.nav-item[onclick*=dashboard]'));
  setTimeout(function(){
    const target = document.querySelector('#tab-dashboard > .dashboard-triple-actions');
    if(target){
      target.scrollIntoView({behavior:'smooth', block:'start'});
    }
  }, 120);
};
