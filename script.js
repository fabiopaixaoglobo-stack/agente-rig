const map = L.map('map').setView([-22.9068, -43.1729], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

function showTab(id) {
    document.querySelectorAll('.aba-conteudo').forEach(a => a.classList.remove('ativo'));
    document.getElementById(id).classList.add('ativo');
    if(id === 'mapa') map.invalidateSize();
}

document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        
        const container = document.getElementById('dados-excel');
        container.innerHTML = ''; 
        jsonData.forEach(row => {
            container.innerHTML += `<div style="border-bottom:1px solid #333; padding:5px 0;">${JSON.stringify(row)}</div>`;
        });
    };
    reader.readAsArrayBuffer(e.target.files[0]);
});
