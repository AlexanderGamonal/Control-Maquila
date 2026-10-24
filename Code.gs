/**
 * Control de Maquila de Panetones
 * Google Apps Script — Backend para sincronización con Google Sheets
 *
 * INSTRUCCIONES DE INSTALACIÓN:
 * 1. Crea un Google Sheet nuevo
 * 2. Ve a Extensiones → Apps Script
 * 3. Pega este código (reemplaza todo el contenido)
 * 4. Ejecuta UNA VEZ la función  generarToken  (menú superior → ▶ Ejecutar).
 *    Autoriza los permisos y copia el token que aparece en el Registro de
 *    ejecución. El token queda guardado en Propiedades del script, NO en el código.
 * 5. Ve a Implementar → Nueva implementación → Aplicación web
 *    - Ejecutar como: Yo
 *    - Acceso: Cualquier usuario
 * 6. Copia la URL que termina en /exec
 * 7. En la app, pega esa URL y el token en ⚙ Configuración
 *
 * IMPORTANTE: Cada vez que edites el script, crea una NUEVA versión
 * en Implementar → Administrar implementaciones, de lo contrario
 * seguirá ejecutando el código viejo.
 *
 * Para rotar el token: vuelve a ejecutar generarToken y actualiza la app.
 */

const SHEET_NAME = "Pedidos";
const COLS = [
  "id","marca","cantidad","peso","formula",
  "fechaPedido","fechaEntrega",
  "ampliacionDigesa","arteAprobado","pedidoSistema",
  "estadoManual","observaciones","updatedAt","deleted","fieldTs"
];
// Campos que se fusionan de forma independiente (cada uno con su propia fecha de edición en fieldTs).
// Misma lista y misma regla que FIELDS / mergeRec en index.html.
const MERGE_FIELDS = [
  "marca","cantidad","peso","formula","fechaPedido","fechaEntrega",
  "ampliacionDigesa","arteAprobado","pedidoSistema","estadoManual","observaciones","deleted"
];
const DATE_COLS = ["fechaPedido","fechaEntrega","ampliacionDigesa","arteAprobado","pedidoSistema"];
const LOCK_TIMEOUT_MS = 20000;
let formatted_ = false;     // el formato de texto se aplica una vez por ejecución
let headerChecked_ = false; // la migración del encabezado se revisa una vez por ejecución

/* ===== Token (guardado en Propiedades del script) ===== */
function getToken_() {
  return PropertiesService.getScriptProperties().getProperty("TOKEN") || "";
}

/** Ejecutar una vez desde el editor: crea un token aleatorio y lo muestra en el registro. */
function generarToken() {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("TOKEN", token);
  Logger.log("TOKEN (cópialo en la app, ⚙ Configuración): " + token);
  return token;
}

/** Comparación en tiempo constante para no filtrar el token por tiempos de respuesta. */
function tokenOk_(given) {
  const real = getToken_();
  if (!real || typeof given !== "string" || given.length !== real.length) return false;
  let diff = 0;
  for (let i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/* ===== GET: solo estado. Nunca devuelve datos (la app usa POST; el token no debe ir en la URL) ===== */
function doGet() {
  return jsonOut({ ok: true, service: "control-maquila" });
}

/* ===== POST: recibir y guardar pedidos (upsert por ID) y devolver todo ===== */
function doPost(e) {
  let lock, locked = false;
  try {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut({ ok: false, error: "JSON inválido" });
    }

    if (!getToken_()) return jsonOut({ ok: false, error: "token no configurado (ejecuta generarToken)" });
    if (!tokenOk_(body.token)) return jsonOut({ ok: false, error: "token" });

    // Un solo escritor a la vez: evita filas duplicadas si dos dispositivos sincronizan juntos
    lock = LockService.getScriptLock();
    lock.waitLock(LOCK_TIMEOUT_MS);
    locked = true;

    const records = Array.isArray(body.records) ? body.records : [];
    if (records.length > 0) upsertAll(records);

    return jsonOut({ ok: true, records: readAll() });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  } finally {
    if (locked) lock.releaseLock();
  }
}

/* ===== Texto seguro: Sheets no debe interpretar el contenido como fórmula ===== */
function safeText_(v) {
  const t = String(v === undefined || v === null ? "" : v).replace(/^[\t\r]+/, "");
  return /^[=+@]/.test(t) ? " " + t : t;   // el "-" es válido ("-5% descuento")
}

/* ===== Fecha a texto yyyy-MM-dd (acepta Date de Sheets o texto) ===== */
function dateText_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(v === undefined || v === null ? "" : v);
}

/* ===== Leer todos los registros ===== */
function readAll() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];  // solo encabezado o vacío
  const headers = data[0];
  return data.slice(1)
    .filter(row => String(row[0]) !== "")
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        const v = row[i] === undefined ? "" : row[i];
        obj[h] = DATE_COLS.indexOf(h) >= 0 ? dateText_(v) : String(v);
      });
      return obj;
    });
}

/* ===== Fusión por campo =====
   Un pedido es un conjunto de campos, cada uno con la fecha de su última edición (fieldTs).
   Dos versiones del mismo pedido se combinan campo por campo: gana la edición más reciente de
   cada campo. Así, si dos vendedores cambian campos distintos, se conservan los dos cambios. */

/** Registro (de la app o de la hoja) → { id, vals: {campo: texto}, fts: {campo: ms}, updatedAt } */
function normRec_(rec) {
  const vals = {};
  MERGE_FIELDS.forEach(f => {
    let v = rec[f] === undefined || rec[f] === null ? "" : rec[f];
    if (f === "deleted") {
      vals[f] = (v === true || v === 1 || v === "1" || v === "TRUE" || v === "true") ? "true" : "false";
    } else if (f === "cantidad" || f === "peso") {
      vals[f] = String(Number(v) || 0);
    } else if (DATE_COLS.indexOf(f) >= 0) {
      vals[f] = dateText_(v).slice(0, 10);
    } else if (f === "marca" || f === "observaciones") {
      vals[f] = safeText_(v);
    } else {
      vals[f] = String(v);
    }
  });
  const base = Number(rec.updatedAt) || 0;
  let parsed = null;
  try { parsed = rec.fieldTs ? JSON.parse(rec.fieldTs) : null; } catch (err) { parsed = null; }
  const fts = {};
  // Registros antiguos (sin fieldTs): todos los campos valen su updatedAt
  MERGE_FIELDS.forEach(f => { const t = Number(parsed && parsed[f]); fts[f] = t > 0 ? t : base; });
  return { id: String(rec.id || ""), vals: vals, fts: fts, updatedAt: base };
}

/** Gana, por campo, la edición más reciente. `a` = lo que llega, `b` = lo que ya hay en la hoja.
 *  Con la misma fecha y distinto valor (p. ej. una celda editada a mano) gana la hoja. */
function mergeRec_(a, b) {
  const vals = {}, fts = {};
  let maxTs = Math.max(a.updatedAt, b.updatedAt);
  MERGE_FIELDS.forEach(f => {
    const ta = a.fts[f], tb = b.fts[f];
    const pickB = tb >= ta;
    vals[f] = pickB ? b.vals[f] : a.vals[f];
    fts[f] = Math.max(ta, tb);
    if (fts[f] > maxTs) maxTs = fts[f];
  });
  return { id: a.id, vals: vals, fts: fts, updatedAt: maxTs };
}

function toRow_(m) {
  return COLS.map(col => {
    if (col === "id") return m.id;
    if (col === "updatedAt") return String(m.updatedAt);
    if (col === "fieldTs") return JSON.stringify(m.fts);
    return m.vals[col];
  });
}

/* ===== Upsert por ID con fusión por campo, escritura por lotes ===== */
function upsertAll(records) {
  const sheet = getOrCreateSheet();
  const data  = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("id");

  // id → índice de fila en `data` (0 = encabezado)
  const idMap = {};
  data.forEach((row, i) => { if (i > 0) idMap[String(row[idCol])] = i; });

  const rowToObj = row => { const o = {}; headers.forEach((h, i) => { o[h] = row[i] === undefined ? "" : row[i]; }); return o; };

  const newRecs = [];   // filas nuevas, se escriben de una sola vez
  const newIdx = {};    // id → posición en newRecs (por si el lote trae el mismo id dos veces)
  const updates = {};   // índice de fila → registro fusionado (varias versiones en un lote se acumulan)

  records.forEach(rec => {
    const incoming = normRec_(rec);
    if (!incoming.id) return;
    const id = incoming.id;

    if (idMap[id] !== undefined) {
      const rowIdx = idMap[id];
      const current = updates[rowIdx] || normRec_(rowToObj(data[rowIdx]));
      updates[rowIdx] = mergeRec_(incoming, current);
    } else if (newIdx[id] !== undefined) {
      newRecs[newIdx[id]] = mergeRec_(incoming, newRecs[newIdx[id]]);
    } else {
      newIdx[id] = newRecs.length;
      newRecs.push(incoming);
    }
  });

  Object.keys(updates).forEach(k => {
    const rowIdx = Number(k);
    const row = toRow_(updates[k]);
    const before = toRow_(normRec_(rowToObj(data[rowIdx]))).join("\u0001");
    if (row.join("\u0001") !== before) {   // solo escribe si algo cambió
      sheet.getRange(rowIdx + 1, 1, 1, row.length).setValues([row]);
    }
  });

  if (newRecs.length) {
    const rows = newRecs.map(toRow_);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, COLS.length).setValues(rows);
  }
}

/* ===== Ediciones manuales en la hoja =====
   Trigger simple (se activa solo, sin instalar nada): cuando alguien edita una celda a mano,
   se sella la fecha de ese campo en fieldTs para que compita en igualdad con las ediciones de
   la app (gana la más reciente). Las escrituras del propio script no lo disparan. */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const rg = e.range, sh = rg.getSheet();
    if (sh.getName() !== SHEET_NAME) return;
    const r0 = rg.getRow(), c0 = rg.getColumn();
    const nr = Math.min(rg.getNumRows(), 500), nc = rg.getNumColumns();
    if (r0 < 2) return;                                   // encabezado
    const hdr = sh.getRange(1, 1, 1, COLS.length).getValues()[0];
    const tsCol = hdr.indexOf("fieldTs") + 1, upCol = hdr.indexOf("updatedAt") + 1;
    if (!tsCol || !upCol) return;
    const touched = [];
    for (let c = c0; c < c0 + nc; c++) {
      const name = hdr[c - 1];
      if (MERGE_FIELDS.indexOf(name) >= 0) touched.push(name);
    }
    if (!touched.length) return;
    const now = Date.now();
    for (let r = r0; r < r0 + nr; r++) {
      const row = sh.getRange(r, 1, 1, COLS.length).getValues()[0];
      if (!String(row[hdr.indexOf("id")])) continue;      // fila sin id: no es un pedido
      const obj = {};
      hdr.forEach((h, i) => { obj[h] = row[i]; });
      const cur = normRec_(obj);                          // fechas actuales (o su valor base si es una fila antigua)
      touched.forEach(f => { cur.fts[f] = now; });
      sh.getRange(r, tsCol).setValue(JSON.stringify(cur.fts));
      sh.getRange(r, upCol).setValue(String(now));
    }
  } catch (err) { /* un trigger simple nunca debe romper la edición del usuario */ }
}

/* ===== Obtener o crear la hoja ===== */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // crear encabezados con formato
    const headerRange = sheet.getRange(1, 1, 1, COLS.length);
    headerRange.setValues([COLS]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#f07021");
    headerRange.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    // anchos de columna sugeridos
    sheet.setColumnWidth(1, 140);  // id
    sheet.setColumnWidth(2, 180);  // marca
    sheet.setColumnWidth(3, 100);  // cantidad
    sheet.setColumnWidth(4, 80);   // peso
    sheet.setColumnWidth(5, 100);  // formula
    sheet.setColumnWidth(12, 220); // observaciones
  }
  // Hojas creadas con versiones anteriores: agrega las columnas nuevas (p. ej. fieldTs) al encabezado
  if (!headerChecked_) {
    const hdr = sheet.getRange(1, 1, 1, COLS.length).getValues()[0];
    COLS.forEach((c, i) => {
      if (!hdr[i]) {
        const cell = sheet.getRange(1, i + 1);
        cell.setValue(c);
        cell.setFontWeight("bold");
        cell.setBackground("#f07021");
        cell.setFontColor("#ffffff");
      }
    });
    headerChecked_ = true;
  }
  // Todo como texto plano: las fechas no se convierten a Date (evita desfases de zona
  // horaria) y nada se interpreta como fórmula. Idempotente: también corrige hojas existentes.
  if (!formatted_) {
    sheet.getRange(1, 1, sheet.getMaxRows(), COLS.length).setNumberFormat("@");
    formatted_ = true;
  }
  return sheet;
}

/* ===== Helper: responder JSON ===== */
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===== TEST (ejecutar desde el editor para probar) ===== */
function testLocal() {
  const sheet = getOrCreateSheet();
  Logger.log("Hoja: " + sheet.getName());
  Logger.log("Columnas: " + COLS.join(", "));
  Logger.log("Token configurado: " + (getToken_() ? "sí" : "NO — ejecuta generarToken"));
}
