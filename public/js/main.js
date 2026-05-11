import { MapService } from './map-service.js';
import { ChatService } from './chat-service.js';
import { DataService } from './data-service.js';
import { UiController } from './ui-controller.js';

document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 Agente RIG v3.5 - Inicializando módulos...");
    
    const mainMap = new MapService("map");
    const plannerMap = new MapService("mapPlanner");
    const chat = new ChatService("chat", "pergunta", "btn-enviar");
    const data = new DataService();
    
    // Controlador de UI que coordena os serviços
    const ui = new UiController(mainMap, plannerMap, chat, data);
    
    window.AGENTE_RIG = { ui, mainMap, plannerMap, chat, data };

    // Retrocompatibilidade com atributos onclick no HTML (normas / modal)
    window.setContext = (ctx) => chat.setContext(ctx);
    window.limparChat = () => chat.clear();
    window.fecharGuiaVisual = () => {
        const modal = document.getElementById('modalGuia');
        if (modal) modal.style.display = 'none';
    };
});
