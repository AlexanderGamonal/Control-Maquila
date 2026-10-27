/* ===== CONSTANTS & STORAGE KEYS ===== */
export const LS_DATA  = 'maquila_pedidos_v2';
export const LS_CFG   = 'maquila_cfg_v2';
export const LS_DIRTY = 'maquila_dirty_v2';
export const LS_VIEW  = 'maquila_view_v1';
export const LS_THEME = 'maquila_theme_v1';

export const STEPS = [
  { key: 'ampliacionDigesa', short: 'DIGESA',  label: 'Ampliación DIGESA',      stepNum: '1' },
  { key: 'arteAprobado',     short: 'Arte',    label: 'Aprobación del arte',    stepNum: '2' },
  { key: 'pedidoSistema',    short: 'Sistema', label: 'Pedido en sistema',      stepNum: '3' },
];

/* Campos que se fusionan de forma independiente entre dispositivos. Cada uno lleva su propia
   fecha de última edición (fts), así dos vendedores que cambian campos distintos del mismo
   pedido no se pisan. Misma lista y misma regla en Code.gs. */
export const FIELDS = ['marca','cantidad','peso','formula','fechaPedido','fechaEntrega',
                       'ampliacionDigesa','arteAprobado','pedidoSistema','estadoManual','observaciones','deleted'];

export const STATUS_META = {
  'Pendiente':     { cls: 'sb-pendiente',  cardCls: 'status-pendiente' },
  'En producción': { cls: 'sb-produccion', cardCls: 'status-produccion' },
  'En pausa':      { cls: 'sb-pausa',      cardCls: 'status-pausa' },
  'Entregado':     { cls: 'sb-entregado',  cardCls: 'status-entregado' },
  'Anulado':       { cls: 'sb-anulado',    cardCls: 'status-anulado' },
};
