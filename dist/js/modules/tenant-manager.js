(function(){
  const $ = (id)=>document.getElementById(id);
  const clean = (id)=>($(id)?.value || '').trim();
  const toNum = (id)=>{
    const raw = ($(id)?.value || '').toString().replace(',', '.').replace(/[^0-9.\-]/g,'');
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const toInt = (id)=>{
    const n = parseInt(($(id)?.value || '').toString().replace(/[^0-9\-]/g,''), 10);
    return Number.isFinite(n) ? n : 0;
  };

  function ensureTenantCardExtraFieldsV565(){
    const account = $('paymentAccountInput');
    if(account){
      account.placeholder = 'Numer konta do wpłat';
      const row = account.closest('.form-row');
      if(row){
        const legacy = $('paymentAccountLabelInput');
        if(legacy && !$('paymentAccountOwnerInput')){
          legacy.id = 'paymentAccountOwnerInput';
          legacy.placeholder = 'Odbiorca przelewu, np. Wiktor Purczyński';
        }
        if(!$('paymentAccountOwnerInput')){
          const owner = document.createElement('input');
          owner.id = 'paymentAccountOwnerInput';
          owner.placeholder = 'Odbiorca przelewu, np. Wiktor Purczyński';
          row.appendChild(owner);
        }
        if(!$('paymentAccountNoteInput')){
          const noteRow = document.createElement('div');
          noteRow.className = 'form-row pi-payment-note-row-v565';
          noteRow.innerHTML = '<input id="paymentAccountNoteInput" placeholder="Tytuł przelewu / notatka dla najemcy, opcjonalnie"><input id="tenantInternalNoteMirrorV562" placeholder="Notatka wewnętrzna zarządcy, opcjonalnie">';
          row.parentNode.insertBefore(noteRow, row.nextElementSibling || null);
        }
      }
    }
  }

  function syncTenantCardFieldsV565(){
    ensureTenantCardExtraFieldsV565();
    const p = (typeof activePropertyData !== 'undefined' && activePropertyData) ? activePropertyData : (window.activePropertyData || null);
    if(!p) return;
    if($('tenantNameInput')) $('tenantNameInput').value = p.tenant_name || '';
    if($('tenantPhoneInput')) $('tenantPhoneInput').value = p.tenant_phone || '';
    if($('tenantEmailInput')) $('tenantEmailInput').value = p.tenant_email || '';
    if($('leaseStartInput')) $('leaseStartInput').value = p.lease_start || '';
    if($('paymentDayInput')) $('paymentDayInput').value = p.payment_day || p.rent_due_day || '';
    if($('rentDueDayInput')) $('rentDueDayInput').value = p.rent_due_day || p.payment_day || '';
    if($('paymentAccountInput')) $('paymentAccountInput').value = p.payment_account_number || p.payment_account || p.bank_account || '';
    if($('paymentAccountOwnerInput')) $('paymentAccountOwnerInput').value = p.payment_account_owner || p.payment_account_label || p.bank_account_label || '';
    if($('paymentAccountNoteInput')) $('paymentAccountNoteInput').value = p.payment_account_note || p.tenant_payment_note || '';
  }

  function buildTenantPayloadV565(){
    const owner = toNum('ownerRentInput');
    const community = toNum('communityRentInput');
    const electricity = toNum('electricityExpectedInput');
    const gas = toNum('gasExpectedInput');
    const water = toNum('waterExpectedInput');
    const total = owner + community + electricity + gas + water;
    const rentDueDay = toInt('rentDueDayInput') || toInt('paymentDayInput') || null;
    const paymentDay = toInt('paymentDayInput') || rentDueDay || null;
    return {
      tenant_name: clean('tenantNameInput') || null,
      tenant_phone: clean('tenantPhoneInput') || null,
      tenant_email: clean('tenantEmailInput') || null,
      lease_start: clean('leaseStartInput') || null,
      rent_amount: total || toNum('rentAmountInput') || null,
      payment_day: paymentDay,
      owner_rent: owner || null,
      community_rent: community || null,
      electricity_expected: electricity || null,
      gas_expected: gas || null,
      water_expected: water || null,
      rent_due_day: rentDueDay,
      payment_account_number: clean('paymentAccountInput') || null,
      payment_account_owner: clean('paymentAccountOwnerInput') || null,
      payment_account_note: clean('paymentAccountNoteInput') || null
    };
  }

  async function updateWithColumnFallbackV565(payload){
    if(typeof db === 'undefined') throw new Error('Brak połączenia z Supabase.');
    if(typeof activeProperty === 'undefined' || !activeProperty) throw new Error('Nie wybrano aktywnego mieszkania.');
    let body = {...payload};
    const removed = [];
    for(let i=0;i<12;i++){
      const res = await db.from('properties').update(body).eq('id', activeProperty).select('*').single();
      if(!res.error) return {data:res.data, removed};
      const msg = res.error.message || '';
      const m = msg.match(/Could not find the '([^']+)' column|column "([^"]+)"/i);
      const col = m && (m[1] || m[2]);
      if(col && Object.prototype.hasOwnProperty.call(body, col)){
        removed.push(col);
        delete body[col];
        continue;
      }
      if(/payment_account_number|payment_account_owner|payment_account_note/i.test(msg)){
        body.payment_account = payload.payment_account_number || null;
        body.payment_account_label = payload.payment_account_owner || payload.payment_account_note || null;
        delete body.payment_account_number;
        delete body.payment_account_owner;
        delete body.payment_account_note;
        continue;
      }
      throw res.error;
    }
    throw new Error('Nie udało się dopasować pól do schematu Supabase. Uruchom aktualne migracje PureInvest OS.');
  }

  const oldHydrateV565 = window.hydratePropertyForms;
  if(typeof oldHydrateV565 === 'function' && !window.__piHydrateV565){
    window.__piHydrateV565 = true;

  }

  document.addEventListener('DOMContentLoaded', ()=>setTimeout(syncTenantCardFieldsV565, 300));
})();
