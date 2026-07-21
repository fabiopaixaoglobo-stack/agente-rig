export class CorRio {
    constructor() {
        this.elEstagio = document.getElementById('cor-estagio');
        this.elCalor = document.getElementById('cor-calor');
        this.init();
    }

    init() {
        this.fetchEstagio();
        this.fetchCalor();
        // Update data every 10 minutes (600000 ms)
        setInterval(() => this.fetchEstagio(), 600000);
        setInterval(() => this.fetchCalor(), 600000);
    }

    async fetchWithTimeout(resource, options = {}) {
        const { timeout = 2500 } = options; // Timeout curto de 2.5 segundos
        
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(resource, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    }

    async fetchEstagio() {
        if (!this.elEstagio) return;
        try {
            const response = await this.fetchWithTimeout('https://aplicativo.cocr.com.br/estagio_api');
            if (response.ok) {
                const data = await response.json();
                this.elEstagio.style.display = 'inline-block';
                this.elEstagio.style.background = data.cor || '#228d46';
                this.elEstagio.innerHTML = `<span style="font-weight:900;">${(data.estagio || 'ESTÁGIO').toUpperCase()}</span>`;
            }
        } catch (error) {
            console.warn('Timeout ou falha ao obter estágio do COR:', error.message);
            // Oculta indicador silenciosamente em caso de erro para não poluir a interface
            this.elEstagio.style.display = 'none';
        }
    }

    async fetchCalor() {
        if (!this.elCalor) return;
        try {
            const response = await this.fetchWithTimeout('https://aplicativo.cocr.com.br/calor_api');
            if (response.ok) {
                const text = await response.text(); // e.g. "calor 2"
                
                // Color mapping logic based on calor levels
                let corBackground = '#0a4b85'; // Calor 1
                let calorNum = text.replace(/[^0-9]/g, '');
                if (calorNum === '2') corBackground = '#f2d024';
                if (calorNum === '3') corBackground = '#f39200';
                if (calorNum === '4') corBackground = '#e30613';
                if (calorNum === '5') corBackground = '#8e1f24';

                this.elCalor.style.display = 'inline-block';
                this.elCalor.style.background = corBackground;
                
                // Text color black if yellow
                if (calorNum === '2') {
                    this.elCalor.style.color = '#000';
                } else {
                    this.elCalor.style.color = '#fff';
                }

                this.elCalor.innerHTML = `<span style="font-weight:900;">${text.toUpperCase()}</span>`;
            }
        } catch (error) {
            console.warn('Timeout ou falha ao obter calor do COR:', error.message);
            // Oculta indicador silenciosamente em caso de erro para não poluir a interface
            this.elCalor.style.display = 'none';
        }
    }
}
