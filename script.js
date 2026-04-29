// 1. Inicialização do Mapa
const map = L.map('map').setView([-22.9068, -43.1729], 11);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri'
}).addTo(map);

let controleRota;

// 2. Navegação entre Abas
function alternarAba(abaId) {
    document.querySelectorAll('.aba-conteudo').forEach(div => div.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('ativo'));
    
    document.getElementById('secao-' + abaId).style.display = 'block';
    event.target.classList.add('ativo');
    
    if (abaId === 'mapa') setTimeout(() => map.invalidateSize(), 200);
}

// 3. Processamento de Planilha (Mapa)
document.getElementById('upload-mapa').addEventListener('change', function(e) {
    const file = e.target.files[0];
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            exibirAtendimentos(results.data);
        }
    });
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
                👤 ${item['Motorista']}<br>
                🚗 ${item['Placa']} | ${item['Tipo de Veículo']}<br>
                📍 ${item['Localidade + Endereço']}
            </div>`;
    });
}

// 4. Lógica de Rotas Manuais
function calcularRotaManual() {
    const orig = document.getElementById('origem').value;
    const dest = document.getElementById('destino').value;
    if(!orig || !dest) return alert("Preencha origem e destino!");
    
    alert(`Agente RIG: Iniciando cálculo de rota para ${dest}. Verificando condições de tráfego...`);
}

// 5. Consultor de Normas
function consultarIA() {
    const pergunta = document.getElementById('pergunta').value.toLowerCase();
    const resp = document.getElementById('resposta-ia');
    
    if(pergunta.includes("mopp")) {
        resp.innerText = "RIG: Para MOPP, o condutor deve ter o curso na CNH e o veículo deve portar o Kit de Emergência completo.";
    } else if(pergunta.includes("jornada")) {
        resp.innerText = "RIG: Lei 13.103: Máximo 5h30 de direção contínua, seguida de 30 min de descanso.";
    } else {
        resp.innerText = "RIG: Consultando manuais Globo... Tente termos como 'MOPP', 'Jornada' ou 'Velocidade'.";
    }
}
