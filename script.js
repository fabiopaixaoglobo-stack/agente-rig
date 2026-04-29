const map = L.map('map').setView([-22.9068, -43.1729], 11);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri/Globo'
}).addTo(map);

function alternarAba(abaId) {
    document.querySelectorAll('.aba-conteudo').forEach(div => div.style.display = 'none');
    document.getElementById('secao-' + abaId).style.display = 'block';
    if (abaId === 'mapa') setTimeout(() => map.invalidateSize(), 200);
}

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

        // Adiciona na lista lateral
        lista.innerHTML += `
            <div class="atendimento-item">
                <span class="alerta-cor">SINCRO RIG</span><br>
                <strong>${produto}</strong><br>
                🚗 ${item['Motorista'] || 'Externo'}<br>
                📍 ${endereco}
            </div>`;

        // Plotagem com intervalo de 1.5s para evitar o erro de bloqueio
        if (endereco && i < 10) { // Testando com os 10 primeiros
            await new Promise(resolve => setTimeout(resolve, 1500));
            buscarNoMapa(endereco, produto);
        }
    }
    // Adiciona alertas de segurança automáticos
    plotarRiscos();
}

async function buscarNoMapa(end, info) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${end}, Rio de Janeiro`);
        const d = await res.json();
        if (d.length > 0) {
            L.marker([d[0].lat, d[0].lon]).addTo(map)
             .bindPopup(`<b>${info}</b><br>${end}`);
        }
    } catch (e) { console.log("Limite de busca atingido."); }
}

function plotarRiscos() {
    // Simulação COR/PMERJ/OTT
    const riscos = [
        { lat: -22.861, lon: -43.255, msg: "COR-RJ: Acidente Av. Brasil (Altura Manguinhos)" },
        { lat: -22.922, lon: -43.235, msg: "OTT: Operação Policial em andamento na região" }
    ];
    riscos.forEach(r => {
        L.circle([r.lat, r.lon], {color: 'red', radius: 1000}).addTo(map).bindPopup(r.msg);
    });
}
