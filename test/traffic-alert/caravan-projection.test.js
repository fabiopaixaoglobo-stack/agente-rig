/**
 * Agente RIT - Módulo Acompanhamento de Caravanas (CHECKPOINT 5.2)
 * Suíte de Testes Automatizados de Domínio, Projeção e Governança (caravan-projection.test.js)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { createCaravanProjectionDTO, VALID_STATUSES } = require('../../server/traffic-alert/types/caravan-dto');
const { CaravanRouteProjectionService, pointToSegmentDistanceMeters, minDistanceToRouteMeters } = require('../../server/traffic-alert/engine/caravan-projection-service');
const { CaravanStore, caravanStore } = require('../../server/traffic-alert/store/caravan-store');
const { CARAVAN_PROJECTED_STATUS, SEVERITY_LEVELS } = require('../../server/traffic-alert/constants');

describe('🚌 ACOMPANHAMENTO DE CARAVANAS: DTO & PRIVACIDADE', () => {

    it('1. Deve criar DTO canônico com isGpsBased estritamente false e isSynthetic true', () => {
        const dto = createCaravanProjectionDTO({
            caravanId: 'caravan-test-01',
            caravanName: 'Caravana Teste Norte',
            programName: 'Programa Especial',
            originLabel: 'Ponto de Partida Teste',
            originCoords: [-22.8090, -43.3640],
            plannedDepartureAt: '2026-09-28T14:00:00.000Z',
            baseDurationMinutes: 45,
            projectedStatus: CARAVAN_PROJECTED_STATUS.PLANEJADA
        });

        assert.strictEqual(dto.caravanId, 'caravan-test-01');
        assert.strictEqual(dto.isGpsBased, false, 'isGpsBased DEVE ser estritamente false');
        assert.strictEqual(dto.isSynthetic, true, 'isSynthetic DEVE ser estritamente true');
        assert.ok(dto.disclaimer.includes('NÃO REPRESENTA A LOCALIZAÇÃO REAL DO ÔNIBUS'));
        assert.ok(Object.isFrozen(dto), 'DTO deve ser congelado/imutável');
    });

    it('2. Deve rejeitar status projetados fora da taxonomia aprovada', () => {
        assert.throws(() => {
            createCaravanProjectionDTO({
                caravanId: 'caravan-invalid',
                caravanName: 'Caravana Inválida',
                programName: 'Programa',
                projectedStatus: 'EM_VIAGEM' // Terminantemente proibido
            });
        }, /Status projetado 'EM_VIAGEM' inválido/);
    });

    it('3. Deve rejeitar campos de dados pessoais sensíveis ou identificação de motoristas/passageiros', () => {
        const dto = createCaravanProjectionDTO({
            caravanId: 'caravan-safe',
            caravanName: 'Caravana Auditório',
            programName: 'Programa Teste',
            projectedStatus: CARAVAN_PROJECTED_STATUS.PLANEJADA
        });

        assert.strictEqual(dto.motorista, undefined);
        assert.strictEqual(dto.passageiros, undefined);
        assert.strictEqual(dto.placa, undefined);
        assert.strictEqual(dto.telefone, undefined);
        assert.strictEqual(dto.cpf, undefined);
    });
});

describe('📐 MOTOR GEOESPACIAL E PROJEÇÃO DE CHEGADA', () => {
    const service = new CaravanRouteProjectionService({ corridorBufferMeters: 1000 });

    const routeCoords = [
        [-22.8000, -43.3000],
        [-22.8500, -43.3000],
        [-22.9000, -43.3000]
    ];

    it('1. Deve calcular corretamente menor distância de ocorrência até a rota', () => {
        // Ponto exatamente sobre a rota
        const onRoute = minDistanceToRouteMeters(-22.8250, -43.3000, routeCoords);
        assert.ok(onRoute.minDistance < 50, 'Distância na rota deve ser próxima de zero');

        // Ponto a 500m da rota (mesma latitude, longitude deslocada ~0.005 graus)
        const nearRoute = minDistanceToRouteMeters(-22.8250, -43.3045, routeCoords);
        assert.ok(nearRoute.minDistance > 300 && nearRoute.minDistance < 600, 'Distância deve estar ~460m');

        // Ponto distante a 10km da rota
        const farRoute = minDistanceToRouteMeters(-22.8250, -43.4000, routeCoords);
        assert.ok(farRoute.minDistance > 5000, 'Distância deve ser superior a 5km');
    });

    it('2. Deve somar impacto de ocorrência dentro do buffer e ignorar ocorrência distante', () => {
        const basePlan = {
            caravanId: 'caravan-calc-01',
            caravanName: 'Caravana Buffer Test',
            programName: 'Auditório',
            originCoords: [-22.8000, -43.3000],
            plannedDepartureAt: '2026-09-28T14:00:00.000Z',
            baseDurationMinutes: 60,
            operationalWindowEnd: '2026-09-28T15:30:00.000Z',
            routeGeometry: routeCoords
        };

        const incidents = [
            {
                canonicalId: 'INC-NEAR',
                title: 'Ocorrência no Corredor',
                lat: -22.8250,
                lng: -43.3020, // ~200m da rota
                severity: SEVERITY_LEVELS.CRITICO,
                estimatedDelayMinutes: 20
            },
            {
                canonicalId: 'INC-FAR',
                title: 'Ocorrência Longe',
                lat: -22.8250,
                lng: -43.4500, // > 10km da rota
                severity: SEVERITY_LEVELS.ALTO,
                estimatedDelayMinutes: 30
            }
        ];

        const projection = service.calculateProjection(basePlan, incidents);

        assert.strictEqual(projection.incidents.length, 1, 'Apenas a ocorrência próxima deve ser capturada');
        assert.strictEqual(projection.incidents[0].canonicalId, 'INC-NEAR');
        assert.strictEqual(projection.incidentImpactMinutes, 20, 'Impacto deve ser 20 min');
        assert.strictEqual(projection.projectedDurationMinutes, 80, 'Duração projetada: 60 base + 20 impacto');
        assert.strictEqual(projection.projectedStatus, CARAVAN_PROJECTED_STATUS.ATENCAO);
    });

    it('3. Deve marcar RISCO DE ATRASO quando chegada projetada ultrapassar a janela operacional', () => {
        const basePlan = {
            caravanId: 'caravan-delay-01',
            caravanName: 'Caravana Atraso',
            programName: 'Auditório',
            originCoords: [-22.8000, -43.3000],
            plannedDepartureAt: '2026-09-28T14:00:00.000Z',
            baseDurationMinutes: 50,
            operationalWindowEnd: '2026-09-28T15:00:00.000Z', // Janela fecha às 15:00 (+60 min da saída)
            routeGeometry: routeCoords
        };

        const severeIncident = [{
            canonicalId: 'INC-SEVERE',
            title: 'Bloqueio Total da Via',
            lat: -22.8250,
            lng: -43.3000,
            severity: SEVERITY_LEVELS.CRITICO,
            estimatedDelayMinutes: 35 // 50 base + 35 impacto = 85 min -> Chegada 15:25 (após janela 15:00)
        }];

        const projection = service.calculateProjection(basePlan, severeIncident);

        assert.strictEqual(projection.projectedStatus, CARAVAN_PROJECTED_STATUS.RISCO_DE_ATRASO);
        assert.ok(projection.marginToWindowMinutes < 0, 'Margem de janela deve ser negativa');
        assert.ok(projection.consultativeRecommendations[0].includes('Recomenda-se antecipar'));
    });

    it('4. Deve degradar graciosamente para FONTE INDISPONÍVEL sem scraping quando a fonte pública falhar', () => {
        const basePlan = {
            caravanId: 'caravan-contingency',
            caravanName: 'Caravana Contingência',
            programName: 'Auditório',
            originCoords: [-22.8000, -43.3000],
            plannedDepartureAt: '2026-09-28T14:00:00.000Z',
            baseDurationMinutes: 45,
            routeGeometry: routeCoords,
            sourceStatus: 'UNSUPPORTED'
        };

        const projection = service.calculateProjection(basePlan, [], { forceUnavailable: true });

        assert.strictEqual(projection.projectedStatus, CARAVAN_PROJECTED_STATUS.FONTE_INDISPONIVEL);
        assert.strictEqual(projection.sourceStatus, 'UNSUPPORTED');
        assert.strictEqual(projection.projectedDurationMinutes, 45, 'Mantém duração base sem trânsito em tempo real');
        assert.ok(projection.consultativeRecommendations[0].includes('degradação graciosa sem scraping'));
    });

    it('5. Deve retornar DADOS INCOMPLETOS se endereço ou horário de saída estiverem ausentes', () => {
        const planSemHorario = {
            caravanId: 'caravan-sem-horario',
            caravanName: 'Caravana Sem Horário',
            programName: 'Auditório',
            originCoords: [-22.8000, -43.3000],
            plannedDepartureAt: null
        };

        const projection = service.calculateProjection(planSemHorario, []);
        assert.strictEqual(projection.projectedStatus, CARAVAN_PROJECTED_STATUS.DADOS_INCOMPLETOS);
    });
});

describe('🏬 REPOSITÓRIO SINTÉTICO & KPIS OPERACIONAIS', () => {
    it('1. Deve inicializar as 4 caravanas sintéticas de homologação', () => {
        const store = new CaravanStore();
        const all = store.getAll();

        assert.strictEqual(all.length, 4, 'Devem existir 4 caravanas sintéticas base');
        all.forEach(c => {
            assert.strictEqual(c.isSynthetic, true, 'Todas as caravanas de homologação devem ter isSynthetic: true');
            assert.strictEqual(c.isGpsBased, false, 'Todas devem ter isGpsBased: false');
        });
    });

    it('2. Deve calcular corretamente os 6 KPIs do módulo de caravanas', () => {
        const store = new CaravanStore();
        const kpis = store.getKpis();

        assert.strictEqual(kpis.totalPlanned, 4);
        assert.ok(typeof kpis.withinWindow === 'number');
        assert.ok(typeof kpis.attention === 'number');
        assert.ok(typeof kpis.delayRisk === 'number');
        assert.ok(typeof kpis.withIncidents === 'number');
        assert.ok(kpis.lastCalculatedAt);
        assert.strictEqual(kpis.isSynthetic, true);
    });
});

describe('🔒 SEGURANÇA, ESCOPO E PRESERVAÇÃO DO MONITORAMENTO', () => {
    it('1. Nenhum arquivo do módulo de caravanas deve conter referências a GPS de hardware', () => {
        const filesToCheck = [
            path.join(__dirname, '../../server/traffic-alert/types/caravan-dto.js'),
            path.join(__dirname, '../../server/traffic-alert/engine/caravan-projection-service.js'),
            path.join(__dirname, '../../server/traffic-alert/store/caravan-store.js')
        ];

        const forbiddenRegex = /\b(getCurrentPosition|watchPosition|posicoes_motoristas|gps_historico|passageiros|motoristas)\b/i;

        filesToCheck.forEach(file => {
            const content = fs.readFileSync(file, 'utf8');
            assert.ok(!forbiddenRegex.test(content), `Violação detectada em ${path.basename(file)}`);
        });
    });

    it('2. Aba Monitoramento 🔒 deve permanecer estritamente bloqueada no dashboard.html', () => {
        const dashboardHtml = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(dashboardHtml.includes('Monitoramento 🔒'), 'Aba Monitoramento deve conter selo de bloqueio 🔒');
        assert.ok(dashboardHtml.includes('id="tab-btn-monitoramento"'));
    });
});
