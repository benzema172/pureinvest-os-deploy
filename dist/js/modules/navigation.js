window.PureInvestV52={propertyStatuses:{},portfolioSummary:null};
function v52Num(v){return Number(v||0)}
function v52Month(){const n=new Date();return {start:new Date(n.getFullYear(),n.getMonth(),1).toISOString().split("T")[0],end:new Date(n.getFullYear(),n.getMonth()+1,0).toISOString().split("T")[0]}}
function v52Expected(p){return v52Num(p.owner_rent||p.rent_amount)+v52Num(p.community_rent)+v52Num(p.electricity_expected)+v52Num(p.gas_expected)+v52Num(p.water_expected)}
async function v52Payments(){const current=new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0");const {data,error}=await db.from("payments").select("*");if(error){console.warn(error);return[]}const rows=piLiveTxRows(data||[]);return rows.filter(row=>{try{return (window.PureInvestPaymentPeriod?.settlementMonth?.(row)||String(row.payment_date||row.created_at||"").slice(0,7))===current}catch(_){return String(row.payment_date||row.created_at||"").slice(0,7)===current}})}
async function v52BuildPortfolioOS(){
  const props=loadedProperties||[], payments=await v52Payments();
  let late=0, warning=0, ok=0, expectedTotal=0, paidTotal=0, worst=null, statuses={};
  props.forEach(p=>{
    const expected=v52Expected(p);
    const paid=payments.filter(x=>x.property_id===p.id).reduce((s,x)=>s+Number(x.amount||0),0);
    expectedTotal+=expected; paidTotal+=paid;
    const missing=Math.max(expected-paid,0), percent=expected>0?Math.min(100,Math.round((paid/expected)*100)):0;
    let state="ok",label="OK";
    if(expected>0&&percent<70){state="bad";label="Zaległość";late++}
    else if(expected>0&&percent<100){state="warning";label="Częściowo";warning++}
    else ok++;
    if(missing>0&&(!worst||missing>worst.missing)) worst={property:p,missing,percent};
    statuses[p.id]={expected,paid,missing,percent,state,label};
  });
  PureInvestV52.propertyStatuses=statuses; PureInvestV52.portfolioSummary={late,warning,ok,expectedTotal,paidTotal,forecast:paidTotal,worst};
  v52RenderWelcomeOS(); v52EnhancePropertyTiles();
}
function v52RenderWelcomeOS(){
  const s=PureInvestV52.portfolioSummary;if(!s)return;
  const set=(id,val)=>{const e=document.getElementById(id);if(e)e.innerText=val};
  set("osLateCount",s.late);set("osWarningCount",s.warning);set("osOkCount",s.ok);set("osForecast",money(s.forecast));
  const badge=document.getElementById("welcomeOSBadge");
  if(badge){if(s.late>0){badge.innerText="Wymaga uwagi";badge.style.background="#b91c1c"}else if(s.warning>0){badge.innerText="Kontrola";badge.style.background="#c2410c"}else{badge.innerText="Portfel OK";badge.style.background="#166534"}}
  const ai=document.getElementById("osAISuggestion");
  if(ai){if(s.worst){ai.innerText=`${s.worst.property.name||"Mieszkanie"} ma największą różnicę w płatnościach: brakuje ${money(s.worst.missing)}. Warto sprawdzić wpłatę najemcy.`}else if((loadedProperties||[]).length){ai.innerText="Portfel wygląda poprawnie. Nie wykryto istotnych zaległości w płatnościach."}else{ai.innerText="Dodaj pierwsze mieszkanie, aby PureInvest OS mógł analizować płatności, zaległości i status portfela."}}
}
function v52EnhancePropertyTiles(){
  const statuses=PureInvestV52.propertyStatuses||{};
  document.querySelectorAll("#propertyTiles .tile").forEach(tile=>{
    const onclick=tile.getAttribute("onclick")||"";
    const fromData = tile.getAttribute("data-property-id") || "";
    const m=onclick.match(/openDashboard\(['"]([^'"]+)['"]\)/);
    const propertyId = fromData || (m ? m[1] : "");
    if(!propertyId)return;
    const st=statuses[propertyId]; if(!st)return;
    tile.classList.remove("status-ok","status-warning","status-bad"); tile.classList.add("status-"+st.state);
    tile.querySelectorAll(".property-status-pill,.rent-progress-mini,.rent-progress-text").forEach(x=>x.remove());
    const pill=document.createElement("div"); pill.className="property-status-pill"; pill.innerText=st.label; tile.appendChild(pill);
    const progress=document.createElement("div"); progress.className="rent-progress-mini"; progress.innerHTML=`<div style="width:${st.percent}%"></div>`; tile.appendChild(progress);
    const text=document.createElement("div"); text.className="rent-progress-text"; text.innerText=st.expected>0?`${money(st.paid)} / ${money(st.expected)}`:"Brak ustawionej należności"; tile.appendChild(text);
  });
}
const v52Load=window.loadPropertyTiles;if(typeof v52Load==="function"){
}
const v52Back=window.backToWelcome;if(typeof v52Back==="function"){
}
const v52Show=window.showWelcome;if(typeof v52Show==="function"){
}
window.pureInvestV52Refresh=v52BuildPortfolioOS;
