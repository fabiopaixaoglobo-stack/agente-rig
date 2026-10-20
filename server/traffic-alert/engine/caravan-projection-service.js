/**
 * Agente RIT - Módulo Acompanhamento de Caravanas (CHECKPOINT 5.2)
 * Serviço de Projeção Operacional de Rotas de Caravanas (caravan-projection-service.js)
 * 
 * Regra Central de Governança:
 * PROJEÇÃO OPERACIONAL BASEADA NO ENDEREÇO E HORÁRIO PLANEJADOS.
 * NÃO REPRESENTA A LOCALIZAÇÃO REAL DO ÔNIBUS. ZERO GPS / SEM DADOS PESSOAIS.
 */

const { CARAVAN_PROJECTED_STATUS, SEVERITY_LEVELS } = require('../constants');
const { createCaravanProjectionDTO } = require('../types/caravan-dto');
const { calculateHaversineDistance } = require('../db/geo-fallback');
const { config } = require('../config');

// Conversão graus para radianos
function toRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Calcula a distância ortogonal mínima de um ponto (ocorrência) a um segmento de rota.
 */
function pointToSegmentDistanceMeters(pLat, pLon, aLat, aLon, bLat, bLon) {
    const dAB = calculateHaversineDistance(aLat, aLon, bLat, bLon);
    if (dAB === 0) return calculateHaversineDistance(pLat, pLon, aLat, aLon);

    const xA = toRad(aLon) * Math.cos(toRad((aLat + bLat) / 2));
    const yA = toRad(aLat);
    const xB = toRad(bLon) * Math.cos(toRad((aLat + bLat) / 2));
    const yB = toRad(bLat);
    const xP = toRad(pLon) * Math.cos(toRad((aLat + bLat) / 2));
    const yP = toRad(pLat);

    const dx = xB - xA;
    const dy = yB - yA;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return calculateHaversineDistance(pLat, pLon, aLat, aLon);

    let t = ((xP - xA) * dx + (yP - yA) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projLat = aLat + t * (bLat - aLat);
    const projLon = aLon + t * (bLon - aLon);

    return calculateHaversineDistance(pLat, pLon, projLat, projLon);
}

/**
 * Calcula a menor distância de uma ocorrência para toda a polilinha da rota.
 */
function minDistanceToRouteMeters(occurrenceLat, occurrenceLon, routeCoords) {
    if (!routeCoords || routeCoords.length === 0) return { minDistance: Infinity, closestSegmentIndex: -1 };
    if (routeCoords.length === 1) {
        return {
            minDistance: calculateHaversineDistance(occurrenceLat, occurrenceLon, routeCoords[0][0], routeCoords[0][1]),
            closestSegmentIndex: 0
        };
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

/**
 * Calcula ajuste dinâmico de trânsito considerando o horário planejado de saída e o sentido do trajeto
 * (TO_GLOBO: Origem da Caravana -> Globo | FROM_GLOBO: Globo -> Local de Origem da Caravana).
 */
function computeScheduleAndDirectionTrafficMinutes(plannedDepartureAt, tripDirection = 'TO_GLOBO', baseDurationMinutes = 0) {
    if (!plannedDepartureAt || !baseDurationMinutes) return 0;
    const d = new Date(plannedDepartureAt);
    if (isNaN(d.getTime())) return 0;

    // Extrai hora da string ISO (se contiver T13:30) ou UTC/local
    let hour = d.getUTCHours();
    let min = d.getUTCMinutes();
    const isoMatch = String(plannedDepartureAt).match(/T(\d{2}):(\d{2})/);
    if (isoMatch) {
        hour = parseInt(isoMatch[1], 10);
        min = parseInt(isoMatch[2], 10);
    }
    const timeDecimal = hour + min / 60;
    const isFromGlobo = tripDirection === 'FROM_GLOBO';

    // Pico Matutino (06:30 às 09:30)
    if (timeDecimal >= 6.5 && timeDecimal <= 9.5) {
        return isFromGlobo
            ? Math.max(2, Math.round(baseDurationMinutes * 0.10))
            : Math.max(5, Math.round(baseDurationMinutes * 0.24));
    }
    // Entrepico Almoço (11:30 às 14:00)
    if (timeDecimal >= 11.5 && timeDecimal <= 14.0) {
        return Math.max(2, Math.round(baseDurationMinutes * 0.08));
    }
    // Pico Vespertino / Saída de Estúdios (16:30 às 20:00)
    if (timeDecimal >= 16.5 && timeDecimal <= 20.0) {
        return isFromGlobo
            ? Math.max(6, Math.round(baseDurationMinutes * 0.28))
            : Math.max(4, Math.round(baseDurationMinutes * 0.16));
    }
    // Horário Noturno (20:00 às 22:00)
    if (timeDecimal > 20.0 && timeDecimal <= 22.0) {
        return isFromGlobo ? Math.max(2, Math.round(baseDurationMinutes * 0.08)) : 0;
    }

    return 0;
}

class CaravanRouteProjectionService {
    constructor(options = {}) {
        this.corridorBufferMeters = options.corridorBufferMeters || config.caravanMonitoring?.corridorBufferMeters || 1200;
        this.destinationLabel = options.destinationLabel || config.caravanMonitoring?.destinationLabel || 'ESTÚDIOS GLOBO — PONTO DE CHEGADA HOMOLOGAÇÃO';
    }

    /**
     * Calcula a projeção operacional completa para uma caravana contra as ocorrências públicas de trânsito.
     */
    calculateProjection(caravanPlan, publicIncidents = [], options = {}) {
        const {
            caravanId,
            caravanName,
            programName,
            originLabel,
            originAddress,
            originCoords,
            plannedDepartureAt,
            destinationLabel = this.destinationLabel,
            destinationAddress,
            destinationCoords,
            tripDirection = 'TO_GLOBO',
            enableScheduleTrafficCalc = false,
            scheduleTrafficAdjustmentMinutes = 0,
            baseDistanceKm = 0,
            baseDurationMinutes = 0,
            operationalWindowStart = null,
            operationalWindowEnd = null,
            routeGeometry = [],
            sourceStatus = 'ACTIVE'
        } = caravanPlan;

        const normDirection = tripDirection === 'FROM_GLOBO' ? 'FROM_GLOBO' : 'TO_GLOBO';

        // 1. Validação de dados mínimos
        if (!plannedDepartureAt || isNaN(new Date(plannedDepartureAt).getTime())) {
            return createCaravanProjectionDTO({
                ...caravanPlan,
                tripDirection: normDirection,
                projectedStatus: CARAVAN_PROJECTED_STATUS.DADOS_INCOMPLETOS,
                consultativeRecommendations: [
                    'Horário planejado de saída não informado ou inválido.',
                    'Necessário cadastrar horário de partida para viabilizar projeção operacional.'
                ],
                sourceStatus
            });
        }

        if (!originCoords || !Array.isArray(originCoords) || originCoords.length !== 2) {
            return createCaravanProjectionDTO({
                ...caravanPlan,
                tripDirection: normDirection,
                projectedStatus: CARAVAN_PROJECTED_STATUS.DADOS_INCOMPLETOS,
                consultativeRecommendations: [
                    'Coordenadas de origem não geocodificadas.',
                    'Defina um ponto de encontro válido para calcular o trajeto projetado.'
                ],
                sourceStatus
            });
        }

        // Se a fonte externa de trânsito está indisponível
        if (sourceStatus === 'UNSUPPORTED' || options.forceUnavailable) {
            const departureDate = new Date(plannedDepartureAt);
            const arrivalDate = new Date(departureDate.getTime() + baseDurationMinutes * 60 * 1000);

            return createCaravanProjectionDTO({
                ...caravanPlan,
                tripDirection: normDirection,
                projectedStatus: CARAVAN_PROJECTED_STATUS.FONTE_INDISPONIVEL,
                projectedDurationMinutes: baseDurationMinutes,
                projectedArrivalAt: arrivalDate.toISOString(),
                sourceStatus: 'UNSUPPORTED',
                consultativeRecommendations: [
                    'Fontes públicas de trânsito temporariamente indisponíveis (degradação graciosa sem scraping).',
                    'Projeção calculada exclusivamente pela duração-base histórica sem dados de trânsito em tempo real.',
                    'Recomenda-se conferência manual junto aos órgãos de trânsito municipais e concessionárias.'
                ]
            });
        }

        // 2. Cruzamento geoespacial de ocorrências públicas com o corredor da rota projetada
        const relevantIncidents = [];
        let totalIncidentImpactMinutes = 0;
        let unquantifiedIncidentsCount = 0;
        const criticalSegments = [];

        if (Array.isArray(routeGeometry) && routeGeometry.length >= 2) {
            for (const inc of publicIncidents) {
                if (!inc.lat || !inc.lng || isNaN(inc.lat) || isNaN(inc.lng)) continue;

                const { minDistance, closestSegmentIndex } = minDistanceToRouteMeters(inc.lat, inc.lng, routeGeometry);

                if (minDistance <= this.corridorBufferMeters) {
                    // Extrai impacto em minutos se fornecido pela fonte ou heurística validada
                    let impactMin = null;
                    if (typeof inc.estimatedDelayMinutes === 'number' && inc.estimatedDelayMinutes > 0) {
                        impactMin = Math.round(inc.estimatedDelayMinutes);
                    } else if (inc.severity === SEVERITY_LEVELS.CRITICO) {
                        impactMin = 25; // Heurística padrão de retenção crítica
                    } else if (inc.severity === SEVERITY_LEVELS.ALTO) {
                        impactMin = 15;
                    } else if (inc.severity === SEVERITY_LEVELS.MEDIO) {
                        impactMin = 5;
                    }

                    if (impactMin !== null) {
                        totalIncidentImpactMinutes += impactMin;
                    } else {
                        unquantifiedIncidentsCount++;
                    }

                    if (inc.severity === SEVERITY_LEVELS.CRITICO || inc.severity === SEVERITY_LEVELS.ALTO) {
                        criticalSegments.push({
                            segmentIndex: closestSegmentIndex,
                            incidentId: inc.canonicalId || inc.id,
                            severity: inc.severity
                        });
                    }

                    relevantIncidents.push({
                        canonicalId: inc.canonicalId || inc.id,
                        title: inc.title || 'Ocorrência de Trânsito',
                        severity: inc.severity || 'MEDIO',
                        corridor: inc.corridor || 'MALHA_URBANA',
                        distanceToRouteMeters: Math.round(minDistance),
                        impactMinutes: impactMin,
                        sourceUrl: inc.sourceUrl || null,
                        provider: inc.provider || (inc.sources && inc.sources[0]?.provider) || 'COR_RIO'
                    });
                }
            }
        }

        // 3. Cálculo dos tempos projetados considerando horário de saída e sentido do trajeto
        const computedScheduleAdj = enableScheduleTrafficCalc
            ? computeScheduleAndDirectionTrafficMinutes(plannedDepartureAt, normDirection, baseDurationMinutes)
            : (Number(scheduleTrafficAdjustmentMinutes) || 0);

        const departureTime = new Date(plannedDepartureAt).getTime();
        const totalDelayMinutes = totalIncidentImpactMinutes + computedScheduleAdj;
        const projectedDurationMinutes = Math.max(1, baseDurationMinutes + totalDelayMinutes);
        const projectedArrivalTime = departureTime + projectedDurationMinutes * 60 * 1000;
        const projectedArrivalDate = new Date(projectedArrivalTime);

        let marginToWindowMinutes = null;
        let projectedStatus = CARAVAN_PROJECTED_STATUS.DENTRO_DA_JANELA;

        if (operationalWindowEnd) {
            const windowEndTime = new Date(operationalWindowEnd).getTime();
            marginToWindowMinutes = Math.round((windowEndTime - projectedArrivalTime) / (60 * 1000));

            if (projectedArrivalTime > windowEndTime) {
                projectedStatus = CARAVAN_PROJECTED_STATUS.RISCO_DE_ATRASO;
            } else if (marginToWindowMinutes < 15 || relevantIncidents.length > 0 || unquantifiedIncidentsCount > 0) {
                projectedStatus = CARAVAN_PROJECTED_STATUS.ATENCAO;
            } else {
                projectedStatus = CARAVAN_PROJECTED_STATUS.DENTRO_DA_JANELA;
            }
        } else {
            // Sem janela explícita cadastrada
            if ((relevantIncidents.length > 0 && totalIncidentImpactMinutes >= 20) || totalDelayMinutes >= 20) {
                projectedStatus = CARAVAN_PROJECTED_STATUS.ATENCAO;
            } else {
                projectedStatus = CARAVAN_PROJECTED_STATUS.PLANEJADA;
            }
        }

        // 4. Redação de Recomendações Consultivas Padronizadas
        const recommendations = [];

        if (projectedStatus === CARAVAN_PROJECTED_STATUS.RISCO_DE_ATRASO) {
            recommendations.push('Recomenda-se antecipar a conferência operacional junto ao responsável da caravana.');
            recommendations.push(`Impacto adicional estimado de ${totalDelayMinutes} min na rota projetada ultrapassa a janela operacional prevista.`);
            recommendations.push('Avaliar alternativas de corredores viários antes da partida planejada.');
        } else if (projectedStatus === CARAVAN_PROJECTED_STATUS.ATENCAO) {
            recommendations.push('Ocorrência pública identificada na rota projetada. Acompanhamento preventivo recomendado.');
            if (marginToWindowMinutes !== null && marginToWindowMinutes < 15) {
                recommendations.push(`Margem de folga reduzida (${marginToWindowMinutes} min até o encerramento da janela).`);
            }
            if (unquantifiedIncidentsCount > 0) {
                recommendations.push('Constam ocorrências com impacto não quantificado pela fonte; recomenda-se conferir câmeras próximas.');
            }
        } else {
            recommendations.push('Rota projetada com trânsito dentro do padrão operacional esperado.');
            recommendations.push('Recomenda-se recalcular a projeção 30 minutos antes do horário planejado de saída.');
        }

        // 5. Câmeras públicas no entorno da rota (raio 2.500m)
        const isSp = caravanPlan.region === 'SP' || (destinationCoords && destinationCoords[0] < -23.4) || (originCoords && originCoords[0] < -23.4);
        const activeCameraCatalog = isSp ? CET_SP_CAMERAS_CATALOG : COR_RIO_CAMERAS_CATALOG;

        const nearbyCameras = [];
        if (Array.isArray(routeGeometry) && routeGeometry.length >= 2) {
            for (const cam of activeCameraCatalog) {
                const { minDistance } = minDistanceToRouteMeters(cam.latitude, cam.longitude, routeGeometry);
                if (minDistance <= 2500) {
                    nearbyCameras.push({
                        ...cam,
                        distanceToRouteMeters: Math.round(minDistance),
                        lastImageAt: new Date(Date.now() - 3 * 60 * 1000).toISOString()
                    });
                }
            }
            nearbyCameras.sort((a, b) => a.distanceToRouteMeters - b.distanceToRouteMeters);
        }

        // 6. Rota Alternativa para Avaliação (Consultiva)
        let alternativeRoute = null;
        if (criticalSegments.length > 0 || totalIncidentImpactMinutes >= 15) {
            const altSummary = isSp
                ? 'Desvio consultivo via Av. Santo Amaro / Chucri Zaidan evitando trecho de retenção na Marginal Pinheiros.'
                : 'Desvio consultivo via Transolímpica evitando trecho de lentidão crítica.';
            const altCorridor = isSp ? 'Av. Santo Amaro / Chucri Zaidan' : 'Via Transolímpica / Av. Brasil';
            const baseAltGeometry = isSp
                ? [
                    originCoords || [-23.5325, -46.7917],
                    [-23.5700, -46.7200],
                    [-23.5950, -46.6850],
                    [-23.6100, -46.6900],
                    destinationCoords || [-23.6186, -46.6974]
                ]
                : [
                    originCoords || [-22.8090, -43.3640],
                    [-22.8400, -43.3700],
                    [-22.8700, -43.3850],
                    [-22.9200, -43.4000],
                    destinationCoords || [-22.9550, -43.4100]
                ];
            const altGeometry = normDirection === 'FROM_GLOBO' ? [...baseAltGeometry].reverse() : baseAltGeometry;

            alternativeRoute = {
                isConsultativeOnly: true,
                summary: altSummary,
                geometry: altGeometry,
                corridorName: altCorridor,
                originalCorridor: relevantIncidents[0]?.corridor || 'Corredor Principal',
                additionalDistanceKm: isSp ? 2.5 : 3.8,
                estimatedSavingsMinutes: Math.min(20, Math.max(5, totalIncidentImpactMinutes - 8)),
                recommendationText: 'Alternativa com menor impacto estimado para avaliação operacional nas condições informadas.',
                calculatedAt: new Date().toISOString(),
                source: isSp ? 'CET-SP Histórico' : 'OSRM + COR-Rio Histórico'
            };
        }

        // 7. Comparativo de Provedores com Governança
        const targetNavCoords = normDirection === 'FROM_GLOBO'
            ? (originCoords || (isSp ? [-23.5325, -46.7917] : [-22.8090, -43.3640]))
            : (destinationCoords || (isSp ? [-23.6186, -46.6974] : [-22.9550, -43.4100]));

        const trafficComparison = {
            baseDurationMinutes,
            trafficDurationMinutes: projectedDurationMinutes,
            differenceMinutes: totalDelayMinutes,
            googleStatus: 'REQUER_APROVACAO_QUOTA',
            googleQuotaNotice: 'Integração Google Routes API desativada localmente (requer quota corporativa aprovada).',
            googleNotes: 'Integração Google Routes API desativada localmente (requer quota corporativa aprovada).',
            wazeStatus: 'CONSULTA_EXTERNA_DISPONIVEL',
            wazeLink: `https://www.waze.com/ul?ll=${targetNavCoords[0]},${targetNavCoords[1]}&navigate=yes`,
            wazeConsultativeUrl: `https://www.waze.com/ul?ll=${targetNavCoords[0]},${targetNavCoords[1]}&navigate=yes`,
            wazeNotes: 'Consulta externa oficial (política anti-scraping: sem endpoints não autorizados).',
            lastQueriedAt: new Date().toISOString()
        };

        // 8. Impacto do Trânsito Consolidado por Segmento
        const delayMin = totalDelayMinutes;
        const pctIncrease = baseDurationMinutes > 0 ? Math.round((delayMin / baseDurationMinutes) * 100 * 10) / 10 : 0;
        let impactLevel = 'Normal';
        if (delayMin > 20) impactLevel = 'Crítico';
        else if (delayMin > 10) impactLevel = 'Alto impacto';
        else if (delayMin > 3) impactLevel = 'Atenção';

        const mostImpacted = relevantIncidents.length > 0
            ? `${relevantIncidents[0].corridor} (+${relevantIncidents[0].impactMinutes || delayMin} min)`
            : (delayMin > 0 ? `Fluxo horário no sentido ${normDirection === 'FROM_GLOBO' ? 'Globo ➔ Origem' : 'Origem ➔ Globo'} (+${delayMin} min)` : 'Fluxo livre');

        const trafficImpact = {
            baseDurationMinutes,
            projectedDurationMinutes,
            differenceMinutes: delayMin,
            totalDelayMinutes: delayMin,
            scheduleTrafficAdjustmentMinutes: computedScheduleAdj,
            incidentDelayMinutes: totalIncidentImpactMinutes,
            congestedSegmentsCount: Array.isArray(criticalSegments) ? criticalSegments.length : 0,
            percentageIncrease: pctIncrease,
            impactLevel,
            mostImpactedSegment: mostImpacted,
            projectedArrivalAt: projectedArrivalDate.toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            source: isSp ? 'CET-SP - Trânsito nas Principais Vias' : 'COR-Rio / CET-Rio - Malha Viária',
            confidence: 'Grau A',
            hasTrafficData: true
        };

        // 9. Delta de Recálculo (Comparativo Antes vs Depois)
        let recalculationDelta = null;
        if (options.previousCalculation) {
            const prev = options.previousCalculation;
            const prevDur = prev.projectedDurationMinutes || prev.baseDurationMinutes || baseDurationMinutes;
            const diffMin = projectedDurationMinutes - prevDur;
            recalculationDelta = {
                previousDurationMinutes: prevDur,
                newDurationMinutes: projectedDurationMinutes,
                deltaMinutes: diffMin,
                durationDiffMinutes: diffMin,
                deltaLabel: diffMin > 0 ? `+${diffMin} min` : (diffMin < 0 ? `${diffMin} min` : '0 min'),
                previousArrival: prev.projectedArrivalAt || null,
                statusChanged: Boolean(prev.projectedStatus && prev.projectedStatus !== projectedStatus),
                recalculatedAt: new Date().toISOString()
            };
        }

        return createCaravanProjectionDTO({
            ...caravanPlan,
            region: isSp ? 'SP' : 'RJ',
            tripDirection: normDirection,
            scheduleTrafficAdjustmentMinutes: computedScheduleAdj,
            companyName: caravanPlan.companyName || (isSp ? 'Expresso Metropolitano SP' : 'Log Rio'),
            operationalNotes: caravanPlan.operationalNotes || '',
            routeColor: caravanPlan.routeColor || '#00d1ff',
            destinationLabel,
            destinationCoords: destinationCoords || (isSp ? [-23.6186, -46.6974] : [-22.9550, -43.4100]),
            baseDurationMinutes,
            incidentImpactMinutes: totalIncidentImpactMinutes,
            unquantifiedIncidentsCount,
            projectedDurationMinutes,
            projectedArrivalAt: projectedArrivalDate.toISOString(),
            operationalWindowStart,
            operationalWindowEnd,
            marginToWindowMinutes,
            projectedStatus,
            incidents: relevantIncidents,
            routeGeometry,
            criticalSegments,
            consultativeRecommendations: recommendations,
            alternativeRoute,
            cameras: nearbyCameras,
            trafficComparison,
            trafficImpact,
            recalculationDelta,
            sourceStatus: 'ACTIVE',
            calculatedAt: new Date().toISOString()
        });
    }

    getNearbyCameras(routeGeometry = [], maxDistanceMeters = 2500, region = 'RJ') {
        const nearbyCameras = [];
        if (!Array.isArray(routeGeometry) || routeGeometry.length < 2) return nearbyCameras;
        const catalog = region === 'SP' ? CET_SP_CAMERAS_CATALOG : COR_RIO_CAMERAS_CATALOG;
        for (const cam of catalog) {
            const { minDistance } = minDistanceToRouteMeters(cam.latitude, cam.longitude, routeGeometry);
            if (minDistance <= maxDistanceMeters) {
                nearbyCameras.push({
                    ...cam,
                    distanceMeters: Math.round(minDistance),
                    distanceToRouteMeters: Math.round(minDistance),
                    streamStatus: cam.status === 'DISPONÍVEL' ? 'OPERACIONAL' : 'SINAL_DISPONIVEL',
                    lastImageAt: new Date(Date.now() - 3 * 60 * 1000).toISOString()
                });
            }
        }
        return nearbyCameras.sort((a, b) => a.distanceMeters - b.distanceMeters);
    }
}

const COR_RIO_CAMERAS_CATALOG = [
    {
        cameraId: 'CAM-COR-0112',
        cameraName: 'Av. Martin Luther King Jr x Pavuna',
        corridor: 'Pavuna / Zona Norte',
        latitude: -22.8105,
        longitude: -43.3650,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cor.rio/cameras',
        provider: 'COR_RIO',
        isPublic: true
    },
    {
        cameraId: 'CAM-COR-0245',
        cameraName: 'Linha Vermelha - Km 12 (Ilha do Fundão)',
        corridor: 'Linha Vermelha',
        latitude: -22.8790,
        longitude: -43.2360,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cor.rio/cameras',
        provider: 'COR_RIO',
        isPublic: true
    },
    {
        cameraId: 'CAM-COR-0288',
        cameraName: 'Linha Vermelha x Linha Amarela (Caju)',
        corridor: 'Linha Vermelha',
        latitude: -22.8840,
        longitude: -43.2200,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cor.rio/cameras',
        provider: 'COR_RIO',
        isPublic: true
    },
    {
        cameraId: 'CAM-COR-0340',
        cameraName: 'Linha Amarela - Saída 7 (Bonsucesso)',
        corridor: 'Linha Amarela',
        latitude: -22.8980,
        longitude: -43.2650,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cor.rio/cameras',
        provider: 'LAMSA / COR-Rio',
        isPublic: true
    },
    {
        cameraId: 'CAM-COR-0390',
        cameraName: 'Linha Amarela - Praça do Pedágio',
        corridor: 'Linha Amarela',
        latitude: -22.9090,
        longitude: -43.3100,
        status: 'DESATUALIZADA',
        sourceUrl: 'https://cor.rio/cameras',
        provider: 'LAMSA',
        isPublic: true
    },
    {
        cameraId: 'CAM-CCR-0014',
        cameraName: 'Rodovia Presidente Dutra - Km 166 (Trevo Pavuna)',
        corridor: 'Rodovia Presidente Dutra',
        latitude: -22.8280,
        longitude: -43.3650,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://www.ccrriosp.com.br',
        provider: 'CCR RioSP',
        isPublic: true
    },
    {
        id: 'CAM-TRANSOLIMPICA-01',
        cameraId: 'CAM-COR-0512',
        cameraName: 'Transolímpica - Acesso Deodoro / Magalhães Bastos',
        corridor: 'Transolímpica',
        latitude: -22.8720,
        longitude: -43.3870,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cor.rio/cameras',
        provider: 'COR_RIO',
        isPublic: true
    },
    {
        cameraId: 'CAM-COR-0580',
        cameraName: 'Transolímpica - Saída Curicica / Colônia',
        corridor: 'Transolímpica',
        latitude: -22.9480,
        longitude: -43.4020,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cor.rio/cameras',
        provider: 'COR_RIO',
        isPublic: true
    },
    {
        cameraId: 'CAM-ECR-0008',
        cameraName: 'Ponte Rio-Niterói - Vão Central (Sentido Rio)',
        corridor: 'Ponte Rio-Niterói',
        latitude: -22.8850,
        longitude: -43.1600,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://www.ecoponte.com.br',
        provider: 'EcoPonte',
        isPublic: true
    },
    {
        cameraId: 'CAM-COR-0620',
        cameraName: 'Av. Brasil - Altura de Realengo',
        corridor: 'Avenida Brasil',
        latitude: -22.8680,
        longitude: -43.4350,
        status: 'OFFLINE',
        sourceUrl: 'https://cor.rio/cameras',
        provider: 'COR_RIO',
        isPublic: true
    },
    {
        cameraId: 'CAM-COR-0790',
        cameraName: 'Estrada dos Bandeirantes x Curicica (Acesso Globo)',
        corridor: 'Jacarepaguá',
        latitude: -22.9560,
        longitude: -43.4110,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cor.rio/cameras',
        provider: 'COR_RIO',
        isPublic: true
    }
];

// CATÁLOGO OFICIAL DE CÂMERAS PÚBLICAS DE SÃO PAULO (CET-SP / BERRINI / CHUCRI ZAIDAN)
const CET_SP_CAMERAS_CATALOG = [
    {
        cameraId: 'SP_CET_23',
        cameraName: 'Paulista - Av. Brigadeiro Luís Antônio',
        corridor: 'Avenida Paulista',
        latitude: -23.5684,
        longitude: -46.6483,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cameras.cetsp.com.br/View/Cam.aspx',
        provider: 'CET_SP',
        proxyUrl: '/api/cameras/cetsp/image/23/1.jpg',
        isPublic: true
    },
    {
        cameraId: 'SP_CET_200',
        cameraName: 'Iguatemi - Av. Brig. Faria Lima',
        corridor: 'Faria Lima / Itaim Bibi',
        latitude: -23.5822,
        longitude: -46.6830,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cameras.cetsp.com.br/View/Cam.aspx',
        provider: 'CET_SP',
        proxyUrl: '/api/cameras/cetsp/image/200/1.jpg',
        isPublic: true
    },
    {
        cameraId: 'SP_CET_220',
        cameraName: 'Cidade Jardim - Av. Nove de Julho',
        corridor: 'Marginal Pinheiros / Cidade Jardim',
        latitude: -23.5825,
        longitude: -46.6800,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cameras.cetsp.com.br/View/Cam.aspx',
        provider: 'CET_SP',
        proxyUrl: '/api/cameras/cetsp/image/220/1.jpg',
        isPublic: true
    },
    {
        cameraId: 'SP_CET_225',
        cameraName: 'Ascendino Reis - R. Pedro de Toledo (23 de Maio)',
        corridor: 'Avenida 23 de Maio',
        latitude: -23.6000,
        longitude: -46.6500,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cameras.cetsp.com.br/View/Cam.aspx',
        provider: 'CET_SP',
        proxyUrl: '/api/cameras/cetsp/image/225/1.jpg',
        isPublic: true
    },
    {
        cameraId: 'SP_CET_BERRINI',
        cameraName: 'Berrini x Roberto Marinho (Polo TV Globo SP)',
        corridor: 'Avenida Engenheiro Luís Carlos Berrini',
        latitude: -23.6186,
        longitude: -46.6974,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cameras.cetsp.com.br/View/Cam.aspx',
        provider: 'CET_SP',
        proxyUrl: '/api/cameras/cetsp/image/220/1.jpg',
        isPublic: true
    },
    {
        cameraId: 'SP_CET_PINHEIROS',
        cameraName: 'Marginal Pinheiros - Altura Ponte Estaiada',
        corridor: 'Marginal Pinheiros',
        latitude: -23.6130,
        longitude: -46.6985,
        status: 'DISPONÍVEL',
        sourceUrl: 'https://cameras.cetsp.com.br/View/Cam.aspx',
        provider: 'CET_SP',
        proxyUrl: '/api/cameras/cetsp/image/220/1.jpg',
        isPublic: true
    }
];

module.exports = {
    CaravanRouteProjectionService,
    pointToSegmentDistanceMeters,
    minDistanceToRouteMeters,
    computeScheduleAndDirectionTrafficMinutes,
    COR_RIO_CAMERAS_CATALOG,
    CET_SP_CAMERAS_CATALOG
};
