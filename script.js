const map = L.map('map').setView([-22.9068, -43.1729], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

function showTab(id, btn) {
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');
    if(id === 'secao-mapa') map.invalidateSize();
}

// Upload de Arquivos
document.getElementById('upload-mapa').addEventListener('change', (e) => {
    alert("Planilha processada com sucesso.");
});

document.getElementById('upload-norma').addEventListener('change', (e) => {
    document.getElementById('feedback-normas').innerText = "Manual carregado. Consultando base de normas...";
});

// Mock de Análise de Rota
function analisarRota() {
    document.getElementById('feedback-rota').innerText = "Analisando histórico PMERJ/OTT... Rota com 2 áreas de atenção identificadas. Sugerindo desvio.";
}
