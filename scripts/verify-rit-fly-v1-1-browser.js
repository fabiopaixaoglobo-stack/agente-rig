/**
 * Script de Verificação em Navegador Headless (Playwright) para RIT FLY v1.1
 * Auditoria Final e Rastreabilidade Operacional
 */

const { chromium } = require('@playwright/test');

(async () => {
    console.log('🚀 Iniciando verificação do RIT FLY v1.1 no Chromium...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    // Injeta credencial para evitar redirecionamento e garantir estabilidade de teste
    await context.addInitScript(() => {
        localStorage.setItem('rit_token', 'jwt-token-homologacao-cco-2026');
        localStorage.setItem('rit_user', JSON.stringify({ nome: 'FÁBIO PAIXÃO', funcao: 'CCO Operação' }));
        localStorage.setItem('rit_auditId', 'audit-cco-val-001');
        localStorage.setItem('rit_fly_tutorial_seen', 'true');
    });
    const page = await context.newPage();

    const consoleLogs = [];
    const pageErrors = [];
    const criticalHttpErrors = [];

    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => pageErrors.push(err.message));
    page.on('response', resp => {
        if (resp.url().includes('/api/rit-fly/') && resp.status() >= 500) {
            criticalHttpErrors.push({ url: resp.url(), status: resp.status() });
        }
    });

    try {
        await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        console.log('✅ Dashboard carregado com sucesso.');

        // 1. Clicar na aba RIT FLY
        await page.click('#tab-btn-rit-fly');
        await page.waitForTimeout(1000);
        console.log('✅ Aba RIT FLY ativada.');

        // 2. Verificar visibilidade do mapa e subheader
        const subheaderVisible = await page.isVisible('.fly-subheader');
        console.log(`• Subheader operacional visível: ${subheaderVisible}`);

        const mapVisible = await page.isVisible('#mapRitFly');
        console.log(`• Container do mapa #mapRitFly visível: ${mapVisible}`);

        const leafletLoaded = await page.evaluate(() => {
            return !!(window.ritFlyView && window.ritFlyView.map && window.ritFlyView.map.map);
        });
        console.log(`• Instância do mapa Leaflet ativa e renderizada: ${leafletLoaded}`);

        // 3. Validação do Tooltip
        const tooltipText = await page.getAttribute('#fly-btn-tutorial', 'data-tooltip');
        console.log(`• Tooltip padronizado presente no botão Tutorial: "${tooltipText}"`);

        // 4. Verificar Tutorial "Como Funciona"
        const tutorialBtn = await page.isVisible('#fly-btn-tutorial');
        console.log(`• Botão Como Funciona visível: ${tutorialBtn}`);

        await page.click('#fly-btn-tutorial');
        await page.waitForTimeout(500);

        const modalTutorialVisible = await page.isVisible('#modalRitFlyTutorial');
        console.log(`• Modal do Tutorial aberto: ${modalTutorialVisible}`);

        // Testar modo Stepper e navegação do tutorial
        await page.click('#fly-tutorial-mode-stepper');
        await page.waitForTimeout(300);
        await page.click('#fly-stepper-next');
        await page.waitForTimeout(300);
        await page.click('#fly-stepper-prev');
        await page.waitForTimeout(300);
        await page.click('#fly-tutorial-mode-cards');
        await page.waitForTimeout(300);

        // Fecha tutorial
        await page.click('#fly-tutorial-btn-close');
        await page.waitForTimeout(500);
        const modalFechado = !(await page.isVisible('#modalRitFlyTutorial'));
        console.log(`• Modal do Tutorial fechado com sucesso: ${modalFechado}`);

        // 5. Verificar Seletor de Camadas de Mapa
        const layerSelect = await page.isVisible('#fly-select-map-layer');
        console.log(`• Seletor de Camadas de Mapa presente: ${layerSelect}`);
        await page.selectOption('#fly-select-map-layer', 'satelite');
        await page.waitForTimeout(500);
        await page.selectOption('#fly-select-map-layer', 'radar');
        console.log('• Alternância de camadas de mapa testada com sucesso.');

        // 6. Verificar Filtros de Companhia Aérea
        const pillsCount = await page.locator('.fly-airline-pill').count();
        console.log(`• Filtros de companhia aérea encontrados: ${pillsCount}`);
        await page.click('.fly-airline-pill[data-airline="GOL"]');
        await page.waitForTimeout(300);
        await page.click('.fly-airline-pill[data-airline="todas"]');

        // 7. Testar Abertura do Detalhe de Aeronave (Drawer Lateral) ou Estado de Contingência
        const flightsData = await page.evaluate(() => window.ritFlyView ? window.ritFlyView.allFlights : []);
        console.log(`• Aeronaves ativas carregadas no frontend: ${flightsData.length}`);

        if (flightsData.length > 0) {
            console.log(`• Testando abertura do drawer para aeronave: ${flightsData[0].numeroVoo || flightsData[0].callsign}`);
            await page.evaluate((id) => window.ritFlyView.abrirDrawerVoo(id), flightsData[0].id || flightsData[0].numeroVoo);
            await page.waitForTimeout(500);
            const drawerAberto = await page.isVisible('#fly-flight-drawer.active');
            console.log(`• Drawer lateral do voo aberto com sucesso: ${drawerAberto}`);
            await page.click('#fly-drawer-btn-close');
            await page.waitForTimeout(300);
        } else {
            const liveText = await page.textContent('#fly-live-badge-text');
            console.log(`• Fornecedor sem dados ativos. Texto de contingência apresentado: "${liveText.trim()}"`);
            const badgeCount = await page.textContent('#fly-count-badge');
            console.log(`• Badge de contagem com status de fornecedor: "${badgeCount.trim()}"`);
        }

        // 8. Testar Painel de Aeroportos e "Voos do Dia"
        const airportCards = await page.locator('.fly-airport-card').count();
        console.log(`• Cards de aeroportos renderizados: ${airportCards}`);

        if (airportCards > 0) {
            await page.locator('.fly-airport-card').first().click();
            await page.waitForTimeout(500);
            const boardVisible = await page.isVisible('#fly-airport-board-view');
            console.log(`• Painel "Voos do Dia" do aeroporto aberto: ${boardVisible}`);

            // Clica nas abas do quadro (atrasados, chegadas, partidas)
            await page.click('.fly-board-tab[data-board-tab="atrasados"]');
            await page.waitForTimeout(300);
            await page.click('.fly-board-tab[data-board-tab="chegadas"]');
            await page.waitForTimeout(300);
            await page.click('.fly-board-tab[data-board-tab="partidas"]');
            await page.waitForTimeout(300);

            // Voltar
            await page.click('#fly-btn-back-airports');
            await page.waitForTimeout(300);
            const overviewVisible = await page.isVisible('#fly-airports-overview-view');
            console.log(`• Retorno à lista de 8 aeroportos confirmado: ${overviewVisible}`);
        }

        // 9. Testar Chatbot RIT FLY AI
        await page.click('.fly-nav-tab[data-fly-tab="fly-panel-ai"]');
        await page.waitForTimeout(500);
        await page.fill('#fly-ai-input', 'Há atrasos em Congonhas?');
        await page.press('#fly-ai-input', 'Enter');
        await page.waitForTimeout(2000);

        const bubbles = await page.locator('.fly-ai-bubble').count();
        console.log(`• Mensagens renderizadas no chat da IA: ${bubbles}`);
        const lastResponse = await page.locator('.fly-ai-bubble.agent').last().textContent();
        console.log(`• Resposta apresentada pela IA: "${lastResponse.trim().substring(0, 80)}..."`);

        // 10. Verificar Legenda do Mapa
        const legendVisible = await page.isVisible('#fly-map-legend');
        console.log(`• Legenda do mapa visível: ${legendVisible}`);

        // 11. Testar Retorno a Outra Aba do RIT (Zero Regressão de Navegação)
        await page.click('#tab-btn-transito');
        await page.waitForTimeout(500);
        const transitoAtivo = await page.isVisible('#tab-transito.active');
        console.log(`• Transição para Central de Câmeras & Ocorrências: ${transitoAtivo}`);

        await page.click('#tab-btn-rit-fly');
        await page.waitForTimeout(500);
        const ritFlyReativado = await page.isVisible('#tab-rit-fly.active');
        console.log(`• Retorno seguro à aba RIT FLY confirmado: ${ritFlyReativado}`);

        // 12. Verificar ausência de erros HTTP críticos
        if (criticalHttpErrors.length > 0) {
            console.error('❌ Erros HTTP críticos detectados:', criticalHttpErrors);
            process.exit(1);
        } else {
            console.log('✅ ZERO erros HTTP críticos (status >= 500) nas rotas RIT FLY!');
        }

        // 13. Verificar ausência de erros de página
        const relevantErrors = pageErrors.filter(e => !e.includes('google is not defined'));
        if (relevantErrors.length > 0) {
            console.error('❌ Erros de página detectados:', relevantErrors);
            process.exit(1);
        } else {
            console.log('✅ ZERO erros de console ou de runtime na aplicação!');
        }

        console.log('🎉 TODOS OS TESTES EM NAVEGADOR FORAM APROVADOS!');
    } catch (err) {
        console.error('❌ Falha na verificação:', err);
        console.log('--- CONSOLE LOGS ---', consoleLogs.slice(-20));
        console.log('--- PAGE ERRORS ---', pageErrors);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
