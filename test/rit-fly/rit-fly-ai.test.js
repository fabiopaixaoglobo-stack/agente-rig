const test = require('node:test');
const assert = require('node:assert/strict');
const { RitFlyAI } = require('../../server/rit-fly/engine/rit-fly-ai');
const { OpenSkyProvider } = require('../../server/rit-fly/providers/opensky-provider');
const { MetarProvider } = require('../../server/rit-fly/providers/metar-provider');
const { AirportProvider } = require('../../server/rit-fly/providers/airport-provider');
const { FlightStore } = require('../../server/rit-fly/store/flight-store');
const { config } = require('../../server/rit-fly/config');

test('🤖 AGENTE INTELIGENTE RIT FLY AI', async (t) => {
    const prevAllowSynthetic = config.ALLOW_SYNTHETIC_DATA;
    config.ALLOW_SYNTHETIC_DATA = true;
    t.after(() => {
        config.ALLOW_SYNTHETIC_DATA = prevAllowSynthetic;
    });

    const flightStore = new FlightStore();
    const openSkyProvider = new OpenSkyProvider();
    const metarProvider = new MetarProvider();
    const airportProvider = new AirportProvider(metarProvider);

    const ritFlyAI = new RitFlyAI({
        openSkyProvider,
        airportProvider,
        metarProvider,
        flightStore
    });

    await t.test('Deve responder: "Qual a previsão de chegada do voo G3 1234?"', async () => {
        const resp = await ritFlyAI.answer('Qual a previsão de chegada do voo G3 1234?');
        assert.ok(resp.texto, 'Deveria retornar texto');
        assert.ok(resp.texto.includes('G3 1234') || resp.texto.includes('GLO1234'));
        assert.ok(resp.texto.includes('ETA') || resp.texto.includes('Previsão'));
        assert.equal(resp.intencao, 'PREVISAO_VOO');
    });

    await t.test('Deve responder: "Há atrasos em Congonhas?"', async () => {
        const resp = await ritFlyAI.answer('Há atrasos em Congonhas?');
        assert.ok(resp.texto, 'Deveria retornar texto');
        assert.ok(resp.texto.includes('Congonhas') || resp.texto.includes('CGH') || resp.texto.includes('SBSP'));
        assert.ok(resp.texto.includes('Atraso') || resp.texto.includes('Pontualidade'));
        assert.equal(resp.intencao, 'STATUS_AEROPORTO');
    });

    await t.test('Deve responder: "Quais voos chegam ao Santos Dumont nas próximas 2 horas?"', async () => {
        const resp = await ritFlyAI.answer('Quais voos chegam ao Santos Dumont nas próximas 2 horas?');
        assert.ok(resp.texto, 'Deveria retornar texto');
        assert.ok(resp.texto.includes('Santos Dumont') || resp.texto.includes('SDU'));
        assert.equal(resp.intencao, 'VOOS_CHEGADA');
    });

    await t.test('Deve responder: "Qual o risco operacional do deslocamento aeroporto → destino?"', async () => {
        const resp = await ritFlyAI.answer('Qual o risco operacional do deslocamento aeroporto → destino?');
        assert.ok(resp.texto, 'Deveria retornar texto');
        assert.ok(resp.texto.includes('Matriz de Risco') || resp.texto.includes('Risco Operacional'));
        assert.ok(resp.texto.includes('Linha Vermelha') || resp.texto.includes('Linha Amarela') || resp.texto.includes('Washington Luís'));
        assert.equal(resp.intencao, 'RISCO_OPERACIONAL');
    });
});
