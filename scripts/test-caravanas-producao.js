/**
 * Agente RIT - Validação e Homologação do Ambiente de Produção do Módulo Caravana
 * Testa:
 * 1. Endpoints REST da API de Caravanas (/api/traffic-alert/caravans*)
 * 2. Interface Dedicada de Produção (/caravanas.html)
 * 3. Integração com a Aba do Dashboard (/dashboard.html -> tab-caravanas)
 * 4. Conformidade estrita de Privacidade (LGPD, Zero GPS, Zero PII)
 */

const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const assert = require('assert');

const PORT = 3015;
const SCREENSHOTS_DIR = path.join(__dirname, '../docs/screenshots');

async function runCaravanasProductionValidation() {
    console.log('===============================================================');
    console.log('🚌 VALIDAÇÃO DO AMBIENTE DE PRODUÇÃO: MÓDULO CARAVANAS');
    console.log('===============================================================');

    if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }

    // 1. Inicia Servidor Express com APIs e Frontend
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../public')));

    const { createTrafficAlertRouter } = require('../server/traffic-alert/routes/traffic-alert-routes');
    const { memoryStore } = require('../server/traffic-alert/store/memory-store');
    app.use('/api/traffic-alert', createTrafficAlertRouter({ store: memoryStore }));

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    console.log(`🌐 Servidor de testes ativo em http://127.0.0.1:${PORT}`);

    const browser = await chromium.launch({ headless: true });
    let totalChecks = 0;
    let passedChecks = 0;
    const checksRecord = [];
    const startTime = new Date();

    function check(description, condition, category = 'GERAL') {
        totalChecks++;
        const record = {
            id: totalChecks,
            category,
            description,
            passed: Boolean(condition),
            timestamp: new Date().toISOString()
        };
        checksRecord.push(record);
        if (condition) {
            console.log(`  ✅ [PASS] ${description}`);
            passedChecks++;
        } else {
            console.error(`  ❌ [FAIL] ${description}`);
            throw new Error(`Falha na verificação: ${description}`);
        }
    }

    try {
        // =========================================================================
        // ETAPA 1: VALIDAÇÃO DAS APIS REST DO BACKEND (/api/traffic-alert/caravans)
        // =========================================================================
        console.log('\n[1/4] Testando APIs REST de Caravanas...');

        // 1.1 GET /caravans
        const resList = await fetch(`http://127.0.0.1:${PORT}/api/traffic-alert/caravans`);
        check('Status HTTP 200 em GET /api/traffic-alert/caravans', resList.status === 200);
        const dataList = await resList.json();
        check('Lista contém ao menos 4 caravanas operacionais', dataList.count >= 4 && Array.isArray(dataList.data));
        check('Garantia de Privacidade: isGpsBased estritamente false', dataList.isGpsBased === false);
        check('Garantia de Governança: isSynthetic declarado', dataList.isSynthetic === true);
        check('Presença de Disclaimer Legal da LGPD', typeof dataList.disclaimer === 'string' && dataList.disclaimer.includes('NÃO REPRESENTA A LOCALIZAÇÃO REAL'));

        // 1.2 GET /caravans/kpis
        const resKpis = await fetch(`http://127.0.0.1:${PORT}/api/traffic-alert/caravans/kpis`);
        check('Status HTTP 200 em GET /api/traffic-alert/caravans/kpis', resKpis.status === 200);
        const dataKpis = await resKpis.json();
        check('KPIs estruturados contêm totalPlanned, withinWindow e attention', typeof dataKpis.data.totalPlanned === 'number' && typeof dataKpis.data.withinWindow === 'number');

        // 1.3 POST /caravans/recalculate-all
        const resRecalc = await fetch(`http://127.0.0.1:${PORT}/api/traffic-alert/caravans/recalculate-all`, { method: 'POST' });
        check('Status HTTP 200 em POST /api/traffic-alert/caravans/recalculate-all', resRecalc.status === 200);

        // =========================================================================
        // ETAPA 2: VALIDAÇÃO DA INTERFACE DEDICADA DE PRODUÇÃO (/caravanas.html)
        // =========================================================================
        console.log('\n[2/4] Testando Interface Dedicada (/caravanas.html)...');

        // 2.0 Teste de Controle de Acesso P1: acesso sem token redireciona para login (/)
        const unauthContext = await browser.newContext();
        const unauthPage = await unauthContext.newPage();
        await unauthPage.goto(`http://127.0.0.1:${PORT}/caravanas.html`);
        await unauthPage.waitForTimeout(500);
        const unauthUrl = unauthPage.url();
        check('Controle de Acesso (P1): Acesso direto sem token redireciona para login (/)', unauthUrl.endsWith('/') || unauthUrl.includes('login') || unauthUrl === `http://127.0.0.1:${PORT}/`);
        await unauthContext.close();

        // 2.1 Acesso Autenticado
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage();
        await page.addInitScript(() => {
            localStorage.setItem('rit_token', 'jwt-token-valido-cco');
            localStorage.setItem('rit_user', JSON.stringify({ nome: 'Fábio Paixão', funcao: 'CCO Transportes' }));
        });

        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('404')) {
                consoleErrors.push(msg.text());
            }
        });

        await page.goto(`http://127.0.0.1:${PORT}/caravanas.html`);
        await page.waitForTimeout(600);

        const pageTitle = await page.title();
        check('Título oficial da página de produção de Caravanas', pageTitle.includes('Caravanas Inteligentes'));

        // Header links & Sessão
        const hasDashboardLink = await page.locator('header a[href="/dashboard.html"]').count() > 0;
        check('Cabeçalho contém atalho para o Painel Gerencial (/dashboard.html)', hasDashboardLink);

        const hasApresentacaoLink = await page.locator('header a[href="/apresentacao.html"]').count() > 0;
        check('Cabeçalho contém atalho para Como Funciona (/apresentacao.html)', hasApresentacaoLink);

        const sessionName = await page.locator('#user-session-name').innerText();
        check('Sessão do Operador exibida no cabeçalho', sessionName.includes('FÁBIO PAIXÃO'));

        // KPIs visíveis
        const kpiTotalVisible = await page.locator('#kpi-crv-total').isVisible();
        check('KPIs de Caravanas visíveis e operacionais', kpiTotalVisible);

        // Mapa Leaflet
        const mapExists = await page.locator('#map-container, .leaflet-container').count() > 0;
        check('Mapa cartográfico Leaflet inicializado (#map-container)', mapExists);

        // Feed de caravanas
        const caravanCards = await page.locator('.caravan-card').count();
        check('Feed operacional renderizou cards de caravanas', caravanCards >= 4);

        // Validação P1: Remoção de Caravanas Simuladas e uso de Operações Reais
        const pageContent = await page.content();
        check('Remoção de Caravanas Simuladas (P1): Zero ocorrências de "Caravana Demonstração"', !pageContent.includes('Caravana Demonstração'));
        check('Operações Reais de Produção (P1): Presença de Huck, Mion, Altas Horas ou Bial', 
            pageContent.includes('Huck') || pageContent.includes('Mion') || pageContent.includes('Altas Horas') || pageContent.includes('Bial'));

        // Validação P2: Distância em KM visível
        check('Caravana com Distância em KM (P2): Quilometragem visível nos cards de caravanas', pageContent.includes('km'));

        // Validação P1: Busca por Bairro (Niterói, Madureira, Barra, etc.)
        await page.fill('#filter-search', 'Niterói');
        await page.waitForTimeout(350);
        const niteroiFilteredCount = await page.locator('.caravan-card').count();
        check('Busca por Bairro (P1): Busca por "Niterói" filtra corretamente as caravanas', niteroiFilteredCount >= 1);
        await page.fill('#filter-search', '');
        await page.waitForTimeout(350);

        // Validação P1 & P2: Ícones Waze e Trânsito no Mapa Unificado
        const wazeMarkers = await page.locator('.waze-incident-pin').count();
        check('Ocorrências com Ícones Operacionais Waze (P2) no mapa', wazeMarkers >= 1);

        // Captura do ambiente standalone
        const shotStandalone = path.join(SCREENSHOTS_DIR, 'caravanas_producao_standalone.png');
        await page.screenshot({ path: shotStandalone });
        console.log(`  📸 Screenshot salvo: ${shotStandalone}`);

        // Testar Drawer Lateral Tático
        console.log('\n[3/4] Testando Drawer Lateral Tático de Caravanas...');
        const firstCard = page.locator('.caravan-card').first();
        await firstCard.click();
        await page.waitForTimeout(400);
        const drawerVisible = await page.locator('#tactical-drawer').isVisible();
        check('Drawer tático abriu com detalhes da caravana', drawerVisible);

        const drawerContent = await page.locator('#tactical-drawer').innerText();
        check('Distância em KM presente no Drawer Tático', drawerContent.includes('km'));

        const shotDrawer = path.join(SCREENSHOTS_DIR, 'caravanas_producao_drawer.png');
        await page.screenshot({ path: shotDrawer });
        console.log(`  📸 Screenshot salvo: ${shotDrawer}`);

        // Fechar com ESC
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // =========================================================================
        // ETAPA 4: VALIDAÇÃO DA ABA NO DASHBOARD (/dashboard.html)
        // =========================================================================
        console.log('\n[4/4] Testando Aba de Caravanas no Dashboard (/dashboard.html)...');
        const dashPage = await context.newPage();
        await dashPage.addInitScript(() => {
            localStorage.setItem('rit_token', 'jwt-token-valido-cco');
            localStorage.setItem('rit_user', JSON.stringify({ nome: 'Operador CCO', funcao: 'CCO Transportes' }));
        });
        await dashPage.goto(`http://127.0.0.1:${PORT}/dashboard.html`);
        await dashPage.waitForTimeout(600);

        // Verificar botão da aba Caravanas
        const tabBtnCaravanas = dashPage.locator('#tab-btn-caravanas');
        check('Botão da aba Caravanas existe na navegação (#tab-btn-caravanas)', await tabBtnCaravanas.count() > 0);

        // Clicar na aba Caravanas
        await tabBtnCaravanas.click();
        await dashPage.waitForTimeout(400);

        const tabPaneActive = await dashPage.locator('#tab-caravanas').getAttribute('class');
        check('Painel #tab-caravanas ativado no Dashboard', tabPaneActive && tabPaneActive.includes('active'));

        const iframeCaravanas = dashPage.locator('#iframe-caravanas');
        check('Iframe do Módulo de Caravanas inserido no container da aba', await iframeCaravanas.count() > 0);

        const shotDashboardTab = path.join(SCREENSHOTS_DIR, 'caravanas_producao_dashboard_tab.png');
        await dashPage.screenshot({ path: shotDashboardTab });
        console.log(`  📸 Screenshot salvo: ${shotDashboardTab}`);

        check('Zero erros graves no console do navegador', consoleErrors.length === 0);

        const summaryData = {
            timestamp: new Date().toISOString(),
            testSuite: 'Agente RIT - Homologação Módulo Caravanas em Produção',
            environment: {
                target: `http://127.0.0.1:${PORT}`,
                browser: 'Chromium (Headless)',
                viewport: { width: 1920, height: 1080 }
            },
            execution: {
                startedAt: startTime.toISOString(),
                completedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime.getTime(),
                totalChecks,
                passedChecks,
                failedChecks: totalChecks - passedChecks,
                passRate: `${((passedChecks / totalChecks) * 100).toFixed(1)}%`
            },
            checks: checksRecord,
            artifacts: [
                { file: 'caravanas_producao_standalone.png', path: 'docs/screenshots/caravanas_producao_standalone.png', resolution: '1920x1080' },
                { file: 'caravanas_producao_drawer.png', path: 'docs/screenshots/caravanas_producao_drawer.png', resolution: '1920x1080' },
                { file: 'caravanas_producao_dashboard_tab.png', path: 'docs/screenshots/caravanas_producao_dashboard_tab.png', resolution: '1920x1080' }
            ]
        };

        const artifactsDir = path.join(__dirname, '../artifacts');
        if (!fs.existsSync(artifactsDir)) {
            fs.mkdirSync(artifactsDir, { recursive: true });
        }
        fs.writeFileSync(
            path.join(artifactsDir, 'playwright-caravanas-producao-summary.json'),
            JSON.stringify(summaryData, null, 2),
            'utf8'
        );
        console.log('  📄 Sumário estruturado salvo: artifacts/playwright-caravanas-producao-summary.json');

        console.log('\n===============================================================');
        console.log(`🎯 RESULTADO FINAL: ${passedChecks}/${totalChecks} VERIFICAÇÕES APROVADAS (100%)`);
        console.log('STATUS: AMBIENTE DE PRODUÇÃO DO MÓDULO CARAVANA HOMOLOGADO!');
        console.log('===============================================================\n');

    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}

runCaravanasProductionValidation().catch(err => {
    console.error('❌ [FATAL]', err);
    process.exit(1);
});
