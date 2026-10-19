/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * FlightProviderGateway - Orquestrador Desacoplado de Provedores de Posição Aérea
 * 
 * Implementa a interface FlightPositionProvider, gerenciando provedores comerciais,
 * circuit-breaking, cache em memória e proveniência estrita (sem dados sintéticos em produção).
 */

const { FlightPositionProvider } = require('./flight-position-provider');
const { CommercialAdsbProvider } = require('./commercial-adsb-provider');
const { OpenSkyProvider } = require('./opensky-provider');
const { config } = require('../config');

class FlightProviderGateway extends FlightPositionProvider {
    constructor(options = {}) {
        super();
        this.commercialAdsbProvider = options.commercialProvider || new CommercialAdsbProvider();
        this.openSkyProvider = options.openSkyProvider || null;

        this.cache = null;
        this.lastFetchTime = 0;
        this.cacheTtlMs = options.cacheTtlMs || config.CACHE_TTL_MS || 25000;
        this.inflightPromise = null;
        
        // Estado do provedor ativo: 'LIVE_PROVIDER' | 'CACHED_PROVIDER' | 'UNAVAILABLE'
        this.currentDataMode = 'UNAVAILABLE';
        this.activeProviderName = this.commercialAdsbProvider.getProviderMetadata().id;
        this.lastSyncError = null;
    }

    get providerStatus() {
        if (this.commercialAdsbProvider && this.commercialAdsbProvider.providerStatus && this.commercialAdsbProvider.providerStatus.status === 'ONLINE') {
            return this.commercialAdsbProvider.providerStatus;
        }
        if (this.openSkyProvider && this.openSkyProvider.providerStatus && this.openSkyProvider.providerStatus.status === 'ONLINE') {
            return this.openSkyProvider.providerStatus;
        }
        return this.commercialAdsbProvider.providerStatus;
    }

    async getFlights(filters = {}) {
        return this.getCurrentFlights({}, filters);
    }

    getProviderMetadata() {
        if (this.currentDataMode === 'UNAVAILABLE' && this.lastSyncError) {
            return {
                id: this.activeProviderName,
                name: 'Gateway Multi-Provider RIT FLY (Indisponível)',
                license: 'Comercial B2B',
                status: 'UNAVAILABLE',
                error: this.lastSyncError
            };
        }
        return this.commercialAdsbProvider.getProviderMetadata();
    }

    getRateLimitStatus() {
        return this.commercialAdsbProvider.getRateLimitStatus();
    }

    async healthCheck() {
        const commHealth = await this.commercialAdsbProvider.healthCheck();
        if (commHealth.healthy) {
            return {
                healthy: true,
                activeProvider: this.commercialAdsbProvider.getProviderMetadata().id,
                status: 'ONLINE',
                latencyMs: commHealth.latencyMs,
                message: commHealth.message
            };
        }

        // Se o comercial falhar, verifica OpenSky caso injetado
        if (this.openSkyProvider) {
            const openSkyStatus = this.openSkyProvider.providerStatus;
            return {
                healthy: commHealth.healthy || openSkyStatus.status === 'ONLINE',
                activeProvider: openSkyStatus.status === 'ONLINE' ? 'OPENSKY_NETWORK' : this.commercialAdsbProvider.getProviderMetadata().id,
                status: openSkyStatus.status === 'ONLINE' ? 'ONLINE' : commHealth.status,
                latencyMs: commHealth.latencyMs,
                message: `Provedor primário: ${commHealth.message} | Secundário: ${openSkyStatus.status}`
            };
        }
        return commHealth;
    }

    /**
     * Consulta os voos ativos com priorização do feed comercial real e deduplicação singleflight
     */
    async getCurrentFlights(bounds = {}, filters = {}) {
        const now = Date.now();

        // 1. Verificar Cache Válido (sempre armazena lista integral não filtrada)
        if (this.cache && (now - this.lastFetchTime < this.cacheTtlMs)) {
            this.currentDataMode = 'CACHED_PROVIDER';
            return this.applyFilters(this.cache, filters);
        }

        if (this.inflightPromise) {
            const shared = await this.inflightPromise;
            return this.applyFilters(shared, filters);
        }

        this.inflightPromise = this._acquireUnfilteredFlights(bounds, now);
        try {
            const flights = await this.inflightPromise;
            return this.applyFilters(flights, filters);
        } finally {
            this.inflightPromise = null;
        }
    }

    async _acquireUnfilteredFlights(bounds = {}, now = Date.now()) {
        let commFlights = [];
        let openSkyFlights = [];
        let commError = null;

        const hasOpenSky = Boolean(this.openSkyProvider && config.OPENSKY && config.OPENSKY.ENABLED);

        if (hasOpenSky) {
            const [commRes, osRes] = await Promise.allSettled([
                this.commercialAdsbProvider.getCurrentFlights(bounds, {}),
                this.openSkyProvider.getFlights({})
            ]);
            if (commRes.status === 'fulfilled' && Array.isArray(commRes.value)) {
                commFlights = commRes.value;
            } else if (commRes.status === 'rejected') {
                commError = commRes.reason?.message || 'Erro no provedor comercial';
            }
            if (osRes.status === 'fulfilled' && Array.isArray(osRes.value)) {
                openSkyFlights = osRes.value;
            }
        } else {
            try {
                commFlights = await this.commercialAdsbProvider.getCurrentFlights(bounds, {});
            } catch (err) {
                commError = err.message;
            }
        }

        if (commFlights.length > 0 || openSkyFlights.length > 0) {
            const mergedMap = new Map();
            for (const cf of commFlights) {
                const key = (cf.icao24 || cf.id || '').toLowerCase();
                if (key) mergedMap.set(key, cf);
            }
            for (const oflight of openSkyFlights) {
                const key = (oflight.icao24 || oflight.id || '').toLowerCase();
                if (key && !mergedMap.has(key)) {
                    mergedMap.set(key, oflight);
                }
            }

            const merged = Array.from(mergedMap.values());
            this.cache = merged;
            this.lastFetchTime = Date.now();
            this.currentDataMode = 'LIVE_PROVIDER';
            this.activeProviderName = commFlights.length > 0
                ? this.commercialAdsbProvider.getProviderMetadata().id
                : 'OPENSKY_NETWORK';
            this.lastSyncError = null;
            return merged;
        }

        if (commError) {
            this.lastSyncError = commError;
        }

        // Fallback para cache em modo degradado (até 15 min) para garantir continuidade contra HTTP 429 transitório
        if (this.cache && this.cache.length > 0 && (now - this.lastFetchTime < 900000)) {
            this.currentDataMode = 'CACHED_PROVIDER';
            return this.cache;
        }

        // Provedores indisponíveis
        this.currentDataMode = 'UNAVAILABLE';
        this.lastSyncError = commError || 'Provedores aéreos temporariamente indisponíveis ou sem aeronaves observadas no setor';
        return [];
    }

    async getFlightById(id) {
        if (!id) return null;
        const flights = await this.getCurrentFlights();
        const norm = id.trim().toUpperCase();
        return flights.find(f => 
            (f.id && f.id.toUpperCase() === norm) ||
            (f.icao24 && f.icao24.toUpperCase() === norm) ||
            (f.callsign && f.callsign.toUpperCase() === norm) ||
            (f.numeroVoo && f.numeroVoo.toUpperCase() === norm) ||
            (f.prefixo && f.prefixo.toUpperCase() === norm)
        ) || null;
    }

    getDataMode() {
        return this.currentDataMode;
    }

    getActiveProviderName() {
        return this.activeProviderName;
    }

    applyFilters(flights, filters = {}) {
        if (this.commercialAdsbProvider && typeof this.commercialAdsbProvider.applyFilters === 'function') {
            return this.commercialAdsbProvider.applyFilters(flights, filters);
        }
        return super.applyFilters(flights, filters);
    }
}

module.exports = {
    FlightProviderGateway
};
