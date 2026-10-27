/* Pintado de la lista (tarjetas / tabla), los chips de resumen y el estado vacío.
   El HTML que genera es el mismo de siempre: el diseño vive en css/ y en index.html. */
import { STEPS, STATUS_META } from './config.js';
import { $, esc, fmt, dias, hoy } from './utils.js';
import { estado, activo, getFormulaClass, getAvatarStyle } from './model.js';
import { state } from './state.js';

/* ===== MAIN RENDER ===== */
export function render() {
  const q = ($('#q').value || '').trim().toLowerCase();
  const t = hoy();
  const vis = state.pedidos.filter(p => !p.deleted);
  const act = vis.filter(activo);

  // Summary KPIs
  const cnt = s => vis.filter(p => estado(p) === s).length;
  const late = act.filter(p => p.fechaEntrega && p.fechaEntrega < t).length;
  const soon = act.filter(p => p.fechaEntrega && dias(p.fechaEntrega) >= 0 && dias(p.fechaEntrega) <= 3).length;
  const und  = act.reduce((a,p) => a + p.cantidad, 0);

  const chips = [
    { cls:'', icon:'icon-box', text:`${act.length} Activos` },
    { cls:'highlight', icon:'icon-layers', text:`${und.toLocaleString('es-PE')} Unidades` },
    cnt('En producción') ? { cls:'', icon:'icon-clock', text:`${cnt('En producción')} En producción` } : null,
    soon ? { cls:'warn', icon:'icon-calendar', text:`${soon} Próximos a vencer` } : null,
    late ? { cls:'danger', icon:'icon-alert', text:`${late} Atrasado${late>1?'s':''}` } : null,
  ].filter(Boolean);

  $('#summaryRow').innerHTML = chips.map(c =>
    `<div class="kpi-chip ${c.cls}">
      <svg class="svg-icon"><use href="#${c.icon}"/></svg>
      <span>${c.text}</span>
    </div>`
  ).join('');

  // Filter and sort
  const list = vis.filter(p => {
    const e = estado(p);
    if (state.activeFilter === 'activos' && !activo(p)) return false;
    if (state.activeFilter !== 'activos' && state.activeFilter !== 'todos' && e !== state.activeFilter) return false;
    if (q && !(p.marca + ' ' + p.observaciones + ' ' + p.formula).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    const A = a.fechaEntrega || '9999', B = b.fechaEntrega || '9999';
    return A < B ? -1 : A > B ? 1 : b.updatedAt - a.updatedAt;
  });

  // Container
  const container = $('#mainContainer');
  if (!list.length) {
    container.innerHTML = `
      <div class="empty-box">
        <div class="empty-icon-wrap">
          <svg class="svg-icon"><use href="#icon-box"/></svg>
        </div>
        <div class="empty-title">${vis.length ? 'Sin pedidos para este filtro' : 'Aún no hay pedidos registrados'}</div>
        <div class="empty-desc">${vis.length ? 'Prueba cambiando los filtros o la búsqueda.' : 'Presiona el botón naranja + para registrar el primer pedido de maquila.'}</div>
      </div>
    `;
    return;
  }

  if (state.viewMode === 'table') {
    container.innerHTML = renderTable(list);
  } else {
    container.innerHTML = `<div class="cards-grid">${list.map(renderCard).join('')}</div>`;
  }
}

/* ===== CARDS RENDER ===== */
export function renderCard(p) {
  const e = estado(p);
  const sm = STATUS_META[e] || STATUS_META['Pendiente'];
  const av = getAvatarStyle(p.marca, p.formula);
  const fCls = getFormulaClass(p.formula);

  // Countdown / Delivery alert
  let deliveryHtml = '';
  if (p.fechaEntrega) {
    const d = dias(p.fechaEntrega);
    let cdCls = 'cd-normal', cdText = '';
    if (activo(p)) {
      if (d < 0)       { cdCls = 'cd-late'; cdText = `Atrasado ${-d} d`; }
      else if (d === 0){ cdCls = 'cd-today'; cdText = '¡Hoy!'; }
      else if (d === 1){ cdCls = 'cd-soon'; cdText = 'Mañana'; }
      else if (d <= 3) { cdCls = 'cd-soon'; cdText = `Faltan ${d} d`; }
      else             { cdCls = 'cd-normal'; cdText = `En ${d} d`; }
    }
    deliveryHtml = `
      <div class="delivery-row">
        <span class="delivery-label">
          <svg class="svg-icon"><use href="#icon-calendar"/></svg>
          Entrega: ${fmt(p.fechaEntrega)}
        </span>
        ${cdText ? `<span class="countdown-tag ${cdCls}">${cdText}</span>` : ''}
      </div>
    `;
  }

  // Connected Progress Pipeline
  const stepsHtml = STEPS.map(s => {
    const done = !!p[s.key];
    return `
      <button type="button" class="step-item ${done ? 'completed' : ''}" data-step="${s.key}" data-id="${esc(p.id)}" title="${s.label}: clic para marcar/desmarcar" aria-pressed="${done}" aria-label="${s.label}${done ? ' (completado ' + fmt(p[s.key]) + ')' : ' (pendiente)'}">
        <div class="step-node">
          ${done ? '<svg class="svg-icon" style="font-size:0.8rem;"><use href="#icon-check"/></svg>' : s.stepNum}
        </div>
        <div class="step-name">${s.short}</div>
        <div class="step-date">${done ? fmt(p[s.key]) : '—'}</div>
      </button>
    `;
  }).join('');

  return `
    <article class="order-card ${sm.cardCls}" data-id="${esc(p.id)}">
      <!-- Card Top: Client, Formula & Status -->
      <div class="card-top">
        <div class="client-info">
          <div class="client-avatar ${av.cls}">${av.char}</div>
          <div class="client-text">
            <div class="client-name" title="${esc(p.marca)}">${esc(p.marca)}</div>
            ${p.formula ? `<span class="client-formula ${fCls}">${esc(p.formula)}</span>` : ''}
          </div>
        </div>
        <span class="status-badge ${sm.cls}">
          <span class="dot"></span>
          <span>${esc(e)}</span>
        </span>
      </div>

      <!-- Metrics strip: Cantidad & Gramaje -->
      <div class="card-metrics">
        <span class="metric-item">
          <svg class="svg-icon"><use href="#icon-box"/></svg>
          <span class="metric-value">${p.cantidad.toLocaleString('es-PE')}</span> und
        </span>
        <span class="metric-sep" aria-hidden="true">•</span>
        <span class="metric-item">
          <span class="metric-value">${p.peso}</span> g
        </span>
        ${p.fechaPedido ? `
          <span class="metric-sep" aria-hidden="true">•</span>
          <span class="metric-item">
            Ped: <span class="metric-value">${fmt(p.fechaPedido)}</span>
          </span>
        ` : ''}
      </div>

      ${deliveryHtml}

      <!-- Interactive Step Pipeline -->
      <div class="step-pipeline">
        ${stepsHtml}
      </div>

      <!-- Observations note if any -->
      ${p.observaciones ? `<div class="card-note">${esc(p.observaciones)}</div>` : ''}

      <!-- Card Action Footer -->
      <div class="card-bottom">
        <button type="button" class="card-action-btn" data-edit="${esc(p.id)}">
          <svg class="svg-icon"><use href="#icon-edit"/></svg>
          <span>Editar</span>
        </button>
      </div>
    </article>
  `;
}

/* ===== TABLE RENDER (COMPACT DATA GRID) ===== */
export function renderTable(list) {
  const rows = list.map(p => {
    const e = estado(p);
    const sm = STATUS_META[e] || STATUS_META['Pendiente'];
    const av = getAvatarStyle(p.marca, p.formula);
    const fCls = getFormulaClass(p.formula);

    // Delivery column
    let delivCol = fmt(p.fechaEntrega) || '—';
    if (p.fechaEntrega && activo(p)) {
      const d = dias(p.fechaEntrega);
      if (d < 0) delivCol += ` <span class="countdown-tag cd-late">${-d}d atr</span>`;
      else if (d === 0) delivCol += ` <span class="countdown-tag cd-today">Hoy</span>`;
      else if (d <= 3) delivCol += ` <span class="countdown-tag cd-soon">${d}d</span>`;
    }

    return `
      <tr class="${sm.cardCls}">
        <td>
          <div class="table-client">
            <div class="table-avatar ${av.cls}">${av.char}</div>
            <div>
              <div class="table-name" title="${esc(p.marca)}">${esc(p.marca)}</div>
              ${p.formula ? `<span class="client-formula ${fCls}" style="font-size:0.75rem;">${esc(p.formula)}</span>` : ''}
            </div>
          </div>
        </td>
        <td style="font-weight:700;">${p.cantidad.toLocaleString('es-PE')}</td>
        <td>${p.peso} g</td>
        <td>${fmt(p.fechaPedido) || '—'}</td>
        <td>${delivCol}</td>
        <td>
          <button type="button" class="table-toggle-btn ${p.ampliacionDigesa ? 'done' : ''}" data-step="ampliacionDigesa" data-id="${esc(p.id)}">
            <svg class="svg-icon"><use href="#icon-${p.ampliacionDigesa ? 'check' : 'clock'}"/></svg>
            ${p.ampliacionDigesa ? fmt(p.ampliacionDigesa) : 'Pend'}
          </button>
        </td>
        <td>
          <button type="button" class="table-toggle-btn ${p.arteAprobado ? 'done' : ''}" data-step="arteAprobado" data-id="${esc(p.id)}">
            <svg class="svg-icon"><use href="#icon-${p.arteAprobado ? 'check' : 'clock'}"/></svg>
            ${p.arteAprobado ? fmt(p.arteAprobado) : 'Pend'}
          </button>
        </td>
        <td>
          <button type="button" class="table-toggle-btn ${p.pedidoSistema ? 'done' : ''}" data-step="pedidoSistema" data-id="${esc(p.id)}">
            <svg class="svg-icon"><use href="#icon-${p.pedidoSistema ? 'check' : 'clock'}"/></svg>
            ${p.pedidoSistema ? fmt(p.pedidoSistema) : 'Pend'}
          </button>
        </td>
        <td>
          <span class="status-badge ${sm.cls}">
            <span class="dot"></span>
            ${esc(e)}
          </span>
        </td>
        <td>
          <button type="button" class="card-action-btn" data-edit="${esc(p.id)}">
            <svg class="svg-icon"><use href="#icon-edit"/></svg>
            <span>Editar</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Marca / Cliente</th>
            <th>Cantidad</th>
            <th>Peso</th>
            <th>F. Pedido</th>
            <th>F. Entrega</th>
            <th>DIGESA</th>
            <th>Arte</th>
            <th>Sistema</th>
            <th>Estado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
