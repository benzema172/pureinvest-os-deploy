window.pureInvestSelfCheck = function(){
  const checks = {
    loginScreen: !!document.getElementById("loginScreen"),
    welcomeScreen: !!document.getElementById("welcomeScreen"),
    appScreen: !!document.getElementById("appScreen"),
    propertyTiles: !!document.getElementById("propertyTiles"),
    addPropertyModal: !!document.getElementById("addPropertyModal"),
    mobileBottomNav: !!document.getElementById("mobileBottomNav"),
    supabaseClient: typeof db !== "undefined",
    openDashboard: typeof openDashboard === "function",
    loadPropertyTiles: typeof loadPropertyTiles === "function",
    runInvoiceOCRPro: typeof runInvoiceOCRPro === "function"
  };

  console.table(checks);
  return checks;
};
