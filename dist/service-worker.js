const CACHE='pureinvest-static-2026-09-24-clean-stability-v1930';
const SHELL=['/','/index.html','/app.html','/css/app.css','/js/version.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-512-maskable.png'];
self.__piCacheableAssetResponse=(request,response)=>{
  if(!response || !response.ok) return false;
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  const path=new URL(request.url).pathname.toLowerCase();
  if(path.endsWith('.js')) return !type.includes('text/html') && (type.includes('javascript') || type.includes('text/plain') || type==='');
  if(path.endsWith('.css')) return !type.includes('text/html') && (type.includes('text/css') || type.includes('text/plain') || type==='');
  return !type.includes('text/html');
};
self.addEventListener('install',event=>{ event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>null).then(()=>self.skipWaiting())); });
self.addEventListener('activate',event=>{ event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('pureinvest-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url); if(request.method!=='GET' || url.origin!==self.location.origin || url.pathname.startsWith('/.netlify/functions/')) return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{ const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(request,copy)); return response; }).catch(()=>caches.match(request).then(found=>found || caches.match('/index.html')))); return;
  }
  if(!/\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|webmanifest)$/i.test(url.pathname)) return;
  const updateCache=response=>{ if(self.__piCacheableAssetResponse(request,response)){ const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(request,copy)); } return response; };
  if(/\.(?:js|css)$/i.test(url.pathname)){
    event.respondWith(fetch(request).then(updateCache).catch(()=>caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached || fetch(request).then(updateCache)));
});
