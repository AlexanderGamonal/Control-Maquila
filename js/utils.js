/* Utilidades puras: no dependen del estado de la app. Ningún acceso al DOM ni a localStorage
   al importar el módulo (así también se puede probar en Node). */

/* ===== DOM HELPERS ===== */
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* ===== ALMACENAMIENTO LOCAL (tolera navegadores con el almacenamiento bloqueado) ===== */
export const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
export const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };

export const uid  = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ===== FECHAS ===== */
export function dt(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return s.slice(0, 10);
}

export function fmt(s) {
  if (!s) return '—';
  const str = String(s).trim();
  // If ISO YYYY-MM-DD
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1].slice(-2)}`;
  // If DD/MM/YYYY
  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) return `${dmy[1].padStart(2,'0')}/${dmy[2].padStart(2,'0')}/${dmy[3].slice(-2)}`;
  // Parse with Date
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
  }
  return str.slice(0, 10);
}

export function dias(s) {
  if (!s) return 0;
  const targetStr = dt(s);
  const target = new Date(targetStr + 'T00:00:00');
  const today = new Date(hoy() + 'T00:00:00');
  return Math.round((target - today) / 864e5);
}

export function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Evita que Sheets interprete el texto como fórmula (=, +, @ al inicio). El '-' es válido.
export const noFormula = v => { const t = String(v ?? '').replace(/^[\t\r]+/, ''); return /^[=+@]/.test(t) ? ' ' + t : t; };
