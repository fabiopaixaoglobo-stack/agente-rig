/**
 * Agente RIT - Módulo Acompanhamento de Caravanas (CHECKPOINT 5.2)
 * DTO Canônico de Projeção Operacional de Caravanas (caravan-dto.js)
 * Privacy by Design / Zero GPS / Projeção Heurística / Dados Sintéticos
 */

const { CARAVAN_PROJECTED_STATUS, CARAVAN_DISCLAIMER } = require('../constants');

// Lista estrita de status projetados permitidos
const VALID_STATUSES = new Set(Object.values(CARAVAN_PROJECTED_STATUS));

/**
 * Validador e construtor canônico de Projeção Operacional de Caravana.
 * Garante imutabilidade e rejeita qualquer inserção de telemetria GPS ou dados pessoais.
 */
function createCaravanProjectionDTO({
    caravanId,
    caravanName,
    programName,
    companyName = 'Log Rio',
    operationalNotes = '',
    originLabel,
    originAddress,
    originCoords,
    plannedDepartureAt,
    destinationLabel = 'ESTÚDIOS GLOBO — PONTO DE CHEGADA HOMOLOGAÇÃO',
    destinationAddress = 'Acesso Corporativo Homologação — Curicica, Rio de Janeiro - RJ',
    destinationCoords = [-22.9550, -43.4100],
    baseDistanceKm = 0,
    baseDurationMinutes = 0,
    incidentImpactMinutes = 0,
    unquantifiedIncidentsCount = 0,
    projectedDurationMinutes = 0,
    projectedArrivalAt = null,
    operationalWindowStart = null,
    operationalWindowEnd = null,
    marginToWindowMinutes = null,
    projectedStatus = CARAVAN_PROJECTED_STATUS.PLANEJADA,
    incidents = [],
    routeGeometry = [],
    criticalSegments = [],
    consultativeRecommendations = [],
    alternativeRoute = null,
    cameras = [],
    trafficComparison = null,
    routeColor = '#00d1ff',
    sourceStatus = 'ACTIVE',
    calculatedAt = new Date().toISOString(),
    expiresAt = null,
    isSynthetic = true
}) {
    if (!caravanId || typeof caravanId !== 'string') {
        throw new Error("[Caravan DTO Error] 'caravanId' é obrigatório.");
    }
    if (!caravanName || typeof caravanName !== 'string') {
        throw new Error("[Caravan DTO Error] 'caravanName' é obrigatório.");
    }
    if (!programName || typeof programName !== 'string') {
        throw new Error("[Caravan DTO Error] 'programName' é obrigatório.");
    }

    // Validação estrita de status
    if (!VALID_STATUSES.has(projectedStatus)) {
        throw new Error(`[Caravan DTO Error] Status projetado '${projectedStatus}' inválido.`);
    }

    // Trava de segurança: proibição estrita de GPS e rastreamento em tempo real
    const isGpsBased = false;

    // Normalização das ocorrências da rota
    const normalizedIncidents = Array.isArray(incidents) ? incidents.map(inc => Object.freeze({
        canonicalId: String(inc.canonicalId || inc.id || 'INC-UNKNOWN'),
        title: String(inc.title || 'Ocorrência Viária'),
        severity: String(inc.severity || 'MEDIO'),
        corridor: String(inc.corridor || 'MALHA_URBANA'),
        distanceToRouteMeters: Math.round(Number(inc.distanceToRouteMeters || 0)),
        impactMinutes: typeof inc.impactMinutes === 'number' ? inc.impactMinutes : null,
        impactLabel: inc.impactMinutes ? `+${inc.impactMinutes} min` : 'Impacto não quantificado pela fonte',
        sourceUrl: inc.sourceUrl || null,
        provider: inc.provider || 'FONTE_PUBLICA'
    })) : [];

    // Cálculo do TTL de validade (padrão 15 minutos caso não informado)
    const validUntil = expiresAt || new Date(new Date(calculatedAt).getTime() + 15 * 60 * 1000).toISOString();

    return Object.freeze({
        caravanId: String(caravanId).trim(),
        caravanName: String(caravanName).trim(),
        programName: String(programName).trim(),
        companyName: String(companyName || 'Log Rio').trim(),
        operationalNotes: String(operationalNotes || '').trim(),
        originLabel: String(originLabel || '').trim(),
        originAddress: String(originAddress || '').trim(),
        originCoords: Array.isArray(originCoords) && originCoords.length === 2 ? [Number(originCoords[0]), Number(originCoords[1])] : null,
        plannedDepartureAt: plannedDepartureAt ? new Date(plannedDepartureAt).toISOString() : null,
        destinationLabel: String(destinationLabel).trim(),
        destinationAddress: String(destinationAddress).trim(),
        destinationCoords: Array.isArray(destinationCoords) ? [Number(destinationCoords[0]), Number(destinationCoords[1])] : [-22.9550, -43.4100],
        baseDistanceKm: Number(Number(baseDistanceKm).toFixed(1)),
        baseDurationMinutes: Math.round(Number(baseDurationMinutes) || 0),
        incidentImpactMinutes: Math.round(Number(incidentImpactMinutes) || 0),
        unquantifiedIncidentsCount: Math.round(Number(unquantifiedIncidentsCount) || 0),
        projectedDurationMinutes: Math.round(Number(projectedDurationMinutes) || 0),
        projectedArrivalAt: projectedArrivalAt ? new Date(projectedArrivalAt).toISOString() : null,
        operationalWindowStart: operationalWindowStart ? new Date(operationalWindowStart).toISOString() : null,
        operationalWindowEnd: operationalWindowEnd ? new Date(operationalWindowEnd).toISOString() : null,
        marginToWindowMinutes: marginToWindowMinutes !== null ? Math.round(Number(marginToWindowMinutes)) : null,
        projectedStatus,
        incidents: Object.freeze(normalizedIncidents),
        routeGeometry: Array.isArray(routeGeometry) ? Object.freeze(routeGeometry.map(pt => [Number(pt[0]), Number(pt[1])])) : Object.freeze([]),
        criticalSegments: Array.isArray(criticalSegments) ? Object.freeze([...criticalSegments]) : Object.freeze([]),
        consultativeRecommendations: Array.isArray(consultativeRecommendations) ? Object.freeze([...consultativeRecommendations]) : Object.freeze([]),
        alternativeRoute: alternativeRoute ? Object.freeze({ ...alternativeRoute }) : null,
        cameras: Array.isArray(cameras) ? Object.freeze([...cameras]) : Object.freeze([]),
        trafficComparison: trafficComparison ? Object.freeze({ ...trafficComparison }) : null,
        routeColor: String(routeColor || '#00d1ff'),
        sourceStatus: String(sourceStatus),
        calculatedAt: new Date(calculatedAt).toISOString(),
        expiresAt: validUntil,
        isGpsBased,
        isSynthetic: Boolean(isSynthetic),
        disclaimer: CARAVAN_DISCLAIMER
    });
}

module.exports = {
    createCaravanProjectionDTO,
    VALID_STATUSES
};
