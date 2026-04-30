let map, mapPlanejador;

document.addEventListener("DOMContentLoaded", () => {
  map = L.map("map").setView([-22.9068, -43.1729], 12);
  mapPlanejador = L.map("mapPlanejador").setView([-22.9068, -43.1729], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
    .addTo(map)
    .addTo(mapPlanejador);

  document.getElementById("upload").addEventListener("change", carregarBase);
});

function showTab(id, btn) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));

  document.getElementById(id).classList.add("active");
  btn.classList.add("active");

  setTimeout(() => {
    map.invalidateSize();
    mapPlanejador.invalidateSize();
  }, 200);
}

function carregarBase(e) {
  const reader = new FileReader();
  reader.onload = evt => {
    const wb = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
    const dados = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    document.getElementById("dadosResumo").innerText =
      `Veículos carregados: ${dados.length}`;
  };
  reader.readAsArrayBuffer(e.target.files[0]);
}

function responder() {
  const pergunta = document.getElementById("pergunta").value;
  if (!pergunta) return;

  const chat = document.querySelector(".chat");
  chat.innerHTML += `<div class="msg user">${pergunta}</div>`;
  chat.innerHTML += `<div class="msg bot">Resposta simulada para normas.</div>`;
}
