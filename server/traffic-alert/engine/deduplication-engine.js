/**
 * Agente RIT - Módulo RIT ALERTA
 * Motor de Deduplicação, Agrupamento Espaço-Temporal e Detecção de Divergência.
 * Em conformidade com as Regras de Confiança A+ e Resolução de Conflitos v2.1.
 */

const {
    evaluateConfidenceLevel,
    createTrafficIncidentDTO
} = require('../types/canonical-dto');
const { STANDARD_MESSAGES } = require('../constants');
const { config } = require('../config');

/**
 * Cálculo determinístico da distância Haversine em metros entre duas coordenadas.
 * Pura aritmética sem dependência de PostGIS ou extensões externas.
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Motor de Deduplicação e Consolidação com Parâmetros Configuráveis.
 */
class DeduplicationEngine {
    constructor(memoryStore, options = {}) {
        this.store = memoryStore;
        const dedupCfg = config.deduplication || {};
        this.matchRadiusMeters = Number(options.matchRadiusMeters || dedupCfg.matchRadiusMeters || 1500);
        this.matchCorridorRadiusMeters = Number(options.matchCorridorRadiusMeters || dedupCfg.matchCorridorRadiusMeters || 2500);
        this.matchWindowMs = Number(options.matchWindowMs || dedupCfg.matchWindowMs || (45 * 60 * 1000));
    }

    /**
     * Processa um incidente normalizado, identificando duplicatas exatas por hash,
     * ou agrupando-o com incidentes ativos existentes por proximidade geográfica e temporal.
     */
    processIncomingIncident(incomingIncident) {
        const activeIncidents = this.store.getActiveIncidents({
            domain: incomingIncident.domain,
            isSynthetic: incomingIncident.isSynthetic
        });

        // 1. Verificação de Duplicata Exata por Hash nas fontes existentes
        const incomingHash = incomingIncident.sources[0]?.rawPayloadHash;
        for (const existing of activeIncidents) {
            const hasDuplicateHash = existing.sources.some(s => s.rawPayloadHash === incomingHash);
            if (hasDuplicateHash) {
                // Fonte com mesmo hash já assimilada; ignora duplicata exata
                return {
                    action: 'IGNORED_DUPLICATE_HASH',
                    incident: existing
                };
            }
        }

        // 2. Procura incidente correspondente por Corredor, Proximidade e Janela Temporal
        let matchedIncident = null;
        for (const existing of activeIncidents) {
            const sameCorridor = (existing.corridor === incomingIncident.corridor && existing.corridor !== 'MALHA_URBANA');
            const distance = calculateHaversineDistance(existing.lat, existing.lng, incomingIncident.lat, incomingIncident.lng);
            const timeDiff = Math.abs(new Date(existing.firstSeen).getTime() - new Date(incomingIncident.firstSeen).getTime());

            const maxDistance = sameCorridor ? this.matchCorridorRadiusMeters : this.matchRadiusMeters;
            const isGeographicallyNear = distance <= maxDistance;
            const isTemporallyNear = timeDiff <= this.matchWindowMs;

            if (isGeographicallyNear && isTemporallyNear) {
                matchedIncident = existing;
                break;
            }
        }

        // 3. Se não houver correspondente, salva como novo incidente no store
        if (!matchedIncident) {
            this.store.upsertIncident(incomingIncident);
            return {
                action: 'CREATED_NEW',
                incident: incomingIncident
            };
        }

        // 4. Se houver correspondente: Detecta Divergência e Consolida Fontes
        const newSources = [...matchedIncident.sources, ...incomingIncident.sources];
        
        // Detecção de Divergência de Severidade ou Status
        let divergenceFlag = matchedIncident.divergenceFlag;
        let divergenceDetails = matchedIncident.divergenceDetails || null;

        const incomingSource = incomingIncident.sources[0];
        const primarySource = matchedIncident.sources[0];

        // Se uma fonte reporta status/severidade contrastante (ex: Oficial diz encerrado, Comunitária diz ativo)
        const statusDiffers = incomingIncident.status !== matchedIncident.status;
        const severityDiffers = Math.abs(incomingIncident.severityScore - matchedIncident.severityScore) >= 30;

        if (statusDiffers || severityDiffers) {
            divergenceFlag = true;
            divergenceDetails = {
                message: STANDARD_MESSAGES.DIVERGENCE_WARNING,
                detectedAt: new Date().toISOString(),
                differences: {
                    status: statusDiffers ? { existing: matchedIncident.status, incoming: incomingIncident.status } : null,
                    severity: severityDiffers ? { existing: matchedIncident.severity, incoming: incomingIncident.severity } : null
                },
                sourcesReported: newSources.map(s => ({ provider: s.provider, isOfficial: s.isOfficial }))
            };
        }

        // Avalia nova confiança com o acúmulo de fontes
        const newConfidence = evaluateConfidenceLevel(newSources, matchedIncident.visualConfirmationStatus);

        // Regra Oficial de Prevalência: Se houver fonte oficial, mantém o status da oficial como referência principal
        const hasOfficial = newSources.some(s => s.isOfficial);
        const resolvedStatus = hasOfficial && incomingSource.isOfficial ? incomingIncident.status : matchedIncident.status;

        // Cria versão consolidada atualizada
        const consolidated = createTrafficIncidentDTO({
            ...matchedIncident,
            sources: newSources,
            confidence: newConfidence.level,
            confidenceScore: newConfidence.score,
            status: resolvedStatus,
            divergenceFlag,
            divergenceDetails,
            lastUpdated: new Date().toISOString()
        });

        this.store.upsertIncident(consolidated);

        return {
            action: 'MERGED_INTO_EXISTING',
            incident: consolidated,
            divergenceDetected: divergenceFlag
        };
    }
}

module.exports = {
    calculateHaversineDistance,
    DeduplicationEngine,
    MAX_CLUSTER_DISTANCE_METERS: config.deduplication.matchRadiusMeters,
    MAX_CORRIDOR_CLUSTER_DISTANCE_METERS: config.deduplication.matchCorridorRadiusMeters,
    MAX_CLUSTER_TIME_WINDOW_MS: config.deduplication.matchWindowMs
};
