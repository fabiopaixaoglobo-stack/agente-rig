/**
 * Agente RIT - Módulo RIT ALERTA
 * Rotas e Endpoints REST Oficiais e de Diagnóstico Interno (/api/traffic-alert/*).
 * Conexão com Repository Relacional e Fallback Transparente em Memória (v2.2).
 */

const express = require('express');
const { memoryStore } = require('../store/memory-store');
const { DeduplicationEngine } = require('../engine/deduplication-engine');
const { CorRioProvider } = require('../providers/cor-rio-provider');
const { calculateHaversineDistance } = require('../db/geo-fallback');
const { caravanStore } = require('../store/caravan-store');
const { config } = require('../config');

function createTrafficAlertRouter({ repository = null, store = memoryStore } = {}) {
    const router = express.Router();
    const deduplicationEngine = new DeduplicationEngine(store);
    const corRioProvider = new CorRioProvider();

    // =========================================================================
    // ENDPOINTS REST OFICIAIS DO SUBSISTEMA (/api/traffic-alert/*)
    // =========================================================================

    /**
     * GET /health
     * Retorna telemetria, integridade dos provedores e status de persistência.
     */
    router.get('/health', async (req, res) => {
        try {
            let dbHealth = [];
            if (repository) {
                dbHealth = await repository.getAllProviderHealth().catch(() => []);
            }
            const memoryHealth = store.getAllProviderHealth();
            const providers = dbHealth.length > 0 ? dbHealth : memoryHealth;

            res.json({
                ok: true,
                timestamp: new Date().toISOString(),
                persistenceMode: repository ? 'POSTGRESQL_RELATIONAL' : 'MEMORY_STORE',
                providers,
                activeIncidentsCount: store.getAllIncidents().length
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /incidents
     * Lista incidentes ativos consolidados (suporta ?domain= & ?corridor=).
     */
    router.get('/incidents', async (req, res) => {
        try {
            const domain = req.query.domain || null;
            const corridor = req.query.corridor || null;
            const isSynthetic = String(req.query.is_synthetic).toLowerCase() === 'true';

            // Produção bloqueia rigorosamente fixtures mesmo se requisitadas
            const safeIsSynthetic = config.isProduction ? false : isSynthetic;

            let incidents = [];
            if (repository) {
                incidents = await repository.getActiveIncidents({ domain, corridor, isSynthetic: safeIsSynthetic });
            } else {
                incidents = store.getActiveIncidents({ domain, corridor, isSynthetic: safeIsSynthetic });
            }

            res.json({
                ok: true,
                count: incidents.length,
                data: incidents
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /incidents/:id
     * Consulta detalhes consolidados de um incidente por ID ou Canonical ID.
     */
    router.get('/incidents/:id', async (req, res) => {
        try {
            const { id } = req.params;
            let incident = null;

            if (repository) {
                incident = await repository.getIncidentById(id) || await repository.getIncidentByCanonicalId(id);
            } else {
                incident = store.getIncidentById(id);
            }

            if (!incident) {
                return res.status(404).json({ ok: false, error: 'Incidente não encontrado.' });
            }

            res.json({ ok: true, data: incident });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /incidents/:id/sources
     * Consulta as fontes independentes que fundamentam um incidente.
     */
    router.get('/incidents/:id/sources', async (req, res) => {
        try {
            const { id } = req.params;
            let sources = [];

            if (repository) {
                sources = await repository.getSourcesByIncidentId(id);
            } else {
                sources = store.getSourcesByIncidentId(id);
            }

            res.json({ ok: true, count: sources.length, data: sources });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /incidents/:id/history
     * Consulta a trilha de auditoria e transições de estado do incidente.
     */
    router.get('/incidents/:id/history', async (req, res) => {
        try {
            const { id } = req.params;
            let history = [];

            if (repository) {
                history = await repository.getHistoryByIncidentId(id);
            } else {
                history = store.getHistoryByIncidentId(id);
            }

            res.json({ ok: true, count: history.length, data: history });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /nearby
     * Consulta geoespacial de incidentes em torno de uma coordenada (lat, lng, radius).
     * Opera com Bounding Box e Haversine sem PostGIS.
     */
    router.get('/nearby', async (req, res) => {
        try {
            const lat = parseFloat(req.query.lat);
            const lng = parseFloat(req.query.lng);
            const radiusMeters = parseInt(req.query.radius || '2000', 10);
            const domain = req.query.domain || null;

            if (isNaN(lat) || isNaN(lng)) {
                return res.status(400).json({ ok: false, error: 'Parâmetros lat e lng são obrigatórios e numéricos.' });
            }

            let results = [];
            if (repository) {
                results = await repository.findNearbyIncidents({
                    lat,
                    lng,
                    radiusMeters,
                    domain,
                    isSynthetic: false
                });
            } else {
                // Fallback em memória com cálculo Haversine
                const all = store.getActiveIncidents({ domain, isSynthetic: false });
                results = all.map(inc => {
                    const dist = calculateHaversineDistance(lat, lng, inc.lat, inc.lng);
                    return { ...inc, distance_meters: Math.round(dist) };
                }).filter(inc => inc.distance_meters <= radiusMeters)
                  .sort((a, b) => a.distance_meters - b.distance_meters);
            }

            res.json({
                ok: true,
                center: { lat, lng },
                radiusMeters,
                count: results.length,
                data: results
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * POST /sync-cor
     * Dispara sincronização controlada com o COR-Rio com proteção de intervalo mínimo (60s).
     */
    router.post('/sync-cor', async (req, res) => {
        try {
            const force = String(req.query.force).toLowerCase() === 'true';
            const rawData = await corRioProvider.fetchData({ force });
            const normalized = corRioProvider.normalize(rawData);
            
            let result = null;
            if (normalized.status !== 'UNSUPPORTED') {
                result = deduplicationEngine.processIncomingIncident(normalized);
                
                // Se repositório ativo, persiste na base relacional
                if (repository) {
                    await repository.upsertIncident(result.incident);
                    if (normalized.sources && normalized.sources[0]) {
                        await repository.addIncidentSource(result.incident.id, normalized.sources[0]).catch(() => {});
                    }
                }
            }

            // Atualiza telemetria de saúde
            const healthRecord = corRioProvider.getHealthStatus();
            store.updateProviderHealth('COR_RIO', healthRecord);
            if (repository) {
                await repository.upsertProviderHealth('COR_RIO', healthRecord).catch(() => {});
            }

            res.json({
                ok: true,
                action: result ? result.action : 'STATUS_UNSUPPORTED',
                divergenceDetected: result ? Boolean(result.divergenceDetected) : false,
                isCache: Boolean(rawData.isCache),
                note: rawData.note || null,
                data: result ? result.incident : normalized
            });
        } catch (err) {
            const errorHealth = { status: 'UNAVAILABLE', errorMessage: err.message };
            store.updateProviderHealth('COR_RIO', errorHealth);
            res.status(503).json({
                ok: false,
                error: 'Falha ao sincronizar fonte pública do COR-Rio.',
                details: err.message
            });
        }
    });

    // =========================================================================
    // ENDPOINTS DE DIAGNÓSTICO INTERNO (Retrocompatibilidade)
    // =========================================================================
    router.get('/internal/health', (req, res) => {
        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            providers: store.getAllProviderHealth(),
            inMemoryCount: store.getAllIncidents().length
        });
    });

    router.get('/internal/incidents', (req, res) => {
        const domain = req.query.domain || null;
        const corridor = req.query.corridor || null;
        const incidents = store.getActiveIncidents({ domain, corridor });
        res.json({ ok: true, count: incidents.length, data: incidents });
    });

    router.get('/internal/incidents/:id', (req, res) => {
        const incident = store.getIncidentById(req.params.id);
        if (!incident) return res.status(404).json({ ok: false, error: 'Incidente não encontrado em memória.' });
        res.json({ ok: true, data: incident });
    });

    router.get('/internal/incidents/:id/sources', (req, res) => {
        res.json({ ok: true, count: store.getSourcesByIncidentId(req.params.id).length, data: store.getSourcesByIncidentId(req.params.id) });
    });

    router.get('/internal/incidents/:id/history', (req, res) => {
        res.json({ ok: true, count: store.getHistoryByIncidentId(req.params.id).length, data: store.getHistoryByIncidentId(req.params.id) });
    });

    router.post('/internal/sync-cor', (req, res) => router.handle({ ...req, url: '/sync-cor' }, res));

    router.post('/internal/ingest', (req, res) => {
        try {
            const incoming = req.body;
            if (!incoming || !incoming.title || !incoming.lat || !incoming.lng) {
                return res.status(400).json({ ok: false, error: 'Payload de incidente incompleto.' });
            }
            const result = deduplicationEngine.processIncomingIncident(incoming);
            res.json({
                ok: true,
                action: result.action,
                divergenceDetected: result.divergenceDetected || false,
                incident: result.incident
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.post('/internal/reset-memory', (req, res) => {
        if (config.isProduction) {
            return res.status(403).json({ ok: false, error: 'Operação não permitida em produção.' });
        }
        store.clear();
        res.json({ ok: true, message: 'MemoryStore limpo com sucesso.' });
    });

    // =========================================================================
    // ENDPOINTS DO MÓDULO ACOMPANHAMENTO DE CARAVANAS (CHECKPOINT 5.2)
    // =========================================================================

    /**
     * Middleware de checagem da Feature Flag CARAVAN_MONITORING_ENABLED
     */
    const checkCaravanEnabled = (req, res, next) => {
        if (!config.caravanMonitoring || !config.caravanMonitoring.enabled) {
            return res.status(503).json({
                ok: false,
                error: 'Módulo de Acompanhamento de Caravanas temporariamente desabilitado.',
                featureFlag: 'CARAVAN_MONITORING_ENABLED=false'
            });
        }
        next();
    };

    /**
     * GET /caravans
     * Lista todas as caravanas projetadas contra os incidentes públicos ativos.
     */
    router.get('/caravans', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const { programName, projectedStatus, search, hasIncidents } = req.query;

            const filters = {
                programName: programName || null,
                projectedStatus: projectedStatus || null,
                search: search || null,
                hasIncidents: hasIncidents !== undefined ? hasIncidents === 'true' : undefined
            };

            const caravans = caravanStore.getAll(publicIncidents, filters);
            const kpis = caravanStore.getKpis(publicIncidents);

            res.json({
                ok: true,
                count: caravans.length,
                kpis,
                data: caravans,
                disclaimer: 'PROJEÇÃO OPERACIONAL BASEADA NO ENDEREÇO E HORÁRIO PLANEJADOS. NÃO REPRESENTA A LOCALIZAÇÃO REAL DO ÔNIBUS.',
                isGpsBased: false,
                isSynthetic: true
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /caravans/kpis
     * Retorna apenas os 6 KPIs do módulo de caravanas.
     */
    router.get('/caravans/kpis', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const kpis = caravanStore.getKpis(publicIncidents);
            res.json({ ok: true, data: kpis });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /caravans/:id
     * Retorna a projeção detalhada da caravana.
     */
    router.get('/caravans/:id', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const caravan = caravanStore.getById(req.params.id, publicIncidents);
            if (!caravan) {
                return res.status(404).json({ ok: false, error: 'Caravana não encontrada no ambiente de homologação.' });
            }
            res.json({ ok: true, data: caravan });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * POST /caravans/:id/recalculate
     * Força recálculo da projeção da caravana contra a malha viária pública atual.
     */
    router.post('/caravans/:id/recalculate', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const updated = caravanStore.recalculate(req.params.id, publicIncidents);
            if (!updated) {
                return res.status(404).json({ ok: false, error: 'Caravana não encontrada para recálculo.' });
            }
            res.json({
                ok: true,
                message: 'Projeção recalculada com sucesso.',
                data: updated
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * POST /caravans
     * Cadastra uma nova caravana no ambiente de homologação.
     */
    router.post('/caravans', checkCaravanEnabled, (req, res) => {
        try {
            const {
                caravanName,
                programName,
                companyName,
                originAddress,
                originCoords,
                plannedDepartureAt,
                operationalWindowEnd,
                operationalNotes
            } = req.body || {};

            if (!caravanName || !programName || !originAddress || !plannedDepartureAt) {
                return res.status(400).json({
                    ok: false,
                    error: 'Campos obrigatórios ausentes: caravanName, programName, originAddress e plannedDepartureAt são requeridos.'
                });
            }

            const publicIncidents = store.getAllIncidents();
            const created = caravanStore.addCaravan({
                caravanName,
                programName,
                companyName: companyName || 'Log Rio',
                originAddress,
                originCoords: originCoords || [-22.8000, -43.3500],
                plannedDepartureAt,
                operationalWindowEnd,
                operationalNotes
            }, publicIncidents);

            res.status(201).json({
                ok: true,
                message: 'Caravana cadastrada e rota calculada com sucesso.',
                data: created
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * PUT /caravans/:id
     * Atualiza dados de uma caravana existente.
     */
    router.put('/caravans/:id', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const updated = caravanStore.updateCaravan(req.params.id, req.body || {}, publicIncidents);
            if (!updated) {
                return res.status(404).json({ ok: false, error: 'Caravana não encontrada para atualização.' });
            }
            res.json({
                ok: true,
                message: 'Caravana atualizada com sucesso.',
                data: updated
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * DELETE /caravans/:id
     * Exclui uma caravana da grade operacional.
     */
    router.delete('/caravans/:id', checkCaravanEnabled, (req, res) => {
        try {
            const deleted = caravanStore.deleteCaravan(req.params.id);
            if (!deleted) {
                return res.status(404).json({ ok: false, error: 'Caravana não encontrada para exclusão.' });
            }
            res.json({
                ok: true,
                message: 'Caravana excluída com sucesso.',
                id: req.params.id
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * POST /caravans/recalculate-all
     * Força recálculo de todas as caravanas cadastradas contra as ocorrências públicas ativas.
     */
    router.post('/caravans/recalculate-all', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const all = caravanStore.recalculateAll(publicIncidents);
            const kpis = caravanStore.getKpis(publicIncidents);
            res.json({
                ok: true,
                message: 'Todas as rotas de caravanas foram recalculadas.',
                count: all.length,
                kpis,
                data: all,
                calculatedAt: new Date().toISOString()
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /geocode
     * Endpoint auxiliar de geocodificação para bairros e endereços sintéticos do RJ.
     */
    router.get('/geocode', (req, res) => {
        try {
            const q = String(req.query.q || '').trim().toLowerCase();
            const GEO_LOOKUP = {
                'são joão de meriti': [-22.8038, -43.3725],
                'sao joao de meriti': [-22.8038, -43.3725],
                'nova iguaçu': [-22.7560, -43.4600],
                'nova iguacu': [-22.7560, -43.4600],
                'niterói': [-22.8900, -43.1200],
                'niteroi': [-22.8900, -43.1200],
                'campo grande': [-22.9030, -43.5590],
                'pavuna': [-22.8090, -43.3640],
                'bangu': [-22.8850, -43.5000],
                'duque de caxias': [-22.7856, -43.3117],
                'madureira': [-22.8717, -43.3397],
                'tijuca': [-22.9250, -43.2350],
                'méier': [-22.8980, -43.2800],
                'meier': [-22.8980, -43.2800],
                'jacarepaguá': [-22.9450, -43.3600],
                'jacarepagua': [-22.9450, -43.3600],
                'barra da tijuca': [-22.9990, -43.3600]
            };

            for (const [key, coords] of Object.entries(GEO_LOOKUP)) {
                if (q.includes(key)) {
                    return res.json({ ok: true, query: q, coords, matchedKey: key });
                }
            }

            res.json({ ok: true, query: q, coords: [-22.8200, -43.3800], matchedKey: 'fallback_rio' });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    return router;
}

// Exporta roteador padrão em memória e fábrica configurável
const defaultRouter = createTrafficAlertRouter({ store: memoryStore });

module.exports = defaultRouter;
module.exports.createTrafficAlertRouter = createTrafficAlertRouter;
