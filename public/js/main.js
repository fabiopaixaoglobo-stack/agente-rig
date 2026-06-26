import { MapService } from './map-service.js';
import { ChatService } from './chat-service.js';
import { DataService } from './data-service.js';
import { UiController } from './ui-controller.js';
import { MonitoramentoGrupos } from './MonitoramentoGrupos.js';
import { CamerasRJ } from './CamerasRJ.js';
import { CorRio } from './CorRio.js';

document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 Agente RIG v3.5.1 - Inicializando módulos...");
    try {
        const mainMap = new MapService("map");
        const plannerMap = new MapService("mapPlanner");
        const transitoMap = new MapService("mapTransito");
        const chat = new ChatService("chat", "pergunta", "btn-enviar");
        const data = new DataService();

        const ui = new UiController(mainMap, plannerMap, transitoMap, chat, data);
        const whatsapp = new MonitoramentoGrupos("btn-open-whatsapp");
        const camerasRJ = new CamerasRJ();
        const corRio = new CorRio();

        // Monitoramento da Saúde do Banco de Dados para Administrador
        const checkDbHealth = async () => {
            try {
                const res = await fetch('/api/health');
                const health = await res.json();
                const dbStatusEl = document.getElementById('db-status');
                
                if (health.database === 'online') {
                    if (dbStatusEl) {
                        dbStatusEl.innerHTML = `<span class="dot" id="db-status-dot" style="background:var(--good); box-shadow:0 0 8px var(--good);"></span> DB ONLINE`;
                        dbStatusEl.title = `Latência: ${health.latency_ms}ms | Conexões: ${health.active_connections !== -1 ? health.active_connections : 'Ativa'}`;
                    }
                } else {
                    if (dbStatusEl) {
                        dbStatusEl.innerHTML = `<span class="dot" id="db-status-dot" style="background:var(--bad); box-shadow:0 0 8px var(--bad);"></span> DB OFFLINE`;
                        dbStatusEl.title = `Erro: ${health.error}`;
                    }
                    showToast(`⚠️ ALERTA DE CONEXÃO: O Banco de Dados PostgreSQL está OFFLINE!`, "error");
                }
            } catch (err) {
                console.error("Erro no check de saúde do banco:", err);
            }
        };
        
        checkDbHealth();
        setInterval(checkDbHealth, 30000); // Executa a cada 30s

        window.exibirInfoDB = async () => {
            try {
                const res = await fetch('/api/health');
                const health = await res.json();
                if (health.database === 'online') {
                    alert(`✅ BANCO DE DADOS CONECTADO\n\nStatus: Saudável\nLatência do Servidor ao DB: ${health.latency_ms}ms\nConexões Ativas: ${health.active_connections !== -1 ? health.active_connections : 'Sem permissão de admin'}\nServidor: Render Cloud PostgreSQL`);
                } else {
                    alert(`❌ BANCO DE DADOS FORA DO AR (OFFLINE)\n\nErro:\n${health.error}\n\nSintomas de Bloqueio:\n${health.symptoms.map(s => `- ${s}`).join('\n')}\n\nPossíveis Causas e Soluções:\n${health.sugestoes.map(s => `- ${s}`).join('\n')}`);
                }
            } catch (err) {
                alert(`⚠️ Erro ao obter dados de diagnóstico do banco: ${err.message}`);
            }
        };

        window.AGENTE_RIG = { ui, mainMap, plannerMap, chat, data, whatsapp, camerasRJ, corRio };

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
