/**
 * RIT DRIVE — Marcador Vetorial do Veículo em Navegação
 * Renderiza o ícone do carro com rotação por heading, faróis e pulso de posicionamento.
 */

export function getVehicleMarkerSvg(headingDeg = 0) {
    return `
        <div class="rit-vehicle-container" style="position:relative; width:52px; height:52px; transform:translate(-50%, -50%); pointer-events:none;">
            <!-- Feixe de luz / Faróis apontando para a frente (direção do heading) -->
            <div class="vehicle-headlights" style="transform: rotate(${headingDeg}deg); transform-origin: center center; position:absolute; width:52px; height:52px;">
                <svg viewBox="0 0 52 52" width="52" height="52">
                    <defs>
                        <linearGradient id="beamGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                            <stop offset="0%" stop-color="#00D1FF" stop-opacity="0.35"/>
                            <stop offset="100%" stop-color="#00D1FF" stop-opacity="0.0"/>
                        </linearGradient>
                    </defs>
                    <!-- Cone do farol projetado à frente -->
                    <polygon points="26,20 10,2 42,2" fill="url(#beamGrad)"/>
                </svg>
            </div>

            <!-- Chassi do Veículo com rotação precisa -->
            <div class="vehicle-chassis-wrapper" style="transform: rotate(${headingDeg}deg); transform-origin: center center; position:absolute; width:52px; height:52px; transition: transform 0.15s linear;">
                <svg viewBox="0 0 52 52" width="52" height="52">
                    <defs>
                        <filter id="carShadow" x="-30%" y="-30%" width="160%" height="160%">
                            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.6"/>
                        </filter>
                    </defs>

                    <!-- Sombra do veículo -->
                    <rect x="18" y="14" width="16" height="26" rx="6" fill="#030712" opacity="0.4" filter="url(#carShadow)"/>

                    <!-- Corpo do Carro (Chassi Metálico Ciano RIT) -->
                    <rect x="18" y="14" width="16" height="26" rx="5" fill="#00D1FF" stroke="#FFFFFF" stroke-width="1.6"/>

                    <!-- Para-brisa dianteiro -->
                    <path d="M 20 22 L 32 22 L 30 17 L 22 17 Z" fill="#0A1626" opacity="0.9"/>

                    <!-- Teto do veículo -->
                    <rect x="20.5" y="22" width="11" height="10" rx="1.5" fill="#0284C7"/>

                    <!-- Vidro traseiro -->
                    <path d="M 21 33 L 31 33 L 30 35 L 22 35 Z" fill="#0A1626" opacity="0.8"/>

                    <!-- Faróis dianteiros brilhantes -->
                    <circle cx="20.5" cy="15" r="1.4" fill="#FFFFFF"/>
                    <circle cx="31.5" cy="15" r="1.4" fill="#FFFFFF"/>

                    <!-- Lanternas traseiras vermelhas -->
                    <rect x="19.5" y="38" width="3" height="1.4" rx="0.5" fill="#EF4444"/>
                    <rect x="29.5" y="38" width="3" height="1.4" rx="0.5" fill="#EF4444"/>
                </svg>
            </div>
        </div>
    `.trim();
}

/**
 * Cria o L.divIcon para o marcador do veículo com suporte a rotação dinâmica.
 */
export function createVehicleLeafletIcon(L, headingDeg = 0) {
    return L.divIcon({
        className: 'leaflet-rit-vehicle-marker',
        html: getVehicleMarkerSvg(headingDeg),
        iconSize: [0, 0],
        iconAnchor: [0, 0]
    });
}
