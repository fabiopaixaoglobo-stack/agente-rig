/**
 * Agente RIT - Módulo RIT ALERTA
 * Motor de Fallback Geoespacial e Bounding Box sem PostGIS.
 * Em conformidade com a Ressalva Técnica 6 (v2.2).
 */

const EARTH_RADIUS_METERS = 6371000;
const METERS_PER_DEGREE_LAT = 111320;

/**
 * Cálculo determinístico da distância Haversine em metros entre duas coordenadas.
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
}

/**
 * Calcula a Bounding Box (minLat, maxLat, minLng, maxLng) em torno de um ponto.
 * Permite usar o índice numérico B-tree (lat, lng) em consultas SQL puras sem PostGIS.
 */
function getBoundingBox(lat, lng, radiusMeters) {
    const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;
    const lngDelta = radiusMeters / (METERS_PER_DEGREE_LAT * Math.cos(lat * (Math.PI / 180)));

    return {
        minLat: Number((lat - latDelta).toFixed(6)),
        maxLat: Number((lat + latDelta).toFixed(6)),
        minLng: Number((lng - lngDelta).toFixed(6)),
        maxLng: Number((lng + lngDelta).toFixed(6))
    };
}

/**
 * Retorna a expressão SQL padrão para cálculo de distância esférica Haversine.
 * Totalmente compatível com PostgreSQL sem extensão PostGIS.
 */
function getSqlHaversineDistanceExpr(paramLatIndex = 1, paramLngIndex = 2) {
    return `(6371000 * acos(
        LEAST(1.0, GREATEST(-1.0,
            cos(radians($${paramLatIndex})) * cos(radians(lat)) * cos(radians(lng) - radians($${paramLngIndex})) +
            sin(radians($${paramLatIndex})) * sin(radians(lat))
        ))
    ))`;
}

module.exports = {
    EARTH_RADIUS_METERS,
    METERS_PER_DEGREE_LAT,
    calculateHaversineDistance,
    getBoundingBox,
    getSqlHaversineDistanceExpr
};
