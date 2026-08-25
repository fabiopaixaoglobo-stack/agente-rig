import { trafficCameraSources, getCatalogStats, normalizeEmbedUrl, detectVideoCodecCapabilities } from './traffic-camera-data.js?v=4.0.0';
import { showToast, escapeHtml } from './utils.js';

export class CamerasRJ {
    constructor() {
        this.containerId = 'tab-cameras';
        this.storageKey = 'rit_cameras_rj_quads_v2';
        this.cacheKey = 'rit_cameras_rj_data_cache';
        this.cacheTimestampKey = 'rit_cameras_rj_data_time';
        this.activeFullscreenSlot = null;
        this.codecCapabilities = detectVideoCodecCapabilities();
        this.slotTimers = {};
        this.slotRetries = {};
        this.snapshotIntervals = {};
        this.camerasData = {};
        this.isTabActive = false;

        // 4 Quadrantes Padrão (Preset Tático CIM / Operacional)
        this.defaultSlots = {
            quad_1: { slotNum: 1, bairro: 'Curicica', sourceId: 'RJ_CURICICA_BANDEIRANTES', label: 'Curicica / Estúdios Globo' },
            quad_2: { slotNum: 2, bairro: 'Barra da Tijuca', sourceId: 'RJ_CAMERASRJ_BARRA', label: 'Barra da Tijuca / Alvorada' },
            quad_3: { slotNum: 3, bairro: 'Centro', sourceId: 'RJ_CAMERASRJ_CENTRO', label: 'Centro / Presidente Vargas' },
            quad_4: { slotNum: 4, bairro: 'Copacabana', sourceId: 'RJ_CAMERASRJ_COPACABANA', label: 'Copacabana / Orla' }
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

        console.info('[CamerasRJ] Painel de Monitoramento 2x2 inicializado com sucesso.');
    }

    // 1. CARREGAMENTO E CACHE DE 120 SEGUNDOS
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
                this.currentSlots = { ...this.defaultSlots, ...JSON.parse(saved) };
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

    // 3. ESTRUTURA DO PAINEL COM CABEÇALHO COMPACTO E GRID 2X2
    renderStructure(tabPane) {
        tabPane.innerHTML = `
            <div class="cam-rj-container">
                <!-- CABEÇALHO COMPACTO (ZERO SCROLL) -->
                <header class="cam-rj-header">
                    <div class="cam-rj-header-left">
                        <span class="cim-live-pill"><i class="fa-solid fa-video"></i> 4 CÂMERAS AO VIVO</span>
                        <h2 class="cam-rj-header-title">Câmeras Rio de Janeiro (Layout 2x2)</h2>
                    </div>
                    <div class="cam-rj-header-right">
                        <button id="btn-cam-preset-tatico" class="btn-cim-action btn-cim-accent" title="Ativar Preset Tático CIM (Curicica, Barra, Centro, Copacabana)">
                            <i class="fa-solid fa-crosshairs"></i> <span>PRESET TÁTICO</span>
                        </button>
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

    // 4. RENDERIZAÇÃO DOS 4 QUADRANTES
    renderAllQuadrants() {
        const grid = document.getElementById('cam-rj-grid');
        if (!grid) return;

        grid.innerHTML = '';
        const slotKeys = ['quad_1', 'quad_2', 'quad_3', 'quad_4'];

        slotKeys.forEach(key => {
            const cardEl = document.createElement('div');
            cardEl.className = 'cam-rj-card';
            cardEl.id = `cam-card-${key}`;
            grid.appendChild(cardEl);
            this.renderSingleQuadrant(key, cardEl);
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
        const sourceId = slotConfig.sourceId || '';
        const catalogSources = trafficCameraSources.RJ?.sources || [];

        // 1. Caso seja fonte estruturada do catálogo
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

            return {
                id: `CAM_${cleanCamId}`,
                regional: 'RJ',
                cidade: 'Rio de Janeiro',
                bairro: bairroName,
                referencia: caption,
                nome: caption,
                tipoFonte: 'stream',
                url: url,
                embedUrl: url,
                suportaIframe: true,
                sourceProvider: 'CamerasRJ',
                requiresCodec: 'H265',
                protocol: 'WebRTC/WHEP',
                fallbackSources: ["RJ_MAPA_RIO_01", "RJ_ZET_UFRJ_01"],
                healthStatus: 'online',
                lastValidation: new Date().toISOString(),
                prioridade: 1,
                observacao: `Câmera ao vivo em ${bairroName}: ${caption}`
            };
        }

        // 3. Fallback: primeira fonte do catálogo
        return catalogSources[0] || null;
    }

    renderSingleQuadrant(slotKey, cardEl) {
        const slotConfig = this.currentSlots[slotKey] || this.defaultSlots[slotKey];
        const currentSource = this.resolveSourceObject(slotConfig);
        const slotLabel = `Posição ${slotConfig.slotNum}`;

        cardEl.innerHTML = `
            <!-- HEADER COMPACTO DO QUADRANTE -->
            <div class="cam-rj-card-header">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="cim-regiao-tag tag-rj">RJ</span>
                    <strong style="font-size:10.5px; color:#fff; text-transform:uppercase;">${escapeHtml(currentSource?.bairro || 'Rio de Janeiro')}</strong>
                    <span class="cim-slot-tag">${slotLabel}</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span id="badge-${slotKey}" class="cim-badge-loading">
                        <i class="fa-solid fa-spinner fa-spin"></i> CONECTANDO
                    </span>
                    <button class="btn-cim-card-fullscreen" data-slot="${slotKey}" title="Expandir para Tela Inteira" style="padding:2px 6px; font-size:9px;">
                        <i class="fa-solid fa-expand"></i> <span>TELA INTEIRA</span>
                    </button>
                </div>
            </div>

            <!-- BARRA DE SELETORES COMPACTA INLINE (1 LINHA) -->
            <div class="cam-rj-selectors-bar">
                <select class="cam-rj-select-compact select-bairro" data-slot="${slotKey}" style="flex:1;" title="Selecione o Bairro">
                    ${this.generateBairroOptions(slotConfig, currentSource)}
                </select>
                <select class="cam-rj-select-compact select-fonte" data-slot="${slotKey}" style="flex:1.4;" title="Selecione o Ponto de Câmera">
                    ${this.generateFonteOptions(slotConfig, currentSource)}
                </select>
            </div>

            <!-- VIEWPORT DE VÍDEO (100% PREENCHIDO) -->
            <div class="cam-rj-viewport" id="viewport-${slotKey}">
                ${this.renderViewportHtml(slotKey, currentSource)}
                
                <!-- OVERLAY TRANSLÚCIDO NO RODAPÉ -->
                <div class="cam-rj-overlay-bar">
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;">
                        📍 ${escapeHtml(currentSource?.referencia || currentSource?.nome || '')}
                    </span>
                    ${currentSource?.url ? `
                        <a href="${currentSource.url}" target="_blank" rel="noopener noreferrer" style="color:#00d1ff; text-decoration:none; font-weight:700;">
                            FONTE ↗
                        </a>
                    ` : ''}
                </div>
            </div>
        `;

        this.bindQuadrantEvents(slotKey, cardEl);
        this.startStreamMonitor(slotKey, currentSource);
    }

    generateBairroOptions(slotConfig, currentSource) {
        let html = '<option value="">Bairro...</option>';

        // 1. Destaques e Portais
        html += '<optgroup label="⭐ DESTAQUES & PORTAIS OFICIAIS">';
        const rjSources = trafficCameraSources.RJ?.sources || [];
        rjSources.forEach(src => {
            const isSel = slotConfig.sourceId === src.id || slotConfig.sourceId === `SRC_${src.id}`;
            html += `<option value="SRC_${src.id}" ${isSel ? 'selected' : ''}>[PORTAL] ${escapeHtml(src.bairro)} - ${escapeHtml(src.nome)}</option>`;
        });
        html += '</optgroup>';

        // 2. Todos os Bairros do Rio
        const bairros = Object.keys(this.camerasData).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        if (bairros.length > 0) {
            html += '<optgroup label="BAIRROS DO RIO DE JANEIRO">';
            bairros.forEach(b => {
                const isSel = (slotConfig.bairro === b) && !slotConfig.sourceId?.startsWith('SRC_');
                html += `<option value="${escapeHtml(b)}" ${isSel ? 'selected' : ''}>${escapeHtml(b)}</option>`;
            });
            html += '</optgroup>';
        }

        return html;
    }

    generateFonteOptions(slotConfig, currentSource) {
        // Se for um portal do catálogo
        if (slotConfig.sourceId?.startsWith('SRC_') || (currentSource && !currentSource.id?.startsWith('CAM_'))) {
            return `<option value="${currentSource.id}" selected>${escapeHtml(currentSource.nome)} (${escapeHtml(currentSource.referencia)})</option>`;
        }

        // Se for um bairro específico
        const bairro = slotConfig.bairro || 'Curicica';
        const cameras = this.camerasData[bairro] || [];

        if (cameras.length === 0) {
            return `<option value="${currentSource?.id || ''}" selected>${escapeHtml(currentSource?.nome || 'Câmera Principal')}</option>`;
        }

        let html = '';
        const sorted = [...cameras].sort((a, b) => (a.caption || '').localeCompare(b.caption || '', 'pt-BR'));
        sorted.forEach(c => {
            const isSel = String(slotConfig.sourceId) === `CAM_${c.id}` || String(slotConfig.sourceId) === String(c.id);
            html += `<option value="CAM_${c.id}" ${isSel ? 'selected' : ''}>${escapeHtml(c.caption || `Câmera ${c.id}`)}</option>`;
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
                    allow="autoplay; encrypted-media">
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

    // 5. DETECÇÃO DE TIMEOUT (8S), RETRY INTELIGENTE (5S) E FALLBACK AUTOMÁTICO
    startStreamMonitor(slotKey, currentSource) {
        // Limpar timers existentes do slot
        if (this.slotTimers[slotKey]) {
            clearTimeout(this.slotTimers[slotKey]);
            delete this.slotTimers[slotKey];
        }

        const badgeEl = document.getElementById(`badge-${slotKey}`);
        const iframe = document.getElementById(`iframe-cam-${slotKey}`);

        if (!currentSource || !iframe) {
            if (badgeEl) {
                badgeEl.className = 'cim-badge-online';
                badgeEl.innerHTML = '<i class="fa-solid fa-circle"></i> SINAL ATIVO';
            }
            return;
        }

        // Configura onload no iframe
        iframe.onload = () => {
            if (this.slotTimers[slotKey]) {
                clearTimeout(this.slotTimers[slotKey]);
                delete this.slotTimers[slotKey];
            }
            this.slotRetries[slotKey] = 0; // reset retry counter
            if (badgeEl) {
                badgeEl.className = 'cim-badge-online';
                badgeEl.innerHTML = '<i class="fa-solid fa-circle"></i> AO VIVO';
            }
        };

        // Timeout de conexão de 8 segundos
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

        if (retries <= 2) {
            console.info(`[CAMERA-RETRY] Slot: ${slotKey} | Tentativa ${retries}/2 de reconexão em 5 segundos...`);
            if (badgeEl) {
                badgeEl.className = 'cim-badge-loading';
                badgeEl.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> RETRY (${retries}/2)`;
            }

            setTimeout(() => {
                const iframe = document.getElementById(`iframe-cam-${slotKey}`);
                if (iframe && currentSource.embedUrl) {
                    iframe.src = `${normalizeEmbedUrl(currentSource.embedUrl)}?retry=${Date.now()}`;
                    this.startStreamMonitor(slotKey, currentSource);
                }
            }, 5000);
        } else {
            // Aciona Fallback Automático
            console.warn(`[CAMERA-FALLBACK] Slot: ${slotKey} | Esgotadas tentativas para ${currentSource.nome}. Alternando para contingência...`);
            if (badgeEl) {
                badgeEl.className = 'cim-badge-error';
                badgeEl.innerHTML = '<i class="fa-solid fa-shield"></i> CONTINGÊNCIA';
            }

            // Alterna para o Mapa Interativo de Câmeras do Rio ou UFRJ ZET
            const fallbackId = (currentSource.fallbackSources && currentSource.fallbackSources[0]) || 'RJ_MAPA_RIO_01';
            this.currentSlots[slotKey] = {
                ...this.currentSlots[slotKey],
                sourceId: fallbackId
            };
            this.saveSlotSelection();
            
            const cardEl = document.getElementById(`cam-card-${slotKey}`);
            if (cardEl) {
                this.renderSingleQuadrant(slotKey, cardEl);
            }
            showToast(`Câmera da Posição ${this.currentSlots[slotKey].slotNum} alternada para fonte de contingência.`, "info");
        }
    }

    // 6. EVENTOS POR QUADRANTE
    bindQuadrantEvents(slotKey, cardEl) {
        const selBairro = cardEl.querySelector('.select-bairro');
        const selFonte = cardEl.querySelector('.select-fonte');
        const btnFullscreen = cardEl.querySelector('.btn-cim-card-fullscreen');
        const btnRefresh = cardEl.querySelector('.btn-cim-refresh-slot');

        selBairro?.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val.startsWith('SRC_')) {
                this.currentSlots[slotKey].sourceId = val;
                this.currentSlots[slotKey].bairro = '';
            } else {
                this.currentSlots[slotKey].bairro = val;
                const cams = this.camerasData[val] || [];
                if (cams.length > 0) {
                    this.currentSlots[slotKey].sourceId = `CAM_${cams[0].id}`;
                }
            }
            this.saveSlotSelection();
            this.renderSingleQuadrant(slotKey, cardEl);
        });

        selFonte?.addEventListener('change', (e) => {
            const val = e.target.value;
            this.currentSlots[slotKey].sourceId = val;
            this.saveSlotSelection();
            this.renderSingleQuadrant(slotKey, cardEl);
        });

        btnFullscreen?.addEventListener('click', () => {
            this.openFullscreen(slotKey);
        });

        btnRefresh?.addEventListener('click', () => {
            this.renderSingleQuadrant(slotKey, cardEl);
        });
    }

    // 7. TELA INTEIRA E RETORNO EM 1 CLIQUE
    openFullscreen(slotKey) {
        this.activeFullscreenSlot = slotKey;
        const slotConfig = this.currentSlots[slotKey] || this.defaultSlots[slotKey];
        const currentSource = this.resolveSourceObject(slotConfig);

        console.log(`[CAMERA-FULLSCREEN] Slot: ${slotKey} | Tela inteira aberta para ${currentSource?.nome || slotKey}`);

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
        console.log(`[CAMERA-FULLSCREEN] Tela inteira fechada, retornando ao layout 2x2.`);
        this.activeFullscreenSlot = null;
        const overlay = document.getElementById('cam-rj-fullscreen-overlay');
        const bodyEl = document.getElementById('cam-fs-body');
        if (overlay) overlay.style.display = 'none';
        if (bodyEl) bodyEl.innerHTML = '';
    }

    // 8. EVENTOS GLOBAIS E PRESETS
    bindGlobalEvents() {
        document.getElementById('btn-cam-preset-tatico')?.addEventListener('click', () => {
            this.currentSlots = JSON.parse(JSON.stringify(this.defaultSlots));
            this.saveSlotSelection();
            this.renderAllQuadrants();
            showToast("Preset Tático CIM ativado: Curicica, Barra, Centro e Copacabana!", "success");
        });

        document.getElementById('btn-cam-refresh-all')?.addEventListener('click', () => {
            this.renderAllQuadrants();
            showToast("Todas as 4 câmeras foram recarregadas.", "info");
        });

        document.getElementById('btn-cam-reset-default')?.addEventListener('click', () => {
            this.currentSlots = JSON.parse(JSON.stringify(this.defaultSlots));
            this.saveSlotSelection();
            this.renderAllQuadrants();
            showToast("Layout padrão restaurado.", "info");
        });

        document.getElementById('btn-cam-fs-close')?.addEventListener('click', () => {
            this.closeFullscreen();
        });

        document.getElementById('btn-cam-fs-refresh')?.addEventListener('click', () => {
            if (this.activeFullscreenSlot) {
                this.openFullscreen(this.activeFullscreenSlot);
            }
        });

        // Fechar fullscreen no ESC
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
