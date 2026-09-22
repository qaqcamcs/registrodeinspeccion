/**
 * Backend del formulario de Inspección de Soldadura.
 *
 * INSTALACIÓN (resumen, ver README.md para el detalle):
 * 1. Abre tu Google Sheet -> Extensiones -> Apps Script.
 * 2. Pega este archivo como Code.gs.
 * 3. Ajusta SHEET_NAME y DRIVE_FOLDER_ID más abajo si lo necesitas.
 * 4. Implementar -> Nueva implementación -> Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier usuario (o "Cualquier usuario con cuenta de Google")
 * 5. Copia la URL del Web App resultante y pégala en app.js (WEB_APP_URL).
 */

const SHEET_NAME = "Registros";           // nombre de la pestaña donde se escriben las filas
const DRIVE_FOLDER_NAME = "Evidencia Fotográfica Inspecciones"; // carpeta de Drive para las fotos

const HEADERS = [
  "Fecha de inspección",
  "Proyecto (Fase)",
  "Marca del elemento",
  "Cantidad revisada",
  "Correlativos",
  "Área",
  "Etapa",
  "Armador",
  "Soldador",
  "Responsable",
  "Código respuesta",
  "Resultado",
  "Reparado",
  "Área donde se detecta NC",
  "Defectos detectados",
  "Detalle de defectos",
  "Evidencia fotográficas",
  "Inspector",
  "Registrado (marca de tiempo)"
];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
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

/**
 * Guarda la foto (si viene) en Drive y devuelve la URL pública de vista,
 * o cadena vacía si no se envió foto.
 */
function saveEvidence_(nombreArchivo, base64Data) {
  if (!base64Data) return "";
  const folder = getFolder_();
  const contentType = "image/jpeg";
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, contentType, nombreArchivo || ("evidencia_" + Date.now() + ".jpg"));
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const evidenciaUrl = saveEvidence_(data.evidenciaNombre, data.evidenciaBase64);

    const sheet = getSheet_();
    sheet.appendRow([
      data.fecha || "",
      data.proyecto || "",
      data.marca || "",
      data.cantidad || "",
      data.correlativos || "",
      data.area || "",
      data.etapa || "",
      data.armador || "",
      data.soldador || "",
      data.responsable || "",
      data.codigoRespuesta || "",
      data.resultado || "",
      data.reparado || "",
      data.areaNC || "",
      data.defectos || "",
      data.detalleDefectos || "",
      evidenciaUrl,
      data.inspector || "",
      new Date()
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, evidenciaUrl: evidenciaUrl }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Útil para comprobar que el despliegue quedó activo (abrir la URL en el navegador)
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "El backend de inspecciones está activo." }))
    .setMimeType(ContentService.MimeType.JSON);
}
