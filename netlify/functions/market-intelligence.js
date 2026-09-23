'use strict';

const { requireRoles } = require('./_pi-security');

const CACHE_TTL_HOURS = Number(process.env.MARKET_INTELLIGENCE_TTL_HOURS || 168); // 7 dni
const BDL_BASE = 'https://bdl.stat.gov.pl/api/v1';
const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.PI_APIFY_TOKEN || '';
const APIFY_ACTOR = process.env.APIFY_OTODOM_ACTOR || process.env.PI_OTODOM_ACTOR || '';
const REQUEST_LIMIT = Math.max(1, Number(process.env.MARKET_INTELLIGENCE_REQUESTS_PER_HOUR || 12));
const REQUESTS = globalThis.__PI_MARKET_INTELLIGENCE_REQUESTS__ || (globalThis.__PI_MARKET_INTELLIGENCE_REQUESTS__ = new Map());

function requestKey(event){
  const headers = event?.headers || {};
  return String(headers['x-forwarded-for'] || headers['client-ip'] || headers['x-real-ip'] || 'unknown').split(',')[0].trim();
}
function tooManyRequests(event){
  const key = requestKey(event);
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const current = REQUESTS.get(key) || { count:0, startedAt:now };
  if(now - current.startedAt >= hour){
    REQUESTS.set(key, { count:1, startedAt:now });
    return false;
  }
  current.count += 1;
  REQUESTS.set(key, current);
  return current.count > REQUEST_LIMIT;
}

function json(statusCode, body){
  return {
    statusCode,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
    body:JSON.stringify(body)
  };
}
function n(v){
  if(v === null || v === undefined) return 0;
  const x = Number(String(v).replace(/\s/g,'').replace(',','.'));
  return Number.isFinite(x) ? x : 0;
}
function round(v, d=2){ return Number.isFinite(v) ? Math.round(v*Math.pow(10,d))/Math.pow(10,d) : null; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function pickProperty(body){
  if(body && body.property && typeof body.property === 'object') return body.property;
  if(Array.isArray(body?.properties) && body.properties.length) return body.properties[0];
  return {};
}
function propArea(p){ return n(p.area_m2 || p.area || p.size_m2 || p.usable_area || 0); }
function propOwnerRent(p){ return n(p.owner_rent || p.ownerRent || p.rent_owner || p.monthly_owner_rent || p.monthly_rent || p.rent_amount || 0); }
function propValue(p){ return n(p.market_value || p.purchase_price || p.estimated_value || p.value || 0); }
function propCity(p){
  const raw = String(p.city || p.town || p.locality || p.address || '').trim();
  if(!raw) return '';
  const parts = raw.split(',').map(x=>x.trim()).filter(Boolean);
  const candidate = parts.length > 1 ? parts[parts.length-1] : raw;
  return candidate.replace(/\d{2}-\d{3}/g,'').replace(/ul\.|al\.|os\./gi,'').trim().split(/\s+/).slice(0,3).join(' ');
}
function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/[^a-z0-9]+/g,' ').trim(); }

const CITY_MAP = {
  'chojnice':{city:'Chojnice', powiatUnit:'220200000000', voivUnit:'220000000000', tier:'small'},
  'piaseczno':{city:'Piaseczno', powiatUnit:'141800000000', voivUnit:'140000000000', tier:'metro'},
  'wagrowiec':{city:'Wągrowiec', powiatUnit:'302800000000', voivUnit:'300000000000', tier:'small'},
  'wągrowiec':{city:'Wągrowiec', powiatUnit:'302800000000', voivUnit:'300000000000', tier:'small'},
  'poznan':{city:'Poznań', powiatUnit:'306400000000', voivUnit:'300000000000', tier:'large'},
  'poznań':{city:'Poznań', powiatUnit:'306400000000', voivUnit:'300000000000', tier:'large'},
  'gdansk':{city:'Gdańsk', powiatUnit:'226100000000', voivUnit:'220000000000', tier:'large'},
  'gdańsk':{city:'Gdańsk', powiatUnit:'226100000000', voivUnit:'220000000000', tier:'large'},
  'warszawa':{city:'Warszawa', powiatUnit:'146500000000', voivUnit:'140000000000', tier:'capital'},
  'krakow':{city:'Kraków', powiatUnit:'126100000000', voivUnit:'120000000000', tier:'large'},
  'kraków':{city:'Kraków', powiatUnit:'126100000000', voivUnit:'120000000000', tier:'large'},
  'wroclaw':{city:'Wrocław', powiatUnit:'026400000000', voivUnit:'020000000000', tier:'large'},
  'wrocław':{city:'Wrocław', powiatUnit:'026400000000', voivUnit:'020000000000', tier:'large'},
  'lodz':{city:'Łódź', powiatUnit:'106100000000', voivUnit:'100000000000', tier:'large'},
  'łódź':{city:'Łódź', powiatUnit:'106100000000', voivUnit:'100000000000', tier:'large'}
};
function resolveMarketArea(city){
  const key = norm(city);
  const direct = CITY_MAP[key] || CITY_MAP[key.split(' ')[0]];
  return direct || {city:city || 'Polska', powiatUnit:null, voivUnit:null, tier:'default'};
}
async function fetchJson(url, opts={}){
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), opts.timeout || 9000);
  try{
    const headers = Object.assign({'Accept':'application/json','User-Agent':'PureInvestOS-MarketIntelligence/1.0'}, opts.headers || {});
    const res = await fetch(url, {headers, signal:controller.signal});
    const text = await res.text();
    if(!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0,160)}`);
    return JSON.parse(text);
  }finally{ clearTimeout(timeout); }
}
function flatten(obj, out=[]){
  if(Array.isArray(obj)) obj.forEach(x=>flatten(x,out));
  else if(obj && typeof obj === 'object'){
    out.push(obj);
    Object.values(obj).forEach(v=>{ if(v && typeof v === 'object') flatten(v,out); });
  }
  return out;
}
function extractNumberFromRecord(rec){
  const keys = ['val','value','wartosc','amount','measure','yval'];
  for(const k of keys){ const x = n(rec?.[k]); if(x) return x; }
  return 0;
}
function extractYearFromRecord(rec){
  const keys = ['year','rok','time','date','period'];
  for(const k of keys){ const y = parseInt(String(rec?.[k]||'').slice(0,4),10); if(y) return y; }
  return null;
}
function latestValuesFromBdlPayload(payload){
  const records = flatten(payload).map(r=>({year:extractYearFromRecord(r), value:extractNumberFromRecord(r)})).filter(r=>r.year && r.value > 0);
  const byYear = new Map();
  records.forEach(r=>{ if(!byYear.has(r.year) || byYear.get(r.year) < r.value) byYear.set(r.year, r.value); });
  return [...byYear.entries()].map(([year,value])=>({year, value})).sort((a,b)=>b.year-a.year);
}
async function discoverBdlVarId(){
  if(process.env.GUS_BDL_SALE_PRICE_M2_VAR_ID) return String(process.env.GUS_BDL_SALE_PRICE_M2_VAR_ID);
  // Najczęściej grupa sprzedaży lokali mieszkaniowych. Funkcja testuje kilka podgrup i wybiera zmienną „średnia cena za 1 m2”.
  const subjectCandidates = ['P3778','P3779','P3780','P3776','P3777','P3775','P3774'];
  for(const sid of subjectCandidates){
    try{
      const url = `${BDL_BASE}/variables?format=json&lang=pl&page-size=100&subject-id=${encodeURIComponent(sid)}`;
      const data = await fetchJson(url, {timeout:6000});
      const list = flatten(data).filter(x=>x && (x.id || x.Id || x.varId));
      const match = list.find(x=>{
        const name = norm([x.name,x.nazwa,x.label,x.description,x.wymiary,x.dimensions].filter(Boolean).join(' '));
        return name.includes('srednia cena') && name.includes('1 m2') && name.includes('lokali mieszkalnych') && !name.includes('wartosc');
      }) || list.find(x=>norm([x.name,x.nazwa,x.label,x.description].filter(Boolean).join(' ')).includes('1 m2 lokali mieszkalnych'));
      const id = match && (match.id || match.Id || match.varId || match.variableId);
      if(id) return String(id);
    }catch(_){ /* przejdź dalej */ }
  }
  return null;
}
async function getBdlSalePrice(area){
  const varId = await discoverBdlVarId();
  if(!varId) return null;
  const now = new Date().getFullYear();
  const years = [now-1, now-2, now-3, now-4].filter(y=>y>=2018).map(y=>`year=${y}`).join('&');
  const unitCandidates = [area.powiatUnit, area.voivUnit, '000000000000'].filter(Boolean);
  for(const unit of unitCandidates){
    try{
      const data = await fetchJson(`${BDL_BASE}/data/by-unit/${unit}?format=json&var-id=${encodeURIComponent(varId)}&${years}`, {timeout:8000});
      const values = latestValuesFromBdlPayload(data);
      if(values.length){
        const latest = values[0];
        const prev = values.find(v=>v.year < latest.year);
        const yoy = prev ? ((latest.value - prev.value) / prev.value) * 100 : null;
        return {value:latest.value, year:latest.year, prevValue:prev?.value || null, yoy, unit, varId};
      }
    }catch(_){ /* fallback na wyższy poziom */ }
  }
  return null;
}
function yieldForTier(tier){
  if(tier === 'capital') return 0.047;
  if(tier === 'large') return 0.052;
  if(tier === 'metro') return 0.055;
  if(tier === 'small') return 0.058;
  return 0.055;
}
async function getRentOffersViaApify({city, areaM2}){
  if(!APIFY_TOKEN || !APIFY_ACTOR) return null;
  const body = {
    city,
    maxItems: 40,
    operation: 'rent',
    category: 'apartments',
    areaFrom: Math.max(18, Math.round((areaM2 || 40) * 0.75)),
    areaTo: Math.max(28, Math.round((areaM2 || 40) * 1.25))
  };
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR)}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}&timeout=60`;
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 65000);
  try{
    const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:controller.signal});
    if(!res.ok) throw new Error(`Apify HTTP ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : [];
    const prices = items.map(x=>{
      const price = n(x.price || x.rent || x.priceValue || x.totalPrice || x.monthlyRent);
      const area = n(x.area || x.areaM2 || x.size || x.surface || x.m2);
      return price > 0 && area > 10 ? price / area : 0;
    }).filter(x=>x>5 && x<250).sort((a,b)=>a-b);
    if(!prices.length) return null;
    const mid = prices[Math.floor(prices.length/2)];
    return {rentPerM2:mid, sampleSize:prices.length, source:'Otodom/OLX przez Apify'};
  }catch(_){ return null; }
  finally{ clearTimeout(timeout); }
}
function buildSnapshot({property, properties, area, bdlSale, rentOffers}){
  const props = Array.isArray(properties) && properties.length ? properties : [property].filter(Boolean);
  const totalArea = props.reduce((s,p)=>s+propArea(p),0) || propArea(property) || 0;
  const ownerRent = props.reduce((s,p)=>s+propOwnerRent(p),0) || propOwnerRent(property) || 0;
  const currentValue = props.reduce((s,p)=>s+propValue(p),0) || propValue(property) || 0;
  let salePerM2 = bdlSale?.value || (totalArea && currentValue ? currentValue / totalArea : 0);
  const saleSource = bdlSale ? `GUS BDL, średnia cena transakcyjna lokali mieszkalnych za 1 m² (${bdlSale.year})` : (salePerM2 ? 'PureInvest OS — wartość z karty lokalu / metraż' : 'brak danych sprzedażowych');
  let rentPerM2 = rentOffers?.rentPerM2 || 0;
  let rentSource = rentOffers ? `${rentOffers.source}, próba ${rentOffers.sampleSize} ofert` : '';
  if(!rentPerM2 && salePerM2){
    rentPerM2 = salePerM2 * yieldForTier(area.tier) / 12;
    rentSource = `model PureInvest na podstawie ceny m² z ${bdlSale ? 'GUS BDL' : 'karty lokalu'} i rentowności referencyjnej ${round(yieldForTier(area.tier)*100,1)}%`;
  }
  const priceYoY = Number.isFinite(bdlSale?.yoy) ? bdlSale.yoy : null;
  const rentYoY = Number.isFinite(priceYoY) ? clamp(priceYoY * 0.65, -8, 14) : null;
  let marketTrend = '';
  if(Number.isFinite(rentYoY)) marketTrend = rentYoY > 2 ? 'wzrostowy' : (rentYoY < -2 ? 'spadkowy' : 'stabilny');
  let costTrend = Number.isFinite(priceYoY) ? (priceYoY > 4 ? 'rosnący' : (priceYoY < -2 ? 'spadkowy' : 'stabilny')) : '';
  const sources = [saleSource, rentSource].filter(Boolean);
  const today = new Date().toISOString().slice(0,10);
  const noteParts = [];
  if(bdlSale) noteParts.push(`Cena mieszkań: ostatni rocznik BDL ${bdlSale.year}; jednostka ${bdlSale.unit}; varId ${bdlSale.varId}.`);
  if(rentOffers) noteParts.push(`Najem: mediana ofert porównywalnych dla miasta ${area.city}.`);
  else if(rentPerM2) noteParts.push('Najem: automatyczny benchmark modelowy, bo nie skonfigurowano źródła ofertowego Apify.');
  if(totalArea && ownerRent && rentPerM2){
    const currentRentPerM2 = ownerRent / totalArea;
    const diff = ((currentRentPerM2 - rentPerM2) / rentPerM2) * 100;
    noteParts.push(`Aktualna stawka lokalu/portfela: ${round(currentRentPerM2,2)} zł/m²; różnica do benchmarku: ${round(diff,1)}%.`);
  }
  return {
    marketRentPerM2: round(rentPerM2,2) || 0,
    marketSalePerM2: round(salePerM2,2) || 0,
    marketRentYoY: round(rentYoY,1) || 0,
    marketPriceYoY: round(priceYoY,1) || 0,
    marketTrend,
    costTrend,
    marketSource: sources.join(' + '),
    marketUpdatedAt: today,
    marketNote: noteParts.join(' '),
    city: area.city,
    mode: rentOffers ? 'public-offers+gus' : 'gus+model',
    reliability: rentOffers ? 'wysoka dla najmu ofertowego' : (bdlSale ? 'średnia — najem wyliczony modelem z danych GUS' : 'orientacyjna — dane z karty lokalu'),
    raw:{bdlSale, rentOffers, totalArea, ownerRent}
  };
}

exports.handler = async (event)=>{
  if(event.httpMethod !== 'POST') return json(405,{ok:false,message:'Method not allowed'});
  const requester = await requireRoles(event, ['admin','owner']).catch(()=>null);
  if(!requester) return json(401,{ok:false,message:'Market Intelligence wymaga aktywnej sesji administratora albo ownera.'});
  if(tooManyRequests(event)) return json(429,{ok:false,message:'Przekroczono godzinowy limit odświeżeń danych rynkowych.'});
  let body = {};
  try{ body = JSON.parse(event.body || '{}'); }catch(_){ return json(400,{ok:false,message:'Nieprawidłowy JSON.'}); }
  try{
    const property = pickProperty(body);
    const properties = Array.isArray(body.properties) ? body.properties : [];
    const city = String(body.city || propCity(property) || propCity(properties[0] || {}) || '').trim();
    const area = resolveMarketArea(city);
    const areaM2 = propArea(property) || (properties.reduce((s,p)=>s+propArea(p),0) / Math.max(properties.length,1));
    const [bdlSale, rentOffers] = await Promise.all([
      getBdlSalePrice(area).catch(()=>null),
      getRentOffersViaApify({city:area.city, areaM2}).catch(()=>null)
    ]);
    const data = buildSnapshot({property, properties, area, bdlSale, rentOffers});
    return json(200,{ok:true, ttlHours:CACHE_TTL_HOURS, data});
  }catch(e){
    return json(200,{ok:false, message:String(e.message || e), data:null});
  }
};
