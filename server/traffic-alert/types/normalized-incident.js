/**
 * Agente RIT - Módulo RIT ALERTA & RIT CARAVANAS
 * Interface e DTO Normalizado de Ocorrência Unificada (normalized-incident.js)
 * Conecta Trânsito Municipal (COR-Rio, CET-SP) e Segurança Pública (OTT, Fogo Cruzado).
 * Privacy by Design / Zero GPS / Sem PII / Classificação de Frescor.
 */

const { SEVERITY_LEVELS } = require('../constants');

/**
 * Classificação de Frescor de acordo com a data/hora do reporte:
 * - ATUAL: reportado há menos de 60 minutos
 * - RECENTE: reportado entre 1 e 4 horas
 * - DESATUALIZADA: reportado há mais de 4 horas
 * - INDISPONÍVEL: quando a fonte original estiver fora do ar ou sem timestamp válido
 */
function determineFreshnessStatus(timestampStr, isAvailable = true) {
    if (!isAvailable) return 'INDISPONÍVEL';
    if (!timestampStr) return 'POTENCIALMENTE DESATUALIZADA';

    try {
        const time = new Date(timestampStr).getTime();
        if (isNaN(time)) return 'POTENCIALMENTE DESATUALIZADA';
        const diffMinutes = (Date.now() - time) / (1000 * 60);

        if (diffMinutes < 0) return 'ATUAL';
        if (diffMinutes <= 60) return 'ATUAL';
        if (diffMinutes <= 240) return 'RECENTE';
        return 'POTENCIALMENTE DESATUALIZADA';
    } catch (e) {
        return 'POTENCIALMENTE DESATUALIZADA';
    }
}

/**
 * Valida e normaliza as coordenadas geográficas (latitude e longitude válidas).
 */
function validateCoordinates(lat, lon) {
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);

    if (isNaN(parsedLat) || isNaN(parsedLon)) {
        return null;
    }

    // Latitude válida entre -90 e 90; Longitude entre -180 e 180
    if (parsedLat < -90 || parsedLat > 90 || parsedLon < -180 || parsedLon > 180) {
        return null;
    }

    return {
        lat: Number(parsedLat.toFixed(6)),
        lng: Number(parsedLon.toFixed(6))
    };
}

/**
 * Fábrica da Interface Normalizada de Ocorrência
 */
function createNormalizedIncident({
    id,
    canonicalId,
    source, // 'OTT' | 'FOGO_CRUZADO' | 'COR_RIO' | 'CET_SP' | 'ALERTA_RIO'
    category, // 'tiroteio' | 'operacao_policial' | 'disparo_ouvido' | 'interdicao' | 'acidente' | 'alagamento' | 'obras' | 'meteorologico'
    severity = SEVERITY_LEVELS.MEDIO, // 'CRÍTICO' | 'ALTO' | 'MÉDIO' | 'BAIXO'
    title,
    description = '',
    latitude,
    longitude,
    reportedAt,
    updatedAt,
    region = 'RJ', // 'RJ' | 'SP'
    city = 'Rio de Janeiro',
    corridor = 'MALHA_URBANA',
    sourceUrl = null,
    freshnessStatus = null,
    isSynthetic = false
}) {
    if (!title || typeof title !== 'string') {
        throw new Error("[NormalizedIncident] 'title' é obrigatório.");
    }
    if (!source || typeof source !== 'string') {
        throw new Error("[NormalizedIncident] 'source' é obrigatório.");
    }

    const coords = validateCoordinates(latitude, longitude);
    if (!coords) {
        throw new Error("[NormalizedIncident] Coordenadas inválidas para plotagem.");
    }

    const repAt = reportedAt ? new Date(reportedAt).toISOString() : new Date().toISOString();
    const upAt = updatedAt ? new Date(updatedAt).toISOString() : repAt;
    const computedFreshness = freshnessStatus || determineFreshnessStatus(upAt, true);

    const safeId = id || `inc-${source.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const safeCanonicalId = canonicalId || `RIT-${source.toUpperCase()}-${safeId}`;

    return Object.freeze({
        id: safeId,
        canonicalId: safeCanonicalId,
        source: String(source).toUpperCase(),
        category: String(category || 'transito').trim(),
        severity: String(severity || SEVERITY_LEVELS.MEDIO).toUpperCase(),
        title: String(title).trim(),
        description: String(description || '').trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        lat: coords.lat, // Compatibilidade com componentes Leaflet
        lng: coords.lng, // Compatibilidade com componentes Leaflet
        reportedAt: repAt,
        updatedAt: upAt,
        region: String(region || 'RJ').toUpperCase(),
        city: String(city || 'Rio de Janeiro').trim(),
        corridor: String(corridor || 'MALHA_URBANA').trim(),
        sourceUrl: sourceUrl ? String(sourceUrl).trim() : null,
        freshnessStatus: computedFreshness,
        isSynthetic: Boolean(isSynthetic)
    });
}

/**
 * Constrói ocorrência normalizada com tratamento gracioso de falha (retorna null se coordenadas forem inválidas).
 */
function buildNormalizedIncident(data) {
    if (!data || typeof data !== 'object') return null;
    const coords = validateCoordinates(data.latitude, data.longitude);
    if (!coords) return null;
    try {
        return createNormalizedIncident({
            ...data,
            title: data.title || 'Ocorrência',
            source: data.source || 'OTT'
        });
    } catch (e) {
        return null;
    }
}

module.exports = {
    createNormalizedIncident,
    buildNormalizedIncident,
    determineFreshnessStatus,
    validateCoordinates
};
