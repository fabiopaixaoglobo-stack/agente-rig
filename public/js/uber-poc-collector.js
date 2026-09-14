/**
 * UBER POC DOM COLLECTOR v1.0
 * Executado estritamente no contexto da aba https://m.uber.com do usuário autenticado.
 * Apenas lê texto do DOM visível (produtos e preços R$).
 * NUNCA acessa senhas, tokens, cookies ou dados pessoais.
 */
(function() {
    console.log("🔍 [Agente RIT - Uber PoC] Iniciando diagnóstico de leitura DOM...");
    
    // 1. Validação de Host
    if (!window.location.hostname.includes("uber.com")) {
        alert("⚠️ Este diagnóstico deve ser executado na aba do m.uber.com!");
        return { erro: "HOST_INVALIDO" };
    }

    // 2. Detecção de Cenário B (Usuário não logado / Tela de autenticação)
    const isLoginScreen = !!document.querySelector('input[type="password"]') || 
                          window.location.pathname.includes('/login') || 
                          window.location.pathname.includes('/auth') ||
                          document.body.innerText.includes('Faça login') ||
                          document.body.innerText.includes('Entrar com');
                          
    if (isLoginScreen) {
        console.warn("⚠️ [Cenário B] Usuário não logado ou tela de autenticação ativa.");
        alert("⚠️ [Cenário B] Você está na tela de login. Faça o login manualmente e pesquise a corrida antes de rodar o coletor.");
        return { erro: "USUARIO_NAO_LOGADO", cenario: "Cenário B" };
    }

    // 3. Algoritmo Semântico de Extração
    const modalidadesEncontradas = [];
    const nomesConhecidos = [
        { regex: /\buber\s*x\b/i, nome: 'UberX' },
        { regex: /\bcomfort\s*planet\b/i, nome: 'Comfort Planet' },
        { regex: /\bcomfort\b/i, nome: 'Uber Comfort' },
        { regex: /\bblack\b/i, nome: 'Uber Black' },
        { regex: /\bt[aá]xi\b/i, nome: 'Uber Taxi' },
        { regex: /\bflash\b/i, nome: 'Uber Flash' },
        { regex: /\bmoto\b/i, nome: 'Uber Moto' },
        { regex: /\bbag\b/i, nome: 'Uber Bag' }
    ];

    // Buscar elementos contendo padrão de moeda brasileira (R$)
    const todosElementos = Array.from(document.querySelectorAll('*'));
    const elementosPreco = todosElementos.filter(el => {
        if (!el || !el.innerText) return false;
        const txt = el.innerText.trim();
        return /^R\$\s*[\d\.,]+$/.test(txt) && el.children.length === 0;
    });

    console.log(`📊 Encontrados ${elementosPreco.length} elementos com padrão de moeda R$.`);

    elementosPreco.forEach(elPreco => {
        const precoTexto = elPreco.innerText.trim();
        const precoNumerico = parseFloat(precoTexto.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());

        // Subir até o container do card da corrida (até 6 níveis acima)
        let container = elPreco.parentElement;
        let achouNome = null;
        for (let i = 0; i < 6 && container && container !== document.body; i++) {
            const textoContainer = container.innerText || '';
            for (const item of nomesConhecidos) {
                if (item.regex.test(textoContainer) && !modalidadesEncontradas.some(m => m.modalidade === item.nome)) {
                    achouNome = item.nome;
                    break;
                }
            }
            if (achouNome) break;
            container = container.parentElement;
        }

        if (achouNome && precoNumerico > 0) {
            modalidadesEncontradas.push({
                modalidade: achouNome,
                preco: precoNumerico,
                precoTexto: precoTexto
            });
        }
    });

    if (modalidadesEncontradas.length === 0) {
        console.warn("⚠️ Nenhuma modalidade foi pareada. A página de seleção de veículos está aberta?");
        alert("⚠️ Nenhuma modalidade encontrada com preço. Verifique se o endereço de origem e destino já foram definidos na Uber.");
        return { erro: "NENHUMA_MODALIDADE_ENCONTRADA" };
    }

    console.log("✅ [Uber PoC] Modalidades extraídas com sucesso:", modalidadesEncontradas);

    const payload = {
        origem: 'm.uber.com',
        timestamp: new Date().toISOString(),
        distanciaKm: 52.2,
        tempoMin: 76,
        uberValores: modalidadesEncontradas
    };

    // Tentar enviar via fetch local
    fetch('http://localhost:3000/api/uber-poc/comparar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(res => res.json())
      .then(data => {
          console.log("🎯 [Agente RIT] Comparativo gerado com sucesso!", data);
          alert(`✅ [Agente RIT - Uber PoC]\n\n${modalidadesEncontradas.length} modalidades capturadas com sucesso!\n\nConfira os resultados no painel: http://localhost:3000/uber-poc.html`);
      }).catch(err => {
          console.log("ℹ️ Envio via HTTP local bloqueado pelo navegador. Copiando JSON para o clipboard...");
          navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
              alert(`✅ [Uber PoC] ${modalidadesEncontradas.length} modalidades lidas!\n\nO JSON foi copiado para a Área de Transferência. Cole no painel http://localhost:3000/uber-poc.html`);
          });
      });

    return payload;
})();
