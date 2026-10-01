/**
 * Testes Automatizados de Inteligência de Trânsito Regional — RIT ALERTA
 * Valida os 4 requisitos críticos:
 * 1. Painel lateral de 9 vias monitoradas por regional (RJ, SP, BH, BSB, REC)
 * 2. Sincronização e alternância completa de regional (mapa, vias, KPIs, ocorrências, câmeras, fontes)
 * 3. Explicabilidade e tooltips operacionais de todos os KPIs
 * 4. Resolução de indicadores zerados / pipeline de sync em tempo real
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

describe('🚦 RIT ALERTA — INTELIGÊNCIA REGIONAL DE TRÂNSITO', () => {

    const trafficConditionsPath = path.resolve(__dirname, '../../public/data/traffic-conditions.json');
    const dashboardHtmlPath = path.resolve(__dirname, '../../public/dashboard.html');
    const uiControllerPath = path.resolve(__dirname, '../../public/js/ui-controller.js');
    const trafficViewPath = path.resolve(__dirname, '../../public/js/traffic-alert/traffic-alert-view.js');
    const trafficMapPath = path.resolve(__dirname, '../../public/js/traffic-alert/traffic-alert-map.js');
    const trafficCssPath = path.resolve(__dirname, '../../public/styles/traffic-alert.css');

    // Expected corridors per regional (Globo Standard - 9 each)
    const EXPECTED_CORRIDORS = {
        'RJ': ['Av Brasil', 'Presidente Dutra', 'Linha Vermelha', 'Linha Amarela', 'Transolímpica', 'Centro', 'Barra da Tijuca', 'Zona Sul', 'Ponte Rio-Niterói'],
        'SP': ['Marginal Tietê', 'Marginal Pinheiros', 'Radial Leste', 'Av dos Bandeirantes', 'Rodovia Anchieta', 'Rodovia Imigrantes', 'Castelo Branco', 'Raposo Tavares', 'Ayrton Senna'],
        'BH': ['Av Cristiano Machado', 'Anel Rodoviário', 'Av Antônio Carlos', 'Av Amazonas', 'Via Expressa', 'BR-040', 'BR-381', 'Centro', 'Pampulha'],
        'BSB': ['EPIA', 'Eixo Monumental', 'Eixão Sul', 'Eixão Norte', 'EPIG', 'EPDB', 'Ponte JK', 'Estrada Parque Taguatinga', 'BR-060'],
        'REC': ['Av Agamenon Magalhães', 'Av Boa Viagem', 'BR-101', 'BR-232', 'Via Mangue', 'PE-015', 'Centro Recife', 'Olinda', 'Jaboatão']
    };

    let server;
    let baseUrl;

    before(async () => {
        const express = require('express');
        const app = express();
        const trafficRouter = require('../../server/traffic-alert/routes/traffic-alert-routes');
        app.use(express.json());
        app.use('/api/traffic-alert', trafficRouter);

        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}/api/traffic-alert`;
                resolve();
            });
        });
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('1. Catálogo estruturado de vias monitoradas possui exatamente 9 corredores por regional', () => {
        assert.ok(fs.existsSync(trafficConditionsPath), 'traffic-conditions.json deve existir');
        const data = JSON.parse(fs.readFileSync(trafficConditionsPath, 'utf8'));

        for (const [reg, expectedList] of Object.entries(EXPECTED_CORRIDORS)) {
            const corridors = Array.isArray(data[reg]) ? data[reg] : data[reg]?.corredores;
            assert.ok(corridors, `Estrutura de dados deve conter regional ${reg}`);
            assert.ok(Array.isArray(corridors), `corredores de ${reg} deve ser array`);
            assert.strictEqual(corridors.length, 9, `Regional ${reg} deve conter exatamente 9 corredores estruturados`);

            const viaNames = corridors.map(c => c.via);
            for (const expectedVia of expectedList) {
                assert.ok(viaNames.includes(expectedVia), `Regional ${reg} deve monitorar via "${expectedVia}"`);
            }

            // Cada corredor deve possuir atributos operacionais obrigatórios
            for (const c of corridors) {
                assert.ok(c.via, 'Corredor deve ter nome da via');
                assert.ok(c.status, `Corredor ${c.via} deve ter status`);
                assert.ok(typeof c.retencaoMin === 'number', `Corredor ${c.via} deve ter retencaoMin numérica`);
                assert.ok(c.tendencia, `Corredor ${c.via} deve ter tendência (ESTÁVEL, AGRAVANDO, MELHORANDO)`);
                assert.ok(c.ocorrenciaAtiva !== undefined, `Corredor ${c.via} deve ter campo de ocorrência ativa`);
            }
        }
    });

    it('2. Endpoint GET /traffic-conditions responde com 9 corredores e KPIs para cada regional', async () => {
        for (const reg of ['RJ', 'SP', 'BH', 'BSB', 'REC']) {
            const res = await fetch(`${baseUrl}/traffic-conditions?region=${reg}`);
            assert.strictEqual(res.status, 200, `Status 200 para regional ${reg}`);
            const body = await res.json();

            assert.strictEqual(body.ok, true, `Resposta ok para ${reg}`);
            assert.strictEqual(body.region, reg, `Regional retornada deve ser ${reg}`);
            assert.strictEqual(body.count, 9, `Deve retornar 9 corredores para ${reg}`);
            assert.strictEqual(body.corridors.length, 9, `Lista deve conter 9 itens para ${reg}`);

            // KPIs dinâmicos calculados
            assert.ok(body.kpis, `Deve incluir KPIs para ${reg}`);
            assert.ok(typeof body.kpis.mobilidadeIndex === 'number', 'mobilidadeIndex deve ser numérico');
            assert.ok(body.kpis.mobilidadeIndex >= 0 && body.kpis.mobilidadeIndex <= 100, 'mobilidadeIndex deve estar entre 0 e 100');
            assert.ok(typeof body.kpis.tempoMedioRetencao === 'number', 'tempoMedioRetencao deve ser numérico');
            assert.ok(typeof body.kpis.corredoresCriticos === 'number', 'corredoresCriticos deve ser numérico');
            assert.ok(typeof body.kpis.viasAfetadas === 'number', 'viasAfetadas deve ser numérico');
            assert.ok(['BAIXO', 'MODERADO', 'ALTO', 'CRÍTICO'].includes(body.kpis.impactoOperacional), `impactoOperacional válido para ${reg}`);
        }
    });

    it('3. Endpoint GET /weather-alerts e /cameras retornam dados específicos da regional consultada', async () => {
        // Alertas meteorológicos
        const wRj = await (await fetch(`${baseUrl}/weather-alerts?region=RJ`)).json();
        assert.ok((wRj.operationalStage?.source || '').includes('COR-Rio'), 'RJ deve consultar COR-Rio');

        const wSp = await (await fetch(`${baseUrl}/weather-alerts?region=SP`)).json();
        assert.ok((wSp.operationalStage?.source || '').includes('CGE-SP'), 'SP deve consultar CGE-SP');

        const wBh = await (await fetch(`${baseUrl}/weather-alerts?region=BH`)).json();
        assert.ok((wBh.operationalStage?.source || '').includes('Belo Horizonte') || (wBh.operationalStage?.source || '').includes('BH'), 'BH deve consultar Defesa Civil BH');

        const wBsb = await (await fetch(`${baseUrl}/weather-alerts?region=BSB`)).json();
        assert.ok((wBsb.operationalStage?.source || '').includes('Brasília') || (wBsb.operationalStage?.source || '').includes('DF'), 'BSB deve consultar Defesa Civil DF');

        const wRec = await (await fetch(`${baseUrl}/weather-alerts?region=REC`)).json();
        assert.ok((wRec.operationalStage?.source || '').includes('Recife') || (wRec.operationalStage?.source || '').includes('APAC'), 'REC deve consultar APAC/Recife');

        // Câmeras regionais
        for (const reg of ['RJ', 'SP', 'BH', 'BSB', 'REC']) {
            const camRes = await (await fetch(`${baseUrl}/cameras?region=${reg}`)).json();
            assert.strictEqual(camRes.ok, true);
            assert.strictEqual(camRes.region, reg, `Resposta da regional de câmeras deve ser ${reg}`);
            assert.ok(camRes.data.length > 0, `Deve retornar câmeras para ${reg}`);
        }
    });

    it('4. Tooltips operacionais explicativos estão presentes em TODOS os KPIs no dashboard.html', () => {
        const html = fs.readFileSync(dashboardHtmlPath, 'utf8');

        // IDs obrigatórios de KPI
        const kpiCards = [
            'ta-kpi-card-mobilidade',
            'ta-kpi-card-retencao',
            'ta-kpi-card-ativas',
            'ta-kpi-card-crit',
            'ta-kpi-card-vias',
            'ta-kpi-card-cams',
            'ta-kpi-fontes-card'
        ];

        for (const id of kpiCards) {
            assert.ok(html.includes(`id="${id}"`), `Card de KPI #${id} deve existir no markup`);
        }

        // Validação dos tooltips operacionais requeridos
        assert.ok(html.includes('data-tooltip="Índice Geral de Mobilidade Urbana:'), 'Tooltip do Índice de Mobilidade deve constar');
        assert.ok(html.includes('data-tooltip="Tempo Médio de Retenção:'), 'Tooltip de Tempo Médio de Retenção deve constar');
        assert.ok(html.includes('data-tooltip="Ocorrências Ativas: Quantidade de incidentes encontrados em fontes públicas monitoradas nos últimos 15 minutos."'), 'Tooltip de Ocorrências Ativas deve constar');
        assert.ok(html.includes('data-tooltip="Incidentes Críticos: Ocorrências classificadas como bloqueio total, acidente grave, alagamento ou interrupção operacional."'), 'Tooltip de Incidentes Críticos deve constar');
        assert.ok(html.includes('data-tooltip="Vias Afetadas: Quantidade de corredores monitorados com velocidade abaixo do padrão esperado'), 'Tooltip de Vias Afetadas deve constar');
        assert.ok(html.includes('data-tooltip="Cobertura: Quantidade de câmeras públicas online e acessíveis'), 'Tooltip de Cobertura de Câmeras deve constar');
        assert.ok(html.includes('data-tooltip="Saúde das Fontes: Percentual de disponibilidade dos serviços de trânsito'), 'Tooltip de Saúde das Fontes deve constar');
    });

    it('5. Painel lateral estruturado de vias monitoradas e alternância de abas existem no dashboard.html', () => {
        const html = fs.readFileSync(dashboardHtmlPath, 'utf8');

        assert.ok(html.includes('id="ta-tab-btn-vias"'), 'Botão de alternância da aba Vias deve existir');
        assert.ok(html.includes('id="ta-tab-btn-feed"'), 'Botão de alternância da aba Feed deve existir');
        assert.ok(html.includes('id="ta-vias-view-panel"'), 'Container ta-vias-view-panel deve existir');
        assert.ok(html.includes('id="ta-corridors-table-body"'), 'Tabela de corredores #ta-corridors-table-body deve existir');
        assert.ok(html.includes('id="ta-feed-view-panel"'), 'Container ta-feed-view-panel deve existir');
        assert.ok(html.includes('id="ta-sub-regional-badge"'), 'Badge de praça regional no subheader deve existir');
        assert.ok(html.includes('id="ta-map-malha-label"'), 'Label de malha urbana no mapa deve existir');
    });

    it('6. Integração completa do ui-controller e frontend com a sincronização de regional', () => {
        const uiController = fs.readFileSync(uiControllerPath, 'utf8');
        const viewJs = fs.readFileSync(trafficViewPath, 'utf8');
        const mapJs = fs.readFileSync(trafficMapPath, 'utf8');

        // Confirma que ui-controller sincroniza trafficAlertView na troca de regional
        assert.ok(uiController.includes('this.trafficAlertView.setRegional(rawReg || reg)'), 'ui-controller deve chamar setRegional em aplicarRegiao');

        // Confirma métodos implementados na View
        assert.ok(viewJs.includes('setRegional(rawReg)'), 'TrafficAlertView deve implementar setRegional');
        assert.ok(viewJs.includes('_renderCorridorsTable()'), 'TrafficAlertView deve implementar _renderCorridorsTable');
        assert.ok(viewJs.includes('_renderKPIs()'), 'TrafficAlertView deve implementar _renderKPIs');
        assert.ok(viewJs.includes('_updateCorridorFilterOptions(region)'), 'TrafficAlertView deve atualizar dropdown de corredores por regional');

        // Confirma coordenadas das 5 regionais no Mapa
        assert.ok(mapJs.includes('setRegionalCenter(region)'), 'TrafficAlertMap deve implementar setRegionalCenter');
        for (const reg of ['RJ', 'SP', 'BH', 'BSB', 'REC']) {
            assert.ok(mapJs.includes(`'${reg}':`), `TrafficAlertMap deve possuir coordenadas para ${reg}`);
        }
    });

    it('7. Estilos CSS de vias monitoradas e 7 cards de KPI definidos no traffic-alert.css', () => {
        const css = fs.readFileSync(trafficCssPath, 'utf8');

        assert.ok(css.includes('.ta-corridors-table'), 'Classe .ta-corridors-table deve existir');
        assert.ok(css.includes('.ta-corridor-row'), 'Classe .ta-corridor-row deve existir');
        assert.ok(css.includes('.ta-badge-orange'), 'Classe .ta-badge-orange deve existir');
        assert.ok(css.includes('.ta-badge-block'), 'Classe .ta-badge-block deve existir');
        assert.ok(css.includes('.ta-view-switch-bar'), 'Classe .ta-view-switch-bar deve existir');
        assert.ok(css.includes('.ta-kpi-mobilidade'), 'Classe .ta-kpi-mobilidade deve existir');
        assert.ok(css.includes('.ta-kpi-retencao'), 'Classe .ta-kpi-retencao deve existir');
    });

    it('8. Registro Canônico Centralizado (regional-registry.js) e remoção de ES do seletor', () => {
        const registryPath = path.resolve(__dirname, '../../public/js/traffic-alert/regional-registry.js');
        assert.ok(fs.existsSync(registryPath), 'regional-registry.js deve existir');
        const regContent = fs.readFileSync(registryPath, 'utf8');

        // Mapeamento canônico das 5 regionais Globo
        assert.ok(regContent.includes("'RJ':"), 'Deve conter RJ');
        assert.ok(regContent.includes("'SP':"), 'Deve conter SP');
        assert.ok(regContent.includes("'MG':"), 'Deve conter MG');
        assert.ok(regContent.includes("'DF':"), 'Deve conter DF');
        assert.ok(regContent.includes("'PE':"), 'Deve conter PE');
        assert.ok(regContent.includes("internalCode: 'BH'"), 'MG deve mapear para BH');
        assert.ok(regContent.includes("internalCode: 'BSB'"), 'DF deve mapear para BSB');
        assert.ok(regContent.includes("internalCode: 'REC'"), 'PE deve mapear para REC');

        // Seletor no dashboard.html não deve conter ES sem suporte de dados
        const html = fs.readFileSync(dashboardHtmlPath, 'utf8');
        assert.strictEqual(html.includes('<option value="ES">'), false, '#seletor-regiao não deve conter opção ES sem suporte operacional');
    });

    it('9. Traçado duplo de trânsito (casing + overlay estilo Google Maps) e coordenadas polilinhas', async () => {
        const mapJs = fs.readFileSync(trafficMapPath, 'utf8');

        // Validação da técnica de traçado duplo (casing escuro de contraste + overlay colorido de fluidez)
        assert.ok(mapJs.includes("color: '#020617'"), 'Deve conter casing escuro para contraste sobre satélite');
        assert.ok(mapJs.includes("weight: 8"), 'Casing deve ter espessura 8 para contorno nítido');
        assert.ok(mapJs.includes("renderTrafficConditions(trafficData"), 'Deve implementar renderTrafficConditions');
        assert.ok(mapJs.includes("bindTooltip("), 'Linhas de trânsito devem ter hover tooltip explicativo');
        assert.ok(mapJs.includes("bindPopup("), 'Linhas de trânsito devem ter click popup interativo com ação de detalhe');

        // Confirma que /traffic-conditions na API preserva coordenadas e pino
        const res = await fetch(`${baseUrl}/traffic-conditions?region=RJ`);
        const json = await res.json();
        assert.strictEqual(json.ok, true);
        assert.strictEqual(json.corridors.length, 9);
        for (const c of json.corridors) {
            assert.ok(c.pinLocation, `Corredor ${c.via} deve ter pinLocation`);
            // Se coordinates existir, deve ser um array de pontos (não 1 ponto escalar)
            if (c.coordinates) {
                assert.ok(Array.isArray(c.coordinates) && Array.isArray(c.coordinates[0]), 'Coordinates se fornecido deve ser polyline');
            }
        }
    });

    it('10. Acessibilidade por teclado (role="button", tabindex="0", Enter/Space) nos 7 cards de KPI', () => {
        const html = fs.readFileSync(dashboardHtmlPath, 'utf8');
        const viewJs = fs.readFileSync(trafficViewPath, 'utf8');

        const kpis = [
            'ta-kpi-card-mobilidade',
            'ta-kpi-card-retencao',
            'ta-kpi-card-ativas',
            'ta-kpi-card-crit',
            'ta-kpi-card-vias',
            'ta-kpi-card-cams',
            'ta-kpi-fontes-card'
        ];

        for (const id of kpis) {
            // No HTML
            assert.ok(html.includes(`id="${id}"`), `Markup deve conter #${id}`);
            const cardRegex = new RegExp(`id="${id}"[^>]*role="button"`);
            assert.ok(cardRegex.test(html) || html.includes(`id="${id}" tabindex="0" role="button"`), `Card #${id} deve ter role="button"`);
            assert.ok(html.includes(`id="${id}" tabindex="0"`), `Card #${id} deve ter tabindex="0" para foco por teclado`);
            assert.ok(html.includes('aria-haspopup="dialog"'), 'Cards de KPI devem declarar aria-haspopup="dialog"');
        }

        // No JS
        assert.ok(viewJs.includes("e.key === 'Enter' || e.key === ' '"), 'Deve capturar teclas Enter e Espaço para acionamento por teclado');
        assert.ok(viewJs.includes("openKpiDrillDown("), 'Deve disparar abertura do drill-down no clique e tecla');
    });

    it('11. Drawer lateral com container dedicado e drill-down estruturado dos 7 KPIs', () => {
        const html = fs.readFileSync(dashboardHtmlPath, 'utf8');
        const drawerJs = fs.readFileSync(path.resolve(__dirname, '../../public/js/traffic-alert/traffic-alert-drawer.js'), 'utf8');

        // Containers no HTML
        assert.ok(html.includes('id="ta-drw-kpi-container"'), 'Drawer deve possuir #ta-drw-kpi-container');
        assert.ok(html.includes('id="ta-drw-incident-container"'), 'Drawer deve possuir #ta-drw-incident-container');

        // Métodos no Drawer
        assert.ok(drawerJs.includes('openKpiDetail(kpiType, data'), 'TrafficAlertDrawer deve implementar openKpiDetail');
        assert.ok(drawerJs.includes('_buildKpiDetailHtml(kpiType, data'), 'TrafficAlertDrawer deve implementar _buildKpiDetailHtml');
        assert.ok(drawerJs.includes('_bindKpiDetailActions(container)'), 'TrafficAlertDrawer deve implementar _bindKpiDetailActions');

        // Verificação dos 7 tipos de KPI implementados no drill-down
        for (const type of ['mobilidade', 'retencao', 'ativas', 'criticos', 'vias', 'cameras', 'fontes']) {
            assert.ok(drawerJs.includes(`kpiType === '${type}'`), `TrafficAlertDrawer deve renderizar drill-down de '${type}'`);
        }

        // Restauração de foco ao fechar
        assert.ok(drawerJs.includes('this.triggerElement.focus()'), 'Deve restaurar foco no elemento disparador ao fechar o Drawer');
        assert.ok(drawerJs.includes("this.triggerElement.setAttribute('aria-expanded', 'false')"), 'Deve resetar aria-expanded ao fechar');
    });

    it('12. Resiliência contra Race Conditions e eliminação de textos residuais', () => {
        const viewJs = fs.readFileSync(trafficViewPath, 'utf8');

        // Tokens sequenciais de requisição
        assert.ok(viewJs.includes('this.fetchToken++'), 'setRegional deve incrementar fetchToken a cada troca');
        assert.ok(viewJs.includes('token !== this.fetchToken'), 'fetchData deve descartar respostas com token defasado');

        // Limpeza imediata ao trocar regional
        assert.ok(viewJs.includes('this.rawIncidents = [];'), 'setRegional deve limpar rawIncidents imediatamente');
        assert.ok(viewJs.includes('this.trafficConditionsData = [];'), 'setRegional deve limpar trafficConditionsData imediatamente');

        // Renderização com config canônica (sem residual 'RJ' fixo)
        assert.ok(viewJs.includes('mobFoot.textContent = `${mobLabel} (${cfg.uf})`'), 'mobFoot deve usar cfg.uf');
        assert.ok(viewJs.includes('ativasFoot.textContent = totalAtivas > 0 ? `Monitoradas em ${cfg.uf}` :'), 'ativasFoot deve usar cfg.uf');
        assert.ok(viewJs.includes('camsFoot.textContent = `Rede Pública ${cfg.uf}`'), 'camsFoot deve usar cfg.uf');
        assert.ok(viewJs.includes('fontesCardFoot.textContent = `${cfg.fontes} OK`'), 'fontesCardFoot deve usar cfg.fontes dinâmico');
    });
});

