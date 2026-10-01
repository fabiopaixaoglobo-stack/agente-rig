import { resolveRegionalConfig, REGIONAL_REGISTRY } from './regional-registry.js';

export class TrafficAlertMap {
    constructor({ containerId = 'mapTrafficAlert', onIncidentSelect = null } = {}) {
        this.containerId = containerId;
        this.onIncidentSelect = onIncidentSelect;
        this.map = null;
        this.incidentLayer = null;
        this.cameraLayer = null;
        this.corridorLayer = null;
        this.isInitialized = false;

        // Centros canônicos por Regional (zero GPS)
        this.REGIONAL_CENTERS = REGIONAL_REGISTRY;
        this.currentRegion = 'RJ';
        this.DEFAULT_CENTER = REGIONAL_REGISTRY.RJ.center;
        this.DEFAULT_ZOOM = REGIONAL_REGISTRY.RJ.zoom;
    }

    _normalizeRegion(raw) {
        return resolveRegionalConfig(raw).internalCode;
    }

    setRegionalCenter(region) {
        const cfg = resolveRegionalConfig(region);
        this.currentRegion = cfg.internalCode;
        if (this.map) {
            this.map.flyTo(cfg.center, cfg.zoom, { duration: 1.0 });
            setTimeout(() => {
                try { this.map.invalidateSize(); } catch (e) {}
            }, 300);
        }
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
            this.map = L.map(this.containerId, {
                center: this.DEFAULT_CENTER,
                zoom: this.DEFAULT_ZOOM,
                zoomControl: true,
                attributionControl: false
            });

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
     * Centraliza o mapa nas coordenadas da regional ativa.
     */
    resetView() {
        if (this.map) {
            const cfg = this.REGIONAL_CENTERS[this.currentRegion] || this.REGIONAL_CENTERS.RJ;
            this.map.setView(cfg.center, cfg.zoom);
        }
    }

    /**
     * Ajusta o zoom do mapa para enquadrar os incidentes visíveis.
     */
    fitBoundsToVisible() {
        if (!this.map || !this.incidentLayer) return;
        try {
            const bounds = this.incidentLayer.getBounds();
            if (bounds && bounds.isValid && bounds.isValid()) {
                this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
            } else {
                this.resetView();
            }
        } catch (e) {
            this.resetView();
        }
    }

    /**
     * Foca e aproxima o mapa em um corredor estruturante específico.
     */
    focusCorridor(viaName) {
        if (!this.map || !viaName) return;
        const coords = this.getCorridorCoords(viaName);
        if (coords && coords.length > 0) {
            try {
                const bounds = L.latLngBounds(coords);
                this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
            } catch (e) {
                this.map.setView(coords[0], 14);
            }
        }
    }

    /**
     * Retorna a geometria de coordenadas de uma via, respeitando a regional ativa.
     */
    getCorridorCoords(viaName, region = this.currentRegion) {
        if (!viaName) return null;
        const vLow = viaName.toLowerCase().trim();
        const activeReg = resolveRegionalConfig(region).internalCode;

        // 45 Corredores Estruturantes das 5 Regionais Oficiais Globo (9 cada)
        const REGIONAL_CORRIDOR_COORDS = {
            'RJ': {
                'linha vermelha': [[-22.8130, -43.2480], [-22.8300, -43.2420], [-22.8450, -43.2380], [-22.8800, -43.2350], [-22.9050, -43.2100], [-22.9100, -43.1950]],
                'linha amarela': [[-22.8600, -43.2380], [-22.8750, -43.2480], [-22.8850, -43.2600], [-22.8980, -43.2650], [-22.9300, -43.3200], [-22.9800, -43.3650]],
                'av brasil': [[-22.8980, -43.2100], [-22.8750, -43.2450], [-22.8550, -43.2800], [-22.8450, -43.3000], [-22.8300, -43.3600], [-22.8500, -43.5400]],
                'avenida brasil': [[-22.8980, -43.2100], [-22.8750, -43.2450], [-22.8550, -43.2800], [-22.8450, -43.3000], [-22.8300, -43.3600], [-22.8500, -43.5400]],
                'ponte rio-niterói': [[-22.8750, -43.1100], [-22.8800, -43.1350], [-22.8850, -43.1600], [-22.8900, -43.2000]],
                'presidente dutra': [[-22.7550, -43.4500], [-22.7850, -43.3900], [-22.8050, -43.3600], [-22.8150, -43.3450], [-22.8300, -43.3300]],
                'dutra': [[-22.7550, -43.4500], [-22.7850, -43.3900], [-22.8050, -43.3600], [-22.8150, -43.3450], [-22.8300, -43.3300]],
                'transolímpica': [[-22.8650, -43.3950], [-22.8720, -43.3870], [-22.8950, -43.3900], [-22.9200, -43.4000], [-22.9600, -43.4150], [-23.0000, -43.4300]],
                'centro': [[-22.9030, -43.1780], [-22.9050, -43.1850], [-22.9080, -43.1920], [-22.9100, -43.2050], [-22.9120, -43.2150]],
                'zona sul': [[-22.9180, -43.1720], [-22.9350, -43.1750], [-22.9550, -43.1820], [-22.9650, -43.1790], [-22.9850, -43.1900]],
                'barra da tijuca': [[-22.9800, -43.3650], [-22.9850, -43.3620], [-22.9900, -43.3600], [-23.0000, -43.3300], [-23.0080, -43.3100]],
                'barra': [[-22.9800, -43.3650], [-22.9850, -43.3620], [-22.9900, -43.3600], [-23.0000, -43.3300], [-23.0080, -43.3100]]
            },
            'SP': {
                'marginal tietê': [[-23.5180, -46.6100], [-23.5150, -46.6350], [-23.5150, -46.6600], [-23.5180, -46.6850], [-23.5250, -46.7150], [-23.5280, -46.7450]],
                'marginal pinheiros': [[-23.5350, -46.7320], [-23.5500, -46.7180], [-23.5650, -46.7020], [-23.5950, -46.6950], [-23.6250, -46.6980], [-23.6450, -46.7050]],
                'radial leste': [[-23.5500, -46.6300], [-23.5450, -46.6100], [-23.5400, -46.5900], [-23.5380, -46.5750], [-23.5360, -46.5450], [-23.5350, -46.5150]],
                'av dos bandeirantes': [[-23.5950, -46.6850], [-23.6020, -46.6750], [-23.6080, -46.6650], [-23.6150, -46.6400], [-23.6120, -46.6250], [-23.6100, -46.6150]],
                'bandeirantes': [[-23.5950, -46.6850], [-23.6020, -46.6750], [-23.6080, -46.6650], [-23.6150, -46.6400], [-23.6120, -46.6250], [-23.6100, -46.6150]],
                'rodovia anchieta': [[-23.6050, -46.6050], [-23.6180, -46.6000], [-23.6250, -46.5950], [-23.6550, -46.5800], [-23.6850, -46.5650]],
                'anchieta': [[-23.6050, -46.6050], [-23.6180, -46.6000], [-23.6250, -46.5950], [-23.6550, -46.5800], [-23.6850, -46.5650]],
                'rodovia imigrantes': [[-23.6200, -46.6400], [-23.6350, -46.6380], [-23.6450, -46.6350], [-23.6750, -46.6250], [-23.7050, -46.6150]],
                'imigrantes': [[-23.6200, -46.6400], [-23.6350, -46.6380], [-23.6450, -46.6350], [-23.6750, -46.6250], [-23.7050, -46.6150]],
                'castelo branco': [[-23.5250, -46.7150], [-23.5200, -46.7450], [-23.5150, -46.7750], [-23.5100, -46.8150], [-23.5050, -46.8550]],
                'raposo tavares': [[-23.5700, -46.7150], [-23.5720, -46.7400], [-23.5750, -46.7650], [-23.5800, -46.8000], [-23.5850, -46.8350]],
                'ayrton senna': [[-23.5150, -46.5650], [-23.5050, -46.5350], [-23.4950, -46.5150], [-23.4850, -46.4750], [-23.4750, -46.4350]]
            },
            'BH': {
                'av cristiano machado': [[-19.9150, -43.9350], [-19.8950, -43.9300], [-19.8750, -43.9250], [-19.8550, -43.9220], [-19.8250, -43.9200]],
                'cristiano machado': [[-19.9150, -43.9350], [-19.8950, -43.9300], [-19.8750, -43.9250], [-19.8550, -43.9220], [-19.8250, -43.9200]],
                'anel rodoviário': [[-19.8650, -43.9450], [-19.8850, -43.9700], [-19.9050, -43.9850], [-19.9350, -43.9900], [-19.9650, -43.9800], [-19.9850, -43.9550]],
                'av antônio carlos': [[-19.9100, -43.9400], [-19.8900, -43.9500], [-19.8700, -43.9550], [-19.8600, -43.9600], [-19.8500, -43.9650]],
                'antônio carlos': [[-19.9100, -43.9400], [-19.8900, -43.9500], [-19.8700, -43.9550], [-19.8600, -43.9600], [-19.8500, -43.9650]],
                'av amazonas': [[-19.9180, -43.9380], [-19.9250, -43.9450], [-19.9320, -43.9550], [-19.9380, -43.9750], [-19.9450, -43.9950]],
                'amazonas': [[-19.9180, -43.9380], [-19.9250, -43.9450], [-19.9320, -43.9550], [-19.9380, -43.9750], [-19.9450, -43.9950]],
                'via expressa': [[-19.9250, -43.9750], [-19.9300, -44.0000], [-19.9350, -44.0250], [-19.9400, -44.0500], [-19.9450, -44.0750]],
                'br-040': [[-19.9550, -43.9550], [-19.9700, -43.9500], [-19.9850, -43.9450], [-20.0150, -43.9500], [-20.0450, -43.9550]],
                'br-381': [[-19.8850, -43.8950], [-19.8750, -43.8900], [-19.8650, -43.8850], [-19.8500, -43.8650], [-19.8350, -43.8450]],
                'centro': [[-19.9210, -43.9400], [-19.9180, -43.9350], [-19.9220, -43.9320], [-19.9250, -43.9300], [-19.9280, -43.9380]],
                'pampulha': [[-19.8600, -43.9800], [-19.8550, -43.9750], [-19.8500, -43.9700], [-19.8480, -43.9680], [-19.8450, -43.9650]]
            },
            'BSB': {
                'epia': [[-15.7450, -47.9250], [-15.7800, -47.9400], [-15.8150, -47.9550], [-15.8500, -47.9600], [-15.8850, -47.9650]],
                'eixo monumental': [[-15.7850, -47.9350], [-15.7900, -47.9150], [-15.7950, -47.8950], [-15.7980, -47.8800], [-15.8000, -47.8650]],
                'eixão sul': [[-15.7950, -47.8900], [-15.8100, -47.9050], [-15.8250, -47.9150], [-15.8400, -47.9250], [-15.8550, -47.9350]],
                'eixão norte': [[-15.7950, -47.8900], [-15.7800, -47.8850], [-15.7650, -47.8800], [-15.7500, -47.8780], [-15.7350, -47.8750]],
                'epig': [[-15.7950, -47.9250], [-15.8050, -47.9350], [-15.8150, -47.9450], [-15.8250, -47.9500]],
                'epdb': [[-15.8250, -47.8750], [-15.8450, -47.8750], [-15.8650, -47.8800], [-15.8850, -47.8850]],
                'ponte jk': [[-15.8200, -47.8350], [-15.8240, -47.8290], [-15.8260, -47.8250], [-15.8280, -47.8200]],
                'estrada parque taguatinga': [[-15.8150, -47.9650], [-15.8200, -47.9900], [-15.8250, -48.0150], [-15.8300, -48.0350], [-15.8350, -48.0550]],
                'eptg': [[-15.8150, -47.9650], [-15.8200, -47.9900], [-15.8250, -48.0150], [-15.8300, -48.0350], [-15.8350, -48.0550]],
                'br-060': [[-15.8450, -48.0350], [-15.8650, -48.0550], [-15.8850, -48.0750], [-15.9100, -48.1000], [-15.9350, -48.1250]]
            },
            'REC': {
                'av agamenon magalhães': [[-8.0350, -34.8980], [-8.0450, -34.8960], [-8.0500, -34.8950], [-8.0580, -34.8960], [-8.0680, -34.8980]],
                'agamenon magalhães': [[-8.0350, -34.8980], [-8.0450, -34.8960], [-8.0500, -34.8950], [-8.0580, -34.8960], [-8.0680, -34.8980]],
                'av boa viagem': [[-8.0950, -34.8850], [-8.1100, -34.8920], [-8.1250, -34.9000], [-8.1400, -34.9080], [-8.1550, -34.9120]],
                'boa viagem': [[-8.0950, -34.8850], [-8.1100, -34.8920], [-8.1250, -34.9000], [-8.1400, -34.9080], [-8.1550, -34.9120]],
                'br-101': [[-7.9850, -34.9350], [-8.0350, -34.9450], [-8.0650, -34.9480], [-8.0950, -34.9450], [-8.1450, -34.9350]],
                'br-232': [[-8.0650, -34.9550], [-8.0700, -34.9600], [-8.0750, -34.9650], [-8.0800, -34.9950], [-8.0850, -35.0250]],
                'via mangue': [[-8.0850, -34.8900], [-8.0950, -34.8920], [-8.1050, -34.8950], [-8.1200, -34.9000], [-8.1350, -34.9050]],
                'pe-015': [[-7.9450, -34.8550], [-7.9650, -34.8600], [-7.9850, -34.8650], [-8.0000, -34.8750], [-8.015, -34.8850]],
                'centro recife': [[-8.0650, -34.8850], [-8.0620, -34.8780], [-8.0600, -34.8750], [-8.0580, -34.8720]],
                'olinda': [[-8.0150, -34.8550], [-8.0050, -34.8500], [-7.9950, -34.8450], [-7.9850, -34.8420], [-7.9750, -34.8400]],
                'jaboatão': [[-8.1250, -34.9150], [-8.1400, -34.9200], [-8.1550, -34.9250], [-8.1650, -34.9300], [-8.1750, -34.9350]]
            }
        };

        // 1. Busca primeiro na regional ativa
        const activeDict = REGIONAL_CORRIDOR_COORDS[activeReg] || {};
        if (activeDict[vLow]) return activeDict[vLow];
        const matchKey = Object.keys(activeDict).find(k => vLow.includes(k) || k.includes(vLow));
        if (matchKey) return activeDict[matchKey];

        // 2. Busca nas outras praças se não encontrado na ativa
        for (const [rKey, dict] of Object.entries(REGIONAL_CORRIDOR_COORDS)) {
            if (rKey === activeReg) continue;
            if (dict[vLow]) return dict[vLow];
            const k = Object.keys(dict).find(itemKey => vLow.includes(itemKey) || itemKey.includes(vLow));
            if (k) return dict[k];
        }

        return null;
    }

    /**
     * Renderiza sobreposição das condições de trânsito em tempo real nos corredores
     * com traçado duplo (casing escuro de contraste + cor de fluidez estilo Google Maps).
     */
    renderTrafficConditions(trafficData = []) {
        if (!this.map || !this.corridorLayer) return;
        this.corridorLayer.clearLayers();

        const getTrafficColor = (status) => {
            const s = String(status).toLowerCase();
            if (s.includes('bloqueio')) return '#4338ca'; // Roxo escuro / azul índigo
            if (s.includes('crítico') || s.includes('critico') || s.includes('congestion')) return '#ef4444'; // Vermelho vivo
            if (s.includes('lento') || s.includes('intenso')) return '#f97316'; // Laranja
            if (s.includes('moderado')) return '#f59e0b'; // Amarelo
            return '#10b981'; // Verde fluido
        };

        trafficData.forEach(item => {
            let coords = (Array.isArray(item.coordinates) && Array.isArray(item.coordinates[0])) ? item.coordinates : null;
            if (!coords || coords.length < 2) {
                coords = this.getCorridorCoords(item.via, this.currentRegion);
            }
            if (!coords || coords.length < 2) return;

            const color = getTrafficColor(item.status);
            const isCrit = (item.status || '').toLowerCase().includes('crítico') || (item.status || '').toLowerCase().includes('bloqueio');
            const diffText = item.diferenca || (item.retencaoMin ? `+${item.retencaoMin} min` : '0 min');
            const velText = item.velocidadeAtualKmH ? `${item.velocidadeAtualKmH} km/h` : (item.velocidadePadraoKmH ? `${item.velocidadePadraoKmH} km/h` : '--');
            const ocorrenciaText = item.ocorrenciaAtiva || 'Fluxo regular sem ocorrências ativas';

            // 1. CASING EXTERNO (Contraste escuro para visibilidade sobre satélite e mapas escuros)
            const casing = L.polyline(coords, {
                color: '#020617',
                weight: 8,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false
            });

            // 2. OVERLAY COLORIDO (Representação das condições de trânsito em tempo real estilo Google Maps)
            const overlay = L.polyline(coords, {
                color: color,
                weight: isCrit ? 6 : 5,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
                dashArray: isCrit ? '8, 6' : null,
                interactive: true
            });

            // Tooltip explicativo e responsivo ao mouseover
            const tooltipContent = `
                <div style="font-family:system-ui,-apple-system,sans-serif; font-size:11px; padding:3px 6px; line-height:1.4;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                        <span style="font-size:12px;">🚦</span>
                        <strong style="color:#fff; text-transform:uppercase; font-size:11px;">${this._escapeHtml(item.via)}</strong>
                        <span style="background:${color}22; color:${color}; border:1px solid ${color}66; padding:1px 5px; border-radius:3px; font-weight:800; font-size:9.5px;">${this._escapeHtml(item.status)}</span>
                    </div>
                    <div style="color:#94a3b8; font-size:10px;">
                        Velocidade: <strong style="color:#e2e8f0;">${velText}</strong> • Retenção: <strong style="color:#f59e0b;">${diffText}</strong>
                    </div>
                    ${ocorrenciaText !== 'Fluxo regular sem ocorrências ativas' ? `<div style="color:#fca5a5; font-size:10px; margin-top:2px;">⚠️ ${this._escapeHtml(ocorrenciaText)}</div>` : ''}
                </div>
            `;
            overlay.bindTooltip(tooltipContent, {
                sticky: true,
                direction: 'top',
                className: 'ta-corridor-tooltip'
            });

            // Efeitos de Hover
            overlay.on('mouseover', () => {
                casing.setStyle({ weight: 11, opacity: 1.0 });
                overlay.setStyle({ weight: 7, opacity: 1.0 });
                casing.bringToFront();
                overlay.bringToFront();
            });

            overlay.on('mouseout', () => {
                casing.setStyle({ weight: 8, opacity: 0.95 });
                overlay.setStyle({ weight: isCrit ? 6 : 5, opacity: 0.95 });
            });

            // Popup ao clicar com botão de ação para abrir o Drawer
            overlay.bindPopup(`
                <div style="font-family:system-ui,-apple-system,sans-serif; font-size:11px; line-height:1.45; min-width:200px; color:#e2e8f0;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">
                        <strong style="color:${color}; text-transform:uppercase; font-size:12px;">${this._escapeHtml(item.via)}</strong>
                        <span style="background:${color}22; color:${color}; padding:1px 6px; border-radius:3px; font-size:9px; font-weight:800;">${this._escapeHtml(item.status)}</span>
                    </div>
                    <div style="margin-bottom:3px;"><strong>Retenção:</strong> <span style="color:#f59e0b;">${this._escapeHtml(diffText)}</span></div>
                    <div style="margin-bottom:3px;"><strong>Velocidade:</strong> ${velText} (Padrão: ${item.velocidadePadraoKmH ? item.velocidadePadraoKmH + ' km/h' : '--'})</div>
                    <div style="margin-bottom:3px;"><strong>Tendência:</strong> ${this._escapeHtml(item.tendencia || 'ESTÁVEL')}</div>
                    <div style="margin-bottom:6px; font-size:10px; color:#cbd5e1;"><strong>Situação:</strong> ${this._escapeHtml(ocorrenciaText)}</div>
                    <button onclick="window.trafficAlertView && window.trafficAlertView.drawer && window.trafficAlertView.drawer.openKpiDetail('vias', { selectedVia: '${this._escapeHtml(item.via)}' })" style="width:100%; background:var(--ta-cyan, #00d1ff); color:#000; font-weight:800; border:none; border-radius:4px; padding:5px; cursor:pointer; font-size:10px; text-transform:uppercase;">
                        Ver Detalhes do Corredor
                    </button>
                </div>
            `);

            this.corridorLayer.addLayer(casing);
            this.corridorLayer.addLayer(overlay);
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
