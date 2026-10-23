/**
 * Control de Maquila de Panetones
 * Google Apps Script — Backend para sincronización con Google Sheets
 *
 * INSTRUCCIONES DE INSTALACIÓN:
 * 1. Crea un Google Sheet nuevo
 * 2. Ve a Extensiones → Apps Script
 * 3. Pega este código (reemplaza todo el contenido)
 * 4. Cambia TOKEN por una clave secreta tuya (ej: "maquila2024")
 * 5. Ve a Implementar → Nueva implementación → Aplicación web
 *    - Ejecutar como: Yo
 *    - Acceso: Cualquier usuario
 * 6. Autoriza y copia la URL que termina en /exec
 * 7. En la app, pega esa URL y el token en ⚙ Configuración
 *
 * IMPORTANTE: Cada vez que edites el script, crea una NUEVA versión
 * en Implementar → Administrar implementaciones, de lo contrario
 * seguirá ejecutando el código viejo.
 */

const TOKEN = "CAMBIA_ESTE_TOKEN";  // ← cambia esto por tu clave secreta
const SHEET_NAME = "Pedidos";
const COLS = [
  "id","marca","cantidad","peso","formula",
  "fechaPedido","fechaEntrega",
  "ampliacionDigesa","arteAprobado","pedidoSistema",
  "estadoManual","observaciones","updatedAt","deleted"
];

/* ===== GET: leer todos los pedidos ===== */
function doGet(e) {
  try {
    if (!e.parameter.token || e.parameter.token !== TOKEN) {
      return jsonOut({ ok: false, error: "token" });
    }
    return jsonOut({ ok: true, records: readAll() });
  } catch(err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

/* ===== POST: recibir y guardar pedidos (upsert por ID) ===== */
function doPost(e) {
  try {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch {
      return jsonOut({ ok: false, error: "JSON inválido" });
    }

    if (!body.token || body.token !== TOKEN) {
      return jsonOut({ ok: false, error: "token" });
    }

    const records = Array.isArray(body.records) ? body.records : [];
    if (records.length > 0) upsertAll(records);

    return jsonOut({ ok: true, records: readAll() });
  } catch(err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

/* ===== Leer todos los registros ===== */
function readAll() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];  // solo encabezado o vacío
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] === undefined ? "" : String(row[i]); });
    return obj;
  });
}

/* ===== Upsert (insert o update) por ID ===== */
function upsertAll(records) {
  const sheet = getOrCreateSheet();
  const data  = sheet.getDataRange().getValues();
  const headers = data[0];

  // índice por ID → número de fila (base 0 contando encabezado)
  const idCol = headers.indexOf("id");
  const idMap = {};
  data.forEach((row, i) => { if (i > 0) idMap[String(row[idCol])] = i; });

  records.forEach(rec => {
    // sanitizar observaciones (prevenir inyección de fórmulas en Sheets)
    if (rec.observaciones) {
      rec.observaciones = String(rec.observaciones).replace(/^[=+\-@\t\r]+/, "");
    }

    const rowData = COLS.map(col => rec[col] !== undefined ? String(rec[col]) : "");
    const recId   = String(rec.id || "");
    const recTs   = Number(rec.updatedAt) || 0;

    if (idMap[recId] !== undefined) {
      // comparar timestamps — gana el más reciente
      const existingTs = Number(data[idMap[recId]][headers.indexOf("updatedAt")]) || 0;
      if (recTs >= existingTs) {
        sheet.getRange(idMap[recId] + 1, 1, 1, rowData.length).setValues([rowData]);
      }
    } else {
      // nuevo registro
      sheet.appendRow(rowData);
    }
  });
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
}
