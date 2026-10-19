/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Controlador de Interface da Aba RIT FLY (v1.1)
 * Gerencia Radar, Drawer de Voo, Voos do Dia por Aeroporto,
 * Filtros de Companhia, Seletor de Camadas e Tutorial Onboarding
 */

import { RitFlyService } from './rit-fly-service.js';
import { RitFlyMap } from './rit-fly-map.js';

export class RitFlyView {
    constructor() {
        this.service = new RitFlyService();
        this.map = new RitFlyMap('mapRitFly');
        this.currentFilter = 'todos';
        this.currentAirline = 'todas';
        this.searchQuery = '';
        this.pollTimer = null;
        this.pollIntervalMs = 30000; // 30 segundos
        this.freshnessTimer = null;
        this.lastSyncTimestamp = Date.now();

        // Dados em memória para alta performance
        this.allFlights = [];
        this.allAirports = [];
        this.allTrips = [];
        this.allAlerts = [];
        this.occurrenceFilter = 'TODAS';
        this.selectedFlight = null;

        // Estado do Painel "Voos do Dia por Aeroporto" (Melhoria 06)
        this.selectedAirportIata = null;
        this.activeAirportDetails = null;
        this.activeBoardTab = 'partidas';
        this.activeTimeSlice = 'hoje';
        this.boardSearchQuery = '';

        // Estado do Tutorial (Melhoria 01)
        this.tutorialCurrentStep = 0;
        this.tutorialSteps = [
            {
                icon: '✈️',
                title: '1. Monitoramento de Voos em Tempo Real',
                desc: 'Radar aéreo com rastreamento ADS-B contínuo de aeronaves comerciais, jatos executivos e helicópteros em rota no espaço aéreo brasileiro, com rotação de proa e altitude.'
            },
            {
                icon: '🏢',
                title: '2. Acompanhamento de Aeroportos',
                desc: 'Visão operacional dos 8 principais hubs estratégicos (SDU, GIG, CGH, GRU, BSB, CNF, SSA e REC) com meteorologia METAR ao vivo e regras de voo (VFR/IFR).'
            },
            {
                icon: '⏱️',
                title: '3. Previsão Operacional',
                desc: 'Cálculo contínuo de ETA (Estimativa de Pouso) e detecção antecipada de atrasos na malha para reprogramar deslocamentos antes da decolagem.'
            },
            {
                icon: '🚗',
                title: '4. Integração Voo + Transporte Terrestre',
                desc: 'Vinculação inteligente entre voo e transfer/van executiva. O horário de saída do motorista ajusta-se automaticamente caso o voo atrase.'
            },
            {
                icon: '⚠️',
                title: '5. Alertas Automáticos',
                desc: 'Notificações táticas sobre atrasos severos, desvios e condições meteorológicas adversas para produção, jornalismo e operações especiais.'
            },
            {
                icon: '🤖',
                title: '6. RIT Fly AI',
                desc: 'Assistente virtual especializado em inteligência aeronáutica corporativa. Pergunte livremente ou use consultas táticas em 1 clique.'
            },
            {
                icon: '🔄',
                title: '7. Sincronização de Chegada e Embarque',
                desc: 'Elimina tempo ocioso de vans, motoristas e diárias de estacionamento através de reprogramação em tempo real, gerando economia comprovada.'
            }
        ];
    }

    init() {
        this.map.init();

        // Conecta callbacks de seleção do mapa ao controlador da view
        this.map.onFlightSelectCallback = (f) => this.abrirDrawerVoo(f);
        this.map.onAirportSelectCallback = (a) => this.abrirVoosAeroporto(a.iata);

        this.bindEvents();
        this.initTutorialEvents();
        this.fetchData();
        this.startAutoRefresh();
        this.startFreshnessTicker();
    }

    bindEvents() {
        // 1. Switch de Abas do Painel Lateral
        const tabBtns = document.querySelectorAll('.fly-nav-tab');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const targetPaneId = btn.getAttribute('data-fly-tab');
                document.querySelectorAll('.fly-inner-panel').forEach(p => p.classList.remove('active'));
                const target = document.getElementById(targetPaneId);
                if (target) target.classList.add('active');
            });
        });

        // 2. Filtros de Categoria de Aeronave (sincronizados com barra unificada)
        const catPills = document.querySelectorAll('.fly-cat-pill');
        catPills.forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('.fly-cat-pill, .fly-airline-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                const catVal = pill.getAttribute('data-cat') || 'todos';
                const airlineVal = pill.getAttribute('data-airline');
                this.currentFilter = catVal;
                this.currentAirline = airlineVal || (catVal === 'todos' ? 'todas' : catVal.toUpperCase());
                this.aplicarFiltrosVoos();
            });
        });

        // 3. Filtros de Companhia Aérea e Categoria Unificados (Melhoria 07)
        const airlinePills = document.querySelectorAll('.fly-airline-pill');
        airlinePills.forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('.fly-airline-pill, .fly-cat-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.currentAirline = pill.getAttribute('data-airline') || 'todas';
                this.currentFilter = pill.getAttribute('data-cat') || 'todos';
                this.aplicarFiltrosVoos();
            });
        });

        // 4. Seletor de Camadas de Mapa (Melhoria 02 & Fase 6)
        const layerSelect = document.getElementById('fly-select-map-layer');
        if (layerSelect) {
            layerSelect.addEventListener('change', (e) => {
                const layerKey = e.target.value;
                if (layerKey === 'transito') {
                    alert('Camada de trânsito indisponível: provedor não configurado.');
                    layerSelect.value = this.map.currentBaseLayerKey || 'radar';
                    return;
                }
                this.map.setBaseLayer(layerKey);
            });
        }

        // Fechar Drawer com tecla Esc (Fase 10)
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.fecharDrawerVoo();
            }
        });

        // 5. Campo de Busca Superior
        const searchInput = document.getElementById('fly-search-input');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.searchQuery = e.target.value.trim();
                    this.aplicarFiltrosVoos();
                }, 200);
            });
        }

        // 6. Botões de Centralização de Mapa
        const btnCenterBrasil = document.getElementById('fly-btn-center-br');
        if (btnCenterBrasil) {
            btnCenterBrasil.addEventListener('click', () => this.map.centerBrazil());
        }

        const btnCenterPonte = document.getElementById('fly-btn-center-ponte');
        if (btnCenterPonte) {
            btnCenterPonte.addEventListener('click', () => this.map.centerPonteAerea());
        }

        // 7. Botão de Atualização Manual
        const btnRefresh = document.getElementById('fly-btn-refresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                this.fetchData();
            });
        }

        // 8. Drawer de Detalhes do Voo (Melhoria 05)
        const drawerCloseBtn = document.getElementById('fly-drawer-close');
        if (drawerCloseBtn) {
            drawerCloseBtn.addEventListener('click', () => this.fecharDrawerVoo());
        }

        const drawerBtnAi = document.getElementById('fly-drawer-btn-ai');
        if (drawerBtnAi) {
            drawerBtnAi.addEventListener('click', () => {
                if (this.selectedFlight) {
                    this.perguntarVooAI(this.selectedFlight.numeroVoo);
                    this.fecharDrawerVoo();
                }
            });
        }

        const drawerBtnTrip = document.getElementById('fly-drawer-btn-trip');
        if (drawerBtnTrip) {
            drawerBtnTrip.addEventListener('click', () => {
                if (this.selectedFlight) {
                    this.preencherFormularioViagem(
                        this.selectedFlight.numeroVoo,
                        this.selectedFlight.origem || 'SDU',
                        this.selectedFlight.destino || 'CGH'
                    );
                    this.fecharDrawerVoo();
                }
            });
        }

        // 9. Alternador da Legenda do Mapa (Melhoria 10)
        const toggleLegendBtn = document.getElementById('fly-btn-toggle-legend');
        const legendBody = document.getElementById('fly-legend-body');
        if (toggleLegendBtn && legendBody) {
            toggleLegendBtn.addEventListener('click', () => {
                if (legendBody.style.display === 'none') {
                    legendBody.style.display = 'block';
                    toggleLegendBtn.textContent = '▼';
                } else {
                    legendBody.style.display = 'none';
                    toggleLegendBtn.textContent = '▲';
                }
            });
        }

        // 10. Painel "Voos do Dia por Aeroporto" (Melhoria 06)
        const btnBackAirports = document.getElementById('fly-btn-back-airports');
        if (btnBackAirports) {
            btnBackAirports.addEventListener('click', () => this.voltarParaVisaoGeralAeroportos());
        }

        const boardTabs = document.querySelectorAll('.fly-board-tab');
        boardTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                boardTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.activeBoardTab = tab.getAttribute('data-board-tab') || 'partidas';
                this.renderizarVoosDoQuadroAeroporto();
            });
        });

        const timeSliceBtns = document.querySelectorAll('.fly-time-slice-btn');
        timeSliceBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                timeSliceBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeTimeSlice = btn.getAttribute('data-slice') || 'hoje';
                this.renderizarVoosDoQuadroAeroporto();
            });
        });

        const boardSearch = document.getElementById('fly-board-search-input');
        if (boardSearch) {
            boardSearch.addEventListener('input', (e) => {
                this.boardSearchQuery = e.target.value.trim().toUpperCase();
                this.renderizarVoosDoQuadroAeroporto();
            });
        }

        // 11. Chat RIT FLY AI - Envio de Mensagem (Melhoria 08)
        const aiForm = document.getElementById('fly-ai-form');
        const aiInput = document.getElementById('fly-ai-input');
        if (aiForm && aiInput) {
            aiForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const q = aiInput.value.trim();
                if (q) {
                    this.sendAIMessage(q);
                    aiInput.value = '';
                }
            });

            aiInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    aiForm.dispatchEvent(new Event('submit'));
                }
            });
        }

        // 12. Perguntas Prontas em 1-Clique na IA
        const presetBtns = document.querySelectorAll('.fly-preset-btn');
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.getAttribute('data-query');
                if (question) {
                    this.sendAIMessage(question);
                }
            });
        });

        // 13. Formulário de Viagens Integradas
        const tripForm = document.getElementById('fly-trip-form');
        if (tripForm) {
            tripForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleTripFormSubmit();
            });
        }

        // 14. Painel de Ocorrências Consolidadas (Atalhos e Filtros por Categoria)
        const btnOpenAllOcc = document.getElementById('fly-btn-open-all-occurrences');
        if (btnOpenAllOcc) {
            btnOpenAllOcc.addEventListener('click', () => {
                this.abrirAbaOcorrencias('TODAS');
            });
        }

        const quickOccCards = document.querySelectorAll('.fly-occ-mini-card[data-occ-quick-filter]');
        quickOccCards.forEach(card => {
            card.addEventListener('click', () => {
                const cat = card.getAttribute('data-occ-quick-filter') || 'TODAS';
                this.abrirAbaOcorrencias(cat);
            });
        });

        const occFilterPills = document.querySelectorAll('.fly-occ-filter-pill[data-occ-filter]');
        occFilterPills.forEach(pill => {
            pill.addEventListener('click', () => {
                occFilterPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.occurrenceFilter = pill.getAttribute('data-occ-filter') || 'TODAS';
                this.renderConsolidatedOccurrences();
            });
        });
    }

    abrirAbaOcorrencias(filterCat = 'TODAS') {
        this.occurrenceFilter = filterCat || 'TODAS';
        const occFilterPills = document.querySelectorAll('.fly-occ-filter-pill[data-occ-filter]');
        occFilterPills.forEach(p => {
            p.classList.toggle('active', p.getAttribute('data-occ-filter') === this.occurrenceFilter);
        });

        const tabAlertsBtn = document.querySelector('.fly-nav-tab[data-fly-tab="fly-panel-alertas"]');
        if (tabAlertsBtn) tabAlertsBtn.click();
        this.renderConsolidatedOccurrences();
    }

    /* ========================================================================= */
    /* MELHORIA 01: TUTORIAL "COMO FUNCIONA O RIT FLY"                           */
    /* ========================================================================= */
    initTutorialEvents() {
        const modal = document.getElementById('modalRitFlyTutorial');
        const btnOpen = document.getElementById('fly-btn-tutorial');
        const btnClose = document.getElementById('fly-tutorial-btn-close');
        const btnConfirm = document.getElementById('fly-tutorial-btn-confirm');
        const chkDontShow = document.getElementById('fly-tutorial-dont-show');

        const btnModeCards = document.getElementById('fly-tutorial-mode-cards');
        const btnModeStepper = document.getElementById('fly-tutorial-mode-stepper');
        const viewGrid = document.getElementById('fly-tutorial-grid-view');
        const viewStepper = document.getElementById('fly-tutorial-stepper-view');

        const btnPrev = document.getElementById('fly-stepper-prev');
        const btnNext = document.getElementById('fly-stepper-next');

        if (btnOpen) {
            btnOpen.addEventListener('click', () => this.abrirTutorial());
        }

        const fechar = () => {
            if (modal) modal.classList.remove('active');
            if (chkDontShow && chkDontShow.checked) {
                localStorage.setItem('rit_fly_tutorial_seen', 'true');
            }
        };

        if (btnClose) btnClose.addEventListener('click', fechar);
        if (btnConfirm) btnConfirm.addEventListener('click', fechar);

        if (btnModeCards && btnModeStepper && viewGrid && viewStepper) {
            btnModeCards.addEventListener('click', () => {
                btnModeCards.style.background = 'rgba(56,189,248,0.2)';
                btnModeCards.style.borderColor = 'var(--fly-accent)';
                btnModeCards.style.color = 'var(--fly-accent)';

                btnModeStepper.style.background = 'rgba(255,255,255,0.08)';
                btnModeStepper.style.borderColor = 'rgba(255,255,255,0.15)';
                btnModeStepper.style.color = '#fff';

                viewGrid.style.display = 'grid';
                viewStepper.style.display = 'none';
            });

            btnModeStepper.addEventListener('click', () => {
                btnModeStepper.style.background = 'rgba(56,189,248,0.2)';
                btnModeStepper.style.borderColor = 'var(--fly-accent)';
                btnModeStepper.style.color = 'var(--fly-accent)';

                btnModeCards.style.background = 'rgba(255,255,255,0.08)';
                btnModeCards.style.borderColor = 'rgba(255,255,255,0.15)';
                btnModeCards.style.color = '#fff';

                viewGrid.style.display = 'none';
                viewStepper.style.display = 'flex';
                this.renderizarPassoTutorial(0);
            });
        }

        if (btnPrev && btnNext) {
            btnPrev.addEventListener('click', () => {
                if (this.tutorialCurrentStep > 0) {
                    this.renderizarPassoTutorial(this.tutorialCurrentStep - 1);
                }
            });

            btnNext.addEventListener('click', () => {
                if (this.tutorialCurrentStep < this.tutorialSteps.length - 1) {
                    this.renderizarPassoTutorial(this.tutorialCurrentStep + 1);
                } else {
                    fechar();
                }
            });
        }
    }

    abrirTutorial() {
        const modal = document.getElementById('modalRitFlyTutorial');
        if (modal) modal.classList.add('active');
    }

    renderizarPassoTutorial(stepIdx) {
        this.tutorialCurrentStep = stepIdx;
        const step = this.tutorialSteps[stepIdx];
        if (!step) return;

        const elIcon = document.getElementById('fly-stepper-icon');
        const elStep = document.getElementById('fly-stepper-step');
        const elTitle = document.getElementById('fly-stepper-title');
        const elDesc = document.getElementById('fly-stepper-desc');
        const btnPrev = document.getElementById('fly-stepper-prev');
        const btnNext = document.getElementById('fly-stepper-next');

        if (elIcon) elIcon.textContent = step.icon;
        if (elStep) elStep.textContent = `PASSO ${stepIdx + 1} DE ${this.tutorialSteps.length}`;
        if (elTitle) elTitle.textContent = step.title;
        if (elDesc) elDesc.textContent = step.desc;

        if (btnPrev) btnPrev.style.display = stepIdx === 0 ? 'none' : 'inline-block';
        if (btnNext) btnNext.textContent = stepIdx === this.tutorialSteps.length - 1 ? 'Concluir' : 'Próximo';
    }

    /* ========================================================================= */
    /* SINCRONIZAÇÃO E DADOS PRINCIPAIS                                          */
    /* ========================================================================= */
    async fetchData() {
        const airportsContainer = document.getElementById('fly-airports-list-container');
        if (airportsContainer && (!this.allAirports || this.allAirports.length === 0)) {
            airportsContainer.innerHTML = `
                <div class="fly-state-box fly-state-loading">
                    <span>⏳ Carregando informes operacionais, METAR e telemetria dos aeroportos...</span>
                </div>
            `;
        }

        try {
            const results = await Promise.allSettled([
                this.service.getFlights(),
                this.service.getKpis(),
                this.service.getAirports(),
                this.service.getTrips(),
                this.service.getAlerts()
            ]);

            const [flightsSet, kpisSet, airportsSet, tripsSet, alertsSet] = results;

            // 1. Aeronaves e Contadores
            if (flightsSet.status === 'fulfilled' && flightsSet.value) {
                const flightsRes = flightsSet.value;
                const rawList = Array.isArray(flightsRes.data)
                    ? flightsRes.data
                    : (Array.isArray(flightsRes.flights) ? flightsRes.flights : []);

                // Garante que contadores e markers usem exatamente o mesmo conjunto com coordenadas válidas
                const validFlights = rawList.filter(f =>
                    f && Number.isFinite(Number(f.latitude)) && Number.isFinite(Number(f.longitude))
                );

                this.allFlights = validFlights;
                this.popularFiltroCompanhias();
                this.aplicarFiltrosVoos();

                const badgeLiveText = document.getElementById('fly-live-badge-text');
                const badgeCount = document.getElementById('fly-count-badge');

                const isRateLimited = flightsRes.meta?.dataMode === 'RATE_LIMITED' || 
                                     flightsRes.providerStatus?.status === 'RATE_LIMITED' || 
                                     (flightsRes.error && flightsRes.error.code === 'FLIGHT_PROVIDER_UNAVAILABLE');

                if (isRateLimited && validFlights.length === 0) {
                    if (badgeLiveText) badgeLiveText.textContent = 'Provedor Rate-Limited (HTTP 429)';
                    if (badgeCount) badgeCount.textContent = 'ADS-B INDISPONÍVEL (429)';
                } else if (validFlights.length === 0) {
                    if (badgeLiveText) badgeLiveText.textContent = 'Dado temporariamente indisponível';
                    if (badgeCount) badgeCount.textContent = '0 AERONAVES (AGUARDANDO PROVEDOR)';
                }
            } else {
                const errReason = flightsSet.status === 'rejected' ? flightsSet.reason?.message : 'Resposta vazia';
                console.error('[RitFlyView] Falha ao adquirir voos da API:', errReason);
                const badgeLiveText = document.getElementById('fly-live-badge-text');
                const badgeCount = document.getElementById('fly-count-badge');
                if (this.allFlights.length === 0) {
                    this.popularFiltroCompanhias();
                    if (badgeLiveText) badgeLiveText.textContent = 'Fonte ADS-B indisponível';
                    if (badgeCount) badgeCount.textContent = 'FONTE INDISPONÍVEL';
                }
            }

            // 2. Aeroportos e Informes Operacionais
            if (airportsSet.status === 'fulfilled' && airportsSet.value && airportsSet.value.ok) {
                this.allAirports = Array.isArray(airportsSet.value.data) ? airportsSet.value.data : [];
                this.map.renderAirports(this.allAirports);
                this.renderAirportsList(this.allAirports);
            } else {
                const errReason = airportsSet.status === 'rejected'
                    ? (airportsSet.reason?.message || 'Erro de rede na consulta de aeroportos')
                    : (airportsSet.value?.error || 'Fonte de aeroportos indisponível');
                console.error('[RitFlyView] Falha ao carregar aeroportos/informes:', errReason);
                if (!this.allAirports || this.allAirports.length === 0) {
                    this.renderAirportsErrorState(errReason);
                }
            }

            // 3. KPIs
            if (kpisSet.status === 'fulfilled' && kpisSet.value && kpisSet.value.ok) {
                this.renderKpis(kpisSet.value.data);
            } else if (kpisSet.status === 'rejected') {
                console.warn('[RitFlyView] Falha ao carregar KPIs:', kpisSet.reason?.message);
            }

            // 4. Viagens Integradas
            if (tripsSet.status === 'fulfilled' && tripsSet.value && tripsSet.value.ok) {
                this.allTrips = Array.isArray(tripsSet.value.data) ? tripsSet.value.data : [];
                this.renderTripsList(this.allTrips);
            } else if (tripsSet.status === 'rejected') {
                console.warn('[RitFlyView] Falha ao carregar viagens:', tripsSet.reason?.message);
            }

            // 5. Alertas e Ocorrências Consolidadas
            if (alertsSet.status === 'fulfilled' && alertsSet.value && alertsSet.value.ok) {
                this.allAlerts = Array.isArray(alertsSet.value.data) ? alertsSet.value.data : [];
            } else if (alertsSet.status === 'rejected') {
                console.warn('[RitFlyView] Falha ao carregar alertas:', alertsSet.reason?.message);
            }
            this.renderConsolidatedOccurrences();

            this.lastSyncTimestamp = Date.now();
            this.updateLastSyncTimestamp();
        } catch (err) {
            console.error('[RitFlyView] Erro inesperado ao sincronizar dados:', err);
        }
    }

    /**
     * Predicado único e normalizado para filtros e contadores (Seções 4 e 5).
     * Garante 100% de consistência entre o número exibido no botão e os markers no mapa.
     */
    matchesFilterKey(f, rawKey) {
        if (!f) return false;
        const key = String(rawKey || 'todas').trim().toUpperCase();
        if (key === 'TODAS' || key === 'TODOS' || key === '') return true;

        const comp = String(f.companhia || '').trim().toUpperCase();
        const cat = String(f.categoria || '').trim().toUpperCase();
        const call = String(f.callsign || '').trim().toUpperCase();
        const voo = String(f.numeroVoo || '').trim().toUpperCase();

        switch (key) {
            case 'GOL':
                return comp.includes('GOL') || call.startsWith('GLO') || /^G3\d/.test(voo);
            case 'LATAM':
            case 'TAM':
                return comp.includes('LATAM') || comp.includes('TAM') ||
                       call.startsWith('TAM') || call.startsWith('LAN') || call.startsWith('LPE') ||
                       /^(LA|JJ)\d/.test(voo);
            case 'AZUL':
                return comp.includes('AZUL') || call.startsWith('AZU') || call.startsWith('ACN') || /^AD\d/.test(voo);
            case 'VOEPASS':
                return comp.includes('VOEPASS') || comp.includes('PASSAREDO') || call.startsWith('PTB') || /^2Z\d/.test(voo);
            case 'ITA':
                return comp.includes('ITAPEMIRIM') || call.startsWith('IPM');
            case 'HELICOPTEROS':
            case 'HELICOPTERO':
                return cat === 'HELICOPTERO' || comp.includes('HELICÓPTERO') || comp.includes('HELICOPTERO') || comp.includes('OMNI');
            case 'EXECUTIVOS':
            case 'EXECUTIVO':
                return cat === 'EXECUTIVO' || comp.includes('EXECUTIV') || comp.includes('LÍDER') || comp.includes('LIDER') || comp.includes('TÁXI AÉREO') || comp.includes('TAXI AEREO');
            case 'CARGUEIROS':
            case 'CARGUEIRO':
                return cat === 'CARGUEIRO' || comp.includes('CARGO') || comp.includes('CARGUEIR') || comp.includes('LOG') || comp.includes('SIDERAL') || comp.includes('MODERN');
            case 'COMERCIAIS':
            case 'COMERCIAL':
                return cat === 'COMERCIAL' ||
                       this.matchesFilterKey(f, 'GOL') ||
                       this.matchesFilterKey(f, 'LATAM') ||
                       this.matchesFilterKey(f, 'AZUL') ||
                       this.matchesFilterKey(f, 'VOEPASS');
            case 'NAO_IDENTIFICADA':
                return !f.companhia || comp === 'NÃO IDENTIFICADA' || comp === 'NAO IDENTIFICADA' || comp === 'AVIAÇÃO REGULAR';
            default:
                return comp.includes(key) || cat === key;
        }
    }

    /**
     * Gera dinamicamente a barra unificada de filtros por companhia e categoria
     * utilizando a mesma função matchesFilterKey(f, key) para contadores e markers.
     */
    popularFiltroCompanhias() {
        const container = document.getElementById('fly-airline-pills');
        if (!container) return;

        // Oculta a barra redundante .fly-cat-pills para manter linha única compacta no desktop
        const legacyCatContainer = document.querySelector('.fly-cat-pills');
        if (legacyCatContainer) {
            legacyCatContainer.innerHTML = '';
            legacyCatContainer.style.display = 'none';
        }

        const countFor = (k) => this.allFlights.filter(f => this.matchesFilterKey(f, k)).length;

        const counts = {
            todas: this.allFlights.length,
            COMERCIAIS: countFor('COMERCIAIS'),
            GOL: countFor('GOL'),
            LATAM: countFor('LATAM'),
            AZUL: countFor('AZUL'),
            VOEPASS: countFor('VOEPASS'),
            ITA: countFor('ITA'),
            EXECUTIVOS: countFor('EXECUTIVOS'),
            HELICOPTEROS: countFor('HELICOPTEROS'),
            CARGUEIROS: countFor('CARGUEIROS')
        };

        // Lista unificada com todos os filtros exigidos nas Seções 5 e 11
        const items = [
            { key: 'todas', cat: 'todos', label: `Todas (${counts.todas})`, tooltip: 'Exibir todas as aeronaves no radar' },
            { key: 'COMERCIAIS', cat: 'comercial', label: `Comerciais (${counts.COMERCIAIS})`, tooltip: 'Filtrar aviação comercial de carreira' },
            { key: 'GOL', cat: 'comercial', label: `GOL (${counts.GOL})`, tooltip: 'Filtrar voos da GOL Linhas Aéreas' },
            { key: 'LATAM', cat: 'comercial', label: `LATAM (${counts.LATAM})`, tooltip: 'Filtrar voos da LATAM Brasil (inclui TAM)' },
            { key: 'AZUL', cat: 'comercial', label: `AZUL (${counts.AZUL})`, tooltip: 'Filtrar voos da Azul Linhas Aéreas' },
            { key: 'EXECUTIVOS', cat: 'executivo', label: `Executivos (${counts.EXECUTIVOS})`, tooltip: 'Filtrar aviação executiva e táxi aéreo' },
            { key: 'HELICOPTEROS', cat: 'helicoptero', label: `Helicópteros (${counts.HELICOPTEROS})`, tooltip: 'Filtrar helicópteros operacionais' },
            { key: 'CARGUEIROS', cat: 'cargueiro', label: `Cargueiros (${counts.CARGUEIROS})`, tooltip: 'Filtrar aeronaves de carga e logística' }
        ];

        if (counts.VOEPASS > 0) {
            items.splice(5, 0, { key: 'VOEPASS', cat: 'comercial', label: `VOEPASS (${counts.VOEPASS})`, tooltip: 'Filtrar Voepass Linhas Aéreas' });
        }
        if (counts.ITA > 0) {
            items.splice(5, 0, { key: 'ITA', cat: 'comercial', label: `ITA (${counts.ITA})`, tooltip: 'Filtrar Itapemirim Transportes Aéreos' });
        }

        const activeKeyUpper = String(this.currentAirline || 'todas').toUpperCase();

        container.innerHTML = items.map(it => {
            const isActive = activeKeyUpper === it.key.toUpperCase() ? 'active' : '';
            return `<button type="button" class="fly-airline-pill fly-cat-pill ${isActive}" data-airline="${it.key}" data-cat="${it.cat}" data-tooltip="${it.tooltip}" title="${it.tooltip}">${it.label}</button>`;
        }).join('');

        // Re-vincular eventos
        container.querySelectorAll('.fly-airline-pill[data-airline]').forEach(pill => {
            pill.addEventListener('click', () => {
                container.querySelectorAll('.fly-airline-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.currentAirline = pill.getAttribute('data-airline') || 'todas';
                this.currentFilter = 'todos';
                this.aplicarFiltrosVoos();
            });
        });
    }

    aplicarFiltrosVoos() {
        let filtrados = this.allFlights;

        // Seleciona a chave ativa unificada (companhia ou categoria)
        const activeKey = (this.currentAirline && this.currentAirline !== 'todas')
            ? this.currentAirline
            : (this.currentFilter && this.currentFilter !== 'todos' ? this.currentFilter : 'todas');

        if (activeKey !== 'todas' && activeKey !== 'todos') {
            filtrados = filtrados.filter(f => this.matchesFilterKey(f, activeKey));
        }

        // Filtro de Busca Textual
        if (this.searchQuery) {
            const q = this.searchQuery.toUpperCase();
            filtrados = filtrados.filter(f =>
                (f.callsign && f.callsign.toUpperCase().includes(q)) ||
                (f.prefixo && f.prefixo.toUpperCase().includes(q)) ||
                (f.numeroVoo && f.numeroVoo.toUpperCase().includes(q)) ||
                (f.companhia && f.companhia.toUpperCase().includes(q)) ||
                (f.origem && f.origem.toUpperCase().includes(q)) ||
                (f.destino && f.destino.toUpperCase().includes(q))
            );
        }

        this.map.renderFlights(filtrados);
        this.updateFlightsCountBadge(filtrados.length);
    }

    /* ========================================================================= */
    /* MELHORIA 05: DRAWER LATERAL DE DETALHES DO VOO                            */
    /* ========================================================================= */
    abrirDrawerVoo(flightOrId) {
        let f = flightOrId;
        if (typeof flightOrId === 'string') {
            f = this.allFlights.find(x => x.id === flightOrId || x.numeroVoo === flightOrId);
        }
        if (!f) return;

        this.selectedFlight = f;
        const drawer = document.getElementById('fly-flight-drawer');
        if (!drawer) return;

        // Popula cabeçalho
        const elAirline = document.getElementById('fly-drawer-airline');
        const elFlightNum = document.getElementById('fly-drawer-flight-num');
        const elCallsign = document.getElementById('fly-drawer-callsign');

        if (elAirline) elAirline.textContent = f.companhia || 'Aviação Regular';
        if (elFlightNum) elFlightNum.textContent = f.numeroVoo || 'Voo S/N';
        if (elCallsign) elCallsign.textContent = `(${f.prefixo || f.callsign || 'PR-XYZ'})`;

        // Rota
        const elOrigCode = document.getElementById('fly-drawer-orig-code');
        const elOrigCity = document.getElementById('fly-drawer-orig-city');
        const elDestCode = document.getElementById('fly-drawer-dest-code');
        const elDestCity = document.getElementById('fly-drawer-dest-city');

        const cidades = {
            SDU: 'Rio de Janeiro (Santos Dumont)',
            GIG: 'Rio de Janeiro (Galeão)',
            CGH: 'São Paulo (Congonhas)',
            GRU: 'São Paulo (Guarulhos)',
            BSB: 'Brasília (Juscelino Kubitschek)',
            CNF: 'Belo Horizonte (Confins)',
            SSA: 'Salvador (Dep. Luís Eduardo)',
            REC: 'Recife (Gilberto Freyre)'
        };

        if (elOrigCode) elOrigCode.textContent = f.origem || 'Não informado pelo provedor';
        if (elOrigCity) elOrigCity.textContent = cidades[f.origem] || (f.origem ? f.origem : 'Não informado pelo provedor');
        if (elDestCode) elDestCode.textContent = f.destino || 'Não informado pelo provedor';
        if (elDestCity) elDestCity.textContent = cidades[f.destino] || (f.destino ? f.destino : 'Não informado pelo provedor');

        // Progresso e Distâncias (Fase 10 - Sem dados fictícios)
        const fill = document.getElementById('fly-drawer-progress-fill');
        const elDistPerc = document.getElementById('fly-drawer-dist-percorrida');
        const elDistRest = document.getElementById('fly-drawer-dist-restante');
        const prog = f.progressoVooPct || 0;

        if (fill) fill.style.width = prog > 0 ? `${prog}%` : '0%';
        if (elDistPerc) elDistPerc.textContent = f.distanciaPercorridaKm ? `Percorrido: ${f.distanciaPercorridaKm} km (Calculado RIT)` : 'Distância percorrida: Não informado pelo provedor';
        if (elDistRest) elDistRest.textContent = f.distanciaRestanteKm ? `Restante: ${f.distanciaRestanteKm} km (Calculado RIT)` : 'Distância restante: Não informado pelo provedor';

        // Horários e Atraso (Fase 10)
        const elHoraPrev = document.getElementById('fly-drawer-hora-prevista');
        const elHoraEta = document.getElementById('fly-drawer-hora-eta');
        const elDelayBadge = document.getElementById('fly-drawer-delay-badge');

        const prevFormat = f.horarioPrevisto
            ? `${new Date(f.horarioPrevisto).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (Programado)`
            : 'Não informado pelo provedor';

        if (elHoraPrev) elHoraPrev.textContent = prevFormat;
        if (elHoraEta) elHoraEta.textContent = f.etaFormatado ? `${f.etaFormatado} (Calculado pelo RIT)` : 'Não informado pelo provedor';

        const isDelayed = (f.atrasoMinutos || 0) > 15;
        if (elDelayBadge) {
            elDelayBadge.innerHTML = isDelayed
                ? `<span style="background:rgba(244,63,94,0.25); color:#f43f5e; padding:3px 7px; border-radius:3px; font-weight:800; font-size:10px;">⚠️ +${f.atrasoMinutos} min atrasado</span>`
                : (f.status ? `<span style="background:rgba(16,185,129,0.25); color:#10b981; padding:3px 7px; border-radius:3px; font-weight:800; font-size:10px;">✅ No Horário</span>` : `<span style="color:#94a3b8; font-size:10px;">Não informado</span>`);
        }

        // Telemetria detalhada em Português (Fase 10)
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setTxt('fly-drawer-altitude', (f.altitudeM !== undefined && f.altitudeM !== null) ? `${f.altitudeM.toLocaleString('pt-BR')} metros` : 'Não informado pelo provedor');
        setTxt('fly-drawer-altitude-ft', (f.altitudeFt !== undefined && f.altitudeFt !== null) ? `${f.altitudeFt.toLocaleString('pt-BR')} pés` : 'Não informado pelo provedor');
        setTxt('fly-drawer-velocidade', (f.velocidadeKmh !== undefined && f.velocidadeKmh !== null) ? `${f.velocidadeKmh} km/h` : 'Não informado pelo provedor');
        setTxt('fly-drawer-velocidade-kts', (f.velocidadeKts !== undefined && f.velocidadeKts !== null) ? `${f.velocidadeKts} nós` : 'Não informado pelo provedor');
        setTxt('fly-drawer-rumo', (f.rumo !== undefined && f.rumo !== null) ? `${f.rumo}°` : 'Não informado pelo provedor');
        setTxt('fly-drawer-rumo-dir', (f.rumo !== undefined && f.rumo !== null) ? this.obterDirecaoCardeal(f.rumo) : 'Não informado pelo provedor');
        setTxt('fly-drawer-tempo-restante', f.tempoRestanteMinutos ? `${f.tempoRestanteMinutos} minutos (Calculado pelo RIT)` : 'Não informado pelo provedor');
        setTxt('fly-drawer-status', f.status ? `${f.status.toUpperCase()} ${isDelayed ? `(+${f.atrasoMinutos} min)` : '(NO HORÁRIO)'}` : 'Não informado pelo provedor');
        setTxt('fly-drawer-modelo', f.modeloAeronave || 'Não informado pelo provedor');
        setTxt('fly-drawer-categoria', f.categoria ? `Categoria: ${f.categoria.toUpperCase()}` : 'Não informado pelo provedor');

        const modoTexto = f.data_mode === 'LIVE'
            ? '🟢 ADS-B TEMPO REAL (OPENSKY)'
            : (f.data_mode === 'SYNTHETIC' ? '🟡 SINTÉTICO (DEMO)' : '🟡 ESTIMADO RIT');
        setTxt('fly-drawer-fonte', modoTexto);
        setTxt('fly-drawer-atualizacao', `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`);

        // Abre drawer
        drawer.classList.add('open');
        this.map.drawFlightTrail(f);
    }

    fecharDrawerVoo() {
        const drawer = document.getElementById('fly-flight-drawer');
        if (drawer) drawer.classList.remove('open');
        this.selectedFlight = null;
        this.map.clearFlightTrail();
    }

    obterDirecaoCardeal(graus = 0) {
        const val = Math.floor((graus / 22.5) + 0.5);
        const cardeais = ["Norte", "Nor-Nordeste", "Nordeste", "Lés-Nordeste", "Leste", "Lés-Sudeste", "Sudeste", "Sul-Sudeste", "Sul", "Sul-Sudoeste", "Sudoeste", "Oés-Sudoeste", "Oeste", "Oés-Noroeste", "Noroeste", "Nor-Noroeste"];
        return cardeais[(val % 16)];
    }

    /* ========================================================================= */
    /* MELHORIA 06 & SEÇÃO 7: AEROPORTOS, INFORMES E VOOS DO DIA                 */
    /* ========================================================================= */
    async abrirVoosAeroporto(iata) {
        this.selectedAirportIata = iata;
        const overviewView = document.getElementById('fly-airports-overview-view');
        const boardView = document.getElementById('fly-airport-board-view');
        const flightsContainer = document.getElementById('fly-airport-flights-list');
        const informesContainer = document.getElementById('fly-board-informes-container');

        if (overviewView) overviewView.style.display = 'none';
        if (boardView) boardView.style.display = 'flex';

        // Garante que a primeira aba lateral (Aeroportos) esteja ativa
        const tabAirportBtn = document.querySelector('.fly-nav-tab[data-fly-tab="fly-panel-aeroportos"]');
        if (tabAirportBtn) tabAirportBtn.click();

        // Estado explícito de Carregando
        if (informesContainer) {
            informesContainer.innerHTML = `<div class="fly-state-box fly-state-loading">⏳ Carregando informes operacionais de ${iata}...</div>`;
        }
        if (flightsContainer) {
            flightsContainer.innerHTML = `<div class="fly-state-box fly-state-loading">⏳ Consultando malha e tráfego aéreo de ${iata}...</div>`;
        }

        try {
            const res = await this.service.getAirportDetails(iata);
            if (res && res.ok && res.data) {
                this.activeAirportDetails = res.data;
                this.atualizarCabecalhoQuadroAeroporto(res.data);
                this.renderizarVoosDoQuadroAeroporto();
            } else {
                const errMsg = res?.error || 'Não foi possível obter os informes e voos deste aeroporto.';
                console.error(`[RitFlyView] Resposta inválida ao consultar ${iata}:`, errMsg);
                if (informesContainer) {
                    informesContainer.innerHTML = `<div class="fly-state-box fly-state-error">⚠️ Erro ao consultar informes de ${iata}: ${errMsg}</div>`;
                }
                if (flightsContainer) {
                    flightsContainer.innerHTML = `<div class="fly-state-box fly-state-error">⚠️ Fonte de voos indisponível para ${iata}.</div>`;
                }
            }
        } catch (err) {
            console.error('[RitFlyView] Erro ao carregar detalhes do aeroporto:', iata, err);
            if (informesContainer) {
                informesContainer.innerHTML = `
                    <div class="fly-state-box fly-state-error">
                        <div>❌ Falha na consulta dos informes de ${iata}: ${err.message}</div>
                        <button type="button" class="fly-retry-btn" onclick="window.ritFlyView && window.ritFlyView.abrirVoosAeroporto('${iata}')">↻ Tentar novamente</button>
                    </div>
                `;
            }
            if (flightsContainer) {
                flightsContainer.innerHTML = `<div class="fly-state-box fly-state-error">Não foi possível carregar os voos devido a erro na requisição.</div>`;
            }
        }
    }

    voltarParaVisaoGeralAeroportos() {
        const overviewView = document.getElementById('fly-airports-overview-view');
        const boardView = document.getElementById('fly-airport-board-view');

        if (overviewView) overviewView.style.display = 'block';
        if (boardView) boardView.style.display = 'none';
        this.selectedAirportIata = null;
        this.activeAirportDetails = null;
    }

    renderInformesSectionHtml(a, compact = false) {
        const informes = Array.isArray(a?.informes) ? a.informes : [];
        if (a?.fonteStatus === 'FONTE_INDISPONIVEL' || a?.fonteStatus === 'INDISPONIVEL') {
            return `
                <div class="fly-airport-informes-box">
                    <div class="fly-informe-item fly-informe-warn">
                        <strong>⚠️ Fonte Indisponível:</strong> Telemetria ADS-B e boletim METAR sem retorno no momento para ${a.iata}.
                    </div>
                </div>
            `;
        }

        if (informes.length === 0) {
            return `
                <div class="fly-airport-informes-box">
                    <div class="fly-informe-empty">📭 Nenhum informe operacional disponível para ${a?.iata || 'este aeródromo'}.</div>
                </div>
            `;
        }

        const listToRender = compact ? informes.slice(0, 2) : informes;
        return `
            <div class="fly-airport-informes-box" data-airport-informes="${a.iata}">
                <div class="fly-informes-header">
                    <span>📋 INFORMES OPERACIONAIS (${informes.length})</span>
                    <span class="fly-informes-source-badge">${a.metarDisponivel !== false ? 'METAR + ADS-B ATIVO' : 'ADS-B ATIVO (METAR S/D)'}</span>
                </div>
                ${listToRender.map(inf => {
                    const isWarn = inf.severidade === 'ATENCAO' || inf.disponivel === false || inf.status === 'ATENÇÃO' || inf.status === 'INDISPONIVEL';
                    const isCrit = inf.severidade === 'CRITICO' || inf.status === 'CRÍTICO';
                    const sevClass = isCrit
                        ? 'fly-informe-crit'
                        : (isWarn ? 'fly-informe-warn' : 'fly-informe-info');
                    const icon = inf.tipo === 'METAR' ? '🌤️' : (inf.tipo === 'TRAFEGO_ADSB' ? '📡' : '🛫');
                    const textoInforme = inf.resumo || inf.descricao || 'Informe registrado.';
                    return `
                        <div class="fly-informe-item ${sevClass}">
                            <div class="fly-informe-title">${icon} <strong>${inf.titulo}:</strong></div>
                            <div class="fly-informe-desc">${textoInforme}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    atualizarCabecalhoQuadroAeroporto(a) {
        const elTitle = document.getElementById('fly-board-airport-title');
        const elSub = document.getElementById('fly-board-airport-sub');
        const elBadge = document.getElementById('fly-board-weather-badge');
        const elMetar = document.getElementById('fly-board-metar-text');
        const elInformes = document.getElementById('fly-board-informes-container');

        if (elTitle) elTitle.textContent = `${a.iata} — ${a.nome}`;
        if (elSub) elSub.textContent = `${a.cidade} - ${a.uf} | Concessionária: ${a.concessionaria}`;

        const clima = a.clima || {};
        const metarOk = a.metarDisponivel !== false && clima.disponivel !== false && clima.condicoes && clima.condicoes !== 'METAR_INDISPONIVEL';

        if (elBadge) {
            const ruleLabel = metarOk ? (clima.flightRule || a.regraVoo || 'VFR') : 'METAR S/D';
            elBadge.textContent = `${ruleLabel} (${a.statusOperacional || clima.statusOperacional || 'NORMAL'})`;
            elBadge.className = `fly-airport-status-pill ${a.statusOperacional === 'CRÍTICO' ? 'fly-status-critico' : (a.statusOperacional === 'ATENÇÃO' || clima.flightRule === 'IFR' ? 'fly-status-atencao' : 'fly-status-normal')}`;
        }

        if (elMetar) {
            if (metarOk) {
                const tempTxt = clima.temperaturaC !== null && clima.temperaturaC !== undefined ? `${clima.temperaturaC}°C` : 'Temp. N/D';
                elMetar.textContent = `🌤️ Clima (${a.icao}): ${clima.condicoes}, ${tempTxt} | Vento: ${clima.vento ? clima.vento.descricao : 'N/D'} | Visibilidade: ${clima.visibilidade ? clima.visibilidade.descricao : 'N/D'}`;
            } else {
                elMetar.textContent = `⚠️ Boletim METAR oficial temporariamente indisponível na fonte para ${a.icao}. Operação monitorada via telemetria ADS-B.`;
            }
        }

        if (elInformes) {
            elInformes.innerHTML = this.renderInformesSectionHtml(a, false);
        }

        const countPartidas = document.getElementById('fly-board-partidas-count');
        const countChegadas = document.getElementById('fly-board-chegadas-count');
        const countAtrasados = document.getElementById('fly-board-atrasados-count');

        if (countPartidas) countPartidas.textContent = (a.partidas || []).length;
        if (countChegadas) countChegadas.textContent = (a.chegadas || []).length;
        if (countAtrasados) countAtrasados.textContent = ((a.chegadas || []).filter(c => c.atrasoMinutos > 15).length + (a.partidas || []).filter(p => p.atrasoMinutos > 15).length);
    }

    renderizarVoosDoQuadroAeroporto() {
        if (!this.activeAirportDetails) return;
        const container = document.getElementById('fly-airport-flights-list');
        if (!container) return;

        if (this.activeTimeSlice === 'amanha') {
            container.innerHTML = `
                <div class="fly-state-box fly-state-empty">
                    📅 Programação do dia seguinte indisponível na fonte ADS-B em tempo real. Selecione "Hoje" ou janelas de curto prazo (Agora, 1h a 6h).
                </div>
            `;
            return;
        }

        let lista = [];
        if (this.activeBoardTab === 'partidas') {
            lista = [...(this.activeAirportDetails.partidas || [])];
        } else if (this.activeBoardTab === 'chegadas') {
            lista = [...(this.activeAirportDetails.chegadas || [])];
        } else if (this.activeBoardTab === 'atrasados') {
            const all = [...(this.activeAirportDetails.chegadas || []), ...(this.activeAirportDetails.partidas || [])];
            lista = all.filter(f => f.atrasoMinutos > 15);
        }

        // Filtro por janela temporal (activeTimeSlice)
        const sliceHoursMap = { agora: 0.5, '1h': 1, '2h': 2, '2h_futuras': 2, '4h': 4, '6h': 6, '6h_futuras': 6 };
        if (sliceHoursMap[this.activeTimeSlice]) {
            const maxMin = sliceHoursMap[this.activeTimeSlice] * 60;
            lista = lista.filter(f => {
                if (typeof f.tempoRestanteMinutos === 'number') {
                    return f.tempoRestanteMinutos <= maxMin;
                }
                return true;
            });
        }

        // Filtro de Busca Textual interna do quadro
        if (this.boardSearchQuery) {
            lista = lista.filter(f =>
                (f.voo && f.voo.toUpperCase().includes(this.boardSearchQuery)) ||
                (f.prefixo && f.prefixo.toUpperCase().includes(this.boardSearchQuery)) ||
                (f.companhia && f.companhia.toUpperCase().includes(this.boardSearchQuery)) ||
                (f.origem && f.origem.toUpperCase().includes(this.boardSearchQuery)) ||
                (f.destino && f.destino.toUpperCase().includes(this.boardSearchQuery))
            );
        }

        if (lista.length === 0) {
            container.innerHTML = `
                <div class="fly-state-box fly-state-empty">
                    📭 Nenhum voo encontrado em ${this.selectedAirportIata} para a aba "${this.activeBoardTab.toUpperCase()}" na janela selecionada.
                </div>
            `;
            return;
        }

        container.innerHTML = lista.map(f => {
            const isDelayed = f.atrasoMinutos > 15;
            const delayTag = isDelayed
                ? `<span style="color:#f43f5e; font-weight:800; font-size:10px;">⚠️ +${f.atrasoMinutos}m</span>`
                : `<span style="color:#10b981; font-weight:800; font-size:10px;">No Horário</span>`;

            const etaLabel = f.etaFormatado || 'N/D';
            const extraMin = (f.tempoRestanteMinutos && !String(etaLabel).includes('m'))
                ? ` (~${f.tempoRestanteMinutos}m)`
                : '';

            return `
                <div class="fly-airport-flight-card" onclick="window.ritFlyView && window.ritFlyView.focarVooNoMapaEDrawer('${f.id || f.voo}')">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:#38bdf8; font-size:12px;">${f.voo} (${f.prefixo})</strong>
                        ${delayTag}
                    </div>
                    <div style="font-size:10px; color:#cbd5e1; margin:2px 0;">
                        ${f.companhia} | Rota: <strong>${f.origem || this.selectedAirportIata} ➔ ${f.destino || this.selectedAirportIata}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:10px; color:#94a3b8; margin-top:4px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.04);">
                        <span>ETA: <strong style="color:#fff;">${etaLabel}</strong>${extraMin}</span>
                        <span style="color:var(--fly-accent); font-weight:bold;">🔍 Ver no Radar</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    focarVooNoMapaEDrawer(flightIdOrVoo) {
        const f = this.allFlights.find(x => x.id === flightIdOrVoo || x.numeroVoo === flightIdOrVoo);
        if (f) {
            this.map.focusFlight(f.id);
            this.abrirDrawerVoo(f);
        }
    }

    /* ========================================================================= */
    /* KPIS, AEROPORTOS E INTEGRAÇÃO DE SOLO                                     */
    /* ========================================================================= */
    renderKpis(kpis = {}) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setVal('fly-kpi-voos-num', kpis.voosMonitorados || 0);
        setVal('fly-kpi-atrasos-num', kpis.voosAtrasados || 0);
        setVal('fly-kpi-espera-num', `${kpis.tempoMedioEsperaEvitadoMin || 0}m`);
        setVal('fly-kpi-economia-num', `R$ ${(kpis.economiaReprogramacaoBRL || 0).toLocaleString('pt-BR')}`);
        setVal('fly-kpi-sla-num', `${kpis.slaEmbarquePct || 96}%`);
    }

    renderAirportsErrorState(reason = 'Erro ao consultar serviço de aeroportos.') {
        const container = document.getElementById('fly-airports-list-container');
        if (!container) return;
        container.innerHTML = `
            <div class="fly-state-box fly-state-error">
                <div style="font-weight:800; margin-bottom:4px;">❌ Erro na consulta de informes aeroportuários</div>
                <div style="font-size:10px; color:#cbd5e1; margin-bottom:8px;">${reason}</div>
                <button type="button" class="fly-retry-btn" onclick="window.ritFlyView && window.ritFlyView.fetchData()">↻ Tentar novamente</button>
            </div>
        `;
    }

    renderAirportsList(airports = []) {
        const container = document.getElementById('fly-airports-list-container');
        if (!container) return;

        if (!Array.isArray(airports) || airports.length === 0) {
            container.innerHTML = `
                <div class="fly-state-box fly-state-empty">
                    📭 Nenhum informe de aeroporto encontrado no momento.
                </div>
            `;
            return;
        }

        container.innerHTML = airports.map(a => {
            const statusClass = a.statusOperacional === 'NORMAL'
                ? 'fly-status-normal'
                : (a.statusOperacional === 'ATENÇÃO' ? 'fly-status-atencao' : 'fly-status-critico');
            const clima = a.clima || {};
            const metarOk = a.metarDisponivel !== false && clima.disponivel !== false && clima.condicoes && clima.condicoes !== 'METAR_INDISPONIVEL';
            const metarLine = metarOk
                ? `🌤️ METAR (${a.icao}): ${clima.temperaturaC !== null && clima.temperaturaC !== undefined ? `${clima.temperaturaC}°C` : 'Temp. N/D'} (${clima.condicoes})`
                : `⚠️ METAR (${a.icao}): Fonte meteorológica indisponível`;

            return `
                <div class="fly-airport-card" data-airport-card="${a.iata}" onclick="window.ritFlyView && window.ritFlyView.abrirVoosAeroporto('${a.iata}')" data-tooltip="Clique para abrir informes detalhados e voos de ${a.iata}">
                    <div class="fly-airport-header">
                        <div>
                            <span class="fly-airport-code">${a.iata}</span>
                            <span style="font-size:11px; color:#cbd5e1; margin-left:4px;">${a.cidade} - ${a.uf}</span>
                        </div>
                        <span class="fly-airport-status-pill ${statusClass}">${a.statusOperacional} (${metarOk ? a.regraVoo : 'ADS-B'})</span>
                    </div>
                    <div style="font-size:10px; color:#94a3b8; margin-bottom:4px;">
                        ${a.nome}
                    </div>
                    <div class="fly-airport-metrics">
                        <div class="fly-metric-item">
                            <span class="fly-metric-label">Chegadas</span>
                            <span class="fly-metric-val">${a.chegadasPrevistas ?? 0}</span>
                        </div>
                        <div class="fly-metric-item">
                            <span class="fly-metric-label">Partidas</span>
                            <span class="fly-metric-val">${a.partidasPrevistas ?? 0}</span>
                        </div>
                        <div class="fly-metric-item">
                            <span class="fly-metric-label">Atrasos</span>
                            <span class="fly-metric-val" style="color:${a.voosAtrasados > 0 ? '#f59e0b' : '#10b981'};">${a.voosAtrasados ?? 0}</span>
                        </div>
                        <div class="fly-metric-item">
                            <span class="fly-metric-label">Pontualidade</span>
                            <span class="fly-metric-val" style="color:#38bdf8;">${a.taxaPontualidadePct !== null && a.taxaPontualidadePct !== undefined ? `${a.taxaPontualidadePct}%` : 'N/D'}</span>
                        </div>
                    </div>
                    ${this.renderInformesSectionHtml(a, true)}
                    <div style="margin-top:6px; font-size:10px; color:#64748b; display:flex; justify-content:space-between; align-items:center;">
                        <span>${metarLine}</span>
                        <span style="color:var(--fly-accent); font-weight:800; cursor:pointer;" title="Inspecionar informes e voos deste aeroporto">🛫 Ver Informes e Voos →</span>
                    </div>
                </div>
            `;
        }).join('');

        // Se um aeroporto estiver aberto no quadro detalhado, sincroniza também
        if (this.selectedAirportIata) {
            const updatedCurrent = airports.find(x => x.iata === this.selectedAirportIata);
            if (updatedCurrent && this.activeAirportDetails) {
                this.activeAirportDetails.informes = updatedCurrent.informes;
                this.activeAirportDetails.clima = updatedCurrent.clima;
                this.activeAirportDetails.metarDisponivel = updatedCurrent.metarDisponivel;
                this.atualizarCabecalhoQuadroAeroporto(this.activeAirportDetails);
            }
        }
    }

    renderTripsList(trips = []) {
        const container = document.getElementById('fly-trips-list-container');
        if (!container) return;

        if (trips.length === 0) {
            container.innerHTML = '<div style="color:#64748b; font-size:11px; text-align:center; padding:15px;">Nenhuma viagem integrada ativa no momento.</div>';
            return;
        }

        container.innerHTML = trips.map(t => {
            const isDelay = t.atrasoVooMinutos > 0;
            const delayBadge = isDelay 
                ? `<span style="color:#f43f5e; font-weight:800; font-size:10px;">⚠️ +${t.atrasoVooMinutos} min atraso</span>`
                : `<span style="color:#10b981; font-weight:800; font-size:10px;">✅ No Horário</span>`;

            const horaRecalculada = t.horarioTransporteRecalculado 
                ? new Date(t.horarioTransporteRecalculado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : '--:--';

            const horaVoo = t.etaAtualizadoVoo
                ? new Date(t.etaAtualizadoVoo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : '--:--';

            return `
                <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:6px; padding:8px 10px; margin-bottom:6px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <strong style="color:#fff; font-size:11px;">${t.passageiro}</strong>
                        ${delayBadge}
                    </div>
                    <div style="font-size:10px; color:#38bdf8; margin-bottom:4px;">
                        ✈️ Voo: <strong>${t.numeroVoo}</strong> (${t.aeroportoIata}) | Tipo: <strong>${t.tipoDeslocamento === 'IDA_AEROPORTO' ? 'Embarque (Ida)' : 'Desembarque (Chegada)'}</strong>
                    </div>
                    <div style="font-size:10px; color:#94a3b8;">
                        • Origem: ${t.origemTransporte}<br/>
                        • Destino: ${t.destinoTransporte}
                    </div>
                    <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.04); display:flex; justify-content:space-between; align-items:center; font-size:10px;">
                        <span>🚗 Transporte Ajustado: <strong style="color:#f59e0b;">${horaRecalculada}</strong></span>
                        <span>✈️ Voo: <strong>${horaVoo}</strong></span>
                    </div>
                    ${t.economiaEsperaMinutos > 0 ? `
                        <div style="margin-top:4px; font-size:9px; color:#10b981; font-weight:bold;">
                            💡 Economia: ${t.economiaEsperaMinutos} min de espera ociosa evitada
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    buildConsolidatedOccurrencesList() {
        const nowIso = new Date().toISOString();
        const occurrences = [];
        const seen = new Set();

        const pushOcc = (item) => {
            if (!item || !item.titulo) return;
            const key = item.deduplication_key || item.id || `${item.categoria}-${item.aeroporto || ''}-${item.voo || ''}-${item.titulo}`;
            if (seen.has(key)) return;
            seen.add(key);
            occurrences.push({
                id: item.id || `occ-${occurrences.length + 1}`,
                categoria: item.categoria || 'OPERACIONAL',
                severidade: item.severidade || 'INFO',
                titulo: item.titulo,
                descricao: item.descricao || '',
                acaoSugerida: item.acaoSugerida || null,
                aeroporto: item.aeroporto || null,
                voo: item.voo || null,
                idVoo: item.idVoo || null,
                timestamp: item.timestamp || nowIso
            });
        };

        // 1. Ocorrências retornadas pela API /api/rit-fly/alerts
        if (Array.isArray(this.allAlerts)) {
            this.allAlerts.forEach(a => {
                const isClima = a.categoria === 'CLIMA_METAR' || a.alert_type === 'CLIMA_METAR' || /METAR|IFR|MVFR|Clima|Meteorol/i.test(a.titulo || '');
                const cat = a.categoria || (isClima ? 'CLIMA_METAR' : (a.voo ? 'ATRASOS_MALHA' : 'SOLO_TRANSFERS'));
                pushOcc({ ...a, categoria: cat });
            });
        }

        // 2. Consolidação ao vivo dos 8 Aeroportos Estratégicos (METAR + Atrasos + Fluxo)
        if (Array.isArray(this.allAirports)) {
            this.allAirports.forEach(a => {
                if (!a || !a.iata) return;
                const clima = a.clima || {};
                const metarOk = a.metarDisponivel !== false && clima.disponivel !== false && clima.condicoes && clima.condicoes !== 'METAR_INDISPONIVEL';
                const regra = clima.flightRule || a.regraVoo || 'VFR';
                const condStr = String(clima.condicoes || '');
                const ventoKt = Number(clima.vento?.velocidadeKt || 0);

                if (metarOk) {
                    const hasPhenom = /Névoa|Nevoeiro|Chuva|Trovoada|Tempestade|Pancadas/i.test(condStr);
                    if (regra === 'IFR' || regra === 'LIFR' || a.statusOperacional === 'CRÍTICO') {
                        pushOcc({
                            id: `occ-metar-ifr-${a.iata}`,
                            deduplication_key: `occ-metar-${a.iata}`,
                            categoria: 'CLIMA_METAR',
                            severidade: 'CRITICO',
                            titulo: `Operação por Instrumentos (${regra}) em ${a.iata} — ${a.cidade}`,
                            descricao: `METAR ${a.icao}: ${condStr}, ${clima.temperaturaC ?? '--'}°C | Vento: ${clima.vento?.descricao || 'N/D'} | Visib.: ${clima.visibilidade?.descricao || 'N/D'}.`,
                            acaoSugerida: `Considerar margem adicional de 20 a 30 min para pousos e receptivo terrestre em ${a.iata}.`,
                            aeroporto: a.iata,
                            timestamp: clima.atualizadoEm || nowIso
                        });
                    } else if (regra === 'MVFR' || a.statusOperacional === 'ATENÇÃO' || hasPhenom || ventoKt >= 14) {
                        pushOcc({
                            id: `occ-metar-mvfr-${a.iata}`,
                            deduplication_key: `occ-metar-${a.iata}`,
                            categoria: 'CLIMA_METAR',
                            severidade: 'ALTO',
                            titulo: `Atenção Meteorológica (${regra}) em ${a.iata} — ${condStr}`,
                            descricao: `METAR ${a.icao}: ${condStr}, ${clima.temperaturaC ?? '--'}°C | Vento: ${clima.vento?.descricao || 'N/D'} | Visib.: ${clima.visibilidade?.descricao || 'N/D'}.`,
                            acaoSugerida: `Acompanhar evolução de teto/visibilidade e janelas de aproximação em ${a.iata}.`,
                            aeroporto: a.iata,
                            timestamp: clima.atualizadoEm || nowIso
                        });
                    }
                }

                if ((a.voosAtrasados || 0) > 0) {
                    pushOcc({
                        id: `occ-hub-delay-${a.iata}`,
                        deduplication_key: `occ-hub-delay-${a.iata}`,
                        categoria: 'ATRASOS_MALHA',
                        severidade: a.voosAtrasados >= 3 ? 'CRITICO' : 'ALTO',
                        titulo: `Retenção de Malha em ${a.iata}: ${a.voosAtrasados} voo(s) com atraso`,
                        descricao: `Terminal ${a.nome} apresenta ${a.voosAtrasados} aeronave(s) com atraso > 15 min (Pontualidade: ${a.taxaPontualidadePct ?? 100}%).`,
                        acaoSugerida: `Verificar impacto nos desembarques corporativos em ${a.iata}.`,
                        aeroporto: a.iata,
                        timestamp: nowIso
                    });
                }

                const movTotal = (a.chegadasPrevistas || 0) + (a.partidasPrevistas || 0);
                if (movTotal > 0) {
                    pushOcc({
                        id: `occ-fluxo-${a.iata}`,
                        deduplication_key: `occ-fluxo-${a.iata}`,
                        categoria: 'FLUXO_HUB',
                        severidade: movTotal >= 10 ? 'MEDIO' : 'INFO',
                        titulo: `Fluxo Ativo em ${a.iata} (${a.cidade}): ${movTotal} aeronave(s) no setor`,
                        descricao: `${a.chegadasPrevistas || 0} chegada(s) / aproximação e ${a.partidasPrevistas || 0} partida(s) via ADS-B (${metarOk ? regra : 'ADS-B'}).`,
                        acaoSugerida: `Clique para abrir o quadro de voos e informes de ${a.iata}.`,
                        aeroporto: a.iata,
                        timestamp: nowIso
                    });
                }
            });
        }

        // 3. Aeronaves com atraso (> 15 min) na malha aérea
        if (Array.isArray(this.allFlights)) {
            const delayed = this.allFlights.filter(f => f && (f.atrasoMinutos || 0) > 15);
            delayed.slice(0, 10).forEach(f => {
                const numVoo = f.numeroVoo || f.callsign || f.prefixo || f.id;
                pushOcc({
                    id: `occ-flight-delay-${f.id || numVoo}`,
                    deduplication_key: `alt-${numVoo}-${f.severidade || 'ALTO'}`,
                    categoria: 'ATRASOS_MALHA',
                    severidade: f.atrasoMinutos >= 35 ? 'CRITICO' : 'ALTO',
                    titulo: `Atraso de Voo: ${numVoo} (+${f.atrasoMinutos} min)`,
                    descricao: `${f.companhia || 'Operador'} (${f.prefixo || f.icao24 || 'S/P'}) na rota ${f.origem || 'N/D'} ➔ ${f.destino || 'N/D'} | ETA: ${f.etaFormatado || '--:--'}.`,
                    acaoSugerida: `Clique para focar a aeronave no radar e sincronizar transfer.`,
                    aeroporto: f.destino || f.origem || null,
                    voo: numVoo,
                    idVoo: f.id,
                    timestamp: nowIso
                });
            });
        }

        const rank = { CRITICO: 4, ALTO: 3, MEDIO: 2, INFO: 1 };
        occurrences.sort((a, b) => (rank[b.severidade] || 0) - (rank[a.severidade] || 0));
        return occurrences;
    }

    renderConsolidatedOccurrences() {
        const allOccs = this.buildConsolidatedOccurrencesList();

        const countClima = allOccs.filter(o => o.categoria === 'CLIMA_METAR').length;
        const countAtrasos = allOccs.filter(o => o.categoria === 'ATRASOS_MALHA').length;
        const countHubs = allOccs.filter(o => o.categoria === 'FLUXO_HUB').length;
        const countSolo = allOccs.filter(o => o.categoria === 'SOLO_TRANSFERS').length;
        const countCriticos = allOccs.filter(o => o.severidade === 'CRITICO' || o.severidade === 'ALTO').length;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        // Atualiza contadores no Painel Compacto (Visão Geral da Lateral)
        setTxt('fly-occ-overview-count', allOccs.length);
        setTxt('fly-occ-mini-total', allOccs.length);
        setTxt('fly-occ-mini-clima', countClima);
        setTxt('fly-occ-mini-atrasos', countAtrasos);
        setTxt('fly-occ-mini-hubs', countHubs);

        // Atualiza badge da aba Ocorrências e cards da aba dedicada
        setTxt('fly-nav-alerts-badge', allOccs.length);
        setTxt('fly-occ-card-criticos', countCriticos);
        setTxt('fly-occ-card-clima', countClima);
        setTxt('fly-occ-card-atrasos', countAtrasos);
        setTxt('fly-occ-card-hubs', countHubs + countSolo);

        const tabStatus = document.getElementById('fly-occ-tab-status');
        if (tabStatus) {
            if (allOccs.some(o => o.severidade === 'CRITICO')) {
                tabStatus.textContent = 'CRÍTICO';
                tabStatus.className = 'fly-airport-status-pill fly-status-critico';
            } else if (countCriticos > 0) {
                tabStatus.textContent = `${countCriticos} EM ATENÇÃO`;
                tabStatus.className = 'fly-airport-status-pill fly-status-atencao';
            } else {
                tabStatus.textContent = 'NORMAL';
                tabStatus.className = 'fly-airport-status-pill fly-status-normal';
            }
        }

        // Renderiza lista compacta (Top 3 ocorrências prioritárias) no topo do painel lateral
        const compactContainer = document.getElementById('fly-occ-overview-list');
        if (compactContainer) {
            if (allOccs.length === 0) {
                compactContainer.innerHTML = `
                    <div class="fly-occ-empty-inline">
                        ✅ Operação normal nos 8 hubs — nenhuma restrição crítica ativa no momento.
                    </div>
                `;
            } else {
                const topOccs = allOccs.slice(0, 3);
                compactContainer.innerHTML = topOccs.map(occ => {
                    const sevColor = occ.severidade === 'CRITICO' ? '#f43f5e' : (occ.severidade === 'ALTO' ? '#f59e0b' : (occ.severidade === 'MEDIO' ? '#38bdf8' : '#10b981'));
                    const catIcon = occ.categoria === 'CLIMA_METAR' ? '🌤️' : (occ.categoria === 'ATRASOS_MALHA' ? '⚠️' : (occ.categoria === 'SOLO_TRANSFERS' ? '🚗' : '📡'));
                    const targetAttr = occ.idVoo || occ.voo
                        ? `onclick="window.ritFlyView && window.ritFlyView.focarVooNoMapaEDrawer('${occ.idVoo || occ.voo}')"`
                        : (occ.aeroporto ? `onclick="window.ritFlyView && window.ritFlyView.focarAeroporto('${occ.aeroporto}')"` : `onclick="window.ritFlyView && window.ritFlyView.abrirAbaOcorrencias('TODAS')"`);
                    const tagBadge = occ.aeroporto
                        ? `<span class="fly-occ-tag-pill">${occ.aeroporto}</span>`
                        : (occ.voo ? `<span class="fly-occ-tag-pill">${occ.voo}</span>` : '');

                    return `
                        <div class="fly-occ-compact-item" style="border-left-color:${sevColor};" ${targetAttr} title="Clique para inspecionar no radar">
                            <div class="fly-occ-compact-top">
                                <span class="fly-occ-compact-title">${catIcon} ${occ.titulo}</span>
                                ${tagBadge}
                            </div>
                            <div class="fly-occ-compact-desc">${occ.descricao}</div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Renderiza lista completa na aba dedicada (#fly-alerts-list-container)
        const fullContainer = document.getElementById('fly-alerts-list-container');
        if (!fullContainer) return;

        const filtered = (this.occurrenceFilter && this.occurrenceFilter !== 'TODAS')
            ? allOccs.filter(o => o.categoria === this.occurrenceFilter)
            : allOccs;

        if (filtered.length === 0) {
            fullContainer.innerHTML = `
                <div class="fly-state-box fly-state-empty" style="margin-top:8px;">
                    ✅ Nenhuma ocorrência registrada para o filtro "${this.occurrenceFilter}" no momento.
                </div>
            `;
            return;
        }

        fullContainer.innerHTML = filtered.map(alt => {
            let badgeColor = '#38bdf8';
            let sevLabel = 'OPERACIONAL';
            if (alt.severidade === 'CRITICO') { badgeColor = '#f43f5e'; sevLabel = 'CRÍTICO'; }
            else if (alt.severidade === 'ALTO') { badgeColor = '#f59e0b'; sevLabel = 'ATENÇÃO'; }
            else if (alt.severidade === 'MEDIO') { badgeColor = '#38bdf8'; sevLabel = 'MODERADO'; }
            else { badgeColor = '#10b981'; sevLabel = 'NORMAL / FLUXO'; }

            const catMap = {
                CLIMA_METAR: '🌤️ Clima / METAR',
                ATRASOS_MALHA: '⚠️ Atraso / Voo',
                FLUXO_HUB: '📡 Fluxo Hub',
                SOLO_TRANSFERS: '🚗 Solo / Transfer'
            };
            const catLabel = catMap[alt.categoria] || '📋 Operacional';

            let horaFormatada = '';
            if (alt.timestamp) {
                const dt = new Date(alt.timestamp);
                if (!Number.isNaN(dt.getTime())) {
                    horaFormatada = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
            }

            const clickAction = alt.idVoo || alt.voo
                ? `onclick="window.ritFlyView && window.ritFlyView.focarVooNoMapaEDrawer('${alt.idVoo || alt.voo}')"`
                : (alt.aeroporto ? `onclick="window.ritFlyView && window.ritFlyView.focarAeroporto('${alt.aeroporto}')"` : '');

            return `
                <div class="fly-occ-full-card" style="border-left:3px solid ${badgeColor};" ${clickAction}>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px;">
                        <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                            <span style="font-size:9px; font-weight:800; padding:1px 5px; border-radius:3px; background:rgba(255,255,255,0.06); color:${badgeColor}; border:1px solid ${badgeColor};">${sevLabel}</span>
                            <span style="font-size:9px; font-weight:700; color:#94a3b8;">${catLabel}</span>
                            ${alt.aeroporto ? `<span class="fly-occ-tag-pill">${alt.aeroporto}</span>` : ''}
                            ${alt.voo ? `<span class="fly-occ-tag-pill">${alt.voo}</span>` : ''}
                        </div>
                        <span style="font-size:9px; color:#64748b; white-space:nowrap;">${horaFormatada}</span>
                    </div>
                    <div style="color:#fff; font-size:11px; font-weight:800; line-height:1.3;">${alt.titulo}</div>
                    <div style="font-size:10px; color:#cbd5e1; margin-top:3px; line-height:1.4;">
                        ${alt.descricao}
                    </div>
                    ${alt.acaoSugerida ? `
                        <div style="font-size:9px; color:#38bdf8; margin-top:5px; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">
                            <span>👉 ${alt.acaoSugerida}</span>
                            ${(alt.aeroporto || alt.voo) ? `<span style="color:#f59e0b; white-space:nowrap; margin-left:6px;">Ver no Radar →</span>` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    renderAlertsList(alerts = []) {
        this.allAlerts = Array.isArray(alerts) ? alerts : [];
        this.renderConsolidatedOccurrences();
    }

    /* ========================================================================= */
    /* MELHORIA 08: CHATBOT RIT FLY AI CONVERSACIONAL                            */
    /* ========================================================================= */
    async sendAIMessage(queryText) {
        const messagesContainer = document.getElementById('fly-ai-messages-container');
        if (!messagesContainer) return;

        // Renderiza mensagem do usuário
        const userMsg = document.createElement('div');
        userMsg.className = 'fly-ai-bubble user';
        userMsg.textContent = queryText;
        messagesContainer.appendChild(userMsg);

        // Bubble de carregamento do assistente
        const agentMsg = document.createElement('div');
        agentMsg.className = 'fly-ai-bubble agent';
        agentMsg.innerHTML = '<span style="color:#38bdf8;">🤖 RIT FLY AI processando telemetria e malha aérea...</span>';
        messagesContainer.appendChild(agentMsg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const res = await this.service.askAI(queryText);
            if (res.ok && res.data) {
                const formatted = (res.data.texto || '')
                    .replace(/\n\n/g, '<br/><br/>')
                    .replace(/\n/g, '<br/>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                agentMsg.innerHTML = formatted;
            } else {
                agentMsg.textContent = 'Desculpe, ocorreu uma oscilação na análise. Tente novamente.';
            }
        } catch (err) {
            agentMsg.textContent = `Erro ao consultar a IA: ${err.message}`;
        }

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async handleTripFormSubmit() {
        const passageiro = document.getElementById('fly-form-passageiro')?.value;
        const voo = document.getElementById('fly-form-voo')?.value;
        const origem = document.getElementById('fly-form-origem')?.value;
        const destino = document.getElementById('fly-form-destino')?.value;
        const tipoDeslocamento = document.getElementById('fly-form-tipo')?.value;

        if (!passageiro || !voo || !origem || !destino) {
            alert('Por favor preencha todos os campos da viagem corporativa.');
            return;
        }

        try {
            const res = await this.service.createTrip({ passageiro, voo, origem, destino, tipoDeslocamento });
            if (res.ok) {
                alert(`✅ Viagem vinculada com sucesso!\n\nVoo: ${res.data.numeroVoo}\nPassageiro: ${res.data.passageiro}\nHorário Transporte Ajustado: ${new Date(res.data.horarioTransporteRecalculado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
                
                document.getElementById('fly-form-passageiro').value = '';
                document.getElementById('fly-form-voo').value = '';
                
                this.fetchData();
            }
        } catch (err) {
            alert(`Erro ao vincular viagem: ${err.message}`);
        }
    }

    perguntarVooAI(numeroVoo) {
        const tabAiBtn = document.querySelector('.fly-nav-tab[data-fly-tab="fly-panel-ai"]');
        if (tabAiBtn) tabAiBtn.click();
        this.sendAIMessage(`Qual a previsão de chegada do voo ${numeroVoo}?`);
    }

    preencherFormularioViagem(voo, origem, destino) {
        const tabTripBtn = document.querySelector('.fly-nav-tab[data-fly-tab="fly-panel-transporte"]');
        if (tabTripBtn) tabTripBtn.click();
        
        const vooInput = document.getElementById('fly-form-voo');
        if (vooInput) vooInput.value = voo;
    }

    focarAeroporto(iata) {
        this.map.centerAirport(iata);
        this.abrirVoosAeroporto(iata);
    }

    updateFlightsCountBadge(count) {
        const badge = document.getElementById('fly-count-badge');
        const badgeLiveText = document.getElementById('fly-live-badge-text');
        if (badge) {
            if (count === 0 && (!this.allFlights || this.allFlights.length === 0)) {
                badge.textContent = '0 AERONAVES (AGUARDANDO PROVEDOR)';
                if (badgeLiveText) badgeLiveText.textContent = 'Dado temporariamente indisponível';
            } else {
                badge.textContent = `${count} AERONAVES`;
                if (badgeLiveText) badgeLiveText.textContent = 'TEMPO REAL ATIVO';
            }
        }
    }

    updateLastSyncTimestamp() {
        const el = document.getElementById('fly-last-sync-time');
        if (el) {
            el.textContent = `SINCRONIZADO: ${new Date(this.lastSyncTimestamp).toLocaleTimeString('pt-BR')}`;
        }
    }

    startFreshnessTicker() {
        if (this.freshnessTimer) clearInterval(this.freshnessTimer);
        this.freshnessTimer = setInterval(() => {
            const el = document.getElementById('fly-drawer-atualizacao');
            if (el && this.selectedFlight) {
                const diffSec = Math.floor((Date.now() - this.lastSyncTimestamp) / 1000);
                el.textContent = `Atualizado há ${Math.max(1, diffSec)} segundos`;
            }
        }, 3000);
    }

    startAutoRefresh() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => {
            this.fetchData();
        }, this.pollIntervalMs);
    }

    onTabActivated() {
        this.map.invalidateSize();
        this.fetchData();

        // Abre tutorial automaticamente na primeira vez
        if (localStorage.getItem('rit_fly_tutorial_seen') !== 'true') {
            this.abrirTutorial();
        }
    }
}
