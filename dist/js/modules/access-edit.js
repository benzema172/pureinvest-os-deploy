(function(){
  if(window.__PI_ACCESS_EDIT_V159__) return;
  window.__PI_ACCESS_EDIT_V159__ = true;

  const LOCAL_KEY = 'piFriendAccessRowsV159';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const normPhone = (value) => String(value || '').replace(/\D/g, '');
  const isFriend = () => typeof window.piFriendSandboxActive === 'function' && window.piFriendSandboxActive();

  function roleLabel(role){
    if(typeof window.piRoleLabel === 'function') return window.piRoleLabel(role);
    const map = { admin:'Admin', owner:'Owner / właściciel', tenant:'Najemca / panel', friend:'Gość / podgląd', guest:'Brak roli' };
    return map[role] || role || '—';
  }

  function readRows(){
    try{ return Array.isArray(piAccessRows) ? piAccessRows : []; }
    catch(_){ return []; }
  }
  function writeRows(rows){
    try{ piAccessRows = Array.isArray(rows) ? rows : []; }catch(_){ }
    if(isFriend()) saveLocalRows(readRows());
  }
  function loadLocalRows(){
    try{
      const raw = sessionStorage.getItem(LOCAL_KEY);
      if(!raw) return null;
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : null;
    }catch(_){ return null; }
  }
  function saveLocalRows(rows){
    try{ sessionStorage.setItem(LOCAL_KEY, JSON.stringify(Array.isArray(rows) ? rows : [])); }catch(_){ }
  }
  function ensureLocalRows(){
    if(!isFriend()) return readRows();
    const stored = loadLocalRows();
    if(stored){
      try{ piAccessRows = stored; }catch(_){ }
      return stored;
    }
    const rows = readRows().map(r => ({...r}));
    saveLocalRows(rows);
    return rows;
  }
  function setMsg(id, message, type){
    const el = $(id);
    if(!el) return;
    el.textContent = message || '';
    el.dataset.type = type || '';
  }
  function propName(propertyId){
    try{
      const p = (loadedProperties || []).find(x => String(x.id) === String(propertyId));
      return p?.name || p?.address || 'Mieszkanie';
    }catch(_){ return 'Mieszkanie'; }
  }
  function selectedPropertyId(){
    if(typeof window.piSelectedAccessPropertyId === 'function') return window.piSelectedAccessPropertyId();
    const sel = $('piAccessPropertySelect');
    return sel && sel.value ? String(sel.value) : '';
  }
  function buildActionButtons(row){
    const id = esc(row.id || '');
    return `<div class="pi-access-actions-mini">
      <button type="button" class="pi-access-edit-btn" data-pi-edit-access="${id}">Edytuj</button>
      <button type="button" class="pi-access-danger" data-pi-remove-access="${id}">Usuń</button>
    </div>`;
  }
  function renderRow(row, mode){
    const name = row.display_name || row.user_email || row.user_phone || 'Użytkownik';
    const phone = row.user_phone || '';
    const email = row.user_email || '';
    const contact = [phone, email].filter(Boolean).join(' • ') || row.user_id || 'Brak danych kontaktowych';
    const property = propName(row.property_id);
    const role = row.access_role || 'owner';
    const status = row.status || 'active';
    const statusLabel = status === 'active' ? 'Aktywny' : status;
    const statusClass = status === 'active' ? 'on' : 'off';
    const rolePillClass = mode === 'admin' ? 'pi-admin-pill' : 'pi-access-pill';
    return `<div class="pi-access-user-card ${mode === 'admin' ? 'admin-mode' : 'access-mode'}">
      <div class="pi-access-user-card-main">
        <div class="pi-access-user-card-head"><b>${esc(name)}</b></div>
        <div class="pi-access-user-card-contact">${esc(contact)}</div>
        <div class="pi-access-user-card-property">${esc(property)}</div>
        <div class="pi-access-user-card-tags">
          <span class="${rolePillClass} ${esc(role)}">${esc(roleLabel(role))}</span>
          <span class="pi-access-badge ${statusClass}">${esc(statusLabel)}</span>
        </div>
      </div>
      <div class="pi-access-actions-mini pi-access-actions-stack">${buildActionButtons(row).replace('<div class="pi-access-actions-mini">','').replace('</div>','')}</div>
    </div>`;
  }

  async function updateWithFallback(table, id, payload){
    let body = {...payload};
    const removed = [];
    for(let i=0;i<10;i++){
      const res = await db.from(table).update(body).eq('id', id);
      if(!res.error) return {error:null, removed};
      const msg = res.error.message || '';
      const match = msg.match(/Could not find the '([^']+)' column|column "([^"]+)"/i);
      const col = match && (match[1] || match[2]);
      if(col && Object.prototype.hasOwnProperty.call(body, col)){
        removed.push(col);
        delete body[col];
        continue;
      }
      return {error:res.error, removed};
    }
    return {error:new Error('Nie udało się dopasować pól do aktualnego schematu Supabase.'), removed};
  }

  async function syncTenantAccessToProperty(propertyId, payload){
    // Dostępy są teraz jedynym źródłem prawdy dla logowania i PIN-ów.
    // Sekcja Najem przechowuje wyłącznie dane najmu, więc nie nadpisujemy jej danymi dostępu.
    return;
  }

  function localUpsert(row){
    const rows = ensureLocalRows().map(r => ({...r}));
    const index = rows.findIndex(r => String(r.id) === String(row.id));
    if(index >= 0) rows[index] = {...rows[index], ...row};
    else rows.unshift(row);
    writeRows(rows);
    return rows;
  }
  function localRemove(id){
    const rows = ensureLocalRows().filter(r => String(r.id) !== String(id));
    writeRows(rows);
    return rows;
  }

  function validateAccessPayload(payload, original){
    const role = payload.access_role;
    if(!['owner','tenant'].includes(role)) return 'Wybierz poprawną rolę: owner albo najemca.';
    if(!payload.user_phone && !original?.user_phone) return 'Podaj telefon do logowania.';
    if(payload.user_email && !String(payload.user_email).includes('@')) return 'Email jest opcjonalny, ale jeśli go wpisujesz, musi być poprawny.';
    return '';
  }

  function getEditPayload(original){
    const phone = normPhone($('piAccessEditPhone')?.value || original?.user_phone || '');
    const pin = String($('piAccessEditPin')?.value || '').trim();
    const payload = {
      display_name: ($('piAccessEditName')?.value || '').trim() || null,
      user_email: ($('piAccessEditEmail')?.value || '').trim().toLowerCase() || null,
      user_phone: phone || null,
      access_role: $('piAccessEditRole')?.value || original?.access_role || 'owner',
      status: $('piAccessEditStatus')?.value || original?.status || 'active',
      updated_at: new Date().toISOString()
    };
    if(pin) payload.pin = pin;
    if(phone) payload.user_phone_norm = phone;
    return payload;
  }

  window.piOpenAccessEdit = function(id){
    const row = readRows().find(r => String(r.id) === String(id));
    const panel = $('piAccessEditPanel');
    if(!row || !panel){
      setMsg('piAccessMsg', 'Nie znaleziono dostępu do edycji. Odśwież panel.', 'error');
      return;
    }
    $('piAccessEditId').value = row.id || '';
    $('piAccessEditName').value = row.display_name || '';
    $('piAccessEditRole').value = ['owner','tenant'].includes(row.access_role) ? row.access_role : 'owner';
    $('piAccessEditPhone').value = row.user_phone || '';
    $('piAccessEditPin').value = '';
    $('piAccessEditEmail').value = row.user_email || '';
    $('piAccessEditStatus').value = row.status || 'active';
    const label = $('piAccessEditPropertyLabel');
    if(label) label.textContent = `Mieszkanie: ${propName(row.property_id)}`;
    panel.classList.remove('hidden');
    setMsg('piAccessEditMsg', 'Edytujesz dostęp techniczny. Status aktywny oznacza włączony panel; pusty PIN zostawia dotychczasowy PIN.', 'info');
    try{ panel.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_){ }
  };

  window.piCancelAccessEdit = function(){
    const panel = $('piAccessEditPanel');
    if(panel) panel.classList.add('hidden');
    ['piAccessEditId','piAccessEditName','piAccessEditPhone','piAccessEditPin','piAccessEditEmail'].forEach(id => { const node = $(id); if(node) node.value = ''; });
    setMsg('piAccessEditMsg', '', '');
  };

  window.piSaveAccessEdit = async function(){
    const id = $('piAccessEditId')?.value || '';
    const original = readRows().find(r => String(r.id) === String(id));
    if(!id || !original){ setMsg('piAccessEditMsg', 'Nie znaleziono dostępu do zapisu.', 'error'); return; }
    const payload = getEditPayload(original);
    const validation = validateAccessPayload(payload, original);
    if(validation){ setMsg('piAccessEditMsg', validation, 'error'); return; }

    const duplicate = readRows().find(r =>
      String(r.id) !== String(id) &&
      String(r.property_id) === String(original.property_id) &&
      String(r.access_role || '') === String(payload.access_role || '') &&
      normPhone(r.user_phone) === normPhone(payload.user_phone)
    );
    if(duplicate){ setMsg('piAccessEditMsg', 'W tym mieszkaniu istnieje już użytkownik z takim telefonem i rolą.', 'error'); return; }

    setMsg('piAccessEditMsg', 'Zapisuję zmiany...', 'info');
    try{
      if(isFriend()){
        localUpsert({...original, ...payload});
        try{ await db.from('pi_property_access').update(payload).eq('id', id); }catch(_){ }
      }else{
        if(typeof window.piSecureAccessSave !== 'function') throw new Error('Brak bezpiecznej funkcji zapisu PIN-u.');
        await window.piSecureAccessSave({...payload,property_id:original.property_id,tenancy_id:original.tenancy_id || null},id);
      }
      await syncTenantAccessToProperty(original.property_id, payload);
      setMsg('piAccessEditMsg', 'Zapisano zmiany dostępu.', 'success');
      await piRefreshAccessPanel();
    }catch(e){
      setMsg('piAccessEditMsg', 'Błąd zapisu: ' + (e.message || e), 'error');
    }
  };

  function patchGrant(){
    if(typeof piGrantPropertyAccess !== 'function' || window.__PI_ACCESS_EDIT_GRANT_PATCHED__) return;
    window.__PI_ACCESS_EDIT_GRANT_PATCHED__ = true;
    const oldGrant = piGrantPropertyAccess;
    piGrantPropertyAccess = async function(){
      const targetPropertyId = selectedPropertyId();
      const payload = {
        id: 'access_' + Date.now(),
        property_id: targetPropertyId,
        user_email: ($('piAccessEmail')?.value || '').trim().toLowerCase() || null,
        user_phone: normPhone($('piAccessPhone')?.value || ''),
        pin: ($('piAccessPin')?.value || '').trim() || null,
        display_name: ($('piAccessName')?.value || '').trim() || null,
        access_role: $('piAccessRole')?.value || 'owner',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const duplicateBefore = readRows().some(r =>
        String(r.property_id) === String(targetPropertyId) &&
        String(r.access_role || '') === String(payload.access_role) &&
        normPhone(r.user_phone) === normPhone(payload.user_phone)
      );
      await oldGrant.apply(this, arguments);
      if(isFriend() && targetPropertyId && payload.user_phone && payload.pin && !duplicateBefore){
        localUpsert(payload);
        await piRefreshAccessPanel();
      }
      if(targetPropertyId && payload.access_role === 'tenant'){
        await syncTenantAccessToProperty(targetPropertyId, payload);
      }
    };
    window.piGrantPropertyAccess = piGrantPropertyAccess;
  }

  function patchRemove(){
    if(typeof piRemoveAccess !== 'function' || window.__PI_ACCESS_EDIT_REMOVE_PATCHED__) return;
    window.__PI_ACCESS_EDIT_REMOVE_PATCHED__ = true;
    const oldRemove = piRemoveAccess;
    piRemoveAccess = async function(id){
      if(isFriend()){
        if(!(await window.piConfirmV770('Usunąć ten dostęp?'))) return;
        localRemove(id);
        await piRefreshAccessPanel();
        setMsg('piAccessMsg', 'Tryb gościa: usunięcie dostępu zostało zasymulowane lokalnie.', 'success');
        return;
      }
      return oldRemove.apply(this, arguments);
    };
    window.piRemoveAccess = piRemoveAccess;
  }

  function patchLoadRows(){
    if(typeof piLoadAccessRows !== 'function' || window.__PI_ACCESS_EDIT_LOAD_PATCHED__) return;
    window.__PI_ACCESS_EDIT_LOAD_PATCHED__ = true;
    const oldLoad = piLoadAccessRows;
    piLoadAccessRows = async function(){
      const result = await oldLoad.apply(this, arguments);
      if(isFriend()){
        const stored = loadLocalRows();
        if(stored){
          try{ piAccessRows = stored; }catch(_){ }
          return stored;
        }
        saveLocalRows(readRows());
        return readRows();
      }
      return result;
    };
    window.piLoadAccessRows = piLoadAccessRows;
  }

  function renderUsersListWithEdit(){
    const box = $('piUsersList');
    if(!box) return;
    const propertyId = selectedPropertyId();
    if(!propertyId){
      box.innerHTML = '<div class="pi-access-system-note">Wybierz mieszkanie po lewej stronie. Lista pokaże tylko osoby przypisane do tego konkretnego lokalu.</div>';
      return;
    }
    const rows = readRows().filter(r => String(r.property_id) === String(propertyId));
    if(!rows.length){
      box.innerHTML = '<div class="pi-access-system-note">Brak osób przypisanych do: ' + esc(propName(propertyId)) + '.</div>';
      return;
    }
    box.innerHTML = rows.map(row => renderRow(row, 'admin')).join('');
  }

  function renderAssignmentListsWithEdit(){
    const propertyId = selectedPropertyId();
    const currentBox = $('piPropertyAccessList');
    if(currentBox){
      const current = readRows().filter(r => String(r.property_id) === String(propertyId));
      if(!propertyId) currentBox.innerHTML = 'Wybierz mieszkanie w formularzu powyżej.';
      else if(!current.length) currentBox.innerHTML = '<div class="pi-access-system-note">To mieszkanie nie ma jeszcze przypisanych osób. Dodaj klienta, zarządcę albo najemcę powyżej.</div>';
      else currentBox.innerHTML = current.map(row => renderRow(row, 'access')).join('');
    }
    const allBox = $('piAllAccessList');
    if(allBox){
      const rows = readRows();
      allBox.innerHTML = rows.length ? rows.map(row => renderRow(row, 'access')).join('') : '<div class="pi-access-system-note">Brak przypisanych dostępów. Dodaj pierwszy dostęp w aktualnym mieszkaniu.</div>';
    }
  }

  function patchRender(){
    if(typeof piRenderUsersList === 'function' && !window.__PI_ACCESS_EDIT_USERS_RENDER_PATCHED__){
      window.__PI_ACCESS_EDIT_USERS_RENDER_PATCHED__ = true;
      piRenderUsersList = renderUsersListWithEdit;
      window.piRenderUsersList = piRenderUsersList;
    }
    if(typeof piRefreshAccessPanel === 'function' && !window.__PI_ACCESS_EDIT_REFRESH_PATCHED__){
      window.__PI_ACCESS_EDIT_REFRESH_PATCHED__ = true;
      const oldRefresh = piRefreshAccessPanel;
      piRefreshAccessPanel = async function(){
        await oldRefresh.apply(this, arguments);
        renderUsersListWithEdit();
        renderAssignmentListsWithEdit();
      };
      window.piRefreshAccessPanel = piRefreshAccessPanel;
    }
  }

  document.addEventListener('click', async (event) => {
    const editBtn = event.target.closest('[data-pi-edit-access]');
    if(editBtn){
      event.preventDefault();
      window.piOpenAccessEdit(editBtn.getAttribute('data-pi-edit-access'));
      return;
    }
    const removeBtn = event.target.closest('[data-pi-remove-access]');
    if(removeBtn){
      event.preventDefault();
      await piRemoveAccess(removeBtn.getAttribute('data-pi-remove-access'));
    }
  });

  function init(){
    patchLoadRows();
    patchGrant();
    patchRemove();
    patchRender();
    if(typeof piRefreshAccessPanel === 'function') setTimeout(() => piRefreshAccessPanel(), 300);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  else setTimeout(init, 0);
})();
