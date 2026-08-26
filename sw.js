const CACHE='presupuesto-online-v9';
const ASSETS=['/','/index.html','/assets/simple.css','/assets/amount-calculator.css','/src/bootstrap.js','/src/cloud.js','/src/notifications.js','/src/simple.js','/src/amount-calculator.js','/src/import-fix.js','/src/store.js','/src/dates.js','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(Promise.all([self.skipWaiting(),caches.open(CACHE).then(c=>c.addAll(ASSETS))])));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
]));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/index.html'))));
});
