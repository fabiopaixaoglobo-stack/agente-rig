/**
 * Agente RIT - Teste de Segurança de Fixtures e Segregação de Dados
 * Valida a proibição de fixtures em produção e mensagem de indisponibilidade (v2.1).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadConfig } = require('../../server/traffic-alert/config');
const { createTrafficIncidentDTO } = require('../../server/traffic-alert/types/canonical-dto');
const { STANDARD_MESSAGES } = require('../../server/traffic-alert/constants');

describe('🛡️ SEGURANÇA DE FIXTURES E MODO DEMO (v2.1)', () => {

    test('Em produção (NODE_ENV=production), fixtures são terminantemente bloqueadas mesmo se forçadas por env', () => {
        const envProd = {
            NODE_ENV: 'production',
            RIT_ALERT_ALLOW_FIXTURES: 'true',
            RIT_ALERT_DEMO_MODE: 'true'
        };
        const cfg = loadConfig(envProd);
        assert.strictEqual(cfg.governance.allowFixtures, false, 'allowFixtures deve ser false em produção');
        assert.strictEqual(cfg.governance.demoMode, false, 'demoMode deve ser false em produção');
    });

    test('Em desenvolvimento, fixtures são permitidas somente com autorização explícita', () => {
        const envDevDefault = {
            NODE_ENV: 'development',
            RIT_ALERT_ALLOW_FIXTURES: 'false'
        };
        const cfgDefault = loadConfig(envDevDefault);
        assert.strictEqual(cfgDefault.governance.allowFixtures, false);

        const envDevEnabled = {
            NODE_ENV: 'development',
            RIT_ALERT_ALLOW_FIXTURES: 'true',
            RIT_ALERT_DEMO_MODE: 'true'
        };
        const cfgEnabled = loadConfig(envDevEnabled);
        assert.strictEqual(cfgEnabled.governance.allowFixtures, true);
        assert.strictEqual(cfgEnabled.governance.demoMode, true);
    });

    test('Segregação de dados: Todo incidente gerado possui campo isSynthetic obrigatório', () => {
        const realIncident = createTrafficIncidentDTO({
            title: 'Queda de árvore na Av. das Américas',
            lat: -22.999,
            lng: -43.365,
            isSynthetic: false
        });
        assert.strictEqual(realIncident.isSynthetic, false, 'Incidente real deve ter isSynthetic = false');

        const demoIncident = createTrafficIncidentDTO({
            title: 'Simulação de Obra',
            lat: -22.900,
            lng: -43.180,
            isSynthetic: true
        });
        assert.strictEqual(demoIncident.isSynthetic, true, 'Incidente demo deve ter isSynthetic = true');
    });

    test('Formatação da mensagem de indisponibilidade oficial quando fontes reais falharem', () => {
        const timestamp = '25/09/2026 15:30:00';
        const msg = STANDARD_MESSAGES.SERVICE_UNAVAILABLE_TEMPLATE(timestamp);
        assert.strictEqual(
            msg, 
            'Dados de trânsito temporariamente indisponíveis. Última atualização válida: 25/09/2026 15:30:00.'
        );
    });
});
