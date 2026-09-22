/* =========================================================================
   CONFIGURACIÓN BÁSICA — edita aquí lo esencial de conexión.
   Las OPCIONES de cada lista ahora se configuran desde la app misma
   (botón ⚙ arriba a la derecha), no aquí.
   ========================================================================= */

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwmtluIA4IovxyhzqURFJwbrFIe-FWi-h2HYy7Mlvd664y8PCMasjShToeSoJc-FWsH/exec";

// Clave para entrar al panel de configuración. Cámbiala por la tuya.
const ACCESS_CODE = "0000";

/* ========================================================================= */

// Qué campos existen, cómo se llaman y de qué tipo son (esto no se edita
// desde el panel: el panel solo administra OPCIONES y CONDICIONES).
const FIELDS_META = {
  proyecto:        { label: "Proyecto (Fase)",          type: "select" },
  area:            { label: "Área",                      type: "select" },
  etapa:           { label: "Etapa",                      type: "select" },
  armador:         { label: "Armador",                    type: "select" },
  soldador:        { label: "Soldador",                   type: "select" },
  responsable:     { label: "Responsable",                type: "select" },
  codigoRespuesta: { label: "Código respuesta",           type: "select" },
  resultado:       { label: "Resultado",                  type: "select" },
  reparado:        { label: "Reparado",                   type: "select" },
  areaNC:          { label: "Área donde se detecta NC",   type: "select" },
  defectos:        { label: "Defectos detectados",        type: "checkbox" },
  inspector:       { label: "Inspector",                  type: "select" }
};
const FIELD_ORDER = Object.keys(FIELDS_META);

// Valores de fábrica, solo para el primer uso (antes de configurar nada).
function buildDefaultConfig() {
  const seed = {
    proyecto: ["Proyecto Norte - Fase 1", "Proyecto Norte - Fase 2", "Proyecto Sur - Fase 1", "Ampliación Planta"],
    area: ["Estructuras", "Piping", "Estanques", "Plataformas"],
    etapa: ["Armado", "Soldadura", "Inspección visual", "END (Ensayo no destructivo)", "Liberado"],
    armador: ["J. Pérez", "M. Soto", "R. Muñoz"],
    soldador: ["C. Rojas", "A. Fuentes", "P. Castillo"],
    responsable: ["L. Herrera", "D. Vargas"],
    codigoRespuesta: ["CR-01 Conforme", "CR-02 No conforme - reparable", "CR-03 No conforme - rechazo", "CR-04 Observación"],
    resultado: ["Aprobado", "Aprobado con observaciones", "Rechazado"],
    reparado: ["Sí", "No", "N/A"],
    areaNC: ["Junta 1", "Junta 2", "Refuerzo", "Base", "Unión estructural"],
    defectos: ["Porosidad", "Socavado", "Falta de fusión", "Falta de penetración", "Fisura", "Salpicadura excesiva", "Desalineación", "Sin defectos"],
    inspector: ["F. Aravena", "N. Contreras"]
  };
  const fields = {};
  FIELD_ORDER.forEach((key) => {
    fields[key] = { options: seed[key] || [], dependsOn: null, rules: {} };
  });
  return { fields };
}

let CONFIG = null;          // configuración activa (en uso por el formulario)
let EDIT_SNAPSHOT = null;   // copia de respaldo al abrir el panel, por si se cancela
let EDITING_FIELD = null;   // campo seleccionado dentro del panel

function cloneConfig(cfg) { return JSON.parse(JSON.stringify(cfg)); }

/* ---------------------------------------------------------------------
   Almacenamiento local (localStorage) de la configuración
--------------------------------------------------------------------- */
const LS_CONFIG_KEY = "inspeccion_config";
const LS_PENDING_KEY = "inspeccion_config_pending";

function loadLocalConfig() {
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveLocalConfig(cfg) {
  try { localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}
function markConfigPending(isPending) {
  try {
    if (isPending) localStorage.setItem(LS_PENDING_KEY, "1");
    else localStorage.removeItem(LS_PENDING_KEY);
  } catch {}
}
function isConfigPending() {
  try { return localStorage.getItem(LS_PENDING_KEY) === "1"; } catch { return false; }
}

/* ---------------------------------------------------------------------
   Sincronización de configuración con la hoja "02_NO TOCAR #"
--------------------------------------------------------------------- */
async function fetchServerConfig() {
  const res = await fetch(WEB_APP_URL + "?action=getConfig");
  if (!res.ok) throw new Error("Error HTTP " + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error al leer configuración");
  return data.config || null;
}

async function pushConfigToServer(cfg) {
  const res = await fetch(WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "saveConfig", config: cfg })
  });
  if (!res.ok) throw new Error("Error HTTP " + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error al guardar configuración");
}

async function initConfig() {
  const local = loadLocalConfig();
  CONFIG = local || buildDefaultConfig();

  if (navigator.onLine) {
    try {
      const server = await fetchServerConfig();
      if (server) {
        CONFIG = server;
        saveLocalConfig(CONFIG);
      } else if (!local) {
        // primera vez y la hoja todavía no tiene nada: sube los valores de fábrica
        await pushConfigToServer(CONFIG);
        saveLocalConfig(CONFIG);
      }
    } catch (err) {
      console.warn("No se pudo leer la configuración del servidor, se usa la local:", err);
    }
  }
}

async function trySyncPendingConfig() {
  if (!navigator.onLine || !isConfigPending()) return;
  try {
    await pushConfigToServer(CONFIG);
    markConfigPending(false);
  } catch (err) {
    console.warn("No se pudo sincronizar la configuración pendiente:", err);
  }
}

/* ---------------------------------------------------------------------
   Render del formulario según CONFIG (con condiciones en cascada)
--------------------------------------------------------------------- */
function optionsForField(key) {
  const field = CONFIG.fields[key];
  if (!field.dependsOn) return field.options;
  const parentEl = document.getElementById(field.dependsOn);
  const parentVal = parentEl ? parentEl.value : "";
  if (!parentVal) return field.options;
  const rule = field.rules ? field.rules[parentVal] : null;
  return (rule && rule.length) ? rule : field.options;
}

function dependentsOf(key) {
  return FIELD_ORDER.filter((k) => CONFIG.fields[k].dependsOn === key);
}

function renderSelectField(key) {
  const el = document.getElementById(key);
  if (!el) return;
  const prevValue = el.value;
  el.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Seleccionar...";
  placeholder.disabled = true;
  el.appendChild(placeholder);

  const opts = optionsForField(key);
  opts.forEach((label) => {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    el.appendChild(opt);
  });

  if (opts.includes(prevValue)) {
    el.value = prevValue;
  } else {
    placeholder.selected = true;
  }
}

function renderCheckboxField(key) {
  const group = document.getElementById(key + "Group");
  if (!group) return;
  const prevChecked = Array.from(group.querySelectorAll("input:checked")).map((c) => c.value);
  group.innerHTML = "";
  const opts = optionsForField(key);
  opts.forEach((label, i) => {
    const id = key + "_" + i;
    const wrap = document.createElement("label");
    const checked = prevChecked.includes(label) ? "checked" : "";
    wrap.innerHTML = `<input type="checkbox" name="${key}" value="${label}" id="${id}" ${checked}> ${label}`;
    group.appendChild(wrap);
  });
}

function renderField(key) {
  const meta = FIELDS_META[key];
  if (meta.type === "select") renderSelectField(key);
  else renderCheckboxField(key);
}

function refreshDependents(key) {
  dependentsOf(key).forEach((depKey) => {
    renderField(depKey);
    refreshDependents(depKey);
  });
}

function renderWholeForm() {
  FIELD_ORDER.forEach(renderField);
}

function attachCascadeListeners() {
  FIELD_ORDER.forEach((key) => {
    const meta = FIELDS_META[key];
    if (meta.type !== "select") return; // solo campos "select" pueden ser padres
    const el = document.getElementById(key);
    if (!el) return;
    el.addEventListener("change", () => refreshDependents(key));
  });
}

/* ---------------------------------------------------------------------
   Fecha por defecto = hoy
--------------------------------------------------------------------- */
function setDefaultDate() {
  const el = document.getElementById("fecha");
  el.value = new Date().toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------------
   IndexedDB — cola de REGISTROS pendientes por sincronizar
--------------------------------------------------------------------- */
const DB_NAME = "inspeccion_db";
const STORE_NAME = "pendientes";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function queueRecord(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function removeFromQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------------------------------------------------------------------
   Envío de un registro al backend
--------------------------------------------------------------------- */
async function sendToServer(record) {
  const res = await fetch(WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ action: "submit" }, record))
  });
  if (!res.ok) throw new Error("Error HTTP " + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error desconocido del servidor");
  return data;
}

async function updatePendingBanner() {
  const queue = await getQueue();
  const banner = document.getElementById("pendingBanner");
  const count = document.getElementById("pendingCount");
  count.textContent = queue.length;
  banner.hidden = queue.length === 0;
}

async function syncQueue() {
  if (!navigator.onLine) return;
  await trySyncPendingConfig();

  const queue = await getQueue();
  if (queue.length === 0) return;
  const syncBtn = document.getElementById("syncBtn");
  if (syncBtn) { syncBtn.disabled = true; syncBtn.textContent = "Sincronizando..."; }

  for (const item of queue) {
    try {
      await sendToServer(item.data);
      await removeFromQueue(item.id);
    } catch (err) {
      console.error("No se pudo sincronizar un registro:", err);
      break;
    }
  }

  if (syncBtn) { syncBtn.disabled = false; syncBtn.textContent = "Sincronizar ahora"; }
  await updatePendingBanner();
}

/* ---------------------------------------------------------------------
   Estado de conexión
--------------------------------------------------------------------- */
function updateConnStatus() {
  const el = document.getElementById("connStatus");
  const text = el.querySelector(".statusText");
  const online = navigator.onLine;
  el.classList.toggle("status--online", online);
  el.classList.toggle("status--offline", !online);
  text.textContent = online ? "Conectado" : "Sin conexión";

  const evidencia = document.getElementById("evidencia");
  evidencia.disabled = !online;
  document.getElementById("evidenciaHint").textContent = online
    ? "Selecciona una foto para adjuntar."
    : "Solo disponible con conexión a internet (se sube directo a Drive).";
}

window.addEventListener("online", () => { updateConnStatus(); syncQueue(); });
window.addEventListener("offline", updateConnStatus);

/* ---------------------------------------------------------------------
   Vista previa de foto
--------------------------------------------------------------------- */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* =========================================================================
   PANEL DE CONFIGURACIÓN
   ========================================================================= */

function openConfigModal() {
  document.getElementById("configPass").value = "";
  document.getElementById("configLockMsg").textContent = "";
  document.getElementById("configLock").hidden = false;
  document.getElementById("configBody").hidden = true;
  document.getElementById("configOverlay").hidden = false;
  document.getElementById("configPass").focus();
}

function closeConfigModal(discardChanges) {
  if (discardChanges && EDIT_SNAPSHOT) {
    CONFIG = EDIT_SNAPSHOT;
    renderWholeForm();
  }
  EDIT_SNAPSHOT = null;
  EDITING_FIELD = null;
  document.getElementById("configOverlay").hidden = true;
}

function unlockConfig() {
  const val = document.getElementById("configPass").value;
  if (val !== ACCESS_CODE) {
    document.getElementById("configLockMsg").textContent = "Clave incorrecta.";
    return;
  }
  EDIT_SNAPSHOT = cloneConfig(CONFIG);
  document.getElementById("configLock").hidden = true;
  document.getElementById("configBody").hidden = false;
  renderFieldList();
  EDITING_FIELD = FIELD_ORDER[0];
  renderFieldEditor();
}

function renderFieldList() {
  const list = document.getElementById("configFieldList");
  list.innerHTML = "";
  FIELD_ORDER.forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = FIELDS_META[key].label;
    btn.className = key === EDITING_FIELD ? "active" : "";
    btn.addEventListener("click", () => {
      EDITING_FIELD = key;
      renderFieldList();
      renderFieldEditor();
    });
    list.appendChild(btn);
  });
}

function selectParentCandidates(currentKey) {
  // solo campos tipo "select" (con valor único) pueden ser "padres" de una condición
  return FIELD_ORDER.filter((k) => k !== currentKey && FIELDS_META[k].type === "select");
}

function renderFieldEditor() {
  const key = EDITING_FIELD;
  const editor = document.getElementById("fieldEditor");
  if (!key) { editor.innerHTML = '<p class="hint">Selecciona un campo de la izquierda.</p>'; return; }

  const field = CONFIG.fields[key];
  const meta = FIELDS_META[key];

  editor.innerHTML = "";

  const h3 = document.createElement("h3");
  h3.textContent = meta.label;
  editor.appendChild(h3);

  // ---- Lista de opciones ----
  const optsWrap = document.createElement("div");
  field.options.forEach((opt, i) => {
    const row = document.createElement("div");
    row.className = "optionRow";
    row.innerHTML = `<input type="text" value="${escapeHtml(opt)}" data-i="${i}">
      <button type="button" class="removeBtn" data-i="${i}" title="Quitar">✕</button>`;
    optsWrap.appendChild(row);
  });
  editor.appendChild(optsWrap);

  optsWrap.querySelectorAll('input[type="text"]').forEach((input) => {
    input.addEventListener("change", () => {
      const i = Number(input.dataset.i);
      field.options[i] = input.value.trim();
      renderFieldEditor();
    });
  });
  optsWrap.querySelectorAll(".removeBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.i);
      field.options.splice(i, 1);
      renderFieldEditor();
    });
  });

  const addRow = document.createElement("div");
  addRow.className = "addOptionRow";
  addRow.innerHTML = `<input type="text" placeholder="Nueva opción..." id="newOptionInput">
    <button type="button" class="btn btn--small btn--ghost" id="addOptionBtn">Agregar</button>`;
  editor.appendChild(addRow);
  addRow.querySelector("#addOptionBtn").addEventListener("click", () => {
    const input = document.getElementById("newOptionInput");
    const val = input.value.trim();
    if (!val) return;
    field.options.push(val);
    renderFieldEditor();
  });

  // ---- Condición (de qué campo depende) ----
  const dependsBlock = document.createElement("div");
  dependsBlock.className = "dependsBlock";
  const candidates = selectParentCandidates(key);

  let dependsHtml = `<label for="dependsSelect">Mostrar opciones distintas según la respuesta de:</label>
    <select id="dependsSelect"><option value="">(sin condición — siempre se muestran todas)</option>`;
  candidates.forEach((k) => {
    const sel = field.dependsOn === k ? "selected" : "";
    dependsHtml += `<option value="${k}" ${sel}>${FIELDS_META[k].label}</option>`;
  });
  dependsHtml += `</select>`;
  dependsBlock.innerHTML = dependsHtml;
  editor.appendChild(dependsBlock);

  dependsBlock.querySelector("#dependsSelect").addEventListener("change", (e) => {
    field.dependsOn = e.target.value || null;
    if (!field.dependsOn) field.rules = {};
    renderFieldEditor();
  });

  // ---- Reglas por cada valor del campo padre ----
  if (field.dependsOn) {
    const parentField = CONFIG.fields[field.dependsOn];
    const rulesTitle = document.createElement("p");
    rulesTitle.className = "hint";
    rulesTitle.textContent = "Marca qué opciones deben verse para cada valor de \"" + FIELDS_META[field.dependsOn].label + "\". Si no marcas nada para un valor, se muestran todas.";
    editor.appendChild(rulesTitle);

    parentField.options.forEach((parentVal) => {
      if (!field.rules[parentVal]) field.rules[parentVal] = [];
      const card = document.createElement("div");
      card.className = "ruleCard";
      const title = document.createElement("div");
      title.className = "ruleTitle";
      title.textContent = "Si " + FIELDS_META[field.dependsOn].label + " = \"" + parentVal + "\"";
      card.appendChild(title);

      const group = document.createElement("div");
      group.className = "checkgroup";
      field.options.forEach((opt, i) => {
        const checked = field.rules[parentVal].includes(opt) ? "checked" : "";
        const id = "rule_" + key + "_" + i + "_" + parentVal.replace(/\W/g, "");
        const lbl = document.createElement("label");
        lbl.innerHTML = `<input type="checkbox" value="${escapeHtml(opt)}" ${checked}> ${escapeHtml(opt)}`;
        group.appendChild(lbl);
      });
      card.appendChild(group);
      editor.appendChild(card);

      group.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener("change", () => {
          const set = new Set(field.rules[parentVal]);
          if (cb.checked) set.add(cb.value); else set.delete(cb.value);
          field.rules[parentVal] = Array.from(set);
        });
      });
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function saveConfigFromPanel() {
  const msg = document.getElementById("configSyncMsg");
  msg.textContent = "Guardando...";
  msg.className = "formMsg";

  // limpia campos vacíos que hayan quedado de ediciones
  FIELD_ORDER.forEach((key) => {
    CONFIG.fields[key].options = CONFIG.fields[key].options.filter((o) => o && o.trim().length);
  });

  saveLocalConfig(CONFIG);

  if (navigator.onLine) {
    try {
      await pushConfigToServer(CONFIG);
      markConfigPending(false);
      msg.textContent = "Configuración guardada y sincronizada.";
      msg.classList.add("ok");
    } catch (err) {
      markConfigPending(true);
      msg.textContent = "Guardada en este dispositivo. No se pudo sincronizar (se reintentará): " + err.message;
      msg.classList.add("err");
    }
  } else {
    markConfigPending(true);
    msg.textContent = "Sin conexión: guardada en este dispositivo. Se sincronizará al recuperar internet.";
    msg.classList.add("ok");
  }

  EDIT_SNAPSHOT = cloneConfig(CONFIG); // ya no hay que descartar estos cambios
  renderWholeForm();
}

/* =========================================================================
   INICIALIZACIÓN
   ========================================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  await initConfig();
  renderWholeForm();
  attachCascadeListeners();
  setDefaultDate();
  updateConnStatus();
  updatePendingBanner();
  if (navigator.onLine) syncQueue();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW no registrado:", e));
  }

  document.getElementById("evidencia").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById("evidenciaPreview");
    const img = document.getElementById("evidenciaImg");
    if (file) { img.src = URL.createObjectURL(file); preview.hidden = false; }
    else { preview.hidden = true; }
  });

  document.getElementById("syncBtn").addEventListener("click", syncQueue);

  // ---- Panel de configuración ----
  document.getElementById("configBtn").addEventListener("click", openConfigModal);
  document.getElementById("closeLockBtn").addEventListener("click", () => closeConfigModal(false));
  document.getElementById("unlockBtn").addEventListener("click", unlockConfig);
  document.getElementById("configPass").addEventListener("keydown", (e) => { if (e.key === "Enter") unlockConfig(); });
  document.getElementById("closeConfigBtn").addEventListener("click", () => closeConfigModal(true));
  document.getElementById("saveConfigBtn").addEventListener("click", saveConfigFromPanel);
  document.getElementById("resetConfigBtn").addEventListener("click", () => {
    if (!confirm("¿Restaurar todas las listas y condiciones a los valores de fábrica? Esto no se guarda hasta que presiones Guardar.")) return;
    CONFIG = buildDefaultConfig();
    renderFieldEditor();
  });

  // ---- Envío del formulario ----
  document.getElementById("inspectionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = document.getElementById("submitBtn");
    const msg = document.getElementById("formMsg");
    msg.textContent = "";
    msg.className = "formMsg";

    if (!form.checkValidity()) { form.reportValidity(); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    const defectos = Array.from(form.querySelectorAll('input[name="defectos"]:checked')).map((c) => c.value);

    const record = {
      fecha: form.fecha.value,
      proyecto: form.proyecto.value,
      marca: form.marca.value,
      cantidad: form.cantidad.value,
      correlativos: form.correlativos.value,
      area: form.area.value,
      etapa: form.etapa.value,
      armador: form.armador.value,
      soldador: form.soldador.value,
      responsable: form.responsable.value,
      codigoRespuesta: form.codigoRespuesta.value,
      resultado: form.resultado.value,
      reparado: form.reparado.value,
      areaNC: form.areaNC.value,
      defectos: defectos.join(", "),
      detalleDefectos: form.detalleDefectos.value,
      inspector: form.inspector.value,
      evidenciaNombre: "",
      evidenciaBase64: ""
    };

    const fotoFile = document.getElementById("evidencia").files[0];

    try {
      if (navigator.onLine) {
        if (fotoFile) {
          record.evidenciaNombre = fotoFile.name;
          record.evidenciaBase64 = await fileToBase64(fotoFile);
        }
        await sendToServer(record);
        msg.textContent = "Registro guardado y sincronizado correctamente.";
        msg.classList.add("ok");
      } else {
        await queueRecord({ data: record });
        await updatePendingBanner();
        msg.textContent = "Sin conexión: registro guardado localmente. Se sincronizará automáticamente (sin foto).";
        msg.classList.add("ok");
      }
      form.reset();
      setDefaultDate();
      renderWholeForm();
      document.getElementById("evidenciaPreview").hidden = true;
    } catch (err) {
      console.error(err);
      try {
        await queueRecord({ data: record });
        await updatePendingBanner();
        msg.textContent = "No se pudo enviar ahora. El registro quedó guardado y se reintentará más tarde.";
      } catch (e2) {
        msg.textContent = "Error al guardar el registro: " + err.message;
        msg.classList.add("err");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar registro";
    }
  });
});
