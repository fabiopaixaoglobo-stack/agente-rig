const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const ritFlyRoutes = require('../../server/rit-fly/routes/rit-fly-routes');

test('🌐 ENDPOINTS RESTFUL RIT FLY (/api/rit-fly)', async (t) => {
    const app = express();
    app.use(express.json());
    app.use('/api/rit-fly', ritFlyRoutes);

    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/rit-fly`;

    t.after(() => {
        server.close();
    });

    await t.test('GET /flights deve retornar lista de voos', async () => {
        const res = await fetch(`${baseUrl}/flights`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(data.ok);
        assert.ok(Array.isArray(data.data));
        assert.ok(data.providerStatus !== undefined);
    });

    await t.test('GET /airports deve retornar 8 aeroportos', async () => {
        const res = await fetch(`${baseUrl}/airports`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(data.ok);
        assert.equal(data.data.length, 8);
    });

    await t.test('GET /kpis deve retornar KPIs executivos', async () => {
        const res = await fetch(`${baseUrl}/kpis`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(data.ok);
        assert.ok(data.data.voosMonitorados !== undefined);
        assert.ok(data.data.taxaPontualidadePct !== undefined);
    });

    await t.test('POST /trips deve cadastrar nova viagem integrada', async () => {
        const res = await fetch(`${baseUrl}/trips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                passageiro: 'Produção Novela das 9',
                voo: 'LA 3456',
                origem: 'Estúdios Globo',
                destino: 'Aeroporto Santos Dumont (SDU)',
                tipoDeslocamento: 'IDA_AEROPORTO'
            })
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.ok(data.ok);
        assert.equal(data.data.passageiro, 'Produção Novela das 9');
    });

    await t.test('POST /ai/query deve responder consulta à IA', async () => {
        const res = await fetch(`${baseUrl}/ai/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'Há atrasos em Congonhas?' })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(data.ok);
        assert.ok(data.data.texto);
        assert.equal(data.data.intencao, 'STATUS_AEROPORTO');
    });
});
