/**
 * Módulo de Inteligência Geoespacial, Indexação Espacial (KD-Tree / Spatial Grid)
 * e Correlação de Câmeras com Ocorrências - Agente RIT / CCO
 */

export class SpatialGridIndex {
    constructor(cellSizeKm = 2.0) {
        this.cellSizeKm = cellSizeKm;
        // ~1 grau de latitude = 111 km
        this.cellLatDeg = cellSizeKm / 111.0;
        this.grid = new Map();
        this.items = [];
    }

    _getKey(lat, lon) {
        // ~1 grau de longitude no RJ (lat ~ -22.9) = 111 * cos(-22.9) = 102.2 km
        const cellLonDeg = this.cellSizeKm / (111.0 * Math.cos(lat * (Math.PI / 180)));
        const gridX = Math.floor(lat / this.cellLatDeg);
        const gridY = Math.floor(lon / cellLonDeg);
        return `${gridX}:${gridY}`;
    }

    buildIndex(items) {
        this.items = items || [];
        this.grid.clear();

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const lat = parseFloat(item.latitude || item.lat);
            const lon = parseFloat(item.longitude || item.lon);
            if (isNaN(lat) || isNaN(lon)) continue;

            const key = this._getKey(lat, lon);
            if (!this.grid.has(key)) {
                this.grid.set(key, []);
            }
            this.grid.get(key).push(item);
        }
        console.info(`[SpatialGridIndex] Indexadas ${this.items.length} câmeras em ${this.grid.size} células espaciais.`);
    }

    // Busca rápida de candidatos dentro de uma bounding box / anel de células
    getCandidatesWithinRadius(targetLat, targetLon, radiusMeters) {
        const radiusKm = radiusMeters / 1000.0;
        const cellLatRadius = Math.ceil(radiusKm / this.cellSizeKm) + 1;
        const cellLonDeg = this.cellSizeKm / (111.0 * Math.cos(targetLat * (Math.PI / 180)));
        const cellLonRadius = Math.ceil(radiusKm / this.cellSizeKm) + 1;

        const targetGridX = Math.floor(targetLat / this.cellLatDeg);
        const targetGridY = Math.floor(targetLon / cellLonDeg);

        const candidates = [];
        for (let dx = -cellLatRadius; dx <= cellLatRadius; dx++) {
            for (let dy = -cellLonRadius; dy <= cellLonRadius; dy++) {
                const key = `${targetGridX + dx}:${targetGridY + dy}`;
                const cellItems = this.grid.get(key);
                if (cellItems) {
                    for (let j = 0; j < cellItems.length; j++) {
                        candidates.push(cellItems[j]);
                    }
                }
            }
        }
        return candidates;
    }

    // Busca Top K vizinhos mais próximos com distância exata Haversine
    findNearest(targetLat, targetLon, maxRadiusMeters = 3000, topK = 5) {
        const t0 = performance.now();
        const candidates = this.getCandidatesWithinRadius(targetLat, targetLon, maxRadiusMeters);

        const scored = [];
        for (let i = 0; i < candidates.length; i++) {
            const cam = candidates[i];
            const lat = parseFloat(cam.latitude || cam.lat);
            const lon = parseFloat(cam.longitude || cam.lon);
            const distMeters = CamerasGeoService.haversineDistanceMeters(targetLat, targetLon, lat, lon);

            if (distMeters <= maxRadiusMeters) {
                // Checa alinhamento direcional com a visada da câmera
                const isDirectionalAligned = CamerasGeoService.isPointInCameraFov(
                    lat, lon, cam.orientacao, cam.angulo, targetLat, targetLon
                );

                scored.push({
                    camera: cam,
                    distanciaMetros: Math.round(distMeters),
                    alinhamentoDirecional: isDirectionalAligned
                });
            }
        }

        // Ordena pela menor distância
        scored.sort((a, b) => a.distanciaMetros - b.distanciaMetros);
        const topResults = scored.slice(0, topK);
        const elapsed = (performance.now() - t0).toFixed(2);

        return {
            results: topResults,
            totalCandidatosAvaliados: candidates.length,
            tempoExecucaoMs: parseFloat(elapsed)
        };
    }
}

export class CamerasGeoService {
    constructor() {
        this.cameras = [];
        this.spatialIndex = new SpatialGridIndex(1.5);
        this.bairrosClusters = [];
        this.regionalClusters = [];
        this.isLoaded = false;
        this.isClustersLoaded = false;
        this.totalCamerasCount = 4297;
        this.lastLoadedTimestamp = 0;
        this.cacheTTL = 300000; // 5 minutos

        // Single-flight promise memoization para evitar chamadas duplicadas simultâneas
        this._loadPromise = null;
        this._clustersPromise = null;
    }

    // 1. Carregamento Ultrarrápido de Clusters (< 15 KB)
    async loadClusters() {
        if (this.isClustersLoaded && this.bairrosClusters.length > 0) {
            return {
                bairroClusters: this.bairrosClusters,
                regionalClusters: this.regionalClusters,
                totalCameras: this.totalCamerasCount
            };
        }

        if (this._clustersPromise) return this._clustersPromise;

        this._clustersPromise = (async () => {
            try {
                const resp = await fetch('/api/cameras/clusters');
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.ok) {
                        this.bairrosClusters = data.bairroClusters || [];
                        this.regionalClusters = data.regionalClusters || [];
                        this.totalCamerasCount = data.totalCameras || 4297;
                        this.isClustersLoaded = true;
                        console.info(`[CamerasGeoService] ${this.bairrosClusters.length} clusters de bairro carregados (< 15KB).`);
                        return {
                            bairroClusters: this.bairrosClusters,
                            regionalClusters: this.regionalClusters,
                            totalCameras: this.totalCamerasCount
                        };
                    }
                }
            } catch (err) {
                console.warn('[CamerasGeoService] Falha ao carregar clusters leves, usando fallback:', err);
            }
            return {
                bairroClusters: this.bairrosClusters,
                regionalClusters: this.regionalClusters,
                totalCameras: this.totalCamerasCount
            };
        })();

        try {
            const res = await this._clustersPromise;
            return res;
        } finally {
            this._clustersPromise = null;
        }
    }

    // 2. Carregamento da Base de Câmeras com Single-Flight Memoization
    async loadCameras() {
        const now = Date.now();
        if (this.isLoaded && this.cameras.length > 0 && (now - this.lastLoadedTimestamp < this.cacheTTL)) {
            return this.cameras;
        }

        if (this._loadPromise) return this._loadPromise;

        this._loadPromise = (async () => {
            const t0 = performance.now();
            try {
                // Tenta carregar catálogo otimizado do backend
                const resp = await fetch('/api/cameras/georreferenciadas?limit=5000&format=compact');
                if (resp.ok) {
                    const json = await resp.json();
                    if (json.ok && Array.isArray(json.cameras)) {
                        this.cameras = json.cameras.map(c => ({
                            id: c.id,
                            nome: c.nome,
                            bairro: c.bairro,
                            latitude: c.lat || c.latitude,
                            longitude: c.lon || c.longitude,
                            status: c.status,
                            orientacao: c.orientacao || 0,
                            angulo: c.angulo || 180,
                            embedUrl: c.embedUrl || null
                        }));
                        this.spatialIndex.buildIndex(this.cameras);
                        this.totalCamerasCount = json.total || this.cameras.length;
                        this.isLoaded = true;
                        this.lastLoadedTimestamp = Date.now();
                        const elapsed = (performance.now() - t0).toFixed(1);
                        console.info(`[CamerasGeoService] ${this.cameras.length} câmeras carregadas e indexadas em ${elapsed}ms.`);
                        return this.cameras;
                    }
                }
            } catch (e) {
                console.warn('[CamerasGeoService] Falha no endpoint compacto, tentando arquivo estático:', e);
            }

            try {
                const resp = await fetch('/data/cameras_georreferenciadas.json');
                if (resp.ok) {
                    this.cameras = await resp.json();
                    this.spatialIndex.buildIndex(this.cameras);
                    this.buildBairroClusters();
                    this.isLoaded = true;
                    this.lastLoadedTimestamp = Date.now();
                    const elapsed = (performance.now() - t0).toFixed(1);
                    console.info(`[CamerasGeoService] ${this.cameras.length} câmeras carregadas do fallback estático em ${elapsed}ms.`);
                    return this.cameras;
                }
            } catch (err) {
                console.error('[CamerasGeoService] Erro fatal ao carregar catálogo de câmeras:', err);
            }
            return [];
        })();

        try {
            const res = await this._loadPromise;
            return res;
        } finally {
            this._loadPromise = null;
        }
    }

    // 3. Busca por Bounding Box (Lazy Loading por Viewport)
    async fetchCamerasInBBox(bounds, limit = 150) {
        if (!bounds) return [];

        const s = typeof bounds.getSouth === 'function' ? bounds.getSouth() : bounds.south;
        const n = typeof bounds.getNorth === 'function' ? bounds.getNorth() : bounds.north;
        const w = typeof bounds.getWest === 'function' ? bounds.getWest() : bounds.west;
        const e = typeof bounds.getEast === 'function' ? bounds.getEast() : bounds.east;

        // Se a base já estiver em memória, filtra instantaneamente sem request de rede
        if (this.isLoaded && this.cameras.length > 0) {
            const filtered = [];
            for (let i = 0; i < this.cameras.length; i++) {
                const cam = this.cameras[i];
                if (cam.latitude >= s && cam.latitude <= n && cam.longitude >= w && cam.longitude <= e) {
                    filtered.push(cam);
                    if (filtered.length >= limit) break;
                }
            }
            return filtered;
        }

        // Senão busca sob demanda do backend (< 10 KB)
        try {
            const boundsParam = `${n},${s},${e},${w}`;
            const resp = await fetch(`/api/cameras/bbox?bounds=${encodeURIComponent(boundsParam)}&limit=${limit}&format=compact`);
            if (resp.ok) {
                const json = await resp.json();
                if (json.ok && Array.isArray(json.cameras)) {
                    return json.cameras.map(c => ({
                        id: c.id,
                        nome: c.nome,
                        bairro: c.bairro,
                        latitude: c.lat || c.latitude,
                        longitude: c.lon || c.longitude,
                        status: c.status,
                        orientacao: c.orientacao || 0,
                        embedUrl: c.embedUrl || null
                    }));
                }
            }
        } catch (err) {
            console.warn('[CamerasGeoService] Erro na consulta de BBox:', err);
        }
        return [];
    }

    // 4. Stream Health Check / Probe Rápido
    async probeCameraHealth(cameraId) {
        try {
            const resp = await fetch(`/api/cameras/health/${encodeURIComponent(cameraId)}`);
            if (resp.ok) {
                return await resp.json();
            }
        } catch (e) {
            console.warn(`[CamerasGeoService] Erro no health check da câmera #${cameraId}:`, e);
        }
        return { ok: false, online: false, latencyMs: 0 };
    }

    buildBairroClusters() {
        const bairroMap = new Map();
        this.cameras.forEach(cam => {
            const b = cam.bairro || 'Rio de Janeiro';
            if (!bairroMap.has(b)) {
                bairroMap.set(b, {
                    bairro: b,
                    camerasCount: 0,
                    onlineCount: 0,
                    latSum: 0,
                    lonSum: 0,
                    cameras: []
                });
            }
            const cluster = bairroMap.get(b);
            cluster.camerasCount++;
            if (cam.status === 'online') cluster.onlineCount++;
            cluster.latSum += cam.latitude;
            cluster.lonSum += cam.longitude;
            cluster.cameras.push(cam);
        });

        // Calcula centróides
        this.bairrosClusters = Array.from(bairroMap.values()).map(cluster => ({
            ...cluster,
            latitude: cluster.latSum / cluster.camerasCount,
            longitude: cluster.lonSum / cluster.camerasCount
        }));
    }

    getBairroClusters() {
        return this.bairrosClusters || [];
    }

    getRegionalClusters() {
        return this.regionalClusters || [];
    }
    }

    correlateOccurrence(targetLat, targetLon, radiusMeters = 1000, topK = 5) {
        if (!targetLat || !targetLon || isNaN(parseFloat(targetLat)) || isNaN(parseFloat(targetLon))) {
            return {
                cameras: [],
                cobertura: {
                    nivel: 'BAIXA',
                    cor: '#ef4444',
                    icone: '🔴',
                    descricao: 'Coordenadas inválidas para correlação.',
                    totalNoRaio: 0,
                    onlineNoRaio: 0
                },
                diagnosticoIA: null
            };
        }

        const parsedLat = parseFloat(targetLat);
        const parsedLon = parseFloat(targetLon);
        const search = this.spatialIndex.findNearest(parsedLat, parsedLon, radiusMeters, topK);
        const results = search.results;

        // Análise de Cobertura Visual
        const totalNoRaio = results.length;
        const onlineNoRaio = results.filter(r => r.camera.status === 'online').length;
        const menorDistancia = results.length > 0 ? results[0].distanciaMetros : Infinity;

        let nivelCobertura = 'BAIXA';
        let corCobertura = '#ef4444';
        let iconeCobertura = '🔴';
        let descricaoCobertura = 'Sem visibilidade direta por câmeras. Exige envio ou checagem por equipe de campo.';

        if (onlineNoRaio >= 3 || (onlineNoRaio >= 1 && menorDistancia < 350)) {
            nivelCobertura = 'ALTA';
            corCobertura = '#10b981';
            iconeCobertura = '🟢';
            descricaoCobertura = 'Monitoramento 100% por vídeo disponível. Múltiplos ângulos online no local.';
        } else if (onlineNoRaio >= 1) {
            nivelCobertura = 'MÉDIA';
            corCobertura = '#f59e0b';
            iconeCobertura = '🟡';
            descricaoCobertura = 'Visibilidade parcial. Pelo menos 1 câmera cobrindo o corredor próximo.';
        }

        const cobertura = {
            nivel: nivelCobertura,
            cor: corCobertura,
            icone: iconeCobertura,
            descricao: descricaoCobertura,
            totalNoRaio,
            onlineNoRaio,
            menorDistancia: isFinite(menorDistancia) ? menorDistancia : null,
            tempoBuscaMs: search.tempoExecucaoMs
        };

        // Geração de Análise de IA Operacional
        const diagnosticoIA = this.generateAIOperationalAnalysis(parsedLat, parsedLon, results, cobertura);

        return {
            cameras: results,
            cobertura,
            diagnosticoIA
        };
    }

    generateAIOperationalAnalysis(lat, lon, camerasResults, cobertura) {
        // Mapeamento de Corredores e Polos Estratégicos Globo
        const STRATEGIC_HUBS = [
            { nome: 'Estúdios Globo (Curicica)', lat: -22.9567, lon: -43.3989, vias: ['Estrada dos Bandeirantes', 'Estrada de Curicica', 'TransOlímpica'] },
            { nome: 'Sede Jardim Botânico (Jornalismo/Produção)', lat: -22.9667, lon: -43.2264, vias: ['Rua Jardim Botânico', 'Túnel Rebouças', 'Autoestrada Lagoa-Barra'] },
            { nome: 'Corredor Linha Amarela (Pedágio/Acessos)', lat: -22.9320, lon: -43.3280, vias: ['Linha Amarela (Av. Carlos Lacerda)'] },
            { nome: 'Corredor Linha Vermelha / Caju', lat: -22.8833, lon: -43.2167, vias: ['Linha Vermelha', 'Av. Brasil', 'Ponte Rio-Niterói'] },
            { nome: 'Corredor TransOlímpica (Ligação Barra-Deodoro)', lat: -22.9150, lon: -43.4020, vias: ['Via TransOlímpica', 'Av. Salvador Allende'] },
            { nome: 'Corredor Av. das Américas / Ayrton Senna (Barra)', lat: -22.9995, lon: -43.3644, vias: ['Av. das Américas', 'Av. Ayrton Senna', 'Av. Abelardo Bueno'] },
            { nome: 'Corredor Av. Brasil (Zona Norte / Oeste)', lat: -22.8480, lon: -43.2800, vias: ['Avenida Brasil', 'Rodovia Washington Luís'] }
        ];

        let hubImpactado = null;
        let menorDistHub = Infinity;

        STRATEGIC_HUBS.forEach(hub => {
            const dist = CamerasGeoService.haversineDistanceMeters(lat, lon, hub.lat, hub.lon);
            if (dist < menorDistHub) {
                menorDistHub = dist;
                hubImpactado = { ...hub, distanciaMetros: Math.round(dist) };
            }
        });

        const impactoProximo = menorDistHub < 4500;
        const nivelRisco = menorDistHub < 1500 ? 'CRÍTICO' : (menorDistHub < 3000 ? 'ELEVADO' : 'MODERADO');

        const viasAfetadas = hubImpactado?.vias || ['Vias secundárias da região'];
        const camPrincipal = camerasResults.length > 0 ? camerasResults[0].camera : null;

        let recomendacaoTatica = '';
        if (impactoProximo) {
            recomendacaoTatica = `⚠️ Atenção Operacional: Evento a ${Math.round(menorDistHub)}m do polo ${hubImpactado.nome}. Recomenda-se alertar motoristas em trânsito e desviar das vias: ${viasAfetadas.join(', ')}.`;
        } else {
            recomendacaoTatica = `Operação sob controle visual na região. Monitorar evolução pelas câmeras ${camPrincipal ? camPrincipal.nome : 'próximas'}.`;
        }

        return {
            poloEstrategico: hubImpactado ? hubImpactado.nome : 'Região Geral RJ',
            distanciaPoloMetros: Math.round(menorDistHub),
            viasImpactadas: viasAfetadas,
            nivelRisco,
            recomendacaoTatica,
            acaoSugerida: cobertura.nivel === 'ALTA' ? 'Monitorar em Tempo Real (Grid 2x2)' : (cobertura.nivel === 'MÉDIA' ? 'Checagem com motoristas + Monitoramento' : 'Acionamento de apoio operacional')
        };
    }

    // Cálculo Geodésico Haversine (Precisão em metros)
    static haversineDistanceMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Raio da Terra em metros
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Verifica se o ponto alvo está dentro do cone de visão da câmera
    static isPointInCameraFov(camLat, camLon, orientacaoDeg, fovDeg, targetLat, targetLon) {
        if (!orientacaoDeg || fovDeg >= 360) return true; // PTZ / 360 cobre tudo

        // Calcula o azimute do ponto em relação à câmera
        const dLon = (targetLon - camLon) * (Math.PI / 180);
        const y = Math.sin(dLon) * Math.cos(targetLat * (Math.PI / 180));
        const x = Math.cos(camLat * (Math.PI / 180)) * Math.sin(targetLat * (Math.PI / 180)) -
                  Math.sin(camLat * (Math.PI / 180)) * Math.cos(targetLat * (Math.PI / 180)) * Math.cos(dLon);
        let bearingDeg = Math.atan2(y, x) * (180 / Math.PI);
        bearingDeg = (bearingDeg + 360) % 360;

        let diff = Math.abs(bearingDeg - orientacaoDeg);
        if (diff > 180) diff = 360 - diff;

        return diff <= (fovDeg / 2);
    }
}
