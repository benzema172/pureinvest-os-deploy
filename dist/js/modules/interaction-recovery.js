(function(){
  if(window.__PI_INTERACTION_KERNEL_1928__) return;
  window.__PI_INTERACTION_KERNEL_1928__ = true;

  const $ = id => document.getElementById(id);
  let replaying = false;

  function appVisible(){
    const app=$('appScreen');
    if(!app || app.classList.contains('hidden')) return false;
    const cs=getComputedStyle(app);
    return cs.display!=='none' && cs.visibility!=='hidden';
  }
  function authenticatedApp(){
    return document.body.classList.contains('authenticated') && appVisible();
  }
  function forceStyle(el,prop,value){
    if(!el) return;
    try{ el.style.setProperty(prop,value,'important'); }catch(_){ try{ el.style[prop]=value; }catch(__){} }
  }
  function hideElement(el){
    if(!el) return;
    try{ el.inert=true; }catch(_){ }
    forceStyle(el,'display','none');
    forceStyle(el,'visibility','hidden');
    forceStyle(el,'pointer-events','none');
  }
  function releaseElement(el){
    if(!el) return;
    try{ el.inert=false; }catch(_){ }
    forceStyle(el,'pointer-events','auto');
  }

  function hardenAuthenticatedShell(){
    if(!authenticatedApp()) return;
    const app=$('appScreen');
    hideElement($('loginScreen'));
    forceStyle(app,'pointer-events','auto');
    forceStyle(app,'visibility','visible');
    if(getComputedStyle(app).position==='static') forceStyle(app,'position','relative');
    forceStyle(app,'z-index','10');
    releaseElement(app.querySelector('.sidebar'));
    releaseElement(app.querySelector('.main'));

    const drawerOpen=(document.body.classList.contains('mobile-menu-open') || document.body.classList.contains('mobile-drawer-open')) && innerWidth<=950;
    const mobile=$('mobileOverlay');
    if(mobile && !drawerOpen) hideElement(mobile);

    document.querySelectorAll('dialog:not([open])').forEach(el=>forceStyle(el,'pointer-events','none'));
    document.querySelectorAll('.property-modal.hidden,.pi-modal-v772.hidden,.pi-modal-overlay.hidden,.pi-tx-edit-overlay.hidden,.pi-modal.hidden,[aria-hidden="true"].pi-modal-overlay').forEach(hideElement);

    app.querySelectorAll('.nav-item,.back-btn,.logout-dark,button,a,input,select,textarea,[role="button"]').forEach(el=>{
      if(el.closest('[hidden],.hidden')) return;
      forceStyle(el,'pointer-events','auto');
    });
  }

  function navTabFor(item){
    const code=String(item?.getAttribute?.('onclick')||'');
    const m=code.match(/switchTab\(\s*['"]([^'"]+)['"]/);
    if(m) return m[1];
    const text=String(item?.textContent||'').trim().toLowerCase();
    const map={
      'panel dowodzenia':'dashboard',
      'nieruchomości':'properties','nieruchomosci':'properties',
      'finanse':'transactions',
      'dostępy i najem':'access','dostepy i najem':'access',
      'zgłoszenia':'tickets','zgloszenia':'tickets',
      'biblioteka':'documents','raporty':'reports','diagnostyka':'diagnostics'
    };
    return map[text] || '';
  }

  function fallbackSwitchTab(tab,item){
    if(!tab) return false;
    document.querySelectorAll('#appScreen .tab-view').forEach(view=>{
      const on=view.id==='tab-'+tab;
      view.classList.toggle('active',on);
      view.style.display=on?'':'none';
    });
    document.querySelectorAll('#appScreen .nav-item').forEach(el=>el.classList.remove('active'));
    item?.classList.add('active');
    document.body.classList.toggle('tab-dashboard-active',tab==='dashboard');
    return true;
  }

  function runNav(item){
    const tab=navTabFor(item);
    if(!tab) return false;
    try{
      if(typeof window.switchTab==='function') window.switchTab(tab,item);
      else fallbackSwitchTab(tab,item);
    }catch(error){
      console.warn('PureInvest interaction fallback: switchTab failed.',error);
      fallbackSwitchTab(tab,item);
    }
    try{ window.closeMobileDrawer?.(); }catch(_){ }
    return true;
  }

  function runBack(){
    try{
      if(typeof window.backToWelcome==='function'){ window.backToWelcome(); return true; }
    }catch(error){ console.warn('PureInvest interaction fallback: backToWelcome failed.',error); }
    const app=$('appScreen'), welcome=$('welcomeScreen');
    app?.classList.add('hidden');
    welcome?.classList.remove('hidden');
    document.body.classList.remove('in-app');
    document.body.classList.add('authenticated','welcome-mode');
    return true;
  }

  function commandPanelFor(btn){
    const code=String(btn?.getAttribute?.('onclick')||'');
    const m=code.match(/piCommandTogglePanel\(\s*['"]([^'"]+)['"]/);
    if(m) return m[1];
    const t=String(btn?.textContent||'').trim().toLowerCase();
    if(t.includes('dodaj koszt')) return 'piDashboardCostCollapse';
    if(t.includes('ocr')) return 'piDashboardOcrCollapse';
    if(t.includes('dodaj wpłat')||t.includes('dodaj wplat')) return 'piDashboardPaymentCollapse';
    if(t.includes('ostatnie transakc')) return 'piDashboardLatestCollapse';
    if(t.includes('filtry')) return 'piDashboardFiltersCollapse';
    return '';
  }
  function fallbackToggleCommand(panelId,btn){
    if(!panelId) return false;
    const target=$(panelId);
    if(!target) return false;
    const wasOpen=target.classList.contains('active') && !target.classList.contains('hidden') && getComputedStyle(target).display!=='none';
    document.querySelectorAll('#tab-dashboard .pi-command-collapse').forEach(el=>{
      const on=el===target && !wasOpen;
      el.classList.toggle('active',on);
      el.classList.toggle('hidden',!on);
      el.style.display=on?'':'none';
    });
    document.querySelectorAll('#tab-dashboard .pi-command-admin-toggles .pi-admin-tab-btn').forEach(el=>el.classList.remove('active'));
    if(!wasOpen) btn?.classList.add('active');
    return true;
  }
  function runCommand(btn){
    const id=commandPanelFor(btn);
    if(!id) return false;
    try{
      if(typeof window.piCommandTogglePanel==='function'){
        const filter=id==='piDashboardFiltersCollapse'?'filters':undefined;
        window.piCommandTogglePanel(id,btn,filter);
        return true;
      }
    }catch(error){ console.warn('PureInvest interaction fallback: command panel failed.',error); }
    return fallbackToggleCommand(id,btn);
  }

  function actionable(el){
    if(!el || el===document.documentElement || el===document.body) return null;
    return el.closest?.('#appScreen .nav-item,#appScreen .back-btn,#appScreen .logout-dark,#appScreen button,#appScreen a,#appScreen input,#appScreen select,#appScreen textarea,#appScreen [role="button"],#welcomeScreen button,#welcomeScreen a,#welcomeScreen [role="button"],#welcomeScreen .tile') || null;
  }

  function stackActionAt(x,y){
    let stack=[];
    try{ stack=document.elementsFromPoint(x,y)||[]; }catch(_){ }
    for(const el of stack){
      const a=actionable(el);
      if(a) return {action:a,stack};
    }
    return {action:null,stack};
  }

  function staleBlocker(el,action){
    if(!el || el===action || el.contains?.(action) || action?.contains?.(el)) return false;
    if(el===document.documentElement || el===document.body || el===$('appScreen')) return false;
    if(el.closest?.('dialog[open]')) return false;
    if(el.closest?.('.property-modal:not(.hidden),.pi-modal-v772:not(.hidden),.pi-tx-edit-overlay:not(.hidden)')) return false;
    const cs=getComputedStyle(el), rect=el.getBoundingClientRect();
    const covers=rect.width*rect.height > innerWidth*innerHeight*.35;
    const positioned=['fixed','absolute','sticky'].includes(cs.position);
    const hiddenLike=el.classList.contains('hidden') || el.getAttribute('aria-hidden')==='true' || Number(cs.opacity||1)<.08 || cs.visibility==='hidden';
    return (covers && positioned) || hiddenLike || el.id==='loginScreen' || el.id==='mobileOverlay';
  }

  function neutralizeStack(stack,action){
    for(const el of stack){
      if(el===action || el.contains?.(action)) break;
      if(staleBlocker(el,action)){
        forceStyle(el,'pointer-events','none');
        el.dataset.piInteractionBlocker1928='1';
      }
    }
  }

  function routeKnown(action){
    if(!action) return false;
    if(action.matches('.nav-item')) return runNav(action);
    if(action.matches('.back-btn')) return runBack();
    if(action.matches('.pi-command-admin-toggles .pi-admin-tab-btn')) return runCommand(action);
    if(action.matches('.logout-dark')){
      try{ window.logout?.(); return true; }catch(_){ return false; }
    }
    return false;
  }

  function captureClick(event){
    if(replaying || !authenticatedApp()) return;
    hardenAuthenticatedShell();
    const direct=actionable(event.target);
    if(direct){
      if(direct.matches('.nav-item,.back-btn,.pi-command-admin-toggles .pi-admin-tab-btn,.logout-dark')){
        event.preventDefault();
        event.stopImmediatePropagation();
        routeKnown(direct);
      }
      return;
    }
    if(typeof event.clientX!=='number' || typeof event.clientY!=='number') return;
    const found=stackActionAt(event.clientX,event.clientY);
    if(!found.action) return;
    neutralizeStack(found.stack,found.action);
    event.preventDefault();
    event.stopImmediatePropagation();
    if(routeKnown(found.action)) return;
    try{
      replaying=true;
      found.action.click();
    }finally{ replaying=false; }
  }

  function auditAndHeal(){
    hardenAuthenticatedShell();
    if(!authenticatedApp()) return;
    const probes=[
      document.querySelector('#appScreen .nav-item'),
      document.querySelector('#appScreen .back-btn'),
      document.querySelector('#appScreen .pi-command-admin-toggles .pi-admin-tab-btn')
    ].filter(Boolean);
    const report=[];
    for(const action of probes){
      const r=action.getBoundingClientRect();
      if(!r.width || !r.height) continue;
      const x=r.left+r.width/2,y=r.top+r.height/2;
      const found=stackActionAt(x,y);
      const top=found.stack[0]||null;
      report.push({label:String(action.textContent||'').trim(),top:top?String(top.tagName)+'#'+(top.id||'')+'.'+String(top.className||'').replace(/\s+/g,'.'):'none',ok:!!found.action});
      if(found.action===action) neutralizeStack(found.stack,action);
    }
    window.__PI_INTERACTION_AUDIT_1928__={at:new Date().toISOString(),report};
  }

  document.addEventListener('click',captureClick,true);
  document.addEventListener('pointerdown',()=>hardenAuthenticatedShell(),true);
  document.addEventListener('DOMContentLoaded',()=>{
    hardenAuthenticatedShell();
    setTimeout(auditAndHeal,50);
    setTimeout(auditAndHeal,300);
    setTimeout(auditAndHeal,1000);
    setTimeout(auditAndHeal,2500);
  });
  window.addEventListener('pageshow',()=>setTimeout(auditAndHeal,50));
  window.addEventListener('load',()=>setTimeout(auditAndHeal,100));
  window.PIInteractionKernel1928={hardenAuthenticatedShell,auditAndHeal,runNav,runBack,runCommand,fallbackSwitchTab};
})();