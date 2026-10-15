/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Rotas e Endpoints RESTful Oficiais
 */

const express = require('express');
const router = express.Router();

const { OpenSkyProvider } = require('../providers/opensky-provider');
const { MetarProvider } = require('../providers/metar-provider');
const { AirportProvider } = require('../providers/airport-provider');
const { FlightStore } = require('../store/flight-store');
const { LogisticsSyncEngine } = require('../engine/logistics-sync-engine');
const { RitFlyAI } = require('../engine/rit-fly-ai');

const { config } = require('../config');

// Instâncias dos Componentes
const flightStore = new FlightStore();
const openSkyProvider = new OpenSkyProvider();
const metarProvider = new MetarProvider();
const airportProvider = new AirportProvider(metarProvider);
const logisticsSyncEngine = new LogisticsSyncEngine(flightStore, openSkyProvider);
const ritFlyAI = new RitFlyAI({
    openSkyProvider,
    airportProvider,
    metarProvider,
    flightStore
});

// Rotina em segundo plano de atualização e sincronização contínua (< 60s)
let lastBackgroundSync = Date.now();
const backgroundSyncTimer = setInterval(async () => {
    try {
        const flights = await openSkyProvider.getFlights();
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
router.get('/status', (req, res) => {
    res.json({
        ok: true,
        success: true,
        service: 'rit-fly',
        status: 'ONLINE',
        provider: openSkyProvider.providerStatus,
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
        openSky: openSkyProvider.providerStatus,
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
        const flights = await openSkyProvider.getFlights({ categoria, status, search, companhia });
        
        // Atualiza rastro em memória
        flights.forEach(f => flightStore.updateFlightTrack(f));

        const isProviderAvailable = openSkyProvider.providerStatus.status === 'ONLINE' || flights.length > 0;
        const sourceName = flights.length > 0 ? (flights[0].data_source || 'OPENSKY_ADS-B') : 'OPENSKY_ADS-B';
        const dataMode = flights.length > 0 
            ? (flights[0].data_mode === 'SYNTHETIC' ? 'SANDBOX_PROVIDER' : 'LIVE_PROVIDER')
            : (openSkyProvider.providerStatus.status === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'UNAVAILABLE');

        const envelope = {
            ok: isProviderAvailable,
            success: isProviderAvailable,
            total: flights.length,
            providerStatus: openSkyProvider.providerStatus,
            allowSyntheticData: config.ALLOW_SYNTHETIC_DATA,
            timestamp: new Date().toISOString(),
            meta: {
                source: sourceName,
                dataMode: isProviderAvailable ? dataMode : 'UNAVAILABLE',
                updatedAt: openSkyProvider.providerStatus.lastAttempt || new Date().toISOString(),
                stale: false,
                count: flights.length
            },
            data: flights
        };

        if (!isProviderAvailable) {
            envelope.error = {
                code: 'FLIGHT_PROVIDER_UNAVAILABLE',
                message: openSkyProvider.providerStatus.message || 'Dados de aeronaves temporariamente indisponíveis (Provedor ADS-B em rate-limit ou indisponível).'
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
                source: 'OPENSKY_ADS-B',
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
        const flights = await openSkyProvider.getFlights();

        const flight = flights.find(f => 
            f.id === req.params.identifier ||
            f.icao24.toUpperCase() === identifier ||
            f.callsign.toUpperCase() === identifier ||
            f.numeroVoo.replace(/\s+/g, '').toUpperCase() === identifier.replace(/\s+/g, '') ||
            f.prefixo.replace(/[\s-]/g, '').toUpperCase() === identifier.replace(/[\s-]/g, '')
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
        const flights = await openSkyProvider.getFlights();
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
        const flights = await openSkyProvider.getFlights();
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
        const flights = await openSkyProvider.getFlights();
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
 * Feed de alertas operacionais da inteligência aérea
 */
router.get('/alerts', (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 20;
        const alerts = flightStore.getAlerts(limit);
        res.json({
            ok: true,
            total: alerts.length,
            data: alerts
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
        const flights = await openSkyProvider.getFlights();
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
module.exports.openSkyProvider = openSkyProvider;
module.exports.metarProvider = metarProvider;
module.exports.airportProvider = airportProvider;
module.exports.logisticsSyncEngine = logisticsSyncEngine;
module.exports.ritFlyAI = ritFlyAI;
