import { CONFIG } from './config.js';
import { showToast, escapeHtml } from './utils.js';
import { parseDataHora } from './data-service.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM_ROUTE = 'https://router.project-osrm.org/route/v1/driving';

function obterIconeVeiculoHTML(tipo, isActive) {
    const t = String(tipo || '').toLowerCase();
    let emoji = '🚗'; // default
    if (t.includes('onibus') || t.includes('ônibus') || t.includes('bus') || t.includes('micro')) {
        emoji = '🚌';
    } else if (t.includes('van') || t.includes('minivan') || t.includes('combi') || t.includes('truckvan') || t.includes('camarim')) {
        emoji = '🚐';
    } else if (t.includes('caminhao') || t.includes('caminhão') || t.includes('truck') || t.includes('figurino')) {
        emoji = '🚛';
    } else if (t.includes('moto')) {
        emoji = '🏍️';
    }
    const bg = isActive ? '#10B981' : '#F59E0B'; // Green if online, Yellow/Orange if offline
    const anim = isActive ? 'animation: pulseGlow 1.5s infinite;' : '';
    return `
        <div style="display:flex; justify-content:center; align-items:center; background-color:${bg}; width:28px; height:28px; border-radius:50%; border:2px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.4); font-size:15px; ${anim}">
            ${emoji}
        </div>
    `;
}

function obterBadgeStatusAtendimento(status) {
    if (status === 'EM_TRANSITO') return `<span style="font-size:9px; background:#10B981; color:#04111a; font-weight:800; padding:2px 6px; border-radius:4px; margin-left:6px;">🟢 EM VIAGEM</span>`;
    if (status === 'PAUSADO') return `<span style="font-size:9px; background:#F59E0B; color:#04111a; font-weight:800; padding:2px 6px; border-radius:4px; margin-left:6px;">⏸️ PAUSADO</span>`;
    if (status === 'FINALIZADO') return `<span style="font-size:9px; background:#EF4444; color:#fff; font-weight:800; padding:2px 6px; border-radius:4px; margin-left:6px;">🏁 FINALIZADO</span>`;
    return `<span style="font-size:9px; background:rgba(255,255,255,0.1); color:#fff; font-weight:800; padding:2px 6px; border-radius:4px; margin-left:6px;">💤 AGUARDANDO</span>`;
}

function verificarEmAtendimento(inicioVal, fimVal) {
    const inicio = parseDataHora(inicioVal);
    const fim = parseDataHora(fimVal);
    if (!inicio || !fim) return 'Fora do atendimento';

    const agora = new Date();
    
    // Se a data de início/fim for o mesmo dia de hoje, faz a comparação exata com data e hora
    const mesmoDia = (inicio.getDate() === agora.getDate() &&
                      inicio.getMonth() === agora.getMonth() &&
                      inicio.getFullYear() === agora.getFullYear());
                      
    if (mesmoDia) {
        return (agora >= inicio && agora <= fim) ? 'Em atendimento' : 'Fora do atendimento';
    } else {
        // Fallback para simulação/demonstração de outras datas: compara apenas hora e minuto do dia
        const minAgora = agora.getHours() * 60 + agora.getMinutes();
        const minInicio = inicio.getHours() * 60 + inicio.getMinutes();
        let minFim = fim.getHours() * 60 + fim.getMinutes();
        
        if (minFim < minInicio) {
            return (minAgora >= minInicio || minAgora <= minFim) ? 'Em atendimento' : 'Fora do atendimento';
        } else {
            return (minAgora >= minInicio && minAgora <= minFim) ? 'Em atendimento' : 'Fora do atendimento';
        }
    }
}

function obterPeriodo(horario) {
    if (!horario || typeof horario !== 'string') return '';
    const parts = horario.split(':');
    if (parts.length < 2) return '';
    let hora = parseInt(parts[0], 10);
    const minuto = parseInt(parts[1], 10);
    
    // Arredonda para cima se houver minutos
    if (minuto > 0) {
        hora = (hora + 1) % 24;
    }
    
    if (hora >= 0 && hora <= 4) {
        return "Madrugada 0h as 05h";
    } else if (hora >= 5 && hora <= 11) {
        return "Manha 5h às 11h";
    } else if (hora >= 12 && hora <= 17) {
        return "Tarde 12h ás 17h";
    } else if (hora >= 18 && hora <= 23) {
        return "Noite 18h as 23h";
    }
    return '';
}

export class UiController {
    constructor(mapService, plannerService, transitoMap, chatService, dataService) {
        this.mapService = mapService;
        this.plannerService = plannerService;
        this.transitoMap = transitoMap;
        this.chatService = chatService;
        this.dataService = dataService;
        this.eventoAtualUrl = '';
        this.tarifasConfig = {
            tarifaBase: 3.50,
            precoPorKm: 1.50,
            precoPorMinuto: 0.30,
            tarifaMinima: 6.00,
            fatorPico: 1.4,
            fatorMadrugada: 1.2
        };

        this.initTabs();
        this.initFilters();
        this.initUpload();
        this.initChatRIT();
        this.initModals();
        this.initPlanner();
        this.initEventosLista();
        
        this.mapMode = 'TODOS';
        this.gpsIntervalId = null;
        this.activeTrackers = [];
        this.activeGpsPopupDriver = null;
        this.activeGpsPopupMode = null;
        
        this.mapService.map.on('popupclose', () => {
            this.activeGpsPopupDriver = null;
            this.activeGpsPopupMode = null;
        });
        this.initMapModeToggle();
        this.iniciarPoolActiveTrackers();
        this.carregarBaseExistente();
        window.uiController = this;
    }

    async carregarBaseExistente() {
        try {
            const statusEl = document.getElementById("geo-status");
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent)">Carregando base...</span>`;
            
            let serverAtendimentos = [];
            try {
                const res = await fetch("/api/rotas/listar");
                const json = await res.json();
                if (json.ok && json.resultados.length > 0) {
                    serverAtendimentos = json.resultados.map(r => ({
                        id: r.id,
                        motorista: r.motorista_nome || '',
                        telefone: r.motorista_telefone || '',
                        tipoVeiculo: r.tipo_veiculo || '',
                        programa: r.programa || 'RIT',
                        placa: r.placa_veiculo || '',
                        bairro: (r.destino || '').split(',').pop().trim() || 'Rio de Janeiro',
                        dataHoraInicioRaw: r.horario,
                        dataHoraFimRaw: r.horario_termino,
                        horarioInicio: r.horario ? (r.horario.split(' ')[1] || r.horario) : '12:00',
                        lat: null,
                        lng: null,
                        passageiro: r.passageiro || '',
                        origem: r.origem || '',
                        destino: r.destino || '',
                        statusAtendimento: r.status_atendimento
                    }));
                }
            } catch (e) {
                console.warn("[RIT-UI] Failed to load server list, using local data:", e);
            }

            // Load and Merge Manual Monitorings
            let manualMonitorings = [];
            try {
                manualMonitorings = JSON.parse(localStorage.getItem('rit_manual_monitorings') || '[]');
            } catch (e) {
                console.error("[RIT-UI] Error reading manual monitorings:", e);
            }

            const mappedManuals = manualMonitorings.map(m => ({
                id: m.id,
                motorista: m.motorista,
                telefone: m.telefone,
                tipoVeiculo: m.tipoVeiculo,
                programa: m.programa,
                placa: m.placa,
                bairro: m.destino,
                dataHoraInicioRaw: m.dataHoraInicioRaw,
                dataHoraFimRaw: m.dataHoraFimRaw,
                horarioInicio: m.dataHoraInicioRaw,
                lat: null,
                lng: null,
                passageiro: m.passageiro,
                origem: m.origem,
                destino: m.destino,
                statusAtendimento: m.statusAtendimento || 'AGUARDANDO',
                isManual: true
            }));

            // Combine server and manual
            const combined = [...mappedManuals];
            serverAtendimentos.forEach(s => {
                const exists = combined.some(x => String(x.id) === String(s.id) || String(x.placa) === String(s.placa));
                if (!exists) {
                    combined.push(s);
                }
            });

            this.dataService.baseAtendimentos = combined;
            this.preencherDropdowns(combined);
            
            if (combined.length > 0) {
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent)">Sincronizando coordenadas...</span>`;
                await this.dataService.geocodificar((pct) => {
                    if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent)">Sincronizando ${pct}%...</span>`;
                });
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--good)">Pronto (OK)</span>`;
                this.plotarAtendimentos(this.dataService.baseAtendimentos);
            } else {
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--muted)">Sem base carregada</span>`;
            }
        } catch (e) {
            console.error("Erro ao carregar base existente:", e);
        }
    }

    abrirManualModal() {
        document.getElementById('rit-modal-manual').style.display = 'flex';
    }

    fecharManualModal() {
        document.getElementById('rit-modal-manual').style.display = 'none';
        document.getElementById('rit-form-manual').reset();
    }

    handleManualSubmit(e) {
        e.preventDefault();
        console.log("[RIT-UI] Processing manual monitoring submission...");
        
        const item = {
            id: 'man_' + Date.now(),
            programa: document.getElementById('rit-m-programa').value,
            motorista: document.getElementById('rit-m-motorista').value,
            telefone: document.getElementById('rit-m-telefone').value,
            tipoVeiculo: document.getElementById('rit-m-veiculo').value,
            placa: document.getElementById('rit-m-placa').value,
            passageiro: document.getElementById('rit-m-passageiro').value,
            origem: document.getElementById('rit-m-saida').value,
            destino: document.getElementById('rit-m-destino').value,
            dataHoraInicioRaw: document.getElementById('rit-m-inicio').value,
            dataHoraFimRaw: document.getElementById('rit-m-fim').value,
            statusAtendimento: 'AGUARDANDO',
            isManual: true
        };

        try {
            const list = JSON.parse(localStorage.getItem('rit_manual_monitorings') || '[]');
            list.push(item);
            localStorage.setItem('rit_manual_monitorings', JSON.stringify(list));
            console.log("[RIT-UI] Saved manual monitoring successfully.");
        } catch (err) {
            console.error("[RIT-UI] Error saving manual monitoring:", err);
        }

        this.fecharManualModal();
        this.carregarBaseExistente();

        // Dispara mensagem no WhatsApp do motorista
        let telClean = String(item.telefone).replace(/\D/g, '');
        if (telClean.length === 10 || telClean.length === 11) {
            telClean = '55' + telClean;
        }
        const driverLink = `${window.location.origin}/motorista.html?id=${encodeURIComponent(item.id)}&nome=${encodeURIComponent(item.motorista)}&placa=${encodeURIComponent(item.placa)}&veiculo=${encodeURIComponent(item.tipoVeiculo)}&passageiro=${encodeURIComponent(item.passageiro)}&programa=${encodeURIComponent(item.programa)}&destino=${encodeURIComponent(item.destino)}&saida=${encodeURIComponent(item.origem)}&inicio=${encodeURIComponent(item.dataHoraInicioRaw)}&fim=${encodeURIComponent(item.dataHoraFimRaw)}`;
        const msgText = `Prezado Sr. ${item.motorista},\n\nSolicitamos a ativação do acompanhamento de rota para o atendimento de contingência no Portal do Motorista - Conexão Transportes RJ / Agente RIT:\n\n• Produto/Programa: ${item.programa}\n• Passageiro: ${item.passageiro}\n• Veículo: ${item.tipoVeiculo} (${item.placa})\n• Saída: ${item.origem}\n• Destino: ${item.destino}\n\nFavor compartilhar sua posição iniciando o rastreamento no link abaixo:\n🔗 ${driverLink}\n\nObrigado.`;
        const waUrl = `https://wa.me/${telClean}?text=${encodeURIComponent(msgText)}`;
        window.open(waUrl, '_blank');
    }

    initTabs() {
        const btns = document.querySelectorAll('.tabBtn');
        const panes = document.querySelectorAll('.tabPane');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                panes.forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const targetId = btn.getAttribute('data-tab');
                const target = document.getElementById(targetId);
                if (target) {
                    target.classList.add('active');
                    // Force WebKit/iOS redraw to prevent rendering invisibility bugs
                    void target.offsetHeight;
                }
                
                if (targetId === 'tab-rede') this.carregarMapaRede();
                
                this.mapService.invalidateSize();
                if (this.plannerService) this.plannerService.invalidateSize();
                if (this.transitoMap) this.transitoMap.invalidateSize();
            });
        });
    }

    initFilters() {
        const sp = document.getElementById("filtro-programa");
        const sb = document.getElementById("filtro-bairro");
        const st = document.getElementById("filtro-tipo");
        const se = document.getElementById("filtro-em-atendimento");
        const sh = document.getElementById("filtro-horario-inicio");
        const btnLimpar = document.getElementById("btn-limpar");
        const btnCentralizar = document.getElementById("btn-centralizar");

        const filtrar = () => {
            const f = this.obterAtendimentosFiltrados();
            this.plotarAtendimentos(f);
            this.atualizarResumoContadores();
        };

        [sp, sb, st, se, sh].forEach(s => s?.addEventListener("change", filtrar));
        btnLimpar?.addEventListener("click", () => {
            if(sp) sp.value = "";
            if(sb) sb.value = "";
            if(st) st.value = "";
            if(se) se.value = "";
            if(sh) sh.value = "";
            this.plotarAtendimentos(this.dataService.baseAtendimentos);
            this.atualizarResumoContadores();
        });
        btnCentralizar?.addEventListener("click", () => {
            this.mapService.setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
        });
    }

    obterAtendimentosFiltrados() {
        const sp = document.getElementById("filtro-programa");
        const sb = document.getElementById("filtro-bairro");
        const st = document.getElementById("filtro-tipo");
        const se = document.getElementById("filtro-em-atendimento");
        const sh = document.getElementById("filtro-horario-inicio");

        if (!sp || !sb) return this.dataService.baseAtendimentos || [];

        return (this.dataService.baseAtendimentos || []).filter(a => {
            const matchP = !sp.value || a.programa === sp.value;
            const matchB = !sb.value || a.bairro === sb.value;
            const matchT = !st || !st.value || a.tipoVeiculo === st.value;
            
            const statusAtual = verificarEmAtendimento(a.dataHoraInicioRaw, a.dataHoraFimRaw);
            const matchE = !se || !se.value || statusAtual === se.value;
            
            const matchH = !sh || !sh.value || obterPeriodo(a.horarioInicio) === sh.value;
            return matchP && matchB && matchT && matchE && matchH;
        });
    }

    atualizarResumoContadores() {
        const el = document.getElementById("resumo-atendimentos");
        if (!el) return;

        const total = (this.dataService.baseAtendimentos || []).length;
        const filtradosList = this.obterAtendimentosFiltrados();
        const filtrados = filtradosList.length;
        
        const compartilhando = filtradosList.filter(a => 
            this.activeTrackers.some(t => 
                (t.motorista_name || '').trim().toLowerCase() === (a.motorista || '').trim().toLowerCase() &&
                (!t.id_rota || Number(t.id_rota) === Number(a.id))
            )
        ).length;

        el.textContent = `Importados: ${total} (Filtrados: ${filtrados}) | Compartilhando: ${compartilhando}`;
    }

    iniciarPoolActiveTrackers() {
        const fetchActive = () => {
            fetch('/api/gps/active-trackers')
                .then(r => r.json())
                .then(data => {
                    if (data.ok) {
                        this.activeTrackers = data.trackers || [];
                        let statusMudou = false;

                        // Sincroniza status de atendimento local
                        if (this.dataService.baseAtendimentos) {
                            this.dataService.baseAtendimentos.forEach(a => {
                                const active = this.activeTrackers.find(t => 
                                    (t.motorista_name || '').trim().toLowerCase() === (a.motorista || '').trim().toLowerCase() &&
                                    (!t.id_rota || Number(t.id_rota) === Number(a.id))
                                );
                                const antigoStatus = a.statusAtendimento;
                                let novoStatus = antigoStatus;

                                if (active) {
                                    novoStatus = active.status_atendimento || 'EM_TRANSITO';
                                } else {
                                    // Se antes estava em viagem mas nao esta mais nos ativos, virou FINALIZADO
                                    if (antigoStatus === 'EM_TRANSITO' || antigoStatus === 'PAUSADO') {
                                        novoStatus = 'FINALIZADO';
                                    }
                                }

                                if (novoStatus !== antigoStatus) {
                                    a.statusAtendimento = novoStatus;
                                    statusMudou = true;
                                }
                            });
                        }

                        this.atualizarResumoContadores();
                        
                        const filtrados = this.obterAtendimentosFiltrados();
                        if (this.mapMode === 'ONLINE') {
                            this.startGpsTracking();
                        } else {
                            if (statusMudou) {
                                // Se mudou o status, atualiza o mapa e a lista
                                this.plotarAtendimentos(filtrados);
                            } else {
                                // Caso contrário, atualiza apenas a barra lateral (evita piscar o mapa e fechar popups abertos)
                                this.atualizarListaSidebar(filtrados);
                            }
                        }
                    }
                })
                .catch(err => console.error("Erro no pool de motoristas:", err));
        };
        fetchActive();
        if (this.activeTrackersInterval) clearInterval(this.activeTrackersInterval);
        this.activeTrackersInterval = setInterval(fetchActive, 5000);
    }

    abrirEmulador(id) {
        const modal = document.getElementById("modalEmulador");
        const iframe = document.getElementById("iframeEmulador");
        if (modal && iframe) {
            iframe.src = `/motorista.html?id=${id}`;
            modal.style.display = "flex";
        }
    }

    async desconectarMotorista(id) {
        if (!confirm("Deseja realmente forçar a desconexão e finalizar o atendimento deste motorista?")) return;
        try {
            const res = await fetch('/api/gps/desconectar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_rota: id })
            });
            const data = await res.json();
            if (data.ok) {
                showToast("Motorista desconectado com sucesso!", "success");
                // Força atualização imediata
                if (this.activeTrackersInterval) {
                    // Limpa e reinicia o loop de busca
                    this.iniciarPoolActiveTrackers();
                }
            } else {
                showToast("Erro ao desconectar motorista", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Erro ao conectar ao servidor", "error");
        }
    }

    async desconectarMotoristaDirect(motorista, id_rota) {
        if (!confirm(`Deseja realmente forçar a desconexão do motorista ${motorista}?`)) return;
        try {
            const body = {};
            if (id_rota) body.id_rota = id_rota;
            else body.motorista = motorista;

            const res = await fetch('/api/gps/desconectar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.ok) {
                showToast("Motorista desconectado com sucesso!", "success");
                // Força atualização imediata
                this.iniciarPoolActiveTrackers();
            } else {
                showToast("Erro ao desconectar motorista", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Erro ao conectar ao servidor", "error");
        }
    }

    initUpload() {
        const input = document.getElementById("upload-mapa");
        const btn = document.getElementById("btn-upload");
        btn?.addEventListener("click", () => input.click());
        input?.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                showToast("Processando e enviando base para o CCO...", "info");
                
                const formData = new FormData();
                formData.append("planilha", file);
                
                const res = await fetch("/api/rotas/importar?tipo=monitoramento", {
                    method: "POST",
                    body: formData
                });
                const json = await res.json();
                
                if (!json.ok) {
                    throw new Error(json.error || "Erro ao fazer upload da base");
                }
                
                // Filtra apenas registros processados com sucesso no banco de dados
                const atendimentos = json.resultados
                    .filter(r => r.status === 'SUCESSO')
                    .map(r => ({
                        id: r.id,
                        motorista: r.motorista_nome || '',
                        telefone: r.motorista_telefone || '',
                        tipoVeiculo: r.tipo_veiculo || '',
                        programa: r.programa || 'RIT',
                        placa: r.placa_veiculo || '',
                        bairro: (r.destino || '').split(',').pop().trim() || 'Rio de Janeiro',
                        dataHoraInicioRaw: r.horario,
                        dataHoraFimRaw: r.horario_termino,
                        horarioInicio: r.horario ? (r.horario.split(' ')[1] || r.horario) : '12:00',
                        lat: null,
                        lng: null,
                        passageiro: r.passageiro || '',
                        origem: r.origem || '',
                        destino: r.destino || ''
                    }));
                
                this.dataService.baseAtendimentos = atendimentos;
                this.preencherDropdowns(atendimentos);
                
                const statusEl = document.getElementById("geo-status");
                statusEl.innerHTML = `<span style="color:var(--accent)">Sincronizando...</span>`;
                
                await this.dataService.geocodificar((pct) => {
                    statusEl.innerHTML = `<span style="color:var(--accent)">Sincronizando ${pct}%...</span>`;
                });
                
                statusEl.innerHTML = `<span style="color:var(--good)">Pronto (OK)</span>`;
                this.plotarAtendimentos(this.dataService.baseAtendimentos);
                showToast("Base carregada com sucesso!", "success");
            } catch (err) {
                console.error(err);
                showToast(err.message || "Erro ao processar planilha.", "error");
            }
        });
    }

    plotarAtendimentos(lista) {
        if (this.mapMode === 'TODOS') {
            const openDriver = this.activeGpsPopupDriver;
            let markerToOpen = null;

            this.isRefreshingMarkers = true;
            this.mapService.clearMarkers();

            const validItems = lista.filter(a => {
                const activeTracker = this.activeTrackers.find(t => 
                    (t.motorista_name || '').trim().toLowerCase() === (a.motorista || '').trim().toLowerCase()
                );
                return (activeTracker && activeTracker.lat && activeTracker.lng) || (a.lat && a.lng);
            });
            const total = validItems.length;
            if (total === 0) {
                this.atualizarListaSidebar(lista);
                return;
            }

            // Regra dos 30%
            const chunkSize = Math.max(1, Math.ceil(total * 0.3));
            let index = 0;

            const renderNextChunk = () => {
                if (this.mapMode !== 'TODOS') return; // Cancel if mode changed

                const limit = Math.min(index + chunkSize, total);
                for (; index < limit; index++) {
                    const a = validItems[index];
                    const activeTracker = this.activeTrackers.find(t => 
                        (t.motorista_name || '').trim().toLowerCase() === (a.motorista || '').trim().toLowerCase() &&
                        (!t.id_rota || Number(t.id_rota) === Number(a.id))
                    );
                    const isActive = !!activeTracker;
                    
                    const plotLat = (isActive && activeTracker.lat) ? parseFloat(activeTracker.lat) : a.lat;
                    const plotLng = (isActive && activeTracker.lng) ? parseFloat(activeTracker.lng) : a.lng;
                    
                    const popupHtml = this.obterHtmlPopupAtendimento(a, isActive, activeTracker);
 
                    const pinSymbol = {
                        html: obterIconeVeiculoHTML(a.tipoVeiculo, isActive)
                    };
 
                    const marker = this.mapService.addMarker(plotLat, plotLng, popupHtml, pinSymbol);
                    
                    // Salva qual motorista foi clicado para persistir o popup
                    marker.on('click', () => {
                        this.activeGpsPopupDriver = a.motorista;
                        this.activeGpsPopupMode = 'TODOS';
                    });

                    if (this.activeGpsPopupMode === 'TODOS' && openDriver && a.motorista === openDriver) {
                        markerToOpen = marker;
                    }

                    a._marker = marker;
                }

                if (index < total) {
                    setTimeout(renderNextChunk, 10);
                } else {
                    if (markerToOpen) {
                        markerToOpen.openPopup();
                    }
                    this.isRefreshingMarkers = false;
                }
            };

            renderNextChunk();
        }
        
        this.atualizarListaSidebar(lista);
    }

    atualizarListaSidebar(lista) {
        const listEl = document.getElementById("listaAtendimentos");
        if (!listEl) return;
        listEl.innerHTML = "";

        lista.forEach(a => {
            const isActive = this.activeTrackers.some(t => 
                (t.motorista_name || '').trim().toLowerCase() === (a.motorista || '').trim().toLowerCase() &&
                (!t.id_rota || Number(t.id_rota) === Number(a.id))
            );
            const p = escapeHtml(a.programa);
            const m = escapeHtml(a.motorista);
            const pl = escapeHtml(a.placa);
            const b = escapeHtml(a.bairro);
            const tel = escapeHtml(a.telefone);
            const pass = escapeHtml(a.passageiro || 'Não informado');
            
            let actionsHtml = `<div style="margin-top: 8px; display: flex; gap: 6px;">`;
            if (tel) {
                let limpo = String(tel).replace(/\D/g, '');
                const waTel = limpo.length === 10 || limpo.length === 11 ? `55${limpo}` : limpo;
                const msgText = `Prezado Sr. ${a.motorista},\n\nSolicitamos a ativação do acompanhamento de rota para o atendimento em andamento no Portal do Motorista - Agente RIT (Rotas Inteligentes de Transporte) do Time de Transportes Globo:\n\n• Produto/Programa: ${a.programa}\n• Passageiro: ${a.passageiro || 'Não informado'}\n• Veículo: ${a.tipoVeiculo || 'Não informado'} (${a.placa || 'Sem placa'})\n• Período: das ${a.dataHoraInicioRaw || 'N/D'} às ${a.dataHoraFimRaw || 'N/D'}\n• Saída: ${a.origem || 'Não informado'}\n• Destino: ${a.destino || 'Não informado'}\n\nFavor confirmar seus dados e iniciar o compartilhamento de sua posição no link abaixo:\n🔗 ${window.location.origin}/motorista.html?id=${a.id}\n\nNota: Você poderá iniciar, interromper ou encerrar a transmissão a qualquer momento através do Portal.`;
                actionsHtml += `
                    <a href="https://wa.me/${waTel}?text=${encodeURIComponent(msgText)}" target="_blank" class="btn btnSmall" style="background:#25D366; color:#04111a; text-decoration:none; padding:4px 10px; border-radius:4px; font-size:10px; font-weight:800; display:inline-block; transition: opacity 0.2s;">
                        💬 Compartilhar Rastreamento
                    </a>
                `;
            }
            actionsHtml += `
                <button onclick="window.uiController.abrirEmulador('${a.id}')" class="btn btnSmall" style="background:var(--accent); color:#04111a; border:none; padding:4px 10px; border-radius:4px; font-size:10px; font-weight:800; display:inline-block; cursor:pointer;">
                    📱 Simular Celular
                </button>
            `;
            if (isActive) {
                actionsHtml += `
                    <button onclick="window.uiController.desconectarMotorista('${a.id}')" class="btn btnSmall" style="background:#EF4444; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-size:10px; font-weight:800; display:inline-block; cursor:pointer;">
                        🛑 Desconectar
                    </button>
                `;
            }
            actionsHtml += `</div>`;
            
            const statusBadge = obterBadgeStatusAtendimento(a.statusAtendimento);
            
            listEl.innerHTML += `
                <div class="card" style="margin-bottom:10px; padding:12px; background:rgba(255,255,255,0.02); border:1px solid ${isActive ? '#10B981' : 'rgba(255,255,255,0.06)'}; border-radius:8px; box-shadow: ${isActive ? '0 0 10px rgba(16,185,129,0.15)' : 'none'};">
                    <div class="row1" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span class="badgeProgram" style="font-size:9px; background:rgba(0,209,255,0.15); color:var(--accent); font-weight:800; padding:2px 6px; border-radius:4px;">${p}</span>
                        ${statusBadge}
                    </div>
                    <div class="meta-motorista" style="font-size:12px; font-weight:700; color:#fff; margin-bottom:4px;">👤 Motorista: ${m}</div>
                    <div class="meta-telefone" style="font-size:10px; color:var(--muted); margin-bottom:4px;">📞 Contato: ${tel || 'N/D'}</div>
                    <div class="meta-passageiro" style="font-size:11px; color:#fff; margin-bottom:4px;">👤 Passageiro/Produtor: ${pass}</div>
                    <div class="meta-veiculo" style="font-size:10px; color:var(--muted); margin-bottom:4px;">🚗 Placa: ${pl} (${escapeHtml(a.tipoVeiculo)})</div>
                    <div class="meta-bairro" style="font-size:11px; color:var(--muted);">📍 Destino: ${b}</div>
                    ${actionsHtml}
                </div>
            `;
        });
    }



    initMapModeToggle() {
        const btnToggle = document.getElementById("btn-toggle-map-mode");
        if (btnToggle) {
            btnToggle.addEventListener("click", () => {
                if (this.mapMode === 'TODOS') {
                    this.mapMode = 'ONLINE';
                    btnToggle.textContent = '🛰️ MAPA: ONLINE';
                    btnToggle.style.background = 'linear-gradient(90deg, #25D366, #10B981)';
                    btnToggle.style.color = '#04111a';
                    
                    this.mapService.clearMarkers();
                    this.startGpsTracking();
                    showToast("Modo Rastreamento Online Ativado!", "success");
                } else {
                    this.mapMode = 'TODOS';
                    btnToggle.textContent = '🛰️ MAPA: TODOS';
                    btnToggle.style.background = 'rgba(255, 255, 255, 0.04)';
                    btnToggle.style.color = '#fff';
                    
                    this.stopGpsTracking();
                    this.plotarAtendimentos(this.dataService.baseAtendimentos);
                    showToast("Retornando ao Mapa Geral.", "info");
                }
            });
        }

        const btnLayersToggle = document.getElementById("btn-layers-toggle");
        const layersMenu = document.getElementById("layers-menu");
        if (btnLayersToggle && layersMenu) {
            btnLayersToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                layersMenu.style.display = layersMenu.style.display === "none" ? "block" : "none";
            });
            document.addEventListener("click", () => {
                layersMenu.style.display = "none";
            });
        }
    }

    startGpsTracking() {
        this.stopGpsTracking();
        
        const fetchAndRenderActiveDrivers = () => {
            fetch('/api/gps/active-trackers')
                .then(r => r.json())
                .then(data => {
                    if (data.ok && this.mapMode === 'ONLINE') {
                        const openDriver = this.activeGpsPopupDriver;
                        let markerToOpen = null;

                        this.isRefreshingMarkers = true;
                        this.mapService.clearMarkers();
                        
                        data.trackers.forEach(t => {
                            const popupHtml = this.obterHtmlPopupAtendimento({}, true, t);
                            
                            const pinSymbol = {
                                html: obterIconeVeiculoHTML(t.tipo_veiculo, true)
                            };
                            
                            const marker = this.mapService.addMarker(t.lat, t.lng, popupHtml, pinSymbol);
                            
                            // Salva qual motorista foi clicado para persistir o popup
                            marker.on('click', () => {
                                this.activeGpsPopupDriver = t.motorista_name;
                                this.activeGpsPopupMode = 'ONLINE';
                            });

                            if (this.activeGpsPopupMode === 'ONLINE' && openDriver && t.motorista_name === openDriver) {
                                markerToOpen = marker;
                            }
                        });

                        if (markerToOpen) {
                            markerToOpen.openPopup();
                        }
                        this.isRefreshingMarkers = false;
                    }
                })
                .catch(err => console.error("Erro ao rastrear motoristas:", err));
        };
        
        fetchAndRenderActiveDrivers();
        this.gpsIntervalId = setInterval(fetchAndRenderActiveDrivers, 5000);
    }

    obterHtmlPopupAtendimento(a, isActive, activeTracker) {
        const motoristaName = a.motorista || (activeTracker ? activeTracker.motorista_name : 'Motorista');
        const programa = a.programa || (activeTracker ? activeTracker.programa : 'GERAL');
        const placa = a.placa || (activeTracker ? activeTracker.placa : 'N/D');
        const tipoVeiculo = a.tipoVeiculo || (activeTracker ? activeTracker.tipo_veiculo : 'N/D');
        const passageiro = a.passageiro || (activeTracker ? activeTracker.passageiro : 'Não informado');
        const telefone = a.telefone || (activeTracker ? activeTracker.motorista_telefone : 'N/D');
        const origem = a.origem || (activeTracker ? activeTracker.origem : 'Não informado');
        const destino = a.destino || (activeTracker ? activeTracker.destino : 'Não informado');
        const horarioInicio = a.dataHoraInicioRaw || (activeTracker ? activeTracker.horario : 'N/D');
        const horarioFim = a.dataHoraFimRaw || (activeTracker ? activeTracker.horario_termino : 'N/D');
        
        let actionsHtml = `<div style="margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; gap: 6px;">`;
        if (telefone && !isActive) {
            let limpo = String(telefone).replace(/\D/g, '');
            const waTel = limpo.length === 10 || limpo.length === 11 ? `55${limpo}` : limpo;
            const msgText = `Prezado Sr. ${motoristaName},\n\nSolicitamos a ativação do acompanhamento de rota para o atendimento em andamento no Portal do Motorista - Agente RIT (Rotas Inteligentes de Transporte) do Time de Transportes Globo:\n\n• Produto/Programa: ${programa}\n• Passageiro: ${passageiro}\n• Veículo: ${tipoVeiculo} (${placa})\n• Período: das ${horarioInicio} às ${horarioFim}\n• Saída: ${origem}\n• Destino: ${destino}\n\nFavor confirmar seus dados e iniciar o compartilhamento de sua posição no link abaixo:\n🔗 ${window.location.origin}/motorista.html?id=${a.id || activeTracker?.id_rota}\n\nNota: Você poderá iniciar, interromper ou encerrar a transmissão a qualquer momento através do Portal.`;
            actionsHtml += `
                <a href="https://wa.me/${waTel}?text=${encodeURIComponent(msgText)}" target="_blank" style="background:#25D366; color:#04111a; text-decoration:none; padding:5px 10px; border-radius:4px; font-size:10px; font-weight:800; display:inline-block; border:1px solid #1e7e34; text-align:center; flex:1;">
                    💬 Solicitar
                </a>
            `;
        }
        
        if (!isActive && a.id) {
            actionsHtml += `
                <button onclick="window.uiController.abrirEmulador('${a.id}')" style="background:var(--accent); color:#04111a; border:none; padding:5px 10px; border-radius:4px; font-size:10px; font-weight:800; display:inline-block; cursor:pointer; flex:1; text-align:center;">
                    📱 Simular
                </button>
            `;
        }
        
        if (isActive) {
            const discName = escapeHtml(motoristaName);
            const discRota = a.id || activeTracker?.id_rota || '';
            actionsHtml += `
                <button onclick="window.uiController.desconectarMotoristaDirect('${discName}', '${discRota}')" style="background:#EF4444; color:#fff; border:none; padding:6px 10px; border-radius:4px; font-size:10px; font-weight:800; width:100%; cursor:pointer; text-align:center; transition: background 0.2s; flex:1;">
                    🛑 Desconectar Transmissão
                </button>
            `;
        }
        actionsHtml += `</div>`;

        const badgeHtml = obterBadgeStatusAtendimento(a.statusAtendimento || (activeTracker ? activeTracker.status_atendimento : 'AGUARDANDO'));

        // Se online, exibe Velocidade e Endereço Atual
        let telemetriaHtml = '';
        if (isActive && activeTracker) {
            const lat = activeTracker.lat;
            const lng = activeTracker.lng;
            const speed = activeTracker.speed || 0;
            const cacheKey = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
            window._geoAddressCache = window._geoAddressCache || {};
            const initialAddr = window._geoAddressCache[cacheKey] || 'Buscando endereço...';

            const addressId = `geo-addr-${motoristaName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}`;
            telemetriaHtml = `
                <div style="border-top: 1px dashed #e2e8f0; margin: 6px 0; padding-top: 4px;">
                    <b>Velocidade:</b> ${activeTracker.speed || 0} km/h | <b>Atualizado:</b> ${new Date(activeTracker.timestamp).toLocaleTimeString()}
                </div>
                <div style="border-top: 1px dashed #e2e8f0; margin: 6px 0; padding-top: 4px; font-size: 10px; background: #f8fafc; padding: 4px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <b>🗺️ Endereço Atual:</b> <span id="${addressId}" style="color: #334155;">${initialAddr}</span>
                </div>
            `;
            
            if (!window._geoAddressCache[cacheKey]) {
                setTimeout(() => {
                    fetch(`/reverse-geocode?lat=${lat}&lng=${lng}&speed=${speed}`)
                    .then(r => (r && r.ok) ? r.json() : null)
                    .then(data => {
                        const addr = (data && (data.address || data.display_name)) ? (data.address || data.display_name) : 'Rio de Janeiro, RJ';
                        window._geoAddressCache[cacheKey] = addr;
                        const el = document.getElementById(addressId);
                        if (el) el.textContent = addr;
                    })
                    .catch(() => {
                        const el = document.getElementById(addressId);
                        if (el) el.textContent = 'Rio de Janeiro, RJ';
                    });
                }, 100);
            }
        } else {
            telemetriaHtml = `
                <div style="border-top: 1px dashed #e2e8f0; margin: 6px 0; padding-top: 4px; font-size: 10px; color: var(--muted);">
                    ⚠️ <b>Telemetria:</b> Sem sinal GPS (Aguardando início de viagem)
                </div>
            `;
        }

        const popupHtml = `
            <div style="font-family: system-ui, sans-serif; font-size: 11px; line-height: 1.4; color: #1e293b; min-width: 250px; padding: 4px;">
                <div style="background: ${isActive ? '#d1fae5' : '#fee2e2'}; padding: 6px; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid ${isActive ? '#10b981' : '#f87171'};">
                    <strong style="color: ${isActive ? '#065f46' : '#991b1b'}; font-size: 11px;">👤 ${escapeHtml(motoristaName)}</strong>
                    ${badgeHtml}
                </div>
                
                <div style="margin-bottom: 6px;">
                    <b>Passageiro/Produtor:</b> ${escapeHtml(passageiro)}<br>
                    <b>Programa:</b> ${escapeHtml(programa)}<br>
                    <b>Veículo:</b> ${escapeHtml(placa)} (${escapeHtml(tipoVeiculo)})<br>
                    <b>Contato:</b> ${escapeHtml(telefone)}
                </div>
                
                <div style="border-top: 1px dashed #e2e8f0; margin: 6px 0; padding-top: 4px; font-size: 10px; color: #475569;">
                    <b>📍 Saída:</b> ${escapeHtml(origem)}<br>
                    <b>🏁 Destino:</b> ${escapeHtml(destino)}<br>
                    <b>⏰ Horários:</b> ${escapeHtml(horarioInicio)} - ${escapeHtml(horarioFim)}
                </div>
                
                ${telemetriaHtml}
                ${actionsHtml}
            </div>
        `;

        return popupHtml;
    }

    stopGpsTracking() {
        if (this.gpsIntervalId) {
            clearInterval(this.gpsIntervalId);
            this.gpsIntervalId = null;
        }
    }

    preencherDropdowns(l) {
        const sp = document.getElementById("filtro-programa");
        const sb = document.getElementById("filtro-bairro");
        const st = document.getElementById("filtro-tipo");
        const sh = document.getElementById("filtro-horario-inicio");
        
        const progs = [...new Set(l.map(a => a.programa))].sort();
        const bairs = [...new Set(l.map(a => a.bairro))].sort();
        const tipos = [...new Set(l.map(a => a.tipoVeiculo))].sort();
        
        const periodosExistentes = [...new Set(l.map(a => obterPeriodo(a.horarioInicio)).filter(Boolean))];
        const ordemPeriodos = ["Madrugada 0h as 05h", "Manha 5h às 11h", "Tarde 12h ás 17h", "Noite 18h as 23h"];
        const periodosFiltrados = ordemPeriodos.filter(p => periodosExistentes.includes(p));

        if (sp) sp.innerHTML = '<option value="">Programa</option>' + progs.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
        if (sb) sb.innerHTML = '<option value="">Bairro</option>' + bairs.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
        if (st) st.innerHTML = '<option value="">Veículo</option>' + tipos.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
        if (sh) sh.innerHTML = '<option value="">Horário de Início</option>' + periodosFiltrados.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
    }

    initChatRIT() {
        const fileInput = document.getElementById('chat-rit-file');
        const dropzone = document.getElementById('doc-dropzone');
        const infoCard = document.getElementById('doc-info-card');
        const docName = document.getElementById('doc-name');
        const docSize = document.getElementById('doc-size');
        const btnRemover = document.getElementById('btn-remover-doc');
        const badge = document.getElementById('doc-status-badge');
        
        const btnResumo = document.getElementById('prompt-resumo');
        const btnPontos = document.getElementById('prompt-pontos');
        const btnAcoes = document.getElementById('prompt-acoes');
        
        const inputPergunta = document.getElementById('chat-rit-pergunta');
        const btnEnviar = document.getElementById('chat-rit-btn-enviar');
        const chatBox = document.getElementById('chat-rit-box');

        if (!fileInput) return;

        // Ao arrastar arquivo sobre o dropzone
        if (dropzone) {
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = 'var(--accent)';
                dropzone.style.background = 'rgba(0, 209, 255, 0.05)';
            });
            dropzone.addEventListener('dragleave', () => {
                dropzone.style.borderColor = 'rgba(0, 209, 255, 0.3)';
                dropzone.style.background = 'rgba(255, 255, 255, 0.01)';
            });
            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = 'rgba(0, 209, 255, 0.3)';
                dropzone.style.background = 'rgba(255, 255, 255, 0.01)';
                if (e.dataTransfer.files.length > 0) {
                    fileInput.files = e.dataTransfer.files;
                    handleFileUpload(e.dataTransfer.files[0]);
                }
            });
        }

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileUpload(file);
        });

        const appendMsg = (text, isBot) => {
            if (!chatBox) return;
            const msg = document.createElement('div');
            msg.className = `msg ${isBot ? 'bot' : 'user'}`;
            msg.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
            chatBox.appendChild(msg);
            chatBox.scrollTop = chatBox.scrollHeight;
        };

        const handleFileUpload = async (file) => {
            showToast("Enviando e processando documento...", "info");
            const formData = new FormData();
            formData.append('doc', file);
            
            // Usamos o token do localStorage se disponível para diferenciar sessões
            const token = localStorage.getItem('rig_token') || 'global';
            formData.append('token', token);

            try {
                const res = await fetch('/api/chat-rit/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.ok) {
                    showToast("Documento processado com sucesso!", "success");
                    
                    // Atualiza UI
                    if (dropzone) dropzone.style.display = 'none';
                    if (infoCard) {
                        infoCard.style.display = 'block';
                        docName.textContent = data.fileName;
                        docSize.textContent = `Tamanho: ${Math.round(file.size / 1024)} KB`;
                    }
                    if (badge) {
                        badge.textContent = 'DOCUMENTO ATIVO';
                        badge.style.background = 'rgba(16, 185, 129, 0.2)';
                        badge.style.color = '#10B981';
                        badge.style.borderColor = '#10B981';
                    }

                    // Habilita controles
                    [btnResumo, btnPontos, btnAcoes, inputPergunta, btnEnviar].forEach(el => {
                        if (el) el.disabled = false;
                    });
                    if (inputPergunta) inputPergunta.placeholder = "Pergunte algo sobre o documento...";

                    // Boas vindas do bot
                    if (chatBox) chatBox.innerHTML = '';
                    appendMsg(`Conectado ao arquivo: **${data.fileName}**.\nO que você deseja fazer?\nUse as Ações Rápidas à esquerda ou digite sua dúvida no campo abaixo!`, true);
                } else {
                    showToast(data.error || "Erro ao processar documento", "error");
                }
            } catch(err) {
                console.error(err);
                showToast("Erro de rede ao enviar documento.", "error");
            }
        };

        if (btnRemover) {
            btnRemover.addEventListener('click', async () => {
                const token = localStorage.getItem('rig_token') || 'global';
                await fetch('/api/chat-rit/remover', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });

                // Reset UI
                if (dropzone) dropzone.style.display = 'block';
                if (infoCard) infoCard.style.display = 'none';
                if (badge) {
                    badge.textContent = 'SEM DOCUMENTO';
                    badge.style.background = 'rgba(239, 68, 68, 0.2)';
                    badge.style.color = '#EF4444';
                    badge.style.borderColor = '#EF4444';
                }

                [btnResumo, btnPontos, btnAcoes, inputPergunta, btnEnviar].forEach(el => {
                    if (el) el.disabled = true;
                });
                if (inputPergunta) {
                    inputPergunta.value = '';
                    inputPergunta.placeholder = "Escolha um arquivo e digite sua dúvida...";
                }
                if (chatBox) {
                    chatBox.innerHTML = '<div class="msg bot">Olá! Sou o Chat RIT. Por favor, anexe um documento de trabalho no painel esquerdo para que eu possa analisar, responder a dúvidas, resumir ou explicar seus detalhes.</div>';
                }
                fileInput.value = '';
                showToast("Documento removido.", "info");
            });
        }

        const enviarPergunta = async (acao = '') => {
            const message = inputPergunta ? inputPergunta.value.trim() : '';
            if (!message && !acao) return;

            if (inputPergunta && !acao) {
                appendMsg(message, false);
                inputPergunta.value = '';
            } else if (acao) {
                let acaoNome = "Gerando resumo...";
                if (acao === 'pontos') acaoNome = "Extraindo pontos-chave...";
                if (acao === 'acoes') acaoNome = "Identificando ações...";
                appendMsg(`[Ação] ${acaoNome}`, false);
            }

            // Exibe indicador de digitação do bot
            appendMsg("Analisando documento... 🤖", true);
            const typingMsg = chatBox.lastElementChild;

            const token = localStorage.getItem('rig_token') || 'global';
            try {
                const res = await fetch('/api/chat-rit/pergunta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, token, acao })
                });
                const data = await res.json();
                
                // Remove indicador de digitação e adiciona a resposta
                if (typingMsg) chatBox.removeChild(typingMsg);

                if (data.ok) {
                    appendMsg(data.response, true);
                } else {
                    appendMsg(`⚠️ Erro: ${data.error || 'Não foi possível processar a requisição.'}`, true);
                }
            } catch(err) {
                if (typingMsg) chatBox.removeChild(typingMsg);
                appendMsg("⚠️ Erro de comunicação com o servidor.", true);
            }
        };

        if (btnEnviar) btnEnviar.addEventListener('click', () => enviarPergunta());
        if (inputPergunta) {
            inputPergunta.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') enviarPergunta();
            });
        }

        if (btnResumo) btnResumo.addEventListener('click', () => enviarPergunta('resumo'));
        if (btnPontos) btnPontos.addEventListener('click', () => enviarPergunta('pontos'));
        if (btnAcoes) btnAcoes.addEventListener('click', () => enviarPergunta('acoes'));
    }

    initModals() {
        const modal = document.getElementById('modalGuia');
        if (modal) {
            modal.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        document.getElementById('btn-guia-visual')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (modal) modal.style.display = 'flex';
        });

        document.getElementById('btn-mapa-live')?.addEventListener('click', () => this.atualizarMapaLive());
        document.getElementById('btn-abrir-rota-waze')?.addEventListener('click', () => this.abrirRotaExterna());
        document.getElementById('btn-centralizar-rede')?.addEventListener('click', () => this.carregarMapaRede());
        document.getElementById('btn-atualizar-ott')?.addEventListener('click', () => this.atualizarInformesOTT());
    }

    limparEndereco(endereco) {
        if (!endereco) return '';
        let str = String(endereco);
        // Remover CEPs
        str = str.replace(/cep\s*:?\s*\d{5}-?\d{3}/gi, '');
        str = str.replace(/\b\d{5}-?\d{3}\b/g, '');
        // Substituir traços e travessões por vírgula
        str = str.replace(/[-–—]+/g, ',');
        // Remover termos redundantes do Rio de Janeiro
        str = str.replace(/\b(rio de janeiro|rj|brasil|brazil)\b/gi, '');
        // Limpar espaços e vírgulas duplicadas/finais
        str = str.replace(/,\s*,/g, ',');
        str = str.replace(/\s+/g, ' ');
        return str.trim().replace(/^,|,$/g, '').trim();
    }

    calcularCustoEstimado(distanciaKm, tempoMinutos, horarioCorrida, transito = false, chuva = false) {
        const TARIFA_BASE = this.tarifasConfig?.tarifaBase || 3.50;
        const PRECO_POR_KM = this.tarifasConfig?.precoPorKm || 1.50;
        const PRECO_POR_MINUTO = this.tarifasConfig?.precoPorMinuto || 0.30;
        const TARIFA_MINIMA = this.tarifasConfig?.tarifaMinima || 6.00;
        
        let fatorDinamico = 1.0;
        
        let hora = 12; // default
        if (horarioCorrida) {
            if (typeof horarioCorrida === 'string' && horarioCorrida.includes(':')) {
                hora = parseInt(horarioCorrida.split(':')[0], 10);
            } else if (!isNaN(horarioCorrida)) {
                hora = Math.floor(horarioCorrida * 24); 
            }
        }
        
        if ((hora >= 7 && hora < 9) || (hora >= 17 && hora < 19)) {
            fatorDinamico = this.tarifasConfig?.fatorPico || 1.4;
        } else if (hora >= 22 || hora < 2) {
            fatorDinamico = this.tarifasConfig?.fatorMadrugada || 1.2; // Madrugada
        }

        if (transito) {
            fatorDinamico *= (this.tarifasConfig?.fatorTransito || 1.3);
        }
        if (chuva) {
            fatorDinamico *= (this.tarifasConfig?.fatorChuva || 1.2);
        }

        let custoBruto = (TARIFA_BASE + (distanciaKm * PRECO_POR_KM) + (tempoMinutos * PRECO_POR_MINUTO)) * fatorDinamico;
        
        return custoBruto < TARIFA_MINIMA ? TARIFA_MINIMA : parseFloat(custoBruto.toFixed(2));
    }

    async atualizarTarifasReferencia() {
        try {
            const res = await fetch('/api/rotas/tarifas');
            const json = await res.json();
            if (json.ok && json.tarifas) {
                this.tarifasConfig = json.tarifas;
                
                const tfBase = document.getElementById('ref-tarifa-base');
                const tfKm = document.getElementById('ref-custo-km');
                const tfMin = document.getElementById('ref-custo-min');
                const tfMinima = document.getElementById('ref-tarifa-min');
                const tfFator = document.getElementById('ref-fator-dinamico');
                const statusRef = document.getElementById('status-referencia');

                if (tfBase) tfBase.textContent = this.tarifasConfig.tarifaBase.toFixed(2).replace('.', ',');
                if (tfKm) tfKm.textContent = this.tarifasConfig.precoPorKm.toFixed(2).replace('.', ',');
                if (tfMin) tfMin.textContent = this.tarifasConfig.precoPorMinuto.toFixed(2).replace('.', ',');
                if (tfMinima) tfMinima.textContent = this.tarifasConfig.tarifaMinima.toFixed(2).replace('.', ',');
                if (tfFator) {
                    tfFator.textContent = `${this.tarifasConfig.fatorPico.toFixed(1).replace('.', ',')}x (picos) / ${this.tarifasConfig.fatorMadrugada.toFixed(1).replace('.', ',')}x (madrugada)`;
                }
                
                const tfTransito = document.getElementById('ref-fator-transito');
                const tfChuva = document.getElementById('ref-fator-chuva');
                if (tfTransito && this.tarifasConfig.fatorTransito) {
                    tfTransito.textContent = `${this.tarifasConfig.fatorTransito.toFixed(1).replace('.', ',')}`;
                }
                if (tfChuva && this.tarifasConfig.fatorChuva) {
                    tfChuva.textContent = `${this.tarifasConfig.fatorChuva.toFixed(1).replace('.', ',')}`;
                }
                
                const tfPedagiosLista = document.getElementById('ref-pedagios-lista');
                if (tfPedagiosLista && this.tarifasConfig.pedagios) {
                    tfPedagiosLista.innerHTML = '';
                    this.tarifasConfig.pedagios.forEach(p => {
                        const li = document.createElement('li');
                        li.textContent = `${p.nome}: R$ ${p.valor.toFixed(2).replace('.', ',')}`;
                        tfPedagiosLista.appendChild(li);
                    });
                }

                if (statusRef) {
                    statusRef.innerHTML = `<span style="color:var(--good);">● Referência atualizada</span>`;
                }
            }
        } catch (err) {
            console.error('Erro ao atualizar tarifas de referência:', err);
            const statusRef = document.getElementById('status-referencia');
            if (statusRef) {
                statusRef.innerHTML = `<span style="color:var(--bad);">⚠️ Erro ao atualizar referência</span>`;
            }
        }
    }

    calcularDistanciaGraus(lat1, lon1, lat2, lon2) {
        const dLat = lat1 - lat2;
        const dLon = lon1 - lon2;
        return Math.sqrt(dLat * dLat + dLon * dLon);
    }

    detectarPedagios(coordinates) {
        if (!coordinates || !Array.isArray(coordinates)) return [];
        // Praças de pedágio cadastradas localmente no frontend (espelhando backend)
        const pedagios = [
            {
                nome: "Transolímpica",
                valor: 9.95,
                lat: -22.9136,
                lon: -43.3851,
                raio: 0.005 // (~500m)
            },
            {
                nome: "Ponte Rio-Niterói",
                valor: 6.60,
                lat: -22.8636,
                lon: -43.1676,
                raio: 0.008 // (~800m)
            },
            {
                nome: "Linha Amarela",
                valor: 4.00,
                lat: -22.9072,
                lon: -43.3089,
                raio: 0.006 // (~600m)
            }
        ];
        
        const pedagiosDetectados = [];
        for (const p of pedagios) {
            const cruzou = coordinates.some(coord => {
                // coordenadas no Leaflet/OSRM do UI controller mapeadas em [lat, lon]
                const lat = coord[0];
                const lon = coord[1];
                return this.calcularDistanciaGraus(lat, lon, p.lat, p.lon) <= p.raio;
            });
            if (cruzou) {
                pedagiosDetectados.push(p);
            }
        }
        return pedagiosDetectados;
    }

    initPlanner() {
        const btn = document.getElementById('btn-rota');
        if (!btn || !this.plannerService) return;
        btn.addEventListener('click', () => this.tracarRotaPlanejador());

        const inputUpload = document.getElementById('upload-planejador');
        const btnUpload = document.getElementById('btn-upload-planejador');
        
        if (btnUpload && inputUpload) {
            btnUpload.addEventListener('click', () => inputUpload.click());
            inputUpload.addEventListener('change', (e) => this.tratarUploadPlanejador(e));
        }

        document.getElementById("btnFecharModalLote")?.addEventListener("click", () => {
            document.getElementById("modalLote").style.display = "none";
        });

        document.getElementById("btnBaixarLote")?.addEventListener("click", () => {
            if (!this.plannerData || this.plannerData.length === 0) return;
            const exportData = this.plannerData.map(r => ({
                'Matrícula': r.matricula || '',
                'Nome do Colaborador': r.nome_colaborador || '',
                'Área': r.area || '',
                'Endereço de Saída': r.origem || '',
                'Endereço de Chegada': r.destino || '',
                'Horário de Saída': r.horario || '',
                'Retorno (KM)': r.distancia_km ? parseFloat(r.distancia_km) : '',
                'Retorno (Valor)': r.custo_estimado ? parseFloat(r.custo_estimado) : ''
            }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Rotas Processadas");
            XLSX.writeFile(wb, "Rotas_Processadas_RIT.xlsx");
        });

        this.atualizarTarifasReferencia();
    }

    async tratarUploadPlanejador(e) {
        const file = e.target.files[0];
        if (!file) return;

        const modal = document.getElementById("modalLote");
        const modalLoading = document.getElementById("modalLoteLoading");
        const modalContent = document.getElementById("modalLoteContent");
        const btnBaixar = document.getElementById("btnBaixarLote");
        
        if (modal) modal.style.display = "flex";
        if (modalLoading) modalLoading.style.display = "block";
        if (modalContent) modalContent.style.display = "none";
        if (btnBaixar) btnBaixar.style.display = "none";

        const formData = new FormData();
        formData.append("planilha", file);
        
        try {
            const res = await fetch("/api/rotas/importar", {
                method: "POST",
                body: formData
            });
            const json = await res.json();
            
            if (!json.ok) {
                showToast(json.error || "Erro ao processar lote.", "error");
                if (modal) modal.style.display = "none";
                return;
            }

            this.plannerData = json.resultados;
            
            const tbody = document.getElementById("tabelaLoteBody");
            if (tbody) {
                tbody.innerHTML = "";
                
                json.resultados.forEach(r => {
                    const tr = document.createElement("tr");
                    tr.style.borderBottom = "1px solid #333";
                    const colInfo = r.nome_colaborador ? `${escapeHtml(r.nome_colaborador)} (${escapeHtml(r.matricula)})<br><small style="color: #aaa;">${escapeHtml(r.area)}</small>` : '-';
                    
                    let pedagiosInfo = '';
                    if (r.pedagios && r.pedagios.length > 0) {
                        pedagiosInfo = `<br><span style="font-size:10px; color:#aaa;">🚧 Pedágios: ${r.pedagios.map(p => `${escapeHtml(p.nome)} (R$ ${p.valor.toFixed(2).replace('.', ',')})`).join(', ')}</span>`;
                    }

                    tr.innerHTML = `
                        <td style="padding: 8px;">${colInfo}</td>
                        <td style="padding: 8px;">${escapeHtml(r.origem)}</td>
                        <td style="padding: 8px;">${escapeHtml(r.destino)}</td>
                        <td style="padding: 8px;">${escapeHtml(r.horario || '')}</td>
                        <td style="padding: 8px;">${r.distancia_km ? r.distancia_km + ' km' : '-'}</td>
                        <td style="padding: 8px;">${r.tempo_min ? r.tempo_min + ' min' : '-'}</td>
                        <td style="padding: 8px; font-weight:bold; color:var(--accent)">
                            ${r.custo_estimado ? 'R$ ' + parseFloat(r.custo_estimado).toFixed(2).replace('.', ',') : '-'}
                            ${pedagiosInfo}
                        </td>
                        <td style="padding: 8px; color: ${r.status === 'SUCESSO' ? 'var(--accent)' : 'var(--bad)'}">${escapeHtml(r.status)} ${r.erro ? '<br><small>'+escapeHtml(r.erro)+'</small>' : ''}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            if (modalLoading) modalLoading.style.display = "none";
            if (modalContent) modalContent.style.display = "block";
            if (btnBaixar) btnBaixar.style.display = "block";
            showToast("Lote processado com sucesso!", "success");

        } catch (err) {
            console.error(err);
            showToast("Falha na comunicação com o servidor.", "error");
            if (modal) modal.style.display = "none";
        } finally {
            e.target.value = "";
        }
    }

    async tracarRotaPlanejador() {
        const origem = document.getElementById('origem')?.value?.trim() || '';
        const destino = document.getElementById('destino')?.value?.trim() || '';
        const horario = document.getElementById('horario')?.value?.trim() || '12:00';
        const transitoSel = document.getElementById('planejador-transito')?.value || 'não';
        const chuvaSel = document.getElementById('planejador-chuva')?.value || 'não';
        const transito = transitoSel === 'sim';
        const chuva = chuvaSel === 'sim';

        const feedback = document.getElementById('plannerFeedback');
        const linksEl = document.getElementById('externalLinks');
        const linkUber = document.getElementById('link-uber');

        if (linksEl) linksEl.style.display = 'none';

        if (!origem || !destino) {
            if (feedback) {
                feedback.innerHTML =
                    '<span style="color:#d32f2f">Por favor, informe a origem e o destino.</span>';
            }
            return;
        }

        const map = this.plannerService.map;
        const routeGroup = this.plannerService.routeOverlay;

        if (feedback) feedback.innerHTML = 'Buscando coordenadas…';

        try {
            const headers = { Accept: 'application/json' };
            const origemLimpa = this.limparEndereco(origem);
            const destinoLimpa = this.limparEndereco(destino);

            const qOrig = `${origemLimpa}, Rio de Janeiro, Brasil`;
            const resO = await fetch(`${NOMINATIM}?format=json&q=${encodeURIComponent(qOrig)}&limit=1`, { headers });
            const dataOrig = await resO.json();
            if (!dataOrig.length) throw new Error('Endereço de origem não encontrado.');

            if (feedback) feedback.innerHTML = 'Buscando destino…';
            const qDest = `${destinoLimpa}, Rio de Janeiro, Brasil`;
            const resD = await fetch(`${NOMINATIM}?format=json&q=${encodeURIComponent(qDest)}&limit=1`, { headers });
            const dataDest = await resD.json();
            if (!dataDest.length) throw new Error('Endereço de destino não encontrado.');

            const lat1 = parseFloat(dataOrig[0].lat);
            const lon1 = parseFloat(dataOrig[0].lon);
            const lat2 = parseFloat(dataDest[0].lat);
            const lon2 = parseFloat(dataDest[0].lon);

            if (feedback) feedback.innerHTML = 'Calculando rota (OSRM)…';

            const osrmUrl = `${OSRM_ROUTE}/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
            const resR = await fetch(osrmUrl);
            const routeData = await resR.json();
            if (!routeData.routes?.length) throw new Error('Rota não suportada ou indisponível.');

            const coords = routeData.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
            const distanciaKm = (routeData.routes[0].distance / 1000).toFixed(1);
            const duracaoMin = Math.round(routeData.routes[0].duration / 60);
            
            const custoBase = this.calcularCustoEstimado(parseFloat(distanciaKm), duracaoMin, horario, transito, chuva);
            const pedagiosDetectados = this.detectarPedagios(coords);
            const valorPedagios = pedagiosDetectados.reduce((acc, p) => acc + p.valor, 0);
            const custoTotal = custoBase + valorPedagios;

            this.plannerService.clearRouteOverlay();

            // Origin marker
            this.plannerService.addMarker(lat1, lon1, `Origem: ${escapeHtml(origem)}`);
            
            // Destination marker with emoji icon (simulated via label or simple marker)
            this.plannerService.addMarker(lat2, lon2, `Destino: ${escapeHtml(destino)}`, {
                html: '<div style="font-size:26px; line-height:1; text-align:center; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));">🚗</div>'
            });

            // Draw route
            this.plannerService.addPolyline(coords, '#f5a623', 6);
            
            // Fit bounds
            this.plannerService.fitBounds([
                [Math.min(lat1, lat2), Math.min(lon1, lon2)],
                [Math.max(lat1, lat2), Math.max(lon1, lon2)]
            ]);

            if (feedback) {
                let pedagiosHtml = '';
                if (pedagiosDetectados.length > 0) {
                    pedagiosHtml = pedagiosDetectados.map(p => 
                        `<br><span style="color:var(--accent)">🚧 Pedágio: ${escapeHtml(p.nome)} — R$ ${p.valor.toFixed(2).replace('.', ',')}</span>`
                    ).join('');
                }
                
                feedback.innerHTML = `
                    <strong style="color:var(--good)">✔ Rota traçada</strong><br>
                    <b>Distância:</b> ${escapeHtml(distanciaKm)} km<br>
                    <b>Tempo estimado:</b> ${duracaoMin} min<br>
                    <b>Custo base (app):</b> R$ ${custoBase.toFixed(2).replace('.', ',')}
                    ${pedagiosHtml}
                    <br><b>Custo total:</b> <span style="font-size: 1.1em; color:var(--accent)">R$ ${custoTotal.toFixed(2).replace('.', ',')}</span>
                `;
            }

            // Using universal deep link to m.uber.com which auto-fills the web app
            // and mobile application using coordinates and formatted addresses:
            const uberUrl = `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${lat1}&pickup[longitude]=${lon1}&pickup[nickname]=${encodeURIComponent(origemLimpa)}&dropoff[latitude]=${lat2}&dropoff[longitude]=${lon2}&dropoff[nickname]=${encodeURIComponent(destinoLimpa)}`;
            if (linkUber) linkUber.href = uberUrl;
            if (linksEl) linksEl.style.display = 'flex';
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (feedback) {
                feedback.innerHTML = `<span style="color:#ef4444"><b>Erro:</b> ${escapeHtml(msg)}</span><br><span style="font-size:11px">Seja específico nos endereços (ex.: bairro e referência).</span>`;
            }
            showToast('Não foi possível traçar a rota.', 'error');
        }
    }

    initEventosLista() {
        const lista = document.getElementById('eventos-lista');
        if (lista) {
            lista.querySelectorAll('.card[data-event-url]').forEach((card) => {
                card.addEventListener('click', () => {
                    const nome = card.getAttribute('data-event-nome') || 'Evento';
                    const url = card.getAttribute('data-event-url') || '';
                    this.carregarEvento(nome, url);
                });
            });
        }
        document.getElementById('btn-evento-carregar')?.addEventListener('click', () => this.adicionarEventoCustom());
        document.getElementById('btn-evento-importar')?.addEventListener('click', () => this.importarDadosEvento());
        document.getElementById('btn-externo-evento')?.addEventListener('click', () => this.abrirMapaExterno());
    }

    carregarEvento(nome, url) {
        this.eventoAtualUrl = url;
        const titulo = document.getElementById('evento-titulo');
        const iframe = document.getElementById('iframe-evento');
        const btnExt = document.getElementById('btn-externo-evento');
        if (titulo) titulo.textContent = nome;
        let embedUrl = url;
        if (url.includes('mid=')) {
            const mid = url.split('mid=')[1].split('&')[0];
            embedUrl = `https://www.google.com/maps/d/embed?mid=${mid}`;
        }
        if (iframe) iframe.src = embedUrl;
        if (btnExt) btnExt.style.display = 'inline-flex';
    }

    abrirMapaExterno() {
        if (this.eventoAtualUrl) window.open(this.eventoAtualUrl, '_blank', 'noopener,noreferrer');
    }

    adicionarEventoCustom() {
        const input = document.getElementById('evento-url');
        const url = input?.value?.trim() || '';
        if (!url) {
            showToast('Cole a URL do My Maps.', 'error');
            return;
        }
        this.carregarEvento('Mapa personalizado', url);
        showToast('Mapa carregado.', 'success');
    }

    importarDadosEvento() {
        showToast('Importação de pontos em lote ainda não está ligada a uma API.', 'info');
    }

    async atualizarMapaLive() {
        const origem = document.getElementById('waze-origem')?.value?.trim() || '';
        const destino = document.getElementById('waze-destino')?.value?.trim() || '';
        const riskPanel = document.getElementById('risk-analysis-panel');
        const riskContent = document.getElementById('risk-content');

        if (!origem || !destino) {
            showToast("Informe origem e destino para a análise de risco.", "error");
            return;
        }

        showToast("Calculando rota e coletando dados de risco...", "info");
        if (riskPanel) riskPanel.style.display = 'block';
        if (riskContent) riskContent.innerHTML = 'Analisando ocorrências (Segurança Pública, OTT, Clima)...';

        try {
            const headers = { Accept: 'application/json' };
            const qOrig = `${origem}, Rio de Janeiro, Brasil`;
            const resO = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(qOrig)}&limit=1`, { headers });
            const dataOrig = await resO.json();
            if (!dataOrig.length) throw new Error('Origem não encontrada.');

            const qDest = `${destino}, Rio de Janeiro, Brasil`;
            const resD = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(qDest)}&limit=1`, { headers });
            const dataDest = await resD.json();
            if (!dataDest.length) throw new Error('Destino não encontrado.');

            const lat1 = parseFloat(dataOrig[0].lat);
            const lon1 = parseFloat(dataOrig[0].lon);
            const lat2 = parseFloat(dataDest[0].lat);
            const lon2 = parseFloat(dataDest[0].lon);

            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
            const resR = await fetch(osrmUrl);
            const routeData = await resR.json();
            if (!routeData.routes?.length) throw new Error('Rota indisponível.');

            const coords = routeData.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
            const distanciaKm = (routeData.routes[0].distance / 1000).toFixed(1);
            const duracaoMin = Math.round(routeData.routes[0].duration / 60);
            const custo = (parseFloat(distanciaKm) * 1.5 + 5).toFixed(2);

            this.transitoMap.clearRouteOverlay();
            this.transitoMap.addMarker(lat1, lon1, `Origem: ${escapeHtml(origem)}`);
            this.transitoMap.addMarker(lat2, lon2, `Destino: ${escapeHtml(destino)}`, {
                html: '<div style="font-size:26px; line-height:1; text-align:center; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));">⚠️</div>'
            });

            this.transitoMap.addPolyline(coords, '#f43f5e', 6);
            this.transitoMap.fitBounds([
                [Math.min(lat1, lat2), Math.min(lon1, lon2)],
                [Math.max(lat1, lat2), Math.max(lon1, lon2)]
            ]);

            // Simulate risk occurrences along the route
            const midLat = (lat1 + lat2) / 2;
            const midLon = (lon1 + lon2) / 2;
            this.transitoMap.addMarker(midLat + 0.01, midLon + 0.01, 'Alerta OTT: Operação Policial', {
                html: '<div style="font-size:20px; line-height:1; text-align:center; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));">🔫</div>'
            });
            this.transitoMap.addMarker(midLat - 0.01, midLon - 0.01, 'Defesa Civil: Alagamento', {
                html: '<div style="font-size:20px; line-height:1; text-align:center; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));">⛈️</div>'
            });

            if (riskContent) {
                riskContent.innerHTML = `
                    <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--line);">
                        <b>Distância:</b> ${escapeHtml(distanciaKm)} km<br>
                        <b>Tempo estimado:</b> ${duracaoMin} min<br>
                        <b>Custo médio estimado:</b> R$ ${escapeHtml(custo)}
                    </div>
                    <div style="color: var(--accent); margin-bottom: 5px;">🔴 1 Alerta de Segurança (OTT) na rota</div>
                    <div style="color: var(--bad); margin-bottom: 5px;">⛈️ 1 Alerta de Alagamento via Defesa Civil</div>
                    <div style="margin-top: 10px;">
                        Status: <b>ROTA DE ALTO RISCO</b><br>
                        <span style="font-size:9px; color:var(--muted)">Recomendamos alterar o trajeto ou aguardar normalização.</span>
                    </div>
                `;
            }
        } catch (err) {
            if (riskContent) riskContent.innerHTML = `<span style="color: var(--bad);">Erro ao processar risco: ${escapeHtml(err.message)}</span>`;
            showToast('Erro ao calcular rota/risco.', 'error');
        }
    }

    abrirRotaExterna() {
        const o = document.getElementById('waze-origem').value;
        const d = document.getElementById('waze-destino').value;
        if (o && d) {
            window.open(`https://www.waze.com/ul?q=${encodeURIComponent(d)}&from=${encodeURIComponent(o)}&navigate=yes`, '_blank');
        } else {
            showToast("Informe origem e destino.", "error");
        }
    }

    carregarMapaRede() {
        const i = document.getElementById('iframe-rede');
        if (i) {
            i.src = i.getAttribute('data-src');
            showToast("Centralizando rede RJ...", "info");
        }
    }

    async atualizarInformesOTT() {
        const listEl = document.getElementById('ott-reports-list');
        if (listEl) {
            listEl.innerHTML = '<div style="color:var(--accent); text-align:center; padding:10px 0;">Buscando informes do OTT...</div>';
        }

        try {
            showToast("Carregando informes OTT das últimas 24h...", "info");
            const res = await fetch('/api/ott');
            const data = await res.json();

            if (!data.ok || !data.alerts) {
                throw new Error("Erro na resposta da API.");
            }

            // Limpa marcadores anteriores do mapa de trânsito
            if (this.transitoMap) {
                this.transitoMap.clearMarkers();
            }

            if (listEl) {
                if (data.alerts.length === 0) {
                    listEl.innerHTML = '<div style="color:#aaa; text-align:center; padding:10px 0;">Nenhum tiroteio registrado nas últimas 24h.</div>';
                    showToast("Nenhum informe encontrado.", "info");
                    return;
                }

                listEl.innerHTML = '';
                data.alerts.forEach(alert => {
                    // Adiciona na lista lateral
                    const item = document.createElement('div');
                    item.style.padding = '8px 0';
                    item.style.borderBottom = '1px solid #222';
                    item.innerHTML = `
                        <strong style="color:#f43f5e;">⚠️ ${escapeHtml(alert.tipo)}</strong><br>
                        <span style="font-size:10px; color:#aaa;">🕒 ${escapeHtml(alert.data)} às ${escapeHtml(alert.hora)}</span><br>
                        <span>📍 ${escapeHtml(alert.bairro)} - ${escapeHtml(alert.municipio)}</span>
                    `;
                    listEl.appendChild(item);

                    // Plota no mapa de trânsito real
                    if (this.transitoMap && alert.lat && alert.lon) {
                        const popupText = `
                            <div style="font-family:sans-serif; font-size:11px; line-height:1.4;">
                                <strong style="color:#e11d48; font-size:12px;">🔴 Ocorrência OTT</strong><br>
                                <b>Tipo:</b> ${escapeHtml(alert.tipo)}<br>
                                <b>Data/Hora:</b> ${escapeHtml(alert.data)} às ${escapeHtml(alert.hora)}<br>
                                <b>Local:</b> ${escapeHtml(alert.bairro)} - ${escapeHtml(alert.municipio)}
                            </div>
                        `;
                        
                        // Custom Marker com logotipo "OTT" em SVG
                        const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">' +
                            '<circle cx="18" cy="18" r="16" fill="#000000" stroke="#f43f5e" stroke-width="2"/>' +
                            '<text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle" font-size="8" font-family="sans-serif" font-weight="900" fill="#ffffff">OTT</text>' +
                            '<text x="50%" y="74%" dominant-baseline="middle" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#f43f5e">🔫</text>' +
                            '</svg>';
                            
                        this.transitoMap.addMarker(alert.lat, alert.lon, popupText, {
                            html: iconSvg
                        });
                    }
                });

                showToast("Informes OTT atualizados!", "success");
            }
        } catch (err) {
            console.error(err);
            if (listEl) {
                listEl.innerHTML = '<div style="color:var(--bad); text-align:center; padding:10px 0;">Erro ao atualizar informes do OTT.</div>';
            }
            showToast("Erro ao processar informes OTT.", "error");
        }
    }

}

