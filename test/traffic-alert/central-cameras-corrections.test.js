const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Aba Central de Câmeras & Ocorrências - Auditoria e Correções', () => {
    const dashboardHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
    const styleCss = fs.readFileSync(path.join(__dirname, '../../public/style.css'), 'utf8');
    const mapServiceJs = fs.readFileSync(path.join(__dirname, '../../public/js/map-service.js'), 'utf8');
    const uiControllerJs = fs.readFileSync(path.join(__dirname, '../../public/js/ui-controller.js'), 'utf8');

    it('1. Tooltip em TODOS os itens da barra de camadas inteligentes e controles táticos', () => {
        // Câmeras
        assert.ok(dashboardHtml.includes('Exibe câmeras disponíveis no provedor selecionado.'), 'Tooltip Câmeras ausente');
        // OTT
        assert.ok(dashboardHtml.includes('Mostra ocorrências operacionais registradas em tempo real.'), 'Tooltip OTT ausente');
        // Fogo Cruzado
        assert.ok(dashboardHtml.includes('Exibe registros de disparos, tiroteios e áreas de risco reportadas.'), 'Tooltip Fogo Cruzado ausente');
        // Heatmap de Risco
        assert.ok(dashboardHtml.includes('Apresenta concentração histórica e atual de eventos de risco.'), 'Tooltip Heatmap ausente');
        // Seletor de Horizonte
        assert.ok(dashboardHtml.includes('Período temporal para cálculo do mapa de calor de risco'), 'Tooltip seletor horizonte ausente');
        // Provedor Basemap
        assert.ok(dashboardHtml.includes('Seleciona o estilo cartográfico base do mapa'), 'Tooltip Provedor ausente');
        // Re-Auditar CCO
        assert.ok(dashboardHtml.includes('Disparar auditoria completa e teste de conectividade das câmeras dos corredores.'), 'Tooltip Re-Auditar CCO ausente');
        // Diagnóstico de Fontes
        assert.ok(dashboardHtml.includes('Abrir painel de observabilidade, latência e integridade das fontes provedoras.'), 'Tooltip Diagnóstico de Fontes ausente');
        // Seletor UF
        assert.ok(dashboardHtml.includes('Alternar a Unidade Federativa (UF) para carregar ocorrências, câmeras e centralizar o mapa.'), 'Tooltip Seletor UF ausente');

        // Estilos CSS de tooltips de alta performance (< 500ms)
        assert.ok(styleCss.includes('[data-tooltip]'), 'Estilos [data-tooltip] ausentes no style.css');
        assert.ok(styleCss.includes('transition-delay'), 'transition-delay ausente no sistema de tooltips');
    });

    it('2. Remoção completa de referências ao Rock in Rio na aba CCO', () => {
        // CCO ROCK IN RIO não deve existir em dashboard.html na barra tática
        assert.ok(!dashboardHtml.includes('CCO ROCK IN RIO'), 'Referência a "CCO ROCK IN RIO" ainda presente em dashboard.html');
        assert.ok(dashboardHtml.includes('CCO TRANSPORTES'), 'Substituição por "CCO TRANSPORTES" ausente em dashboard.html');

        // map-service.js não deve possuir 🎸 CORREDOR ROCK IN RIO
        assert.ok(!mapServiceJs.includes('CORREDOR ROCK IN RIO'), 'Referência a "CORREDOR ROCK IN RIO" ainda presente em map-service.js');
        assert.ok(mapServiceJs.includes('CORREDOR ESTRATÉGICO'), 'Substituição por "CORREDOR ESTRATÉGICO" ausente em map-service.js');

        // Opção do seletor não deve conter Acesso RIR no texto visível
        assert.ok(!dashboardHtml.includes('(Acesso RIR)</option>'), 'Acesso RIR ainda visível na lista de corredores');
    });

    it('3. Explicação e cálculo do campo Disponibilidade %', () => {
        // Tooltip explicativo na tag de disponibilidade
        assert.ok(dashboardHtml.includes('Percentual de câmeras disponíveis e comunicando corretamente em relação ao total do corredor ou grupo selecionado.'), 'Explicação de disponibilidade ausente no dashboard.html');
        assert.ok(dashboardHtml.includes('Cálculo: (Câmeras Online / Total de Câmeras) × 100.'), 'Fórmula de cálculo ausente no tooltip');
        assert.ok(uiControllerJs.includes('dispPct'), 'Variável de cálculo dispPct presente');
        assert.ok(uiControllerJs.includes('statDispEl.title = `Percentual de câmeras disponíveis:'), 'Atualização dinâmica de tooltip de disponibilidade ausente no ui-controller.js');
    });

    it('4. Reposicionamento automático do mapa por UF (RJ, SP, MG, DF, PE)', () => {
        // Seletor possui opções de UF operacionais (sem ES não suportado)
        assert.ok(dashboardHtml.includes('value="RJ"'), 'Opção RJ ausente');
        assert.ok(dashboardHtml.includes('value="SP"'), 'Opção SP ausente');
        assert.ok(dashboardHtml.includes('value="MG"'), 'Opção MG ausente');
        assert.ok(dashboardHtml.includes('value="DF"'), 'Opção DF ausente');
        assert.ok(dashboardHtml.includes('value="PE"'), 'Opção PE ausente');

        // ui-controller.js implementa flyTo/setView nas coordenadas das UFs
        assert.ok(uiControllerJs.includes("SP: {"), 'Configuração de SP ausente');
        assert.ok(uiControllerJs.includes("MG: {"), 'Configuração de MG ausente');
        assert.ok(uiControllerJs.includes("ES: {"), 'Configuração de ES ausente');
        assert.ok(uiControllerJs.includes("this.transitoMap.map.flyTo(config.center"), 'Chamada de flyTo para reposicionar transitoMap ausente');

        // map-service.js inicializa com UF salva no localStorage
        assert.ok(mapServiceJs.includes("localStorage.getItem('rit_selected_regional')"), 'Leitura de regional inicial ausente no map-service.js');
        assert.ok(mapServiceJs.includes("-23.5505"), 'Coordenadas de SP presentes no map-service.js');
        assert.ok(mapServiceJs.includes("-19.9167"), 'Coordenadas de MG presentes no map-service.js');
        assert.ok(mapServiceJs.includes("-20.3155"), 'Coordenadas de ES presentes no map-service.js');
    });

    it('5. Auditoria de recursos: Heatmap funcional, Operações RIT e Radar ocultados', () => {
        // Heatmap é funcional com calibração e toast
        assert.ok(uiControllerJs.includes('Heatmap de Risco ativo:'), 'Feedback visual de ativação do Heatmap ausente');
        assert.ok(mapServiceJs.includes('minOpacity: 0.35'), 'Calibração de visibilidade do Heatmap ausente');

        // Operações RIT ocultado da interface (sem backend)
        assert.ok(dashboardHtml.includes('id="wrap-layer-operacoes-rit" style="display: none;'), 'Camada Operações RIT não está oculta');

        // Radar Meteorológico ocultado da barra de camadas do mapa da central (sem feed integrado no canvas)
        assert.ok(dashboardHtml.includes('id="wrap-layer-radar" style="display: none;'), 'Camada Radar Meteorológico no mapa da central não está oculta');

        // Re-Auditar CCO e Diagnóstico de Fontes preservados
        assert.ok(dashboardHtml.includes('Re-Auditar CCO'), 'Botão Re-Auditar CCO ausente');
        assert.ok(dashboardHtml.includes('Diagnóstico de Fontes'), 'Botão Diagnóstico de Fontes ausente');
    });
});
