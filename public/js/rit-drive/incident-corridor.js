/**
 * RIT DRIVE — Filtro Geoespacial de Corredor de Incidentes
 * Regra de Ouro: "Ocorrências da Minha Corrida"
 * Exibe apenas incidentes dentro do corredor lateral estrito e à frente do veículo.
 */

import { projectPointToRoute } from './route-progress.js';

export const DEFAULT_CORRIDOR_CONFIG = {
    corridorRadiusM: 200,      // Raio lateral máximo do eixo da via (metros)
    behindToleranceM: 25,      // Tolerância para incidentes logo atrás do para-choque
    lookAheadDistanceM: 50000  // Alcance máximo à frente na rota (50km)
};

/**
 * Avalia e filtra uma lista bruta de ocorrências contra a rota e posição do veículo.
 * 
 * @param {Array<Object>} rawIncidents Ocorrências ativas
 * @param {Array<[number, number]>} routeCoords Coordenadas da rota [[lat, lon], ...]
 * @param {Array<number>} cumulativeDistances Array de distâncias acumuladas da rota
 * @param {number} vehicleRouteOffsetM Posição atual do veículo ao longo da rota (metros)
 * @param {Object} options Configuração opcional de raio e tolerâncias
 * @returns {Array<Object>} Incidentes elegíveis e ordenados pelo avanço na rota
 */
export function filterCorridorIncidents(
    rawIncidents,
    routeCoords,
    cumulativeDistances,
    vehicleRouteOffsetM,
    options = {}
) {
    if (!Array.isArray(rawIncidents) || rawIncidents.length === 0) return [];
    if (!routeCoords || routeCoords.length < 2) return [];

    const config = { ...DEFAULT_CORRIDOR_CONFIG, ...options };
    const now = Date.now();
    const seenIds = new Set();
    const eligible = [];

    for (const item of rawIncidents) {
        const incidentId = String(item.id || item.incidentId || `${item.lat}_${item.lon}_${item.tipo}`);
        if (seenIds.has(incidentId)) continue;

        const lat = Number(item.lat ?? item.latitude);
        const lon = Number(item.lon ?? item.longitude);
        if (isNaN(lat) || isNaN(lon)) continue;

        // Validação de expiração temporal
        if (item.expiresAt) {
            const expTime = new Date(item.expiresAt).getTime();
            if (!isNaN(expTime) && expTime <= now) continue;
        }

        // Projeção geodésica do incidente na rota
        const proj = projectPointToRoute(lat, lon, routeCoords, cumulativeDistances);
        const remainingDistanceM = proj.projectedRouteOffsetM - vehicleRouteOffsetM;

        // Regra de Elegibilidade Matemática Estrita
        const isWithinCorridor = proj.lateralDistanceM <= config.corridorRadiusM;
        const isAheadOfVehicle = proj.projectedRouteOffsetM >= (vehicleRouteOffsetM - config.behindToleranceM);
        const isWithinLookAhead = proj.projectedRouteOffsetM <= (vehicleRouteOffsetM + config.lookAheadDistanceM);

        if (isWithinCorridor && isAheadOfVehicle && isWithinLookAhead) {
            seenIds.add(incidentId);

            eligible.push({
                incidentId,
                type: normalizeIncidentType(item.tipo || item.type),
                rawType: item.tipo || item.type || 'Ocorrência',
                title: item.titulo || item.tipo || 'Ocorrência no Trecho',
                locationName: item.local || item.bairro || item.logradouro || 'Via monitorada',
                coordinate: [lat, lon],
                projectedCoordinate: [proj.projLat, proj.projLon],
                projectedRouteOffsetM: proj.projectedRouteOffsetM,
                lateralDistanceM: proj.lateralDistanceM,
                routeSegmentIndex: proj.segmentIndex,
                remainingDistanceM: Math.round(remainingDistanceM),
                source: item.source || item.fonte || 'cicc',
                sourceTimestamp: item.sourceTimestamp || item.horario || item.created_at || new Date().toISOString(),
                expiresAt: item.expiresAt || null,
                confidence: item.confidence ?? 1.0,
                severity: normalizeSeverity(item.severidade || item.severity || item.tipo)
            });
        }
    }

    // Ordenação estrita: ocorrências mais próximas do veículo primeiro
    eligible.sort((a, b) => a.remainingDistanceM - b.remainingDistanceM);

    return eligible;
}

/**
 * Normaliza categoria do incidente para mapeamento com os ícones circulares do RIT Drive
 */
export function normalizeIncidentType(rawType) {
    if (!rawType) return 'risco-alto';
    const t = String(rawType).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (t.includes('acidente') || t.includes('colisao')) return 'acidente';
    if (t.includes('assalto') || t.includes('roubo') || t.includes('furto')) return 'assalto';
    if (t.includes('alagamento') || t.includes('bolsao') || t.includes('enchente') || t.includes('inundacao')) return 'alagamento';
    if (t.includes('engarrafamento') || t.includes('lentidao') || t.includes('transito') || t.includes('congestionamento')) return 'engarrafamento';
    if (t.includes('blitz') || t.includes('fiscalizacao') || t.includes('comando')) return 'blitz';
    if (t.includes('obra') || t.includes('reparo') || t.includes('interdicao')) return 'obra';
    if (t.includes('tiroteio') || t.includes('tiros') || t.includes('bala')) return 'tiroteio';
    if (t.includes('operacao') || t.includes('policia') || t.includes('bope') || t.includes('choque')) return 'operacao-policial';
    if (t.includes('disparo') || t.includes('ouvido')) return 'disparo-ouvido';
    if (t.includes('seguro') || t.includes('apoio') || t.includes('porto') || t.includes('base')) return 'ponto-seguro';

    return 'risco-alto';
}

function normalizeSeverity(raw) {
    if (!raw) return 'MODERADA';
    const s = String(raw).toUpperCase();
    if (s.includes('CRITIC') || s.includes('TIROTEIO') || s.includes('ALTO')) return 'ALTA';
    if (s.includes('LEVE') || s.includes('BAIXO')) return 'BAIXA';
    return 'MODERADA';
}
