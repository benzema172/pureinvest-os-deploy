(function(){
  if(window.__PI_FINAL_QA_UI__) return;
  window.__PI_FINAL_QA_UI__ = true;

  const nativeAlert = window.alert ? window.alert.bind(window) : null;
  const nativeConfirm = window.confirm ? window.confirm.bind(window) : null;
  const nativePrompt = window.prompt ? window.prompt.bind(window) : null;

  window.piNotify = window.piNotify || function(message, type){
    if(typeof window.piToastV761 === 'function') window.piToastV761(String(message || ''), type || 'info');
    else if(typeof window.piToastV760 === 'function') window.piToastV760(String(message || ''), type || 'info');
    else if(nativeAlert) nativeAlert(String(message || ''));
  };

  window.piConfirmV770 = async function(message, opts){
    if(typeof window.piConfirmModalV773 === 'function') return window.piConfirmModalV773(message, opts || {});
    if(typeof window.piConfirmModalV772 === 'function') return window.piConfirmModalV772(message, opts || {});
    return nativeConfirm ? nativeConfirm(String(message || '')) : false;
  };

  window.piPromptV770 = async function(message, opts){
    if(typeof window.piPromptModalV773 === 'function') return window.piPromptModalV773(message, opts || {});
    return nativePrompt ? nativePrompt(String(message || ''), String(opts?.value || '')) : null;
  };

  window.alert = function(message){
    window.piNotify(message, 'info');
  };
})();
