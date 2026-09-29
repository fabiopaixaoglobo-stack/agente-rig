/**
 * Agente RIT - Teste de Integridade de Hash SHA-256 e Descarte de Payload Bruto
 * Valida que o rawPayloadHash é gerado para integridade sem reter payloads volumosos (v2.1).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { generatePayloadHash, createIncidentSourceDTO } = require('../../server/traffic-alert/types/canonical-dto');

describe('🔐 HASH DETERMINÍSTICO E POLÍTICA DE PAYLOAD BRUTO (v2.1)', () => {

    test('generatePayloadHash deve produzir hashes idênticos para payloads com mesmo conteúdo', () => {
        const payloadA = { evento: 'Acidente', via: 'Linha Vermelha', km: 10 };
        const payloadB = { evento: 'Acidente', via: 'Linha Vermelha', km: 10 };

        const hashA = generatePayloadHash(payloadA);
        const hashB = generatePayloadHash(payloadB);

        assert.strictEqual(hashA, hashB, 'Hashes devem ser rigorosamente iguais');
        assert.strictEqual(hashA.length, 64, 'Hash SHA-256 deve possuir 64 caracteres hexadecimais');
    });

    test('generatePayloadHash deve produzir hashes distintos para conteúdos diferentes', () => {
        const payload1 = { alerta: 'Pista Seca' };
        const payload2 = { alerta: 'Pista Molhada' };

        const hash1 = generatePayloadHash(payload1);
        const hash2 = generatePayloadHash(payload2);

        assert.notStrictEqual(hash1, hash2, 'Hashes devem ser distintos');
    });

    test('Payload bruto deve ser descartado (undefined) quando storeRawPayload = false', () => {
        const source = createIncidentSourceDTO({
            provider: 'CET_RIO',
            externalId: 'ext-999',
            rawPayload: { sensivel: 'token_secreto', texto: 'Bloqueio total' },
            storeRawPayload: false
        });

        assert.ok(source.rawPayloadHash, 'Hash deve ser gerado');
        assert.strictEqual(source.rawPayload, undefined, 'Payload bruto deve ser undefined');
    });

    test('Payload bruto é preservado apenas quando explicitamente habilitado', () => {
        const testPayload = { diagnostic: 'debug_info' };
        const source = createIncidentSourceDTO({
            provider: 'CET_RIO',
            externalId: 'ext-1000',
            rawPayload: testPayload,
            storeRawPayload: true
        });

        assert.ok(source.rawPayloadHash);
        assert.deepStrictEqual(source.rawPayload, testPayload, 'Payload deve estar presente quando storeRawPayload=true');
    });
});
