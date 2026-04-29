// 1. Mapa de Satélite
const map = L.map('map').setView([-22.9068, -43.1729], 11);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri'
}).addTo(map);

let controleRota;

// 2. Alternar Abas (Corrigido)
function alternarAba(abaId) {
    document.querySelectorAll('.aba-conteudo').forEach(div => div.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('ativo'));
    
    document.getElementById('secao-' + abaId).style.display = 'block';
    const btnAtivo = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.innerText.toLowerCase().includes(abaId));
    if(btnAtivo) btnAtivo.classList.add('ativo');

    if (abaId === 'mapa') setTimeout(() => map.invalidateSize(), 300);
}

// 3. Carregar Excel ou CSV
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        exibirAtendimentos(jsonData);
    };
    reader.readAsArrayBuffer(file);
});

function exibirAtendimentos(dados) {
    const lista = document.getElementById('lista-atendimentos');
    lista.innerHTML = '';
    document.getElementById('total-atendimentos').innerText = dados.length;

    dados.forEach(item => {
        let prog = item['Programa'] || "";
        let produto = prog.includes('-') ? prog.split('-')[1].split('/')[0].trim() : prog;

        lista.innerHTML += `
            <div class="atendimento-item">
                <strong>Produto: ${produto}</strong><br>
                👤 ${item['Motorista'] || 'N/A'}<br>
                🚗 ${item['Placa Veículo'] || 'N/A'}<br>
                📍 ${item['Localidade + Endereço'] || 'Sem endereço'}
            </div>`;
    });
}

// 4. Planejador de Rotas
function calcularRotaManual() {
    const orig = document.getElementById('origem').value;
    const dest = document.getElementById('destino').value;
    const painel = document.getElementById('painel-instrucoes');
    
    if(!orig || !dest) return alert("Por favor, preencha os dois campos.");
    
    painel.innerHTML = `<strong>RIG Analisando:</strong> Rota de ${orig} para ${dest}... <br><br> 
    Verificando alertas de segurança e restrições de tráfego na região do Rio de Janeiro.`;
}

// 5. Consultor Inteligente
function perguntaRapida(texto) {
    document.getElementById('pergunta').value = texto;
    consultarIA();
}

function consultarIA() {
    const p = document.getElementById('pergunta').value.toLowerCase();
    const r = document.getElementById('resposta-ia');
    
    if(p.includes("mopp")) r.innerText = "RIG: Obrigatório portar certificado MOPP e Kit de emergência para produtos perigosos.";
    else if(p.includes("tno")) r.innerText = "RIG: Transporte Noturno (TNO) exige descanso prévio e monitoramento ativo 24h.";
    else if(p.includes("jornada")) r.innerText = "RIG: Máximo de 5h30 de volante. Pausa obrigatória de 30 minutos.";
    else if(p.includes("monitoramento")) r.innerText = "RIG: Todos os veículos devem estar com GPS ativo no sistema Globo Transportes.";
    else r.innerText = "RIG: Não localizei esta norma específica. Tente os botões rápidos acima.";
}
