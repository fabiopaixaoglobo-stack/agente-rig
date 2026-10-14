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
            const popupContent = `
                <div style="font-family:sans-serif; min-width:210px; color:#fff; font-size:11px;">
                    <div style="font-size:12px; font-weight:900; color:#38bdf8; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; margin-bottom:6px;">
                        ${a.nome} (${a.iata}/${a.icao})
                    </div>
                    <div>• <strong>Situação Operacional:</strong> <span class="fly-airport-status-pill ${statusClass}">${a.statusOperacional}</span> (${a.regraVoo})</div>
                    <div>• <strong>Chegadas Previstas:</strong> ${a.chegadasPrevistas} | <strong>Partidas:</strong> ${a.partidasPrevistas}</div>
                    <div>• <strong>Voos Atrasados:</strong> ${a.voosAtrasados} | <strong>Pontualidade:</strong> ${a.taxaPontualidadePct}%</div>
                    <div style="margin-top:6px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.05); color:#94a3b8; font-size:10px;">
                        🌤️ ${metar.condicoes || 'Céu Claro'}, ${metar.temperaturaC || 26}°C<br/>
                        💨 Vento: ${metar.vento ? metar.vento.descricao : 'Calmo'}<br/>
                        👁️ Visibilidade: ${metar.visibilidade ? metar.visibilidade.descricao : '> 10 km'}
                    </div>
                    <div style="margin-top:8px;">
                        <button onclick="window.ritFlyView && window.ritFlyView.abrirVoosAeroporto('${a.iata}')" style="background:#38bdf8; color:#000; border:none; padding:4px 8px; border-radius:3px; font-size:10px; font-weight:bold; cursor:pointer; width:100%;">
                            🛫 Ver Voos do Dia
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

        flights.forEach(f => {
            if (!f.latitude || !f.longitude) return;

            const iconHtml = this.createAirplaneIconSvg(f);
            const customIcon = L.divIcon({
                className: 'fly-plane-marker',
                html: iconHtml,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            const marker = L.marker([f.latitude, f.longitude], { icon: customIcon });
            
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
    }

    createAirplaneIconSvg(flight) {
        const cat = (flight.categoria || 'comercial').toLowerCase();
        const callsign = (flight.callsign || '').toUpperCase();
        const comp = (flight.companhia || '').toUpperCase();

        let color = '#38bdf8'; // Azul neon padrão
        let svgPath = 'M12 2L9 9H2L4 12H9L7 19L9 20L12 15L15 20L17 19L15 12H20L22 9H15L12 2Z'; // Avião clássico

        if (cat === 'helicoptero') {
            color = '#10b981'; // Verde Rotor
            svgPath = 'M12 3C7 3 3 5 3 5L5 7H11V11H7L5 13H11V17L7 19H17L13 17V13H19L17 11H13V7H19L21 5C21 5 17 3 12 3Z';
        } else if (cat === 'executivo') {
            color = '#a855f7'; // Roxo Executivo
            svgPath = 'M12 1L8 8H3L5 11H8L6 18L9 19L12 13L15 19L18 18L16 11H19L21 8H16L12 1Z';
        } else if (cat === 'cargueiro') {
            color = '#f59e0b'; // Laranja Cargo
            svgPath = 'M12 2L8 9H1L3 13H8L6 20L9 21L12 16L15 21L18 20L16 13H21L23 9H16L12 2Z';
        } else {
            // Diferenciação de Companhia Aérea Comercial
            if (comp.includes('GOL') || callsign.startsWith('GLO')) {
                color = '#f97316'; // Laranja GOL
            } else if (comp.includes('LATAM') || callsign.startsWith('TAM')) {
                color = '#f43f5e'; // Magenta LATAM
            } else if (comp.includes('AZUL') || callsign.startsWith('AZU')) {
                color = '#38bdf8'; // Azul Claro AZUL
            } else if (comp.includes('VOEPASS') || callsign.startsWith('PTB')) {
                color = '#10b981'; // Verde VOEPASS
            } else if (comp.includes('ITAPEMIRIM') || callsign.startsWith('IPM')) {
                color = '#facc15'; // Amarelo ITA
            }
        }

        const rotation = flight.rumo || 0;

        return `
            <div class="fly-plane-wrapper" style="transform: rotate(${rotation}deg); transform-origin: center; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 5px ${color});">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
                    <path d="${svgPath}" />
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
        if (this.map) this.map.setView([-15.7801, -47.9292], 5);
    }

    centerPonteAerea() {
        if (this.map) this.map.setView([-23.2, -44.9], 8);
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
