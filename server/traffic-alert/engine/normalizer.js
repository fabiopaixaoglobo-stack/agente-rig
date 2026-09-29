/**
 * Agente RIT - Módulo RIT ALERTA
 * Motor de Normalização de Fontes Públicas para DTOs Canônicos.
 * Em conformidade com o Descarte de Payload Bruto e Segregação de Domínio v2.1.
 */

const {
    SEVERITY_LEVELS,
    TRAFFIC_AWARENESS,
    INCIDENT_STATUS,
    VISUAL_CONFIRMATION_STATUS
} = require('../constants');
const {
    createTrafficIncidentDTO,
    createPublicSafetyEventDTO,
    createIncidentSourceDTO
} = require('../types/canonical-dto');
const { config } = require('../config');

// Mapeamento de corredores estratégicos do Rio de Janeiro
const CORRIDOR_PATTERNS = [
    { name: 'PONTE_RIO_NITEROI', regex: /ponte\s+rio[- ]niter[oó]i/i },
    { name: 'LINHA_VERMELHA', regex: /linha\s+vermelha/i },
    { name: 'LINHA_AMARELA', regex: /linha\s+amarela/i },
    { name: 'AVENIDA_BRASIL', regex: /av(?:enida)?\.?\s+brasil/i },
    { name: 'TUNEL_REBOUCAS', regex: /t[uú]nel\s+rebou[çc]as/i },
    { name: 'ATERRO_FLAMENGO', regex: /aterro\s+do\s+flamengo/i },
    { name: 'AUTOOESTRADA_LAGOA_BARRA', regex: /lagoa[- ]barra/i },
    { name: 'TUNEL_SANTA_BARBARA', regex: /t[uú]nel\s+santa\s+b[aá]rbara/i }
];

/**
 * Identifica o corredor estratégico a partir do texto do evento.
 */
function detectCorridor(text) {
    if (!text || typeof text !== 'string') return 'MALHA_URBANA';
    for (const item of CORRIDOR_PATTERNS) {
        if (item.regex.test(text)) {
            return item.name;
        }
    }
    return 'MALHA_URBANA';
}

/**
 * Normaliza um evento bruto originado do COR-Rio (Estágio Operacional da Cidade).
 */
function normalizeCorRioStage(stageData) {
    const estagioNum = stageData.estagioNum || 1;
    const estagioNome = stageData.estagioNome || `Estágio ${estagioNum}`;
    const storeRaw = config.governance.storeRawPayload;

    // Severidade proporcional ao estágio do COR
    let severity = SEVERITY_LEVELS.BAIXO;
    let severityScore = 20.0;

    if (estagioNum === 2) {
        severity = SEVERITY_LEVELS.MEDIO;
        severityScore = 45.0;
    } else if (estagioNum === 3) {
        severity = SEVERITY_LEVELS.ALTO;
        severityScore = 70.0;
    } else if (estagioNum >= 4) {
        severity = SEVERITY_LEVELS.CRITICO;
        severityScore = 90.0;
    }

    const source = createIncidentSourceDTO({
        provider: 'COR_RIO',
        externalId: `cor-estagio-${estagioNum}`,
        sourceUrl: 'https://cor.rio/',
        rawPayload: stageData,
        confidenceWeight: 2.0, // Fonte oficial possui peso máximo
        isOfficial: true,
        sourceStatus: estagioNome,
        storeRawPayload: storeRaw
    });

    return createTrafficIncidentDTO({
        canonicalId: `RIT-COR-STAGE-${estagioNum}`,
        title: `Estágio Operacional da Cidade: ${estagioNome}`,
        description: `Centro de Operações Rio informa: ${estagioNome}. Alterações nas condições da cidade podem impactar a malha viária.`,
        corridor: 'CIDADE_INTEIRA',
        lat: -22.9068, // Coordenadas do CCO do COR-Rio
        lng: -43.1729,
        severity,
        severityScore,
        trafficAwareness: TRAFFIC_AWARENESS.REAL_TIME,
        visualConfirmationStatus: VISUAL_CONFIRMATION_STATUS.NOT_AVAILABLE,
        status: INCIDENT_STATUS.ACTIVE,
        isSynthetic: false,
        sources: [source]
    });
}

/**
 * Normaliza uma ocorrência viária pública reportada por concessionárias ou órgãos de trânsito.
 */
function normalizeTrafficEvent({
    rawId,
    title,
    description = '',
    locationText = '',
    lat,
    lng,
    obstructionType = 'PARCIAL', // 'TOTAL', 'PARCIAL', 'ACOSTAMENTO', 'FLUXO'
    provider = 'CET_RIO',
    sourceUrl = null,
    isOfficial = true,
    rawPayload = null
}) {
    const corridor = detectCorridor(`${title} ${description} ${locationText}`);
    const storeRaw = config.governance.storeRawPayload;

    let severity = SEVERITY_LEVELS.MEDIO;
    let severityScore = 50.0;

    if (obstructionType === 'TOTAL') {
        severity = corridor !== 'MALHA_URBANA' ? SEVERITY_LEVELS.CRITICO : SEVERITY_LEVELS.ALTO;
        severityScore = corridor !== 'MALHA_URBANA' ? 95.0 : 80.0;
    } else if (obstructionType === 'ACOSTAMENTO') {
        severity = SEVERITY_LEVELS.BAIXO;
        severityScore = 30.0;
    }

    const source = createIncidentSourceDTO({
        provider,
        externalId: rawId,
        sourceUrl,
        rawPayload,
        confidenceWeight: isOfficial ? 1.8 : 1.0,
        isOfficial,
        sourceStatus: obstructionType,
        storeRawPayload: storeRaw
    });

    return createTrafficIncidentDTO({
        canonicalId: `RIT-${provider}-${rawId || Date.now()}`,
        title: title || 'Ocorrência Viária',
        description,
        corridor,
        lat: Number(lat) || -22.9068,
        lng: Number(lng) || -43.1729,
        severity,
        severityScore,
        trafficAwareness: TRAFFIC_AWARENESS.REAL_TIME,
        status: INCIDENT_STATUS.ACTIVE,
        isSynthetic: false,
        sources: [source]
    });
}

module.exports = {
    detectCorridor,
    normalizeCorRioStage,
    normalizeTrafficEvent
};
