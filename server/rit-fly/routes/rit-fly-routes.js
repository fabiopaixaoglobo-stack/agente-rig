/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Rotas e Endpoints RESTful Oficiais
 */

const express = require('express');
const router = express.Router();

const { FlightProviderGateway } = require('../providers/provider-gateway');
const { CommercialAdsbProvider } = require('../providers/commercial-adsb-provider');
const { OpenSkyProvider } = require('../providers/opensky-provider');
const { MetarProvider } = require('../providers/metar-provider');
const { AirportProvider } = require('../providers/airport-provider');
const { FlightStore } = require('../store/flight-store');
const { LogisticsSyncEngine } = require('../engine/logistics-sync-engine');
const { RitFlyAI } = require('../engine/rit-fly-ai');

const { config } = require('../config');

// Instâncias dos Componentes com Gateway Canônico
const flightStore = new FlightStore();
const commercialAdsbProvider = new CommercialAdsbProvider();
const openSkyProvider = new OpenSkyProvider();
const flightGateway = new FlightProviderGateway({
    commercialProvider: commercialAdsbProvider,
    openSkyProvider
});
const metarProvider = new MetarProvider();
const airportProvider = new AirportProvider(metarProvider);
const logisticsSyncEngine = new LogisticsSyncEngine(flightStore, flightGateway);
const ritFlyAI = new RitFlyAI({
    openSkyProvider: flightGateway,
    airportProvider,
    metarProvider,
    flightStore
});

// Rotina em segundo plano de atualização e sincronização contínua (< 60s)
let lastBackgroundSync = Date.now();
const backgroundSyncTimer = setInterval(async () => {
    try {
        const flights = await flightGateway.getCurrentFlights();
        // Atualiza rastros das aeronaves
        flights.forEach(f => flightStore.updateFlightTrack(f));
        // Sincroniza viagens e recalcula atrasos
        await logisticsSyncEngine.syncActiveTrips(flights);
        lastBackgroundSync = Date.now();
    } catch (e) {
        // Silencioso para manter estabilidade do servidor
    }
}, 30000); // 30 segundos (atende critério < 60s)
if (backgroundSyncTimer && typeof backgroundSyncTimer.unref === 'function') {
    backgroundSyncTimer.unref();
}

/**
 * GET /api/rit-fly/status
 * Status operacional e saúde dos provedores externos
 */
router.get('/status', async (req, res) => {
    const health = await flightGateway.healthCheck();
    const meta = flightGateway.getProviderMetadata();
    res.json({
        ok: health.healthy,
        success: health.healthy,
        service: 'rit-fly',
        status: health.status,
        provider: flightGateway.providerStatus,
        activeProvider: flightGateway.getActiveProviderName(),
        providerMetadata: meta,
        rateLimit: flightGateway.getRateLimitStatus(),
        allowSyntheticData: config.ALLOW_SYNTHETIC_DATA,
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /api/rit-fly/diagnostics
 * Telemetria de conectividade e governança de dados
 */
router.get('/diagnostics', (req, res) => {
    res.json({
        ok: true,
        allowSyntheticData: config.ALLOW_SYNTHETIC_DATA,
        activeProvider: flightGateway.getActiveProviderName(),
        rateLimit: flightGateway.getRateLimitStatus(),
        providerMetadata: flightGateway.getProviderMetadata(),
        metar: {
            enabled: config.METAR.ENABLED,
            cacheEntries: metarProvider.cache.size
        },
        tripsActive: flightStore.getAllTrips().length,
        alertsActive: flightStore.getAlerts().length,
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /api/rit-fly/flights
 * Retorna todos os voos ativos no radar com suporte a filtros e envelope canônico (Fase 7)
 */
router.get('/flights', async (req, res) => {
    try {
        const { categoria, status, search, companhia } = req.query;
        const flights = await flightGateway.getCurrentFlights({}, { categoria, status, search, companhia });
        
        // Atualiza rastro em memória
        flights.forEach(f => flightStore.updateFlightTrack(f));

        const isProviderAvailable = flights.length > 0;
        const sourceName = flights.length > 0 ? (flights[0].data_source || flightGateway.getActiveProviderName()) : flightGateway.getActiveProviderName();
        const dataMode = flightGateway.getDataMode();

        const envelope = {
            ok: isProviderAvailable,
            success: isProviderAvailable,
            total: flights.length,
            providerStatus: flightGateway.providerStatus,
            providerMetadata: flightGateway.getProviderMetadata(),
            allowSyntheticData: config.ALLOW_SYNTHETIC_DATA,
            timestamp: new Date().toISOString(),
            meta: {
                source: sourceName,
                dataMode: isProviderAvailable ? dataMode : 'UNAVAILABLE',
                updatedAt: new Date().toISOString(),
                stale: dataMode === 'CACHED_PROVIDER',
                count: flights.length
            },
            data: flights
        };

        if (!isProviderAvailable) {
            envelope.error = {
                code: 'FLIGHT_PROVIDER_UNAVAILABLE',
                message: flightGateway.lastSyncError || 'Dados de aeronaves temporariamente indisponíveis no setor monitorado.'
            };
        }

        res.json(envelope);
    } catch (err) {
        res.status(500).json({
            ok: false,
            success: false,
            error: {
                code: 'FLIGHT_PROVIDER_ERROR',
                message: err.message
            },
            meta: {
                source: flightGateway.getActiveProviderName(),
                dataMode: 'UNAVAILABLE',
                updatedAt: new Date().toISOString(),
                stale: false,
                count: 0
            },
            data: []
        });
    }
});

/**
 * GET /api/rit-fly/flights/:identifier
 * Detalhes de um voo específico incluindo rastro (flight trail)
 */
router.get('/flights/:identifier', async (req, res) => {
    try {
        const identifier = (req.params.identifier || '').trim().toUpperCase();
        const flights = await flightGateway.getCurrentFlights();

        const flight = flights.find(f => 
            f.id === req.params.identifier ||
            (f.icao24 && f.icao24.toUpperCase() === identifier) ||
            (f.callsign && f.callsign.toUpperCase() === identifier) ||
            (f.numeroVoo && f.numeroVoo.replace(/\s+/g, '').toUpperCase() === identifier.replace(/\s+/g, '')) ||
            (f.prefixo && f.prefixo.replace(/[\s-]/g, '').toUpperCase() === identifier.replace(/[\s-]/g, ''))
        );

        if (!flight) {
            return res.status(404).json({ ok: false, message: 'Voo não localizado na malha ativa' });
        }

        const trackKey = flight.numeroVoo || flight.callsign || flight.id;
        const track = flightStore.getFlightTrack(trackKey);

        res.json({
            ok: true,
            data: {
                ...flight,
                track
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/rit-fly/airports
 * Visão consolidada dos 8 aeroportos corporativos estratégicos
 */
router.get('/airports', async (req, res) => {
    try {
        const flights = await flightGateway.getCurrentFlights();
        const airports = await airportProvider.getAllAirportsOverview(flights);

        res.json({
            ok: true,
            total: airports.length,
            data: airports
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/rit-fly/airports/:code
 * Detalhes e quadro de chegadas/partidas de um aeroporto específico
 */
router.get('/airports/:code', async (req, res) => {
    try {
        const flights = await flightGateway.getCurrentFlights();
        const details = await airportProvider.getAirportDetails(req.params.code, flights);

        if (!details) {
            return res.status(404).json({ ok: false, message: 'Aeroporto não encontrado' });
        }

        res.json({
            ok: true,
            data: details
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/rit-fly/kpis
 * KPIs do Painel Executivo (Voos, Atrasos, Tempo Espera, Economia, SLA)
 */
router.get('/kpis', async (req, res) => {
    try {
        const flights = await flightGateway.getCurrentFlights();
        const kpis = flightStore.calculateKpis(flights);

        res.json({
            ok: true,
            data: kpis
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/rit-fly/alerts
 * Feed consolidado de ocorrências e alertas operacionais da inteligência aérea
 */
router.get('/alerts', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 30;
        let flights = [];
        let airports = [];
        try {
            flights = await flightGateway.getCurrentFlights();
            airports = await airportProvider.getAllAirportsOverview(flights);
        } catch (innerErr) {
            // Fallback seguro para alertas em memória caso provedor oscile
        }
        const { occurrences, summary } = flightStore.buildConsolidatedOccurrences(flights, airports, limit);
        res.json({
            ok: true,
            total: occurrences.length,
            summary,
            data: occurrences
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/rit-fly/trips
 * Viagens integradas corporativas (Passageiro + Voo + Rota Terrestre)
 */
router.get('/trips', (req, res) => {
    try {
        const trips = flightStore.getAllTrips();
        res.json({
            ok: true,
            total: trips.length,
            data: trips
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/rit-fly/trips
 * Cadastra e vincula uma viagem corporativa com recálculo automático
 */
router.post('/trips', async (req, res) => {
    try {
        const { passageiro, voo, origem, destino, tipoDeslocamento } = req.body;
        const trip = await logisticsSyncEngine.linkTrip({ passageiro, voo, origem, destino, tipoDeslocamento });

        res.status(201).json({
            ok: true,
            message: 'Viagem integrada vinculada com sucesso ao RIT FLY',
            data: trip
        });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

/**
 * DELETE /api/rit-fly/trips/:id
 * Remove o monitoramento de uma viagem
 */
router.delete('/trips/:id', (req, res) => {
    try {
        const deleted = flightStore.deleteTrip(req.params.id);
        if (!deleted) {
            return res.status(404).json({ ok: false, message: 'Viagem não encontrada' });
        }
        res.json({ ok: true, message: 'Viagem removida com sucesso' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/rit-fly/ai/query
 * Consulta em linguagem natural ao Agente RIT FLY AI
 */
router.post('/ai/query', async (req, res) => {
    try {
        const { query } = req.body;
        const response = await ritFlyAI.answer(query);

        res.json({
            ok: true,
            data: response
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/rit-fly/sync
 * Força atualização imediata
 */
router.post('/sync', async (req, res) => {
    try {
        const flights = await flightGateway.getCurrentFlights();
        flights.forEach(f => flightStore.updateFlightTrack(f));
        await logisticsSyncEngine.syncActiveTrips(flights);
        
        res.json({
            ok: true,
            message: 'Sincronização imediata concluída com sucesso',
            totalVoos: flights.length
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
module.exports.flightStore = flightStore;
module.exports.flightGateway = flightGateway;
module.exports.commercialAdsbProvider = commercialAdsbProvider;
module.exports.openSkyProvider = openSkyProvider;
module.exports.metarProvider = metarProvider;
module.exports.airportProvider = airportProvider;
module.exports.logisticsSyncEngine = logisticsSyncEngine;
module.exports.ritFlyAI = ritFlyAI;

