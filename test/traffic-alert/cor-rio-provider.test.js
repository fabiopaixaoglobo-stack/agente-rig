/**
 * Agente RIT - Teste de Integração do Provedor Público COR-Rio
 * Valida a normalização de estágios da cidade, identificação de corredores e telemetria (v2.1).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { CorRioProvider } = require('../../server/traffic-alert/providers/cor-rio-provider');
const { normalizeCorRioStage, detectCorridor, normalizeTrafficEvent } = require('../../server/traffic-alert/engine/normalizer');
const { SEVERITY_LEVELS, CONFIDENCE_LEVELS, TRAFFIC_AWARENESS } = require('../../server/traffic-alert/constants');

describe('🏙️ PROVEDOR PÚBLICO COR-RIO E ESTÁGIO OPERACIONAL (v2.1)', () => {

    test('Identificação determinística de corredores viários estratégicos', () => {
        assert.strictEqual(detectCorridor('Colisão de veículos na Ponte Rio-Niterói sentido Rio'), 'PONTE_RIO_NITEROI');
        assert.strictEqual(detectCorridor('Retenção na Linha Vermelha altura da Ilha'), 'LINHA_VERMELHA');
        assert.strictEqual(detectCorridor('Obra na Linha Amarela próximo a saída 4'), 'LINHA_AMARELA');
        assert.strictEqual(detectCorridor('Bolsão d água na Av. Brasil pista lateral'), 'AVENIDA_BRASIL');
        assert.strictEqual(detectCorridor('Engavetamento no Túnel Rebouças'), 'TUNEL_REBOUCAS');
        assert.strictEqual(detectCorridor('Semáforo apagado na Rua Voluntários da Pátria'), 'MALHA_URBANA');
    });

    test('Normalização de Estágio do COR-Rio para DTO Canônico', () => {
        // Estágio 1 (Normalidade)
        const dtoEstagio1 = normalizeCorRioStage({ estagioNum: 1, estagioNome: 'Estágio 1' });
        assert.strictEqual(dtoEstagio1.severity, SEVERITY_LEVELS.BAIXO);
        assert.strictEqual(dtoEstagio1.confidence, CONFIDENCE_LEVELS.A_PLUS, 'Fonte oficial recebe A+');
        assert.strictEqual(dtoEstagio1.trafficAwareness, TRAFFIC_AWARENESS.REAL_TIME);

        // Estágio 2 (Atenção)
        const dtoEstagio2 = normalizeCorRioStage({ estagioNum: 2, estagioNome: 'Estágio 2' });
        assert.strictEqual(dtoEstagio2.severity, SEVERITY_LEVELS.MEDIO);

        // Estágio 3 (Alerta)
        const dtoEstagio3 = normalizeCorRioStage({ estagioNum: 3, estagioNome: 'Estágio 3' });
        assert.strictEqual(dtoEstagio3.severity, SEVERITY_LEVELS.ALTO);

        // Estágio 4 (Alerta Máximo / Crise)
        const dtoEstagio4 = normalizeCorRioStage({ estagioNum: 4, estagioNome: 'Estágio 4' });
        assert.strictEqual(dtoEstagio4.severity, SEVERITY_LEVELS.CRITICO);
    });

    test('Normalização de ocorrência viária com interdição total em corredor estratégico', () => {
        const evento = normalizeTrafficEvent({
            rawId: 'CET-2026-0045',
            title: 'Tombamento de caminhão',
            description: 'Pista bloqueada na Linha Vermelha',
            locationText: 'Linha Vermelha km 7',
            lat: -22.875,
            lng: -43.235,
            obstructionType: 'TOTAL',
            isOfficial: true
        });

        assert.strictEqual(evento.corridor, 'LINHA_VERMELHA');
        assert.strictEqual(evento.severity, SEVERITY_LEVELS.CRITICO, 'Interdição total em via expressa deve ser CRITICO');
        assert.strictEqual(evento.confidence, CONFIDENCE_LEVELS.A_PLUS);
    });

    test('CorRioProvider: Inicialização, User-Agent e headers em conformidade', () => {
        const provider = new CorRioProvider();
        assert.strictEqual(provider.name, 'COR_RIO');
        assert.strictEqual(provider.userAgent, 'AgenteRIT/1.0 (transporte@globo.com)');
        assert.strictEqual(provider.isEnabled, true);
    });
});
