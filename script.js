let map, mapPlanejador;
let markers = [];
let layerSeguranca = L.layerGroup();
let layerTransito = L.layerGroup();
let layerClima = L.layerGroup();

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initMapa();
  initPlanejador();
  initNormas();
});

/* ================= ABAS ================= */
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-section").forEach(s => s.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");

      setTimeout(() => {
        if (map) map.invalidateSize();
        if (mapPlanejador) mapPlanejador.invalidateSize();
      }, 200);
    };
  });
}

/* ================= MAPA ================= */
function initMapa() {
  map = L.map("map").setView([-22.9068, -43.1729], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

  layerSeguranca.addTo(map);
  layerTransito.addTo(map);
  layerClima.addTo(map);

  // Segurança
  L.circleMarker([-22.91, -43.18], { color: "red" })
    .bindPopup("Alerta de Segurança")
    .addTo(layerSeguranca);

  // Trânsito
  L.circleMarker([-22.93, -43.21], { color: "orange" })
    .bindPopup("Congestionamento")
    .addTo(layerTransito);

  // Clima
  L.circleMarker([-22.88, -43.16], { color: "blue" })
    .bindPopup("Chuva Moderada")
    .addTo(layerClima);
}

/* ================= PLANEJADOR ================= */
function initPlanejador() {
  mapPlanejador = L.map("map-planejador").setView([-22.9068, -43.1729], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapPlanejador);

  document.getElementById("btn-tracar").onclick = () => {
    const rota = L.polyline(
      [[-22.91, -43.18], [-22.89, -43.12]],
      { color: "#f5a623", weight: 4 }
    ).addTo(mapPlanejador);

    mapPlanejador.fitBounds(rota.getBounds());
  };
}

/* ================= NORMAS ================= */
function initNormas() {
  const chat = document.getElementById("chatNormas");
  const input = document.getElementById("perguntaNorma");

  document.getElementById("btnPerguntarNorma").onclick = () => {
    if (!input.value) return;

    chat.innerHTML += `<div class="msg user">${input.value}</div>`;
    chat.innerHTML += `<div class="msg bot">Resposta simulada conforme base normativa.</div>`;
    input.value = "";
    chat.scrollTop = chat.scrollHeight;
  };
}
