/**
 * Agente RIT - Teste dos Endpoints REST Oficiais (/api/traffic-alert/*)
 * Valida a exposição da API REST, persistência em repositório e respostas HTTP (v2.2).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');

const { MemoryStore } = require('../../server/traffic-alert/store/memory-store');
const { createTrafficAlertRouter } = require('../../server/traffic-alert/routes/traffic-alert-routes');
const { createTrafficIncidentDTO } = require('../../server/traffic-alert/types/canonical-dto');

describe('🌐 ENDPOINTS REST OFICIAIS DO SUBSISTEMA (/api/traffic-alert/*) (v2.2)', () => {
    let server;
    let baseUrl;
    let store;

    before(async () => {
        store = new MemoryStore();

        // Popula um incidente inicial para consulta nos testes
        const initialIncident = createTrafficIncidentDTO({
            id: '22222222-2222-2222-2222-222222222222',
            canonicalId: 'RIT-TEST-API-001',
            title: 'Ocorrência de Trânsito no Túnel Rebouças',
            corridor: 'TUNEL_REBOUCAS',
            lat: -22.9550,
            lng: -43.2050,
            severity: 'MEDIO',
            severityScore: 50.0,
            status: 'ACTIVE',
            isSynthetic: false,
            sources: [
                { provider: 'COR_RIO', rawPayload: 'Alerta túnel', confidenceWeight: 1.8, isOfficial: true }
            ]
        });
        store.upsertIncident(initialIncident);

        const app = express();
        app.use(express.json());
        const router = createTrafficAlertRouter({ store });
        app.use('/api/traffic-alert', router);

        server = http.createServer(app);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/traffic-alert`;
    });

    after(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
    });

    test('GET /health: Retorna status 200 com modo de persistência e telemetria', async () => {
        const res = await fetch(`${baseUrl}/health`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.ok, true);
        assert.ok(data.persistenceMode);
        assert.strictEqual(typeof data.activeIncidentsCount, 'number');
    });

    test('GET /incidents: Retorna lista de incidentes ativos consolidados', async () => {
        const res = await fetch(`${baseUrl}/incidents`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.ok, true);
        assert.ok(data.count >= 1);
        assert.strictEqual(data.data[0].canonicalId, 'RIT-TEST-API-001');
    });

    test('GET /incidents/:id: Retorna incidente por ID ou 404 se não encontrado', async () => {
        // ID Existente
        const resOk = await fetch(`${baseUrl}/incidents/22222222-2222-2222-2222-222222222222`);
        assert.strictEqual(resOk.status, 200);
        const dataOk = await resOk.json();
        assert.strictEqual(dataOk.data.corridor, 'TUNEL_REBOUCAS');

        // ID Inexistente
        const res404 = await fetch(`${baseUrl}/incidents/inexistente-uuid-999`);
        assert.strictEqual(res404.status, 404);
        const data404 = await res404.json();
        assert.strictEqual(data404.ok, false);
    });

    test('GET /incidents/:id/sources e /history: Retorna fontes e trilha de auditoria', async () => {
        const resSources = await fetch(`${baseUrl}/incidents/22222222-2222-2222-2222-222222222222/sources`);
        assert.strictEqual(resSources.status, 200);
        const dataSources = await resSources.json();
        assert.strictEqual(dataSources.count, 1);
        assert.strictEqual(dataSources.data[0].provider, 'COR_RIO');

        const resHistory = await fetch(`${baseUrl}/incidents/22222222-2222-2222-2222-222222222222/history`);
        assert.strictEqual(resHistory.status, 200);
        const dataHistory = await resHistory.json();
        assert.ok(dataHistory.count >= 1);
    });

    test('GET /nearby: Retorna incidentes próximos ordenados por distância com Haversine puro', async () => {
        // Coordenada próxima ao Túnel Rebouças (-22.9550, -43.2050)
        const res = await fetch(`${baseUrl}/nearby?lat=-22.9560&lng=-43.2060&radius=2000`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.ok, true);
        assert.ok(data.count >= 1);
        assert.ok(data.data[0].distance_meters < 2000);

        // Validação de parâmetro inválido (400)
        const resBad = await fetch(`${baseUrl}/nearby?lat=invalido`);
        assert.strictEqual(resBad.status, 400);
    });
});
