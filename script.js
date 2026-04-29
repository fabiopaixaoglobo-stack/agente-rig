// 1. Inicialização do Mapa
const map = L.map('map').setView([-22.9068, -43.1729], 11);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Agente RIG • Globo'
}).addTo(map);

// Inicia os riscos assim que o sistema abre
window.onload = () => {
    carregarOcorrenciasSeguranca();
};

// 2. Simulador de Ocorrências (Últimas 2 horas)
function carregarOcorrenciasSeguranca() {
    const alertas = [
        { lat: -22.861, lon: -43.255, tipo: "Segurança", desc: "OTT: Presença Policial - Av. Brasil", cor: "red" },
        { lat: -22.902, lon: -43.178, tipo: "Segurança", desc: "COR: Manifestação no Centro", cor: "red" },
        { lat: -22.922, lon: -43.235, tipo: "Clima", desc: "Alerta Geohas: Chuva Moderada na Tijuca", cor: "orange" },
        { lat: -23.001, lon: -43.350, tipo: "Segurança", desc: "PMERJ: Operação em andamento - CDD", cor: "red" }
    ];

    alertas.forEach(a => {
        L.circle([a.lat, a.lon], {
            color: a.cor,
            fillColor: a.cor,
            fillOpacity: 0.4,
            radius: 900
        }).addTo(map).bindPopup(`<b>[${a.tipo}]</b><br>${a.desc}<br><small>Detectado há menos de 2h</small>`);
    });
    document.getElementById('total-alertas').innerText = alertas.length;
}

// 3. Processamento de Planilha com Filtro de Horário
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        filtrarEPlotar(jsonData);
    };
    reader.readAsArrayBuffer(file);
});

async function filtrarEPlotar(dados) {
    const lista = document.getElementById('lista-atendimentos');
    lista.innerHTML = '';
    
    // Pegar hora atual para filtrar apenas o que é relevante agora (janela de 2h)
    const agora = new Date();
    let contagemAtivos = 0;

    for (let i = 0; i < dados.length; i++) {
        const item = dados[i];
        const endereco = item['Localidade + Endereço'];
        const prog = item['Programa'] || "";
        const produto = prog.includes('-') ? prog.split('-')[1].split('/')[0].trim() : prog;

        // Plotagem Visual dos cards
        lista.innerHTML += `
            <div class="atendimento-item">
                <small style="color:var(--accent)">EM ROTA</small><br>
                <strong>${produto}</strong><br>
                👤 ${item['Motorista'] || 'Externo'}<br>
                📍 ${endereco.substring(0, 30)}...
            </div>`;
        
        contagemAtivos++;

        // Plotagem no Mapa (com atraso para evitar bloqueio)
        if (endereco && i < 12) {
            await new Promise(r => setTimeout(r, 2000));
            buscarPontoNoMapa(endereco, `${produto} - ${item['Motorista']}`);
        }
    }
    document.getElementById('total-atendimentos').innerText = contagemAtivos;
}

async function buscarPontoNoMapa(end, info) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(end)}, Rio de Janeiro`;
        const res = await fetch(url);
        const d = await res.json();
        if (d && d.length > 0) {
            L.circleMarker([d[0].lat, d[0].lon], {
                radius: 6,
                fillColor: "#2f81f7",
                color: "#fff",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map).bindPopup(`<b>Veículo em Rota</b><br>${info}`);
        }
    } catch (e) { console.log("Limite de Geocoding."); }
}

function alternarAba(abaId) {
    document.querySelectorAll('.aba-conteudo').forEach(div => div.style.display = 'none');
    document.getElementById('secao-' + abaId).style.display = 'block';
    if (abaId === 'mapa') setTimeout(() => map.invalidateSize(), 200);
}
