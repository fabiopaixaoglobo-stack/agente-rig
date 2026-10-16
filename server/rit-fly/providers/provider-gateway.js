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
        
        // Estado do provedor ativo: 'LIVE_PROVIDER' | 'CACHED_PROVIDER' | 'UNAVAILABLE'
        this.currentDataMode = 'UNAVAILABLE';
        this.activeProviderName = this.commercialAdsbProvider.getProviderMetadata().id;
        this.lastSyncError = null;
    }

    get providerStatus() {
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
                healthy: commHealth.healthy,
                activeProvider: this.commercialAdsbProvider.getProviderMetadata().id,
                status: commHealth.status,
                latencyMs: commHealth.latencyMs,
                message: `Provedor primário: ${commHealth.message} | Secundário: ${openSkyStatus.status}`
            };
        }
        return commHealth;
    }

    /**
     * Consulta os voos ativos com priorização do feed comercial real
     */
    async getCurrentFlights(bounds = {}, filters = {}) {
        const now = Date.now();

        // 1. Verificar Cache Válido
        if (this.cache && (now - this.lastFetchTime < this.cacheTtlMs)) {
            this.currentDataMode = 'CACHED_PROVIDER';
            return this.applyFilters(this.cache, filters);
        }

        // 2. Consulta Provedor Comercial Primário (ADS-B Real Brasil)
        try {
            const flights = await this.commercialAdsbProvider.getCurrentFlights(bounds, filters);
            if (flights && flights.length > 0) {
                this.cache = flights;
                this.lastFetchTime = now;
                this.currentDataMode = 'LIVE_PROVIDER';
                this.activeProviderName = this.commercialAdsbProvider.getProviderMetadata().id;
                this.lastSyncError = null;
                return flights;
            }
        } catch (err) {
            this.lastSyncError = err.message;
        }

        // 3. Fallback Secundário: OpenSky (se configurado, injetado e permitido)
        if (this.openSkyProvider && config.OPENSKY && config.OPENSKY.ENABLED) {
            try {
                const openSkyFlights = await this.openSkyProvider.getFlights(filters);
                if (openSkyFlights && openSkyFlights.length > 0) {
                    this.cache = openSkyFlights;
                    this.lastFetchTime = now;
                    this.currentDataMode = 'LIVE_PROVIDER';
                    this.activeProviderName = 'OPENSKY_NETWORK';
                    this.lastSyncError = null;
                    return openSkyFlights;
                }
            } catch (err) {
                // Silencioso
            }
        }

        // 4. Se falhou mas temos cache anterior ainda recente (< 60s), serve cache em modo degradado
        if (this.cache && (now - this.lastFetchTime < 60000)) {
            this.currentDataMode = 'CACHED_PROVIDER';
            return this.applyFilters(this.cache, filters);
        }

        // 5. Provedores indisponíveis
        this.currentDataMode = 'UNAVAILABLE';
        this.lastSyncError = 'Provedores aéreos temporariamente indisponíveis ou sem aeronaves observadas no setor';
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
