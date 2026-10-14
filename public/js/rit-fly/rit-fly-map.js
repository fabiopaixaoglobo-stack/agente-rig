/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Gerenciador do Mapa Nacional de Voos em Leaflet
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

        // Tile layer Dark Operations (Esri Dark Canvas)
        const darkBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });
        const darkLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });
        L.layerGroup([darkBase, darkLabels]).addTo(this.map);

        // Grupos de Camadas
        this.trailLayer = L.layerGroup().addTo(this.map);
        this.airportsLayer = L.layerGroup().addTo(this.map);
        this.flightsLayer = L.layerGroup().addTo(this.map);
    }

    renderAirports(airports = []) {
        if (!this.airportsLayer) return;
        this.airportsLayer.clearLayers();

        airports.forEach(a => {
            const statusClass = a.statusOperacional === 'NORMAL' ? 'fly-status-normal' : (a.statusOperacional === 'ATENÇÃO' ? 'fly-status-atencao' : 'fly-status-critico');
            
            const iconHtml = `
                <div class="fly-airport-marker" title="${a.nome}">
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
                <div style="font-family:sans-serif; min-width:200px; color:#fff; font-size:11px;">
                    <div style="font-size:12px; font-weight:900; color:#38bdf8; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; margin-bottom:6px;">
                        ${a.nome} (${a.iata}/${a.icao})
                    </div>
                    <div>• <strong>Status:</strong> <span class="fly-airport-status-pill ${statusClass}">${a.statusOperacional}</span> (${a.regraVoo})</div>
                    <div>• <strong>Chegadas:</strong> ${a.chegadasPrevistas} | <strong>Partidas:</strong> ${a.partidasPrevistas}</div>
                    <div>• <strong>Atrasos:</strong> ${a.voosAtrasados} voos | <strong>Pontualidade:</strong> ${a.taxaPontualidadePct}%</div>
                    <div style="margin-top:6px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.05); color:#94a3b8; font-size:10px;">
                        🌤️ ${metar.condicoes || 'Céu Claro'}, ${metar.temperaturaC || 26}°C<br/>
                        💨 Vento: ${metar.vento ? metar.vento.descricao : 'Calmo'}<br/>
                        👁️ Visibilidade: ${metar.visibilidade ? metar.visibilidade.descricao : '> 10 km'}
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent, { className: 'fly-dark-popup' });
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
        let color = '#38bdf8'; // Comercial Neon
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
        }

        const rotation = flight.rumo || 0;

        return `
            <div style="transform: rotate(${rotation}deg); transform-origin: center; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 4px ${color});">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
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
                <div>• <strong>Categoria:</strong> <span style="text-transform:capitalize;">${f.categoria}</span> <span style="font-size:9px; color:#94a3b8;">(${f.category_source || 'INFERÊNCIA'})</span></div>
                <div>• <strong>Rota:</strong> <span style="color:#f59e0b; font-weight:bold;">${f.origem || 'N/D'} ➔ ${f.destino || 'N/D'}</span> <span style="font-size:9px; color:#94a3b8;">(${f.origin_source || 'PROXIMIDADE'})</span></div>
                <div>• <strong>Altitude:</strong> ${f.altitudeFt.toLocaleString('pt-BR')} ft (${f.altitudeM.toLocaleString('pt-BR')} m)</div>
                <div>• <strong>Velocidade no Solo:</strong> ${f.velocidadeKmh} km/h (${f.velocidadeKts} kts)</div>
                <div>• <strong>ETA Estimado pelo RIT:</strong> <strong style="color:#38bdf8;">${f.etaFormatado || '--:--'}</strong> <span style="font-size:9px; color:#94a3b8;">(não-oficial)</span></div>
                <div style="margin-top:8px; display:flex; gap:6px;">
                    <button onclick="window.ritFlyView && window.ritFlyView.perguntarVooAI('${f.numeroVoo}')" style="background:#38bdf8; color:#000; border:none; padding:4px 8px; border-radius:3px; font-size:10px; font-weight:bold; cursor:pointer;">
                        🤖 Analisar na IA
                    </button>
                    <button onclick="window.ritFlyView && window.ritFlyView.preencherFormularioViagem('${f.numeroVoo}', '${f.origem || 'SDU'}', '${f.destino || 'CGH'}')" style="background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); padding:4px 8px; border-radius:3px; font-size:10px; cursor:pointer;">
                        🚗 Vincular Transporte
                    </button>
                </div>
            </div>
        `;
    }

    drawFlightTrail(flight) {
        if (!this.trailLayer) return;
        this.trailLayer.clearLayers();

        // Linha projetada de rota entre origem e destino aproximada
        if (flight.origem && flight.destino) {
            // Desenha linha de rota seletiva
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
            this.map.setView(marker.getLatLng(), 9);
            marker.openPopup();
        }
    }

    invalidateSize() {
        if (this.map) {
            setTimeout(() => this.map.invalidateSize(), 150);
        }
    }
}
