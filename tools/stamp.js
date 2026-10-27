#!/usr/bin/env node
/* Sella las hojas de estilo de index.html con un hash de su contenido: css/base.css?v=1a2b3c4d
 *
 * Por qué: Chromium sirve las hojas de estilo desde su caché en memoria al recargar una pestaña que
 * sigue abierta, sin consultar al service worker ni a la red. Como esa caché usa la URL como clave,
 * basta con que la URL cambie cuando cambia el contenido para que se descargue la versión nueva.
 *
 * Uso:   node tools/stamp.js            → actualiza los sellos de index.html
 *        node tools/stamp.js --check    → solo comprueba; sale con código 1 si hay alguno desactualizado
 *        node tools/stamp.js <carpeta>  → trabaja sobre otra carpeta (pruebas)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const check = args.includes('--check');
const root = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const htmlPath = path.join(root, 'index.html');

const hash = file => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8);

const html = fs.readFileSync(htmlPath, 'utf8');
const stale = [];
const out = html.replace(/(<link rel="stylesheet" href=")(css\/[^"?]+\.css)(?:\?v=[0-9a-f]+)?(")/g, (m, a, href, z) => {
  const want = `${href}?v=${hash(path.join(root, href))}`;
  if (m !== `${a}${want}${z}`) stale.push(href);
  return `${a}${want}${z}`;
});

if (check) {
  if (stale.length) { console.error('Sellos de CSS desactualizados: ' + stale.join(', ') + '\nEjecuta: node tools/stamp.js'); process.exit(1); }
  console.log('Sellos de CSS al día.');
} else if (stale.length) {
  fs.writeFileSync(htmlPath, out);
  console.log('Sellos actualizados: ' + stale.join(', '));
} else {
  console.log('Sin cambios: los sellos ya estaban al día.');
}
