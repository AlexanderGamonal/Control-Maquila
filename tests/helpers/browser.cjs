/* Acceso a Playwright para las pruebas de navegador.
 *   npm i -D playwright && npx playwright install chromium        (instalación normal)
 * Variables opcionales:
 *   CHROMIUM_PATH     ruta a un Chromium ya instalado (si no, usa el de Playwright)
 *   PLAYWRIGHT_PATH   carpeta de un `playwright` instalado fuera del proyecto (NODE_PATH también sirve)
 *   APP_URL           URL de la app (la fija tests/e2e/run.cjs)
 */
let pw;
try { pw = require('playwright'); }
catch (e) {
  if (!process.env.PLAYWRIGHT_PATH) throw new Error('No se encontró "playwright". Ejecuta: npm i -D playwright && npx playwright install chromium');
  pw = require(process.env.PLAYWRIGHT_PATH);
}

const launch = (opts = {}) => pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, ...opts });
const APP_URL = process.env.APP_URL || 'http://localhost:8000/index.html';

module.exports = { chromium: pw.chromium, launch, APP_URL };
