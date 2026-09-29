/**
 * Agente RIT - Módulo RIT ALERTA
 * Controlador do Mapa Operacional Leaflet (traffic-alert-map.js)
 * Privacy by Design / Posição Pública do Rio de Janeiro / Zero GPS
 */

export class TrafficAlertMap {
    constructor({ containerId = 'mapTrafficAlert', onIncidentSelect = null } = {}) {
        this.containerId = containerId;
        this.onIncidentSelect = onIncidentSelect;
        this.map = null;
        this.incidentLayer = null;
        this.cameraLayer = null;
        this.corridorLayer = null;
        this.isInitialized = false;

        // Centro público padrão do Rio de Janeiro (nunca GPS do usuário)
        this.DEFAULT_CENTER = [-22.9068, -43.1729];
        this.DEFAULT_ZOOM = 12;
    }

    /**
     * Inicializa a instância do Leaflet para a aba RIT ALERTA.
     */
    init() {
        if (this.isInitialized && this.map) {
            this.invalidateSize();
            return;
        }

        const container = document.getElementById(this.containerId);
        if (!container) {
            console.warn(`[RIT ALERTA MAP] Container #${this.containerId} não encontrado.`);
            return;
        }

        if (typeof L === 'undefined') {
            console.error('[RIT ALERTA MAP] Biblioteca Leaflet não carregada no escopo global.');
            return;
        }

        try {
            // Camada Satélite com Rótulos (Esri World Imagery + World Boundaries & Places)
            const satelliteImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Esri, Maxar, Earthstar'
            });
            const satelliteLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19
            });
            const satelliteGroup = L.layerGroup([satelliteImagery, satelliteLabels]);

            // Camada Ruas Cartográfico (OpenStreetMap Padrão - 100% público e livre de API key)
            const streetsLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                subdomains: ['a', 'b', 'c'],
                attribution: '© OpenStreetMap'
            });

            // Camada Dark Command Center (Esri Dark Canvas - sem exigência de API Key)
            const darkBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 });
            const darkLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 });
            const darkGroup = L.layerGroup([darkBase, darkLabels]);

            // Padrão: Satélite com rótulos
            satelliteGroup.addTo(this.map);

            L.control.layers({
                '🛰️ Satélite com Rótulos': satelliteGroup,
                '🗺️ Ruas (OpenStreetMap)': streetsLayer,
                '🏙️ Dark Command Center': darkGroup
            }, null, { position: 'topright' }).addTo(this.map);

            this.incidentLayer = L.layerGroup().addTo(this.map);
            this.cameraLayer = L.layerGroup().addTo(this.map);
            this.corridorLayer = L.layerGroup().addTo(this.map);

            this.isInitialized = true;
            console.info('[RIT ALERTA MAP] Mapa operacional inicializado com sucesso.');
        } catch (err) {
            console.error('[RIT ALERTA MAP] Falha ao instanciar Leaflet:', err);
        }
    }

    /**
     * Força o redimensionamento do Leaflet ao trocar de aba ou redimensionar a janela.
     */
    invalidateSize() {
        if (this.map) {
            setTimeout(() => {
                try {
                    this.map.invalidateSize();
                } catch (e) {}
            }, 100);
        }
    }

    /**
     * Centraliza o mapa nas coordenadas padrão do Rio de Janeiro.
     */
    resetView() {
        if (this.map) {
            this.map.setView(this.DEFAULT_CENTER, this.DEFAULT_ZOOM);
        }
    }

    /**
     * Renderiza marcadores de incidentes com base nos dados consolidados.
     */
    renderIncidents(incidents = []) {
        if (!this.map || !this.incidentLayer) return;

        this.incidentLayer.clearLayers();

        if (!Array.isArray(incidents) || incidents.length === 0) {
            return;
        }

        incidents.forEach(inc => {
            const lat = parseFloat(inc.lat);
            const lng = parseFloat(inc.lng);

            // Validação de coordenadas
            if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
                console.warn(`[RIT ALERTA MAP] Incidente ${inc.id || inc.canonical_id} sem coordenadas válidas.`);
                return;
            }

            const sev = (inc.severity || inc.severidade || 'MÉDIO').toUpperCase();
            let markerClass = 'ta-marker-cyan';
            if (sev === 'CRÍTICO' || sev === 'ALTO') {
                markerClass = 'ta-marker-crit';
            } else if (sev === 'MÉDIO') {
                markerClass = 'ta-marker-warn';
            }

            const icon = L.divIcon({
                className: 'ta-leaflet-marker',
                html: `<div class="${markerClass}" title="${this._escapeHtml(inc.title || inc.corridor || 'Incidente')}"></div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            });

            const marker = L.marker([lat, lng], { icon });

            // Popup seguro sem injeção de HTML não sanitizado
            const safeTitle = this._escapeHtml(inc.title || inc.corridor || 'Ocorrência');
            const safeVia = this._escapeHtml(inc.corridor || inc.via || 'Via');
            const safeSev = this._escapeHtml(sev);

            marker.bindPopup(`
                <div style="font-family:sans-serif; font-size:11px; color:#0f172a; line-height:1.4;">
                    <div style="font-weight:bold; color:#0284c7;">${safeTitle}</div>
                    <div style="font-size:10px; color:#475569;">${safeVia}</div>
                    <div style="margin-top:4px; font-weight:800;">Severidade: ${safeSev}</div>
                </div>
            `);

            marker.on('click', () => {
                if (typeof this.onIncidentSelect === 'function') {
                    this.onIncidentSelect(inc);
                }
            });

            this.incidentLayer.addLayer(marker);
        });
    }

    /**
     * Plota as câmeras no entorno de um incidente selecionado.
     */
    renderNearbyCameras(cameras = []) {
        if (!this.map || !this.cameraLayer) return;

        this.cameraLayer.clearLayers();

        if (!Array.isArray(cameras)) return;

        cameras.forEach(camItem => {
            const cam = camItem.camera || camItem;
            const lat = parseFloat(cam.latitude);
            const lng = parseFloat(cam.longitude);

            if (isNaN(lat) || isNaN(lng)) return;

            const icon = L.divIcon({
                className: 'ta-leaflet-marker',
                html: `<div class="ta-marker-camera" title="Câmera: ${this._escapeHtml(cam.nome || cam.id)}">🎥</div>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });

            const marker = L.marker([lat, lng], { icon });
            marker.bindPopup(`
                <div style="font-family:sans-serif; font-size:10px; color:#0f172a;">
                    <strong>CÂMERA PÚBLICA</strong><br>
                    ${this._escapeHtml(cam.nome || cam.id)}<br>
                    <span style="color:#64748b;">${this._escapeHtml(cam.bairro || '')}</span>
                </div>
            `);

            this.cameraLayer.addLayer(marker);
        });
    }

    /**
     * Focaliza no incidente selecionado.
     */
    focusIncident(incident) {
        if (!this.map || !incident) return;
        const lat = parseFloat(incident.lat);
        const lng = parseFloat(incident.lng);

        if (!isNaN(lat) && !isNaN(lng)) {
            this.map.setView([lat, lng], 14, { animate: true });
        }
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
