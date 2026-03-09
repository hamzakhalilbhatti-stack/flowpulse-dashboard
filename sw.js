// FlowPulse Service Worker
// Caches the app shell for offline use

const CACHE = 'flowpulse-v1';

const SHELL = [
  './app.html',
  './status.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// Install — cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      // Cache what we can, ignore failures (CDN etc.)
      return Promise.allSettled(SHELL.map(url => c.add(url).catch(() => {})));
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - App shell (HTML/JS/CSS/fonts) → Cache First
// - API calls (Worker /executions, Supabase) → Network First
// - Everything else → Network with cache fallback
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET
  if (e.request.method !== 'GET') return;

  // API calls — always try network first
  const isAPI = url.hostname.includes('workers.dev') ||
                url.hostname.includes('supabase.co');

  if (isAPI) {
    e.respondWith(
      fetch(e.request)
        .catch(() => new Response(
          JSON.stringify({ error: 'offline', executions: [], offline: true }),
          { headers: { 'Content-Type': 'application/json' } }
        ))
    );
    return;
  }

  // App shell — cache first, then network
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
      return cached || networkFetch;
    })
  );
});

// Background sync — when back online, tell clients
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
