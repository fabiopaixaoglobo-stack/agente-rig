const map = L.map('map').setView([-22.9068, -43.1729], 11);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{y}/{x}{r}.png').addTo(map);

// SIMULAÇÃO DE DADOS DE SEGURANÇA (Crawler)
let ocorrencias = [
    { lat: -22.861, lon: -43.255, tipo: "Fogo Cruzado: Disparos relatados há 45min" },
    { lat: -22.922, lon: -43.235, tipo: "ISP-RJ: Área de atenção tática" }
];

ocorrencias.forEach(o => {
    L.circleMarker([o.lat, o.lon], { radius: 10, color: 'red', fillOpacity: 0.6 }).addTo(map).bindPopup(o.tipo);
});

// PROCESSAMENTO EXCEL SEM VALIDAÇÃO DE DATA
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = (evt) => {
        const wb = XLSX.read(new Uint8Array(evt.target.result), {type: 'array'});
        const dados = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        exibirAtendimentos(dados);
    };
    reader.readAsArrayBuffer(e.target.files[0]);
});

function exibirAtendimentos(dados) {
    const lista = document.getElementById('lista-atendimentos');
    lista.innerHTML = '';
    let count = 0;

    dados.forEach(item => {
        // Removida a validação de data: agora todos os atendimentos da planilha aparecem
        const motorista = item['Motorista'] || "Não informado";
        const local = item['Localidade + Endereço'] || "Endereço não disponível";
        
        const card = document.createElement('div');
        card.className = 'card-veiculo';
        card.innerHTML = `
            <strong>${item['Programa'] || 'Serviço'}</strong><br>
            🚗 ${motorista}<br>
            📍 ${local.substring(0, 40)}...
        `;
        lista.appendChild(card);
        count++;
        
        // Plotagem simples para teste (os 10 primeiros)
        if(count < 10 && local) plotarSimples(local, motorista);
    });
    document.getElementById('total-ativos').innerText = count;
}

async function plotarSimples(end, mot) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(end)}, Rio de Janeiro`);
        const d = await res.json();
        if(d[0]) L.marker([d[0].lat, d[0].lon]).addTo(map).bindPopup(`Motorista: ${mot}`);
    } catch(e){}
}

// LÓGICA DO PLANEJADOR (VISUAL NO MAPA)
async function executarPlanejamento() {
    const orig = document.getElementById('origem').value;
    const dest = document.getElementById('destino').value;
    const fb = document.getElementById('feedback-rota');
    
    fb.innerHTML = "🔍 Agente RIG rastreando ocorrências no trajeto...";
    
    // Simulação visual de rota no mapa
    setTimeout(() => {
        fb.innerHTML = `✅ <b>Análise Completa:</b> Trajeto via Linha Amarela possui 1 alerta de segurança (Fogo Cruzado) próximo a Bonsucesso. Sugerimos monitoramento em tempo real do IQT.`;
        // Aqui entraria o L.Routing.control para desenhar a linha real
    }, 1500);
}

// LÓGICA DO CHATBOT DE NORMAS
function processarChat() {
    const input = document.getElementById('user-query');
    if(!input.value) return;
    enviarDuvida(input.value);
    input.value = '';
}

function enviarDuvida(texto) {
    const win = document.getElementById('chat-messages');
    
    // Mensagem do Usuário
    win.innerHTML += `<div class="msg user">${texto}</div>`;
    
    // Lógica de Resposta da IA (Baseada no Manual 2.3)
    setTimeout(() => {
        let resposta = "Entendi sua dúvida. Com base no Manual 2.3, este procedimento exige atenção ao checklist de segurança. Deseja saber os próximos passos sobre a jornada ou sobre o uso do app?";
        
        if(texto.includes("TNO")) resposta = "O TNO (Transporte Noturno) exige descanso mínimo de 11h entre jornadas e verificação de fadiga. Posso te mostrar como registrar isso no sistema?";
        
        win.innerHTML += `<div class="msg bot">${resposta}</div>`;
        win.scrollTop = win.scrollHeight;
    }, 1000);
}

function alternarAba(id) {
    document.querySelectorAll('.aba-conteudo').forEach(a => a.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('ativo'));
    document.getElementById('secao-' + id).style.display = 'block';
    event.currentTarget.classList.add('ativo');
    if(id === 'mapa') setTimeout(() => map.invalidateSize(), 200);
}
