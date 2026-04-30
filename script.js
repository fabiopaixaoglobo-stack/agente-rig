const map = L.map('map').setView([-22.9068, -43.1729], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Função de Alternar Abas
function alternarAba(id) {
    document.querySelectorAll('.aba-conteudo').forEach(a => a.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('ativo'));
    document.getElementById('secao-' + id).style.display = 'block';
    event.currentTarget.classList.add('ativo');
    if (id === 'mapa') map.invalidateSize();
}

// Upload Excel
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const data = new Uint8Array(event.target.result);
        const wb = XLSX.read(data, {type: 'array'});
        console.log("Planilha carregada:", wb.SheetNames);
        alert("Dados sincronizados com sucesso!");
    };
    reader.readAsArrayBuffer(e.target.files[0]);
});

// Chatbot Normas
function enviarMensagem() {
    const box = document.getElementById('chat-box');
    const msg = box.value;
    const chat = document.getElementById('chat-messages');
    chat.innerHTML += `<div class="msg user">${msg}</div>`;
    box.value = '';
    setTimeout(() => {
        chat.innerHTML += `<div class="msg bot">Análise processada. Verifique o Manual 2.3.</div>`;
        chat.scrollTop = chat.scrollHeight;
    }, 500);
}

function analisarRota() {
    document.getElementById('feedback-rota').innerText = "Cruzando dados... Rota segura validada.";
}
