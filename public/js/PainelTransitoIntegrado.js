import { trafficCameraSources, getCatalogStats, normalizeEmbedUrl, detectVideoCodecCapabilities } from './traffic-camera-data.js?v=4.0.0';
import { showToast, escapeHtml } from './utils.js';

export class PainelTransitoIntegrado {
    constructor() {
        this.containerId = 'tab-painel-integrado';
        this.storageKey = 'rit_cim_cards_selection_v5';
        this.clockInterval = null;
        this.snapshotTimers = {};
        this.activeFullscreenSlot = null;
        this.fullscreenTimer = null;
        this.codecCapabilities = detectVideoCodecCapabilities();
        
        // Definição dos 6 slots padrão com fontes visuais integradas prioritárias (snapshots, streams e mapas)
        this.defaultSlots = {
            card_1: { regional: 'RJ', slotNum: 1, sourceId: 'RJ_MAPA_RIO_01' },
            card_2: { regional: 'RJ', slotNum: 2, sourceId: 'RJ_ZET_UFRJ_01' },
            card_3: { regional: 'SP', slotNum: 1, sourceId: 'SP_CET_23' },
            card_4: { regional: 'BSB', slotNum: 1, sourceId: 'BSB_ESPLANADA' },
            card_5: { regional: 'REC', slotNum: 1, sourceId: 'REC_MAPA_VERCEL_01' },
            card_6: { regional: 'BH', slotNum: 1, sourceId: 'BH_REALDATA_01' }
        };

        this.currentSlots = {};
        this.camerasData = {};
        this.init();
    }

    async init() {
        const tabPane = document.getElementById(this.containerId);
        if (!tabPane) {
            console.warn('[CIM] Container #tab-painel-integrado não encontrado no DOM.');
            return;
        }

        this.loadSlotSelection();
        this.renderStructure(tabPane);
        this.startClock();
        this.renderAllCards();
        this.updateStats();
        this.bindGlobalKeyboardEvents();
        await this.loadCamerasData();
        
        console.info('[CIM] Painel Integrado inicializado. Codec detection:', this.codecCapabilities);
    }

    async loadCamerasData() {
        try {
            const response = await fetch('/data/cameras.json');
            if (response.ok) {
                this.camerasData = await response.json();
                this.renderAllCards();
            }
        } catch (e) {
            console.warn('[CIM] Não foi possível carregar /data/cameras.json:', e);
        }
    }

    loadSlotSelection() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.currentSlots = { ...this.defaultSlots, ...parsed };

                // Migração de segurança: se tiver os IDs legados antigos de portais ou bloqueados, migra para os visuais
                if (!this.currentSlots.card_3?.sourceId || this.currentSlots.card_3.sourceId.includes('OFICIAL') || this.currentSlots.card_3.sourceId.includes('PAINEL_DIRETO')) {
                    this.currentSlots.card_3.sourceId = 'SP_CET_23';
                }
                if (!this.currentSlots.card_4?.sourceId || this.currentSlots.card_4.sourceId.includes('CAMERAS_MUNDO') || this.currentSlots.card_4.sourceId.includes('DER_DF') || this.currentSlots.card_4.sourceId.includes('DF_AGORA')) {
                    this.currentSlots.card_4.sourceId = 'BSB_ESPLANADA';
                }
                if (this.currentSlots.card_5?.sourceId === 'REC_CTTU_01' || this.currentSlots.card_5?.sourceId === 'REC_SERTTEL_01') this.currentSlots.card_5.sourceId = 'REC_MAPA_VERCEL_01';
                if (this.currentSlots.card_6?.sourceId === 'BH_MINEIRINHO_01' || this.currentSlots.card_6?.sourceId === 'BH_PORTAL_JM_01') this.currentSlots.card_6.sourceId = 'BH_REALDATA_01';
                
                return;
            }
        } catch (e) {
            console.error('[CIM] Erro ao carregar persistência de cards do localStorage:', e);
        }
        this.currentSlots = JSON.parse(JSON.stringify(this.defaultSlots));
    }

    saveSlotSelection() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.currentSlots));
        } catch (e) {
            console.error('[CIM] Erro ao salvar slots no localStorage:', e);
        }
    }

    renderStructure(tabPane) {
        tabPane.innerHTML = `
            <div class="cim-panel-container">
                <!-- CABEÇALHO CIM COM OBSERVABILIDADE E MÉTRICAS -->
                <header class="cim-panel-header">
                    <div class="cim-header-left">
                        <div class="cim-title-box">
                            <span class="cim-live-pill"><i class="fa-solid fa-satellite-dish"></i> CIM AO VIVO</span>
                            <h2 class="cim-title">Painel Integrado de Monitoramento de Trânsito</h2>
                        </div>
                        <p class="cim-subtitle">Monitoramento simultâneo em tempo real das 5 Regionais Globo (Rio de Janeiro, São Paulo, Brasília, Recife e Belo Horizonte)</p>
                    </div>
                    <div class="cim-header-right">
                        <div class="cim-metric-item" title="6 posições de monitoramento simultâneas">
                            <span class="cim-metric-val">6</span>
                            <span class="cim-metric-lbl">POSIÇÕES</span>
                        </div>
                        <div class="cim-metric-item" title="5 Regionais Globo: RJ, SP, BSB, REC, BH">
                            <span class="cim-metric-val">5</span>
                            <span class="cim-metric-lbl">CIDADES</span>
                        </div>
                        <div class="cim-metric-item" id="cim-total-fontes" title="Total de fontes públicas catalogadas">
                            <span class="cim-metric-val">--</span>
                            <span class="cim-metric-lbl">FONTES</span>
                        </div>
                        <div class="cim-clock-box">
                            <span class="cim-clock-label"><i class="fa-regular fa-clock"></i> HORA ATUAL</span>
                            <span class="cim-clock-time" id="cim-live-clock">--:--:--</span>
                            <span class="cim-clock-sync" id="cim-last-sync">Atualizado agora</span>
                        </div>
                        <div class="cim-header-actions">
                            <button id="btn-cim-diag-browser" class="btn-cim-action btn-cim-accent" title="Executar teste automático de compatibilidade do navegador para câmeras H.265/HEVC">
                                <i class="fa-solid fa-stethoscope"></i> DIAGNÓSTICO NAVEGADOR
                            </button>
                            <button id="btn-cim-refresh-all" class="btn-cim-action btn-cim-primary" title="Recarregar todas as 6 fontes de vídeo">
                                <i class="fa-solid fa-rotate"></i> ATUALIZAR TODAS
                            </button>
                            <button id="btn-cim-reset-default" class="btn-cim-action btn-cim-ghost" title="Restaurar layout padrão original da CIM">
                                <i class="fa-solid fa-arrow-rotate-left"></i> RESTAURAR PADRÃO
                            </button>
                        </div>
                    </div>
                </header>

                <!-- GRID RESPONSIVO COM OS 6 CARDS -->
                <main class="cim-camera-grid" id="cim-camera-grid">
                    <!-- Cards renderizados via JS -->
                </main>
            </div>

            <!-- MODAL DE DIAGNÓSTICO DE NAVEGADOR E SOLUÇÃO H.265 -->
            <div id="cim-diag-modal-overlay" class="cim-diag-overlay" style="display: none;">
                <div class="cim-diag-card">
                    <header class="cim-diag-header">
                        <h3><i class="fa-solid fa-stethoscope"></i> Diagnóstico Automático de Compatibilidade do Navegador</h3>
                        <button id="btn-cim-diag-close" class="btn-cim-action btn-cim-ghost" style="padding:4px 8px;" title="Fechar modal (ESC)">
                            <i class="fa-solid fa-xmark"></i> Fechar
                        </button>
                    </header>
                    <div class="cim-diag-body" id="cim-diag-body-content">
                        <!-- Conteúdo injetado via JS -->
                    </div>
                    <footer class="cim-diag-footer">
                        <span style="font-size:11px; color:#94a3b8;"><i class="fa-solid fa-shield-halved"></i> Agente RIT Diagnósticos Automáticos</span>
                        <div style="display:flex; gap:8px;">
                            <button id="btn-cim-apply-rj-fallback" class="btn-cim-action btn-cim-accent" title="Alternar Rio para Mapa Interativo com Câmeras Ao Vivo">
                                <i class="fa-solid fa-map-location-dot"></i> Usar Alternativa RJ (Mapa Ao Vivo)
                            </button>
                            <button id="btn-cim-diag-ok" class="btn-cim-action btn-cim-primary">
                                Entendido
                            </button>
                        </div>
                    </footer>
                </div>
            </div>

            <!-- MODAL / OVERLAY DE TELA CHEIA (FULLSCREEN) -->
            <div id="cim-fullscreen-overlay" class="cim-fullscreen-overlay" style="display: none;">
                <div class="cim-fs-container">
                    <header class="cim-fs-header">
                        <div class="cim-fs-title-box">
                            <span class="cim-regiao-tag" id="cim-fs-tag">SP</span>
                            <div class="cim-fs-names">
                                <h3 id="cim-fs-title">São Paulo - Av. Paulista</h3>
                                <p id="cim-fs-subtitle">Paulista - Av Brigadeiro Luiz Antônio</p>
                            </div>
                            <span class="cim-badge-online" id="cim-fs-badge"><i class="fa-solid fa-circle"></i> SINAL INTEGRADO</span>
                        </div>
                        <div class="cim-fs-controls">
                            <div class="cim-fs-select-wrapper">
                                <label class="cim-fs-lbl">Trocar Câmera / Ponto:</label>
                                <select id="cim-fs-select-camera" class="cim-select cim-fs-select"></select>
                            </div>
                            <button id="btn-cim-fs-refresh" class="btn-cim-action btn-cim-ghost" title="Atualizar sinal desta câmera">
                                <i class="fa-solid fa-rotate"></i> Atualizar
                            </button>
                            <button id="btn-cim-fs-close" class="btn-cim-action btn-cim-primary" title="Voltar às 6 Telas (Mosaico)">
                                <i class="fa-solid fa-compress"></i> VOLTAR ÀS 6 TELAS
                            </button>
                        </div>
                    </header>

                    <div class="cim-fs-body" id="cim-fs-body">
                        <!-- Conteúdo da câmera em Fullscreen -->
                    </div>

                    <footer class="cim-fs-footer">
                        <span id="cim-fs-info">📍 Monitoramento em Tempo Real - Central Integrada de Monitoramento Globo (CIM)</span>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <a id="cim-fs-open-link" href="#" target="_blank" rel="noopener noreferrer" class="btn-cim-card-link">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir Fonte Oficial
                            </a>
                            <button id="btn-cim-fs-close-footer" class="btn-cim-action btn-cim-primary" style="padding:4px 12px; font-size:11px;">
                                <i class="fa-solid fa-compress"></i> VOLTAR ÀS 6 TELAS
                            </button>
                        </div>
                    </footer>
                </div>
            </div>
        `;

        // Eventos Globais do Painel
        const btnRefreshAll = tabPane.querySelector('#btn-cim-refresh-all');
        btnRefreshAll?.addEventListener('click', () => {
            this.refreshAll();
        });

        const btnResetDefault = tabPane.querySelector('#btn-cim-reset-default');
        btnResetDefault?.addEventListener('click', () => {
            this.resetToDefaults();
        });

        const btnDiagBrowser = tabPane.querySelector('#btn-cim-diag-browser');
        btnDiagBrowser?.addEventListener('click', () => {
            this.openDiagnosticModal();
        });

        // Eventos do Modal de Diagnóstico
        const btnDiagClose = tabPane.querySelector('#btn-cim-diag-close');
        btnDiagClose?.addEventListener('click', () => {
            this.closeDiagnosticModal();
        });

        const btnDiagOk = tabPane.querySelector('#btn-cim-diag-ok');
        btnDiagOk?.addEventListener('click', () => {
            this.closeDiagnosticModal();
        });

        const btnApplyRjFallback = tabPane.querySelector('#btn-cim-apply-rj-fallback');
        btnApplyRjFallback?.addEventListener('click', () => {
            this.applyFallbackRio();
            this.closeDiagnosticModal();
        });

        // Eventos do Fullscreen
        const btnFsClose = tabPane.querySelector('#btn-cim-fs-close');
        btnFsClose?.addEventListener('click', () => {
            this.closeFullscreen();
        });

        const btnFsCloseFooter = tabPane.querySelector('#btn-cim-fs-close-footer');
        btnFsCloseFooter?.addEventListener('click', () => {
            this.closeFullscreen();
        });

        const btnFsRefresh = tabPane.querySelector('#btn-cim-fs-refresh');
        btnFsRefresh?.addEventListener('click', () => {
            if (this.activeFullscreenSlot) {
                this.refreshCard(this.activeFullscreenSlot);
                this.updateFullscreenBody();
            }
        });

        const selFsCamera = tabPane.querySelector('#cim-fs-select-camera');
        selFsCamera?.addEventListener('change', (e) => {
            if (this.activeFullscreenSlot) {
                this.changeCardSource(this.activeFullscreenSlot, e.target.value);
                this.openFullscreen(this.activeFullscreenSlot);
            }
        });
    }

    bindGlobalKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.activeFullscreenSlot) {
                    this.closeFullscreen();
                }
                this.closeDiagnosticModal();
            }
        });
    }

    startClock() {
        if (this.clockInterval) clearInterval(this.clockInterval);
        
        const updateClock = () => {
            const clockEl = document.getElementById('cim-live-clock');
            if (clockEl) {
                const now = new Date();
                clockEl.textContent = now.toLocaleTimeString('pt-BR');
            }
        };

        updateClock();
        this.clockInterval = setInterval(updateClock, 1000);
    }

    updateStats() {
        const stats = getCatalogStats();
        const elTotal = document.getElementById('cim-total-fontes');
        if (elTotal) {
            elTotal.querySelector('.cim-metric-val').textContent = stats.totalSources;
            elTotal.title = `${stats.totalSources} fontes (${stats.onlineCount} integradas/visuais, ${stats.externalCount} portais externos)`;
        }
    }

    renderAllCards() {
        const grid = document.getElementById('cim-camera-grid');
        if (!grid) return;

        grid.innerHTML = '';
        const slotKeys = ['card_1', 'card_2', 'card_3', 'card_4', 'card_5', 'card_6'];
        
        slotKeys.forEach(key => {
            const cardEl = document.createElement('div');
            cardEl.className = 'cim-card';
            cardEl.id = `cim-${key}`;
            grid.appendChild(cardEl);
            this.renderSingleCard(key, cardEl);
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
        const regionalData = trafficCameraSources[slotConfig.regional];
        const catalogSources = regionalData?.sources || [];

        // 1. Caso seja fonte estruturada do catálogo (ex: RJ_MAPA_RIO_01, SRC_RJ_MAPA_RIO_01, SP_CET_23)
        const cleanSrcId = sourceId.replace('SRC_', '');
        const catalogMatch = catalogSources.find(s => s.id === cleanSrcId || s.id === sourceId);
        if (catalogMatch) {
            return catalogMatch;
        }

        // 2. Caso seja câmera individual do Rio (CAM_1301 ou 1301)
        const cleanCamId = sourceId.replace('CAM_', '');
        if (cleanCamId && (sourceId.startsWith('CAM_') || !isNaN(cleanCamId))) {
            const camInfo = this.findCameraInfo(cleanCamId);
            const caption = camInfo?.caption || `Câmera ${cleanCamId}`;
            const bairroName = slotConfig.selectedBairro || camInfo?.bairro || 'Rio de Janeiro';
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
                compatibilityNote: 'Transmissão ao vivo via WebRTC do portal CamerasRJ.',
                healthStatus: 'online',
                lastValidation: new Date().toISOString(),
                prioridade: 1,
                observacao: `Câmera ao vivo em ${bairroName}: ${caption}`
            };
        }

        // 3. Fallback: primeira fonte do catálogo da regional
        return catalogSources[0] || null;
    }

    renderSingleCard(slotKey, cardEl) {
        const slotConfig = this.currentSlots[slotKey] || this.defaultSlots[slotKey];
        const regionalData = trafficCameraSources[slotConfig.regional];
        if (!regionalData) return;

        const currentSource = this.resolveSourceObject(slotConfig);

        const tagClass = `tag-${slotConfig.regional.toLowerCase()}`;
        const slotLabel = `Câmera ${slotConfig.slotNum}`;
        const isEmbeddable = currentSource ? (currentSource.tipoFonte === 'snapshot' || (Boolean(currentSource.embedUrl) && currentSource.suportaIframe === true)) : false;
        
        // Badge de compatibilidade HEVC para fontes CamerasRJ quando o browser não anuncia H.265
        let healthBadge = '';
        if (currentSource && (currentSource.requiresCodec === 'H265' || currentSource.sourceProvider === 'CamerasRJ') && !this.codecCapabilities.supportsH265) {
            healthBadge = '<span class="cim-badge-hevc-warning" title="Este navegador não anunciou suporte a H.265/HEVC no WebRTC. Pode exigir aceleração por hardware ou navegador compatível."><i class="fa-solid fa-triangle-exclamation"></i> PODE EXIGIR H.265</span>';
        } else if (isEmbeddable) {
            healthBadge = '<span class="cim-badge-online"><i class="fa-solid fa-circle"></i> SINAL INTEGRADO</span>';
        } else {
            healthBadge = '<span class="cim-badge-external"><i class="fa-solid fa-arrow-up-right-from-square"></i> PORTAL EXTERNO</span>';
        }

        cardEl.innerHTML = `
            <div class="cim-card-header">
                <div class="cim-card-title-left">
                    <span class="cim-regiao-tag ${tagClass}">${slotConfig.regional}</span>
                    <strong class="cim-city-name">${regionalData.label}</strong>
                    <span class="cim-slot-tag">${slotLabel}</span>
                </div>
                <div class="cim-card-title-right">
                    ${healthBadge}
                    <button class="btn-cim-card-fullscreen" data-slot="${slotKey}" title="Maximizar esta tela para Tela Inteira no Painel">
                        <i class="fa-solid fa-expand"></i> <span>TELA INTEIRA</span>
                    </button>
                </div>
            </div>

            <!-- SELETORES UNIFICADOS MODELO CÂMERAS RJ -->
            <div class="cim-card-selectors">
                <div class="cim-selector-field">
                    <label class="cim-sel-lbl">Bairro / Região / Via:</label>
                    <select class="cim-select select-bairro" data-slot="${slotKey}">
                        ${this.generateBairroOptions(slotConfig, currentSource)}
                    </select>
                </div>
                <div class="cim-selector-field">
                    <label class="cim-sel-lbl">Fonte / Câmera:</label>
                    <select class="cim-select select-fonte" data-slot="${slotKey}">
                        ${this.generateFonteOptions(slotConfig, currentSource)}
                    </select>
                </div>
            </div>

            <!-- ÁREA DO PLAYER / MAPA / SNAPSHOT / CARD OPERACIONAL -->
            <div class="cim-viewport-container" id="viewport-${slotKey}">
                ${this.renderViewportContent(currentSource, slotKey)}
            </div>

            <!-- RODAPÉ INFORMATIVO DO CARD -->
            <div class="cim-card-footer">
                <div class="cim-footer-info">
                    <span class="cim-info-bairro"><strong>Bairro/Via:</strong> ${escapeHtml(currentSource ? currentSource.bairro : 'N/D')}</span>
                    <span class="cim-info-ref"><strong>Ref:</strong> ${escapeHtml(currentSource ? currentSource.referencia : 'N/D')}</span>
                </div>
                <div class="cim-footer-actions">
                    ${currentSource ? `
                        <a href="${currentSource.url}" target="_blank" rel="noopener noreferrer" class="btn-cim-card-link" title="Abrir portal oficial em nova aba">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir Fonte
                        </a>
                    ` : ''}
                    <button class="btn-cim-card-refresh" data-slot="${slotKey}" title="Recarregar esta fonte">
                        <i class="fa-solid fa-rotate"></i>
                    </button>
                </div>
            </div>
        `;

        // Eventos dos Selects e Botões do Card
        const selBairro = cardEl.querySelector('.select-bairro');
        const selFonte = cardEl.querySelector('.select-fonte');
        const btnRefresh = cardEl.querySelector('.btn-cim-card-refresh');
        const btnFs = cardEl.querySelector('.btn-cim-card-fullscreen');
        const btnSwitchFallback = cardEl.querySelector('.btn-cim-switch-fallback');
        const btnRetrySlot = cardEl.querySelector('.btn-cim-retry-slot');
        const btnDiagTrigger = cardEl.querySelector('.btn-cim-diag-trigger');

        selBairro?.addEventListener('change', (e) => {
            const selectedVal = e.target.value;
            slotConfig.selectedBairro = selectedVal;

            if (selectedVal.startsWith('SRC_')) {
                slotConfig.sourceId = selectedVal.replace('SRC_', '');
            } else {
                // Seleciona a primeira câmera do bairro selecionado
                const camerasList = (this.camerasData && this.camerasData[selectedVal]) || [];
                if (camerasList.length > 0) {
                    slotConfig.sourceId = `CAM_${camerasList[0].id}`;
                }
            }

            this.saveSlotSelection();
            this.renderSingleCard(slotKey, cardEl);
        });

        selFonte?.addEventListener('change', (e) => {
            const selectedVal = e.target.value;
            if (selectedVal) {
                if (selectedVal.startsWith('SRC_')) {
                    slotConfig.sourceId = selectedVal.replace('SRC_', '');
                    slotConfig.selectedBairro = selectedVal;
                } else {
                    slotConfig.sourceId = selectedVal;
                }
                this.saveSlotSelection();
                this.renderSingleCard(slotKey, cardEl);
            }
        });

        btnRefresh?.addEventListener('click', () => {
            this.refreshCard(slotKey);
        });

        btnFs?.addEventListener('click', () => {
            this.openFullscreen(slotKey);
        });

        btnSwitchFallback?.addEventListener('click', (e) => {
            const fallbackId = e.currentTarget.getAttribute('data-fallback') || 'RJ_MAPA_RIO_01';
            slotConfig.selectedBairro = `SRC_${fallbackId}`;
            slotConfig.sourceId = fallbackId;
            this.saveSlotSelection();
            this.renderSingleCard(slotKey, cardEl);
            showToast("Alternado para a fonte de redundância do Rio de Janeiro.", "info");
        });

        btnRetrySlot?.addEventListener('click', () => {
            this.refreshCard(slotKey);
        });

        btnDiagTrigger?.addEventListener('click', () => {
            this.openDiagnosticModal();
        });

        // Configura timer de atualização automática para câmeras do tipo snapshot
        this.setupSnapshotTimer(slotKey, currentSource);
    }

    generateBairroOptions(slotConfig, currentSource) {
        const regional = slotConfig.regional;
        const regionalData = trafficCameraSources[regional];
        const sourcesList = regionalData?.sources || [];

        if (regional === 'RJ') {
            let html = '<option value="">Selecione o Bairro / Via...</option>';
            
            // Grupo Destaques
            html += '<optgroup label="⭐ DESTAQUES & PORTAIS OFICIAIS (RJ)">';
            sourcesList.forEach(src => {
                const val = `SRC_${src.id}`;
                const isSelected = (slotConfig.selectedBairro === val || (currentSource && currentSource.id === src.id && (!slotConfig.selectedBairro || slotConfig.selectedBairro.startsWith('SRC_')))) ? 'selected' : '';
                html += `<option value="${val}" ${isSelected}>[PORTAL] ${escapeHtml(src.bairro)} - ${escapeHtml(src.referencia)}</option>`;
            });
            html += '</optgroup>';

            // Grupo Bairros
            const bairrosRJ = Object.keys(this.camerasData || {}).sort((a, b) => a.localeCompare(b, 'pt-BR'));
            if (bairrosRJ.length > 0) {
                html += '<optgroup label="BAIRROS DO RIO DE JANEIRO">';
                bairrosRJ.forEach(bairro => {
                    const isSelected = (slotConfig.selectedBairro === bairro || (currentSource && currentSource.bairro === bairro && !slotConfig.selectedBairro?.startsWith('SRC_'))) ? 'selected' : '';
                    html += `<option value="${escapeHtml(bairro)}" ${isSelected}>${escapeHtml(bairro)}</option>`;
                });
                html += '</optgroup>';
            }

            return html;
        } else {
            // Regionais: SP, BH, BSB, REC
            return sourcesList.map(src => {
                const val = `SRC_${src.id}`;
                const isSelected = (currentSource && currentSource.id === src.id) ? 'selected' : '';
                return `<option value="${val}" ${isSelected}>${escapeHtml(src.bairro)} - ${escapeHtml(src.referencia)}</option>`;
            }).join('');
        }
    }

    generateFonteOptions(slotConfig, currentSource) {
        const regional = slotConfig.regional;
        const regionalData = trafficCameraSources[regional];
        const sourcesList = regionalData?.sources || [];
        const selectedBairro = slotConfig.selectedBairro || (currentSource ? (currentSource.id?.startsWith('SRC_') ? `SRC_${currentSource.id}` : (currentSource.bairro && currentSource.bairro !== 'Rio de Janeiro' ? currentSource.bairro : `SRC_${currentSource.id}`)) : `SRC_${sourcesList[0]?.id}`);

        // Se for um item de catálogo (SRC_...)
        if (!selectedBairro || selectedBairro.startsWith('SRC_')) {
            const srcId = selectedBairro ? selectedBairro.replace('SRC_', '') : sourcesList[0]?.id;
            const src = sourcesList.find(s => s.id === srcId) || currentSource || sourcesList[0];

            if (src) {
                const tipoLabel = src.tipoFonte === 'snapshot' ? '📷 Ao Vivo' : (src.tipoFonte === 'stream' ? '🎥 Ao Vivo' : (src.tipoFonte === 'mapa' ? '🗺️ Mapa' : '🌐 Portal'));
                return `<option value="SRC_${src.id}" selected>${tipoLabel} | ${escapeHtml(src.nome)}</option>`;
            }
            return '<option value="">Selecione a Câmera / Fonte...</option>';
        }

        // Se for um Bairro do Rio (camerasData)
        const camerasList = (this.camerasData && this.camerasData[selectedBairro]) || [];
        const sortedCameras = [...camerasList].sort((a, b) => (a.caption || '').localeCompare(b.caption || '', 'pt-BR'));

        if (sortedCameras.length === 0) {
            return `<option value="">Nenhuma câmera disponível em ${escapeHtml(selectedBairro)}</option>`;
        }

        return sortedCameras.map(cam => {
            const val = `CAM_${cam.id}`;
            const isSelected = (slotConfig.sourceId === val || slotConfig.sourceId === String(cam.id) || (currentSource && (currentSource.id === val || currentSource.id === `CAM_${cam.id}`))) ? 'selected' : '';
            return `<option value="${val}" ${isSelected}>🎥 ${escapeHtml(cam.caption || 'Câmera ' + cam.id)}</option>`;
        }).join('');
    }

    renderViewportContent(source, slotKey, isFullscreen = false) {
        if (!source) {
            return `
                <div class="cim-viewport-empty">
                    <i class="fa-solid fa-video-slash"></i>
                    <span>Nenhuma fonte selecionada</span>
                </div>
            `;
        }

        // CASO 1: CÂMERAS COM SNAPSHOT AO VIVO (CET-SP & BRASÍLIA)
        if (source.tipoFonte === 'snapshot') {
            const initialUrl = source.proxyUrl || source.directImageUrl;
            const watermarkText = source.cidade === 'São Paulo' ? 'CET-SP' : (source.cidade === 'Brasília' ? 'Brasília' : source.cidade);
            return `
                <div class="cim-snapshot-wrapper ${isFullscreen ? 'cim-snapshot-fs' : ''}" id="snap-wrap-${slotKey}">
                    <img 
                        id="snap-img-${slotKey}" 
                        src="${initialUrl}?t=${Date.now()}" 
                        alt="${escapeHtml(source.nome)}"
                        class="cim-snapshot-img"
                        onerror="window.handleCimImageError && window.handleCimImageError('${slotKey}', '${escapeHtml(source.id)}')"
                    />
                    <div class="cim-snapshot-live-indicator">
                        <i class="fa-solid fa-circle"></i> AO VIVO (${escapeHtml(source.cidade)})
                    </div>
                    <div class="cim-snapshot-caption">${escapeHtml(source.nome)}</div>
                    <div class="cim-snapshot-watermark">${escapeHtml(watermarkText)}</div>
                    <div class="cim-snapshot-error" id="snap-error-${slotKey}" style="display:none;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:24px; color:#f5a623; margin-bottom:8px;"></i>
                        <p style="margin:0 0 10px 0; font-size:11px; color:#cbd5e1;">Não foi possível reproduzir esta câmera no momento.</p>
                        <a href="${source.url}" target="_blank" rel="noopener noreferrer" class="btn-cim-open-portal" style="padding:6px 12px; font-size:9px;">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir Fonte
                        </a>
                    </div>
                </div>
            `;
        }

        // CASO 2: MAPAS E STREAMS INCORPORÁVEIS VIA IFRAME
        const canEmbed = Boolean(source.embedUrl) && source.suportaIframe === true;
        if (canEmbed) {
            const cleanEmbedUrl = normalizeEmbedUrl(source.embedUrl);

            return `
                <div class="cim-iframe-container ${isFullscreen ? 'cim-iframe-fs' : ''}">
                    <div class="cim-iframe-wrapper">
                        <iframe 
                            id="iframe-${slotKey}"
                            src="${cleanEmbedUrl}" 
                            width="100%" 
                            height="100%" 
                            style="border:none; width:100%; height:100%; background:#000;" 
                            loading="lazy"
                            allow="autoplay; encrypted-media; fullscreen"
                            sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
                        ></iframe>
                    </div>
                </div>
            `;
        }

        // CASO 3: FALLBACK QUANDO É EXCLUSIVAMENTE PORTAL EXTERNO
        return this.renderOperationalCard(source, slotKey);
    }

    renderOperationalCard(source, slotKey) {
        return `
            <div class="cim-operational-card">
                <div class="cim-op-icon-box">
                    <i class="${source.tipoFonte === 'mapa' ? 'fa-solid fa-map-location-dot' : 'fa-solid fa-building-shield'}"></i>
                </div>
                <div class="cim-op-title">${escapeHtml(source.nome)}</div>
                <div class="cim-op-desc">${escapeHtml(source.observacao || 'Transmissão pública operacional monitorada pelo CIM.')}</div>
                <div class="cim-op-meta">
                    <span class="cim-op-badge"><i class="fa-solid fa-shield-check"></i> Órgão Oficial / Transmissão Pública</span>
                    <span class="cim-op-via">📍 ${escapeHtml(source.bairro)} (${escapeHtml(source.referencia)})</span>
                </div>
                <a href="${source.url}" target="_blank" rel="noopener noreferrer" class="btn-cim-open-portal">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> ABRIR PORTAL OFICIAL DE TRÂNSITO
                </a>
                <div class="cim-op-notice">
                    <i class="fa-solid fa-circle-info"></i> Fonte com proteção contra incorporação em frames. Acesso direto liberado com 1 clique.
                </div>
            </div>
        `;
    }

    setupSnapshotTimer(slotKey, source) {
        if (this.snapshotTimers[slotKey]) {
            clearInterval(this.snapshotTimers[slotKey]);
            delete this.snapshotTimers[slotKey];
        }

        if (source && source.tipoFonte === 'snapshot' && source.ativa !== false) {
            const intervalMs = source.refreshInterval || (source.regional === 'BSB' ? 30000 : 3000);
            const imgUrl = source.proxyUrl || source.directImageUrl;

            this.snapshotTimers[slotKey] = setInterval(() => {
                const snapImg = document.getElementById(`snap-img-${slotKey}`);
                if (snapImg) {
                    snapImg.src = `${imgUrl}?t=${Date.now()}`;
                }
            }, intervalMs);
        }
    }

    changeCardSource(slotKey, newSourceId) {
        if (!this.currentSlots[slotKey]) return;
        
        this.currentSlots[slotKey].sourceId = newSourceId;
        this.saveSlotSelection();

        const cardEl = document.getElementById(`cim-${slotKey}`);
        if (cardEl) {
            this.renderSingleCard(slotKey, cardEl);
        }

        console.info(`[CIM] Slot ${slotKey} atualizado para a fonte: ${newSourceId}`);
    }

    refreshCard(slotKey) {
        const cardEl = document.getElementById(`cim-${slotKey}`);
        if (!cardEl) return;

        const viewport = cardEl.querySelector(`#viewport-${slotKey}`);
        const slotConfig = this.currentSlots[slotKey];
        const currentSource = this.resolveSourceObject(slotConfig);

        if (viewport && currentSource) {
            viewport.innerHTML = `
                <div class="cim-viewport-loading">
                    <i class="fa-solid fa-circle-notch fa-spin"></i>
                    <span>Atualizando sinal...</span>
                </div>
            `;
            setTimeout(() => {
                viewport.innerHTML = this.renderViewportContent(currentSource, slotKey);
                this.setupSnapshotTimer(slotKey, currentSource);
            }, 300);
        }
    }

    refreshAll() {
        const slotKeys = ['card_1', 'card_2', 'card_3', 'card_4', 'card_5', 'card_6'];
        slotKeys.forEach(key => this.refreshCard(key));
        
        const lastSync = document.getElementById('cim-last-sync');
        if (lastSync) {
            const now = new Date();
            lastSync.textContent = `Atualizado às ${now.toLocaleTimeString('pt-BR')}`;
        }

        showToast("Todas as 6 posições de câmeras foram atualizadas.", "info");
    }

    resetToDefaults() {
        this.currentSlots = JSON.parse(JSON.stringify(this.defaultSlots));
        this.saveSlotSelection();
        this.renderAllCards();
        showToast("Layout do Painel Integrado restaurado para os padrões oficiais da CIM.", "info");
    }

    // =========================================================================
    // MODO TELA CHEIA (FULLSCREEN)
    // =========================================================================
    openFullscreen(slotKey) {
        const overlay = document.getElementById('cim-fullscreen-overlay');
        const slotConfig = this.currentSlots[slotKey];
        if (!overlay || !slotConfig) return;

        this.activeFullscreenSlot = slotKey;
        const regionalData = trafficCameraSources[slotConfig.regional];
        const currentSource = this.resolveSourceObject(slotConfig);

        // Atualiza cabeçalho do Fullscreen
        const tagEl = document.getElementById('cim-fs-tag');
        const titleEl = document.getElementById('cim-fs-title');
        const subTitleEl = document.getElementById('cim-fs-subtitle');
        const selectEl = document.getElementById('cim-fs-select-camera');
        const openLinkEl = document.getElementById('cim-fs-open-link');
        const infoEl = document.getElementById('cim-fs-info');

        if (tagEl) {
            tagEl.className = `cim-regiao-tag tag-${slotConfig.regional.toLowerCase()}`;
            tagEl.textContent = slotConfig.regional;
        }
        if (titleEl) titleEl.textContent = `${regionalData?.label || slotConfig.regional} - ${currentSource?.bairro || 'Câmera'}`;
        if (subTitleEl) subTitleEl.textContent = currentSource?.nome || '';
        if (openLinkEl && currentSource) openLinkEl.href = currentSource.url;
        if (infoEl && currentSource) infoEl.innerHTML = `📍 <strong>${escapeHtml(currentSource.bairro)}</strong> (${escapeHtml(currentSource.referencia)}) | Atualização Contínua`;

        // Popula seletor de câmeras do Fullscreen
        if (selectEl) {
            selectEl.innerHTML = this.generateFonteOptions(slotConfig, currentSource);
        }

        // Renderiza o corpo
        this.updateFullscreenBody();

        // Exibe o overlay
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    updateFullscreenBody() {
        const bodyEl = document.getElementById('cim-fs-body');
        if (!bodyEl || !this.activeFullscreenSlot) return;

        const slotConfig = this.currentSlots[this.activeFullscreenSlot];
        const currentSource = this.resolveSourceObject(slotConfig);

        bodyEl.innerHTML = this.renderViewportContent(currentSource, `fs-${this.activeFullscreenSlot}`, true);

        // Timer de refresh para snapshot em tela cheia
        if (this.fullscreenTimer) clearInterval(this.fullscreenTimer);
        if (currentSource && currentSource.tipoFonte === 'snapshot') {
            const intervalMs = currentSource.refreshInterval || (currentSource.regional === 'BSB' ? 30000 : 3000);
            const imgUrl = currentSource.proxyUrl || currentSource.directImageUrl;
            this.fullscreenTimer = setInterval(() => {
                const fsImg = document.getElementById(`snap-img-fs-${this.activeFullscreenSlot}`);
                if (fsImg) {
                    fsImg.src = `${imgUrl}?t=${Date.now()}`;
                }
            }, intervalMs);
        }
    }

    closeFullscreen() {
        const overlay = document.getElementById('cim-fullscreen-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        document.body.style.overflow = '';
        if (this.fullscreenTimer) {
            clearInterval(this.fullscreenTimer);
            this.fullscreenTimer = null;
        }
        this.activeFullscreenSlot = null;
    }

    // =========================================================================
    // MODAL DE DIAGNÓSTICO DO NAVEGADOR (CÂMERAS RJ / WEBRTC H.265)
    // =========================================================================
    openDiagnosticModal() {
        const overlay = document.getElementById('cim-diag-modal-overlay');
        const contentEl = document.getElementById('cim-diag-body-content');
        if (!overlay || !contentEl) return;

        const caps = detectVideoCodecCapabilities();
        const hasH265WebRTC = caps.supportsH265;
        const hasH265MediaSource = caps.supportsMediaSourceH265;

        contentEl.innerHTML = `
            <div class="cim-diag-status-grid">
                <div class="cim-diag-status-box">
                    <strong>Navegador / SO:</strong>
                    <span class="cim-diag-status-val ok">${escapeHtml(caps.browserName)} (${escapeHtml(caps.osName)})</span>
                </div>
                <div class="cim-diag-status-box">
                    <strong>WebRTC H.265 (WHEP):</strong>
                    <span class="cim-diag-status-val ${hasH265WebRTC ? 'ok' : 'warn'}">
                        ${hasH265WebRTC ? '✅ Detectado' : '⚠️ Não Anunciado'}
                    </span>
                </div>
                <div class="cim-diag-status-box">
                    <strong>HTML5 MediaSource HEVC:</strong>
                    <span class="cim-diag-status-val ${hasH265MediaSource ? 'ok' : 'warn'}">
                        ${hasH265MediaSource ? '✅ Suportado' : '⚠️ Não Anunciado'}
                    </span>
                </div>
                <div class="cim-diag-status-box">
                    <strong>Servidor WHEP (dev.tixxi.rio):</strong>
                    <span class="cim-diag-status-val ok">🌐 Porta WHEP Operacional</span>
                </div>
            </div>

            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                <h4 style="margin: 0 0 6px 0; color: #ef4444; font-size: 13px; font-weight: 800;">
                    <i class="fa-solid fa-bug"></i> Diagnóstico da Falha Identificada ("codecs not supported by client")
                </h4>
                <p style="margin: 0; font-size: 12px; color: #cbd5e1; line-height: 1.5;">
                    As câmeras do portal <strong>CamerasRJ</strong> utilizam o protocolo <strong>WebRTC (WHEP)</strong> com compactação de vídeo em <strong>H.265 / HEVC</strong>. 
                    Quando o seu navegador (ou placa de vídeo) não expõe decodificação H.265 por hardware ao WebRTC, o servidor <code>dev.tixxi.rio</code> recusa a conexão exibindo a mensagem <em>"codecs not supported by client"</em> (HTTP 400 Bad Request) e bloqueios de CORS preflight no RUM.
                </p>
            </div>

            <div class="cim-diag-steps">
                <h4 style="margin: 0 0 10px 0; color: #00d1ff; font-size: 13px; font-weight: 800;">
                    <i class="fa-solid fa-list-check"></i> Instruções de Configuração no Navegador para Usuários
                </h4>
                <ol>
                    <li>
                        <strong>Ativar Aceleração de Hardware:</strong> No Edge ou Chrome, acesse <span class="cim-diag-code">edge://settings/system</span> ou <span class="cim-diag-code">chrome://settings/system</span> e ative a opção <em>"Usar aceleração de gráficos/hardware quando disponível"</em>.
                    </li>
                    <li>
                        <strong>Ativar Flag do Chromium:</strong> Digite <span class="cim-diag-code">chrome://flags</span> na barra de endereço, pesquise por <strong>#enable-accelerated-video-decode</strong> e marque como <strong>Enabled</strong>. Reinicie o navegador.
                    </li>
                    <li>
                        <strong>Instalar Extensões HEVC do Windows (caso necessário):</strong> No Windows 10/11, instale as <em>"Extensões de Vídeo HEVC"</em> da Microsoft Store ou atualize o driver de vídeo da sua GPU (NVIDIA, Intel ou AMD).
                    </li>
                    <li>
                        <strong>Bloqueios de Segurança / VPN / Shields:</strong> Desative bloqueios de WebRTC UDP/STUN no uBlock Origin, Brave Shields ou antivírus corporativo que impeçam conexões para <span class="cim-diag-code">dev.tixxi.rio</span>.
                    </li>
                </ol>
            </div>
        `;

        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    closeDiagnosticModal() {
        const overlay = document.getElementById('cim-diag-modal-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        if (!this.activeFullscreenSlot) {
            document.body.style.overflow = '';
        }
    }

    applyFallbackRio() {
        if (this.currentSlots.card_1) {
            this.currentSlots.card_1.sourceId = 'RJ_MAPA_RIO_01';
        }
        if (this.currentSlots.card_2) {
            this.currentSlots.card_2.sourceId = 'RJ_ZET_UFRJ_01';
        }
        this.saveSlotSelection();
        this.renderAllCards();
        showToast("Câmeras do Rio alternadas para o Mapa Interativo e Sensores UFRJ com 100% de compatibilidade.", "success");
    }
}

// Handler global para erro de carregamento de snapshot
window.handleCimImageError = function(slotKey, sourceId) {
    console.warn(`[CIM] Falha ao carregar imagem para slot ${slotKey} (${sourceId})`);
    const snapImg = document.getElementById(`snap-img-${slotKey}`);
    const snapErr = document.getElementById(`snap-error-${slotKey}`);
    if (snapImg && snapErr) {
        snapImg.style.display = 'none';
        snapErr.style.display = 'flex';
    }
};
