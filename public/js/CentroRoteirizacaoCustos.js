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

        // TNO e RoundTrip toggles
        document.getElementById('tno-shared-ride')?.addEventListener('change', () => this.recalcularApenasCustos());
        document.getElementById('tno-ida-volta')?.addEventListener('change', () => this.recalcularApenasCustos());
        document.getElementById('tno-veiculo-fixo')?.addEventListener('change', () => this.recalcularApenasCustos());
        document.getElementById('planejador-transito')?.addEventListener('change', () => this.recalcularApenasCustos());
        document.getElementById('planejador-chuva')?.addEventListener('change', () => this.recalcularApenasCustos());
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
            this.processarResultadosRota(todosPontos);

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

    processarResultadosRota(todosPontos) {
        const route = this.routes[this.activeRouteIndex] || this.routes[0];
        if (!route) return;

        const coordsGeoJson = route.geometry.coordinates; // [lon, lat]
        const leafletCoords = coordsGeoJson.map(c => [c[1], c[0]]);

        const distanciaKm = parseFloat((route.distance / 1000).toFixed(1));
        const numParadas = Math.max(0, todosPontos.length - 2);
        const tempoParadasMin = numParadas * 6; // 6 minutos por parada (embarque/desembarque)
        const duracaoMinBase = Math.round(route.duration / 60) + tempoParadasMin;

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

        // Detecta pedágios
        this.pedagiosDetectados = this.detectarPedagios(coordsGeoJson);
        const totalPedagios = this.pedagiosDetectados.reduce((acc, p) => acc + p.valor, 0);

        // Tempo estimado com intervalo de confiança
        const margemMin = Math.max(3, Math.round(duracaoMinBase * 0.12));
        const tempoEstimadoMin = Math.round(duracaoMinBase * (transitoSim ? 1.25 : 1.0));
        const tempoMinFaixa = Math.max(5, tempoEstimadoMin - margemMin);
        const tempoMaxFaixa = tempoEstimadoMin + margemMin;

        // Confiança da Estimativa por Regras
        let confNivel = 'ALTA';
        let confPercent = 95;
        let confMotivo = 'Rota desobstruída e coordenadas homologadas';

        if (chuvaSim && transitoSim) {
            confNivel = 'BAIXA';
            confPercent = 64;
            confMotivo = 'Condições climáticas adversas e trânsito intenso';
        } else if (transitoSim || isPico || numParadas >= 3) {
            confNivel = 'MÉDIA';
            confPercent = 82;
            confMotivo = 'Impacto moderado de horário de pico ou múltiplas paradas';
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
        // Combustível (R$ 6,15/L a 10 km/L = R$ 0,615/km) + Desgaste/Depreciação (R$ 0,45/km) + Manutenção (R$ 0,35/km) + Rateio de motorista/hora
        const custoCombustivel = (kmTotalFinal / 10.0) * 6.15;
        const custoDesgaste = kmTotalFinal * (0.45 + 0.35);
        const custoOperacionalGlobo = custoCombustivel + custoDesgaste + pedagiosTotalFinal + (isFixedVehicle ? 120.0 : ((tempoTotalFinal / 60) * 22.0));

        // Monta lista de modais com Score Transparente:
        // Score = 40% Custo + 30% Pontualidade/Tempo + 20% Risco + 10% Conforto
        const menorCustoRef = Math.min(custoUberX, custoComfort, custoBlack, custo99Pop, custoTaxi, custoCooperativa, custoOperacionalGlobo);

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
                riscoNota: 80,
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
                riscoNota: 85,
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
                riscoNota: 75,
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
                riscoNota: 72,
                confortoNota: 68,
                deeplink: 'https://m.99app.com/'
            },
            {
                id: 'taxi_comum',
                nome: 'Táxi Comum RJ',
                categoria: 'Convencional (Faixa Exclusiva)',
                tempoMin: Math.max(10, tempoTotalFinal - 4), // Faixa exclusiva BRS
                custo: custoTaxi / passageiros,
                custoTotal: custoTaxi,
                pontualidadeNota: 86,
                riscoNota: 82,
                confortoNota: 72,
                deeplink: null
            }
        ];

        // Calcula score e define recomendação RIT
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

        // Renderiza no mapa
        this.renderizarMapa(leafletCoords, todosPontos);

        // Renderiza painel e tabela
        this.renderizarDashboard({
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
        });

        // Grava Log de Auditoria no Servidor (Governança RIT)
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

    recalcularApenasCustos() {
        if (this.routes && this.routes.length > 0 && this.originPoint && this.destPoint) {
            const todosPontos = [this.originPoint, ...this.stops.map(s => s.point).filter(Boolean), this.destPoint];
            this.processarResultadosRota(todosPontos);
        }
    }

    renderizarMapa(coords, waypoints) {
        if (!this.mapService || !this.mapService.map) return;

        this.mapService.clearRouteOverlay();
        this.mapService.clearMarkers();

        // Plota polyline da rota
        this.mapService.addPolyline(coords, '#f5a623', 6, { opacity: 0.9 });

        // Plota marcadores A, B, C...
        this.mapService.renderWaypointMarkers(waypoints);

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

        const co2Kg = ((dados.kmTotal * 120) / 1000).toFixed(2); // ~120g CO2/km

        feedback.innerHTML = `
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
                    <div style="font-size:9px; color:#64748b;">Frota Combustão Padrão</div>
                </div>
            </div>

            <!-- CONFIANÇA DA ESTIMATIVA -->
            <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); padding:6px 10px; border-radius:6px; margin-bottom:10px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:11px; font-weight:700; color:#fff;">Confiança da Estimativa:</span>
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
                    Melhor custo-benefício ponderado: menor custo total, risco de cancelamento mínimo e disponibilidade garantida para a operação.
                </div>
            </div>

            <!-- TABELA COMPARATIVA MULTIMODAL ESTILO VAH -->
            <div style="border:1px solid rgba(255,255,255,0.08); border-radius:8px; overflow:hidden; margin-bottom:10px;">
                <div style="background:rgba(255,255,255,0.04); padding:6px 10px; font-size:11px; font-weight:800; color:#00d1ff; display:flex; justify-content:space-between; align-items:center;">
                    <span><i class="fa-solid fa-list-check"></i> Comparativo Multimodal (Estilo VAH Urbano)</span>
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

            <!-- LINK EXTERNO WAZE -->
            <div style="display:flex; gap:6px;">
                <a href="${this.gerarWazeDeepLink(this.destPoint)}" target="_blank" rel="noopener noreferrer" class="btn" style="flex:1; background:#00d1ff; color:#04111a; font-weight:900; border:none; padding:6px; border-radius:4px; text-align:center; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:4px; font-size:11px;">
                    <i class="fa-solid fa-diamond-turn-right"></i> Abrir no Waze
                </a>
            </div>
        `;
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
