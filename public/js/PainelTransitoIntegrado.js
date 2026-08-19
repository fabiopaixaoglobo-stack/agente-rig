import { trafficCameraSources, getCatalogStats, normalizeEmbedUrl } from './traffic-camera-data.js?v=4.0.0';
import { showToast, escapeHtml } from './utils.js';

export class PainelTransitoIntegrado {
    constructor() {
        this.containerId = 'tab-painel-integrado';
        this.storageKey = 'rit_cim_cards_selection_v3';
        this.clockInterval = null;
        
        // Definição dos 6 slots padrão com fontes visuais integradas prioritárias (streams e mapas ao vivo)
        this.defaultSlots = {
            card_1: { regional: 'RJ', slotNum: 1, sourceId: 'RJ_MAPA_RIO_01' },
            card_2: { regional: 'RJ', slotNum: 2, sourceId: 'RJ_ZET_UFRJ_01' },
            card_3: { regional: 'SP', slotNum: 1, sourceId: 'SP_PAULISTA_AO_VIVO' },
            card_4: { regional: 'BSB', slotNum: 1, sourceId: 'BSB_CAMERAS_MUNDO_01' },
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
        
        console.info('[CIM] Painel Integrado de Monitoramento de Trânsito inicializado com 6 posições visuais.');
    }

    loadSlotSelection() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.currentSlots = { ...this.defaultSlots, ...parsed };

                // Migração de segurança: se tiver os IDs legados antigos de portais ou bloqueados, migra para os visuais
                if (this.currentSlots.card_2?.sourceId === 'RJ_CAMERASRJ_COPACABANA') this.currentSlots.card_2.sourceId = 'RJ_ZET_UFRJ_01';
                if (this.currentSlots.card_3?.sourceId === 'SP_CET_OFICIAL_01' || this.currentSlots.card_3?.sourceId === 'SP_CET_PAINEL_DIRETO') this.currentSlots.card_3.sourceId = 'SP_PAULISTA_AO_VIVO';
                if (this.currentSlots.card_4?.sourceId === 'BSB_DER_DF_01' || this.currentSlots.card_4?.sourceId === 'BSB_DF_AGORA_01') this.currentSlots.card_4.sourceId = 'BSB_CAMERAS_MUNDO_01';
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
        const isEmbeddable = currentSource ? (Boolean(currentSource.embedUrl) && currentSource.suportaIframe === true) : false;
        
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

            <!-- ÁREA DO PLAYER / MAPA / CARD OPERACIONAL -->
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

        // Eventos dos Selects do Card
        const selBairro = cardEl.querySelector('.select-bairro');
        const selFonte = cardEl.querySelector('.select-fonte');
        const btnRefresh = cardEl.querySelector('.btn-cim-card-refresh');

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
            const tipoLabel = src.tipoFonte === 'stream' ? '🎥 Ao Vivo' : (src.tipoFonte === 'mapa' ? '🗺️ Mapa' : '🌐 Portal');
            return `<option value="${src.id}" ${selected}>${tipoLabel} | ${escapeHtml(src.nome)}</option>`;
        }).join('');
    }

    renderViewportContent(source, slotKey) {
        if (!source) {
            return `
                <div class="cim-viewport-empty">
                    <i class="fa-solid fa-video-slash"></i>
                    <span>Nenhuma fonte selecionada</span>
                </div>
            `;
        }

        // REGRA PRINCIPAL: SE POSSUI EMBED URL E SUPORTA IFRAME (STREAM OU MAPA), SEMPRE TENTA EXIBIÇÃO INTEGRADA NO PAINEL
        const canEmbed = Boolean(source.embedUrl) && source.suportaIframe === true;
        if (canEmbed) {
            const cleanEmbedUrl = normalizeEmbedUrl(source.embedUrl);
            return `
                <div class="cim-iframe-wrapper">
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

        // FALLBACK: QUANDO A FONTE É EXCLUSIVAMENTE UM PORTAL OU NÃO SUPORTA IFRAME
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
        showToast("Layout do Painel Integrado restaurado para as transmissões ao vivo da CIM.", "info");
    }
}
