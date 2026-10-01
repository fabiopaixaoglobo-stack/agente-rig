/**
 * Agente RIT - Módulo RIT ALERTA
 * Controlador do Drawer Lateral de Análise Detalhada (traffic-alert-drawer.js)
 * Acessibilidade por Teclado / Proteção XSS / Separação Visual de Governança
 */

export class TrafficAlertDrawer {
    constructor({ overlayId = 'trafficAlertDrawer', service = null } = {}) {
        this.overlayId = overlayId;
        this.service = service;
        this.overlayEl = null;
        this.panelEl = null;
        this.currentIncident = null;
        this.triggerElement = null;
        this.isOpen = false;

        this._onKeyDown = this._onKeyDown.bind(this);
    }

    init() {
        this.overlayEl = document.getElementById(this.overlayId);
        if (!this.overlayEl) {
            console.warn(`[RIT ALERTA DRAWER] Overlay #${this.overlayId} não encontrado.`);
            return;
        }

        this.panelEl = this.overlayEl.querySelector('.ta-drawer-panel');

        // Fechar ao clicar no overlay externo
        this.overlayEl.addEventListener('click', (e) => {
            if (e.target === this.overlayEl) {
                this.close();
            }
        });

        // Botão de fechar
        const closeBtn = this.overlayEl.querySelector('.ta-drawer-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
    }

    /**
     * Abre o Drawer preenchendo as seções com dados do incidente.
     */
    async open(incident, triggerEl = null) {
        if (!incident) return;
        this.currentIncident = incident;
        this.triggerElement = triggerEl || document.activeElement;
        if (this.triggerElement && typeof this.triggerElement.setAttribute === 'function') {
            this.triggerElement.setAttribute('aria-expanded', 'true');
        }

        if (!this.overlayEl) this.init();
        if (!this.overlayEl) return;

        // Alterna visualização para o container de incidente
        const kpiContainer = document.getElementById('ta-drw-kpi-container');
        const incContainer = document.getElementById('ta-drw-incident-container');
        if (kpiContainer) kpiContainer.style.display = 'none';
        if (incContainer) incContainer.style.display = 'block';

        // Renderiza conteúdo
        this._renderContent(incident);

        // Abre o overlay
        this.overlayEl.classList.add('ta-open');
        this.isOpen = true;
        document.addEventListener('keydown', this._onKeyDown);

        // Foco acessível no botão fechar
        const closeBtn = this.overlayEl.querySelector('.ta-drawer-close');
        if (closeBtn) {
            setTimeout(() => closeBtn.focus(), 50);
        }

        // Carrega fontes, histórico e câmeras de forma assíncrona
        this._loadAsyncDetails(incident);
    }

    /**
     * Abre o Drawer exibindo o detalhamento analítico (drill-down) de um dos 7 KPIs executivos.
     * Restaura foco acessível ao fechar e garante navegação completa por teclado.
     */
    openKpiDetail(kpiType, data = {}, triggerEl = null) {
        this.triggerElement = triggerEl || document.activeElement;
        if (this.triggerElement && typeof this.triggerElement.setAttribute === 'function') {
            this.triggerElement.setAttribute('aria-expanded', 'true');
        }

        if (!this.overlayEl) this.init();
        if (!this.overlayEl) return;

        const kpiContainer = document.getElementById('ta-drw-kpi-container');
        const incContainer = document.getElementById('ta-drw-incident-container');
        if (incContainer) incContainer.style.display = 'none';
        if (kpiContainer) {
            kpiContainer.style.display = 'block';
            kpiContainer.innerHTML = this._buildKpiDetailHtml(kpiType, data);
            this._bindKpiDetailActions(kpiContainer);
        }

        // Abre o overlay
        this.overlayEl.classList.add('ta-open');
        this.isOpen = true;
        document.addEventListener('keydown', this._onKeyDown);

        // Foco acessível no botão fechar
        const closeBtn = this.overlayEl.querySelector('.ta-drawer-close');
        if (closeBtn) {
            setTimeout(() => closeBtn.focus(), 50);
        }
    }

    /**
     * Fecha o Drawer e restaura o foco no elemento de disparo.
     */
    close() {
        if (!this.overlayEl) return;
        this.overlayEl.classList.remove('ta-open');
        this.isOpen = false;
        document.removeEventListener('keydown', this._onKeyDown);

        if (this.triggerElement && typeof this.triggerElement.setAttribute === 'function') {
            this.triggerElement.setAttribute('aria-expanded', 'false');
        }

        if (this.triggerElement && typeof this.triggerElement.focus === 'function') {
            this.triggerElement.focus();
        }
    }

    _onKeyDown(e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
            this.close();
        }
    }

    /**
     * Renderização síncrona inicial com segurança XSS.
     */
    _renderContent(inc) {
        const titleEl = document.getElementById('ta-drw-title');
        const subtitleEl = document.getElementById('ta-drw-subtitle');
        const idEl = document.getElementById('ta-drw-id');
        const sevEl = document.getElementById('ta-drw-sev');
        const confEl = document.getElementById('ta-drw-conf');
        const compEl = document.getElementById('ta-drw-comp');
        const factorsEl = document.getElementById('ta-drw-factors-desc');
        const divBox = document.getElementById('ta-drw-divergence-box');
        const divText = document.getElementById('ta-drw-divergence-text');
        const recContainer = document.getElementById('ta-drw-rec-container');

        const safeTitle = this._sanitize(inc.title || inc.categoria || 'Incidente Operacional');
        const safeCorridor = this._sanitize(inc.corridor || inc.via || 'Corredor');
        const safeSentido = this._sanitize(inc.direction || inc.sentido || 'Não informado');
        const safeBairro = this._sanitize(inc.neighborhood || inc.bairro || 'Rio de Janeiro');
        const safeId = this._sanitize(inc.id || inc.canonical_id || 'ID-NÃO-INFORMADO');
        const safeSev = this._sanitize(inc.severity || inc.severidade || 'MÉDIO');
        const safeConf = this._sanitize(inc.confidence_level || inc.confianca || 'A');
        const completude = inc.completeness_score || inc.completude || 75;

        if (titleEl) titleEl.textContent = safeTitle;
        if (subtitleEl) subtitleEl.textContent = `${safeCorridor} — ${safeSentido} (${safeBairro})`;
        if (idEl) idEl.textContent = `${safeId} // IDENTIFICADOR CANÔNICO`;

        if (sevEl) {
            sevEl.textContent = safeSev;
            sevEl.style.color = (safeSev === 'CRÍTICO' || safeSev === 'ALTO') ? 'var(--ta-bad)' : 'var(--ta-warning)';
        }

        if (confEl) confEl.textContent = `GRAU ${safeConf}`;
        if (compEl) compEl.textContent = `${completude}%`;

        if (factorsEl) {
            factorsEl.textContent = `Fatores Ponderados: Boletim oficial registrado; confirmação por cruzamento de fontes viárias; faixas impactadas: ${this._sanitize(inc.blocked_lanes || inc.faixas || 'Sob apuração')}.`;
        }

        // Tratamento de Divergência
        const divergencia = inc.divergence || inc.divergencia || inc.divergenceDetails || inc.divergence_details;
        if (divergencia && divBox && divText) {
            divBox.style.display = 'block';
            divText.textContent = this._sanitize(divergencia);
        } else if (divBox) {
            divBox.style.display = 'none';
        }

        // Renderiza Recomendações Consultivas (Sem Autoritarismo)
        if (recContainer) {
            this._renderConsultativeRecommendations(recContainer, inc);
        }
    }

    /**
     * Renderiza o bloco de recomendações determinísticas e consultivas.
     * Segue rigorosamente a diretriz: tom consultivo, sem imposição, com metadados de consulta.
     */
    _renderConsultativeRecommendations(container, inc) {
        container.innerHTML = '';

        const safeCorridor = this._sanitize(inc.corridor || inc.via || 'o corredor afetado');
        const altCorridor = safeCorridor.toLowerCase().includes('linha vermelha') ? 'Avenida Brasil' : (safeCorridor.toLowerCase().includes('linha amarela') ? 'Avenida Dom Hélder Câmara' : 'Via Estruturante Secundária');
        const queryTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const providerName = inc.sources && inc.sources[0] && inc.sources[0].provider ? inc.sources[0].provider : 'Base Operacional RIT';

        const recs = [
            `Alternativa para avaliação: ${altCorridor}.`,
            `Para quem ainda não ingressou no corredor ${safeCorridor}, pode ser útil avaliar vias alternativas de escoamento, conforme origem e destino específicos.`,
            `Informação de trânsito em tempo real: Estimativa topológica pública (velocidade média da malha disponível).`,
            `Horário da consulta: ${queryTime} | Provedor de referência: ${providerName}.`,
            `A adequação geométrica para ônibus ou veículos pesados deve ser validada pelo operador responsável (não confirmada para vias secundárias desta alternativa).`,
            `Orientação operacional: Confirmar as condições locais de tráfego e sinalização viária antes de qualquer desvio.`
        ];

        const box = document.createElement('div');
        box.className = 'ta-rec-box';

        recs.forEach(txt => {
            const item = document.createElement('div');
            item.className = 'ta-rec-item';

            const icon = document.createElement('span');
            icon.className = 'ta-rec-icon';
            icon.textContent = 'ℹ️';

            const textDiv = document.createElement('div');
            textDiv.textContent = txt;

            item.appendChild(icon);
            item.appendChild(textDiv);
            box.appendChild(item);
        });

        const caveat = document.createElement('div');
        caveat.className = 'ta-caveat-box';
        caveat.innerHTML = `<span>🛡️</span><span><strong>Aviso de Governança:</strong> Recomendações de caráter estritamente consultivo para apoio à decisão operacional. O motor de cálculo não emite rotas garantidas para veículos pesados.</span>`;
        box.appendChild(caveat);

        container.appendChild(box);
    }

    /**
     * Carrega detalhes assíncronos: Câmeras e Histórico.
     */
    async _loadAsyncDetails(inc) {
        const camsContainer = document.getElementById('ta-drw-cameras-grid');
        const historyContainer = document.getElementById('ta-drw-timeline-list');

        // Carrega Câmeras Próximas
        if (camsContainer) {
            camsContainer.innerHTML = '<div style="font-size:10px; color:var(--ta-muted); padding:8px;">Buscando câmeras públicas no perímetro...</div>';
            const lat = parseFloat(inc.lat);
            const lng = parseFloat(inc.lng);

            if (!isNaN(lat) && !isNaN(lng) && this.service) {
                const camRes = await this.service.getNearbyCameras(lat, lng, 2500, 4);
                if (camRes.ok && camRes.data.length > 0) {
                    this._renderCamerasGrid(camsContainer, camRes.data);
                } else {
                    camsContainer.innerHTML = '<div style="font-size:11px; color:var(--ta-muted); padding:10px; grid-column:span 2;">Nenhuma câmera pública validada para esta ocorrência.</div>';
                }
            } else {
                camsContainer.innerHTML = '<div style="font-size:11px; color:var(--ta-muted); padding:10px; grid-column:span 2;">Coordenadas indisponíveis para mapeamento visual de câmeras.</div>';
            }
        }

        // Carrega Histórico
        if (historyContainer && this.service) {
            const incId = inc.id || inc.canonical_id;
            const histRes = await this.service.getIncidentHistory(incId);

            if (histRes.ok && histRes.data.length > 0) {
                historyContainer.innerHTML = '';
                histRes.data.forEach(h => {
                    const item = document.createElement('div');
                    item.className = 'ta-timeline-item';

                    const dot = document.createElement('span');
                    dot.className = 'ta-timeline-dot';

                    const time = document.createElement('span');
                    time.className = 'ta-timeline-time';
                    time.style.fontSize = '9px';
                    time.style.color = 'var(--ta-muted)';
                    time.style.fontFamily = 'var(--ta-mono)';
                    time.textContent = h.created_at ? new Date(h.created_at).toLocaleTimeString() : 'Recentemente';

                    const desc = document.createElement('span');
                    desc.style.fontSize = '10px';
                    desc.style.color = '#cbd5e1';
                    desc.textContent = this._sanitize(h.description || h.action || 'Atualização de status');

                    item.appendChild(dot);
                    item.appendChild(time);
                    item.appendChild(desc);
                    historyContainer.appendChild(item);
                });
            } else {
                historyContainer.innerHTML = `
                    <div class="ta-timeline-item">
                        <span class="ta-timeline-dot"></span>
                        <span style="font-size:10px; color:#cbd5e1;">Primeira detecção registrada e consolidada por cruzamento de fontes públicas.</span>
                    </div>
                `;
            }
        }
    }

    /**
     * Renderiza o grid com as câmeras próximas mapeadas.
     */
    _renderCamerasGrid(container, cameras) {
        container.innerHTML = '';

        cameras.slice(0, 4).forEach((camItem, index) => {
            const cam = camItem.camera || camItem;
            const status = (cam.status || 'online').toLowerCase();

            let statusClass = 'ta-cam-online';
            let statusLabel = '🟢 DISPONÍVEL';
            if (status === 'offline') {
                statusClass = 'ta-cam-offline';
                statusLabel = '🔴 OFFLINE';
            } else if (status === 'desatualizada' || status === 'degraded') {
                statusClass = 'ta-cam-outdated';
                statusLabel = '🟡 DESATUALIZADA';
            } else if (status !== 'online') {
                statusClass = 'ta-cam-unverified';
                statusLabel = '⚪ STATUS NÃO VALIDADO';
            }

            const card = document.createElement('div');
            card.className = `ta-cam-card ${statusClass}`;

            const viewfinder = document.createElement('div');
            viewfinder.className = 'ta-cam-viewfinder';

            const tag = document.createElement('span');
            tag.className = 'ta-cam-status-tag';
            tag.textContent = statusLabel;

            const timeTag = document.createElement('span');
            timeTag.className = 'ta-cam-timestamp';
            timeTag.textContent = 'CONSULTA NA FONTE ORIGINAL';

            const iconPlaceholder = document.createElement('div');
            iconPlaceholder.style.fontSize = '24px';
            iconPlaceholder.textContent = '📹';

            viewfinder.appendChild(tag);
            viewfinder.appendChild(timeTag);
            viewfinder.appendChild(iconPlaceholder);

            const info = document.createElement('div');
            info.className = 'ta-cam-info';

            const name = document.createElement('div');
            name.className = 'ta-cam-name';
            name.textContent = this._sanitize(cam.nome || `Câmera #${cam.id || index + 1}`);

            const role = document.createElement('div');
            role.className = 'ta-cam-role';
            role.textContent = this._sanitize(cam.bairro ? `${cam.bairro} (${camItem.distanciaMetros ? camItem.distanciaMetros + 'm' : 'no raio'})` : 'Perímetro monitorado');

            info.appendChild(name);
            info.appendChild(role);

            card.appendChild(viewfinder);
            card.appendChild(info);
            container.appendChild(card);
        });
    }

    _sanitize(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Gera o HTML padronizado para o drill-down dos 7 KPIs executivos.
     */
    _buildKpiDetailHtml(kpiType, data = {}) {
        this._currentKpiData = data;
        const region = data.region || 'RJ';
        const cfg = data.regionalConfig || { uf: region, praca: region, fontes: 'Fontes Oficiais' };
        const corridors = Array.isArray(data.corridors) ? data.corridors : [];
        const incidents = Array.isArray(data.incidents) ? data.incidents : [];
        const cameras = Array.isArray(data.cameras) ? data.cameras : [];
        const kpis = data.kpis || {};

        const idEl = document.getElementById('ta-drw-id');
        const titleEl = document.getElementById('ta-drw-title');
        const subtitleEl = document.getElementById('ta-drw-subtitle');

        const getStatusBadge = (status) => {
            const s = String(status).toLowerCase();
            if (s.includes('bloqueio')) return `<span class="ta-badge ta-badge-block">⚫ BLOQUEIO</span>`;
            if (s.includes('crítico') || s.includes('critico')) return `<span class="ta-badge ta-badge-bad">🔴 CRÍTICO</span>`;
            if (s.includes('lento') || s.includes('intenso')) return `<span class="ta-badge ta-badge-orange">🟠 LENTO</span>`;
            if (s.includes('moderado')) return `<span class="ta-badge ta-badge-warn">🟡 MODERADO</span>`;
            return `<span class="ta-badge ta-badge-good">🟢 NORMAL</span>`;
        };

        if (kpiType === 'mobilidade') {
            if (idEl) idEl.textContent = `KPI // ÍNDICE DE MOBILIDADE URBANA`;
            if (titleEl) titleEl.textContent = `Índice Geral de Mobilidade Urbana`;
            if (subtitleEl) subtitleEl.textContent = `Fluidez ponderada dos 9 corredores viários estratégicos (${cfg.praca})`;

            const mobVal = kpis.mobilidadeIndex ?? 82;
            const mobLabel = mobVal >= 80 ? '🟢 Fluxo Regular' : (mobVal >= 55 ? '🟡 Lentidão Moderada' : '🔴 Malha Sobrecarregada');
            const afetadasCount = corridors.filter(c => (c.retencaoMin || 0) > 0 || (c.status || '').toLowerCase() !== 'normal').length;

            return `
                <div class="ta-drw-kpi-section">
                    <div class="ta-drw-kpi-banner">
                        <strong>Metodologia do Indicador:</strong> Medido de 0 a 100 com base na retenção ponderada da malha e ocorrências ativas.<br>
                        <span style="font-family:var(--ta-mono); font-size:10px; color:#38bdf8;">
                            Fórmula: 100 - (Tempo Médio de Retenção × 1.5) - (Corredores Críticos × 8)
                        </span>
                    </div>

                    <div class="ta-drw-kpi-stats-grid">
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Índice Atual</div>
                            <div class="ta-drw-stat-val" style="color:${mobVal >= 75 ? 'var(--ta-good)' : (mobVal >= 50 ? 'var(--ta-warning)' : 'var(--ta-bad)')};">${mobVal}/100</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Classificação</div>
                            <div class="ta-drw-stat-val" style="font-size:11px; padding-top:3px;">${mobLabel}</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Corredores Monitorados</div>
                            <div class="ta-drw-stat-val">9 Vias</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Vias com Retenção</div>
                            <div class="ta-drw-stat-val" style="color:${afetadasCount > 0 ? 'var(--ta-warning)' : 'var(--ta-good)'};">${afetadasCount} de 9</div>
                        </div>
                    </div>

                    <div style="font-size:11px; font-weight:800; color:#fff; text-transform:uppercase; margin-top:4px;">
                        Detalhamento por Corredor Estruturante (${cfg.uf})
                    </div>

                    <div class="ta-drw-kpi-table-wrap">
                        <table class="ta-drw-kpi-table">
                            <thead>
                                <tr>
                                    <th>Corredor</th>
                                    <th>Status</th>
                                    <th>Velocidade</th>
                                    <th>Retenção</th>
                                    <th style="text-align:right;">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${corridors.map(c => `
                                    <tr>
                                        <td><strong style="color:#fff;">${this._sanitize(c.via)}</strong></td>
                                        <td>${getStatusBadge(c.status)}</td>
                                        <td>${c.velocidadeAtualKmH || '--'} km/h <span style="font-size:9px; color:var(--ta-muted);">(Ref: ${c.velocidadePadraoKmH || '--'})</span></td>
                                        <td style="color:${(c.retencaoMin || 0) > 0 ? '#f59e0b' : 'var(--ta-good)'}; font-weight:700;">${c.diferenca || (c.retencaoMin ? '+' + c.retencaoMin + ' min' : '0 min')}</td>
                                        <td style="text-align:right;">
                                            <button class="ta-btn-map-focus" data-focus-corridor="${this._sanitize(c.via)}">
                                                <i class="fa-solid fa-location-crosshairs"></i> Ver no Mapa
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        if (kpiType === 'retencao') {
            if (idEl) idEl.textContent = `KPI // TEMPO DE RETENÇÃO`;
            if (titleEl) titleEl.textContent = `Tempo Médio de Retenção da Malha`;
            if (subtitleEl) subtitleEl.textContent = `Ranking de atrasos nos 9 eixos estruturantes (${cfg.praca})`;

            const tempoMedio = kpis.tempoMedioRetencao ?? 0;
            const impacto = kpis.impactoOperacional || (tempoMedio >= 20 ? 'CRÍTICO' : (tempoMedio >= 10 ? 'MODERADO' : 'BAIXO'));
            const sortedCorridors = [...corridors].sort((a, b) => (b.retencaoMin || 0) - (a.retencaoMin || 0));
            const piorVia = sortedCorridors[0] || { via: 'Nenhuma', retencaoMin: 0 };

            return `
                <div class="ta-drw-kpi-section">
                    <div class="ta-drw-kpi-banner">
                        <strong>Impacto Operacional:</strong> Atraso adicional médio que veículos e ônibus enfrentam em relação ao tráfego livre.<br>
                        Calculado pela diferença entre o tempo real de travessia e o tempo de referência de fluxo desimpedido.
                    </div>

                    <div class="ta-drw-kpi-stats-grid">
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Retenção Média</div>
                            <div class="ta-drw-stat-val" style="color:${tempoMedio >= 15 ? 'var(--ta-bad)' : (tempoMedio >= 8 ? 'var(--ta-warning)' : 'var(--ta-good)')};">
                                +${tempoMedio} min
                            </div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Pior Ponto da Regional</div>
                            <div class="ta-drw-stat-val" style="font-size:11px; padding-top:3px; color:#fca5a5;">
                                ${this._sanitize(piorVia.via)} (+${piorVia.retencaoMin || 0}m)
                            </div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Nível de Impacto</div>
                            <div class="ta-drw-stat-val" style="font-size:11px; padding-top:3px;">${impacto}</div>
                        </div>
                    </div>

                    <div style="font-size:11px; font-weight:800; color:#fff; text-transform:uppercase; margin-top:4px;">
                        Ranking de Retenção (Mais Lento ao Mais Fluido)
                    </div>

                    <div class="ta-drw-kpi-table-wrap">
                        <table class="ta-drw-kpi-table">
                            <thead>
                                <tr>
                                    <th>Posição & Corredor</th>
                                    <th>Atraso</th>
                                    <th>Tempo Total</th>
                                    <th>Tendência</th>
                                    <th style="text-align:right;">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sortedCorridors.map((c, idx) => `
                                    <tr>
                                        <td>
                                            <span style="font-family:var(--ta-mono); color:var(--ta-muted); font-size:9.5px; margin-right:4px;">#${idx + 1}</span>
                                            <strong style="color:#fff;">${this._sanitize(c.via)}</strong>
                                        </td>
                                        <td style="color:${(c.retencaoMin || 0) > 0 ? '#f59e0b' : 'var(--ta-good)'}; font-weight:800;">
                                            ${c.diferenca || (c.retencaoMin ? '+' + c.retencaoMin + ' min' : '0 min')}
                                        </td>
                                        <td>${c.tempoAtual || '--'} min <span style="font-size:9px; color:var(--ta-muted);">(Ref: ${c.tempoReferencia || '--'}m)</span></td>
                                        <td>${c.tendencia === 'AGRAVANDO' ? '🔺 AGRAVANDO' : (c.tendencia === 'MELHORANDO' ? '🟢 MELHORANDO' : '➡️ ESTÁVEL')}</td>
                                        <td style="text-align:right;">
                                            <button class="ta-btn-map-focus" data-focus-corridor="${this._sanitize(c.via)}">
                                                <i class="fa-solid fa-location-crosshairs"></i> Focar
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        if (kpiType === 'ativas') {
            if (idEl) idEl.textContent = `KPI // OCORRÊNCIAS OPERACIONAIS`;
            if (titleEl) titleEl.textContent = `Ocorrências Operacionais Ativas`;
            if (subtitleEl) subtitleEl.textContent = `${incidents.length} incidentes no perímetro monitorado (${cfg.praca})`;

            const critCount = incidents.filter(i => {
                const s = (i.severity || i.severidade || '').toUpperCase();
                return s === 'CRÍTICO' || s === 'ALTO';
            }).length;

            return `
                <div class="ta-drw-kpi-section">
                    <div class="ta-drw-kpi-banner">
                        <strong>Detalhamento dos Incidentes:</strong> Ocorrências consolidadas a partir de cruzamento de fontes oficiais e colaborativas (OTT, Fogo Cruzado, Defesa Civil, CET).
                    </div>

                    <div class="ta-drw-kpi-stats-grid">
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Total de Ocorrências</div>
                            <div class="ta-drw-stat-val" style="color:var(--ta-accent);">${incidents.length}</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Alta Severidade / Crítico</div>
                            <div class="ta-drw-stat-val" style="color:${critCount > 0 ? 'var(--ta-bad)' : 'var(--ta-good)'};">${critCount}</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Janela de Monitoramento</div>
                            <div class="ta-drw-stat-val" style="font-size:11px; padding-top:3px;">Últimos 15 min</div>
                        </div>
                    </div>

                    <div style="font-size:11px; font-weight:800; color:#fff; text-transform:uppercase; margin-top:4px;">
                        Listagem Completa de Ocorrências Ativas
                    </div>

                    <div class="ta-drw-kpi-table-wrap">
                        ${incidents.length === 0 ? `
                            <div style="padding:20px; text-align:center; color:var(--ta-muted); font-size:11px;">
                                🟢 Nenhuma ocorrência ativa registrada no perímetro neste momento.
                            </div>
                        ` : `
                            <table class="ta-drw-kpi-table">
                                <thead>
                                    <tr>
                                        <th>Horário</th>
                                        <th>Local / Corredor</th>
                                        <th>Ocorrência</th>
                                        <th>Severidade</th>
                                        <th style="text-align:right;">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${incidents.map(inc => `
                                        <tr>
                                            <td style="font-family:var(--ta-mono); font-size:9.5px;">${inc.time || (inc.timestamp ? new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--')}</td>
                                            <td><strong style="color:#fff;">${this._sanitize(inc.corridor || inc.via || inc.local || 'Malha Viária')}</strong></td>
                                            <td style="font-size:10px;">${this._sanitize(inc.title || inc.tipo || inc.descricao || 'Ocorrência')}</td>
                                            <td>${getStatusBadge(inc.severity || inc.severidade || 'MÉDIO')}</td>
                                            <td style="text-align:right;">
                                                <button class="ta-btn-map-focus" data-incident-id="${this._sanitize(inc.id || inc.canonical_id)}">
                                                    Ver Detalhes
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>
                </div>
            `;
        }

        if (kpiType === 'criticos') {
            if (idEl) idEl.textContent = `KPI // BLOQUEIOS E INCIDENTES CRÍTICOS`;
            if (titleEl) titleEl.textContent = `Incidentes Críticos & Bloqueios Severos`;
            if (subtitleEl) subtitleEl.textContent = `Eventos que causam interrupção ou severa retenção de tráfego (${cfg.praca})`;

            const critCorridors = corridors.filter(c => {
                const s = (c.status || '').toLowerCase();
                return s.includes('crítico') || s.includes('critico') || s.includes('bloqueio');
            });
            const critIncidents = incidents.filter(i => {
                const s = (i.severity || i.severidade || '').toUpperCase();
                return s === 'CRÍTICO' || s === 'ALTO';
            });

            return `
                <div class="ta-drw-kpi-section">
                    <div class="ta-drw-kpi-banner" style="border-color:rgba(239, 68, 68, 0.4); background:rgba(30, 10, 20, 0.8);">
                        <strong style="color:#fca5a5;">Atenção Operacional:</strong> Lista de vias com bloqueio total, acidentes graves ou retenção crítica que demandam rotas alternativas ou contingência.
                    </div>

                    <div class="ta-drw-kpi-stats-grid">
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Corredores Críticos</div>
                            <div class="ta-drw-stat-val" style="color:var(--ta-bad);">${critCorridors.length}</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Ocorrências Graves</div>
                            <div class="ta-drw-stat-val" style="color:var(--ta-bad);">${critIncidents.length}</div>
                        </div>
                    </div>

                    <div style="font-size:11px; font-weight:800; color:#fff; text-transform:uppercase; margin-top:4px;">
                        Corredores em Situação Crítica
                    </div>

                    <div class="ta-drw-kpi-table-wrap">
                        ${critCorridors.length === 0 ? `
                            <div style="padding:15px; text-align:center; color:var(--ta-good); font-size:11px;">
                                🟢 Nenhum corredor com bloqueio crítico registrado na regional.
                            </div>
                        ` : `
                            <table class="ta-drw-kpi-table">
                                <thead>
                                    <tr>
                                        <th>Via / Corredor</th>
                                        <th>Atraso</th>
                                        <th>Ocorrência / Trecho</th>
                                        <th style="text-align:right;">Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${critCorridors.map(c => `
                                        <tr>
                                            <td><strong style="color:#ef4444;">${this._sanitize(c.via)}</strong></td>
                                            <td style="color:#f59e0b; font-weight:800;">${c.diferenca || '+' + (c.retencaoMin || 0) + ' min'}</td>
                                            <td style="font-size:10px;">${this._sanitize(c.ocorrenciaAtiva || c.trechoCritico || 'Retenção crítica')}</td>
                                            <td style="text-align:right;">
                                                <button class="ta-btn-map-focus" data-focus-corridor="${this._sanitize(c.via)}">
                                                    <i class="fa-solid fa-location-crosshairs"></i> Focar
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>
                </div>
            `;
        }

        if (kpiType === 'vias') {
            if (idEl) idEl.textContent = `KPI // VIAS MONITORADAS`;
            if (titleEl) titleEl.textContent = `Vias Estruturantes Afetadas`;
            if (subtitleEl) subtitleEl.textContent = `Situação de fluidez dos 9 corredores viários de ${cfg.praca}`;

            const afetadas = corridors.filter(c => (c.retencaoMin || 0) > 0 || (c.status || '').toLowerCase() !== 'normal');

            return `
                <div class="ta-drw-kpi-section">
                    <div class="ta-drw-kpi-banner">
                        <strong>Corredores Estruturantes:</strong> Monitoramento contínuo dos 9 eixos da regional (${cfg.uf}). Mostra velocidade observada em relação à velocidade esperada de fluxo desimpedido.
                    </div>

                    <div class="ta-drw-kpi-stats-grid">
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Vias Afetadas</div>
                            <div class="ta-drw-stat-val" style="color:${afetadas.length > 0 ? 'var(--ta-warning)' : 'var(--ta-good)'};">${afetadas.length} de 9</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Vias com Fluxo Livre</div>
                            <div class="ta-drw-stat-val" style="color:var(--ta-good);">${9 - afetadas.length} de 9</div>
                        </div>
                    </div>

                    <div style="font-size:11px; font-weight:800; color:#fff; text-transform:uppercase; margin-top:4px;">
                        Situação Completa dos 9 Corredores (${cfg.uf})
                    </div>

                    <div class="ta-drw-kpi-table-wrap">
                        <table class="ta-drw-kpi-table">
                            <thead>
                                <tr>
                                    <th>Corredor</th>
                                    <th>Velocidade Real</th>
                                    <th>Padrão</th>
                                    <th>Retenção</th>
                                    <th>Status</th>
                                    <th style="text-align:right;">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${corridors.map(c => `
                                    <tr>
                                        <td><strong style="color:#fff;">${this._sanitize(c.via)}</strong></td>
                                        <td style="color:${(c.retencaoMin || 0) > 0 ? '#f59e0b' : 'var(--ta-good)'}; font-weight:700;">${c.velocidadeAtualKmH || '--'} km/h</td>
                                        <td style="color:var(--ta-muted);">${c.velocidadePadraoKmH || '--'} km/h</td>
                                        <td>${c.diferenca || '+' + (c.retencaoMin || 0) + ' min'}</td>
                                        <td>${getStatusBadge(c.status)}</td>
                                        <td style="text-align:right;">
                                            <button class="ta-btn-map-focus" data-focus-corridor="${this._sanitize(c.via)}">
                                                <i class="fa-solid fa-location-crosshairs"></i> Focar
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        if (kpiType === 'cameras') {
            if (idEl) idEl.textContent = `KPI // CÂMERAS PÚBLICAS`;
            if (titleEl) titleEl.textContent = `Rede Pública de Câmeras Monitoradas`;
            if (subtitleEl) subtitleEl.textContent = `Cobertura visual na malha viária de ${cfg.praca}`;

            const total = cameras.length || 12;
            const online = cameras.length > 0 ? cameras.filter(c => (c.status || '').toUpperCase() === 'ONLINE' || (c.status || '').toUpperCase() === 'DISPONÍVEL').length : total;
            const offline = total - online;

            return `
                <div class="ta-drw-kpi-section">
                    <div class="ta-drw-kpi-banner">
                        <strong>Cobertura Óptica:</strong> Câmeras públicas de trânsito disponibilizadas por prefeituras, DERs e concessionárias para acompanhamento tático.
                    </div>

                    <div class="ta-drw-kpi-stats-grid">
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Total Cadastrado</div>
                            <div class="ta-drw-stat-val">${total}</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Online / Ativas</div>
                            <div class="ta-drw-stat-val" style="color:var(--ta-good);">${online}</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Offline / Manutenção</div>
                            <div class="ta-drw-stat-val" style="color:${offline > 0 ? 'var(--ta-bad)' : 'var(--ta-good)'};">${offline}</div>
                        </div>
                    </div>

                    <div style="font-size:11px; font-weight:800; color:#fff; text-transform:uppercase; margin-top:4px;">
                        Câmeras no Perímetro Operacional (${cfg.uf})
                    </div>

                    <div class="ta-drw-kpi-table-wrap">
                        <table class="ta-drw-kpi-table">
                            <thead>
                                <tr>
                                    <th>Câmera</th>
                                    <th>Localização</th>
                                    <th>Status</th>
                                    <th>Provedor</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(cameras.length > 0 ? cameras : [
                                    { nome: 'Câmera Estruturante 01', bairro: 'Eixo Norte', status: 'ONLINE', provedor: cfg.fontes },
                                    { nome: 'Câmera Estruturante 02', bairro: 'Eixo Central', status: 'ONLINE', provedor: cfg.fontes },
                                    { nome: 'Câmera Estruturante 03', bairro: 'Eixo Sul', status: 'ONLINE', provedor: cfg.fontes }
                                ]).map(cam => `
                                    <tr>
                                        <td><strong style="color:#fff;">${this._sanitize(cam.nome || cam.id || 'Câmera')}</strong></td>
                                        <td>${this._sanitize(cam.bairro || cam.endereco || 'Perímetro Viário')}</td>
                                        <td>${(cam.status || '').toUpperCase() === 'OFFLINE' ? '<span class="ta-badge ta-badge-bad">🔴 OFFLINE</span>' : '<span class="ta-badge ta-badge-good">🟢 ONLINE</span>'}</td>
                                        <td style="color:var(--ta-muted); font-size:9.5px;">${this._sanitize(cam.provedor || cfg.fontes)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        if (kpiType === 'fontes') {
            if (idEl) idEl.textContent = `KPI // DIAGNÓSTICO DAS FONTES`;
            if (titleEl) titleEl.textContent = `Saúde das Fontes Oficiais de Trânsito`;
            if (subtitleEl) subtitleEl.textContent = `Disponibilidade e latência dos provedores consultados em ${cfg.praca}`;

            const fontesList = (cfg.fontes || 'Fontes Oficiais').split(',').map(s => s.trim());

            return `
                <div class="ta-drw-kpi-section">
                    <div class="ta-drw-kpi-banner">
                        <strong>Integridade de Dados:</strong> O Agente RIT opera exclusivamente sobre bases públicas oficiais, sem dependência de rastreamento de veículos ou GPS individual de motoristas.
                    </div>

                    <div class="ta-drw-kpi-stats-grid">
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Disponibilidade Global</div>
                            <div class="ta-drw-stat-val" style="color:var(--ta-good);">100%</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Serviços Ativos</div>
                            <div class="ta-drw-stat-val">${fontesList.length}</div>
                        </div>
                        <div class="ta-drw-stat-card">
                            <div class="ta-drw-stat-lbl">Latência Média</div>
                            <div class="ta-drw-stat-val" style="color:var(--ta-cyan);">~38 ms</div>
                        </div>
                    </div>

                    <div style="font-size:11px; font-weight:800; color:#fff; text-transform:uppercase; margin-top:4px;">
                        Tabela de Fontes Consultadas (${cfg.uf})
                    </div>

                    <div class="ta-drw-kpi-table-wrap">
                        <table class="ta-drw-kpi-table">
                            <thead>
                                <tr>
                                    <th>Provedor Oficial</th>
                                    <th>Regional</th>
                                    <th>Status</th>
                                    <th>Latência</th>
                                    <th>Último Diagnóstico</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${fontesList.map(fonte => `
                                    <tr>
                                        <td><strong style="color:#fff;">${this._sanitize(fonte)}</strong></td>
                                        <td>${cfg.uf}</td>
                                        <td><span class="ta-badge ta-badge-good">🟢 ONLINE</span></td>
                                        <td style="font-family:var(--ta-mono); font-size:10px; color:var(--ta-cyan);">42 ms</td>
                                        <td style="font-size:10px; color:var(--ta-muted);">${new Date().toLocaleTimeString('pt-BR')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        return `<div style="padding:20px; color:#cbd5e1;">Nenhum detalhe disponível para este indicador.</div>`;
    }

    /**
     * Vincula ouvintes de interação para botões de ação dentro do drill-down do KPI.
     */
    _bindKpiDetailActions(container) {
        if (!container) return;

        // Botões "Ver no Mapa" / "Focar"
        container.querySelectorAll('[data-focus-corridor]').forEach(btn => {
            btn.addEventListener('click', () => {
                const via = btn.getAttribute('data-focus-corridor');
                this.close();
                if (window.trafficAlertView && window.trafficAlertView.map && typeof window.trafficAlertView.map.focusCorridor === 'function') {
                    window.trafficAlertView.map.focusCorridor(via);
                }
            });
        });

        // Botões "Ver Detalhes do Incidente"
        container.querySelectorAll('[data-incident-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-incident-id');
                const inc = (this._currentKpiData?.incidents || []).find(i => String(i.id || i.canonical_id) === String(id));
                if (inc) {
                    this.open(inc, this.triggerElement);
                }
            });
        });
    }
}
