import { $ } from './utils.js';

/* ===== AVISO CON "DESHACER" ===== */
const TOAST_MS = 7000, TOAST_RESUME_MS = 3000;
let toastTimer = null;

export function hideToast() {
  clearTimeout(toastTimer);
  $('#toastRegion').replaceChildren();
}

/* Un solo aviso a la vez. `undo` se ejecuta si la persona toca "Deshacer".
   Se pausa mientras el cursor o el foco están sobre el aviso. */
export function showToast(msg, undo) {
  hideToast();
  const el = document.createElement('div');
  el.className = 'toast';
  const m = document.createElement('span');
  m.className = 'toast-msg';
  m.textContent = msg;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toast-action';
  b.textContent = 'Deshacer';
  b.addEventListener('click', () => { hideToast(); undo(); });
  el.append(m, b);
  const arm = ms => { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, ms); };
  el.addEventListener('pointerenter', () => clearTimeout(toastTimer));
  el.addEventListener('pointerleave', () => arm(TOAST_RESUME_MS));
  el.addEventListener('focusin', () => clearTimeout(toastTimer));
  el.addEventListener('focusout', () => arm(TOAST_RESUME_MS));
  el.addEventListener('keydown', ev => { if (ev.key === 'Escape') hideToast(); });
  $('#toastRegion').append(el);
  arm(TOAST_MS);
}
