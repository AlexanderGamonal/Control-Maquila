/* Diseño y robustez de la interfaz: los 7 problemas corregidos en la revisión inicial, con aserciones. */
const assert = require('assert');
const { launch, APP_URL } = require('../helpers/browser.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = 0;
const t = async (n, f) => { try { await f(); console.log('✓', n); ok++; } catch (e) { console.log('✗', n, '\n     →', e.message.split('\n')[0]); process.exitCode = 1; } };

const d = o => { const x = new Date(); x.setDate(x.getDate() + o); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const seed = Array.from({ length: 8 }, (_, i) => ({ id: 'x' + i, marca: i === 1 ? 'Supermercados La Canasta del Norte S.A.C.' : 'Cliente ' + i, cantidad: 1000 + i, peso: 900, formula: 'Amore',
  fechaPedido: d(-3), fechaEntrega: d(5 + i), ampliacionDigesa: '', arteAprobado: '', pedidoSistema: '', estadoManual: i === 7 ? 'Entregado' : '', observaciones: '', updatedAt: i + 1, deleted: false }));

(async () => {
  const b = await launch();
  const mk = async (vp, mobile, theme = 'dark', init) => {
    const c = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, colorScheme: theme, serviceWorkers: 'block' });
    const p = await c.newPage(); p.errs = []; p.reqs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => p.reqs.push(r.url()));
    if (init) await p.addInitScript(init);
    await p.addInitScript(s => { try { if (!localStorage.getItem('maquila_pedidos_v2')) localStorage.setItem('maquila_pedidos_v2', JSON.stringify(s)); } catch {} }, seed);
    await p.goto(APP_URL); await wait(450); return p;
  };

  const m = await mk({ width: 375, height: 740 }, true, 'light');
  await t('1 · el header queda fijo (sticky) al hacer scroll en móvil', async () => {
    await m.evaluate(() => scrollTo(0, 500)); await wait(200);
    assert.equal(await m.evaluate(() => Math.round(document.querySelector('header').getBoundingClientRect().top)), 0);
    await m.evaluate(() => scrollTo(0, 0));
  });
  await t('4 · el KPI «Activos» cuenta solo pedidos activos (no los entregados)', async () => {
    assert.equal(await m.$eval('.kpi-chip span', e => e.textContent), '7 Activos');
    assert.equal(await m.$$eval('.order-card', e => e.length), 7);
  });
  await t('3 · el botón «Eliminar» no se ve en un pedido nuevo', async () => {
    await m.click('#btnNew'); await wait(350);
    assert.equal(await m.$eval('#btnDelete', e => e.getBoundingClientRect().width), 0);
  });
  await t('5 · tocar fuera del formulario con texto escrito NO lo cierra ni pierde lo escrito', async () => {
    await m.fill('input[name=marca]', 'Cliente nuevo'); await m.mouse.click(10, 10); await wait(250);
    assert.equal(await m.$eval('#dlgPedido', e => e.open), true);
    assert.equal(await m.inputValue('input[name=marca]'), 'Cliente nuevo');
    await m.click('#btnPedidoClose'); await m.click('#barConfirm'); await wait(250);
  });
  await t('2 · tabla en móvil: la columna Marca no ocupa toda la pantalla y las demás son alcanzables', async () => {
    await m.click('#btnViewTable'); await wait(250);
    const g = await m.evaluate(() => { const w = document.querySelector('.table-wrapper'); return { col1: Math.round(document.querySelector('.data-table td:first-child').getBoundingClientRect().width), wrap: w.clientWidth, scroll: w.scrollWidth }; });
    assert.ok(g.col1 < g.wrap * 0.6, `col1 ${g.col1}px de ${g.wrap}px`);
    assert.ok(g.scroll > g.wrap, 'hay columnas fuera de pantalla a las que se llega deslizando');
    await m.click('#btnViewCards');
  });
  await t('7 · theme-color sigue al tema (claro) y el tema guardado se aplica antes del primer pintado', async () => {
    assert.equal(await m.$eval('meta[name=theme-color]', e => e.content), '#f8f6f2');
    const c = await b.newContext({ colorScheme: 'light' }); const p = await c.newPage();
    await p.addInitScript(() => localStorage.setItem('maquila_theme_v1', 'light'));
    await p.goto(APP_URL, { waitUntil: 'commit' });
    assert.equal(await p.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
    await c.close();
  });
  await t('6 · con el almacenamiento del navegador bloqueado la app arranca (estado vacío) sin errores', async () => {
    const p = await mk({ width: 375, height: 740 }, true, 'dark', () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); });
    assert.deepEqual(p.errs, []);
    assert.equal(await p.$$eval('.empty-box', e => e.length), 1);
  });
  await t('tabla en escritorio (1280px): no hay desbordamiento horizontal', async () => {
    const p = await mk({ width: 1280, height: 800 }, false); await p.click('#btnViewTable'); await wait(250);
    const [cw, sw] = await p.$eval('.table-wrapper', e => [e.clientWidth, e.scrollWidth]);
    assert.equal(sw, cw);
  });
  await t('la tipografía es local: no se pide nada a Google Fonts y Inter carga', async () => {
    assert.equal(m.reqs.filter(u => /googleapis|gstatic/.test(u)).length, 0);
    assert.ok(await m.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some(f => f.family.includes('Inter') && f.status === 'loaded'); }));
  });
  await t('sin errores de JavaScript durante toda la sesión', () => assert.deepEqual(m.errs, []));
  console.log(`\n${ok} comprobaciones OK`); await b.close();
})();
