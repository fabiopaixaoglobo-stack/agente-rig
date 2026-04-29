// Configuração do Mapa
const map = L.map('map').setView([-22.9068, -43.1729], 11);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri/Globo'
}).addTo(map);

// Alternar entre abas
function alternarAba(abaId) {
    document.querySelectorAll('.aba-conteudo').forEach(div => div.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('ativo'));
    document.getElementById('secao-' + abaId).style.display = 'block';
    
    // Atualiza o botão clicado
    const bts = document.querySelectorAll('.tab-btn');
    bts.forEach(b => { if(b.innerText.toLowerCase().includes(abaId.slice(0,3))) b.classList.add('ativo'); });

    if (abaId === 'mapa') setTimeout(() => map.invalidateSize(), 200);
}

// Upload e Processamento Excel
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        processarComAtraso(jsonData);
    };
    reader.readAsArrayBuffer(file);
});

async function processarComAtraso(dados) {
    const lista = document.getElementById('lista-atendimentos');
    lista.innerHTML = '';
    document.getElementById('total-atendimentos').innerText = dados.length;

    for (let i = 0; i < dados.length; i++) {
        const item = dados[i];
        const endereco = item['Localidade + Endereço'];
        const prog = item['Programa'] || "";
        const produto = prog.includes('-') ? prog.split('-')[1].split('/')[0].trim() : prog;

        // Adiciona card na lista rolável
        lista.innerHTML += `
            <div class="atendimento-item">
                <span class="alerta-cor">SINCRO RIG</span><br>
                <strong>${produto}</strong><br>
                👤 ${item['Motorista'] || 'Externo'}<br>
                📍 ${endereco}
            </div>`;

        // Plotagem com intervalo de 2.5s para não ser bloqueado pelo servidor de mapas
        if (endereco && i < 15) {
            await new Promise(r => setTimeout(r, 2500));
            buscarNoMapa(endereco, produto);
        }
    }
}

async function buscarNoMapa(end, info) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(end)}, Rio de Janeiro`;
        const res = await fetch(url);
        const d = await res.json();
        if (d && d.length > 0) {
            L.marker([d[0].lat, d[0].lon]).addTo(map)
             .bindPopup(`<b>${info}</b><br>${end}`).openPopup();
        }
    } catch (e) { console.log("Limite atingido."); }
}

function consultar(t) {
    const r = document.getElementById('res-norma');
    if(t === 'MOPP') r.innerText = "RIG: Curso MOPP deve estar em dia na CNH. Exigido Kit de emergência.";
    if(t === 'TNO') r.innerText = "RIG: Transporte Noturno: Checar descanso e iluminação da rota.";
    if(t === 'Jornada') r.innerText = "RIG: Jornada máxima de 5h30 ao volante sem pausa.";
}
