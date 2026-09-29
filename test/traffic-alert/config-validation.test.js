/**
 * Agente RIT - Teste de Validação de Configuração e Sanitização de URLs
 * Valida a integridade contra injeção de HTML, allowlist de hosts e rate limits (v2.1).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { validateAndSanitizeUrl, loadConfig } = require('../../server/traffic-alert/config');
const { OSRM_USAGE_MODES } = require('../../server/traffic-alert/constants');

describe('⚙️ VALIDAÇÃO DE CONFIGURAÇÃO E SANITIZAÇÃO DE URLS (v2.1)', () => {

    test('Deve rejeitar tags HTML embutidas no valor da URL', () => {
        const dirtyUrl = '<a href="https://router.project-osrm.org">https://router.project-osrm.org</a>';
        assert.throws(
            () => validateAndSanitizeUrl(dirtyUrl, 'OSRM_BASE_URL'),
            /elementos HTML ou scripts não permitidos/
        );
    });

    test('Deve rejeitar esquemas javascript:', () => {
        const maliciousUrl = 'javascript:alert(1)';
        assert.throws(
            () => validateAndSanitizeUrl(maliciousUrl, 'OSRM_BASE_URL'),
            /elementos HTML ou scripts não permitidos/
        );
    });

    test('Deve rejeitar URLs com credenciais de autenticação embutidas', () => {
        const credsUrl = 'https://admin:secret123@api.tomtom.com';
        assert.throws(
            () => validateAndSanitizeUrl(credsUrl, 'TOMTOM_ORBIS_BASE_URL'),
            /não pode conter credenciais de autenticação embutidas/
        );
    });

    test('Deve exigir protocolo HTTPS para hosts remotos', () => {
        const httpUrl = 'http://api.tomtom.com';
        assert.throws(
            () => validateAndSanitizeUrl(httpUrl, 'TOMTOM_ORBIS_BASE_URL'),
            /deve utilizar obrigatoriamente o protocolo HTTPS/
        );
    });

    test('Deve bloquear hosts fora da allowlist autorizada', () => {
        const unallowedHost = 'https://malicious-traffic-server.com';
        assert.throws(
            () => validateAndSanitizeUrl(unallowedHost, 'OSRM_BASE_URL', { requireAllowlist: true }),
            /não está na allowlist autorizada/
        );
    });

    test('Deve aceitar hosts na allowlist e remover barra final (trailing slash)', () => {
        const validWithSlash = 'https://router.project-osrm.org///';
        const sanitized = validateAndSanitizeUrl(validWithSlash, 'OSRM_BASE_URL', { requireAllowlist: true });
        assert.strictEqual(sanitized, 'https://router.project-osrm.org');
    });

    test('OSRM em modo demo deve forçar concorrência 1 e intervalo mínimo de 1100ms', () => {
        const env = {
            NODE_ENV: 'development',
            OSRM_USAGE_MODE: 'demo',
            OSRM_MAX_CONCURRENT_REQUESTS: '10', // Tentativa inválida de concorrência alta no demo
            OSRM_MIN_INTERVAL_MS: '200'         // Tentativa inválida de polling rápido no demo
        };
        const cfg = loadConfig(env);
        assert.strictEqual(cfg.osrm.maxConcurrentRequests, 1, 'Modo demo deve forçar concorrência 1');
        assert.strictEqual(cfg.osrm.minIntervalMs, 1100, 'Modo demo deve forçar intervalo >= 1100ms');
    });

    test('TomTom Orbis v2: Exige API Key quando habilitado e valida versão', () => {
        const envMissingKey = {
            TOMTOM_ORBIS_ENABLED: 'true',
            TOMTOM_TRAFFIC_API_VERSION: '2'
            // Sem TOMTOM_API_KEY
        };
        assert.throws(
            () => loadConfig(envMissingKey),
            /TOMTOM_ORBIS_ENABLED está ativo, mas TOMTOM_API_KEY não foi fornecida/
        );

        const envInvalidVersion = {
            TOMTOM_ORBIS_ENABLED: 'true',
            TOMTOM_API_KEY: 'test-key',
            TOMTOM_TRAFFIC_API_VERSION: '5' // Versão inexistente
        };
        assert.throws(
            () => loadConfig(envInvalidVersion),
            /Versão da API TomTom não suportada: 5/
        );
    });
});
