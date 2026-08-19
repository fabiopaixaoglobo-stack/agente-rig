import { trafficCameraSources } from './traffic-camera-data.js?v=4.0.0';
import { escapeHtml } from './utils.js';

export class CamerasRJ {
    constructor() {
        this.camerasData = {};
        this.currentRegional = 'RJ';
        this.bairroSelect = document.getElementById('camera-bairro');
        this.cameraSelect = document.getElementById('camera-id');
        this.frameContainer = document.getElementById('camera-frame-container');
        this.infoText = document.getElementById('camera-info');

        if (this.bairroSelect && this.cameraSelect && this.frameContainer) {
            this.init();
        }
    }

    async init() {
        try {
            // Carrega o banco completo do Rio de Janeiro
            const response = await fetch('/data/cameras.json');
            if (response.ok) {
                this.camerasData = await response.json();
            }
        } catch (error) {
            console.warn('[CAMERAS] Não foi possível carregar /data/cameras.json, usando catálogo:', error);
            this.camerasData = {};
        }

        // Obtém a regional ativa salva ou default RJ
        const savedRegional = localStorage.getItem('rit_selected_regional') || document.getElementById('seletor-regiao')?.value || 'RJ';
        this.setRegional(savedRegional);
        this.bindEvents();
    }

    setRegional(regional) {
        this.currentRegional = regional || 'RJ';
        this.clearPlayer();
        this.populateBairros();
    }

    populateBairros() {
        if (!this.bairroSelect) return;
        this.bairroSelect.innerHTML = '<option value="">Selecione o Bairro / Via...</option>';
        this.cameraSelect.innerHTML = '<option value="">Selecione a Câmera / Fonte...</option>';
        this.cameraSelect.disabled = true;

        if (this.currentRegional === 'RJ') {
            // Adiciona Portais e Redundâncias Prioritárias do Rio primeiro
            const optGroupDestaques = document.createElement('optgroup');
            optGroupDestaques.label = '⭐ DESTAQUES & PORTAIS OFICIAIS (RJ)';
            
            const rjSources = trafficCameraSources.RJ?.sources || [];
            rjSources.forEach(src => {
                const opt = document.createElement('option');
                opt.value = `SRC_${src.id}`;
                opt.textContent = `[PORTAL] ${src.bairro} - ${src.referencia}`;
                optGroupDestaques.appendChild(opt);
            });
            this.bairroSelect.appendChild(optGroupDestaques);

            // Adiciona todos os bairros do Rio de Janeiro em ordem alfabética
            const bairrosRJ = Object.keys(this.camerasData).sort((a, b) => a.localeCompare(b, 'pt-BR'));
            if (bairrosRJ.length > 0) {
                const optGroupBairros = document.createElement('optgroup');
                optGroupBairros.label = 'BAIRROS DO RIO DE JANEIRO';
                bairrosRJ.forEach(bairro => {
                    const opt = document.createElement('option');
                    opt.value = bairro;
                    opt.textContent = bairro;
                    optGroupBairros.appendChild(opt);
                });
                this.bairroSelect.appendChild(optGroupBairros);
            }
        } else {
            // Regionais: SP, BH, BSB, REC
            const regData = trafficCameraSources[this.currentRegional];
            if (regData && Array.isArray(regData.sources)) {
                regData.sources.forEach(src => {
                    const opt = document.createElement('option');
                    opt.value = `SRC_${src.id}`;
                    opt.textContent = `${src.bairro} - ${src.referencia}`;
                    this.bairroSelect.appendChild(opt);
                });
            }
        }

        if (this.infoText) {
            const regLabel = trafficCameraSources[this.currentRegional]?.label || this.currentRegional;
            this.infoText.textContent = `Regional selecionada: ${regLabel}. Selecione um ponto acima.`;
        }
    }

    bindEvents() {
        this.bairroSelect.addEventListener('change', (e) => {
            const selectedVal = e.target.value;
            this.populateCameras(selectedVal);
        });

        this.cameraSelect.addEventListener('change', (e) => {
            const selectedVal = e.target.value;
            if (selectedVal) {
                this.playCamera(selectedVal);
            } else {
                this.clearPlayer();
            }
        });
    }

    populateCameras(bairroOuSource) {
        this.cameraSelect.innerHTML = '<option value="">Selecione a Câmera / Fonte...</option>';
        this.clearPlayer();

        if (!bairroOuSource) {
            this.cameraSelect.disabled = true;
            return;
        }

        // Se for uma fonte estruturada do catálogo (SRC_...)
        if (bairroOuSource.startsWith('SRC_')) {
            const sourceId = bairroOuSource.replace('SRC_', '');
            const regData = trafficCameraSources[this.currentRegional];
            const src = regData?.sources?.find(s => s.id === sourceId);

            if (src) {
                const opt = document.createElement('option');
                opt.value = `SRC_${src.id}`;
                opt.textContent = `${src.nome} (${src.referencia})`;
                this.cameraSelect.appendChild(opt);
                this.cameraSelect.disabled = false;
                this.cameraSelect.value = `SRC_${src.id}`;
                this.playCamera(`SRC_${src.id}`);
                return;
            }
        }

        // Se for um bairro tradicional do Rio (cameras.json)
        const camerasList = this.camerasData[bairroOuSource] || [];
        const sortedCameras = [...camerasList].sort((a, b) => (a.caption || '').localeCompare(b.caption || '', 'pt-BR'));

        sortedCameras.forEach(cam => {
            const opt = document.createElement('option');
            opt.value = `CAM_${cam.id}`;
            opt.textContent = cam.caption || `Câmera ${cam.id}`;
            this.cameraSelect.appendChild(opt);
        });

        this.cameraSelect.disabled = false;
        if (this.infoText) {
            this.infoText.textContent = `${sortedCameras.length} câmera(s) disponível(is) no bairro ${bairroOuSource}.`;
        }
    }

    playCamera(cameraIdentifier) {
        if (!this.frameContainer) return;

        // Caso 1: Fonte estruturada do catálogo
        if (cameraIdentifier.startsWith('SRC_')) {
            const sourceId = cameraIdentifier.replace('SRC_', '');
            const regData = trafficCameraSources[this.currentRegional];
            const src = regData?.sources?.find(s => s.id === sourceId);

            if (!src) {
                this.clearPlayer();
                return;
            }

            if (this.infoText) {
                this.infoText.innerHTML = `<strong>Ao vivo:</strong> ${escapeHtml(src.nome)} (${escapeHtml(src.bairro)})`;
            }

            if (src.suportaIframe && src.embedUrl) {
                this.frameContainer.innerHTML = `
                    <iframe 
                        src="${src.embedUrl}" 
                        width="100%" 
                        height="100%" 
                        style="border:none;" 
                        allowfullscreen 
                        allow="autoplay; encrypted-media">
                    </iframe>
                `;
            } else {
                this.frameContainer.innerHTML = `
                    <div style="padding: 30px; text-align: center; color: #fff; max-width: 500px;">
                        <div style="font-size: 38px; color: var(--accent); margin-bottom: 15px;"><i class="fa-solid fa-satellite-dish"></i></div>
                        <h3 style="color: var(--accent); margin-bottom: 10px; font-size: 16px;">${escapeHtml(src.nome)}</h3>
                        <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 20px;">
                            ${escapeHtml(src.observacao || 'Transmissão pública operacional com proteção contra incorporação em frames.')}
                        </p>
                        <a href="${src.url}" target="_blank" rel="noopener noreferrer" class="btn btnPrimary" style="display: inline-flex; align-items: center; gap: 8px; text-decoration: none; padding: 10px 20px; font-weight: 800; font-size: 12px;">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> ABRIR PORTAL OFICIAL
                        </a>
                    </div>
                `;
            }
            return;
        }

        // Caso 2: Câmera individual do Rio (CamerasRJ ID)
        const cameraId = cameraIdentifier.replace('CAM_', '');
        let caption = "Câmera " + cameraId;
        const bairro = this.bairroSelect.value;
        if (bairro && this.camerasData[bairro]) {
            const camInfo = this.camerasData[bairro].find(c => String(c.id) === String(cameraId));
            if (camInfo) caption = camInfo.caption;
        }

        if (this.infoText) {
            this.infoText.innerHTML = `<strong>Ao vivo:</strong> ${escapeHtml(caption)}`;
        }

        const url = `https://www.camerasrj.com.br/camera/${encodeURIComponent(cameraId)}/`;
        
        this.frameContainer.innerHTML = `
            <iframe 
                src="${url}" 
                width="100%" 
                height="100%" 
                style="border:none;" 
                allowfullscreen 
                allow="autoplay; encrypted-media">
            </iframe>
        `;
    }

    clearPlayer() {
        if (this.infoText) {
            const bairro = this.bairroSelect?.value;
            if (bairro && this.camerasData[bairro]) {
                this.infoText.textContent = `${this.camerasData[bairro].length} câmera(s) disponível(is) no bairro ${bairro}.`;
            } else {
                this.infoText.textContent = 'Nenhuma câmera selecionada.';
            }
        }
        if (this.frameContainer) {
            this.frameContainer.innerHTML = '<div style="color: #666; font-size: 14px;">Selecione uma câmera ou fonte ao lado para visualizar.</div>';
        }
    }
}
