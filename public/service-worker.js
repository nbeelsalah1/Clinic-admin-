const CACHE='ayadati-icons-v1';
const ASSETS=['/app-icon-192.png','/app-icon-512.png','/favicon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ayadati-icons-')&&k!==CACHE).map(k=>caches.delete(k))))));
// Patient data, HTML, authentication and API responses are never cached here.
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method==='GET'&&url.origin===self.location.origin&&ASSETS.includes(url.pathname))event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request)));});
