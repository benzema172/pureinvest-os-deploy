window.RentEngine = {
  expected:0,
  paid:0,
  missing:0,
  percentage:0
};

function safeNum(v){
  return Number(v || 0);
}

function calculatePropertyExpectedRent(property, expenses){
  if(!property) return 0;
  const c = (typeof piRentEngineDueComponents === "function")
    ? piRentEngineDueComponents(property, expenses || [])
    : {
        owner: safeNum(property.owner_rent),
        community: safeNum(property.community_rent),
        electricity: safeNum(property.electricity_expected),
        gas: safeNum(property.gas_expected),
        water: safeNum(property.water_expected),
        other: 0
      };
  return safeNum(c.owner)+safeNum(c.community)+safeNum(c.electricity)+safeNum(c.gas)+safeNum(c.water)+safeNum(c.other);
}

const originalOCR4Save = window.ocr4Save;

if(typeof originalOCR4Save === "function"){
  window.ocr4Save = async function(parsed,file){

    const result = await originalOCR4Save(parsed,file);

    try{
      if(result && parsed && parsed.category){

        let paymentPayload = {
          property_id: parsed.property?.id || activeProperty,
          amount: Number(parsed.amount || 0),
          payment_type:
            parsed.category === "Prąd" ? "electricity" :
            parsed.category === "Gaz" ? "gas" :
            parsed.category === "Czynsz" ? "community" :
            "owner_rent",
          created_at: parsed.date || todayDate(),
          note: "AUTO RENT ENGINE OCR 4.0",
          transaction_status: "approved",
          transaction_source: "ocr"
        };

        try{
          if(window.PureInvestPaymentPeriod?.applyToPayload){
            const period=window.PureInvestPaymentPeriod.normalizeMonth(parsed.date || new Date());
            paymentPayload=window.PureInvestPaymentPeriod.applyToPayload(paymentPayload, period);
          }
        }catch(_){ }
        const result = window.piSettlementDictionary?.insertWithFallback
          ? await window.piSettlementDictionary.insertWithFallback("payments", paymentPayload)
          : await db.from("payments").insert([paymentPayload]);
        if(result?.error) throw result.error;

        console.log("AUTO RENT ENGINE: payment inserted");
      }
    }catch(e){
      console.error(e);
    }

    setTimeout(refreshRentEngine, 350);

    return result;
  };
}

const originalAddProperty = window.addProperty;

if(typeof originalAddProperty === "function"){

}

const originalOpenDashboardRent = window.openDashboard;

if(typeof originalOpenDashboardRent === "function"){

}
