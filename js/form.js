/* Formulario de pedido (una pantalla; bottom sheet en móvil). */
import { FIELDS } from './config.js';
import { $, esc, hoy, uid, noFormula } from './utils.js';
import { norm, setFields, estado } from './model.js';
import { state } from './state.js';
import { touch, undoField } from './actions.js';
import { showToast } from './toast.js';

/* ===== FORMULARIO DE PEDIDO (una pantalla; bottom sheet en móvil) ===== */
const dlgPedido  = $('#dlgPedido');
const formPedido = $('#formPedido');
const dlgBar     = $('#dlgBar');
let openVals = {};        // valores del formulario al abrirlo: base para saber qué campos cambió la persona
let snapshot = '';        // estado del formulario al abrir, para detectar cambios sin guardar
let barAction = null;     // acción de confirmación del aviso inline

const formState = () => JSON.stringify([...new FormData(formPedido)]);
const isDirty   = () => formState() !== snapshot;

function fieldError(name, msg) {
  const el = $('#err-' + name), input = formPedido.elements[name];
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('visible', !!msg);
  if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
}
function clearErrors() {
  ['marca', 'cantidad', 'peso', 'formula', 'fechaEntrega'].forEach(n => fieldError(n, ''));
}

function updateEstadoPreview() {
  const f = formPedido.elements;
  const e = estado({ estadoManual: f.estadoManual.value, pedidoSistema: f.pedidoSistema.value });
  $('#estadoPreview').innerHTML = `Estado resultante: <strong>${esc(e)}</strong>${f.estadoManual.value ? ' (manual)' : ' (automático)'}`;
}

function showBar({ msg, cancel, confirm, action }) {
  $('#dlgBarMsg').textContent = msg;
  $('#barCancel').textContent = cancel;
  $('#barConfirm').textContent = confirm;
  barAction = action;
  dlgBar.hidden = false;
  $('#barCancel').focus();
}
function hideBar() { dlgBar.hidden = true; barAction = null; }

export function openPedido(id) {
  formPedido.reset();
  clearErrors();
  hideBar();

  const p = id ? state.pedidos.find(x => x.id === id) : null;
  $('#dlgTitle').textContent = p ? 'Editar pedido' : 'Nuevo pedido';
  $('#dangerZone').hidden = !p;

  if (p) {
    for (const el of formPedido.elements) {
      if (el.name && el.name in p) el.value = p[el.name] ?? '';
    }
  } else {
    formPedido.elements.fechaPedido.value = hoy();
  }
  updateEstadoPreview();
  snapshot = formState();
  openVals = Object.fromEntries(new FormData(formPedido));
  dlgPedido.showModal();
  dlgPedido.querySelector('.dlg-body').scrollTop = 0;
  if (!p) formPedido.elements.marca.focus({ preventScroll: true });
}

/* Cerrar: si hay cambios sin guardar pide confirmación dentro del propio formulario */
function requestClose() {
  if (!isDirty()) { dlgPedido.close(); return; }
  showBar({
    msg: 'Tienes cambios sin guardar. ¿Descartarlos?',
    cancel: 'Seguir editando', confirm: 'Descartar',
    action: () => dlgPedido.close(),
  });
}

function validateForm() {
  clearErrors();
  const f = formPedido.elements;
  const errs = {};
  if (!f.marca.value.trim()) errs.marca = 'Ingresa la marca o cliente.';
  const cant = Number(f.cantidad.value);
  if (!(cant > 0)) errs.cantidad = 'Ingresa una cantidad mayor a 0.';
  else if (!Number.isInteger(cant)) errs.cantidad = 'Debe ser un número entero.';
  if (!(Number(f.peso.value) > 0)) errs.peso = 'Ingresa el peso en gramos (mayor a 0).';
  if (!f.formula.value) errs.formula = 'Selecciona una fórmula.';
  if (f.fechaPedido.value && f.fechaEntrega.value && f.fechaEntrega.value < f.fechaPedido.value) {
    errs.fechaEntrega = 'La entrega no puede ser anterior a la fecha de pedido.';
  }
  const names = Object.keys(errs);
  names.forEach(n => fieldError(n, errs[n]));
  if (names.length) {
    const first = formPedido.elements[['marca', 'cantidad', 'peso', 'formula', 'fechaEntrega'].find(n => errs[n])];
    first.focus({ preventScroll: true });
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }
  return true;
}

function savePedido() {
  if (!validateForm()) return;
  const f = Object.fromEntries(new FormData(formPedido));
  f.observaciones = noFormula(f.observaciones);
  f.marca = noFormula(f.marca.trim());

  let p = f.id ? state.pedidos.find(x => x.id === f.id) : null;
  const isNew = !p;
  if (isNew) { p = norm({ id: f.id || uid() }); state.pedidos.push(p); }
  /* Solo se aplican los campos que la persona cambió en este formulario. Los demás conservan el
     valor actual del pedido, que puede haber llegado de otro dispositivo mientras estaba abierto. */
  const changes = {};
  FIELDS.forEach(k => {
    if (!(k in f)) return;
    if (isNew || String(f[k]) !== String(openVals[k] ?? '')) changes[k] = f[k];
  });
  setFields(p, changes);
  touch(p);
  dlgPedido.close();
}

export function initForm() {
  formPedido.addEventListener('submit', ev => { ev.preventDefault(); savePedido(); });

  // Limpia el error de un campo al corregirlo y refresca el estado resultante
  formPedido.addEventListener('input', ev => {
    if (ev.target.name && $('#err-' + ev.target.name)) fieldError(ev.target.name, '');
    updateEstadoPreview();
  });
  formPedido.addEventListener('change', updateEstadoPreview);

  // Botones "Hoy" y "Quitar fecha"
  formPedido.addEventListener('click', ev => {
    const hoyBtn = ev.target.closest('[data-hoy]');
    const clrBtn = ev.target.closest('[data-limpiar]');
    const name = hoyBtn?.dataset.hoy || clrBtn?.dataset.limpiar;
    if (!name) return;
    formPedido.elements[name].value = hoyBtn ? hoy() : '';
    formPedido.elements[name].dispatchEvent(new Event('input', { bubbles: true }));
  });

  $('#btnPedidoClose').addEventListener('click', requestClose);
  $('#btnPedidoCancel').addEventListener('click', requestClose);
  $('#barCancel').addEventListener('click', () => { hideBar(); });
  $('#barConfirm').addEventListener('click', () => { const a = barAction; hideBar(); if (a) a(); });

  // Esc: si el aviso está abierto lo cierra; si no, intenta cerrar el formulario
  dlgPedido.addEventListener('cancel', ev => {
    ev.preventDefault();
    if (!dlgBar.hidden) hideBar(); else requestClose();
  });
  dlgPedido.addEventListener('close', hideBar);

  // Tocar el fondo cierra solo si el gesto empezó y terminó fuera (seleccionar texto no cuenta)
  let downOnBackdrop = false;
  dlgPedido.addEventListener('pointerdown', ev => { downOnBackdrop = ev.target === dlgPedido; });
  dlgPedido.addEventListener('click', ev => { if (ev.target === dlgPedido && downOnBackdrop) requestClose(); });

  $('#btnDelete').addEventListener('click', () => {
    const p = state.pedidos.find(x => x.id === formPedido.elements.id.value);
    if (!p) return;
    showBar({
      msg: `¿Eliminar el pedido de "${p.marca}"? Si el cliente canceló, es mejor marcarlo como «Anulado» para conservar el historial.`,
      cancel: 'Cancelar', confirm: 'Eliminar',
      action: () => {
        const id = p.id, nombre = p.marca;
        setFields(p, { deleted: true }); touch(p); dlgPedido.close();
        showToast(`Pedido de "${nombre}" eliminado`, () => undoField(id, 'deleted', false));
      },
    });
  });

  $('#btnNew').addEventListener('click', () => openPedido(null));
}
