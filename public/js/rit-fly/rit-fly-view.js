/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Controlador de Interface da Aba RIT FLY
 */

import { RitFlyService } from './rit-fly-service.js';
import { RitFlyMap } from './rit-fly-map.js';

export class RitFlyView {
    constructor() {
        this.service = new RitFlyService();
        this.map = new RitFlyMap('mapRitFly');
        this.currentFilter = 'todos';
        this.searchQuery = '';
        this.pollTimer = null;
        this.isPolling = false;
        this.pollIntervalMs = 30000; // 30 segundos
    }

    init() {
        this.map.init();
        this.bindEvents();
        this.fetchData();
        this.startAutoRefresh();
    }

    bindEvents() {
        // Switch de Abas do Painel Lateral
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

        // Filtros de Categoria de Voos
        const catPills = document.querySelectorAll('.fly-cat-pill');
        catPills.forEach(pill => {
            pill.addEventListener('click', () => {
                catPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.currentFilter = pill.getAttribute('data-cat') || 'todos';
                this.fetchFlightsOnly();
            });
        });

        // Campo de Busca
        const searchInput = document.getElementById('fly-search-input');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.searchQuery = e.target.value.trim();
                    this.fetchFlightsOnly();
                }, 300);
            });
        }

        // Botões de Centralização
        const btnCenterBrasil = document.getElementById('fly-btn-center-br');
        if (btnCenterBrasil) {
            btnCenterBrasil.addEventListener('click', () => this.map.centerBrazil());
        }

        const btnCenterPonte = document.getElementById('fly-btn-center-ponte');
        if (btnCenterPonte) {
            btnCenterPonte.addEventListener('click', () => this.map.centerPonteAerea());
        }

        // Botão de Refresh Manual
        const btnRefresh = document.getElementById('fly-btn-refresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                this.fetchData();
            });
        }

        // Chat RIT FLY AI - Envio de Mensagem
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
        }

        // Perguntas Prontas em 1-Clique na IA
        const presetBtns = document.querySelectorAll('.fly-preset-btn');
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.getAttribute('data-query');
                if (question) {
                    this.sendAIMessage(question);
                }
            });
        });

        // Formulário de Viagens Integradas
        const tripForm = document.getElementById('fly-trip-form');
        if (tripForm) {
            tripForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleTripFormSubmit();
            });
        }
    }

    async fetchData() {
        try {
            const [flightsRes, kpisRes, airportsRes, tripsRes, alertsRes] = await Promise.all([
                this.service.getFlights({ categoria: this.currentFilter, search: this.searchQuery }),
                this.service.getKpis(),
                this.service.getAirports(),
                this.service.getTrips(),
                this.service.getAlerts()
            ]);

            if (flightsRes.ok) {
                this.map.renderFlights(flightsRes.data);
                this.updateFlightsCountBadge(flightsRes.total);
            }

            if (airportsRes.ok) {
                this.map.renderAirports(airportsRes.data);
                this.renderAirportsList(airportsRes.data);
            }

            if (kpisRes.ok) {
                this.renderKpis(kpisRes.data);
            }

            if (tripsRes.ok) {
                this.renderTripsList(tripsRes.data);
            }

            if (alertsRes.ok) {
                this.renderAlertsList(alertsRes.data);
            }

            this.updateLastSyncTimestamp();
        } catch (err) {
            console.error('[RitFlyView] Erro ao sincronizar dados:', err);
        }
    }

    async fetchFlightsOnly() {
        try {
            const res = await this.service.getFlights({ categoria: this.currentFilter, search: this.searchQuery });
            if (res.ok) {
                this.map.renderFlights(res.data);
                this.updateFlightsCountBadge(res.total);
            }
        } catch (err) {
            console.error('[RitFlyView] Erro ao filtrar voos:', err);
        }
    }

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
            const statusClass = a.statusOperacional === 'NORMAL' ? 'fly-status-normal' : (a.statusOperacional === 'ATENÇÃO' ? 'fly-status-atencao' : 'fly-status-critico');
            const clima = a.clima || {};

            return `
                <div class="fly-airport-card" onclick="window.ritFlyView && window.ritFlyView.focarAeroporto('${a.iata}')">
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
                        <span>🌤️ METAR: ${clima.temperaturaC || 26}°C (${clima.condicoes || 'Claro'})</span>
                        <span style="color:#f59e0b;" title="Status de pista não fornecido por METAR">Pista: NOTAM/DECEA</span>
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

            const modeBadge = `<span style="font-size:9px; background:rgba(255,255,255,0.06); padding:1px 4px; border-radius:2px; color:#94a3b8;">${t.data_mode || 'ESTIMADO'}</span>`;

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
            let badgeBg = 'rgba(56, 189, 248, 0.2)';
            let badgeColor = '#38bdf8';
            if (alt.severidade === 'CRITICO') { badgeBg = 'rgba(244, 63, 94, 0.2)'; badgeColor = '#f43f5e'; }
            else if (alt.severidade === 'ALTO') { badgeBg = 'rgba(245, 158, 11, 0.2)'; badgeColor = '#f59e0b'; }

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
        agentMsg.innerHTML = '<span style="color:#38bdf8;">🤖 RIT FLY AI processando telemetria e espaço aéreo...</span>';
        messagesContainer.appendChild(agentMsg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const res = await this.service.askAI(queryText);
            if (res.ok && res.data) {
                // Formata quebras de linha e markdown simples
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
                
                // Limpa formulário
                document.getElementById('fly-form-passageiro').value = '';
                document.getElementById('fly-form-voo').value = '';
                
                // Recarrega viagens
                this.fetchData();
            }
        } catch (err) {
            alert(`Erro ao vincular viagem: ${err.message}`);
        }
    }

    // Ações de contexto
    perguntarVooAI(numeroVoo) {
        // Ativa a aba da IA
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
    }

    updateFlightsCountBadge(count) {
        const badge = document.getElementById('fly-count-badge');
        if (badge) badge.textContent = `${count} AERONAVES`;
    }

    updateLastSyncTimestamp() {
        const el = document.getElementById('fly-last-sync-time');
        if (el) {
            el.textContent = `SYNC: ${new Date().toLocaleTimeString('pt-BR')}`;
        }
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
    }
}
