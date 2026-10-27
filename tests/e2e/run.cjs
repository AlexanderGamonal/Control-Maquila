#!/usr/bin/env node
/* Ejecuta todas las suites de navegador contra un servidor estático propio (puerto libre).
 *   npm run test:e2e                      todas
 *   node tests/e2e/run.cjs form sync      solo las que contengan esos nombres
 * Requiere Playwright (ver tests/helpers/browser.cjs). */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('../helpers/server.cjs');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const filtros = process.argv.slice(2);
  const suites = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.cjs') && (!filtros.length || filtros.some(x => f.includes(x)))).sort();
  const srv = await startServer(root);
  const env = { ...process.env, APP_URL: `${srv.url}/index.html` };
  const resultados = [];
  for (const s of suites) {
    console.log(`\n━━━ ${s} ━━━`);
    // spawn ASÍNCRONO: este proceso también sirve la app; un spawnSync bloquearía el servidor y el navegador esperaría para siempre
    const code = await new Promise(res => spawn('node', [path.join(__dirname, s)], { env, stdio: 'inherit' }).on('exit', c => res(c)));
    resultados.push([s, code === 0]);
  }
  await srv.close();
  console.log('\n━━━ Resumen ━━━');
  resultados.forEach(([s, ok]) => console.log(`${ok ? '✓' : '✗'} ${s}`));
  process.exit(resultados.every(([, ok]) => ok) && resultados.length ? 0 : 1);
})();
