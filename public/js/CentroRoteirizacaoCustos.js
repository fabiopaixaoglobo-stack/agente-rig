import { showToast, escapeHtml } from './utils.js';

export class CentroRoteirizacaoCustos {
    constructor(mapService, uiController = null) {
        this.mapService = mapService;
        this.uiController = uiController;
        this.maxStops = 10;
        this.stops = []; // { id, containerEl, inputEl, point }
        this.originPoint = null;
        this.destPoint = null;
        this.routes = [];
        this.activeRouteIndex = 0;
        this.pedagiosDetectados = [];
        this.modaisResultados = [];
        this.tarifasConfig = null;

        this.PEDAGIOS_RJ = [
            { nome: "Transolímpica", valor: 9.95, lat: -22.9136, lon: -43.3851, raio: 0.005 },
            { nome: "Ponte Rio-Niterói", valor: 6.60, lat: -22.8636, lon: -43.1676, raio: 0.008 },
            { nome: "Linha Amarela", valor: 4.00, lat: -22.9072, lon: -43.3089, raio: 0.006 },
            { nome: "Pedágio Queimados", valor: 15.10, lat: -22.7161, lon: -43.5562, raio: 0.008 }
        ];

        // Fase 2: Cenários, Incidentes e Projeção 24h
        this.cenarioAtivo = 'padrao';
        this.incidentesDetectados = [];
        this.statusCor = null;
        this.projecao24h = [];
        this.janelaIdeal = null;
        this.ultimoResultado = null;

        this.init();
    }

    async init() {
        this.bindEvents();
        this.setupAutocompleteForStaticInputs();
        await this.carregarTarifas();
    }

    async carregarTarifas() {
        try {
            const res = await fetch('/api/rotas/tarifas');
            if (res.ok) {
                const data = await res.json();
                if (data.ok && data.tarifas) {
                    this.tarifasConfig = data.tarifas;
                }
            }
        } catch (e) {
            console.warn('[CentroRoteirizacao] Erro ao carregar tarifas:', e);
        }
    }

    bindEvents() {
        const btnAddStop = document.getElementById('btn-add-parada');
        if (btnAddStop) {
            btnAddStop.addEventListener('click', () => this.adicionarParada());
        }

        const btnCalcular = document.getElementById('btn-rota') || document.getElementById('btn-traçar-centro');
        if (btnCalcular) {
            btnCalcular.addEventListener('click', () => this.calcularRotaCompleta());
        }

        // Cenários Rápidos de 1-Clique (Fase 2)
        document.querySelectorAll('.rit-scenario-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const scenario = btn.dataset.scenario || btn.getAttribute('data-scenario');
                if (scenario) this.aplicarCenario(scenario);
            });
        });

        // TNO e RoundTrip toggles
        document.getElementById('tno-shared-ride')?.addEventListener('change', () => this.recalcularApenasCustos());
        document.getElementById('tno-ida-volta')?.addEventListener('change', () => this.recalcularApenasCustos());
        document.getElementById('tno-veiculo-fixo')?.addEventListener('change', () => this.recalcularApenasCustos());
        document.getElementById('planejador-transito')?.addEventListener('change', () => this.recalcularApenasCustos());
        document.getElementById('planejador-chuva')?.addEventListener('change', () => this.recalcularApenasCustos());
    }

    // ==========================================
    // FASE 2: CENÁRIOS RÁPIDOS (1-CLIQUE)
    // ==========================================
    aplicarCenario(tipo) {
        this.cenarioAtivo = tipo;

        // Atualiza botões visuais
        document.querySelectorAll('.rit-scenario-btn').forEach(b => {
            if (b.dataset.scenario === tipo) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        const badge = document.getElementById('rit-cenario-ativo-badge');
        const inputOrigem = document.getElementById('origem');
        const inputDestino = document.getElementById('destino');
        const selectTransito = document.getElementById('planejador-transito');
        const selectChuva = document.getElementById('planejador-chuva');
        const inputHorario = document.getElementById('horario');

        switch (tipo) {
            case 'padrao':
                if (badge) {
                    badge.textContent = '● PADRÃO';
                    badge.style.color = '#10b981';
                }
                if (selectTransito) selectTransito.value = 'não';
                if (selectChuva) selectChuva.value = 'não';
                showToast('☀️ Cenário Padrão ativado (condições normais)', 'info', 2000);
                break;

            case 'chuva':
                if (badge) {
                    badge.textContent = '● TEMPORAL / CHUVA';
                    badge.style.color = '#38bdf8';
                }
                if (selectTransito) selectTransito.value = 'sim';
                if (selectChuva) selectChuva.value = 'sim';
                showToast('🌧️ Cenário de Chuva Forte ativado: trânsito lento e dinâmica alta (+40%)', 'warning', 3000);
                break;

            case 'rockinrio':
                if (badge) {
                    badge.textContent = '● ROCK IN RIO';
                    badge.style.color = '#ec4899';
                }
                if (inputOrigem && (!this.originPoint || !inputOrigem.value.trim())) {
                    inputOrigem.value = 'Estúdios Globo - Portaria 3 (Bandeirantes)';
                    this.originPoint = {
                        label: 'Estúdios Globo - Portaria 3 (Bandeirantes)',
                        lat: -22.9754,
                        lon: -43.4116,
                        tipo: 'globo'
                    };
                }
                if (inputDestino) {
                    inputDestino.value = 'Rock in Rio - Cidade do Rock';
                    this.destPoint = {
                        label: 'Rock in Rio - Cidade do Rock',
                        lat: -22.9789,
                        lon: -43.3956,
                        tipo: 'evento'
                    };
                }
                if (selectTransito) selectTransito.value = 'sim';
                if (selectChuva) selectChuva.value = 'não';
                if (inputHorario) inputHorario.value = '19:30';
                showToast('🎸 Rota e bloqueios para Rock in Rio ativados!', 'success', 3000);
                break;

            case 'linha_amarela':
                if (badge) {
                    badge.textContent = '● BLOQUEIO L. AMARELA';
                    badge.style.color = '#f59e0b';
                }
                if (selectTransito) selectTransito.value = 'sim';
                showToast('🚧 Interdição Linha Amarela: simulando desvio e isenção de pedágio (+18 min)', 'warning', 3500);
                break;

            case 'av_brasil':
                if (badge) {
                    badge.textContent = '● INTERDIÇÃO AV. BRASIL';
                    badge.style.color = '#ef4444';
                }
                if (selectTransito) selectTransito.value = 'sim';
                showToast('🚨 Retenção crítica na Av. Brasil (+25 min): priorizando faixas seletivas', 'warning', 3500);
                break;
        }

        // Se já tiver pontos definidos, recalcula
        if (this.originPoint && this.destPoint) {
            this.calcularRotaCompleta();
        } else {
            this.recalcularApenasCustos();
        }
    }

    setupAutocompleteForStaticInputs() {
        const inputOrigem = document.getElementById('origem');
        const inputDestino = document.getElementById('destino');

        if (inputOrigem) {
            this.anexarAutocomplete(inputOrigem, (poi) => {
                this.originPoint = poi;
                console.log('[CentroRoteirizacao] Origem selecionada:', poi);
            });
        }

        if (inputDestino) {
            this.anexarAutocomplete(inputDestino, (poi) => {
                this.destPoint = poi;
                console.log('[CentroRoteirizacao] Destino selecionado:', poi);
            });
        }
    }

    // ==========================================
    // AUTOCOMPLETE INTELIGENTE (< 500ms)
    // ==========================================
    anexarAutocomplete(inputEl, onSelectCallback) {
        if (!inputEl) return;

        inputEl.setAttribute('autocomplete', 'off');
        const wrapper = inputEl.parentElement;
        if (wrapper && !wrapper.style.position) {
            wrapper.style.position = 'relative';
        }

        let dropdown = wrapper ? wrapper.querySelector('.rit-autocomplete-dropdown') : null;
        if (!dropdown && wrapper) {
            dropdown = document.createElement('div');
            dropdown.className = 'rit-autocomplete-dropdown';
            dropdown.style.display = 'none';
            wrapper.appendChild(dropdown);
        }

        let debounceTimer = null;
        let selectedIndex = -1;
        let currentSuggestions = [];

        const fecharDropdown = () => {
            if (dropdown) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
            }
            selectedIndex = -1;
            currentSuggestions = [];
        };

        const renderSugestoes = (sugestoes) => {
            if (!dropdown) return;
            if (!sugestoes || sugestoes.length === 0) {
                fecharDropdown();
                return;
            }

            currentSuggestions = sugestoes;
            selectedIndex = -1;
            dropdown.innerHTML = '';

            sugestoes.forEach((item, idx) => {
                const opt = document.createElement('div');
                opt.className = 'rit-autocomplete-item';
                opt.dataset.index = idx;

                let icon = '📍';
                let tagColor = '#64748b';
                if (item.tipo === 'globo') {
                    icon = '🏢';
                    tagColor = '#00d1ff';
                } else if (item.tipo === 'aeroporto') {
                    icon = '✈️';
                    tagColor = '#38bdf8';
                } else if (item.tipo === 'hotel') {
                    icon = '🏨';
                    tagColor = '#f5a623';
                } else if (item.tipo === 'evento') {
                    icon = '🎸';
                    tagColor = '#ec4899';
                } else if (item.tipo === 'pedagio') {
                    icon = '🚧';
                    tagColor = '#f59e0b';
                } else if (item.tipo === 'cep') {
                    icon = '📮';
                    tagColor = '#10b981';
                }

                opt.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px; width:100%;">
                        <span style="font-size:14px;">${icon}</span>
                        <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:1px;">
                            <div style="font-size:12px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${escapeHtml(item.label)}
                            </div>
                            <div style="font-size:10px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${escapeHtml(item.endereco || '')}
                            </div>
                        </div>
                        <span style="font-size:9px; font-weight:800; color:${tagColor}; background:rgba(255,255,255,0.05); padding:2px 5px; border-radius:3px; white-space:nowrap;">
                            ${escapeHtml(item.categoria || item.tipo)}
                        </span>
                    </div>
                `;

                opt.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selecionarItem(item);
                });

                dropdown.appendChild(opt);
            });

            dropdown.style.display = 'block';
        };

        const selecionarItem = (item) => {
            inputEl.value = item.label;
            fecharDropdown();
            if (onSelectCallback) {
                onSelectCallback({
                    id: item.id,
                    label: item.label,
                    endereco: item.endereco,
                    lat: item.lat,
                    lon: item.lon,
                    tipo: item.tipo
                });
            }
        };

        inputEl.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (debounceTimer) clearTimeout(debounceTimer);

            if (query.length < 2) {
                fecharDropdown();
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/geocode/autocomplete?q=${encodeURIComponent(query)}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.ok && Array.isArray(data.sugestoes)) {
                            renderSugestoes(data.sugestoes);
                        }
                    }
                } catch (err) {
                    console.warn('[Autocomplete] Falha na busca:', err);
                }
            }, 180);
        });

        inputEl.addEventListener('keydown', (e) => {
            if (!dropdown || dropdown.style.display === 'none') return;
            const items = dropdown.querySelectorAll('.rit-autocomplete-item');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % items.length;
                destacarItem(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                destacarItem(items);
            } else if (e.key === 'Enter') {
                if (selectedIndex >= 0 && currentSuggestions[selectedIndex]) {
                    e.preventDefault();
                    selecionarItem(currentSuggestions[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                fecharDropdown();
            }
        });

        const destacarItem = (items) => {
            items.forEach((it, idx) => {
                if (idx === selectedIndex) {
                    it.classList.add('active');
                    it.scrollIntoView({ block: 'nearest' });
                } else {
                    it.classList.remove('active');
                }
            });
        };

        inputEl.addEventListener('blur', async () => {
            setTimeout(async () => {
                fecharDropdown();
                // Se o usuário digitou sem clicar, resolve automaticamente
                const val = inputEl.value.trim();
                if (val && (!inputEl._lastResolved || inputEl._lastResolved !== val)) {
                    inputEl._lastResolved = val;
                    try {
                        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(val)}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.ok && data.resultado) {
                                if (onSelectCallback) onSelectCallback(data.resultado);
                            }
                        }
                    } catch (_) {}
                }
            }, 250);
        });
    }

    // ==========================================
    // GESTÃO DE PARADAS INTERMEDIÁRIAS (WAYPOINTS)
    // ==========================================
    adicionarParada(initialValue = '') {
        if (this.stops.length >= this.maxStops) {
            showToast(`Limite máximo de ${this.maxStops} paradas atingido.`, 'warning');
            return;
        }

        const container = document.getElementById('lista-paradas-container');
        if (!container) return;

        const stopId = `stop_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const stopRow = document.createElement('div');
        stopRow.className = 'rit-waypoint-row';
        stopRow.id = stopId;
        stopRow.style.display = 'flex';
        stopRow.style.alignItems = 'center';
        stopRow.style.gap = '6px';
        stopRow.style.marginBottom = '6px';
        stopRow.style.position = 'relative';

        const indexNum = this.stops.length + 1;

        stopRow.innerHTML = `
            <div class="rit-stop-badge" style="width:20px; height:20px; border-radius:50%; background:#3b82f6; color:#fff; font-size:10px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                ${indexNum}
            </div>
            <div style="flex:1; position:relative;">
                <input class="input rit-stop-input" placeholder="Parada ${indexNum} (endereço, POI ou CEP)..." value="${escapeHtml(initialValue)}" style="width:100%; font-size:11px; padding-right:24px;" />
            </div>
            <div style="display:flex; gap:2px; flex-shrink:0;">
                <button type="button" class="btn btn-stop-up" title="Mover para cima" style="padding:2px 5px; font-size:10px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; border-radius:3px; cursor:pointer;">▲</button>
                <button type="button" class="btn btn-stop-down" title="Mover para baixo" style="padding:2px 5px; font-size:10px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; border-radius:3px; cursor:pointer;">▼</button>
                <button type="button" class="btn btn-stop-remove" title="Remover parada" style="padding:2px 6px; font-size:11px; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:3px; cursor:pointer; font-weight:800;">✕</button>
            </div>
        `;

        container.appendChild(stopRow);

        const inputEl = stopRow.querySelector('.rit-stop-input');
        const stopObj = {
            id: stopId,
            containerEl: stopRow,
            inputEl: inputEl,
            point: null
        };

        this.stops.push(stopObj);

        // Anexa autocomplete
        this.anexarAutocomplete(inputEl, (poi) => {
            stopObj.point = poi;
            console.log(`[CentroRoteirizacao] Parada ${stopId} selecionada:`, poi);
        });

        // Controles de botão
        stopRow.querySelector('.btn-stop-remove').addEventListener('click', () => {
            this.removerParada(stopId);
        });

        stopRow.querySelector('.btn-stop-up').addEventListener('click', () => {
            this.moverParada(stopId, -1);
        });

        stopRow.querySelector('.btn-stop-down').addEventListener('click', () => {
            this.moverParada(stopId, 1);
        });

        this.atualizarNumeracaoParadas();
        inputEl.focus();
    }

    removerParada(stopId) {
        const idx = this.stops.findIndex(s => s.id === stopId);
        if (idx !== -1) {
            const stop = this.stops[idx];
            if (stop.containerEl) stop.containerEl.remove();
            this.stops.splice(idx, 1);
            this.atualizarNumeracaoParadas();
        }
    }

    moverParada(stopId, direcao) {
        const idx = this.stops.findIndex(s => s.id === stopId);
        if (idx === -1) return;
        const newIdx = idx + direcao;
        if (newIdx < 0 || newIdx >= this.stops.length) return;

        // Troca posições
        const [moved] = this.stops.splice(idx, 1);
        this.stops.splice(newIdx, 0, moved);

        const container = document.getElementById('lista-paradas-container');
        if (container) {
            container.innerHTML = '';
            this.stops.forEach(s => container.appendChild(s.containerEl));
        }

        this.atualizarNumeracaoParadas();
    }

    atualizarNumeracaoParadas() {
        this.stops.forEach((s, idx) => {
            const badge = s.containerEl.querySelector('.rit-stop-badge');
            const input = s.containerEl.querySelector('.rit-stop-input');
            if (badge) badge.textContent = idx + 1;
            if (input && !input.value) {
                input.placeholder = `Parada ${idx + 1} (endereço, POI ou CEP)...`;
            }
        });
    }

    // ==========================================
    // CÁLCULO DE ROTA MULTI-PARADAS & CUSTOS
    // ==========================================
    async calcularRotaCompleta() {
        const feedback = document.getElementById('plannerFeedback');
        const inputOrigem = document.getElementById('origem');
        const inputDestino = document.getElementById('destino');
        const txtOrigem = inputOrigem?.value?.trim() || '';
        const txtDestino = inputDestino?.value?.trim() || '';

        if (!txtOrigem || !txtDestino) {
            if (feedback) {
                feedback.innerHTML = '<span style="color:#ef4444; font-weight:700;">⚠️ Por favor, informe a Origem e o Destino da rota.</span>';
            }
            showToast('Informe origem e destino.', 'warning');
            return;
        }

        if (feedback) {
            feedback.innerHTML = '<span style="color:#00d1ff;"><i class="fa-solid fa-spinner fa-spin"></i> Geocodificando pontos e calculando rota inteligente multi-paradas...</span>';
        }

        try {
            // 1. Assegurar coordenadas para Origem
            if (!this.originPoint || this.originPoint.label !== txtOrigem) {
                const geoO = await this.resolverCoordenadas(txtOrigem);
                if (!geoO) throw new Error(`Origem não localizada: "${txtOrigem}"`);
                this.originPoint = geoO;
            }

            // 2. Assegurar coordenadas para Destino
            if (!this.destPoint || this.destPoint.label !== txtDestino) {
                const geoD = await this.resolverCoordenadas(txtDestino);
                if (!geoD) throw new Error(`Destino não localizado: "${txtDestino}"`);
                this.destPoint = geoD;
            }

            // 3. Assegurar coordenadas para Paradas Intermediárias
            const waypointsValidos = [];
            for (let i = 0; i < this.stops.length; i++) {
                const s = this.stops[i];
                const txt = s.inputEl.value.trim();
                if (!txt) continue;

                if (!s.point || s.point.label !== txt) {
                    const geoStop = await this.resolverCoordenadas(txt);
                    if (geoStop) {
                        s.point = geoStop;
                        waypointsValidos.push(geoStop);
                    }
                } else {
                    waypointsValidos.push(s.point);
                }
            }

            // 4. Monta lista sequencial de waypoints
            const todosPontos = [this.originPoint, ...waypointsValidos, this.destPoint];

            // 5. Monta URL OSRM multi-coordenadas (lon,lat;lon,lat;...)
            const coordsStr = todosPontos.map(p => `${p.lon},${p.lat}`).join(';');
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&alternatives=true`;

            let routeData = null;
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 4500);
                const res = await fetch(osrmUrl, { signal: controller.signal });
                clearTimeout(timeout);
                if (res.ok) {
                    routeData = await res.json();
                }
            } catch (netErr) {
                console.warn('[CentroRoteirizacao] Falha OSRM online:', netErr.message);
            }

            // Fallback se OSRM falhar: gera geometria por interpolação euclidiana
            if (!routeData || !routeData.routes || routeData.routes.length === 0) {
                routeData = this.gerarRotaFallback(todosPontos);
            }

            this.routes = routeData.routes;
            this.activeRouteIndex = 0;

            // 6. Processar métricas da rota ativa
            await this.processarResultadosRota(todosPontos);

            showToast('Rota e custos calculados com sucesso!', 'success');
        } catch (err) {
            console.error('[CentroRoteirizacao] Erro no cálculo de rota:', err);
            if (feedback) {
                feedback.innerHTML = `<span style="color:#ef4444; font-weight:700;">Erro: ${escapeHtml(err.message || String(err))}</span>`;
            }
            showToast(err.message || 'Erro ao calcular rota.', 'error');
        }
    }

    async resolverCoordenadas(texto) {
        try {
            const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(texto)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.ok && data.resultado && !isNaN(data.resultado.lat)) {
                    return data.resultado;
                }
            }
        } catch (e) {
            console.warn('[CentroRoteirizacao] Falha ao resolver coordenadas:', e);
        }
        return null;
    }

    gerarRotaFallback(pontos) {
        let totalDistanciaM = 0;
        const coords = [];

        for (let i = 0; i < pontos.length - 1; i++) {
            const p1 = pontos[i];
            const p2 = pontos[i + 1];
            coords.push([p1.lat, p1.lon]);
            const d = this.calcularDistanciaMetros(p1.lat, p1.lon, p2.lat, p2.lon) * 1.25; // 25% acréscimo de curvas
            totalDistanciaM += d;
        }
        const lastP = pontos[pontos.length - 1];
        coords.push([lastP.lat, lastP.lon]);

        const duracaoSeg = (totalDistanciaM / 1000 / 35) * 3600; // velocidade média 35 km/h

        return {
            routes: [
                {
                    distance: totalDistanciaM,
                    duration: duracaoSeg,
                    geometry: {
                        coordinates: coords.map(c => [c[1], c[0]]) // OSRM [lon, lat]
                    }
                }
            ]
        };
    }

    calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    detectarPedagios(coordinates) {
        if (!coordinates || !Array.isArray(coordinates)) return [];
        const pedagiosDetectados = [];

        for (const p of this.PEDAGIOS_RJ) {
            const cruzou = coordinates.some(coord => {
                const lon = coord[0];
                const lat = coord[1];
                const dLat = lat - p.lat;
                const dLon = lon - p.lon;
                return Math.sqrt(dLat * dLat + dLon * dLon) <= p.raio;
            });

            if (cruzou && !pedagiosDetectados.some(x => x.nome === p.nome)) {
                pedagiosDetectados.push(p);
            }
        }
        return pedagiosDetectados;
    }

    // ==========================================
    // FASE 2: INCIDENTES EM TEMPO REAL & COR.RIO
    // ==========================================
    async analisarIncidentesRota(coords) {
        if (!coords || coords.length < 2) return null;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            let pontosEnvio = coords;
            if (coords.length > 80) {
                const step = Math.ceil(coords.length / 80);
                pontosEnvio = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
            }

            const res = await fetch('/api/seguranca/analisar-rota', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ routeCoords: pontosEnvio, bufferMetros: 1000, state: 'RJ' }),
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                return data.analise;
            }
        } catch (e) {
            console.warn('[CentroRoteirizacao] Análise geoespacial de incidentes:', e.message);
        }
        return null;
    }

    async obterStatusCor() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch('/api/status-operacional', { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                return await res.json();
            }
        } catch (e) {
            console.warn('[CentroRoteirizacao] Status COR.RIO:', e.message);
        }
        return null;
    }

    // ==========================================
    // FASE 2: PROJEÇÃO TEMPORAL 24 HORAS & JANELA IDEAL
    // ==========================================
    calcularProjecao24h(distanciaKm, duracaoBaseMin, totalPedagios, horaAtual) {
        const horas = [];
        const baseUberX = this.tarifasConfig?.tarifaBase || 3.50;
        const kmUberX = this.tarifasConfig?.precoPorKm || 1.50;
        const minUberX = this.tarifasConfig?.precoPorMinuto || 0.30;

        for (let h = 0; h < 24; h++) {
            let multTempo = 1.0;
            let multDinamica = 1.0;
            let label = 'Trânsito Normal';
            let status = 'moderado';
            let corBarra = '#38bdf8';

            if (h >= 0 && h <= 5) {
                multTempo = 0.82;
                multDinamica = 1.20;
                label = 'Madrugada (Vias Livres)';
                status = 'livre';
                corBarra = '#64748b';
            } else if (h === 6) {
                multTempo = 1.10;
                multDinamica = 1.15;
                label = 'Início de Pico Manhã';
                status = 'moderado';
                corBarra = '#38bdf8';
            } else if (h >= 7 && h <= 9) {
                multTempo = 1.45;
                multDinamica = 1.40;
                label = 'Pico Manhã (Retenções Severas)';
                status = 'pico';
                corBarra = '#ef4444';
            } else if (h >= 10 && h <= 15) {
                multTempo = 1.00;
                multDinamica = 1.00;
                label = 'Entre-pico Comercial (Janela Ideal)';
                status = 'ideal';
                corBarra = '#10b981';
            } else if (h === 16) {
                multTempo = 1.20;
                multDinamica = 1.20;
                label = 'Início Pico Tarde';
                status = 'moderado';
                corBarra = '#f59e0b';
            } else if (h >= 17 && h <= 19) {
                multTempo = 1.50;
                multDinamica = 1.45;
                label = 'Pico Tarde/Noite (Saída Corporativa)';
                status = 'pico';
                corBarra = '#ef4444';
            } else if (h === 20) {
                multTempo = 1.25;
                multDinamica = 1.25;
                label = 'Desaceleração do Pico';
                status = 'moderado';
                corBarra = '#f59e0b';
            } else {
                multTempo = 0.95;
                multDinamica = 1.15;
                label = 'Noite (Fluxo Regular)';
                status = 'livre';
                corBarra = '#38bdf8';
            }

            if (this.cenarioAtivo === 'chuva') {
                multTempo *= 1.25;
                multDinamica *= 1.20;
            } else if (this.cenarioAtivo === 'rockinrio') {
                if (h >= 16 && h <= 23) {
                    multTempo *= 1.35;
                    multDinamica *= 1.40;
                }
            }

            const tempoEst = Math.round(duracaoBaseMin * multTempo);
            const custoEst = Math.max(6.0, ((baseUberX + (distanciaKm * kmUberX) + (tempoEst * minUberX)) * multDinamica) + totalPedagios);
            const horaStr = String(h).padStart(2, '0') + ':00';
            const isHoraAtual = h === horaAtual;

            horas.push({
                hora: h,
                horaStr,
                tempoEst,
                custoEst,
                status,
                label,
                corBarra,
                isHoraAtual
            });
        }

        const maxCusto = Math.max(...horas.map(x => x.custoEst), 1);
        horas.forEach(h => {
            h.barHeightPct = Math.max(15, Math.round((h.custoEst / maxCusto) * 100));
        });

        return {
            horas,
            janelaIdeal: {
                inicio: '10:30',
                fim: '15:30',
                label: 'Janela Comercial (10:30 às 15:30)',
                economiaPercent: 35
            }
        };
    }

    // ==========================================
    // FASE 2: EXPORTAÇÃO & COMPARTILHAMENTO
    // ==========================================
    copiarResumoExecutivo() {
        if (!this.ultimoResultado) {
            showToast('Nenhuma simulação recente para copiar.', 'info', 2000);
            return;
        }

        const d = this.ultimoResultado;
        const now = new Date();
        const dataHora = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        let pedagiosStr = d.pedagios && d.pedagios.length > 0
            ? d.pedagios.map(p => `${p.nome} (R$ ${p.valor.toFixed(2).replace('.', ',')})`).join(', ')
            : 'Nenhum pedágio identificado';

        let paradasStr = '';
        if (d.waypointsLabels && d.waypointsLabels.length > 0) {
            paradasStr = `🛑 *Paradas*: ${d.waypointsLabels.join(' ➔ ')}\n`;
        }

        let corStr = '';
        if (this.statusCor && this.statusCor.estagio) {
            corStr = `🏢 *COR.RIO*: ${this.statusCor.estagio.estagio || 'NORMAL'} | Calor: ${this.statusCor.calor || 'N/A'}\n`;
        }

        let incidentesStr = '';
        if (this.incidentesDetectados && this.incidentesDetectados.length > 0) {
            const maisProx = this.incidentesDetectados[0];
            incidentesStr = `⚠️ *Alertas no Trajeto*: ${this.incidentesDetectados.length} evento(s) no corredor (mais próximo: ${maisProx.tipo} a ${maisProx.distanciaMetros}m em ${maisProx.bairro})\n`;
        } else {
            incidentesStr = `✅ *Segurança no Trajeto*: Nenhum incidente crítico no corredor monitorado.\n`;
        }

        const cenarioNome = (this.cenarioAtivo || 'padrao').toUpperCase();

        const texto = 
`🚗 *SIMULAÇÃO DE ROTEIRIZAÇÃO & CUSTOS - GLOBO RIT*
📅 *Emissão*: ${dataHora} | *Cenário*: ${cenarioNome}
📍 *Origem*: ${d.origem || 'Não informada'}
🏁 *Destino*: ${d.destino || 'Não informado'}
${paradasStr}📏 *Distância*: ${d.kmTotal} km | ⏱️ *Tempo Estimado*: ${d.tempoEstimado} min (${d.tempoFaixa})
🚧 *Pedágios RJ*: R$ ${d.totalPedagios.toFixed(2).replace('.', ',')} (${pedagiosStr})
🌱 *Pegada CO₂*: ${((d.kmTotal * 120) / 1000).toFixed(2)} kg
${corStr}${incidentesStr}
🏆 *RECOMENDAÇÃO OPERACIONAL DO RIT*:
👉 *${d.melhorOpcao.nome}* (${d.melhorOpcao.categoria})
💰 *Valor Estimado*: R$ ${d.melhorOpcao.custo.toFixed(2).replace('.', ',')}${d.isShared ? '/colaborador' : ''}
📊 *Score RIT*: ${d.melhorOpcao.score}/100 | *Confiança*: ${d.confianca.nivel} (${d.confianca.percent}%)

⭐ *Janela Ideal de Saída*: 10:30 às 15:30 (Economia de até 35% e tráfego fluido)
------------------------------------------------
*RIT CCO - Centro de Controle de Operações Globo*`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(() => {
                showToast('📋 Resumo operacional copiado para o WhatsApp/Slack!', 'success', 3000);
            }).catch(() => {
                this.fallbackCopiarTexto(texto);
            });
        } else {
            this.fallbackCopiarTexto(texto);
        }
    }

    fallbackCopiarTexto(texto) {
        try {
            const ta = document.createElement('textarea');
            ta.value = texto;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('📋 Resumo operacional copiado!', 'success', 2500);
        } catch (e) {
            showToast('Não foi possível copiar automaticamente.', 'error');
        }
    }

    imprimirRelatorio() {
        window.print();
    }

    async processarResultadosRota(todosPontos) {
        const route = this.routes[this.activeRouteIndex] || this.routes[0];
        if (!route) return;

        const coordsGeoJson = route.geometry.coordinates; // [lon, lat]
        const leafletCoords = coordsGeoJson.map(c => [c[1], c[0]]);

        const distanciaKm = parseFloat((route.distance / 1000).toFixed(1));
        const numParadas = Math.max(0, todosPontos.length - 2);
        const tempoParadasMin = numParadas * 6; // 6 minutos por parada (embarque/desembarque)
        let duracaoMinBase = Math.round(route.duration / 60) + tempoParadasMin;

        // Fatores Dinâmicos
        const horarioStr = document.getElementById('horario')?.value || '12:00';
        const transitoSim = document.getElementById('planejador-transito')?.value === 'sim';
        const chuvaSim = document.getElementById('planejador-chuva')?.value === 'sim';

        let fatorDinamico = 1.0;
        let hora = 12;
        if (horarioStr.includes(':')) {
            hora = parseInt(horarioStr.split(':')[0], 10);
        }

        const isPico = (hora >= 7 && hora <= 9) || (hora >= 17 && hora <= 19);
        const isMadrugada = (hora >= 22 || hora < 5);

        if (isPico) fatorDinamico *= 1.35;
        else if (isMadrugada) fatorDinamico *= 1.20;

        if (transitoSim) fatorDinamico *= 1.30;
        if (chuvaSim) fatorDinamico *= 1.25;

        // Fase 2: Coleta paralela de alertas de segurança e estágio COR.RIO
        const [analiseRisco, statusCor] = await Promise.all([
            this.analisarIncidentesRota(leafletCoords),
            this.obterStatusCor()
        ]);
        this.incidentesDetectados = analiseRisco?.ocorrenciasNoCorredor || [];
        this.statusCor = statusCor;

        // Fase 2: Modificadores de Cenários 1-Clique
        if (this.cenarioAtivo === 'chuva') {
            fatorDinamico *= 1.40;
            duracaoMinBase = Math.round(duracaoMinBase * 1.30);
        } else if (this.cenarioAtivo === 'rockinrio') {
            fatorDinamico *= 1.50;
            duracaoMinBase = Math.round(duracaoMinBase * 1.25);
        } else if (this.cenarioAtivo === 'linha_amarela') {
            duracaoMinBase += 18;
        } else if (this.cenarioAtivo === 'av_brasil') {
            duracaoMinBase += 25;
            fatorDinamico *= 1.30;
        }

        // Detecta pedágios
        this.pedagiosDetectados = this.detectarPedagios(coordsGeoJson);
        if (this.cenarioAtivo === 'linha_amarela') {
            // Isenção do pedágio da Linha Amarela por desvio simulado
            this.pedagiosDetectados = this.pedagiosDetectados.filter(p => !p.nome.includes('Linha Amarela'));
        }
        const totalPedagios = this.pedagiosDetectados.reduce((acc, p) => acc + p.valor, 0);

        // Tempo estimado com intervalo de confiança
        const margemMin = Math.max(3, Math.round(duracaoMinBase * 0.12));
        const tempoEstimadoMin = Math.round(duracaoMinBase * (transitoSim ? 1.25 : 1.0));
        const tempoMinFaixa = Math.max(5, tempoEstimadoMin - margemMin);
        const tempoMaxFaixa = tempoEstimadoMin + margemMin;

        // Confiança da Estimativa por Regras (Fase 2 integrada com Incidentes e COR)
        let confNivel = 'ALTA';
        let confPercent = 95;
        let confMotivo = 'Rota desobstruída e coordenadas homologadas';

        if (this.incidentesDetectados.length > 0) {
            const temTiroteio = this.incidentesDetectados.some(i => (i.tipo || '').toLowerCase().includes('tiroteio') || (i.tipo || '').toLowerCase().includes('disparo'));
            if (temTiroteio) {
                confNivel = 'BAIXA';
                confPercent = 48;
                confMotivo = `⚠️ Disparo/Operação a ${this.incidentesDetectados[0].distanciaMetros}m da rota (${this.incidentesDetectados[0].bairro})`;
            } else {
                confNivel = 'MÉDIA';
                confPercent = 68;
                confMotivo = `⚠️ ${this.incidentesDetectados.length} incidente(s) ativos no corredor monitorado`;
            }
        } else if (chuvaSim && transitoSim) {
            confNivel = 'BAIXA';
            confPercent = 64;
            confMotivo = 'Condições climáticas adversas e trânsito intenso';
        } else if (transitoSim || isPico || numParadas >= 3) {
            confNivel = 'MÉDIA';
            confPercent = 82;
            confMotivo = 'Impacto moderado de horário de pico ou múltiplas paradas';
        }

        if (this.statusCor?.estagio?.estagio && String(this.statusCor.estagio.estagio) !== '1') {
            confPercent = Math.max(30, confPercent - 12);
        }

        // TNO Options
        const isRoundTrip = document.getElementById('tno-ida-volta')?.checked || false;
        const isShared = document.getElementById('tno-shared-ride')?.checked || false;
        const isFixedVehicle = document.getElementById('tno-veiculo-fixo')?.checked || false;
        const passageiros = isShared ? 3 : 1;

        const multIdaVolta = isRoundTrip ? 1.85 : 1.0; // 15% economia no retorno
        const kmTotalFinal = parseFloat((distanciaKm * multIdaVolta).toFixed(1));
        const tempoTotalFinal = Math.round(tempoEstimadoMin * multIdaVolta);
        const pedagiosTotalFinal = totalPedagios * (isRoundTrip ? 2 : 1);

        // ==========================================
        // CÁLCULO DOS 7 MODAIS (ESTILO VAH/UBER)
        // ==========================================
        const precoPorKmUberX = this.tarifasConfig?.precoPorKm || 1.50;
        const precoPorMinUberX = this.tarifasConfig?.precoPorMinuto || 0.30;
        const baseUberX = this.tarifasConfig?.tarifaBase || 3.50;

        // 1. UberX
        const custoUberX = Math.max(6.0, ((baseUberX + (kmTotalFinal * precoPorKmUberX) + (tempoTotalFinal * precoPorMinUberX)) * fatorDinamico) + pedagiosTotalFinal);

        // 2. Uber Comfort
        const custoComfort = Math.max(9.5, ((5.00 + (kmTotalFinal * 1.95) + (tempoTotalFinal * 0.40)) * fatorDinamico) + pedagiosTotalFinal);

        // 3. Uber Black
        const custoBlack = Math.max(15.0, ((9.00 + (kmTotalFinal * 2.80) + (tempoTotalFinal * 0.65)) * fatorDinamico) + pedagiosTotalFinal);

        // 4. 99Pop
        const custo99Pop = Math.max(5.8, ((3.20 + (kmTotalFinal * 1.45) + (tempoTotalFinal * 0.28)) * fatorDinamico) + pedagiosTotalFinal);

        // 5. Táxi Comum RJ (Bandeira 1 / 2)
        const kmTaxi = isPico || isMadrugada ? 3.90 : 3.25;
        const custoTaxi = 6.10 + (kmTotalFinal * kmTaxi) + ((tempoTotalFinal / 60) * 15.00) + pedagiosTotalFinal;

        // 6. Cooperativa Credenciada
        let custoCooperativa = 0;
        if (isFixedVehicle) {
            custoCooperativa = 280.00 + pedagiosTotalFinal; // Diária fixa com franquia
        } else {
            custoCooperativa = Math.max(85.0, (kmTotalFinal * 3.80) + pedagiosTotalFinal);
        }

        // 7. Transporte Frota Própria Globo
        const custoCombustivel = (kmTotalFinal / 10.0) * 6.15;
        const custoDesgaste = kmTotalFinal * (0.45 + 0.35);
        const custoOperacionalGlobo = custoCombustivel + custoDesgaste + pedagiosTotalFinal + (isFixedVehicle ? 120.0 : ((tempoTotalFinal / 60) * 22.0));

        // Ajustes de risco e pontualidade por incidentes e cenários
        const penalidadeApp = this.incidentesDetectados.length > 0 ? 22 : 0;
        const bonusTaxiAvBrasil = this.cenarioAtivo === 'av_brasil' ? 10 : 0;

        const modais = [
            {
                id: 'globo_propria',
                nome: 'Frota Própria Globo',
                categoria: 'Operacional Globo',
                tempoMin: tempoTotalFinal,
                custo: custoOperacionalGlobo / passageiros,
                custoTotal: custoOperacionalGlobo,
                pontualidadeNota: 95,
                riscoNota: 98,
                confortoNota: 90,
                deeplink: null
            },
            {
                id: 'cooperativa',
                nome: 'Cooperativa Credenciada',
                categoria: 'Frotista Corporativo',
                tempoMin: tempoTotalFinal,
                custo: custoCooperativa / passageiros,
                custoTotal: custoCooperativa,
                pontualidadeNota: 92,
                riscoNota: 90,
                confortoNota: 85,
                deeplink: null
            },
            {
                id: 'uber_comfort',
                nome: 'Uber Comfort',
                categoria: 'App Executivo Leve',
                tempoMin: tempoTotalFinal + 3,
                custo: custoComfort / passageiros,
                custoTotal: custoComfort,
                pontualidadeNota: 84,
                riscoNota: Math.max(40, 80 - penalidadeApp),
                confortoNota: 88,
                deeplink: this.gerarUberDeepLink(todosPontos[0], todosPontos[todosPontos.length - 1])
            },
            {
                id: 'uber_black',
                nome: 'Uber Black',
                categoria: 'App Executivo Premium',
                tempoMin: tempoTotalFinal + 2,
                custo: custoBlack / passageiros,
                custoTotal: custoBlack,
                pontualidadeNota: 88,
                riscoNota: Math.max(50, 85 - Math.round(penalidadeApp * 0.7)),
                confortoNota: 98,
                deeplink: this.gerarUberDeepLink(todosPontos[0], todosPontos[todosPontos.length - 1])
            },
            {
                id: 'uberx',
                nome: 'UberX',
                categoria: 'App Convencional',
                tempoMin: tempoTotalFinal + 5,
                custo: custoUberX / passageiros,
                custoTotal: custoUberX,
                pontualidadeNota: 78,
                riscoNota: Math.max(30, 75 - penalidadeApp),
                confortoNota: 70,
                deeplink: this.gerarUberDeepLink(todosPontos[0], todosPontos[todosPontos.length - 1])
            },
            {
                id: '99pop',
                nome: '99Pop',
                categoria: 'App Econômico',
                tempoMin: tempoTotalFinal + 6,
                custo: custo99Pop / passageiros,
                custoTotal: custo99Pop,
                pontualidadeNota: 75,
                riscoNota: Math.max(25, 72 - penalidadeApp),
                confortoNota: 68,
                deeplink: 'https://m.99app.com/'
            },
            {
                id: 'taxi_comum',
                nome: 'Táxi Comum RJ',
                categoria: 'Convencional (Faixa Exclusiva)',
                tempoMin: Math.max(10, tempoTotalFinal - 4),
                custo: custoTaxi / passageiros,
                custoTotal: custoTaxi,
                pontualidadeNota: Math.min(99, 86 + bonusTaxiAvBrasil),
                riscoNota: 82,
                confortoNota: 72,
                deeplink: null
            }
        ];

        // Menor custo de referência
        const menorCustoRef = Math.min(...modais.map(m => m.custo));

        modais.forEach(m => {
            const notaCusto = Math.max(10, Math.min(100, 100 - (((m.custo - menorCustoRef) / menorCustoRef) * 60)));
            const score = Math.round(
                (0.40 * notaCusto) +
                (0.30 * m.pontualidadeNota) +
                (0.20 * m.riscoNota) +
                (0.10 * m.confortoNota)
            );
            m.score = score;
        });

        modais.sort((a, b) => b.score - a.score);
        const melhorOpcao = modais[0];
        this.modaisResultados = modais;

        // Projeção Temporal 24 Horas
        const projecao = this.calcularProjecao24h(kmTotalFinal, duracaoMinBase, pedagiosTotalFinal, hora);
        this.projecao24h = projecao.horas;
        this.janelaIdeal = projecao.janelaIdeal;

        // Renderiza no mapa com marcadores de incidentes
        this.renderizarMapa(leafletCoords, todosPontos, this.incidentesDetectados);

        // Dados consolidados
        const dadosDashboard = {
            origem: todosPontos[0]?.label,
            destino: todosPontos[todosPontos.length - 1]?.label,
            waypointsLabels: todosPontos.slice(1, -1).map(p => p.label),
            kmTotal: kmTotalFinal,
            tempoEstimado: tempoTotalFinal,
            tempoFaixa: `${tempoMinFaixa} a ${tempoMaxFaixa} min`,
            numParadas,
            pedagios: this.pedagiosDetectados,
            totalPedagios: pedagiosTotalFinal,
            confianca: { nivel: confNivel, percent: confPercent, motivo: confMotivo },
            melhorOpcao,
            modais,
            isShared,
            passageiros
        };

        this.ultimoResultado = dadosDashboard;

        // Renderiza painel e tabela
        this.renderizarDashboard(dadosDashboard);

        // Grava Log de Auditoria
        this.registrarLogAuditoria({
            origem: todosPontos[0]?.label,
            destino: todosPontos[todosPontos.length - 1]?.label,
            waypoints: todosPontos.slice(1, -1).map(p => p.label),
            totalKm: kmTotalFinal,
            tempoMin: tempoTotalFinal,
            pedagios: this.pedagiosDetectados,
            modalRecomendado: melhorOpcao.nome,
            scoreRecomendado: melhorOpcao.score,
            custoRecomendado: melhorOpcao.custo
        });
    }

    async recalcularApenasCustos() {
        if (this.routes && this.routes.length > 0 && this.originPoint && this.destPoint) {
            const todosPontos = [this.originPoint, ...this.stops.map(s => s.point).filter(Boolean), this.destPoint];
            await this.processarResultadosRota(todosPontos);
        }
    }

    renderizarMapa(coords, waypoints, incidentes = []) {
        if (!this.mapService || !this.mapService.map) return;

        this.mapService.clearRouteOverlay();
        this.mapService.clearMarkers();

        // Plota polyline da rota
        this.mapService.addPolyline(coords, '#f5a623', 6, { opacity: 0.9 });

        // Plota marcadores A, B, C...
        this.mapService.renderWaypointMarkers(waypoints);

        // Plota marcadores de incidentes em tempo real
        if (incidentes && incidentes.length > 0 && typeof this.mapService.renderIncidentMarkers === 'function') {
            this.mapService.renderIncidentMarkers(incidentes);
        }

        // Ajusta enquadramento do mapa
        this.mapService.fitBounds(coords, { padding: [40, 40] });
    }

    renderizarDashboard(dados) {
        const feedback = document.getElementById('plannerFeedback');
        if (!feedback) return;

        const pedagiosInfo = dados.pedagios.length > 0
            ? dados.pedagios.map(p => `${escapeHtml(p.nome)} (R$ ${p.valor.toFixed(2).replace('.', ',')})`).join(', ')
            : 'Nenhum pedágio identificado no trajeto';

        let badgeConfColor = '#10b981';
        if (dados.confianca.nivel === 'MÉDIA') badgeConfColor = '#f5a623';
        else if (dados.confianca.nivel === 'BAIXA') badgeConfColor = '#ef4444';

        const co2Kg = ((dados.kmTotal * 120) / 1000).toFixed(2);

        // Status COR.RIO
        let corBadgeHtml = '';
        if (this.statusCor && this.statusCor.estagio) {
            const est = this.statusCor.estagio.estagio || '1';
            const corCor = this.statusCor.estagio.cor || '#228d46';
            corBadgeHtml = `
                <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); padding:4px 8px; border-radius:4px; margin-bottom:8px; font-size:10px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-tower-broadcast" style="color:#00d1ff;"></i>
                        <span style="color:#fff; font-weight:700;">COR.RIO:</span>
                        <span style="background:${corCor}; color:#000; font-weight:900; padding:1px 5px; border-radius:3px; font-size:9px;">
                            ESTÁGIO ${escapeHtml(est)}
                        </span>
                    </div>
                    <span style="font-size:9px; color:#94a3b8;">${escapeHtml(this.statusCor.calor || 'Nível Normal')}</span>
                </div>
            `;
        }

        // Box de Incidentes no Corredor (Fase 2)
        let incidentesHtml = '';
        if (this.incidentesDetectados && this.incidentesDetectados.length > 0) {
            incidentesHtml = `
                <div class="rit-incident-box">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:10px; font-weight:800; color:#ef4444;">
                            ⚠️ ${this.incidentesDetectados.length} OCORRÊNCIA(S) NO CORREDOR DA ROTA
                        </span>
                        <span style="font-size:8px; color:#94a3b8;">Buffer 1.000m</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        ${this.incidentesDetectados.slice(0, 3).map(inc => `
                            <div class="rit-incident-item">
                                <span style="color:#fff;">${escapeHtml(inc.tipo || 'Ocorrência')} (${escapeHtml(inc.bairro || 'RJ')})</span>
                                <span style="color:#f5a623; font-weight:700;">a ${inc.distanciaMetros}m</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        feedback.innerHTML = `
            ${corBadgeHtml}
            ${incidentesHtml}

            <!-- DASHBOARD EXECUTIVO KPIS -->
            <div class="rit-exec-dashboard" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:6px; margin-bottom:10px;">
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:8px; border-radius:6px;">
                    <div style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase;">Distância Total</div>
                    <div style="font-size:16px; font-weight:900; color:#00d1ff;">${dados.kmTotal} km</div>
                    <div style="font-size:9px; color:#64748b;">${dados.numParadas} parada(s) intermediária(s)</div>
                </div>
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:8px; border-radius:6px;">
                    <div style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase;">Tempo Estimado</div>
                    <div style="font-size:16px; font-weight:900; color:#f5a623;">${dados.tempoEstimado} min</div>
                    <div style="font-size:9px; color:#64748b;">Faixa: ${dados.tempoFaixa}</div>
                </div>
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:8px; border-radius:6px;">
                    <div style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase;">Pedágios RJ</div>
                    <div style="font-size:16px; font-weight:900; color:#fff;">R$ ${dados.totalPedagios.toFixed(2).replace('.', ',')}</div>
                    <div style="font-size:9px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(pedagiosInfo)}">${escapeHtml(pedagiosInfo)}</div>
                </div>
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:8px; border-radius:6px;">
                    <div style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase;">Pegada CO₂</div>
                    <div style="font-size:16px; font-weight:900; color:#10b981;">${co2Kg} kg</div>
                    <div style="font-size:9px; color:#64748b;">Frota Padrão Globo</div>
                </div>
            </div>

            <!-- CONFIANÇA DA ESTIMATIVA -->
            <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); padding:6px 10px; border-radius:6px; margin-bottom:10px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:11px; font-weight:700; color:#fff;">Confiança:</span>
                    <span style="font-size:10px; font-weight:900; color:${badgeConfColor}; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">
                        ● ${dados.confianca.nivel} (${dados.confianca.percent}%)
                    </span>
                </div>
                <span style="font-size:9px; color:#94a3b8;" title="${escapeHtml(dados.confianca.motivo)}">${escapeHtml(dados.confianca.motivo)}</span>
            </div>

            <!-- CARD DE RECOMENDAÇÃO DO RIT -->
            <div class="rit-recommendation-card" style="background:linear-gradient(135deg, rgba(0, 209, 255, 0.12), rgba(245, 166, 35, 0.12)); border:1px solid #00d1ff; border-radius:8px; padding:10px; margin-bottom:12px; box-shadow:0 0 15px rgba(0,209,255,0.15);">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                    <span style="font-size:11px; font-weight:900; color:#00d1ff; text-transform:uppercase; letter-spacing:0.5px;">
                        🏆 RECOMENDAÇÃO OPERACIONAL DO RIT
                    </span>
                    <span style="font-size:10px; font-weight:900; background:#00d1ff; color:#04111a; padding:1px 6px; border-radius:4px;">
                        SCORE ${dados.melhorOpcao.score}/100
                    </span>
                </div>
                <div style="display:flex; align-items:baseline; justify-content:space-between;">
                    <div>
                        <strong style="font-size:14px; color:#fff;">${escapeHtml(dados.melhorOpcao.nome)}</strong>
                        <span style="font-size:10px; color:#94a3b8; margin-left:4px;">(${escapeHtml(dados.melhorOpcao.categoria)})</span>
                    </div>
                    <div style="font-size:16px; font-weight:900; color:#f5a623;">
                        R$ ${dados.melhorOpcao.custo.toFixed(2).replace('.', ',')}
                        ${dados.isShared ? '<small style="font-size:9px; color:#94a3b8;">/colab</small>' : ''}
                    </div>
                </div>
                <div style="font-size:10px; color:#cbd5e1; margin-top:4px;">
                    Melhor custo-benefício operacional ponderado: equilíbrio entre tempo, previsibilidade e menor risco operacional.
                </div>
            </div>

            <!-- TABELA COMPARATIVA MULTIMODAL ESTILO VAH -->
            <div style="border:1px solid rgba(255,255,255,0.08); border-radius:8px; overflow:hidden; margin-bottom:10px;">
                <div style="background:rgba(255,255,255,0.04); padding:6px 10px; font-size:11px; font-weight:800; color:#00d1ff; display:flex; justify-content:space-between; align-items:center;">
                    <span><i class="fa-solid fa-list-check"></i> Comparativo Multimodal (Estilo VAH)</span>
                    <span style="font-size:9px; color:#94a3b8;">${dados.modais.length} opções simuladas</span>
                </div>
                <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.08); background:rgba(0,0,0,0.3); color:#94a3b8; font-size:10px;">
                            <th style="padding:6px 8px;">Modal</th>
                            <th style="padding:6px 8px;">Tempo</th>
                            <th style="padding:6px 8px;">Preço Est.</th>
                            <th style="padding:6px 8px;">Score</th>
                            <th style="padding:6px 8px; text-align:right;">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dados.modais.map(m => {
                            const isRec = m.id === dados.melhorOpcao.id;
                            const rowBg = isRec ? 'rgba(0, 209, 255, 0.08)' : 'transparent';
                            const linkBtn = m.deeplink
                                ? `<a href="${m.deeplink}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:3px; background:#000; border:1px solid rgba(255,255,255,0.2); color:#fff; padding:2px 6px; border-radius:3px; font-size:9px; font-weight:700; text-decoration:none;">Uber <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:8px;"></i></a>`
                                : `<span style="font-size:9px; color:#64748b;">Interno</span>`;

                            return `
                                <tr style="border-bottom:1px solid rgba(255,255,255,0.04); background:${rowBg};">
                                    <td style="padding:6px 8px;">
                                        <div style="font-weight:700; color:#fff; display:flex; align-items:center; gap:4px;">
                                            ${isRec ? '<span style="color:#00d1ff;">★</span>' : ''}
                                            ${escapeHtml(m.nome)}
                                        </div>
                                        <div style="font-size:9px; color:#64748b;">${escapeHtml(m.categoria)}</div>
                                    </td>
                                    <td style="padding:6px 8px; color:#cbd5e1;">${m.tempoMin} min</td>
                                    <td style="padding:6px 8px; font-weight:800; color:#f5a623;">
                                        R$ ${m.custo.toFixed(2).replace('.', ',')}
                                    </td>
                                    <td style="padding:6px 8px;">
                                        <span style="font-size:10px; font-weight:800; color:${m.score >= 85 ? '#10b981' : (m.score >= 75 ? '#f5a623' : '#94a3b8')};">
                                            ${m.score}
                                        </span>
                                    </td>
                                    <td style="padding:6px 8px; text-align:right;">
                                        ${linkBtn}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- PROJEÇÃO TEMPORAL 24 HORAS & JANELA IDEAL (FASE 2) -->
            <div class="rit-24h-container">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:11px; font-weight:800; color:#00d1ff;">
                        <i class="fa-solid fa-chart-line"></i> Projeção 24h & Janela Ideal
                    </span>
                    <span style="font-size:9px; color:#10b981; font-weight:800; background:rgba(16,185,129,0.1); padding:2px 6px; border-radius:3px;">
                        ⭐ ${this.janelaIdeal?.label || 'Janela: 10:30 às 15:30'}
                    </span>
                </div>
                <div style="font-size:9px; color:#94a3b8; margin-bottom:6px;">
                    Economia estimada de até <b>35%</b> e -20 min de trânsito em relação ao pico. Clique para simular:
                </div>
                <div class="rit-24h-chart">
                    ${this.projecao24h.map(p => `
                        <div class="rit-24h-col ${p.isHoraAtual ? 'active' : ''} ${p.status === 'ideal' ? 'golden-hour' : ''}" 
                             data-hora="${p.horaStr}" 
                             title="${p.horaStr}: R$ ${p.custoEst.toFixed(2).replace('.', ',')} (${p.tempoEst} min) - ${p.label}">
                            <div class="rit-24h-bar" style="height:${p.barHeightPct}%; background:${p.corBarra};"></div>
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex; justify-content:space-between; font-size:8px; color:#64748b; margin-top:3px;">
                    <span>00h</span>
                    <span style="color:#ef4444;">08h (Pico)</span>
                    <span style="color:#10b981; font-weight:700;">12h (Ideal)</span>
                    <span style="color:#ef4444;">18h (Pico)</span>
                    <span>23h</span>
                </div>
            </div>

            <!-- AÇÕES EXECUTIVAS (FASE 2) -->
            <div style="display:flex; gap:6px; margin-top:8px;">
                <button type="button" id="btn-copiar-resumo" class="btn" style="flex:1; background:rgba(0, 209, 255, 0.12); border:1px solid #00d1ff; color:#00d1ff; font-weight:800; padding:7px; border-radius:4px; font-size:10px; display:flex; align-items:center; justify-content:center; gap:5px; cursor:pointer;">
                    <i class="fa-solid fa-copy"></i> Copiar Resumo WhatsApp
                </button>
                <button type="button" id="btn-imprimir-relatorio" class="btn" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#fff; font-weight:700; padding:7px 10px; border-radius:4px; font-size:10px; display:flex; align-items:center; justify-content:center; gap:4px; cursor:pointer;" title="Imprimir Relatório Executivo">
                    <i class="fa-solid fa-print"></i>
                </button>
                <a href="${this.gerarWazeDeepLink(this.destPoint)}" target="_blank" rel="noopener noreferrer" class="btn" style="background:#00d1ff; color:#04111a; font-weight:900; border:none; padding:7px 12px; border-radius:4px; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:4px; font-size:10px;">
                    <i class="fa-solid fa-diamond-turn-right"></i> Waze
                </a>
            </div>
        `;

        // Event listeners dos novos botões da Fase 2
        document.getElementById('btn-copiar-resumo')?.addEventListener('click', () => this.copiarResumoExecutivo());
        document.getElementById('btn-imprimir-relatorio')?.addEventListener('click', () => this.imprimirRelatorio());

        document.querySelectorAll('.rit-24h-col').forEach(col => {
            col.addEventListener('click', () => {
                const hora = col.dataset.hora;
                if (hora) {
                    const inputHorario = document.getElementById('horario');
                    if (inputHorario) inputHorario.value = hora;
                    showToast(`⏰ Simulação ajustada para as ${hora}`, 'info', 1500);
                    this.recalcularApenasCustos();
                }
            });
        });
    }

    gerarUberDeepLink(origem, destino) {
        if (!origem || !destino) return 'https://m.uber.com/';
        return `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${origem.lat}&pickup[longitude]=${origem.lon}&pickup[nickname]=${encodeURIComponent(origem.label || '')}&dropoff[latitude]=${destino.lat}&dropoff[longitude]=${destino.lon}&dropoff[nickname]=${encodeURIComponent(destino.label || '')}`;
    }

    gerarWazeDeepLink(destino) {
        if (!destino) return 'https://waze.com/';
        return `https://waze.com/ul?ll=${destino.lat},${destino.lon}&navigate=yes`;
    }

    async registrarLogAuditoria(dadosLog) {
        try {
            await fetch('/api/rotas/log-simulacao', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosLog)
            });
        } catch (e) {
            console.warn('[CentroRoteirizacao] Erro ao registrar auditoria:', e);
        }
    }
}
