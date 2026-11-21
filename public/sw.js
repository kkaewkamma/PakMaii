'use strict';

const CACHE_NAME = 'pakmaii-app-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.css',
  '/app.js',
  '/demo.js',
  '/icon.svg',
  '/manifest.webmanifest',
  '/fonts/IBMPlexSansThai-400-thai.woff2',
  '/fonts/IBMPlexSansThai-500-thai.woff2',
  '/fonts/IBMPlexSansThai-600-thai.woff2',
  '/js/core/api.js',
  '/js/core/auth.js',
  '/js/core/deep-link.js',
  '/js/core/dom.js',
  '/js/core/graphics.js',
  '/js/core/icons.js',
  '/js/core/offline-store.js',
  '/js/core/photo.js',
  '/js/core/rhythm.js',
  '/js/core/state.js',
  '/js/views/admin.js',
  '/js/views/farmer.js',
  '/js/views/ics.js',
  '/js/views/passport.js',
  '/js/views/pitchGuide.js',
  '/js/views/tutorial.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA: Failed to cache some static assets during install', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Mutating requests or external endpoints: pass through without caching
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // 2. API requests: network-only (offline queue handled by client indexedDB)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 3. HTML Navigation requests: Network-first, fallback to cached index.html
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/index.html') || caches.match('/');
        })
    );
    return;
  }

  // 4. Static assets (CSS, JS, Fonts, Images): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
