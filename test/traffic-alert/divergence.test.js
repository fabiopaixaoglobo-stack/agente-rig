/**
 * Agente RIT - Teste de Detecção de Divergência entre Fontes
 * Valida o Cenário L e a regra de não adoção cega do pior caso (v2.1).
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { MemoryStore } = require('../../server/traffic-alert/store/memory-store');
const { DeduplicationEngine } = require('../../server/traffic-alert/engine/deduplication-engine');
const { createTrafficIncidentDTO } = require('../../server/traffic-alert/types/canonical-dto');
const { INCIDENT_STATUS, STANDARD_MESSAGES, SEVERITY_LEVELS } = require('../../server/traffic-alert/constants');

describe('⚖️ TRATAMENTO DE DIVERGÊNCIA ENTRE FONTES (v2.1)', () => {
    let store;
    let engine;

    beforeEach(() => {
        store = new MemoryStore();
        engine = new DeduplicationEngine(store);
    });

    test('Cenário L: Oficial reporta liberação (RESOLVED), mas fonte comunitária ainda reporta ativo (ACTIVE)', () => {
        // 1. Incidente criado inicialmente por relato comunitário como ATIVO
        const relatorioComunitario = createTrafficIncidentDTO({
            title: 'Bloqueio total na Linha Vermelha',
            corridor: 'LINHA_VERMELHA',
            lat: -22.8750,
            lng: -43.2350,
            severity: SEVERITY_LEVELS.ALTO,
            severityScore: 80.0,
            status: INCIDENT_STATUS.ACTIVE,
            sources: [
                { provider: 'WAZE_ALERTA', rawPayload: { text: 'Pista fechada' }, isOfficial: false, confidenceWeight: 1.0 }
            ]
        });

        engine.processIncomingIncident(relatorioComunitario);

        // 2. Fonte Oficial (COR-Rio) reporta que a via foi totalmente liberada (RESOLVED)
        const relatorioOficial = createTrafficIncidentDTO({
            title: 'Linha Vermelha liberada',
            corridor: 'LINHA_VERMELHA',
            lat: -22.8760, // Local próximo
            lng: -43.2360,
            severity: SEVERITY_LEVELS.BAIXO,
            severityScore: 20.0,
            status: INCIDENT_STATUS.RESOLVED,
            sources: [
                { provider: 'COR_RIO', rawPayload: { text: 'Acidente retirado, tráfego normal' }, isOfficial: true, confidenceWeight: 1.8 }
            ]
        });

        const mergeResult = engine.processIncomingIncident(relatorioOficial);

        assert.strictEqual(mergeResult.action, 'MERGED_INTO_EXISTING');
        assert.strictEqual(mergeResult.divergenceDetected, true, 'Divergência de status deve ser detectada');

        const incident = store.getIncidentById(relatorioComunitario.id);
        assert.strictEqual(incident.divergenceFlag, true);
        assert.ok(incident.divergenceDetails, 'Deve conter detalhes estruturados da divergência');
        assert.strictEqual(
            incident.divergenceDetails.message,
            STANDARD_MESSAGES.DIVERGENCE_WARNING
        );

        // Prevalência Oficial: O status da fonte oficial prevalece como referência principal
        assert.strictEqual(incident.status, INCIDENT_STATUS.RESOLVED);
        
        // Porém, a informação comunitária é preservada no histórico de fontes (não é apagada sumariamente)
        assert.strictEqual(incident.sources.length, 2);
        assert.strictEqual(incident.sources[0].provider, 'WAZE_ALERTA');
        assert.strictEqual(incident.sources[1].provider, 'COR_RIO');
    });

    test('Divergência de Severidade Significativa: Ativa divergenceFlag sem adotar o pior caso às cegas', () => {
        const relatoA = createTrafficIncidentDTO({
            title: 'Retenção na Ponte Rio-Niterói',
            corridor: 'PONTE_RIO_NITEROI',
            lat: -22.8800,
            lng: -43.1500,
            severity: SEVERITY_LEVELS.BAIXO,
            severityScore: 25.0,
            sources: [
                { provider: 'CONCESSIONARIA_ECOPONTE', isOfficial: true, rawPayload: { tempo: 18 } }
            ]
        });

        const relatoB = createTrafficIncidentDTO({
            title: 'Caos e paralisação na Ponte',
            corridor: 'PONTE_RIO_NITEROI',
            lat: -22.8810,
            lng: -43.1510,
            severity: SEVERITY_LEVELS.CRITICO,
            severityScore: 90.0,
            sources: [
                { provider: 'REDES_SOCIAIS', isOfficial: false, rawPayload: { tweet: 'Tudo parado!' } }
            ]
        });

        engine.processIncomingIncident(relatoA);
        const res = engine.processIncomingIncident(relatoB);

        assert.strictEqual(res.divergenceDetected, true);
        const consolidado = store.getIncidentById(relatoA.id);
        assert.strictEqual(consolidado.divergenceFlag, true);
        assert.strictEqual(
            consolidado.divergenceDetails.message,
            STANDARD_MESSAGES.DIVERGENCE_WARNING
        );
    });
});
