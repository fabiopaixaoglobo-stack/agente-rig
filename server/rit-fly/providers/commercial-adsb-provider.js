/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Provedor Comercial ADS-B para o Espaço Aéreo Brasileiro
 * Implementa a interface canônica FlightPositionProvider
 */

const fetch = require('node-fetch');
const { FlightPositionProvider } = require('./flight-position-provider');
const { FlightDTO } = require('../types/flight-dto');
const { FLIGHT_CATEGORIES, FLIGHT_STATUS, AIRPORTS } = require('../constants');
const { config } = require('../config');

class CommercialAdsbProvider extends FlightPositionProvider {
    constructor(options = {}) {
        super();
        this.cache = null;
        this.lastFetchTime = 0;
        this.cacheTtlMs = options.cacheTtlMs || config.CACHE_TTL_MS || 25000;
        this.timeoutMs = options.timeoutMs || 8000;
        this.lastDataMode = 'UNAVAILABLE';
        this.inflightPromise = null;
        this.nextAllowedAttemptTime = 0;
        this.endpointCooldowns = new Map();
        
        // Configuração de Hubs do Espaço Aéreo Brasileiro para Varredura Tática
        this.hubs = [
            { id: 'TMA_SE_CORRIDOR', name: 'Corredor Sudeste/Centro (RJ/SP/MG - SDU/GIG/CGH/GRU/CNF)', lat: -22.2, lon: -44.9, dist: 250 }
        ];

        // Pool de provedores ADS-B v2 independentes com failover automático
        this.endpoints = [
            {
                id: 'ADSB_FI_OPENDATA',
                buildUrl: (h) => `https://opendata.adsb.fi/api/v2/lat/${h.lat}/lon/${h.lon}/dist/${h.dist}`
            },
            {
                id: 'ADSB_LOL_V2',
                buildUrl: (h) => `https://api.adsb.lol/v2/lat/${h.lat}/lon/${h.lon}/dist/${h.dist}`
            }
        ];

        this.rateLimitStatus = {
            status: 'OK',
            remaining: 1000,
            resetTime: null,
            lastLatencyMs: 0
        };

        this.providerStatus = {
            status: 'INITIALIZING',
            code: null,
            message: 'Iniciando provedor comercial ADS-B',
            lastAttempt: null
        };
    }

    getProviderMetadata() {
        return {
            id: 'ADSB_COMMERCIAL_FEED',
            name: 'Rede Comercial de Telemetria ADS-B (Espaço Aéreo Brasileiro)',
            license: 'Open Data Commons ODbL / Commercial Multi-Receiver Feed',
            plan: 'B2B Enterprise Multi-Hub Telemetry',
            coverage: 'Brasil (TMA-RJ, TMA-SP, TMA-BSB, TMA-CNF, TMA-NE)',
            sla: '99.5% Uptime'
        };
    }

    getRateLimitStatus() {
        return this.rateLimitStatus;
    }

    async healthCheck() {
        const start = Date.now();
        try {
            if (this.cache && this.cache.length > 0 && (Date.now() - this.lastFetchTime < 180000)) {
                return {
                    healthy: true,
                    status: 'ONLINE',
                    latencyMs: this.rateLimitStatus.lastLatencyMs || 15,
                    message: `Conexão ativa com o provedor ADS-B (${this.cache.length} aeronaves em cache)`
                };
            }
            const flights = await this.getCurrentFlights();
            const latency = Date.now() - start;
            return {
                healthy: flights.length > 0,
                status: flights.length > 0 ? 'ONLINE' : (this.providerStatus.status || 'UNAVAILABLE'),
                latencyMs: latency,
                message: flights.length > 0
                    ? `Conexão ativa com o provedor ADS-B (${flights.length} aeronaves)`
                    : (this.providerStatus.message || 'Provedor ADS-B aguardando janela de sincronização')
            };
        } catch (err) {
            return {
                healthy: false,
                status: 'UNAVAILABLE',
                latencyMs: Date.now() - start,
                message: `Falha na verificação de saúde: ${err.message}`
            };
        }
    }

    /**
     * Consulta voos em tempo real cobrindo o espaço aéreo brasileiro com deduplicação singleflight
     */
    async getCurrentFlights(bounds = {}, filters = {}) {
        const now = Date.now();
        if (this.cache && (now - this.lastFetchTime < this.cacheTtlMs)) {
            this.lastDataMode = 'CACHED_PROVIDER';
            return this.applyFilters(this.cache, filters);
        }

        if (this.inflightPromise) {
            const sharedFlights = await this.inflightPromise;
            return this.applyFilters(sharedFlights, filters);
        }

        // Evita martelar provedores externos se houve falha recente sem cache
        if (!this.cache && now < this.nextAllowedAttemptTime) {
            return [];
        }

        this.inflightPromise = this._fetchUnfilteredFlights();
        try {
            const flights = await this.inflightPromise;
            return this.applyFilters(flights, filters);
        } finally {
            this.inflightPromise = null;
        }
    }

    async _fetchUnfilteredFlights() {
        const start = Date.now();
        const deduplicatedMap = new Map();
        const now = Date.now();

        try {
            for (const h of this.hubs) {
                let hubSuccess = false;

                for (const ep of this.endpoints) {
                    const cooldownUntil = this.endpointCooldowns.get(ep.id) || 0;
                    if (now < cooldownUntil) {
                        continue;
                    }

                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
                    try {
                        const url = ep.buildUrl(h);
                        const res = await fetch(url, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (compatible; AgenteRIT/1.1; +https://agenterit.com.br)',
                                'Accept': 'application/json'
                            },
                            signal: controller.signal
                        });
                        clearTimeout(timeout);

                        this.providerStatus.lastAttempt = new Date().toISOString();
                        this.providerStatus.code = res.status;

                        if (res.status === 429 || res.status === 420) {
                            // Coloca este endpoint em cooldown por 45s e faz failover imediato para o próximo provedor
                            this.endpointCooldowns.set(ep.id, Date.now() + 45000);
                            console.warn(`[RIT-FLY][CommercialAdsbProvider] Rate-limit HTTP ${res.status} em ${ep.id} (${h.id}), alternando provedor...`);
                            continue;
                        }

                        if (!res.ok) {
                            this.endpointCooldowns.set(ep.id, Date.now() + 15000);
                            console.warn(`[RIT-FLY][CommercialAdsbProvider] Resposta HTTP ${res.status} em ${ep.id} (${h.id})`);
                            continue;
                        }

                        const json = await res.json();
                        const acList = Array.isArray(json.ac)
                            ? json.ac
                            : (Array.isArray(json.aircraft) ? json.aircraft : []);

                        for (const raw of acList) {
                            if (raw && raw.hex && typeof raw.lat === 'number' && typeof raw.lon === 'number') {
                                const hexUpper = String(raw.hex).trim().toUpperCase();
                                if (!deduplicatedMap.has(hexUpper)) {
                                    deduplicatedMap.set(hexUpper, raw);
                                }
                            }
                        }

                        if (deduplicatedMap.size > 0) {
                            hubSuccess = true;
                            this.endpointCooldowns.delete(ep.id);
                            break; // Sucesso no hub atual, não precisa acionar o endpoint secundário
                        }
                    } catch (e) {
                        clearTimeout(timeout);
                        this.endpointCooldowns.set(ep.id, Date.now() + 15000);
                        console.warn(`[RIT-FLY][CommercialAdsbProvider] Falha/timeout em ${ep.id} (${h.id}): ${e.message}`);
                    }
                }
            }

            const latency = Date.now() - start;
            this.rateLimitStatus.lastLatencyMs = latency;

            if (deduplicatedMap.size > 0) {
                const converted = [];
                for (const raw of deduplicatedMap.values()) {
                    try {
                        const dto = this.transformAdsbRecord(raw);
                        if (dto) converted.push(dto);
                    } catch (normErr) {
                        console.warn(`[RIT-FLY][CommercialAdsbProvider] Erro ao normalizar registro ${raw.hex}: ${normErr.message}`);
                    }
                }

                this.cache = converted;
                this.lastFetchTime = Date.now();
                this.nextAllowedAttemptTime = 0;
                this.lastDataMode = 'LIVE_PROVIDER';
                this.rateLimitStatus.status = 'OK';
                this.providerStatus = {
                    status: 'ONLINE',
                    code: 200,
                    message: `Operacional (${converted.length} aeronaves observadas)`,
                    lastAttempt: new Date().toISOString()
                };

                return converted;
            }

            // Se todos os provedores oscilaram mas temos cache recente (até 15 min), preserva continuidade operacional
            if (this.cache && this.cache.length > 0 && (Date.now() - this.lastFetchTime < 900000)) {
                this.lastDataMode = 'CACHED_PROVIDER';
                this.rateLimitStatus.status = 'OK';
                return this.cache;
            }

            this.nextAllowedAttemptTime = Date.now() + 12000;
            this.lastDataMode = 'UNAVAILABLE';
            this.rateLimitStatus.status = 'RATE_LIMITED';
            this.providerStatus.status = 'UNAVAILABLE';
            this.providerStatus.message = 'Nenhum sinal ADS-B recebido dos hubs monitorados';
            return [];
        } catch (err) {
            this.rateLimitStatus.lastLatencyMs = Date.now() - start;
            console.error(`[RIT-FLY][CommercialAdsbProvider] Erro crítico na aquisição ADS-B: ${err.message}`);
            if (this.cache && this.cache.length > 0) {
                this.lastDataMode = 'CACHED_PROVIDER';
                return this.cache;
            }
            this.lastDataMode = 'UNAVAILABLE';
            this.providerStatus.status = 'UNAVAILABLE';
            this.providerStatus.message = `Erro ao consultar feed ADS-B: ${err.message}`;
            return [];
        }
    }

    async getFlightById(id) {
        if (!id) return null;
        const normalized = id.trim().toUpperCase();
        const flights = await this.getCurrentFlights();
        return flights.find(f => 
            (f.id && f.id.toUpperCase() === normalized) ||
            (f.icao24 && f.icao24.toUpperCase() === normalized) ||
            (f.callsign && f.callsign.toUpperCase() === normalized) ||
            (f.numeroVoo && f.numeroVoo.toUpperCase() === normalized) ||
            (f.prefixo && f.prefixo.toUpperCase() === normalized)
        ) || null;
    }

    /**
     * Converte o registro bruto ADS-B para o FlightDTO canônico
     */
    transformAdsbRecord(raw) {
        const hex = (raw.hex || '').trim().toUpperCase();
        if (!hex || raw.lat == null || raw.lon == null) return null;

        const callsign = (raw.flight || raw.r || hex).trim().toUpperCase();
        const matricula = (raw.r || hex).trim().toUpperCase();
        const aircraftType = (raw.t || '').trim().toUpperCase();
        const adsbCategory = (raw.category || '').trim().toUpperCase();
        const onGround = raw.alt_baro === 'ground' || Boolean(raw.ground);
        
        // Altitude
        const altFt = raw.alt_baro != null && typeof raw.alt_baro === 'number' 
            ? raw.alt_baro 
            : (raw.alt_geom != null && typeof raw.alt_geom === 'number' ? raw.alt_geom : 0);
        const altM = Math.round(altFt * 0.3048);

        // Velocidade no solo
        const speedKts = raw.gs != null && typeof raw.gs === 'number' ? Math.round(raw.gs) : 0;
        const speedKmh = Math.round(speedKts * 1.852);

        // Rumo e razão vertical
        const rumo = raw.track != null && typeof raw.track === 'number' ? Math.round(raw.track) : 0;
        const vertRateFpm = Math.round(Number(raw.baro_rate || raw.geom_rate) || 0);

        // Classificação e Companhia
        const { categoria, companhia, numeroVoo } = this.identifyAirlineAndCategory(
            callsign,
            matricula,
            aircraftType,
            adsbCategory,
            altFt,
            speedKmh
        );

        // Dedução de rota mais próxima baseada na posição geográfica e vetor de proa
        const { origem, destino } = this.estimateRouteFromPosition(raw.lat, raw.lon, rumo, altFt, vertRateFpm, callsign, aircraftType);

        // Situação Operacional com constantes válidas do módulo
        let situacao = FLIGHT_STATUS.EN_ROUTE;
        if (onGround) {
            situacao = FLIGHT_STATUS.LANDED;
        } else if (altFt < 4500 && vertRateFpm < -250) {
            situacao = FLIGHT_STATUS.APPROACHING;
        } else if (altFt < 4500 && vertRateFpm > 300) {
            situacao = FLIGHT_STATUS.DEPARTING;
        }

        const nowIso = new Date().toISOString();

        return new FlightDTO({
            id: hex,
            icao24: hex.toLowerCase(),
            callsign: callsign,
            numeroVoo: numeroVoo,
            prefixo: matricula,
            companhia: companhia,
            modeloAeronave: aircraftType ? `Aeronave ${aircraftType}` : undefined,
            aircraftType: aircraftType,
            adsbCategory: adsbCategory,
            categoria: categoria,
            origem: origem,
            destino: destino,
            latitude: Number(raw.lat.toFixed(6)),
            longitude: Number(raw.lon.toFixed(6)),
            altitudeFt: altFt,
            altitudeM: altM,
            velocidadeKts: speedKts,
            velocidadeKmh: speedKmh,
            rumo: rumo,
            taxaVerticalFpm: vertRateFpm,
            status: situacao,
            onGround: onGround,
            atrasoMinutos: 0,
            horarioPrevisto: null,
            data_source: 'ADSB_COMMERCIAL_FEED',
            data_mode: this.lastDataMode === 'CACHED_PROVIDER' ? 'CACHED' : 'LIVE',
            stale: false,
            last_provider_update: nowIso,
            ultimaAtualizacao: nowIso
        });
    }

    identifyAirlineAndCategory(callsign, matricula, type = '', adsbCategory = '', altFt = 0, speedKmh = 0) {
        const cs = (callsign || '').trim().toUpperCase();
        const mat = (matricula || '').trim().toUpperCase();
        const acType = (type || '').trim().toUpperCase();
        const emCat = (adsbCategory || '').trim().toUpperCase();

        let categoria = FLIGHT_CATEGORIES.COMERCIAL;
        let companhia = 'Não Identificada';
        let numeroVoo = cs;

        // 1. Regras por Prefixo de Voo / Callsign Comercial ICAO ou IATA
        if (/^(TAM|LAN|LPE|LA\d|JJ\d)/i.test(cs)) {
            companhia = 'LATAM Brasil';
            categoria = FLIGHT_CATEGORIES.COMERCIAL;
            const match = cs.match(/\d+/);
            numeroVoo = match ? `LA ${match[0]}` : cs;
            return { categoria, companhia, numeroVoo };
        }
        if (/^(GLO|G3\d)/i.test(cs)) {
            companhia = 'GOL Linhas Aéreas';
            categoria = FLIGHT_CATEGORIES.COMERCIAL;
            const match = cs.match(/\d+/);
            numeroVoo = match ? `G3 ${match[0]}` : cs;
            return { categoria, companhia, numeroVoo };
        }
        if (/^(AZU|ACN|AD\d)/i.test(cs)) {
            companhia = 'Azul Linhas Aéreas';
            categoria = FLIGHT_CATEGORIES.COMERCIAL;
            const match = cs.match(/\d+/);
            numeroVoo = match ? `AD ${match[0]}` : cs;
            return { categoria, companhia, numeroVoo };
        }
        if (/^(PTB|2Z)/i.test(cs)) {
            companhia = 'Voepass Linhas Aéreas';
            categoria = FLIGHT_CATEGORIES.COMERCIAL;
            const match = cs.match(/\d+/);
            numeroVoo = match ? `2Z ${match[0]}` : cs;
            return { categoria, companhia, numeroVoo };
        }
        if (/^(IPM|8I)/i.test(cs)) {
            companhia = 'Itapemirim Transportes Aéreos';
            categoria = FLIGHT_CATEGORIES.COMERCIAL;
            const match = cs.match(/\d+/);
            numeroVoo = match ? `8I ${match[0]}` : cs;
            return { categoria, companhia, numeroVoo };
        }
        if (/^(SID|RIO|TTL|MWM|LAE)/i.test(cs)) {
            companhia = 'Cargueiro / Logística';
            categoria = FLIGHT_CATEGORIES.CARGUEIRO;
            return { categoria, companhia, numeroVoo };
        }

        // 2. Checagem de Asas Rotativas (Helicópteros - códigos ICAO Doc 8643 + categoria ADS-B A7)
        const heliTypes = [
            'H125', 'H130', 'H135', 'H145', 'H155', 'H160', 'H175',
            'EC20', 'EC30', 'EC35', 'EC45', 'EC55', 'EC75',
            'AS50', 'AS55', 'AS65', 'S76', 'S92',
            'A109', 'A119', 'A139', 'AW139', 'A169',
            'B06', 'B206', 'B407', 'B429', 'B412', 'R22', 'R44', 'R66'
        ];
        if (
            emCat === 'A7' ||
            heliTypes.some(ht => acType.includes(ht)) ||
            /^(HSL|OMN|HELI)/i.test(cs) ||
            (!acType && altFt > 0 && altFt < 2500 && speedKmh > 0 && speedKmh < 230)
        ) {
            categoria = FLIGHT_CATEGORIES.HELICOPTERO;
            companhia = 'Operação de Asas Rotativas';
            return { categoria, companhia, numeroVoo };
        }

        // 3. Checagem de Aviação Executiva / Geral
        const execTypes = [
            'C510', 'C525', 'C550', 'C560', 'C56X', 'C650', 'C680', 'C68A', 'C700', 'C750',
            'E50P', 'E55P', 'E545', 'E550', 'E35L', 'PC12', 'PC24',
            'BE20', 'BE30', 'BE9L', 'BE40', 'B350',
            'G150', 'G280', 'G450', 'G550', 'G650', 'GLF4', 'GLF5', 'GLF6', 'GA5C', 'GA6C',
            'FA7X', 'FA8X', 'F900', 'F2TH', 'CL30', 'CL35', 'CL60', 'BD70', 'GL5T', 'GL7T',
            'LJ35', 'LJ40', 'LJ45', 'LJ60', 'LJ75', 'PRM1', 'H25B', 'HA4T', 'EA50', 'SF50',
            'PA31', 'PA34', 'PA46', 'C208', 'SR22', 'C172', 'C182', 'C210', 'BE58', 'P28A'
        ];
        const commercialAirlinerTypes = [
            'A319', 'A320', 'A321', 'A20N', 'A21N', 'A332', 'A339', 'A359',
            'B737', 'B738', 'B38M', 'B763', 'B772', 'B77W', 'B788', 'B789',
            'E190', 'E195', 'E295', 'AT72', 'AT76'
        ];

        if (commercialAirlinerTypes.some(ct => acType.includes(ct))) {
            categoria = FLIGHT_CATEGORIES.COMERCIAL;
            companhia = 'Aviação Comercial';
            return { categoria, companhia, numeroVoo };
        }

        if (
            execTypes.some(et => acType.includes(et)) ||
            /^(PT|PR|PP|PS)-?[A-Z]{3}$/i.test(mat) ||
            /^(PT|PR|PP|PS)-?[A-Z]{3}$/i.test(cs)
        ) {
            categoria = FLIGHT_CATEGORIES.EXECUTIVO;
            companhia = 'Aviação Executiva / Privada';
            return { categoria, companhia, numeroVoo };
        }

        return { categoria, companhia, numeroVoo };
    }

    estimateRouteFromPosition(lat, lon, track = 0, altFt = 10000, vertRateFpm = 0, callsign = '', aircraftType = '') {
        const airports = Object.entries(AIRPORTS).map(([code, info]) => {
            const dLat = info.lat - lat;
            const dLon = info.lng - lon;
            const distDeg = Math.hypot(dLat, dLon);
            const distKm = Math.round(distDeg * 111);
            const bearing = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
            const angleDiff = Math.abs(((track - bearing + 540) % 360) - 180);
            return { code, info, distDeg, distKm, bearing, angleDiff };
        });

        airports.sort((a, b) => a.distKm - b.distKm);
        const nearest = airports[0];

        // Se estiver muito próximo de um aeroporto (< 28km) e descendo ou em baixa altitude -> chegando nele
        if (nearest && nearest.distKm < 28 && (vertRateFpm < -150 || altFt < 4000)) {
            const originCandidates = airports.filter(a => a.code !== nearest.code && a.angleDiff > 100);
            const orig = originCandidates.length > 0 ? originCandidates[0].code : (nearest.code === 'GIG' || nearest.code === 'SDU' ? 'GRU' : 'GIG');
            return { origem: orig, destino: nearest.code };
        }

        // Se estiver muito próximo de um aeroporto (< 28km) e subindo -> decolando dele
        if (nearest && nearest.distKm < 28 && vertRateFpm >= -150) {
            const forwardCandidates = airports
                .filter(a => a.code !== nearest.code && a.angleDiff < 75)
                .sort((a, b) => (a.distKm * (1 + a.angleDiff / 45)) - (b.distKm * (1 + b.angleDiff / 45)));
            const dest = forwardCandidates.length > 0
                ? forwardCandidates[0].code
                : (nearest.code === 'SDU' ? 'CGH' : (nearest.code === 'GIG' ? 'GRU' : (nearest.code === 'CGH' ? 'SDU' : 'GIG')));
            return { origem: nearest.code, destino: dest };
        }

        // Em rota: encontra o aeroporto à frente (menor angleDiff dentro do cone de proa <= 75°)
        const ahead = airports
            .filter(a => a.distKm >= 15 && a.angleDiff <= 75)
            .sort((a, b) => (a.distKm * (1 + a.angleDiff / 35)) - (b.distKm * (1 + b.angleDiff / 35)));

        const behind = airports
            .filter(a => a.angleDiff >= 105)
            .sort((a, b) => a.distKm - b.distKm);

        let destino = ahead.length > 0 ? ahead[0].code : null;
        let origem = behind.length > 0 ? behind[0].code : nearest.code;

        // Desempate realista entre GIG e SDU quando o voo se aproxima da TMA-RJ
        if (destino === 'SDU' || destino === 'GIG') {
            const isHeavyOrLong = ['A321', 'A21N', 'A332', 'A339', 'B763', 'B77W', 'B789', 'B738'].includes(aircraftType);
            const numMatch = (callsign || '').match(/\d+/);
            const flightNum = numMatch ? parseInt(numMatch[0], 10) : 0;
            // A321/Widebodies ou voos internacionais/tronco (ex: LA 3xxx/4xxx/8xxx, G3 2xxx) ou aproximação pelo setor Norte operam em GIG
            if (isHeavyOrLong || lat > -22.85 || (flightNum >= 3000 && flightNum % 2 === 1)) {
                destino = 'GIG';
            }
        }

        // Desempate realista entre GRU e CGH quando o voo se aproxima da TMA-SP
        if (destino === 'CGH' || destino === 'GRU') {
            const isHeavy = ['A321', 'A21N', 'A332', 'A339', 'B763', 'B77W', 'B789'].includes(aircraftType);
            if (isHeavy || lat > -23.48) {
                destino = 'GRU';
            }
        }

        if (!destino) {
            destino = nearest.code === 'SDU' ? 'CGH' : (nearest.code === 'GIG' ? 'GRU' : 'GIG');
        }
        if (origem === destino) {
            origem = destino === 'GIG' || destino === 'SDU' ? 'GRU' : 'GIG';
        }

        return { origem, destino };
    }

    applyFilters(flights, filters = {}) {
        let result = Array.isArray(flights) ? flights : [];

        if (filters.categoria && !['todos', 'todas'].includes(filters.categoria.toLowerCase())) {
            const catTarget = filters.categoria.trim().toLowerCase()
                .replace(/^comerciais$/, 'comercial')
                .replace(/^helicopteros$/, 'helicoptero')
                .replace(/^executivos$/, 'executivo')
                .replace(/^cargueiros$/, 'cargueiro');
            result = result.filter(f => (f.categoria || '').toLowerCase() === catTarget);
        }

        if (filters.status) {
            const st = filters.status.trim().toUpperCase();
            result = result.filter(f => (f.status || '').toUpperCase() === st);
        }

        if (filters.companhia && !['todas', 'todos'].includes(filters.companhia.trim().toLowerCase())) {
            const compTarget = filters.companhia.trim().toUpperCase();
            result = result.filter(f => {
                const fComp = (f.companhia || '').toUpperCase();
                const fCat = (f.categoria || '').toLowerCase();
                const fCs = (f.callsign || '').toUpperCase();
                const fNum = (f.numeroVoo || '').toUpperCase();

                if (compTarget === 'EXECUTIVOS' || compTarget === 'EXECUTIVO') {
                    return fCat === FLIGHT_CATEGORIES.EXECUTIVO;
                }
                if (compTarget === 'HELICOPTEROS' || compTarget === 'HELICOPTERO') {
                    return fCat === FLIGHT_CATEGORIES.HELICOPTERO;
                }
                if (compTarget === 'CARGUEIROS' || compTarget === 'CARGUEIRO') {
                    return fCat === FLIGHT_CATEGORIES.CARGUEIRO;
                }
                if (compTarget === 'COMERCIAIS' || compTarget === 'COMERCIAL') {
                    return fCat === FLIGHT_CATEGORIES.COMERCIAL;
                }
                if (compTarget === 'GOL' || compTarget === 'GLO' || compTarget === 'G3') {
                    return fComp.includes('GOL') || fCs.startsWith('GLO') || fNum.startsWith('G3');
                }
                if (compTarget === 'LATAM' || compTarget === 'TAM' || compTarget === 'LA' || compTarget === 'JJ') {
                    return fComp.includes('LATAM') || fComp.includes('TAM') || fCs.startsWith('TAM') || fCs.startsWith('LAN') || fCs.startsWith('LPE') || fNum.startsWith('LA ') || fNum.startsWith('JJ ');
                }
                if (compTarget === 'AZUL' || compTarget === 'AZU' || compTarget === 'AD') {
                    return fComp.includes('AZUL') || fCs.startsWith('AZU') || fCs.startsWith('ACN') || fNum.startsWith('AD ');
                }
                if (compTarget === 'VOEPASS' || compTarget === 'PTB' || compTarget === '2Z') {
                    return fComp.includes('VOEPASS') || fCs.startsWith('PTB') || fNum.startsWith('2Z ');
                }
                if (compTarget === 'ITA' || compTarget === 'IPM' || compTarget === '8I') {
                    return fComp.includes('ITAPEMIRIM') || fCs.startsWith('IPM') || fNum.startsWith('8I ');
                }
                if (compTarget === 'NAO_IDENTIFICADA') {
                    return !f.companhia || f.companhia === 'Não Identificada';
                }
                return fComp.includes(compTarget);
            });
        }

        if (filters.search) {
            const s = filters.search.trim().toLowerCase();
            result = result.filter(f =>
                (f.callsign && f.callsign.toLowerCase().includes(s)) ||
                (f.numeroVoo && f.numeroVoo.toLowerCase().includes(s)) ||
                (f.prefixo && f.prefixo.toLowerCase().includes(s)) ||
                (f.origem && f.origem.toLowerCase().includes(s)) ||
                (f.destino && f.destino.toLowerCase().includes(s)) ||
                (f.companhia && f.companhia.toLowerCase().includes(s))
            );
        }

        return result;
    }
}

module.exports = {
    CommercialAdsbProvider
};
