/* Estado compartido de la app. Es un objeto único (no variables sueltas) porque un módulo no
   puede reasignar lo que importa de otro: se muta `state.pedidos = …` en lugar de `pedidos = …`. */
import { LS_DATA, LS_CFG, LS_DIRTY, LS_VIEW } from './config.js';
import { load, lsGet } from './utils.js';
import { norm } from './model.js';
import { setStatus } from './status.js';

/* ===== APP STATE ===== */
export const state = {
  pedidos:      load(LS_DATA, []).map(norm),
  cfg:          load(LS_CFG, { url: '', token: '' }),
  dirty:        new Set(load(LS_DIRTY, [])),
  activeFilter: 'activos',
  viewMode:     lsGet(LS_VIEW) || 'cards',   // 'cards' | 'table'
};

export function persist() {
  try {
    localStorage.setItem(LS_DATA, JSON.stringify(state.pedidos));
    localStorage.setItem(LS_DIRTY, JSON.stringify([...state.dirty]));
  } catch { setStatus('Error al guardar localmente', 'bad'); }
}
