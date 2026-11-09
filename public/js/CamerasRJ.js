import { trafficCameraSources, getRjAlternativeSources, getRjCamerasRjSources, getCatalogStats, normalizeEmbedUrl, detectVideoCodecCapabilities } from './traffic-camera-data.js?v=4.2.0';
import { showToast, escapeHtml } from './utils.js';

export class CamerasRJ {
    constructor() {
        this.containerId = 'tab-cameras';
        this.storageKey = 'rit_cameras_rj_quads_v3';
        this.cacheKey = 'rit_cameras_rj_data_cache';
        this.cacheTimestampKey = 'rit_cameras_rj_data_time';
        this.activeFullscreenSlot = null;
        this.codecCapabilities = detectVideoCodecCapabilities();
        this.slotTimers = {};
        this.slotRetries = {};
        this.snapshotIntervals = {};
        this.camerasData = {};
        this.isTabActive = false;

        // 4 Quadrantes Padrão iniciando em "Outras Fontes" (100% ativas e validadas),
        // preservando a configuração "CamerasRJ" pronta para alternância imediata.
        this.defaultSlots = {
            quad_1: {
                slotNum: 1,
                providerMode: 'OUTRAS_FONTES',
                bairro: 'Ilha do Governador / Galeão',
                sourceId: 'RJ_ALT_GALEAO_LIVE',
                altSourceId: 'RJ_ALT_GALEAO_LIVE',
                camerasRjBairro: 'Curicica',
                camerasRjSourceId: 'RJ_CURICICA_BANDEIRANTES',
                label: 'Aeroporto do Galeão & Linha Vermelha'
            },
            quad_2: {
                slotNum: 2,
                providerMode: 'OUTRAS_FONTES',
                bairro: 'Centro / Santos Dumont',
                sourceId: 'RJ_ALT_SDU_LIVE',
                altSourceId: 'RJ_ALT_SDU_LIVE',
                camerasRjBairro: 'Barra da Tijuca',
                camerasRjSourceId: 'RJ_CAMERASRJ_BARRA',
                label: 'Aeroporto Santos Dumont & Centro'
            },
            quad_3: {
                slotNum: 3,
                providerMode: 'OUTRAS_FONTES',
                bairro: 'Copacabana (Posto 3)',
                sourceId: 'RJ_ALT_COPA_POSTO3',
                altSourceId: 'RJ_ALT_COPA_POSTO3',
                camerasRjBairro: 'Camorim',
                camerasRjSourceId: 'CAM_1014',
                label: 'Copacabana Posto 3 / Av. Atlântica'
            },
            quad_4: {
                slotNum: 4,
                providerMode: 'OUTRAS_FONTES',
                bairro: 'Copacabana / Arpoador (Posto 6)',
                sourceId: 'RJ_ALT_COPA_POSTO6',
                altSourceId: 'RJ_ALT_COPA_POSTO6',
                camerasRjBairro: 'Barra da Tijuca',
                camerasRjSourceId: 'RJ_CAMERASRJ_COPACABANA',
                label: 'Copacabana Posto 6 / Acesso Ipanema'
            }
        };

        this.currentSlots = {};
        this.init();
    }

    async init() {
        const tabPane = document.getElementById(this.containerId);
        if (!tabPane) {
            console.warn('[CamerasRJ] Container #tab-cameras não encontrado no DOM.');
            return;
        }

        this.loadSlotSelection();
        this.renderStructure(tabPane);
        this.bindGlobalEvents();
        await this.loadCamerasData();
        this.renderAllQuadrants();
        this.setupTabObserver();

        console.info('[CamerasRJ] Painel de Monitoramento 2x2 inicializado com seletor de Fonte de Dados.');
    }

    // 1. CARREGAMENTO E CACHE DE 120 SEGUNDOS (BASE CAMERAS RJ)
    async loadCamerasData() {
        const now = Date.now();
        try {
            const cachedData = sessionStorage.getItem(this.cacheKey);
            const cachedTime = parseInt(sessionStorage.getItem(this.cacheTimestampKey) || '0', 10);

            if (cachedData && (now - cachedTime < 120000)) {
                this.camerasData = JSON.parse(cachedData);
                return;
            }

            const response = await fetch('/data/cameras.json');
            if (response.ok) {
                this.camerasData = await response.json();
                sessionStorage.setItem(this.cacheKey, JSON.stringify(this.camerasData));
                sessionStorage.setItem(this.cacheTimestampKey, String(now));
            }
        } catch (e) {
            console.warn('[CamerasRJ] Erro ao carregar /data/cameras.json, utilizando catálogo padrão:', e);
            this.camerasData = {};
        }
    }

    // 2. PERSISTÊNCIA DOS SLOTS NO LOCALSTORAGE
    loadSlotSelection() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.currentSlots = {};
                ['quad_1', 'quad_2', 'quad_3', 'quad_4'].forEach(k => {
                    this.currentSlots[k] = {
                        ...this.defaultSlots[k],
                        ...(parsed[k] || {})
                    };
                    if (!this.currentSlots[k].providerMode) {
                        this.currentSlots[k].providerMode = 'OUTRAS_FONTES';
                    }
                });
                return;
            }
        } catch (e) {
            console.error('[CamerasRJ] Erro ao carregar slots:', e);
        }
        this.currentSlots = JSON.parse(JSON.stringify(this.defaultSlots));
    }

    saveSlotSelection() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.currentSlots));
        } catch (e) {
            console.error('[CamerasRJ] Erro ao salvar slots:', e);
        }
    }

    getDominantProviderMode() {
        const modes = Object.values(this.currentSlots).map(s => s.providerMode || 'OUTRAS_FONTES');
        const allCamerasRj = modes.every(m => m === 'CAMERAS_RJ');
        return allCamerasRj ? 'CAMERAS_RJ' : 'OUTRAS_FONTES';
    }

    // 3. ESTRUTURA DO PAINEL COM CABEÇALHO COMPACTO E GRID 2X2
    renderStructure(tabPane) {
        const globalMode = this.getDominantProviderMode();
        tabPane.innerHTML = `
            <div class="cam-rj-container">
                <!-- CABEÇALHO COMPACTO (ZERO SCROLL) -->
                <header class="cam-rj-header">
                    <div class="cam-rj-header-left">
                        <span class="cim-live-pill"><i class="fa-solid fa-video"></i> 4 CÂMERAS AO VIVO</span>
                        <h2 class="cam-rj-header-title">Câmeras Rio de Janeiro (Layout 2x2)</h2>
                    </div>
                    <div class="cam-rj-header-right" style="display:flex; align-items:center; gap:8px;">
                        <div style="display:flex; align-items:center; gap:5px; background:rgba(15,23,42,0.9); border:1px solid rgba(0,209,255,0.35); border-radius:4px; padding:2px 6px;">
                            <label for="sel-cam-global-provider" style="font-size:9px; font-weight:800; color:#00d1ff; text-transform:uppercase; white-space:nowrap;">
                                <i class="fa-solid fa-database"></i> Fonte de Dados:
                            </label>
                            <select id="sel-cam-global-provider" class="cam-rj-select-compact" style="height:20px; font-size:9.5px; font-weight:700; border-color:#00d1ff; min-width:175px;" title="Alternar Fonte de Dados de todos os 4 quadrantes">
                                <option value="OUTRAS_FONTES" ${globalMode === 'OUTRAS_FONTES' ? 'selected' : ''}>🟢 Outras Fontes (Ativas / Online)</option>
                                <option value="CAMERAS_RJ" ${globalMode === 'CAMERAS_RJ' ? 'selected' : ''}>🏛️ CamerasRJ (Base Municipal)</option>
                            </select>
                        </div>
                        <button id="btn-cam-refresh-all" class="btn-cim-action btn-cim-primary" title="Recarregar todas as 4 câmeras">
                            <i class="fa-solid fa-arrows-rotate"></i> <span>RECARREGAR</span>
                        </button>
                        <button id="btn-cam-reset-default" class="btn-cim-action btn-cim-ghost" title="Restaurar padrão inicial">
                            <i class="fa-solid fa-rotate-left"></i> <span>PADRÃO</span>
                        </button>
                    </div>
                </header>

                <!-- GRID 2X2 QUE PREENCHE 100% DA TELA PRINCIPAL -->
                <main class="cam-rj-grid-2x2" id="cam-rj-grid">
                    <!-- Quadrantes inseridos dinamicamente -->
                </main>
            </div>

            <!-- MODAL DE TELA INTEIRA (EXPANSÃO SEM RECARREGAR) -->
            <div id="cam-rj-fullscreen-overlay" class="cim-fullscreen-overlay" style="display: none;">
                <div class="cim-fs-container">
                    <header class="cim-fs-header">
                        <div class="cim-fs-title-box">
                            <span class="cim-regiao-tag tag-rj" id="cam-fs-tag">RJ</span>
                            <div class="cim-fs-names">
                                <h3 id="cam-fs-title">Rio de Janeiro - Câmera Ao Vivo</h3>
                                <p id="cam-fs-subtitle">Carregando transmissão...</p>
                            </div>
                            <span class="cim-badge-online" id="cam-fs-badge"><i class="fa-solid fa-circle"></i> AO VIVO</span>
                        </div>
                        <div class="cim-fs-controls">
                            <button id="btn-cam-fs-refresh" class="btn-cim-action btn-cim-ghost" title="Atualizar sinal desta câmera">
                                <i class="fa-solid fa-arrows-rotate"></i> <span>ATUALIZAR</span>
                            </button>
                            <button id="btn-cam-fs-close" class="btn-cim-action btn-cim-primary" title="Voltar ao Painel 2x2 (1 Clique)">
                                <i class="fa-solid fa-arrow-left"></i> <span>VOLTAR AO PAINEL 2X2</span>
                            </button>
                        </div>
                    </header>
                    <div class="cim-fs-body" id="cam-fs-body">
                        <!-- Frame expandido -->
                    </div>
                </div>
            </div>
        `;
    }

    // 4. RENDERIZAÇÃO DOS 4 QUADRANTES COM ESCALONAMENTO (< 3S)
    renderAllQuadrants() {
        const grid = document.getElementById('cam-rj-grid');
        if (!grid) return;

        const globalSelect = document.getElementById('sel-cam-global-provider');
        if (globalSelect) {
            globalSelect.value = this.getDominantProviderMode();
        }

        grid.innerHTML = '';
        const slotKeys = ['quad_1', 'quad_2', 'quad_3', 'quad_4'];

        slotKeys.forEach((key, idx) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'cam-rj-card';
            cardEl.id = `cam-card-${key}`;
            cardEl.innerHTML = `
                <div class="cim-viewport-loading" style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#071018;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="color:#00d1ff; font-size:22px; margin-bottom:8px;"></i>
                    <span style="font-size:11px; color:#94a3b8;">Inicializando Quadrante ${idx + 1}...</span>
                </div>
            `;
            grid.appendChild(cardEl);

            setTimeout(() => {
                this.renderSingleQuadrant(key, cardEl);
            }, idx * 120);
        });
    }

    findCameraInfo(sourceIdOrCamId) {
        if (!sourceIdOrCamId || !this.camerasData) return null;
        const cleanId = String(sourceIdOrCamId).replace('CAM_', '').replace('SRC_', '');

        for (const bairro of Object.keys(this.camerasData)) {
            const list = this.camerasData[bairro] || [];
            const found = list.find(c => String(c.id) === cleanId);
            if (found) {
                return { ...found, bairro };
            }
        }
        return null;
    }

    resolveSourceObject(slotConfig) {
        if (!slotConfig) return null;
        const providerMode = slotConfig.providerMode || 'OUTRAS_FONTES';
        const sourceId = slotConfig.sourceId || '';
        const catalogSources = trafficCameraSources.RJ?.sources || [];
        const altSources = getRjAlternativeSources();

        // Se estiver em modo OUTRAS_FONTES, garante que resolve uma fonte ativa válida
        if (providerMode === 'OUTRAS_FONTES') {
            const cleanSrcId = sourceId.replace('SRC_', '');
            const altMatch = altSources.find(s => s.id === cleanSrcId || s.id === sourceId);
            if (altMatch) {
                return altMatch;
            }
            return altSources[0] || catalogSources[0] || null;
        }

        // Modo CAMERAS_RJ:
        // 1. Caso seja destaque estruturado do catálogo CamerasRJ
        const cleanSrcId = sourceId.replace('SRC_', '');
        const catalogMatch = catalogSources.find(s => s.id === cleanSrcId || s.id === sourceId);
        if (catalogMatch) {
            return catalogMatch;
        }

        // 2. Caso seja câmera individual do Rio (CAM_1014 ou ID numérico)
        const cleanCamId = sourceId.replace('CAM_', '');
        if (cleanCamId && (sourceId.startsWith('CAM_') || !isNaN(cleanCamId))) {
            const camInfo = this.findCameraInfo(cleanCamId);
            const caption = camInfo?.caption || `Câmera ${cleanCamId}`;
            const bairroName = slotConfig.bairro || camInfo?.bairro || 'Rio de Janeiro';
            const url = `https://www.camerasrj.com.br/camera/${encodeURIComponent(cleanCamId)}/`;
            const embedUrl = `https://player.camerasrj.com.br/camera/${encodeURIComponent(cleanCamId)}/`;

            return {
                id: `CAM_${cleanCamId}`,
                providerCategory: 'CAMERAS_RJ',
                regional: 'RJ',
                cidade: 'Rio de Janeiro',
                bairro: bairroName,
                referencia: caption,
                nome: caption,
                tipoFonte: 'stream',
                url: url,
                embedUrl: embedUrl,
                suportaIframe: true,
                sourceProvider: 'CamerasRJ',
                requiresCodec: 'H265',
                protocol: 'WebRTC/WHEP',
                fallbackSources: ["RJ_ALT_GALEAO_LIVE", "RJ_ZET_UFRJ_03"],
                healthStatus: 'online',
                lastValidation: new Date().toISOString(),
                prioridade: 1,
                observacao: `Câmera ao vivo em ${bairroName}: ${caption}`
            };
        }

        // 3. Fallback dentro de CamerasRJ
        const camRjDefaults = getRjCamerasRjSources();
        return camRjDefaults[0] || catalogSources[0] || null;
    }

    renderSingleQuadrant(slotKey, cardEl) {
        const slotConfig = this.currentSlots[slotKey] || this.defaultSlots[slotKey];
        const providerMode = slotConfig.providerMode || 'OUTRAS_FONTES';
        const currentSource = this.resolveSourceObject(slotConfig);
        const slotLabel = `Posição ${slotConfig.slotNum}`;

        cardEl.innerHTML = `
            <!-- HEADER COMPACTO DO QUADRANTE -->
            <div class="cam-rj-card-header">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="cim-regiao-tag tag-rj">RJ</span>
                    <strong style="font-size:10.5px; color:#fff; text-transform:uppercase;">${escapeHtml(currentSource?.bairro || 'Rio de Janeiro')}</strong>
                    <span class="cim-slot-tag">${slotLabel}</span>
                    <span style="font-size:8.5px; padding:1px 5px; border-radius:3px; font-weight:700; background:${providerMode === 'OUTRAS_FONTES' ? 'rgba(16,185,129,0.18)' : 'rgba(59,130,246,0.18)'}; color:${providerMode === 'OUTRAS_FONTES' ? '#10b981' : '#60a5fa'}; border:1px solid ${providerMode === 'OUTRAS_FONTES' ? 'rgba(16,185,129,0.35)' : 'rgba(59,130,246,0.35)'};">
                        ${providerMode === 'OUTRAS_FONTES' ? 'OUTRAS FONTES' : 'CAMERAS RJ'}
                    </span>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span id="badge-${slotKey}" class="cim-badge-loading">
                        <i class="fa-solid fa-spinner fa-spin"></i> CONECTANDO
                    </span>
                    ${currentSource?.url ? `
                        <a href="${currentSource.url}" target="_blank" rel="noopener noreferrer" class="btn-cim-card-fullscreen" style="padding:2px 6px; font-size:9px; text-decoration:none; color:#00d1ff; border:1px solid rgba(0,209,255,0.3);" title="Abrir portal de origem">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> <span>FONTE</span>
                        </a>
                    ` : ''}
                    <button class="btn-cim-card-fullscreen" data-slot="${slotKey}" title="Expandir para Tela Inteira" style="padding:2px 6px; font-size:9px;">
                        <i class="fa-solid fa-expand"></i> <span>TELA INTEIRA</span>
                    </button>
                </div>
            </div>

            <!-- BARRA DE SELETORES COMPACTA INLINE (1 LINHA: FONTE DE DADOS | REGIÃO/BAIRRO | CÂMERA) -->
            <div class="cam-rj-selectors-bar">
                <select class="cam-rj-select-compact select-provider" data-slot="${slotKey}" style="flex:0.85; border-color:${providerMode === 'OUTRAS_FONTES' ? '#10b981' : '#3b82f6'};" title="Selecione a Fonte de Dados (Outras Fontes Ativas ou Base CamerasRJ)">
                    <option value="OUTRAS_FONTES" ${providerMode === 'OUTRAS_FONTES' ? 'selected' : ''}>🟢 Fonte: Outras Fontes (Ativas)</option>
                    <option value="CAMERAS_RJ" ${providerMode === 'CAMERAS_RJ' ? 'selected' : ''}>🏛️ Fonte: CamerasRJ (Municipal)</option>
                </select>
                <select class="cam-rj-select-compact select-bairro" data-slot="${slotKey}" style="flex:1;" title="${providerMode === 'OUTRAS_FONTES' ? 'Selecione a Região / Corredor Viário Ativo' : 'Selecione o Bairro (CamerasRJ)'}">
                    ${this.generateBairroOptions(slotConfig, currentSource)}
                </select>
                <select class="cam-rj-select-compact select-fonte" data-slot="${slotKey}" style="flex:1.35;" title="Selecione a Câmera / Transmissão">
                    ${this.generateFonteOptions(slotConfig, currentSource)}
                </select>
            </div>

            <!-- VIEWPORT DE VÍDEO (QUADRO TOTALMENTE ABERTO E LIMPO) -->
            <div class="cam-rj-viewport" id="viewport-${slotKey}">
                ${this.renderViewportHtml(slotKey, currentSource)}
            </div>
        `;

        this.bindQuadrantEvents(slotKey, cardEl);
        this.startStreamMonitor(slotKey, currentSource);
    }

    generateBairroOptions(slotConfig, currentSource) {
        const providerMode = slotConfig.providerMode || 'OUTRAS_FONTES';

        if (providerMode === 'OUTRAS_FONTES') {
            const altSources = getRjAlternativeSources();
            let html = '<optgroup label="🟢 OUTRAS FONTES ATIVAS & VALIDADAS (RJ)">';
            altSources.forEach(src => {
                const isSel = (currentSource && currentSource.id === src.id) || slotConfig.sourceId === src.id || slotConfig.sourceId === `SRC_${src.id}`;
                html += `<option value="SRC_${src.id}" ${isSel ? 'selected' : ''}>${escapeHtml(src.bairro)} — ${escapeHtml(src.referencia)}</option>`;
            });
            html += '</optgroup>';
            return html;
        }

        // Modo CAMERAS_RJ (Base Municipal completa preservada)
        let html = '<option value="">Selecione o Bairro (CamerasRJ)...</option>';

        const camRjHighlights = getRjCamerasRjSources();
        if (camRjHighlights.length > 0) {
            html += '<optgroup label="⭐ DESTAQUES CAMERAS RJ">';
            camRjHighlights.forEach(src => {
                const isSel = slotConfig.sourceId === src.id || slotConfig.sourceId === `SRC_${src.id}`;
                html += `<option value="SRC_${src.id}" ${isSel ? 'selected' : ''}>[DESTAQUE] ${escapeHtml(src.bairro)} - ${escapeHtml(src.nome)}</option>`;
            });
            html += '</optgroup>';
        }

        const bairros = Object.keys(this.camerasData).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        if (bairros.length > 0) {
            html += '<optgroup label="🏛️ BAIRROS DO RIO DE JANEIRO (BASE CAMERAS RJ)">';
            bairros.forEach(b => {
                const isSel = (slotConfig.bairro === b) && !String(slotConfig.sourceId || '').startsWith('SRC_') && !String(slotConfig.sourceId || '').startsWith('RJ_');
                html += `<option value="${escapeHtml(b)}" ${isSel ? 'selected' : ''}>${escapeHtml(b)}</option>`;
            });
            html += '</optgroup>';
        }

        return html;
    }

    generateFonteOptions(slotConfig, currentSource) {
        const providerMode = slotConfig.providerMode || 'OUTRAS_FONTES';

        if (providerMode === 'OUTRAS_FONTES') {
            const altSources = getRjAlternativeSources();
            return altSources.map(src => {
                const isSel = (currentSource && currentSource.id === src.id) || slotConfig.sourceId === src.id || slotConfig.sourceId === `SRC_${src.id}`;
                const icon = src.tipoFonte === 'snapshot' ? '📷 Snapshot' : '🎥 Ao Vivo';
                return `<option value="${src.id}" ${isSel ? 'selected' : ''}>${icon} | ${escapeHtml(src.nome)}</option>`;
            }).join('');
        }

        // Modo CAMERAS_RJ:
        // Se for um destaque do catálogo CamerasRJ
        if (slotConfig.sourceId?.startsWith('SRC_') || slotConfig.sourceId?.startsWith('RJ_')) {
            const camRjHighlights = getRjCamerasRjSources();
            return camRjHighlights.map(src => {
                const isSel = (currentSource && currentSource.id === src.id) || slotConfig.sourceId === src.id || slotConfig.sourceId === `SRC_${src.id}`;
                return `<option value="${src.id}" ${isSel ? 'selected' : ''}>🎥 ${escapeHtml(src.nome)} (${escapeHtml(src.referencia)})</option>`;
            }).join('');
        }

        // Se for um bairro específico do CamerasRJ
        const bairro = slotConfig.bairro || 'Curicica';
        const cameras = this.camerasData[bairro] || [];

        if (cameras.length === 0) {
            return `<option value="${currentSource?.id || ''}" selected>${escapeHtml(currentSource?.nome || 'Câmera Principal')}</option>`;
        }

        let html = '';
        const sorted = [...cameras].sort((a, b) => (a.caption || '').localeCompare(b.caption || '', 'pt-BR'));
        sorted.forEach(c => {
            const isSel = String(slotConfig.sourceId) === `CAM_${c.id}` || String(slotConfig.sourceId) === String(c.id);
            html += `<option value="CAM_${c.id}" ${isSel ? 'selected' : ''}>🎥 ${escapeHtml(c.caption || `Câmera ${c.id}`)}</option>`;
        });

        return html;
    }

    renderViewportHtml(slotKey, currentSource) {
        if (!currentSource) {
            return `<div class="cim-empty-viewport">Nenhuma câmera selecionada</div>`;
        }

        console.log(`[CAMERA-LOAD] Slot: ${slotKey} | Bairro: ${currentSource.bairro} | Câmera: ${currentSource.nome} | Fonte: ${currentSource.sourceProvider || currentSource.tipoFonte}`);

        if (currentSource.tipoFonte === 'snapshot') {
            const imgUrl = currentSource.proxyUrl || currentSource.directImageUrl;
            return `
                <div style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#000;">
                    <img id="img-cam-${slotKey}" src="${imgUrl}?t=${Date.now()}" alt="${escapeHtml(currentSource.nome)}" style="width:100%; height:100%; object-fit:cover;" />
                </div>
            `;
        }

        const cleanEmbedUrl = normalizeEmbedUrl(currentSource.embedUrl);
        if (currentSource.suportaIframe && cleanEmbedUrl) {
            return `
                <iframe 
                    id="iframe-cam-${slotKey}"
                    src="${cleanEmbedUrl}" 
                    class="cam-rj-iframe"
                    allowfullscreen 
                    allow="autoplay; encrypted-media; fullscreen">
                </iframe>
            `;
        }

        return `
            <div class="cim-external-viewport">
                <div class="cim-ext-icon"><i class="fa-solid fa-satellite-dish"></i></div>
                <h4>${escapeHtml(currentSource.nome)}</h4>
                <p>${escapeHtml(currentSource.observacao || 'Transmissão pública operacional com proteção contra incorporação em frames.')}</p>
                <a href="${currentSource.url}" target="_blank" rel="noopener noreferrer" class="btn btnPrimary btnSmall">
                    ABRIR PORTAL OFICIAL ↗
                </a>
            </div>
        `;
    }

    // 5. MONITORAMENTO DE STREAM E ATUALIZAÇÃO DE SNAPSHOTS
    startStreamMonitor(slotKey, currentSource) {
        if (this.slotTimers[slotKey]) {
            clearTimeout(this.slotTimers[slotKey]);
            delete this.slotTimers[slotKey];
        }
        if (this.snapshotIntervals[slotKey]) {
            clearInterval(this.snapshotIntervals[slotKey]);
            delete this.snapshotIntervals[slotKey];
        }

        const badgeEl = document.getElementById(`badge-${slotKey}`);
        const iframe = document.getElementById(`iframe-cam-${slotKey}`);
        const snapImg = document.getElementById(`img-cam-${slotKey}`);

        if (!currentSource) return;

        // Caso seja câmera de Snapshot (ex: Clima ao Vivo Recreio)
        if (currentSource.tipoFonte === 'snapshot' && snapImg) {
            snapImg.onload = () => {
                if (badgeEl) {
                    badgeEl.className = 'cim-badge-online';
                    badgeEl.innerHTML = '<i class="fa-solid fa-circle"></i> AO VIVO';
                }
            };
            const imgUrl = currentSource.proxyUrl || currentSource.directImageUrl;
            const intervalMs = currentSource.refreshInterval || 30000;
            this.snapshotIntervals[slotKey] = setInterval(() => {
                const el = document.getElementById(`img-cam-${slotKey}`);
                if (el) {
                    el.src = `${imgUrl}?t=${Date.now()}`;
                }
            }, intervalMs);
            return;
        }

        if (!iframe) {
            if (badgeEl) {
                badgeEl.className = 'cim-badge-online';
                badgeEl.innerHTML = '<i class="fa-solid fa-circle"></i> SINAL ATIVO';
            }
            return;
        }

        iframe.onload = () => {
            if (this.slotTimers[slotKey]) {
                clearTimeout(this.slotTimers[slotKey]);
                delete this.slotTimers[slotKey];
            }
            this.slotRetries[slotKey] = 0;
            if (badgeEl) {
                badgeEl.className = 'cim-badge-online';
                badgeEl.innerHTML = '<i class="fa-solid fa-circle"></i> AO VIVO';
            }
        };

        this.slotTimers[slotKey] = setTimeout(() => {
            console.warn(`[CAMERA-TIMEOUT] Slot: ${slotKey} | Timeout de conexão (>8s) para: ${currentSource.nome}`);
            if (badgeEl) {
                badgeEl.className = 'cim-badge-error';
                badgeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> TIMEOUT';
            }
            this.handleStreamFailure(slotKey, currentSource);
        }, 8000);
    }

    handleStreamFailure(slotKey, currentSource) {
        this.slotRetries[slotKey] = (this.slotRetries[slotKey] || 0) + 1;
        const retries = this.slotRetries[slotKey];
        const badgeEl = document.getElementById(`badge-${slotKey}`);
        const delays = [5000, 15000, 30000];
        const delay = delays[retries - 1] || 30000;

        if (retries <= 3) {
            if (badgeEl) {
                badgeEl.className = 'cim-badge-loading';
                badgeEl.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> RETRY ${retries}/3 (${delay/1000}s)`;
            }
            setTimeout(() => {
                const iframe = document.getElementById(`iframe-cam-${slotKey}`);
                if (iframe && currentSource.embedUrl) {
                    const sep = currentSource.embedUrl.includes('?') ? '&' : '?';
                    iframe.src = `${normalizeEmbedUrl(currentSource.embedUrl)}${sep}retry=${Date.now()}`;
                    this.startStreamMonitor(slotKey, currentSource);
                }
            }, delay);
        } else {
            if (badgeEl) {
                badgeEl.className = 'cim-badge-error';
                badgeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> INDISPONÍVEL';
            }
        }
    }

    // 6. EVENTOS POR QUADRANTE
    bindQuadrantEvents(slotKey, cardEl) {
        const selProvider = cardEl.querySelector('.select-provider');
        const selBairro = cardEl.querySelector('.select-bairro');
        const selFonte = cardEl.querySelector('.select-fonte');
        const btnFullscreen = cardEl.querySelector('button.btn-cim-card-fullscreen');

        // Troca de Fonte de Dados (Outras Fontes vs CamerasRJ)
        selProvider?.addEventListener('change', (e) => {
            const newMode = e.target.value;
            const slot = this.currentSlots[slotKey];
            slot.providerMode = newMode;

            if (newMode === 'OUTRAS_FONTES') {
                const altSources = getRjAlternativeSources();
                const targetAltId = slot.altSourceId || this.defaultSlots[slotKey]?.altSourceId || altSources[0]?.id;
                const foundAlt = altSources.find(s => s.id === targetAltId) || altSources[0];
                if (foundAlt) {
                    slot.sourceId = foundAlt.id;
                    slot.bairro = foundAlt.bairro;
                }
            } else {
                // Alterna para a base CamerasRJ preservada
                const savedBairro = slot.camerasRjBairro || this.defaultSlots[slotKey]?.camerasRjBairro || 'Curicica';
                const savedCamId = slot.camerasRjSourceId || this.defaultSlots[slotKey]?.camerasRjSourceId || 'RJ_CURICICA_BANDEIRANTES';
                slot.bairro = savedBairro;
                slot.sourceId = savedCamId;
            }

            this.saveSlotSelection();
            const globalSelect = document.getElementById('sel-cam-global-provider');
            if (globalSelect) {
                globalSelect.value = this.getDominantProviderMode();
            }
            this.renderSingleQuadrant(slotKey, cardEl);
        });

        // Troca de Região/Via (Outras Fontes) ou Bairro (CamerasRJ)
        selBairro?.addEventListener('change', (e) => {
            const val = e.target.value;
            const slot = this.currentSlots[slotKey];
            const providerMode = slot.providerMode || 'OUTRAS_FONTES';

            if (providerMode === 'OUTRAS_FONTES') {
                const cleanId = val.replace('SRC_', '');
                slot.sourceId = cleanId;
                slot.altSourceId = cleanId;
                const found = getRjAlternativeSources().find(s => s.id === cleanId);
                if (found) slot.bairro = found.bairro;
            } else {
                if (val.startsWith('SRC_')) {
                    const cleanId = val.replace('SRC_', '');
                    slot.sourceId = cleanId;
                    slot.camerasRjSourceId = cleanId;
                    slot.bairro = '';
                } else {
                    slot.bairro = val;
                    slot.camerasRjBairro = val;
                    const cams = this.camerasData[val] || [];
                    if (cams.length > 0) {
                        slot.sourceId = `CAM_${cams[0].id}`;
                        slot.camerasRjSourceId = `CAM_${cams[0].id}`;
                    }
                }
            }

            this.saveSlotSelection();
            this.renderSingleQuadrant(slotKey, cardEl);
        });

        // Troca direta da Câmera / Transmissão
        selFonte?.addEventListener('change', (e) => {
            const val = e.target.value;
            const slot = this.currentSlots[slotKey];
            const providerMode = slot.providerMode || 'OUTRAS_FONTES';

            slot.sourceId = val;
            if (providerMode === 'OUTRAS_FONTES') {
                slot.altSourceId = val;
                const found = getRjAlternativeSources().find(s => s.id === val);
                if (found) slot.bairro = found.bairro;
            } else {
                slot.camerasRjSourceId = val;
            }

            this.saveSlotSelection();
            this.renderSingleQuadrant(slotKey, cardEl);
        });

        btnFullscreen?.addEventListener('click', () => {
            this.openFullscreen(slotKey);
        });
    }

    // 7. TELA INTEIRA E RETORNO EM 1 CLIQUE
    openFullscreen(slotKey) {
        this.activeFullscreenSlot = slotKey;
        const slotConfig = this.currentSlots[slotKey] || this.defaultSlots[slotKey];
        const currentSource = this.resolveSourceObject(slotConfig);

        const overlay = document.getElementById('cam-rj-fullscreen-overlay');
        const titleEl = document.getElementById('cam-fs-title');
        const subtitleEl = document.getElementById('cam-fs-subtitle');
        const bodyEl = document.getElementById('cam-fs-body');

        if (overlay && bodyEl) {
            titleEl.textContent = `Rio de Janeiro - ${currentSource?.bairro || 'Ao Vivo'}`;
            subtitleEl.textContent = currentSource?.referencia || currentSource?.nome || '';
            bodyEl.innerHTML = this.renderViewportHtml(slotKey, currentSource);
            overlay.style.display = 'flex';
        }
    }

    closeFullscreen() {
        this.activeFullscreenSlot = null;
        const overlay = document.getElementById('cam-rj-fullscreen-overlay');
        const bodyEl = document.getElementById('cam-fs-body');
        if (overlay) overlay.style.display = 'none';
        if (bodyEl) bodyEl.innerHTML = '';
    }

    // 8. EVENTOS GLOBAIS
    bindGlobalEvents() {
        document.getElementById('sel-cam-global-provider')?.addEventListener('change', (e) => {
            const newMode = e.target.value;
            const altSources = getRjAlternativeSources();
            ['quad_1', 'quad_2', 'quad_3', 'quad_4'].forEach((slotKey, idx) => {
                const slot = this.currentSlots[slotKey];
                slot.providerMode = newMode;
                if (newMode === 'OUTRAS_FONTES') {
                    const targetAltId = slot.altSourceId || this.defaultSlots[slotKey]?.altSourceId || altSources[idx % altSources.length]?.id;
                    const foundAlt = altSources.find(s => s.id === targetAltId) || altSources[idx % altSources.length];
                    if (foundAlt) {
                        slot.sourceId = foundAlt.id;
                        slot.bairro = foundAlt.bairro;
                    }
                } else {
                    slot.bairro = slot.camerasRjBairro || this.defaultSlots[slotKey]?.camerasRjBairro || 'Curicica';
                    slot.sourceId = slot.camerasRjSourceId || this.defaultSlots[slotKey]?.camerasRjSourceId || 'RJ_CURICICA_BANDEIRANTES';
                }
            });
            this.saveSlotSelection();
            this.renderAllQuadrants();
            showToast(
                newMode === 'OUTRAS_FONTES'
                    ? "Fonte de Dados alterada para Outras Fontes (Câmeras Ativas e Validadas)."
                    : "Fonte de Dados alterada para CamerasRJ (Base Municipal COR-Rio).",
                "info"
            );
        });

        document.getElementById('btn-cam-refresh-all')?.addEventListener('click', () => {
            this.renderAllQuadrants();
            showToast("Todas as 4 câmeras foram recarregadas.", "info");
        });

        document.getElementById('btn-cam-reset-default')?.addEventListener('click', () => {
            this.currentSlots = JSON.parse(JSON.stringify(this.defaultSlots));
            this.saveSlotSelection();
            this.renderAllQuadrants();
            showToast("Layout padrão restaurado com Outras Fontes Ativas.", "info");
        });

        document.getElementById('btn-cam-fs-close')?.addEventListener('click', () => {
            this.closeFullscreen();
        });

        document.getElementById('btn-cam-fs-refresh')?.addEventListener('click', () => {
            if (this.activeFullscreenSlot) {
                this.openFullscreen(this.activeFullscreenSlot);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeFullscreenSlot) {
                this.closeFullscreen();
            }
        });
    }

    // 9. LAZY LOADING VIA TAB OBSERVER
    setupTabObserver() {
        const tabEl = document.getElementById(this.containerId);
        if (!tabEl) return;

        const observer = new MutationObserver(() => {
            const isActive = tabEl.classList.contains('active') || tabEl.style.display === 'flex' || tabEl.style.display === 'block';
            if (isActive && !this.isTabActive) {
                this.isTabActive = true;
                this.renderAllQuadrants();
            } else if (!isActive && this.isTabActive) {
                this.isTabActive = false;
            }
        });

        observer.observe(tabEl, { attributes: true, attributeFilter: ['class', 'style'] });
    }
}
