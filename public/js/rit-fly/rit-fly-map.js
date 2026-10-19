/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Gerenciador do Mapa Nacional de Voos em Leaflet
 * Suporte a Camadas de Mapa, Radar Aéreo com Rotação de Proa,
 * Rastro de Voo e Seleção Operacional Integrada
 */

export class RitFlyMap {
    constructor(containerId = 'mapRitFly') {
        this.containerId = containerId;
        this.map = null;
        this.flightsLayer = null;
        this.airportsLayer = null;
        this.trailLayer = null;
        this.activeTrailPolyline = null;
        this.flightMarkers = new Map();
        this.onFlightSelectCallback = null;
        this.onAirportSelectCallback = null;

        // Gerenciamento de Camadas de Mapa (Melhoria 02)
        this.baseLayers = {};
        this.currentBaseLayer = null;
        this.currentBaseLayerKey = 'radar';
    }

    init() {
        const el = document.getElementById(this.containerId);
        if (!el) {
            console.warn(`[RitFlyMap] Container #${this.containerId} não encontrado.`);
            return;
        }

        // Ponto central do Brasil
        const brazilCenter = [-15.7801, -47.9292];
        const initialZoom = 5;

        this.map = L.map(this.containerId, {
            zoomControl: true,
            attributionControl: false,
            preferCanvas: true
        }).setView(brazilCenter, initialZoom);

        // Configuração das 6 Camadas de Mapa Oficiais (Melhoria 02)
        // 1. Radar Aéreo (Dark Tactical Base + Reference Labels)
        const radarBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });
        const radarLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });
        this.baseLayers.radar = L.layerGroup([radarBase, radarLabels]);

        // 2. Mapa Padrão (OpenStreetMap)
        this.baseLayers.padrao = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        });

        // 3. Satélite (Esri World Imagery)
        this.baseLayers.satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });

        // 4. Trânsito (Carto Voyager)
        this.baseLayers.transito = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        });

        // 5. Terreno (Esri World Topo Map)
        this.baseLayers.terreno = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });

        // 6. Modo Escuro (Carto DarkMatter)
        this.baseLayers.escuro = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        });

        // Adiciona a camada inicial padrão (Radar Aéreo)
        this.currentBaseLayer = this.baseLayers.radar;
        this.currentBaseLayer.addTo(this.map);

        // Grupos de Camadas de Sobreposição (permanecem intactos ao trocar o mapa base)
        this.trailLayer = L.layerGroup().addTo(this.map);
        this.airportsLayer = L.layerGroup().addTo(this.map);
        this.flightsLayer = L.layerGroup().addTo(this.map);
    }

    /**
     * Alternância Dinâmica de Camada de Mapa sem recarregar e sem perder marcadores (Melhoria 02)
     */
    setBaseLayer(key) {
        if (!this.map || !this.baseLayers[key]) return;
        if (this.currentBaseLayerKey === key && this.currentBaseLayer) return;

        if (this.currentBaseLayer) {
            this.map.removeLayer(this.currentBaseLayer);
        }

        this.currentBaseLayer = this.baseLayers[key];
        this.currentBaseLayerKey = key;
        this.currentBaseLayer.addTo(this.map);

        // Garante que as camadas de voos, aeroportos e rastros fiquem no topo
        [this.trailLayer, this.airportsLayer, this.flightsLayer].forEach(layerGroup => {
            if (layerGroup?.eachLayer) {
                layerGroup.eachLayer(l => {
                    if (typeof l.bringToFront === 'function') l.bringToFront();
                });
            }
        });
    }

    renderAirports(airports = []) {
        if (!this.airportsLayer) return;
        this.airportsLayer.clearLayers();

        airports.forEach(a => {
            const statusClass = a.statusOperacional === 'NORMAL'
                ? 'fly-status-normal'
                : (a.statusOperacional === 'ATENÇÃO' ? 'fly-status-atencao' : 'fly-status-critico');
            
            const iconHtml = `
                <div class="fly-airport-marker" title="${a.nome} (${a.cidade} - ${a.uf})">
                    <span style="color:#38bdf8;">✈</span> ${a.iata}
                </div>
            `;

            const customIcon = L.divIcon({
                className: 'fly-airport-marker-wrap',
                html: iconHtml,
                iconSize: [44, 20],
                iconAnchor: [22, 10]
            });

            const marker = L.marker([a.lat, a.lng], { icon: customIcon });
            
            const metar = a.clima || {};
            const metarAvailable = a.metarDisponivel !== false && metar.disponivel !== false && metar.condicoes && metar.condicoes !== 'METAR_INDISPONIVEL';
            const metarHtml = metarAvailable
                ? `🌤️ ${metar.condicoes}, ${metar.temperaturaC !== null && metar.temperaturaC !== undefined ? `${metar.temperaturaC}°C` : 'Temp. N/D'}<br/>
                   💨 Vento: ${metar.vento ? metar.vento.descricao : 'N/D'}<br/>
                   👁️ Visibilidade: ${metar.visibilidade ? metar.visibilidade.descricao : 'N/D'}`
                : `⚠️ <strong>METAR:</strong> Fonte meteorológica temporariamente indisponível para ${a.icao}`;

            const popupContent = `
                <div style="font-family:sans-serif; min-width:210px; color:#fff; font-size:11px;">
                    <div style="font-size:12px; font-weight:900; color:#38bdf8; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; margin-bottom:6px;">
                        ${a.nome} (${a.iata}/${a.icao})
                    </div>
                    <div>• <strong>Situação Operacional:</strong> <span class="fly-airport-status-pill ${statusClass}">${a.statusOperacional}</span> (${a.regraVoo})</div>
                    <div>• <strong>Chegadas Detectadas:</strong> ${a.chegadasPrevistas} | <strong>Partidas:</strong> ${a.partidasPrevistas}</div>
                    <div>• <strong>Voos Atrasados:</strong> ${a.voosAtrasados} | <strong>Pontualidade:</strong> ${a.taxaPontualidadePct !== null && a.taxaPontualidadePct !== undefined ? `${a.taxaPontualidadePct}%` : 'N/D'}</div>
                    <div style="margin-top:6px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.05); color:#94a3b8; font-size:10px;">
                        ${metarHtml}
                    </div>
                    <div style="margin-top:8px;">
                        <button onclick="window.ritFlyView && window.ritFlyView.abrirVoosAeroporto('${a.iata}')" style="background:#38bdf8; color:#000; border:none; padding:4px 8px; border-radius:3px; font-size:10px; font-weight:bold; cursor:pointer; width:100%;">
                            🛫 Ver Informes e Voos
                        </button>
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent, { className: 'fly-dark-popup' });

            marker.on('click', () => {
                if (typeof this.onAirportSelectCallback === 'function') {
                    this.onAirportSelectCallback(a);
                }
            });

            this.airportsLayer.addLayer(marker);
        });
    }

    renderFlights(flights = []) {
        if (!this.flightsLayer) return;
        this.flightsLayer.clearLayers();
        this.flightMarkers.clear();

        let skippedInvalidCoords = 0;
        flights.forEach(f => {
            const lat = Number(f.latitude);
            const lng = Number(f.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                skippedInvalidCoords++;
                return;
            }

            const iconHtml = this.createAirplaneIconSvg(f);
            const customIcon = L.divIcon({
                className: 'fly-plane-marker',
                html: iconHtml,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });

            const marker = L.marker([lat, lng], { icon: customIcon });
            
            const popupContent = this.createFlightPopupHtml(f);
            marker.bindPopup(popupContent, { className: 'fly-dark-popup' });

            marker.on('click', () => {
                this.drawFlightTrail(f);
                if (typeof this.onFlightSelectCallback === 'function') {
                    this.onFlightSelectCallback(f);
                }
            });

            this.flightsLayer.addLayer(marker);
            this.flightMarkers.set(f.id, marker);
        });

        if (skippedInvalidCoords > 0) {
            console.warn(`[RitFlyMap] ${skippedInvalidCoords} registro(s) ignorado(s) por coordenadas inválidas.`);
        }
    }

    createAirplaneIconSvg(flight) {
        const cat = (flight.categoria || 'comercial').toLowerCase();
        const callsign = (flight.callsign || '').toUpperCase();
        const comp = (flight.companhia || '').toUpperCase();
        const voo = (flight.numeroVoo || '').toUpperCase();

        let color = '#38bdf8'; // Azul padrão aviação comercial
        let svgInner = '';

        if (cat === 'helicoptero') {
            color = '#10b981'; // Verde Rotor
            svgInner = `
                <circle cx="12" cy="9.5" r="7.4" fill="none" stroke="${color}" stroke-width="0.85" stroke-dasharray="2 2" opacity="0.6" />
                <path d="M12 4.0 C13.7 4.0 14.7 5.8 14.7 8.6 C14.7 11.0 13.7 12.6 12.7 13.5 L12.5 19.4 L15.2 20.1 L15.2 21.1 L12.4 20.7 L12 22.4 L11.6 20.7 L8.8 21.1 L8.8 20.1 L11.5 19.4 L11.3 13.5 C10.3 12.6 9.3 11.0 9.3 8.6 C9.3 5.8 10.3 4.0 12 4.0 Z" fill="${color}" stroke="#090d16" stroke-width="1.05" stroke-linejoin="round" />
                <path d="M5.6 3.1 L18.4 15.9 M18.4 3.1 L5.6 15.9" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.92" />
                <circle cx="12" cy="9.5" r="1.35" fill="#090d16" stroke="${color}" stroke-width="0.8" />
            `;
        } else if (cat === 'executivo') {
            color = '#a855f7'; // Roxo Executivo (Jato Corporativo T-Tail c/ motores traseiros)
            svgInner = `
                <path d="M12 1.0 C12.5 1.0 12.9 2.5 12.9 4.5 L12.9 9.2 L21.8 14.5 L21.8 15.7 L12.9 13.3 L12.9 14.5 L14.3 14.7 L14.3 17.1 L12.8 17.3 L12.7 18.6 L16.3 20.8 L16.3 21.8 L12.4 20.7 L12 22.6 L11.6 20.7 L7.7 21.8 L7.7 20.8 L11.3 18.6 L11.2 17.3 L9.7 17.1 L9.7 14.7 L11.1 14.5 L11.1 13.3 L2.2 15.7 L2.2 14.5 L11.1 9.2 L11.1 4.5 C11.1 2.5 11.5 1.0 12 1.0 Z" fill="${color}" stroke="#090d16" stroke-width="1.05" stroke-linejoin="round" />
                <path d="M11.3 3.9 C11.7 3.4 12.3 3.4 12.7 3.9 L12.8 4.7 C12.3 4.4 11.7 4.4 11.2 4.7 Z" fill="#090d16" opacity="0.7" />
            `;
        } else if (cat === 'cargueiro') {
            color = '#f59e0b'; // Laranja Cargo (Quadrimotor Wide-body)
            svgInner = `
                <path d="M12 1.0 C12.9 1.0 13.5 2.3 13.5 4.2 L13.5 7.8 L16.4 9.5 L16.4 8.3 L17.8 8.3 L17.8 10.3 L19.6 11.4 L19.6 10.3 L20.9 10.3 L20.9 12.1 L23.2 13.6 L23.2 15.1 L13.4 12.5 L13.1 18.0 L17.4 20.4 L17.4 21.7 L12.6 20.4 L12 22.8 L11.4 20.4 L6.6 21.7 L6.6 20.4 L10.9 18.0 L10.6 12.5 L0.8 15.1 L0.8 13.6 L3.1 12.1 L3.1 10.3 L4.4 10.3 L4.4 11.4 L6.2 10.3 L6.2 8.3 L7.6 8.3 L7.6 9.5 L10.5 7.8 L10.5 4.2 C10.5 2.3 11.1 1.0 12 1.0 Z" fill="${color}" stroke="#090d16" stroke-width="1.05" stroke-linejoin="round" />
                <path d="M11.0 3.6 C11.5 3.0 12.5 3.0 13.0 3.6 L13.2 4.5 C12.5 4.2 11.5 4.2 10.8 4.5 Z" fill="#090d16" opacity="0.7" />
            `;
        } else {
            // Diferenciação de Companhia Aérea Comercial (Silhueta Airliner estilo FlightAware)
            if (comp.includes('GOL') || callsign.startsWith('GLO') || voo.startsWith('G3')) {
                color = '#f97316'; // Laranja GOL
            } else if (comp.includes('LATAM') || comp.includes('TAM') || callsign.startsWith('TAM') || callsign.startsWith('LAN') || callsign.startsWith('LPE') || voo.startsWith('LA') || voo.startsWith('JJ')) {
                color = '#f43f5e'; // Magenta LATAM
            } else if (comp.includes('AZUL') || callsign.startsWith('AZU') || callsign.startsWith('ACN') || voo.startsWith('AD')) {
                color = '#38bdf8'; // Azul Claro AZUL
            } else if (comp.includes('VOEPASS') || comp.includes('PASSAREDO') || callsign.startsWith('PTB') || voo.startsWith('2Z')) {
                color = '#10b981'; // Verde VOEPASS
            } else if (comp.includes('ITAPEMIRIM') || callsign.startsWith('IPM')) {
                color = '#facc15'; // Amarelo ITA
            }

            svgInner = `
                <path d="M12 1.1 C12.75 1.1 13.25 2.3 13.25 4.1 L13.25 8.1 L16.2 10.0 L16.2 8.8 C16.2 8.4 16.5 8.1 16.95 8.1 C17.4 8.1 17.7 8.4 17.7 8.8 L17.7 10.95 L22.7 14.1 L22.7 15.5 L13.15 12.75 L12.9 18.1 L16.9 20.4 L16.9 21.6 L12.5 20.35 L12 22.65 L11.5 20.35 L7.1 21.6 L7.1 20.4 L11.1 18.1 L10.85 12.75 L1.3 15.5 L1.3 14.1 L6.3 10.95 L6.3 8.8 C6.3 8.4 6.6 8.1 7.05 8.1 C7.5 8.1 7.8 8.4 7.8 8.8 L7.8 10.0 L10.75 8.1 L10.75 4.1 C10.75 2.3 11.25 1.1 12 1.1 Z" fill="${color}" stroke="#090d16" stroke-width="1.05" stroke-linejoin="round" />
                <path d="M11.15 3.7 C11.6 3.1 12.4 3.1 12.85 3.7 L13.0 4.55 C12.4 4.25 11.6 4.25 11.0 4.55 Z" fill="#090d16" opacity="0.7" />
            `;
        }

        const rotation = Number.isFinite(Number(flight.rumo)) ? Number(flight.rumo) : 0;

        return `
            <div class="fly-plane-wrapper" style="transform: rotate(${rotation}deg); transform-origin: center; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.88));">
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    ${svgInner}
                </svg>
            </div>
        `;
    }

    createFlightPopupHtml(f) {
        const isDelay = f.atrasoMinutos > 15;
        const delayBadge = isDelay 
            ? `<span style="background:rgba(244,63,94,0.2); color:#f43f5e; padding:1px 5px; border-radius:3px; font-weight:bold;">⚠️ +${f.atrasoMinutos} min</span>`
            : `<span style="background:rgba(16,185,129,0.2); color:#10b981; padding:1px 5px; border-radius:3px; font-weight:bold;">No Horário</span>`;

        const modeBadge = f.data_mode === 'LIVE'
            ? `<span style="background:rgba(56,189,248,0.2); color:#38bdf8; padding:1px 5px; border-radius:3px; font-size:9px; font-weight:bold;">ADS-B AO VIVO</span>`
            : (f.data_mode === 'SYNTHETIC'
                ? `<span style="background:rgba(234,179,8,0.2); color:#eab308; padding:1px 5px; border-radius:3px; font-size:9px; font-weight:bold;">SINTÉTICO DEMO</span>`
                : `<span style="background:rgba(148,163,184,0.2); color:#94a3b8; padding:1px 5px; border-radius:3px; font-size:9px; font-weight:bold;">ESTIMADO RIT</span>`);

        return `
            <div style="font-family:sans-serif; min-width:240px; color:#fff; font-size:11px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; margin-bottom:6px;">
                    <strong style="color:#38bdf8; font-size:13px;">${f.numeroVoo} (${f.prefixo})</strong>
                    <div style="display:flex; gap:4px; align-items:center;">
                        ${modeBadge}
                        ${delayBadge}
                    </div>
                </div>
                <div>• <strong>Companhia:</strong> ${f.companhia}</div>
                <div>• <strong>Categoria:</strong> <span style="text-transform:capitalize;">${f.categoria}</span></div>
                <div>• <strong>Rota:</strong> <span style="color:#f59e0b; font-weight:bold;">${f.origem || 'N/D'} ➔ ${f.destino || 'N/D'}</span></div>
                <div>• <strong>Altitude:</strong> ${f.altitudeM.toLocaleString('pt-BR')} metros (${f.altitudeFt.toLocaleString('pt-BR')} pés)</div>
                <div>• <strong>Velocidade no Solo:</strong> ${f.velocidadeKmh} km/h (${f.velocidadeKts} nós)</div>
                <div>• <strong>ETA Estimado pelo RIT:</strong> <strong style="color:#38bdf8;">${f.etaFormatado || '--:--'}</strong></div>
                <div style="margin-top:8px; display:flex; gap:6px;">
                    <button onclick="window.ritFlyView && window.ritFlyView.abrirDrawerVoo('${f.id}')" style="background:#38bdf8; color:#000; border:none; padding:4px 8px; border-radius:3px; font-size:10px; font-weight:bold; cursor:pointer;">
                        🔍 Ver Detalhes
                    </button>
                    <button onclick="window.ritFlyView && window.ritFlyView.perguntarVooAI('${f.numeroVoo}')" style="background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); padding:4px 8px; border-radius:3px; font-size:10px; cursor:pointer;">
                        🤖 Analisar na IA
                    </button>
                </div>
            </div>
        `;
    }

    drawFlightTrail(flight) {
        if (!this.trailLayer) return;
        this.trailLayer.clearLayers();

        const coords = {
            SDU: [-22.9105, -43.1631],
            GIG: [-22.8089, -43.2436],
            CGH: [-23.6261, -46.6564],
            GRU: [-23.4356, -46.4731],
            BSB: [-15.8711, -47.9186],
            CNF: [-19.6244, -43.9719],
            SSA: [-12.9086, -38.3225],
            REC: [-8.1264, -34.9240]
        };

        const origCoord = coords[flight.origem];
        const destCoord = coords[flight.destino];
        const curCoord = [flight.latitude, flight.longitude];

        const latlngs = [];
        if (origCoord) latlngs.push(origCoord);
        latlngs.push(curCoord);
        if (destCoord) latlngs.push(destCoord);

        if (latlngs.length >= 2) {
            const polyline = L.polyline(latlngs, {
                color: '#38bdf8',
                weight: 2,
                dashArray: '6, 8',
                opacity: 0.85
            });
            this.trailLayer.addLayer(polyline);
        }
    }

    clearFlightTrail() {
        if (this.trailLayer) {
            this.trailLayer.clearLayers();
        }
    }

    centerBrazil() {
        if (this.map) this.map.setView([-15.7801, -47.9292], 5, { animate: false });
    }

    centerPonteAerea() {
        if (this.map) this.map.setView([-23.2, -44.9], 8, { animate: false });
    }

    centerAirport(code) {
        if (!this.map) return;
        const coords = {
            SDU: [-22.9105, -43.1631],
            GIG: [-22.8089, -43.2436],
            CGH: [-23.6261, -46.6564],
            GRU: [-23.4356, -46.4731],
            BSB: [-15.8711, -47.9186],
            CNF: [-19.6244, -43.9719],
            SSA: [-12.9086, -38.3225],
            REC: [-8.1264, -34.9240]
        };
        const c = coords[code.toUpperCase()];
        if (c) this.map.setView(c, 11);
    }

    focusFlight(flightId) {
        const marker = this.flightMarkers.get(flightId);
        if (marker && this.map) {
            this.map.setView(marker.getLatLng(), 8);
            marker.openPopup();
        }
    }

    invalidateSize() {
        if (this.map) {
            setTimeout(() => this.map.invalidateSize(), 150);
        }
    }
}
