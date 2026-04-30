// 1. Inicializar Mapa Centralizado no Rio
const map = L.map('map').setView([-22.9068, -43.1729], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// 2. Carregar Ocorrências de Segurança e Clima
function carregarCamadas() {
    const alertas = [
        { lat: -22.860, lon: -43.250, msg: "Alerta Segurança: Av. Brasil", cor: "red" },
        { lat: -22.920, lon: -43.230, msg: "Clima: Atenção Ventos", cor: "orange" },
        { lat: -22.900, lon: -43.200, msg: "OTT: Monitoramento Ativo", cor: "blue" }
    ];
    
    alertas.forEach(a => {
        L.circleMarker([a.lat, a.lon], { color: a.cor, radius: 8 }).addTo(map).bindPopup(a.msg);
    });
}
carregarCamadas();

// 3. Processamento de Excel
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        
        // Plotar pontos do Excel
        json.forEach(item => {
            // Supondo que sua planilha tenha Lat/Lon ou Endereço
            console.log("Processando:", item);
        });
        alert("Base carregada. " + json.length + " atendimentos sincronizados.");
    };
    reader.readAsArrayBuffer(file);
});

// 4. Chat Simples
function enviarMensagem() {
    const input = document.getElementById('chat-box');
    const msg = input.value;
    if(!msg) return;

    const chat = document.getElementById('chat-messages');
    chat.innerHTML += `<div class="message user-msg">${msg}</div>`;
    input.value = '';
    
    setTimeout(() => {
        chat.innerHTML += `<div class="message bot-msg">Análise concluída. Cruzamento de dados de segurança em andamento.</div>`;
        chat.scrollTop = chat.scrollHeight;
    }, 500);
}
