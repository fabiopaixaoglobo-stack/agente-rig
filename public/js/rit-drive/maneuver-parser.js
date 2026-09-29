/**
 * RIT DRIVE — Parser e Normalizador de Manobras Veiculares
 * Processa passos (steps) do OSRM ou geometrias de fallback
 * em instruções padronizadas de cockpit.
 */

export const MANEUVER_TYPES = {
    DEPART: 'depart',
    STRAIGHT: 'straight',
    TURN_LEFT: 'turn-left',
    TURN_RIGHT: 'turn-right',
    SLIGHT_LEFT: 'slight-left',
    SLIGHT_RIGHT: 'slight-right',
    SHARP_LEFT: 'sharp-left',
    SHARP_RIGHT: 'sharp-right',
    UTURN: 'u-turn',
    ROUNDABOUT: 'roundabout',
    ARRIVE: 'arrive'
};

/**
 * Normaliza o tipo e modificador de manobra do OSRM para um tipo padronizado RIT Drive.
 */
export function normalizeManeuverType(type, modifier) {
    const t = String(type || '').toLowerCase();
    const m = String(modifier || '').toLowerCase();

    if (t === 'depart') return MANEUVER_TYPES.DEPART;
    if (t === 'arrive') return MANEUVER_TYPES.ARRIVE;
    if (t.includes('roundabout') || t.includes('rotary')) return MANEUVER_TYPES.ROUNDABOUT;

    if (m === 'uturn') return MANEUVER_TYPES.UTURN;
    if (m === 'sharp left') return MANEUVER_TYPES.SHARP_LEFT;
    if (m === 'sharp right') return MANEUVER_TYPES.SHARP_RIGHT;
    if (m === 'slight left') return MANEUVER_TYPES.SLIGHT_LEFT;
    if (m === 'slight right') return MANEUVER_TYPES.SLIGHT_RIGHT;
    if (m === 'left') return MANEUVER_TYPES.TURN_LEFT;
    if (m === 'right') return MANEUVER_TYPES.TURN_RIGHT;
    if (m === 'straight' || t === 'continue' || t === 'new name') return MANEUVER_TYPES.STRAIGHT;

    return MANEUVER_TYPES.STRAIGHT;
}

/**
 * Sanitiza e normaliza nomes de vias sem inventar dados.
 */
export function sanitizeStreetName(name) {
    if (!name || typeof name !== 'string') return 'Via de ligação';
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === 'unnamed' || trimmed === 'sem nome') {
        return 'Via local';
    }
    return trimmed;
}

/**
 * Formata distância em metros de forma amigável para motoristas.
 */
export function formatDistance(meters) {
    const m = Math.round(Number(meters) || 0);
    if (m < 50) return 'Agora';
    if (m < 1000) return `${m} m`;
    const km = (m / 1000).toFixed(1).replace('.', ',');
    return `${km} km`;
}

/**
 * Formata tempo estimado em minutos / horas.
 */
export function formatDuration(seconds) {
    const s = Math.round(Number(seconds) || 0);
    if (s < 60) return '< 1 min';
    const mins = Math.round(s / 60);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}min`;
}

/**
 * Extrai lista de manobras normalizadas a partir de rota OSRM com steps=true.
 */
export function parseRouteSteps(route) {
    if (!route || !route.legs || route.legs.length === 0) {
        return generateFallbackSteps(route);
    }

    const steps = [];
    let accumulatedDistanceM = 0;

    for (const leg of route.legs) {
        if (!Array.isArray(leg.steps) || leg.steps.length === 0) continue;

        for (let i = 0; i < leg.steps.length; i++) {
            const step = leg.steps[i];
            const m = step.maneuver || {};
            const type = normalizeManeuverType(m.type, m.modifier);
            const streetName = sanitizeStreetName(step.name);
            const distance = Math.round(step.distance || 0);
            const duration = Math.round(step.duration || 0);

            steps.push({
                stepIndex: steps.length,
                type,
                modifier: m.modifier || 'straight',
                streetName,
                instruction: step.maneuver?.instruction || buildDefaultInstruction(type, streetName),
                distanceM: distance,
                durationS: duration,
                startOffsetM: accumulatedDistanceM,
                endOffsetM: accumulatedDistanceM + distance,
                location: m.location ? [m.location[1], m.location[0]] : null // [lat, lon]
            });

            accumulatedDistanceM += distance;
        }
    }

    if (steps.length === 0) {
        return generateFallbackSteps(route);
    }

    return steps;
}

/**
 * Gera passos determinísticos se a rota não contiver steps detalhados.
 */
function generateFallbackSteps(route) {
    const totalDist = route?.distance || 1000;
    const totalDur = route?.duration || 120;

    return [
        {
            stepIndex: 0,
            type: MANEUVER_TYPES.DEPART,
            streetName: 'Ponto de Partida',
            instruction: 'Siga na via principal',
            distanceM: Math.round(totalDist * 0.8),
            durationS: Math.round(totalDur * 0.8),
            startOffsetM: 0,
            endOffsetM: Math.round(totalDist * 0.8)
        },
        {
            stepIndex: 1,
            type: MANEUVER_TYPES.ARRIVE,
            streetName: 'Destino',
            instruction: 'Você chegou ao seu destino',
            distanceM: Math.round(totalDist * 0.2),
            durationS: Math.round(totalDur * 0.2),
            startOffsetM: Math.round(totalDist * 0.8),
            endOffsetM: totalDist
        }
    ];
}

function buildDefaultInstruction(type, streetName) {
    switch (type) {
        case MANEUVER_TYPES.DEPART: return `Siga em direção a ${streetName}`;
        case MANEUVER_TYPES.TURN_LEFT: return `Vire à esquerda na ${streetName}`;
        case MANEUVER_TYPES.TURN_RIGHT: return `Vire à direita na ${streetName}`;
        case MANEUVER_TYPES.SLIGHT_LEFT: return `Mantenha-se à esquerda na ${streetName}`;
        case MANEUVER_TYPES.SLIGHT_RIGHT: return `Mantenha-se à direita na ${streetName}`;
        case MANEUVER_TYPES.UTURN: return `Faça o retorno na ${streetName}`;
        case MANEUVER_TYPES.ROUNDABOUT: return `Na rotatória, continue na ${streetName}`;
        case MANEUVER_TYPES.ARRIVE: return `Chegada ao destino: ${streetName}`;
        default: return `Continue na ${streetName}`;
    }
}
