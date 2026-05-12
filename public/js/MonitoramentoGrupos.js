export class MonitoramentoGrupos {
    constructor(buttonId) {
        this.button = document.getElementById(buttonId);
        this.init();
    }

    init() {
        if (this.button) {
            this.button.addEventListener('click', () => {
                this.openWhatsApp();
            });
        }
    }

    openWhatsApp() {
        // Abre o WhatsApp Web em uma nova aba segura
        window.open("https://web.whatsapp.com", "_blank", "noopener,noreferrer");
    }
}
