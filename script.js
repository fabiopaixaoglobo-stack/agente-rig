const map = L.map('map').setView([-22.9068, -43.1729], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
        // Simulação de carregamento de dados
        document.getElementById('lista-veiculos').innerHTML = `
            <div class="veiculo"><b>Veículo GLO-102</b><br>Status: Em trânsito<br>Risco: Baixo</div>
            <div class="veiculo" style="margin-top:10px;"><b>Veículo GLO-550</b><br>Status: Parado<br>Risco: ⚠️ Atenção</div>
        `;
    };
    reader.readAsArrayBuffer(file);
});
