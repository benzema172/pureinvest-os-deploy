(function(){
  if(window.__PI_V760_SECURITY_UX__) return;
  window.__PI_V760_SECURITY_UX__ = true;

  window.piAuthHeadersV760 = async function(extra){
    const headers = Object.assign({'Accept':'application/json'}, extra || {});
    try{
      const client = window.db || window.piDb || window.supabaseClient;
      const res = await client?.auth?.getSession?.();
      const token = res?.data?.session?.access_token;
      if(token) headers.Authorization = 'Bearer ' + token;
    }catch(_){ }
    try{
      const owner = JSON.parse(sessionStorage.getItem('piOwnerSessionV570') || 'null');
      if(owner?.ownerToken) headers['X-PI-Session-Token'] = owner.ownerToken;
    }catch(_){ }
    try{
      const tenant = JSON.parse(sessionStorage.getItem('piTenantSessionV54') || sessionStorage.getItem('piTenantSessionV570') || 'null');
      if(tenant?.tenantToken && !headers['X-PI-Session-Token']) headers['X-PI-Session-Token'] = tenant.tenantToken;
    }catch(_){ }
    try{
      const friend = JSON.parse(sessionStorage.getItem('piFriendSessionV1') || 'null');
      if(friend && friend.friendToken && !headers['X-PI-Session-Token']) headers['X-PI-Session-Token'] = friend.friendToken;
    }catch(_){}
    return headers;
  };

  window.piEmptyStateV760 = function(target, title, text){
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if(!el || String(el.innerHTML || '').trim()) return;
    el.innerHTML = '<div class="pi-empty-state"><b>'+String(title||'Brak danych')+'</b><span>'+String(text||'Dodaj pierwsze dane, aby zobaczyć podsumowanie.')+'</span></div>';
  };

  window.piToastV760 = window.piToastV760 || function(message, type){
    const msg = String(message || '');
    if(!msg) return;
    let box = document.getElementById('piToastV760');
    if(!box){
      box = document.createElement('div');
      box.id = 'piToastV760';
      box.className = 'pi-toast-v760';
      document.body.appendChild(box);
    }
    box.className = 'pi-toast-v760 ' + (type || 'info');
    box.textContent = msg;
    box.classList.add('show');
    clearTimeout(box.__timer);
    box.__timer = setTimeout(()=>box.classList.remove('show'), 3200);
  };
})();
