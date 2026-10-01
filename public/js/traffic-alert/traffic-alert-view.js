import { TrafficAlertService } from './traffic-alert-service.js';
import { TrafficAlertMap } from './traffic-alert-map.js';
import { TrafficAlertDrawer } from './traffic-alert-drawer.js';
import { resolveRegionalConfig, REGIONAL_REGISTRY } from './regional-registry.js';

export class TrafficAlertView {
    constructor() {
        this.service = new TrafficAlertService();
        this.map = null;
        this.drawer = null;

        this.rawIncidents = [];
        this.filteredIncidents = [];
        this.trafficConditionsData = [];
        this.corridorKpis = {};
        this.selectedIncident = null;

        const initialCfg = resolveRegionalConfig(localStorage.getItem('rit_selected_regional') || 'RJ');
        this.currentRegionalConfig = initialCfg;
        this.currentRegion = initialCfg.internalCode;
        this.currentUf = initialCfg.uf;
        this.activeViewTab = 'vias'; // 'vias' ou 'incidentes'

        this.isLoading = false;
        this.lastFetchTime = null;
        this.autoRefreshTimer = null;
        this.REFRESH_INTERVAL_MS = 60000; // 60 segundos
        this.fetchToken = 0;
        this.lastRunningToken = null;
    }

    _normalizeRegion(raw) {
        return resolveRegionalConfig(raw).internalCode;
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

        // Configura eventos da barra de filtros, KPIs interativos e abas de visão
        this._bindFilterEvents();
        this._bindKpiEvents();
        this._updateCorridorFilterOptions(this.currentRegion);

        // Se a aba já estiver ativa no DOM, inicializa o mapa
        const tabPane = document.getElementById('tab-traffic-alert');
        if (tabPane && tabPane.classList.contains('active')) {
            this.onTabActivated();
        }
    }

    /**
     * Alterna a Regional Ativa (RJ, SP, BH, BSB, REC) e sincroniza todo o módulo.
     * Cancela requisições anteriores via token e elimina qualquer texto residual.
     */
    setRegional(rawReg) {
        const cfg = resolveRegionalConfig(rawReg);
        this.currentRegionalConfig = cfg;
        this.currentRegion = cfg.internalCode;
        this.currentUf = cfg.uf;
        this.fetchToken++;
        const currentToken = this.fetchToken;
        this.isLoading = false; // Desbloqueia concorrência para a nova regional

        console.info(`[RIT ALERTA VIEW] Alternando inteligência para regional: ${cfg.praca} (${cfg.uf}) [Token #${currentToken}]`);

        // 1. Limpa dados em memória e camadas do mapa para evitar dados residuais
        this.rawIncidents = [];
        this.filteredIncidents = [];
        this.trafficConditionsData = [];
        this.corridorKpis = {};
        this.camerasData = [];
        this.weatherAlertsData = null;

        if (this.map) {
            if (this.map.corridorLayer) this.map.corridorLayer.clearLayers();
            if (this.map.cameraLayer) this.map.cameraLayer.clearLayers();
            if (this.map.incidentLayer) this.map.incidentLayer.clearLayers();
            this.map.setRegionalCenter(cfg.internalCode);
        }

        // 2. Atualiza imediatamente labels e rodapés eliminando qualquer texto residual da regional anterior
        const subRegionBadge = document.getElementById('ta-sub-regional-badge');
        if (subRegionBadge) {
            subRegionBadge.textContent = `📍 PRAÇA: ${cfg.praca} (${cfg.uf})`;
        }

        const mapMalhaLabel = document.getElementById('ta-map-malha-label');
        if (mapMalhaLabel) {
            mapMalhaLabel.textContent = `| MALHA URBANA ${cfg.praca}`;
        }

        const mobFoot = document.getElementById('ta-kpi-mobilidade-foot');
        if (mobFoot) mobFoot.textContent = `Aguardando cálculo (${cfg.uf})`;

        const ativasFoot = document.getElementById('ta-kpi-ativas-foot');
        if (ativasFoot) ativasFoot.textContent = `Monitoradas em ${cfg.uf}`;

        const camsFoot = document.getElementById('ta-kpi-cams-foot');
        if (camsFoot) camsFoot.textContent = `Rede Pública ${cfg.uf}`;

        const critFoot = document.getElementById('ta-kpi-crit-foot');
        if (critFoot) critFoot.textContent = `Verificando alertas...`;

        const viasFoot = document.getElementById('ta-kpi-vias-foot');
        if (viasFoot) viasFoot.textContent = `Monitorando corredores...`;

        const fontesFoot = document.getElementById('ta-kpi-fontes-foot');
        if (fontesFoot) fontesFoot.textContent = `${cfg.fontes}`;

        const weatherText = document.getElementById('ta-weather-text');
        if (weatherText) weatherText.textContent = `Monitoramento integrado de mobilidade urbana e alertas meteorológicos (${cfg.fontes}).`;

        // 3. Atualiza dropdown de corredores da regional
        this._updateCorridorFilterOptions(cfg.internalCode);

        // 4. Renderiza tabela com estado de carregamento imediato
        this._renderCorridorsTable();

        // 5. Dispara busca de dados vinculada ao token atual
        this.fetchData({ token: currentToken });
    }

    /**
     * Atualiza as opções do dropdown de corredores para a regional ativa.
     */
    _updateCorridorFilterOptions(region) {
        const select = document.getElementById('ta-filter-corridor');
        if (!select) return;

        const REGIONAL_CORRIDORS_LIST = {
            'RJ': [
                { id: 'Av Brasil', label: 'Av. Brasil' },
                { id: 'Presidente Dutra', label: 'Presidente Dutra' },
                { id: 'Linha Vermelha', label: 'Linha Vermelha' },
                { id: 'Linha Amarela', label: 'Linha Amarela' },
                { id: 'Transolímpica', label: 'Transolímpica' },
                { id: 'Centro', label: 'Centro (Pres. Vargas)' },
                { id: 'Barra da Tijuca', label: 'Barra da Tijuca' },
                { id: 'Zona Sul', label: 'Zona Sul (Aterro / Rebouças)' },
                { id: 'Ponte Rio-Niterói', label: 'Ponte Rio-Niterói' }
            ],
            'SP': [
                { id: 'Marginal Tietê', label: 'Marginal Tietê' },
                { id: 'Marginal Pinheiros', label: 'Marginal Pinheiros' },
                { id: 'Radial Leste', label: 'Radial Leste' },
                { id: 'Av dos Bandeirantes', label: 'Av. dos Bandeirantes' },
                { id: 'Rodovia Anchieta', label: 'Rodovia Anchieta' },
                { id: 'Rodovia Imigrantes', label: 'Rodovia Imigrantes' },
                { id: 'Castelo Branco', label: 'Rodovia Castelo Branco' },
                { id: 'Raposo Tavares', label: 'Rodovia Raposo Tavares' },
                { id: 'Ayrton Senna', label: 'Rodovia Ayrton Senna' }
            ],
            'BH': [
                { id: 'Av Cristiano Machado', label: 'Av. Cristiano Machado' },
                { id: 'Anel Rodoviário', label: 'Anel Rodoviário' },
                { id: 'Av Antônio Carlos', label: 'Av. Antônio Carlos' },
                { id: 'Av Amazonas', label: 'Av. Amazonas' },
                { id: 'Via Expressa', label: 'Via Expressa' },
                { id: 'BR-040', label: 'BR-040' },
                { id: 'BR-381', label: 'BR-381' },
                { id: 'Centro', label: 'Centro' },
                { id: 'Pampulha', label: 'Pampulha' }
            ],
            'BSB': [
                { id: 'EPIA', label: 'EPIA' },
                { id: 'Eixo Monumental', label: 'Eixo Monumental' },
                { id: 'Eixão Sul', label: 'Eixão Sul' },
                { id: 'Eixão Norte', label: 'Eixão Norte' },
                { id: 'EPIG', label: 'EPIG' },
                { id: 'EPDB', label: 'EPDB' },
                { id: 'Ponte JK', label: 'Ponte JK' },
                { id: 'Estrada Parque Taguatinga', label: 'EPTG (Taguatinga)' },
                { id: 'BR-060', label: 'BR-060' }
            ],
            'REC': [
                { id: 'Av Agamenon Magalhães', label: 'Av. Agamenon Magalhães' },
                { id: 'Av Boa Viagem', label: 'Av. Boa Viagem' },
                { id: 'BR-101', label: 'BR-101' },
                { id: 'BR-232', label: 'BR-232' },
                { id: 'Via Mangue', label: 'Via Mangue' },
                { id: 'PE-015', label: 'PE-015' },
                { id: 'Centro Recife', label: 'Centro Recife' },
                { id: 'Olinda', label: 'Olinda' },
                { id: 'Jaboatão', label: 'Jaboatão' }
            ]
        };

        const list = REGIONAL_CORRIDORS_LIST[region] || REGIONAL_CORRIDORS_LIST.RJ;
        const optionsHtml = [
            '<option value="todos">Todos os 9 Corredores e Regiões</option>',
            ...list.map(c => `<option value="${c.id.toLowerCase()}">${c.label}</option>`)
        ].join('');

        select.innerHTML = optionsHtml;
    }

    /**
     * Disparado quando a aba RIT ALERTA é aberta no painel.
     */
    onTabActivated() {
        console.info('[RIT ALERTA] Aba ativada. Ajustando mapa e sincronizando dados...');
        const savedRegional = this._normalizeRegion(localStorage.getItem('rit_selected_regional') || 'RJ');
        if (savedRegional !== this.currentRegion) {
            this.setRegional(savedRegional);
            return;
        }

        if (!this.map.isInitialized) {
            this.map.init();
            this.map.setRegionalCenter(this.currentRegion);
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
     * Protegido contra race conditions por token sequencial.
     */
    async fetchData({ token = this.fetchToken, silent = false } = {}) {
        if (this.isLoading && token === this.lastRunningToken) return;
        this.isLoading = true;
        this.lastRunningToken = token;

        if (!silent) {
            this._setLoadingState(true);
        }

        try {
            // Chamadas em paralelo para health, incidents, traffic-conditions, weather-alerts e cameras
            const [healthRes, incidentsRes, trafficRes, weatherRes, camerasRes] = await Promise.allSettled([
                this.service.getHealth(),
                this.service.getIncidents({ region: this.currentRegion }),
                this.service.getTrafficConditions({ region: this.currentRegion }),
                this.service.getWeatherAlerts({ region: this.currentRegion }),
                this.service.getCameras({ region: this.currentRegion })
            ]);

            this.isLoading = false;
            this._setLoadingState(false);

            // Se o token mudou durante a requisição assíncrona, descarta para evitar race condition
            if (token !== this.fetchToken) {
                console.info(`[RIT ALERTA] Descartando resposta assíncrona de token antigo (${token} vs atual ${this.fetchToken})`);
                return;
            }

            const hRes = healthRes.status === 'fulfilled' ? healthRes.value : { ok: false };
            const iRes = incidentsRes.status === 'fulfilled' ? incidentsRes.value : { ok: false, data: [] };
            const tRes = trafficRes.status === 'fulfilled' ? trafficRes.value : { ok: false, corridors: [], kpis: {} };
            const wData = weatherRes.status === 'fulfilled' ? weatherRes.value : null;
            const cData = camerasRes.status === 'fulfilled' ? camerasRes.value : null;

            this.lastFetchTime = Date.now();
            this.healthData = hRes;

            if (!iRes.ok && !hRes.ok && !tRes.ok) {
                // Estado de degradação total / fontes indisponíveis
                this._renderFailureState(iRes.error || hRes.error || tRes.error, iRes.lastValidTimestamp);
                return;
            }

            this.rawIncidents = iRes.data || [];
            this.trafficConditionsData = tRes.corridors || [];
            this.corridorKpis = tRes.kpis || {};
            this.camerasData = cData?.data || [];
            this.weatherAlertsData = wData;

            this._updateHealthStatus(hRes);
            this._renderWeatherAlerts(wData);
            this._renderKPIs();
            this._renderCorridorsTable();
            this.applyFilters();

            // Atualiza traçado dos 9 corredores no mapa tático
            if (this.trafficConditionsData.length > 0) {
                this.map.renderTrafficConditions(this.trafficConditionsData);
            }

            // Plota câmeras da regional no mapa
            if (this.camerasData.length > 0) {
                this.map.renderNearbyCameras(this.camerasData);
            }
        } catch (err) {
            this.isLoading = false;
            this._setLoadingState(false);
            console.error('[RIT ALERTA] Erro na requisição de dados:', err);
            this._renderFailureState(err.message, this.service.lastValidTimestamp);
        }
    }

    /**
     * Renderiza o banner superior de alertas meteorológicos e estágio operacional.
     */
    _renderWeatherAlerts(weatherData) {
        if (!weatherData) return;
        const banner = document.getElementById('ta-weather-alert-banner');
        const badge = document.getElementById('ta-weather-stage-badge');
        const text = document.getElementById('ta-weather-text');
        const rain = document.getElementById('ta-weather-rain');
        const wind = document.getElementById('ta-weather-wind');
        const flood = document.getElementById('ta-weather-flood');

        if (banner) banner.style.display = 'flex';

        if (badge && weatherData.operationalStage) {
            badge.textContent = weatherData.operationalStage.label || 'ESTÁGIO 1';
            badge.style.background = (weatherData.operationalStage.stage >= 3) ? '#ef4444' : ((weatherData.operationalStage.stage === 2) ? '#f59e0b' : '#0284c7');
        }

        if (text && weatherData.operationalStage) {
            text.textContent = weatherData.operationalStage.description || 'Condições meteorológicas monitoradas.';
        }

        if (rain && weatherData.rainAlert) {
            rain.textContent = weatherData.rainAlert.summary || 'Sem Alerta Severo';
            rain.style.color = weatherData.rainAlert.severity === 'ALTO' ? '#ef4444' : '#38bdf8';
        }

        if (wind && weatherData.windAlert) {
            wind.textContent = weatherData.windAlert.summary || 'Normal';
        }

        if (flood && weatherData.flooding) {
            const cnt = weatherData.flooding.activeFloodsCount || 0;
            flood.textContent = `${cnt} Ponto(s)`;
            flood.style.color = cnt > 0 ? '#ef4444' : '#10b981';
        }
    }

    /**
     * Configura ouvintes dos filtros do feed e alternância de visão (Vias / Feed).
     */
    _bindFilterEvents() {
        const corridorSelect = document.getElementById('ta-filter-corridor');
        const severitySelect = document.getElementById('ta-filter-severity');
        const searchInput = document.getElementById('ta-filter-search');
        const refreshBtn = document.getElementById('ta-btn-refresh');

        const btnTabVias = document.getElementById('ta-tab-btn-vias');
        const btnTabFeed = document.getElementById('ta-tab-btn-feed');
        const viasPane = document.getElementById('ta-vias-view-panel');
        const feedPane = document.getElementById('ta-feed-view-panel');

        if (btnTabVias && btnTabFeed) {
            btnTabVias.addEventListener('click', () => {
                this.activeViewTab = 'vias';
                btnTabVias.classList.add('active');
                btnTabFeed.classList.remove('active');
                if (viasPane) viasPane.style.display = 'flex';
                if (feedPane) feedPane.style.display = 'none';
            });

            btnTabFeed.addEventListener('click', () => {
                this.activeViewTab = 'feed';
                btnTabFeed.classList.add('active');
                btnTabVias.classList.remove('active');
                if (viasPane) viasPane.style.display = 'none';
                if (feedPane) feedPane.style.display = 'flex';
            });
        }

        if (corridorSelect) corridorSelect.addEventListener('change', () => this.applyFilters());
        if (severitySelect) severitySelect.addEventListener('change', () => this.applyFilters());
        if (searchInput) searchInput.addEventListener('input', () => this.applyFilters());
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.fetchData());
    }

    /**
     * Configura interatividade, acessibilidade por teclado e abertura de drill-down nos 7 cards executivos de KPI.
     */
    _bindKpiEvents() {
        const kpiMapping = [
            { id: 'ta-kpi-card-mobilidade', type: 'mobilidade' },
            { id: 'ta-kpi-card-retencao', type: 'retencao' },
            { id: 'ta-kpi-card-ativas', type: 'ativas' },
            { id: 'ta-kpi-card-crit', type: 'criticos' },
            { id: 'ta-kpi-card-vias', type: 'vias' },
            { id: 'ta-kpi-card-cams', type: 'cameras' },
            { id: 'ta-kpi-fontes-card', type: 'fontes' }
        ];

        const openKpiDrillDown = (cardEl, type) => {
            if (!this.drawer) return;
            const data = {
                region: this.currentRegion,
                regionalConfig: this.currentRegionalConfig || resolveRegionalConfig(this.currentRegion),
                corridors: this.trafficConditionsData,
                kpis: this.corridorKpis,
                incidents: this.rawIncidents,
                cameras: this.camerasData,
                health: this.healthData
            };
            this.drawer.openKpiDetail(type, data, cardEl);
        };

        kpiMapping.forEach(({ id, type }) => {
            const cardEl = document.getElementById(id);
            if (!cardEl) return;

            // Suporte a Clique
            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                openKpiDrillDown(cardEl, type);
            });

            // Suporte a Teclado (Enter ou Espaço para acessibilidade WCAG)
            cardEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    openKpiDrillDown(cardEl, type);
                }
            });
        });

        // Barra de filtro secundária de ocorrências
        const filterClear = document.getElementById('ta-kpi-filter-clear');
        if (filterClear) {
            filterClear.addEventListener('click', () => {
                const filterBar = document.getElementById('ta-kpi-filter-bar');
                if (filterBar) filterBar.style.display = 'none';
                const sev = document.getElementById('ta-filter-severity');
                const cor = document.getElementById('ta-filter-corridor');
                const src = document.getElementById('ta-filter-search');
                if (sev) sev.value = 'TODAS';
                if (cor) cor.value = 'todos';
                if (src) src.value = '';
                this.applyFilters();
                if (this.map && this.map.map) {
                    this.map.fitBoundsToVisible();
                }
            });
        }
    }

    /**
     * Renderiza o Painel Lateral Esquerdo: STATUS DAS VIAS MONITORADAS (9 Corredores).
     */
    _renderCorridorsTable() {
        const tableContainer = document.getElementById('ta-corridors-table-body');
        const badgeCount = document.getElementById('ta-vias-count-badge');
        const regionalTitle = document.getElementById('ta-vias-regional-label');
        if (!tableContainer) return;

        const corridors = this.trafficConditionsData || [];
        if (badgeCount) badgeCount.textContent = `${corridors.length} VIAS`;
        const cfg = this.currentRegionalConfig || resolveRegionalConfig(this.currentRegion);
        if (regionalTitle) regionalTitle.textContent = `STATUS DAS VIAS MONITORADAS — ${cfg.praca}`;

        if (corridors.length === 0) {
            tableContainer.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:18px; color:var(--ta-muted);">
                        Carregando malha viária de ${cfg.praca}...
                    </td>
                </tr>
            `;
            return;
        }

        const getStatusBadge = (status) => {
            const s = String(status || 'Normal').toLowerCase();
            if (s.includes('bloqueio')) {
                return '<span class="ta-badge ta-badge-block">⚫ Bloqueio</span>';
            }
            if (s.includes('crítico') || s.includes('critico') || s.includes('congestion')) {
                return '<span class="ta-badge ta-badge-bad">🔴 Crítico</span>';
            }
            if (s.includes('lento')) {
                return '<span class="ta-badge ta-badge-orange">🟡 Lento</span>';
            }
            if (s.includes('moderado')) {
                return '<span class="ta-badge ta-badge-warn">🟡 Moderado</span>';
            }
            return '<span class="ta-badge ta-badge-good">🟢 Normal</span>';
        };

        const getTrendIcon = (trend) => {
            const t = String(trend || '').toUpperCase();
            if (t === 'AGRAVANDO') return '<span style="color:#ef4444; font-weight:800;" title="Tendência: Agravando">↗️</span>';
            if (t === 'MELHORANDO') return '<span style="color:#10b981; font-weight:800;" title="Tendência: Melhorando">↘️</span>';
            return '<span style="color:#94a3b8; font-weight:800;" title="Tendência: Estável">➡️</span>';
        };

        const rowsHtml = corridors.map(item => {
            const diffText = item.diferenca || (item.retencaoMin ? `+${item.retencaoMin} min` : '0 min');
            const isZero = !item.retencaoMin || item.retencaoMin === 0;
            const diffColor = isZero ? 'var(--ta-good)' : (item.retencaoMin >= 20 ? 'var(--ta-bad)' : 'var(--ta-warning)');
            const speedText = item.velocidadeAtualKmH ? `${item.velocidadeAtualKmH} km/h` : '--';
            const ocorrencia = item.ocorrenciaAtiva || 'Fluxo livre';

            return `
                <tr class="ta-corridor-row" data-via="${this._escapeHtml(item.via)}" style="cursor:pointer;" title="Clique para focar ${this._escapeHtml(item.via)} no mapa">
                    <td class="ta-col-via">
                        <div style="font-weight:700; color:#fff; font-size:11px;">${this._escapeHtml(item.via)}</div>
                        <div style="font-size:9px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px;">${this._escapeHtml(item.trechoCritico || '')}</div>
                    </td>
                    <td class="ta-col-status">${getStatusBadge(item.status)}</td>
                    <td class="ta-col-retencao" style="font-family:var(--ta-mono); font-weight:700; color:${diffColor}; text-align:center;">
                        ${this._escapeHtml(diffText)}
                    </td>
                    <td class="ta-col-vel" style="font-family:var(--ta-mono); font-size:10px; color:#cbd5e1; text-align:center;">
                        ${speedText}
                    </td>
                    <td class="ta-col-ocorrencia">
                        <div style="font-size:10px; color:#94a3b8; max-width:110px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${this._escapeHtml(ocorrencia)}">
                            ${this._escapeHtml(ocorrencia)}
                        </div>
                    </td>
                    <td class="ta-col-trend" style="text-align:center;">
                        ${getTrendIcon(item.tendencia)}
                    </td>
                    <td class="ta-col-action" style="text-align:center;">
                        <button class="ta-btn-focus-via" data-via="${this._escapeHtml(item.via)}" title="Centralizar e destacar ${this._escapeHtml(item.via)}" style="background:transparent; border:none; color:var(--ta-cyan); cursor:pointer; font-size:11px;">
                            🎯
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tableContainer.innerHTML = rowsHtml;

        // Adiciona listeners para clique na linha ou botão de foco
        tableContainer.querySelectorAll('.ta-corridor-row').forEach(row => {
            row.addEventListener('click', () => {
                const via = row.getAttribute('data-via');
                if (via && this.map) {
                    this.map.focusCorridor(via);
                }
            });
        });

        tableContainer.querySelectorAll('.ta-btn-focus-via').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const via = btn.getAttribute('data-via');
                if (via && this.map) {
                    this.map.focusCorridor(via);
                }
            });
        });
    }

    /**
     * Atualiza os cards executivos de KPI no topo com inteligência de mobilidade regional.
     */
    _renderKPIs() {
        const cfg = this.currentRegionalConfig || resolveRegionalConfig(this.currentRegion);
        const mobEl = document.getElementById('ta-kpi-mobilidade-num');
        const mobFoot = document.getElementById('ta-kpi-mobilidade-foot');
        const retEl = document.getElementById('ta-kpi-retencao-num');
        const retFoot = document.getElementById('ta-kpi-retencao-foot');
        const ativasEl = document.getElementById('ta-kpi-ativas-num');
        const ativasFoot = document.getElementById('ta-kpi-ativas-foot');
        const critEl = document.getElementById('ta-kpi-crit-num');
        const critFoot = document.getElementById('ta-kpi-crit-foot');
        const viasEl = document.getElementById('ta-kpi-vias-num');
        const viasFoot = document.getElementById('ta-kpi-vias-foot');
        const camsEl = document.getElementById('ta-kpi-cams-num');
        const camsFoot = document.getElementById('ta-kpi-cams-foot');

        const kpis = this.corridorKpis || {};
        const totalAtivas = this.rawIncidents.length;
        const criticas = this.rawIncidents.filter(i => {
            const s = (i.severity || i.severidade || '').toUpperCase();
            return s === 'CRÍTICO' || s === 'ALTO';
        });

        // 1. Índice de Mobilidade (0 a 100)
        const mobVal = kpis.mobilidadeIndex ?? 82;
        if (mobEl) {
            mobEl.textContent = `${mobVal}/100`;
            mobEl.style.color = mobVal >= 75 ? 'var(--ta-good)' : (mobVal >= 50 ? 'var(--ta-warning)' : 'var(--ta-bad)');
        }
        if (mobFoot) {
            const mobLabel = mobVal >= 80 ? '🟢 Fluxo Regular' : (mobVal >= 55 ? '🟡 Lentidão Moderada' : '🔴 Malha Sobrecarregada');
            mobFoot.textContent = `${mobLabel} (${cfg.uf})`;
        }

        // 2. Tempo Médio de Retenção
        const retVal = kpis.tempoMedioRetencao ?? 0;
        if (retEl) {
            retEl.textContent = retVal > 0 ? `+${retVal} min` : '0 min';
            retEl.style.color = retVal >= 20 ? 'var(--ta-bad)' : (retVal >= 10 ? 'var(--ta-warning)' : 'var(--ta-good)');
        }
        if (retFoot) {
            const impacto = kpis.impactoOperacional || (retVal >= 20 ? 'CRÍTICO' : (retVal >= 10 ? 'MODERADO' : 'BAIXO'));
            retFoot.textContent = `Impacto Operacional: ${impacto}`;
        }

        // 3. Ocorrências Ativas
        if (ativasEl) ativasEl.textContent = String(totalAtivas);
        if (ativasFoot) ativasFoot.textContent = totalAtivas > 0 ? `Monitoradas em ${cfg.uf}` : 'Nenhuma no momento';

        // 4. Incidentes Críticos e Bloqueios
        const critVal = kpis.corredoresCriticos ?? criticas.length;
        if (critEl) critEl.textContent = String(critVal);
        if (critFoot) {
            critFoot.textContent = critVal > 0 ? (criticas[0]?.corridor || `${critVal} via(s) em alerta`) : 'Nenhum bloqueio severo';
            critFoot.style.color = critVal > 0 ? 'var(--ta-bad)' : 'var(--ta-good)';
        }

        // 5. Vias Afetadas / Corredores
        const afetadasVal = kpis.viasAfetadas ?? (this.trafficConditionsData.filter(c => (c.retencaoMin || 0) > 0).length);
        if (viasEl) viasEl.textContent = `${afetadasVal}/9`;
        if (viasFoot) viasFoot.textContent = `${afetadasVal} eixos com retenção`;

        // 6. Câmeras Públicas
        const cams = this.camerasData || [];
        const totalCams = cams.length > 0 ? cams.length : 12;
        const onlineCams = cams.length > 0 ? cams.filter(c => c.status === 'ONLINE' || c.status === 'DISPONÍVEL').length : totalCams;
        if (camsEl) camsEl.textContent = `${onlineCams}/${totalCams}`;
        if (camsFoot) camsFoot.textContent = `Rede Pública ${cfg.uf}`;
    }

    /**
     * Atualiza o indicador de saúde das fontes.
     */
    _updateHealthStatus(healthRes) {
        const healthBadge = document.getElementById('ta-sub-health-status');
        const lastSyncEl = document.getElementById('ta-sub-last-sync');
        const fontesCardNum = document.getElementById('ta-kpi-fontes-num');
        const fontesCardFoot = document.getElementById('ta-kpi-fontes-foot');
        const cfg = this.currentRegionalConfig || resolveRegionalConfig(this.currentRegion);

        if (lastSyncEl) {
            const nowStr = new Date().toLocaleTimeString('pt-BR');
            lastSyncEl.textContent = `ÚLTIMO SYNC: ${nowStr}`;
        }

        if (healthRes.ok) {
            if (healthBadge) healthBadge.innerHTML = '<span class="ta-dot ta-dot-good"></span> FONTES SAUDÁVEIS (ONLINE)';
            if (fontesCardNum) fontesCardNum.textContent = '100%';
            if (fontesCardFoot) fontesCardFoot.textContent = `${cfg.fontes} OK`;
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
