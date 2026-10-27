/* Servidor estático de pruebas. Imita a GitHub Pages: Cache-Control: max-age=600 (salvo sw.js),
 * lo que permite comprobar que cada despliegue se ve en la primera recarga.
 *   const srv = await startServer(carpeta);   srv.url   srv.setDelay(ms)   await srv.close()
 * setDelay retrasa SOLO el index.html (simula una red lenta). */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

function startServer(root, port = 0) {
  root = path.resolve(root);
  const state = { delay: 0 };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__delay') { state.delay = Number(u.searchParams.get('ms')) || 0; return res.end('ok'); }
    const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('no encontrado'); }
    const send = () => {
      res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream');
      res.setHeader('cache-control', p === '/sw.js' ? 'no-cache' : 'public, max-age=600');
      res.end(fs.readFileSync(f));
    };
    if (p === '/index.html' && state.delay) setTimeout(send, state.delay); else send();
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => {
    const { port: actual } = server.address();
    resolve({
      url: `http://localhost:${actual}`,
      port: actual,
      setDelay: ms => { state.delay = ms; },
      close: () => new Promise(r => server.close(r)),
    });
  }));
}

module.exports = { startServer };
