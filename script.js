let map;
let markers = [];
let base = [];

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initMapa();
  initUpload();
  initCentralizar();
});

/* ===== ABAS ===== */
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-section").forEach(s => s.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");

      if (map) setTimeout(() => map.invalidateSize(), 200);
    });
  });
}

/* ===== MAPA ===== */
function initMapa() {
  map = L.map("map").setView([-22.9068, -43.1729], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
}

/* ===== CENTRALIZAR ===== */
function initCentralizar() {
  document.getElementById("btn-centralizar").addEventListener("click", () => {
    if (markers.length === 0) return;
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds(), { padding: [40,40] });
  });
}

/* ===== UPLOAD ===== */
function initUpload() {
  const btn = document.getElementById("btn-upload");
  const input = document.getElementById("upload-mapa");

  btn.onclick = () => input.click();
  input.onchange = e => carregarPlanilha(e.target.files[0]);
}

function carregarPlanilha(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    base = rows
      .filter(r => r["Placa Veículo"] && String(r["Tipo de Veículo"]).toUpperCase() !== "AJUDANTE")
      .map(r => ({
        programa: extrairPrograma(r["Programa"]),
        lat: -22.85 - Math.random() * 0.2,
        lng: -43.1 - Math.random() * 0.25
      }));

    renderMapa();
    renderFiltro();
    document.getElementById("dadosResumo").innerHTML = `Total de veículos: ${base.length}`;
  };
  reader.readAsArrayBuffer(file);
}

/* ===== MAPA ===== */
function renderMapa(filtro="TODOS") {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  base
    .filter(b => filtro === "TODOS" || b.programa === filtro)
    .forEach(b => {
      const m = L.marker([b.lat, b.lng]).addTo(map);
      markers.push(m);
    });
}

/* ===== FILTRO ===== */
function renderFiltro() {
  const sel = document.getElementById("filtroPrograma");
  const programas = [...new Set(base.map(b => b.programa))];

  sel.innerHTML = `<option value="TODOS">Todos</option>` +
    programas.map(p => `<option>${p}</option>`).join("");

  sel.onchange = () => renderMapa(sel.value);
}

/* ===== PROGRAMA ===== */
function extrairPrograma(v) {
  if (!v) return "SEM PROGRAMA";
  const p = String(v).split(" - ").pop();
  return p.split("/")[0].replace(/\d{4}.*/, "").trim();
}
