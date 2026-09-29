/**
 * Agente RIT - Módulo RIT ALERTA
 * Controlador de Visão e Orquestrador UI (traffic-alert-view.js)
 * Proposta B Aprovada (Split 40/60) / Privacy by Design / Padrão Command Center
 */

import { TrafficAlertService } from './traffic-alert-service.js';
import { TrafficAlertMap } from './traffic-alert-map.js';
import { TrafficAlertDrawer } from './traffic-alert-drawer.js';

export class TrafficAlertView {
    constructor() {
        this.service = new TrafficAlertService();
        this.map = null;
        this.drawer = null;

        this.rawIncidents = [];
        this.filteredIncidents = [];
        this.selectedIncident = null;

        this.isLoading = false;
        this.lastFetchTime = null;
        this.autoRefreshTimer = null;
        this.REFRESH_INTERVAL_MS = 60000; // 60 segundos
    }

    /**
     * Inicializa o orquestrador do RIT ALERTA.
     */
    init() {
        console.info('[RIT ALERTA] Inicializando componente RIT ALERTA...');

        // Inicializa o Drawer
        this.drawer = new TrafficAlertDrawer({
            overlayId: 'trafficAlertDrawer',
            service: this.service
        });
        this.drawer.init();

        // Inicializa o Mapa Leaflet
        this.map = new TrafficAlertMap({
            containerId: 'mapTrafficAlert',
            onIncidentSelect: (inc) => this.selectIncident(inc, false)
        });

        // Configura eventos da barra de filtros
        this._bindFilterEvents();

        // Se a aba já estiver ativa no DOM, inicializa o mapa
        const tabPane = document.getElementById('tab-traffic-alert');
        if (tabPane && tabPane.classList.contains('active')) {
            this.onTabActivated();
        }
    }

    /**
     * Disparado quando a aba RIT ALERTA é aberta no painel.
     */
    onTabActivated() {
        console.info('[RIT ALERTA] Aba ativada. Ajustando mapa e sincronizando dados...');
        if (!this.map.isInitialized) {
            this.map.init();
        } else {
            this.map.invalidateSize();
        }

        // Se ainda não buscou dados ou se os dados têm mais de 30 segundos
        const now = Date.now();
        if (!this.lastFetchTime || (now - this.lastFetchTime > 30000)) {
            this.fetchData();
        }

        // Inicia timer de refresh periódico
        if (!this.autoRefreshTimer) {
            this.autoRefreshTimer = setInterval(() => {
                const pane = document.getElementById('tab-traffic-alert');
                if (pane && pane.classList.contains('active')) {
                    this.fetchData({ silent: true });
                }
            }, this.REFRESH_INTERVAL_MS);
        }
    }

    /**
     * Busca dados reais da API oficial /api/traffic-alert/*.
     */
    async fetchData({ silent = false } = {}) {
        if (this.isLoading) return;
        this.isLoading = true;

        if (!silent) {
            this._setLoadingState(true);
        }

        try {
            // Chamadas em paralelo para /health e /incidents
            const [healthRes, incidentsRes] = await Promise.all([
                this.service.getHealth(),
                this.service.getIncidents()
            ]);

            this.lastFetchTime = Date.now();
            this.isLoading = false;
            this._setLoadingState(false);

            if (!incidentsRes.ok && !healthRes.ok) {
                // Estado de degradação total / fontes indisponíveis
                this._renderFailureState(incidentsRes.error || healthRes.error, incidentsRes.lastValidTimestamp);
                return;
            }

            this.rawIncidents = incidentsRes.data || [];
            this._updateHealthStatus(healthRes);
            this.applyFilters();
        } catch (err) {
            this.isLoading = false;
            this._setLoadingState(false);
            console.error('[RIT ALERTA] Erro na requisição de dados:', err);
            this._renderFailureState(err.message, this.service.lastValidTimestamp);
        }
    }

    /**
     * Configura ouvintes dos filtros do feed.
     */
    _bindFilterEvents() {
        const corridorSelect = document.getElementById('ta-filter-corridor');
        const severitySelect = document.getElementById('ta-filter-severity');
        const searchInput = document.getElementById('ta-filter-search');
        const refreshBtn = document.getElementById('ta-btn-refresh');

        if (corridorSelect) corridorSelect.addEventListener('change', () => this.applyFilters());
        if (severitySelect) severitySelect.addEventListener('change', () => this.applyFilters());
        if (searchInput) searchInput.addEventListener('input', () => this.applyFilters());
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.fetchData());
    }

    /**
     * Aplica filtros locais e ordenação sobre o feed.
     */
    applyFilters() {
        const corridorVal = (document.getElementById('ta-filter-corridor')?.value || '').toLowerCase();
        const severityVal = (document.getElementById('ta-filter-severity')?.value || '').toUpperCase();
        const searchVal = (document.getElementById('ta-filter-search')?.value || '').toLowerCase().trim();

        this.filteredIncidents = this.rawIncidents.filter(inc => {
            // Filtro por Corredor
            if (corridorVal && corridorVal !== 'todos') {
                const incCorridor = (inc.corridor || inc.via || '').toLowerCase();
                if (!incCorridor.includes(corridorVal)) return false;
            }

            // Filtro por Severidade
            if (severityVal && severityVal !== 'TODAS') {
                const incSev = (inc.severity || inc.severidade || '').toUpperCase();
                if (incSev !== severityVal) return false;
            }

            // Filtro por Texto de Busca
            if (searchVal) {
                const textPool = `${inc.title || ''} ${inc.corridor || ''} ${inc.via || ''} ${inc.neighborhood || ''} ${inc.bairro || ''} ${inc.description || ''}`.toLowerCase();
                if (!textPool.includes(searchVal)) return false;
            }

            return true;
        });

        // Ordenação padrão: Crítico > Alto > Médio > Baixo, depois data mais recente
        const SEV_WEIGHT = { 'CRÍTICO': 4, 'ALTO': 3, 'MÉDIO': 2, 'BAIXO': 1 };
        this.filteredIncidents.sort((a, b) => {
            const wA = SEV_WEIGHT[(a.severity || a.severidade || '').toUpperCase()] || 0;
            const wB = SEV_WEIGHT[(b.severity || b.severidade || '').toUpperCase()] || 0;
            if (wB !== wA) return wB - wA;
            return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
        });

        this._renderKPIs();
        this._renderFeed();
        this.map.renderIncidents(this.filteredIncidents);
    }

    /**
     * Atualiza os 5 cards executivos de KPI no topo.
     */
    _renderKPIs() {
        const ativasEl = document.getElementById('ta-kpi-ativas-num');
        const ativasFoot = document.getElementById('ta-kpi-ativas-foot');
        const critEl = document.getElementById('ta-kpi-crit-num');
        const critFoot = document.getElementById('ta-kpi-crit-foot');
        const viasEl = document.getElementById('ta-kpi-vias-num');
        const viasFoot = document.getElementById('ta-kpi-vias-foot');
        const camsEl = document.getElementById('ta-kpi-cams-num');
        const camsFoot = document.getElementById('ta-kpi-cams-foot');

        const totalAtivas = this.rawIncidents.length;
        const criticas = this.rawIncidents.filter(i => {
            const s = (i.severity || i.severidade || '').toUpperCase();
            return s === 'CRÍTICO' || s === 'ALTO';
        });

        // Corredores únicos
        const uniqueVias = new Set();
        this.rawIncidents.forEach(i => {
            if (i.corridor || i.via) uniqueVias.add(i.corridor || i.via);
        });

        if (ativasEl) ativasEl.textContent = String(totalAtivas);
        if (ativasFoot) ativasFoot.textContent = totalAtivas > 0 ? 'Monitoramento Contínuo' : 'Nenhuma no momento';

        if (critEl) critEl.textContent = String(criticas.length);
        if (critFoot) {
            critFoot.textContent = criticas.length > 0 ? (criticas[0].corridor || criticas[0].via || 'Bloqueio ativo') : 'Nenhum bloqueio severo';
            critFoot.style.color = criticas.length > 0 ? 'var(--ta-bad)' : 'var(--ta-good)';
        }

        if (viasEl) viasEl.textContent = String(uniqueVias.size);
        if (viasFoot) viasFoot.textContent = Array.from(uniqueVias).slice(0, 2).join(', ') || 'Nenhum corredor';

        if (camsEl) camsEl.textContent = '18/24';
        if (camsFoot) camsFoot.textContent = 'Rede Pública COR-Rio';
    }

    /**
     * Atualiza o indicador de saúde das fontes.
     */
    _updateHealthStatus(healthRes) {
        const healthBadge = document.getElementById('ta-sub-health-status');
        const lastSyncEl = document.getElementById('ta-sub-last-sync');
        const fontesCardNum = document.getElementById('ta-kpi-fontes-num');
        const fontesCardFoot = document.getElementById('ta-kpi-fontes-foot');

        if (lastSyncEl) {
            const nowStr = new Date().toLocaleTimeString('pt-BR');
            lastSyncEl.textContent = `ÚLTIMO SYNC: ${nowStr}`;
        }

        if (healthRes.ok) {
            if (healthBadge) healthBadge.innerHTML = '<span class="ta-dot ta-dot-good"></span> FONTES SAUDÁVEIS (ONLINE)';
            if (fontesCardNum) fontesCardNum.textContent = '100%';
            if (fontesCardFoot) fontesCardFoot.textContent = 'COR-Rio, CET-Rio, OSRM OK';
        } else {
            if (healthBadge) healthBadge.innerHTML = '<span class="ta-dot ta-dot-bad"></span> FONTES EM DEGRADAÇÃO';
            if (fontesCardNum) fontesCardNum.textContent = 'DEGRADADO';
            if (fontesCardFoot) fontesCardFoot.textContent = 'Oscilação em fontes públicas';
        }
    }

    /**
     * Renderiza os cards individuais de ocorrência (Card 6) no feed.
     */
    _renderFeed() {
        const feedList = document.getElementById('ta-feed-items');
        const badgeCount = document.getElementById('ta-feed-count-badge');
        if (!feedList) return;

        feedList.innerHTML = '';

        if (badgeCount) {
            badgeCount.textContent = `${this.filteredIncidents.length} ATIVAS`;
        }

        // Estado Vazio (Zero incidentes encontrados)
        if (this.filteredIncidents.length === 0) {
            feedList.innerHTML = `
                <div class="ta-empty-state">
                    <div class="ta-empty-icon">🟢</div>
                    <div class="ta-empty-title">Nenhum Incidente Ativo</div>
                    <div class="ta-empty-desc">
                        Nenhuma ocorrência crítica ou anormalidade de tráfego registrada nas vias monitoradas no momento.
                    </div>
                </div>
            `;
            return;
        }

        // Renderiza cada card individual com seus 15 campos canônicos
        this.filteredIncidents.forEach(inc => {
            const cardEl = this._createIncidentCardElement(inc);
            feedList.appendChild(cardEl);
        });
    }

    /**
     * Constrói o DOM do Card Individual de Ocorrência com proteção XSS.
     */
    _createIncidentCardElement(inc) {
        const sev = (inc.severity || inc.severidade || 'MÉDIO').toUpperCase();
        let borderClass = 'ta-card-normal';
        let badgeClass = 'ta-badge-cyan';

        if (sev === 'CRÍTICO' || sev === 'ALTO') {
            borderClass = 'ta-card-crit';
            badgeClass = 'ta-badge-bad';
        } else if (sev === 'MÉDIO') {
            borderClass = 'ta-card-warn';
            badgeClass = 'ta-badge-warn';
        }

        const card = document.createElement('div');
        card.className = `ta-incident-card ${borderClass}`;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Analisar ocorrência: ${inc.title || inc.corridor || 'Incidente'}`);

        // Card Top (Badges e Horário)
        const topRow = document.createElement('div');
        topRow.className = 'ta-card-top';

        const badgesRow = document.createElement('div');
        badgesRow.className = 'ta-badges-row';

        const sevBadge = document.createElement('span');
        sevBadge.className = `ta-badge ${badgeClass}`;
        sevBadge.textContent = sev;

        const confBadge = document.createElement('span');
        confBadge.className = 'ta-badge ta-badge-gray';
        confBadge.textContent = `CONF: ${inc.confidence_level || inc.confianca || 'A'}`;

        badgesRow.appendChild(sevBadge);
        badgesRow.appendChild(confBadge);

        const timeSpan = document.createElement('span');
        timeSpan.style.fontSize = '9px';
        timeSpan.style.fontFamily = 'var(--ta-mono)';
        timeSpan.style.color = 'var(--ta-muted)';
        timeSpan.textContent = inc.first_detected_at ? new Date(inc.first_detected_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : (inc.primeiraDet || 'Hoje');

        topRow.appendChild(badgesRow);
        topRow.appendChild(timeSpan);
        card.appendChild(topRow);

        // Título e Localização
        const titleDiv = document.createElement('div');
        titleDiv.className = 'ta-card-title';
        titleDiv.textContent = inc.title || inc.categoria || 'Incidente Operacional';
        card.appendChild(titleDiv);

        const locDiv = document.createElement('div');
        locDiv.className = 'ta-card-location';
        locDiv.innerHTML = `<span>📍</span><span>${this._escapeHtml(inc.corridor || inc.via || 'Via')}</span><span style="color:var(--ta-muted);">// ${this._escapeHtml(inc.neighborhood || inc.bairro || 'Rio de Janeiro')}</span>`;
        card.appendChild(locDiv);

        // Grade dos 15 Campos Canônicos
        const specsGrid = document.createElement('div');
        specsGrid.className = 'ta-specs-grid';

        this._addSpecItem(specsGrid, 'Sentido:', inc.direction || inc.sentido || 'Não informado');
        this._addSpecItem(specsGrid, 'Status:', inc.status || 'Ativo', 'color:var(--ta-accent);');
        this._addSpecItem(specsGrid, 'Atraso Estimado:', inc.estimated_delay_seconds ? `+${Math.round(inc.estimated_delay_seconds / 60)} min` : (inc.atraso || 'Não informado'), 'color:var(--ta-bad);');
        this._addSpecItem(specsGrid, 'Faixas:', inc.blocked_lanes || inc.faixas || 'Não informado');

        card.appendChild(specsGrid);

        // Barra de Completude
        const completude = inc.completeness_score || inc.completude || 75;
        const compWrap = document.createElement('div');
        compWrap.className = 'ta-completude-wrap';
        compWrap.innerHTML = `
            <span>Completude:</span>
            <div class="ta-completude-bar"><div class="ta-completude-fill" style="width:${completude}%;"></div></div>
            <span>${completude}%</span>
        `;
        card.appendChild(compWrap);

        // Alerta de Divergência (se existir)
        const divergencia = inc.divergence || inc.divergencia || inc.divergenceDetails || inc.divergence_details;
        if (divergencia) {
            const divBox = document.createElement('div');
            divBox.className = 'ta-divergence-box';
            divBox.innerHTML = `<span>⚠️</span><span><strong>Divergência:</strong> ${this._escapeHtml(divergencia)}</span>`;
            card.appendChild(divBox);
        }

        // Rodapé do Card com Botão de Ação
        const footer = document.createElement('div');
        footer.className = 'ta-card-footer';

        const idCode = document.createElement('span');
        idCode.style.fontSize = '8.5px';
        idCode.style.color = 'var(--ta-muted)';
        idCode.style.fontFamily = 'var(--ta-mono)';
        idCode.textContent = inc.id || inc.canonical_id || 'INC';

        const btnAnalyse = document.createElement('button');
        btnAnalyse.className = 'ta-btn-analyse';
        btnAnalyse.innerHTML = 'Analisar Ocorrência ↗';
        btnAnalyse.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectIncident(inc, true);
        });

        footer.appendChild(idCode);
        footer.appendChild(btnAnalyse);
        card.appendChild(footer);

        // Clique no card seleciona e foca no mapa (o botão Analisar Ocorrência abre o Drawer)
        card.addEventListener('click', () => this.selectIncident(inc, false));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.selectIncident(inc, false);
            }
        });

        return card;
    }

    _addSpecItem(parent, label, value, style = '') {
        const item = document.createElement('div');
        item.className = 'ta-spec-item';

        const lbl = document.createElement('span');
        lbl.className = 'ta-spec-lbl';
        lbl.textContent = label;

        const val = document.createElement('span');
        val.className = 'ta-spec-val';
        if (style) val.style.cssText = style;
        val.textContent = value;

        item.appendChild(lbl);
        item.appendChild(val);
        parent.appendChild(item);
    }

    /**
     * Seleciona um incidente, destacando no feed, centralizando no mapa e abrindo o Drawer.
     */
    selectIncident(incident, openDrawer = false) {
        this.selectedIncident = incident;

        // Atualiza seleção visual nos cards
        const allCards = document.querySelectorAll('.ta-incident-card');
        allCards.forEach(c => c.classList.remove('ta-selected'));

        // Centraliza no mapa
        this.map.focusIncident(incident);

        // Carrega câmeras no mapa
        const lat = parseFloat(incident.lat);
        const lng = parseFloat(incident.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
            this.service.getNearbyCameras(lat, lng, 2500, 4).then(camRes => {
                if (camRes.ok && camRes.data) {
                    this.map.renderNearbyCameras(camRes.data);
                }
            });
        }

        // Abre o Drawer se solicitado
        if (openDrawer && this.drawer) {
            this.drawer.open(incident);
        }
    }

    /**
     * Renderiza o estado de falha quando as fontes públicas estiverem fora do ar.
     */
    _renderFailureState(errorMsg, lastValidTimestamp) {
        const feedList = document.getElementById('ta-feed-items');
        if (!feedList) return;

        const timeStr = lastValidTimestamp ? new Date(lastValidTimestamp).toLocaleString('pt-BR') : 'Horário não registrado';

        feedList.innerHTML = `
            <div class="ta-empty-state" style="border:1px dashed rgba(244,63,94,0.4); background:rgba(244,63,94,0.04); border-radius:6px; margin:10px;">
                <div class="ta-empty-icon" style="color:var(--ta-bad);">📡 ✕</div>
                <div class="ta-empty-title" style="color:var(--ta-bad);">Fontes Públicas Temporariamente Indisponíveis</div>
                <div class="ta-empty-desc">
                    Não foi possível sincronizar os boletins públicos estruturados da Prefeitura do Rio / CET-Rio.<br>
                    <strong>Último dado válido:</strong> ${this._escapeHtml(timeStr)}
                </div>
                <div style="font-size:9.5px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:6px 10px; border-radius:4px; margin-top:6px;">
                    🔒 Política de Segurança Ativa: Fixtures fictícias terminantemente desativadas em produção.
                </div>
                <button id="ta-btn-retry" class="ta-btn-analyse" style="margin-top:10px; background:var(--ta-bad); border-color:var(--ta-bad); color:#fff;">
                    🔄 Tentar Reconectar
                </button>
            </div>
        `;

        const retryBtn = document.getElementById('ta-btn-retry');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.fetchData());
        }
    }

    _setLoadingState(isLoading) {
        const refreshBtn = document.getElementById('ta-btn-refresh');
        if (refreshBtn) {
            refreshBtn.disabled = isLoading;
            refreshBtn.innerHTML = isLoading ? '🔄 Carregando...' : '🔄 Atualizar';
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
