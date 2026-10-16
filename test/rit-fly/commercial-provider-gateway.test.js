/**
 * test/rit-fly/commercial-provider-gateway.test.js
 * Testes Unitários e de Integração: FlightPositionProvider & FlightProviderGateway
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { FlightPositionProvider } = require('../../server/rit-fly/providers/flight-position-provider');
const { CommercialAdsbProvider } = require('../../server/rit-fly/providers/commercial-adsb-provider');
const { FlightProviderGateway } = require('../../server/rit-fly/providers/provider-gateway');
const { FlightDTO } = require('../../server/rit-fly/types/flight-dto');

test('🛸 SUÍTE DO GATEWAY DE PROVEDORES AÉREOS COMERCIAIS', async (suite) => {

    await suite.test('1. Interface FlightPositionProvider deve definir os 5 métodos obrigatórios', () => {
        const base = new FlightPositionProvider();
        assert.rejects(async () => await base.healthCheck(), /deve ser implementado/);
        assert.rejects(async () => await base.getCurrentFlights(), /deve ser implementado/);
        assert.rejects(async () => await base.getFlightById('ABC'), /deve ser implementado/);
        assert.throws(() => base.getProviderMetadata(), /deve ser implementado/);
        assert.throws(() => base.getRateLimitStatus(), /deve ser implementado/);
    });

    await suite.test('2. CommercialAdsbProvider deve implementar metadados e DTO canônico com precisão', () => {
        const provider = new CommercialAdsbProvider();
        const meta = provider.getProviderMetadata();
        assert.strictEqual(meta.id, 'ADSB_COMMERCIAL_FEED');
        assert.ok(meta.name.includes('ADS-B'));
        assert.ok(meta.license.includes('ODbL') || meta.license.includes('Commercial'));
        assert.ok(meta.coverage.includes('Brasil'));

        const rateLimit = provider.getRateLimitStatus();
        assert.strictEqual(rateLimit.status, 'OK');

        // Teste de transformação de payload ADS-B bruto
        const raw = {
            hex: 'e48ad4',
            flight: 'TAM3463 ',
            r: 'PR-MYO',
            t: 'A320',
            alt_baro: 24875,
            gs: 386.0,
            track: 117.63,
            lat: -22.945924,
            lon: -47.581584,
            baro_rate: -640
        };

        const dto = provider.transformAdsbRecord(raw);
        assert.ok(dto instanceof FlightDTO);
        assert.strictEqual(dto.id, 'E48AD4');
        assert.strictEqual(dto.icao24, 'e48ad4');
        assert.strictEqual(dto.callsign, 'TAM3463');
        assert.strictEqual(dto.numeroVoo, 'LA 3463');
        assert.strictEqual(dto.prefixo, 'PR-MYO');
        assert.strictEqual(dto.companhia, 'LATAM Brasil');
        assert.strictEqual(dto.categoria, 'comercial');
        assert.strictEqual(dto.latitude, -22.945924);
        assert.strictEqual(dto.longitude, -47.581584);
        assert.strictEqual(dto.altitudeFt, 24875);
        assert.strictEqual(dto.altitudeM, Math.round(24875 * 0.3048));
        assert.strictEqual(dto.velocidadeKts, 386);
        assert.strictEqual(dto.velocidadeKmh, Math.round(386 * 1.852));
        assert.strictEqual(dto.rumo, 118);
        assert.strictEqual(dto.data_source, 'ADSB_COMMERCIAL_FEED');
        assert.strictEqual(dto.data_mode, 'LIVE');
    });

    await suite.test('3. CommercialAdsbProvider deve identificar corretamente companhias e aviação executiva', () => {
        const provider = new CommercialAdsbProvider();

        const gol = provider.identifyAirlineAndCategory('GLO1234', 'PR-GGB', 'B738');
        assert.strictEqual(gol.companhia, 'GOL Linhas Aéreas');
        assert.strictEqual(gol.numeroVoo, 'G3 1234');
        assert.strictEqual(gol.categoria, 'comercial');

        const azul = provider.identifyAirlineAndCategory('AZU4242', 'PS-ADC', 'E295');
        assert.strictEqual(azul.companhia, 'Azul Linhas Aéreas');
        assert.strictEqual(azul.numeroVoo, 'AD 4242');

        const exec = provider.identifyAirlineAndCategory('PSESB', 'PS-ESB', 'C510');
        assert.strictEqual(exec.categoria, 'executivo');
        assert.strictEqual(exec.companhia, 'Aviação Executiva / Privada');

        const heli = provider.identifyAirlineAndCategory('PTXYZ', 'PT-XYZ', 'H135');
        assert.strictEqual(heli.categoria, 'helicoptero');
        assert.strictEqual(heli.companhia, 'Operação de Asas Rotativas');
    });

    await suite.test('4. FlightProviderGateway deve orquestrar cache e estados (LIVE -> CACHED -> UNAVAILABLE)', async () => {
        // Mock do provedor comercial
        class MockCommercialProvider extends FlightPositionProvider {
            constructor() {
                super();
                this.calls = 0;
            }
            getProviderMetadata() {
                return { id: 'MOCK_ADSB', name: 'Mock Provider' };
            }
            getRateLimitStatus() {
                return { status: 'OK' };
            }
            async healthCheck() {
                return { healthy: true, status: 'ONLINE', latencyMs: 12 };
            }
            async getCurrentFlights() {
                this.calls++;
                if (this.calls === 1) {
                    return [new FlightDTO({ id: 'TEST1', callsign: 'GLO1001', latitude: -22.9, longitude: -43.2 })];
                }
                throw new Error('Falha simulada de rede');
            }
        }

        const mock = new MockCommercialProvider();
        const gateway = new FlightProviderGateway({ commercialProvider: mock, cacheTtlMs: 50 });

        // Chamada 1: Provedor online -> LIVE_PROVIDER
        const f1 = await gateway.getCurrentFlights();
        assert.strictEqual(f1.length, 1);
        assert.strictEqual(gateway.getDataMode(), 'LIVE_PROVIDER');

        // Chamada 2: Provedor falha logo após, mas cache está ativo -> CACHED_PROVIDER
        const f2 = await gateway.getCurrentFlights();
        assert.strictEqual(f2.length, 1);
        assert.strictEqual(gateway.getDataMode(), 'CACHED_PROVIDER');

        // Chamada 3: Limpa o cache manualmente para forçar expiração -> UNAVAILABLE
        gateway.cache = null;
        gateway.lastFetchTime = 0;
        const f3 = await gateway.getCurrentFlights();
        assert.strictEqual(f3.length, 0);
        assert.strictEqual(gateway.getDataMode(), 'UNAVAILABLE');
    });

    await suite.test('5. FlightProviderGateway deve implementar busca por identificador (getFlightById)', async () => {
        const gateway = new FlightProviderGateway();
        gateway.cache = [
            new FlightDTO({ id: 'F001', icao24: 'e48ad4', callsign: 'TAM3463', prefixo: 'PR-MYO', numeroVoo: 'LA 3463' }),
            new FlightDTO({ id: 'F002', icao24: 'e49fb4', callsign: 'AZU4242', prefixo: 'PS-ADC', numeroVoo: 'AD 4242' })
        ];
        gateway.lastFetchTime = Date.now();

        const byIcao = await gateway.getFlightById('e48ad4');
        assert.ok(byIcao);
        assert.strictEqual(byIcao.callsign, 'TAM3463');

        const byCallsign = await gateway.getFlightById('AZU4242');
        assert.ok(byCallsign);
        assert.strictEqual(byCallsign.id, 'F002');

        const byPrefixo = await gateway.getFlightById('PR-MYO');
        assert.ok(byPrefixo);

        const notFound = await gateway.getFlightById('INEXISTENTE');
        assert.strictEqual(notFound, null);
    });
});
