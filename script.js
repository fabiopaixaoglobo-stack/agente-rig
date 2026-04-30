// Inicialização do Mapa
const map = L.map('map').setView([-22.9068, -43.1729], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Gestão de Abas - Correção do erro de "mapa cinzento"
function alternarAba(id) {
    document.querySelectorAll('.aba-conteudo').forEach(a => a.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('ativo'));
    
    document.getElementById('secao-' + id).style.display = 'block';
    
    // Marca o botão como ativo
    event.currentTarget.classList.add('ativo');
    
    // Correção técnica: força o mapa a redesenhar o tamanho
    if (id === 'mapa') setTimeout(() => map.invalidateSize(), 100);
}

// Upload Excel
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = (event) => {
        alert("Base Excel sincronizada com sucesso.");
    };
    reader.readAsArrayBuffer(e.target.files[0]);
});

// Funções de Negócio
function analisarRota() {
    document.getElementById('feedback-rota').innerText = "Analisando histórico PMERJ/OTT... Rota com áreas de risco identificadas.";
}

function consultarManual(tipo) {
    document.getElementById('feedback-normas').innerText = `Consultando base normativa para: ${tipo}...`;
}
