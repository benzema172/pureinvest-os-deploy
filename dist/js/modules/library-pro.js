(function(){
  if(window.__PI_V72_BIBLIOTEKA_PRO__) return;
  window.__PI_V72_BIBLIOTEKA_PRO__ = true;
  const REQUIRED_DOCS = [
    {group:'Właściciel', name:'Umowa o zarządzanie najmem'},
    {group:'Właściciel', name:'Pełnomocnictwo'},
    {group:'Właściciel', name:'RODO właściciela'},
    {group:'Właściciel', name:'Ubezpieczenie'},
    {group:'Najemca', name:'Formularz zgłoszeniowy najemcy'},
    {group:'Najemca', name:'Checklista weryfikacji najemcy'},
    {group:'Najemca', name:'RODO najemcy'},
    {group:'Najemca', name:'Regulamin obsługi najemcy'},
    {group:'Umowy', name:'Umowa najmu okazjonalnego'},
    {group:'Umowy', name:'Umowa najmu instytucjonalnego'},
    {group:'Umowy', name:'Zwykła umowa najmu'},
    {group:'Protokoły', name:'Protokół zdawczo-odbiorczy'},
    {group:'Protokoły', name:'Protokół odbioru końcowego'},
    {group:'Windykacja', name:'Wezwanie do zapłaty'},
    {group:'Windykacja', name:'Wezwanie do uzupełnienia kaucji'},
    {group:'Windykacja', name:'Wypowiedzenie umowy'},
    {group:'Windykacja', name:'Żądanie opróżnienia lokalu'},
    {group:'Techniczne', name:'Procedura awarii'}
  ];
  const LEGACY_MAP = {
    'Umowa najmu':'Zwykła umowa najmu',
    'Protokół zdawczo-odbiorczy':'Protokół zdawczo-odbiorczy',
    'Faktura / rachunek':'Faktura / rachunek',
    'Zdjęcia mieszkania':'Zdjęcia mieszkania',
    'Liczniki':'Liczniki',
    'Remont':'Remont',
    'Wyposażenie':'Wyposażenie',
    'Inne':'Inne'
  };
  const EXTRA_CATS = ['Faktura / rachunek','Liczniki','Remont','Wyposażenie','Inne'];
  const PHOTO_CATS = ['Zdjęcia mieszkania','Liczniki','Remont','Wyposażenie','Usterki','Przekazanie lokalu','Inne'];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeUrl = v => { try{ const url=new URL(String(v||''),window.location.origin); return ['http:','https:'].includes(url.protocol)?url.href:'#'; }catch(_){ return '#'; } };
  const normalize = v => LEGACY_MAP[String(v||'').trim()] || String(v||'').trim();
  const docNames = () => REQUIRED_DOCS.map(d=>d.name);
  function currentRole(){ try{return (typeof piRole==='function' ? piRole() : (document.body.dataset.piRole || 'admin')) || 'admin';}catch(e){return document.body.dataset.piRole || 'admin';} }
  function roleBadge(item){
    const t = item && item.tenant_visible === true;
    const o = item && item.owner_visible !== false;
    if(t && o) return '<span class="pi-doc-role-badge both">Właściciel + najemca</span>';
    if(t) return '<span class="pi-doc-role-badge tenant">Najemca</span>';
    if(o) return '<span class="pi-doc-role-badge owner">Właściciel</span>';
    return '<span class="pi-doc-role-badge admin">Tylko admin</span>';
  }
  function bucketFor(kind){ return kind === 'photo' ? PHOTO_BUCKET : DOC_BUCKET; }
  async function hydrateSignedImages(root){
    const nodes=[...(root || document).querySelectorAll('img[data-pi-thumb-bucket][data-pi-thumb-path]')];
    for(const img of nodes){
      if(img.dataset.signedReady === '1') continue;
      const bucket=img.dataset.piThumbBucket, path=img.dataset.piThumbPath;
      if(!bucket || !path) continue;
      try{
        img.dataset.signedReady='1';
        if(typeof window.piSignedStorageUrlV772 === 'function') img.src = safeUrl(await window.piSignedStorageUrlV772(bucket, path));
      }catch(e){
        img.alt = 'Miniatura niedostępna';
        img.classList.add('pi-thumb-error');
      }
    }
  }
  function isTenant(){ return currentRole()==='tenant' || !!sessionStorage.getItem('piTenantSessionV54'); }
  function activeId(){ return window.activeProperty || (window.activePropertyData && window.activePropertyData.id) || null; }
  function injectLibraryMarkup(){
    const tab=document.getElementById('tab-documents'); if(!tab || tab.dataset.v72Ready==='1') return;
    tab.dataset.v72Ready='1';
    tab.innerHTML = `
      <div class="context-header"><h2>Biblioteka</h2><p>Dokumentacja i zdjęcia lokalu dla administratora i zarządcy. Najemca nie widzi tej sekcji.</p></div>
      <div class="pi-doc-pro-head">
        <div class="pi-doc-progress-card"><div class="pi-doc-progress-top"><b id="piDocProgressTitle">Dokumentacja</b><span id="piDocProgressRatio">0/${REQUIRED_DOCS.length}</span></div><div class="pi-doc-progress-bar"><div class="pi-doc-progress-fill" id="piDocProgressFill" style="width:0%"></div></div><div class="pi-doc-progress-meta" id="piDocProgressMeta">Wybierz mieszkanie, aby sprawdzić kompletność dokumentów.</div></div>
        <div class="pi-doc-missing-card"><b>Najważniejsze braki</b><div id="piDocMissingList">Brak danych.</div></div>
      </div>
      <div class="pi-admin-tabs pi-unified-tabs pi-section-admin-toggles">
        <button type="button" class="pi-admin-tab-btn active" onclick="piSectionTogglePanel('piLibraryAddCollapse', this)">Dodaj dokument</button>
        <button type="button" class="pi-admin-tab-btn" onclick="piSectionTogglePanel('piLibraryChecklistCollapse', this, 'library')">Checklista</button>
        <button type="button" class="pi-admin-tab-btn" onclick="piSectionTogglePanel('piLibraryPhotosCollapse', this, 'library')">Zdjęcia</button>
        <button type="button" class="pi-admin-tab-btn" onclick="piSectionTogglePanel('piLibraryListCollapse', this, 'library')">Pozostałe pliki</button>
      </div>
      <div id="piLibraryAddCollapse" class="pi-section-collapse pi-admin-subtab active">
        <div class="card" id="piDocUploadCard"><div class="card-title">Dodaj dokument do checklisty</div><div class="form-row"><input id="piDocLibraryTitle" placeholder="Nazwa pliku / opis, np. podpisana umowa"><select id="piDocLibraryCategory"></select></div><textarea id="piDocLibraryNote" placeholder="Notatka, np. podpisane elektronicznie, obowiązuje od..., uwagi"></textarea><input id="piDocLibraryFiles" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple>
          <div class="pi-doc-visibility-line">
            <label><input id="piDocOwnerVisible" type="checkbox" checked> Widoczne dla właściciela</label>
            <label><input id="piDocTenantVisible" type="checkbox"> Widoczne dla najemcy</label>
          </div>
          <button onclick="addLibraryFiles()">Dodaj do Biblioteki</button></div>
      </div>
      <div id="piLibraryChecklistCollapse" class="pi-section-collapse pi-admin-subtab">
        <div class="card"><div class="card-title">Lista kontrolna dokumentów</div><p class="pi-card-hint">Dobierz dokumenty do formy i etapu najmu. Rodzaje umów są alternatywne. Dokumenty zakończenia najmu i windykacji znajdziesz w filtrze; nie obniżają bieżącego postępu.</p><div class="gallery-toolbar"><select id="piDocLibraryFilter" onchange="loadLibrary()"><option value="all">Lista kontrolna dokumentów</option></select><button class="subtle-link-btn" onclick="loadLibrary()">Odśwież</button></div><div id="piDocChecklist">Ładowanie checklisty...</div></div>
      </div>
      <div id="piLibraryPhotosCollapse" class="pi-section-collapse pi-admin-subtab">
        <div class="card" id="piPhotoUploadCard">
          <div class="card-title">Zdjęcia lokalu</div>
          <div class="transactions-info" style="margin-bottom:12px;">Dodawaj zdjęcia mieszkania, liczników, wyposażenia, remontu, usterek lub przekazania lokalu.</div>
          <div class="form-row"><input id="piPhotoLibraryTitle" placeholder="Nazwa / opis zdjęć, np. licznik prądu lipiec"><select id="piPhotoLibraryCategory"></select></div>
          <textarea id="piPhotoLibraryNote" placeholder="Notatka, np. stan licznika, pomieszczenie, uwagi"></textarea>
          <input id="piPhotoLibraryFiles" type="file" accept="image/*" multiple>
          <div class="pi-doc-visibility-line">
            <label><input id="piPhotoOwnerVisible" type="checkbox" checked> Widoczne dla właściciela</label>
            <label><input id="piPhotoTenantVisible" type="checkbox"> Widoczne dla najemcy</label>
          </div>
          <button onclick="addLibraryPhotos()">Dodaj zdjęcia</button>
        </div>
        <div class="card"><div class="card-title">Galeria zdjęć</div><div id="piDocPhotoList" class="photo-grid">Ładowanie zdjęć...</div></div>
      </div>
      <div id="piLibraryListCollapse" class="pi-section-collapse pi-admin-subtab">
        <div class="card"><div class="card-title">Pozostałe pliki i materiały</div><div id="piDocLibraryList" class="photo-grid">Ładowanie biblioteki...</div></div>
      </div>`;
    fillSelects();
  }
  function fillSelects(){
    const cats = [...docNames(), ...EXTRA_CATS];
    const up=document.getElementById('piDocLibraryCategory'); if(up) up.innerHTML=cats.map(x=>`<option>${esc(x)}</option>`).join('');
    const photo=document.getElementById('piPhotoLibraryCategory'); if(photo) photo.innerHTML=PHOTO_CATS.map(x=>`<option>${esc(x)}</option>`).join('');
    const fl=document.getElementById('piDocLibraryFilter'); if(fl){ fl.innerHTML='<option value="all">Lista kontrolna dokumentów</option>'+REQUIRED_DOCS.reduce((h,d)=>h+`<option>${esc(d.name)}</option>`,'')+'<option value="other">Pozostałe pliki</option>'; }
  }
  async function fetchLibrary(pid){
    if(!window.db || !pid) return {docs:[],photos:[],error:null};
    const [{data:docs,error:de},{data:photos,error:pe}] = await Promise.all([
      db.from('property_documents').select('*').eq('property_id',pid).order('created_at',{ascending:false}),
      db.from('property_photos').select('*').eq('property_id',pid).order('created_at',{ascending:false})
    ]);
    return {docs:(docs||[]).filter(row=>row?.category!=='pi_fee_media_report'),photos:photos||[],error:de||pe};
  }
  function statsFor(docs, photos){
    const all=[...(docs||[]).map(x=>({...x,kind:'document'})),...(photos||[]).map(x=>({...x,kind:'photo'}))];
    const byName=new Map();
    for(const item of all){ const cat=normalize(item.category); if(!byName.has(cat)) byName.set(cat,[]); byName.get(cat).push(item); }
    const contracts=REQUIRED_DOCS.filter(d=>d.group==='Umowy');
    const contractFiles=contracts.flatMap(d=>byName.get(d.name)||[]);
    const contractName=contractFiles.length ? normalize(contractFiles[0].category) : 'Umowa najmu — właściwy rodzaj';
    byName.set(contractName,contractFiles);
    const checklist=REQUIRED_DOCS.filter(d=>d.group!=='Windykacja' && d.group!=='Umowy' && d.name!=='Protokół odbioru końcowego');
    checklist.push({group:'Umowy',name:contractName,uploadName:contractFiles.length ? contractName : 'Zwykła umowa najmu'});
    const missing=checklist.filter(d=>!(byName.get(d.name)||[]).length);
    const done=checklist.length-missing.length;
    return {all,byName,missing,done,checklist,total:checklist.length,percent:Math.round(done/checklist.length*100)};
  }
  function updateProgress(stats){
    const ratio=document.getElementById('piDocProgressRatio'); if(ratio) ratio.textContent=`${stats.done}/${stats.total}`;
    const fill=document.getElementById('piDocProgressFill'); if(fill) fill.style.width=stats.percent+'%';
    const meta=document.getElementById('piDocProgressMeta'); if(meta) meta.textContent = stats.percent===100 ? 'Wszystkie pozycje pomocniczej listy zostały dodane.' : `Lista uzupełniona w ${stats.percent}%. Do sprawdzenia: ${stats.missing.length} pozycji.`;
    const missingBox=document.getElementById('piDocMissingList');
    if(missingBox){
      if(!stats.missing.length) missingBox.innerHTML='<div class="badge green-badge">Komplet dokumentów</div>';
      else missingBox.innerHTML='<ul>'+stats.missing.slice(0,5).map(d=>`<li>${esc(d.name)}</li>`).join('')+(stats.missing.length>5?`<li>+ ${stats.missing.length-5} pozostałych pozycji</li>`:'')+'</ul>';
    }
    updateParobekDocs(stats);
  }
  function renderChecklist(stats){
    const box=document.getElementById('piDocChecklist'); if(!box) return;
    const filter=document.getElementById('piDocLibraryFilter')?.value || 'all';
    const checklist=filter==='all' ? stats.checklist : REQUIRED_DOCS;
    const groups=[...new Set(checklist.map(d=>d.group))];
    let html='';
    for(const group of groups){
      const docs=checklist.filter(d=>d.group===group).filter(d=>filter==='all'||filter===d.name);
      if(!docs.length) continue;
      const done=docs.filter(d=>(stats.byName.get(d.name)||[]).length).length;
      html+=`<div class="pi-doc-section"><div class="pi-doc-section-head"><b>${esc(group)}</b><span>${done}/${docs.length}</span></div>`;
      for(const d of docs){
        const items=stats.byName.get(d.name)||[]; const latest=items[0]; const ok=!!latest; const dt=latest?.created_at?new Date(latest.created_at).toLocaleDateString('pl-PL'):'';
        html+=`<div class="pi-doc-row"><div class="pi-doc-row-title"><b>${esc(d.name)}</b><small>${ok?`Dodano: ${esc(dt)}${latest.file_name?' • '+esc(latest.file_name):''}`:'Brak pliku w dokumentacji lokalu'}</small>${ok?roleBadge(latest):''}</div><span class="pi-doc-status ${ok?'ok':'missing'}">${ok?'✅ Dodano':'❌ Brak'}</span><div class="pi-doc-actions">${ok?`<a href="${esc(safeUrl(latest.file_url))}" target="_blank" rel="noopener noreferrer">Otwórz</a><button class="danger" onclick="deleteLibraryItem('${latest.kind}','${latest.id}','${esc(latest.file_path||'')}')">Usuń</button>`:`<button class="subtle" onclick="piV72PrepareUpload('${esc(d.uploadName || d.name)}')">Dodaj</button>`}</div></div>`;
      }
      html+='</div>';
    }
    if(filter==='other') html='<div class="pi-doc-section"><div class="pi-doc-section-head"><b>Pozostałe pliki</b><span>materiały dodatkowe</span></div></div>';
    box.innerHTML=html || 'Brak pozycji.';
  }
  function photoCard(item){
    const title=item.title||item.file_name||'Zdjęcie';
    const category=item.category||'Zdjęcia mieszkania';
    const date=item.created_at?new Date(item.created_at).toLocaleString('pl-PL'):'';
    const note=item.note?`<small>${esc(item.note)}</small>`:'';
    const bucket=bucketFor('photo');
    const path=item.file_path||'';
    const safeHref=safeUrl(item.file_url);
    const preview=`<a href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer"><img class="pi-signed-thumb" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='360'%3E%3Crect width='100%25' height='100%25' fill='%23f7f2ec'/%3E%3C/svg%3E" data-pi-thumb-bucket="${esc(bucket)}" data-pi-thumb-path="${esc(path)}" alt="${esc(title)}"><span class="pi-thumb-placeholder">Ładowanie miniatury...</span></a>`;
    return `<div class="photo-card">${preview}<div class="photo-info"><b>${esc(title)}</b><small>${esc(category)} • ${esc(date)}</small>${roleBadge(item)}${note}<div class="photo-actions"><a href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer">Otwórz</a><button type="button" onclick="toggleLibraryVisibility('photo','${item.id}','owner',${item.owner_visible===false?'true':'false'})">${item.owner_visible===false?'Pokaż właśc.':'Ukryj właśc.'}</button><button type="button" onclick="toggleLibraryVisibility('photo','${item.id}','tenant',${item.tenant_visible===true?'false':'true'})">${item.tenant_visible===true?'Ukryj najemcy':'Pokaż najemcy'}</button><button class="danger" onclick="deleteLibraryItem('photo','${item.id}','${esc(item.file_path||'')}')">Usuń</button></div></div></div>`;
  }
  function renderPhotoTab(photos){
    const list=document.getElementById('piDocPhotoList'); if(!list) return;
    const items=(photos||[]).map(x=>({...x,kind:'photo'}));
    if(!items.length){ list.innerHTML='Brak zdjęć dla tego mieszkania.'; return; }
    list.innerHTML=items.map(photoCard).join('');
    hydrateSignedImages(list);
  }
  function renderOtherFiles(stats){
    const list=document.getElementById('piDocLibraryList'); if(!list) return;
    const required=new Set(docNames());
    const other=stats.all.filter(x=>x.kind !== 'photo' && !required.has(normalize(x.category)));
    if(!other.length){ list.innerHTML='Brak dodatkowych plików poza checklistą.'; return; }
    list.innerHTML=other.map(item=>{
      const title=item.title||item.file_name||'Materiał'; const category=item.category||'Inne'; const date=item.created_at?new Date(item.created_at).toLocaleString('pl-PL'):''; const note=item.note?`<small>${esc(item.note)}</small>`:'';
      const safeHref=safeUrl(item.file_url);
      const preview=`<div style="height:150px;border-radius:18px;background:#faf7f2;border:1px solid #eee7de;display:flex;align-items:center;justify-content:center;font-weight:900;color:#8a3f15;">📄 Dokument</div>`;
      return `<div class="photo-card">${preview}<div class="photo-info"><b>${esc(title)}</b><small>${esc(category)} • ${esc(date)}</small>${roleBadge(item)}${note}<div class="photo-actions"><a href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer">Otwórz</a><button type="button" onclick="toggleLibraryVisibility('${item.kind}','${item.id}','owner',${item.owner_visible===false?'true':'false'})">${item.owner_visible===false?'Pokaż właśc.':'Ukryj właśc.'}</button><button type="button" onclick="toggleLibraryVisibility('${item.kind}','${item.id}','tenant',${item.tenant_visible===true?'false':'true'})">${item.tenant_visible===true?'Ukryj najemcy':'Pokaż najemcy'}</button><button class="danger" onclick="deleteLibraryItem('${item.kind}','${item.id}','${esc(item.file_path||'')}')">Usuń</button></div></div></div>`;
    }).join('');
  }
  function updateParobekDocs(stats){ return; }
  async function computePropertyDocStats(pid){ const lib=await fetchLibrary(pid); if(lib.error) return null; return statsFor(lib.docs,lib.photos); }
  window.piV72PrepareUpload=function(name){
    const sel=document.getElementById('piDocLibraryCategory'); if(sel) sel.value=name;
    const title=document.getElementById('piDocLibraryTitle'); if(title) title.value=name;
    const card=document.getElementById('piDocUploadCard'); if(card){card.scrollIntoView({behavior:'smooth',block:'center'}); card.classList.add('pi-doc-upload-focus'); setTimeout(()=>card.classList.remove('pi-doc-upload-focus'),1600);}
  };
  window.addLibraryFiles = async function(){
    if(isTenant()) return alert('Biblioteka jest dostępna tylko dla administratora i zarządcy.');
    const pid=activeId(); if(!pid) return alert('Najpierw wybierz mieszkanie.');
    const files=[...(document.getElementById('piDocLibraryFiles')?.files||[])]; if(!files.length) return alert('Wybierz plik albo zdjęcie.');
    const titleBase=(document.getElementById('piDocLibraryTitle')?.value||'').trim(); const category=document.getElementById('piDocLibraryCategory')?.value||'Inne'; const note=document.getElementById('piDocLibraryNote')?.value||''; const tenantVisible=!!document.getElementById('piDocTenantVisible')?.checked; const ownerVisible=document.getElementById('piDocOwnerVisible')?.checked !== false;
    for(const file of files){
      const isImage=file.type && file.type.startsWith('image/'); const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      if(isImage && PHOTO_CATS.includes(category)){
        const path=`${pid}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`; const {error:uploadError}=await db.storage.from(PHOTO_BUCKET).upload(path,file,{upsert:false}); if(uploadError){alert('Błąd uploadu zdjęcia: '+uploadError.message);return;}
        const {data:urlData}=db.storage.from(PHOTO_BUCKET).getPublicUrl(path); const {error:insertError}=await db.from('property_photos').insert([{property_id:pid,tenancy_id:window.piActiveTenancyId || null,title:titleBase||file.name,category,note,file_name:file.name,file_path:path,file_url:urlData.publicUrl,tenant_visible:tenantVisible,owner_visible:ownerVisible}]); if(insertError){alert('Błąd zapisu zdjęcia: '+insertError.message);return;}
      }else{
        const path=`${pid}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`; const {error:uploadError}=await db.storage.from(DOC_BUCKET).upload(path,file,{upsert:false}); if(uploadError){alert('Błąd uploadu dokumentu: '+uploadError.message);return;}
        const {data:urlData}=db.storage.from(DOC_BUCKET).getPublicUrl(path); const {error:insertError}=await db.from('property_documents').insert([{property_id:pid,tenancy_id:window.piActiveTenancyId || null,title:titleBase||category||file.name,category,file_name:file.name,file_path:path,file_url:urlData.publicUrl,note,tenant_visible:tenantVisible,owner_visible:ownerVisible}]); if(insertError){alert('Plik przesłany, ale zapis dokumentu w tabeli nie działa: '+insertError.message);return;}
      }
    }
    ['piDocLibraryTitle','piDocLibraryNote','piDocLibraryFiles'].forEach(id=>{const e=document.getElementById(id); if(e) e.value='';});
    await loadLibrary(); await decoratePropertyTilesWithDocs();
  };
  window.addLibraryPhotos = async function(){
    if(isTenant()) return alert('Biblioteka jest dostępna tylko dla administratora i zarządcy.');
    const pid=activeId(); if(!pid) return alert('Najpierw wybierz mieszkanie.');
    const files=[...(document.getElementById('piPhotoLibraryFiles')?.files||[])]; if(!files.length) return alert('Wybierz zdjęcie albo kilka zdjęć.');
    const titleBase=(document.getElementById('piPhotoLibraryTitle')?.value||'').trim();
    const category=document.getElementById('piPhotoLibraryCategory')?.value||'Zdjęcia mieszkania';
    const note=document.getElementById('piPhotoLibraryNote')?.value||'';
    const tenantVisible=!!document.getElementById('piPhotoTenantVisible')?.checked;
    const ownerVisible=document.getElementById('piPhotoOwnerVisible')?.checked !== false;
    for(const file of files){
      if(file.type && !file.type.startsWith('image/')) return alert('W zakładce Zdjęcia można dodać tylko pliki graficzne.');
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`${pid}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
      const {error:uploadError}=await db.storage.from(PHOTO_BUCKET).upload(path,file,{upsert:false}); if(uploadError){alert('Błąd uploadu zdjęcia: '+uploadError.message);return;}
      const {data:urlData}=db.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      const {error:insertError}=await db.from('property_photos').insert([{property_id:pid,tenancy_id:window.piActiveTenancyId || null,title:titleBase||file.name,category,note,file_name:file.name,file_path:path,file_url:urlData.publicUrl,tenant_visible:tenantVisible,owner_visible:ownerVisible}]);
      if(insertError){alert('Błąd zapisu zdjęcia: '+insertError.message);return;}
    }
    ['piPhotoLibraryTitle','piPhotoLibraryNote','piPhotoLibraryFiles'].forEach(id=>{const e=document.getElementById(id); if(e) e.value='';});
    await loadLibrary(); await decoratePropertyTilesWithDocs();
    const gallery=document.getElementById('piDocPhotoList'); if(gallery) gallery.scrollIntoView({behavior:'smooth',block:'start'});
  };
  window.loadLibrary = async function(){
    injectLibraryMarkup();
    const pid=activeId(); const list=document.getElementById('piDocLibraryList'), check=document.getElementById('piDocChecklist'), photos=document.getElementById('piDocPhotoList');
    if(isTenant()){ if(check) check.innerHTML='Biblioteka jest ukryta dla najemcy.'; if(list) list.innerHTML=''; if(photos) photos.innerHTML=''; return; }
    if(!pid){ if(check) check.innerHTML='Wybierz mieszkanie.'; if(list) list.innerHTML='Wybierz mieszkanie.'; if(photos) photos.innerHTML='Wybierz mieszkanie.'; return; }
    const lib=await fetchLibrary(pid); if(lib.error){ if(check) check.innerHTML='Błąd ładowania biblioteki: '+esc(lib.error.message); return; }
    const stats=statsFor(lib.docs,lib.photos); window.piV72LastDocStats=stats; updateProgress(stats); renderChecklist(stats); renderPhotoTab(lib.photos); renderOtherFiles(stats);
  };

  window.toggleLibraryVisibility = async function(kind,id,role,value){
    if(isTenant()) return;
    const table=kind==='photo'?'property_photos':'property_documents';
    const field=role==='tenant'?'tenant_visible':'owner_visible';
    const {error}=await db.from(table).update({[field]:!!value}).eq('id',id);
    if(error) return alert('Nie udało się zmienić widoczności: '+error.message);
    await loadLibrary();
  };

  window.deleteLibraryItem = async function(kind,id,path){
    if(!(await window.piConfirmV770('Usunąć materiał?'))) return;
    const table=kind==='photo'?'property_photos':'property_documents'; const bucket=kind==='photo'?PHOTO_BUCKET:DOC_BUCKET;
    const {error}=await db.from(table).delete().eq('id',id); if(error) return alert(error.message); if(path) await db.storage.from(bucket).remove([path]);
    await loadLibrary(); await decoratePropertyTilesWithDocs();
  };
  async function decoratePropertyTilesWithDocs(){
    document.querySelectorAll('.pi-doc-tile-badge').forEach(x=>x.remove());
    if(typeof window.removePropertyDocBadges === 'function') window.removePropertyDocBadges();
    return;
  }
  window.decoratePropertyTilesWithDocs = async function(){
    document.querySelectorAll('.pi-doc-tile-badge').forEach(x=>x.remove());
    if(typeof window.removePropertyDocBadges === 'function') window.removePropertyDocBadges();
  };
  function hideTenantLibrary(){
    document.body.dataset.piRole=currentRole();
    if(isTenant()){
      document.querySelectorAll('.nav-item[onclick*="documents"], .mobile-bottom-nav button[onclick*="documents"]').forEach(x=>x.style.display='none');
      if(document.getElementById('tab-documents')?.classList.contains('active') && typeof switchTab==='function') switchTab('dashboard',document.querySelector('.nav-item'));
    }
  }
  const oldSwitch=window.switchTab; if(typeof oldSwitch==='function' && !window.__piV72SwitchHook){ window.__piV72SwitchHook=true;
 }
  const oldOpen=window.openDashboard; if(typeof oldOpen==='function' && !window.__piV72OpenHook){ window.__piV72OpenHook=true;
 }
  const oldTiles=window.loadPropertyTiles; if(typeof oldTiles==='function' && !window.__piV72TilesHook){ window.__piV72TilesHook=true;
 }
  document.addEventListener('DOMContentLoaded',()=>{ setTimeout(()=>{injectLibraryMarkup(); hideTenantLibrary(); decoratePropertyTilesWithDocs();},700); });
  window.addEventListener('load',()=>{ setTimeout(()=>{injectLibraryMarkup(); hideTenantLibrary(); decoratePropertyTilesWithDocs();},1200); });
})();
