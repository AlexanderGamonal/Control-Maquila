import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FIELDS } from '../../js/config.js';
import { norm, mergeRec } from '../../js/model.js';

const { makeGas } = createRequire(import.meta.url)('../helpers/gas.cjs');

const rec = (o = {}) => ({ id: 'a', marca: 'M', cantidad: 1, peso: 900, formula: 'Amore', fechaPedido: '2026-10-01', fechaEntrega: '2026-11-01',
  ampliacionDigesa: '', arteAprobado: '', pedidoSistema: '', estadoManual: '', observaciones: '', updatedAt: 10, deleted: false, ...o });
const allTs = n => Object.fromEntries(FIELDS.map(f => [f, n]));

/* ================= autenticación y token ================= */
test('sin token configurado → rechaza', () => {
  const g = makeGas({ token: null });
  const r = g.call({ token: 'x', records: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /no configurado/);
});

test('generarToken crea un token de 64 hex y lo guarda', () => {
  const g = makeGas({ token: null });
  const tk = g.ctx.generarToken();
  assert.match(tk, /^[0-9a-f]{64}$/);
  assert.equal(g.st.props.TOKEN, tk);
});

test('token incorrecto / ausente / de otro largo → error "token", sin leer ni escribir la hoja', () => {
  const g = makeGas({ token: null });
  g.ctx.generarToken();
  const real = g.st.props.TOKEN;
  for (const tk of ['bad', undefined, '', real.slice(0, -1), real + 'x', 123]) {
    const r = g.call({ token: tk, records: [rec()] });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'token');
  }
  assert.equal(g.st.locks, 0);
  assert.equal(g.st.rows.length, 0);
});

test('doGet no devuelve datos ni acepta token por URL', () => {
  const g = makeGas();
  g.post([rec()]);
  const out = JSON.parse(g.ctx.doGet({ parameter: { token: 't' } }).t);
  assert.ok(out.ok);
  assert.ok(!('records' in out));
});

test('JSON inválido → error controlado', () => {
  const g = makeGas();
  const r = g.call('{no json');
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON/);
});

/* ================= concurrencia ================= */
test('toma y libera el lock', () => {
  const g = makeGas();
  g.post([]);
  assert.equal(g.st.locks, 1);
  assert.equal(g.st.released, 1);
});

test('si no obtiene el lock devuelve error, no escribe y no libera lo que no tomó', () => {
  const g = makeGas();
  g.st.lockFail = true;
  const r = g.post([rec()]);
  assert.equal(r.ok, false);
  assert.match(r.error, /lock/);
  assert.equal(g.st.rows.length, 0);
  assert.equal(g.st.released, 0);
});

/* ================= escritura ================= */
test('inserta y devuelve los registros', () => {
  const g = makeGas();
  const r = g.post([rec()]);
  assert.ok(r.ok);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].marca, 'M');
  assert.equal(r.records[0].fechaEntrega, '2026-11-01');
});

test('registro sin id se ignora; varios ids nuevos se escriben en un solo lote', () => {
  const g = makeGas();
  assert.equal(g.post([rec({ id: '' })]).records.length, 0);
  const r = g.post([rec({ id: '1' }), rec({ id: '2' }), rec({ id: '3' })]);
  assert.deepEqual(r.records.map(x => x.id), ['1', '2', '3']);
});

test('el mismo id repetido en un lote → una sola fila (gana la edición más reciente)', () => {
  const g = makeGas();
  const r = g.post([rec({ marca: 'A', updatedAt: 1 }), rec({ marca: 'B', updatedAt: 5 }), rec({ marca: 'C', updatedAt: 3 })]);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].marca, 'B');
});

test('cliente antiguo (sin fieldTs): gana el más reciente y el viejo no pisa', () => {
  const g = makeGas();
  g.post([rec({ marca: 'Nuevo', updatedAt: 50 })]);
  assert.equal(g.post([rec({ marca: 'Viejo', updatedAt: 20 })]).records[0].marca, 'Nuevo');
  assert.equal(g.post([rec({ marca: 'Más nuevo', updatedAt: 60 })]).records[0].marca, 'Más nuevo');
});

test('reenviar lo mismo no modifica la hoja (no gasta cuota de escritura)', () => {
  const g = makeGas();
  const r = rec({ marca: 'A', updatedAt: 5, fieldTs: JSON.stringify(allTs(5)) });
  g.post([r]);
  const snap = JSON.stringify(g.st.rows);
  g.post([r]);
  assert.equal(JSON.stringify(g.st.rows), snap);
});

test('el formato de texto se aplica una sola vez por ejecución', () => {
  const g = makeGas();
  g.post([rec()]);
  assert.equal(g.st.formatCalls, 1);
});

/* ================= saneamiento ================= */
test('fórmulas neutralizadas en marca y observaciones; "-5%" se conserva; es idempotente', () => {
  const g = makeGas();
  const r = g.post([rec({ id: '1', marca: '=HYPERLINK("x")', observaciones: '-5% descuento' }), rec({ id: '2', marca: '+1', observaciones: '@SUM(1)' })]);
  const m = Object.fromEntries(r.records.map(x => [x.id, x]));
  assert.equal(m['1'].marca, ' =HYPERLINK("x")');
  assert.equal(m['1'].observaciones, '-5% descuento');
  assert.equal(m['2'].marca, ' +1');
  assert.equal(m['2'].observaciones, ' @SUM(1)');
  const again = g.post([rec({ id: '1', marca: m['1'].marca, updatedAt: 99 })]);
  assert.equal(again.records.find(x => x.id === '1').marca, m['1'].marca);
});

test('Date de hojas antiguas se normaliza a yyyy-MM-dd', () => {
  const g = makeGas();
  g.post([rec()]);
  g.st.rows[1][5] = g.date('2026-10-05T12:00:00Z');
  assert.equal(g.post([]).records[0].fechaPedido, '2026-10-05');
});

/* ================= integridad del propio script ================= */
test('todas las funciones de Code.gs existen (un comentario sin cerrar las taparía sin error de sintaxis)', () => {
  const g = makeGas();
  const need = ['getOrCreateSheet', 'upsertAll', 'readAll', 'doPost', 'doGet', 'onEdit', 'mergeRec_', 'normRec_', 'toRow_',
    'generarToken', 'jsonOut', 'getToken_', 'tokenOk_', 'safeText_', 'dateText_', 'testLocal'];
  assert.deepEqual(need.filter(n => typeof g.ctx[n] !== 'function'), []);
});

/* ================= paridad cliente (model.js) ↔ servidor (Code.gs) ================= */
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rnd = mulberry(424242);
const pick = a => a[Math.floor(rnd() * a.length)];
const POOL = { marca: ['A', 'B', 'Cliente ñ', 'Z'], cantidad: [0, 1, 5, 100, '1000', 'x', ''], peso: [0, 500, 900], formula: ['', 'Amore', 'Barletta', 'Fastpan'],
  fechaPedido: ['', '2026-10-01', '2026-12-31'], fechaEntrega: ['', '2026-10-01', '2026-12-31'], ampliacionDigesa: ['', '2026-10-01'], arteAprobado: ['', '2026-10-01'],
  pedidoSistema: ['', '2026-10-01'], estadoManual: ['', 'En pausa', 'Entregado'], observaciones: ['', 'nota', '-5% desc', 'otra nota'], deleted: [true, false, 'true', 'TRUE', 1, 0, '', 'false'] };
const TS = [0, 1, 2, 3, 5, 10, 10, 10];
const rndRec = () => {
  const r = { id: 'r1', updatedAt: pick([0, 3, 10, 11]) };
  FIELDS.forEach(f => { r[f] = pick(POOL[f]); });
  const m = rnd();
  if (m >= 0.35) { const o = {}; FIELDS.forEach(f => { if (m < 0.7 || rnd() < 0.5) o[f] = pick(TS); }); r.fieldTs = JSON.stringify(o); }
  return r;
};
const canonClient = m => JSON.stringify([FIELDS.map(f => String(m[f])), FIELDS.map(f => m.fts[f]), m.updatedAt]);
const canonServer = m => JSON.stringify([FIELDS.map(f => String(m.vals[f])), FIELDS.map(f => m.fts[f]), m.updatedAt]);

test('PARIDAD: la fusión del cliente y la del servidor dan el MISMO resultado en 3000 pares aleatorios', () => {
  const g = makeGas();
  let bad = 0, first = null;
  for (let i = 0; i < 3000; i++) {
    const a = rndRec(), b = rndRec();
    const c = canonClient(mergeRec(norm(a), norm(b)));
    const s = canonServer(g.ctx.mergeRec_(g.ctx.normRec_(a), g.ctx.normRec_(b)));
    if (c !== s) { bad++; first ||= { a, b, c, s }; }
  }
  assert.equal(bad, 0, `${bad} diferencias; ej: ${JSON.stringify(first)}`);
});

test('servidor: asociativa siempre; conmutativa sin empates; idempotente', () => {
  const g = makeGas();
  const N = r => g.ctx.normRec_(r);
  const k = canonServer;
  const empate = (a, b) => FIELDS.some(f => a.fts[f] === b.fts[f] && a.vals[f] !== b.vals[f]);
  let conm = 0;
  for (let i = 0; i < 3000; i++) {
    const [a, b, c] = [N(rndRec()), N(rndRec()), N(rndRec())];
    assert.equal(k(g.ctx.mergeRec_(g.ctx.mergeRec_(a, b), c)), k(g.ctx.mergeRec_(a, g.ctx.mergeRec_(b, c))));
    if (!empate(a, b)) { conm++; assert.equal(k(g.ctx.mergeRec_(a, b)), k(g.ctx.mergeRec_(b, a))); }
    const m = g.ctx.mergeRec_(a, a);
    FIELDS.forEach(f => { assert.equal(m.vals[f], a.vals[f]); assert.equal(m.fts[f], a.fts[f]); });
    const m2 = g.ctx.mergeRec_(m, m);
    assert.equal(k(m2), k(m), 'punto fijo');
  }
  assert.ok(conm > 300);
});

test('EMPATE (misma fecha, distinto valor: p. ej. una celda editada a mano): gana la hoja en cliente y servidor', () => {
  const g = makeGas();
  const local = { id: 'r', marca: 'Local', cantidad: 5, updatedAt: 100, fieldTs: JSON.stringify({ marca: 100, cantidad: 100 }) };
  const hoja = { id: 'r', marca: 'Hoja', cantidad: 5, updatedAt: 100, fieldTs: JSON.stringify({ marca: 100, cantidad: 100 }) };
  assert.equal(g.ctx.mergeRec_(g.ctx.normRec_(local), g.ctx.normRec_(hoja)).vals.marca, 'Hoja');
  assert.equal(mergeRec(norm(local), norm(hoja)).marca, 'Hoja');
});

/* ================= fusión por campo en la hoja ================= */
test('dos ediciones de campos distintos se combinan; la más reciente de un mismo campo gana', () => {
  const g = makeGas();
  g.post([rec({ id: 'r1', updatedAt: 1000, fieldTs: JSON.stringify(allTs(1000)) })]);
  g.post([rec({ id: 'r1', cantidad: 555, updatedAt: 2000, fieldTs: JSON.stringify({ ...allTs(1000), cantidad: 2000 }) })]);
  g.post([rec({ id: 'r1', fechaEntrega: '2026-12-15', updatedAt: 3000, fieldTs: JSON.stringify({ ...allTs(1000), fechaEntrega: 3000 }) })]);
  let x = g.get().r1;
  assert.equal(x.cantidad, '555');
  assert.equal(x.fechaEntrega, '2026-12-15');
  g.post([rec({ id: 'r1', cantidad: 111, updatedAt: 1500, fieldTs: JSON.stringify({ ...allTs(1000), cantidad: 1500 }) })]);   // más antigua: no pisa
  x = g.get().r1;
  assert.equal(x.cantidad, '555');
});

/* ================= migración de hojas existentes ================= */
const OLD = ['id', 'marca', 'cantidad', 'peso', 'formula', 'fechaPedido', 'fechaEntrega', 'ampliacionDigesa', 'arteAprobado', 'pedidoSistema', 'estadoManual', 'observaciones', 'updatedAt', 'deleted'];
const oldRow = (i, over = {}) => { const o = { id: 'r' + i, marca: 'Cliente ' + i, cantidad: '100', peso: '900', formula: 'Amore', fechaPedido: '2026-10-01', fechaEntrega: '2026-11-01',
  ampliacionDigesa: '', arteAprobado: '', pedidoSistema: '', estadoManual: '', observaciones: '', updatedAt: '1000', deleted: 'false', ...over }; return OLD.map(k => o[k]); };

test('MIGRACIÓN: hoja de 14 columnas → agrega "fieldTs" al encabezado sin tocar los datos', () => {
  const g = makeGas();
  g.adopt([OLD.slice(), oldRow(1), oldRow(2)]);
  const r = g.post([]);
  assert.equal(g.st.rows[0][14], 'fieldTs');
  assert.deepEqual(g.st.rows[1].slice(0, 14), oldRow(1));
  assert.equal(r.records.length, 2);
  assert.equal(r.records[0].fieldTs, '');
});

test('MIGRACIÓN: fila antigua + edición nueva de OTRO campo → se combinan (la antigua conserva su fecha base)', () => {
  const g = makeGas();
  g.adopt([OLD.slice(), oldRow(1)]);
  const r = g.post([rec({ id: 'r1', marca: 'Cliente 1', cantidad: 100, observaciones: 'nota nueva', updatedAt: 2000, fieldTs: JSON.stringify({ ...allTs(1000), observaciones: 2000 }) })]);
  const x = r.records[0];
  assert.equal(x.observaciones, 'nota nueva');
  assert.equal(x.marca, 'Cliente 1');
  assert.equal(x.updatedAt, '2000');
  const f = JSON.parse(x.fieldTs);
  assert.equal(f.observaciones, 2000);
  assert.equal(f.marca, 1000);
});

/* ================= ediciones manuales en la hoja (onEdit) ================= */
const sembrada = () => { const g = makeGas(); g.post([rec({ id: 'r1', cantidad: 100, updatedAt: 1000, fieldTs: JSON.stringify(allTs(1000)) })]); return g; };

test('onEdit: editar a mano "cantidad" sella SOLO ese campo con la hora actual (y updatedAt)', () => {
  const g = sembrada();
  const col = g.st.rows[0].indexOf('cantidad') + 1;
  g.st.rows[1][col - 1] = '777';
  const antes = Date.now();
  g.ctx.onEdit(g.editEvent(2, col));
  const ts = JSON.parse(g.st.rows[1][14]);
  assert.ok(ts.cantidad >= antes);
  assert.equal(ts.marca, 1000);
  assert.ok(Number(g.st.rows[1][12]) >= antes);
});

test('onEdit: la edición manual más nueva gana a la de la app más vieja; una edición posterior de la app gana a la manual', async () => {
  const g = sembrada();
  const col = g.st.rows[0].indexOf('cantidad') + 1;
  await new Promise(r => setTimeout(r, 5));
  g.st.rows[1][col - 1] = '777';
  g.ctx.onEdit(g.editEvent(2, col));
  let r = g.post([rec({ id: 'r1', cantidad: 555, updatedAt: 2000, fieldTs: JSON.stringify({ ...allTs(1000), cantidad: 2000 }) })]);
  assert.equal(r.records[0].cantidad, '777', 'la app (ts 2000) no pisa la edición manual de hoy');
  const despues = Date.now() + 60000;
  r = g.post([rec({ id: 'r1', cantidad: 999, updatedAt: despues, fieldTs: JSON.stringify({ ...allTs(1000), cantidad: despues }) })]);
  assert.equal(r.records[0].cantidad, '999');
});

test('onEdit: ignora encabezado, otras hojas, columnas que no son datos y entradas raras (nunca lanza)', () => {
  const g = sembrada();
  const snap = JSON.stringify(g.st.rows);
  const colUp = g.st.rows[0].indexOf('updatedAt') + 1;
  g.ctx.onEdit(g.editEvent(1, 2));
  g.ctx.onEdit(g.editEvent(2, 1));
  g.ctx.onEdit(g.editEvent(2, colUp));
  g.ctx.onEdit(g.editEvent(2, 2, 1, 1, 'Otra'));
  g.ctx.onEdit(undefined);
  g.ctx.onEdit({});
  g.ctx.onEdit({ range: { getSheet() { throw new Error('x'); } } });
  assert.equal(JSON.stringify(g.st.rows), snap);
});

test('onEdit: pegar varias celdas/filas sella cada una; una fila antigua sin fieldTs parte de su updatedAt', () => {
  const g = makeGas();
  const row = i => ['r' + i, 'M' + i, '1', '1', 'Amore', '', '', '', '', '', '', '', '1000', 'false'];
  g.adopt([OLD.slice(), row(1), row(2)]);
  g.post([]);
  const col = g.st.rows[0].indexOf('marca') + 1;
  g.ctx.onEdit(g.editEvent(2, col, 2, 2));
  [1, 2].forEach(i => {
    const ts = JSON.parse(g.st.rows[i][14]);
    assert.ok(ts.marca > 1000 && ts.cantidad > 1000, 'fila ' + i);
    assert.equal(ts.peso, 1000);
  });
});
