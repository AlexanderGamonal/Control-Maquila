import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS } from '../../js/config.js';
import { dt, fmt, dias, hoy, esc, noFormula } from '../../js/utils.js';
import {
  parseFts, norm, mergeRec, sameRec, setFields, estado, activo, getFormulaClass, getAvatarStyle,
} from '../../js/model.js';

/* ---------- utilidades ---------- */
const isoOffset = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('dt/fmt: normalizan fechas ISO, dd/mm/aaaa y objetos Date', () => {
  assert.equal(dt('2026-10-24'), '2026-10-24');
  assert.equal(dt('2026-10-24T05:00:00.000Z'), '2026-10-24');
  assert.equal(dt(''), '');
  assert.equal(dt(null), '');
  assert.equal(fmt('2026-10-24'), '24/10/26');
  assert.equal(fmt('5/3/2026'), '05/03/26');
  assert.equal(fmt(''), '—');
});

test('dias/hoy: diferencia en días calendario respecto a hoy', () => {
  assert.equal(dias(hoy()), 0);
  assert.equal(dias(isoOffset(1)), 1);
  assert.equal(dias(isoOffset(-3)), -3);
  assert.equal(dias(''), 0);
});

test('esc: escapa HTML; noFormula: neutraliza = + @ y conserva el "-"', () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(esc(null), '');
  assert.equal(noFormula('=HYPERLINK("x")'), ' =HYPERLINK("x")');
  assert.equal(noFormula('+1'), ' +1');
  assert.equal(noFormula('@SUM(1)'), ' @SUM(1)');
  assert.equal(noFormula('-5% descuento'), '-5% descuento');
  assert.equal(noFormula(noFormula('=x')), ' =x', 'idempotente');
  assert.equal(noFormula('\t=x'), ' =x');
});

/* ---------- norm / parseFts ---------- */
test('norm: tipos correctos y valores por defecto', () => {
  const p = norm({ id: 'a', marca: 'M', cantidad: '2500', peso: '900', fechaEntrega: '2026-11-01', deleted: 'TRUE', updatedAt: '55' });
  assert.equal(p.cantidad, 2500);
  assert.equal(p.peso, 900);
  assert.equal(p.deleted, true);
  assert.equal(p.updatedAt, 55);
  assert.equal(p.fechaEntrega, '2026-11-01');
  assert.equal(p.estadoManual, '');
  assert.match(norm({}).id, /^p/, 'genera id si falta');
  for (const v of [true, 1, '1', 'TRUE', 'true']) assert.equal(norm({ deleted: v }).deleted, true);
  for (const v of [false, 0, '0', 'false', '', undefined]) assert.equal(norm({ deleted: v }).deleted, false);
});

test('parseFts: registro antiguo → todos los campos valen updatedAt; fieldTs parcial/ inválido se tolera', () => {
  const legacy = parseFts({ updatedAt: 100 });
  FIELDS.forEach(f => assert.equal(legacy[f], 100));
  const parcial = parseFts({ updatedAt: 100, fieldTs: JSON.stringify({ marca: 300, cantidad: 0 }) });
  assert.equal(parcial.marca, 300);
  assert.equal(parcial.cantidad, 100, 'ts 0 = desconocido → usa la base');
  assert.equal(parcial.peso, 100);
  assert.deepEqual(parseFts({ updatedAt: 7, fieldTs: '{no json' }), parseFts({ updatedAt: 7 }));
  assert.equal(parseFts({ updatedAt: 7, fts: { marca: 9 } }).marca, 9, 'acepta el objeto fts directo');
});

/* ---------- mergeRec ---------- */
const rec = (over = {}, fts = {}) => {
  const r = norm({ id: 'r', marca: 'M', cantidad: 1, peso: 1, formula: 'Amore', updatedAt: 10, ...over });
  Object.assign(r.fts, fts);
  return r;
};

test('mergeRec: campos distintos se conservan los dos; el mismo campo gana el más reciente', () => {
  const a = rec({ cantidad: 5 }, { cantidad: 30 });                         // local: cambió cantidad (ts 30)
  const b = rec({ fechaEntrega: '2026-12-15' }, { fechaEntrega: 40 });      // hoja: cambió la entrega (ts 40)
  const m = mergeRec(a, b);
  assert.equal(m.cantidad, 5);
  assert.equal(m.fechaEntrega, '2026-12-15');
  assert.equal(m.fts.cantidad, 30);
  assert.equal(m.fts.fechaEntrega, 40);
  assert.equal(m.updatedAt, 40);
  const x = mergeRec(rec({ marca: 'local' }, { marca: 50 }), rec({ marca: 'hoja' }, { marca: 20 }));
  assert.equal(x.marca, 'local');
  const y = mergeRec(rec({ marca: 'local' }, { marca: 20 }), rec({ marca: 'hoja' }, { marca: 50 }));
  assert.equal(y.marca, 'hoja');
});

test('mergeRec: con la misma fecha y distinto valor gana la hoja (2º argumento)', () => {
  const m = mergeRec(rec({ marca: 'local' }, { marca: 20 }), rec({ marca: 'hoja' }, { marca: 20 }));
  assert.equal(m.marca, 'hoja');
});

test('mergeRec/sameRec: fusionar con uno mismo no cambia nada', () => {
  const a = rec({ marca: 'X', cantidad: 3 }, { marca: 12 });
  const m = mergeRec(a, a);
  assert.ok(sameRec(m, a));
  assert.ok(!sameRec(rec({ marca: 'A' }), rec({ marca: 'B' })));
  assert.ok(!sameRec(rec({}, { marca: 5 }), rec({}, { marca: 6 })), 'distinta fecha por campo = distinto');
});

/* Generador pseudoaleatorio determinista (mismas muestras en cada ejecución) */
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rnd = mulberry(20261024);
const pick = a => a[Math.floor(rnd() * a.length)];
const POOL = { marca: ['A', 'B', 'Z'], cantidad: [0, 1, 5, 100], peso: [0, 500, 900], formula: ['', 'Amore', 'Fastpan'], fechaPedido: ['', '2026-10-01'], fechaEntrega: ['', '2026-10-01', '2026-12-31'],
  ampliacionDigesa: ['', '2026-10-01'], arteAprobado: ['', '2026-10-01'], pedidoSistema: ['', '2026-10-01'], estadoManual: ['', 'En pausa'], observaciones: ['', 'n', '-5%'], deleted: [true, false] };
const rndRec = () => { const r = { id: 'r', updatedAt: pick([0, 3, 10]) }; FIELDS.forEach(f => { r[f] = pick(POOL[f]); }); const o = {}; FIELDS.forEach(f => { o[f] = pick([0, 1, 2, 3, 5, 10]); }); r.fieldTs = JSON.stringify(o); return norm(r); };
const canon = m => JSON.stringify([FIELDS.map(f => String(m[f])), FIELDS.map(f => m.fts[f]), m.updatedAt]);
const hayEmpate = (a, b) => FIELDS.some(f => a.fts[f] === b.fts[f] && String(a[f]) !== String(b[f]));

test('mergeRec (propiedades, 3000 casos): asociativa SIEMPRE; conmutativa y de orden libre si no hay empates', () => {
  let conm = 0, perm = 0;
  for (let i = 0; i < 3000; i++) {
    const [a, b, c] = [rndRec(), rndRec(), rndRec()];
    assert.equal(canon(mergeRec(mergeRec(a, b), c)), canon(mergeRec(a, mergeRec(b, c))), 'asociatividad');
    if (!hayEmpate(a, b)) { conm++; assert.equal(canon(mergeRec(a, b)), canon(mergeRec(b, a)), 'conmutatividad'); }
    if (!hayEmpate(a, b) && !hayEmpate(a, c) && !hayEmpate(b, c)) {
      perm++;
      assert.equal(canon(mergeRec(mergeRec(a, b), c)), canon(mergeRec(mergeRec(c, a), b)), 'orden de llegada');
    }
    const m = mergeRec(a, a);
    FIELDS.forEach(f => { assert.equal(String(m[f]), String(a[f])); assert.equal(m.fts[f], a.fts[f]); });
  }
  assert.ok(conm > 300 && perm > 30, `muestras suficientes (${conm}/${perm})`);
});

/* ---------- setFields ---------- */
test('setFields: solo toca (y sella) los campos que realmente cambian', () => {
  const p = norm({ id: 'p', marca: 'M', cantidad: 10, peso: 900, formula: 'Amore', updatedAt: 1000 });
  const antes = { ...p.fts };
  const n = setFields(p, { marca: 'M', cantidad: '10', peso: 950 });        // marca y cantidad iguales (cantidad llega como texto)
  assert.equal(n, 1);
  assert.equal(p.peso, 950);
  assert.ok(p.fts.peso > antes.peso);
  assert.equal(p.fts.marca, antes.marca);
  assert.equal(p.fts.cantidad, antes.cantidad);
  assert.equal(setFields(p, { id: 'otro', updatedAt: 5 }), 0, 'ignora lo que no es un campo fusionable');
  assert.equal(p.id, 'p');
});

test('setFields: normaliza tipos y la marca de tiempo es monótona', () => {
  const p = norm({ id: 'p', updatedAt: Date.now() + 5000 });                // reloj "en el futuro"
  setFields(p, { cantidad: '42', deleted: 'true', fechaEntrega: '2026-11-01T10:00:00Z' });
  assert.equal(p.cantidad, 42);
  assert.equal(p.deleted, true);
  assert.equal(p.fechaEntrega, '2026-11-01');
  assert.ok(p.fts.cantidad > p.updatedAt - 1, 'nunca por debajo del updatedAt previo');
});

/* ---------- negocio ---------- */
test('estado/activo: manual manda; en producción si ya está en sistema; si no, pendiente', () => {
  assert.equal(estado({ estadoManual: 'En pausa', pedidoSistema: '2026-10-01' }), 'En pausa');
  assert.equal(estado({ estadoManual: '', pedidoSistema: '2026-10-01' }), 'En producción');
  assert.equal(estado({ estadoManual: '', pedidoSistema: '' }), 'Pendiente');
  assert.equal(activo({ estadoManual: 'Entregado' }), false);
  assert.equal(activo({ estadoManual: 'Anulado' }), false);
  assert.equal(activo({ estadoManual: 'En pausa' }), true);
});

test('getFormulaClass/getAvatarStyle', () => {
  assert.equal(getFormulaClass('Barletta'), 'f-barletta');
  assert.equal(getFormulaClass('AMORE premium'), 'f-amore');
  assert.equal(getFormulaClass('fastpan'), 'f-fastpan');
  assert.equal(getFormulaClass('otra'), 'f-other');
  assert.equal(getFormulaClass(undefined), 'f-other');
  assert.deepEqual(getAvatarStyle('  dulce', 'Amore'), { char: 'D', cls: 'f-amore' });
  assert.deepEqual(getAvatarStyle('', ''), { char: '?', cls: 'f-other' });
});
