/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Provedor e Decodificador de Clima Operacional METAR / DECEA / REDEMET
 */

const fetch = require('node-fetch');
const { config } = require('../config');
const { AIRPORTS, METAR_FLIGHT_RULES } = require('../constants');

class MetarProvider {
    constructor() {
        this.cache = new Map();
        this.cacheTtlMs = 5 * 60 * 1000; // 5 minutos de cache para METAR
    }

    /**
     * Obtém as condições meteorológicas operacionais para os aeroportos cadastrados
     * Realiza consulta em lote (batch) otimizada para reduzir latência de rede.
     */
    async getOperationalWeather(icaoList = Object.values(AIRPORTS).map(a => a.icao)) {
        const results = {};
        const missingIcaos = [];

        for (const icao of icaoList) {
            const cached = this.cache.get(icao);
            if (cached && (Date.now() - cached.timestamp < this.cacheTtlMs)) {
                results[icao] = cached.data;
            } else {
                missingIcaos.push(icao);
            }
        }

        if (missingIcaos.length > 0 && config.METAR.ENABLED) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), config.METAR.TIMEOUT_MS);
                const url = `${config.METAR.NOAA_FALLBACK_URL}?ids=${missingIcaos.join(',')}&format=json`;
                const res = await fetch(url, {
                    headers: { 'User-Agent': 'AgenteRIT/1.0 (Auditoria Metar)' },
                    signal: controller.signal
                });
                clearTimeout(timeout);

                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        for (const item of data) {
                            const icao = item.icaoId || (item.station && item.station.icao);
                            if (icao) {
                                const raw = item.rawOb || item.raw || '';
                                const decoded = this.parseMetar(icao, raw, item, 'LIVE');
                                this.cache.set(icao, { timestamp: Date.now(), data: decoded });
                                results[icao] = decoded;
                            }
                        }
                    }
                }
            } catch (err) {
                // Silencioso: segue para tratamento por estação
            }
        }

        // Para estações que ainda faltarem
        for (const icao of icaoList) {
            if (!results[icao]) {
                results[icao] = await this.getMetarForStation(icao);
            }
        }

        return results;
    }

    /**
     * Consulta METAR de uma estação com cache e fallback governado
     */
    async getMetarForStation(icao) {
        const cached = this.cache.get(icao);
        if (cached && (Date.now() - cached.timestamp < this.cacheTtlMs)) {
            return cached.data;
        }

        try {
            // Tenta consultar NOAA Aviation Weather público
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), config.METAR.TIMEOUT_MS);
            
            const url = `${config.METAR.NOAA_FALLBACK_URL}?ids=${icao}&format=json`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'AgenteRIT/1.0 (Auditoria Metar)' },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    const raw = data[0].rawOb || data[0].raw || '';
                    const decoded = this.parseMetar(icao, raw, data[0], 'LIVE');
                    this.cache.set(icao, { timestamp: Date.now(), data: decoded });
                    return decoded;
                }
            }
        } catch (err) {
            // Silencioso
        }

        // Se dados sintéticos estiverem proibidos, retorna estado UNAVAILABLE
        if (!config.ALLOW_SYNTHETIC_DATA) {
            const airportMeta = Object.values(AIRPORTS).find(a => a.icao === icao) || { iata: icao, nome: icao };
            const unavail = {
                icao,
                iata: airportMeta.iata || icao,
                nome: airportMeta.nome || icao,
                data_mode: 'UNAVAILABLE',
                data_source: 'METAR_FEED_UNAVAILABLE',
                statusOperacional: 'METAR_INDISPONIVEL',
                flightRule: 'INDISPONIVEL',
                statusPista: 'NÃO FORNECIDO POR METAR (Consulte NOTAM / DECEA)',
                condicoes: 'Dados meteorológicos não disponíveis no momento',
                atualizadoEm: new Date().toISOString()
            };
            this.cache.set(icao, { timestamp: Date.now(), data: unavail });
            return unavail;
        }

        // Fallback sintético controlado para ambiente de demonstração/testes
        const synthetic = this.generateRealisticMetar(icao);
        this.cache.set(icao, { timestamp: Date.now(), data: synthetic });
        return synthetic;
    }

    /**
     * Parser especializado de mensagens METAR aeronáuticas
     */
    parseMetar(icao, rawString, noaaObj = {}, dataMode = 'LIVE') {
        const raw = (rawString || '').trim();
        const airportMeta = Object.values(AIRPORTS).find(a => a.icao === icao) || { iata: icao, nome: icao };

        let windDir = noaaObj.wdir || 120;
        let windSpd = noaaObj.wspd || 8;
        let visM = (noaaObj.visib ? noaaObj.visib * 1609 : 9999);
        let tempC = noaaObj.temp !== undefined ? Math.round(noaaObj.temp) : 26;
        let dewpC = noaaObj.dewp !== undefined ? Math.round(noaaObj.dewp) : 19;
        let altimHpa = noaaObj.altim ? Math.round(noaaObj.altim) : 1014;
        let ceilingFt = noaaObj.cover ? (noaaObj.cover === 'OVC' ? 1200 : 3500) : 4000;
        let condicoes = [];

        // Extrai parâmetros da string bruta METAR caso NOAA venha simplificado
        if (raw) {
            // Vento ex: 14012KT ou 14012G25KT
            const windMatch = raw.match(/(\d{3}|VRB)(\d{2})(?:G(\d{2}))?KT/);
            if (windMatch) {
                windDir = windMatch[1] === 'VRB' ? 180 : parseInt(windMatch[1], 10);
                windSpd = parseInt(windMatch[2], 10);
            }

            // Visibilidade ex: 9999 ou 4000
            const visMatch = raw.match(/\s(\d{4})\s/);
            if (visMatch) {
                visM = parseInt(visMatch[1], 10);
            }

            // Fenômenos meteorológicos
            if (raw.includes('TS')) condicoes.push('Trovoada');
            if (raw.includes('RA')) condicoes.push('Chuva');
            if (raw.includes('DZ')) condicoes.push('Garoa');
            if (raw.includes('BR')) condicoes.push('Névoa Úmida');
            if (raw.includes('FG')) condicoes.push('Nevoeiro denso');

            // Nuvens e teto
            const cloudMatch = raw.match(/(FEW|SCT|BKN|OVC)(\d{3})/g);
            if (cloudMatch) {
                cloudMatch.forEach(c => {
                    const type = c.slice(0, 3);
                    const feet = parseInt(c.slice(3), 10) * 100;
                    if (type === 'BKN' || type === 'OVC') {
                        ceilingFt = Math.min(ceilingFt, feet);
                    }
                });
            }

            // Temperatura e Ponto de Orvalho ex: 26/19 ou M01/M05
            const tempMatch = raw.match(/\s(M?\d{2})\/(M?\d{2})\s/);
            if (tempMatch) {
                tempC = parseInt(tempMatch[1].replace('M', '-'), 10);
                dewpC = parseInt(tempMatch[2].replace('M', '-'), 10);
            }

            // QNH ex: Q1015
            const qnhMatch = raw.match(/Q(\d{4})/);
            if (qnhMatch) {
                altimHpa = parseInt(qnhMatch[1], 10);
            }
        }

        if (condicoes.length === 0) {
            condicoes.push('Céu Claro / Parcialmente Nublado');
        }

        // Determinação das regras de voo
        let flightRule = METAR_FLIGHT_RULES.VFR;
        let statusOperacional = 'ABERTO_VFR';

        if (ceilingFt < 500 || visM < 1500) {
            flightRule = METAR_FLIGHT_RULES.LIFR;
            statusOperacional = 'FECHADO_OU_RESTRITO';
        } else if (ceilingFt < 1000 || visM < 3000) {
            flightRule = METAR_FLIGHT_RULES.IFR;
            statusOperacional = 'OPERANDO_IFR';
        } else if (ceilingFt <= 3000 || visM < 5000) {
            flightRule = METAR_FLIGHT_RULES.MVFR;
            statusOperacional = 'ABERTO_MVFR';
        }

        return {
            icao,
            iata: airportMeta.iata,
            nome: airportMeta.nome,
            cidade: airportMeta.cidade,
            uf: airportMeta.uf,
            rawMetar: raw || `METAR ${icao} AUTO ${windDir}${windSpd}KT ${visM} NSC ${tempC}/${dewpC} Q${altimHpa}`,
            data_mode: dataMode,
            data_source: dataMode === 'LIVE' ? 'NOAA_AVIATION_WEATHER' : 'SYNTHETIC_METAR',
            flightRule,
            regraVoo: flightRule,
            statusOperacional, // Regra meteorológica para retrocompatibilidade
            statusPista: 'NÃO FORNECIDO POR METAR (Consulte NOTAM / DECEA)',
            vento: {
                direcaoGraus: windDir,
                velocidadeKts: windSpd,
                descricao: `${windDir}° a ${windSpd} nós (${Math.round(windSpd * 1.852)} km/h)`
            },
            visibilidade: {
                metros: visM,
                km: (visM / 1000).toFixed(1),
                descricao: visM >= 9999 ? '> 10 km (Excelente)' : `${(visM / 1000).toFixed(1)} km`
            },
            tetoFt: ceilingFt,
            tetoDescricao: ceilingFt >= 3000 ? `${ceilingFt} ft (Teto Operacional Alto)` : `${ceilingFt} ft (Teto Baixo - Atenção)`,
            temperaturaC: tempC,
            pontoOrvalhoC: dewpC,
            umidadeRelativa: Math.min(100, Math.max(30, Math.round(100 - 5 * (tempC - dewpC)))),
            pressaoHpa: altimHpa,
            condicoes: condicoes.join(', '),
            atualizadoEm: new Date().toISOString()
        };
    }

    /**
     * Fallback realista estruturado baseado em estações oficiais brasileiras
     */
    generateRealisticMetar(icao) {
        const base = Object.values(AIRPORTS).find(a => a.icao === icao) || { iata: icao, nome: icao, cidade: 'Brasil', uf: 'BR' };
        const now = new Date();
        const hour = now.getUTCHours();
        const min = now.getUTCMinutes();
        const day = now.getUTCDate().toString().padStart(2, '0');
        const zuluTime = `${day}${hour.toString().padStart(2, '0')}${min.toString().padStart(2, '0')}Z`;

        // Valores realistas por aeroporto
        const defaultProfiles = {
            SBGL: { windDir: 140, windSpd: 11, temp: 28, dewp: 21, vis: 9999, teto: 3000, rule: 'VFR', status: 'ABERTO_VFR' },
            SBRJ: { windDir: 160, windSpd: 9, temp: 27, dewp: 20, vis: 9999, teto: 2500, rule: 'VFR', status: 'ABERTO_VFR' },
            SBSP: { windDir: 320, windSpd: 12, temp: 22, dewp: 17, vis: 8000, teto: 1800, rule: 'MVFR', status: 'ABERTO_MVFR' },
            SBGR: { windDir: 340, windSpd: 14, temp: 21, dewp: 16, vis: 7000, teto: 1400, rule: 'IFR', status: 'OPERANDO_IFR' },
            SBBR: { windDir: 90, windSpd: 7, temp: 25, dewp: 14, vis: 9999, teto: 5000, rule: 'VFR', status: 'ABERTO_VFR' },
            SBCF: { windDir: 110, windSpd: 8, temp: 24, dewp: 15, vis: 9999, teto: 4000, rule: 'VFR', status: 'ABERTO_VFR' },
            SBSV: { windDir: 100, windSpd: 15, temp: 29, dewp: 22, vis: 9999, teto: 3500, rule: 'VFR', status: 'ABERTO_VFR' },
            SBRF: { windDir: 120, windSpd: 13, temp: 30, dewp: 23, vis: 9999, teto: 3200, rule: 'VFR', status: 'ABERTO_VFR' }
        };

        const prof = defaultProfiles[icao] || { windDir: 120, windSpd: 10, temp: 25, dewp: 18, vis: 9999, teto: 3500, rule: 'VFR', status: 'ABERTO_VFR' };

        const raw = `METAR ${icao} ${zuluTime} ${prof.windDir.toString().padStart(3, '0')}${prof.windSpd.toString().padStart(2, '0')}KT ${prof.vis} FEW025 ${prof.temp}/${prof.dewp} Q1015`;

        return this.parseMetar(icao, raw, {
            wdir: prof.windDir,
            wspd: prof.windSpd,
            visib: prof.vis / 1609,
            temp: prof.temp,
            dewp: prof.dewp,
            altim: 1015,
            cover: prof.rule === 'IFR' ? 'OVC' : 'FEW'
        }, 'SYNTHETIC');
    }
}

module.exports = { MetarProvider };
