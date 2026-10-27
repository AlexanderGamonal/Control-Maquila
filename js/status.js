import { $ } from './utils.js';

/* ===== STATUS BAR ===== */
export function setStatus(msg, cls = '') {
  const el = $('#syncStatus');
  el.className = 'sync-badge ' + cls;
  el.querySelector('.sync-text').textContent = msg;
}
