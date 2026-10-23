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
  "estadoManual","observaciones","updatedAt","deleted"
];
const DATE_COLS = ["fechaPedido","fechaEntrega","ampliacionDigesa","arteAprobado","pedidoSistema"];
const LOCK_TIMEOUT_MS = 20000;
let formatted_ = false;   // el formato de texto se aplica una vez por ejecución

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

/* ===== Upsert (insert o update) por ID, escritura por lotes ===== */
function upsertAll(records) {
  const sheet = getOrCreateSheet();
  const data  = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("id");
  const tsCol = headers.indexOf("updatedAt");

  // id → índice de fila en `data` (0 = encabezado)
  const idMap = {};
  data.forEach((row, i) => { if (i > 0) idMap[String(row[idCol])] = i; });

  const newRows = [];   // filas nuevas, se escriben de una sola vez
  const newIdx = {};    // id → posición en newRows (por si el lote trae el mismo id dos veces)

  records.forEach(rec => {
    const recId = String(rec.id || "");
    if (!recId) return;
    const recTs = Number(rec.updatedAt) || 0;

    const rowData = COLS.map(col => {
      let v = rec[col] !== undefined ? rec[col] : "";
      if (col === "marca" || col === "observaciones") v = safeText_(v);
      return String(v);
    });

    if (idMap[recId] !== undefined) {
      const existingTs = Number(data[idMap[recId]][tsCol]) || 0;
      if (recTs >= existingTs) {   // gana el más reciente
        sheet.getRange(idMap[recId] + 1, 1, 1, rowData.length).setValues([rowData]);
      }
    } else if (newIdx[recId] !== undefined) {
      const prevTs = Number(newRows[newIdx[recId]][COLS.indexOf("updatedAt")]) || 0;
      if (recTs >= prevTs) newRows[newIdx[recId]] = rowData;
    } else {
      newIdx[recId] = newRows.length;
      newRows.push(rowData);
    }
  });

  if (newRows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, COLS.length).setValues(newRows);
  }
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
