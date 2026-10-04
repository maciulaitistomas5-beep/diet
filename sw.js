// Keeps the app's own files so it opens offline. Everything else (Open Food Facts) goes straight to the network.
// Bump VERSION whenever any file below changes, so phones fetch the new copies.
const VERSION = 'diet-v1';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/burn.js',
  'js/charts.js',
  'js/components.js',
  'js/demo.js',
  'js/dom.js',
  'js/engine.js',
  'js/food.js',
  'js/format.js',
  'js/off.js',
  'js/progress.js',
  'js/settings.js',
  'js/setup.js',
  'js/sheets.js',
  'js/store.js',
  'js/strings.js',
  'js/today.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    }),
  );
});
