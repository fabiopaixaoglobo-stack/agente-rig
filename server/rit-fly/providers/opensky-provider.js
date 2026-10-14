/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Provedor ADS-B OpenSky Network & Malha Aérea Brasileira de Contingência
 */

const fetch = require('node-fetch');
const { config } = require('../config');
const { FLIGHT_CATEGORIES, FLIGHT_STATUS, AIRPORTS } = require('../constants');
const { FlightDTO } = require('../types/flight-dto');

class OpenSkyProvider {
    constructor() {
        this.cache = null;
        this.lastFetchTime = 0;
        this.cacheTtlMs = config.CACHE_TTL_MS || 25000;
        this.syntheticSeedTime = Date.now();
        this.providerStatus = {
            status: 'INITIALIZING',
            code: null,
            message: null,
            lastAttempt: null
        };
    }

    /**
     * Retorna a lista de voos ativos no espaço aéreo nacional
     */
    async getFlights(filters = {}) {
        const now = Date.now();
        if (this.cache && (now - this.lastFetchTime < this.cacheTtlMs)) {
            return this.applyFilters(this.cache, filters);
        }

        let rawFlights = [];
        try {
            if (config.OPENSKY.ENABLED) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), config.OPENSKY.TIMEOUT_MS);
                
                const bbox = config.OPENSKY.BBOX;
                const url = `${config.OPENSKY.BASE_URL}?lamin=${bbox.lamin}&lomin=${bbox.lomin}&lamax=${bbox.lamax}&lomax=${bbox.lomax}`;
                
                const headers = {
                    'User-Agent': 'AgenteRIT/1.0 (Auditoria Aerea)'
                };

                // Suporte a autenticação OpenSky (Basic Auth) se configurado
                if (config.OPENSKY.USERNAME && config.OPENSKY.PASSWORD) {
                    const authHeader = Buffer.from(`${config.OPENSKY.USERNAME}:${config.OPENSKY.PASSWORD}`).toString('base64');
                    headers['Authorization'] = `Basic ${authHeader}`;
                }
                
                const res = await fetch(url, { headers, signal: controller.signal });
                clearTimeout(timeout);

                this.providerStatus.lastAttempt = new Date().toISOString();
                this.providerStatus.code = res.status;

                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.states)) {
                        rawFlights = data.states
                            .filter(st => st[5] !== null && st[6] !== null) // Possui lat/lng válida
                            .map(st => this.transformOpenSkyState(st));
                    }
                    this.providerStatus.status = 'ONLINE';
                    this.providerStatus.message = `Conectado com sucesso (${rawFlights.length} voos observados)`;
                } else if (res.status === 429) {
                    this.providerStatus.status = 'RATE_LIMITED';
                    this.providerStatus.message = 'OpenSky Network Rate Limit (HTTP 429) - Acesso anônimo esgotado neste IP';
                } else {
                    this.providerStatus.status = 'ERROR';
                    this.providerStatus.message = `Falha OpenSky HTTP ${res.status}`;
                }
            }
        } catch (err) {
            this.providerStatus.status = 'UNAVAILABLE';
            this.providerStatus.message = `Falha de conexão com OpenSky: ${err.message}`;
        }

        // Governança Estrita: Só injeta voos sintéticos se RIT_FLY_ALLOW_SYNTHETIC_DATA for explicitamente true
        if (config.ALLOW_SYNTHETIC_DATA) {
            const fallbackMesh = this.generateRealisticBrazilianAirMesh();
            const existingIds = new Set(rawFlights.map(f => (f.icao24 || f.callsign || '').toUpperCase()));
            for (const synth of fallbackMesh) {
                const key = (synth.icao24 || synth.callsign || '').toUpperCase();
                if (!existingIds.has(key)) {
                    rawFlights.push(synth);
                }
            }
        }

        this.cache = rawFlights;
        this.lastFetchTime = now;

        return this.applyFilters(rawFlights, filters);
    }

    /**
     * Converte o array posicional da API OpenSky Network no FlightDTO Canônico
     */
    transformOpenSkyState(st) {
        // Formato OpenSky:
        // [0: icao24, 1: callsign, 2: origin_country, 3: time_position, 4: last_contact,
        //  5: longitude, 6: latitude, 7: baro_altitude, 8: on_ground, 9: velocity,
        //  10: true_track, 11: vertical_rate, 12: sensors, 13: geo_altitude, 14: squawk, 15: spi, 16: position_source]
        const icao24 = st[0];
        const callsign = (st[1] || '').trim();
        const lng = st[5];
        const lat = st[6];
        const altM = st[7] || 0;
        const altFt = Math.round(altM * 3.28084);
        const onGround = Boolean(st[8]);
        const velMs = st[9] || 0;
        const velKts = Math.round(velMs * 1.94384);
        const heading = Math.round(st[10] || 0);
        const vertRateMs = st[11] || 0;
        const vertRateFpm = Math.round(vertRateMs * 196.85);

        // Dedução aproximada de pares de aeroportos brasileiros mais comuns
        const { origem, destino } = this.estimateRouteFromHeadingAndPosition(lat, lng, heading, callsign);

        return new FlightDTO({
            id: `os-${icao24}`,
            icao24,
            prefixo: this.formatPrefixo(icao24, callsign),
            callsign,
            latitude: lat,
            longitude: lng,
            altitudeFt: altFt,
            velocidadeKts: velKts,
            rumo: heading,
            taxaVerticalFpm: vertRateFpm,
            onGround,
            origem: origem || 'N/D',
            destino: destino || 'N/D',
            origin_source: 'CALLSIGN_OR_POSITION_INFERENCE',
            atrasoMinutos: 0, // ADS-B não transmite atraso comercial oficial
            data_mode: 'LIVE',
            data_source: 'OPENSKY_ADS-B',
            category_source: 'CALLSIGN_HEURISTIC',
            confidence_score: 0.95
        });
    }

    /**
     * Gera malha de contingência rica e realista de voos corporativos no Brasil
     * Movimenta as aeronaves suavemente ao longo do tempo para o mapa ficar dinâmico
     */
    generateRealisticBrazilianAirMesh() {
        const elapsedSec = (Date.now() - this.syntheticSeedTime) / 1000;
        const delta = (elapsedSec % 3600) / 3600; // Ciclo contínuo de 1 hora

        const templates = [
            // COMERCIAIS
            {
                icao24: 'e48011', prefixo: 'PR-XMB', callsign: 'GLO1234', numeroVoo: 'G3 1234',
                categoria: FLIGHT_CATEGORIES.COMERCIAL, companhia: 'GOL Linhas Aéreas',
                origem: 'SDU', destino: 'CGH',
                baseLat: -22.9105, baseLng: -43.1631, targetLat: -23.6261, targetLng: -46.6564,
                altitudeFt: 24000, velocidadeKts: 420, rumo: 245, atrasoMinutos: 35, modeloAeronave: 'Boeing 737-800'
            },
            {
                icao24: 'e48012', prefixo: 'PR-GGM', callsign: 'GLO1502', numeroVoo: 'G3 1502',
                categoria: FLIGHT_CATEGORIES.COMERCIAL, companhia: 'GOL Linhas Aéreas',
                origem: 'CGH', destino: 'SDU',
                baseLat: -23.6261, baseLng: -46.6564, targetLat: -22.9105, targetLng: -43.1631,
                altitudeFt: 27000, velocidadeKts: 440, rumo: 68, atrasoMinutos: 0, modeloAeronave: 'Boeing 737-800'
            },
            {
                icao24: 'e48013', prefixo: 'PR-TYN', callsign: 'TAM3456', numeroVoo: 'LA 3456',
                categoria: FLIGHT_CATEGORIES.COMERCIAL, companhia: 'LATAM Brasil',
                origem: 'GIG', destino: 'BSB',
                baseLat: -22.8089, baseLng: -43.2436, targetLat: -15.8711, targetLng: -47.9186,
                altitudeFt: 36000, velocidadeKts: 460, rumo: 335, atrasoMinutos: 40, modeloAeronave: 'Airbus A320neo'
            },
            {
                icao24: 'e48014', prefixo: 'PR-MYA', callsign: 'TAM3721', numeroVoo: 'LA 3721',
                categoria: FLIGHT_CATEGORIES.COMERCIAL, companhia: 'LATAM Brasil',
                origem: 'GRU', destino: 'SSA',
                baseLat: -23.4356, baseLng: -46.4731, targetLat: -12.9086, targetLng: -38.3225,
                altitudeFt: 37000, velocidadeKts: 475, rumo: 38, atrasoMinutos: 5, modeloAeronave: 'Airbus A321'
            },
            {
                icao24: 'e48015', prefixo: 'PR-YRS', callsign: 'AZU4000', numeroVoo: 'AD 4000',
                categoria: FLIGHT_CATEGORIES.COMERCIAL, companhia: 'Azul Linhas Aéreas',
                origem: 'CNF', destino: 'REC',
                baseLat: -19.6244, baseLng: -43.9719, targetLat: -8.1264, targetLng: -34.9240,
                altitudeFt: 35000, velocidadeKts: 450, rumo: 32, atrasoMinutos: 0, modeloAeronave: 'Embraer E195-E2'
            },
            {
                icao24: 'e48016', prefixo: 'PR-AYX', callsign: 'AZU4321', numeroVoo: 'AD 4321',
                categoria: FLIGHT_CATEGORIES.COMERCIAL, companhia: 'Azul Linhas Aéreas',
                origem: 'SDU', destino: 'CNF',
                baseLat: -22.9105, baseLng: -43.1631, targetLat: -19.6244, targetLng: -43.9719,
                altitudeFt: 22000, velocidadeKts: 390, rumo: 350, atrasoMinutos: 15, modeloAeronave: 'Embraer E195-E2'
            },
            {
                icao24: 'e48017', prefixo: 'PP-PTN', callsign: 'PTB2240', numeroVoo: '2Z 2240',
                categoria: FLIGHT_CATEGORIES.COMERCIAL, companhia: 'Voepass Linhas Aéreas',
                origem: 'CGH', destino: 'RAO',
                baseLat: -23.6261, baseLng: -46.6564, targetLat: -21.1364, targetLng: -47.7767,
                altitudeFt: 18000, velocidadeKts: 280, rumo: 330, atrasoMinutos: 0, modeloAeronave: 'ATR 72-600'
            },

            // HELICÓPTEROS CORPORATIVOS & OPERACIONAIS
            {
                icao24: 'e48020', prefixo: 'PR-GBO', callsign: 'GLOBOCOP-RJ', numeroVoo: 'GLOBOCOP RJ',
                categoria: FLIGHT_CATEGORIES.HELICOPTERO, companhia: 'Globo Jornalismo / RIT Air',
                origem: 'JACAREPAGUÁ (SBJR)', destino: 'SDU / ZONA SUL',
                baseLat: -22.9875, baseLng: -43.3703, targetLat: -22.9105, targetLng: -43.1631,
                altitudeFt: 1200, velocidadeKts: 110, rumo: 75, atrasoMinutos: 0, modeloAeronave: 'Eurocopter AS350 B3 Esquilo'
            },
            {
                icao24: 'e48021', prefixo: 'PP-EGL', callsign: 'GLOBOCOP-SP', numeroVoo: 'GLOBOCOP SP',
                categoria: FLIGHT_CATEGORIES.HELICOPTERO, companhia: 'Globo Jornalismo SP',
                origem: 'CAMPO DE MARTE (SBMT)', destino: 'BERRINI / PAULISTA',
                baseLat: -23.5089, baseLng: -46.6375, targetLat: -23.6015, targetLng: -46.6965,
                altitudeFt: 1500, velocidadeKts: 115, rumo: 195, atrasoMinutos: 0, modeloAeronave: 'Eurocopter AS350 B3'
            },
            {
                icao24: 'e48022', prefixo: 'PR-HLS', callsign: 'HELISUL-04', numeroVoo: 'HSL 04',
                categoria: FLIGHT_CATEGORIES.HELICOPTERO, companhia: 'Helisul Táxi Aéreo',
                origem: 'SDU', destino: 'CABO FRIO',
                baseLat: -22.9105, baseLng: -43.1631, targetLat: -22.9231, targetLng: -42.0736,
                altitudeFt: 2000, velocidadeKts: 130, rumo: 92, atrasoMinutos: 0, modeloAeronave: 'Bell 407'
            },

            // AERONAVES EXECUTIVAS
            {
                icao24: 'e48030', prefixo: 'PP-GLB', callsign: 'CORP-01', numeroVoo: 'CORP 01',
                categoria: FLIGHT_CATEGORIES.EXECUTIVO, companhia: 'Frota Executiva Corporativa',
                origem: 'GIG', destino: 'CGH',
                baseLat: -22.8089, baseLng: -43.2436, targetLat: -23.6261, targetLng: -46.6564,
                altitudeFt: 38000, velocidadeKts: 480, rumo: 240, atrasoMinutos: 0, modeloAeronave: 'Embraer Phenom 300'
            },
            {
                icao24: 'e48031', prefixo: 'PR-LDR', callsign: 'LIDER204', numeroVoo: 'LSE 204',
                categoria: FLIGHT_CATEGORIES.EXECUTIVO, companhia: 'Líder Aviação Executiva',
                origem: 'BSB', destino: 'SDU',
                baseLat: -15.8711, baseLng: -47.9186, targetLat: -22.9105, targetLng: -43.1631,
                altitudeFt: 39000, velocidadeKts: 470, rumo: 155, atrasoMinutos: 10, modeloAeronave: 'Cessna Citation Latitude'
            },
            {
                icao24: 'e48032', prefixo: 'PS-JAT', callsign: 'AIRJAT', numeroVoo: 'AJT 77',
                categoria: FLIGHT_CATEGORIES.EXECUTIVO, companhia: 'Táxi Aéreo Executivo',
                origem: 'CNF', destino: 'CGH',
                baseLat: -19.6244, baseLng: -43.9719, targetLat: -23.6261, targetLng: -46.6564,
                altitudeFt: 31000, velocidadeKts: 440, rumo: 215, atrasoMinutos: 0, modeloAeronave: 'Beechcraft King Air 350'
            },

            // CARGUEIROS
            {
                icao24: 'e48040', prefixo: 'PR-SDO', callsign: 'SID5501', numeroVoo: '0Q 5501',
                categoria: FLIGHT_CATEGORIES.CARGUEIRO, companhia: 'Sideral Cargo',
                origem: 'GRU', destino: 'REC',
                baseLat: -23.4356, baseLng: -46.4731, targetLat: -8.1264, targetLng: -34.9240,
                altitudeFt: 34000, velocidadeKts: 430, rumo: 35, atrasoMinutos: 25, modeloAeronave: 'Boeing 737-400F Cargo'
            },
            {
                icao24: 'e48041', prefixo: 'PR-TTL', callsign: 'TTL4410', numeroVoo: 'TOTAL 4410',
                categoria: FLIGHT_CATEGORIES.CARGUEIRO, companhia: 'Total Cargo',
                origem: 'GIG', destino: 'SSA',
                baseLat: -22.8089, baseLng: -43.2436, targetLat: -12.9086, targetLng: -38.3225,
                altitudeFt: 32000, velocidadeKts: 410, rumo: 28, atrasoMinutos: 0, modeloAeronave: 'Boeing 727-200F'
            }
        ];

        return templates.map(t => {
            // Interpola a posição entre a base e o destino
            const prog = ((delta * (t.velocidadeKts / 400)) + (parseInt(t.icao24, 16) % 100) / 100) % 1;
            const curLat = t.baseLat + (t.targetLat - t.baseLat) * prog;
            const curLng = t.baseLng + (t.targetLng - t.baseLng) * prog;

            return new FlightDTO({
                id: `synth-${t.icao24}`,
                icao24: t.icao24,
                prefixo: t.prefixo,
                callsign: t.callsign,
                numeroVoo: t.numeroVoo,
                categoria: t.categoria,
                companhia: t.companhia,
                origem: t.origem,
                destino: t.destino,
                latitude: curLat,
                longitude: curLng,
                altitudeFt: t.altitudeFt,
                velocidadeKts: t.velocidadeKts,
                rumo: t.rumo,
                taxaVerticalFpm: 0,
                onGround: false,
                atrasoMinutos: t.atrasoMinutos,
                modeloAeronave: t.modeloAeronave,
                data_mode: 'SYNTHETIC',
                data_source: 'DEMO_SYNTHETIC',
                confidence_score: 0.5,
                category_source: 'MANUAL'
            });
        });
    }

    applyFilters(flights, filters = {}) {
        let res = flights;

        if (filters.categoria) {
            const cat = filters.categoria.toLowerCase();
            res = res.filter(f => f.categoria.toLowerCase() === cat);
        }

        if (filters.status) {
            const st = filters.status.toUpperCase();
            res = res.filter(f => f.status.toUpperCase() === st);
        }

        if (filters.companhia && filters.companhia !== 'todas' && filters.companhia !== 'TODAS') {
            const comp = filters.companhia.trim().toUpperCase();
            res = res.filter(f => {
                const fComp = (f.companhia || '').toUpperCase();
                const fCat = (f.categoria || '').toUpperCase();
                if (comp === 'GOL') return fComp.includes('GOL') || (f.callsign && f.callsign.startsWith('GLO'));
                if (comp === 'LATAM') return fComp.includes('LATAM') || (f.callsign && f.callsign.startsWith('TAM'));
                if (comp === 'AZUL') return fComp.includes('AZUL') || (f.callsign && f.callsign.startsWith('AZU'));
                if (comp === 'VOEPASS' || comp === '2Z') return fComp.includes('VOEPASS') || (f.callsign && f.callsign.startsWith('PTB'));
                if (comp === 'ITA') return fComp.includes('ITAPEMIRIM') || (f.callsign && f.callsign.startsWith('IPM'));
                if (comp === 'EXECUTIVOS' || comp === 'EXECUTIVO') return fCat === 'EXECUTIVO' || fComp.includes('EXECUTIV') || fComp.includes('LÍDER');
                if (comp === 'HELICOPTEROS' || comp === 'HELICOPTERO') return fCat === 'HELICOPTERO';
                return fComp.includes(comp);
            });
        }

        if (filters.search) {
            const q = filters.search.trim().toUpperCase();
            res = res.filter(f => 
                (f.callsign && f.callsign.includes(q)) ||
                (f.prefixo && f.prefixo.includes(q)) ||
                (f.numeroVoo && f.numeroVoo.includes(q)) ||
                (f.companhia && f.companhia.toUpperCase().includes(q)) ||
                (f.origem && f.origem.includes(q)) ||
                (f.destino && f.destino.includes(q))
            );
        }

        return res;
    }

    formatPrefixo(icao24, callsign) {
        if (callsign && (callsign.startsWith('PR-') || callsign.startsWith('PP-') || callsign.startsWith('PT-') || callsign.startsWith('PS-'))) {
            return callsign;
        }
        return `PR-${(icao24 || 'XYZ').slice(-3).toUpperCase()}`;
    }

    estimateRouteFromHeadingAndPosition(lat, lng, heading, callsign) {
        // Encontra o aeroporto mais próximo para origem ou destino
        const airports = Object.values(AIRPORTS);
        let closest = airports[0];
        let minDist = 999999;

        for (const a of airports) {
            const d = Math.hypot(a.lat - lat, a.lng - lng);
            if (d < minDist) {
                minDist = d;
                closest = a;
            }
        }

        // Estimativa plausível de rota para voos sem plano IFR conhecido
        if (closest.iata === 'SDU' || closest.iata === 'GIG') {
            return { origem: closest.iata, destino: heading > 180 && heading < 300 ? 'CGH' : 'BSB' };
        }
        if (closest.iata === 'CGH' || closest.iata === 'GRU') {
            return { origem: closest.iata, destino: heading < 90 || heading > 340 ? 'SDU' : 'BSB' };
        }
        return { origem: closest.iata, destino: 'GIG' };
    }
}

module.exports = { OpenSkyProvider };
