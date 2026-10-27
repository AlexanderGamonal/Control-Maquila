/* Acciones que modifican pedidos y disparan guardado, pintado y sincronización. */
import { setFields } from './model.js';
import { state, persist } from './state.js';
import { render } from './render.js';
import { scheduleSync } from './sync.js';

/* ===== TOUCH & SYNC TRIGGERS ===== */
export function touch(p) {
  p.updatedAt = Math.max(Date.now(), p.updatedAt + 1, ...Object.values(p.fts));
  state.dirty.add(p.id);
  persist();
  render();
  scheduleSync();
}

/* El deshacer busca el pedido por id: la sincronización reemplaza los objetos de `pedidos`,
   así que una referencia guardada podría quedar desactualizada. */
export function undoField(id, key, prev) {
  const p = state.pedidos.find(x => x.id === id);
  if (!p) return;
  setFields(p, { [key]: prev });
  touch(p);
}
