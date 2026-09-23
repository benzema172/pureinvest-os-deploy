(function(){
  function ensureAccessTabs(){
    const root=document.getElementById('tab-access');
    if(!root) return;
    const tabs=root.querySelectorAll('.pi-admin-subtab');
    if(!tabs.length) return;
    const active=root.querySelector('.pi-admin-subtab.active');
    if(!active){
      const users=document.getElementById('piAdminSubtab-users');
      if(users) users.classList.add('active');
      const first=root.querySelector('.pi-admin-tab-btn');
      if(first) first.classList.add('active');
    }
  }
  window.addEventListener('load',()=>setTimeout(ensureAccessTabs,200));
  document.addEventListener('click',(e)=>{
    const btn=e.target.closest && e.target.closest('#tab-access .pi-admin-tab-btn');
    if(btn) setTimeout(ensureAccessTabs,30);
  });
})();
