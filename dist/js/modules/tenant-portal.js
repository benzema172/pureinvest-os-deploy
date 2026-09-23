(function(){
  let tenantSessionV54 = null;
  const $ = (id)=>document.getElementById(id);
  const normalizePhoneV54 = (v)=>String(v||'').replace(/\D/g,'');
  const moneyV54 = (v)=>Number(v||0).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł';
  const safeTextV55 = (v)=>String(v ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeHttpUrlV55 = (v)=>{ try{ const url=new URL(String(v||''),window.location.origin); return ['http:','https:'].includes(url.protocol)?url.href:'#'; }catch(_){ return '#'; } };
  const meterValV55 = (v)=>{ const n=Number(String(v||'').replace(',','.').replace(/[^0-9.\-]/g,'')); return Number.isFinite(n) ? n : null; };

  function injectTenantLogin(){
    const card = document.querySelector('#loginScreen .login-card');
    if(!card || document.getElementById('piLoginSegmentV54')) return;
    const h2 = card.querySelector('h2');
    if(h2) h2.textContent = 'Logowanie';
    const ownerNodes = Array.from(card.children).filter(n=>n.id !== 'authMsg');
    const ownerWrap = document.createElement('div');
    ownerWrap.className = 'pi-owner-login-form';
    ownerWrap.id = 'ownerLoginFormV54';
    ownerNodes.forEach(n=>{ if(n !== h2) ownerWrap.appendChild(n); });

    const seg = document.createElement('div');
    seg.className = 'pi-login-segment';
    seg.id = 'piLoginSegmentV54';
    seg.innerHTML = '<button type="button" id="ownerLoginTabV54" class="active" onclick="setLoginModeV54(\'owner\')">Zarządca</button><button type="button" id="tenantLoginTabV54" onclick="setLoginModeV54(\'tenant\')">Najemca</button>';

    const tenant = document.createElement('div');
    tenant.className = 'pi-tenant-login-form';
    tenant.id = 'tenantLoginFormV54';
    tenant.innerHTML = '<input id="tenantLoginPhone" inputmode="tel" placeholder="Numer telefonu"><input id="tenantLoginPin" inputmode="numeric" maxlength="12" placeholder="Kod dostępu"><button type="button" onclick="tenantLoginV54()">Wejdź do panelu najemcy</button><div class="pi-tenant-help">Dostęp działa dla numeru telefonu i PIN-u ustawionych przez zarządcę w sekcji Dostępy.</div>';

    card.innerHTML = '';
    if(h2) card.appendChild(h2); else { const title=document.createElement('h2'); title.textContent='Logowanie'; card.appendChild(title); }
    card.appendChild(seg);
    card.appendChild(ownerWrap);
    card.appendChild(tenant);
    const msg=document.createElement('div'); msg.setAttribute('id','authMsg'); msg.className='auth-msg'; card.appendChild(msg);
  }

  window.setLoginModeV54 = function(mode){
    const owner = $('ownerLoginFormV54');
    const tenant = $('tenantLoginFormV54');
    const ownerTab = $('ownerLoginTabV54');
    const tenantTab = $('tenantLoginTabV54');
    const msg = $('authMsg');
    if(msg) msg.textContent='';
    if(mode === 'tenant'){
      owner?.classList.add('hidden-tenant');
      tenant?.classList.add('active');
      ownerTab?.classList.remove('active');
      tenantTab?.classList.add('active');
    }else{
      owner?.classList.remove('hidden-tenant');
      tenant?.classList.remove('active');
      tenantTab?.classList.remove('active');
      ownerTab?.classList.add('active');
    }
  };

  function injectTenantOwnerFields(){
    // Panel dostępu najemcy został przeniesiony do sekcji Dostępy.
    return;
  }

  window.generateTenantPinV564 = function(){
    const input = $('tenantAccessPinInput');
    if(!input) return;
    input.value = String(Math.floor(100000 + Math.random()*900000));
    const enabled = $('tenantAccessEnabledInput');
    if(enabled) enabled.checked = true;
    syncTenantAccessBadgeV564();
  };

  window.copyTenantLoginV564 = function(){
    const phone = $('tenantPhoneInput')?.value || '';
    const pin = $('tenantAccessPinInput')?.value || '';
    const name = $('tenantNameInput')?.value || 'Najemco';
    const url = location.origin || 'https://panel.pure-invest.pl';
    const msg = $('tenantLoginCopyMsgV564');
    if(!phone || !pin){ if(msg) msg.textContent = 'Uzupełnij telefon i PIN, żeby skopiować dane logowania.'; return; }
    const text = `Dzień dobry, ${name}.\n\nDostęp do panelu najemcy PureInvest:\n${url}\n\nTelefon: ${phone}\nPIN: ${pin}\n\nPo zalogowaniu zobaczysz swoje mieszkanie, dokumenty, status płatności i możliwość zgłoszenia awarii.`;
    if(navigator.clipboard){
      navigator.clipboard.writeText(text).then(()=>{ if(msg) msg.textContent='Skopiowano dane logowania dla najemcy.'; }).catch(()=>{ if(msg) msg.textContent=text; });
    }else{
      if(msg) msg.textContent=text;
    }
  };

  function syncTenantAccessBadgeV564(){
    const badge = $('tenantAccessStatusBadge');
    const enabled = !!$('tenantAccessEnabledInput')?.checked;
    if(!badge) return;
    badge.classList.toggle('on', enabled);
    badge.classList.toggle('off', !enabled);
    badge.textContent = enabled ? 'Aktywny' : 'Wyłączony';
  }

  function syncTenantOwnerFields(){
    const p = window.activePropertyData || (typeof activePropertyData !== 'undefined' ? activePropertyData : null);
    if(!p) return;
    const en = $('tenantAccessEnabledInput');
    const pin = $('tenantAccessPinInput');
    const note = $('tenantAccessNoteInput');
    if(en){ en.checked = !!p.tenant_access_enabled; en.onchange = syncTenantAccessBadgeV564; }
    if(pin) pin.value = '';
    if(note) note.value = p.tenant_access_note || '';
    syncTenantAccessBadgeV564();
  }

  async function tenantUploadIssuePhotoV54(file, propertyId){
    if(!file || !propertyId) return null;
    const session = tenantSessionV54 || JSON.parse(sessionStorage.getItem('piTenantSessionV54') || 'null');
    if(typeof window.piStorageUploadV773 !== 'function' || !session?.tenantToken) throw new Error('Bezpieczny upload jest chwilowo niedostępny.');
    return window.piStorageUploadV773({file,bucket:'property-documents',propertyId,folder:'maintenance',tenantToken:session.tenantToken});
  }

  async function tenantFetchJsonV54(url, body){
    const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
    let data = null;
    try{ data = await res.json(); }catch(_){ data = { ok:false, message:'Nieprawidłowa odpowiedź serwera.' }; }
    if(!res.ok && data && !data.message) data.message = 'Błąd serwera: '+res.status;
    return data;
  }

  window.tenantLoginV54 = async function(){
    const msg = $('authMsg');
    const phone = $('tenantLoginPhone')?.value || '';
    const pin = $('tenantLoginPin')?.value || '';
    if(!normalizePhoneV54(phone) || !pin.trim()){
      if(msg) msg.textContent = 'Podaj numer telefonu i kod dostępu.';
      return;
    }
    if(msg) msg.textContent = 'Sprawdzam dostęp...';
    const data = await tenantFetchJsonV54('/.netlify/functions/tenant-login', { phone, pin });
    if(!data.ok){
      if(msg) msg.textContent = data.message || 'Brak dostępu.';
      return;
    }
    if(msg) msg.textContent = '';
    if(data.multiple && Array.isArray(data.sessions) && data.sessions.length > 1){
      sessionStorage.setItem('piTenantMultiSessionV551', JSON.stringify(data));
      showTenantPropertyPickerV551(data);
      return;
    }
    data._clientVersion = '1.9.19';
    tenantSessionV54 = data;
    sessionStorage.setItem('piTenantSessionV54', JSON.stringify(data));
    sessionStorage.removeItem('piTenantMultiSessionV551');
    showTenantPortalV54(data);
  };

  window.showTenantPropertyPickerV551 = function(data){
    const login = $('loginScreen'), welcome = $('welcomeScreen'), app = $('appScreen'), tenant = $('tenantPortalScreen');
    document.body.classList.remove('welcome-mode','in-app');
    document.body.classList.add('authenticated','tenant-mode');
    if(login){ login.classList.add('hidden'); login.style.display='none'; login.style.visibility='hidden'; login.style.pointerEvents='none'; }
    welcome?.classList.add('hidden'); app?.classList.add('hidden'); tenant?.classList.remove('hidden');
    const chooser = $('tenantPropertyChooserV551');
    const grid = $('tenantPortalGrid');
    $('tenantPortalTitle').textContent = 'Wybierz mieszkanie';
    $('tenantPortalSubtitle').textContent = 'Ten numer telefonu ma dostęp do kilku mieszkań. Wybierz lokal, który chcesz podejrzeć.';
    if(grid) grid.classList.add('hidden');
    $('tenantApartmentCenterV56')?.classList.add('hidden');
    if(chooser){
      chooser.classList.remove('hidden');
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      chooser.innerHTML = '<div class="pi-tenant-card-title">Dostępne mieszkania</div><div class="pi-tenant-choice">'+sessions.map((session,idx)=>{
        const p = (session && session.property) ? session.property : (session || {});
        const meta = [p.address || 'Brak adresu', p.area_m2 ? (Number(p.area_m2).toLocaleString('pl-PL')+' m²') : null, p.rent_amount ? ('Najem: '+moneyV54(p.rent_amount)) : null].filter(Boolean).join(' • ');
        return '<div role="button" tabindex="0" class="pi-tenant-choice-card" data-tenant-index="'+idx+'"><b>'+safeTextV55(p.name || ('Mieszkanie '+(idx+1)))+'</b><span>'+safeTextV55(meta || 'Podgląd mieszkania')+'</span></div>';
      }).join('')+'</div>';
      chooser.querySelectorAll('[data-tenant-index]').forEach(btn=>{
        btn.addEventListener('click', function(ev){
          ev.preventDefault();
          ev.stopPropagation();
          window.tenantChoosePropertyV551(Number(this.getAttribute('data-tenant-index')));
        });
      });
    }
  };

  window.tenantBackToPropertyPickerV551 = function(){
    const session = tenantSessionV54 || JSON.parse(sessionStorage.getItem('piTenantSessionV54') || 'null');
    const sessions = session && Array.isArray(session.allTenantSessions) ? session.allTenantSessions : [];
    if(sessions.length > 1) showTenantPropertyPickerV551({sessions});
  };

  window.tenantChoosePropertyV551 = function(index){
    let multi = null;
    try{ multi = JSON.parse(sessionStorage.getItem('piTenantMultiSessionV551') || 'null'); }catch(_){ multi = null; }
    const sessions = multi && Array.isArray(multi.sessions) ? multi.sessions : [];
    let selected = sessions[index];
    if(!selected && multi && Array.isArray(multi.properties) && multi.properties[index]){
      selected = { ok:true, property: multi.properties[index], documents:[], issues:[], meterReadings:[], feeBreakdowns:[], paidThisMonth:false, tenantToken: multi.tenantToken || '' };
    }
    if(!selected){
      console.warn('PUREINVEST_TENANT_PICKER_NO_SELECTION', { index, multi });
      const chooser = $('tenantPropertyChooserV551');
      if(chooser) chooser.insertAdjacentHTML('beforeend','<div class="pi-tenant-muted" style="margin-top:10px;color:#b91c1c">Nie udało się otworzyć tego mieszkania. Wyloguj się i zaloguj ponownie.</div>');
      return;
    }
    if(!selected.property) selected = { ok:true, property:selected, documents:[], issues:[], meterReadings:[], feeBreakdowns:[], paidThisMonth:false, tenantToken:selected.tenantToken || '' };
    selected.allTenantSessions = sessions.length ? sessions : (multi && Array.isArray(multi.properties) ? multi.properties.map(p=>({property:p})) : []);
    selected._clientVersion = '1.9.19';
    tenantSessionV54 = selected;
    sessionStorage.setItem('piTenantSessionV54', JSON.stringify(selected));
    sessionStorage.setItem('piTenantLastPropertyIdV552', String(selected.property.id || ''));
    showTenantPortalV54(selected);
  };

  if(!window.__tenantPickerDelegatedV554){
    window.__tenantPickerDelegatedV554 = true;
    document.addEventListener('click', function(ev){
      const btn = ev.target && ev.target.closest ? ev.target.closest('.pi-tenant-choice-card[data-tenant-index]') : null;
      if(!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      const idx = Number(btn.getAttribute('data-tenant-index'));
      if(Number.isFinite(idx) && typeof window.tenantChoosePropertyV551 === 'function'){
        window.tenantChoosePropertyV551(idx);
      }
    }, true);
  }

  window.tenantOpenPropertyHardV556 = function(index){
    let multi = null;
    try{ multi = JSON.parse(sessionStorage.getItem('piTenantMultiSessionV551') || 'null'); }catch(_){ multi = null; }
    const sessions = multi && Array.isArray(multi.sessions) ? multi.sessions : [];
    const properties = multi && Array.isArray(multi.properties) ? multi.properties : [];
    let selected = sessions[index] || (properties[index] ? { ok:true, property:properties[index], documents:[], issues:[], meterReadings:[], feeBreakdowns:[], paidThisMonth:false, tenantToken: multi?.tenantToken || '' } : null);
    if(!selected || !selected.property){
      console.warn('PUREINVEST_TENANT_HARD_PICKER_NO_SELECTION', { index, multi });
      const chooser = $('tenantPropertyChooserV551');
      if(chooser && !chooser.querySelector('.tenant-picker-error-v556')) chooser.insertAdjacentHTML('beforeend','<div class="pi-tenant-muted tenant-picker-error-v556" style="margin-top:10px;color:#b91c1c">Nie udało się otworzyć mieszkania. Odśwież stronę i zaloguj się ponownie.</div>');
      return false;
    }
    selected.ok = true;
    selected.allTenantSessions = sessions.length ? sessions : properties.map(p=>({ ok:true, property:p, documents:[], issues:[], meterReadings:[], feeBreakdowns:[], paidThisMonth:false, tenantToken: multi?.tenantToken || '' }));
    selected._clientVersion = '1.9.19';
    tenantSessionV54 = selected;
    try{
      sessionStorage.setItem('piTenantSessionV54', JSON.stringify(selected));
      sessionStorage.setItem('piTenantLastPropertyIdV552', String(selected.property.id || ''));
    }catch(e){ console.warn('PUREINVEST_TENANT_SESSION_SAVE_WARN', e); }
    try{
      showTenantPortalV54(selected);
    }catch(e){
      console.error('PUREINVEST_TENANT_RENDER_ERROR', e);
      $('tenantPropertyChooserV551')?.classList.add('hidden');
      $('tenantPortalGrid')?.classList.remove('hidden');
      const p = selected.property || {};
      if($('tenantPortalTitle')) $('tenantPortalTitle').textContent = p.name || 'Moje mieszkanie';
      if($('tenantPortalSubtitle')) $('tenantPortalSubtitle').textContent = [p.address, p.area_m2 ? (Number(p.area_m2).toLocaleString('pl-PL')+' m²') : null].filter(Boolean).join(' • ') || 'Podgląd mieszkania';
      if($('tenantPortalPayments')) $('tenantPortalPayments').innerHTML = '<div class="pi-tenant-status-row"><span>Miesięczna należność</span><b>'+moneyV54(p.rent_amount||0)+'</b></div><div class="pi-tenant-status-row"><span>Status</span><span class="pi-tenant-pill warn">Podgląd</span></div>';
    }
    return false;
  };

  function tenantPickerHardEventV556(ev){
    const target = ev.target && ev.target.closest ? ev.target.closest('#tenantPropertyChooserV551 .pi-tenant-choice-card[data-tenant-index]') : null;
    if(!target) return;
    ev.preventDefault();
    ev.stopPropagation();
    if(typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    const idx = Number(target.getAttribute('data-tenant-index'));
    if(Number.isFinite(idx)) window.tenantOpenPropertyHardV556(idx);
  }

  if(!window.__tenantPickerHardV556){
    window.__tenantPickerHardV556 = true;
    ['pointerdown','touchstart','mousedown','click','keydown'].forEach(function(type){
      document.addEventListener(type, function(ev){
        if(type === 'keydown' && !(ev.key === 'Enter' || ev.key === ' ')) return;
        tenantPickerHardEventV556(ev);
      }, true);
    });
  }

  window.showTenantPortalV54 = function(data){
    const login = $('loginScreen'), welcome = $('welcomeScreen'), app = $('appScreen'), tenant = $('tenantPortalScreen');
    document.body.classList.remove('welcome-mode','in-app');
    document.body.classList.add('authenticated','tenant-mode');
    if(login){ login.classList.add('hidden'); login.style.display='none'; login.style.visibility='hidden'; login.style.pointerEvents='none'; }
    welcome?.classList.add('hidden'); app?.classList.add('hidden'); tenant?.classList.remove('hidden');
    renderTenantPortalV54(data);
    if(typeof window.piTenantHistoryInlineV181 === 'function') window.piTenantHistoryInlineV181(data);
  };

  window.tenantLogoutV54 = function(){
    tenantSessionV54 = null;
    sessionStorage.removeItem('piTenantSessionV54');
    sessionStorage.removeItem('piTenantMultiSessionV551');
    document.body.classList.remove('tenant-mode','authenticated');
    $('tenantPortalScreen')?.classList.add('hidden');
    const login=$('loginScreen');
    if(login){ login.classList.remove('hidden'); login.style.display=''; login.style.visibility=''; login.style.pointerEvents=''; }
    setLoginModeV54('tenant');
  };

  function groupTenantDocsV55(docs){
    if(!docs || !docs.length) return '<div class="pi-tenant-muted">Brak dokumentów do wyświetlenia.</div>';
    const groups = { umowy:[], protokoly:[], rozliczenia:[], pozostale:[] };
    docs.forEach(d=>{
      const name = String(d.name||d.file_name||d.attachment_name||'Dokument');
      const low = name.toLowerCase();
      if(low.includes('umow')) groups.umowy.push(d);
      else if(low.includes('protok')) groups.protokoly.push(d);
      else if(low.includes('rach') || low.includes('faktur') || low.includes('rozlicz') || low.includes('czynsz')) groups.rozliczenia.push(d);
      else groups.pozostale.push(d);
    });
    const labels = { umowy:'Umowy', protokoly:'Protokoły', rozliczenia:'Rozliczenia i rachunki', pozostale:'Pozostałe dokumenty' };
    return Object.keys(groups).filter(k=>groups[k].length).map(k=>{
      return '<div class="pi-tenant-doc-group"><div class="pi-tenant-doc-group-title">'+labels[k]+'</div>' + groups[k].map(d=>{
        const name=safeTextV55(d.name||d.file_name||d.attachment_name||'Dokument');
        const url=safeHttpUrlV55(d.file_url||d.url||d.attachment_url);
        const date=(d.created_at||d.updated_at||'').slice(0,10);
        return '<div class="pi-tenant-doc"><span>'+name+(date?'<small>Dodano: '+safeTextV55(date)+'</small>':'')+'</span><a href="'+safeTextV55(url)+'" target="_blank" rel="noopener noreferrer">Otwórz</a></div>';
      }).join('') + '</div>';
    }).join('');
  }

  function renderTenantAssistantV55(data){
    const issues = data.issues || [];
    const docs = data.documents || [];
    const paid = !!data.paidThisMonth;
    const openIssues = issues.filter(i=>!['zakończone','zakonczone','done','closed'].includes(String(i.status||'').toLowerCase()));
    const p = data.property || {};
    const day = p.payment_day || p.rent_due_day || null;

    let message;
    if(openIssues.length){
      const issue = openIssues[0] || {};
      message = {
        title:'🔧 Zgłoszenie w trakcie',
        body:'Twoje zgłoszenie "'+(issue.title || 'awaria')+'" jest widoczne u właściciela. Aktualny status: '+(issue.status || 'nowe')+'.'
      };
    }else if(!paid){
      message = {
        title:'📅 Płatność do sprawdzenia',
        body: day ? ('Najbliższa płatność przypada zwykle '+day+'. dnia miesiąca. Jeśli przelew został wykonany, zachowaj potwierdzenie.') : 'Nie widzę jeszcze pełnego potwierdzenia płatności za bieżący miesiąc. Jeśli przelew został wykonany, zachowaj potwierdzenie.'
      };
    }else if(docs.length){
      const latest = docs[0] || {};
      message = {
        title:'📄 Dokumenty są dostępne',
        body:'Najważniejsze dokumenty mieszkania masz niżej pod ręką. Ostatnio dostępny plik: '+(latest.name || latest.file_name || latest.attachment_name || 'dokument')+'.'
      };
    }else{
      message = {
        title:'✅ Wszystko wygląda spokojnie',
        body:'Nie widzę aktywnych awarii ani zaległości. Panel możesz traktować jako szybki podgląd mieszkania i miejsce do zgłoszeń.'
      };
    }

    const box = $('tenantPortalAssistant');
    if(box) box.innerHTML = '<div class="pi-tenant-advice only-one"><b>'+safeTextV55(message.title)+'</b><span>'+safeTextV55(message.body)+'</span></div>';
  }

  function renderTenantApartmentCenterV56(data){
    const p = data.property || {};
    const issues = data.issues || [];
    const paid = !!data.paidThisMonth;
    const openIssues = issues.filter(i=>!['zakończone','zakonczone','done','closed'].includes(String(i.status||'').toLowerCase()));
    const center = $('tenantApartmentCenterV56');
    if(!center) return;

    const area = p.area_m2 ? (Number(p.area_m2).toLocaleString('pl-PL')+' m²') : null;
    const addressLine = [p.address, area].filter(Boolean).join(' • ') || 'Podgląd mieszkania';
    const tenantName = p.tenant_name || p.tenant_full_name || 'Najemca';

    const paymentClass = paid ? 'ok' : 'warn';
    const paymentText = paid ? 'Brak zaległości' : 'Płatność do sprawdzenia';
    const issueClass = openIssues.length ? 'warn' : 'ok';
    const issueText = openIssues.length ? (openIssues.length+' aktywne zgłoszenie'+(openIssues.length>1?'a':'')) : 'Brak aktywnych awarii';

    center.classList.remove('hidden');
    center.innerHTML =
      '<div class="pi-tenant-center-head">'+
        '<div>'+
          '<div class="pi-tenant-center-title">🏠 '+safeTextV55(p.name || 'Moje mieszkanie')+'</div>'+
          '<div class="pi-tenant-center-sub">'+safeTextV55(addressLine)+'</div>'+
        '</div>'+
        '<div class="pi-tenant-center-sub"><b>Najemca:</b><br>'+safeTextV55(tenantName)+'</div>'+
      '</div>'+
      '<div class="pi-tenant-center-status">'+
        '<div class="pi-tenant-center-pill ok"><b>🟢 Umowa aktywna</b><span>Dostęp do panelu jest zarządzany w sekcji Dostępy.</span></div>'+
        '<div class="pi-tenant-center-pill '+paymentClass+'"><b>'+(paid?'🟢':'🟡')+' '+safeTextV55(paymentText)+'</b><span>Status bieżącego miesiąca.</span></div>'+
        '<div class="pi-tenant-center-pill '+issueClass+'"><b>'+(openIssues.length?'🟡':'🟢')+' '+safeTextV55(issueText)+'</b><span>Serwis i awarie mieszkania.</span></div>'+
      '</div>';
  }

  function renderTenantMetersV55(data){
    const rows = data.meterReadings || [];
    const box = $('tenantMeterHistory');
    if(!box) return;
    if(!rows.length){ box.innerHTML = '<div class="pi-tenant-muted">Brak zapisanych odczytów.</div>'; return; }
    const visible=rows.slice(0,5);
    const dateText=value=>{
      const match=String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || 'Brak daty');
    };
    const rowHtml=(r,index)=>{
      const values=[
        ['Prąd',r.electricity_reading],
        ['Woda',r.water_reading],
        ['Gaz',r.gas_reading]
      ].filter(item=>item[1] !== null && item[1] !== undefined && item[1] !== '');
      return '<article class="pi-meter-row '+(index===0?'latest':'')+'">'+
        '<div class="pi-meter-row-head"><time>'+safeTextV55(dateText(r.reading_date||r.created_at))+'</time>'+(index===0?'<span>Ostatni odczyt</span>':'')+'</div>'+
        '<div class="pi-meter-values">'+values.map(item=>'<div class="pi-meter-value"><span>'+safeTextV55(item[0])+'</span><b>'+safeTextV55(item[1])+'</b></div>').join('')+'</div>'+
        (r.note?'<div class="pi-meter-note">'+safeTextV55(r.note)+'</div>':'')+
      '</article>';
    };
    const current=visible.slice(0,2).map(rowHtml).join('');
    const older=visible.slice(2);
    box.innerHTML='<div class="pi-meter-history-head"><b>Ostatnie odczyty</b><span>'+visible.length+' wpisów</span></div>'+current+
      (older.length?'<details class="pi-meter-archive"><summary>Pokaż starsze odczyty <span>'+older.length+'</span></summary><div class="pi-meter-archive-list">'+older.map((row,index)=>rowHtml(row,index+3)).join('')+'</div></details>':'');
  }

  function formatBankAccountV561(v){
    const raw = String(v || '').trim();
    const compact = raw.replace(/\s+/g,'');
    if(!compact) return '';
    if(compact.length === 26 && /^\d+$/.test(compact)) return compact.replace(/(.{2})(?=.)/g,'$1 ').trim();
    return raw;
  }

  window.copyTenantPaymentAccountV561 = function(){
    const session = tenantSessionV54 || JSON.parse(sessionStorage.getItem('piTenantSessionV54') || 'null');
    const p = session?.property || {};
    const account = String(p.payment_account || p.bank_account || '').trim();
    const msg = document.getElementById('tenantPaymentCopyMsgV561');
    if(!account){ if(msg) msg.textContent = 'Brak numeru konta do skopiowania.'; return; }
    navigator.clipboard?.writeText(account).then(()=>{ if(msg) msg.textContent='Skopiowano numer konta.'; }).catch(()=>{ if(msg) msg.textContent='Zaznacz i skopiuj numer ręcznie.'; });
  };

  function renderTenantPaymentAccountV561(data){
    const p = data.property || {};
    const box = document.getElementById('tenantPaymentAccountCardV561');
    if(!box) return;
    const account = p.payment_account || p.bank_account || '';
    const label = p.payment_account_label || p.bank_account_label || 'Rachunek do wpłat za najem i opłaty';
    if(!String(account).trim()){
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = '<div class="pay-row"><div><div class="pay-label">Numer konta do wpłaty</div><div class="pay-number">'+safeTextV55(formatBankAccountV561(account))+'</div><div class="pay-note">'+safeTextV55(label)+'</div><div id="tenantPaymentCopyMsgV561Legacy" class="copy-ok"></div></div><button type="button" onclick="copyTenantPaymentAccountV561()">Kopiuj</button></div>';
  }

  function renderTenantContactV55(data){
    const p = data.property || {};
    const phone = normalizePhoneV54(p.owner_phone || p.contact_phone || p.manager_phone || '');
    const email = p.owner_email || p.contact_email || p.manager_email || '';
    const box = $('tenantContactBox');
    if(!box) return;
    const links = [];
    if(phone) links.push('<a href="tel:+'+phone+'">📞 Zadzwoń</a>');
    if(phone) links.push('<a href="https://wa.me/48'+phone.replace(/^48/,'')+'" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>');
    if(email) links.push('<a href="mailto:'+safeTextV55(email)+'">✉️ Email</a>');
    links.push('<a href="#" onclick="document.getElementById(\'tenantIssueTitle\')?.focus();return false;">🛠️ Zgłoś awarię</a>');
    box.innerHTML = links.join('');
  }

  function tenantMonthLabelV180(key){
    const value = String(key || '').slice(0,7);
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if(!match) return value || 'Nieznany miesiąc';
    const months = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
    return months[Number(match[2])-1] + ' ' + match[1];
  }

  function tenantPaymentDateV180(row){
    const raw = row?.payment_date || row?.date || row?.created_at || '';
    const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? (match[3]+'.'+match[2]+'.'+match[1]) : 'bez daty';
  }

  function tenantRowMonthV180(row){
    const explicit = String(row?.settlement_month || '').slice(0,7);
    if(/^\d{4}-\d{2}$/.test(explicit)) return explicit;
    const marker = String(row?.note || '').match(/\[\[(?:PI:SETTLEMENT_MONTH=|PI_SETTLEMENT_MONTH:)(\d{4}-\d{2})\]\]/i);
    if(marker) return marker[1];
    const raw = String(row?.payment_date || row?.date || row?.created_at || '');
    const dateMatch = raw.match(/^(\d{4})-(\d{2})/);
    return dateMatch ? (dateMatch[1]+'-'+dateMatch[2]) : '';
  }

  function tenantFallbackHistoryV180(data){
    const property = data.property || {};
    const payments = Array.isArray(data.payments) ? data.payments : [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const due = Math.max(0, Number(property.rent_amount || 0));
    const leaseStart = String(property.lease_start || '').slice(0,7);
    const rows = [];
    for(let offset=11; offset>=0; offset--){
      const date = new Date(currentYear, currentMonth-offset, 1);
      const key = date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
      if(/^\d{4}-\d{2}$/.test(leaseStart) && key < leaseStart) continue;
      const monthPayments = payments.filter(item=>tenantRowMonthV180(item)===key);
      const paid = monthPayments.reduce((sum,item)=>sum+Number(item.amount || 0),0);
      const arrears = Math.max(0,due-paid);
      const overpayment = Math.max(0,paid-due);
      rows.push({
        key,
        totalDue:due,
        tenantDue:due,
        paid,
        arrears,
        overpayment,
        status:due<=0.009 && paid<=0.009 ? 'Brak danych' : (arrears>0.009 ? (paid>0.009?'Niepełna płatność':'Brak wpłaty') : (overpayment>0.009?'Nadpłata':'Opłacone')),
        tone:arrears>0.009 ? 'warn' : 'ok',
        dueRows:due>0.009 ? [{label:'Miesięczna należność',amount:due}] : [],
        payments:monthPayments
      });
    }
    return rows.reverse();
  }

  function tenantSettlementHistoryV180(data){
    if(Array.isArray(data?.settlementHistory) && data.settlementHistory.length) return data.settlementHistory.slice(-12).reverse();
    const engine = window.PureInvestSettlementEngine;
    if(engine && typeof engine.propertyHistory === 'function'){
      try{
      const rows = engine.propertyHistory(
        data.property || {},
        typeof engine.currentMonth === 'function' ? engine.currentMonth() : new Date().toISOString().slice(0,7),
        data.payments || [],
        data.expenses || []
      );
        if(Array.isArray(rows) && rows.length) return rows.slice(-12).reverse();
      }catch(error){
        console.warn('PUREINVEST_TENANT_HISTORY_ENGINE_WARN', error);
      }
    }
    return tenantFallbackHistoryV180(data);
  }

  function renderTenantSettlementHistoryV180(data){
    const box = $('tenantSettlementHistoryV180');
    if(!box) return;
    if(typeof window.piTenantHistoryInlineV181 === 'function'){
      window.piTenantHistoryInlineV181(data);
      return;
    }
    try{
      const rows = tenantSettlementHistoryV180(data || {});
      if(!rows.length){
        box.innerHTML = '<div class="pi-tenant-muted">Brak zapisanych rozliczeń historycznych.</div>';
        return;
      }
      box.innerHTML = rows.map((row, index)=>{
        const due = Number(row.periodDue ?? row.tenantDue ?? row.baseDue ?? row.totalDue ?? 0);
        const paid = Number(row.periodPaidAtClose ?? row.settledAmount ?? row.paid ?? 0);
        const arrears = Math.max(0, Number(row.periodMissingAtClose ?? row.openAmount ?? Math.max(0,due-paid)));
        const overpayment = Math.max(0, Number(row.periodOverpaymentAtClose ?? Math.max(0,paid-due)));
        const tone = arrears > 0.009 ? 'warn' : 'ok';
        const status = due<=0.009 && paid<=0.009 ? 'Brak danych' : (arrears > 0.009 ? (paid>0.009?'Niepełna płatność':'Brak wpłaty') : (overpayment > 0.009 ? 'Nadpłata' : 'Opłacone'));
        const balanceText = arrears > 0.009 ? ('Do zapłaty '+moneyV54(arrears)) : (overpayment > 0.009 ? ('Nadpłata '+moneyV54(overpayment)) : 'Rozliczone');
        const balanceLabel = arrears > 0.009 ? 'Pozostało' : (overpayment > 0.009 ? 'Nadpłata' : 'Saldo');
        const balanceAmount = arrears > 0.009 ? arrears : overpayment;
        const progress = due > 0.009 ? Math.max(0,Math.min(100,Math.round((paid/due)*100))) : (paid>0?100:0);
        const components = (Array.isArray(row.dueRows) ? row.dueRows : []).map(item=>
          '<div class="pi-tenant-history-component"><span>'+safeTextV55(item.label || 'Należność')+'</span><b>'+moneyV54(item.amount || 0)+'</b></div>'
        ).join('');
        const payments = (Array.isArray(row.payments) ? row.payments : []).map(item=>
          '<div class="pi-tenant-history-payment"><span>'+safeTextV55(tenantPaymentDateV180(item))+'</span><b>'+moneyV54(item.amount || 0)+'</b></div>'
        ).join('');
        const meta = row.dueDateLabel ? ('Termin '+row.dueDateLabel) : balanceText;
        return '<details class="pi-tenant-history-month '+tone+'" '+(index===0?'open':'')+'><summary>'+
          '<div class="pi-tenant-history-period"><span class="pi-tenant-history-dot"></span><div><b>'+safeTextV55(tenantMonthLabelV180(row.key || row.month))+'</b><small>'+safeTextV55(meta)+'</small></div></div>'+
          '<div class="pi-tenant-history-metric"><span>Należne</span><strong>'+moneyV54(due)+'</strong></div>'+
          '<div class="pi-tenant-history-metric pi-tenant-history-paid"><span>Rozliczono</span><strong>'+moneyV54(paid)+'</strong><i><u style="width:'+progress+'%"></u></i></div>'+
          '<div class="pi-tenant-history-metric pi-tenant-history-balance"><span>'+safeTextV55(balanceLabel)+'</span><strong>'+moneyV54(balanceAmount)+'</strong></div>'+
          '<span class="pi-tenant-history-badge '+tone+'">'+safeTextV55(status)+'</span><span class="pi-tenant-history-chevron" aria-hidden="true"></span></summary>'+
          '<div class="pi-tenant-history-details"><div class="pi-tenant-history-detail-grid">'+
            '<section><div class="pi-tenant-history-detail-title">Skład należności</div><div class="pi-tenant-history-components">'+
              (components || '<div class="pi-tenant-history-empty">Brak składników należności.</div>')+
            '</div></section>'+
            '<section><div class="pi-tenant-history-detail-title">Zaksięgowane wpłaty</div><div class="pi-tenant-history-payments">'+
              (payments || '<div class="pi-tenant-history-empty"><span>—</span> Brak wpłaty w tym miesiącu.</div>')+
            '</div></section>'+
          '</div></div></details>';
      }).join('');
      if(box.dataset) box.dataset.historyReady = 'true';
    }catch(error){
      console.error('PUREINVEST_TENANT_HISTORY_RENDER_ERROR', error);
      box.innerHTML = '<div class="pi-tenant-muted">Nie udało się wyświetlić historii. Odśwież panel lub zaloguj się ponownie.</div>';
    }
  }
  window.piRenderTenantSettlementHistoryV180 = renderTenantSettlementHistoryV180;

  window.renderTenantPortalV54 = function(data){
    data = data && typeof data === 'object' ? data : {};
    ['documents','issues','meterReadings','feeBreakdowns','payments','expenses'].forEach(key=>{
      if(!Array.isArray(data[key])) data[key] = [];
    });
    const p = data.property || {};
    renderTenantSettlementHistoryV180(data);
    $('tenantPropertyChooserV551')?.classList.add('hidden');
    $('tenantPortalGrid')?.classList.remove('hidden');
    $('tenantPortalTitle').textContent = p.name || 'Moje mieszkanie';
    const subtitleBase = [p.address, p.area_m2 ? (Number(p.area_m2).toLocaleString('pl-PL')+' m²') : null].filter(Boolean).join(' • ') || 'Podgląd mieszkania';
    const hasMany = Array.isArray(data.allTenantSessions) && data.allTenantSessions.length > 1;
    const demoBadge = data.demoTenant===true ? '<br><span class="pi-tenant-pill">Tryb demonstracyjny — zmiany nie są zapisywane w bazie</span>' : '';
    $('tenantPortalSubtitle').innerHTML = safeTextV55(subtitleBase) + demoBadge + (hasMany ? '<br><button class="pi-tenant-switch" onclick="tenantBackToPropertyPickerV551()">Zmień mieszkanie</button>' : '');
    const current = data.currentSettlement || (Array.isArray(data.settlementHistory) ? data.settlementHistory.find(row=>row.key===new Date().toISOString().slice(0,7)) : null);
    const due = Number(current?.periodDue ?? current?.tenantDue ?? current?.baseDue ?? p.rent_amount ?? 0);
    const paidForPeriod = Number(current?.periodPaidAtClose ?? current?.settledAmount ?? current?.paid ?? 0);
    const missingForPeriod = Math.max(0,Number(current?.periodMissingAtClose ?? current?.openAmount ?? Math.max(0,due-paidForPeriod)));
    const cumulativeArrears = Math.max(0,Number(current?.missingAfter ?? current?.arrears ?? current?.balance ?? 0));
    const status = missingForPeriod>0.009 ? (paidForPeriod>0.009?'Niepełna płatność':'Brak wpłaty') : (paidForPeriod>due+0.009?'Nadpłata':'Opłacone');
    const tone = missingForPeriod>0.009 ? (current?.tone === 'bad' ? 'bad' : 'warn') : '';
    $('tenantPortalPayments').innerHTML = '<div class="pi-tenant-status-row"><span>Należność za bieżący miesiąc</span><b>'+moneyV54(due)+'</b></div><div class="pi-tenant-status-row"><span>Status bieżącego miesiąca</span><span class="pi-tenant-pill '+tone+'">'+safeTextV55(status)+'</span></div>'+(cumulativeArrears>missingForPeriod+0.009?'<div class="pi-tenant-status-row"><span>Starsze zaległości</span><b>'+moneyV54(cumulativeArrears-missingForPeriod)+'</b></div>':'')+'<div class="pi-tenant-status-row"><span>Dzień płatności</span><b>'+(p.payment_day || p.rent_due_day || '—')+'</b></div>';
    try{ window.dispatchEvent(new CustomEvent('pi:tenant-session-rendered',{detail:{data}})); }catch(_){ }
    $('tenantPortalDocs').innerHTML = groupTenantDocsV55((data.documents || []).filter(doc=>doc?.category!=='pi_fee_media_report'));
    const issues = data.issues || [];
    $('tenantPortalIssues').innerHTML = issues.length ? issues.map(i=>'<div class="pi-tenant-issue"><b>'+safeTextV55(i.title||'Zgłoszenie')+'</b><br>Status: '+safeTextV55(i.status||'nowe')+'<br><span>'+safeTextV55((i.created_at||'').slice(0,10))+'</span></div>').join('') : '<div class="pi-tenant-muted">Brak zgłoszeń.</div>';
    renderTenantApartmentCenterV56(data);
    renderTenantAssistantV55(data);
    renderTenantMetersV55(data);
    renderTenantPaymentAccountV561(data);
    renderTenantContactV55(data);
    if(typeof window.piRenderTenantFeeReportV193 === 'function') window.piRenderTenantFeeReportV193(data);
  };

  window.tenantSubmitIssueV54 = async function(){
    const msg = $('tenantIssueMsg');
    const session = tenantSessionV54 || JSON.parse(sessionStorage.getItem('piTenantSessionV54') || 'null');
    if(!session || !session.property){ if(msg) msg.textContent='Sesja najemcy wygasła. Zaloguj się ponownie.'; return; }
    const title = $('tenantIssueTitle')?.value.trim() || '';
    const description = $('tenantIssueDescription')?.value.trim() || '';
    const file = $('tenantIssuePhoto')?.files?.[0] || null;
    if(!title || !description){ if(msg) msg.textContent='Podaj krótki tytuł i opis awarii.'; return; }
    if(msg) msg.textContent='Wysyłam zgłoszenie...';
    const attachment = await tenantUploadIssuePhotoV54(file, session.property.id);
    const data = await tenantFetchJsonV54('/.netlify/functions/tenant-maintenance', {
      propertyId: session.property.id,
      tenantToken: session.tenantToken,
      title, description,
      attachment
    });
    if(!data.ok){ if(msg) msg.textContent = data.message || 'Nie udało się wysłać zgłoszenia.'; return; }
    $('tenantIssueTitle').value=''; $('tenantIssueDescription').value=''; if($('tenantIssuePhoto')) $('tenantIssuePhoto').value='';
    if(msg) msg.textContent=data.sandbox ? 'Zgłoszenie dodano demonstracyjnie — bez zapisu w bazie.' : 'Zgłoszenie zostało wysłane.';
    session.issues = data.issues || session.issues || [];
    tenantSessionV54 = session;
    sessionStorage.setItem('piTenantSessionV54', JSON.stringify(session));
    renderTenantPortalV54(session);
  };

  window.tenantSubmitMetersV55 = async function(){
    const msg = $('tenantMeterMsg');
    const session = tenantSessionV54 || JSON.parse(sessionStorage.getItem('piTenantSessionV54') || 'null');
    if(!session || !session.property){ if(msg) msg.textContent='Sesja najemcy wygasła. Zaloguj się ponownie.'; return; }
    const electricity = meterValV55($('tenantMeterElectricity')?.value);
    const water = meterValV55($('tenantMeterWater')?.value);
    const gas = meterValV55($('tenantMeterGas')?.value);
    const note = $('tenantMeterNote')?.value.trim() || '';
    if(electricity===null && water===null && gas===null){ if(msg) msg.textContent='Wpisz przynajmniej jeden odczyt licznika.'; return; }
    if(msg) msg.textContent='Zapisuję odczyt...';
    const data = await tenantFetchJsonV54('/.netlify/functions/tenant-meter-readings', {
      propertyId: session.property.id,
      tenantToken: session.tenantToken,
      electricity, water, gas, note
    });
    if(!data.ok){ if(msg) msg.textContent = data.message || 'Nie udało się zapisać odczytu.'; return; }
    $('tenantMeterElectricity').value=''; $('tenantMeterWater').value=''; $('tenantMeterGas').value=''; $('tenantMeterNote').value='';
    session.meterReadings = data.meterReadings || session.meterReadings || [];
    tenantSessionV54 = session;
    sessionStorage.setItem('piTenantSessionV54', JSON.stringify(session));
    if(msg) msg.textContent=data.sandbox ? 'Odczyt dodano demonstracyjnie — bez zapisu w bazie.' : 'Odczyt został zapisany.';
    renderTenantPortalV54(session);
  };

  function extendOwnerSaveV54(){
    const original = window.updateTenant;
    if(typeof original !== 'function' || window.updateTenantV54Wrapped) return;
    window.updateTenantV54Wrapped = true;

  }

  const originalHydrateV54 = window.hydratePropertyForms;
  if(typeof originalHydrateV54 === 'function'){

  }
  const originalSwitchTabV54 = window.switchTab;
  if(typeof originalSwitchTabV54 === 'function'){

  }

  document.addEventListener('DOMContentLoaded', function(){
    injectTenantLogin();
    extendOwnerSaveV54();
    const stored = sessionStorage.getItem('piTenantSessionV54');
    if(stored){
      try{
        tenantSessionV54 = JSON.parse(stored);
        if(tenantSessionV54?._clientVersion !== '1.9.19'){
          tenantSessionV54._clientVersion='1.9.19';
          sessionStorage.setItem('piTenantSessionV54',JSON.stringify(tenantSessionV54));
        }
        if(tenantSessionV54 && tenantSessionV54.property){
          renderTenantSettlementHistoryV180(tenantSessionV54);
          showTenantPortalV54(tenantSessionV54);
        }
      }catch(error){
        console.warn('PUREINVEST_TENANT_SESSION_RESTORE_WARN', error);
      }
    }
  });
})();
