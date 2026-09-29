/**
 * Agente RIT - Teste de Contratos DTO, Domínios e Critérios de Confiança A+
 * Valida a segregação de domínios, regras de confiança e hash de payloads (v2.1).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
    createTrafficIncidentDTO,
    createPublicSafetyEventDTO,
    createRouteDTO,
    createIncidentSourceDTO,
    generatePayloadHash
} = require('../../server/traffic-alert/types/canonical-dto');
const {
    INCIDENT_DOMAINS,
    CONFIDENCE_LEVELS,
    TRAFFIC_AWARENESS,
    VISUAL_CONFIRMATION_STATUS,
    STANDARD_MESSAGES
} = require('../../server/traffic-alert/constants');

describe('📋 CONTRATOS DTO, DOMÍNIOS E CONFIANÇA A+ (v2.1)', () => {

    test('Critério A+: Confirmação por fonte oficial garante nível A+', () => {
        const incident = createTrafficIncidentDTO({
            title: 'Interdição na Linha Vermelha',
            lat: -22.880,
            lng: -43.250,
            sources: [
                { provider: 'COR_RIO', isOfficial: true, confidenceWeight: 1.8 }
            ]
        });
        assert.strictEqual(incident.confidence, CONFIDENCE_LEVELS.A_PLUS);
        assert.strictEqual(incident.confidenceScore >= 90, true);
    });

    test('Critério A+: Duas fontes independentes com pelo menos uma de alta confiabilidade garantem A+', () => {
        const incident = createTrafficIncidentDTO({
            title: 'Retenção na Av. Brasil',
            lat: -22.840,
            lng: -43.320,
            sources: [
                { provider: 'FONTE_COMUNITARIA_A', isOfficial: false, confidenceWeight: 1.6 },
                { provider: 'FONTE_COMUNITARIA_B', isOfficial: false, confidenceWeight: 1.0 }
            ]
        });
        assert.strictEqual(incident.confidence, CONFIDENCE_LEVELS.A_PLUS);
    });

    test('Critério A+: Confirmação visual HUMAN_CONFIRMED acompanhada de fonte reconhecida garante A+', () => {
        const incident = createTrafficIncidentDTO({
            title: 'Veículo em chamas na Linha Amarela',
            lat: -22.910,
            lng: -43.260,
            visualConfirmationStatus: VISUAL_CONFIRMATION_STATUS.HUMAN_CONFIRMED,
            sources: [
                { provider: 'TWITTER_TRANSITO', isOfficial: false, confidenceWeight: 1.0 }
            ]
        });
        assert.strictEqual(incident.confidence, CONFIDENCE_LEVELS.A_PLUS);
    });

    test('Regra de Proteção A+: Câmera disponível (CAMERA_AVAILABLE) isolada SEM confirmação humana NÃO concede A+', () => {
        const incident = createTrafficIncidentDTO({
            title: 'Possível ocorrência',
            lat: -22.910,
            lng: -43.260,
            visualConfirmationStatus: VISUAL_CONFIRMATION_STATUS.CAMERA_AVAILABLE, // Não foi validada por operador humano
            sources: [
                { provider: 'TWITTER_TRANSITO', isOfficial: false, confidenceWeight: 1.0 }
            ]
        });
        assert.notStrictEqual(incident.confidence, CONFIDENCE_LEVELS.A_PLUS, 'CAMERA_AVAILABLE sem operador não pode ser A+');
        assert.strictEqual(incident.confidence, CONFIDENCE_LEVELS.C);
    });

    test('Segregação de Domínio: PUBLIC_SAFETY_EVENT não confirma trânsito sem fonte viária oficial', () => {
        const safetyEvent = createPublicSafetyEventDTO({
            title: 'Disparos reportados em via pública',
            lat: -22.850,
            lng: -43.300,
            hasOfficialTrafficConfirmation: false,
            sources: [
                { provider: 'FOGO_CRUZADO', isOfficial: false, confidenceWeight: 1.2 }
            ]
        });

        assert.strictEqual(safetyEvent.domain, INCIDENT_DOMAINS.PUBLIC_SAFETY_EVENT);
        assert.strictEqual(safetyEvent.trafficAwareness, TRAFFIC_AWARENESS.NOT_AVAILABLE);
        assert.strictEqual(
            safetyEvent.publicSafetyDisclaimer,
            STANDARD_MESSAGES.PUBLIC_SAFETY_NO_TRAFFIC_CONFIRMATION
        );
    });

    test('Rota OSRM pura: trafficAwareness é estritamente NOT_AVAILABLE com aviso padrão', () => {
        const route = createRouteDTO({
            routeProvider: 'OSRM',
            trafficProvider: 'NONE',
            trafficAwareness: TRAFFIC_AWARENESS.REAL_TIME, // Tentativa inválida de forçar real-time
            distanceMeters: 14500,
            durationSeconds: 1200
        });

        assert.strictEqual(route.trafficAwareness, TRAFFIC_AWARENESS.NOT_AVAILABLE);
        assert.strictEqual(route.labelNotice, STANDARD_MESSAGES.OSRM_NO_REAL_TIME);
    });

    test('Hash SHA-256 e Descarte de Payload Bruto por Padrão', () => {
        const rawObj = { eventId: 1234, details: 'Acidente leve', key: 'secret' };
        const sourceDefault = createIncidentSourceDTO({
            provider: 'CET_RIO',
            rawPayload: rawObj,
            storeRawPayload: false
        });

        assert.ok(sourceDefault.rawPayloadHash, 'Deve gerar hash SHA-256');
        assert.strictEqual(sourceDefault.rawPayloadHash.length, 64);
        assert.strictEqual(sourceDefault.rawPayload, undefined, 'Payload bruto deve ser descartado por padrão');

        const sourceWithStore = createIncidentSourceDTO({
            provider: 'CET_RIO',
            rawPayload: rawObj,
            storeRawPayload: true
        });
        assert.deepStrictEqual(sourceWithStore.rawPayload, rawObj, 'Payload bruto mantido apenas quando permitido');
    });
});
