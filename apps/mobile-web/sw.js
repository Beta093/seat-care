// No sensor processing here: Web Bluetooth cannot run inside a service worker.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const pages=await self.clients.matchAll({type:'window'});const page=pages.find(p=>new URL(p.url).origin===self.location.origin);if(page){await page.focus();await page.navigate('/#status');}else await self.clients.openWindow('/#status');})());});
