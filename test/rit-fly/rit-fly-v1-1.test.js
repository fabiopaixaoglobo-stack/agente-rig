/**
 * SUÍTE DE TESTES E VALIDAÇÃO DE CRITÉRIOS DE ACEITE: RIT FLY v1.1
 * Valida as 10 melhorias de UX, Inteligência Operacional e Radar Aéreo
 */

require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { FlightDTO } = require('../../server/rit-fly/types/flight-dto');
const { OpenSkyProvider } = require('../../server/rit-fly/providers/opensky-provider');
const { AirportProvider } = require('../../server/rit-fly/providers/airport-provider');
const { MetarProvider } = require('../../server/rit-fly/providers/metar-provider');
const { RitFlyAI } = require('../../server/rit-fly/engine/rit-fly-ai');
const { AIRPORTS, FLIGHT_CATEGORIES, DATA_MODE } = require('../../server/rit-fly/constants');

test('✈️ RIT FLY v1.1 — EVOLUÇÃO UX & CENTRAL DE INTELIGÊNCIA AÉREA', async (suite) => {

    // =========================================================================
    // MELHORIA 01: TUTORIAL "COMO FUNCIONA" NO LOGIN E DASHBOARD
    // =========================================================================
    await suite.test('1. Melhoria 01: Tutorial "Como Funciona o RIT FLY" (7 Pilares e Onboarding)', () => {
        // Validação no dashboard.html
        const dashHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(dashHtml.includes('id="modalRitFlyTutorial"'), 'Deve conter modalRitFlyTutorial no dashboard');
        assert.ok(dashHtml.includes('id="fly-btn-tutorial"'), 'Deve conter botão de abrir tutorial no subheader');
        assert.ok(dashHtml.includes('1. Monitoramento de Voos em Tempo Real'), 'Deve explicar pilar 1');
        assert.ok(dashHtml.includes('2. Acompanhamento de Aeroportos'), 'Deve explicar pilar 2');
        assert.ok(dashHtml.includes('3. Previsão Operacional'), 'Deve explicar pilar 3');
        assert.ok(dashHtml.includes('4. Integração Voo + Transporte Terrestre'), 'Deve explicar pilar 4');
        assert.ok(dashHtml.includes('5. Alertas Automáticos'), 'Deve explicar pilar 5');
        assert.ok(dashHtml.includes('6. RIT Fly AI'), 'Deve explicar pilar 6');
        assert.ok(dashHtml.includes('7. Sincronização de Chegada e Embarque'), 'Deve explicar pilar 7');
        assert.ok(dashHtml.includes('id="fly-tutorial-dont-show"'), 'Deve conter opção Não mostrar novamente');

        // Validação no index.html (Login)
        const indexHtml = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
        assert.ok(indexHtml.includes('id="rit-fly-tutorial-modal"'), 'Deve conter modal de tutorial no login');
        assert.ok(indexHtml.includes('COMO FUNCIONA O RIT FLY'), 'Deve conter chamada explicativa no login');

        // Validação no apresentacao.html
        const apreHtml = fs.readFileSync(path.join(__dirname, '../../public/apresentacao.html'), 'utf8');
        assert.ok(apreHtml.includes('data-slide="9"'), 'Deve conter slide 9 dedicado ao RIT FLY');
        assert.ok(apreHtml.includes('RIT FLY · Central de Inteligência Aérea Corporativa'), 'Deve conter título oficial do RIT FLY no slide');
    });

    // =========================================================================
    // MELHORIA 02: CAMADAS DE MAPA (SELETOR DINÂMICO)
    // =========================================================================
    await suite.test('2. Melhoria 02: Seletor de 6 Camadas de Mapa Sem Recarregar Página', () => {
        const dashHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(dashHtml.includes('id="fly-select-map-layer"'), 'Deve conter seletor de camadas fly-select-map-layer');
        assert.ok(dashHtml.includes('value="radar"'), 'Deve conter opção Radar Aéreo');
        assert.ok(dashHtml.includes('value="padrao"'), 'Deve conter opção Mapa Padrão');
        assert.ok(dashHtml.includes('value="satelite"'), 'Deve conter opção Satélite');
        assert.ok(dashHtml.includes('value="transito"'), 'Deve conter opção Trânsito');
        assert.ok(dashHtml.includes('value="terreno"'), 'Deve conter opção Terreno');
        assert.ok(dashHtml.includes('value="escuro"'), 'Deve conter opção Modo Escuro');

        const mapJs = fs.readFileSync(path.join(__dirname, '../../public/js/rit-fly/rit-fly-map.js'), 'utf8');
        assert.ok(mapJs.includes('setBaseLayer(key)'), 'RitFlyMap deve implementar método setBaseLayer');
        assert.ok(mapJs.includes('this.baseLayers.radar'), 'RitFlyMap deve configurar camada radar');
        assert.ok(mapJs.includes('this.baseLayers.satelite'), 'RitFlyMap deve configurar camada satelite');
        assert.ok(mapJs.includes('this.baseLayers.transito'), 'RitFlyMap deve configurar camada transito');
        assert.ok(mapJs.includes('this.baseLayers.terreno'), 'RitFlyMap deve configurar camada terreno');
    });

    // =========================================================================
    // MELHORIA 03: TOOLTIPS E LEGENDA INTELIGENTE
    // =========================================================================
    await suite.test('3. Melhoria 03: Tooltips Padronizados em Todos os Menus e Controles', () => {
        const dashHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(dashHtml.includes('data-tooltip="Mostra situação operacional dos 8 aeroportos monitorados"'), 'Aba Aeroportos deve ter tooltip');
        assert.ok(dashHtml.includes('data-tooltip="Assistente virtual especializado em operações e riscos aéreos"'), 'Aba RIT FLY AI deve ter tooltip');
        assert.ok(dashHtml.includes('data-tooltip="Relaciona voos com transfer e transporte terrestre"'), 'Aba Vincular RIT deve ter tooltip');
        assert.ok(dashHtml.includes('data-tooltip="Mostra eventos e alertas operacionais ativos"'), 'Aba Alertas deve ter tooltip');

        const css = fs.readFileSync(path.join(__dirname, '../../public/styles/rit-fly.css'), 'utf8');
        assert.ok(css.includes('[data-tooltip]'), 'Folha de estilo deve conter regra [data-tooltip]');
        assert.ok(css.includes('[data-tooltip]::after'), 'Folha de estilo deve renderizar pseudoelemento do tooltip');
    });

    // =========================================================================
    // MELHORIA 04: RADAR AÉREO COM ROTAÇÃO POR PROA (HEADING)
    // =========================================================================
    await suite.test('4. Melhoria 04: Radar Aéreo com Aeronaves Orientadas pelo Rumo', () => {
        const mapJs = fs.readFileSync(path.join(__dirname, '../../public/js/rit-fly/rit-fly-map.js'), 'utf8');
        assert.ok(mapJs.includes('createAirplaneIconSvg'), 'RitFlyMap deve criar ícone SVG customizado');
        assert.ok(mapJs.includes('transform: rotate(${rotation}deg)'), 'Ícone da aeronave deve girar conforme rumo (heading)');
        assert.ok(mapJs.includes('onFlightSelectCallback'), 'Clique na aeronave deve disparar callback de seleção');
    });

    // =========================================================================
    // MELHORIA 05: DETALHE DO VOO (DRAWER LATERAL ESTILO FLIGHTRADAR24)
    // =========================================================================
    await suite.test('5. Melhoria 05: Detalhe do Voo em Drawer Lateral 100% em Português', () => {
        const dashHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(dashHtml.includes('id="fly-flight-drawer"'), 'Deve conter container fly-flight-drawer');
        assert.ok(dashHtml.includes('id="fly-drawer-airline"'), 'Deve conter campo de companhia aérea');
        assert.ok(dashHtml.includes('id="fly-drawer-flight-num"'), 'Deve conter número do voo');
        assert.ok(dashHtml.includes('id="fly-drawer-orig-code"'), 'Deve conter código de origem');
        assert.ok(dashHtml.includes('id="fly-drawer-dest-code"'), 'Deve conter código de destino');
        assert.ok(dashHtml.includes('id="fly-drawer-progress-fill"'), 'Deve conter barra de progresso do voo');
        assert.ok(dashHtml.includes('id="fly-drawer-dist-restante"'), 'Deve conter distância restante');
        assert.ok(dashHtml.includes('id="fly-drawer-tempo-restante"'), 'Deve conter tempo restante de voo');
        assert.ok(dashHtml.includes('id="fly-drawer-altitude"'), 'Deve conter altitude em metros');
        assert.ok(dashHtml.includes('id="fly-drawer-velocidade"'), 'Deve conter velocidade no solo');

        // Teste de cálculo métrico no FlightDTO
        const dto = new FlightDTO({
            callsign: 'GLO1234',
            numeroVoo: 'G3 1234',
            origem: 'SDU',
            destino: 'CGH',
            latitude: -23.2,
            longitude: -44.9,
            altitudeFt: 24000,
            velocidadeKts: 420
        });

        assert.ok(dto.distanciaTotalKm > 0, 'Deve calcular distância total entre SDU e CGH');
        assert.ok(dto.distanciaRestanteKm > 0, 'Deve calcular distância restante');
        assert.ok(dto.progressoVooPct >= 5 && dto.progressoVooPct <= 100, 'Progresso deve ser entre 5% e 100%');
        assert.ok(dto.tempoRestanteMinutos > 0, 'Deve calcular tempo restante de voo');
        assert.equal(dto.altitudeM, Math.round(24000 * 0.3048));
    });

    // =========================================================================
    // MELHORIA 06: VOOS POR AEROPORTO ("VOOS DO DIA")
    // =========================================================================
    await suite.test('6. Melhoria 06: Voos por Aeroporto com Fatiamento Temporal', async () => {
        const dashHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(dashHtml.includes('id="fly-airport-board-view"'), 'Deve conter visão de quadro de voos do dia');
        assert.ok(dashHtml.includes('data-board-tab="partidas"'), 'Deve conter aba de Partidas');
        assert.ok(dashHtml.includes('data-board-tab="chegadas"'), 'Deve conter aba de Chegadas');
        assert.ok(dashHtml.includes('data-board-tab="atrasados"'), 'Deve conter aba de Atrasados');
        assert.ok(dashHtml.includes('data-slice="2h_passadas"'), 'Deve conter fatia Últimas 2h');
        assert.ok(dashHtml.includes('data-slice="6h_passadas"'), 'Deve conter fatia Últimas 6h');
        assert.ok(dashHtml.includes('data-slice="12h_passadas"'), 'Deve conter fatia Últimas 12h');
        assert.ok(dashHtml.includes('data-slice="hoje"'), 'Deve conter fatia Hoje (Todos)');
        assert.ok(dashHtml.includes('data-slice="2h_futuras"'), 'Deve conter fatia Próximas 2h');
        assert.ok(dashHtml.includes('data-slice="6h_futuras"'), 'Deve conter fatia Próximas 6h');
        assert.ok(dashHtml.includes('id="fly-board-search-input"'), 'Deve conter busca rápida interna no aeroporto');

        // Teste do AirportProvider retornando voos do aeroporto
        const metarProvider = new MetarProvider();
        const airportProvider = new AirportProvider(metarProvider);
        const voosTeste = [
            new FlightDTO({ id: 'f1', callsign: 'GLO1234', numeroVoo: 'G3 1234', origem: 'SDU', destino: 'CGH', atrasoMinutos: 0 }),
            new FlightDTO({ id: 'f2', callsign: 'TAM3456', numeroVoo: 'LA 3456', origem: 'GIG', destino: 'SDU', atrasoMinutos: 25 })
        ];

        const details = await airportProvider.getAirportDetails('SDU', voosTeste);
        assert.ok(details, 'Deve detalhar aeroporto SDU');
        assert.equal(details.partidas.length, 1, 'SDU deve ter 1 partida');
        assert.equal(details.chegadas.length, 1, 'SDU deve ter 1 chegada');
        assert.equal(details.totais.atrasos, 1, 'Deve identificar 1 voo com atraso em SDU');
    });

    // =========================================================================
    // MELHORIA 07: FILTRO POR COMPANHIA AÉREA
    // =========================================================================
    await suite.test('7. Melhoria 07: Filtro Instantâneo por Companhia Aérea', () => {
        const dashHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(dashHtml.includes('data-airline="todas"'), 'Deve conter pill Todas');
        assert.ok(dashHtml.includes('data-airline="GOL"'), 'Deve conter pill GOL');
        assert.ok(dashHtml.includes('data-airline="LATAM"'), 'Deve conter pill LATAM');
        assert.ok(dashHtml.includes('data-airline="AZUL"'), 'Deve conter pill AZUL');
        assert.ok(dashHtml.includes('data-airline="ITA"'), 'Deve conter pill ITA');
        assert.ok(dashHtml.includes('data-airline="VOEPASS"'), 'Deve conter pill VOEPASS');
        assert.ok(dashHtml.includes('data-airline="EXECUTIVOS"'), 'Deve conter pill Executivos');
        assert.ok(dashHtml.includes('data-airline="HELICOPTEROS"'), 'Deve conter pill Helicópteros');

        // Teste de filtragem no OpenSkyProvider
        const provider = new OpenSkyProvider();
        const voos = [
            new FlightDTO({ id: 'v1', callsign: 'GLO1234', companhia: 'GOL Linhas Aéreas', categoria: 'comercial' }),
            new FlightDTO({ id: 'v2', callsign: 'TAM3456', companhia: 'LATAM Brasil', categoria: 'comercial' }),
            new FlightDTO({ id: 'v3', callsign: 'PT-HGL', prefixo: 'PT-HGL', companhia: 'Líder Aviação', categoria: 'helicoptero' })
        ];

        const filtradosGol = provider.applyFilters(voos, { companhia: 'GOL' });
        assert.equal(filtradosGol.length, 1);
        assert.equal(filtradosGol[0].id, 'v1');

        const filtradosHeli = provider.applyFilters(voos, { companhia: 'HELICOPTEROS' });
        assert.equal(filtradosHeli.length, 1);
        assert.equal(filtradosHeli[0].id, 'v3');
    });

    // =========================================================================
    // MELHORIA 08: RIT FLY AI CHATBOT CONVERSACIONAL
    // =========================================================================
    await suite.test('8. Melhoria 08: Chatbot Conversacional RIT FLY AI com Digitação Livre', async () => {
        const dashHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(dashHtml.includes('id="fly-ai-messages-container"'), 'Deve conter histórico de mensagens');
        assert.ok(dashHtml.includes('id="fly-ai-input"'), 'Deve conter input de digitação livre');
        assert.ok(dashHtml.includes('id="fly-ai-form"'), 'Deve conter formulário com envio por Enter');

        // Teste de resposta em linguagem natural
        const openSkyProvider = new OpenSkyProvider();
        const metarProvider = new MetarProvider();
        const airportProvider = new AirportProvider(metarProvider);
        const ritFlyAI = new RitFlyAI({ openSkyProvider, airportProvider, metarProvider });

        const resp = await ritFlyAI.answer('Quais as condições meteorológicas em Congonhas?');
        assert.ok(resp.texto, 'Deve responder à consulta em linguagem natural');
        assert.ok(resp.texto.includes('Congonhas') || resp.texto.includes('SBSP'), 'Resposta deve contextualizar Congonhas');
    });

    // =========================================================================
    // MELHORIA 09: PADRONIZAÇÃO ESTRITA DE IDIOMA (100% PT-BR)
    // =========================================================================
    await suite.test('9. Melhoria 09: Padronização Estrita de Idioma sem Termos Residuais em Inglês', () => {
        const dashHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        const viewJs = fs.readFileSync(path.join(__dirname, '../../public/js/rit-fly/rit-fly-view.js'), 'utf8');

        // Verifica termos proibidos nos elementos visuais do RIT FLY
        assert.ok(!dashHtml.includes('Scheduled Departure'), 'Não deve exibir Scheduled Departure');
        assert.ok(!dashHtml.includes('Estimated Arrival:'), 'Não deve exibir Estimated Arrival');
        assert.ok(dashHtml.includes('Horário Estimado (ETA)'), 'Deve exibir Horário Estimado (ETA)');
        assert.ok(dashHtml.includes('Situação Operacional') || viewJs.includes('Situação Operacional'), 'Deve usar Situação Operacional');
        assert.ok(dashHtml.includes('Velocidade no Solo'), 'Deve usar Velocidade no Solo');
        assert.ok(dashHtml.includes('Tempo Restante de Voo'), 'Deve usar Tempo Restante de Voo');
    });

    // =========================================================================
    // MELHORIA 10: MELHORIAS VISUAIS OPERACIONAIS & INDICADOR DE TEMPO REAL
    // =========================================================================
    await suite.test('10. Melhoria 10: Legenda Inteligente, Pulso de Tempo Real e Frescura dos Dados', () => {
        const dashHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(dashHtml.includes('id="fly-map-legend"'), 'Deve conter legenda do mapa fly-map-legend');
        assert.ok(dashHtml.includes('class="fly-live-pulse"'), 'Deve conter indicador com animação de pulso');
        assert.ok(dashHtml.includes('id="fly-live-badge-text"'), 'Deve conter badge textual de tempo real');

        const css = fs.readFileSync(path.join(__dirname, '../../public/styles/rit-fly.css'), 'utf8');
        assert.ok(css.includes('@keyframes fly-pulse'), 'CSS deve definir animação fluida fly-pulse');
        assert.ok(css.includes('.fly-map-legend'), 'CSS deve estilizar legenda tática');
        assert.ok(css.includes('.fly-flight-drawer'), 'CSS deve estilizar drawer lateral');
    });

    // =========================================================================
    // MELHORIA 11: SILHUETA FLIGHTAWARE & PAINEL DE OCORRÊNCIAS CONSOLIDADAS
    // =========================================================================
    await suite.test('11. Melhoria 11: Silhueta de Aeronave Estilo FlightAware e Painel de Ocorrências Consolidadas', () => {
        const dashHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        const mapJs = fs.readFileSync(path.join(__dirname, '../../public/js/rit-fly/rit-fly-map.js'), 'utf8');
        const viewJs = fs.readFileSync(path.join(__dirname, '../../public/js/rit-fly/rit-fly-view.js'), 'utf8');
        const css = fs.readFileSync(path.join(__dirname, '../../public/styles/rit-fly.css'), 'utf8');
        const { FlightStore } = require('../../server/rit-fly/store/flight-store');

        // 1. Verifica que o ícone antigo "estrela do mar" foi substituído pela silhueta FlightAware com contorno nítido
        assert.ok(!mapJs.includes('M12 2L9 9H2L4 12H9L7 19L9 20L12 15L15 20L17 19L15 12H20L22 9H15L12 2Z'), 'Não deve usar o path antigo que parecia estrela do mar');
        assert.ok(mapJs.includes('stroke="#090d16"'), 'Ícone de avião deve ter contorno escuro estilo FlightAware');

        // 2. Verifica presença do Painel de Ocorrências Consolidadas no HTML e View
        assert.ok(dashHtml.includes('id="fly-consolidated-occurrences-box"'), 'HTML deve conter o Painel de Ocorrências Consolidadas na visão geral');
        assert.ok(dashHtml.includes('Painel de Ocorrências Consolidadas'), 'HTML deve exibir título Painel de Ocorrências Consolidadas');
        assert.ok(viewJs.includes('renderConsolidatedOccurrences'), 'RitFlyView deve renderizar ocorrências consolidadas');
        assert.ok(css.includes('.fly-occurrences-panel-box'), 'CSS deve estilizar o Painel de Ocorrências Consolidadas');

        // 3. Verifica consolidação no backend (FlightStore.buildConsolidatedOccurrences)
        const store = new FlightStore();
        const mockFlights = [
            { id: 'f1', numeroVoo: 'G3 1450', companhia: 'GOL', prefixo: 'PR-GXJ', origem: 'SDU', destino: 'CGH', atrasoMinutos: 28, etaFormatado: '18:40' }
        ];
        const mockAirports = [
            {
                iata: 'GRU',
                icao: 'SBGR',
                nome: 'Aeroporto Internacional de Guarulhos',
                cidade: 'São Paulo',
                statusOperacional: 'ATENÇÃO',
                regraVoo: 'MVFR',
                metarDisponivel: true,
                chegadasPrevistas: 14,
                partidasPrevistas: 11,
                voosAtrasados: 2,
                taxaPontualidadePct: 88,
                clima: {
                    disponivel: true,
                    flightRule: 'MVFR',
                    condicoes: 'Névoa Úmida (BR)',
                    temperaturaC: 19,
                    vento: { velocidadeKt: 12, descricao: '140° a 12 kt' },
                    visibilidade: { descricao: '4500m' }
                }
            }
        ];
        const consolidated = store.buildConsolidatedOccurrences(mockFlights, mockAirports, 20);
        assert.ok(consolidated.occurrences.length >= 3, 'Deve consolidar ocorrências de clima METAR, atrasos e fluxo de hub');
        assert.ok(consolidated.summary.porCategoria.clima >= 1, 'Deve contabilizar ocorrência de clima/METAR');
        assert.ok(consolidated.summary.porCategoria.atrasos >= 1, 'Deve contabilizar ocorrência de atraso');
        assert.ok(consolidated.summary.porCategoria.hubs >= 1, 'Deve contabilizar ocorrência de fluxo no hub');
    });
});
