/**
 * Agente RIT - Teste de Proteção contra Polling Agressivo e Rate Limit COR-Rio
 * Valida o intervalo mínimo de 60s (COR_RIO_MIN_INTERVAL_MS) e o mutex de concorrência (v2.2).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { CorRioProvider } = require('../../server/traffic-alert/providers/cor-rio-provider');
const { SOURCE_STATUS } = require('../../server/traffic-alert/constants');

describe('⏱️ PROTEÇÃO CONTRA POLLING AGRESSIVO E MUTEX COR-RIO (v2.2)', () => {

    test('Chamada repetida dentro do intervalo mínimo retorna cache válido sem nova requisição', async () => {
        const provider = new CorRioProvider({
            minIntervalMs: 60000 // 60 segundos
        });

        // Simula cache válido pré-existente
        provider.lastValidCache = {
            estagioNum: 2,
            estagioNome: 'Estágio 2',
            estagioCor: '#f2c94c',
            calorDesc: 'Calor Nível 2',
            fetchedAt: new Date().toISOString(),
            isCache: false,
            sourceStatus: SOURCE_STATUS.ACTIVE
        };
        provider.lastSyncTime = Date.now();

        // 1. Segunda chamada imediata (dentro da janela de 60s)
        const res = await provider.fetchData();

        assert.strictEqual(res.isCache, true, 'Deve indicar que o dado servido é de cache');
        assert.strictEqual(res.estagioNum, 2);
        assert.ok(res.note.includes('Cache local válido respeitado'));
    });

    test('Parâmetro force=true ignora o intervalo de cache e permite sincronização forçada', async () => {
        const provider = new CorRioProvider({
            minIntervalMs: 60000
        });

        provider.lastValidCache = {
            estagioNum: 1,
            estagioNome: 'Estágio 1',
            fetchedAt: new Date().toISOString(),
            isCache: false
        };
        provider.lastSyncTime = Date.now();

        // Simula mock de fetchJsonWithTimeout para responder com Estágio 3
        provider._fetchJsonWithTimeout = async () => ({
            ok: true,
            headers: { get: () => 'application/json' },
            json: async () => ({ estagio: 'Estágio 3', cor: '#f2994a' })
        });

        const res = await provider.fetchData({ force: true });

        assert.strictEqual(res.isCache, false, 'Com force=true não deve retornar cache');
        assert.strictEqual(res.estagioNum, 3);
        assert.strictEqual(res.estagioNome, 'Estágio 3');
    });

    test('Mutex de concorrência: Impede múltiplas chamadas simultâneas retornando cache em andamento', async () => {
        const provider = new CorRioProvider({ minIntervalMs: 0 });

        provider.lastValidCache = { estagioNum: 2, estagioNome: 'Estágio 2', isCache: false };

        // Força isSyncing ativo
        provider.isSyncing = true;

        const res = await provider.fetchData();
        assert.strictEqual(res.isCache, true);
        assert.ok(res.note.includes('Sincronização concorrente em andamento'));

        // Se não houver cache anterior e houver concorrência, deve lançar erro
        provider.lastValidCache = null;
        await assert.rejects(
            async () => provider.fetchData(),
            /Sincronização concorrente já em andamento/
        );
    });
});
