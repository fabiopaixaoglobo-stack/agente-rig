const { chromium } = require('@playwright/test');
const jwt = require('jsonwebtoken');

(async () => {
    console.log('🏁 Inicializando Teste de Conformidade de Produção...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Captura logs do console do navegador
    page.on('console', msg => console.log(`[BROWSER CONSOLE - ${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err.message}`));

    try {
        // 1. Gera o token JWT para bypassar a tela de login
        const JWT_SECRET = 'agente-rig-super-secret-2026';
        const token = jwt.sign({ id: 1, matricula: '68808', role: 'Administrador' }, JWT_SECRET);

        console.log('🔑 Injetando credenciais e token de sessão...');
        await page.goto('https://agente-rig-backend.onrender.com/');
        await page.evaluate(({ token }) => {
            localStorage.setItem('rig_token', token);
            localStorage.setItem('rig_user', JSON.stringify({ nome: 'Fábio', funcao: 'COORD OPERAÇÃO TRANSPORTES', matricula: '68808' }));
        }, { token });

        // 2. Navega para o Dashboard
        console.log('🌐 Navegando para o Dashboard...');
        await page.goto('https://agente-rig-backend.onrender.com/dashboard.html');
        await page.waitForLoadState('load');

        // 3. Aguarda os marcadores serem carregados no mapa
        console.log('🔍 Aguardando carregamento dos marcadores no mapa...');
        await page.waitForFunction(() => {
            return window.uiController && 
                   window.uiController.mapService && 
                   window.uiController.mapService.markersMap && 
                   window.uiController.mapService.markersMap.size > 0;
        }, { timeout: 25000 });

        // Obtém uma chave de marcador ativa
        const activeMarkerId = await page.evaluate(() => {
            const keys = Array.from(window.uiController.mapService.markersMap.keys());
            return keys.length > 0 ? keys[0] : null;
        });

        console.log(`📍 Marcador ativo selecionado para foco: ${activeMarkerId}`);

        // Clica no botão correspondente na sidebar
        const verNoMapaBtn = page.locator(`.btn-focus-map[data-marker-id="${activeMarkerId}"]`);
        await verNoMapaBtn.waitFor({ state: 'visible', timeout: 5000 });
        await verNoMapaBtn.click({ force: true });
        await page.waitForTimeout(3000); // Aguarda transição do popup

        // Captura imagem após clique no marcador
        await page.screenshot({ path: 'scratch/apos_clique_marcador.png' });

        // 4. Exibe o HTML do popup do Leaflet
        const popupContent = page.locator('.leaflet-popup-content');
        await popupContent.waitFor({ state: 'visible', timeout: 5000 });
        const html = await popupContent.innerHTML();
        console.log('============ POPUP HTML ============');
        console.log(html);
        console.log('====================================');

        // 5. Clica no botão "Solicitar"
        console.log('💬 Buscando o botão "Solicitar" no popup...');
        const btnSolicitar = page.locator('.leaflet-popup button:has-text("Solicitar")').first();
        await btnSolicitar.waitFor({ state: 'visible', timeout: 5000 });
        
        await btnSolicitar.click({ force: true });
        await page.waitForTimeout(2000);

        // Captura imagem após clique em solicitar
        await page.screenshot({ path: 'scratch/evidencia_modal_aberto.png' });

        // 6. Verifica se o modal de compliance é exibido
        console.log('⚖️ Verificando abertura do modal de compliance...');
        const modal = page.locator('#modalSolicitarPosicao');
        const isVisible = await modal.isVisible();
        if (isVisible) {
            console.log('✅ SUCESSO: O modal de compliance abriu corretamente em produção!');
        } else {
            console.error('❌ ERRO: O modal de compliance não apareceu!');
            await page.screenshot({ path: 'scratch/erro_excecao.png' });
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ EXCEÇÃO NO TESTE:', e);
        await page.screenshot({ path: 'scratch/erro_excecao.png' });
        process.exit(1);
    } finally {
        await browser.close();
        console.log('🏁 Teste finalizado.');
    }
})();
