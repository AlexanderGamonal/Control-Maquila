/* Controles del encabezado: vista tarjetas/tabla, filtros, búsqueda y header compacto. */
import { LS_VIEW } from './config.js';
import { $, lsSet } from './utils.js';
import { state } from './state.js';
import { render } from './render.js';

/* ===== VIEW MODE TOGGLE (CARDS / TABLE) ===== */
export function setViewMode(mode) {
  state.viewMode = mode;
  lsSet(LS_VIEW, mode);
  $('#btnViewCards').classList.toggle('active', mode === 'cards');
  $('#btnViewTable').classList.toggle('active', mode === 'table');
  $('#btnViewCards').setAttribute('aria-pressed', String(mode === 'cards'));
  $('#btnViewTable').setAttribute('aria-pressed', String(mode === 'table'));
  render();
}

/* ===== HEADER COMPACTO AL HACER SCROLL (histéresis para evitar parpadeo) ===== */
function initHeaderCompact() {
  const hdr = document.querySelector('header');
  let ticking = false;
  function upd() {
    ticking = false;
    const y = window.scrollY;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight > 360;
    if (!hdr.classList.contains('compact') && y > 140 && scrollable) hdr.classList.add('compact');
    else if (hdr.classList.contains('compact') && y < 20) hdr.classList.remove('compact');
  }
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
}

export function initControls() {
  $('#btnViewCards').addEventListener('click', () => setViewMode('cards'));
  $('#btnViewTable').addEventListener('click', () => setViewMode('table'));

  /* ===== FILTER PILLS LISTENER ===== */
  $('#filterPills').addEventListener('click', ev => {
    const pill = ev.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('.pill').forEach(p => { p.classList.remove('active'); p.setAttribute('aria-pressed', 'false'); });
    pill.classList.add('active');
    pill.setAttribute('aria-pressed', 'true');
    state.activeFilter = pill.dataset.filter;
    render();
  });

  $('#q').addEventListener('input', render);

  initHeaderCompact();
}
