import { MapService } from './map-service.js';
import { ChatService } from './chat-service.js';
import { DataService } from './data-service.js';
import { UiController } from './ui-controller.js';

document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 Agente RIG v3.5.1 - Inicializando módulos...");
    try {
        const mainMap = new MapService("map");
        const plannerMap = new MapService("mapPlanner");
        const chat = new ChatService("chat", "pergunta", "btn-enviar");
        const data = new DataService();

        const ui = new UiController(mainMap, plannerMap, chat, data);

        window.AGENTE_RIG = { ui, mainMap, plannerMap, chat, data };

        window.setContext = (ctx) => chat.setContext(ctx);
        window.limparChat = () => chat.clear();
        window.fecharGuiaVisual = () => {
            const modal = document.getElementById("modalGuia");
            if (modal) modal.style.display = "none";
        };
    } catch (e) {
        console.error("Falha ao iniciar Agente RIG:", e);
        document.body.insertAdjacentHTML(
            "afterbegin",
            `<div style="padding:16px;background:#3d0a0a;color:#fff;font-family:sans-serif;">
                Erro ao iniciar a aplicação. Recarregue a página ou contacte o suporte.<br/>
                <small>${String(e && e.message ? e.message : e)}</small>
            </div>`
        );
    }
});
