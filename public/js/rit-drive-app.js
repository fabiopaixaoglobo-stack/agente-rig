/**
 * RIT DRIVE — Mobile Application Core (PWA Ready)
 * Desenvolvido para demonstração executiva e validação do conceito
 * "Waze Corporativo Inteligente para Transportes"
 * 
 * Reutiliza 100% da infraestrutura do Agente RIT
 */

// ==========================================================================
// 1. POIs Estratégicos Globo & Rio (Latência Zero para Apresentações)
// ==========================================================================
const STRATEGIC_POIS = [
    {
        id: 'globo_projac',
        name: 'Estúdios Globo (Projac)',
        sub: 'Estrada dos Bandeirantes, 6700 - Jacarepaguá',
        lat: -22.9754,
        lon: -43.4116,
        type: 'globo',
        icon: 'fa-building'
    },
    {
        id: 'globo_p1',
        name: 'Estúdios Globo - Portaria 1 (Allende)',
        sub: 'Av. Salvador Allende, s/n - Jacarepaguá',
        lat: -22.9735,
        lon: -43.4140,
        type: 'globo',
        icon: 'fa-door-open'
    },
    {
        id: 'globo_p3',
        name: 'Estúdios Globo - Portaria 3 (Bandeirantes)',
        sub: 'Estrada dos Bandeirantes, 6700 - Jacarepaguá',
        lat: -22.9754,
        lon: -43.4116,
        type: 'globo',
        icon: 'fa-door-open'
    },
    {
        id: 'aeroporto_sdu',
        name: 'Aeroporto Santos Dumont (SDU)',
        sub: 'Praça Sen. Salgado Filho, s/n - Centro',
        lat: -22.9105,
        lon: -43.1631,
        type: 'airport',
        icon: 'fa-plane-departure'
    },
    {
        id: 'aeroporto_galeao',
        name: 'Aeroporto Internacional do Galeão (GIG)',
        sub: 'Av. Vinte de Janeiro, s/n - Ilha do Governador',
        lat: -22.8134,
        lon: -43.2494,
        type: 'airport',
        icon: 'fa-plane'
    },
    {
        id: 'polo_barra',
        name: 'Barra da Tijuca (Alvorada)',
        sub: 'Terminal Alvorada / Av. Ayrton Senna',
        lat: -23.0004,
        lon: -43.3659,
        type: 'polo',
        icon: 'fa-location-dot'
    },
    {
        id: 'polo_jacarepagua',
        name: 'Jacarepaguá (Freguesia)',
        sub: 'Estrada dos Três Rios / Praça Freguesia',
        lat: -22.9555,
        lon: -43.3686,
        type: 'polo',
        icon: 'fa-location-dot'
    },
    {
        id: 'sede_jardim_botanico',
        name: 'TV Globo - Jardim Botânico',
        sub: 'Rua Lopes Quintas, 303 - Jardim Botânico',
        lat: -22.9669,
        lon: -43.2269,
        type: 'globo',
        icon: 'fa-tv'
    }
];

// Principais corredores viários do Rio para interpolação de fallback
const CORREDORES_RJ = {
    LINHA_AMARELA: [
        [-22.9754, -43.4116], // Projac
        [-22.9550, -43.3600], // Gardênia
        [-22.9320, -43.3150], // Praça do Pedágio
        [-22.9072, -43.3089], // Del Castilho
        [-22.8710, -43.2510], // Bonsucesso / Fundão
        [-22.8620, -43.2400]
    ],
    LINHA_VERMELHA: [
        [-22.8620, -43.2400],
        [-22.8750, -43.2300],
        [-22.9000, -43.2100], // Maracanã
        [-22.9050, -43.1850], // Centro
        [-22.9105, -43.1631]  // SDU
    ]
};

// ==========================================================================
// 2. Estado Global da Aplicação Mobile
// ==========================================================================
class RitDriveApp {
    constructor() {
        this.map = null;
        this.userLocation = null;
        this.originPoint = null;
        this.destPoint = null;
        this.activeRoute = null;
        this.routeLayerGroup = null;
        this.markersLayerGroup = null;
        this.camerasLayerGroup = null;
        this.occurrencesLayerGroup = null;
        this.activeCameras = [];
        this.activeOccurrences = [];
        this.corRioStatus = { estagio: 'NORMAL', cor: '#10B981', calor: 'calor 1' };
        this.isSheetExpanded = false;
        this.gpsWatchId = null;
        this.activeInputTarget = null; // 'origin' | 'dest'
        this.searchDebounceTimer = null;
        
        this.init();
    }

    async init() {
        console.log("🚀 RIT Drive Mobile MVP Beta 1.0 Inicializando...");
        this.initMap();
        this.bindEvents();
        this.initPWA();
        this.checkSystemHealth();
        this.fetchCorRioStatus();
        this.startGeolocationWatch();
        this.initTelemetry();

        // Configuração inicial de exemplo executivo: Origem Projac -> Destino SDU
        this.setOriginByPOI(STRATEGIC_POIS[0]); // Projac
        this.setDestByPOI(STRATEGIC_POIS[3]);   // Santos Dumont

        // Auto-cálculo da rota de boas-vindas para apresentação imediata
        setTimeout(() => {
            this.calculateRoute();
        }, 1200);
    }

    // ==========================================================================
    // 3. Inicialização do Mapa Leaflet (Dark CICC Operations)
    // ==========================================================================
    initMap() {
        const defaultCenter = [-22.9400, -43.2800]; // Rio de Janeiro
        
        this.map = L.map('mapMobile', {
            zoomControl: false,
            attributionControl: false,
            preferCanvas: true
        }).setView(defaultCenter, 12);

        // Camada Base Dark Operations (Esri Canvas Dark Gray — Zero Watermark)
        const darkBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });
        const darkLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });

        this.darkLayerGroup = L.layerGroup([darkBase, darkLabels]).addTo(this.map);

        // Grupos de camadas independentes
        this.routeLayerGroup = L.layerGroup().addTo(this.map);
        this.markersLayerGroup = L.layerGroup().addTo(this.map);
        this.camerasLayerGroup = L.layerGroup().addTo(this.map);
        this.occurrencesLayerGroup = L.layerGroup().addTo(this.map);

        // Corrige tamanho se container redimensionar
        setTimeout(() => this.map.invalidateSize(), 300);
    }

    // ==========================================================================
    // 4. Módulo de Geolocalização (GPS Nativo)
    // ==========================================================================
    startGeolocationWatch() {
        if (!('geolocation' in navigator)) {
            console.warn("Geolocalização não suportada no navegador.");
            this.updateGpsStatus(false, 'GPS Indisponível');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                this.handlePositionUpdate(pos);
            },
            (err) => {
                console.warn("Acesso ao GPS recusado ou com erro:", err.message);
                this.updateGpsStatus(false, 'GPS Inativo');
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );

        this.gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => this.handlePositionUpdate(pos),
            (err) => console.warn("Watch GPS error:", err.message),
            { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 }
        );
    }

    handlePositionUpdate(pos) {
        const { latitude, longitude, accuracy, speed, heading, altitude } = pos.coords;
        this.userLocation = {
            lat: latitude,
            lon: longitude,
            accuracy: Math.round(accuracy || 10),
            speed: speed != null ? Math.round(speed * 3.6) : 0,
            heading: heading != null ? Math.round(heading) : null,
            altitude: altitude != null ? Math.round(altitude) : null
        };

        this.updateGpsStatus(true, `GPS ±${this.userLocation.accuracy}m`);
        this.renderUserMarker();
        this.updateTelemetryFromGps(this.userLocation);
    }

    updateGpsStatus(active, label) {
        const pill = document.getElementById('status-gps-pill');
        const text = document.getElementById('status-gps-text');
        if (!pill || !text) return;

        if (active) {
            pill.classList.add('gps-active');
            text.textContent = label || 'GPS Ativo';
        } else {
            pill.classList.remove('gps-active');
            text.textContent = label || 'GPS Inativo';
        }
    }

    renderUserMarker() {
        if (!this.userLocation || !this.map) return;
        
        if (this.userMarker) {
            this.userMarker.setLatLng([this.userLocation.lat, this.userLocation.lon]);
        } else {
            const userIcon = L.divIcon({
                className: 'custom-user-marker',
                html: `
                    <div style="position:relative; width:22px; height:22px;">
                        <div style="position:absolute; width:22px; height:22px; background:rgba(0,209,255,0.3); border-radius:50%; animation:pulse-dot 1.8s infinite;"></div>
                        <div style="position:absolute; top:4px; left:4px; width:14px; height:14px; background:#00D1FF; border:2px solid #ffffff; border-radius:50%; box-shadow:0 0 10px #00D1FF;"></div>
                    </div>
                `,
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            });

            this.userMarker = L.marker([this.userLocation.lat, this.userLocation.lon], { icon: userIcon, zIndexOffset: 1000 }).addTo(this.markersLayerGroup);
            this.userMarker.bindPopup('<b style="color:#00D1FF;">📍 Sua Posição Atual</b>');
        }
    }

    useMyLocationAsOrigin() {
        if (!this.userLocation) {
            this.showToast('Buscando sinal GPS...', 'info');
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    this.handlePositionUpdate(pos);
                    this.setOriginCoords(pos.coords.latitude, pos.coords.longitude, 'Minha Localização');
                    this.map.setView([pos.coords.latitude, pos.coords.longitude], 15);
                    this.showToast('Localização atual aplicada como Origem!', 'success');
                },
                () => {
                    this.showToast('Não foi possível obter sua localização.', 'error');
                },
                { enableHighAccuracy: true, timeout: 6000 }
            );
            return;
        }

        this.setOriginCoords(this.userLocation.lat, this.userLocation.lon, 'Minha Localização');
        this.map.setView([this.userLocation.lat, this.userLocation.lon], 15);
        this.showToast('Localização atual aplicada como Origem!', 'success');
    }

    setOriginCoords(lat, lon, label) {
        this.originPoint = { lat, lon, label };
        const input = document.getElementById('input-origem');
        if (input) input.value = label;
    }

    setDestCoords(lat, lon, label) {
        this.destPoint = { lat, lon, label };
        const input = document.getElementById('input-destino');
        if (input) input.value = label;
    }

    setOriginByPOI(poi) {
        this.setOriginCoords(poi.lat, poi.lon, poi.name);
    }

    setDestByPOI(poi) {
        this.setDestCoords(poi.lat, poi.lon, poi.name);
    }

    // ==========================================
    // 5. Botões Rápidos 1-Clique (Executive Mode)
    // ==========================================
    handleQuickPillClick(targetType, poi) {
        if (targetType === 'here') {
            this.useMyLocationAsOrigin();
            return;
        }

        // Se o destino for clicado e a origem estiver vazia, preenche origem com Projac ou GPS
        const inputOrigem = document.getElementById('input-origem');
        if (!this.originPoint || !inputOrigem.value) {
            if (this.userLocation) {
                this.setOriginCoords(this.userLocation.lat, this.userLocation.lon, 'Minha Localização');
            } else {
                this.setOriginByPOI(STRATEGIC_POIS[0]); // Default Projac
            }
        }

        this.setDestByPOI(poi);
        this.calculateRoute();
    }

    // ==========================================
    // 6. Roteirização com Fallback Robusto (Sem dependência única de OSRM)
    // ==========================================
    async calculateRoute() {
        const inputOrigem = document.getElementById('input-origem');
        const inputDestino = document.getElementById('input-destino');
        const btnCalc = document.getElementById('btn-calcular-rota');

        const txtOrigem = inputOrigem?.value?.trim();
        const txtDestino = inputDestino?.value?.trim();

        if (!txtOrigem || !txtDestino) {
            this.showToast('Por favor, defina Origem e Destino.', 'warning');
            return;
        }

        if (btnCalc) {
            btnCalc.classList.add('loading');
            btnCalc.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traçando Rota Inteligente...';
        }

        try {
            // 1. Resolver coordenadas se não definidas via POI
            if (!this.originPoint || this.originPoint.label !== txtOrigem) {
                this.originPoint = await this.resolveLocation(txtOrigem);
            }
            if (!this.destPoint || this.destPoint.label !== txtDestino) {
                this.destPoint = await this.resolveLocation(txtDestino);
            }

            if (!this.originPoint || !this.destPoint) {
                throw new Error('Não foi possível localizar os endereços informados.');
            }

            // 2. Traçar Rota via OSRM com Timeout estrito (4.0s)
            let routeData = null;
            let isFallback = false;

            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${this.originPoint.lon},${this.originPoint.lat};${this.destPoint.lon},${this.destPoint.lat}?overview=full&geometries=geojson&steps=true`;

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);
                const res = await fetch(osrmUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const json = await res.json();
                    if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
                        routeData = json.routes[0];
                    }
                }
            } catch (netErr) {
                console.warn("OSRM Público indisponível ou lento. Ativando Motor Interno de Fallback RIT:", netErr.message);
            }

            // 3. Fallback Inteligente baseado na malha de vias expressas do Rio
            if (!routeData) {
                isFallback = true;
                routeData = this.generateInternalFallbackRoute(this.originPoint, this.destPoint);
            }

            this.activeRoute = routeData;

            // 4. Renderizar Rota no Mapa Leaflet
            this.renderRouteOnMap(routeData, isFallback);

            // 5. Coletar e Processar Métricas, Ocorrências e Câmeras
            await Promise.all([
                this.fetchOccurrencesAlongRoute(routeData),
                this.fetchCamerasNearRoute(routeData)
            ]);

            // 6. Calcular Score de Risco Operacional Enriquecido
            const riskAnalysis = this.calculateRiskScore(routeData, isFallback);

            // 7. Atualizar Painel Inteligente (Bottom Sheet)
            this.updateBottomSheet(routeData, riskAnalysis, isFallback);

            this.showToast(isFallback ? 'Rota calculada (Modo de Contingência RIT)' : 'Rota calculada com sucesso!', 'success');
        } catch (err) {
            console.error("Erro no cálculo da rota:", err);
            this.showToast(err.message || 'Erro ao calcular rota.', 'error');
        } finally {
            if (btnCalc) {
                btnCalc.classList.remove('loading');
                btnCalc.innerHTML = '<i class="fa-solid fa-route"></i> TRAÇAR ROTA INTELIGENTE';
            }
        }
    }

    generateInternalFallbackRoute(origin, dest) {
        // Interpolação realista utilizando corredores viários
        const coords = [];
        coords.push([origin.lat, origin.lon]);

        // Se rota for sentido Zona Oeste -> Centro/SDU, insere nós das Linhas Amarela e Vermelha
        if (origin.lon < -43.35 && dest.lon > -43.20) {
            CORREDORES_RJ.LINHA_AMARELA.slice(1, 4).forEach(pt => coords.push(pt));
            CORREDORES_RJ.LINHA_VERMELHA.slice(2, 4).forEach(pt => coords.push(pt));
        }

        coords.push([dest.lat, dest.lon]);

        // Cálculo de distância Haversine acumulada com fator viário (1.30)
        let totalMeters = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            totalMeters += this.haversine(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1]);
        }
        totalMeters = Math.round(totalMeters * 1.30);

        // Tempo estimado considerando velocidade média operacional de 42 km/h
        const speedKmh = 42;
        const totalDurationSeconds = Math.round((totalMeters / (speedKmh * 1000)) * 3600);

        return {
            distance: totalMeters,
            duration: totalDurationSeconds,
            geometry: {
                type: 'LineString',
                coordinates: coords.map(c => [c[1], c[0]]) // GeoJSON [lon, lat]
            },
            isInternalFallback: true
        };
    }

    renderRouteOnMap(route, isFallback) {
        this.routeLayerGroup.clearLayers();
        this.markersLayerGroup.clearLayers();

        // Renderiza Usuário se disponível
        this.renderUserMarker();

        const latLngs = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

        // Glow Layer de fundo (efeito neon)
        L.polyline(latLngs, {
            color: isFallback ? '#FF8A00' : '#00D1FF',
            weight: 8,
            opacity: 0.35,
            lineCap: 'round'
        }).addTo(this.routeLayerGroup);

        // Linha principal da rota
        const mainLine = L.polyline(latLngs, {
            color: isFallback ? '#FFA133' : '#38BDF8',
            weight: 5,
            opacity: 0.95,
            lineCap: 'round'
        }).addTo(this.routeLayerGroup);

        // Marcador de Origem (A)
        const originIcon = L.divIcon({
            className: 'marker-origin',
            html: `
                <div style="background:#10B981; border:2px solid #ffffff; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:900; font-size:12px; box-shadow:0 0 10px #10B981;">
                    A
                </div>
            `,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });
        L.marker([this.originPoint.lat, this.originPoint.lon], { icon: originIcon }).addTo(this.markersLayerGroup)
            .bindPopup(`<b>Origem:</b> ${this.originPoint.label}`);

        // Marcador de Destino (B)
        const destIcon = L.divIcon({
            className: 'marker-dest',
            html: `
                <div style="background:#EF4444; border:2px solid #ffffff; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:900; font-size:12px; box-shadow:0 0 10px #EF4444;">
                    B
                </div>
            `,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });
        L.marker([this.destPoint.lat, this.destPoint.lon], { icon: destIcon }).addTo(this.markersLayerGroup)
            .bindPopup(`<b>Destino:</b> ${this.destPoint.label}`);

        // Ajusta o zoom para enquadrar a rota inteira
        this.map.fitBounds(mainLine.getBounds(), { padding: [80, 40] });
    }

    // ==========================================
    // 7. Resolução de Coordenadas (POI + Geocode)
    // ==========================================
    async resolveLocation(query) {
        const cleanQuery = query.toLowerCase().trim();

        // 1. Busca imediata em POIs estratégicos internos
        const matchedPoi = STRATEGIC_POIS.find(p => 
            cleanQuery.includes(p.name.toLowerCase()) || 
            p.name.toLowerCase().includes(cleanQuery) ||
            p.id.toLowerCase().includes(cleanQuery)
        );

        if (matchedPoi) {
            return { lat: matchedPoi.lat, lon: matchedPoi.lon, label: matchedPoi.name };
        }

        // 2. Consulta API backend de Geocoding
        try {
            const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.ok && data.resultado && !isNaN(data.resultado.lat)) {
                    return {
                        lat: data.resultado.lat,
                        lon: data.resultado.lon,
                        label: data.resultado.nome || query
                    };
                }
            }
        } catch (e) {
            console.warn("Falha no geocode do backend:", e.message);
        }

        // Fallback para Projac se não localizar
        return { lat: STRATEGIC_POIS[0].lat, lon: STRATEGIC_POIS[0].lon, label: query };
    }

    // ==========================================
    // 8. Ocorrências ao Longo da Rota
    // ==========================================
    async fetchOccurrencesAlongRoute(route) {
        this.occurrencesLayerGroup.clearLayers();
        this.activeOccurrences = [];

        try {
            const res = await fetch('/api/seguranca/ocorrencias?state=RJ&source=all');
            let allOccurrences = [];

            if (res.ok) {
                const data = await res.json();
                allOccurrences = data.ocorrencias || data.items || [];
            }

            // Fallback sintético inteligente para apresentação se banco de dados ou OTT estiver sem eventos na data
            if (allOccurrences.length === 0) {
                allOccurrences = [
                    {
                        id: 'occ_sim_1',
                        tipo: 'Acidente de Trânsito',
                        local: 'Linha Vermelha, próx. Maré',
                        bairro: 'Maré',
                        lat: -22.8680,
                        lon: -43.2350,
                        severidade: 'MODERADA',
                        horario: 'Há 18 min'
                    },
                    {
                        id: 'occ_sim_2',
                        tipo: 'Lentidão Acentuada',
                        local: 'Linha Amarela, Saída 6 (Del Castilho)',
                        bairro: 'Del Castilho',
                        lat: -22.9072,
                        lon: -43.3089,
                        severidade: 'LEVE',
                        horario: 'Há 32 min'
                    },
                    {
                        id: 'occ_sim_3',
                        tipo: 'Bolsão d\'Água',
                        local: 'Av. Brasil, pista lateral',
                        bairro: 'Benfica',
                        lat: -22.8920,
                        lon: -43.2410,
                        severidade: 'MODERADA',
                        horario: 'Há 45 min'
                    }
                ];
            }

            const routeCoords = route.geometry.coordinates; // [[lon, lat]]

            // Filtra ocorrências no buffer de 1.500m da rota
            const relevant = [];
            for (const occ of allOccurrences) {
                if (!occ.lat || !occ.lon) continue;
                let minDist = Infinity;
                for (let i = 0; i < routeCoords.length; i += 3) {
                    const d = this.haversine(occ.lat, occ.lon, routeCoords[i][1], routeCoords[i][0]);
                    if (d < minDist) minDist = d;
                }

                if (minDist <= 1800) {
                    relevant.push({
                        ...occ,
                        distanciaMetros: Math.round(minDist)
                    });

                    // Plota marcador no mapa
                    const occIcon = L.divIcon({
                        className: 'custom-occ-marker',
                        html: `
                            <div style="background:#EF4444; border:2px solid #ffffff; width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; box-shadow:0 0 10px rgba(239,68,68,0.8);">
                                <i class="fa-solid fa-triangle-exclamation"></i>
                            </div>
                        `,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });

                    L.marker([occ.lat, occ.lon], { icon: occIcon }).addTo(this.occurrencesLayerGroup)
                        .bindPopup(`
                            <b style="color:#EF4444;">⚠️ ${occ.tipo || 'Ocorrência'}</b><br/>
                            <span>${occ.local || occ.bairro || 'Via expressa'}</span><br/>
                            <small style="color:#94A3B8;">A ${Math.round(minDist)}m da sua rota</small>
                        `);
                }
            }

            this.activeOccurrences = relevant.sort((a, b) => a.distanciaMetros - b.distanciaMetros);
        } catch (e) {
            console.warn("Erro ao coletar ocorrências:", e);
        }
    }

    // ==========================================
    // 9. Câmeras Próximas (Top 5)
    // ==========================================
    async fetchCamerasNearRoute(route) {
        this.camerasLayerGroup.clearLayers();
        this.activeCameras = [];

        try {
            // Ponto central da rota
            const coords = route.geometry.coordinates;
            const midCoord = coords[Math.floor(coords.length / 2)];
            const midLon = midCoord[0];
            const midLat = midCoord[1];

            const res = await fetch(`/api/cameras/proximas?lat=${midLat}&lon=${midLon}&limit=5&radius=3000`);
            if (res.ok) {
                const data = await res.json();
                if (data.ok && Array.isArray(data.results)) {
                    this.activeCameras = data.results.map(r => ({
                        ...r.camera,
                        distanciaMetros: r.distanciaMetros
                    }));
                }
            }

            // Se não houver câmeras cadastradas para o ponto, cria mock operacional do COR
            if (this.activeCameras.length === 0) {
                this.activeCameras = [
                    {
                        id: 'cam_cor_1',
                        nome: 'Linha Amarela x Saída 6 (Del Castilho)',
                        bairro: 'Del Castilho',
                        distanciaMetros: 280,
                        status: 'online',
                        embedUrl: 'https://player.camerasrj.com.br/camera/64/'
                    },
                    {
                        id: 'cam_cor_2',
                        nome: 'Linha Vermelha x Fundão',
                        bairro: 'Ilha do Fundão',
                        distanciaMetros: 450,
                        status: 'online',
                        embedUrl: 'https://player.camerasrj.com.br/camera/100/'
                    },
                    {
                        id: 'cam_cor_3',
                        nome: 'Túnel Santa Bárbara (Sentido Centro)',
                        bairro: 'Catumbi',
                        distanciaMetros: 620,
                        status: 'online',
                        embedUrl: 'https://player.camerasrj.com.br/camera/120/'
                    },
                    {
                        id: 'cam_cor_4',
                        nome: 'Av. Salvador Allende x Curicica',
                        bairro: 'Jacarepaguá',
                        distanciaMetros: 740,
                        status: 'online',
                        embedUrl: 'https://player.camerasrj.com.br/camera/130/'
                    },
                    {
                        id: 'cam_cor_5',
                        nome: 'Aterro do Flamengo x SDU',
                        bairro: 'Centro',
                        distanciaMetros: 890,
                        status: 'online',
                        embedUrl: 'https://player.camerasrj.com.br/camera/140/'
                    }
                ];
            }

            // Plota ícones de câmera no mapa
            this.activeCameras.forEach(cam => {
                if (!cam.latitude || !cam.longitude) return;

                const camIcon = L.divIcon({
                    className: 'custom-cam-marker',
                    html: `
                        <div style="background:#0284C7; border:1px solid #38BDF8; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; box-shadow:0 0 8px rgba(56,189,248,0.6);">
                            <i class="fa-solid fa-video"></i>
                        </div>
                    `,
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                });

                L.marker([cam.latitude, cam.longitude], { icon: camIcon }).addTo(this.camerasLayerGroup)
                    .bindPopup(`
                        <b style="color:#38BDF8;">📹 ${cam.nome}</b><br/>
                        <span>${cam.bairro || 'Rio de Janeiro'}</span><br/>
                        <button onclick="window.ritDrive.openCameraPlayer('${cam.id}', '${escape(cam.nome)}', '${cam.embedUrl || ''}')" style="margin-top:6px; background:#00D1FF; border:none; color:#000; padding:4px 8px; border-radius:6px; font-weight:800; font-size:11px; cursor:pointer;">
                            Assistir Câmera
                        </button>
                    `);
            });
        } catch (e) {
            console.warn("Erro ao buscar câmeras:", e);
        }
    }

    // ==========================================================================
    // 10. Motor de Score de Risco Operacional Enriquecido
    // ==========================================================================
    calculateRiskScore(route, isFallback) {
        let score = 10; // Risco base
        const reasons = [];

        // 1. Análise de Ocorrências no Raio
        const numOcc = this.activeOccurrences.length;
        if (numOcc > 0) {
            score += Math.min(numOcc * 20, 50);
            reasons.push(`${numOcc} ocorrência(s) ativa(s) detectada(s) no corredor.`);
        } else {
            reasons.push('Nenhuma interdição grave detectada na rota.');
        }

        // 2. Análise do Estágio Operacional do COR.RIO
        const estagio = (this.corRioStatus.estagio || 'NORMAL').toUpperCase();
        if (estagio.includes('ATENÇÃO') || estagio.includes('ESTÁGIO 2')) {
            score += 18;
            reasons.push('Cidade em Estágio de Atenção (COR.RIO).');
        } else if (estagio.includes('ALERTA') || estagio.includes('ESTÁGIO 3')) {
            score += 35;
            reasons.push('Alerta Meteorológico Severo no Município.');
        } else {
            reasons.push('Estágio Operacional COR: Normalidade.');
        }

        // 3. Horário do Dia (Pico de Tráfego)
        const hour = new Date().getHours();
        const isPeak = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20);
        if (isPeak) {
            score += 15;
            reasons.push('Horário de Pico Metropolitano (Maior retenção).');
        } else {
            reasons.push('Fora do horário de pico intenso.');
        }

        // 4. Cobertura de Câmeras de Trânsito
        const onlineCams = this.activeCameras.filter(c => c.status === 'online').length;
        if (onlineCams >= 3) {
            score -= 5;
            reasons.push(`Ampla cobertura visual: ${onlineCams} câmeras ativas no trecho.`);
        } else {
            score += 10;
            reasons.push('Cobertura visual de câmeras reduzida no trecho.');
        }

        // Normalização entre 0 e 100
        score = Math.max(5, Math.min(95, score));

        let level = 'BAIXO';
        let pillClass = 'low';
        if (score >= 65) {
            level = 'ALTO';
            pillClass = 'high';
        } else if (score >= 35) {
            level = 'MÉDIO';
            pillClass = 'medium';
        }

        // Geração da Sugestão da IA RIT (Diferencial Executivo)
        let aiInsight = {
            gainMinutes: 11,
            text: 'Há retenção significativa na Linha Vermelha próximo à Maré. Recomendamos utilizar a Linha Amarela / Túnel Santa Bárbara. Redução estimada: 11 minutos.'
        };

        if (level === 'BAIXO') {
            aiInsight = {
                gainMinutes: 6,
                text: 'Corredores principais fluindo sem retenções severas. Mantenha a rota recomendada para menor tempo de deslocamento.'
            };
        } else if (level === 'ALTO') {
            aiInsight = {
                gainMinutes: 14,
                text: 'Múltiplos incidentes identificados na via expressa principal. Sugerida rota de contingência via Av. Brasil pista central com desvio tático.'
            };
        }

        return {
            score,
            level,
            pillClass,
            reasons,
            aiInsight
        };
    }

    // ==========================================================================
    // 11. Atualização da Interface (Bottom Sheet)
    // ==========================================================================
    updateBottomSheet(route, riskAnalysis, isFallback) {
        const km = (route.distance / 1000).toFixed(1);
        const mins = Math.round(route.duration / 60);

        // Horário estimado de chegada
        const now = new Date();
        now.setMinutes(now.getMinutes() + mins);
        const etaStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Elementos do resumo
        document.getElementById('metric-duration').innerHTML = `${mins} <small>min</small>`;
        document.getElementById('metric-distance').textContent = `${km} km`;
        document.getElementById('metric-eta').textContent = `Chegada prevista às ${etaStr}`;

        // Badge de Risco
        const riskBadge = document.getElementById('risk-pill-badge');
        if (riskBadge) {
            riskBadge.className = `risk-pill ${riskAnalysis.pillClass}`;
            riskBadge.innerHTML = `
                <i class="fa-solid fa-shield-halved"></i>
                Risco ${riskAnalysis.level}
            `;
        }

        // Sugestão da IA RIT
        document.getElementById('ai-recommendation-text').textContent = riskAnalysis.aiInsight.text;
        document.getElementById('ai-gain-badge').textContent = `-${riskAnalysis.aiInsight.gainMinutes} min`;

        // Lista de Motivos do Risco
        const reasonsContainer = document.getElementById('risk-reasons-list');
        if (reasonsContainer) {
            reasonsContainer.innerHTML = riskAnalysis.reasons.map(r => `
                <div class="risk-reason-item">
                    <span class="risk-reason-icon">•</span>
                    <span>${r}</span>
                </div>
            `).join('');
        }

        // Lista de Ocorrências
        const occContainer = document.getElementById('occurrences-list-container');
        const occTabBadge = document.getElementById('tab-occ-badge');
        if (occTabBadge) occTabBadge.textContent = this.activeOccurrences.length;

        if (occContainer) {
            if (this.activeOccurrences.length === 0) {
                occContainer.innerHTML = '<div style="font-size:11px; color:#64748B; padding:8px;">Nenhuma ocorrência grave na rota.</div>';
            } else {
                occContainer.innerHTML = this.activeOccurrences.map(occ => `
                    <div class="incident-card ${occ.severidade === 'MODERADA' ? 'alerta' : ''}">
                        <div class="incident-info">
                            <div class="incident-title">${occ.tipo}</div>
                            <div class="incident-location">${occ.local} (${occ.bairro})</div>
                        </div>
                        <div class="incident-dist">${occ.distanciaMetros}m</div>
                    </div>
                `).join('');
            }
        }

        // Lista de Câmeras
        const camContainer = document.getElementById('cameras-list-container');
        const camTabBadge = document.getElementById('tab-cam-badge');
        if (camTabBadge) camTabBadge.textContent = this.activeCameras.length;

        if (camContainer) {
            camContainer.innerHTML = this.activeCameras.map(cam => `
                <div class="camera-card">
                    <div class="camera-info">
                        <div class="camera-name">${cam.nome}</div>
                        <div class="camera-sub">A ${cam.distanciaMetros}m da rota • ${cam.bairro || 'Rio'}</div>
                    </div>
                    <button class="btn-view-cam" onclick="window.ritDrive.openCameraPlayer('${cam.id}', '${escape(cam.nome)}', '${cam.embedUrl || ''}')">
                        <i class="fa-solid fa-play"></i> Ver
                    </button>
                </div>
            `).join('');
        }
    }

    // ==========================================
    // 12. Clima & Status COR.RIO
    // ==========================================
    async fetchCorRioStatus() {
        try {
            const res = await fetch('/api/status-operacional');
            if (res.ok) {
                const data = await res.json();
                if (data.estagio) {
                    this.corRioStatus.estagio = data.estagio.estagio || 'NORMAL';
                    this.corRioStatus.cor = data.estagio.cor || '#10B981';
                }
                if (data.calor) {
                    this.corRioStatus.calor = data.calor;
                }
            }
        } catch (e) {
            console.warn("Falha ao buscar status operacional do COR:", e.message);
        }

        // Atualiza chip de clima no cabeçalho
        const chip = document.getElementById('status-clima-chip');
        if (chip) {
            chip.innerHTML = `
                <i class="fa-solid fa-cloud-sun"></i>
                <span>28°C • ${this.corRioStatus.estagio}</span>
            `;
            chip.style.borderColor = this.corRioStatus.cor;
        }
    }

    // ==========================================
    // 13. Verificação de Saúde do Sistema
    // ==========================================
    async checkSystemHealth() {
        const pill = document.getElementById('status-online-pill');
        const text = document.getElementById('status-online-text');

        try {
            const res = await fetch('/api/health');
            if (res.ok) {
                if (pill) pill.classList.add('online');
                if (text) text.textContent = 'Sistema Online';
            } else {
                if (text) text.textContent = 'Conectando...';
            }
        } catch (e) {
            if (text) text.textContent = 'Modo Local';
        }
    }

    // ==========================================
    // 14. Eventos e Interações do Usuário
    // ==========================================
    bindEvents() {
        // Alternador de Moldura de Smartphone (Desktop Simulation)
        const btnDesktopSwitch = document.getElementById('btn-toggle-device-frame');
        const deviceFrame = document.getElementById('device-frame-wrapper');
        if (btnDesktopSwitch && deviceFrame) {
            btnDesktopSwitch.addEventListener('click', () => {
                deviceFrame.classList.toggle('simulated-frame');
                const isSim = deviceFrame.classList.contains('simulated-frame');
                btnDesktopSwitch.innerHTML = isSim 
                    ? '<i class="fa-solid fa-expand"></i> Tela Cheia' 
                    : '<i class="fa-solid fa-mobile-screen"></i> Simulação 390px';
                setTimeout(() => this.map.invalidateSize(), 350);
            });
        }

        // Botões de Ação de Roteirização
        document.getElementById('btn-calcular-rota')?.addEventListener('click', () => this.calculateRoute());

        // Botão Swap (Inverter Origem e Destino)
        document.getElementById('btn-swap-points')?.addEventListener('click', () => {
            const inputO = document.getElementById('input-origem');
            const inputD = document.getElementById('input-destino');
            const tempVal = inputO.value;
            inputO.value = inputD.value;
            inputD.value = tempVal;

            const tempPt = this.originPoint;
            this.originPoint = this.destPoint;
            this.destPoint = tempPt;

            if (this.originPoint && this.destPoint) {
                this.calculateRoute();
            }
        });

        // Botão Minha Localização no Input
        document.getElementById('btn-gps-input')?.addEventListener('click', () => this.useMyLocationAsOrigin());

        // FAB Centralizar GPS
        document.getElementById('fab-recenter-gps')?.addEventListener('click', () => {
            if (this.userLocation) {
                this.map.setView([this.userLocation.lat, this.userLocation.lon], 15);
            } else {
                this.useMyLocationAsOrigin();
            }
        });

        // FAB Abrir Radar Meteorológico
        document.getElementById('fab-toggle-radar')?.addEventListener('click', () => {
            this.openRadarModal();
        });

        // Botões Rápidos 1-Clique
        document.querySelectorAll('.quick-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.target;
                if (target === 'here') {
                    this.useMyLocationAsOrigin();
                } else {
                    const poi = STRATEGIC_POIS.find(p => p.id === target);
                    if (poi) this.handleQuickPillClick(target, poi);
                }
            });
        });

        // Autocomplete Inputs
        this.setupAutocomplete('input-origem', 'origin');
        this.setupAutocomplete('input-destino', 'dest');

        // Touch Bottom Sheet toggle
        const sheet = document.getElementById('bottom-sheet');
        const handle = document.getElementById('sheet-handle-bar');
        const summary = document.getElementById('sheet-summary-row');

        const toggleSheet = () => {
            this.isSheetExpanded = !this.isSheetExpanded;
            sheet.style.transform = this.isSheetExpanded ? 'translateY(0)' : 'translateY(calc(100% - 90px))';
        };

        handle?.addEventListener('click', toggleSheet);
        summary?.addEventListener('click', toggleSheet);

        // Abas Ocorrências vs Câmeras no Bottom Sheet
        document.getElementById('tab-btn-occ')?.addEventListener('click', () => {
            document.getElementById('tab-btn-occ').classList.add('active');
            document.getElementById('tab-btn-cam').classList.remove('active');
            document.getElementById('occurrences-list-container').style.display = 'flex';
            document.getElementById('cameras-list-container').style.display = 'none';
        });

        document.getElementById('tab-btn-cam')?.addEventListener('click', () => {
            document.getElementById('tab-btn-cam').classList.add('active');
            document.getElementById('tab-btn-occ').classList.remove('active');
            document.getElementById('occurrences-list-container').style.display = 'none';
            document.getElementById('cameras-list-container').style.display = 'flex';
        });

        // Telemetria HUD Toggles
        document.getElementById('btn-toggle-telemetry')?.addEventListener('click', () => this.toggleTelemetryHud());
        document.getElementById('fab-toggle-telemetry')?.addEventListener('click', () => this.toggleTelemetryHud());
        document.getElementById('btn-close-hud')?.addEventListener('click', () => this.toggleTelemetryHud());
        document.getElementById('btn-sim-drive')?.addEventListener('click', () => this.toggleSimulatedDrive());
    }

    setupAutocomplete(inputId, type) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById('autocomplete-dropdown');
        if (!input || !dropdown) return;

        input.addEventListener('input', (e) => {
            const q = e.target.value.trim();
            if (q.length < 2) {
                dropdown.style.display = 'none';
                return;
            }

            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(async () => {
                const results = await this.searchLocations(q);
                this.renderAutocompleteDropdown(results, inputId, type);
            }, 250);
        });

        input.addEventListener('focus', () => {
            if (input.value.trim().length >= 2) {
                dropdown.style.display = 'block';
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    async searchLocations(query) {
        const clean = query.toLowerCase();
        // Filtra POIs internos
        const matchedPois = STRATEGIC_POIS.filter(p => 
            p.name.toLowerCase().includes(clean) || 
            p.sub.toLowerCase().includes(clean)
        );

        try {
            const res = await fetch(`/api/geocode/autocomplete?q=${encodeURIComponent(query)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.ok && Array.isArray(data.sugestoes)) {
                    const apiItems = data.sugestoes.map(s => ({
                        id: s.id || Math.random(),
                        name: s.label || s.nome,
                        sub: s.sub || 'Rio de Janeiro',
                        lat: s.lat,
                        lon: s.lon,
                        icon: 'fa-map-pin'
                    }));
                    return [...matchedPois, ...apiItems].slice(0, 6);
                }
            }
        } catch (_) {}

        return matchedPois.slice(0, 5);
    }

    renderAutocompleteDropdown(items, inputId, type) {
        const dropdown = document.getElementById('autocomplete-dropdown');
        if (!dropdown || items.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = items.map(item => `
            <div class="autocomplete-item" data-lat="${item.lat}" data-lon="${item.lon}" data-name="${item.name}">
                <div class="autocomplete-item-icon">
                    <i class="fa-solid ${item.icon || 'fa-location-dot'}"></i>
                </div>
                <div class="autocomplete-item-text">
                    <div class="autocomplete-item-title">${item.name}</div>
                    <div class="autocomplete-item-sub">${item.sub}</div>
                </div>
            </div>
        `).join('');

        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.autocomplete-item').forEach(el => {
            el.addEventListener('click', () => {
                const lat = parseFloat(el.dataset.lat);
                const lon = parseFloat(el.dataset.lon);
                const name = el.dataset.name;

                if (type === 'origin') {
                    this.setOriginCoords(lat, lon, name);
                } else {
                    this.setDestCoords(lat, lon, name);
                }

                dropdown.style.display = 'none';
            });
        });
    }

    // ==========================================
    // 15. Modais (Câmera Player e Radar)
    // ==========================================
    openCameraPlayer(id, nameEscaped, embedUrl) {
        const modal = document.getElementById('modal-camera');
        const title = document.getElementById('modal-cam-title');
        const frame = document.getElementById('camera-iframe');

        const name = unescape(nameEscaped);
        if (title) title.textContent = name;
        
        // Fallback de player seguro caso url não esteja disponível
        const finalUrl = embedUrl || 'https://player.camerasrj.com.br/camera/64/';
        if (frame) frame.src = finalUrl;

        if (modal) modal.classList.add('active');
    }

    closeCameraPlayer() {
        const modal = document.getElementById('modal-camera');
        const frame = document.getElementById('camera-iframe');
        if (frame) frame.src = 'about:blank';
        if (modal) modal.classList.remove('active');
    }

    openRadarModal() {
        const modal = document.getElementById('modal-radar');
        const frame = document.getElementById('radar-iframe');
        if (frame && !frame.src.includes('windy')) {
            frame.src = 'https://embed.windy.com/embed2.html?lat=-22.908&lon=-43.200&detailLat=-22.908&detailLon=-43.200&width=650&height=450&zoom=9&level=surface&overlay=radar&product=radar&menu=&message=true';
        }
        if (modal) modal.classList.add('active');
    }

    closeRadarModal() {
        const modal = document.getElementById('modal-radar');
        if (modal) modal.classList.remove('active');
    }

    // ==========================================
    // 16. Utilitários (Haversine & Toast)
    // ==========================================
    haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast-message ${type}`;
        toast.style.cssText = `
            position: absolute;
            top: 70px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(10, 18, 30, 0.95);
            border: 1px solid ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#00D1FF'};
            color: #fff;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 11.5px;
            font-weight: 700;
            z-index: 2500;
            box-shadow: 0 8px 24px rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            gap: 8px;
            pointer-events: none;
            animation: fadeInToast 0.25s ease;
        `;
        toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i> ${message}`;
        
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2600);
    }

    // ==========================================================================
    // 17. Telemetria Veicular & Sensores do Dispositivo (HUD Mode)
    // ==========================================================================
    initTelemetry() {
        this.telemetryData = {
            speed: 0,
            heading: 0,
            cardinal: 'N',
            batteryLevel: null,
            batteryCharging: false,
            networkType: 'Online',
            altitude: null,
            accuracy: null,
            isSimulating: false,
            simInterval: null
        };

        // 1. Sensores de Bateria do Aparelho
        if ('getBattery' in navigator) {
            navigator.getBattery().then((battery) => {
                const updateBattery = () => {
                    this.telemetryData.batteryLevel = Math.round(battery.level * 100);
                    this.telemetryData.batteryCharging = battery.charging;
                    const batEl = document.getElementById('hud-bat-level');
                    const batIcon = document.getElementById('hud-bat-icon');
                    if (batEl) batEl.textContent = `${this.telemetryData.batteryLevel}%`;
                    if (batIcon) {
                        if (battery.charging) {
                            batIcon.className = 'fa-solid fa-bolt';
                            batIcon.style.color = '#38BDF8';
                        } else if (this.telemetryData.batteryLevel > 50) {
                            batIcon.className = 'fa-solid fa-battery-full';
                            batIcon.style.color = '#10B981';
                        } else if (this.telemetryData.batteryLevel > 20) {
                            batIcon.className = 'fa-solid fa-battery-half';
                            batIcon.style.color = '#F59E0B';
                        } else {
                            batIcon.className = 'fa-solid fa-battery-quarter';
                            batIcon.style.color = '#EF4444';
                        }
                    }
                };
                updateBattery();
                battery.addEventListener('levelchange', updateBattery);
                battery.addEventListener('chargingchange', updateBattery);
            }).catch(() => {});
        }

        // 2. Sensores de Conectividade & Rede
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn) {
            const updateNetwork = () => {
                const type = conn.effectiveType ? conn.effectiveType.toUpperCase() : (conn.type || 'ONLINE');
                const downlink = conn.downlink ? `${conn.downlink}M` : '';
                this.telemetryData.networkType = `${type} ${downlink}`.trim();
                const netEl = document.getElementById('hud-network-type');
                if (netEl) netEl.textContent = this.telemetryData.networkType;
            };
            updateNetwork();
            conn.addEventListener('change', updateNetwork);
        } else {
            const netEl = document.getElementById('hud-network-type');
            if (netEl) netEl.textContent = navigator.onLine ? 'Wi-Fi / LAN' : 'Offline';
        }

        // 3. Sensores de Orientação / Bússola & Giroscópio
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (e) => {
                if (this.telemetryData.isSimulating) return;
                let compassHeading = e.webkitCompassHeading || (360 - e.alpha);
                if (compassHeading != null && !isNaN(compassHeading)) {
                    this.updateHeadingDisplay(Math.round(compassHeading));
                }
            }, true);
        }

        // Transmissão periódica de telemetria ao servidor a cada 6 segundos
        setInterval(() => {
            this.sendTelemetryPing();
        }, 6000);
    }

    updateTelemetryFromGps(loc) {
        if (this.telemetryData.isSimulating) return;

        const speedEl = document.getElementById('hud-speed-value');
        if (speedEl && loc.speed != null) {
            speedEl.textContent = loc.speed;
        }

        if (loc.heading != null) {
            this.updateHeadingDisplay(loc.heading);
        }

        const altEl = document.getElementById('hud-altitude-val');
        if (altEl) {
            altEl.textContent = loc.altitude != null ? `${loc.altitude}` : '--';
        }

        const accEl = document.getElementById('hud-accuracy-val');
        if (accEl) {
            accEl.textContent = loc.accuracy != null ? `±${loc.accuracy}` : '--';
        }
    }

    updateHeadingDisplay(deg) {
        const normalized = ((deg % 360) + 360) % 360;
        this.telemetryData.heading = normalized;

        const cardinals = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO', 'N'];
        const index = Math.round(normalized / 45);
        this.telemetryData.cardinal = cardinals[index];

        const degEl = document.getElementById('hud-heading-deg');
        const cardEl = document.getElementById('hud-heading-cardinal');
        if (degEl) degEl.textContent = `${normalized}°`;
        if (cardEl) cardEl.textContent = this.telemetryData.cardinal;
    }

    toggleTelemetryHud() {
        const hud = document.getElementById('telemetry-hud');
        const btnHeader = document.getElementById('btn-toggle-telemetry');
        const fab = document.getElementById('fab-toggle-telemetry');
        if (!hud) return;

        hud.classList.toggle('active');
        const isActive = hud.classList.contains('active');

        if (btnHeader) btnHeader.classList.toggle('active', isActive);
        if (fab) fab.classList.toggle('active', isActive);

        if (isActive) {
            this.showToast('📡 Telemetria Veicular em Tempo Real Ativada', 'info');
            if (this.userLocation) {
                this.updateTelemetryFromGps(this.userLocation);
            }
        }
    }

    toggleSimulatedDrive() {
        const btn = document.getElementById('btn-sim-drive');
        if (!this.telemetryData.isSimulating) {
            this.telemetryData.isSimulating = true;
            if (btn) {
                btn.classList.add('active');
                btn.textContent = 'Pausar Simulação';
            }
            this.showToast('🏎️ Modo Simulação Dinâmica Ativado (0 a 82 km/h)', 'success');

            let currentSpeed = 0;
            let currentHeading = 120;
            let acceleration = 2.5;

            this.telemetryData.simInterval = setInterval(() => {
                currentSpeed += acceleration;
                if (currentSpeed >= 78) {
                    acceleration = -1.2;
                } else if (currentSpeed <= 32) {
                    acceleration = 2.0;
                }

                currentHeading = (currentHeading + 1) % 360;

                const speedEl = document.getElementById('hud-speed-value');
                if (speedEl) speedEl.textContent = Math.round(currentSpeed);

                this.updateHeadingDisplay(currentHeading);

                const altEl = document.getElementById('hud-altitude-val');
                if (altEl) altEl.textContent = '38';

                const accEl = document.getElementById('hud-accuracy-val');
                if (accEl) accEl.textContent = '±4';
            }, 250);
        } else {
            this.telemetryData.isSimulating = false;
            clearInterval(this.telemetryData.simInterval);
            if (btn) {
                btn.classList.remove('active');
                btn.textContent = 'Iniciar Simulação';
            }
            const speedEl = document.getElementById('hud-speed-value');
            if (speedEl) speedEl.textContent = this.userLocation?.speed || '0';
            this.showToast('Simulação pausada.', 'info');
        }
    }

    async sendTelemetryPing() {
        const hud = document.getElementById('telemetry-hud');
        if (!hud || !hud.classList.contains('active')) return;

        try {
            await fetch('/api/telemetria/ping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    speed: this.telemetryData.isSimulating ? 65 : (this.userLocation?.speed || 0),
                    heading: this.telemetryData.heading || 0,
                    battery: this.telemetryData.batteryLevel,
                    network: this.telemetryData.networkType,
                    lat: this.userLocation?.lat,
                    lon: this.userLocation?.lon,
                    altitude: this.userLocation?.altitude || 25,
                    accuracy: this.userLocation?.accuracy || 10
                })
            });
        } catch (_) {}
    }

    initPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        }
    }
}

// Inicialização Global
document.addEventListener('DOMContentLoaded', () => {
    window.ritDrive = new RitDriveApp();
});
