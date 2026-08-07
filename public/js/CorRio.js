export class CorRio {
    constructor() {
        this.elEstagio = document.getElementById('cor-estagio');
        this.elCalor = document.getElementById('cor-calor');
        this.isRefreshing = false;
        this.init();
    }

    init() {
        this.fetchStatusOperacional();
        // Atualiza a cada 5 minutos automaticamente
        setInterval(() => this.fetchStatusOperacional(), 300000);
    }

    async fetchWithTimeout(resource, options = {}) {
        const { timeout = 10000 } = options;
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

    async fetchStatusOperacional(force = false) {
        try {
            const response = await this.fetchWithTimeout(`/api/status-operacional?force=${force}`);
            if (response.ok) {
                const data = await response.json();
                
                // 1. Atualizar Estágio
                if (this.elEstagio && data.estagio) {
                    this.elEstagio.style.display = 'inline-block';
                    this.elEstagio.style.background = data.estagio.cor || '#228d46';
                    this.elEstagio.innerHTML = `<span style="font-weight:900;">${(data.estagio.estagio || 'ESTÁGIO').toUpperCase()}</span>`;
                    
                    // Atualiza o pill de Status Operacional da sidebar
                    const sidebarPill = document.getElementById('status-operacional-pill');
                    if (sidebarPill) {
                        sidebarPill.textContent = (data.estagio.estagio || 'NORMAL').toUpperCase();
                        sidebarPill.style.background = data.estagio.cor || 'var(--good)';
                        sidebarPill.style.color = '#000';
                    }
                }

                // 2. Atualizar Nível de Calor
                if (this.elCalor && data.calor) {
                    let text = data.calor; // Ex: "calor 1"
                    let corBackground = '#0a4b85';
                    let calorNum = text.replace(/[^0-9]/g, '');
                    if (calorNum === '2') corBackground = '#f2d024';
                    if (calorNum === '3') corBackground = '#f39200';
                    if (calorNum === '4') corBackground = '#e30613';
                    if (calorNum === '5') corBackground = '#8e1f24';

                    this.elCalor.style.display = 'inline-block';
                    this.elCalor.style.background = corBackground;
                    
                    if (calorNum === '2') {
                        this.elCalor.style.color = '#000';
                    } else {
                        this.elCalor.style.color = '#fff';
                    }

                    this.elCalor.innerHTML = `<span style="font-weight:900;">${text.toUpperCase()}</span>`;
                }
            }
        } catch (error) {
            console.warn('Falha ao obter status operacional do COR:', error.message);
        }
    }

    async manualRefresh(btn) {
        if (this.isRefreshing) return;
        this.isRefreshing = true;
        
        // Efeito visual de carregamento (opacidade de 0.5)
        const originalOpacity = btn.style.opacity || '1';
        btn.style.opacity = '0.5';
        
        try {
            await this.fetchStatusOperacional(true);
            btn.style.opacity = originalOpacity;
            
            // Exibir toast rápido de confirmação
            import('./utils.js').then(m => {
                m.showToast('✅ Status COR.RIO atualizado!', 'success', 2000);
            });
        } catch (err) {
            btn.style.opacity = originalOpacity;
        } finally {
            this.isRefreshing = false;
        }
    }
}
