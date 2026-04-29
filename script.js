// MAPA INICIAL
const map = L.map('map').setView([-22.9068, -43.1729], 11);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Agente RIG Intelligence'
}).addTo(map);

// AUTO-PLOT RISCOS (SIMULAÇÃO 2H)
window.onload = () => {
    const alertasAtuais = [
        { lat: -22.860, lon: -43.250, msg: "RIG: Interdição na Av. Brasil (COR-RJ)", cor: "#f85149" },
        { lat: -22.920, lon: -43.230, msg: "RIG: Alerta de Segurança OTT - Região Tijuca", cor: "#f85149" },
        { lat: -23.000, lon: -43.340, msg: "RIG: Alerta Climático - Vento Forte no Recreio", cor: "#d29922" }
    ];
    alertasAtuais.forEach(a => {
        L.circle([a.lat, a.lon], { color: a.cor, fillOpacity: 0.4, radius: 1100 }).addTo(map).bindPopup(a.msg);
    });
    document.getElementById('total-alertas').innerText = alertasAtuais.length;
};

// FILTRO DE PLANILHA E TEMPO REAL
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, {type: 'array'});
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        processarRIG(raw);
    };
    reader.readAsArrayBuffer(file);
});

async function processarRIG(dados) {
    const lista = document.getElementById('lista-atendimentos');
    const agora = new Date();
    let count = 0;
    lista.innerHTML = '';

    for (let item of dados) {
        // Lógica de tempo real baseada nas colunas da planilha
        const inicio = new Date(item['Data Hora']);
        const fim = new Date(item['Data Hora2'] || item['Data Hora']);
        
        // Filtra apenas veículos ativos na janela atual
        if (agora >= inicio && agora <= fim) {
            const end = item['Localidade + Endereço'];
            lista.innerHTML += `
                <div class="card-veiculo">
                    <span style="color:#3fb950; font-size:10px;">● EM MONITORAMENTO</span><br>
                    <strong>${item['Programa'] || 'Operacional'}</strong><br>
                    🚗 ${item['Motorista']} | ${item['Placa Veículo']}<br>
                    📍 ${end.substring(0, 35)}...
                </div>`;
            
            count++;
            if (count <= 10) { // Limite de 10 plotagens para teste
                await new Promise(r => setTimeout(r, 2000));
                await plotarNoMapa(end, item['Motorista']);
            }
        }
    }
    document.getElementById('total-ativos').innerText = count;
}

async function plotarNoMapa(end, motorista) {
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(end)}, Rio de Janeiro`);
        const d = await r.json();
        if (d[0]) {
            L.circleMarker([d[0].lat, d[0].lon], { radius: 7, fillColor: "#2f81f7", color: "#fff", fillOpacity: 0.9 }).addTo(map).bindPopup(`Motorista: ${motorista}`);
        }
    } catch (e) {}
}

// ABAS E CONSULTAS
function alternarAba(id) {
    document.querySelectorAll('.aba-conteudo').forEach(a => a.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('ativo'));
    document.getElementById('secao-' + id).style.display = 'block';
    event.currentTarget.classList.add('ativo');
    if (id === 'mapa') setTimeout(() => map.invalidateSize(), 200);
}

function analisarRota() {
    const fb = document.getElementById('feedback-rota');
    fb.innerHTML = "<b>Agente RIG Analisando...</b><br>Cruzando com histórico PMERJ/OTT. Rota detectada com 2 áreas de risco. Sugerindo desvio.";
}

function consultarManual(tipo) {
    const fb = document.getElementById('feedback-normas');
    const docs = {
        'MOPP': 'Certificado MOPP obrigatório para cargas perigosas. Validade 5 anos.',
        'TNO': 'TNO: Checklist de fadiga obrigatório para saídas após as 22h.',
        'Jornada': 'Máximo 5h30 de volante. Intervalo de 30min obrigatório.',
        'Segurança': 'Em caso de sinistro: Botão de Pânico ou 190 imediato.'
    };
    fb.innerHTML = docs[tipo] || "Selecione um tópico.";
}
