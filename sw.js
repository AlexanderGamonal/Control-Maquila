/* Service Worker · Control de Maquila
 * - Navegación (HTML): red primero, con revalidación real y caché como respaldo offline.
 *   Así cada despliegue se ve en la siguiente carga con conexión (antes: hasta la 2ª recarga).
 * - Recursos estáticos propios (fuente, íconos, manifest): caché primero + actualización en segundo plano.
 * - Google Sheets (script.google.com) y cualquier petición que no sea GET: nunca se interceptan.
 *
 * Sube VERSION en cada despliegue que cambie la lista PRECACHE (el HTML se actualiza solo).
 */
const VERSION = 'v3';
const CACHE = `maquila-${VERSION}`;
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './fonts/inter-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache:'reload' evita precachear una copia vieja guardada por la caché HTTP del navegador
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('maquila-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
}

async function networkFirstNavigation(event) {
  const cache = await caches.open(CACHE);
  const network = fetch(event.request, { cache: 'no-cache' }).then(res => {
    if (res && res.ok) cache.put('./index.html', res.clone());
    return res;
  });
  try {
    return await Promise.race([network, timeout(NAV_TIMEOUT_MS)]);
  } catch (_) {
    // Sin red o red lenta: sirve la copia guardada, pero deja que la descarga termine y
    // actualice la caché para que la siguiente carga ya traiga la versión nueva.
    event.waitUntil(network.catch(() => {}));
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const refresh = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || refresh;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Sheets, Google, etc.: directo a la red

  if (req.mode === 'navigate') {
    e.respondWith(networkFirstNavigation(e));
    return;
  }
  e.respondWith(staleWhileRevalidate(req));
});
