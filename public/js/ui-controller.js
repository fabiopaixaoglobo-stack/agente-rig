import { CONFIG } from './config.js';
import { showToast, escapeHtml } from './utils.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM_ROUTE = 'https://router.project-osrm.org/route/v1/driving';

export class UiController {
    constructor(mapService, plannerService, chatService, dataService) {
        this.mapService = mapService;
        this.plannerService = plannerService;
        this.chatService = chatService;
        this.dataService = dataService;
        this.eventoAtualUrl = '';

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
            });
        });
    }

    initFilters() {
        const sp = document.getElementById("filtro-programa");
        const sb = document.getElementById("filtro-bairro");
        const st = document.getElementById("filtro-tipo");
        const btnLimpar = document.getElementById("btn-limpar");
        const btnCentralizar = document.getElementById("btn-centralizar");

        const filtrar = () => {
            const f = this.dataService.baseAtendimentos.filter(a => 
                (!sp.value || a.programa === sp.value) && 
                (!sb.value || a.bairro === sb.value) &&
                (!st || !st.value || a.tipoVeiculo === st.value)
            );
            this.plotarAtendimentos(f);
        };

        [sp, sb, st].forEach(s => s?.addEventListener("change", filtrar));
        btnLimpar?.addEventListener("click", () => {
            if(sp) sp.value = "";
            if(sb) sb.value = "";
            if(st) st.value = "";
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
        
        const progs = [...new Set(l.map(a => a.programa))].sort();
        const bairs = [...new Set(l.map(a => a.bairro))].sort();
        const tipos = [...new Set(l.map(a => a.tipoVeiculo))].sort();

        if (sp) sp.innerHTML = '<option value="">Programa</option>' + progs.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
        if (sb) sb.innerHTML = '<option value="">Bairro</option>' + bairs.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
        if (st) st.innerHTML = '<option value="">Veículo</option>' + tipos.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
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
    }

    initPlanner() {
        const btn = document.getElementById('btn-rota');
        if (!btn || !this.plannerService) return;
        btn.addEventListener('click', () => this.tracarRotaPlanejador());
    }

    async tracarRotaPlanejador() {
        const origem = document.getElementById('origem')?.value?.trim() || '';
        const destino = document.getElementById('destino')?.value?.trim() || '';
        const feedback = document.getElementById('plannerFeedback');
        const linksEl = document.getElementById('externalLinks');
        const linkGoogle = document.getElementById('link-google');
        const linkWaze = document.getElementById('link-waze');

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
        const fator = 1.5;
        const emoji = '🚗';

        if (feedback) feedback.innerHTML = 'Buscando coordenadas…';

        try {
            const headers = { Accept: 'application/json' };
            const qOrig = `${origem}, Rio de Janeiro, Brasil`;
            const resO = await fetch(`${NOMINATIM}?format=json&q=${encodeURIComponent(qOrig)}&limit=1`, { headers });
            const dataOrig = await resO.json();
            if (!dataOrig.length) throw new Error('Endereço de origem não encontrado.');

            if (feedback) feedback.innerHTML = 'Buscando destino…';
            const qDest = `${destino}, Rio de Janeiro, Brasil`;
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
            const custo = (parseFloat(distanciaKm) * fator + 5).toFixed(2);

            routeGroup.clearLayers();

            const vehicleIcon = L.divIcon({
                html: `<div style="font-size: 26px; filter: drop-shadow(0px 3px 2px rgba(0,0,0,0.4));">${emoji}</div>`,
                className: '',
                iconSize: [30, 30],
                iconAnchor: [15, 15],
            });

            L.marker([lat1, lon1]).addTo(routeGroup).bindPopup(`Origem: ${escapeHtml(origem)}`).openPopup();
            L.marker([lat2, lon2], { icon: vehicleIcon })
                .addTo(routeGroup)
                .bindPopup(`Destino: ${escapeHtml(destino)}`);
            L.polyline(coords, { color: '#f5a623', weight: 6 }).addTo(routeGroup);
            map.fitBounds(
                [
                    [Math.min(lat1, lat2), Math.min(lon1, lon2)],
                    [Math.max(lat1, lat2), Math.max(lon1, lon2)],
                ],
                { padding: [30, 30] }
            );

            if (feedback) {
                feedback.innerHTML = `
                    <strong style="color:var(--good)">✔ Rota traçada</strong><br>
                    <b>Distância:</b> ${escapeHtml(distanciaKm)} km<br>
                    <b>Tempo estimado:</b> ${duracaoMin} min<br>
                    <b>Custo (estimado):</b> R$ ${escapeHtml(custo)}
                `;
            }

            const gUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origem + ', RJ')}&destination=${encodeURIComponent(destino + ', RJ')}`;
            const wUrl = `https://www.waze.com/ul?q=${encodeURIComponent(destino)}&from=${encodeURIComponent(origem)}&navigate=yes`;
            if (linkGoogle) linkGoogle.href = gUrl;
            if (linkWaze) linkWaze.href = wUrl;
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

    atualizarMapaLive() {
        const o = document.getElementById('waze-origem').value;
        const d = document.getElementById('waze-destino').value;
        showToast("Atualizando mapa de trânsito...", "info");
        // Lógica para atualizar iframe do Waze se necessário
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
}

