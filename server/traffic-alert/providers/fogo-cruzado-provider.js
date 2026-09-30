/**
 * Agente RIT - Módulo RIT ALERTA & RIT CARAVANAS
 * Provedor de Segurança Pública: Fogo Cruzado (fogo-cruzado-provider.js)
 * Coleta resiliente de ocorrências georreferenciadas com normalização canônica.
 * Privacy by Design / Zero GPS / Sem PII / Classificação de Frescor.
 */

const { BaseProvider } = require('./base-provider');
const { createNormalizedIncident } = require('../types/normalized-incident');
const { detectCorridor } = require('../engine/normalizer');
const { getFogoCruzadoOccurrences } = require('../../fogocruzado');
const { SEVERITY_LEVELS } = require('../constants');

class FogoCruzadoProvider extends BaseProvider {
    constructor(options = {}) {
        super('FOGO_CRUZADO', { enabled: true, ...options });
        this.cache = new Map();
        this.cacheTtlMs = options.cacheTtlMs || 3 * 60 * 1000; // 3 min
    }

    async initialize() {
        return true;
    }

    async fetchData({ region = 'RJ', force = false } = {}) {
        const estado = (region || 'RJ').toUpperCase();
        const cacheKey = `FOGO_${estado}`;
        const now = Date.now();

        if (!force && this.cache.has(cacheKey)) {
            const entry = this.cache.get(cacheKey);
            if (now - entry.timestamp < this.cacheTtlMs) {
                return { occurrences: entry.data, isCache: true, region: estado };
            }
        }

        try {
            const result = await getFogoCruzadoOccurrences({ estado });
            const occurrences = Array.isArray(result?.occurrences) ? result.occurrences : [];

            this.cache.set(cacheKey, { timestamp: now, data: occurrences });
            this.lastHealth = {
                status: 'HEALTHY',
                latencyMs: 150,
                consecutiveFailures: 0,
                lastCheck: new Date(),
                lastSuccess: new Date(),
                errorMessage: null
            };
            return {
                occurrences,
                isCache: false,
                source: result?.source,
                region: estado
            };
        } catch (err) {
            this.lastHealth = {
                status: 'DEGRADED',
                latencyMs: 0,
                consecutiveFailures: (this.lastHealth?.consecutiveFailures || 0) + 1,
                lastCheck: new Date(),
                lastSuccess: this.lastHealth?.lastSuccess || null,
                errorMessage: err.message
            };

            if (this.cache.has(cacheKey)) {
                const entry = this.cache.get(cacheKey);
                return { occurrences: entry.data, isCache: true, region: estado, stale: true };
            }

            return { occurrences: [], isCache: false, region: estado };
        }
    }

    normalize(fetchResult) {
        const occurrences = fetchResult.occurrences || [];
        const region = fetchResult.region || 'RJ';
        const isSynthetic = fetchResult.source === 'resilient_georeferenced';

        const normalizedList = [];

        for (const item of occurrences) {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon || item.lng);

            if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

            const textPool = `${item.tipo || ''} ${item.subtipo || ''} ${item.descricao || ''} ${item.endereco || ''} ${item.bairro || ''}`;
            const corridor = detectCorridor(textPool);

            let severity = SEVERITY_LEVELS.ALTO;
            const cat = (item.categoria || '').toLowerCase();
            const tipo = (item.tipo || '').toLowerCase();

            if (cat === 'tiroteio' || tipo.includes('tiroteio') || tipo.includes('confronto')) {
                severity = SEVERITY_LEVELS.CRITICO;
            } else if (cat === 'disparo_ouvido' || tipo.includes('disparo')) {
                severity = SEVERITY_LEVELS.MEDIO;
            } else if (cat === 'operacao_policial' || tipo.includes('opera')) {
                severity = SEVERITY_LEVELS.ALTO;
            }

            let reportedIso = new Date().toISOString();
            if (item.updatedAt) {
                // Formato DD/MM/YYYY HH:mm
                const parts = item.updatedAt.split(' ');
                if (parts.length === 2) {
                    const [d, m, y] = parts[0].split('/');
                    const [hh, mm] = parts[1].split(':');
                    if (d && m && y && hh && mm) {
                        reportedIso = new Date(`${y}-${m}-${d}T${hh}:${mm}:00-03:00`).toISOString();
                    }
                }
            }

            try {
                const norm = createNormalizedIncident({
                    id: item.id || `fogo-${Math.random().toString(36).substring(2, 9)}`,
                    source: 'FOGO_CRUZADO',
                    category: cat || 'tiroteio',
                    severity,
                    title: `${item.tipo || 'Ocorrência Fogo Cruzado'} - ${item.bairro || item.municipio || 'RJ'}`,
                    description: item.descricao || item.subtipo || 'Registro público consolidado pelo Instituto Fogo Cruzado',
                    latitude: lat,
                    longitude: lng,
                    reportedAt: reportedIso,
                    updatedAt: reportedIso,
                    region,
                    city: item.municipio || (region === 'SP' ? 'São Paulo' : 'Rio de Janeiro'),
                    corridor,
                    sourceUrl: 'https://fogocruzado.org.br',
                    isSynthetic
                });
                normalizedList.push(norm);
            } catch (e) {
                // Pula registro defeituoso
            }
        }

        return normalizedList;
    }

    async fetchNormalizedIncidents(region = 'RJ') {
        const fetchResult = await this.fetchData({ region });
        return this.normalize(fetchResult);
    }
}

const fogoCruzadoProvider = new FogoCruzadoProvider();
fogoCruzadoProvider.FogoCruzadoProvider = FogoCruzadoProvider;

module.exports = fogoCruzadoProvider;
