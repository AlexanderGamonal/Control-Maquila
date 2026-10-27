/* Punto de entrada. El orden de arranque es el mismo que tenía el script único:
   registrar eventos → tema → vista inicial (primer pintado) → atajo "nuevo" → primera sincronización. */
import { initTheme } from './theme.js';
import { initControls, setViewMode } from './controls.js';
import { initListEvents } from './list-events.js';
import { initForm, openPedido } from './form.js';
import { initConfigDialog } from './config-dialog.js';
import { initSync, sync } from './sync.js';
import { state } from './state.js';

initListEvents();
initForm();
initConfigDialog();
initControls();
initSync();

/* ===== SERVICE WORKER ===== */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/* ===== INIT APP ===== */
initTheme();
setViewMode(state.viewMode);

// Acceso directo de la app instalada (manifest → "Nuevo pedido")
if (new URLSearchParams(location.search).has('nuevo')) {
  history.replaceState(null, '', location.pathname);
  openPedido(null);
}
sync();
