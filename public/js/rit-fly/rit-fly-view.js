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

        // 2. Filtros de Categoria de Aeronave
        const catPills = document.querySelectorAll('.fly-cat-pill');
        catPills.forEach(pill => {
            pill.addEventListener('click', () => {
                catPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.currentFilter = pill.getAttribute('data-cat') || 'todos';
                this.aplicarFiltrosVoos();
            });
        });

        // 3. Filtros de Companhia Aérea (Melhoria 07)
        const airlinePills = document.querySelectorAll('.fly-airline-pill');
        airlinePills.forEach(pill => {
            pill.addEventListener('click', () => {
                airlinePills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.currentAirline = pill.getAttribute('data-airline') || 'todas';
                this.aplicarFiltrosVoos();
            });
        });

        // 4. Seletor de Camadas de Mapa (Melhoria 02)
        const layerSelect = document.getElementById('fly-select-map-layer');
        if (layerSelect) {
            layerSelect.addEventListener('change', (e) => {
                const layerKey = e.target.value;
                this.map.setBaseLayer(layerKey);
            });
        }

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
        try {
            const [flightsRes, kpisRes, airportsRes, tripsRes, alertsRes] = await Promise.all([
                this.service.getFlights(),
                this.service.getKpis(),
                this.service.getAirports(),
                this.service.getTrips(),
                this.service.getAlerts()
            ]);

            if (flightsRes && flightsRes.ok) {
                this.allFlights = flightsRes.data || [];
                this.aplicarFiltrosVoos();

                const badgeLiveText = document.getElementById('fly-live-badge-text');
                const badgeCount = document.getElementById('fly-count-badge');
                if (this.allFlights.length === 0) {
                    if (badgeLiveText) badgeLiveText.textContent = 'Dado temporariamente indisponível';
                    if (badgeCount) badgeCount.textContent = '0 AERONAVES (AGUARDANDO PROVEDOR)';
                } else {
                    if (badgeLiveText) badgeLiveText.textContent = 'TEMPO REAL ATIVO';
                }
            }

            if (airportsRes && airportsRes.ok) {
                this.allAirports = airportsRes.data || [];
                this.map.renderAirports(this.allAirports);
                this.renderAirportsList(this.allAirports);
            }

            if (kpisRes && kpisRes.ok) {
                this.renderKpis(kpisRes.data);
            }

            if (tripsRes && tripsRes.ok) {
                this.renderTripsList(tripsRes.data);
            }

            if (alertsRes && alertsRes.ok) {
                this.renderAlertsList(alertsRes.data);
            }

            this.lastSyncTimestamp = Date.now();
            this.updateLastSyncTimestamp();
        } catch (err) {
            console.error('[RitFlyView] Erro ao sincronizar dados:', err);
        }
    }

    aplicarFiltrosVoos() {
        let filtrados = this.allFlights;

        // Filtro de Categoria
        if (this.currentFilter !== 'todos') {
            const cat = this.currentFilter.toLowerCase();
            filtrados = filtrados.filter(f => (f.categoria || '').toLowerCase() === cat);
        }

        // Filtro de Companhia Aérea (Melhoria 07)
        if (this.currentAirline !== 'todas') {
            const targetComp = this.currentAirline.toUpperCase();
            filtrados = filtrados.filter(f => {
                const fComp = (f.companhia || '').toUpperCase();
                const fCat = (f.categoria || '').toUpperCase();
                const fCall = (f.callsign || '').toUpperCase();

                if (targetComp === 'GOL') return fComp.includes('GOL') || fCall.startsWith('GLO');
                if (targetComp === 'LATAM') return fComp.includes('LATAM') || fCall.startsWith('TAM');
                if (targetComp === 'AZUL') return fComp.includes('AZUL') || fCall.startsWith('AZU');
                if (targetComp === 'VOEPASS') return fComp.includes('VOEPASS') || fCall.startsWith('PTB');
                if (targetComp === 'ITA') return fComp.includes('ITAPEMIRIM') || fCall.startsWith('IPM');
                if (targetComp === 'EXECUTIVOS') return fCat === 'EXECUTIVO' || fComp.includes('EXECUTIV') || fComp.includes('LÍDER');
                if (targetComp === 'HELICOPTEROS') return fCat === 'HELICOPTERO';
                return fComp.includes(targetComp);
            });
        }

        // Filtro de Busca Textual
        if (this.searchQuery) {
            const q = this.searchQuery.toUpperCase();
            filtrados = filtrados.filter(f =>
                (f.callsign && f.callsign.includes(q)) ||
                (f.prefixo && f.prefixo.includes(q)) ||
                (f.numeroVoo && f.numeroVoo.includes(q)) ||
                (f.companhia && f.companhia.toUpperCase().includes(q)) ||
                (f.origem && f.origem.includes(q)) ||
                (f.destino && f.destino.includes(q))
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

        if (elOrigCode) elOrigCode.textContent = f.origem || 'N/D';
        if (elOrigCity) elOrigCity.textContent = cidades[f.origem] || 'Origem';
        if (elDestCode) elDestCode.textContent = f.destino || 'N/D';
        if (elDestCity) elDestCity.textContent = cidades[f.destino] || 'Destino';

        // Progresso e Distâncias
        const fill = document.getElementById('fly-drawer-progress-fill');
        const elDistPerc = document.getElementById('fly-drawer-dist-percorrida');
        const elDistRest = document.getElementById('fly-drawer-dist-restante');
        const prog = f.progressoVooPct || 50;

        if (fill) fill.style.width = `${prog}%`;
        if (elDistPerc) elDistPerc.textContent = `Percorrido: ${f.distanciaPercorridaKm || 180} km`;
        if (elDistRest) elDistRest.textContent = `Restante: ${f.distanciaRestanteKm || 180} km (Total: ${f.distanciaTotalKm || 360} km)`;

        // Horários e Atraso
        const elHoraPrev = document.getElementById('fly-drawer-hora-prevista');
        const elHoraEta = document.getElementById('fly-drawer-hora-eta');
        const elDelayBadge = document.getElementById('fly-drawer-delay-badge');

        const prevFormat = f.horarioPrevisto
            ? new Date(f.horarioPrevisto).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '--:--';

        if (elHoraPrev) elHoraPrev.textContent = prevFormat;
        if (elHoraEta) elHoraEta.textContent = f.etaFormatado || '--:--';

        const isDelayed = f.atrasoMinutos > 15;
        if (elDelayBadge) {
            elDelayBadge.innerHTML = isDelayed
                ? `<span style="background:rgba(244,63,94,0.25); color:#f43f5e; padding:3px 7px; border-radius:3px; font-weight:800; font-size:10px;">⚠️ +${f.atrasoMinutos} min atrasado</span>`
                : `<span style="background:rgba(16,185,129,0.25); color:#10b981; padding:3px 7px; border-radius:3px; font-weight:800; font-size:10px;">✅ No Horário</span>`;
        }

        // Telemetria detalhada em Português
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setTxt('fly-drawer-altitude', `${(f.altitudeM || 0).toLocaleString('pt-BR')} metros`);
        setTxt('fly-drawer-altitude-ft', `${(f.altitudeFt || 0).toLocaleString('pt-BR')} pés`);
        setTxt('fly-drawer-velocidade', `${f.velocidadeKmh || 0} km/h`);
        setTxt('fly-drawer-velocidade-kts', `${f.velocidadeKts || 0} nós`);
        setTxt('fly-drawer-rumo', `${f.rumo || 0}°`);
        setTxt('fly-drawer-rumo-dir', this.obterDirecaoCardeal(f.rumo));
        setTxt('fly-drawer-tempo-restante', `${f.tempoRestanteMinutos || 20} minutos`);
        setTxt('fly-drawer-status', `${(f.status || 'EM ROTA').toUpperCase()} ${isDelayed ? `(+${f.atrasoMinutos} min)` : '(NO HORÁRIO)'}`);
        setTxt('fly-drawer-modelo', f.modeloAeronave || 'Aeronave Comercial');
        setTxt('fly-drawer-categoria', `Categoria: ${(f.categoria || 'comercial').toUpperCase()}`);

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
    /* MELHORIA 06: VOOS POR AEROPORTO ("VOOS DO DIA")                           */
    /* ========================================================================= */
    async abrirVoosAeroporto(iata) {
        this.selectedAirportIata = iata;
        const overviewView = document.getElementById('fly-airports-overview-view');
        const boardView = document.getElementById('fly-airport-board-view');

        if (overviewView) overviewView.style.display = 'none';
        if (boardView) boardView.style.display = 'flex';

        // Garante que a primeira aba lateral (Aeroportos) esteja ativa
        const tabAirportBtn = document.querySelector('.fly-nav-tab[data-fly-tab="fly-panel-aeroportos"]');
        if (tabAirportBtn) tabAirportBtn.click();

        try {
            const res = await this.service.getAirportDetails(iata);
            if (res && res.ok) {
                this.activeAirportDetails = res.data;
                this.atualizarCabecalhoQuadroAeroporto(res.data);
                this.renderizarVoosDoQuadroAeroporto();
            }
        } catch (err) {
            console.error('[RitFlyView] Erro ao carregar detalhes do aeroporto:', err);
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

    atualizarCabecalhoQuadroAeroporto(a) {
        const elTitle = document.getElementById('fly-board-airport-title');
        const elSub = document.getElementById('fly-board-airport-sub');
        const elBadge = document.getElementById('fly-board-weather-badge');
        const elMetar = document.getElementById('fly-board-metar-text');

        if (elTitle) elTitle.textContent = `${a.iata} — ${a.nome}`;
        if (elSub) elSub.textContent = `${a.cidade} - ${a.uf} | Concessionária: ${a.concessionaria}`;

        const clima = a.clima || {};
        if (elBadge) {
            elBadge.textContent = `${clima.flightRule || 'VFR'} (${clima.statusOperacional || 'ABERTO'})`;
            elBadge.className = `fly-airport-status-pill ${clima.flightRule === 'IFR' ? 'fly-status-atencao' : 'fly-status-normal'}`;
        }

        if (elMetar) {
            elMetar.textContent = `🌤️ Clima: ${clima.condicoes || 'Céu Claro'}, ${clima.temperaturaC || 26}°C | Vento: ${clima.vento ? clima.vento.descricao : 'Calmo'} | Visibilidade: ${clima.visibilidade ? clima.visibilidade.descricao : '> 10 km'}`;
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

        let lista = [];
        if (this.activeBoardTab === 'partidas') {
            lista = this.activeAirportDetails.partidas || [];
        } else if (this.activeBoardTab === 'chegadas') {
            lista = this.activeAirportDetails.chegadas || [];
        } else if (this.activeBoardTab === 'atrasados') {
            const all = [...(this.activeAirportDetails.chegadas || []), ...(this.activeAirportDetails.partidas || [])];
            lista = all.filter(f => f.atrasoMinutos > 15);
        }

        // Filtro de Busca Textual interna do quadro
        if (this.boardSearchQuery) {
            lista = lista.filter(f =>
                (f.voo && f.voo.includes(this.boardSearchQuery)) ||
                (f.prefixo && f.prefixo.includes(this.boardSearchQuery)) ||
                (f.companhia && f.companhia.toUpperCase().includes(this.boardSearchQuery)) ||
                (f.origem && f.origem.includes(this.boardSearchQuery)) ||
                (f.destino && f.destino.includes(this.boardSearchQuery))
            );
        }

        if (lista.length === 0) {
            container.innerHTML = '<div style="color:#64748b; font-size:11px; text-align:center; padding:20px;">Nenhum voo correspondente aos filtros selecionados.</div>';
            return;
        }

        container.innerHTML = lista.map(f => {
            const isDelayed = f.atrasoMinutos > 15;
            const delayTag = isDelayed
                ? `<span style="color:#f43f5e; font-weight:800; font-size:10px;">⚠️ +${f.atrasoMinutos}m</span>`
                : `<span style="color:#10b981; font-weight:800; font-size:10px;">No Horário</span>`;

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
                        <span>ETA: <strong style="color:#fff;">${f.etaFormatado || '--:--'}</strong></span>
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

    renderAirportsList(airports = []) {
        const container = document.getElementById('fly-airports-list-container');
        if (!container) return;

        container.innerHTML = airports.map(a => {
            const statusClass = a.statusOperacional === 'NORMAL'
                ? 'fly-status-normal'
                : (a.statusOperacional === 'ATENÇÃO' ? 'fly-status-atencao' : 'fly-status-critico');
            const clima = a.clima || {};

            return `
                <div class="fly-airport-card" onclick="window.ritFlyView && window.ritFlyView.abrirVoosAeroporto('${a.iata}')" data-tooltip="Clique para ver o quadro de voos do dia em ${a.iata}">
                    <div class="fly-airport-header">
                        <div>
                            <span class="fly-airport-code">${a.iata}</span>
                            <span style="font-size:11px; color:#cbd5e1; margin-left:4px;">${a.cidade} - ${a.uf}</span>
                        </div>
                        <span class="fly-airport-status-pill ${statusClass}">${a.statusOperacional} (${a.regraVoo})</span>
                    </div>
                    <div style="font-size:10px; color:#94a3b8; margin-bottom:4px;">
                        ${a.nome}
                    </div>
                    <div class="fly-airport-metrics">
                        <div class="fly-metric-item">
                            <span class="fly-metric-label">Chegadas</span>
                            <span class="fly-metric-val">${a.chegadasPrevistas}</span>
                        </div>
                        <div class="fly-metric-item">
                            <span class="fly-metric-label">Partidas</span>
                            <span class="fly-metric-val">${a.partidasPrevistas}</span>
                        </div>
                        <div class="fly-metric-item">
                            <span class="fly-metric-label">Atrasos</span>
                            <span class="fly-metric-val" style="color:${a.voosAtrasados > 0 ? '#f59e0b' : '#10b981'};">${a.voosAtrasados}</span>
                        </div>
                        <div class="fly-metric-item">
                            <span class="fly-metric-label">Pontualidade</span>
                            <span class="fly-metric-val" style="color:#38bdf8;">${a.taxaPontualidadePct}%</span>
                        </div>
                    </div>
                    <div style="margin-top:6px; font-size:10px; color:#64748b; display:flex; justify-content:space-between;">
                        <span>🌤️ METAR: ${clima.temperaturaC || 26}°C (${clima.condicoes || 'Céu Claro'})</span>
                        <span style="color:var(--fly-accent); font-weight:800;">🛫 Ver Voos do Dia →</span>
                    </div>
                </div>
            `;
        }).join('');
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

    renderAlertsList(alerts = []) {
        const container = document.getElementById('fly-alerts-list-container');
        if (!container) return;

        if (alerts.length === 0) {
            container.innerHTML = '<div style="color:#64748b; font-size:11px; text-align:center; padding:15px;">Nenhum alerta crítico ativo.</div>';
            return;
        }

        container.innerHTML = alerts.map(alt => {
            let badgeColor = '#38bdf8';
            if (alt.severidade === 'CRITICO') { badgeColor = '#f43f5e'; }
            else if (alt.severidade === 'ALTO') { badgeColor = '#f59e0b'; }

            const horaFormatada = alt.timestamp ? new Date(alt.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

            return `
                <div style="background:rgba(255,255,255,0.02); border-left:3px solid ${badgeColor}; border-radius:0 6px 6px 0; padding:8px 10px; margin-bottom:6px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:#fff; font-size:11px;">${alt.titulo}</strong>
                        <span style="font-size:9px; color:#64748b;">${horaFormatada}</span>
                    </div>
                    <div style="font-size:10px; color:#cbd5e1; margin-top:3px; line-height:1.4;">
                        ${alt.descricao}
                    </div>
                    ${alt.acaoSugerida ? `
                        <div style="font-size:9px; color:#38bdf8; margin-top:4px; font-weight:bold;">
                            👉 Ação: ${alt.acaoSugerida}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
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
