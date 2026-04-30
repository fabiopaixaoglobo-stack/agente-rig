let map;

// Inicialização segura
document.addEventListener("DOMContentLoaded", () => {

  // MAPA
  map = L.map('map').setView([-22.9068, -43.1729], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  // UPLOAD
  const upload = document.getElementById('upload-mapa');

  upload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);

      console.log("Dados:", json);
      alert(`Arquivo carregado com ${json.length} registros`);
    };

    reader.readAsArrayBuffer(file);
  });
});

// CONTROLE DE ABAS (CORRIGIDO)
function showTab(id, btn) {
  document.querySelectorAll('.aba-conteudo').forEach(sec => {
    sec.classList.remove('ativo');
  });

  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('ativo');
  });

  document.getElementById(id).classList.add('ativo');
  btn.classList.add('ativo');

  if (id === 'secao-mapa') {
    setTimeout(() => map.invalidateSize(), 200);
  }
}

// FUNÇÕES
function analisarRota() {
  document.getElementById('feedback-rota').innerText =
    "Rota analisada: risco moderado identificado.";
}

function consultarManual(tipo) {
  document.getElementById('feedback-normas').innerText =
    `Norma ${tipo} carregada com sucesso.`;
}
