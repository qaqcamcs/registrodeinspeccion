/**
 * Backend del formulario de Inspección de Soldadura.
 *
 * Maneja dos cosas:
 *  1) Los registros del formulario -> se escriben en la pestaña SHEET_NAME.
 *  2) La configuración de listas y condiciones del panel ⚙ de la app
 *     -> se guarda como un bloque de texto (JSON) en la pestaña
 *     CONFIG_SHEET_NAME, celda A1.
 *
 * INSTALACIÓN (resumen, ver README.md para el detalle):
 * 1. Abre tu Google Sheet -> Extensiones -> Apps Script.
 * 2. Pega este archivo como Code.gs.
 * 3. Revisa las constantes de abajo si tus pestañas tienen otro nombre.
 * 4. Implementar -> Nueva implementación -> Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier usuario
 * 5. Copia la URL del Web App y pégala en app.js (WEB_APP_URL).
 */

const SHEET_NAME = "Registros";                 // pestaña donde se escriben los registros
const CONFIG_SHEET_NAME = "02_NO TOCAR #";      // pestaña donde se guarda la configuración (ya creada)
const DRIVE_FOLDER_NAME = "Evidencia Fotográfica Inspecciones";

const HEADERS = [
  "Fecha de inspección", "Proyecto (Fase)", "Marca del elemento", "Cantidad revisada",
  "Correlativos", "Área", "Etapa", "Armador", "Soldador", "Responsable",
  "Código respuesta", "Resultado", "Reparado", "Área donde se detecta NC",
  "Defectos detectados", "Detalle de defectos", "Evidencia fotográficas", "Inspector",
  "Registrado (marca de tiempo)"
];

/* ---------------------- Registros ---------------------- */

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }
  return sheet;
}

function getFolder_() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function saveEvidence_(nombreArchivo, base64Data) {
  if (!base64Data) return "";
  const folder = getFolder_();
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, "image/jpeg", nombreArchivo || ("evidencia_" + Date.now() + ".jpg"));
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function handleSubmit_(data) {
  const evidenciaUrl = saveEvidence_(data.evidenciaNombre, data.evidenciaBase64);
  const sheet = getSheet_();
  sheet.appendRow([
    data.fecha || "", data.proyecto || "", data.marca || "", data.cantidad || "",
    data.correlativos || "", data.area || "", data.etapa || "", data.armador || "",
    data.soldador || "", data.responsable || "", data.codigoRespuesta || "",
    data.resultado || "", data.reparado || "", data.areaNC || "", data.defectos || "",
    data.detalleDefectos || "", evidenciaUrl, data.inspector || "", new Date()
  ]);
  return { ok: true, evidenciaUrl: evidenciaUrl };
}

/* ---------------------- Configuración (02_NO TOCAR #) ---------------------- */

function getConfigSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG_SHEET_NAME);
  return sheet;
}

function handleGetConfig_() {
  const sheet = getConfigSheet_();
  const raw = sheet.getRange("A1").getValue();
  if (!raw) return { ok: true, config: null };
  try {
    return { ok: true, config: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: "La configuración guardada no es un JSON válido: " + err.message };
  }
}

function handleSaveConfig_(config) {
  const sheet = getConfigSheet_();
  sheet.getRange("A1").setValue(JSON.stringify(config));
  sheet.getRange("B1").setValue("Última actualización");
  sheet.getRange("B2").setValue(new Date());
  return { ok: true };
}

/* ---------------------- Rutas HTTP ---------------------- */

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  let result;
  try {
    if (action === "getConfig") {
      result = handleGetConfig_();
    } else {
      result = { ok: true, message: "El backend de inspecciones está activo." };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result;
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "saveConfig") {
      result = handleSaveConfig_(data.config);
    } else {
      result = handleSubmit_(data);
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
