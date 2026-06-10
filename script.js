
// ==========================================
// CONFIGURAZIONE
// ==========================================

const API_URL =
  "https://script.google.com/macros/s/AKfycbzdEwfzKvhwRXB32BAsyA7HHhvRthr4pWUHTNKKHYSt7jCnvkrviPUQyNf6jWLxhfEF/exec";

let editingId = null;

// ==========================================
// API GOOGLE SHEETS
// ==========================================

async function getFarmaci() {
  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("Errore caricamento dati");
    }

    return await response.json();
  } catch (error) {
    console.error(error);
    alert("Errore connessione a Google Sheets");
    return [];
  }
}

async function addFarmaco(farmaco) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "add",
        ...farmaco,
      }),
    });

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function updateFarmaco(farmaco) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "update",
        ...farmaco,
      }),
    });

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function deleteFarmacoServer(id) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "delete",
        id,
      }),
    });

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

// ==========================================
// UTILITY
// ==========================================

function daysUntil(date) {
  if (!date) return null;

  const d = new Date(date);
  const now = new Date();

  now.setHours(0, 0, 0, 0);

  return Math.floor((d - now) / 86400000);
}

function getStatus(scadenza) {
  const days = daysUntil(scadenza);

  if (days === null) return "N/D";

  if (days < 0) return "Scaduto";

  if (days <= 30) return "In scadenza";

  return "OK";
}

// ==========================================
// NAVIGAZIONE
// ==========================================

function showView(view) {
  document.getElementById("homeView").hidden =
    view !== "home";

  document.getElementById("inventoryView").hidden =
    view !== "inventory";

  document.getElementById("formView").hidden =
    view !== "form";

  if (view === "home") renderHome();

  if (view === "inventory") renderInventory();
}

// ==========================================
// DASHBOARD
// ==========================================

async function renderHome() {
  const farmaci = await getFarmaci();

  const scaduti = farmaci.filter(
    x => daysUntil(x.scadenza) < 0
  ).length;

  const inScadenza = farmaci.filter(x => {
    const d = daysUntil(x.scadenza);

    return d !== null && d >= 0 && d <= 30;
  }).length;

  document.getElementById("homeView").innerHTML = `
    <div class="card">
      <h2>Dashboard</h2>

      <p>
        Totale farmaci:
        <strong>${farmaci.length}</strong>
      </p>

      <p>
        In scadenza:
        <strong>${inScadenza}</strong>
      </p>

      <p>
        Scaduti:
        <strong>${scaduti}</strong>
      </p>
    </div>
  `;
}

// ==========================================
// INVENTARIO
// ==========================================

async function renderInventory() {
  const farmaci = await getFarmaci();

  const search =
    document.getElementById("searchInput")?.value
      ?.toLowerCase() || "";

  const filtered = farmaci.filter(item =>
    JSON.stringify(item)
      .toLowerCase()
      .includes(search)
  );

  document.getElementById("inventoryView").innerHTML = `
    <div class="card">

      <input
        id="searchInput"
        placeholder="Cerca farmaco..."
        oninput="renderInventory()"
      />

    </div>

    <table>

      <thead>
        <tr>
          <th>Nome</th>
          <th>Quantità</th>
          <th>Formato</th>
          <th>Scadenza</th>
          <th>Posizione</th>
          <th>Stato</th>
          <th>Azioni</th>
        </tr>
      </thead>

      <tbody>

      ${filtered.map(item => `
        <tr>

          <td>${item.nome}</td>
          <td>${item.quantita}</td>
          <td>${item.formato || ""}</td>
          <td>${item.scadenza || ""}</td>
          <td>${item.posizione || ""}</td>

          <td>
            ${getStatus(item.scadenza)}
          </td>

          <td>

            <button
              onclick="editFarmaco('${item.id}')">
              Modifica
            </button>

            <button
              onclick="deleteFarmaco('${item.id}')">
              Elimina
            </button>

          </td>

        </tr>
      `).join("")}

      </tbody>

    </table>
  `;
}

// ==========================================
// FORM
// ==========================================

function openForm(item = null) {
  editingId = item ? item.id : null;

  showView("form");

  document.getElementById("formView").innerHTML = `
    <div class="card">

      <h2>
        ${item ? "Modifica" : "Nuovo"} Farmaco
      </h2>

      <form onsubmit="saveFarmaco(event)">

        <input
          id="nome"
          required
          placeholder="Nome"
          value="${item?.nome || ""}"
        >

        <input
          id="quantita"
          type="number"
          value="${item?.quantita || 1}"
        >

        <input
          id="formato"
          placeholder="Formato"
          value="${item?.formato || ""}"
        >

        <input
          id="scadenza"
          type="date"
          value="${item?.scadenza || ""}"
        >

        <input
          id="posizione"
          placeholder="Posizione"
          value="${item?.posizione || ""}"
        >

        <button type="submit">
          Salva
        </button>

      </form>

    </div>
  `;
}

// ==========================================
// SALVATAGGIO
// ==========================================

async function saveFarmaco(event) {
  event.preventDefault();

  const farmaco = {
    id: editingId || crypto.randomUUID(),
    nome: document.getElementById("nome").value,
    quantita: document.getElementById("quantita").value,
    formato: document.getElementById("formato").value,
    scadenza: document.getElementById("scadenza").value,
    posizione: document.getElementById("posizione").value,
  };

  if (editingId) {
    await updateFarmaco(farmaco);
  } else {
    await addFarmaco(farmaco);
  }

  editingId = null;

  showView("inventory");
}

// ==========================================
// MODIFICA
// ==========================================

async function editFarmaco(id) {
  const farmaci = await getFarmaci();

  const item = farmaci.find(
    f => String(f.id) === String(id)
  );

  if (!item) return;

  openForm(item);
}

// ==========================================
// ELIMINAZIONE
// ==========================================

async function deleteFarmaco(id) {
  const conferma = confirm(
    "Eliminare questo farmaco?"
  );

  if (!conferma) return;

  await deleteFarmacoServer(id);

  renderInventory();
}

// ==========================================
// AVVIO APP
// ==========================================

renderHome();
