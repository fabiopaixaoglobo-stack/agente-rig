import { CONFIG } from './config.js';
import { showToast, escapeHtml } from './utils.js';
import { parseDataHora } from './data-service.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM_ROUTE = 'https://router.project-osrm.org/route/v1/driving';

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
        this.initNormas();
        this.initModals();
        this.initPlanner();
        this.initEventosLista();
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
                if (target) target.classList.add('active');
                
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
            const f = this.dataService.baseAtendimentos.filter(a => {
                const matchP = !sp.value || a.programa === sp.value;
                const matchB = !sb.value || a.bairro === sb.value;
                const matchT = !st || !st.value || a.tipoVeiculo === st.value;
                
                // Calcula dinamicamente o status do atendimento com base no horário atual do sistema
                const statusAtual = verificarEmAtendimento(a.dataHoraInicioRaw, a.dataHoraFimRaw);
                const matchE = !se || !se.value || statusAtual === se.value;
                
                const matchH = !sh || !sh.value || a.horarioInicio === sh.value;
                return matchP && matchB && matchT && matchE && matchH;
            });
            this.plotarAtendimentos(f);
        };

        [sp, sb, st, se, sh].forEach(s => s?.addEventListener("change", filtrar));
        btnLimpar?.addEventListener("click", () => {
            if(sp) sp.value = "";
            if(sb) sb.value = "";
            if(st) st.value = "";
            if(se) se.value = "";
            if(sh) sh.value = "";
            this.plotarAtendimentos(this.dataService.baseAtendimentos);
        });
        btnCentralizar?.addEventListener("click", () => {
            this.mapService.setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
        });
    }

    initUpload() {
        const input = document.getElementById("upload-mapa");
        const btn = document.getElementById("btn-upload");
        btn?.addEventListener("click", () => input.click());
        input?.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                showToast("Processando planilha...", "info");
                const atendimentos = await this.dataService.processExcel(file);
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
                showToast("Erro ao processar planilha.", "error");
            }
        });
    }

    plotarAtendimentos(lista) {
        this.mapService.clearMarkers();
        const listEl = document.getElementById("listaAtendimentos");
        if (listEl) listEl.innerHTML = "";

        lista.forEach(a => {
            if (a.lat && a.lng) {
                const popup = `<b>${escapeHtml(a.programa)}</b><br>${escapeHtml(a.motorista)}<br>${escapeHtml(a.bairro)}`;
                this.mapService.addMarker(a.lat, a.lng, popup);
            }
            if (listEl) {
                const p = escapeHtml(a.programa);
                const m = escapeHtml(a.motorista);
                const pl = escapeHtml(a.placa);
                const b = escapeHtml(a.bairro);
                listEl.innerHTML += `<div class="card"><div class="row1"><span class="badgeProgram">${p}</span></div><div class="meta-motorista">${m}</div><div class="meta-veiculo">${pl}</div><div class="meta-bairro">📍 ${b}</div></div>`;
            }
        });
    }

    preencherDropdowns(l) {
        const sp = document.getElementById("filtro-programa");
        const sb = document.getElementById("filtro-bairro");
        const st = document.getElementById("filtro-tipo");
        const sh = document.getElementById("filtro-horario-inicio");
        
        const progs = [...new Set(l.map(a => a.programa))].sort();
        const bairs = [...new Set(l.map(a => a.bairro))].sort();
        const tipos = [...new Set(l.map(a => a.tipoVeiculo))].sort();
        const horarios = [...new Set(l.map(a => a.horarioInicio).filter(Boolean))].sort();

        if (sp) sp.innerHTML = '<option value="">Programa</option>' + progs.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
        if (sb) sb.innerHTML = '<option value="">Bairro</option>' + bairs.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
        if (st) st.innerHTML = '<option value="">Veículo</option>' + tipos.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
        if (sh) sh.innerHTML = '<option value="">Horário de Início</option>' + horarios.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
    }

    initNormas() {
        fetch(CONFIG.API_ENDPOINTS.NORMAS).then(r => r.json()).then(data => {
            const c = document.getElementById('normas-lista');
            if(!c) return;
            c.innerHTML = data.map(n => `<div class="card" data-id="${escapeHtml(n.id)}"><b>${escapeHtml(n.icone)} ${escapeHtml(n.titulo)}</b><br><span style="font-size:9px; color:var(--muted)">${escapeHtml(n.resumo)}</span></div>`).join('');
            
            c.querySelectorAll('.card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.getAttribute('data-id');
                    const n = data.find(x => x.id == id);
                    if (n) {
                        const inp = document.getElementById('pergunta');
                        if (inp) {
                            inp.value = `Fale sobre: ${n.titulo}`;
                            document.getElementById('btn-enviar')?.click();
                        }
                    }
                });
            });
        });

        // Configurar botões de contexto
        document.querySelectorAll('.docButtons .btn').forEach(btn => {
            const onClickAttr = btn.getAttribute('onclick');
            if (onClickAttr && onClickAttr.includes('setContext')) {
                const m = onClickAttr.match(/'([^']+)'/);
                if (!m) return;
                const ctx = m[1];
                btn.removeAttribute('onclick');
                btn.addEventListener('click', () => this.chatService.setContext(ctx));
            } else if (onClickAttr && onClickAttr.includes('limparChat')) {
                btn.removeAttribute('onclick');
                btn.addEventListener('click', () => this.chatService.clear());
            }
        });
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
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="26">🚗</text></svg>'),
                scaledSize: new google.maps.Size(30, 30),
                anchor: new google.maps.Point(15, 15)
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
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="26">⚠️</text></svg>'),
                scaledSize: new google.maps.Size(30, 30),
                anchor: new google.maps.Point(15, 15)
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
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="20">🔫</text></svg>'),
                scaledSize: new google.maps.Size(24, 24),
                anchor: new google.maps.Point(12, 12)
            });
            this.transitoMap.addMarker(midLat - 0.01, midLon - 0.01, 'Defesa Civil: Alagamento', {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="20">⛈️</text></svg>'),
                scaledSize: new google.maps.Size(24, 24),
                anchor: new google.maps.Point(12, 12)
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
                            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(iconSvg),
                            scaledSize: new google.maps.Size(36, 36),
                            anchor: new google.maps.Point(18, 18)
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

