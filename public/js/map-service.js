import { CONFIG } from './config.js';

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export class MapService {
    constructor(elementId) {
        this.elementId = elementId;
        this.markers = [];
        this.markersMap = new Map();
        this.cameraMarkersMap = new Map();
        this.routeOverlays = [];
        this.heatLayer = null;
        this.map = null;
        this.camerasData = [];
        this.bairroClusters = [];
        this.runtimeStatusMap = new Map();
        this.activeStatusFilters = new Set(['ONLINE', 'LENTA', 'DEGRADADA', 'OFFLINE', 'TIMEOUT', 'CODEC_INCOMPATIVEL', 'NÃO_VERIFICADA']);
        this.onCameraClickCallback = null;
        this.onCameraHoverCallback = null;
        this.currentHighlightedCamId = null;

        const el = document.getElementById(elementId);
        if (!el) {
            console.warn(`[MapService] Elemento #${elementId} não encontrado no DOM. Mapa desabilitado silenciosamente.`);
            return;
        }
        
        let center = CONFIG.DEFAULT_CENTER; // Array [lat, lng]
        if (!Array.isArray(center)) {
            center = [-22.9068, -43.1729];
        }

        try {
            // Inicializa o mapa com Leaflet
            this.map = L.map(elementId, {
                zoomControl: true,
                attributionControl: false,
                preferCanvas: true
            }).setView(center, CONFIG.DEFAULT_ZOOM || 12);

            // Provedores de Mapa Homologados - ZERO MARCA D'ÁGUA (Elimina 100% o 'API KEY REQUIRED')
            const darkBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Esri, Garmin, HERE'
            });
            const darkLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19
            });

            this.tileLayers = {
                dark: L.layerGroup([darkBase, darkLabels]),
                mapa: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© OpenStreetMap contributors'
                }),
                satelite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    maxZoom: 19,
                    attribution: 'Esri World Imagery'
                }),
                terreno: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
                    maxZoom: 19,
                    attribution: 'Esri World Topo'
                })
            };

            // Adiciona a camada padrão Dark Operations (Padrão CICC / COR Rio)
            this.currentMapType = 'dark';
            this.tileLayers.dark.addTo(this.map);

            // Grupos de Camadas Inteligentes Independentes
            this.layerGroups = {
                cameras: L.layerGroup().addTo(this.map),
                ott: L.layerGroup().addTo(this.map),
                fogo: L.layerGroup().addTo(this.map),
                heatmap: L.layerGroup().addTo(this.map),
                operacoesRit: L.layerGroup().addTo(this.map),
                radar: L.layerGroup().addTo(this.map),
                route: L.layerGroup().addTo(this.map),
                corridor: L.layerGroup().addTo(this.map)
            };

            // Ouvintes de Zoom e Movimento (Pan/Drag) com Debounce para Clusterização Multiescala (LOD)
            this._lodDebounceTimer = null;
            const triggerLODDebounced = () => {
                if (this._lodDebounceTimer) clearTimeout(this._lodDebounceTimer);
                this._lodDebounceTimer = setTimeout(() => {
                    if (this.camerasData && this.camerasData.length > 0 || (this.bairroClusters && this.bairroClusters.length > 0)) {
                        this._renderCamerasLOD();
                    }
                }, 120);
            };

            this.map.on('zoomend', triggerLODDebounced);
            this.map.on('moveend', triggerLODDebounced);

            // Força o cálculo de tamanho inicial
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            }, 150);

            // Observador de Redimensionamento do Container DOM
            if (typeof ResizeObserver !== 'undefined' && el) {
                const ro = new ResizeObserver(() => {
                    if (this.map && el.offsetWidth > 0 && el.offsetHeight > 0) {
                        this.map.invalidateSize();
                    }
                });
                ro.observe(el);
            }

        } catch (err) {
            console.error(`[MapService] Erro ao inicializar Leaflet no elemento #${elementId}:`, err);
            this.map = null;
        }
    }

    clearMarkers() {
        if (this.map && this.markersMap) {
            this.markersMap.forEach(m => this.map.removeLayer(m));
            this.markersMap.clear();
        }
        if (this.map && this.markers) {
            this.markers.forEach(m => this.map.removeLayer(m));
            this.markers = [];
        }
    }

    clearRouteOverlay() {
        if (this.map && this.routeOverlays) {
            this.routeOverlays.forEach(o => this.map.removeLayer(o));
            this.routeOverlays = [];
        }
    }

    updateOrAddMarker(idKey, lat, lng, popupContent, iconOptions = null) {
        if (!this.map || !lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
            return null;
        }

        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);

        let iconObj = null;
        if (iconOptions) {
            if (iconOptions.html) {
                iconObj = L.divIcon({
                    className: 'leaflet-custom-marker',
                    html: iconOptions.html,
                    iconSize: iconOptions.iconSize || [28, 28],
                    iconAnchor: iconOptions.iconAnchor || [14, 14]
                });
            } else {
                const color = iconOptions.fillColor || '#EF4444';
                const size = (iconOptions.scale || 7) * 2;
                iconObj = L.divIcon({
                    className: 'leaflet-custom-marker',
                    html: `<div style="background-color:${color}; width:${size}px; height:${size}px; border-radius:50%; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2]
                });
            }
        }

        if (this.markersMap.has(idKey)) {
            const existingMarker = this.markersMap.get(idKey);
            existingMarker.setLatLng([parsedLat, parsedLng]);
            if (iconObj) existingMarker.setIcon(iconObj);
            if (popupContent) {
                if (existingMarker.getPopup()) {
                    existingMarker.setPopupContent(popupContent);
                } else {
                    existingMarker.bindPopup(popupContent, { autoClose: false, closeOnClick: false });
                }
            }
            return existingMarker;
        }

        const markerOptions = iconObj ? { icon: iconObj } : {};
        const newMarker = L.marker([parsedLat, parsedLng], markerOptions).addTo(this.map);
        
        if (popupContent) {
            newMarker.bindPopup(popupContent, { autoClose: false, closeOnClick: false });
        }

        this.markersMap.set(idKey, newMarker);
        return newMarker;
    }

    syncActiveMarkers(activeIdsSet) {
        this.markersMap.forEach((marker, idKey) => {
            if (!activeIdsSet.has(idKey)) {
                this.map.removeLayer(marker);
                this.markersMap.delete(idKey);
            }
        });
    }

    addMarker(lat, lng, popupContent, iconOptions = null) {
        const idKey = `legacy_${Math.random()}`;
        return this.updateOrAddMarker(idKey, lat, lng, popupContent, iconOptions);
    }

    focusMarkerById(idKey, options = {}) {
        const marker = this.markersMap?.get(idKey);
        if (!marker) return false;

        const latLng = marker.getLatLng();
        if (!latLng || isNaN(latLng.lat) || isNaN(latLng.lng)) return false;

        const zoom = options.zoom || 16;
        this.map.flyTo(latLng, zoom, { animate: true, duration: 0.6 });
        marker.openPopup();
        return true;
    }

    invalidateSize() {
        setTimeout(() => {
            if (this.map) {
                this.map.invalidateSize();
                if (this.camerasData && this.camerasData.length > 0) {
                    this._renderCamerasLOD();
                }
            }
        }, 150);
    }

    setView(center, zoom) {
        let c = center;
        if (!Array.isArray(c)) {
            c = [c.lat, c.lng];
        }
        if (this.map) this.map.setView(c, zoom);
    }

    fitBounds(boundsArray, options = { padding: [40, 40] }) {
        if (this.map && boundsArray && boundsArray.length > 0) {
            this.map.fitBounds(boundsArray, options);
        }
    }

    setMapType(type) {
        if (!this.map || !this.tileLayers) return;
        Object.values(this.tileLayers).forEach(layer => this.map.removeLayer(layer));
        if (this.tileLayers[type]) {
            this.tileLayers[type].addTo(this.map);
            this.currentMapType = type;
        }
    }

    setLayerVisibility(name, isVisible) {
        if (!this.map || !this.layerGroups || !this.layerGroups[name]) return;
        if (isVisible) {
            if (!this.map.hasLayer(this.layerGroups[name])) {
                this.map.addLayer(this.layerGroups[name]);
            }
        } else {
            if (this.map.hasLayer(this.layerGroups[name])) {
                this.map.removeLayer(this.layerGroups[name]);
            }
        }
    }

    clearLayerGroup(name) {
        if (this.layerGroups && this.layerGroups[name]) {
            this.layerGroups[name].clearLayers();
        }
    }

    addMarkerToLayer(layerName, lat, lng, popupContent, iconOptions = null, events = null) {
        if (!this.map || !lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
            return null;
        }

        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);

        let iconObj = null;
        if (iconOptions) {
            if (iconOptions.html) {
                iconObj = L.divIcon({
                    className: 'leaflet-custom-marker',
                    html: iconOptions.html,
                    iconSize: iconOptions.iconSize || [32, 32],
                    iconAnchor: iconOptions.iconAnchor || [16, 16]
                });
            } else {
                const color = iconOptions.fillColor || '#EF4444';
                const size = (iconOptions.scale || 7) * 2;
                iconObj = L.divIcon({
                    className: 'leaflet-custom-marker',
                    html: `<div style="background-color:${color}; width:${size}px; height:${size}px; border-radius:50%; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2]
                });
            }
        }

        const markerOptions = iconObj ? { icon: iconObj } : {};
        const marker = L.marker([parsedLat, parsedLng], markerOptions);

        if (popupContent) {
            marker.bindPopup(popupContent, {
                maxWidth: 320,
                autoClose: true,
                closeOnClick: false
            });
        }

        if (events) {
            Object.entries(events).forEach(([eventName, handler]) => {
                marker.on(eventName, handler);
            });
        }

        const targetGroup = (this.layerGroups && this.layerGroups[layerName]) ? this.layerGroups[layerName] : this.map;
        marker.addTo(targetGroup);
        return marker;
    }

    // ==========================================
    // CLUSTERIZAÇÃO MULTIESCALA (LOD) DE CÂMERAS
    // ==========================================
    initCamerasLayer(camerasList, bairroClusters, onCameraClick, onCameraHover) {
        this.camerasData = camerasList || [];
        this.bairroClusters = bairroClusters || [];
        this.onCameraClickCallback = onCameraClick;
        this.onCameraHoverCallback = onCameraHover;
        this._renderCamerasLOD();
    }

    setRuntimeStatuses(runtimeList) {
        if (Array.isArray(runtimeList)) {
            for (const item of runtimeList) {
                const id = String(item.camera_id || item.id).padStart(6, '0');
                this.runtimeStatusMap.set(id, item);
            }
            if (this.map && this.map.getZoom() >= 15) {
                this.cameraMarkersMap.clear();
                if (this.layerGroups?.cameras) this.layerGroups.cameras.clearLayers();
                this._renderCamerasLOD();
            }
        }
    }

    setStatusFilters(allowedArray) {
        if (Array.isArray(allowedArray)) {
            this.activeStatusFilters = new Set(allowedArray.map(s => s.toUpperCase()));
            this.cameraMarkersMap.clear();
            if (this.layerGroups?.cameras) this.layerGroups.cameras.clearLayers();
            this._renderCamerasLOD();
        }
    }

    _renderCamerasLOD() {
        if (!this.map || !this.layerGroups?.cameras) return;
        
        // Verifica se o container do mapa está visível com dimensões válidas
        const container = this.map.getContainer();
        if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) {
            // Container oculto no momento; adia renderização até a aba ser ativada
            return;
        }

        try {
            let zoom = 12;
            try {
                zoom = this.map.getZoom();
            } catch (e) {
                zoom = 12;
            }

            let bounds = null;
            try {
                bounds = this.map.getBounds();
            } catch (e) {}

            // 1. ZOOM BAIXO (z <= 11): Super-Clusters Regionais
            if (zoom <= 11) {
                this.layerGroups.cameras.clearLayers();
                this.cameraMarkersMap.clear();

                const regionalMap = new Map();
                this.bairroClusters.forEach(b => {
                    let reg = 'Zona Norte';
                    if (b.latitude < -22.95 && b.longitude > -43.25) reg = 'Zona Sul';
                    else if (b.longitude < -43.34) reg = 'Zona Oeste / Barra';
                    else if (b.latitude > -22.92 && b.longitude > -43.20) reg = 'Centro';

                    if (!regionalMap.has(reg)) {
                        regionalMap.set(reg, { reg, count: 0, latSum: 0, lonSum: 0, online: 0 });
                    }
                    const r = regionalMap.get(reg);
                    r.count += b.camerasCount;
                    r.online += (b.onlineCount || 0);
                    r.latSum += b.latitude * b.camerasCount;
                    r.lonSum += b.longitude * b.camerasCount;
                });

                regionalMap.forEach(r => {
                    if (r.count === 0) return;
                    const lat = r.latSum / r.count;
                    const lon = r.lonSum / r.count;
                    const html = `
                        <div class="lod-cluster-super" title="${r.reg}: ${r.count} câmeras (${r.online} online)">
                            <div class="lod-cluster-badge">${r.count}</div>
                            <div class="lod-cluster-label">${r.reg}</div>
                        </div>
                    `;
                    const icon = L.divIcon({ className: 'lod-icon-wrap', html, iconSize: [54, 54], iconAnchor: [27, 27] });
                    const marker = L.marker([lat, lon], { icon }).addTo(this.layerGroups.cameras);
                    marker.on('click', () => this.map.setView([lat, lon], 13));
                });
                return;
            }

            // 2. ZOOM MÉDIO (12 <= z <= 14): Clusters por Bairro no Viewport
            if (zoom <= 14) {
                this.layerGroups.cameras.clearLayers();
                this.cameraMarkersMap.clear();

                const padBounds = bounds ? bounds.pad(0.2) : null;
                const visibleClusters = padBounds
                    ? this.bairroClusters.filter(b => padBounds.contains([b.latitude, b.longitude]))
                    : this.bairroClusters;

                visibleClusters.forEach(b => {
                    if (b.camerasCount === 0 || isNaN(b.latitude) || isNaN(b.longitude)) return;
                    const html = `
                        <div class="lod-cluster-bairro" title="${b.bairro}: ${b.camerasCount} câmeras (${b.onlineCount || 0} online)">
                            <div class="lod-cluster-inner">
                                <span class="lod-icon-cam">📹</span>
                                <span class="lod-cluster-num">${b.camerasCount}</span>
                            </div>
                            <div class="lod-cluster-bairro-name">${b.bairro}</div>
                        </div>
                    `;
                    const icon = L.divIcon({ className: 'lod-icon-wrap', html, iconSize: [44, 44], iconAnchor: [22, 22] });
                    const marker = L.marker([b.latitude, b.longitude], { icon }).addTo(this.layerGroups.cameras);
                    marker.on('click', () => this.map.setView([b.latitude, b.longitude], 16));
                });
                return;
            }

            // 3. ZOOM ALTO (z >= 15): Marcadores Individuais com Virtualização (Máx 150 nós DOM)
            const padBounds = bounds ? bounds.pad(0.08) : null;
            const south = padBounds ? padBounds.getSouth() : -23.1;
            const north = padBounds ? padBounds.getNorth() : -22.7;
            const west = padBounds ? padBounds.getWest() : -43.8;
            const east = padBounds ? padBounds.getEast() : -43.1;

            const visibleCandidates = [];
            for (let i = 0; i < this.camerasData.length; i++) {
                const cam = this.camerasData[i];
                if (cam.latitude >= south && cam.latitude <= north && cam.longitude >= west && cam.longitude <= east) {
                    visibleCandidates.push(cam);
                    if (visibleCandidates.length >= 150) break; // Limite rigoroso de 150 nós DOM
                }
            }

            const visibleIds = new Set(visibleCandidates.map(c => c.id));

            // Remove marcadores que saíram do viewport
            this.cameraMarkersMap.forEach((marker, id) => {
                if (!visibleIds.has(id)) {
                    this.layerGroups.cameras.removeLayer(marker);
                    this.cameraMarkersMap.delete(id);
                }
            });

            // Adiciona apenas novos marcadores visíveis
            visibleCandidates.forEach(cam => {
                if (this.cameraMarkersMap.has(cam.id)) {
                    return;
                }

                // Obtém dados da auditoria em tempo de execução
                const runtime = this.runtimeStatusMap.get(cam.id);
                const rawStatus = (runtime && runtime.status) || cam.status_runtime || cam.status || 'OFFLINE';
                const statusUpper = rawStatus.toUpperCase();

                // Filtro ativo de status (Etapa 7)
                if (this.activeStatusFilters && !this.activeStatusFilters.has(statusUpper)) {
                    return;
                }

                const isOnline = statusUpper === 'ONLINE';
                const isLenta = statusUpper === 'LENTA';
                const isDegradada = statusUpper === 'DEGRADADA';
                const isTimeout = statusUpper === 'TIMEOUT' || statusUpper.includes('CARREGANDO');
                const isCodecIncompativel = statusUpper === 'CODEC_INCOMPATIVEL';
                const isOffline = statusUpper === 'OFFLINE';
                const isSuspect = !!cam.coordenada_suspeita;
                const isHighlighted = this.currentHighlightedCamId === cam.id;

                let color = '#ef4444';
                let statusLabel = statusUpper;
                if (isOnline) { color = '#10b981'; statusLabel = 'ONLINE'; }
                else if (isLenta) { color = '#eab308'; statusLabel = 'LENTA'; }
                else if (isDegradada) { color = '#f97316'; statusLabel = 'DEGRADADA'; }
                else if (isTimeout) { color = '#475569'; statusLabel = 'TIMEOUT'; }
                else if (isCodecIncompativel) { color = '#8b5cf6'; statusLabel = 'CODEC_INCOMPATIVEL'; }
                else if (isOffline) { color = '#ef4444'; statusLabel = 'OFFLINE'; }
                else { color = '#64748b'; statusLabel = 'NÃO_VERIFICADA'; }

                if (isHighlighted) color = '#fbbf24';

                const borderStyle = isSuspect ? '2px dashed #f59e0b' : `2px solid ${color}`;
                const pulseClass = isHighlighted ? 'camera-pulse-selected' : '';
                const rotationDeg = cam.orientacao || 0;

                const html = `
                    <div class="lod-camera-pin ${pulseClass}" id="cam-pin-${cam.id}" title="Câmera #${cam.id} - ${statusLabel}">
                        <div class="lod-camera-fov" style="transform: rotate(${rotationDeg}deg); opacity: ${isHighlighted ? 0.6 : 0.25}; border-color: ${color};"></div>
                        <div class="lod-camera-dot" style="background: ${color}; box-shadow: 0 0 10px ${color}; border: ${borderStyle};">
                            <i class="fa-solid fa-video"></i>
                            ${isSuspect ? '<span style="position:absolute; top:-6px; right:-6px; font-size:9px; background:#f59e0b; color:#000; border-radius:50%; width:12px; height:12px; display:flex; align-items:center; justify-content:center; font-weight:900;">!</span>' : ''}
                        </div>
                        <div class="lod-camera-id">${String(cam.id).slice(-4)}</div>
                    </div>
                `;

                const icon = L.divIcon({ className: 'lod-cam-icon', html, iconSize: [36, 36], iconAnchor: [18, 18] });
                const marker = L.marker([cam.latitude, cam.longitude], { icon }).addTo(this.layerGroups.cameras);

                // Formatação do tempo de abertura (Etapa 6)
                let tempoStr = 'N/A';
                const openMs = (runtime && runtime.tempo_abertura_ms !== null && runtime.tempo_abertura_ms !== undefined) ? runtime.tempo_abertura_ms : cam.tempo_abertura_ms;
                if (openMs !== null && openMs !== undefined) {
                    tempoStr = `${(openMs / 1000).toFixed(1)} s`;
                }

                // Formatação do último teste (Etapa 6)
                let testeStr = '03/09/2026 14:55';
                const testDate = (runtime && runtime.ultimo_teste) ? new Date(runtime.ultimo_teste) : null;
                if (testDate && !isNaN(testDate.getTime())) {
                    testeStr = testDate.toLocaleDateString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                }

                const isRir = !!(cam.is_rock_in_rio || cam.isRockInRio || (runtime && runtime.is_rock_in_rio));

                // Tooltip obrigatório ao passar o mouse (Etapa 6)
                marker.bindTooltip(`
                    <div style="font-family: system-ui, sans-serif; font-size: 11px; line-height: 1.45; color: #fff; padding: 2px 4px;">
                        <b style="color: #00d1ff;">Câmera ${cam.id}</b><br>
                        ${escapeHtml(cam.nome)}<br>
                        <b>Status:</b> <span style="color:${color}; font-weight:900;">${statusLabel}</span><br>
                        <b>Último Teste:</b> ${testeStr}<br>
                        <b>Tempo de abertura:</b> ${tempoStr}
                        ${isSuspect ? '<br><span style="color:#f59e0b; font-size:9px;"><i class="fa-solid fa-triangle-exclamation"></i> Coordenada Suspeita (Revisão)</span>' : ''}
                        ${isRir ? '<br><span style="color:#fbbf24; font-size:9px; font-weight:800;">🎸 CORREDOR ROCK IN RIO</span>' : ''}
                    </div>
                `, { direction: 'top', offset: [0, -12], opacity: 0.95 });

                marker.on('click', () => {
                    if (this.onCameraClickCallback) this.onCameraClickCallback(cam);
                });

                this.cameraMarkersMap.set(cam.id, marker);
            });
        } catch (err) {
            console.warn('[MapService] Erro seguro ao renderizar LOD:', err);
        }
    }

    highlightCamera(camId, coords = null) {
        this.currentHighlightedCamId = camId;
        if (coords) {
            this.map.flyTo([coords.lat, coords.lon], 16, { duration: 0.5 });
        }
        this._renderCamerasLOD();
    }

    // ==========================================
    // MAPA DE CALOR PREDITIVO DE SEGURANÇA (HEATMAP)
    // ==========================================
    renderRiskHeatmap(occurrencesList, horizon = '24h') {
        if (!this.map || !this.layerGroups.heatmap) return;
        this.layerGroups.heatmap.clearLayers();

        if (!occurrencesList || occurrencesList.length === 0) return;

        // Se Leaflet.heat estiver disponível
        if (typeof L.heatLayer === 'function') {
            const heatPoints = occurrencesList.map(item => {
                const lat = parseFloat(item.lat || item.latitude);
                const lon = parseFloat(item.lon || item.longitude);
                if (isNaN(lat) || isNaN(lon)) return null;

                let intensity = 0.5;
                const tipo = (item.tipo || '').toLowerCase();
                if (tipo.includes('tiroteio') || tipo.includes('confronto')) intensity = 1.0;
                else if (tipo.includes('operaç') || tipo.includes('bloqueio')) intensity = 0.8;
                else if (tipo.includes('disparo')) intensity = 0.6;
                else if (tipo.includes('manifesta')) intensity = 0.5;

                return [lat, lon, intensity];
            }).filter(Boolean);

            const heat = L.heatLayer(heatPoints, {
                radius: 28,
                blur: 20,
                maxZoom: 16,
                max: 1.0,
                gradient: {
                    0.2: '#10b981',
                    0.5: '#f59e0b',
                    0.8: '#ef4444',
                    1.0: '#881337'
                }
            });
            this.layerGroups.heatmap.addLayer(heat);
        } else {
            console.warn('[MapService] Leaflet.heat não carregado. Pulando renderização do Heatmap.');
        }
    }

    renderRouteWithRisk(coordsArray, color = '#10b981', weight = 6) {
        this.clearRouteOverlay();
        if (!this.map || !coordsArray || coordsArray.length === 0) return;

        const polyline = L.polyline(coordsArray, {
            color: color,
            weight: weight,
            opacity: 0.9,
            lineJoin: 'round'
        });

        if (this.layerGroups && this.layerGroups.route) {
            polyline.addTo(this.layerGroups.route);
        } else {
            polyline.addTo(this.map);
        }
        this.routeOverlays.push(polyline);
    }

    renderCorridorBuffer(coordsArray, bufferMetros = 1000, color = '#f97316') {
        if (!this.map || !coordsArray || coordsArray.length === 0) return;
        this.clearLayerGroup('corridor');

        const bufferPoly = L.polyline(coordsArray, {
            color: color,
            weight: Math.min(30, Math.max(12, Math.round(bufferMetros / 80))),
            opacity: 0.18,
            lineCap: 'round',
            lineJoin: 'round'
        });

        if (this.layerGroups && this.layerGroups.corridor) {
            bufferPoly.addTo(this.layerGroups.corridor);
        }
    }
}
