(function(root,factory){
  const api=factory();
  if(root) root.PureInvestFinanceDashboardMetrics=api;
  if(typeof module==='object' && module.exports) module.exports=api;
})(typeof window!=='undefined'?window:null,function(){
  const n=v=>{
    if(v===null||v===undefined||v==='') return 0;
    if(typeof v==='number') return Number.isFinite(v)?Math.round(v*100)/100:0;
    const x=Number(String(v).replace(/\s/g,'').replace(',','.').replace(/[^0-9.\-]/g,''));
    return Number.isFinite(x)?Math.round(x*100)/100:0;
  };
  const round=v=>Math.round(n(v)*100)/100;
  const sum=(rows,key)=>round((rows||[]).reduce((acc,row)=>acc+n(typeof key==='function'?key(row):row?.[key]),0));

  function compute(input={}){
    const monthly=Array.isArray(input.monthly)?input.monthly:[];
    const selectedYear=Number(input.selectedYear)||new Date().getFullYear();
    const currentYear=Number(input.currentYear)||new Date().getFullYear();
    const actual=monthly.filter(row=>row?.actual);
    const rentTotal=sum(monthly,'rent');
    const paidTotal=sum(actual,'paid');
    const communityTotal=sum(actual,'community');
    const mediaTotal=sum(actual,'media');
    const ownerCostTotal=sum(actual,'ownerCosts');
    const yearlyCost=round(communityTotal+mediaTotal+ownerCostTotal);
    const yearlyTax=sum(actual,'tax');
    const yearlyProfit=round(paidTotal-yearlyCost-yearlyTax);
    const actualTaxBase=sum(actual,'taxBase');
    const ownerRentAllocatedYearToDate=Math.max(0,n(input.ownerRentAllocatedYearToDate));
    const annualTax=typeof input.annualTax==='function'?input.annualTax:(base=>Math.min(n(base),100000)*0.085+Math.max(n(base)-100000,0)*0.125);

    let remainingOwnerRent=0;
    let remainingOwnerCosts=0;
    let forecastTax=yearlyTax;
    let forecast=yearlyProfit;

    if(selectedYear===currentYear){
      remainingOwnerRent=round(Math.max(0,rentTotal-ownerRentAllocatedYearToDate));
      remainingOwnerCosts=round(monthly.reduce((acc,row)=>{
        const expected=Math.max(0,n(row?.ownerCostsForecast));
        if(row?.future) return acc+expected;
        if(row?.isCurrent) return acc+Math.max(0,expected-n(row?.ownerCosts));
        return acc;
      },0));
      forecastTax=round(annualTax(actualTaxBase+remainingOwnerRent));
      // Przyszłe opłaty przenoszone na najemcę traktujemy jako neutralne dla wyniku.
      // Prognoza bazuje na gotówce już otrzymanej + brakującym najmie właścicielskim.
      forecast=round(paidTotal+remainingOwnerRent-yearlyCost-remainingOwnerCosts-forecastTax);
    }else if(selectedYear>currentYear){
      remainingOwnerRent=rentTotal;
      remainingOwnerCosts=round(monthly.reduce((acc,row)=>acc+Math.max(0,n(row?.ownerCostsForecast)),0));
      forecastTax=round(annualTax(rentTotal));
      forecast=round(rentTotal-remainingOwnerCosts-forecastTax);
    }

    return {
      rentTotal,paidTotal,communityTotal,mediaTotal,ownerCostTotal,yearlyCost,yearlyTax,yearlyProfit,
      actualTaxBase,ownerRentAllocatedYearToDate,remainingOwnerRent,remainingOwnerCosts,forecastTax,forecast
    };
  }

  return Object.freeze({version:'1.9.21',compute});
});
