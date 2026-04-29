// Função para alternar entre as abas do Agente RIG
function mudarAba(tipo) {
    const main = document.getElementById('conteudo');
    const botoes = document.querySelectorAll('.tab-btn');
    
    // Remove a classe 'ativo' de todos os botões
    botoes.forEach(btn => btn.classList.remove('ativo'));

    if (tipo === 'consultor') {
        // Ativa o botão do consultor
        event.target.classList.add('ativo');
        
        main.innerHTML = `
            <div class="card-acao" style="grid-column: 1 / -1">
                <h2>Consultor de Normas Inteligente</h2>
                <p>Consulte legislações e normas de segurança da operação (MOPP, Jornada, etc).</p>
                <input type="text" id="pergunta" placeholder="Ex: Regra para transporte de carga perigosa">
                <button onclick="executarConsulta()">Consultar Agente RIG</button>
                <div id="resposta-consultor">Aguardando sua dúvida operacional...</div>
            </div>`;
    } else {
        // Recarrega a página para voltar ao painel de KPIs (IQT/TCO)
        location.reload();
    }
}

// Lógica de resposta do Consultor de Normas
function executarConsulta() {
    const pergunta = document.getElementById('pergunta').value.toLowerCase();
    const respostaElemento = document.getElementById('resposta-consultor');
    
    respostaElemento.style.color = "#00ff00"; // Cor de destaque para a resposta
    
    if (pergunta.includes("perigosa") || pergunta.includes("mopp")) {
        respostaElemento.innerText = "Agente RIG: Para cargas perigosas, o condutor deve portar o certificado MOPP atualizado e o veículo deve exibir os painéis de risco e rótulos de segurança conforme a ONU.";
    } else if (pergunta.includes("jornada") || pergunta.includes("descanso")) {
        respostaElemento.innerText = "Agente RIG: De acordo com a Lei 13.103, o motorista deve fazer uma pausa de 30 minutos a cada 5 horas e meia de condução ininterrupta.";
    } else if (pergunta.includes("velocidade")) {
        respostaElemento.innerText = "Agente RIG: A política de frota recomenda máxima de 80km/h em rodovias para otimização do TCO e redução de riscos de acidentes.";
    } else {
        respostaElemento.innerText = "Agente RIG: Consulta recebida. Analisando manuais de operação e normas técnicas da Globo Transportes...";
    }
}

// Função para o botão de análise de rota
function analisarRota() {
    const origem = document.getElementById('origem').value;
    const destino = document.getElementById('destino').value;
    
    if (origem && destino) {
        alert("Agente RIG: Iniciando análise de risco para a rota " + origem + " x " + destino + ". Verificando pontos de parada e alertas meteorológicos.");
    } else {
        alert("Agente RIG: Por favor, insira a origem e o destino para análise.");
    }
}
