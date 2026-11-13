'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');

const { createTrafficAlertRouter } = require('../../server/traffic-alert/routes/traffic-alert-routes');
const {
    RJ_CORRIDOR_SEGMENTS,
    enrichCorridorWithSegments,
    resolveSegmentSelection,
    buildMapLinks,
    decodePolyline,
    CorridorRouteService
} = require('../../server/traffic-alert/engine/corridor-route-service');
const { TRAFFIC_AWARENESS } = require('../../server/traffic-alert/constants');

function startExpressApp(router) {
    const app = express();
    app.use(express.json());
    app.use('/api/traffic-alert', router);
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${port}/api/traffic-alert` });
        });
    });
}

describe('🚦 RIT ALERTA — Trecho, Sentido e Destino com Cálculo de Trânsito', () => {
    it('1. GET /traffic-conditions?region=RJ e demais regionais retornam trechos e sentidos estruturados', async () => {
        const router = createTrafficAlertRouter({
            orchestrator: { getSystemHealth: () => ({ ok: true }) },
            incidentRepo: { listIncidents: async () => [], countIncidents: async () => 0 },
            sourceService: { checkHealth: () => ({ ok: true }) },
            providerStatus: {}
        });
        const { server, baseUrl } = await startExpressApp(router);
        try {
            const resRj = await fetch(`${baseUrl}/traffic-conditions?region=RJ`);
            assert.equal(resRj.status, 200);
            const bodyRj = await resRj.json();
            assert.equal(bodyRj.ok, true);
            assert.equal(bodyRj.corridors.length, 9);

            for (const c of bodyRj.corridors) {
                assert.ok(Array.isArray(c.trechos) && c.trechos.length >= 4, `${c.via} deve ter múltiplos trechos georreferenciados`);
                assert.ok(Array.isArray(c.sentidos) && c.sentidos.length >= 2, `${c.via} deve ter sentidos selecionáveis`);
                assert.ok(c.trechoPadrao, `${c.via} precisa de trechoPadrao`);
                assert.ok(c.sentidoPadrao, `${c.via} precisa de sentidoPadrao`);
                for (const t of c.trechos) {
                    assert.ok(t.lat < -22.5 && t.lat > -23.2, `Latitude inválida no trecho ${t.label} (${t.lat})`);
                    assert.ok(t.lng < -43.0 && t.lng > -43.8, `Longitude inválida no trecho ${t.label} (${t.lng})`);
                }
            }

            for (const reg of ['SP', 'BH', 'BSB', 'REC']) {
                const res = await fetch(`${baseUrl}/traffic-conditions?region=${reg}`);
                const body = await res.json();
                assert.equal(body.ok, true);
                assert.equal(body.corridors.length, 9);
                assert.ok(body.corridors[0].trechos.length >= 2, `${reg} deve ter trechos padrão`);
                assert.ok(body.corridors[0].sentidos.length >= 2, `${reg} deve ter sentidos padrão`);
            }
        } finally {
            server.close();
        }
    });

    it('2. resolveSegmentSelection recalcula ponto de origem e retenção conforme trecho e sentido', () => {
        const avBrasil = {
            via: 'Av Brasil',
            status: 'Lento',
            retencaoMin: 18,
            velocidadePadraoKmH: 80,
            velocidadeAtualKmH: 42
        };

        const penhaCentro = resolveSegmentSelection(avBrasil, 'RJ', 'penha', 'centro');
        const campoGrandeOeste = resolveSegmentSelection(avBrasil, 'RJ', 'campo-grande', 'santa-cruz');

        assert.equal(penhaCentro.trecho.id, 'penha');
        assert.equal(penhaCentro.sentido.id, 'centro');
        assert.ok(penhaCentro.adjustedRetencaoMin > campoGrandeOeste.adjustedRetencaoMin);
        assert.ok(campoGrandeOeste.adjustedSpeedKmH > penhaCentro.adjustedSpeedKmH);
        assert.notEqual(penhaCentro.origin.lat, campoGrandeOeste.origin.lat);
    });

    it('3. Motor utiliza Google Routes API v2 (TRAFFIC_AWARE) quando habilitado com chave', async () => {
        const capturedCalls = [];
        const mockFetch = async (url, init = {}) => {
            capturedCalls.push({ url, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
            if (url === 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix') {
                return new Response(JSON.stringify([
                    {
                        originIndex: 0,
                        destinationIndex: 0,
                        condition: 'ROUTE_EXISTS',
                        duration: '2400s',
                        staticDuration: '1500s',
                        distanceMeters: 19500
                    },
                    {
                        originIndex: 1,
                        destinationIndex: 0,
                        condition: 'ROUTE_EXISTS',
                        duration: '1800s',
                        staticDuration: '1320s',
                        distanceMeters: 14200
                    }
                ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (url === 'https://routes.googleapis.com/directions/v2:computeRoutes') {
                return new Response(JSON.stringify({
                    routes: [{
                        duration: '2400s',
                        staticDuration: '1500s',
                        distanceMeters: 19500,
                        polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }
                    }]
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response('Not Found', { status: 404 });
        };

        const service = new CorridorRouteService({ fetchImpl: mockFetch });
        const corridors = [
            enrichCorridorWithSegments({ via: 'Av Brasil', retencaoMin: 18, velocidadePadraoKmH: 80, velocidadeAtualKmH: 42 }, 'RJ'),
            enrichCorridorWithSegments({ via: 'Linha Amarela', retencaoMin: 0, velocidadePadraoKmH: 80, velocidadeAtualKmH: 78 }, 'RJ')
        ];

        const result = await service.estimateCorridorsToDestination({
            corridors,
            region: 'RJ',
            destination: { label: 'Estúdios Globo', lat: -22.9571, lng: -43.4048 },
            selections: {
                'Av Brasil': { trechoId: 'penha', sentidoId: 'centro' },
                'Linha Amarela': { trechoId: 'del-castilho', sentidoId: 'barra' }
            },
            focusVia: 'Av Brasil',
            env: {
                GOOGLE_ROUTES_ENABLED: 'true',
                GOOGLE_ROUTES_API_KEY: 'test-google-key'
            }
        });

        assert.equal(result.trafficAwareness, TRAFFIC_AWARENESS.REAL_TIME);
        assert.equal(result.providerCode, 'GOOGLE_ROUTES_TRAFFIC');
        assert.equal(result.isEstimatedFallback, false);
        assert.equal(result.items.length, 2);
        assert.equal(capturedCalls[0].headers['X-Goog-Api-Key'], 'test-google-key');
        assert.equal(capturedCalls[0].body.routingPreference, 'TRAFFIC_AWARE');

        const avBrasilEta = result.items[0];
        assert.equal(avBrasilEta.estimatedTotalMin, 40);
        assert.equal(avBrasilEta.baseDurationMin, 25);
        assert.equal(avBrasilEta.trafficDelayMin, 15);
        assert.equal(avBrasilEta.distanceKm, 19.5);
        assert.ok(Array.isArray(avBrasilEta.routeCoordinates) && avBrasilEta.routeCoordinates.length === 3);
        assert.ok(avBrasilEta.links.googleMapsUrl.startsWith('https://www.google.com/maps/dir/'));
        assert.ok(avBrasilEta.links.wazeLiveMapUrl.startsWith('https://www.waze.com/live-map/directions'));
    });

    it('4. Motor utiliza TomTom Routing (traffic=true) quando habilitado com chave', async () => {
        let calledUrl = '';
        const mockFetch = async (url) => {
            calledUrl = url;
            return new Response(JSON.stringify({
                routes: [{
                    summary: {
                        lengthInMeters: 12400,
                        travelTimeInSeconds: 1680,
                        noTrafficTravelTimeInSeconds: 1080,
                        trafficDelayInSeconds: 600
                    },
                    legs: [{
                        points: [
                            { latitude: -22.8368, longitude: -43.2775 },
                            { latitude: -22.9571, longitude: -43.4048 }
                        ]
                    }]
                }]
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };

        const service = new CorridorRouteService({ fetchImpl: mockFetch });
        const route = await service.estimateSingleRoute({
            origin: { lat: -22.8368, lng: -43.2775, label: 'Penha' },
            destination: { lat: -22.9571, lng: -43.4048, label: 'Estúdios Globo' },
            env: {
                GOOGLE_ROUTES_ENABLED: 'false',
                TOMTOM_ORBIS_ENABLED: 'true',
                TOMTOM_API_KEY: 'test-tomtom-key'
            }
        });

        assert.ok(calledUrl.startsWith('https://api.tomtom.com/routing/1/calculateRoute/'));
        assert.ok(calledUrl.includes('traffic=true'));
        assert.equal(route.trafficAwareness, TRAFFIC_AWARENESS.REAL_TIME);
        assert.equal(route.providerCode, 'TOMTOM_TRAFFIC');
        assert.equal(route.estimatedTotalMin, 28);
        assert.equal(route.baseDurationMin, 18);
        assert.equal(route.trafficDelayMin, 10);
        assert.equal(route.distanceKm, 12.4);
    });

    it('5. Fallback OSRM + Retenção COR/CET combina malha viária sem falsificar trafficAwareness e gera links Google/Waze', async () => {
        let tableRequests = 0;
        let routeRequests = 0;
        const mockFetch = async (url) => {
            if (url.startsWith('https://router.project-osrm.org/table/v1/driving/')) {
                tableRequests += 1;
                return new Response(JSON.stringify({
                    code: 'Ok',
                    durations: [[1200], [900]],
                    distances: [[16400], [13100]]
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (url.startsWith('https://router.project-osrm.org/route/v1/driving/')) {
                routeRequests += 1;
                return new Response(JSON.stringify({
                    code: 'Ok',
                    routes: [{
                        duration: 1200,
                        distance: 16400,
                        geometry: {
                            type: 'LineString',
                            coordinates: [[-43.2775, -22.8368], [-43.35, -22.90], [-43.4048, -22.9571]]
                        }
                    }]
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response('Not Found', { status: 404 });
        };

        const service = new CorridorRouteService({ fetchImpl: mockFetch });
        const corridors = [
            enrichCorridorWithSegments({ via: 'Av Brasil', retencaoMin: 18, velocidadePadraoKmH: 80, velocidadeAtualKmH: 42 }, 'RJ'),
            enrichCorridorWithSegments({ via: 'Linha Amarela', retencaoMin: 0, velocidadePadraoKmH: 80, velocidadeAtualKmH: 78 }, 'RJ')
        ];

        const result = await service.estimateCorridorsToDestination({
            corridors,
            region: 'RJ',
            destination: { label: 'Estúdios Globo', lat: -22.9571, lng: -43.4048 },
            selections: {
                'Av Brasil': { trechoId: 'penha', sentidoId: 'centro' },
                'Linha Amarela': { trechoId: 'del-castilho', sentidoId: 'barra' }
            },
            focusVia: 'Av Brasil',
            env: {
                GOOGLE_ROUTES_ENABLED: 'false',
                TOMTOM_ORBIS_ENABLED: 'false',
                OSRM_MIN_INTERVAL_MS: '1100'
            }
        });

        assert.equal(tableRequests, 1, 'Batch OSRM deve usar uma única consulta /table');
        assert.equal(routeRequests, 1, 'Polilinha detalhada apenas para a via em foco');
        assert.equal(result.trafficAwareness, TRAFFIC_AWARENESS.NOT_AVAILABLE);
        assert.equal(result.isEstimatedFallback, true);
        assert.equal(result.providerCode, 'OSRM_CORRIDOR');

        const avBrasilEta = result.items[0];
        assert.equal(avBrasilEta.baseDurationMin, 20);
        assert.ok(avBrasilEta.trafficDelayMin >= 18);
        assert.equal(avBrasilEta.estimatedTotalMin, avBrasilEta.baseDurationMin + avBrasilEta.trafficDelayMin);
        assert.equal(avBrasilEta.routeCoordinates.length, 3);
        assert.deepEqual(avBrasilEta.routeCoordinates[0], [-22.8368, -43.2775]);

        const linhaAmarelaEta = result.items[1];
        assert.equal(linhaAmarelaEta.baseDurationMin, 15);
        assert.equal(linhaAmarelaEta.trafficDelayMin, 0);
        assert.equal(linhaAmarelaEta.estimatedTotalMin, 15);
    });

    it('6. Endpoints HTTP /corridors-eta, /route-estimate e /destination-presets validam entradas e respondem JSON completo', async () => {
        const router = createTrafficAlertRouter({
            orchestrator: { getSystemHealth: () => ({ ok: true }) },
            incidentRepo: { listIncidents: async () => [], countIncidents: async () => 0 },
            sourceService: { checkHealth: () => ({ ok: true }) },
            providerStatus: {}
        });
        const { server, baseUrl } = await startExpressApp(router);
        try {
            const presetsRes = await fetch(`${baseUrl}/destination-presets?region=RJ`);
            assert.equal(presetsRes.status, 200);
            const presetsBody = await presetsRes.json();
            assert.equal(presetsBody.ok, true);
            assert.ok(presetsBody.presets.some(p => p.id === 'projac'));

            const badRes = await fetch(`${baseUrl}/corridors-eta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ region: 'RJ', destination: '' })
            });
            assert.equal(badRes.status, 400);

            const etaRes = await fetch(`${baseUrl}/corridors-eta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    region: 'RJ',
                    destination: { label: 'Estúdios Globo (Jacarepaguá)', lat: -22.9571, lng: -43.4048 },
                    selections: {
                        'Av Brasil': { trechoId: 'iraja', sentidoId: 'centro' },
                        'Linha Vermelha': { trechoId: 'mare', sentidoId: 'baixada' }
                    },
                    focusVia: 'Av Brasil'
                })
            });
            assert.equal(etaRes.status, 200);
            const etaBody = await etaRes.json();
            assert.equal(etaBody.ok, true);
            assert.equal(etaBody.items.length, 9);
            const avBrasil = etaBody.items.find(i => i.via === 'Av Brasil');
            assert.equal(avBrasil.trechoId, 'iraja');
            assert.equal(avBrasil.sentidoId, 'centro');
            assert.ok(avBrasil.estimatedTotalMin >= 5);
            assert.ok(avBrasil.distanceKm > 0);
            assert.ok(avBrasil.links.googleMapsUrl.includes('origin=-22.825800,-43.320800'));
            assert.ok(avBrasil.links.wazeLiveMapUrl.includes('from=ll.-22.825800%2C-43.320800'));

            const singleRes = await fetch(`${baseUrl}/route-estimate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    region: 'RJ',
                    via: 'Ponte Rio-Niterói',
                    trechoId: 'pedagio-niteroi',
                    sentidoId: 'niteroi',
                    destination: 'Aeroporto Santos Dumont (SDU)'
                })
            });
            assert.equal(singleRes.status, 200);
            const singleBody = await singleRes.json();
            assert.equal(singleBody.ok, true);
            assert.ok(singleBody.route.estimatedTotalMin >= 5);
            assert.ok(singleBody.route.links.googleMapsUrl.includes('destination=-22.910500,-43.163100'));
        } finally {
            server.close();
        }
    });

    it('7. UI dashboard.html, TrafficAlertService URL sanitizer e helpers mantêm integridade estrutural e XSS seguro', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../../public/dashboard.html'), 'utf8');
        assert.ok(html.includes('id="ta-destination-bar"'));
        assert.ok(html.includes('id="ta-destination-input"'));
        assert.ok(html.includes('id="ta-btn-calc-destination"'));
        assert.ok(html.includes('id="ta-destination-presets"'));
        assert.ok(html.includes('id="ta-route-engine-badge"'));

        const links = buildMapLinks(-22.8368, -43.2775, -22.9571, -43.4048);
        assert.ok(links.googleMapsUrl.startsWith('https://www.google.com/maps/dir/'));
        assert.ok(links.wazeLiveMapUrl.startsWith('https://www.waze.com/live-map/directions'));

        // Carrega TrafficAlertService via vm para validar validateExternalUrl real em browser-style export
        const serviceCode = fs.readFileSync(path.resolve(__dirname, '../../public/js/traffic-alert/traffic-alert-service.js'), 'utf8')
            .replace(/export\s+default\s+/g, '')
            .replace(/export\s+class\s+/g, 'class ');
        const context = { URL, console, AbortController, setTimeout, clearTimeout, fetch: async () => ({}) };
        vm.createContext(context);
        vm.runInContext(`${serviceCode}\nthis.__Svc = TrafficAlertService;`, context);
        const svc = new context.__Svc();

        assert.ok(svc.validateExternalUrl(links.googleMapsUrl), 'Google Maps URL deve passar na validação anti-XSS');
        assert.ok(svc.validateExternalUrl(links.wazeLiveMapUrl), 'Waze Live Map URL deve passar na validação anti-XSS');
        assert.equal(svc.validateExternalUrl('javascript:alert(1)'), null, 'javascript: deve ser bloqueado');

        const decoded = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
        assert.equal(decoded.length, 3);
        assert.ok(Math.abs(decoded[0][0] - 38.5) < 0.01);
        assert.equal(Object.keys(RJ_CORRIDOR_SEGMENTS).length, 9);
    });
});
