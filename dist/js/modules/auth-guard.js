(function(){
  function isVisible(el){
    return !!(el && !el.classList.contains("hidden") && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden");
  }

  function shouldHideAssistant(){
    const login = document.getElementById("loginScreen");
    const welcome = document.getElementById("welcomeScreen");
    const isAuthenticated = document.body.classList.contains("authenticated");
    const loginVisible = isVisible(login);
    const welcomeVisible = isVisible(welcome) || document.body.classList.contains("welcome-mode");
    return !isAuthenticated || loginVisible || welcomeVisible;
  }

  window.piSyncParobekAuthVisibility = function(){
    const assistant = document.getElementById("wiktorekAssistant");
    if(!assistant) return;

    if(shouldHideAssistant()){
      assistant.classList.remove("open");
      assistant.style.display = "none";
      assistant.style.visibility = "hidden";
      assistant.style.pointerEvents = "none";
      return;
    }

    assistant.style.display = "";
    assistant.style.visibility = "";
    assistant.style.pointerEvents = "";
  };

  const originalToggleWiktorekAssistant = window.toggleWiktorekAssistant;
  if(typeof originalToggleWiktorekAssistant === "function"){
    window.toggleWiktorekAssistant = function(force){
      if(shouldHideAssistant()){
        window.piSyncParobekAuthVisibility();
        return;
      }
      return originalToggleWiktorekAssistant.apply(this, arguments);
    };
  }

  const sync = ()=> window.piSyncParobekAuthVisibility();
  document.addEventListener("DOMContentLoaded", function(){
    sync();
    setTimeout(sync, 300);
    setTimeout(sync, 1200);
  });
  window.addEventListener("load", sync);
})();
