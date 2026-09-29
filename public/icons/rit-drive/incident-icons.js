/**
 * RIT DRIVE — Biblioteca de Ícones Vetoriais de Incidentes
 * Renderiza ícones circulares SVG fiéis ao padrão visual homologado do RIT Drive:
 * - Acidente, Assalto, Alagamento, Engarrafamento, Blitz, Obra, Risco Alto, Ponto Seguro,
 * - Tiroteio, Operação Policial, Disparo Ouvido.
 */

export const INCIDENT_COLORS = {
    'acidente': { ring: '#EF4444', bg: '#FFFFFF', icon: '#EF4444' },
    'assalto': { ring: '#DC2626', bg: '#FFFFFF', icon: '#DC2626' },
    'alagamento': { ring: '#0284C7', bg: '#FFFFFF', icon: '#0284C7' },
    'engarrafamento': { ring: '#F59E0B', bg: '#FFFFFF', icon: '#D97706' },
    'blitz': { ring: '#2563EB', bg: '#FFFFFF', icon: '#1D4ED8' },
    'obra': { ring: '#F97316', bg: '#FFFFFF', icon: '#EA580C' },
    'risco-alto': { ring: '#E11D48', bg: '#FFFFFF', icon: '#E11D48' },
    'ponto-seguro': { ring: '#10B981', bg: '#FFFFFF', icon: '#059669' },
    'tiroteio': { ring: '#991B1B', bg: '#FFFFFF', icon: '#991B1B' },
    'operacao-policial': { ring: '#1E3A8A', bg: '#FFFFFF', icon: '#1E3A8A' },
    'disparo-ouvido': { ring: '#C2410C', bg: '#FFFFFF', icon: '#C2410C' }
};

/**
 * Retorna o código SVG inline de um ícone circular de incidente.
 * @param {string} type Tipo de incidente
 * @param {number} size Diâmetro em pixels (default: 36)
 */
export function getIncidentSvg(type, size = 36) {
    const key = (type || 'risco-alto').toLowerCase();
    const colors = INCIDENT_COLORS[key] || INCIDENT_COLORS['risco-alto'];

    let innerGlyph = '';

    switch (key) {
        case 'acidente':
            // Dois veículos colidindo com fagulhas de impacto
            innerGlyph = `
                <path d="M12 21 L18 21 L19 24 L25 24 L26 21 L28 21 L29 25 L11 25 Z" fill="#64748B"/>
                <path d="M14 21 L16 16 L23 16 L25 21 Z" fill="#94A3B8"/>
                <path d="M28 21 L25 17 L22 17 L21 21 Z" fill="#EF4444"/>
                <path d="M22 13 L23 8 L24 13 L27 10 L24 14 L28 15 L23 16 L25 19 L21 16 Z" fill="#EF4444"/>
                <circle cx="15" cy="25" r="2.5" fill="#1E293B"/>
                <circle cx="25" cy="25" r="2.5" fill="#1E293B"/>
            `;
            break;

        case 'assalto':
            // Silhueta com capuz / máscara e braço com objeto empunhado
            innerGlyph = `
                <circle cx="24" cy="14" r="5" fill="#DC2626"/>
                <path d="M21 13 Q24 11 27 13 Q24 15 21 13 Z" fill="#FFFFFF"/>
                <circle cx="23" cy="13" r="0.8" fill="#1E293B"/>
                <circle cx="25" cy="13" r="0.8" fill="#1E293B"/>
                <path d="M17 28 C17 22 20 20 24 20 C28 20 31 22 31 28 Z" fill="#DC2626"/>
                <path d="M30 22 L34 16 L37 18 L34 23 Z" fill="#DC2626"/>
                <path d="M36 15 L38 12 L39 17 Z" fill="#991B1B"/>
            `;
            break;

        case 'alagamento':
            // Carro parcialmente submerso com ondas e gotas de água
            innerGlyph = `
                <path d="M15 20 L19 15 L28 15 L32 20 Z" fill="#0284C7"/>
                <path d="M14 20 L33 20 L34 23 L13 23 Z" fill="#0284C7"/>
                <path d="M19 16 L27 16 L26 19 L18 19 Z" fill="#FFFFFF"/>
                <!-- Ondas de água -->
                <path d="M10 26 Q14 23 18 26 T26 26 T34 26 T38 26" stroke="#0284C7" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                <path d="M11 29 Q15 27 19 29 T27 29 T35 29" stroke="#38BDF8" stroke-width="2" fill="none" stroke-linecap="round"/>
                <!-- Gotas de chuva -->
                <path d="M28 10 C28 8 29.5 6 29.5 6 C29.5 6 31 8 31 10 C31 11 30.3 11.8 29.5 11.8 C28.7 11.8 28 11 28 10 Z" fill="#0284C7"/>
                <path d="M33 13 C33 11.5 34.2 10 34.2 10 C34.2 10 35.5 11.5 35.5 13 C35.5 13.8 34.9 14.5 34.2 14.5 C33.5 14.5 33 13.8 33 13 Z" fill="#38BDF8"/>
            `;
            break;

        case 'engarrafamento':
            // Carros empilhados no trânsito com cronômetro
            innerGlyph = `
                <!-- Carro de trás -->
                <rect x="13" y="14" width="10" height="7" rx="2" fill="#FBBF24"/>
                <circle cx="15" cy="21" r="1.5" fill="#78350F"/>
                <circle cx="21" cy="21" r="1.5" fill="#78350F"/>
                <!-- Carro da frente -->
                <rect x="18" y="20" width="12" height="8" rx="2" fill="#D97706"/>
                <circle cx="20.5" cy="28" r="2" fill="#1E293B"/>
                <circle cx="27.5" cy="28" r="2" fill="#1E293B"/>
                <!-- Cronômetro -->
                <circle cx="31" cy="14" r="5.5" fill="#FFF" stroke="#D97706" stroke-width="1.8"/>
                <path d="M31 11.5 L31 14 L33 15.5" stroke="#D97706" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="31" y1="8" x2="31" y2="9.5" stroke="#D97706" stroke-width="1.8" stroke-linecap="round"/>
            `;
            break;

        case 'blitz':
            // Policial com quepe e distintivo, cone e viatura
            innerGlyph = `
                <!-- Quepe policial -->
                <ellipse cx="24" cy="14" rx="7" ry="2.5" fill="#1E3A8A"/>
                <path d="M19 14 Q24 10 29 14 L28 17 L20 17 Z" fill="#1D4ED8"/>
                <circle cx="24" cy="14" r="1.2" fill="#FACC15"/>
                <!-- Rosto e uniforme -->
                <circle cx="24" cy="19" r="4" fill="#FDE68A"/>
                <path d="M18 29 C18 24 20 22 24 22 C28 22 30 24 30 29 Z" fill="#1E3A8A"/>
                <!-- Gravata / Distintivo -->
                <polygon points="24,23 25.5,26 24,28 22.5,26" fill="#FACC15"/>
                <!-- Cone lateral -->
                <polygon points="13,30 17,30 15.8,23 14.2,23" fill="#EA580C"/>
                <line x1="14" y1="26" x2="16" y2="26" stroke="#FFFFFF" stroke-width="1.2"/>
            `;
            break;

        case 'obra':
            // Capacete de obra com pás e cone
            innerGlyph = `
                <!-- Capacete de segurança -->
                <path d="M16 18 C16 12 32 12 32 18 Z" fill="#EA580C"/>
                <path d="M14 18 L34 18 C34 19 33 20 31 20 L17 20 C15 20 14 19 14 18 Z" fill="#C2410C"/>
                <!-- Cones de obra -->
                <polygon points="15,29 21,29 19,21 17,21" fill="#EA580C"/>
                <line x1="16.5" y1="25" x2="19.5" y2="25" stroke="#FFFFFF" stroke-width="1.5"/>
                <!-- Pá cruzada -->
                <line x1="24" y1="21" x2="31" y2="29" stroke="#64748B" stroke-width="2" stroke-linecap="round"/>
                <polygon points="30,27 34,29 32,32" fill="#475569"/>
            `;
            break;

        case 'risco-alto':
            // Triângulo de advertência com exclamação
            innerGlyph = `
                <polygon points="24,10 36,30 12,30" fill="none" stroke="#E11D48" stroke-width="3" stroke-linejoin="round"/>
                <line x1="24" y1="16" x2="24" y2="23" stroke="#E11D48" stroke-width="3" stroke-linecap="round"/>
                <circle cx="24" cy="27" r="1.6" fill="#E11D48"/>
            `;
            break;

        case 'ponto-seguro':
            // Escudo protetor com casa e sinal positivo
            innerGlyph = `
                <path d="M24 10 L33 14 C33 22 28 28 24 31 C20 28 15 22 15 14 Z" fill="#10B981"/>
                <!-- Casa branca interna -->
                <polygon points="24,15 30,20 28,20 28,26 20,26 20,20 18,20" fill="#FFFFFF"/>
                <rect x="22.5" y="22" width="3" height="4" fill="#10B981"/>
            `;
            break;

        case 'tiroteio':
            // Projéteis e impacto balístico cruzado
            innerGlyph = `
                <circle cx="24" cy="20" r="2.5" fill="#991B1B"/>
                <path d="M24 11 L24 16" stroke="#991B1B" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M24 24 L24 29" stroke="#991B1B" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M15 20 L20 20" stroke="#991B1B" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M28 20 L33 20" stroke="#991B1B" stroke-width="2.2" stroke-linecap="round"/>
                <circle cx="24" cy="20" r="7" fill="none" stroke="#991B1B" stroke-width="1.8" stroke-dasharray="3 2"/>
            `;
            break;

        case 'operacao-policial':
            // Escudo tático com sirene e viatura
            innerGlyph = `
                <path d="M24 11 L33 15 C33 22 28 28 24 30 C20 28 15 22 15 15 Z" fill="#1E3A8A"/>
                <!-- Giroflex azul/vermelho pulsante -->
                <rect x="21" y="16" width="6" height="5" rx="1.5" fill="#EF4444"/>
                <polygon points="21,16 24,13 27,16" fill="#38BDF8"/>
                <circle cx="24" cy="23" r="2" fill="#FFFFFF"/>
            `;
            break;

        case 'disparo-ouvido':
            // Ondas acústicas e munição
            innerGlyph = `
                <path d="M19 16 A6 6 0 0 1 19 26" stroke="#C2410C" stroke-width="2" fill="none" stroke-linecap="round"/>
                <path d="M15 13 A10 10 0 0 1 15 29" stroke="#EA580C" stroke-width="2" fill="none" stroke-linecap="round"/>
                <path d="M23 18 L29 18 L31 21 L29 24 L23 24 Z" fill="#C2410C"/>
                <rect x="21" y="19" width="3" height="4" fill="#9A3412"/>
            `;
            break;

        default:
            innerGlyph = `
                <polygon points="24,11 35,29 13,29" fill="none" stroke="${colors.icon}" stroke-width="3"/>
                <circle cx="24" cy="25" r="1.5" fill="${colors.icon}"/>
                <line x1="24" y1="16" x2="24" y2="22" stroke="${colors.icon}" stroke-width="2.5" stroke-linecap="round"/>
            `;
    }

    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" class="rit-incident-svg rit-incident-${key}">
            <defs>
                <filter id="glow-${key}" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="${colors.ring}" flood-opacity="0.45"/>
                </filter>
            </defs>
            <!-- Fundo circular branco de alto contraste -->
            <circle cx="24" cy="24" r="21" fill="${colors.bg}" filter="url(#glow-${key})"/>
            <!-- Aro externo com cor de identificação operacional -->
            <circle cx="24" cy="24" r="20" fill="none" stroke="${colors.ring}" stroke-width="3"/>
            <!-- Glifo interno da categoria -->
            ${innerGlyph}
        </svg>
    `.trim();
}

/**
 * Retorna um objeto HTML com ícone formatado para uso com Leaflet L.divIcon
 */
export function createLeafletIncidentIcon(L, type, size = 38) {
    return L.divIcon({
        className: `leaflet-incident-marker marker-${type}`,
        html: `<div style="width:${size}px; height:${size}px; transform:translate(-50%, -50%); cursor:pointer;">${getIncidentSvg(type, size)}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
    });
}
