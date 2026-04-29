// Configuração do Mapa de Satélite
const map = L.map('map').setView([-22.9068, -43.1729], 11);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri/COR-RJ'
}).addTo(map);

// Ícones Personalizados
const iconeAtendimento = L.divIcon({className: 'marker-azul'});
const iconeAlerta = L.divIcon({className: 'marker-vermelho'});

// 1. Alternar Abas
function alternarAba(abaId) {
    document.querySelectorAll('.aba-conteudo').forEach(div => div.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('ativo'));
    document.getElementById('secao-' + abaId).style.display = 'block';
    if (abaId === 'mapa') setTimeout(() => map.invalidateSize(), 200);
}

// 2. Leitura do Excel
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        processarAtendimentos(jsonData);
    };
    reader.readAsArrayBuffer(file);
});

// 3. Plotagem no Mapa (Geocoding)
async function processarAtendimentos(dados) {
    const lista = document.getElementById('lista-atendimentos');
    lista.innerHTML = '';
    document.getElementById('total-atendimentos').innerText = dados.length;

    for (let item of dados) {
        const endereco = item['Localidade + Endereço'];
        const motorista = item['Motorista'] || 'Não informado';
        const prog = item['Programa'] || "";
        const produto = prog.includes('-') ? prog.split('-')[1].split('/')[0].trim() : prog;

        // Adiciona na lista lateral
        lista.innerHTML += `
            <div class="atendimento-item">
                <strong>${produto}</strong><br>
                🚗 ${motorista} | ${item['Placa Veículo'] || ''}<br>
                📍 ${endereco}
            </div>`;

        // Tenta plotar no mapa (Geocoding limitado para evitar travar o navegador)
        if (endereco && dados.indexOf(item) < 15) { // Limitamos os 15 primeiros para teste rápido
            buscarCoordenadas(endereco, `${produto} - ${motorista}`);
        }
    }
    plotarOcorrenciasSeguranca();
}

async function buscarCoordenadas(endereco, info) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${endereco}, Rio de Janeiro`);
        const data = await response.json();
        if (data.length > 0) {
            L.marker([data[0].lat, data[0].lon])
             .addTo(map)
             .bindPopup(`<b>Atendimento:</b><br>${info}<br>📍 ${endereco}`);
        }
    } catch (err) { console.error("Erro no mapa:", err); }
}

// 4. Camada de Ocorrências (Simulação COR/OTT/PM)
function plotarOcorrenciasSeguranca() {
    const ocorrencias = [
        { lat: -22.86, lon: -43.25, tipo: "Interdição COR-RJ: Acidente na Av. Brasil", cor: "red" },
        { lat: -22.92, lon: -43.23, tipo: "Alerta OTT: Presença Policial em Vigário Geral", cor: "orange" },
        { lat: -23.00, lon: -43.35, tipo: "Clima: Forte chuva na região da Barra/Recreio", cor: "yellow" }
    ];

    ocorrencias.forEach(oc => {
        L.circle([oc.lat, oc.lon], { color: oc.cor, fillOpacity: 0.5, radius: 800 })
         .addTo(map)
         .bindPopup(`<b>ALERTA DE SEGURANÇA:</b><br>${oc.tipo}`);
    });
    document.getElementById('alertas-seguranca').innerText = ocorrencias.length;
}

function consultar(t) {
    const r = document.getElementById('resposta-ia');
    if(t === 'MOPP') r.innerHTML = "<b>RIG:</b> Condutor deve possuir curso MOPP averbado e veículo com sinalização de risco.";
    if(t === 'TNO') r.innerHTML = "<b>RIG:</b> Transporte Noturno exige rotas iluminadas e paradas apenas em pontos homologados.";
    if(t === 'Jornada') r.innerHTML = "<b>RIG:</b> Máximo 5h30 volante. Repouso de 11h entre jornadas.";
}
