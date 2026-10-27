/* Modelo de datos y reglas de negocio. Puro: sin DOM ni almacenamiento (se prueba en Node). */
import { FIELDS } from './config.js';
import { dt, uid } from './utils.js';

// Fechas por campo. Registros antiguos (sin fieldTs): todos los campos valen su updatedAt.
export function parseFts(r) {
  let o = r.fts;
  if (!o && typeof r.fieldTs === 'string' && r.fieldTs) { try { o = JSON.parse(r.fieldTs); } catch { o = null; } }
  const base = Number(r.updatedAt) || 0, out = {};
  FIELDS.forEach(f => { const v = Number(o && o[f]); out[f] = v > 0 ? v : base; });
  return out;
}

export function norm(r) {
  return {
    fts:              parseFts(r),
    id:               String(r.id || uid()),
    marca:            String(r.marca ?? ''),
    cantidad:         Number(r.cantidad) || 0,
    peso:             Number(r.peso) || 0,
    formula:          String(r.formula ?? ''),
    fechaPedido:      dt(r.fechaPedido),
    fechaEntrega:     dt(r.fechaEntrega),
    ampliacionDigesa: dt(r.ampliacionDigesa),
    arteAprobado:     dt(r.arteAprobado),
    pedidoSistema:    dt(r.pedidoSistema),
    estadoManual:     String(r.estadoManual ?? ''),
    observaciones:    String(r.observaciones ?? ''),
    updatedAt:        Number(r.updatedAt) || 0,
    deleted:          [true,1,'1','TRUE','true'].includes(r.deleted),
  };
}

/* Fusión por campo: para cada campo gana la edición más reciente. `a` = copia local, `b` = hoja.
   Si la fecha es la misma pero el valor difiere (típico: alguien editó una celda a mano en la
   hoja), gana la hoja, que es la fuente de verdad. Misma regla en Code.gs (mergeRec_). */
export function mergeRec(a, b) {
  const out = { ...a, fts: {} };
  FIELDS.forEach(f => {
    const ta = a.fts[f], tb = b.fts[f];
    const pickB = tb >= ta;
    out[f] = pickB ? b[f] : a[f];
    out.fts[f] = Math.max(ta, tb);
  });
  out.updatedAt = Math.max(a.updatedAt, b.updatedAt, ...Object.values(out.fts));
  return out;
}
export const sameRec = (a, b) => FIELDS.every(f => String(a[f]) === String(b[f]) && a.fts[f] === b.fts[f]);

/* Aplica solo los campos que realmente cambian y les pone fecha de edición propia. */
export function setFields(p, changes) {
  const now = Math.max(Date.now(), p.updatedAt + 1);
  const next = norm({ ...p, ...changes });            // normaliza tipos (número, fecha, booleano)
  let n = 0;
  for (const k of Object.keys(changes)) {
    if (!FIELDS.includes(k)) continue;
    if (String(next[k]) !== String(p[k])) { p[k] = next[k]; p.fts[k] = now; n++; }
  }
  return n;
}

/* ===== BUSINESS LOGIC ===== */
export function estado(p) {
  if (p.estadoManual) return p.estadoManual;
  if (p.pedidoSistema) return 'En producción';
  return 'Pendiente';
}
export const activo = p => !['Entregado','Anulado'].includes(estado(p));

export function getFormulaClass(f) {
  const m = (f || '').toLowerCase();
  if (m.includes('barletta')) return 'f-barletta';
  if (m.includes('amore'))    return 'f-amore';
  if (m.includes('fastpan'))  return 'f-fastpan';
  return 'f-other';
}

export function getAvatarStyle(marca, formula) {
  const cls = getFormulaClass(formula);
  const char = (marca || '?').trim().charAt(0).toUpperCase();
  return { char, cls };
}
