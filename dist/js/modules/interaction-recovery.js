(function(){
  if(window.__PI_INTERACTION_RECOVERY_1926__) return;
  window.__PI_INTERACTION_RECOVERY_1926__ = true;

  const BUILD = window.PI_RELEASE?.build || '2026-09-23-auth-runtime-stability-v1927';
  const $ = id => document.getElementById(id);

  function isAppVisible(){
    const app=$('appScreen');
    if(!app || app.classList.contains('hidden')) return false;
    const cs=getComputedStyle(app);
    return cs.display!=='none' && cs.visibility!=='hidden';
  }

  function releaseStaleLayers(){
    if(!document.body.classList.contains('authenticated') || !isAppVisible()) return;
    document.documentElement.style.pointerEvents='auto';
    document.body.style.pointerEvents='auto';
    const app=$('appScreen');
    if(app){ app.style.pointerEvents='auto'; app.style.visibility='visible'; }
    app?.querySelector('.sidebar')?.style.setProperty('pointer-events','auto');
    app?.querySelector('.main')?.style.setProperty('pointer-events','auto');

    const login=$('loginScreen');
    if(login){
      login.classList.add('hidden');
      login.style.display='none';
      login.style.visibility='hidden';
      login.style.pointerEvents='none';
    }

    const mobile=$('mobileOverlay');
    const drawerOpen=(document.body.classList.contains('mobile-menu-open') || document.body.classList.contains('mobile-drawer-open')) && innerWidth<=950;
    if(mobile && !drawerOpen){ mobile.style.display='none'; mobile.style.pointerEvents='none'; }

    ['addPropertyModal','piPropertyDialog','piTransactionEditModal','piModalV772'].forEach(id=>{
      const el=$(id); if(!el) return;
      if(el.classList.contains('hidden')){ el.style.display='none'; el.style.pointerEvents='none'; }
    });
  }

  function bindCriticalControls(){
    document.querySelectorAll('#appScreen .nav-item[onclick]').forEach(item=>{
      if(item.dataset.piInteraction1926==='1') return;
      const code=String(item.getAttribute('onclick')||'');
      const match=code.match(/switchTab\(['\"]([^'\"]+)['\"]/);
      if(!match) return;
      const tab=match[1];
      item.removeAttribute('onclick');
      item.dataset.piInteraction1926='1';
      item.addEventListener('click',()=>{
        releaseStaleLayers();
        if(typeof window.switchTab==='function') window.switchTab(tab,item);
        if(typeof window.closeMobileDrawer==='function') window.closeMobileDrawer();
      });
    });

    document.querySelectorAll('#appScreen .back-btn[onclick]').forEach(btn=>{
      if(btn.dataset.piInteraction1926==='1') return;
      btn.removeAttribute('onclick'); btn.dataset.piInteraction1926='1';
      btn.addEventListener('click',()=>{ releaseStaleLayers(); window.backToWelcome?.(); });
    });

    document.querySelectorAll('#appScreen .logout-dark[onclick]').forEach(btn=>{
      if(btn.dataset.piInteraction1926==='1') return;
      btn.removeAttribute('onclick'); btn.dataset.piInteraction1926='1';
      btn.addEventListener('click',()=>window.logout?.());
    });

    document.querySelectorAll('#appScreen .pi-command-admin-toggles .pi-admin-tab-btn[onclick]').forEach(btn=>{
      if(btn.dataset.piInteraction1926==='1') return;
      const code=String(btn.getAttribute('onclick')||'');
      const match=code.match(/piCommandTogglePanel\(['\"]([^'\"]+)['\"]/);
      if(!match) return;
      const panelId=match[1];
      const filter=/['\"]filters['\"]/.test(code)?'filters':undefined;
      btn.removeAttribute('onclick'); btn.dataset.piInteraction1926='1';
      btn.addEventListener('click',()=>{
        releaseStaleLayers();
        if(typeof window.piCommandTogglePanel==='function') window.piCommandTogglePanel(panelId,btn,filter);
      });
    });
  }

  function requiredRuntimeReady(){
    return typeof window.switchTab==='function' && typeof window.backToWelcome==='function' && typeof window.piCommandTogglePanel==='function';
  }

  function recover(){
    releaseStaleLayers();
    bindCriticalControls();
    if(!requiredRuntimeReady()) console.warn('PureInvest: krytyczne kontrolery interfejsu nie są jeszcze gotowe.');
  }

  document.addEventListener('DOMContentLoaded',()=>{
    recover();
    setTimeout(recover,250);
    setTimeout(recover,900);
  });
  window.addEventListener('pageshow',()=>setTimeout(recover,80));
  window.addEventListener('load',()=>setTimeout(recover,100));
  document.addEventListener('click',()=>releaseStaleLayers(),true);
  window.piInteractionRecovery1927={recover,releaseStaleLayers,bindCriticalControls,requiredRuntimeReady};
})();
