/* =========================================================================
   CONFIGURACIÓN — URL de Google Apps Script y Clave PIN (0000)
   ========================================================================= */

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwmtluIA4IovxyhzqURFJwbrFIe-FWi-h2HYy7Mlvd664y8PCMasjShToeSoJc-FWsH/exec";
const PIN_CONFIG = "0000"; // Clave de 4 dígitos para autorizaciones

let OPTIONS = {
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

const SELECT_FIELDS = ["proyecto", "area", "etapa", "armador", "soldador",
  "responsable", "codigoRespuesta", "resultado", "reparado", "areaNC", "inspector"];

function populateSelects() {
  SELECT_FIELDS.forEach((key) => {
    const el = document.getElementById(key);
    if (!el) return;
    el.innerHTML = ""; // Limpiar opciones anteriores
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Seleccionar...";
    placeholder.disabled = true;
    placeholder.selected = true;
    el.appendChild(placeholder);
    (OPTIONS[key] || []).forEach((label) => {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      el.appendChild(opt);
    });
  });

  const group = document.getElementById("defectosGroup");
  if (group) {
    group.innerHTML = "";
    (OPTIONS.defectos || []).forEach((label, i) => {
      const id = "defecto_" + i;
      const wrap = document.createElement("label");
      wrap.innerHTML = `<input type="checkbox" name="defectos" value="${label}" id="${id}"> ${label}`;
      group.appendChild(wrap);
    });
  }
}

// Cargar opciones dinámicamente desde la pestaña 'Configuracion' de Google Sheets
async function fetchOptionsFromSheet() {
  if (!navigator.onLine) return;
  try {
    const res = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "getOptions", pin: PIN_CONFIG })
    });
    const data = await res.json();
    if (data.ok && data.options) {
      OPTIONS = { ...OPTIONS, ...data.options };
      populateSelects();
    }
  } catch (err) {
    console.warn("No se pudieron cargar opciones remotas, usando locales:", err);
  }
}

function setDefaultDate() {
  const el = document.getElementById("fecha");
  if (el) {
    const today = new Date();
    el.value = today.toISOString().slice(0, 10);
  }
}

/* IndexedDB — Registro de cola sin conexión */
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

async function sendToServer(record) {
  const payload = { ...record, pin: PIN_CONFIG };
  const res = await fetch(WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
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
  if (count) count.textContent = queue.length;
  if (banner) banner.hidden = queue.length === 0;
}

async function syncQueue() {
  if (!navigator.onLine) return;
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

function updateConnStatus() {
  const el = document.getElementById("connStatus");
  if (!el) return;
  const text = el.querySelector(".statusText");
  const online = navigator.onLine;
  el.classList.toggle("status--online", online);
  el.classList.toggle("status--offline", !online);
  text.textContent = online ? "Conectado" : "Sin conexión";

  const evidencia = document.getElementById("evidencia");
  if (evidencia) evidencia.disabled = !online;
  const hint = document.getElementById("evidenciaHint");
  if (hint) {
    hint.textContent = online
      ? "Selecciona una foto para adjuntar."
      : "Solo disponible con conexión a internet (se sube directo a Drive).";
  }
}

window.addEventListener("online", () => {
  updateConnStatus();
  fetchOptionsFromSheet();
  syncQueue();
});
window.addEventListener("offline", updateConnStatus);

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  populateSelects();
  setDefaultDate();
  updateConnStatus();
  updatePendingBanner();
  
  if (navigator.onLine) {
    fetchOptionsFromSheet();
    syncQueue();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW no registrado:", e));
  }

  const evidenciaEl = document.getElementById("evidencia");
  if (evidenciaEl) {
    evidenciaEl.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const preview = document.getElementById("evidenciaPreview");
      const img = document.getElementById("evidenciaImg");
      if (file) {
        img.src = URL.createObjectURL(file);
        preview.hidden = false;
      } else {
        preview.hidden = true;
      }
    });
  }

  const syncBtn = document.getElementById("syncBtn");
  if (syncBtn) syncBtn.addEventListener("click", syncQueue);

  const form = document.getElementById("inspectionForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById("submitBtn");
      const msg = document.getElementById("formMsg");
      msg.textContent = "";
      msg.className = "formMsg";

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Guardando...";

      const defectos = Array.from(form.querySelectorAll('input[name="defectos"]:checked')).map(c => c.value);

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
          msg.textContent = "Registro guardado exitosamente en '02_NO TOCAR #'.";
          msg.classList.add("ok");
        } else {
          await queueRecord({ data: record });
          await updatePendingBanner();
          msg.textContent = "Sin conexión: registro guardado localmente. Se sincronizará automáticamente al conectar.";
          msg.classList.add("ok");
        }
        form.reset();
        setDefaultDate();
        const preview = document.getElementById("evidenciaPreview");
        if (preview) preview.hidden = true;
      } catch (err) {
        console.error(err);
        try {
          await queueRecord({ data: record });
          await updatePendingBanner();
          msg.textContent = "No se pudo enviar ahora. Registro guardado en cola offline.";
        } catch (e2) {
          msg.textContent = "Error al guardar el registro: " + err.message;
          msg.classList.add("err");
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Guardar registro";
      }
    });
  }
});