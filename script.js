// 1. Inicializar Mapa (Centralizado RJ)
const map = L.map('map').setView([-22.9068, -43.1729], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// 2. Plotar Ocorrências (Segurança/Clima/OTT)
function carregarCamadas() {
    const ocorrencias = [
        { lat: -22.860, lon: -43.250, msg: "Segurança: Alerta Área 1", type: "red" },
        { lat: -22.920, lon: -43.230, msg: "OTT: Monitoramento Ativo", type: "blue" }
    ];
    
    ocorrencias.forEach(o => {
        L.circleMarker([o.lat, o.lon], { color: o.type, radius: 10 }).addTo(map).bindPopup(o.msg);
    });
}
carregarCamadas();

// 3. Processar Excel
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        
        console.log("Dados Carregados:", json);
        alert("Base sincronizada com sucesso!");
        // Aqui entra a lógica para plotar pontos do Excel no mapa
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
    
    // Resposta automática do RIG
    setTimeout(() => {
        chat.innerHTML += `<div class="message bot-msg">RIG: Dados analisados. Ocorrência capturada no setor logístico.</div>`;
        chat.scrollTop = chat.scrollHeight;
    }, 500);
}
