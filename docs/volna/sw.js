/* Волна — service worker: оффлайн-режим и установка на устройство */

const CACHE = 'volna-v11';
const ASSETS = [
  './',
  './index.html',
  './diary.html',
  './styles.css',
  './app.js',
  './diary.js',
  './data.js',
  './crypto.js',
  './pwa.js',
  './icon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (new URL(c.url).pathname.endsWith('/index.html') || new URL(c.url).pathname.endsWith('/')) {
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // шрифты и прочее — мимо кэша

  // network-first: свежий код, когда сеть есть; кэш — только офлайн.
  // Иначе после обновления файлов браузер отдаёт старый JS до второй перезагрузки.
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      caches.match(req, { ignoreSearch: true })
        .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
    )
  );
});
