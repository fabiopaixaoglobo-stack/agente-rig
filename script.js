// 1. Inicialização do Mapa (Foco RJ - Formato Satélite)
const map = L.map('map').setView([-22.9068, -43.1729], 12);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Agente RIG Intelligence | Base Geográfica Esri'
}).addTo(map);

// Inicia alertas de segurança históricos no RJ
window.onload = () => {
    carregarAlertasTaticos();
};

function carregarAlertasTaticos() {
    // Simulação baseada na matriz histórica do RJ (Últimas 2h)
    const alertas = [
        { lat: -22.860, lon: -43.250, msg: "RIG ALERTA: Zona de exclusão dinâmica (Av. Brasil/Manguinhos).", cor: "#ff4444" },
        { lat: -22.920, lon: -43.230, msg: "RIG ALERTA: Restrição de circulação detectada (Tijuca).", cor: "#ff4444" }
    ];
    alertas.forEach(a => {
        L.circle([a.lat, a.lon], { color: a.cor, fillOpacity: 0.4, radius: 1100 }).addTo(map).bindPopup(a.msg);
    });
}

// 2. Processamento Excel e Filtro de Horário (Janela de 2h)
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, {type: 'array'});
        const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        plotarVeiculosProximos(rawData);
    };
    reader.readAsArrayBuffer(file);
});

async function plotarVeiculosProximos(dados) {
    const lista = document.getElementById('lista-atendimentos');
    const agora = new Date();
    // Janela de tempo: 2 horas atrás até 2 horas depois
    const duasHorasAtras = new Date(agora.getTime() - (2 * 60 * 60 * 1000));
    const duasHorasDepois = new Date(agora.getTime() + (2 * 60 * 60 * 1000));
    
    lista.innerHTML = '';
    let count = 0;

    for (let item of dados) {
        // Validação da Janela Operacional (Janela de 2h do horário atual)
        const inicioAtendimento = new Date(item['Data Hora']);
        
        // Verifica se o veículo está ativo na janela operacional de 2h
        if (inicioAtendimento >= duasHorasAtras && inicioAtendimento <= duasHorasDepois) {
            const end = item['Localidade + Endereço'];
            const motorista = item['Motorista'] || 'Externo';
            const produto = item['Programa'] || "";

            lista.innerHTML += `
                <div class="atendimento-item">
                    <span style="color:#2f81f7; font-size:10px; font-weight:bold;">● EM MONITORAMENTO (JANELA 2H)</span><br>
                    <strong>${produto.split('-')[1] || produto}</strong><br>
                    🚗 ${motorista} | ${item['Placa Veículo'] || ''}<br>
                    📍 ${end.substring(0, 35)}...
                </div>`;
            
            count++;
            // Geocoding controlado para plotar no mapa do RJ
            if (end && count <= 12) { 
                await new Promise(r => setTimeout(r, 2200));
                await plotarGeocoding(end, motorista);
            }
        }
    }
    document.getElementById('total-atendimentos').innerText = count;
}

async function plotarGeocoding(end, motorista) {
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(end)}, Rio de Janeiro`);
        const d = await r.json();
        if (d[0]) {
            L.circleMarker([d[0].lat, d[0].lon], { radius: 7, fillColor: "#2f81f7", color: "#fff", fillOpacity: 0.9 }).addTo(map).bindPopup(`<b>Motorista em Rota:</b> ${motorista}`);
        }
    } catch (e) { console.error("Erro no Geocoding:", e); }
}

function alternarAba(abaId) {
    document.querySelectorAll('.aba-conteudo').forEach(a => a.style.display = 'none');
    document.getElementById('secao-' + abaId).style.display = 'block';
    if (abaId === 'mapa') setTimeout(() => map.invalidateSize(), 200);
}
