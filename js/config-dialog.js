/* Diálogo de configuración de Google Sheets (URL del Web App + token). */
import { LS_CFG } from './config.js';
import { $ } from './utils.js';
import { state, persist } from './state.js';
import { sync, resetResendKey } from './sync.js';

/* ===== CONFIG DIALOG (SHEETS) ===== */
export function initConfigDialog() {
  const dlgCfg = $('#dlgCfg');
  const formCfg = $('#formCfg');

  $('#btnCfg').addEventListener('click', () => {
    formCfg.elements.url.value = state.cfg.url;
    formCfg.elements.token.value = state.cfg.token;
    const dlgPedido = $('#dlgPedido');
    if (dlgPedido.open) { dlgPedido.close(); }
    dlgCfg.showModal();
  });
  $('#btnCfgCancel').addEventListener('click', () => dlgCfg.close());
  $('#btnCfgX').addEventListener('click', () => dlgCfg.close());
  dlgCfg.addEventListener('click', ev => { if (ev.target === dlgCfg) dlgCfg.close(); });

  formCfg.addEventListener('submit', ev => {
    ev.preventDefault();
    const prevUrl = state.cfg.url;
    state.cfg = { url: formCfg.elements.url.value.trim(), token: formCfg.elements.token.value.trim() };
    try { localStorage.setItem(LS_CFG, JSON.stringify(state.cfg)); } catch {}
    // Hoja distinta (o primera conexión): todo lo que hay en este equipo se envía a la nueva hoja.
    // Si la hoja ya tiene datos, se fusionan por fecha de modificación (gana el más reciente).
    if (state.cfg.url && state.cfg.url !== prevUrl && state.pedidos.length) {
      state.pedidos.forEach(p => state.dirty.add(p.id));
      resetResendKey();
      persist();
    }
    dlgCfg.close();
    sync();
  });
}
