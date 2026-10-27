/* Accesibilidad: contraste AA, objetivos táctiles, ARIA, tamaños de texto, header compacto y movimiento reducido. */
const assert = require('assert');
const { launch, APP_URL } = require('../helpers/browser.cjs');
const { scanContrast } = require('../helpers/contrast.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = 0;
const t = async (n, f) => { try { await f(); console.log('✓', n); ok++; } catch (e) { console.log('✗', n, '\n     →', e.message.split('\n')[0]); process.exitCode = 1; } };

const d = o => { const x = new Date(); x.setDate(x.getDate() + o); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const ST = ['', 'En pausa', 'Entregado', 'Anulado'];
const seed = Array.from({ length: 12 }, (_, i) => ({ id: 'x' + i, marca: i === 1 ? 'Supermercados La Canasta del Norte S.A.C.' : 'Cliente ' + i, cantidad: 1000 + i, peso: 900, formula: ['Barletta', 'Amore', 'Fastpan'][i % 3],
  fechaPedido: d(-3), fechaEntrega: d(i === 0 ? -2 : i === 2 ? 0 : i === 3 ? 2 : 5 + i), ampliacionDigesa: i % 2 ? d(-1) : '', arteAprobado: i % 3 ? d(-1) : '', pedidoSistema: i % 4 === 0 ? d(0) : '',
  estadoManual: ST[i % 4], observaciones: i < 3 ? 'Caja especial -5% desc' : '', updatedAt: i + 1, deleted: false }));

(async () => {
  const b = await launch();
  const mk = async (vp, mobile, theme = 'dark', extra = {}) => {
    const c = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, colorScheme: theme, serviceWorkers: 'block', ...extra });
    const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.addInitScript(s => { try { if (!localStorage.getItem('maquila_pedidos_v2')) localStorage.setItem('maquila_pedidos_v2', JSON.stringify(s)); } catch {} }, seed);
    await p.goto(APP_URL); await wait(450); return p;
  };

  for (const theme of ['dark', 'light']) for (const view of ['cards', 'table']) {
    await t(`contraste AA en TODO el texto · tema ${theme} · vista ${view} (con el formulario abierto también)`, async () => {
      const p = await mk({ width: 1100, height: 900 }, false, theme);
      await p.click(view === 'cards' ? '#btnViewCards' : '#btnViewTable'); await wait(200);
      await p.click('.pill[data-filter=todos]'); await wait(150);
      let fails = await p.evaluate(scanContrast);
      await p.click('#btnNew'); await wait(100);
      // medir con el diálogo ya opaco, no a mitad de su animación de apertura (las infinitas, como el pulso del chip «Atrasado», nunca terminan)
      await p.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));   // una animación cancelada tampoco está en curso
      fails = fails.concat(await p.evaluate(scanContrast));
      assert.equal(fails.length, 0, fails.slice(0, 4).join(' | '));
    });
  }

  const m = await mk({ width: 375, height: 740 }, true);
  await t('objetivos táctiles en móvil: botones del header ≥ 44px, pills ≥ 36px, «Editar» ≥ 40px, búsqueda ≥ 44px', async () => {
    const s = await m.evaluate(() => { const h = s => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
      return { theme: h('#btnThemeToggle'), sync: h('#btnSync'), cfg: h('#btnCfg'), pill: h('.pill'), edit: h('.card-action-btn'), search: h('#q'), view: h('#btnViewCards') }; });
    ['theme', 'sync', 'cfg'].forEach(k => assert.ok(s[k][0] >= 44 && s[k][1] >= 44, `${k} ${s[k]}`));
    assert.ok(s.pill[1] >= 36 && s.edit[1] >= 40 && s.search[1] >= 44 && s.view[1] >= 40, JSON.stringify(s));
  });
  await t('texto ≥ 12px en toda la app y campos a 16px en móvil (iOS no hace zoom)', async () => {
    const min = await m.evaluate(() => Math.min(...[...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width).map(e => parseFloat(getComputedStyle(e).fontSize))));
    assert.ok(min >= 12, 'mínimo ' + min);
    assert.equal(await m.$eval('#q', e => getComputedStyle(e).fontSize), '16px');
    await m.click('#btnNew'); await wait(350);
    assert.equal(await m.$eval('input[name=marca]', e => getComputedStyle(e).fontSize), '16px');
    await m.click('#btnPedidoClose'); await wait(250);
  });
  await t('ARIA: botones de ícono con nombre, estados aria-pressed al día, estado de sincronización anunciado', async () => {
    for (const s of ['#btnThemeToggle', '#btnSync', '#btnCfg', '#btnViewCards', '#btnViewTable', '#q']) assert.ok(await m.$eval(s, e => e.getAttribute('aria-label')), s + ' sin aria-label');
    await m.click('.pill[data-filter=todos]');
    assert.equal(await m.$$eval('.pill', e => e.map(x => x.getAttribute('aria-pressed')).join(',')), 'false,true,false,false,false,false,false');
    await m.click('#btnViewTable');
    assert.equal(await m.$$eval('.view-btn', e => e.map(x => x.getAttribute('aria-pressed')).join(',')), 'false,true');
    await m.click('#btnViewCards');
    assert.match(await m.$eval('.step-item', e => e.getAttribute('aria-label')), /pendiente|completado/);
    assert.equal(await m.$eval('#syncStatus', e => e.getAttribute('aria-live')), 'polite');
  });
  await t('header compacto: se compacta al bajar, se expande arriba y NO parpadea (exactamente 2 cambios en ida y vuelta)', async () => {
    const H = () => m.evaluate(() => document.querySelector('header').classList.contains('compact'));
    await m.evaluate(() => scrollTo(0, 0)); await wait(250); assert.equal(await H(), false);
    let flips = 0, last = null;
    for (let y = 0; y <= 400; y += 20) { await m.evaluate(y => scrollTo(0, y), y); await wait(40); const c = await H(); if (last !== null && c !== last) flips++; last = c; }
    assert.equal(await H(), true);
    await m.evaluate(() => scrollTo(0, 100)); await wait(250); assert.equal(await H(), true, 'histéresis: sigue compacto a 100px');
    for (let y = 400; y >= 0; y -= 20) { await m.evaluate(y => scrollTo(0, y), y); await wait(40); const c = await H(); if (c !== last) flips++; last = c; }
    assert.equal(flips, 2); assert.equal(await H(), false);
  });
  await t('movimiento reducido: animaciones y transiciones se anulan', async () => {
    const p = await mk({ width: 375, height: 740 }, true, 'dark', { reducedMotion: 'reduce' });
    const dur = await p.$eval('header', e => parseFloat(getComputedStyle(e).transitionDuration));
    assert.ok(dur < 0.001, 'transitionDuration ' + dur);
  });
  await t('sin errores de JavaScript', () => assert.deepEqual(m.errs, []));
  console.log(`\n${ok} comprobaciones OK`); await b.close();
})();
