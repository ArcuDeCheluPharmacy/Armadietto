// ============================================================
// CONFIGURAZIONE — modifica questi due valori
// ============================================================
const PASSWORD = "armadietto2026"; // password condivisa
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxb7EOgXTP6i0cfr7jxMDqdK3bNZaRfdKYzYONGEr2upumAkRlk9FJ3AcNMlAwck2YI/exec"; 
// ============================================================

// --- Password gate (solo deterrente, è in chiaro nel JS) ---
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

// --- State ---
let farmaci = []; // {id, nome, quantita, formato, scadenza, posizione}
let editingId = null;

// --- Helpers ---
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
  const diff = (d - new Date()) / 86400000;
  return Math.ceil(diff);
}

function scadenzaBadge(iso) {
  const d = daysUntil(iso);
  if (d === Infinity) return "";
  if (d < 0) return '<span class="badge badge-danger">Scaduto</span>';
  if (d <= 30) return '<span class="badge badge-warn">In scadenza</span>';
  return "";
}

// --- API (Apps Script) ---
async function api(action, body) {
  if (!SCRIPT_URL || SCRIPT_URL.includes("INCOLLA_QUI")) {
    throw new Error(
      "SCRIPT_URL non configurato. Apri app.js e incolla l'URL dell'Apps Script."
    );
  }
  const opts = { method: "POST", body: JSON.stringify({ action, ...body }) };
  // Niente Content-Type custom → evita preflight CORS, Apps Script accetta text/plain
  const res = await fetch(SCRIPT_URL, opts);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function loadFarmaci() {
  const data = await api("list", {});
  farmaci = (data.items || []).map((r) => ({
    id: String(r.id ?? ""),
    nome: String(r.nome ?? ""),
    quantita: Number(r.quantita ?? 0),
    formato: String(r.formato ?? ""),
    scadenza: r.scadenza ? String(r.scadenza).slice(0, 10) : "",
    posizione: String(r.posizione ?? ""),
  }));
}

// --- Rendering ---
function renderHome() {
  const tot = farmaci.length;
  const scad = farmaci.filter((f) => {
    const d = daysUntil(f.scadenza);
    return d >= 0 && d <= 30;
  }).length;
  const exp = farmaci.filter((f) => daysUntil(f.scadenza) < 0).length;
  $("stat-totali").textContent = tot;
  $("stat-scadenza").textContent = scad;
  $("stat-scaduti").textContent = exp;

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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// --- Form ---
function resetForm() {
  editingId = null;
  $("form-title").textContent = "Aggiungi un farmaco";
  $("btn-save").textContent = "Salva";
  $("btn-cancel").hidden = true;
  $("f-id").value = "";
  $("f-nome").value = "";
  $("f-quantita").value = "";
  $("f-formato").value = "";
  $("f-scadenza").value = "";
  $("f-posizione").value = "";
}

function loadIntoForm(f) {
  editingId = f.id;
  $("form-title").textContent = "Modifica farmaco";
  $("btn-save").textContent = "Aggiorna";
  $("btn-cancel").hidden = false;
  $("f-id").value = f.id;
  $("f-nome").value = f.nome;
  $("f-quantita").value = f.quantita;
  $("f-formato").value = f.formato;
  $("f-scadenza").value = f.scadenza;
  $("f-posizione").value = f.posizione;
}

async function submitForm(e) {
  e.preventDefault();
  const payload = {
    id: editingId || uuid(),
    nome: $("f-nome").value.trim(),
    quantita: Number($("f-quantita").value) || 0,
    formato: $("f-formato").value.trim(),
    scadenza: $("f-scadenza").value || "",
    posizione: $("f-posizione").value.trim(),
  };
  if (!payload.nome) return toast("Il nome è obbligatorio", true);

  const btn = $("btn-save");
  btn.disabled = true;
  try {
    if (editingId) {
      await api("update", { item: payload });
      toast("Farmaco aggiornato");
    } else {
      await api("create", { item: payload });
      toast("Farmaco aggiunto");
    }
    await loadFarmaci();
    resetForm();
    location.hash = "#/inventario";
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function deleteFarmaco(id) {
  if (!confirm("Eliminare questo farmaco?")) return;
  try {
    await api("delete", { id });
    await loadFarmaci();
    render();
    toast("Eliminato");
  } catch (err) {
    toast(err.message, true);
  }
}

// --- Router ---
const ROUTES = ["/", "/aggiungi", "/inventario"];
function currentRoute() {
  const r = (location.hash || "#/").slice(1);
  return ROUTES.includes(r) ? r : "/";
}

function render() {
  const r = currentRoute();
  $("view-home").hidden = r !== "/";
  $("view-aggiungi").hidden = r !== "/aggiungi";
  $("view-inventario").hidden = r !== "/inventario";

  $("nav").innerHTML = `
    <a href="#/" class="${r === "/" ? "active" : ""}">Home</a>
    <a href="#/aggiungi" class="${r === "/aggiungi" ? "active" : ""}">Aggiungi</a>
    <a href="#/inventario" class="${r === "/inventario" ? "active" : ""}">Inventario</a>
  `;

  if (r === "/") renderHome();
  if (r === "/inventario") renderInventario($("search").value);
  if (r === "/aggiungi" && !editingId) resetForm();
  window.scrollTo({ top: 0, behavior: "instant" });
}

// --- Init ---
async function init() {
  $("form-farmaco").addEventListener("submit", submitForm);
  $("btn-cancel").addEventListener("click", () => { resetForm(); location.hash = "#/inventario"; });
  $("search").addEventListener("input", (e) => renderInventario(e.target.value));
  $("inventario").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    const dl = e.target.closest("[data-del]");
    if (ed) {
      const f = farmaci.find((x) => x.id === ed.dataset.edit);
      if (f) { loadIntoForm(f); location.hash = "#/aggiungi"; }
    }
    if (dl) deleteFarmaco(dl.dataset.del);
  });
  window.addEventListener("hashchange", render);

  render();
  $("prossimi").innerHTML = '<li class="loading">Caricamento…</li>';
  $("inventario").innerHTML = '<li class="loading">Caricamento…</li>';
  try {
    await loadFarmaci();
    render();
  } catch (err) {
    toast(err.message, true);
    $("prossimi").innerHTML = '<li class="loading">Errore di caricamento</li>';
    $("inventario").innerHTML = '<li class="loading">Errore di caricamento</li>';
  }
}

init();
