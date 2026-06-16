export class CamerasRJ {
    constructor() {
        this.camerasData = {};
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
            // Load the cameras JSON from the local data folder
            const response = await fetch('/data/cameras.json');
            if (!response.ok) throw new Error('Falha ao carregar dados de câmeras');
            this.camerasData = await response.json();
            this.populateBairros();
            this.bindEvents();
        } catch (error) {
            console.error('CamerasRJ Init Error:', error);
            if (this.infoText) {
                this.infoText.innerHTML = `<span style="color:var(--bad)">Erro ao carregar banco de câmeras.</span>`;
            }
        }
    }

    populateBairros() {
        // Sort bairros alphabetically
        const bairros = Object.keys(this.camerasData).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        
        bairros.forEach(bairro => {
            const option = document.createElement('option');
            option.value = bairro;
            option.textContent = bairro;
            this.bairroSelect.appendChild(option);
        });
    }

    bindEvents() {
        this.bairroSelect.addEventListener('change', (e) => {
            const selectedBairro = e.target.value;
            this.populateCameras(selectedBairro);
        });

        this.cameraSelect.addEventListener('change', (e) => {
            const cameraId = e.target.value;
            if (cameraId) {
                this.playCamera(cameraId);
            } else {
                this.clearPlayer();
            }
        });
    }

    populateCameras(bairro) {
        // Clear previous options except the first placeholder
        this.cameraSelect.innerHTML = '<option value="">Selecione a Câmera...</option>';
        this.clearPlayer();
        
        if (!bairro) {
            this.cameraSelect.disabled = true;
            return;
        }

        const camerasList = this.camerasData[bairro] || [];
        
        // Sort cameras by caption alphabetically
        const sortedCameras = [...camerasList].sort((a, b) => a.caption.localeCompare(b.caption, 'pt-BR'));

        sortedCameras.forEach(cam => {
            const option = document.createElement('option');
            option.value = cam.id;
            option.textContent = cam.caption;
            this.cameraSelect.appendChild(option);
        });

        this.cameraSelect.disabled = false;
        if (this.infoText) {
            this.infoText.textContent = `${sortedCameras.length} câmera(s) disponível(is) no bairro ${bairro}.`;
        }
    }

    playCamera(cameraId) {
        // Find the camera caption for logging/info
        let caption = "Câmera " + cameraId;
        const bairro = this.bairroSelect.value;
        if (bairro && this.camerasData[bairro]) {
            const camInfo = this.camerasData[bairro].find(c => String(c.id) === String(cameraId));
            if (camInfo) caption = camInfo.caption;
        }

        if (this.infoText) {
            this.infoText.innerHTML = `<strong>Ao vivo:</strong> ${caption}`;
        }

        // Construct the iframe for the camera player
        // We use the exact same endpoint the original site uses
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
            const bairro = this.bairroSelect.value;
            if (bairro && this.camerasData[bairro]) {
                this.infoText.textContent = `${this.camerasData[bairro].length} câmera(s) disponível(is) no bairro ${bairro}.`;
            } else {
                this.infoText.textContent = 'Nenhuma câmera selecionada.';
            }
        }
        this.frameContainer.innerHTML = '<div style="color: #666; font-size: 14px;">Selecione uma câmera ao lado para visualizar.</div>';
    }
}
