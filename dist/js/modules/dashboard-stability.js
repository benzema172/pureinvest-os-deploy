(function(){
  if(window.__PI_DASHBOARD_STABILITY_FIX__) return;
  window.__PI_DASHBOARD_STABILITY_FIX__ = true;

  function $(id){ return document.getElementById(id); }
  function currentActiveTab(){
    const active = document.querySelector('.tab-view.active');
    return active ? active.id : '';
  }
  function markApp(){
    document.body.classList.add('authenticated','in-app');
    document.body.classList.toggle('tab-dashboard-active', currentActiveTab() === 'tab-dashboard');
    $('welcomeScreen')?.classList.add('hidden');
    $('appScreen')?.classList.remove('hidden');
  }
  function ensureDashboardPanel(){
    const tab = $('tab-dashboard');
    if(!tab) return;
    if(currentActiveTab() && currentActiveTab() !== 'tab-dashboard') return;
    tab.classList.add('active');
    markApp();

    const toggles = tab.querySelector('.pi-command-admin-toggles');
    if(toggles){
      toggles.style.display = toggles.style.display || 'flex';
      toggles.style.flexWrap = 'wrap';
      toggles.style.gap = '10px';
    }

    const hasOpen = !!tab.querySelector('.pi-command-collapse.active:not(.hidden)');
    if(!hasOpen){
      const first = $('piDashboardLatestCollapse') || tab.querySelector('.pi-command-collapse');
      if(first){
        first.classList.add('active');
        first.classList.remove('hidden');
        first.style.display = '';
        const btn = tab.querySelector('.pi-command-admin-toggles [onclick*="piDashboardLatestCollapse"]');
        btn?.classList.add('active');
      }
    }

    ['transactionsDashboard'].forEach(id=>{
      const el=$(id); if(el) el.closest('.hidden')?.classList.remove('hidden');
    });
  }

  function repairIfBlank(){
    const app=$('appScreen'), tab=$('tab-dashboard');
    if(!app || app.classList.contains('hidden') || !tab) return;
    if(currentActiveTab() && currentActiveTab() !== 'tab-dashboard') return;
    const hasTitle = !!(($('dashboardTitle')?.textContent || '').trim());
    const visibleBits = [
      '.quickbar.dashboard-only',
      '#tab-dashboard .pi-command-admin-toggles',
      '#tab-dashboard #transactionsDashboard'
    ].some(sel=>{
      const el=document.querySelector(sel);
      if(!el) return false;
      const st=getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && el.getBoundingClientRect().height > 1;
    });
    if(hasTitle && !visibleBits) ensureDashboardPanel();
  }

  const oldOpen = window.openDashboard;
  if(typeof oldOpen === 'function' && !oldOpen.__piStableDashboard){
    window.openDashboard = async function(){
      const out = await oldOpen.apply(this, arguments);
      setTimeout(ensureDashboardPanel, 30);
      setTimeout(repairIfBlank, 260);
      return out;
    };
    window.openDashboard.__piStableDashboard = true;
  }

  const oldSwitch = window.switchTab;
  if(typeof oldSwitch === 'function' && !oldSwitch.__piStableDashboard){
    window.switchTab = function(tab, navEl){
      const out = oldSwitch.apply(this, arguments);
      if(tab === 'dashboard') setTimeout(ensureDashboardPanel, 20);
      return out;
    };
    window.switchTab.__piStableDashboard = true;
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(repairIfBlank,800));
  window.addEventListener('load',()=>setTimeout(repairIfBlank,1200));
})();
