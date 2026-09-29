/**
 * Agente RIT - Módulo RIT ALERTA
 * DTOs Canônicos e Validação de Contratos de Dados.
 * Em conformidade com a Separação de Domínios e Critérios de Confiança A+ v2.1.
 */

const crypto = require('crypto');
const {
    INCIDENT_DOMAINS,
    SEVERITY_LEVELS,
    CONFIDENCE_LEVELS,
    TRAFFIC_AWARENESS,
    VISUAL_CONFIRMATION_STATUS,
    INCIDENT_STATUS,
    STANDARD_MESSAGES
} = require('../constants');

/**
 * Gera hash SHA-256 determinístico de um payload para auditoria e deduplicação.
 */
function generatePayloadHash(payload) {
    if (!payload) return crypto.createHash('sha256').update('').digest('hex');
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Validador e normalizador de fonte individual de incidente.
 */
function createIncidentSourceDTO({
    provider,
    externalId = null,
    sourceUrl = null,
    rawPayload = null,
    confidenceWeight = 1.0,
    sourceStatus = null,
    isOfficial = false,
    sourceTimestamp = new Date(),
    storeRawPayload = false
}) {
    if (!provider || typeof provider !== 'string') {
        throw new Error("[DTO Error] 'provider' é obrigatório na fonte.");
    }

    const rawPayloadHash = generatePayloadHash(rawPayload);

    return Object.freeze({
        provider: String(provider).trim(),
        externalId: externalId ? String(externalId).trim() : null,
        sourceUrl: sourceUrl ? String(sourceUrl).trim() : null,
        rawPayloadHash,
        confidenceWeight: Math.max(0, Math.min(2.0, Number(confidenceWeight) || 1.0)),
        sourceStatus: sourceStatus ? String(sourceStatus).trim() : null,
        isOfficial: Boolean(isOfficial),
        sourceTimestamp: new Date(sourceTimestamp).toISOString(),
        // Payload bruto só é incluído se explicitamente permitido por configuração de governança
        rawPayload: storeRawPayload ? rawPayload : undefined
    });
}

/**
 * Avalia elegibilidade para nível de confiança A+ conforme regra estrita da Seção 6 / Ressalva 5:
 * A classificação A+ exige:
 * 1. Confirmação por fonte oficial governamental/concessionária; OU
 * 2. Duas fontes independentes reconhecidas, sendo pelo menos uma de alta confiabilidade (peso >= 1.5); OU
 * 3. Confirmação visual válida (HUMAN_CONFIRMED) acompanhada por ao menos uma fonte reconhecida.
 */
function evaluateConfidenceLevel(sources = [], visualConfirmationStatus = VISUAL_CONFIRMATION_STATUS.NOT_AVAILABLE) {
    if (!Array.isArray(sources) || sources.length === 0) {
        return { score: 10, level: CONFIDENCE_LEVELS.D };
    }

    const hasOfficial = sources.some(s => s.isOfficial === true);
    const hasHumanVisual = (visualConfirmationStatus === VISUAL_CONFIRMATION_STATUS.HUMAN_CONFIRMED);
    const hasHighReliability = sources.some(s => s.confidenceWeight >= 1.5);
    const uniqueProviders = new Set(sources.map(s => s.provider));

    // Regra A+ estrita
    const eligibleForAPlus = hasOfficial ||
        (uniqueProviders.size >= 2 && hasHighReliability) ||
        (hasHumanVisual && uniqueProviders.size >= 1);

    if (eligibleForAPlus) {
        return { score: 95.0, level: CONFIDENCE_LEVELS.A_PLUS };
    }

    if (uniqueProviders.size >= 2 || hasOfficial) {
        return { score: 85.0, level: CONFIDENCE_LEVELS.A };
    }

    if (hasHighReliability) {
        return { score: 70.0, level: CONFIDENCE_LEVELS.B };
    }

    if (sources.length >= 1) {
        return { score: 50.0, level: CONFIDENCE_LEVELS.C };
    }

    return { score: 25.0, level: CONFIDENCE_LEVELS.D };
}

/**
 * Fábrica Canônica de Incidente de Trânsito (TRAFFIC_INCIDENT).
 */
function createTrafficIncidentDTO(data) {
    const domain = INCIDENT_DOMAINS.TRAFFIC_INCIDENT;
    const sources = (data.sources || []).map(s => createIncidentSourceDTO(s));
    const visualStatus = data.visualConfirmationStatus || VISUAL_CONFIRMATION_STATUS.NOT_AVAILABLE;

    const confidenceResult = evaluateConfidenceLevel(sources, visualStatus);

    return Object.freeze({
        id: data.id || crypto.randomUUID(),
        canonicalId: data.canonicalId || `RIT-TRAFFIC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        domain,
        title: String(data.title || 'Ocorrência de Trânsito').trim(),
        description: data.description ? String(data.description).trim() : '',
        corridor: data.corridor ? String(data.corridor).trim() : 'MALHA_URBANA',
        lat: Number(data.lat),
        lng: Number(data.lng),
        severity: data.severity || SEVERITY_LEVELS.MEDIO,
        severityScore: Number(data.severityScore || 50.0),
        confidence: confidenceResult.level,
        confidenceScore: confidenceResult.score,
        completenessScore: Number(data.completenessScore || 80.0),
        trafficAwareness: data.trafficAwareness || TRAFFIC_AWARENESS.NOT_AVAILABLE,
        visualConfirmationStatus: visualStatus,
        status: data.status || INCIDENT_STATUS.ACTIVE,
        divergenceFlag: Boolean(data.divergenceFlag),
        divergenceDetails: data.divergenceDetails || null,
        isSynthetic: Boolean(data.isSynthetic),
        sources,
        firstSeen: data.firstSeen ? new Date(data.firstSeen).toISOString() : new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        resolvedAt: data.resolvedAt ? new Date(data.resolvedAt).toISOString() : null
    });
}

/**
 * Fábrica Canônica de Evento de Segurança Pública (PUBLIC_SAFETY_EVENT).
 * Não assume interdição viária nem declara "rotas seguras" sem fonte de trânsito.
 */
function createPublicSafetyEventDTO(data) {
    const domain = INCIDENT_DOMAINS.PUBLIC_SAFETY_EVENT;
    const sources = (data.sources || []).map(s => createIncidentSourceDTO(s));
    const visualStatus = data.visualConfirmationStatus || VISUAL_CONFIRMATION_STATUS.NOT_AVAILABLE;

    // Se não há fonte oficial de trânsito confirmando impacto, o tráfego é sempre NOT_AVAILABLE
    const hasOfficialTrafficConfirmation = Boolean(data.hasOfficialTrafficConfirmation);
    const trafficAwareness = hasOfficialTrafficConfirmation 
        ? (data.trafficAwareness || TRAFFIC_AWARENESS.REAL_TIME)
        : TRAFFIC_AWARENESS.NOT_AVAILABLE;

    const confidenceResult = evaluateConfidenceLevel(sources, visualStatus);

    // Mensagem de cautela obrigatória se o impacto viário não foi confirmado por autoridade de trânsito
    const disclaimer = hasOfficialTrafficConfirmation 
        ? null 
        : STANDARD_MESSAGES.PUBLIC_SAFETY_NO_TRAFFIC_CONFIRMATION;

    return Object.freeze({
        id: data.id || crypto.randomUUID(),
        canonicalId: data.canonicalId || `RIT-SAFETY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        domain,
        title: String(data.title || 'Evento de Segurança Pública Reportado').trim(),
        description: data.description ? String(data.description).trim() : '',
        corridor: data.corridor ? String(data.corridor).trim() : 'AREA_CIRCUNVIZINHA',
        lat: Number(data.lat),
        lng: Number(data.lng),
        severity: data.severity || SEVERITY_LEVELS.ALTO,
        severityScore: Number(data.severityScore || 70.0),
        confidence: confidenceResult.level,
        confidenceScore: confidenceResult.score,
        completenessScore: Number(data.completenessScore || 75.0),
        trafficAwareness,
        visualConfirmationStatus: visualStatus,
        status: data.status || INCIDENT_STATUS.ACTIVE,
        divergenceFlag: Boolean(data.divergenceFlag),
        divergenceDetails: data.divergenceDetails || null,
        isSynthetic: Boolean(data.isSynthetic),
        hasOfficialTrafficConfirmation,
        publicSafetyDisclaimer: disclaimer,
        sources,
        firstSeen: data.firstSeen ? new Date(data.firstSeen).toISOString() : new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        resolvedAt: data.resolvedAt ? new Date(data.resolvedAt).toISOString() : null
    });
}

/**
 * Fábrica Canônica de Resposta de Rota (RouteDTO).
 * Segrega formalmente Provedor Viário de Consciência de Trânsito em Tempo Real.
 */
function createRouteDTO({
    routeProvider,
    trafficProvider = 'NONE',
    trafficAwareness = TRAFFIC_AWARENESS.NOT_AVAILABLE,
    trafficDataTimestamp = null,
    distanceMeters,
    durationSeconds,
    geometry,
    isAlternative = false,
    alternativeIndex = 0
}) {
    if (!routeProvider) {
        throw new Error("[RouteDTO Error] 'routeProvider' é obrigatório.");
    }

    // Regra OSRM: Provedor OSRM puro SEMPRE retorna NOT_AVAILABLE
    let finalTrafficAwareness = trafficAwareness;
    let labelNotice = null;

    if (routeProvider === 'OSRM') {
        finalTrafficAwareness = TRAFFIC_AWARENESS.NOT_AVAILABLE;
        labelNotice = STANDARD_MESSAGES.OSRM_NO_REAL_TIME;
    }

    return Object.freeze({
        routeProvider: String(routeProvider).trim(),
        trafficProvider: String(trafficProvider).trim(),
        trafficAwareness: finalTrafficAwareness,
        trafficDataTimestamp: trafficDataTimestamp ? new Date(trafficDataTimestamp).toISOString() : null,
        distanceMeters: Number(distanceMeters) || 0,
        durationSeconds: Number(durationSeconds) || 0,
        geometry: geometry || null,
        isAlternative: Boolean(isAlternative),
        alternativeIndex: Number(alternativeIndex) || 0,
        labelNotice
    });
}

module.exports = {
    generatePayloadHash,
    createIncidentSourceDTO,
    evaluateConfidenceLevel,
    createTrafficIncidentDTO,
    createPublicSafetyEventDTO,
    createRouteDTO
};
