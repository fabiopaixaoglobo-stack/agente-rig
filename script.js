// Função para alternar entre as abas: Monitoramento e Consultor
function mudarAba(tipo) {
    const conteudo = document.getElementById('conteudo');
    
    if (tipo === 'consultor') {
        conteudo.innerHTML = `
            <div class="cartao-acao" style="grid-column: 1 / -1">
                <h3>Consultor de Normas Inteligente</h3>
                <p>Consulte normas de segurança e legislação de transportes.</p>
                <input type="text" id="pergunta" placeholder="Ex: Regra para carga perigosa ou jornada">
                <button onclick="executarConsulta()">Consultar Agente RIG</button>
                <div id="resposta-agente" style="margin-top: 15px; color: #00ff00; font-weight: bold;"></div>
            </div>`;
    } else {
        // Recarrega a visão original com os KPIs
        location.reload();
    }
}

// Lógica de respostas do Consultor
function executarConsulta() {
    const q = document.getElementById('pergunta').value.toLowerCase();
    const resp = document.getElementById('resposta-agente');
    
    if (q.includes("perigosa") || q.includes("mopp")) {
        resp.innerText = "Agente RIG: Cargas perigosas exigem certificado MOPP e sinalização específica no veículo.";
    } else if (q.includes("jornada") || q.includes("descanso")) {
        resp.innerText = "Agente RIG: Conforme a Lei 13.103, é obrigatório descanso de 30 min a cada 5h30 de direção.";
    } else {
        resp.innerText = "Agente RIG: Analisando base de dados operacional... Tente termos como 'jornada' ou 'carga perigosa'.";
    }
}

// Função para o botão Analisar Rota
function analisarRota() {
    alert("Agente RIG: Calculando riscos, pedágios e tempo estimado para a rota informada...");
}
