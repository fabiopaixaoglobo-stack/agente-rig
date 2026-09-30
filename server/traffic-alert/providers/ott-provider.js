/**
 * Agente RIT - Módulo RIT ALERTA & RIT CARAVANAS
 * Provedor de Segurança Pública: OTT (Onde Tem Tiroteio) (ott-provider.js)
 * Coleta resiliente de informes públicos com cache em memória, timeout e normalização canônica.
 * Privacy by Design / Zero GPS / Sem PII / Classificação de Frescor.
 */

const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
const { BaseProvider } = require('./base-provider');
const { createNormalizedIncident } = require('../types/normalized-incident');
const { detectCorridor } = require('../engine/normalizer');
const { SEVERITY_LEVELS } = require('../constants');

function parseOttDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (brMatch) {
        let [, d, m, y, h, min, s] = brMatch;
        const day = d.padStart(2, '0');
        const month = m.padStart(2, '0');
        let year = y.length === 2 ? '20' + y : y;
        const hour = (h || '00').padStart(2, '0');
        const minute = (min || '00').padStart(2, '0');
        const second = (s || '00').padStart(2, '0');
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
    }
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
}

class OttProvider extends BaseProvider {
    constructor(options = {}) {
        super('OTT', { enabled: true, ...options });
        this.cache = new Map(); // key -> { timestamp, data }
        this.cacheTtlMs = options.cacheTtlMs || 3 * 60 * 1000; // 3 min
        this.endpointUrl = 'https://ondetemtiroteio.com/website/ott/report-data.php?action=informes';
    }

    async initialize() {
        return true;
    }

    async fetchData({ region = 'RJ', force = false } = {}) {
        const estado = (region || 'RJ').toUpperCase();
        const cacheKey = `OTT_${estado}`;
        const now = Date.now();

        if (!force && this.cache.has(cacheKey)) {
            const entry = this.cache.get(cacheKey);
            if (now - entry.timestamp < this.cacheTtlMs) {
                return { items: entry.data, isCache: true, region: estado };
            }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        try {
            const res = await fetch(this.endpointUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://ondetemtiroteio.com/website/ott/index.html',
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            clearTimeout(timeout);

            if (res.ok) {
                const data = await res.json();
                const allItems = Array.isArray(data.items) ? data.items : [];
                const filtered = allItems.filter(item => {
                    const st = (item.state || 'RJ').toUpperCase();
                    return estado === 'ALL' || estado === 'TODOS' || st === estado;
                });

                this.cache.set(cacheKey, { timestamp: now, data: filtered });
                this.lastHealth = {
                    status: 'HEALTHY',
                    latencyMs: Date.now() - now,
                    consecutiveFailures: 0,
                    lastCheck: new Date(),
                    lastSuccess: new Date(),
                    errorMessage: null
                };
                return { items: filtered, isCache: false, region: estado };
            }
            throw new Error(`HTTP ${res.status}: Falha ao consultar OTT`);
        } catch (err) {
            clearTimeout(timeout);
            this.lastHealth = {
                status: 'DEGRADED',
                latencyMs: Date.now() - now,
                consecutiveFailures: (this.lastHealth?.consecutiveFailures || 0) + 1,
                lastCheck: new Date(),
                lastSuccess: this.lastHealth?.lastSuccess || null,
                errorMessage: err.message
            };

            // Se falhar e houver cache anterior, reutiliza de forma resiliente
            if (this.cache.has(cacheKey)) {
                const entry = this.cache.get(cacheKey);
                return { items: entry.data, isCache: true, region: estado, stale: true };
            }

            // Fallback sintético controlado para ambiente de homologação (Zero crash)
            const fallbackItems = this._getHomologationFallback(estado);
            return { items: fallbackItems, isCache: false, isSynthetic: true, region: estado };
        }
    }

    _getHomologationFallback(region = 'RJ') {
        const today = new Date();
        const dateStr = today.toISOString();
        if (region === 'SP') {
            return [
                {
                    id: 'ott-sp-homolog-01',
                    type: 'Operação Policial',
                    neighborhood: 'Pinheiros',
                    city: 'São Paulo',
                    state: 'SP',
                    address: 'Próximo à Marginal Pinheiros',
                    lat: -23.5650,
                    lng: -46.7020,
                    date: dateStr
                }
            ];
        }
        return [
            {
                id: 'ott-rj-homolog-01',
                type: 'Disparo de Arma de Fogo',
                neighborhood: 'Maré / Linha Vermelha',
                city: 'Rio de Janeiro',
                state: 'RJ',
                address: 'Linha Vermelha, altura da Maré',
                lat: -22.8550,
                lng: -43.2420,
                date: dateStr
            }
        ];
    }

    normalize(fetchResult) {
        const items = fetchResult.items || [];
        const isSynthetic = Boolean(fetchResult.isSynthetic);
        const region = fetchResult.region || 'RJ';

        const normalizedList = [];

        for (const item of items) {
            const rawLat = item.lat || item.latitude;
            const rawLng = item.lng || item.lon || item.longitude;
            const lat = parseFloat(rawLat);
            const lng = parseFloat(rawLng);

            // Ignora se não houver coordenadas válidas
            if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

            const parsedDate = parseOttDate(item.date) || new Date();
            const textPool = `${item.type || ''} ${item.address || ''} ${item.neighborhood || ''}`;
            const corridor = detectCorridor(textPool);

            let severity = SEVERITY_LEVELS.ALTO;
            const lowerType = (item.type || '').toLowerCase();
            if (lowerType.includes('tiroteio') || lowerType.includes('confronto')) {
                severity = SEVERITY_LEVELS.CRITICO;
            } else if (lowerType.includes('disparo')) {
                severity = SEVERITY_LEVELS.MEDIO;
            }

            try {
                const norm = createNormalizedIncident({
                    id: item.id ? `ott-${item.id}` : `ott-${Math.random().toString(36).substring(2, 9)}`,
                    source: 'OTT',
                    category: lowerType.includes('tiroteio') ? 'tiroteio' : (lowerType.includes('opera') ? 'operacao_policial' : 'disparo_ouvido'),
                    severity,
                    title: item.type ? `Informe OTT: ${item.type}` : 'Informe de Segurança OTT',
                    description: item.address ? `${item.address} (${item.neighborhood || item.city || ''})` : `Ocorrência em ${item.neighborhood || item.city || 'via pública'}`,
                    latitude: lat,
                    longitude: lng,
                    reportedAt: parsedDate.toISOString(),
                    updatedAt: parsedDate.toISOString(),
                    region,
                    city: item.city || (region === 'SP' ? 'São Paulo' : 'Rio de Janeiro'),
                    corridor,
                    sourceUrl: 'https://ondetemtiroteio.com',
                    isSynthetic
                });
                normalizedList.push(norm);
            } catch (e) {
                // Descarta registro com erro sem abortar os demais
            }
        }

        return normalizedList;
    }

    async fetchNormalizedIncidents(region = 'RJ') {
        const fetchResult = await this.fetchData({ region });
        return this.normalize(fetchResult);
    }
}

const ottProvider = new OttProvider();
ottProvider.OttProvider = OttProvider;
ottProvider.parseOttDate = parseOttDate;

module.exports = ottProvider;
