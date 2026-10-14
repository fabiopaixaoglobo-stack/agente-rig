const test = require('node:test');
const assert = require('node:assert/strict');
const { OpenSkyProvider } = require('../../server/rit-fly/providers/opensky-provider');
const { FLIGHT_CATEGORIES } = require('../../server/rit-fly/constants');
const { ritFlyConfig } = require('../../server/rit-fly/config');

test('✈️ PROVEDOR OPENSKY & MALHA AÉREA NACIONAL (MODO CONTINGÊNCIA/SINTÉTICO)', async (t) => {
    const prevAllowSynthetic = ritFlyConfig.ALLOW_SYNTHETIC_DATA;
    ritFlyConfig.ALLOW_SYNTHETIC_DATA = true;
    t.after(() => {
        ritFlyConfig.ALLOW_SYNTHETIC_DATA = prevAllowSynthetic;
    });

    const provider = new OpenSkyProvider();

    await t.test('Deve retornar voos ativos no espaço aéreo brasileiro', async () => {
        const flights = await provider.getFlights();
        assert.ok(Array.isArray(flights), 'Deveria retornar um array de voos');
        assert.ok(flights.length >= 8, 'Deveria retornar pelo menos 8 voos da malha nacional');
        
        const first = flights[0];
        assert.ok(first.id, 'Voo deve possuir ID');
        assert.ok(first.numeroVoo, 'Voo deve possuir identificador/número');
        assert.ok(first.latitude && first.longitude, 'Voo deve conter coordenadas geográficas');
        assert.ok(first.altitudeFt !== undefined, 'Voo deve conter altitude em pés');
        assert.ok(first.velocidadeKmh !== undefined, 'Voo deve conter velocidade');
    });

    await t.test('Deve filtrar voos corretamente por categoria', async () => {
        const helicópteros = await provider.getFlights({ categoria: 'helicoptero' });
        assert.ok(helicópteros.length > 0, 'Deveria retornar helicópteros');
        helicópteros.forEach(h => {
            assert.equal(h.categoria, FLIGHT_CATEGORIES.HELICOPTERO);
        });

        const comerciais = await provider.getFlights({ categoria: 'comercial' });
        assert.ok(comerciais.length > 0, 'Deveria retornar voos comerciais');
        comerciais.forEach(c => {
            assert.equal(c.categoria, FLIGHT_CATEGORIES.COMERCIAL);
        });

        const cargueiros = await provider.getFlights({ categoria: 'cargueiro' });
        assert.ok(cargueiros.length > 0, 'Deveria retornar cargueiros');
        cargueiros.forEach(cg => {
            assert.equal(cg.categoria, FLIGHT_CATEGORIES.CARGUEIRO);
        });

        const executivos = await provider.getFlights({ categoria: 'executivo' });
        assert.ok(executivos.length > 0, 'Deveria retornar executivos');
        executivos.forEach(ex => {
            assert.equal(ex.categoria, FLIGHT_CATEGORIES.EXECUTIVO);
        });
    });

    await t.test('Deve permitir busca textual por prefixo, número de voo e aeroporto', async () => {
        const resG3 = await provider.getFlights({ search: 'G3 1234' });
        assert.ok(resG3.length >= 1, 'Deveria encontrar voo G3 1234');
        assert.ok(resG3[0].numeroVoo.includes('G3 1234') || resG3[0].callsign.includes('GLO1234'));

        const resSdu = await provider.getFlights({ search: 'SDU' });
        assert.ok(resSdu.length >= 1, 'Deveria encontrar voos com origem ou destino SDU');
    });
});
