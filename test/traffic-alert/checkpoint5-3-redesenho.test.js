/**
 * Agente RIT - CHECKPOINT 5.3: Redesenho Operacional RIT ALERTA & RIT CARAVANAS
 * Suíte de Testes Automatizados de Redesenho, CRUD de Caravanas e Câmeras (CT-31 a CT-50)
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { CaravanStore } = require('../../server/traffic-alert/store/caravan-store');
const { CaravanRouteProjectionService, COR_RIO_CAMERAS_CATALOG } = require('../../server/traffic-alert/engine/caravan-projection-service');
const { CARAVAN_PROJECTED_STATUS, SEVERITY_LEVELS } = require('../../server/traffic-alert/constants');

describe('🚌 CHECKPOINT 5.3: CT-31 A CT-40 - CRUD, ROTAS E CÂMERAS PÚBLICAS', () => {
    let store;
    let projService;

    before(() => {
        store = new CaravanStore();
        projService = new CaravanRouteProjectionService({ corridorBufferMeters: 1200 });
    });

    it('CT-31: Deve incluir nova caravana com endereço, empresa e horário calculando geometria', () => {
        const publicIncidents = [];
        const newCaravan = store.addCaravan({
            caravanName: 'Caravana Petrópolis Imperial',
            programName: 'Caldeirão com Mion',
            companyName: 'Viação Única Fácil',
            originAddress: 'Petrópolis - Centro',
            originCoords: [-22.5050, -43.1789],
            plannedDepartureAt: '2026-09-28T11:00:00-03:00',
            operationalWindowEnd: '2026-09-28T14:30:00-03:00',
            operationalNotes: 'Ônibus Executivo'
        }, publicIncidents);

        assert.ok(newCaravan.caravanId.startsWith('crv-'));
        assert.strictEqual(newCaravan.companyName, 'Viação Única Fácil');
        assert.strictEqual(newCaravan.isGpsBased, false);
        assert.strictEqual(newCaravan.isSynthetic, true);
        assert.ok(Array.isArray(newCaravan.routeGeometry));
        assert.ok(newCaravan.routeGeometry.length >= 3);
        assert.strictEqual(store.getAll().length, 5);
    });

    it('CT-32: Deve atualizar caravana existente e recalcular impacto imediatamente', () => {
        // Ponto a ~200m da rota da Caravana 1 (Irajá / Av. Brasil: [-22.8450, -43.3000])
        const publicIncidents = [{
            canonicalId: 'INC-AV-BRASIL-01',
            title: 'Tombamento de caminhão na Av. Brasil',
            lat: -22.8450,
            lng: -43.3020,
            severity: SEVERITY_LEVELS.CRITICO,
            estimatedDelayMinutes: 30
        }];

        const baseCaravan = store.getById('caravan-01');
        const depTime = new Date(baseCaravan.plannedDepartureAt);
        // Com baseDurationMinutes = 48 e delay = 30min (total = 78min),
        // uma janela de 60min após a saída força o status RISCO_DE_ATRASO
        const tightWindowEnd = new Date(depTime.getTime() + 60 * 60 * 1000).toISOString();

        const updated = store.updateCaravan('caravan-01', {
            plannedDepartureAt: depTime.toISOString(),
            operationalWindowEnd: tightWindowEnd,
            operationalNotes: 'Janela ajustada para gravação adiantada'
        }, publicIncidents);

        assert.strictEqual(updated.caravanId, 'caravan-01');
        assert.strictEqual(updated.operationalNotes, 'Janela ajustada para gravação adiantada');
        assert.ok(updated.incidents.length >= 1, 'Deve capturar incidente no corredor');
        assert.strictEqual(updated.projectedStatus, CARAVAN_PROJECTED_STATUS.RISCO_DE_ATRASO);
    });

    it('CT-33: Deve excluir caravana e manter integridade da contagem de KPIs', () => {
        const initialCount = store.getAll().length;
        const all = store.getAll();
        const createdCaravan = all.find(c => c.caravanId.startsWith('crv-'));
        assert.ok(createdCaravan, 'Deve existir uma caravana criada dinamicamente');

        const deleted = store.deleteCaravan(createdCaravan.caravanId);
        assert.strictEqual(deleted, true);
        assert.strictEqual(store.getAll().length, initialCount - 1);
        assert.strictEqual(store.getById(createdCaravan.caravanId), null);
    });

    it('CT-34: Deve rejeitar exclusão ou atualização de ID inexistente', () => {
        const deleted = store.deleteCaravan('id-inexistente-999');
        assert.strictEqual(deleted, false);

        const updated = store.updateCaravan('id-inexistente-999', { caravanName: 'Teste' });
        assert.strictEqual(updated, null);
    });

    it('CT-35: Deve identificar câmeras públicas do COR-Rio no catálogo oficial', () => {
        assert.ok(Array.isArray(COR_RIO_CAMERAS_CATALOG));
        assert.ok(COR_RIO_CAMERAS_CATALOG.length >= 8);
        const camTransolimpica = COR_RIO_CAMERAS_CATALOG.find(c => c.corridor === 'Transolímpica');
        assert.ok(camTransolimpica);
        assert.strictEqual(camTransolimpica.isPublic, true);
    });

    it('CT-36: Deve associar câmeras do COR-Rio num raio de até 2.500m do traçado da rota', () => {
        const sampleRoute = [
            [-22.8600, -43.4000],
            [-22.9000, -43.4000],
            [-22.9550, -43.4100]
        ];

        const nearbyCameras = projService.getNearbyCameras(sampleRoute, 2500);
        assert.ok(Array.isArray(nearbyCameras));
        assert.ok(nearbyCameras.length >= 1, 'Deve encontrar câmeras no corredor');
        nearbyCameras.forEach(cam => {
            assert.ok(cam.distanceMeters <= 2500, 'Distância da câmera não pode ultrapassar o raio máximo');
            assert.ok(cam.streamStatus === 'OPERACIONAL' || cam.streamStatus === 'SINAL_DISPONIVEL');
        });
    });

    it('CT-37: Deve calcular rota alternativa consultiva quando houver ocorrência severa na rota principal', () => {
        const basePlan = {
            caravanId: 'caravan-critica',
            caravanName: 'Caravana com Bloqueio',
            programName: 'Caldeirão',
            originCoords: [-22.8090, -43.3640],
            plannedDepartureAt: '2026-09-28T14:00:00.000Z',
            baseDurationMinutes: 50,
            operationalWindowEnd: '2026-09-28T15:00:00.000Z',
            routeGeometry: [
                [-22.8090, -43.3640],
                [-22.8600, -43.3800],
                [-22.9550, -43.4100]
            ]
        };

        const severeIncident = [{
            canonicalId: 'INC-CRIT-01',
            title: 'Interdição Total na Via Principal',
            lat: -22.8600,
            lng: -43.3800,
            severity: SEVERITY_LEVELS.CRITICO,
            estimatedDelayMinutes: 40
        }];

        const projection = projService.calculateProjection(basePlan, severeIncident);
        assert.ok(projection.alternativeRoute, 'Deve gerar objeto de rota alternativa consultiva');
        assert.strictEqual(projection.alternativeRoute.isConsultativeOnly, true);
        assert.ok(projection.alternativeRoute.geometry.length >= 2);
        assert.ok(projection.alternativeRoute.summary.length > 0);
    });

    it('CT-38: Não deve gerar rota alternativa quando não houver ocorrências críticas', () => {
        const basePlan = {
            caravanId: 'caravan-normal',
            caravanName: 'Caravana Fluida',
            programName: 'Caldeirão',
            originCoords: [-22.8090, -43.3640],
            plannedDepartureAt: '2026-09-28T14:00:00.000Z',
            baseDurationMinutes: 40,
            operationalWindowEnd: '2026-09-28T16:00:00.000Z',
            routeGeometry: [
                [-22.8090, -43.3640],
                [-22.9550, -43.4100]
            ]
        };

        const projection = projService.calculateProjection(basePlan, []);
        assert.strictEqual(projection.alternativeRoute, null);
    });

    it('CT-39: Deve construir objeto de comparativo de tráfego com tempo base, tempo dinâmico e link Waze', () => {
        const basePlan = {
            caravanId: 'caravan-comp',
            caravanName: 'Caravana Comparativo',
            programName: 'Auditório',
            originCoords: [-22.8900, -43.1200],
            plannedDepartureAt: '2026-09-28T14:00:00.000Z',
            baseDurationMinutes: 60,
            operationalWindowEnd: '2026-09-28T16:00:00.000Z',
            routeGeometry: [
                [-22.8900, -43.1200],
                [-22.9550, -43.4100]
            ]
        };

        const projection = projService.calculateProjection(basePlan, []);
        assert.ok(projection.trafficComparison);
        assert.strictEqual(projection.trafficComparison.baseDurationMinutes, 60);
        assert.ok(projection.trafficComparison.wazeConsultativeUrl.includes('https://www.waze.com/ul'));
        assert.ok(projection.trafficComparison.googleQuotaNotice.includes('API Google Routes') || projection.trafficComparison.googleQuotaNotice.includes('requer quota corporativa'));
    });

    it('CT-40: Deve recalcular todas as rotas com incidentes e manter consistência dos dados', () => {
        const incidents = [{
            canonicalId: 'INC-MASS-01',
            title: 'Ocorrência no Corredor',
            lat: -22.8600,
            lng: -43.3800,
            severity: SEVERITY_LEVELS.ALTO,
            estimatedDelayMinutes: 25
        }];

        const recalculated = store.recalculateAll(incidents);
        assert.ok(Array.isArray(recalculated));
        assert.strictEqual(recalculated.length, 4);
        recalculated.forEach(c => {
            assert.ok(c.lastCalculatedAt);
            assert.strictEqual(c.isGpsBased, false);
            assert.strictEqual(c.isSynthetic, true);
        });
    });
});

describe('🎨 CHECKPOINT 5.3: CT-41 A CT-50 - INTERFACE, MAPAS, RESPONSIVIDADE E GOVERNANÇA', () => {
    it('CT-41: ambiente-visual-confirmacao.html deve conter cabeçalho compacto com seletor RIT ALERTA / RIT CARAVANAS', () => {
        const html = fs.readFileSync(path.join(__dirname, '../../public/ambiente-visual-confirmacao.html'), 'utf8');
        assert.ok(html.includes('id="btn-mode-alerta"'), 'Deve conter botão do seletor RIT ALERTA');
        assert.ok(html.includes('id="btn-mode-caravanas"'), 'Deve conter botão do seletor RIT CARAVANAS');
        assert.ok(html.includes('id="countdown-timer"'), 'Deve conter widget de contagem regressiva de 10 minutos');
    });

    it('CT-42: ambiente-visual-confirmacao.html deve conter modal de inclusão de caravanas (+ INCLUIR CARAVANA)', () => {
        const html = fs.readFileSync(path.join(__dirname, '../../public/ambiente-visual-confirmacao.html'), 'utf8');
        assert.ok(html.includes('id="modal-caravan-form"'), 'Deve conter o modal de adicionar caravana');
        assert.ok(html.includes('id="form-caravan"'), 'Deve conter o formulário de inclusão');
        assert.ok(html.includes('id="form-empresa"'), 'Deve conter o campo Empresa / Operador');
        assert.ok(html.includes('id="form-endereco"'), 'Deve conter o campo Endereço de Origem');
    });

    it('CT-43: ambiente-visual-confirmacao.html deve prover camadas Leaflet com Satélite e OSM sem CartoDB com erro de chave', () => {
        const html = fs.readFileSync(path.join(__dirname, '../../public/ambiente-visual-confirmacao.html'), 'utf8');
        assert.ok(!html.includes('basemaps.cartocdn.com/dark_all'), 'Não deve usar basemap CartoDB sem chave');
        assert.ok(html.includes('server.arcgisonline.com/ArcGIS/rest/services/World_Imagery'), 'Deve configurar Esri World Imagery');
        assert.ok(html.includes('tile.openstreetmap.org'), 'Deve configurar OpenStreetMap Standard');
    });

    it('CT-44: ambiente-visual-confirmacao.html deve conter botão discreto Validação & Governança abrindo gaveta CT-01 a CT-50', () => {
        const html = fs.readFileSync(path.join(__dirname, '../../public/ambiente-visual-confirmacao.html'), 'utf8');
        assert.ok(html.includes('toggleGovernanceDrawer()'), 'Deve conter gatilho para gaveta de governança');
        assert.ok(html.includes('id="modal-governance"'), 'Deve conter o container de governança');
        assert.ok(html.includes('Casos de Teste CCO (50)'), 'Deve conter aba dos 50 Casos de Teste');
        assert.ok(html.includes('Diretrizes de Privacidade (LGPD)'), 'Deve conter aba da LGPD');
    });

    it('CT-45: ambiente-visual-confirmacao.html deve possuir layout responsivo sem overflow horizontal', () => {
        const html = fs.readFileSync(path.join(__dirname, '../../public/ambiente-visual-confirmacao.html'), 'utf8');
        assert.ok(html.includes('overflow-x: hidden'), 'CSS deve ter overflow-x: hidden');
        assert.ok(html.includes('h-screen w-screen flex flex-col'), 'Body deve preencher tela exatamente 100vh');
    });

    it('CT-46: ambiente_visual_homologacao.html deve estar sincronizado com ambiente-visual-confirmacao.html', () => {
        const confirmacao = fs.readFileSync(path.join(__dirname, '../../public/ambiente-visual-confirmacao.html'), 'utf8');
        const homologacao = fs.readFileSync(path.join(__dirname, '../../public/ambiente_visual_homologacao.html'), 'utf8');
        assert.strictEqual(confirmacao, homologacao, 'Ambos os arquivos HTML devem ser idênticos');
    });

    it('CT-47: Varredura de segurança deve confirmar ausência total de scraping de Waze Live Map em todo o código', () => {
        const projectFiles = [
            path.join(__dirname, '../../server/traffic-alert/engine/caravan-projection-service.js'),
            path.join(__dirname, '../../server/traffic-alert/store/caravan-store.js'),
            path.join(__dirname, '../../server/traffic-alert/providers/cor-rio-provider.js')
        ];

        const forbiddenScrapingRegex = /\b(waze-live-map|cheerio|puppeteer-extra|playwright-extra|anti-captcha)\b/i;
        projectFiles.forEach(file => {
            const content = fs.readFileSync(file, 'utf8');
            assert.ok(!forbiddenScrapingRegex.test(content), `Tentativa de scraping ilegal detectada em ${path.basename(file)}`);
        });
    });

    it('CT-48: DTO de Caravanas deve conter disclaimer legal obrigatório em todas as instâncias', () => {
        const store = new CaravanStore();
        store.getAll().forEach(caravan => {
            assert.ok(caravan.disclaimer);
            assert.ok(caravan.disclaimer.includes('PROJEÇÃO OPERACIONAL BASEADA NO ENDEREÇO E HORÁRIO PLANEJADOS'));
            assert.ok(caravan.disclaimer.includes('NÃO REPRESENTA A LOCALIZAÇÃO REAL DO ÔNIBUS'));
        });
    });

    it('CT-49: Taxonomia de severidade e cores das caravanas devem ser distintas e operacionais', () => {
        const store = new CaravanStore();
        const colors = store.getAll().map(c => c.routeColor);
        const uniqueColors = new Set(colors);
        assert.strictEqual(uniqueColors.size, colors.length, 'Cada caravana deve ter cor de rota visualmente distinta no mapa');
    });

    it('CT-50: Aba Monitoramento 🔒 deve permanecer inacessível com guarda corporativa', () => {
        const dashboardHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(dashboardHtml.includes('Monitoramento 🔒'));
        assert.ok(dashboardHtml.includes('disabled') || dashboardHtml.includes('cursor-not-allowed'));
    });
});
