(function(){
  function isVisible(node){
    return !!node && !node.classList.contains("hidden");
  }

  window.piMobileLoginSafeGuard = function(){
    const login = document.getElementById("loginScreen");
    const welcome = document.getElementById("welcomeScreen");
    const app = document.getElementById("appScreen");
    const tenant = document.getElementById("tenantPortalScreen");
    const authed = document.body.classList.contains("authenticated");
    const tenantMode = document.body.classList.contains("tenant-mode") || isVisible(tenant);

    if(authed || tenantMode || isVisible(welcome) || isVisible(app)){
      document.body.classList.add("authenticated");
      if(login){
        login.classList.add("hidden");
        login.style.display = "none";
        login.style.visibility = "hidden";
        login.style.pointerEvents = "none";
      }
      return;
    }

    if(login && !tenantMode && !isVisible(welcome) && !isVisible(app)){
      login.style.display = "";
      login.style.visibility = "";
      login.style.pointerEvents = "";
      login.classList.remove("hidden");
    }
  };

  const originalOpenDashboard514 = window.openDashboard;
  if(typeof originalOpenDashboard514 === "function"){

  }

  const originalBackToWelcome514 = window.backToWelcome;
  if(typeof originalBackToWelcome514 === "function"){

  }

  document.addEventListener("DOMContentLoaded", function(){
    setTimeout(window.piMobileLoginSafeGuard, 300);
    setTimeout(window.piMobileLoginSafeGuard, 1200);
  });

  window.addEventListener("pageshow", function(){
    setTimeout(window.piMobileLoginSafeGuard, 0);
  });
})();
