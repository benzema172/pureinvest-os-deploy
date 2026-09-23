function setPureInvestScreenMode(mode){
  document.body.classList.remove("welcome-mode","in-app");
  if(mode === "app"){
    document.body.classList.add("in-app");
  }else{
    document.body.classList.add("welcome-mode");
  }
}

(function(){
  const originalShowWelcome = window.showWelcome;
  if(typeof originalShowWelcome === "function"){

  }

  const originalBackToWelcome = window.backToWelcome;
  if(typeof originalBackToWelcome === "function"){

  }

  const originalOpenDashboard = window.openDashboard;
  if(typeof originalOpenDashboard === "function"){

  }

  const originalLogout = window.logout;
  if(typeof originalLogout === "function"){

  }

  document.addEventListener("DOMContentLoaded", function(){
    const app = document.getElementById("appScreen");
    const welcome = document.getElementById("welcomeScreen");

    if(app && !app.classList.contains("hidden")){
      setPureInvestScreenMode("app");
    }else{
      setPureInvestScreenMode("welcome");
    }
  });
})();
