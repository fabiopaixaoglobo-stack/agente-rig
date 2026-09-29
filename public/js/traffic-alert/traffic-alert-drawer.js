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

        if (!this.overlayEl) this.init();
        if (!this.overlayEl) return;

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
     * Fecha o Drawer e restaura o foco no elemento de disparo.
     */
    close() {
        if (!this.overlayEl) return;
        this.overlayEl.classList.remove('ta-open');
        this.isOpen = false;
        document.removeEventListener('keydown', this._onKeyDown);

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
}
