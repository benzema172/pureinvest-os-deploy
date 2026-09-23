(function(){
  if(window.__PI_TAX_POLICY_190__) return;
  window.__PI_TAX_POLICY_190__=true;
  const LOW_RATE=0.085,HIGH_RATE=0.125,THRESHOLD=100000,EXCLUDED=new Set(['draft','rejected','duplicate','archived']);
  const num=value=>{ const parsed=Number(String(value ?? 0).replace(/\s/g,'').replace(',', '.').replace(/zł|pln/ig,'').replace(/[^0-9.\-]/g,'')); return Number.isFinite(parsed)?Math.round(parsed*100)/100:0; };
  const round=value=>Math.round(num(value)*100)/100;
  const monthKey=value=>{ try{ return window.PureInvestPaymentPeriod?.actualMonth?.(value) || window.PureInvestPaymentPeriod?.normalizeMonth?.(value?.payment_date || value?.date || value?.created_at || value) || ''; }catch(_){ return ''; } };
  function annualTax(base){ const value=Math.max(0,num(base)); return round(Math.min(value,THRESHOLD)*LOW_RATE+Math.max(0,value-THRESHOLD)*HIGH_RATE); }
  function incrementalTax(currentBase,priorBase=0){ const current=Math.max(0,num(currentBase)),prior=Math.max(0,num(priorBase)); return round(annualTax(prior+current)-annualTax(prior)); }
  function eligible(row){ return row && row.is_deleted!==true && !row.deleted_at && !EXCLUDED.has(String(row.transaction_status || '').toLowerCase()); }
  function isRentTaxPayment(row){
    if(!eligible(row)) return false;
    const source=String(row.source || row.category || row.name || row.note || '').toLowerCase(),component=String(row.settlement_component || '').toLowerCase().replace('owner_rent','owner');
    if(row.taxable===false && component!=='owner') return false;
    return row.taxable===true || component==='owner' || /najem|czynsz najmu|odstępne|odstepne|(^|\s)rent(\s|$)/.test(source);
  }
  function ownerRentFromSettlement(property,key){
    const p=property || window.activePropertyData || {};
    try{ const item=(window.piGetEffectiveSettlementItems?.(p,key) || []).find(row=>row && row.active!==false && row.recurring==='monthly' && row.kind==='income' && /^(owner|owner_rent)$/i.test(String(row.component || '')) && row.tenant_due!==false && row.payer!=='owner'); if(num(item?.default_amount)>0) return num(item.default_amount); }catch(_){ }
    const direct=num(p.owner_rent ?? p.owner_monthly_rent ?? p.rent); if(direct>0) return direct;
    const extras=num(p.community_rent)+num(p.electricity_expected)+num(p.gas_expected)+num(p.water_expected)+num(p.trash_expected),total=num(p.rent_amount ?? p.monthly_rent); return total>extras?round(total-extras):0;
  }
  function taxBaseFromPaymentRows(rows,options={}){
    const engine=window.PureInvestSettlementEngine;
    if(typeof engine?.taxBaseFromPaymentRows==='function') return engine.taxBaseFromPaymentRows(rows,options);
    const filtered=(rows || []).filter(isRentTaxPayment),property=options.property || null;
    if(!property) return round(filtered.reduce((sum,row)=>sum+num(row.amount),0));
    const groups=new Map();
    filtered.forEach(row=>{ const key=monthKey(row); if(!key) return; const list=groups.get(key) || []; list.push(row); groups.set(key,list); });
    let total=0; groups.forEach((list,key)=>{
      const ownerSpecific=list.filter(row=>/^(owner|owner_rent)$/i.test(String(row.settlement_component || '')) || row.taxable===true).reduce((sum,row)=>sum+num(row.amount),0);
      const generic=list.filter(row=>!/^(owner|owner_rent)$/i.test(String(row.settlement_component || '')) && row.taxable!==true).reduce((sum,row)=>sum+num(row.amount),0);
      total+=ownerSpecific+Math.min(generic,ownerRentFromSettlement(property,key));
    });
    return round(total);
  }
  function taxableRentMonths(rows){ return new Set((rows || []).filter(isRentTaxPayment).map(monthKey).filter(Boolean)); }
  function calcTenantRentTax(rows,options={}){ return annualTax(taxBaseFromPaymentRows(rows,options)); }
  function patchFinanceCore(){
    const core=window.PureInvestFinanceCore; if(!core || core.__taxPolicy190) return;
    const original=core.propertyFinanceModel?.bind(core);
    core.propertyFinanceModel=function(property,payments,expenses){ const model=original?original(property,payments,expenses):{},baseRent=ownerRentFromSettlement(property),annualBase=baseRent*12,annualRentTax=annualTax(annualBase),monthlyTax=round(annualRentTax/12),purchase=num(property?.purchase_price ?? property?.market_value ?? model.purchase); return {...model,baseRent,monthlyTax,annualRentTax,annualNetRent:Math.max(0,annualBase-annualRentTax),purchase,roi:purchase>0?((annualBase-annualRentTax)/purchase)*100:null}; };
    core.__taxPolicy190=true;
  }
  window.PureInvestTaxPolicy={version:'1.9.0',LOW_RATE,HIGH_RATE,THRESHOLD,annualTax,incrementalTax,isRentTaxPayment,taxBaseFromPaymentRows,taxFromPayments:calcTenantRentTax,ownerRentFromSettlement};
  window.piTenantRentTaxBase=ownerRentFromSettlement; window.piTaxableRentMonths=taxableRentMonths; window.piTaxBaseFromPaymentRows=taxBaseFromPaymentRows; window.piCalcTenantRentTax=calcTenantRentTax; window.calcTax=annualTax;
  patchFinanceCore(); setTimeout(patchFinanceCore,80);
})();
