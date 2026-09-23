window.toggleMobileDrawer = function(){
  document.body.classList.toggle("mobile-drawer-open");
};

window.closeMobileDrawer = function(){
  document.body.classList.remove("mobile-drawer-open");
};

window.openQuickActionsView = function(){
  switchTab('dashboard', document.querySelector('.nav-item[onclick*=dashboard]'));

  setTimeout(function(){
    var target = document.querySelector('#tab-dashboard > .dashboard-triple-actions');

    if(target){
      target.scrollIntoView({
        behavior:'smooth',
        block:'start'
      });
    }
  }, 120);
};

document.addEventListener("DOMContentLoaded", function(){

  document.querySelectorAll(".sidebar .nav-item").forEach(function(item){
    item.addEventListener("click", function(){
      window.closeMobileDrawer();
    });
  });

});
