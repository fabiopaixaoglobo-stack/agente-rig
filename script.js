const map = L.map('map').setView([-22.9068, -43.1729], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

function showTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.remove('hidden');
    event.currentTarget.classList.add('active');
    if(id === 'mapa') map.invalidateSize();
}

document.getElementById('upload-mapa').addEventListener('change', (e) => {
    const reader = new FileReader();
    reader.onload = () => alert("Dados carregados com sucesso.");
    reader.readAsArrayBuffer(e.target.files[0]);
});

function sendMessage() {
    const input = document.getElementById('msg-input');
    const msg = input.value;
    const chat = document.getElementById('chat-msgs');
    chat.innerHTML += `<div style="margin: 5px; padding: 10px; background: #21262d;">${msg}</div>`;
    input.value = '';
}
