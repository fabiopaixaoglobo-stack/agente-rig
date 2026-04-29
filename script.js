// CONFIGURAÇÃO INICIAL DO MAPA
const map = L.map('map').setView([-22.9068, -43.1729], 11);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Agente RIG Intelligence'
}).addTo(map);

// INICIALIZAÇÃO DE RISCOS (COR/OTT/CLIMA) - ÚLTIMAS 2H
window.onload = () => {
    const riscos = [
        { lat: -22.861, lon: -43.255, d: "Incidente Av. Brasil - Manguinhos", c: "#f85149" },
        { lat: -22.922, lon: -43.235, d: "Operação Policial - Região Tijuca", c: "#f85149" },
        { lat: -23.001, lon: -43.350, d: "Alerta Climático - Recreio", c: "#d29922" }
    ];
    riscos.forEach(r => {
        L.circle([r.lat, r.lon], { color: r.c, fillColor: r.c, fillOpacity: 0.4, radius: 1000 }).addTo(map).bindPopup(r.d);
    });
    document.getElementById('total-alertas').innerText = riscos.length;
};

// CONTROLE DE ABAS
function alternarAba(id) {
    document.querySelectorAll('.aba-conteudo').forEach(a => a.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('ativo'));
    document.getElementById('secao-' + id).style.display = 'block';
    event.currentTarget.classList.add('ativo');
    if (id === 'mapa') setTimeout(() => map.invalidateSize(), 200);
}

// PROCESSAMENTO DA PLANILHA COM FILTRO DE HORÁRIO ATUAL
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = function(evt) {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, {type: 'array'});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(sheet);
        processarMonitoramento(rawData);
    };
    reader.readAsArrayBuffer(file);
});

async function processarMonitoramento(dados) {
    const lista = document.getElementById('lista-atendimentos');
    lista.innerHTML = '';
    let ativosCount = 0;
    const agora = new Date();

    for (let i = 0; i < dados.length; i++) {
        const item = dados[i];
        
        // Lógica de Filtro de Horário (Janela de Atendimento)
        const horaInicio = new Date(item['Data Hora']);
        const horaFim = new Date(item['Data Hora2'] || item['Data Hora']);
        
        // Verifica se o horário atual está dentro da janela do atendimento
        if (agora >= horaInicio && agora <= horaFim) {
            const end = item['Localidade + Endereço'];
            const prog = item['Programa'] || "Logística";
            
            lista.innerHTML += `
                <div class="card-veiculo">
                    <span style="color:var(--accent); font-weight:bold;">● EM ROTA</span><br>
                    <strong>${prog.split('-')[1] || prog}</strong><br>
                    🚗 ${item['Motorista']}<br>
                    📍 ${end.substring(0, 35)}...
                </div>`;
            
            ativosCount++;

            // Plotagem controlada no mapa
            if (end && ativosCount <= 10) {
                await new Promise(r => setTimeout(r, 2000));
                plotarVeiculo(end, item['Motorista']);
            }
        }
    }
    document.getElementById('total-ativos').innerText = ativosCount;
}

async function plotarVeiculo(end, motorista) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(end)}, Rio de Janeiro`);
        const d = await res.json();
        if (d && d.length > 0) {
            L.circleMarker([d[0].lat, d[0].lon], { radius: 7, fillColor: "#2f81f7", color: "#fff", weight: 2, fillOpacity: 0.9 }).addTo(map).bindPopup(`<b>Motorista:</b> ${motorista}`);
        }
    } catch (e) {}
}

// LOGICA DAS DEMAIS ABAS
function simularRota() {
    const o = document.getElementById('origem').value;
    const d = document.getElementById('destino').value;
    const fb = document.getElementById('feedback-rota');
    if(!o || !d) return alert("Defina origem e destino.");
    fb.innerHTML = "<b>Analisando...</b><br>Cruzando dados com OTT e COR. Rota via Linha Amarela apresenta 1 incidente. Sugerindo desvio.";
}

function consultarManual(tipo) {
    const fb = document.getElementById('feedback-normas');
    const db = {
        'MOPP': '<b>Norma MOPP:</b> Certificado obrigatório para transporte de produtos perigosos. Validade de 5 anos.',
        'TNO': '<b>TNO:</b> Transporte Noturno exige descanso obrigatório de 11h e check-list de iluminação.',
        'Jornada': '<b>Jornada:</b> Máximo de 5h30 de direção ininterrupta. Pausa de 30min obrigatória.',
        'Velocidade': '<b>Velocidade:</b> Limite de 80km/h em rodovias e 40km/h em perímetros urbanos da empresa.'
    };
    fb.innerHTML = db[tipo] || "Informação não encontrada.";
}
