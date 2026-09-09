'use strict';

const CACHE_PREFIX = 'success-rate-calc-';
const CACHE_NAME = `${CACHE_PREFIX}v19`;
const APP_ROOT = new URL('./', self.location.href);
const INDEX_URL = new URL('./index.html', self.location.href).href;
const APP_SHELL = [
  INDEX_URL,
  new URL('./app.js', self.location.href).href,
  new URL('./install.js', self.location.href).href,
  new URL('./manifest.json', self.location.href).href,
  new URL('./icon-180.png', self.location.href).href,
  new URL('./icon-192.png', self.location.href).href,
  new URL('./icon-512.png', self.location.href).href,
];
const STATIC_URLS = new Set(APP_SHELL);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

function isAppNavigation(request, url) {
  if (request.mode !== 'navigate') return false;
  return url.pathname === APP_ROOT.pathname || url.href.split(/[?#]/)[0] === INDEX_URL;
}

function offlineResponse() {
  return new Response(
    '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>オフライン</title><body><h1>オフラインです</h1><p>一度オンラインでアプリを開いてから、もう一度お試しください。</p></body></html>',
    {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

async function networkFirst(event, cacheKey, navigation = false) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic') {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    if (navigation) {
      const appShell = await cache.match(INDEX_URL);
      if (appShell) return appShell;
      return offlineResponse();
    }
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isAppNavigation(event.request, url)) {
    event.respondWith(networkFirst(event, INDEX_URL, true));
    return;
  }

  const canonicalUrl = url.href.split(/[?#]/)[0];
  if (!STATIC_URLS.has(canonicalUrl)) return;
  event.respondWith(networkFirst(event, canonicalUrl));
});
