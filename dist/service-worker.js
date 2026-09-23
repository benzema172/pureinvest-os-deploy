self.addEventListener('install',event=>{ event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>String(k).startsWith('pureinvest-')).map(k=>caches.delete(k)))).then(()=>self.registration.unregister()).then(()=>self.clients.claim()));
});
