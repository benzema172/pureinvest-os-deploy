function piAreaValueFrom(id){
  const n = Number(document.getElementById(id)?.value || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function piBuildNewPropertyPayload(){
  const ownerRent = Number(document.getElementById("newOwnerRent")?.value || 0);
  const communityRent = Number(document.getElementById("newCommunityRent")?.value || 0);
  const electricityExpected = Number(document.getElementById("newElectricityExpected")?.value || 0);
  const gasExpected = Number(document.getElementById("newGasExpected")?.value || 0);
  const waterExpected = Number(document.getElementById("newWaterExpected")?.value || 0);
  const rentDueDay = Number(document.getElementById("newRentDueDay")?.value || 10);
  const areaM2 = piAreaValueFrom("newPropertyArea");
  const address = (document.getElementById("newPropertyAddress")?.value || "").trim();
  const postalHint = (document.getElementById("newPropertyPostalHint")?.value || "").trim();
  const fullAddress = postalHint && address && !address.includes(postalHint) ? `${address}, ${postalHint}` : (address || postalHint);
  const rentAmount = Number(document.getElementById("newRentAmount")?.value || ownerRent + communityRent + electricityExpected + gasExpected + waterExpected || 0);
  return {
    name: (document.getElementById("newPropertyName")?.value || "").trim(),
    address: fullAddress,
    area_m2: areaM2,
    tenant_name: (document.getElementById("newTenantName")?.value || "").trim() || null,
    payment_account: (document.getElementById("newPaymentAccount")?.value || "").trim() || null,
    payment_account_label: (document.getElementById("newPaymentAccountLabel")?.value || "").trim() || null,
    rent_amount: rentAmount,
    owner_rent: ownerRent,
    community_rent: communityRent,
    electricity_expected: electricityExpected,
    gas_expected: gasExpected,
    water_expected: waterExpected,
    rent_due_day: rentDueDay
  };
}

function piClearNewPropertyForm(){
  ["newPropertyName","newPropertyAddress","newPropertyArea","newPropertyPostalHint","newTenantName","newRentAmount","newPaymentAccount","newPaymentAccountLabel","newOwnerRent","newCommunityRent","newElectricityExpected","newGasExpected","newWaterExpected","newRentDueDay"].forEach(id=>{const el=document.getElementById(id); if(el) el.value="";});
}

if(typeof window.addProperty !== "function"){

}
