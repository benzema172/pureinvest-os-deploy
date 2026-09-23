(function(){
  if(window.__PI_ACCESS_SECURITY_190__) return;
  window.__PI_ACCESS_SECURITY_190__=true;
  async function headers(){
    const result={'Content-Type':'application/json'};
    try{ const session=await (window.db || window.piDb)?.auth?.getSession?.(); const token=session?.data?.session?.access_token; if(token) result.Authorization='Bearer '+token; }catch(_){ }
    return result;
  }
  async function call(body){
    const response=await fetch('/.netlify/functions/access-pin',{method:'POST',headers:await headers(),body:JSON.stringify(body || {})});
    const data=await response.json().catch(()=>null);
    if(!response.ok || !data?.ok) throw new Error(data?.message || 'Nie udało się zapisać dostępu.');
    return data;
  }
  window.piSecureAccessSave=async function(payload,id){
    const body={...payload,action:'upsert',id:id || payload?.id || null,pin:payload?.pin || payload?.access_pin || ''};
    delete body.access_pin; delete body.access_pin_hash;
    return call(body);
  };
  window.piSecureAccessRevoke=id=>call({action:'revoke',id});
})();
