/**
 * RIT DRIVE — Motor Geodésico de Progresso na Rota
 * Cálculos vetoriais de projeção, distância acumulada e interpolação contínua.
 */

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
    return deg * (Math.PI / 180);
}

function toDeg(rad) {
    return rad * (180 / Math.PI);
}

/**
 * Distância Haversine entre dois pontos geográficos em metros.
 */
export function haversineDistanceM(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_M * c;
}

/**
 * Bearing (azimute) inicial em graus entre dois pontos [0, 360).
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaLambda = toRad(lon2 - lon1);

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

    const theta = Math.atan2(y, x);
    const bearing = (toDeg(theta) + 360) % 360;
    return Math.round(bearing * 10) / 10;
}

/**
 * Pré-computa distâncias acumuladas para todos os nós de uma rota.
 * @param {Array<[number, number]>} coords Coordenadas [[lat, lon], ...]
 * @returns {Array<number>} Array de distâncias acumuladas em metros
 */
export function computeCumulativeDistances(coords) {
    if (!coords || coords.length === 0) return [0];
    const cum = [0];
    for (let i = 0; i < coords.length - 1; i++) {
        const d = haversineDistanceM(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
        cum.push(cum[i] + d);
    }
    return cum;
}

/**
 * Projeta um ponto P(lat, lon) no segmento A-B em plano tangente local.
 * Retorna t [0, 1], distância lateral (m) e coordenadas projetadas.
 */
export function projectPointToSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
    const dAB = haversineDistanceM(aLat, aLon, bLat, bLon);
    if (dAB === 0) {
        const d = haversineDistanceM(pLat, pLon, aLat, aLon);
        return { t: 0, lateralDistanceM: d, projLat: aLat, projLon: aLon };
    }

    const midLat = (aLat + bLat) / 2;
    const cosMid = Math.cos(toRad(midLat));

    // Conversão para coordenadas cartesianas locais aproximadas em metros
    const xA = toRad(aLon) * cosMid * EARTH_RADIUS_M;
    const yA = toRad(aLat) * EARTH_RADIUS_M;
    const xB = toRad(bLon) * cosMid * EARTH_RADIUS_M;
    const yB = toRad(bLat) * EARTH_RADIUS_M;
    const xP = toRad(pLon) * cosMid * EARTH_RADIUS_M;
    const yP = toRad(pLat) * EARTH_RADIUS_M;

    const dx = xB - xA;
    const dy = yB - yA;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        const d = haversineDistanceM(pLat, pLon, aLat, aLon);
        return { t: 0, lateralDistanceM: d, projLat: aLat, projLon: aLon };
    }

    let t = ((xP - xA) * dx + (yP - yA) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projLat = aLat + t * (bLat - aLat);
    const projLon = aLon + t * (bLon - aLon);
    const lateralDistanceM = haversineDistanceM(pLat, pLon, projLat, projLon);

    return { t, lateralDistanceM, projLat, projLon };
}

/**
 * Projeta um ponto geográfico sobre toda a rota.
 * Retorna o melhor segmento, offset acumulado na rota em metros e distância lateral.
 */
export function projectPointToRoute(pointLat, pointLon, routeCoords, cumulativeDistances) {
    if (!routeCoords || routeCoords.length < 2) {
        return {
            segmentIndex: 0,
            projectedRouteOffsetM: 0,
            lateralDistanceM: 0,
            projLat: pointLat,
            projLon: pointLon
        };
    }

    let bestSegment = 0;
    let minLateral = Infinity;
    let bestT = 0;
    let bestProjLat = routeCoords[0][0];
    let bestProjLon = routeCoords[0][1];

    for (let i = 0; i < routeCoords.length - 1; i++) {
        const proj = projectPointToSegment(
            pointLat, pointLon,
            routeCoords[i][0], routeCoords[i][1],
            routeCoords[i + 1][0], routeCoords[i + 1][1]
        );

        if (proj.lateralDistanceM < minLateral) {
            minLateral = proj.lateralDistanceM;
            bestSegment = i;
            bestT = proj.t;
            bestProjLat = proj.projLat;
            bestProjLon = proj.projLon;
        }
    }

    const segStartDist = cumulativeDistances[bestSegment] || 0;
    const segLen = (cumulativeDistances[bestSegment + 1] || segStartDist) - segStartDist;
    const projectedRouteOffsetM = segStartDist + (bestT * segLen);

    return {
        segmentIndex: bestSegment,
        projectedRouteOffsetM: Math.round(projectedRouteOffsetM * 10) / 10,
        lateralDistanceM: Math.round(minLateral * 10) / 10,
        projLat: bestProjLat,
        projLon: bestProjLon
    };
}

/**
 * Interpola coordenadas geográficas e heading na rota a uma dada distância percorrida.
 * @param {number} distanceM Distância percorrida em metros desde a origem
 * @param {Array<[number, number]>} routeCoords Coordenadas [[lat, lon], ...]
 * @param {Array<number>} cumulativeDistances Array pré-computado de distâncias
 */
export function interpolatePositionAtDistance(distanceM, routeCoords, cumulativeDistances) {
    if (!routeCoords || routeCoords.length === 0) {
        return { lat: 0, lon: 0, heading: 0, segmentIndex: 0, remainingDistanceM: 0 };
    }
    if (routeCoords.length === 1) {
        return { lat: routeCoords[0][0], lon: routeCoords[0][1], heading: 0, segmentIndex: 0, remainingDistanceM: 0 };
    }

    const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];
    const clampedDist = Math.max(0, Math.min(distanceM, totalDistance));

    let segIdx = 0;
    while (segIdx < cumulativeDistances.length - 2 && cumulativeDistances[segIdx + 1] < clampedDist) {
        segIdx++;
    }

    const segStart = cumulativeDistances[segIdx];
    const segEnd = cumulativeDistances[segIdx + 1];
    const segLen = segEnd - segStart;

    let t = 0;
    if (segLen > 0) {
        t = (clampedDist - segStart) / segLen;
    }

    const lat = routeCoords[segIdx][0] + t * (routeCoords[segIdx + 1][0] - routeCoords[segIdx][0]);
    const lon = routeCoords[segIdx][1] + t * (routeCoords[segIdx + 1][1] - routeCoords[segIdx][1]);

    const heading = calculateBearing(
        routeCoords[segIdx][0], routeCoords[segIdx][1],
        routeCoords[segIdx + 1][0], routeCoords[segIdx + 1][1]
    );

    return {
        lat,
        lon,
        heading,
        segmentIndex: segIdx,
        remainingDistanceM: Math.max(0, totalDistance - clampedDist)
    };
}
