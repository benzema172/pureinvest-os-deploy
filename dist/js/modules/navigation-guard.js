(function(){
  if(window.__PI_NAVIGATION_GUARD_1727__) return;
  window.__PI_NAVIGATION_GUARD_1727__ = true;

  const TAB_MAP = {
    dashboard: 'tab-dashboard',
    portfolio: 'tab-portfolio',
    properties: 'tab-properties',
    'fee-breakdowns': 'tab-fee-breakdowns',
    transactions: 'tab-transactions',
    finance: 'tab-transactions',
    documents: 'tab-documents',
    reports: 'tab-reports',
    diagnostics: 'tab-diagnostics',
    access: 'tab-access',
    tenants: 'tab-access'
  };

  function normalize(tab){
    if(tab === 'finance') return 'transactions';
    if(tab === 'tenants') return 'access';
    return tab || 'dashboard';
  }

  function navFor(tab){
    const normalized = normalize(tab);
    const q = normalized === 'transactions' ? 'transactions' : normalized;
    return Array.from(document.querySelectorAll('.nav-item')).find(item => String(item.getAttribute('onclick') || '').includes(q)) || null;
  }

  function enforce(tab, navEl){
    const normalized = normalize(tab);
    const targetId = TAB_MAP[normalized] || ('tab-' + normalized);
    document.querySelectorAll('.tab-view').forEach(view => {
      const isActive = view.id === targetId;
      view.classList.toggle('active', isActive);
      view.style.display = isActive ? '' : 'none';
    });
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const nav = navEl || navFor(normalized);
    if(nav) nav.classList.add('active');
    document.body.classList.toggle('tab-dashboard-active', normalized === 'dashboard');
    if(normalized !== 'dashboard'){
      const dash = document.getElementById('tab-dashboard');
      if(dash){
        dash.classList.remove('active');
        dash.style.display = 'none';
      }
      document.querySelectorAll('.dashboard-only,#commandAlerts,#tab-dashboard .pi-command-collapse').forEach(el => { el.style.display = 'none'; });
    } else {
      document.querySelectorAll('.dashboard-only').forEach(el => { el.style.display = ''; });
    }
  }

  window.piForceSingleTab = enforce;

  const originalSwitch = window.switchTab;
  if(typeof originalSwitch === 'function' && !originalSwitch.__piNavGuard1727){
    const guarded = function(tab, navEl){
      const normalized = normalize(tab);
      const realNav = navEl || navFor(normalized);
      const out = originalSwitch.call(this, normalized, realNav);
      enforce(normalized, realNav);
      setTimeout(()=>enforce(normalized, realNav), 40);
      setTimeout(()=>enforce(normalized, realNav), 180);
      setTimeout(()=>enforce(normalized, realNav), 380);
      return out;
    };
    guarded.__piNavGuard1727 = true;
    window.switchTab = guarded;
  }

  const originalOpenDashboard = window.openDashboard;
  if(typeof originalOpenDashboard === 'function' && !originalOpenDashboard.__piNavGuard1727){
    const guardedOpen = async function(){
      const out = await originalOpenDashboard.apply(this, arguments);
      enforce('dashboard', navFor('dashboard'));
      return out;
    };
    guardedOpen.__piNavGuard1727 = true;
    window.openDashboard = guardedOpen;
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const active = document.querySelector('.tab-view.active');
    if(active) enforce(active.id.replace(/^tab-/,''));
  });
})();
