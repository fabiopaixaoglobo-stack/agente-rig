/**
 * Testes Unitários e de Regressão: Evolução Integrada RIT Caravanas e RIT Alerta
 * Cobertura: RJ + SP, OTT/Fogo Cruzado, Câmeras Públicas, Camada de Trânsito, Recálculo Delta e Alertas
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildNormalizedIncident } = require('../../server/traffic-alert/types/normalized-incident');
const ottProvider = require('../../server/traffic-alert/providers/ott-provider');
const fogoCruzadoProvider = require('../../server/traffic-alert/providers/fogo-cruzado-provider');
const { cetSpTrafficProvider } = require('../../server/traffic-alert/providers/cet-sp-traffic-provider');
const caravanStore = require('../../server/traffic-alert/store/caravan-store');
const {
    CaravanRouteProjectionService,
    COR_RIO_CAMERAS_CATALOG,
    CET_SP_CAMERAS_CATALOG
} = require('../../server/traffic-alert/engine/caravan-projection-service');

const projectionService = new CaravanRouteProjectionService();

describe('🌟 EVOLUÇÃO INTEGRADA RIT CARAVANAS E RIT ALERTA (RJ + SP)', () => {

    describe('1. Interface Canônica de Ocorrências Normalizadas (OTT / Fogo Cruzado)', () => {
        it('deve normalizar ocorrência com todos os 14 campos obrigatórios e sanitização', () => {
            const raw = {
                id: 'ott-test-01',
                source: 'OTT',
                category: 'Tiroteio / Operação Policial',
                severity: 'CRÍTICO',
                title: 'Disparos na Av. Brasil',
                description: 'Confronto armado próximo ao Trevo das Margaridas',
                latitude: -22.8250,
                longitude: -43.3280,
                reportedAt: new Date().toISOString(),
                region: 'RJ',
                city: 'Rio de Janeiro',
                corridor: 'Avenida Brasil',
                sourceUrl: 'https://twitter.com/ondefogo'
            };

            const norm = buildNormalizedIncident(raw);

            assert.equal(norm.id, 'ott-test-01');
            assert.equal(norm.source, 'OTT');
            assert.equal(norm.category, 'Tiroteio / Operação Policial');
            assert.equal(norm.severity, 'CRÍTICO');
            assert.equal(norm.latitude, -22.8250);
            assert.equal(norm.longitude, -43.3280);
            assert.equal(norm.region, 'RJ');
            assert.equal(norm.freshnessStatus, 'ATUAL');
        });

        it('deve calcular status de frescura baseado no tempo decorrido do reporte', () => {
            const now = Date.now();
            const atualIso = new Date(now - 20 * 60 * 1000).toISOString(); // 20 min atrás
            const recenteIso = new Date(now - 90 * 60 * 1000).toISOString(); // 1h30 atrás
            const desatIso = new Date(now - 300 * 60 * 1000).toISOString(); // 5h atrás

            const incAtual = buildNormalizedIncident({ id: '1', latitude: -22.8, longitude: -43.3, reportedAt: atualIso });
            const incRecente = buildNormalizedIncident({ id: '2', latitude: -22.8, longitude: -43.3, reportedAt: recenteIso });
            const incDesat = buildNormalizedIncident({ id: '3', latitude: -22.8, longitude: -43.3, reportedAt: desatIso });

            assert.equal(incAtual.freshnessStatus, 'ATUAL');
            assert.equal(incRecente.freshnessStatus, 'RECENTE');
            assert.equal(incDesat.freshnessStatus, 'POTENCIALMENTE DESATUALIZADA');
        });

        it('deve descartar ocorrências com coordenadas geográficas inválidas ou fora do range', () => {
            const invalid1 = buildNormalizedIncident({ id: 'err1', latitude: 'abc', longitude: -43.3 });
            const invalid2 = buildNormalizedIncident({ id: 'err2', latitude: 120.0, longitude: -43.3 });
            const invalid3 = buildNormalizedIncident({ id: 'err3', latitude: null, longitude: null });

            assert.equal(invalid1, null);
            assert.equal(invalid2, null);
            assert.equal(invalid3, null);
        });

        it('provedor OTT e Fogo Cruzado devem retornar lista de ocorrências com filtro regional RJ/SP', async () => {
            const ottRj = await ottProvider.fetchNormalizedIncidents('RJ');
            const ottSp = await ottProvider.fetchNormalizedIncidents('SP');
            const fcRj = await fogoCruzadoProvider.fetchNormalizedIncidents('RJ');
            const fcSp = await fogoCruzadoProvider.fetchNormalizedIncidents('SP');

            assert.ok(Array.isArray(ottRj));
            assert.ok(Array.isArray(ottSp));
            assert.ok(Array.isArray(fcRj));
            assert.ok(Array.isArray(fcSp));

            ottRj.forEach(item => assert.equal(item.region, 'RJ'));
            ottSp.forEach(item => assert.equal(item.region, 'SP'));
            fcRj.forEach(item => assert.equal(item.region, 'RJ'));
            fcSp.forEach(item => assert.equal(item.region, 'SP'));
        });
    });

    describe('2. Módulo RIT Caravanas São Paulo & Alternância Regional', () => {
        it('deve conter destino oficial SP no Edifício Jornalista Roberto Marinho (Brooklin)', () => {
            assert.equal(caravanStore.DESTINATION_SP_LABEL, 'Edifício Jornalista Roberto Marinho - São Paulo (SP)');
            assert.deepEqual(caravanStore.DESTINATION_SP_COORDS, [-23.6186, -46.6974]);
        });

        it('deve isolar as caravanas por região (RJ vs SP) sem mistura de dados', () => {
            const allRj = caravanStore.getAll([], 'RJ');
            const allSp = caravanStore.getAll([], 'SP');

            assert.ok(allRj.length > 0, 'Deve conter caravanas cadastradas no RJ');
            assert.ok(allSp.length > 0, 'Deve conter caravanas cadastradas em SP');

            allRj.forEach(c => assert.equal(c.region, 'RJ'));
            allSp.forEach(c => assert.equal(c.region, 'SP'));

            // Programas específicos de SP
            const spPrograms = allSp.map(c => c.programName);
            assert.ok(spPrograms.includes('Encontro com Patrícia Poeta') || spPrograms.includes('Altas Horas') || spPrograms.includes('Caldeirão com Mion'));
        });

        it('KPIs devem ser calculados isoladamente por região', () => {
            const kpisRj = caravanStore.getKpis([], 'RJ');
            const kpisSp = caravanStore.getKpis([], 'SP');

            assert.equal(kpisRj.totalPlanned, caravanStore.getAll([], 'RJ').length);
            assert.equal(kpisSp.totalPlanned, caravanStore.getAll([], 'SP').length);
        });
    });

    describe('3. Camada de Trânsito & Fluidez Viária (CET-SP & COR-Rio)', () => {
        it('CET-SP Traffic Provider deve retornar fluidez nos principais corredores paulistas', async () => {
            const conditions = await cetSpTrafficProvider.fetchCorridorConditions();

            assert.ok(Array.isArray(conditions));
            assert.ok(conditions.length >= 6);

            const vias = conditions.map(c => c.via);
            assert.ok(vias.includes('Marginal Pinheiros'));
            assert.ok(vias.includes('Marginal Tietê'));
            assert.ok(vias.includes('Avenida 23 de Maio'));

            conditions.forEach(c => {
                assert.ok(['Livre', 'Moderado', 'Lento', 'Intenso', 'Parado', 'Normal', 'Crítico', 'Sem dados'].includes(c.status));
                assert.ok(c.tempoAtual > 0);
            });
        });
    });

    describe('4. Recálculo de Projeção com Delta Auditável e Impacto de Trânsito', () => {
        it('deve calcular delta comparativo ao recalcular projeção de uma caravana', async () => {
            const spCaravans = caravanStore.getAll([], 'SP');
            const targetId = spCaravans[0].caravanId;

            const recalculated = await caravanStore.recalculate(targetId);

            assert.ok(recalculated);
            assert.ok(recalculated.recalculationDelta, 'Deve conter objeto recalculationDelta');
            assert.equal(typeof recalculated.recalculationDelta.durationDiffMinutes, 'number');
            assert.ok(recalculated.recalculationDelta.recalculatedAt);
            assert.ok(recalculated.recalculationDelta.previousArrival);
            assert.equal(typeof recalculated.recalculationDelta.statusChanged, 'boolean');
        });

        it('projeção deve incorporar impacto do trânsito nos tempos e rotas alternativas de SP', async () => {
            const spCaravans = caravanStore.getAll([], 'SP');
            const crv = spCaravans[0];

            const proj = await projectionService.calculateProjection(crv);

            assert.ok(proj.trafficImpact);
            assert.equal(typeof proj.trafficImpact.totalDelayMinutes, 'number');
            assert.equal(typeof proj.trafficImpact.congestedSegmentsCount, 'number');
            assert.ok(proj.projectedDurationMinutes >= proj.baseDurationMinutes);
        });
    });

    describe('5. Catálogo de Câmeras Públicas com Suporte Regional', () => {
        it('deve catalogar câmeras públicas para RJ e SP com fonte oficial identificada', () => {
            assert.ok(COR_RIO_CAMERAS_CATALOG.length > 0);
            assert.ok(CET_SP_CAMERAS_CATALOG.length > 0);

            CET_SP_CAMERAS_CATALOG.forEach(cam => {
                assert.ok(cam.provider.includes('CET_SP'));
                assert.ok(cam.latitude && cam.longitude);
            });
        });
    });
});
