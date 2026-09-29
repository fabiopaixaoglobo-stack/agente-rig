/**
 * RIT DRIVE — Ícones Vetoriais de Manobra para Cockpit de Navegação
 * Setas nítidas de alto contraste legíveis à distância para o Top Banner.
 */

export function getManeuverSvg(type, color = '#FFFFFF', size = 32) {
    const t = String(type || 'straight').toLowerCase();

    let pathD = '';
    let extra = '';

    switch (t) {
        case 'turn-left':
            // Seta em L apontando para esquerda ↰
            pathD = "M 32 36 L 32 20 C 32 15 29 12 24 12 L 14 12 M 19 7 L 13 12 L 19 17";
            break;

        case 'turn-right':
            // Seta em L apontando para direita ↱
            pathD = "M 16 36 L 16 20 C 16 15 19 12 24 12 L 34 12 M 29 7 L 35 12 L 29 17";
            break;

        case 'slight-left':
            // Curva suave à esquerda
            pathD = "M 28 36 C 28 26 25 18 16 13 M 16 20 L 15 12 L 23 12";
            break;

        case 'slight-right':
            // Curva suave à direita
            pathD = "M 20 36 C 20 26 23 18 32 13 M 32 20 L 33 12 L 25 12";
            break;

        case 'sharp-left':
            // Curva fechada à esquerda
            pathD = "M 32 36 L 32 24 C 32 16 26 12 18 12 L 12 16 M 14 9 L 11 16 L 18 19";
            break;

        case 'sharp-right':
            // Curva fechada à direita
            pathD = "M 16 36 L 16 24 C 16 16 22 12 30 12 L 36 16 M 34 9 L 37 16 L 30 19";
            break;

        case 'u-turn':
            // Retorno
            pathD = "M 32 36 L 32 20 C 32 12 16 12 16 20 L 16 34 M 11 28 L 16 35 L 21 28";
            break;

        case 'roundabout':
            // Rotatória
            pathD = "M 24 38 L 24 32 M 24 14 L 24 8 M 19 13 L 24 8 L 29 13";
            extra = `
                <circle cx="24" cy="23" r="8" fill="none" stroke="${color}" stroke-width="4.5" stroke-dasharray="32 12"/>
            `;
            break;

        case 'depart':
            // Ponto de partida
            pathD = "M 24 36 L 24 14 M 18 19 L 24 13 L 30 19";
            extra = `<circle cx="24" cy="38" r="3" fill="${color}"/>`;
            break;

        case 'arrive':
            // Chegada / Bandeira de destino
            pathD = "M 16 38 L 16 10 M 16 11 L 33 16 L 16 22";
            extra = `<circle cx="16" cy="38" r="2.5" fill="${color}"/>`;
            break;

        case 'straight':
        default:
            // Seguir em frente ⬆
            pathD = "M 24 38 L 24 12 M 16 19 L 24 11 L 32 19";
            break;
    }

    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" class="rit-maneuver-svg">
            ${extra}
            <path d="${pathD}" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `.trim();
}
