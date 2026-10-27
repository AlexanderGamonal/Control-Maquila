/* Sincronización con Google Sheets. La fusión nunca descarta datos locales (ver README). */
import { $ } from './utils.js';
import { norm, mergeRec, sameRec } from './model.js';
import { state, persist } from './state.js';
import { setStatus } from './status.js';
import { render } from './render.js';

/* ===== GOOGLE SHEETS SYNC ===== */
let syncing = false, syncTimer = null, lastResendKey = '';

export function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 800); }

/* Al cambiar de hoja se vuelve a intentar enviar todo, sin la guarda anti-bucle anterior. */
export function resetResendKey() { lastResendKey = ''; }

export async function sync() {
  const { cfg, dirty } = state;
  if (!cfg.url || !cfg.token) {
    setStatus(dirty.size ? `Local (${dirty.size} pendientes)` : 'Datos guardados localmente', 'warn');
    return;
  }
  if (syncing) { scheduleSync(); return; }
  syncing = true;
  setStatus('Sincronizando…');
  const btnSync = $('#btnSync');
  btnSync.classList.add('spinning');

  const toSend = state.pedidos.filter(p => dirty.has(p.id));
  const sentMap = new Map(toSend.map(p => [p.id, p.updatedAt]));
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: cfg.token, records: toSend.map(p => ({ ...p, fts: undefined, fieldTs: JSON.stringify(p.fts) })) }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error en Google Sheets');
    if (!Array.isArray(data.records)) throw new Error('respuesta inválida');

    sentMap.forEach((u, id) => {
      const p = state.pedidos.find(x => x.id === id);
      if (p && p.updatedAt === u) dirty.delete(id);
    });

    /* Fusión que NUNCA descarta datos locales: lo que la hoja no tenga (hoja nueva, vacía,
       borrada o restaurada a una versión antigua) se conserva y se vuelve a enviar. */
    const remoteMap = new Map(data.records.map(r => { const n = norm(r); return [n.id, n]; }));
    const merged = new Map(remoteMap);
    const resend = [];
    state.pedidos.forEach(p => {
      const remote = remoteMap.get(p.id);
      if (!remote) { merged.set(p.id, p); resend.push(p.id); return; }   // la hoja no lo tiene
      const m = mergeRec(p, remote);                                     // campo por campo: gana lo más reciente
      merged.set(p.id, m);
      if (!sameRec(m, remote)) resend.push(p.id);                        // el equipo aporta algo que la hoja no tiene
    });
    state.pedidos = [...merged.values()];

    let retry = false;
    if (resend.length) {
      resend.forEach(id => dirty.add(id));
      const key = resend.slice().sort().join(',');
      retry = key !== lastResendKey;   // si ya lo intentamos y la hoja sigue sin guardarlos, no insistir en bucle
      lastResendKey = key;
    } else {
      lastResendKey = '';
    }
    persist();
    render();

    const h = new Date().toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
    if (!resend.length) setStatus(`Sincronizado ${h}`, 'ok');
    else if (retry) setStatus(`Enviando ${resend.length} pedido${resend.length > 1 ? 's' : ''} a la hoja…`, 'warn');
    else setStatus(`La hoja no guardó ${resend.length} pedido${resend.length > 1 ? 's' : ''} · siguen seguros en este equipo`, 'warn');
    if (retry) scheduleSync();
  } catch(e) {
    setStatus(
      e.message === 'token'          ? 'Token incorrecto (revisa ⚙)'
      : e instanceof TypeError       ? `Sin conexión · ${dirty.size} guardados local`
      : e instanceof SyntaxError     ? 'La URL no responde como la hoja (revisa ⚙)'
      :                                `Error de la hoja: ${e.message}`,
      'warn'
    );
  } finally {
    syncing = false;
    btnSync.classList.remove('spinning');
  }
}

export function initSync() {
  $('#btnSync').addEventListener('click', sync);
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(() => { if (!document.hidden) sync(); }, 120_000);
}
