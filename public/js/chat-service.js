import { CONFIG } from './config.js';
import { escapeHtml, showToast } from './utils.js';

export class ChatService {
    constructor(containerId, inputId, buttonId) {
        this.container = document.getElementById(containerId);
        this.input = document.getElementById(inputId);
        this.button = document.getElementById(buttonId);
        this.contexto = 'geral';

        if (this.button && this.input) {
            this.button.addEventListener('click', () => this.sendMessage());
            this.input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }
    }

    setContext(newContext) {
        this.contexto = newContext;
        const labels = {
            norma: 'NORMA',
            'contrato-cargas': 'CONTRATO CARGAS',
            'contrato-pessoas': 'CONTRATO PESSOAS',
        };
        if (this.container) {
            this.addMessage(
                'bot',
                `<i>Contexto alterado para: <b>${escapeHtml(labels[newContext] || 'GERAL')}</b>.</i>`
            );
        }
    }

    addMessage(type, text, id = null) {
        if (!this.container) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${type}`;
        if (id) msgDiv.id = id;
        msgDiv.innerHTML = text;
        this.container.appendChild(msgDiv);
        this.container.scrollTop = this.container.scrollHeight;
    }

    async sendMessage() {
        if (!this.input || !this.container) {
            showToast('Chat indisponível (elementos da página em falta).', 'error');
            return;
        }

        const text = this.input.value.trim();
        if (!text) return;

        this.addMessage('user', escapeHtml(text));
        this.input.value = '';

        const botMsgId = `bot-${Date.now()}`;
        this.addMessage('bot', '<i>Analisando base normativa...</i>', botMsgId);

        try {
            const response = await fetch(CONFIG.API_ENDPOINTS.CHAT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, contexto: this.contexto }),
            });
            let data;
            try {
                data = await response.json();
            } catch {
                data = {};
            }
            const botMsgEl = document.getElementById(botMsgId);
            if (botMsgEl) {
                if (response.status === 429) {
                    const errText = data.error || 'Limite de mensagens por minuto.';
                    botMsgEl.innerHTML = `<b>Consultor RIT:</b><br>${escapeHtml(errText)}`;
                    showToast(errText, 'error');
                } else if (!response.ok) {
                    const errText = data.error || data.message || `Erro HTTP ${response.status}`;
                    botMsgEl.innerHTML = `<b>Consultor RIT:</b><br>${escapeHtml(errText).replace(/\n/g, '<br>')}`;
                    showToast('Erro ao contactar o consultor.', 'error');
                } else if (typeof data.response === 'string') {
                    const safe = escapeHtml(data.response).replace(/\n/g, '<br>');
                    botMsgEl.innerHTML = `<b>Consultor RIT:</b><br>${safe}`;
                } else {
                    botMsgEl.innerHTML =
                        '<b>Consultor RIT:</b><br>Resposta inesperada do servidor. Tente novamente.';
                    showToast('Resposta inválida do servidor.', 'error');
                }
            }
        } catch (error) {
            const botMsgEl = document.getElementById(botMsgId);
            if (botMsgEl) botMsgEl.innerHTML = 'Erro de conexão com o servidor.';
            showToast('Erro de rede ao enviar a mensagem.', 'error');
        }
        if (this.container) this.container.scrollTop = this.container.scrollHeight;
    }

    clear() {
        if (!this.container) return;
        this.container.innerHTML = `<div class="msg bot">Histórico limpo. Como posso ajudar agora?</div>`;
        this.contexto = 'geral';
    }
}
