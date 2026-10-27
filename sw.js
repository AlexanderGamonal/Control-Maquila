/* Service Worker · Control de Maquila
 * - Código de la app (HTML, css/ y js/): red primero, con revalidación real y caché como respaldo offline.
 *   Así cada despliegue se ve en la siguiente carga con conexión y el HTML, los estilos y los módulos
 *   siempre son de la misma versión (si el JS viniera de caché con un HTML nuevo, podrían no coincidir).
 * - Recursos estáticos propios (fuente, íconos, manifest): caché primero + actualización en segundo plano.
 * - Google Sheets (script.google.com) y cualquier petición que no sea GET: nunca se interceptan.
 *
 * Sube VERSION en cada despliegue que cambie la lista PRECACHE (el HTML se actualiza solo).
 */
const VERSION = 'v4';
const CACHE = `maquila-${VERSION}`;
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/fonts.css',
  './css/tokens.css',
  './css/base.css',
  './css/header.css',
  './css/kpi.css',
  './css/main.css',
  './css/cards.css',
  './css/table.css',
  './css/fab-toast.css',
  './css/dialogs.css',
  './css/forms.css',
  './css/a11y.css',
  './js/app.js',
  './js/actions.js',
  './js/config-dialog.js',
  './js/config.js',
  './js/controls.js',
  './js/form.js',
  './js/list-events.js',
  './js/model.js',
  './js/render.js',
  './js/state.js',
  './js/status.js',
  './js/sync.js',
  './js/theme.js',
  './js/toast.js',
  './js/utils.js',
  './fonts/inter-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];
const NAV_TIMEOUT_MS = 4000;
const BASE = new URL('./', self.location).pathname;               // carpeta donde vive la app
const isAppCode = url => url.pathname.startsWith(BASE + 'css/') || url.pathname.startsWith(BASE + 'js/');

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

async function networkFirst(event, cacheKey) {
  const cache = await caches.open(CACHE);
  const network = fetch(event.request, { cache: 'no-cache' }).then(res => {
    if (res && res.ok) cache.put(cacheKey, res.clone());
    return res;
  });
  try {
    return await Promise.race([network, timeout(NAV_TIMEOUT_MS)]);
  } catch (_) {
    // Sin red o red lenta: sirve la copia guardada, pero deja que la descarga termine y
    // actualice la caché para que la siguiente carga ya traiga la versión nueva.
    event.waitUntil(network.catch(() => {}));
    // ignoreSearch: el CSS lleva ?v=hash en el HTML, pero el precaché lo guarda sin él
    return (await cache.match(cacheKey, { ignoreSearch: true }))
      || (cacheKey === './index.html' && await cache.match('./'))
      || Response.error();
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
    e.respondWith(networkFirst(e, './index.html'));
    return;
  }
  if (isAppCode(url)) {
    e.respondWith(networkFirst(e, req));
    return;
  }
  e.respondWith(staleWhileRevalidate(req));
});
