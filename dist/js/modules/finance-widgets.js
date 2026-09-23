window.OCR4 = {
  processed:0,
  saved:0,
  skipped:0,
  queue:[]
};

function ocr4Log(msg){
  const box = document.getElementById("ocr4Live");
  if(!box) return;
  box.innerHTML += `<div class="ocr4-file">${String(msg).replace(/[<>]/g,"")}</div>`;
  box.scrollTop = box.scrollHeight;
}

function ocr4UpdateStats(){
  const p=document.getElementById("ocr4Processed");
  const s=document.getElementById("ocr4Saved");
  const sk=document.getElementById("ocr4Skipped");

  if(p) p.innerText = OCR4.processed;
  if(s) s.innerText = OCR4.saved;
  if(sk) sk.innerText = OCR4.skipped;
}

function clearOCR4(){
  OCR4.processed = 0;
  OCR4.saved = 0;
  OCR4.skipped = 0;
  OCR4.queue = [];

  const live = document.getElementById("ocr4Live");
  if(live) live.innerHTML = "";

  const summary = document.getElementById("ocr4Summary");
  if(summary){
    summary.classList.add("hidden");
    summary.innerHTML = "";
  }

  const input = document.getElementById("ocrInvoiceFile");
  if(input) input.value = "";

  ocr4UpdateStats();
}

function ocr4NormalizeText(text){
  return String(text || "")
    .replace(/\s+/g," ")
    .trim();
}

function ocr4ExtractAmount(text){
  const matches = [...String(text).matchAll(/(\d+[.,]\d{2})\s?(?:zł|pln)?/gi)];
  if(!matches.length) return null;

  const nums = matches
    .map(m => parseFloat(m[1].replace(",", ".")))
    .filter(v => !isNaN(v));

  if(!nums.length) return null;

  return Math.max(...nums);
}

function ocr4ExtractDate(text){
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{2}[./-]\d{2}[./-]\d{4})/
  ];

  for(const p of patterns){
    const m = String(text).match(p);
    if(m && m[1]) return m[1].replace(/\./g,"-").replace(/\//g,"-");
  }

  return todayDate();
}

function ocr4DetectCategory(text){
  const t = String(text).toLowerCase();

  if(/enea|energa|tauron|pge|prąd|energia/.test(t)) return "Prąd";
  if(/pgnig|gaz/.test(t)) return "Gaz";
  if(/orange|play|vectra|inea|internet/.test(t)) return "Internet";
  if(/wspólnota|spółdzielnia|czynsz/.test(t)) return "Czynsz";
  if(/ikea|obi|leroy|castorama/.test(t)) return "Wyposażenie";

  return "Remont";
}

function ocr4DetectSupplier(text){
  const t = String(text).toLowerCase();

  const suppliers = [
    "ENEA","ENERGA","TAURON","PGE","PGNiG",
    "Orange","Play","Vectra","INEA",
    "Castorama","Leroy Merlin","OBI","IKEA"
  ];

  return suppliers.find(s => t.includes(s.toLowerCase())) || "Nieznany";
}

function ocr4DetectProperty(text){
  const t = String(text).toLowerCase();

  const found = (loadedProperties || []).find(p => {
    return (
      String(p.name || "").toLowerCase() &&
      t.includes(String(p.name || "").toLowerCase())
    ) || (
      String(p.address || "").toLowerCase() &&
      t.includes(String(p.address || "").toLowerCase())
    );
  });

  return found || activePropertyData || null;
}

async function ocr4Read(file){
  const lower = file.name.toLowerCase();

  if(lower.endsWith(".doc") || lower.endsWith(".docx")){
    return "DOCX FILE " + file.name;
  }

  const image = await fileToOcrImage(file);
  await ensureTesseract();

  const result = await Tesseract.recognize(
    image,
    "pol+eng"
  );

  return result?.data?.text || "";
}

function ocr4BuildSummary(parsed, fileName){
  return `
    <b>${fileName}</b><br>
    ${parsed.category} • ${parsed.supplier}<br>
    ${parsed.amount ? money(parsed.amount) : "Brak kwoty"} • ${parsed.date}<br>
    Confidence: ${parsed.confidence}%
  `;
}

async function ocr4Duplicate(parsed){
  if(!parsed.amount || !(parsed.property?.id || activeProperty)) return false;

  const {data,error} = await db
    .from("expenses")
    .select("*")
    .eq("amount", parsed.amount)
    .eq("property_id", parsed.property?.id || activeProperty)
    .limit(1);

  if(error) return false;

  return !!(piLiveTxRows(data || []).length);
}

async function ocr4Save(parsed, file){
  const duplicate = await ocr4Duplicate(parsed);

  if(duplicate){
    OCR4.skipped++;
    ocr4UpdateStats();
    ocr4Log("⚠️ Duplikat: " + file.name);
    return false;
  }

  if(!parsed.amount){
    OCR4.skipped++;
    ocr4UpdateStats();
    ocr4Log("⚠️ Brak kwoty: " + file.name);
    return false;
  }

  const payload = {
    property_id: parsed.property?.id || activeProperty,
    amount: parsed.amount,
    category: parsed.category,
    created_at: parsed.date,
    note:
      "OCR PRO 4.0 AUTO\n" +
      "Dostawca: " + parsed.supplier + "\n" +
      "Confidence: " + parsed.confidence + "%\n" +
      "Plik: " + file.name
  };

  let compatiblePayload=payload;
  try{ if(window.piSettlementDictionary?.ensurePayload) compatiblePayload=window.piSettlementDictionary.ensurePayload({...payload}, "expense", payload.category); }catch(_){ }
  const result=window.piSettlementDictionary?.insertWithFallback
    ? await window.piSettlementDictionary.insertWithFallback("expenses", compatiblePayload)
    : await db.from("expenses").insert([compatiblePayload]);
  const error=result?.error;

  if(error){
    OCR4.skipped++;
    ocr4UpdateStats();
    ocr4Log("❌ Błąd zapisu: " + error.message);
    return false;
  }

  OCR4.saved++;
  ocr4UpdateStats();
  ocr4Log("✅ Zaksięgowano: " + money(parsed.amount) + " • " + parsed.category);

  return true;
}

async function runOCRPro4(){
  const input = document.getElementById("ocrInvoiceFile");
  const files = [...(input?.files || [])];

  if(!files.length){
    alert("Dodaj dokumenty do OCR PRO 4.0");
    return;
  }

  clearOCR4();

  OCR4.queue = files;
  ocr4Log("🚀 Start OCR PRO 4.0");

  for(const file of files){
    OCR4.processed++;
    ocr4UpdateStats();

    try{
      ocr4Log("📄 Analiza: " + file.name);

      const raw = await ocr4Read(file);
      const text = ocr4NormalizeText(raw);

      const parsed = {
        amount: ocr4ExtractAmount(text),
        date: ocr4ExtractDate(text),
        category: ocr4DetectCategory(text),
        supplier: ocr4DetectSupplier(text),
        property: ocr4DetectProperty(text),
        confidence: Math.min(
          99,
          45 +
          (ocr4ExtractAmount(text) ? 20 : 0) +
          (ocr4DetectSupplier(text) !== "Nieznany" ? 15 : 0) +
          (ocr4DetectProperty(text) ? 10 : 0)
        )
      };

      const summary = document.getElementById("ocr4Summary");
      if(summary){
        summary.classList.remove("hidden");
        summary.innerHTML = ocr4BuildSummary(parsed, file.name);
      }

      await ocr4Save(parsed, file);

    }catch(e){
      OCR4.skipped++;
      ocr4UpdateStats();
      ocr4Log("❌ " + file.name + ": " + e.message);
    }
  }

  ocr4Log("🏁 OCR PRO 4.0 zakończony");

  if(typeof refreshDashboard === "function"){
    refreshDashboard();
  }
}

document.addEventListener("DOMContentLoaded", function(){
  const drop = document.getElementById("ocr4Dropzone");
  const input = document.getElementById("ocrInvoiceFile");

  if(!drop || !input) return;

  drop.addEventListener("click", () => input.click());

  ["dragenter","dragover"].forEach(evt => {
    drop.addEventListener(evt, e => {
      e.preventDefault();
      drop.classList.add("drag");
    });
  });

  ["dragleave","drop"].forEach(evt => {
    drop.addEventListener(evt, e => {
      e.preventDefault();
      drop.classList.remove("drag");
    });
  });

  drop.addEventListener("drop", e => {
    const dt = e.dataTransfer;
    if(dt?.files?.length){
      input.files = dt.files;
      ocr4Log("📥 Dodano " + dt.files.length + " plików do kolejki");
    }
  });
});
