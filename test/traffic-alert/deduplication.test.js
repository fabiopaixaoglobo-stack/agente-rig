/**
 * Agente RIT - Teste Automatizado de Deduplicação e Agrupamento Espaço-Temporal
 * Valida a deduplicação exata por hash e agrupamento inteligente por proximidade (v2.1).
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { MemoryStore } = require('../../server/traffic-alert/store/memory-store');
const { DeduplicationEngine } = require('../../server/traffic-alert/engine/deduplication-engine');
const { createTrafficIncidentDTO } = require('../../server/traffic-alert/types/canonical-dto');
const { CONFIDENCE_LEVELS } = require('../../server/traffic-alert/constants');

describe('🔍 MOTOR DE DEDUPLICAÇÃO E CONSOLIDAÇÃO DE FONTES (v2.1)', () => {
    let store;
    let engine;

    beforeEach(() => {
        store = new MemoryStore();
        engine = new DeduplicationEngine(store);
    });

    test('Deduplicação Exata: Rejeita fonte duplicada com o mesmo hash SHA-256', () => {
        const incidentA = createTrafficIncidentDTO({
            title: 'Queda de barreira na Linha Vermelha',
            corridor: 'LINHA_VERMELHA',
            lat: -22.8750,
            lng: -43.2350,
            sources: [
                { provider: 'COR_RIO', rawPayload: { id: 101, text: 'Barreira km 4' }, confidenceWeight: 1.8, isOfficial: true }
            ]
        });

        // 1ª ingestão: cria novo
        const res1 = engine.processIncomingIncident(incidentA);
        assert.strictEqual(res1.action, 'CREATED_NEW');
        assert.strictEqual(store.getAllIncidents().length, 1);

        // 2ª ingestão com o mesmo payload bruto (mesmo hash): ignora
        const res2 = engine.processIncomingIncident(incidentA);
        assert.strictEqual(res2.action, 'IGNORED_DUPLICATE_HASH');
        assert.strictEqual(store.getAllIncidents().length, 1);
        assert.strictEqual(res2.incident.sources.length, 1);
    });

    test('Agrupamento Espaço-Temporal: Consolida dois relatos no mesmo corredor e raio <= 1.500m', () => {
        // Relato 1: Fonte Oficial (COR-Rio)
        const incidentOficial = createTrafficIncidentDTO({
            title: 'Acidente Linha Amarela km 12',
            corridor: 'LINHA_AMARELA',
            lat: -22.9150,
            lng: -43.2650,
            severityScore: 60.0,
            sources: [
                { provider: 'COR_RIO', rawPayload: { event: 'Colisão dois carros' }, isOfficial: true, confidenceWeight: 1.8 }
            ]
        });

        const res1 = engine.processIncomingIncident(incidentOficial);
        assert.strictEqual(res1.action, 'CREATED_NEW');

        // Relato 2: Fonte Comunitária 800m adiante no mesmo corredor, 5 minutos depois
        const incidentComunitario = createTrafficIncidentDTO({
            title: 'Trânsito parado Linha Amarela próximo pedágio',
            corridor: 'LINHA_AMARELA',
            lat: -22.9200, // ~600m de distância
            lng: -43.2680,
            severityScore: 65.0,
            firstSeen: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            sources: [
                { provider: 'COMUNIDADE_WAZE', rawPayload: { note: 'Fila grande' }, isOfficial: false, confidenceWeight: 1.5 }
            ]
        });

        const res2 = engine.processIncomingIncident(incidentComunitario);
        assert.strictEqual(res2.action, 'MERGED_INTO_EXISTING');
        assert.strictEqual(store.getAllIncidents().length, 1, 'Deve manter apenas 1 incidente consolidado em memória');
        
        // Verifica consolidação das fontes
        const consolidado = store.getIncidentById(res1.incident.id);
        assert.strictEqual(consolidado.sources.length, 2, 'Incidente consolidado deve possuir as 2 fontes');
        assert.strictEqual(consolidado.confidence, CONFIDENCE_LEVELS.A_PLUS, 'Presença de fonte oficial eleva confiança para A+');
    });

    test('Não agrupa ocorrências distantes (> 1.500m)', () => {
        const incidentZonaNorte = createTrafficIncidentDTO({
            title: 'Interdição na Av. Brasil - Maré',
            corridor: 'AVENIDA_BRASIL',
            lat: -22.8480,
            lng: -43.2420,
            sources: [{ provider: 'CET_RIO', rawPayload: 'A' }]
        });

        const incidentZonaOeste = createTrafficIncidentDTO({
            title: 'Interdição na Av. Brasil - Campo Grande',
            corridor: 'AVENIDA_BRASIL',
            lat: -22.8850,
            lng: -43.5500, // ~30 km de distância
            sources: [{ provider: 'CET_RIO', rawPayload: 'B' }]
        });

        engine.processIncomingIncident(incidentZonaNorte);
        engine.processIncomingIncident(incidentZonaOeste);

        assert.strictEqual(store.getAllIncidents().length, 2, 'Ocorrências distantes devem permanecer como 2 incidentes separados');
    });
});
