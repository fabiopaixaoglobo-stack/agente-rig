/**
 * MOTOR DE INTELIGÊNCIA GEOESPACIAL DE RISCO (RIT RISK ENGINE)
 * Calcula corredores de segurança, cruzamento de rotas e classificação de risco operacional.
 */

// Raio médio da Terra em metros
const EARTH_RADIUS_METERS = 6371000;

function toRad(deg) {
    return deg * (Math.PI / 180);
}

// 1. Distância Haversine entre dois pontos (em metros)
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
}

// 2. Distância de um ponto a um segmento de reta (lat/lon)
function pointToSegmentDistanceMeters(pLat, pLon, aLat, aLon, bLat, bLon) {
    const dAB = haversineDistanceMeters(aLat, aLon, bLat, bLon);
    if (dAB === 0) return haversineDistanceMeters(pLat, pLon, aLat, aLon);

    // Vetorização simples em plano tangente
    const xA = toRad(aLon) * Math.cos(toRad((aLat + bLat) / 2));
    const yA = toRad(aLat);
    const xB = toRad(bLon) * Math.cos(toRad((aLat + bLat) / 2));
    const yB = toRad(bLat);
    const xP = toRad(pLon) * Math.cos(toRad((aLat + bLat) / 2));
    const yP = toRad(pLat);

    const dx = xB - xA;
    const dy = yB - yA;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return haversineDistanceMeters(pLat, pLon, aLat, aLon);

    let t = ((xP - xA) * dx + (yP - yA) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projLat = aLat + t * (bLat - aLat);
    const projLon = aLon + t * (bLon - aLon);

    return haversineDistanceMeters(pLat, pLon, projLat, projLon);
}

// 3. Menor distância de uma ocorrência para toda a rota (Polyline)
function minDistanceToRouteMeters(occurrenceLat, occurrenceLon, routeCoords) {
    if (!routeCoords || routeCoords.length === 0) return Infinity;
    if (routeCoords.length === 1) {
        return haversineDistanceMeters(occurrenceLat, occurrenceLon, routeCoords[0][0], routeCoords[0][1]);
    }

    let minDistance = Infinity;
    let closestSegmentIndex = 0;

    for (let i = 0; i < routeCoords.length - 1; i++) {
        const [aLat, aLon] = routeCoords[i];
        const [bLat, bLon] = routeCoords[i + 1];
        const d = pointToSegmentDistanceMeters(occurrenceLat, occurrenceLon, aLat, aLon, bLat, bLon);
        if (d < minDistance) {
            minDistance = d;
            closestSegmentIndex = i;
        }
    }

    return { minDistance, closestSegmentIndex };
}

// 4. Analisar Rota vs Ocorrências
function analisarRiscoRota(routeCoords, allOccurrences, bufferMetros = 1000) {
    const buffer = parseInt(bufferMetros, 10) || 1000;
    console.log(`[ROTA-CHECK] Analisando ${routeCoords.length} nós de rota com buffer de ${buffer}m contra ${allOccurrences.length} ocorrências ativas...`);

    const ocorrenciasNoCorredor = [];
    let menorDistanciaGeral = Infinity;
    let ocorrenciaMaisProxima = null;

    for (const occ of allOccurrences) {
        if (!occ.lat || !occ.lon || isNaN(occ.lat) || isNaN(occ.lon)) continue;

        const { minDistance, closestSegmentIndex } = minDistanceToRouteMeters(occ.lat, occ.lon, routeCoords);

        if (minDistance < menorDistanciaGeral) {
            menorDistanciaGeral = minDistance;
            ocorrenciaMaisProxima = { ...occ, distanciaMetros: Math.round(minDistance) };
        }

        if (minDistance <= buffer) {
            ocorrenciasNoCorredor.push({
                ...occ,
                distanciaMetros: Math.round(minDistance),
                distanciaKm: (minDistance / 1000).toFixed(2),
                segmentoIndex: closestSegmentIndex
            });
        }
    }

    // Ordenar ocorrências do corredor pela mais próxima da rota
    ocorrenciasNoCorredor.sort((a, b) => a.distanciaMetros - b.distanciaMetros);

    // Contagens por tipo e fonte
    let tiroteios = 0;
    let operacoes = 0;
    let disparos = 0;
    let outros = 0;
    let ottCount = 0;
    let fogoCount = 0;

    ocorrenciasNoCorredor.forEach(o => {
        const t = (o.tipo || '').toLowerCase();
        if (t.includes('tiroteio')) tiroteios++;
        else if (t.includes('operaç') || t.includes('policial')) operacoes++;
        else if (t.includes('disparo')) disparos++;
        else outros++;

        if ((o.fonte || '').toLowerCase().includes('ott')) ottCount++;
        else fogoCount++;
    });

    // 5. Matriz de Classificação de Risco
    let nivelRisco = 'BAIXO';
    let corRisco = '#10b981'; // Verde
    let recomendacao = 'Trajeto sem ocorrências de segurança relevantes no corredor monitorado. Prossiga normalmente.';
    let iconeRisco = '🟢';

    const totalCriticos = tiroteios + operacoes;
    const menorDistancia = ocorrenciasNoCorredor.length > 0 ? ocorrenciasNoCorredor[0].distanciaMetros : menorDistanciaGeral;

    if (totalCriticos >= 2 && menorDistancia <= 500 || menorDistancia <= 300 && totalCriticos >= 1 || ocorrenciasNoCorredor.length >= 4) {
        nivelRisco = 'CRÍTICO';
        corRisco = '#ef4444'; // Vermelho
        iconeRisco = '🔴';
        recomendacao = 'RISCO CRÍTICO: Conflitos armados ou operações de alto impacto na rota imediata. Recomenda-se DESVIAR O TRAJETO ou aguardar autorização do supervisor.';
    } else if (totalCriticos >= 1 && menorDistancia <= 1000 || disparos >= 2 && menorDistancia <= 1000 || ocorrenciasNoCorredor.length >= 2) {
        nivelRisco = 'ALTO';
        corRisco = '#f97316'; // Laranja
        iconeRisco = '🟠';
        recomendacao = 'RISCO ALTO: Ocorrências de disparos ou operações ativas nas imediações do trajeto. Alerte o motorista e monitore em tempo real.';
    } else if (ocorrenciasNoCorredor.length >= 1 || (menorDistanciaGeral <= 2000 && menorDistanciaGeral > buffer)) {
        nivelRisco = 'MODERADO';
        corRisco = '#f59e0b'; // Amarelo
        iconeRisco = '🟡';
        recomendacao = 'RISCO MODERADO: Ocorrências registradas na região adjacente. Manter velocidade regular e atenção a desvios.';
    }

    console.log(`[RISCO-CALCULADO] Nível: ${nivelRisco} | Corredor (${buffer}m): ${ocorrenciasNoCorredor.length} eventos | Menor Distância: ${Math.round(menorDistancia)}m | Tiroteios: ${tiroteios}, Operações: ${operacoes}, Disparos: ${disparos}`);

    return {
        nivelRisco,
        corRisco,
        iconeRisco,
        recomendacao,
        bufferMetros: buffer,
        totalNoCorredor: ocorrenciasNoCorredor.length,
        menorDistanciaMetros: Math.round(menorDistancia),
        menorDistanciaKm: (menorDistancia / 1000).toFixed(2),
        ocorrenciaMaisProxima,
        ocorrenciasNoCorredor,
        estatisticas: {
            tiroteios,
            operacoes,
            disparos,
            outros,
            porFonte: {
                ott: ottCount,
                fogoCruzado: fogoCount
            }
        }
    };
}

module.exports = {
    haversineDistanceMeters,
    pointToSegmentDistanceMeters,
    analisarRiscoRota
};
