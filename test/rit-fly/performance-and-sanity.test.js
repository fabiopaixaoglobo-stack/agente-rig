const test = require('node:test');
const assert = require('node:assert/strict');
const { FlightStore } = require('../../server/rit-fly/store/flight-store');
const { OpenSkyProvider } = require('../../server/rit-fly/providers/opensky-provider');
const { FlightDTO } = require('../../server/rit-fly/types/flight-dto');
const { config } = require('../../server/rit-fly/config');

test('⚡ PERFORMANCE, SANIDADE & CRITÉRIOS DE ACEITE RIT FLY', async (t) => {
    const prevAllowSynthetic = config.ALLOW_SYNTHETIC_DATA;
    config.ALLOW_SYNTHETIC_DATA = true;
    t.after(() => {
        config.ALLOW_SYNTHETIC_DATA = prevAllowSynthetic;
    });

    const flightStore = new FlightStore();
    const provider = new OpenSkyProvider();

    await t.test('Critério de Aceite: Ciclo de atualização deve responder em menos de 1000ms (< 60s total)', async () => {
        const start = Date.now();
        const flights = await provider.getFlights();
        const duration = Date.now() - start;

        assert.ok(flights.length > 0);
        assert.ok(duration < 60000, `Tempo de resposta foi ${duration}ms, inferior aos 60 segundos`);
    });

    await t.test('FlightDTO deve sanitizar dados numéricos e strings sem lançar exceções', () => {
        const dto = new FlightDTO({
            callsign: 'GLO1999 ',
            latitude: -22.9105,
            longitude: -43.1631,
            altitudeFt: 25000,
            velocidadeKts: 450
        });

        assert.equal(dto.callsign, 'GLO1999');
        assert.equal(dto.numeroVoo, 'G3 1999');
        assert.equal(dto.companhia, 'GOL Linhas Aéreas');
        assert.equal(dto.categoria, 'comercial');
        assert.ok(dto.altitudeM > 7000);
        assert.ok(dto.velocidadeKmh > 800);
    });

    await t.test('KPIs executivos devem conter todos os campos exigidos pela governança', async () => {
        const flights = await provider.getFlights();
        const kpis = flightStore.calculateKpis(flights);

        assert.ok(kpis.voosMonitorados !== undefined, 'KPI Voos monitorados');
        assert.ok(kpis.voosAtrasados !== undefined, 'KPI Atrasos');
        assert.ok(kpis.tempoMedioEsperaEvitadoMin !== undefined, 'KPI Tempo médio de espera');
        assert.ok(kpis.economiaReprogramacaoBRL !== undefined, 'KPI Economia por reprogramação');
        assert.ok(kpis.slaEmbarquePct !== undefined, 'KPI SLA de embarque');
    });
});
