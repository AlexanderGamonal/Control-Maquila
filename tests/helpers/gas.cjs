/* Simulación de las APIs de Google Apps Script para ejecutar Code.gs REAL en Node (vm).
 * Sirve tanto a las pruebas unitarias como a las de navegador (el "servidor" de la app es Code.gs).
 *
 *   const g = makeGas();                 // hoja vacía, token "t" ya configurado
 *   g.post([registro, …])                // doPost con el token → respuesta JSON
 *   g.get()                              // filas de la hoja como { id: {campo: texto} }
 *   g.adopt([encabezado, fila, …])       // parte de una hoja ya existente (p. ej. versión antigua)
 *   g.editEvent(fila, columna)           // evento como el que recibe onEdit(e)
 */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CODE_GS = path.resolve(__dirname, '../../Code.gs');

function makeGas({ src = CODE_GS, token = 't', tz = 'America/Lima' } = {}) {
  const st = { rows: [], props: {}, locks: 0, released: 0, lockFail: false, formatCalls: 0, tz };
  if (token) st.props.TOKEN = token;
  let exists = false;

  const cell = (r, c) => { const row = st.rows[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; };
  const sheet = {
    getName: () => 'Pedidos',
    getLastRow: () => st.rows.length,
    getMaxRows: () => 1000,
    setFrozenRows() {}, setColumnWidth() {},
    getDataRange: () => ({
      getValues: () => {
        const w = Math.max(0, ...st.rows.map(r => r.length));
        return st.rows.map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; });
      },
    }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues: v => {
        for (let i = 0; i < v.length; i++) {
          const row = st.rows[r - 1 + i] || [];
          for (let j = 0; j < v[i].length; j++) row[c - 1 + j] = v[i][j];
          st.rows[r - 1 + i] = row;
        }
      },
      setValue: v => { const row = st.rows[r - 1] || []; row[c - 1] = v; st.rows[r - 1] = row; },
      getValue: () => cell(r, c),
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
      setNumberFormat() { st.formatCalls++; },
      setFontWeight() {}, setBackground() {}, setFontColor() {},
    }),
  };

  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: () => (exists ? sheet : null),
      insertSheet: () => { exists = true; return sheet; },
    }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => st.props[k] || null,
      setProperty: (k, v) => { st.props[k] = v; },
    }) },
    LockService: { getScriptLock: () => ({
      waitLock: () => { st.locks++; if (st.lockFail) throw new Error('lock timeout'); },
      releaseLock: () => { st.released++; },
    }) },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate: d => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => st.tz },
    ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Logger: { log() {} },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(src, 'utf8'), ctx);

  const call = body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).t);
  return {
    ctx, st,
    call,
    post: records => call({ token: st.props.TOKEN || 't', records }),
    get() {
      if (!st.rows.length) return {};
      const h = st.rows[0], o = {};
      st.rows.slice(1).forEach(r => { const x = {}; h.forEach((k, i) => { x[k] = r[i] === undefined ? '' : String(r[i]); }); o[x.id] = x; });
      return o;
    },
    adopt(rows) { exists = true; st.rows = rows; },
    /* Date creada DENTRO del contexto de vm (si no, `instanceof Date` de Code.gs falla). */
    date: iso => vm.runInContext(`new Date('${iso}')`, ctx),
    editEvent(row, col, nr = 1, nc = 1, sheetName = 'Pedidos') {
      return { range: {
        getSheet: () => ({ getName: () => sheetName, getRange: sheet.getRange }),
        getRow: () => row, getColumn: () => col, getNumRows: () => nr, getNumColumns: () => nc,
      } };
    },
  };
}

module.exports = { makeGas, CODE_GS };
