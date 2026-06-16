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

    async fetchEstagio() {
        if (!this.elEstagio) return;
        try {
            // Using a CORS proxy approach or direct fetch. Since it's a public API without tight CORS in the browser,
            // direct fetch should work. If it fails, the server proxy route can be created later, but we will try direct first.
            const response = await fetch('https://aplicativo.cocr.com.br/estagio_api');
            if (response.ok) {
                const data = await response.json();
                this.elEstagio.style.display = 'inline-block';
                this.elEstagio.style.background = data.cor || '#228d46';
                this.elEstagio.innerHTML = `<span style="font-weight:900;">${(data.estagio || 'ESTÁGIO').toUpperCase()}</span>`;
            }
        } catch (error) {
            console.error('Falha ao obter estágio do COR:', error);
        }
    }

    async fetchCalor() {
        if (!this.elCalor) return;
        try {
            const response = await fetch('https://aplicativo.cocr.com.br/calor_api');
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
            console.error('Falha ao obter calor do COR:', error);
        }
    }
}
