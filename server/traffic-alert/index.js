/**
 * Agente RIT - Módulo RIT ALERTA
 * Ponto Central de Exportação do Subsistema Canônico v2.1.
 */

const { config } = require('./config');
const constants = require('./constants');
const canonicalDto = require('./types/canonical-dto');
const { memoryStore } = require('./store/memory-store');
const { DeduplicationEngine } = require('./engine/deduplication-engine');
const { CorRioProvider } = require('./providers/cor-rio-provider');
const { TrafficRepository } = require('./db/traffic-repository');
const geoFallback = require('./db/geo-fallback');

module.exports = {
    config,
    constants,
    canonicalDto,
    memoryStore,
    DeduplicationEngine,
    CorRioProvider,
    TrafficRepository,
    geoFallback,
    trafficAlertRoutes
};
