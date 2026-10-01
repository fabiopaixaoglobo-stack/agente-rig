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
});
