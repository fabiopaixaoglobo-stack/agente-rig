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

            // Taxonomia de ícones operacionais estilo Waze (P2)
            const text = `${inc.type || ''} ${inc.subtype || ''} ${inc.title || ''} ${inc.description || ''} ${inc.corridor || ''}`.toLowerCase();
            let emoji = '⚠️';
            if (text.includes('acidente') || text.includes('colis') || text.includes('tombamento') || text.includes('capotamento')) emoji = '💥';
            else if (text.includes('obra') || text.includes('manuten') || text.includes('recapeamento') || text.includes('conservação')) emoji = '👷';
            else if (text.includes('faixa') || text.includes('bloqueio') || text.includes('parcial')) emoji = '🚧';
            else if (text.includes('interdi') || text.includes('fechada') || text.includes('bloqueada') || text.includes('interrompido')) emoji = '⛔';
            else if (text.includes('polícia') || text.includes('policia') || text.includes('blitz') || text.includes('segurança')) emoji = '👮';
            else if (text.includes('chuva') || text.includes('alagamento') || text.includes('bolsão') || text.includes('vento') || text.includes('tempo')) emoji = '⛈️';
            else if (text.includes('semáforo') || text.includes('semaforo') || text.includes('sinal') || text.includes('apagado')) emoji = '🚦';
            else if (text.includes('objeto') || text.includes('detrito') || text.includes('queda') || text.includes('árvore')) emoji = '🪵';
            else if (text.includes('animal') || text.includes('cavalo') || text.includes('cachorro') || text.includes('bovino')) emoji = '🐮';
            else if (text.includes('lento') || text.includes('tráfego') || text.includes('retenção') || text.includes('congestion') || text.includes('lentidão')) emoji = '🚗';

            let sevClass = 'waze-pin-medio';
            let borderColor = '#f59e0b';
            if (sev === 'CRÍTICO') {
                sevClass = 'waze-pin-crit';
                borderColor = '#ef4444';
            } else if (sev === 'ALTO') {
                sevClass = 'waze-pin-alto';
                borderColor = '#f97316';
            } else if (sev === 'BAIXO') {
                sevClass = 'waze-pin-baixo';
                borderColor = '#0284c7';
            }

            const icon = L.divIcon({
                className: 'waze-incident-pin',
                html: `<div class="waze-pin-inner ${sevClass}" style="border-color:${borderColor};" title="${this._escapeHtml(inc.title || inc.corridor || 'Incidente')}"><span>${emoji}</span></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            const marker = L.marker([lat, lng], { icon });

            // Popup seguro sem injeção de HTML não sanitizado
            const safeTitle = this._escapeHtml(inc.title || inc.corridor || 'Ocorrência');
            const safeVia = this._escapeHtml(inc.corridor || inc.via || 'Via');
            const safeSev = this._escapeHtml(sev);

            marker.bindPopup(`
                <div style="font-family:sans-serif; font-size:11px; color:#0f172a; line-height:1.4;">
                    <div style="font-weight:bold; color:${borderColor};">${emoji} ${safeTitle}</div>
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
     * Renderiza sobreposição das condições de trânsito em tempo real nos corredores.
     */
    renderTrafficConditions(trafficData = []) {
        if (!this.map || !this.corridorLayer) return;
        this.corridorLayer.clearLayers();

        const CORRIDOR_COORDS = {
            'Linha Vermelha': [[-22.8130, -43.2480], [-22.8450, -43.2380], [-22.8800, -43.2350], [-22.9050, -43.2100], [-22.9100, -43.1950]],
            'Linha Amarela': [[-22.8600, -43.2380], [-22.8850, -43.2600], [-22.8980, -43.2650], [-22.9300, -43.3200], [-22.9800, -43.3650]],
            'Av. Brasil': [[-22.8980, -43.2100], [-22.8550, -43.2800], [-22.8450, -43.3000], [-22.8300, -43.3600], [-22.8500, -43.5400]],
            'Avenida Brasil': [[-22.8980, -43.2100], [-22.8550, -43.2800], [-22.8450, -43.3000], [-22.8300, -43.3600], [-22.8500, -43.5400]],
            'Ponte Rio-Niterói': [[-22.8750, -43.1100], [-22.8850, -43.1600], [-22.8900, -43.2000]],
            'Presidente Dutra': [[-22.7550, -43.4500], [-22.7850, -43.3900], [-22.8150, -43.3450], [-22.8300, -43.3300]],
            'Transolímpica': [[-22.8650, -43.3950], [-22.8720, -43.3870], [-22.9200, -43.4000], [-22.9600, -43.4150], [-23.0000, -43.4300]],
            'Centro (Pres. Vargas)': [[-22.9030, -43.1780], [-22.9050, -43.1850], [-22.9080, -43.1920], [-22.9100, -43.2050]],
            'Zona Sul (Aterro / Copacabana)': [[-22.9180, -43.1720], [-22.9350, -43.1750], [-22.9650, -43.1790], [-22.9850, -43.1900]],
            'Barra da Tijuca (Ayrton Senna)': [[-22.9800, -43.3650], [-22.9900, -43.3600], [-23.0000, -43.3300], [-23.0080, -43.3100]]
        };

        const getTrafficColor = (status) => {
            const s = String(status).toLowerCase();
            if (s.includes('normal') || s.includes('livre')) return '#10b981';
            if (s.includes('moderado')) return '#f59e0b';
            if (s.includes('lento') || s.includes('intenso')) return '#f97316';
            if (s.includes('crítico') || s.includes('critico')) return '#ef4444';
            return '#10b981';
        };

        trafficData.forEach(item => {
            let coords = CORRIDOR_COORDS[item.via];
            if (!coords) {
                const k = Object.keys(CORRIDOR_COORDS).find(key => item.via.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(item.via.toLowerCase()));
                if (k) coords = CORRIDOR_COORDS[k];
            }
            if (!coords) return;

            const color = getTrafficColor(item.status);
            const line = L.polyline(coords, {
                color,
                weight: 5,
                opacity: 0.8,
                dashArray: item.status === 'Lento' || item.status === 'Crítico' ? '8, 6' : null
            });

            line.bindPopup(`
                <div style="font-family:sans-serif; font-size:11px; line-height:1.4;">
                    <strong style="color:${color}; text-transform:uppercase;">${this._escapeHtml(item.via)}</strong><br>
                    <strong>Fluxo:</strong> ${this._escapeHtml(item.status)}<br>
                    <strong>Tempo:</strong> ${item.tempoAtual} min (Ref: ${item.tempoReferencia} min)<br>
                    <strong>Diferença:</strong> ${this._escapeHtml(item.diferenca)}
                </div>
            `);

            this.corridorLayer.addLayer(line);
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
