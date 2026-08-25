import { CONFIG } from './config.js';
import { showToast, escapeHtml, formatarHorario } from './utils.js';
import { parseDataHora } from './data-service.js';

function abrirCanalExterno(url) {
    if (
        typeof url === 'string' &&
        (
            url.includes('api.whatsapp.com') ||
            url.includes('wa.me') ||
            url.toLowerCase().includes('whatsapp')
        )
    ) {
        console.warn('[BLOQUEIO_CANAL_EXTERNO]', {
            url,
            motivo: 'Abertura direta de WhatsApp bloqueada por regra contratual.'
        });
        showToast('Contato direto com motorista não permitido. Use o fluxo de solicitação ao supervisor.', 'warning');
        return false;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
}
window.abrirCanalExterno = abrirCanalExterno;

function extrairDataDeHorario(horario) {
    if (!horario) return 'Data não informada';
    const str = String(horario).trim();
    
    // Testa formato DD/MM/YYYY
    const regexBR = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    const mBR = str.match(regexBR);
    if (mBR) {
        return `${String(mBR[1]).padStart(2, '0')}/${String(mBR[2]).padStart(2, '0')}/${mBR[3]}`;
    }
    
    // Testa formato YYYY-MM-DD
    const regexISO = /(\d{4})-(\d{1,2})-(\d{1,2})/;
    const mISO = str.match(regexISO);
    if (mISO) {
        return `${String(mISO[3]).padStart(2, '0')}/${String(mISO[2]).padStart(2, '0')}/${mISO[1]}`;
    }
    
    return 'Data não informada';
}

function getPremiumRitStatus(a, isActive, activeTracker) {
    if (!isActive) {
        return {
            label: 'SEM COMUNICAÇÃO',
            className: 'status-sem-comunicacao',
            color: '#9CA3AF'
        };
    }
    const statusAtendimento = (a && a.statusAtendimento) || (activeTracker && activeTracker.status_atendimento) || 'EM_TRANSITO';
    const speed = activeTracker ? (activeTracker.speed || 0) : 0;
    
    if (statusAtendimento === 'PAUSADO') {
        return {
            label: 'ATENÇÃO',
            className: 'status-atencao',
            color: '#FBBF24'
        };
    }
    if (speed > 80) {
        return {
            label: 'ALERTA',
            className: 'status-alerta',
            color: '#EF4444'
        };
    }
    if (speed > 0) {
        return {
            label: 'COMPARTILHANDO LOCALIZAÇÃO',
            className: 'status-compartilhando',
            color: '#3B82F6'
        };
    }
    return {
        label: 'ONLINE',
        className: 'status-online',
        color: '#22C55E'
    };
}

function exibirPainelAtendimento(a, isActive, activeTracker) {
    let panel = document.getElementById('premium-rit-details-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'premium-rit-details-panel';
        panel.className = 'premium-rit-details-panel';
        document.body.appendChild(panel);
    }
    
    const motoristaName = a.motorista || (activeTracker ? activeTracker.motorista_name : 'Motorista');
    const programa = a.programa || (activeTracker ? activeTracker.programa : 'GERAL');
    const placa = a.placa || (activeTracker ? activeTracker.placa : 'N/D');
    const tipoVeiculo = a.tipoVeiculo || (activeTracker ? activeTracker.tipo_veiculo : 'N/D');
    const passageiro = a.passageiro || (activeTracker ? activeTracker.passageiro : 'Não informado');
    const telefone = a.telefone || (activeTracker ? activeTracker.motorista_telefone : 'N/D');
    const origem = a.origem || (activeTracker ? activeTracker.origem : 'Não informado');
    const destino = a.destino || (activeTracker ? activeTracker.destino : 'Não informado');
    const rawInicio = a.dataHoraInicioRaw || (activeTracker ? activeTracker.horario : null);
    const rawFim = a.dataHoraFimRaw || (activeTracker ? activeTracker.horario_termino : null);
    const horarioInicio = formatarHorario(rawInicio);
    const horarioFim = formatarHorario(rawFim);
    const statusInfo = getPremiumRitStatus(a, isActive, activeTracker);
    
    const prioridade = a.prioridade || (programa.includes('ALTO') || programa.includes('VIP') ? 'ALTA' : 'MÉDIA');
    const previsao = formatarHorario(a.previsao || rawFim);
    const atendimentoId = a.id || activeTracker?.id_rota || activeTracker?.id || 'N/D';

    // Data do atendimento
    const dateFormatted = a.data_atendimento || (activeTracker ? activeTracker.data_atendimento : null) || extrairDataDeHorario(horarioInicio);
    // Resolvido
    
    panel.style.display = 'flex';
    panel.innerHTML = `
        <div class="premium-rit-details-header" style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px; position: relative;">
            <button class="close-btn" style="position: absolute; right: 0; top: 0;" onclick="document.getElementById('premium-rit-details-panel').style.display='none'">&times;</button>
            <h3 style="margin: 0; font-size: 13px;">ATENDIMENTO #${atendimentoId}</h3>
            <div style="font-size: 12px; font-weight: 800; color: #00d1ff; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                <span>📅 ${dateFormatted}</span>
            </div>
            <span style="font-size: 10px; color: var(--muted);">${programa}</span>
        </div>
        <div class="premium-rit-details-grid">
            <div class="premium-rit-details-item">
                <label>Veículo</label>
                <span>${tipoVeiculo}</span>
            </div>
            <div class="premium-rit-details-item">
                <label>Origem</label>
                <span>${origem}</span>
            </div>
            <div class="premium-rit-details-item">
                <label>Placa</label>
                <span>${placa}</span>
            </div>
            <div class="premium-rit-details-item">
                <label>Destino</label>
                <span>${destino}</span>
            </div>
            <div class="premium-rit-details-item">
                <label>Status</label>
                <span style="color: ${statusInfo.color}; font-weight: 800;">● ${statusInfo.label}</span>
            </div>
            <div class="premium-rit-details-item">
                <label>Horário de Início</label>
                <span>${horarioInicio}</span>
            </div>
            <div class="premium-rit-details-item">
                <label>Motorista</label>
                <span>${motoristaName}</span>
            </div>
            <div class="premium-rit-details-item">
                <label>Previsão</label>
                <span>${previsao}</span>
            </div>
            <div class="premium-rit-details-item">
                <label>Telefone</label>
                <span>${telefone}</span>
            </div>
            <div class="premium-rit-details-item">
                <label>Prioridade</label>
                <span style="color: ${prioridade === 'ALTA' ? '#EF4444' : '#FBBF24'}; font-weight: 700;">${prioridade}</span>
            </div>
            <div class="premium-rit-details-item" style="grid-column: span 2;">
                <label>Observações</label>
                <span>Passageiro: ${passageiro}</span>
            </div>
        </div>
        <div class="premium-rit-details-actions" style="display: flex; gap: 4px; flex-wrap: wrap;">
            <button class="btn-primary" style="flex: 1; min-width: 80px; background: ${atendimentoId === 'N/D' ? '#334155' : ''}; color: ${atendimentoId === 'N/D' ? '#94a3b8' : ''}; cursor: ${atendimentoId === 'N/D' ? 'not-allowed' : 'pointer'};" ${atendimentoId === 'N/D' ? 'disabled' : ''} onclick="window.uiController.abrirModalDetalhes('${atendimentoId}')">Ver Detalhes</button>
            <button class="btn-secondary" style="flex: 1; min-width: 80px; background: ${atendimentoId === 'N/D' ? '#1e293b' : ''}; color: ${atendimentoId === 'N/D' ? '#64748b' : ''}; cursor: ${atendimentoId === 'N/D' ? 'not-allowed' : 'pointer'};" ${atendimentoId === 'N/D' ? 'disabled' : ''} onclick="window.uiController.abrirModalHistorico('${atendimentoId}')">Histórico</button>
            <button id="details-track-btn" class="btn-primary" style="flex: 1; min-width: 80px; background: #334155; color: #94a3b8; cursor: not-allowed;" disabled onclick="window.uiController.abrirModalTrack('${atendimentoId}')">Track</button>
            <button class="btn-close" style="flex: 1; min-width: 80px;" onclick="document.getElementById('premium-rit-details-panel').style.display='none'">Fechar</button>
        </div>
    `;

    if (atendimentoId !== 'N/D') {
        fetch(`/api/atendimentos/${atendimentoId}/track`)
            .then(r => r.json())
            .then(data => {
                const btn = document.getElementById('details-track-btn');
                if (btn) {
                    if (data.ok && data.rastreamento_disponivel) {
                        btn.disabled = false;
                        btn.style.background = '#00d1ff';
                        btn.style.color = '#071018';
                        btn.style.cursor = 'pointer';
                        btn.title = 'Visualizar trilha do percurso';
                    } else {
                        btn.title = 'Nenhum dado de rastreamento disponível.';
                    }
                }
            })
            .catch(() => {});
    }
}

window.getPremiumRitStatus = getPremiumRitStatus;
window.exibirPainelAtendimento = exibirPainelAtendimento;

function obterIconeVeiculoHTML(tipo, isActive, a, activeTracker) {
    const t = String(tipo || '').toLowerCase();
    let filename = 'passeio.png'; // default fallback

    // Mapeamento oficial dos tipos de veículos
    if (t.includes('blindado')) {
        filename = 'passeio_blindado.png';
    } else if (t.includes('mixto') || t.includes('misto')) {
        filename = 'furgao_mixto.png';
    } else if (t.includes('onibus') || t.includes('ônibus') || t.includes('bus') || t.includes('micro')) {
        filename = 'onibus.png';
    } else if (t.includes('van') || t.includes('combi') || t.includes('camarim')) {
        filename = 'van.png';
    } else if (t.includes('furgao') || t.includes('furgão') || t.includes('fiorino') || t.includes('cargo') || t.includes('kangoo') || t.includes('doblo')) {
        filename = 'furgao.png';
    } else if (t.includes('caminhao') || t.includes('caminhão') || t.includes('truck') || t.includes('figurino')) {
        filename = 'caminhao.png';
    } else if (t.includes('pickup') || t.includes('picap') || t.includes('picape') || t.includes('toro') || t.includes('hilux') || t.includes('s10') || t.includes('ranger')) {
        filename = 'pickup.png';
    } else if (t.includes('suv') || t.includes('renegade') || t.includes('compass') || t.includes('creta') || t.includes('hrv') || t.includes('tracker')) {
        filename = 'suv.png';
    } else {
        filename = 'passeio.png';
    }

    const statusInfo = getPremiumRitStatus(a, isActive, activeTracker);

    return `
        <div class="premium-rit-marker ${statusInfo.className}" style="--premium-status-color: ${statusInfo.color};">
            <div class="premium-rit-outer-ring">
                <div class="premium-rit-inner-ring">
                    <div class="premium-rit-vehicle-area">
                        <img class="premium-rit-vehicle-img" src="/img/veiculos/${filename}" alt="${t}" />
                    </div>
                </div>
            </div>
            <span class="premium-rit-status-dot"></span>
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
    constructor(mapService, plannerService, transitoMap, dataService, corRioService = null, camerasService = null, painelCimService = null) {
        this.mapService = mapService;
        this.plannerService = plannerService;
        this.transitoMap = transitoMap;
        this.dataService = dataService;
        this.corRioService = corRioService;
        this.camerasService = camerasService;
        this.painelCimService = painelCimService;
        this.eventoAtualUrl = '';
        this.tarifasConfig = {
            tarifaBase: 3.50,
            precoPorKm: 1.50,
            precoPorMinuto: 0.30,
            tarifaMinima: 6.00,
            fatorPico: 1.4,
            fatorMadrugada: 1.2
        };

        try { this.initTabs(); } catch (e) { console.error("Erro initTabs:", e); }
        try { this.initFilters(); } catch (e) { console.error("Erro initFilters:", e); }
        try { this.initUpload(); } catch (e) { console.error("Erro initUpload:", e); }
        try { this.initModals(); } catch (e) { console.error("Erro initModals:", e); }
        try { this.initPlanner(); } catch (e) { console.error("Erro initPlanner:", e); }
        try { this.initRegionalization(); } catch (e) { console.error("Erro initRegionalization:", e); }
        
        this.mapMode = 'TODOS';
        this.gpsIntervalId = null;
        this.activeTrackers = [];
        this.activeGpsPopupDriver = null;
        this.activeGpsPopupMode = null;
        
        if (this.mapService?.map) {
            this.mapService.map.on('popupclose', () => {
                this.activeGpsPopupDriver = null;
                this.activeGpsPopupMode = null;
            });
        }
        
        try { this.aplicarModoPrivacidadeMonitoramento(); } catch (e) { console.error("Erro aplicarModoPrivacidadeMonitoramento:", e); }
        try { this.initMapModeToggle(); } catch (e) { console.error("Erro initMapModeToggle:", e); }
        if (CONFIG.FEATURE_MONITORAMENTO) {
            try { this.iniciarPoolActiveTrackers(); } catch (e) { console.error("Erro iniciarPoolActiveTrackers:", e); }
            try { this.carregarBaseExistente(); } catch (e) { console.error("Erro carregarBaseExistente:", e); }
        } else {
            console.info("[MONITORAMENTO] Módulo de monitoramento temporariamente indisponível via Feature Flag.");
        }
        
        // Delegação de evento para o botão "Ver no Mapa" na lista de atendimentos
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-focus-map');
            if (!btn) return;
            
            const markerId = btn.getAttribute('data-marker-id');
            console.log('[VER NO MAPA] Botão Ver no Mapa clicado:', markerId);
            this.focarMarcadorNoMapa(markerId);
        });

        window.uiController = this;
    }

    aplicarModoPrivacidadeMonitoramento() {
        const tabPane = document.getElementById('tab-monitoramento');
        const tabBtn = document.querySelector('.tabBtn[data-tab="tab-monitoramento"]');
        const uploadBtn = document.getElementById('btn-upload');

        if (CONFIG.FEATURE_MONITORAMENTO) {
            if (tabBtn) {
                tabBtn.innerHTML = 'Monitoramento';
                tabBtn.title = 'Módulo de Monitoramento Operacional';
            }
            if (uploadBtn) {
                uploadBtn.style.display = '';
            }
            if (tabPane) {
                const sidebar = tabPane.querySelector('.sidebar');
                const mapArea = tabPane.querySelector('.mapArea');
                if (sidebar) sidebar.style.display = '';
                if (mapArea) mapArea.style.display = '';
                const existingNotice = document.getElementById('privacy-monitoramento-container');
                if (existingNotice) existingNotice.remove();
            }
            return;
        }

        // Modo Desativado via Feature Flag
        if (tabBtn) {
            tabBtn.innerHTML = 'Monitoramento 🔒';
            tabBtn.title = 'Funcionalidade temporariamente suspensa';
        }
        if (uploadBtn) {
            uploadBtn.style.display = 'none';
        }
        if (tabPane) {
            const sidebar = tabPane.querySelector('.sidebar');
            const mapArea = tabPane.querySelector('.mapArea');
            if (sidebar) sidebar.style.display = 'none';
            if (mapArea) mapArea.style.display = 'none';

            let noticeContainer = document.getElementById('privacy-monitoramento-container');
            if (!noticeContainer) {
                noticeContainer = document.createElement('div');
                noticeContainer.id = 'privacy-monitoramento-container';
                noticeContainer.className = 'privacy-notice-container';
                noticeContainer.innerHTML = `
                    <div class="privacy-card">
                        <div class="privacy-icon-box">⚠️</div>
                        <div class="privacy-title">Monitoramento Temporariamente Indisponível</div>
                        <div class="privacy-body">
                            <p>As funcionalidades de Monitoramento encontram-se temporariamente suspensas para adequações técnicas.</p>
                            <div class="privacy-highlight-box">
                                Para acompanhamento dos Atendimentos, recomendamos o módulo:<br>
                                <strong style="color: #00d1ff; font-size: 14px; display: inline-block; margin-top: 5px;">✅ Monitoramento + Transportes</strong>
                            </div>
                            <p style="font-size: 12px; color: #94a3b8; margin-top: 12px;">A funcionalidade será restabelecida após a conclusão das validações necessárias.</p>
                        </div>
                        <a id="btn-ir-transportes" href="https://globo.wiselog360.com/#/login" target="_blank" rel="noopener noreferrer" class="btn btn-privacy-redirect" style="text-decoration: none;">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> IR PARA MONITORAMENTO + TRANSPORTES
                        </a>
                    </div>
                `;
                tabPane.appendChild(noticeContainer);

                const btnRedirecionar = noticeContainer.querySelector('#btn-ir-transportes');
                if (btnRedirecionar) {
                    btnRedirecionar.addEventListener('click', () => {
                        console.info("[MONITORAMENTO] Redirecionando para portal +Transportes Globo (Wiselog360)");
                    });
                }
            }
        }
    }

    redirecionarParaModuloTransportes() {
        window.open('https://globo.wiselog360.com/#/login', '_blank', 'noopener,noreferrer');
    }

    async carregarBaseExistente() {
        if (!CONFIG.FEATURE_MONITORAMENTO) {
            console.info("[MONITORAMENTO] Carregamento de base de monitoramento suspenso temporariamente.");
            this.dataService.baseAtendimentos = [];
            return;
        }

        const regional = (document.getElementById('seletor-regiao')?.value || 'RJ');
        console.log('[LOAD] Regional selecionada:', regional);
        console.log('[LOAD] Buscando mapa ativo');
        
        try {
            const statusEl = document.getElementById("geo-status");
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent)">Carregando base...</span>`;
            
            let serverAtendimentos = [];
            try {
                const res = await fetch(`/api/rotas/mapa-ativo?regional=${regional}`);
                const json = await res.json();
                
                const resultados = (json && Array.isArray(json.resultados)) ? json.resultados : [];
                console.log('[LOAD] Mapa encontrado');
                console.log('[LOAD] Quantidade de registros carregados:', resultados.length);
                
                if (resultados.length > 0) {
                    serverAtendimentos = resultados.map(r => {
                        if (!r) return null;
                        return {
                            id: r.id,
                            motorista: r.motorista_nome || '',
                            telefone: r.motorista_telefone || '',
                            tipoVeiculo: r.tipo_veiculo || '',
                            programa: r.programa || 'RIT',
                            placa: r.placa_veiculo || '',
                            bairro: (r.destino || '').split(',').pop().trim() || 'Rio de Janeiro',
                            dataHoraInicioRaw: r.horario,
                            dataHoraFimRaw: r.horario_termino,
                            horario: r.horario,
                            data_atendimento: r.data_atendimento,
                            horarioInicio: r.horario ? (r.horario.split(' ')[1] || r.horario) : '12:00',
                            lat: null,
                            lng: null,
                            passageiro: r.passageiro || '',
                            origem: r.origem || '',
                            destino: r.destino || '',
                            statusAtendimento: r.status_atendimento,
                            ot: r.ot || '',
                            codigo_ot_detalhado: r.codigo_ot_detalhado || ''
                        };
                    }).filter(Boolean);
                }
            } catch (e) {
                console.error('[ERROR] Endpoint: GET /mapa-ativo | Regional:', regional, '| Mensagem original:', e.message, '| Stack completa:', e.stack);
            }

            // Load and Merge Manual Monitorings for active regional
            let manualMonitorings = [];
            try {
                const rawManual = localStorage.getItem('rit_manual_monitorings');
                manualMonitorings = rawManual ? JSON.parse(rawManual) : [];
                if (!Array.isArray(manualMonitorings)) manualMonitorings = [];
            } catch (e) {
                console.error("[RIT-UI] Error reading manual monitorings:", e);
            }

            const mappedManuals = (manualMonitorings || [])
                .filter(m => m && (!m.regional || m.regional === regional))
                .map(m => {
                    if (!m) return null;
                    return {
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
                        lat: m.lat || null,
                        lng: m.lng || null,
                        passageiro: m.passageiro,
                        origem: m.origem,
                        destino: m.destino,
                        statusAtendimento: m.statusAtendimento || 'AGUARDANDO',
                        isManual: true,
                        regional: m.regional || regional
                    };
                }).filter(Boolean);

            // Combine server and manual
            const combined = [...mappedManuals];
            if (Array.isArray(serverAtendimentos)) {
                serverAtendimentos.forEach(s => {
                    if (!s) return;
                    const exists = combined.some(x => x && (String(x.id) === String(s.id) || String(x.placa) === String(s.placa)));
                    if (!exists) {
                        combined.push(s);
                    }
                });
            }

            // INSTANT COORDINATES & INSTANT PLOTTING BEFORE ANY NETWORK GEOCALLS
            this.dataService.garantirCoordenadas(combined);
            this.dataService.baseAtendimentos = combined;
            window.transportMapData = combined;
            this.preencherDropdowns(combined);
            
            if (combined.length > 0) {
                this._fitBoundsAfterPlot = true;
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--good)">Pronto (${combined.length} carregados)</span>`;
                this.plotarAtendimentos(combined);
                this.atualizarResumoContadores();

                // Background refinement (non-blocking)
                this.dataService.geocodificar((pct) => {
                    if (statusEl) statusEl.innerHTML = `<span style="color:var(--good)">Geocodificando ${pct}%...</span>`;
                }).then(() => {
                    if (statusEl) statusEl.innerHTML = `<span style="color:var(--good)">Pronto (OK)</span>`;
                    this.plotarAtendimentos(this.dataService.baseAtendimentos);
                    this.atualizarResumoContadores();
                }).catch(geoErr => {
                    console.warn("[GEOCODE] Erro no background geocode:", geoErr);
                });
            } else {
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--muted)">Nenhum mapa ativo encontrado para a regional ${regional}.</span>`;
                this.plotarAtendimentos([]);
                this.atualizarResumoContadores();
            }
        } catch (e) {
            console.error('[ERROR] Endpoint: carregarBaseExistente | Regional:', regional, '| Mensagem original:', e.message, '| Stack completa:', e.stack);
            const statusEl = document.getElementById("geo-status");
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--bad)">Nenhum mapa ativo encontrado para esta regional.</span>`;
            this.plotarAtendimentos([]);
            this.atualizarResumoContadores();
        }
    }

    abrirManualModal() {
        if (!CONFIG.FEATURE_MONITORAMENTO) {
            showToast("Criação de novos monitoramentos temporariamente suspensa.", "warning");
            return;
        }
        const modal = document.getElementById('rit-modal-manual');
        if (modal) modal.style.display = 'flex';
    }

    fecharManualModal() {
        document.getElementById('rit-modal-manual').style.display = 'none';
        document.getElementById('rit-form-manual').reset();
    }

    async abrirModalDetalhes(id) {
        try {
            const resp = await fetch(`/api/atendimentos/${id}`);
            const data = await resp.json();
            if (!data.ok || !data.atendimento) {
                alert("Erro ao buscar detalhes do atendimento.");
                return;
            }
            
            const a = data.atendimento;
            const container = document.getElementById("detalhesContent");
            if (!container) return;
            
            const dateFormatted = a.data_atendimento || extrairDataDeHorario(a.horario);
            // Resolvido
            
            const fields = [
                { label: "ID Atendimento", val: a.id },
                { label: "Data do Atendimento", val: `📅 ${dateFormatted}`, highlight: true },
                { label: "Programa", val: a.programa || "N/D" },
                { label: "Passageiro", val: a.passageiro || "Não informado" },
                { label: "Motorista", val: a.motorista_nome || a.motorista || "Não informado" },
                { label: "Cooperativa", val: a.area || "N/D" },
                { label: "Veículo", val: a.tipo_veiculo || a.tipoVeiculo || "N/D" },
                { label: "Placa", val: a.placa_veiculo || a.placa || "N/D" },
                { label: "Origem", val: a.origem || "Não informado" },
                { label: "Destino", val: a.destino || "Não informado" },
                { label: "Horário de Início", val: formatarHorario(a.horario) },
                { label: "Horário Previsto", val: formatarHorario(a.horario_termino) },
                { label: "Status Operacional", val: a.status_atendimento || a.statusAtendimento || "AGUARDANDO" },
                { label: "Prioridade", val: a.prioridade || "MÉDIA" },
                { label: "Observações", val: a.observacoes || "Sem observações" },
                { label: "Última Atualização", val: a.timestamp ? new Date(a.timestamp).toLocaleString("pt-BR") : "N/D" }
            ];
            
            container.innerHTML = fields.map(f => `
                <div style="display: flex; flex-direction: column; gap: 4px; padding: 8px; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); ${f.highlight ? 'border-color: #00d1ff;' : ''}">
                    <label style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #8a99a8;">${f.label}</label>
                    <span style="font-size: 12px; color: ${f.highlight ? '#00d1ff' : 'white'}; font-weight: ${f.highlight ? '800' : 'normal'};">${escapeHtml(String(f.val))}</span>
                </div>
            `).join("");
            
            document.getElementById("modalDetalhesAtendimento").style.display = "flex";
        } catch (err) {
            console.error("Erro ao carregar detalhes:", err);
            alert("Erro ao buscar detalhes.");
        }
    }

    async abrirModalHistorico(id) {
        try {
            const respAt = await fetch(`/api/atendimentos/${id}`);
            const dataAt = await respAt.json();
            if (!dataAt.ok || !dataAt.atendimento) {
                alert("Erro ao buscar dados do atendimento.");
                return;
            }
            const a = dataAt.atendimento;
            const dateFormatted = a.data_atendimento || extrairDataDeHorario(a.horario);
            
            const titleEl = document.getElementById("historicoHeaderTitle");
            if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Histórico do Atendimento #${id}`;
            
            const dataHeader = document.getElementById("historicoDataHeader");
            if (dataHeader) dataHeader.innerHTML = `📅 Data do Atendimento: ${dateFormatted}`;
            
            // Resolvido

            const respHist = await fetch(`/api/atendimentos/${id}/historico`);
            const dataHist = await respHist.json();
            const container = document.getElementById("historicoContent");
            if (!container) return;
            
            if (!dataHist.ok || !dataHist.historico || dataHist.historico.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #8a99a8; font-size: 13px;">
                        <i class="fa-solid fa-folder-open" style="font-size: 24px; margin-bottom: 8px; display: block; color: rgba(255,255,255,0.1);"></i>
                        Nenhum histórico encontrado para este atendimento.
                    </div>
                `;
            } else {
                container.innerHTML = dataHist.historico.map((h, idx) => {
                    const dt = new Date(h.data_hora).toLocaleString("pt-BR");
                    return `
                        <div style="display: flex; gap: 12px; position: relative; padding-bottom: 8px;">
                            ${idx < dataHist.historico.length - 1 ? '<div style="position: absolute; left: 6px; top: 12px; bottom: 0; width: 2px; background: rgba(255,255,255,0.08);"></div>' : ''}
                            <div style="width: 14px; height: 14px; border-radius: 50%; background: #00d1ff; border: 3px solid #0a0f1c; z-index: 2; margin-top: 2px;"></div>
                            <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.04);">
                                <span style="font-size: 10px; color: #8a99a8; font-weight: 700;">${dt}</span>
                                <span style="font-size: 12px; color: white;">${escapeHtml(h.evento)}</span>
                            </div>
                        </div>
                    `;
                }).join("");
            }
            
            document.getElementById("modalHistoricoAtendimento").style.display = "flex";
        } catch (err) {
            console.error("Erro ao carregar histórico:", err);
            alert("Erro ao buscar histórico.");
        }
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

        // Abre o modal de compliance para cópia e envio pelo supervisor
        this.abrirModalSolicitarPosicao(item.motorista, item.placa, item.id);
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
                
                if (targetId === 'tab-monitoramento' && !CONFIG.FEATURE_MONITORAMENTO) {
                    console.info("[MONITORAMENTO] Acesso à aba Monitoramento bloqueado temporariamente.");
                    this.aplicarModoPrivacidadeMonitoramento();
                }
                
                if (this.mapService) this.mapService.invalidateSize();
                if (this.plannerService) this.plannerService.invalidateSize();
                if (this.transitoMap) this.transitoMap.invalidateSize();
            });
        });

        // Suporte a acesso direto por URL/hash (?tab=monitoramento ou #monitoramento)
        try {
            const hash = (window.location.hash || '').replace('#', '').trim();
            const urlParams = new URLSearchParams(window.location.search);
            const tabParam = urlParams.get('tab') || (hash.startsWith('tab-') ? hash : (hash ? `tab-${hash}` : null));
            if (tabParam) {
                const targetBtn = document.querySelector(`.tabBtn[data-tab="${tabParam}"]`);
                if (targetBtn) {
                    targetBtn.click();
                }
            }
        } catch (e) {
            console.error("Erro ao processar rota de aba inicial:", e);
        }
    }

    initFilters() {
        const sp = document.getElementById("filtro-programa");
        const sb = document.getElementById("filtro-bairro");
        const st = document.getElementById("filtro-tipo");
        const se = document.getElementById("filtro-em-atendimento");
        const sh = document.getElementById("filtro-horario-inicio");
        const btnLimpar = document.getElementById("btn-limpar");
        const btnCentralizar = document.getElementById("btn-centralizar");

        const searchType = document.getElementById("searchType");
        const searchInput = document.getElementById("dynamicSearchInput");

        const normalizeText = (value) => {
            return String(value || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
        };

        const filtrar = () => {
            const f = this.obterAtendimentosFiltrados();
            this.plotarAtendimentos(f);
            this.atualizarResumoContadores();
        };

        [sp, sb, st, se, sh].forEach(s => s?.addEventListener("change", filtrar));

        searchType?.addEventListener("change", () => {
            if (searchInput) searchInput.value = "";
            this.updateDynamicSearchSuggestions();
            filtrar();
            
            console.log('[BUSCA DINÂMICA] Tipo selecionado:', searchType.value);
        });

        searchInput?.addEventListener("input", () => {
            const searchValue = searchInput.value;
            const type = searchType?.value || "OT";
            const query = normalizeText(searchValue);
            
            const datalist = document.getElementById("dynamicSearchSuggestions");
            if (datalist && type) {
                datalist.innerHTML = "";
                const data = this.dataService.baseAtendimentos || [];
                const fieldName = {
                    OT: 'ot',
                    CODIGO_OT_DETALHADA: 'codigo_ot_detalhado',
                    MOTORISTA: 'motorista'
                }[type];

                if (fieldName) {
                    const values = data
                        .map(item => item[fieldName])
                        .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
                        .map(value => String(value).trim());
                    const uniqueValues = [...new Set(values)];
                    
                    const matching = uniqueValues
                        .filter(val => {
                            let normVal = normalizeText(val);
                            let normQuery = query;
                            if (type === 'OT' || type === 'CODIGO_OT_DETALHADA') {
                                normVal = normVal.replace(/\s+/g, '');
                                normQuery = normQuery.replace(/\s+/g, '');
                            }
                            return normVal.includes(normQuery);
                        })
                        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
                    
                    console.log('[BUSCA DINÂMICA] Sugestões geradas:', matching.length);

                    matching.slice(0, 10).forEach(value => {
                        const option = document.createElement('option');
                        option.value = value;
                        datalist.appendChild(option);
                    });
                }
            }

            filtrar();

            const fieldName = {
                OT: 'ot',
                CODIGO_OT_DETALHADA: 'codigo_ot_detalhado',
                MOTORISTA: 'motorista'
            }[type];
            console.log('[BUSCA DINÂMICA] Base carregada:', window.transportMapData?.length);
            console.log('[BUSCA DINÂMICA] Campo utilizado:', fieldName);
            console.log('[BUSCA DINÂMICA] Valor digitado:', searchValue);

            const filteredData = this.obterAtendimentosFiltrados();
            console.log('[BUSCA DINÂMICA] Resultados filtrados:', filteredData.length);

            if (filteredData.length === 0 && searchValue.trim() !== "") {
                showToast("Nenhum atendimento encontrado para a busca informada.", "warning");
                console.warn('[BUSCA DINÂMICA] Nenhum atendimento encontrado para a busca:', searchValue);
            } else if (filteredData.length > 0 && searchValue.trim() !== "") {
                const hasCoords = (filteredData || []).some(item => item && (item.lat && item.lng));
                if (!hasCoords) {
                    showToast("Atendimento encontrado, mas sem coordenadas para exibição no mapa.", "warning");
                    console.warn('[BUSCA DINÂMICA] Atendimentos encontrados sem coordenadas geográficas.');
                }
            }

            if (filteredData.length === 1) {
                const item = filteredData[0];
                const driverIdKey = this.getDriverIdKey(item);
                
                setTimeout(() => {
                    const marker = this.mapService.markersMap.get(driverIdKey);
                    if (marker) {
                        const latLng = marker.getLatLng();
                        this.mapService.map.setView(latLng, 17, {
                            animate: true,
                            duration: 1
                        });
                        marker.openPopup();
                        
                        marker.setZIndexOffset(1000);
                        const iconEl = marker.getElement();
                        if (iconEl) {
                            iconEl.style.transition = 'all 0.3s ease';
                            iconEl.style.transform = (iconEl.style.transform || '') + ' scale(1.5)';
                            iconEl.style.filter = 'drop-shadow(0 0 12px #00d1ff) brightness(1.2)';
                            iconEl.style.border = '2px solid #00d1ff';
                            iconEl.style.borderRadius = '50%';
                        }
                        setTimeout(() => {
                            marker.setZIndexOffset(0);
                            if (iconEl) {
                                iconEl.style.transform = iconEl.style.transform.replace(' scale(1.5)', '');
                                iconEl.style.filter = '';
                                iconEl.style.border = '';
                                iconEl.style.borderRadius = '';
                            }
                        }, 5000);
                    }
                }, 200);
            } else if (filteredData.length > 1) {
                setTimeout(() => {
                    const markers = [];
                    filteredData.forEach(item => {
                        const driverIdKey = this.getDriverIdKey(item);
                        const marker = this.mapService.markersMap.get(driverIdKey);
                        if (marker) {
                            markers.push(marker);
                        }
                    });
                    if (markers.length > 0) {
                        const group = L.featureGroup(markers);
                        this.mapService.map.fitBounds(group.getBounds(), { padding: [30, 30] });
                    }
                }, 200);
            }
        });

        searchInput?.addEventListener("focus", () => {
            if (!this.dataService.baseAtendimentos || this.dataService.baseAtendimentos.length === 0) {
                showToast("Importe uma base de transportes antes de usar a busca.", "warning");
                console.warn('[BUSCA DINÂMICA] Tentativa de busca sem base de dados carregada.');
            } else {
                const type = searchType?.value;
                const fieldName = {
                    OT: 'ot',
                    CODIGO_OT_DETALHADA: 'codigo_ot_detalhado',
                    MOTORISTA: 'motorista'
                }[type];
                if (fieldName) {
                    const firstItem = this.dataService.baseAtendimentos[0];
                    if (firstItem && !(fieldName in firstItem)) {
                        showToast("Campo de busca não encontrado no arquivo importado.", "error");
                        console.error('[BUSCA DINÂMICA] Campo de busca ausente na base:', fieldName);
                    }
                }
            }
        });

        btnLimpar?.addEventListener("click", () => {
            if(sp) sp.value = "";
            if(sb) sb.value = "";
            if(st) st.value = "";
            if(se) se.value = "";
            if(sh) sh.value = "";

            if (searchType) searchType.value = "OT";
            if (searchInput) searchInput.value = "";
            
            if (window.transportMapData) {
                this.dataService.baseAtendimentos = window.transportMapData;
            }
            
            this.updateDynamicSearchSuggestions();

            this._fitBoundsAfterPlot = true;
            this.plotarAtendimentos(this.dataService.baseAtendimentos);
            this.atualizarResumoContadores();
        });

        btnCentralizar?.addEventListener("click", () => {
            if (this.mapService) {
                this.mapService.setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
            }
        });
    }

    updateDynamicSearchSuggestions() {
        const type = document.getElementById("searchType")?.value;
        const datalist = document.getElementById("dynamicSearchSuggestions");
        if (!type || !datalist) return;

        datalist.innerHTML = "";
        const data = this.dataService.baseAtendimentos || [];
        const fieldName = {
            OT: 'ot',
            CODIGO_OT_DETALHADA: 'codigo_ot_detalhado',
            MOTORISTA: 'motorista'
        }[type];

        if (!fieldName) return;

        const values = data
            .map(item => item[fieldName])
            .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
            .map(value => String(value).trim());

        const uniqueValues = [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'));

        uniqueValues.slice(0, 200).forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            datalist.appendChild(option);
        });
    }

    obterAtendimentosFiltrados() {
        const sp = document.getElementById("filtro-programa");
        const sb = document.getElementById("filtro-bairro");
        const st = document.getElementById("filtro-tipo");
        const se = document.getElementById("filtro-em-atendimento");
        const sh = document.getElementById("filtro-horario-inicio");

        const searchType = document.getElementById("searchType");
        const searchInput = document.getElementById("dynamicSearchInput");

        if (!sp || !sb) return this.dataService.baseAtendimentos || [];

        let filtered = (this.dataService.baseAtendimentos || []).filter(a => {
            const matchP = !sp.value || a.programa === sp.value;
            const matchB = !sb.value || a.bairro === sb.value;
            const matchT = !st || !st.value || a.tipoVeiculo === st.value;
            
            const statusAtual = verificarEmAtendimento(a.dataHoraInicioRaw, a.dataHoraFimRaw);
            const matchE = !se || !se.value || statusAtual === se.value;
            
            const matchH = !sh || !sh.value || obterPeriodo(a.horarioInicio) === sh.value;
            return matchP && matchB && matchT && matchE && matchH;
        });

        if (searchInput && searchInput.value && searchType && searchType.value) {
            let query = String(searchInput.value || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');

            if (query !== '') {
                const type = searchType.value;
                const fieldName = {
                    OT: 'ot',
                    CODIGO_OT_DETALHADA: 'codigo_ot_detalhado',
                    MOTORISTA: 'motorista'
                }[type];

                if (type === 'OT' || type === 'CODIGO_OT_DETALHADA') {
                    query = query.replace(/\s+/g, '');
                }

                if (fieldName) {
                    filtered = filtered.filter(item => {
                        const val = item[fieldName];
                        if (val === null || val === undefined) return false;
                        let normalizedVal = String(val)
                            .trim()
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '');
                        if (type === 'OT' || type === 'CODIGO_OT_DETALHADA') {
                            normalizedVal = normalizedVal.replace(/\s+/g, '');
                        }
                        return normalizedVal.includes(query);
                    });
                }
            }
        }

        return filtered;
    }

    atualizarResumoContadores() {
        const el = document.getElementById("resumo-atendimentos");
        if (!el) return;

        const total = (this.dataService.baseAtendimentos || []).length;
        const filtradosList = this.obterAtendimentosFiltrados() || [];
        const filtrados = filtradosList.length;
        
        const compartilhando = filtradosList.filter(a => 
            a && (this.activeTrackers || []).some(t => t && 
                (t.motorista_name || '').trim().toLowerCase() === (a.motorista || '').trim().toLowerCase() &&
                (!t.id_rota || Number(t.id_rota) === Number(a.id))
            )
        ).length;

        el.textContent = `Importados: ${total} (Filtrados: ${filtrados}) | Compartilhando: ${compartilhando}`;
    }

    iniciarPoolActiveTrackers() {
        if (!CONFIG.FEATURE_MONITORAMENTO) {
            console.info("[MONITORAMENTO] Polling de rastreamento de monitoramento suspenso temporariamente.");
            if (this.activeTrackersInterval) {
                clearInterval(this.activeTrackersInterval);
                this.activeTrackersInterval = null;
            }
            return;
        }

        const fetchActive = () => {
            fetch('/api/gps/active-trackers')
                .then(r => r.json())
                .then(data => {
                    if (data && data.ok) {
                        this.activeTrackers = Array.isArray(data.trackers) ? data.trackers : [];
                        let statusMudou = false;

                        // Sincroniza status de atendimento local
                        if (Array.isArray(this.dataService.baseAtendimentos)) {
                            this.dataService.baseAtendimentos.forEach(a => {
                                if (!a) return;
                                const active = (this.activeTrackers || []).find(t => t && 
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

    async abrirEmulador(id, tokenPuro = null) {
        const modal = document.getElementById("modalEmulador");
        const iframe = document.getElementById("iframeEmulador");
        if (modal && iframe) {
            let finalLink = tokenPuro ? `${window.location.origin}/motorista.html?token=${tokenPuro}` : '';
            if (!tokenPuro && id) {
                try {
                    const res = await fetch('/api/auditoria/solicitar-posicao', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ atendimento: id, acao: 'ABRIR_EMULADOR' })
                    });
                    const data = await res.json();
                    if (data.link) finalLink = data.link;
                } catch(e) {
                    console.error("Erro ao solicitar token para o emulador:", e);
                }
            }
            iframe.src = finalLink || `/motorista.html?invalid=1`;
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
        if (!CONFIG.FEATURE_MONITORAMENTO) {
            if (btn) {
                btn.style.display = 'none';
                btn.onclick = (e) => {
                    e.preventDefault();
                    showToast("Importação de base de monitoramento suspensa temporariamente.", "warning");
                };
            }
            return;
        }
        btn?.addEventListener("click", () => input.click());
        input?.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const regional = document.getElementById('seletor-regiao')?.value || 'RJ';
            console.log('[IMPORT] Arquivo recebido:', file.name);
            console.log('[IMPORT] Regional selecionada:', regional);

            try {
                showToast("Processando e enviando base para a Equipe de Transportes...", "info");
                
                const formData = new FormData();
                formData.append("planilha", file);
                
                const res = await fetch(`/api/rotas/importar?tipo=monitoramento&regional=${regional}`, {
                    method: "POST",
                    body: formData
                });
                const json = await res.json();
                
                if (!json || !json.ok) {
                    throw new Error((json && json.error) || "Erro ao fazer upload da base");
                }
                
                const resultados = Array.isArray(json.resultados) ? json.resultados : [];
                console.log('[IMPORT] Quantidade de registros:', resultados.length);

                const atendimentos = resultados
                    .filter(r => r && r.status === 'SUCESSO')
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
                        destino: r.destino || '',
                        ot: r.ot || '',
                        codigo_ot_detalhado: r.codigo_ot_detalhado || ''
                    }));
                
                this.dataService.garantirCoordenadas(atendimentos);
                this.dataService.baseAtendimentos = atendimentos;
                window.transportMapData = atendimentos;
                this.updateDynamicSearchSuggestions();
                this.preencherDropdowns(atendimentos);
                
                const statusEl = document.getElementById("geo-status");
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--good)">Pronto (${atendimentos.length} carregados)</span>`;
                
                this._fitBoundsAfterPlot = true;
                this.plotarAtendimentos(atendimentos);
                this.atualizarResumoContadores();

                // Background refinement
                this.dataService.geocodificar((pct) => {
                    if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent)">Geocodificando ${pct}%...</span>`;
                }).then(() => {
                    if (statusEl) statusEl.innerHTML = `<span style="color:var(--good)">Pronto (OK)</span>`;
                    this.plotarAtendimentos(this.dataService.baseAtendimentos);
                    this.atualizarResumoContadores();
                }).catch(geoErr => console.warn("[GEOCODE] Erro no upload background geocode:", geoErr));

                showToast("Base carregada com sucesso!", "success");
                console.log('[IMPORT] Processo concluído.');
            } catch (err) {
                console.error('[ERROR] Endpoint: POST /importar | Regional:', regional, '| Mensagem original:', err.message, '| Stack completa:', err.stack);
                showToast(err.message || "Erro ao processar planilha.", "error");
            }
        });
    }

    getDriverIdKey(item) {
        if (!item) return 'item_desconhecido';
        const idVal = item.id || item.id_rota;
        if (idVal) {
            return `item_${idVal}`;
        }
        const nameVal = item.motorista || item.motorista_name || 'desconhecido';
        const cleanName = String(nameVal).trim().toLowerCase().replace(/\s+/g, '_');
        return `item_${cleanName}`;
    }

    focarMarcadorNoMapa(markerId) {
        if (!CONFIG.FEATURE_MONITORAMENTO || !this.mapService) {
            return;
        }
        console.log('[VER NO MAPA] Atendimento:', markerId);
        const marker = this.mapService.markersMap.get(markerId);
        console.log('[VER NO MAPA] Marker:', marker);

        if (!marker) {
            console.error(`[VER NO MAPA] Marker não encontrado para ${markerId}`);
            showToast("Não foi possível localizar o atendimento no mapa.", "error");
            return;
        }

        const latLng = marker.getLatLng();
        console.log('[VER NO MAPA] Coordenadas:', latLng);

        if (!latLng || !latLng.lat || !latLng.lng) {
            showToast("Atendimento sem coordenadas geográficas.", "warning");
            return;
        }

        // Centralizar o mapa na coordenada do atendimento com zoom
        this.mapService.map.setView(latLng, 17, {
            animate: true,
            duration: 1
        });

        // Abrir automaticamente o popup do atendimento
        marker.openPopup();

        // Aplicar destaque temporário (Melhoria Visual Obrigatória)
        marker.setZIndexOffset(1000);
        
        const iconElement = marker.getElement();
        if (iconElement) {
            iconElement.style.transition = 'all 0.3s ease';
            iconElement.style.transform = (iconElement.style.transform || '') + ' scale(1.5)';
            iconElement.style.filter = 'drop-shadow(0 0 12px #00d1ff) brightness(1.2)';
            iconElement.style.border = '2px solid #00d1ff';
            iconElement.style.borderRadius = '50%';
        }

        setTimeout(() => {
            marker.setZIndexOffset(0);
            if (iconElement) {
                iconElement.style.transform = iconElement.style.transform.replace(' scale(1.5)', '');
                iconElement.style.filter = '';
                iconElement.style.border = '';
                iconElement.style.borderRadius = '';
            }
        }, 5000);

        // Caso o atendimento possua rota desenhada, destacar e enquadrar a rota
        if (this.mapService.routeOverlays && this.mapService.routeOverlays.length > 0) {
            console.log('[VER NO MAPA] Rotas encontradas no mapa, enquadrando...');
            const bounds = L.featureGroup(this.mapService.routeOverlays).getBounds();
            this.mapService.map.fitBounds(bounds);
        }
    }

    plotarAtendimentos(lista) {
        if (!CONFIG.FEATURE_MONITORAMENTO || !this.mapService) {
            return;
        }
        if (!Array.isArray(lista)) lista = [];
        lista = lista.filter(Boolean);

        console.log('[RIT MAP DIAGNOSTIC] ATENDIMENTOS RECEBIDOS:', lista.length);
        console.table(lista.slice(0, 5));

        if (this.mapMode === 'TODOS') {
            const validItems = lista.filter(a => {
                if (!a) return false;
                const activeTracker = (this.activeTrackers || []).find(t => t && 
                    (t.motorista_name || '').trim().toLowerCase() === (a.motorista || '').trim().toLowerCase()
                );
                const hasTrackerCoords = activeTracker && !isNaN(parseFloat(activeTracker.lat)) && !isNaN(parseFloat(activeTracker.lng));
                const hasItemCoords = !isNaN(parseFloat(a.lat)) && !isNaN(parseFloat(a.lng));
                return hasTrackerCoords || hasItemCoords;
            });
            
            console.log('[RIT MAP DIAGNOSTIC] REGISTROS COM COORDENADAS VÁLIDAS:', validItems.length);
            
            const total = validItems.length;
            if (total === 0) {
                this.mapService.clearMarkers();
                this.atualizarListaSidebar(lista);
                return;
            }

            const activeIdsSet = new Set();
            const chunkSize = Math.max(1, Math.ceil(total * 0.3));
            let index = 0;

            const renderNextChunk = () => {
                if (this.mapMode !== 'TODOS') return;

                const limit = Math.min(index + chunkSize, total);
                for (; index < limit; index++) {
                    const a = validItems[index];
                    if (!a) continue;
                    const activeTracker = (this.activeTrackers || []).find(t => t && 
                        (t.motorista_name || '').trim().toLowerCase() === (a.motorista || '').trim().toLowerCase() &&
                        (!t.id_rota || Number(t.id_rota) === Number(a.id))
                    );
                    const isActive = !!activeTracker;
                    
                    const plotLat = (isActive && activeTracker.lat) ? parseFloat(activeTracker.lat) : parseFloat(a.lat);
                    const plotLng = (isActive && activeTracker.lng) ? parseFloat(activeTracker.lng) : parseFloat(a.lng);
                    
                    const popupHtml = this.obterHtmlPopupAtendimento(a, isActive, activeTracker);
 
                    const pinSymbol = {
                        html: obterIconeVeiculoHTML(a.tipoVeiculo, isActive, a, activeTracker),
                        iconSize: [36, 36],
                        iconAnchor: [18, 18]
                    };
 
                    const driverIdKey = this.getDriverIdKey(a);
                    activeIdsSet.add(driverIdKey);

                    const marker = this.mapService.updateOrAddMarker(driverIdKey, plotLat, plotLng, popupHtml, pinSymbol);
                    if (marker) {
                        if (marker._customClick) {
                            marker.off('click', marker._customClick);
                        }
                        const clickHandler = () => {
                            this.activeGpsPopupDriver = a.motorista;
                            this.activeGpsPopupMode = 'TODOS';
                            exibirPainelAtendimento(a, isActive, activeTracker);
                        };
                        marker._customClick = clickHandler;
                        marker.on('click', clickHandler);

                        // Tooltip com delay aproximado de 300ms
                        let hoverTimeout;
                        marker.on('mouseover', (e) => {
                            hoverTimeout = setTimeout(() => {
                                const statusInfo = getPremiumRitStatus(a, isActive, activeTracker);
                                const t = String(a.tipoVeiculo || '').toLowerCase();
                                let filename = 'passeio.png';
                                if (t.includes('blindado')) filename = 'passeio_blindado.png';
                                else if (t.includes('mixto') || t.includes('misto')) filename = 'furgao_mixto.png';
                                else if (t.includes('onibus') || t.includes('ônibus') || t.includes('bus') || t.includes('micro')) filename = 'onibus.png';
                                else if (t.includes('van')) filename = 'van.png';
                                else if (t.includes('furgao') || t.includes('furgão')) filename = 'furgao.png';
                                else if (t.includes('caminhao') || t.includes('caminhão')) filename = 'caminhao.png';
                                else if (t.includes('pickup')) filename = 'pickup.png';
                                else if (t.includes('suv')) filename = 'suv.png';

                                const tooltipHtml = `
                                    <div class="premium-rit-tooltip" style="--premium-status-color: ${statusInfo.color};">
                                        <div class="premium-rit-tooltip-image">
                                            <img src="/img/veiculos/${filename}" alt="${a.tipoVeiculo}" />
                                        </div>
                                        <div class="premium-rit-tooltip-content">
                                            <strong>${String(a.tipoVeiculo || 'VEÍCULO').toUpperCase()}</strong>
                                            <span>${a.placa || 'N/D'}</span>
                                            <span class="status-line">
                                                <i class="status-dot"></i> ${statusInfo.label}
                                            </span>
                                            <span>${a.bairro || 'Rio de Janeiro'}</span>
                                        </div>
                                    </div>
                                `;
                                marker.bindTooltip(tooltipHtml, {
                                    direction: 'right',
                                    permanent: false,
                                    sticky: false,
                                    opacity: 0.96,
                                    className: 'premium-rit-tooltip-container'
                                }).openTooltip();
                            }, 300);
                        });

                        marker.on('mouseout', (e) => {
                            clearTimeout(hoverTimeout);
                            marker.closeTooltip();
                            marker.unbindTooltip();
                        });

                        a._marker = marker;
                    }
                }

                if (index < total) {
                    setTimeout(renderNextChunk, 10);
                } else {
                    this.mapService.syncActiveMarkers(activeIdsSet);
                    this.mapService.invalidateSize();
                    
                    const markers = [];
                    activeIdsSet.forEach(idKey => {
                        const m = this.mapService.markersMap.get(idKey);
                        if (m) markers.push(m);
                    });
                    
                    console.log('[RIT MAP DIAGNOSTIC] TOTAL DE MARCADORES NA CAMADA:', markers.length);
                    
                    if (markers.length > 0) {
                        const group = L.featureGroup(markers);
                        const bounds = group.getBounds();
                        console.log('[RIT MAP DIAGNOSTIC] BOUNDS VÁLIDOS:', bounds.isValid(), bounds);
                        if (bounds.isValid()) {
                            this.mapService.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
                        }
                    }
                    this._fitBoundsAfterPlot = false;
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

        if (!Array.isArray(lista)) return;

        lista.forEach(a => {
            if (!a) return;
            const isActive = (this.activeTrackers || []).some(t => t && 
                (t.motorista_name || '').trim().toLowerCase() === (a.motorista || '').trim().toLowerCase() &&
                (!t.id_rota || Number(t.id_rota) === Number(a.id))
            );
            const m = escapeHtml(a.motorista);
            const pl = escapeHtml(a.placa);
            const b = escapeHtml(a.bairro);
            const pass = escapeHtml(a.passageiro || 'Não informado');
            const p = escapeHtml(a.programa);

            const dateFormatted = a.data_atendimento || (a.horario ? extrairDataDeHorario(a.horario) : null) || (a.dataHoraInicioRaw ? extrairDataDeHorario(a.dataHoraInicioRaw) : null) || 'Data não informada';
            // Resolvido
            
            const driverIdKey = this.getDriverIdKey(a);
            console.info("[RIT LIST] botão Ver no Mapa renderizado", { driverIdKey, motorista: a.motorista, id: a.id });

            let actionsHtml = `<div style="margin-top: 8px; display: flex; gap: 6px; align-items: center;">`;
            actionsHtml += `
                <button type="button" 
                        class="btn-focus-map" 
                        data-action="focus-map" 
                        data-marker-id="${driverIdKey}" 
                        style="background: #00d1ff; color: #020408; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 800; cursor: pointer; flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.2s; pointer-events: auto;">
                    📍 Ver no Mapa
                </button>
            `;
            if (isActive) {
                actionsHtml += `
                    <button onclick="window.uiController.desconectarMotorista('${a.id}')" class="btn btnSmall" style="background:#EF4444; color:#fff; border:none; padding:6px 10px; border-radius:4px; font-size:10px; font-weight:800; cursor:pointer;">
                        🛑 Desconectar
                    </button>
                `;
            }
            actionsHtml += `</div>`;
            
            const statusBadge = obterBadgeStatusAtendimento(a.statusAtendimento);
            
            let filename = 'passeio.png';
            const t = String(a.tipoVeiculo || '').toLowerCase();
            if (t.includes('blindado')) filename = 'passeio_blindado.png';
            else if (t.includes('mixto') || t.includes('misto')) filename = 'furgao_mixto.png';
            else if (t.includes('onibus') || t.includes('ônibus') || t.includes('bus') || t.includes('micro')) filename = 'onibus.png';
            else if (t.includes('van') || t.includes('combi') || t.includes('camarim')) filename = 'van.png';
            else if (t.includes('furgao') || t.includes('furgão') || t.includes('fiorino') || t.includes('cargo') || t.includes('kangoo') || t.includes('doblo')) filename = 'furgao.png';
            else if (t.includes('caminhao') || t.includes('caminhão') || t.includes('truck') || t.includes('figurino')) filename = 'caminhao.png';
            else if (t.includes('pickup') || t.includes('picap') || t.includes('picape') || t.includes('toro') || t.includes('hilux') || t.includes('s10') || t.includes('ranger')) filename = 'pickup.png';
            else if (t.includes('suv') || t.includes('renegade') || t.includes('compass') || t.includes('creta') || t.includes('hrv') || t.includes('tracker')) filename = 'suv.png';

            listEl.innerHTML += `
                <div class="card" style="margin-bottom:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid ${isActive ? '#10B981' : 'rgba(255,255,255,0.06)'}; border-radius:6px; box-shadow: ${isActive ? '0 0 8px rgba(16,185,129,0.15)' : 'none'};">
                    <div class="row1" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span class="badgeProgram" style="font-size:9px; background:rgba(0,209,255,0.15); color:var(--accent); font-weight:800; padding:2px 6px; border-radius:4px;">${p}</span>
                        ${statusBadge}
                    </div>
                    <div class="meta-data-atendimento" style="font-size:11px; font-weight:700; color:#00d1ff; margin-bottom:4px;">📅 ${dateFormatted}</div>
                    <div class="meta-motorista" style="font-size:12px; font-weight:700; color:#fff; margin-bottom:2px;">👤 ${m}</div>
                    <div class="meta-passageiro" style="font-size:11px; color:#fff; margin-bottom:2px;">👤 Pass: ${pass}</div>
                    <div class="meta-veiculo" style="font-size:10px; color:var(--muted); margin-bottom:2px; display:flex; align-items:center; gap:4px;">
                        <img src="/img/veiculos/${filename}" style="width:16px; height:16px; object-fit:contain;" /> 
                        ${pl} (${escapeHtml(a.tipoVeiculo)})
                    </div>
                    <div class="meta-bairro" style="font-size:10px; color:var(--muted);">📍 Destino: ${b}</div>
                    ${actionsHtml}
                </div>
            `;
        });
    }

    initRegionalization() {
        const seletor = document.getElementById('seletor-regiao');
        if (!seletor) return;

        const brandRegional = document.getElementById('brand-regional');
        const tabBtnCameras = document.getElementById('tab-btn-cameras');
        const tabBtnRadar = document.getElementById('tab-btn-radar');
        const climaInfo = document.getElementById('clima-info');
        const fontesInfo = document.getElementById('fontes-info');
        const elEstagio = document.getElementById('cor-estagio');
        const elCalor = document.getElementById('cor-calor');
        const sidebarPill = document.getElementById('status-operacional-pill');

        const regioes = {
            RJ: {
                nome: 'RIO DE JANEIRO',
                label: 'RJ',
                clima: '28°C ☀️ RIO DE JANEIRO',
                fontes: '• COR.RIO<br>• Alerta Rio<br>• CET Rio<br>• Radar Meteorológico',
                estagio: 'normal',
                cor: '#228d46'
            },
            SP: {
                nome: 'SÃO PAULO',
                label: 'SP',
                clima: '20°C ☁️ SÃO PAULO',
                fontes: '• CET-SP<br>• CGE-SP',
                estagio: 'NORMAL',
                cor: '#228d46'
            },
            BH: {
                nome: 'BELO HORIZONTE',
                label: 'BH',
                clima: '22°C 🌤️ BELO HORIZONTE',
                fontes: '• BHTRANS<br>• Defesa Civil BH',
                estagio: 'ATENÇÃO',
                cor: '#f2d024'
            },
            BSB: {
                nome: 'BRASÍLIA',
                label: 'BSB',
                clima: '24°C ☀️ BRASÍLIA',
                fontes: '• DER-DF<br>• Defesa Civil DF',
                estagio: 'NORMAL',
                cor: '#228d46'
            },
            REC: {
                nome: 'RECIFE',
                label: 'REC',
                clima: '30°C ☀️ RECIFE',
                fontes: '• APAC<br>• CTTU',
                estagio: 'NORMAL',
                cor: '#228d46'
            }
        };

        const aplicarRegiao = (reg) => {
            const config = regioes[reg];
            if (!config) return;

            localStorage.setItem('rit_selected_regional', reg);

            if (brandRegional) brandRegional.textContent = `TRANSPORTES ${config.label}`;
            if (tabBtnCameras) tabBtnCameras.textContent = `Câmeras ${config.label}`;
            if (tabBtnRadar) tabBtnRadar.textContent = `Radar Meteorológico ${config.label}`;
            
            if (climaInfo) climaInfo.innerHTML = config.clima;
            if (fontesInfo) fontesInfo.innerHTML = config.fontes;

            if (reg === 'RJ') {
                if (elCalor) elCalor.style.display = 'inline-block';
                if (this.corRioService) {
                    try {
                        if (typeof this.corRioService.fetchStatusOperacional === 'function') {
                            this.corRioService.fetchStatusOperacional();
                        } else if (typeof this.corRioService.fetchEstagio === 'function') {
                            this.corRioService.fetchEstagio();
                        }
                    } catch (corErr) {
                        console.warn("[RIT] Erro ao buscar status COR.RIO:", corErr);
                    }
                }
            } else {
                if (elCalor) elCalor.style.display = 'none';
                if (elEstagio) {
                    elEstagio.style.display = 'inline-block';
                    elEstagio.style.background = config.cor;
                    elEstagio.style.color = config.estagio === 'ATENÇÃO' ? '#000' : '#fff';
                    elEstagio.innerHTML = `<span style="font-weight:900;">${config.estagio}</span>`;
                }
                if (sidebarPill) {
                    sidebarPill.textContent = config.estagio;
                    sidebarPill.style.background = config.cor;
                    sidebarPill.style.color = config.estagio === 'ATENÇÃO' ? '#000' : '#fff';
                }
            }

            // Atualiza dinamicamente a aba de câmeras para a regional selecionada
            if (this.camerasService && typeof this.camerasService.setRegional === 'function') {
                try {
                    this.camerasService.setRegional(reg);
                } catch (camErr) {
                    console.warn("[RIT] Erro ao sincronizar aba de câmeras com a regional:", camErr);
                }
            }

            console.log(`[REGIONALIZAÇÃO] Região alterada para: ${reg}`, config);
            showToast(`Região alterada para ${config.nome}`, 'info');
        };

        seletor.addEventListener('change', (e) => {
            aplicarRegiao(e.target.value);
            this.carregarBaseExistente();
        });

        const savedRegional = localStorage.getItem('rit_selected_regional');
        if (savedRegional && regioes[savedRegional]) {
            seletor.value = savedRegional;
        }

        aplicarRegiao(seletor.value);
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
        if (!CONFIG.FEATURE_MONITORAMENTO) {
            return;
        }
        
        const fetchAndRenderActiveDrivers = () => {
            fetch('/api/gps/active-trackers')
                .then(r => r.json())
                .then(data => {
                    if (data.ok && this.mapMode === 'ONLINE') {
                        this.activeTrackers = Array.isArray(data.trackers) ? data.trackers : [];
                        const activeIdsSet = new Set();
                        
                        this.activeTrackers.forEach(t => {
                            if (!t) return;
                            const match = (this.dataService.baseAtendimentos || []).find(a => 
                                a && ((a.motorista || '').trim().toLowerCase() === (t.motorista_name || '').trim().toLowerCase() ||
                                (t.id_rota && String(t.id_rota) === String(a.id)))
                            ) || {};

                            const popupHtml = this.obterHtmlPopupAtendimento(match, true, t);
                            
                            const pinSymbol = {
                                 html: obterIconeVeiculoHTML(t.tipo_veiculo, true, match, t),
                                 iconSize: [36, 36],
                                 iconAnchor: [18, 18]
                             };
                            
                            const trackerIdKey = this.getDriverIdKey(t);
                            activeIdsSet.add(trackerIdKey);

                            const marker = this.mapService.updateOrAddMarker(trackerIdKey, t.lat, t.lng, popupHtml, pinSymbol);
                            if (marker) {
                                if (marker._customClick) {
                                    marker.off('click', marker._customClick);
                                }
                                const clickHandler = () => {
                                    this.activeGpsPopupDriver = t.motorista_name;
                                    this.activeGpsPopupMode = 'ONLINE';
                                    exibirPainelAtendimento(match, true, t);
                                };
                                marker._customClick = clickHandler;
                                marker.on('click', clickHandler);

                                // Tooltip com delay aproximado de 300ms
                                let hoverTimeout;
                                marker.off('mouseover');
                                marker.on('mouseover', (e) => {
                                    hoverTimeout = setTimeout(() => {
                                        const statusInfo = getPremiumRitStatus(match, true, t);
                                        const vt = String(t.tipo_veiculo || match.tipoVeiculo || '').toLowerCase();
                                        let filename = 'passeio.png';
                                        if (vt.includes('blindado')) filename = 'passeio_blindado.png';
                                        else if (vt.includes('mixto') || vt.includes('misto')) filename = 'furgao_mixto.png';
                                        else if (vt.includes('onibus') || vt.includes('ônibus') || vt.includes('bus') || vt.includes('micro')) filename = 'onibus.png';
                                        else if (vt.includes('van')) filename = 'van.png';
                                        else if (vt.includes('furgao') || vt.includes('furgão')) filename = 'furgao.png';
                                        else if (vt.includes('caminhao') || vt.includes('caminhão')) filename = 'caminhao.png';
                                        else if (vt.includes('pickup')) filename = 'pickup.png';
                                        else if (vt.includes('suv')) filename = 'suv.png';

                                        const tooltipHtml = `
                                            <div class="premium-rit-tooltip" style="--premium-status-color: ${statusInfo.color};">
                                                <div class="premium-rit-tooltip-image">
                                                    <img src="/img/veiculos/${filename}" alt="${t.tipo_veiculo}" />
                                                </div>
                                                <div class="premium-rit-tooltip-content">
                                                    <strong>${String(t.tipo_veiculo || match.tipoVeiculo || 'VEÍCULO').toUpperCase()}</strong>
                                                    <span>${t.placa || match.placa || 'N/D'}</span>
                                                    <span class="status-line">
                                                        <i class="status-dot"></i> ${statusInfo.label}
                                                    </span>
                                                    <span>${match.bairro || 'Rio de Janeiro'}</span>
                                                </div>
                                            </div>
                                        `;
                                        marker.bindTooltip(tooltipHtml, {
                                            direction: 'right',
                                            permanent: false,
                                            sticky: false,
                                            opacity: 0.96,
                                            className: 'premium-rit-tooltip-container'
                                        }).openTooltip();
                                    }, 300);
                                });

                                marker.off('mouseout');
                                marker.on('mouseout', (e) => {
                                    clearTimeout(hoverTimeout);
                                    marker.closeTooltip();
                                    marker.unbindTooltip();
                                });
                            }
                        });

                        this.mapService.syncActiveMarkers(activeIdsSet);
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
        const rawInicio = a.dataHoraInicioRaw || (activeTracker ? activeTracker.horario : null);
        const rawFim = a.dataHoraFimRaw || (activeTracker ? activeTracker.horario_termino : null);
        const horarioInicio = formatarHorario(rawInicio);
        const horarioFim = formatarHorario(rawFim);
        
        let actionsHtml = `<div style="margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; gap: 6px;">`;
        if (telefone && !isActive) {
            const safeMotorista = escapeHtml(motoristaName);
            const safePlaca = escapeHtml(placa);
            const safeId = a.id || activeTracker?.id_rota || '';
            const empresaCooperativa = motoristaName.includes(' - ') ? motoristaName.split(' - ').slice(1).join(' - ') : 'Conexão Transportes';
            const safeEmpresa = escapeHtml(empresaCooperativa);
            const safeProg = escapeHtml(programa);
            const safeOrig = escapeHtml(origem);
            const safeDest = escapeHtml(destino);
            const safeStart = escapeHtml(horarioInicio);
            const safeEnd = escapeHtml(horarioFim);

            actionsHtml += `
                <button onclick="window.uiController.abrirModalSolicitarPosicao('${safeMotorista}', '${safePlaca}', '${safeId}', '${safeEmpresa}', '${safeProg}', '${safeOrig}', '${safeDest}', '${safeStart}', '${safeEnd}')" style="background:#25D366; color:#04111a; border:none; padding:5px 10px; border-radius:4px; font-size:10px; font-weight:800; display:inline-block; border:1px solid #1e7e34; text-align:center; flex:1; cursor:pointer;">
                    💬 Solicitar
                </button>
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
                        const addr = (data && data.ok && data.address) ? data.address : 'Endereço indisponível';
                        window._geoAddressCache[cacheKey] = addr;
                        const el = document.getElementById(addressId);
                        if (el) el.textContent = addr;
                    })
                    .catch(err => {
                        console.warn("[RIT GEO] Falha ao obter endereço", { error: err ? err.message : 'network_error', lat, lng });
                        const addr = 'Endereço indisponível';
                        window._geoAddressCache[cacheKey] = addr;
                        const el = document.getElementById(addressId);
                        if (el) el.textContent = addr;
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
        document.getElementById('btn-atualizar-ott')?.addEventListener('click', () => this.atualizarInformesOTT());

        document.getElementById('layer-toggle-ott')?.addEventListener('change', (e) => {
            this.transitoMap?.setLayerVisibility('ott', e.target.checked);
        });

        document.getElementById('layer-toggle-fogo')?.addEventListener('change', (e) => {
            this.transitoMap?.setLayerVisibility('fogo', e.target.checked);
        });

        document.getElementById('seletor-buffer-risco')?.addEventListener('change', () => {
            if (this.lastCalculatedRouteCoords) {
                this.recalcularRiscoRota();
            }
        });
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
        if (!Array.isArray(coordinates)) return pedagiosDetectados;
        
        for (const p of pedagios) {
            const cruzou = coordinates.some(coord => {
                if (!coord || coord.length < 2) return false;
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



    async atualizarMapaLive() {
        const origem = document.getElementById('waze-origem')?.value?.trim() || '';
        const destino = document.getElementById('waze-destino')?.value?.trim() || '';
        const riskPanel = document.getElementById('risk-analysis-panel');
        const riskContent = document.getElementById('risk-content');
        const bufferMetros = parseInt(document.getElementById('seletor-buffer-risco')?.value || '1000', 10);

        if (!origem || !destino) {
            showToast("Informe origem e destino para a análise de risco.", "error");
            return;
        }

        showToast("Calculando rota e avaliando corredor de risco...", "info");
        if (riskPanel) riskPanel.style.display = 'block';
        if (riskContent) riskContent.innerHTML = '<div style="text-align:center; padding:15px; color:#00d1ff;"><i class="fa-solid fa-spinner fa-spin"></i> Traçando rota OSRM e cruzando inteligência de segurança...</div>';

        try {
            const headers = { Accept: 'application/json' };
            const qOrig = `${origem}, Rio de Janeiro, Brasil`;
            const resO = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(qOrig)}&limit=1`, { headers });
            const dataOrig = await resO.json();
            if (!dataOrig.length) throw new Error('Origem não localizada pelo geocodificador.');

            const qDest = `${destino}, Rio de Janeiro, Brasil`;
            const resD = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(qDest)}&limit=1`, { headers });
            const dataDest = await resD.json();
            if (!dataDest.length) throw new Error('Destino não localizado pelo geocodificador.');

            const lat1 = parseFloat(dataOrig[0].lat);
            const lon1 = parseFloat(dataOrig[0].lon);
            const lat2 = parseFloat(dataDest[0].lat);
            const lon2 = parseFloat(dataDest[0].lon);

            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
            const resR = await fetch(osrmUrl);
            const routeData = await resR.json();
            if (!routeData.routes?.length) throw new Error('Serviço de rotas indisponível.');

            const coords = routeData.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
            const distanciaKm = (routeData.routes[0].distance / 1000).toFixed(1);
            const duracaoMin = Math.round(routeData.routes[0].duration / 60);
            const custo = (parseFloat(distanciaKm) * 1.5 + 5).toFixed(2);

            this.lastCalculatedRouteCoords = coords;
            this.lastCalculatedRouteInfo = { distanciaKm, duracaoMin, custo, origem, destino, lat1, lon1, lat2, lon2 };

            // 1. Enviar para a inteligência de risco geoespacial
            console.log(`[ROTA-CHECK] Consultando /api/seguranca/analisar-rota para rota de ${coords.length} pontos | Buffer: ${bufferMetros}m`);
            const analiseRes = await fetch('/api/seguranca/analisar-rota', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    routeCoords: coords,
                    bufferMetros: bufferMetros,
                    state: 'RJ'
                })
            });

            const analiseData = await analiseRes.json();
            const analise = analiseData.analise || {};

            console.log(`[RISCO-CALCULADO] Resultado da análise:`, analise);

            // 2. Renderizar no mapa Leaflet
            if (this.transitoMap) {
                this.transitoMap.clearRouteOverlay();
                this.transitoMap.clearLayerGroup('route');
                this.transitoMap.clearLayerGroup('corridor');

                // Marcador Origem
                this.transitoMap.addMarkerToLayer('route', lat1, lon1, `<b>📍 Origem:</b> ${escapeHtml(origem)}`, {
                    html: '<div style="background:#10b981; color:#fff; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:12px; border:2px solid #fff; box-shadow:0 2px 5px rgba(0,0,0,0.5);">A</div>'
                });

                // Marcador Destino
                this.transitoMap.addMarkerToLayer('route', lat2, lon2, `<b>🏁 Destino:</b> ${escapeHtml(destino)}`, {
                    html: '<div style="background:#f43f5e; color:#fff; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:12px; border:2px solid #fff; box-shadow:0 2px 5px rgba(0,0,0,0.5);">B</div>'
                });

                // Rota colorida por risco
                this.transitoMap.renderRouteWithRisk(coords, analise.corRisco || '#10b981', 6);

                // Corredor de buffer visual
                this.transitoMap.renderCorridorBuffer(coords, bufferMetros, analise.corRisco || '#10b981');

                this.transitoMap.fitBounds([
                    [Math.min(lat1, lat2), Math.min(lon1, lon2)],
                    [Math.max(lat1, lat2), Math.max(lon1, lon2)]
                ]);
            }

            // 3. Renderizar card de inteligência operacional
            if (riskContent) {
                const badgeColor = analise.corRisco || '#10b981';
                const iconeRisco = analise.iconeRisco || '🟢';
                const nivel = analise.nivelRisco || 'BAIXO';
                const totalNoCorredor = analise.totalNoCorredor || 0;
                const menorDistancia = analise.menorDistanciaMetros !== undefined ? `${analise.menorDistanciaMetros}m` : 'N/D';

                let ocorrenciasHtml = '';
                if (analise.ocorrenciasNoCorredor && analise.ocorrenciasNoCorredor.length > 0) {
                    ocorrenciasHtml = `
                        <div style="margin-top:8px; border-top:1px solid #333; padding-top:8px;">
                            <div style="font-size:10px; font-weight:700; color:#00d1ff; text-transform:uppercase; margin-bottom:4px;">
                                Eventos Críticos no Corredor (${bufferMetros}m):
                            </div>
                            <div style="max-height:120px; overflow-y:auto; display:flex; flex-direction:column; gap:4px;">
                                ${analise.ocorrenciasNoCorredor.map(o => `
                                    <div style="background:rgba(255,255,255,0.03); padding:4px 6px; border-radius:4px; border-left:3px solid ${o.categoria === 'tiroteio' ? '#ef4444' : '#f59e0b'}; font-size:10px;">
                                        <div style="display:flex; justify-content:space-between;">
                                            <strong>${escapeHtml(o.icone || '⚠️')} ${escapeHtml(o.tipo)}</strong>
                                            <span style="color:#00d1ff; font-weight:700;">${o.distanciaMetros}m da rota</span>
                                        </div>
                                        <div style="color:#aaa; font-size:9px;">${escapeHtml(o.bairro)} (${escapeHtml(o.municipio)}) • ${escapeHtml(o.hora)} [${escapeHtml(o.fonte)}]</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }

                riskContent.innerHTML = `
                    <div style="background: rgba(10,15,28,0.8); border: 1px solid ${badgeColor}; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="font-size:11px; font-weight:700; color:#fff;">Classificação de Risco:</span>
                            <span style="background:${badgeColor}; color:#fff; font-weight:900; font-size:11px; padding:2px 8px; border-radius:4px; letter-spacing:0.5px;">
                                ${iconeRisco} RISCO ${escapeHtml(nivel)}
                            </span>
                        </div>
                        <div style="font-size:11px; line-height:1.4; color:#e2e8f0; margin-bottom:6px;">
                            ${escapeHtml(analise.recomendacao || '')}
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:10px; background:rgba(0,0,0,0.3); padding:6px; border-radius:4px;">
                            <div><b>Distância Total:</b> ${escapeHtml(distanciaKm)} km</div>
                            <div><b>Tempo Estimado:</b> ${duracaoMin} min</div>
                            <div><b>Eventos no Corredor:</b> <span style="color:${totalNoCorredor > 0 ? '#ef4444' : '#10b981'}; font-weight:700;">${totalNoCorredor}</span></div>
                            <div><b>Distância Mínima:</b> <span style="color:#00d1ff; font-weight:700;">${menorDistancia}</span></div>
                        </div>
                        ${ocorrenciasHtml}
                    </div>
                `;
            }

            showToast(`Análise de risco concluída: ${analise.nivelRisco || 'OK'}`, "success");
        } catch (err) {
            console.error('[FOGO-RISK] Erro ao processar rota/risco:', err);
            if (riskContent) riskContent.innerHTML = `<span style="color: var(--bad);">Erro ao processar risco: ${escapeHtml(err.message)}</span>`;
            showToast('Erro ao calcular rota/risco.', 'error');
        }
    }

    async recalcularRiscoRota() {
        if (this.lastCalculatedRouteCoords) {
            this.atualizarMapaLive();
        }
    }

    abrirRotaExterna() {
        const o = document.getElementById('waze-origem')?.value;
        const d = document.getElementById('waze-destino')?.value;
        if (o && d) {
            abrirCanalExterno(`https://www.waze.com/ul?q=${encodeURIComponent(d)}&from=${encodeURIComponent(o)}&navigate=yes`);
        } else {
            showToast("Informe origem e destino.", "error");
        }
    }

    async atualizarInformesOTT() {
        const listEl = document.getElementById('ott-reports-list');
        const statsEl = document.getElementById('ott-reports-stats');
        if (listEl) {
            listEl.innerHTML = '<div style="color:var(--accent); text-align:center; padding:10px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Sincronizando fontes de segurança pública...</div>';
        }

        const reg = document.getElementById('seletor-regiao')?.value || 'RJ';
        const showOtt = document.getElementById('layer-toggle-ott')?.checked !== false;
        const showFogo = document.getElementById('layer-toggle-fogo')?.checked !== false;

        try {
            let sourceParam = 'all';
            if (showOtt && !showFogo) sourceParam = 'ott';
            if (!showOtt && showFogo) sourceParam = 'fogo';

            console.log(`[FOGO-REQUEST] Solicitando ocorrências para ${reg} (Fonte: ${sourceParam})...`);
            showToast("Atualizando ocorrências de segurança (OTT + Fogo Cruzado)...", "info");

            const res = await fetch(`/api/seguranca/ocorrencias?state=${encodeURIComponent(reg)}&source=${sourceParam}`);
            const json = await res.json();

            if (!json.ok || !json.data) {
                throw new Error("Resposta inválida da API de segurança.");
            }

            const ottItems = json.data.ott || [];
            const fogoItems = json.data.fogoCruzado || [];
            const allItems = json.data.todas || [];

            console.log(`[FOGO-RESPONSE] Recebidas ${allItems.length} ocorrências no total (OTT: ${ottItems.length}, Fogo Cruzado: ${fogoItems.length})`);

            // 1. Atualizar contadores
            if (statsEl) {
                statsEl.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>📅 <b>${json.stats?.data_referencia || 'Hoje'}</b> (${json.stats?.timezone || 'Brasília'})</span>
                        <span style="font-weight:700; color:#fff;">Total: ${allItems.length}</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:2px; font-size:9px;">
                        <span style="color:#00d1ff;">🔫 OTT: <b>${ottItems.length}</b></span>
                        <span style="color:#f43f5e;">🔴 Fogo Cruzado: <b>${fogoItems.length}</b></span>
                    </div>
                `;
            }

            // 2. Plotar no mapa Leaflet nas respectivas camadas
            if (this.transitoMap) {
                this.transitoMap.clearMarkers();
                this.transitoMap.clearLayerGroup('ott');
                this.transitoMap.clearLayerGroup('fogo');

                // Plotar OTT
                if (showOtt) {
                    ottItems.forEach(alert => {
                        if (alert.lat && alert.lon) {
                            const popupHtml = `
                                <div style="font-family:sans-serif; font-size:11px; line-height:1.4;">
                                    <strong style="color:#00d1ff; font-size:12px;">🔫 Ocorrência OTT</strong><br>
                                    <b>Tipo:</b> ${escapeHtml(alert.tipo)}<br>
                                    <b>Data/Hora:</b> ${escapeHtml(alert.data)} às ${escapeHtml(alert.hora)}<br>
                                    <b>Local:</b> ${escapeHtml(alert.bairro)} - ${escapeHtml(alert.municipio)} (${escapeHtml(alert.estado)})<br>
                                    <b>Fonte:</b> OTT (Onde Tem Tiroteio)<br>
                                    <span style="font-size:9px; color:#888;">Última atualização: ${escapeHtml(alert.updatedAt || alert.data)}</span>
                                </div>
                            `;

                            const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="16" fill="#0c1524" stroke="#00d1ff" stroke-width="2"/>
                                <text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle" font-size="8" font-family="sans-serif" font-weight="900" fill="#ffffff">OTT</text>
                                <text x="50%" y="74%" dominant-baseline="middle" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#00d1ff">🔫</text>
                            </svg>`;

                            this.transitoMap.addMarkerToLayer('ott', alert.lat, alert.lon, popupHtml, { html: iconSvg });
                        }
                    });
                }

                // Plotar Fogo Cruzado
                if (showFogo) {
                    fogoItems.forEach(fogo => {
                        if (fogo.lat && fogo.lon) {
                            const popupHtml = `
                                <div style="font-family:sans-serif; font-size:11px; line-height:1.4;">
                                    <strong style="color:#f43f5e; font-size:12px;">${escapeHtml(fogo.icone || '🔴')} ${escapeHtml(fogo.tipo)}</strong><br>
                                    <b>Subtipo:</b> ${escapeHtml(fogo.subtipo || 'Confronto')}<br>
                                    <b>Descrição:</b> ${escapeHtml(fogo.descricao || '')}<br>
                                    <b>Data/Hora:</b> ${escapeHtml(fogo.data)} às ${escapeHtml(fogo.hora)}<br>
                                    <b>Local:</b> ${escapeHtml(fogo.bairro)} - ${escapeHtml(fogo.municipio)} (${escapeHtml(fogo.estado)})<br>
                                    ${fogo.endereco ? `<b>Endereço:</b> ${escapeHtml(fogo.endereco)}<br>` : ''}
                                    <b>Fonte:</b> Instituto Fogo Cruzado v2<br>
                                    <span style="font-size:9px; color:#888;">Última atualização: ${escapeHtml(fogo.updatedAt || fogo.data)}</span>
                                </div>
                            `;

                            const iconColor = fogo.categoria === 'tiroteio' ? '#ef4444' : fogo.categoria === 'operacao_policial' ? '#f97316' : '#f59e0b';
                            const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="16" fill="#180c10" stroke="${iconColor}" stroke-width="2"/>
                                <text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle" font-size="7" font-family="sans-serif" font-weight="900" fill="#ffffff">FOGO</text>
                                <text x="50%" y="74%" dominant-baseline="middle" text-anchor="middle" font-size="10" font-family="sans-serif" fill="${iconColor}">${fogo.icone || '🔴'}</text>
                            </svg>`;

                            this.transitoMap.addMarkerToLayer('fogo', fogo.lat, fogo.lon, popupHtml, { html: iconSvg });
                        }
                    });
                }
            }

            // 3. Renderizar lista lateral
            if (listEl) {
                if (allItems.length === 0) {
                    listEl.innerHTML = '<div style="color:#aaa; text-align:center; padding:10px 0;">Nenhuma ocorrência de segurança registrada hoje.</div>';
                    showToast("Nenhuma ocorrência registrada hoje.", "info");
                    return;
                }

                listEl.innerHTML = '';
                allItems.forEach(item => {
                    const el = document.createElement('div');
                    el.style.padding = '8px 0';
                    el.style.borderBottom = '1px solid #222';
                    el.style.cursor = 'pointer';

                    const isFogo = item.fonte?.includes('Fogo');
                    const badgeBg = isFogo ? 'rgba(244,63,94,0.15)' : 'rgba(0,209,255,0.15)';
                    const badgeColor = isFogo ? '#f43f5e' : '#00d1ff';

                    el.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                            <strong style="color:${isFogo ? '#f43f5e' : '#fb7185'}; font-size:11px;">
                                ${escapeHtml(item.icone || '⚠️')} ${escapeHtml(item.tipo)}
                            </strong>
                            <span style="font-size:8px; font-weight:700; background:${badgeBg}; color:${badgeColor}; padding:1px 5px; border-radius:3px;">
                                ${escapeHtml(item.fonte)}
                            </span>
                        </div>
                        <div style="font-size:10px; color:#aaa; margin-bottom:2px;">
                            🕒 ${escapeHtml(item.data)} às ${escapeHtml(item.hora)}
                        </div>
                        <div style="font-size:10px; color:#cbd5e1;">
                            📍 ${escapeHtml(item.bairro)} - ${escapeHtml(item.municipio)}
                        </div>
                        ${item.endereco ? `<div style="font-size:9px; color:#64748b;">${escapeHtml(item.endereco)}</div>` : ''}
                    `;

                    el.addEventListener('click', () => {
                        if (this.transitoMap && item.lat && item.lon) {
                            this.transitoMap.setView([item.lat, item.lon], 15);
                        }
                    });

                    listEl.appendChild(el);
                });

                showToast(`Segurança Pública atualizada: ${allItems.length} ocorrências hoje!`, "success");
            }
        } catch (err) {
            console.error('[FOGO-REQUEST] Erro ao carregar ocorrências de segurança:', err);
            if (listEl) {
                listEl.innerHTML = '<div style="color:#f43f5e; text-align:center; padding:10px 0;">Erro ao atualizar ocorrências de segurança.</div>';
            }
            showToast("Erro ao processar ocorrências de segurança.", "error");
        }
    }

    // ==========================================
    // MÓDULO TRACK & AUDITORIA DE ROTA (V3 CCO)
    // ==========================================
    async abrirModalTrack(id) {
        try {
            const resp = await fetch(`/api/atendimentos/${id}/track`);
            const data = await resp.json();
            if (!data.ok || !data.rastreamento_disponivel || data.total_posicoes === 0) {
                alert("Nenhum dado de rastreamento disponível para este atendimento.");
                return;
            }
            
            this.trackPointsRaw = data.points || [];
            this.trackPoints = [...this.trackPointsRaw];
            this.trackMetadata = data.metadata;
            this.trackMetrics = data.metrics;
            this.trackMetrics.total_posicoes = data.total_posicoes;
            this.trackMetrics.veiculo_online = data.veiculo_online;
            this.trackMetrics.classificacao_track = data.classificacao_track;
            
            // Busca a timeline consolidada da API
            const timelineResp = await fetch(`/api/atendimentos/${id}/auditoria-consolidada`);
            const timelineData = await timelineResp.json();
            this.trackTimeline = timelineData.ok ? timelineData.timeline : [];
            
            this.renderTrackModal();
            document.getElementById("modalTrackAtendimento").style.display = "flex";
            
            // Força o Leaflet a redefinir dimensões do container do mapa
            setTimeout(() => {
                if (this.trackLeafletMap) {
                    this.trackLeafletMap.invalidateSize();
                }
            }, 200);
        } catch (err) {
            console.error("Erro ao carregar modal de track:", err);
            alert("Falha ao inicializar auditoria de rota.");
        }
    }

    async abrirModalSolicitarPosicao(motorista, placa, idAtendimento, empresaCooperativa = 'Conexão Transportes', programa = 'N/D', origem = 'N/D', destino = 'N/D', horarioInicio = 'N/D', horarioFim = 'N/D') {
        console.log('[SOLICITAR_POSICAO_CLICK]', {
            atendimento: idAtendimento,
            placa,
            motorista,
            fluxo: 'modal_compliance',
            bloqueio_whatsapp_direto: true
        });

        let linkGenerado = 'Gerando link seguro...';

        try {
            const res = await fetch('/api/auditoria/solicitar-posicao', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    atendimento: idAtendimento, 
                    placa, 
                    motorista, 
                    acao: 'SOLICITACAO_POSICAO_MODAL_ABERTO' 
                })
            });
            const data = await res.json();
            if (data.link) {
                linkGenerado = data.link;
            }
        } catch(err) {
            console.error("Erro ao gerar token para solicitação de posição:", err);
        }

        const msg = `Prezados,

Solicitamos apoio para disponibilização da posição online do veículo abaixo.

Atendimento: #${idAtendimento || 'N/D'}
Motorista: ${motorista || 'N/D'}
Empresa/Cooperativa: ${empresaCooperativa || 'Conexão Transportes'}
Veículo: RIT
Placa: ${placa || 'N/D'}
Programa: ${programa || 'N/D'}
Origem: ${origem || 'N/D'}
Destino: ${destino || 'N/D'}
Horário previsto: ${horarioInicio || 'N/D'} até ${horarioFim || 'N/D'}

Por gentileza, solicitem ao motorista que disponibilize a posição online para acompanhamento operacional do atendimento.

Link de disponibilização de posição:
${linkGenerado}

Importante: por regra contratual, esta solicitação deve ser feita pela Empresa/Cooperativa responsável, sem contato direto da Equipe de Transportes com o motorista.

Obrigado.`;

        document.getElementById('solicitarMsgText').value = msg;
        document.getElementById('solicitarLinkInput').value = linkGenerado;

        const btnCopyLink = document.querySelector('button[onclick*="copiarLinkSolicitacao"]');
        if (btnCopyLink) {
            if (!idAtendimento) {
                btnCopyLink.disabled = true;
                btnCopyLink.style.opacity = '0.5';
                btnCopyLink.style.cursor = 'not-allowed';
            } else {
                btnCopyLink.disabled = false;
                btnCopyLink.style.opacity = '1';
                btnCopyLink.style.cursor = 'pointer';
            }
        }

        document.getElementById('modalSolicitarPosicao').style.display = 'flex';
    }

    async copiarTextoOperacional(texto, mensagemSucesso, duration = 3000) {
        if (!texto || !texto.trim()) {
            showToast('Nenhum conteúdo disponível para copiar.', 'warning');
            return false;
        }
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(texto);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = texto;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            showToast(mensagemSucesso || 'Conteúdo copiado para a área de transferência.', 'success', duration);
            return true;
        } catch (error) {
            console.error('[COPIA_SOLICITACAO_POSICAO_ERRO]', error);
            showToast('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.', 'error');
            return false;
        }
    }

    animarBotaoCopiado(btn, textoOriginal) {
        if (!btn) return;
        btn.style.transform = 'scale(0.97)';
        btn.style.transition = 'all 0.2s ease';
        setTimeout(() => {
            btn.style.transform = '';
        }, 150);

        btn.innerText = 'COPIADO ✓';
        btn.style.color = '#00d1ff';
        btn.style.borderColor = '#00d1ff';
        
        setTimeout(() => {
            btn.innerText = textoOriginal;
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 2000);
    }

    copiarMensagemSolicitacao(btn) {
        const text = document.getElementById('solicitarMsgText').value;
        this.copiarTextoOperacional(text, '✅ Mensagem copiada!', 2000);
        this.animarBotaoCopiado(btn, 'Copiar Mensagem');
        this.registrarAuditoriaSolicitacao('SOLICITACAO_POSICAO_MENSAGEM_COPIADA');
    }

    copiarLinkSolicitacao(btn) {
        const text = document.getElementById('solicitarLinkInput').value;
        if (!text || text === 'Nenhum link de posicionamento disponível para este atendimento.') {
            showToast('Nenhum link de posicionamento disponível para este atendimento.', 'warning');
            return;
        }
        this.copiarTextoOperacional(text, '✅ Link copiado!', 2000);
        this.animarBotaoCopiado(btn, 'Copiar Link');
        this.registrarAuditoriaSolicitacao('SOLICITACAO_POSICAO_LINK_COPIADO');
    }

    copiarTudoSolicitacao(btn) {
        const msg = document.getElementById('solicitarMsgText').value;
        const link = document.getElementById('solicitarLinkInput').value;
        const linkStr = (link && link !== 'Nenhum link de posicionamento disponível para este atendimento.') ? link : '';
        const text = linkStr ? `${msg}\n\nLink de posicionamento:\n${linkStr}` : msg;
        this.copiarTextoOperacional(text, 'Mensagem e Link copiados para a área de transferência.', 2000);
        this.animarBotaoCopiado(btn, 'Copiar Tudo');
        this.registrarAuditoriaSolicitacao('SOLICITACAO_POSICAO_TUDO_COPIADO');
    }

    registrarAuditoriaSolicitacao(acao) {
        const msgVal = document.getElementById('solicitarMsgText').value;
        const motorista = msgVal.match(/Motorista:\s*(.*)/)?.[1] || '';
        const placa = msgVal.match(/Placa:\s*(.*)/)?.[1] || '';
        const atendimento = msgVal.match(/Atendimento:\s*#\s*(\d+)/)?.[1] || '';
        
        fetch('/api/auditoria/solicitar-posicao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ atendimento, placa, motorista, acao })
        }).catch(err => console.error("Erro ao registrar auditoria operacional:", err));
    }

    fecharModalTrack() {
        this.stopTrackReplay();
        document.getElementById("modalTrackAtendimento").style.display = "none";
    }

    renderTrackModal() {
        // 1. Dashboard de Métricas
        const panel = document.getElementById("trackMetricsPanel");
        if (panel) {
            const m = this.trackMetrics;
            const meta = this.trackMetadata;
            
            let classColor = '#cbd5e1';
            let textColor = '#071018';
            let labelClass = 'SEM TELEMETRIA';

            const totalPos = parseInt(m.total_posicoes, 10) || 0;
            const isOnline = m.veiculo_online === true;

            if (totalPos === 0) {
                classColor = '#EF4444';
                textColor = '#fff';
                labelClass = 'SEM TELEMETRIA';
            } else if (isOnline) {
                classColor = '#00d1ff';
                textColor = '#071018';
                labelClass = 'RASTREAMENTO ATIVO';
            } else {
                classColor = '#22C55E';
                textColor = '#fff';
                labelClass = 'HISTÓRICO DISPONÍVEL';
            }
            
            panel.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:2px; border-right:1px solid rgba(255,255,255,0.06); padding-right:8px;">
                    <span style="font-size:9px; color:#8a99a8; text-transform:uppercase;">Motorista / Rota</span>
                    <strong style="font-size:11px; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(meta.motorista)}">${escapeHtml(meta.motorista)}</strong>
                    <span style="font-size:10px; color:#00d1ff;">${escapeHtml(meta.placa)} (${escapeHtml(meta.veiculo)})</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:2px; border-right:1px solid rgba(255,255,255,0.06); padding-right:8px; padding-left:4px;">
                    <span style="font-size:9px; color:#8a99a8; text-transform:uppercase;">Quilometragem</span>
                    <strong style="font-size:11px; color:white;">Percorrida: ${m.distancia_percorrida} km</strong>
                    <span style="font-size:10px; color:#aaa;">Prevista: ${meta.distancia_prevista} km</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:2px; border-right:1px solid rgba(255,255,255,0.06); padding-right:8px; padding-left:4px;">
                    <span style="font-size:9px; color:#8a99a8; text-transform:uppercase;">Tempo e Paradas</span>
                    <strong style="font-size:11px; color:white;">Total: ${m.tempo_total}</strong>
                    <span style="font-size:10px; color:#aaa;">Parado: ${m.tempo_parado_min} min (${m.qtd_paradas} paradas)</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:2px; border-right:1px solid rgba(255,255,255,0.06); padding-right:8px; padding-left:4px;">
                    <span style="font-size:9px; color:#8a99a8; text-transform:uppercase;">Velocidade Média</span>
                    <strong style="font-size:11px; color:white;">Média: ${m.velocidade_media} km/h</strong>
                    <span style="font-size:10px; color:#aaa;">Máxima: ${m.velocidade_maxima} km/h</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:2px; border-right:1px solid rgba(255,255,255,0.06); padding-right:8px; padding-left:4px;">
                    <span style="font-size:9px; color:#8a99a8; text-transform:uppercase;">Conexão e Sinal</span>
                    <strong style="font-size:11px; color:white;">Precisão Média: ${m.precisao_media}m</strong>
                    <span style="font-size:10px; color:#aaa;">Maior Gap: ${m.maior_falha_sinal_min} min</span>
                </div>
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; padding-left:4px;">
                    <span style="font-size:9px; color:#8a99a8; text-transform:uppercase; margin-bottom:4px;">Classificação Equipe de Transportes</span>
                    <span style="background:${classColor}; color:${textColor}; padding:3px 8px; border-radius:4px; font-size:9px; font-weight:900; text-transform:uppercase; box-shadow:0 0 10px ${classColor}55;">${labelClass}</span>
                </div>
            `;
        }

        // 2. Timeline Lateral
        const timelineContent = document.getElementById("trackTimelineContent");
        if (timelineContent) {
            if (this.trackTimeline.length === 0) {
                timelineContent.innerHTML = `<span style="font-size:11px; color:#666; text-align:center; margin-top:20px;">Nenhum histórico operacional.</span>`;
            } else {
                timelineContent.innerHTML = this.trackTimeline.map(evt => {
                    const date = new Date(evt.data_hora);
                    const timeStr = date.toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const isTelemetria = evt.tipo === 'TELEMETRIA';
                    const icon = isTelemetria ? '📡' : '📋';
                    const border = isTelemetria ? 'border-left: 2px solid #00d1ff;' : 'border-left: 2px solid #22C55E;';
                    
                    return `
                        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); ${border} border-radius:4px; padding:8px; display:flex; flex-direction:column; gap:2px; font-size:11px;">
                            <div style="display:flex; justify-content:space-between; color:#8a99a8; font-size:9px;">
                                <span>${icon} ${evt.tipo}</span>
                                <span>${timeStr}</span>
                            </div>
                            <span style="color:white; font-weight:bold;">${escapeHtml(evt.evento)}</span>
                            ${evt.latitude ? `<span style="color:#00d1ff; font-size:9px; cursor:pointer; margin-top:2px; text-decoration:underline;" onclick="window.uiController.focusMapOnCoords(${evt.latitude}, ${evt.longitude})">📍 Ir para o ponto</span>` : ''}
                        </div>
                    `;
                }).join("");
            }
        }

        // 3. Leaflet Map para o percurso
        if (!this.trackLeafletMap) {
            this.trackLeafletMap = L.map('trackMap', { zoomControl: true }).setView([-22.9068, -43.1729], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(this.trackLeafletMap);
        }

        // Limpar overlays anteriores
        if (this.trackOverlays) {
            this.trackOverlays.forEach(layer => this.trackLeafletMap.removeLayer(layer));
        }
        this.trackOverlays = [];

        if (this.trackPoints.length === 0) return;

        // Desenhar segmentos coloridos (Heatmap)
        const latlngs = [];
        for (let i = 0; i < this.trackPoints.length; i++) {
            const pt = this.trackPoints[i];
            const lat = parseFloat(pt.latitude);
            const lng = parseFloat(pt.longitude);
            latlngs.push([lat, lng]);

            if (i > 0) {
                const prev = this.trackPoints[i - 1];
                const prevLat = parseFloat(prev.latitude);
                const prevLng = parseFloat(prev.longitude);
                const speed = parseFloat(pt.velocidade) || 0;

                let color = '#22C55E'; // Verde <= 40
                if (speed > 40 && speed <= 70) color = '#F59E0B'; // Amarelo 41-70
                if (speed > 70) color = '#EF4444'; // Vermelho > 70

                const poly = L.polyline([[prevLat, prevLng], [lat, lng]], {
                    color: color,
                    weight: 5,
                    opacity: 0.9
                }).addTo(this.trackLeafletMap);

                // Tooltip
                const formattedTime = new Date(pt.data_hora).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' });
                poly.bindTooltip(`${formattedTime} | ${Math.round(speed)} km/h`, { sticky: true, className: 'premium-rit-tooltip-mini' });

                // Popup completo ao clicar (com geocoding reverso lazily carregado)
                const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
                const addressId = `track-addr-${pt.id || i}-${i}`;

                poly.on('click', () => {
                    window._geoAddressCache = window._geoAddressCache || {};
                    const cachedAddr = window._geoAddressCache[cacheKey];
                    if (cachedAddr) {
                        const el = document.getElementById(addressId);
                        if (el) el.textContent = cachedAddr;
                    } else {
                        fetch(`/reverse-geocode?lat=${lat}&lng=${lng}`)
                            .then(r => r.json())
                            .then(data => {
                                const addr = (data && data.ok && data.address) ? data.address : 'Endereço indisponível';
                                window._geoAddressCache[cacheKey] = addr;
                                const el = document.getElementById(addressId);
                                if (el) el.textContent = addr;
                            })
                            .catch(() => {
                                const el = document.getElementById(addressId);
                                if (el) el.textContent = 'Endereço indisponível';
                            });
                    }
                });

                poly.bindPopup(`
                    <div style="font-family:sans-serif; font-size:11px; line-height:1.4; color:#1e293b; min-width: 210px;">
                        <strong style="color:#00d1ff; font-size:12px;">📊 Ponto de Telemetria</strong><br>
                        <b>Horário:</b> ${new Date(pt.data_hora).toLocaleString()}<br>
                        <b>Velocidade:</b> ${Math.round(speed)} km/h<br>
                        <b>🗺️ Endereço:</b> <span id="${addressId}" style="color:#475569; font-weight:bold;">Buscando endereço...</span><br>
                        <b>Precisão:</b> ${pt.precisao} m<br>
                        <b>Fonte:</b> ${pt.fonte_localizacao || 'GPS'}<br>
                        <b>Coordenadas:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}
                    </div>
                `);

                this.trackOverlays.push(poly);
            }
        }

        // Marcos Especiais: Inicio, Paradas, Fim
        const first = this.trackPoints[0];
        const last = this.trackPoints[this.trackPoints.length - 1];

        const startMarker = L.marker([parseFloat(first.latitude), parseFloat(first.longitude)], {
            icon: L.divIcon({
                className: 'custom-track-marker-icon',
                html: `<div style="background:#22C55E; color:#071018; border:2px solid white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:900;">▶</div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(this.trackLeafletMap);

        const startAddrId = `track-addr-start`;
        startMarker.on('click', () => {
            const sLat = parseFloat(first.latitude);
            const sLng = parseFloat(first.longitude);
            const cacheKey = `${sLat.toFixed(4)},${sLng.toFixed(4)}`;
            window._geoAddressCache = window._geoAddressCache || {};
            const cachedAddr = window._geoAddressCache[cacheKey];
            if (cachedAddr) {
                const el = document.getElementById(startAddrId);
                if (el) el.textContent = cachedAddr;
            } else {
                fetch(`/reverse-geocode?lat=${sLat}&lng=${sLng}`)
                    .then(r => r.json())
                    .then(data => {
                        const addr = (data && data.ok && data.address) ? data.address : 'Endereço indisponível';
                        window._geoAddressCache[cacheKey] = addr;
                        const el = document.getElementById(startAddrId);
                        if (el) el.textContent = addr;
                    });
            }
        });
        startMarker.bindPopup(`
            <div style="font-family:sans-serif; font-size:11px; line-height:1.4; color:#1e293b; min-width:200px;">
                <b>▶ INÍCIO DO COMPARTILHAMENTO</b><br>
                <b>Horário:</b> ${new Date(first.data_hora).toLocaleString()}<br>
                <b>Endereço:</b> <span id="${startAddrId}" style="color:#475569; font-weight:bold;">Buscando endereço...</span>
            </div>
        `);
        this.trackOverlays.push(startMarker);

        const endMarker = L.marker([parseFloat(last.latitude), parseFloat(last.longitude)], {
            icon: L.divIcon({
                className: 'custom-track-marker-icon',
                html: `<div style="background:#EF4444; color:white; border:2px solid white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:900;">■</div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(this.trackLeafletMap);

        const endAddrId = `track-addr-end`;
        endMarker.on('click', () => {
            const eLat = parseFloat(last.latitude);
            const eLng = parseFloat(last.longitude);
            const cacheKey = `${eLat.toFixed(4)},${eLng.toFixed(4)}`;
            window._geoAddressCache = window._geoAddressCache || {};
            const cachedAddr = window._geoAddressCache[cacheKey];
            if (cachedAddr) {
                const el = document.getElementById(endAddrId);
                if (el) el.textContent = cachedAddr;
            } else {
                fetch(`/reverse-geocode?lat=${eLat}&lng=${eLng}`)
                    .then(r => r.json())
                    .then(data => {
                        const addr = (data && data.ok && data.address) ? data.address : 'Endereço indisponível';
                        window._geoAddressCache[cacheKey] = addr;
                        const el = document.getElementById(endAddrId);
                        if (el) el.textContent = addr;
                    });
            }
        });
        endMarker.bindPopup(`
            <div style="font-family:sans-serif; font-size:11px; line-height:1.4; color:#1e293b; min-width:200px;">
                <b>■ FIM DO COMPARTILHAMENTO</b><br>
                <b>Horário:</b> ${new Date(last.data_hora).toLocaleString()}<br>
                <b>Endereço:</b> <span id="${endAddrId}" style="color:#475569; font-weight:bold;">Buscando endereço...</span>
            </div>
        `);
        this.trackOverlays.push(endMarker);

        // Marcadores de paradas intermediarias
        this.trackPoints.forEach((pt, idx) => {
            if (pt.tipo_evento === 'PARADA' && idx > 0) {
                const pLat = parseFloat(pt.latitude);
                const pLng = parseFloat(pt.longitude);
                const stopAddrId = `track-addr-stop-${pt.id || idx}-${idx}`;

                const stopMarker = L.marker([pLat, pLng], {
                    icon: L.divIcon({
                        className: 'custom-track-marker-icon',
                        html: `<div style="background:#F59E0B; color:#071018; border:2px solid white; border-radius:50%; width:16px; height:16px; display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:900;">⏸</div>`,
                        iconSize: [16, 16],
                        iconAnchor: [8, 8]
                    })
                }).addTo(this.trackLeafletMap);

                stopMarker.on('click', () => {
                    const cacheKey = `${pLat.toFixed(4)},${pLng.toFixed(4)}`;
                    window._geoAddressCache = window._geoAddressCache || {};
                    const cachedAddr = window._geoAddressCache[cacheKey];
                    if (cachedAddr) {
                        const el = document.getElementById(stopAddrId);
                        if (el) el.textContent = cachedAddr;
                    } else {
                        fetch(`/reverse-geocode?lat=${pLat}&lng=${pLng}`)
                            .then(r => r.json())
                            .then(data => {
                                const addr = (data && data.ok && data.address) ? data.address : 'Endereço indisponível';
                                window._geoAddressCache[cacheKey] = addr;
                                const el = document.getElementById(stopAddrId);
                                if (el) el.textContent = addr;
                            });
                    }
                });

                stopMarker.bindPopup(`
                    <div style="font-family:sans-serif; font-size:11px; line-height:1.4; color:#1e293b; min-width:200px;">
                        <b>⏸ PARADA OPERACIONAL DETECTADA</b><br>
                        <b>Horário:</b> ${new Date(pt.data_hora).toLocaleTimeString()}<br>
                        <b>Endereço:</b> <span id="${stopAddrId}" style="color:#475569; font-weight:bold;">Buscando endereço...</span>
                    </div>
                `);
                this.trackOverlays.push(stopMarker);
            }
        });

        // Enquadrar percurso
        try {
            this.trackLeafletMap.fitBounds(L.polyline(latlngs).getBounds(), { padding: [30, 30] });
        } catch (err) {
            console.warn("[LEAFLET FITBOUNDS]", err);
        }
    }

    focusMapOnCoords(lat, lng) {
        if (this.trackLeafletMap) {
            this.trackLeafletMap.setView([lat, lng], 16);
        }
    }

    filterTrackPoints(filterType) {
        this.stopTrackReplay();
        if (filterType === 'all') {
            this.trackPoints = [...this.trackPointsRaw];
        } else if (filterType === '1min') {
            const filtered = [];
            let lastTime = 0;
            this.trackPointsRaw.forEach((pt, idx) => {
                const ms = new Date(pt.data_hora).getTime();
                if (idx === 0 || idx === this.trackPointsRaw.length - 1 || (ms - lastTime) >= 60 * 1000) {
                    filtered.push(pt);
                    lastTime = ms;
                }
            });
            this.trackPoints = filtered;
        } else if (filterType === 'events') {
            this.trackPoints = this.trackPointsRaw.filter((pt, idx) => 
                idx === 0 || 
                idx === this.trackPointsRaw.length - 1 || 
                pt.tipo_evento === 'PARADA' || 
                pt.tipo_evento === 'INICIO' || 
                pt.tipo_evento === 'FIM'
            );
        }
        this.renderTrackModal();
    }

    toggleTrackReplay() {
        const btn = document.getElementById("btnTrackPlay");
        if (!btn) return;
        
        if (this.trackPlayInterval) {
            this.pauseTrackReplay();
            btn.innerHTML = '▶ Reproduzir';
            btn.style.background = '#22C55E';
        } else {
            btn.innerHTML = '⏸ Pausar';
            btn.style.background = '#F59E0B';
            this.startTrackReplay();
        }
    }

    startTrackReplay() {
        if (this.trackPoints.length === 0) return;
        
        if (!this.trackReplayMarker) {
            const first = this.trackPoints[0];
            this.trackReplayMarker = L.marker([parseFloat(first.latitude), parseFloat(first.longitude)], {
                icon: L.divIcon({
                    className: 'leaflet-custom-marker',
                    html: obterIconeVeiculoHTML(this.trackMetadata.veiculo, true, { tipoVeiculo: this.trackMetadata.veiculo }, null),
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                })
            }).addTo(this.trackLeafletMap);
            this.trackOverlays.push(this.trackReplayMarker);
            this.trackCurrentIndex = 0;
        }

        const speedFactor = parseFloat(this.trackReplaySpeed) || 1;
        const intervalMs = Math.max(100, 1000 / speedFactor);

        this.trackPlayInterval = setInterval(() => {
            if (this.trackCurrentIndex >= this.trackPoints.length) {
                this.stopTrackReplay();
                return;
            }

            const pt = this.trackPoints[this.trackCurrentIndex];
            const lat = parseFloat(pt.latitude);
            const lng = parseFloat(pt.longitude);
            
            this.trackReplayMarker.setLatLng([lat, lng]);
            this.trackLeafletMap.setView([lat, lng]);
            
            this.trackReplayMarker.bindPopup(`
                <div style="font-family:sans-serif; font-size:11px; line-height:1.4; color:#1e293b;">
                    <strong style="color:#22C55E;">▶ Replay Ativo</strong><br>
                    <b>Horário:</b> ${new Date(pt.data_hora).toLocaleTimeString()}<br>
                    <b>Velocidade:</b> ${Math.round(pt.velocidade)} km/h<br>
                    <b>Precisão:</b> ${pt.precisao} m
                </div>
            `).openPopup();

            this.trackCurrentIndex++;
        }, intervalMs);
    }

    pauseTrackReplay() {
        if (this.trackPlayInterval) {
            clearInterval(this.trackPlayInterval);
            this.trackPlayInterval = null;
        }
    }

    stopTrackReplay() {
        this.pauseTrackReplay();
        const btn = document.getElementById("btnTrackPlay");
        if (btn) {
            btn.innerHTML = '▶ Reproduzir';
            btn.style.background = '#22C55E';
        }
        if (this.trackReplayMarker) {
            this.trackLeafletMap.removeLayer(this.trackReplayMarker);
            this.trackReplayMarker = null;
        }
        this.trackCurrentIndex = 0;
    }

    changeTrackReplaySpeed(speed) {
        this.trackReplaySpeed = parseFloat(speed) || 1;
        if (this.trackPlayInterval) {
            this.pauseTrackReplay();
            this.startTrackReplay();
        }
    }

    exportTrackExcel() {
        if (this.trackPoints.length === 0) {
            alert("Sem posições para exportar.");
            return;
        }
        const headers = ['ID Atendimento', 'Data Hora', 'Latitude', 'Longitude', 'Velocidade (km/h)', 'Precisao (m)', 'Fonte Localizacao', 'Evento'];
        const rows = this.trackPoints.map(pt => [
            this.trackMetadata.id,
            new Date(pt.data_hora).toISOString(),
            pt.latitude,
            pt.longitude,
            pt.velocidade,
            pt.precisao,
            pt.fonte_localizacao || 'GPS',
            pt.tipo_evento
        ]);

        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
            + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `track_atendimento_${this.trackMetadata.id}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    exportTrackPDF() {
        const m = this.trackMetrics;
        const meta = this.trackMetadata;
        
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            alert("Por favor, permita popups para gerar o relatório.");
            return;
        }
        printWindow.document.write(`
            <html>
            <head>
                <title>Relatório de Track - Atendimento #${meta.id}</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; color: #111; margin: 40px; line-height: 1.5; }
                    h1 { color: #0084ff; border-bottom: 2px solid #0084ff; padding-bottom: 8px; font-size: 22px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
                    .box { background: #f4f6f9; padding: 12px; border-radius: 6px; border: 1px solid #ddd; }
                    .title { font-weight: bold; font-size: 11px; text-transform: uppercase; color: #666; }
                    .val { font-size: 14px; font-weight: bold; color: #111; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background: #f4f6f9; }
                </style>
            </head>
            <body>
                <h1>📋 RELATÓRIO OPERACIONAL DE TRACK - ATENDIMENTO #${meta.id}</h1>
                <div class="grid">
                    <div class="box">
                        <div class="title">Motorista</div>
                        <div class="val">${meta.motorista}</div>
                    </div>
                    <div class="box">
                        <div class="title">Veículo / Placa</div>
                        <div class="val">${meta.veiculo} (${meta.placa})</div>
                    </div>
                    <div class="box">
                        <div class="title">Quilometragem Percorrida</div>
                        <div class="val">Real: ${m.distancia_percorrida} km | Prevista: ${meta.distancia_prevista} km</div>
                    </div>
                    <div class="box">
                        <div class="title">Tempo de Operação</div>
                        <div class="val">Total: ${m.tempo_total} | Parado: ${m.tempo_parado_min} min</div>
                    </div>
                    <div class="box">
                        <div class="title">Velocidade Média/Máxima</div>
                        <div class="val">${m.velocidade_media} km/h / ${m.velocidade_maxima} km/h</div>
                    </div>
                    <div class="box">
                        <div class="title">Classificação Final Equipe de Transportes</div>
                        <div class="val" style="color: red;">${m.classificacao}</div>
                    </div>
                </div>
                <h3>Histórico de Auditoria do Trajeto</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Horário</th>
                            <th>Evento / Informação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.trackTimeline.map(evt => `
                            <tr>
                                <td>${new Date(evt.data_hora).toLocaleString()}</td>
                                <td><b>${evt.evento}</b></td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
                <script>
                    window.onload = function() { window.print(); };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

}

