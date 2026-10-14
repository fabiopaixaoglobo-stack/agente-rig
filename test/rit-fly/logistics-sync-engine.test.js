const test = require('node:test');
const assert = require('node:assert/strict');
const { FlightStore } = require('../../server/rit-fly/store/flight-store');
const { OpenSkyProvider } = require('../../server/rit-fly/providers/opensky-provider');
const { LogisticsSyncEngine } = require('../../server/rit-fly/engine/logistics-sync-engine');
const { config } = require('../../server/rit-fly/config');

test('🚗 INTEGRAÇÃO RIT TRANSPORTE & LOGÍSTICA DE PASSAGEIROS', async (t) => {
    const prevAllowSynthetic = config.ALLOW_SYNTHETIC_DATA;
    config.ALLOW_SYNTHETIC_DATA = true;
    t.after(() => {
        config.ALLOW_SYNTHETIC_DATA = prevAllowSynthetic;
    });

    const flightStore = new FlightStore();
    const openSkyProvider = new OpenSkyProvider();
    const engine = new LogisticsSyncEngine(flightStore, openSkyProvider);

    await t.test('Deve vincular viagem e calcular cronograma de transporte', async () => {
        const trip = await engine.linkTrip({
            passageiro: 'Coordenação de Reportagem',
            voo: 'G3 1234',
            origem: 'Estúdios Globo - Jacarepaguá',
            destino: 'Aeroporto Santos Dumont (SDU)',
            tipoDeslocamento: 'IDA_AEROPORTO'
        });

        assert.ok(trip.id, 'Deveria gerar ID da viagem');
        assert.equal(trip.passageiro, 'Coordenação de Reportagem');
        assert.ok(trip.horarioTransporteRecalculado, 'Deveria calcular horário sugerido de transporte');
        assert.ok(trip.etaFinalDestino, 'Deveria calcular ETA final');
        assert.equal(trip.tipoDeslocamento, 'IDA_AEROPORTO');
    });

    await t.test('Deve detectar atrasos no voo e recalcular horário de saída', async () => {
        const flights = await openSkyProvider.getFlights();
        // Simula um voo com 45 minutos de atraso
        const delayedFlight = flights.find(f => f.numeroVoo.includes('G3 1234')) || flights[0];
        delayedFlight.atrasoMinutos = 45;
        const newEta = new Date(new Date(delayedFlight.horarioPrevisto).getTime() + 45 * 60000).toISOString();
        delayedFlight.eta = newEta;

        const synced = await engine.syncActiveTrips([delayedFlight]);
        const trip001 = flightStore.getTrip('trip-001');

        assert.ok(trip001, 'Viagem de demonstração deve existir');
        assert.ok(trip001.atrasoVooMinutos >= 35, 'Deveria refletir atraso acumulado');
        assert.ok(trip001.economiaEsperaMinutos >= 35, 'Deveria calcular economia de tempo de espera');
    });

    await t.test('Deve sanitizar dados pessoais respeitando a LGPD', () => {
        const rawNameWithCpf = 'Carlos Silva 123.456.789-00 colaborador@globo.com';
        const sanitized = engine.sanitizePassengerName(rawNameWithCpf);

        assert.ok(!sanitized.includes('123.456.789-00'), 'Não deve vazar CPF');
        assert.ok(!sanitized.includes('colaborador@globo.com'), 'Não deve vazar e-mail pessoal');
        assert.ok(sanitized.includes('[DOCUMENTO OCULTO]'));
    });
});
