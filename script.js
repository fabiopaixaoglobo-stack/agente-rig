// Inicializa o Mapa centrado no Rio de Janeiro (Versão Satélite)
const map = L.map('map').setView([-22.9068, -43.1729], 12);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
}).addTo(map);

document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            processarDados(results.data);
        }
    });
});

function processarDados(dados) {
    const agora = new Date();
    const umaHoraDepois = new Date(agora.getTime() + (60 * 60 * 1000));
    
    const listaHtml = document.getElementById('lista-atendimentos');
    listaHtml.innerHTML = '';
    let contAg = 0, contProx = 0;

    dados.forEach(item => {
        // Formata o Nome do Produto (Programa)
        let programaFull = item['Programa'] || "";
        let produto = programaFull.includes('-') ? programaFull.split('-')[1].split('/')[0].trim() : programaFull;

        // Lógica de Horário (Simplificada para demonstração)
        // Aqui você compararia item['Data Hora'] com a variável 'agora'
        
        const card = `
            <div class="atendimento-item">
                <strong>Produto: ${produto}</strong><br>
                👤 ${item['Motorista']} (${item['Prestador do veículo']})<br>
                🚗 ${item['Tipo de Veículo']} | ${item['Placa']}<br>
                📍 ${item['Localidade + Endereço']}
            </div>
        `;
        listaHtml.innerHTML += card;
        
        // Simulação de plotagem no mapa (Necessita Coordenadas ou serviço de Geocoding)
        // L.marker([-22.9, -43.2]).addTo(map).bindPopup(`<b>${produto}</b><br>${item['Motorista']}`);
    });
}
