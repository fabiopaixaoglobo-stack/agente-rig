const test = require('node:test');
const assert = require('node:assert/strict');
const { AirportProvider } = require('../../server/rit-fly/providers/airport-provider');
const { MetarProvider } = require('../../server/rit-fly/providers/metar-provider');
const { OpenSkyProvider } = require('../../server/rit-fly/providers/opensky-provider');

test('🏢 PROVEDOR DOS 8 AEROPORTOS CORPORATIVOS', async (t) => {
    const metarProvider = new MetarProvider();
    const airportProvider = new AirportProvider(metarProvider);
    const openSkyProvider = new OpenSkyProvider();

    await t.test('Deve conter os 8 aeroportos prioritários (GIG, SDU, CGH, GRU, BSB, CNF, SSA, REC)', async () => {
        const flights = await openSkyProvider.getFlights();
        const overview = await airportProvider.getAllAirportsOverview(flights);

        assert.equal(overview.length, 8, 'Deveria listar exatamente os 8 aeroportos-chave');
        
        const iatas = overview.map(a => a.iata);
        ['GIG', 'SDU', 'CGH', 'GRU', 'BSB', 'CNF', 'SSA', 'REC'].forEach(code => {
            assert.ok(iatas.includes(code), `Deveria conter aeroporto ${code}`);
        });

        // Validação de dados requeridos
        overview.forEach(a => {
            assert.ok(a.nome, 'Aeroporto deve possuir nome');
            assert.ok(a.clima, 'Aeroporto deve possuir dados meteorológicos');
            assert.ok(a.taxaPontualidadePct !== undefined, 'Aeroporto deve possuir pontualidade');
            assert.ok(a.statusOperacional, 'Aeroporto deve possuir status operacional');
        });
    });

    await t.test('Deve detalhar chegadas e partidas de um aeroporto específico', async () => {
        const flights = await openSkyProvider.getFlights();
        const detailsSDU = await airportProvider.getAirportDetails('SDU', flights);

        assert.ok(detailsSDU, 'Deveria retornar detalhes para SDU');
        assert.equal(detailsSDU.iata, 'SDU');
        assert.ok(Array.isArray(detailsSDU.chegadas), 'Deveria conter lista de chegadas');
        assert.ok(Array.isArray(detailsSDU.partidas), 'Deveria conter lista de partidas');
        assert.ok(detailsSDU.totais, 'Deveria conter totais operacionais');
    });
});
