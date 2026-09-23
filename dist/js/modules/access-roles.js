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

  function getActivePropertyIdV566(){
    const dataId = (typeof activePropertyData !== 'undefined' && activePropertyData && activePropertyData.id) ? activePropertyData.id : (window.activePropertyData && window.activePropertyData.id);
    if(dataId) return String(dataId);

    if(typeof activeProperty !== 'undefined' && activeProperty){
      if(typeof activeProperty === 'string' || typeof activeProperty === 'number') return String(activeProperty);
      if(typeof activeProperty === 'object' && activeProperty.id) return String(activeProperty.id);
    }

    return '';
  }

  function buildTenantPayloadV566(){
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
      monthly_rent: total || toNum('rentAmountInput') || null,
      payment_day: paymentDay,

      owner_rent: owner || null,
      community_rent: community || null,
      electricity_expected: electricity || null,
      gas_expected: gas || null,
      water_expected: water || null,
      rent_due_day: rentDueDay,

      payment_account_number: clean('paymentAccountInput') || null,
      payment_account_owner: clean('paymentAccountOwnerInput') || clean('paymentAccountLabelInput') || null,
      payment_account_note: clean('paymentAccountNoteInput') || null
    };
  }

  async function saveOnlyActivePropertyV566(propertyId, payload){
    if(typeof db === 'undefined') throw new Error('Brak połączenia z Supabase.');
    if(!propertyId) throw new Error('Nie rozpoznano aktywnego mieszkania. Wróć do listy mieszkań i otwórz lokal ponownie.');

    let body = {...payload};
    const removed = [];

    for(let i=0;i<16;i++){
      const res = await db
        .from('properties')
        .update(body)
        .eq('id', propertyId)
        .select('*')
        .maybeSingle();

      if(!res.error){
        if(!res.data || String(res.data.id) !== String(propertyId)){
          throw new Error('Supabase nie potwierdził zapisu właściwego mieszkania. Zapis przerwany.');
        }
        return {data:res.data, removed};
      }

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

      if(/monthly_rent/i.test(msg)){
        removed.push('monthly_rent');
        delete body.monthly_rent;
        continue;
      }

      throw res.error;
    }

    throw new Error('Nie udało się dopasować pól do schematu Supabase. Uruchom aktualne migracje PureInvest OS.');
  }

  const oldSwitchV566 = window.switchTab;
  if(typeof oldSwitchV566 === 'function' && !window.__piSwitchV566){
    window.__piSwitchV566 = true;

  }
})();

let piAccessCurrentUser=null;
let piCurrentRole='guest';
let piAccessRows=[];

function piRoleLabel(role){
  const map={admin:'Administrator',super_admin:'Superadministrator',owner:'Właściciel',tenant:'Najemca',friend:'Gość / podgląd',guest:'Brak roli'};
  return map[role]||role||'—';
}
function piEsc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function piSetAccessMsg(t){const x=el('piAccessMsg'); if(x)x.innerText=t||'';}

async function piLoadCurrentRole(){
  if(typeof window.piFriendSandboxActive === 'function' && window.piFriendSandboxActive()){
    try{ await window.piEnableFriendSandbox(); }catch(_){}
    let sandboxSession={}; try{ sandboxSession=JSON.parse(sessionStorage.getItem('piFriendSessionV1') || '{}'); }catch(_){}
    piAccessCurrentUser = {id:'friend-sandbox',email:sandboxSession.user?.email || sandboxSession.user?.login || 'admin',phone:null};
    piCurrentRole = 'admin';
    const box=el('piMyRoleBox'); if(box)box.innerText=sandboxSession.demoManager?'Zarządca demonstracyjny':'Gość / podgląd';
    return piCurrentRole;
  }
  if(window.piOwnerSessionV570 || sessionStorage.getItem('piOwnerSessionV570')){
    try{ window.piOwnerSessionV570 = window.piOwnerSessionV570 || JSON.parse(sessionStorage.getItem('piOwnerSessionV570')||'null'); }catch(_){ }
    piAccessCurrentUser = {id:null,email:window.piOwnerSessionV570?.owner?.email||null,phone:window.piOwnerSessionV570?.owner?.phone||null};
    piCurrentRole = 'owner';
    const box=el('piMyRoleBox'); if(box)box.innerText=piRoleLabel(piCurrentRole);
    return piCurrentRole;
  }
  try{
    const {data:{user}}=await db.auth.getUser();
    piAccessCurrentUser=user||null;
    if(!user){piCurrentRole='guest';return piCurrentRole;}
    let {data,error}=await db.from('pi_user_roles').select('*').eq('user_id',user.id).eq('is_active',true).maybeSingle();
    if(error){
      console.warn('Nie udało się odczytać roli po user_id:', error.message);
      data=null;
    }
    if(!data && user.email){
      const byEmail=await db.from('pi_user_roles').select('*').eq('email',String(user.email).toLowerCase()).eq('is_active',true).maybeSingle();
      if(!byEmail.error) data=byEmail.data;
    }
    if(!data && user.email){
      const prof=await db.from('profiles').select('role,email,display_name').eq('email',String(user.email).toLowerCase()).maybeSingle();
      if(!prof.error && prof.data) data=prof.data;
    }
    piCurrentRole=data?.role||'guest';
  }catch(e){
    console.warn('Nie udało się odczytać roli:',e);
    piCurrentRole='guest';
  }
  const box=el('piMyRoleBox'); if(box)box.innerText=piRoleLabel(piCurrentRole);
  return piCurrentRole;
}

async function piLoadAccessRows(){
  try{
    const {data,error}=await db.from('pi_property_access').select('id,property_id,tenancy_id,access_role,status,display_name,user_email,user_phone,user_phone_norm,created_by,created_at,updated_at').order('created_at',{ascending:false});
    if(error) throw error;
    piAccessRows=(data||[]).filter(r=>r && r.property_id);
  }catch(e){
    console.warn('Nie udało się odczytać dostępów:',e);
    piAccessRows=[];
  }
  return piAccessRows;
}

function piAccessIsAdmin(){ return ['admin','super_admin'].includes(String(piCurrentRole || '').toLowerCase()); }
function piAllowedPropertyIds(){
  if(piAccessIsAdmin()) return null;
  const email=(piAccessCurrentUser?.email||'').toLowerCase();
  const uid=piAccessCurrentUser?.id;
  const ownerPhone=(window.piOwnerSessionV570?.owner?.phone||'').replace(/\D/g,'');
  const sessionIds=new Set((window.piOwnerSessionV570?.propertyIds||[]).map(String));
  return new Set((piAccessRows||[]).filter(r=>{
    const rowPhone=String(r.user_phone||'').replace(/\D/g,'');
    return (uid && r.user_id===uid) ||
      (email && String(r.user_email||'').toLowerCase()===email) ||
      (ownerPhone && rowPhone===ownerPhone && r.access_role==='owner') ||
      sessionIds.has(String(r.property_id));
  }).map(r=>String(r.property_id)));
}

async function piFilterPropertiesForCurrentUser(props){
  await piLoadCurrentRole();
  await piLoadAccessRows();
  const allowed=piAllowedPropertyIds();
  if(!allowed) return props||[];
  return (props||[]).filter(p=>allowed.has(String(p.id)));
}

function piPopulateAccessPropertySelect(){
  const sel=el('piAccessPropertySelect');
  if(!sel) return;
  const props=loadedProperties||[];
  const dashboardId = (typeof activeProperty !== 'undefined' && activeProperty) ? String(activeProperty) : '';
  const previous = sel.value || '';
  const current = dashboardId || previous || '';
  sel.innerHTML='<option value="">Wybierz mieszkanie do przypisania</option>' + props.map(p=>`<option value="${piEsc(p.id)}">${piEsc(p.name || p.address || 'Mieszkanie')}</option>`).join('');
  if(current && props.some(p=>String(p.id)===String(current))) sel.value=String(current);
}
function piSelectedAccessPropertyId(){
  const sel=el('piAccessPropertySelect');
  if(typeof activeProperty !== 'undefined' && activeProperty) return String(activeProperty);
  return (sel && sel.value) ? sel.value : '';
}
function piSelectedAccessPropertyName(){
  const id=piSelectedAccessPropertyId();
  const p=(loadedProperties||[]).find(x=>String(x.id)===String(id));
  if(p) return p.name || p.address || '—';
  if(typeof activePropertyData !== 'undefined' && activePropertyData && String(activePropertyData.id)===String(id)) return activePropertyData.name || activePropertyData.address || '—';
  return '—';
}

function piFillAccessFromTenant(){
  try{
    const p = (typeof activePropertyData !== 'undefined' && activePropertyData) ? activePropertyData : (window.activePropertyData || {});
    const name = (document.getElementById('tenantNameInput')?.value || p.tenant_name || '').trim();
    const phone = (document.getElementById('tenantPhoneInput')?.value || p.tenant_phone || '').replace(/\D/g,'');
    const email = (document.getElementById('tenantEmailInput')?.value || p.tenant_email || '').trim().toLowerCase();
    if(document.getElementById('piAccessRole')) document.getElementById('piAccessRole').value = 'tenant';
    if(name && document.getElementById('piAccessName')) document.getElementById('piAccessName').value = name;
    if(phone && document.getElementById('piAccessPhone')) document.getElementById('piAccessPhone').value = phone;
    if(email && document.getElementById('piAccessEmail')) document.getElementById('piAccessEmail').value = email;
    const sel = document.getElementById('piAccessPropertySelect');
    const pid = (typeof activeProperty !== 'undefined' && activeProperty) ? String(activeProperty) : (p.id ? String(p.id) : '');
    if(sel && pid) sel.value = pid;
    piSetAccessMsg(name || phone ? 'Uzupełniono formularz dostępu danymi z karty najmu. Dopisz PIN i zapisz dostęp najemcy.' : 'Najpierw uzupełnij kartę najmu: imię, telefon lub email.');
    try{
      const btn = Array.from(document.querySelectorAll('#tab-access .pi-admin-tab-btn')).find(b => (b.textContent || '').toLowerCase().includes('użytk'));
      if(btn && typeof piAccessSwitchSubtab === 'function') piAccessSwitchSubtab('users', btn);
    }catch(_){ }
  }catch(e){ piSetAccessMsg('Nie udało się przenieść danych najmu: '+(e.message || e)); }
}
window.piFillAccessFromTenant = piFillAccessFromTenant;

async function piGrantPropertyAccess(){
  const targetPropertyId=piSelectedAccessPropertyId();
  if(!targetPropertyId){piSetAccessMsg('Najpierw wybierz konkretne mieszkanie w polu nad formularzem.');return;}
  const email=(el('piAccessEmail')?.value||'').trim().toLowerCase();
  const name=(el('piAccessName')?.value||'').trim();
  const role=el('piAccessRole')?.value||'owner';
  const phone=(el('piAccessPhone')?.value||'').replace(/\D/g,'');
  const pin=(el('piAccessPin')?.value||'').trim();
  if(role==='owner' && (!phone || !pin)){piSetAccessMsg('Dla ownera podaj telefon i PIN.');return;}
  if(role==='tenant' && (!phone || !pin)){piSetAccessMsg('Dla najemcy podaj telefon i PIN do panelu najemcy.');return;}
  if(email && !email.includes('@')){piSetAccessMsg('Email jest opcjonalny, ale jeśli go wpisujesz, musi być poprawny.');return;}
  piSetAccessMsg('Sprawdzam, czy taki dostęp już istnieje...');
  try{
    const duplicate=(piAccessRows||[]).find(r=>
      String(r.property_id)===String(targetPropertyId) &&
      String(r.access_role||'')===String(role) &&
      String(r.user_phone||'').replace(/\D/g,'')===phone
    );
    if(duplicate){piSetAccessMsg('Ten użytkownik ma już dostęp do tego konkretnego mieszkania. Nie tworzę duplikatu.');return;}
    const payload={
      property_id:targetPropertyId,
      user_email:email||null,
      user_phone:phone||null,
      user_phone_norm:phone||null,
      pin:pin||null,
      display_name:name||null,
      access_role:role,
      status:'active',
      created_by:piAccessCurrentUser?.id||null,
      updated_at:new Date().toISOString()
    };
    if(typeof window.piSecureAccessSave!=='function') throw new Error('Brak bezpiecznej funkcji zapisu PIN-u.');
    await window.piSecureAccessSave(payload);
    piSetAccessMsg('Zapisano dostęp tylko do mieszkania: '+piSelectedAccessPropertyName()+'.');
    if(el('piAccessEmail'))el('piAccessEmail').value='';
    if(el('piAccessPhone'))el('piAccessPhone').value='';
    if(el('piAccessPin'))el('piAccessPin').value='';
    if(el('piAccessName'))el('piAccessName').value='';
    await piRefreshAccessPanel();
  }catch(e){
    piSetAccessMsg('Błąd zapisu: '+e.message+'  | Uruchom aktualne migracje PureInvest OS i odśwież stronę.');
  }
}

async function piRemoveAccess(id){
  if(!(await window.piConfirmV770('Usunąć ten dostęp?'))) return;
  try{ await window.piSecureAccessRevoke(id); }catch(error){ alert(error.message || error); return; }
  await piRefreshAccessPanel();
}

async function piRefreshAccessPanel(){
  await piLoadCurrentRole();
  await piLoadAccessRows();
  const my=el('piMyRoleBox'); if(my)my.innerText=piRoleLabel(piCurrentRole);
  piPopulateAccessPropertySelect();
  const prop=el('piAccessPropertyBox'); if(prop)prop.innerText=piSelectedAccessPropertyName();
  const selectedPropertyId=piSelectedAccessPropertyId();
  const count=el('piAccessCountBox'); if(count)count.innerText=String((piAccessRows||[]).filter(r=>String(r.property_id)===String(selectedPropertyId)).length||0);
  const current=(piAccessRows||[]).filter(r=>String(r.property_id)===String(selectedPropertyId));
  const currentBox=el('piPropertyAccessList');
  if(currentBox){
    if(!selectedPropertyId){currentBox.innerHTML='Wybierz mieszkanie w formularzu powyżej.';}
    else if(!current.length){currentBox.innerHTML='<div class="pi-access-system-note">To mieszkanie nie ma jeszcze przypisanych osób. Dodaj klienta, zarządcę albo najemcę powyżej.</div>';}
    else currentBox.innerHTML=current.map(r=>`<div class="pi-access-row"><div><b>${piEsc(r.display_name||r.user_email||r.user_phone||'Użytkownik')}</b><br><small>${piEsc([r.user_phone,r.user_email].filter(Boolean).join(' • ')||r.user_id||'')}</small></div><span class="pi-access-pill ${piEsc(r.access_role)}">${piRoleLabel(r.access_role)}</span><small>${piEsc(r.access_role==='tenant' ? ((r.status||'active')==='active' ? 'Panel włączony' : 'Panel wyłączony') : (r.status||'active'))}</small><button type="button" class="pi-access-danger" onclick="piRemoveAccess('${r.id}')">Usuń</button></div>`).join('');
  }
  const allBox=el('piAllAccessList');
  if(allBox){
    const propName=id=>{const p=(loadedProperties||[]).find(x=>String(x.id)===String(id));return p?.name||'Mieszkanie';};
    allBox.innerHTML=(piAccessRows||[]).length ? piAccessRows.map(r=>`<div class="pi-access-row"><div><b>${piEsc(propName(r.property_id))}</b><br><small>${piEsc([r.user_phone,r.user_email].filter(Boolean).join(' • ')||r.user_id||'')}</small></div><span class="pi-access-pill ${piEsc(r.access_role)}">${piRoleLabel(r.access_role)}</span><small>${piEsc(r.access_role==='tenant' ? ((r.status||'active')==='active' ? 'Panel najemcy włączony' : 'Panel najemcy wyłączony') : (r.display_name||''))}</small><button type="button" class="pi-access-danger" onclick="piRemoveAccess('${r.id}')">Usuń</button></div>`).join('') : '<div class="pi-access-system-note">Brak przypisanych dostępów. Dodaj pierwszy dostęp w aktualnym mieszkaniu.</div>';
  }
}

const piOriginalLoadPropertyTiles = loadPropertyTiles;
loadPropertyTiles = async function(){
  const tiles = el('propertyTiles');
  if(!tiles){console.error('Brak elementu propertyTiles w HTML.');return;}
  tiles.innerHTML='Ładowanie mieszkań i uprawnień...';
  const {data,error}=await db.from('properties').select('*');
  if(error){console.error('Błąd ładowania mieszkań:', error);tiles.textContent='Błąd ładowania mieszkań: '+error.message;return;}
  loadedProperties=await piFilterPropertiesForCurrentUser(data||[]);
  tiles.innerHTML='';
  if(!loadedProperties.length){
    tiles.innerHTML='<div class="card"><div class="card-title">Brak przypisanych mieszkań</div>To konto nie ma jeszcze dostępu do żadnej nieruchomości. Administrator musi przypisać mieszkanie w zakładce „Dostępy”.</div>';
    if(typeof renderPropertiesList==='function') renderPropertiesList();
    if(typeof renderPortfolio==='function') renderPortfolio();
    return;
  }
  const styles=['tile-blue','tile-orange','tile-purple','tile-green'];
  tiles.innerHTML = loadedProperties.map((p,i)=>`<div class="tile ${styles[i%styles.length]}" role="button" tabindex="0" data-pi-property-id="${piEsc(p.id)}"><small>Nieruchomość</small><h3>${piEsc(p.name || 'Bez nazwy')}</h3><small>👤 ${piEsc(p.tenant_name || 'Brak najemcy')}</small>${p.area_m2 ? `<small>📐 ${Number(p.area_m2).toLocaleString('pl-PL')} m²</small>` : ''}<div class="status">${p.tenant_name ? 'Wynajęte' : 'Wolne'}</div><div class="tile-footer">Otwórz dashboard →</div></div>`).join('');
  tiles.querySelectorAll('[data-pi-property-id]').forEach(tile=>{
    const open = ()=>openDashboard(tile.dataset.piPropertyId);
    tile.addEventListener('click', open);
    tile.addEventListener('keydown', event=>{ if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); open(); } });
  });
  if(typeof renderPropertiesList==='function') renderPropertiesList();
  if(typeof renderPortfolio==='function') renderPortfolio();
  await piRefreshAccessPanel();
};

const piOriginalSwitchTab = switchTab;
switchTab = function(tab, element){
  piOriginalSwitchTab(tab, element);
  if(tab==='access') piRefreshAccessPanel();
};

const piOriginalOpenDashboard = openDashboard;
openDashboard = function(id){
  piOriginalOpenDashboard(id);
  const sel=el('piAccessPropertySelect');
  if(sel && id) sel.value=String(id);
  setTimeout(()=>piRefreshAccessPanel(),0);
};

window.addEventListener('load',()=>{setTimeout(()=>piLoadCurrentRole().then(piRefreshAccessPanel),600);});

function piAccessSwitchSubtab(name,btn){
  const root=document.getElementById('tab-access') || document;
  root.querySelectorAll('.pi-admin-subtab').forEach(x=>x.classList.remove('active'));
  const tab=document.getElementById('piAdminSubtab-'+name); if(tab)tab.classList.add('active');
  root.querySelectorAll('.pi-admin-tab-btn').forEach(x=>x.classList.remove('active'));
  if(btn)btn.classList.add('active');
  else {
    const autoBtn = Array.from(root.querySelectorAll('.pi-admin-tab-btn')).find(x => {
      const txt=(x.textContent||'').toLowerCase();
      if(name==='tenancy') return txt.includes('karta') || txt.includes('najem');
      if(name==='assign') return txt.includes('przyp');
      if(name==='model') return txt.includes('model');
      return txt.includes('użytk') || txt.includes('panel');
    });
    if(autoBtn) autoBtn.classList.add('active');
  }
  if(typeof piRefreshAccessPanel==='function') piRefreshAccessPanel();
}
window.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('#tab-access .pi-admin-tab-btn').forEach(btn=>{
    const txt=(btn.textContent||'').toLowerCase();
    const name=(txt.includes('karta')||txt.includes('najem'))?'tenancy':(txt.includes('przyp')?'assign':(txt.includes('model')?'model':'users'));
    btn.addEventListener('click',()=>piAccessSwitchSubtab(name,btn));
  });
});
function piUniqueAccessUsers(rows){
  const map=new Map();
  (rows||[]).forEach(r=>{
    const key=[r.access_role||'owner',String(r.user_phone||'').replace(/\D/g,''),(r.user_email||'').toLowerCase()].join('|');
    if(!map.has(key)) map.set(key,{...r,properties:[]});
    map.get(key).properties.push(r.property_id);
  });
  return [...map.values()];
}
function piRenderUsersList(){
  const box=document.getElementById('piUsersList'); if(!box)return;
  const selectedPropertyId=piSelectedAccessPropertyId ? piSelectedAccessPropertyId() : (activeProperty || '');
  if(!selectedPropertyId){
    box.innerHTML='<div class="pi-access-system-note">Wybierz mieszkanie po lewej stronie. Lista pokaże tylko osoby przypisane do tego konkretnego lokalu.</div>';
    return;
  }
  const prop=(loadedProperties||[]).find(p=>String(p.id)===String(selectedPropertyId));
  const rows=(piAccessRows||[]).filter(r=>String(r.property_id)===String(selectedPropertyId));
  const users=piUniqueAccessUsers(rows);
  if(!users.length){
    box.innerHTML='<div class="pi-access-system-note">Brak osób przypisanych do: '+piEsc(prop?.name||prop?.address||'wybranego mieszkania')+'.</div>';
    return;
  }
  box.innerHTML=users.map(u=>`<div class="pi-admin-row"><div><b>${piEsc(u.display_name||u.user_phone||u.user_email||'Użytkownik')}</b><small>${piEsc([u.user_phone,u.user_email].filter(Boolean).join(' • ')||'Brak danych kontaktowych')}</small><small>${piEsc(prop?.name||prop?.address||'Wybrane mieszkanie')}</small></div><span class="pi-admin-pill ${piEsc(u.access_role)}">${piRoleLabel(u.access_role)}</span><small>1 mieszk.</small></div>`).join('');
}
function piRefreshAdminVisibility(){
  const isAdmin=piAccessIsAdmin();
  const lock=document.getElementById('piAdminOnlyLock'); if(lock)lock.classList.toggle('hidden',isAdmin);
  document.querySelectorAll('#tab-access input,#tab-access select,#tab-access button').forEach(x=>{ if(!x.classList.contains('pi-admin-tab-btn')) x.disabled=!isAdmin; });
}
if(typeof piRefreshAccessPanel==='function' && !window.__piRefreshAccessPanelV571){
  window.__piRefreshAccessPanelV571=true;
  const oldPiRefreshAccessPanel=piRefreshAccessPanel;
  piRefreshAccessPanel=async function(){
    await oldPiRefreshAccessPanel.apply(this,arguments);
    piRenderUsersList();
    piRefreshAdminVisibility();
    if(typeof window.piFriendRenderAccessCard === 'function') window.piFriendRenderAccessCard();
  };
}
