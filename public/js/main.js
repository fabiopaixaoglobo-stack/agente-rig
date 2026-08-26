import { CONFIG } from './config.js?v=4.0.0';
import { MapService } from './map-service.js?v=4.0.0';
import { DataService } from './data-service.js?v=4.0.0';
import { UiController } from './ui-controller.js?v=4.0.0';
import { MonitoramentoGrupos } from './MonitoramentoGrupos.js?v=4.0.0';
import { CamerasRJ } from './CamerasRJ.js?v=4.0.0';
import { PainelTransitoIntegrado } from './PainelTransitoIntegrado.js?v=4.0.0';
import { CorRio } from './CorRio.js?v=4.0.0';

document.addEventListener("DOMContentLoaded", () => {
    console.info("[RIT DEBUG] build versão sidebar-click-fix carregado");
    console.info("[RIT LAYOUT] layout responsivo carregado");
    console.log("🚀 Agente RIG v4.0.0 - Inicializando módulos...");
    try {
        const mainMap = (CONFIG.FEATURE_MONITORAMENTO && document.getElementById("map")) ? new MapService("map") : null;
        const plannerMap = document.getElementById("mapPlanner") ? new MapService("mapPlanner") : null;
        const transitoMap = document.getElementById("mapTransito") ? new MapService("mapTransito") : null;
        const data = new DataService();

        const corRio = new CorRio();
        window.corRio = corRio;
        
        const btnWhatsapp = document.getElementById("btn-open-whatsapp");
        const whatsapp = btnWhatsapp ? new MonitoramentoGrupos("btn-open-whatsapp") : null;
        
        const camerasRJ = new CamerasRJ();
        const painelCim = new PainelTransitoIntegrado();
        const ui = new UiController(mainMap, plannerMap, transitoMap, data, corRio, camerasRJ, painelCim);
        
        window.camerasRJ = camerasRJ;
        window.painelCim = painelCim;
        window.transitoMap = transitoMap;
        window.mainMap = mainMap;
        window.plannerMap = plannerMap;
        window.map = transitoMap?.map || mainMap?.map;
        window.uiController = ui;

        console.info(`[MapService Debug] mapTransito instanciado:`, !!transitoMap?.map, `Container offset:`, document.getElementById("mapTransito")?.offsetWidth, "x", document.getElementById("mapTransito")?.offsetHeight);

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

        const checkRobotHealth = async () => {
            try {
                const res = await fetch('/api/robot/status');
                const status = await res.json();
                const robotEl = document.getElementById('robot-status');
                
                if (robotEl) {
                    if (status.ok) {
                        robotEl.innerHTML = `<span class="dot" id="robot-status-dot" style="background:var(--good); box-shadow:0 0 8px var(--good);"></span> 🤖 ROBÔ: OK`;
                        robotEl.title = `Último diagnóstico: ${status.last_run ? new Date(status.last_run).toLocaleTimeString() : 'N/D'}`;
                    } else {
                        robotEl.innerHTML = `<span class="dot" id="robot-status-dot" style="background:var(--bad); box-shadow:0 0 8px var(--bad);"></span> 🤖 ROBÔ: FALHA`;
                        robotEl.title = `Erro identificado! Clique para ver detalhes.`;
                    }
                }
            } catch (err) {
                console.error("Erro no check de saúde do robô:", err);
            }
        };
        
        checkRobotHealth();
        setInterval(checkRobotHealth, 15000); // Executa a cada 15s

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

        window.exibirInfoRobo = async () => {
            try {
                const resRun = await fetch('/api/robot/run', { method: 'POST' });
                const status = await resRun.json();
                
                let detailsText = `🤖 RELATÓRIO DO ROBÔ DE TESTES OPERACIONAIS\n\n`;
                detailsText += `Status Geral: ${status.ok ? '✅ TUDO OK' : '⚠️ ALERTA DE FUNCIONALIDADE'}\n`;
                detailsText += `Última Execução: ${status.last_run ? new Date(status.last_run).toLocaleString() : 'N/D'}\n\n`;
                
                detailsText += `[Módulos Diagnosticados]:\n`;
                detailsText += `- Banco de Dados: [${status.details.database.status}] ${status.details.database.message}\n`;
                detailsText += `- Geocodificador (Nominatim): [${status.details.nominatim.status}] ${status.details.nominatim.message}\n`;
                detailsText += `- Roteador (OSRM): [${status.details.osrm.status}] ${status.details.osrm.message}\n`;
                detailsText += `- Integração OTT (Trânsito): [${status.details.ott_crawler.status}] ${status.details.ott_crawler.message}\n\n`;
                
                detailsText += `[Histórico Recente de Execuções]:\n`;
                detailsText += status.logs.slice(0, 5).join('\n');
                
                alert(detailsText);
                checkRobotHealth();
            } catch (err) {
                alert(`⚠️ Erro ao obter dados de diagnóstico do robô: ${err.message}`);
            }
        };

        window.AGENTE_RIG = { ui, mainMap, plannerMap, data, whatsapp, camerasRJ, corRio };

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
