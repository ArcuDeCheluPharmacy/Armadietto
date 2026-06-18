// ==========================================================
// CONFIGURAZIONE
// ==========================================================
const PASSWORD  = "armadietto2026";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxb7EOgXTP6i0cfr7jxMDqdK3bNZaRfdKYzYONGEr2upumAkRlk9FJ3AcNMlAwck2YI/exec";

// ── Password gate ────────────────────────────────────────────
(function gate() {
  if (sessionStorage.getItem("auth") === PASSWORD) return;
  if (localStorage.getItem("auth_remember") === PASSWORD) {
    sessionStorage.setItem("auth", PASSWORD);
    return;
  }
  const p = prompt("Password armadietto:");
  if (p !== PASSWORD) {
    document.body.innerHTML =
      '<div style="font-family:Inter,sans-serif;padding:60px;text-align:center;color:#6b6358">Accesso negato.</div>';
    throw new Error("auth");
  }
  sessionStorage.setItem("auth", PASSWORD);
  localStorage.setItem("auth_remember", PASSWORD);
})();

// ── State ────────────────────────────────────────────────────
let farmaci    = [];
let editingId  = null;
let html5QrCode = null;

// ── Helpers ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2400);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(iso) {
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (isNaN(d)) return Infinity;
  return Math.ceil((d - new Date()) / 86400000);
}

function scadenzaBadge(iso) {
  const d = daysUntil(iso);
  if (d === Infinity) return "";
  if (d < 0)   return '<span class="badge badge-danger">Scaduto</span>';
  if (d <= 30) return '<span class="badge badge-warn">In scadenza</span>';
  return "";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ── API (Apps Script) ─────────────────────────────────────────
async function api(action, body) {
  const res  = await fetch(SCRIPT_URL, {
    method: "POST",
    body:   JSON.stringify({ action, ...body }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ── Caricamento farmaci ───────────────────────────────────────
async function loadFarmaci() {
  const data = await api("list", {});
  farmaci = (data.items || []).map((r) => ({
    id:       String(r.id       ?? ""),
    nome:     String(r.nome     ?? ""),
    quantita: Number(r.quantita ?? 0),
    formato:  String(r.formato  ?? ""),
    scadenza: r.scadenza ? String(r.scadenza).slice(0, 10) : "",
    posizione: String(r.posizione ?? ""),
  }));
}

// ── Rendering ─────────────────────────────────────────────────
function renderHome() {
  const tot  = farmaci.length;
  const scad = farmaci.filter((f) => { const d = daysUntil(f.scadenza); return d >= 0 && d <= 30; }).length;
  const exp  = farmaci.filter((f) => daysUntil(f.scadenza) < 0).length;
  $("stat-totali").textContent   = tot;
  $("stat-scadenza").textContent = scad;
  $("stat-scaduti").textContent  = exp;

  const prossimi = farmaci
    .filter((f) => f.scadenza)
    .sort((a, b) => new Date(a.scadenza) - new Date(b.scadenza))
    .slice(0, 5);

  const ul = $("prossimi");
  if (!prossimi.length) {
    ul.innerHTML = '<li style="border:none;color:var(--muted)">Nessun farmaco con scadenza impostata.</li>';
    return;
  }
  ul.innerHTML = prossimi.map((f) => `
    <li>
      <div class="item-main">
        <div class="item-name">${escapeHtml(f.nome)} ${scadenzaBadge(f.scadenza)}</div>
        <div class="item-meta">Scade il ${fmtDate(f.scadenza)} · ${escapeHtml(f.posizione || "—")}</div>
      </div>
    </li>`).join("");
}

function renderInventario(filter = "") {
  const q = filter.trim().toLowerCase();
  const list = farmaci
    .filter((f) => !q || f.nome.toLowerCase().includes(q) || f.posizione.toLowerCase().includes(q))
    .sort((a, b) => {
      const ad = a.scadenza ? new Date(a.scadenza).getTime() : Infinity;
      const bd = b.scadenza ? new Date(b.scadenza).getTime() : Infinity;
      return ad - bd;
    });

  const ul = $("inventario");
  $("empty").hidden = list.length > 0;
  ul.innerHTML = list.map((f) => `
    <li>
      <div class="item-main">
        <div class="item-name">${escapeHtml(f.nome)} ${scadenzaBadge(f.scadenza)}</div>
        <div class="item-meta">
          Qt: ${f.quantita} · ${escapeHtml(f.formato || "—")} ·
          Scad: ${fmtDate(f.scadenza)} · ${escapeHtml(f.posizione || "—")}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-ghost" data-edit="${f.id}">Modifica</button>
        <button class="btn btn-danger" data-del="${f.id}">Elimina</button>
      </div>
    </li>`).join("");
}

// ── Router ────────────────────────────────────────────────────
const VIEWS = ["home", "aggiungi", "inventario"];

function showView(name) {
  VIEWS.forEach((v) => {
    const el = $("view-" + v);
    if (el) el.hidden = v !== name;
  });
}

function render() {
  const hash = location.hash || "#/";
  const nav  = $("nav");

  // Navbar link
  nav.innerHTML = `
    <a href="#/" class="nav-link ${hash === "#/" ? "active" : ""}">Home</a>
    <a href="#/inventario" class="nav-link ${hash.startsWith("#/inventario") ? "active" : ""}">Inventario</a>
    <a href="#/aggiungi" class="nav-link ${hash.startsWith("#/aggiungi") ? "active" : ""}">+ Aggiungi</a>
  `;

  if (hash === "#/" || hash === "") {
    showView("home");
    renderHome();
  } else if (hash.startsWith("#/aggiungi")) {
    showView("aggiungi");
    // Gestione modalità modifica via query param: #/aggiungi?id=xxx
    const idParam = hash.includes("?id=") ? hash.split("?id=")[1] : null;
    if (idParam && idParam !== editingId) {
      const f = farmaci.find((x) => x.id === idParam);
      if (f) startEdit(f);
    } else if (!idParam) {
      // Nuova aggiunta: resetta il form solo se non eravamo già in edit
      if (editingId) resetForm();
    }
  } else if (hash.startsWith("#/inventario")) {
    showView("inventario");
    renderInventario($("search")?.value || "");
  }
}

// ── Form ──────────────────────────────────────────────────────
function resetForm() {
  editingId = null;
  $("f-id").value       = "";
  $("f-aic").value      = "";   // ← campo AIC azzerato
  $("f-nome").value     = "";
  $("f-quantita").value = "";
  $("f-formato").value  = "";
  $("f-scadenza").value = "";
  $("f-posizione").value = "";
  $("form-title").textContent = "Aggiungi un farmaco";
  $("btn-cancel").hidden = true;
  $("btn-save").textContent = "Salva";
}

function startEdit(f) {
  editingId             = f.id;
  $("f-id").value       = f.id;
  $("f-aic").value      = "";
  $("f-nome").value     = f.nome;
  $("f-quantita").value = f.quantita;
  $("f-formato").value  = f.formato;
  $("f-scadenza").value = f.scadenza;
  $("f-posizione").value = f.posizione;
  $("form-title").textContent = "Modifica farmaco";
  $("btn-cancel").hidden = false;
  $("btn-save").textContent = "Aggiorna";
}

async function submitForm(e) {
  e.preventDefault();
  const payload = {
    id:       editingId || uuid(),
    nome:     $("f-nome").value.trim(),
    quantita: Number($("f-quantita").value) || 0,
    formato:  $("f-formato").value.trim(),
    scadenza: $("f-scadenza").value || "",
    posizione: $("f-posizione").value.trim(),
  };
  if (!payload.nome) return toast("Il nome è obbligatorio", true);

  const btn = $("btn-save");
  btn.disabled = true;
  try {
    if (editingId) await api("update", { item: payload });
    else           await api("create", { item: payload });
    await loadFarmaci();
    resetForm();
    location.hash = "#/inventario";
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

// ── Ricerca AIC AIFA ──────────────────────────────────────────
async function cercaFarmacoPerAIC(aic) {
  if (!aic || !/^\d{1,9}$/.test(aic.trim())) {
    return toast("Inserisci un codice AIC valido (fino a 9 cifre)", true);
  }
  const btn = $("btn-cerca-aic");
  btn.disabled = true;
  btn.textContent = "Cerco…";
  try {
    toast("Ricerca in corso…");
    const data = await api("cercaAIC", { aic: aic.trim() });
    $("f-nome").value    = data.nome    || "";
    $("f-formato").value = data.formato || "";
    toast("✓ Dati trovati: " + (data.nome || ""));
  } catch (err) {
    toast(err.message || "Farmaco non trovato", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "🔍 Cerca";
  }
}

// ── Fotocamera ────────────────────────────────────────────────
async function avviaScansione() {
  const btn = $("btn-scan");
  btn.disabled = true;
  btn.textContent = "⏹ Stop";
  $("reader").hidden = false;

  try {
    html5QrCode = new Html5Qrcode("reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      async (decodedText) => {
        await stopScansione();
        // Barcode EAN-13 italiano: le ultime 9 cifre corrispondono spesso al codice AIC
        const aic = decodedText.replace(/\D/g, "").slice(-9);
        $("f-aic").value = aic;
        toast("Codice letto: " + decodedText + " → AIC tentativo: " + aic);
        await cercaFarmacoPerAIC(aic);
      }
    );
  } catch {
    toast("Errore fotocamera: controlla i permessi", true);
    await stopScansione();
  }
}

async function stopScansione() {
  try {
    if (html5QrCode && html5QrCode.isScanning) {
      await html5QrCode.stop();
    }
  } catch { /* ignora errori di stop */ }
  html5QrCode = null;
  $("reader").hidden = true;
  const btn = $("btn-scan");
  btn.disabled = false;
  btn.textContent = "📷 Scansiona";
}

// ── Aggiornamento database AIFA ───────────────────────────────
async function importaAIFA() {
  const btn = $("btn-importa-aifa");
  btn.disabled = true;
  btn.textContent = "Aggiornamento…";
  try {
    const data = await api("importaAIFA", {});
    toast(data.message || "Database AIFA aggiornato");
  } catch (err) {
    toast("Errore AIFA: " + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "↻ Aggiorna database AIFA";
  }
}

// ── Delegazione eventi inventario (modifica / elimina) ────────
function bindInventarioEvents() {
  $("inventario").addEventListener("click", async (e) => {
    const editId = e.target.dataset.edit;
    const delId  = e.target.dataset.del;

    if (editId) {
      const f = farmaci.find((x) => x.id === editId);
      if (f) {
        startEdit(f);
        location.hash = "#/aggiungi";
      }
    }

    if (delId) {
      if (!confirm("Eliminare questo farmaco?")) return;
      try {
        await api("delete", { id: delId });
        await loadFarmaci();
        renderInventario($("search")?.value || "");
        toast("Farmaco eliminato");
      } catch (err) {
        toast(err.message, true);
      }
    }
  });
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  // Routing
  window.addEventListener("hashchange", render);

  // Form
  $("form-farmaco").addEventListener("submit", submitForm);
  $("btn-cancel").addEventListener("click", () => {
    resetForm();
    location.hash = "#/inventario";
  });

  // Ricerca AIC
  $("btn-cerca-aic").addEventListener("click", () => cercaFarmacoPerAIC($("f-aic").value));
  $("f-aic").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); cercaFarmacoPerAIC($("f-aic").value); }
  });

  // Fotocamera
  $("btn-scan").addEventListener("click", () => {
    if (html5QrCode && html5QrCode.isScanning) stopScansione();
    else avviaScansione();
  });

  // Database AIFA
  $("btn-importa-aifa").addEventListener("click", importaAIFA);

  // Ricerca inventario
  $("search").addEventListener("input", (e) => renderInventario(e.target.value));

  // Click su modifica/elimina nell'inventario
  bindInventarioEvents();

  // Prima render (senza dati)
  render();

  // Carica dati e ri-renderizza
  try {
    await loadFarmaci();
    render();
  } catch (err) {
    toast("Errore caricamento: " + err.message, true);
  }
}

init();
