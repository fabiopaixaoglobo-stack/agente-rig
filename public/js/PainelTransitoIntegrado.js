import { trafficCameraSources, getCatalogStats, normalizeEmbedUrl } from './traffic-camera-data.js?v=4.0.0';
import { showToast, escapeHtml } from './utils.js';

export class PainelTransitoIntegrado {
    constructor() {
        this.containerId = 'tab-painel-integrado';
        this.storageKey = 'rit_cim_cards_selection_v5';
        this.clockInterval = null;
        this.snapshotTimers = {};
        this.activeFullscreenSlot = null;
        this.fullscreenTimer = null;
        
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
        this.init();
    }

    init() {
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
        
        console.info('[CIM] Painel Integrado de Monitoramento de Trânsito inicializado com SP CET, Brasília Clima ao Vivo, Fullscreen e 6 posições.');
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
                if (this.currentSlots.card_2?.sourceId === 'RJ_CAMERASRJ_COPACABANA') this.currentSlots.card_2.sourceId = 'RJ_ZET_UFRJ_01';
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
                            <button id="btn-cim-fs-close" class="btn-cim-action btn-cim-primary" title="Voltar ao Mosaico de 6 Câmeras (ESC)">
                                <i class="fa-solid fa-compress"></i> Voltar ao Mosaico
                            </button>
                        </div>
                    </header>

                    <div class="cim-fs-body" id="cim-fs-body">
                        <!-- Conteúdo da câmera em Fullscreen -->
                    </div>

                    <footer class="cim-fs-footer">
                        <span id="cim-fs-info">📍 Monitoramento em Tempo Real - Central Integrada de Monitoramento Globo (CIM)</span>
                        <a id="cim-fs-open-link" href="#" target="_blank" rel="noopener noreferrer" class="btn-cim-card-link">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir Fonte Oficial
                        </a>
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

        // Eventos do Fullscreen
        const btnFsClose = tabPane.querySelector('#btn-cim-fs-close');
        btnFsClose?.addEventListener('click', () => {
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
            if (e.key === 'Escape' && this.activeFullscreenSlot) {
                this.closeFullscreen();
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

    renderSingleCard(slotKey, cardEl) {
        const slotConfig = this.currentSlots[slotKey] || this.defaultSlots[slotKey];
        const regionalData = trafficCameraSources[slotConfig.regional];
        if (!regionalData) return;

        const sourcesList = regionalData.sources || [];
        let currentSource = sourcesList.find(s => s.id === slotConfig.sourceId);
        
        // Failover: se não encontrar a fonte salva, seleciona a primeira disponível da regional
        if (!currentSource && sourcesList.length > 0) {
            currentSource = sourcesList[0];
            slotConfig.sourceId = currentSource.id;
            this.saveSlotSelection();
        }

        const tagClass = `tag-${slotConfig.regional.toLowerCase()}`;
        const slotLabel = `Câmera ${slotConfig.slotNum}`;
        const isEmbeddable = currentSource ? (currentSource.tipoFonte === 'snapshot' || (Boolean(currentSource.embedUrl) && currentSource.suportaIframe === true)) : false;
        
        const healthBadge = isEmbeddable 
            ? '<span class="cim-badge-online"><i class="fa-solid fa-circle"></i> SINAL INTEGRADO</span>'
            : '<span class="cim-badge-external"><i class="fa-solid fa-arrow-up-right-from-square"></i> PORTAL EXTERNO</span>';

        cardEl.innerHTML = `
            <div class="cim-card-header">
                <div class="cim-card-title-left">
                    <span class="cim-regiao-tag ${tagClass}">${slotConfig.regional}</span>
                    <strong class="cim-city-name">${regionalData.label}</strong>
                    <span class="cim-slot-tag">${slotLabel}</span>
                </div>
                <div class="cim-card-title-right">
                    ${healthBadge}
                    <button class="btn-cim-card-fullscreen" data-slot="${slotKey}" title="Expandir para Tela Cheia">
                        <i class="fa-solid fa-expand"></i>
                    </button>
                </div>
            </div>

            <!-- SELETORES INDEPENDENTES POR CARD -->
            <div class="cim-card-selectors">
                <div class="cim-selector-field">
                    <label class="cim-sel-lbl">Bairro / Região / Via:</label>
                    <select class="cim-select select-bairro" data-slot="${slotKey}">
                        ${this.generateBairroOptions(sourcesList, currentSource)}
                    </select>
                </div>
                <div class="cim-selector-field">
                    <label class="cim-sel-lbl">Fonte / Câmera:</label>
                    <select class="cim-select select-fonte" data-slot="${slotKey}">
                        ${this.generateFonteOptions(sourcesList, currentSource)}
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

        selBairro?.addEventListener('change', (e) => {
            const selectedSourceId = e.target.value;
            this.changeCardSource(slotKey, selectedSourceId);
        });

        selFonte?.addEventListener('change', (e) => {
            const selectedSourceId = e.target.value;
            this.changeCardSource(slotKey, selectedSourceId);
        });

        btnRefresh?.addEventListener('click', () => {
            this.refreshCard(slotKey);
        });

        btnFs?.addEventListener('click', () => {
            this.openFullscreen(slotKey);
        });

        // Configura timer de atualização automática para câmeras do tipo snapshot
        this.setupSnapshotTimer(slotKey, currentSource);
    }

    generateBairroOptions(sourcesList, currentSource) {
        return sourcesList.map(src => {
            const selected = (currentSource && currentSource.id === src.id) ? 'selected' : '';
            return `<option value="${src.id}" ${selected}>${escapeHtml(src.bairro)} - ${escapeHtml(src.referencia)}</option>`;
        }).join('');
    }

    generateFonteOptions(sourcesList, currentSource) {
        return sourcesList.map(src => {
            const selected = (currentSource && currentSource.id === src.id) ? 'selected' : '';
            const tipoLabel = src.tipoFonte === 'snapshot' ? '📷 Ao Vivo' : (src.tipoFonte === 'stream' ? '🎥 Ao Vivo' : (src.tipoFonte === 'mapa' ? '🗺️ Mapa' : '🌐 Portal'));
            return `<option value="${src.id}" ${selected}>${tipoLabel} | ${escapeHtml(src.nome)}</option>`;
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
                <div class="cim-iframe-wrapper ${isFullscreen ? 'cim-iframe-fs' : ''}">
                    <iframe 
                        id="iframe-${slotKey}"
                        src="${cleanEmbedUrl}" 
                        width="100%" 
                        height="100%" 
                        style="border:none;" 
                        loading="lazy"
                        allow="autoplay; encrypted-media; fullscreen"
                        sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
                    ></iframe>
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
        const regionalData = trafficCameraSources[slotConfig.regional];
        const currentSource = regionalData?.sources?.find(s => s.id === slotConfig.sourceId);

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
        const sourcesList = regionalData?.sources || [];
        const currentSource = sourcesList.find(s => s.id === slotConfig.sourceId) || sourcesList[0];

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
        if (titleEl) titleEl.textContent = `${regionalData.label} - ${currentSource?.bairro || 'Câmera'}`;
        if (subTitleEl) subTitleEl.textContent = currentSource?.nome || '';
        if (openLinkEl && currentSource) openLinkEl.href = currentSource.url;
        if (infoEl && currentSource) infoEl.innerHTML = `📍 <strong>${escapeHtml(currentSource.bairro)}</strong> (${escapeHtml(currentSource.referencia)}) | Atualização Contínua`;

        // Popula seletor de câmeras do Fullscreen
        if (selectEl) {
            selectEl.innerHTML = sourcesList.map(src => {
                const sel = (src.id === currentSource?.id) ? 'selected' : '';
                return `<option value="${src.id}" ${sel}>${src.tipoFonte === 'snapshot' ? '📷' : '🎥'} ${src.nome}</option>`;
            }).join('');
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
        const regionalData = trafficCameraSources[slotConfig.regional];
        const currentSource = regionalData?.sources?.find(s => s.id === slotConfig.sourceId);

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
