/* Eventos de la lista (tarjetas y tabla): marcar etapas y abrir el formulario de edición. */
import { STEPS } from './config.js';
import { $, hoy } from './utils.js';
import { setFields } from './model.js';
import { state } from './state.js';
import { touch, undoField } from './actions.js';
import { showToast } from './toast.js';
import { openPedido } from './form.js';

/* ===== EVENT DELEGATION: CARDS & TABLE ===== */
export function initListEvents() {
  $('#mainContainer').addEventListener('click', ev => {
    // Marcar / desmarcar etapa: se aplica al instante y se puede deshacer
    const st = ev.target.closest('[data-step]');
    if (st) {
      const id = st.dataset.id, k = st.dataset.step;
      const p = state.pedidos.find(x => x.id === id);
      if (!p) return;
      const label = STEPS.find(s => s.key === k)?.label || k;
      const prev = p[k];
      setFields(p, { [k]: prev ? '' : hoy() });
      touch(p);
      // render() recrea el botón: devuelve el foco para quien navega con teclado
      document.querySelector(`[data-step="${k}"][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      showToast(`${label} ${prev ? 'desmarcada' : 'marcada'}`, () => undoField(id, k, prev));
      return;
    }

    // Edit order
    const ed = ev.target.closest('[data-edit]');
    if (ed) openPedido(ed.dataset.edit);
  });
}
