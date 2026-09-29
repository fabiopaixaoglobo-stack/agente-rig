/**
 * Script de Validação Real de Disponibilização dos Ambientes Visuais via Playwright
 * Executa contra o servidor ativo em http://localhost:3000
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\fapaixao\\.gemini\\antigravity\\brain\\30b807a5-59a0-43c8-aa79-9009c86187f6';
const SCREENSHOTS_DOC_DIR = path.join(__dirname, '../docs/screenshots');

async function validateLivePages() {
    console.log('===============================================================');
    console.log('🔍 INICIANDO VALIDAÇÃO REAL PLAYWRIGHT EM HTTP://LOCALHOST:3000');
    console.log('===============================================================');

    if (!fs.existsSync(SCREENSHOTS_DOC_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DOC_DIR, { recursive: true });
    }

    const browser = await chromium.launch({ headless: true });
    const results = [];

    // --- 1. TESTE: dashboard.html com sessão autenticada ---
    {
        const url = 'http://localhost:3000/dashboard.html';
        console.log(`\n---------------------------------------------------------------`);
        console.log(`🚀 Testando: ${url} (com sessão CCO em localStorage)`);
        console.log(`---------------------------------------------------------------`);

        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        // Injeta token de homologação para evitar redirecionamento para login
        await context.addInitScript(() => {
            localStorage.setItem('rit_token', 'jwt-token-homologacao-cco-2026');
            localStorage.setItem('rit_user', JSON.stringify({ nome: 'FÁBIO PAIXÃO', funcao: 'CCO Operação' }));
            localStorage.setItem('rit_auditId', 'audit-cco-val-001');
        });

        const p = await context.newPage();
        const consoleMessages = [];
        const networkFailures = [];
        const networkRequests = [];

        p.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
        p.on('pageerror', err => consoleMessages.push({ type: 'uncaught-error', text: err.message }));
        p.on('requestfailed', req => networkFailures.push({ url: req.url(), failure: req.failure()?.errorText || 'Unknown' }));
        p.on('response', resp => networkRequests.push({ url: resp.url(), status: resp.status() }));

        const response = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await p.waitForTimeout(2000);
        const statusCode = response ? response.status() : 0;
        console.log(`Status HTTP: ${statusCode} | URL: ${p.url()}`);

        // Captura visão geral do dashboard autenticado
        const docDashboard = path.join(SCREENSHOTS_DOC_DIR, 'validacao_dashboard_3000.png');
        const artDashboard = path.join(ARTIFACTS_DIR, 'validacao_dashboard_3000.png');
        await p.screenshot({ path: docDashboard, fullPage: false });
        fs.copyFileSync(docDashboard, artDashboard);
        console.log(`📸 Screenshot salvo: ${docDashboard}`);

        // Clica na aba RIT ALERTA dentro do dashboard se existir
        const ritTab = await p.$('#tab-btn-traffic-alert');
        if (ritTab) {
            await ritTab.click();
            await p.waitForTimeout(1500);
            const docRit = path.join(SCREENSHOTS_DOC_DIR, 'validacao_dashboard_rit_alerta_3000.png');
            const artRit = path.join(ARTIFACTS_DIR, 'validacao_dashboard_rit_alerta_3000.png');
            await p.screenshot({ path: docRit, fullPage: false });
            fs.copyFileSync(docRit, artRit);
            console.log(`📸 Screenshot RIT ALERTA salvo: ${docRit}`);
        }

        results.push({
            name: 'dashboard.html',
            url,
            effectiveUrl: p.url(),
            statusCode,
            screenshot: 'validacao_dashboard_3000.png',
            consoleErrors: consoleMessages.filter(m => m.type === 'error' || m.type === 'uncaught-error'),
            networkFailures: networkFailures.filter(f => !f.url.endsWith('.mp4')), // ignora vídeo de background opcional
            totalRequests: networkRequests.length
        });

        await context.close();
    }

    // --- 2. TESTE: ambiente_visual_homologacao.html ---
    {
        const url = 'http://localhost:3000/ambiente_visual_homologacao.html';
        console.log(`\n---------------------------------------------------------------`);
        console.log(`🚀 Testando: ${url}`);
        console.log(`---------------------------------------------------------------`);

        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const p = await context.newPage();
        const consoleMessages = [];
        const networkFailures = [];
        const networkRequests = [];

        p.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
        p.on('pageerror', err => consoleMessages.push({ type: 'uncaught-error', text: err.message }));
        p.on('requestfailed', req => networkFailures.push({ url: req.url(), failure: req.failure()?.errorText || 'Unknown' }));
        p.on('response', resp => networkRequests.push({ url: resp.url(), status: resp.status() }));

        const response = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await p.waitForTimeout(2000);
        const statusCode = response ? response.status() : 0;
        console.log(`Status HTTP: ${statusCode} | URL: ${p.url()}`);

        await p.waitForSelector('#tab-caravanas', { state: 'visible', timeout: 5000 });
        await p.waitForTimeout(1000);

        const docHomol = path.join(SCREENSHOTS_DOC_DIR, 'validacao_ambiente_homologacao_3000.png');
        const artHomol = path.join(ARTIFACTS_DIR, 'validacao_ambiente_homologacao_3000.png');
        await p.screenshot({ path: docHomol, fullPage: false });
        fs.copyFileSync(docHomol, artHomol);
        console.log(`📸 Screenshot salvo: ${docHomol}`);

        results.push({
            name: 'ambiente_visual_homologacao.html',
            url,
            effectiveUrl: p.url(),
            statusCode,
            screenshot: 'validacao_ambiente_homologacao_3000.png',
            consoleErrors: consoleMessages.filter(m => m.type === 'error' || m.type === 'uncaught-error'),
            networkFailures,
            totalRequests: networkRequests.length
        });

        await context.close();
    }

    // --- 3. TESTE: ambiente-visual-confirmacao.html ---
    {
        const url = 'http://localhost:3000/ambiente-visual-confirmacao.html';
        console.log(`\n---------------------------------------------------------------`);
        console.log(`🚀 Testando: ${url}`);
        console.log(`---------------------------------------------------------------`);

        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const p = await context.newPage();
        const consoleMessages = [];
        const networkFailures = [];
        const networkRequests = [];

        p.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
        p.on('pageerror', err => consoleMessages.push({ type: 'uncaught-error', text: err.message }));
        p.on('requestfailed', req => networkFailures.push({ url: req.url(), failure: req.failure()?.errorText || 'Unknown' }));
        p.on('response', resp => networkRequests.push({ url: resp.url(), status: resp.status() }));

        const response = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await p.waitForTimeout(2000);
        const statusCode = response ? response.status() : 0;
        console.log(`Status HTTP: ${statusCode} | URL: ${p.url()}`);

        await p.waitForSelector('#tab-caravanas', { state: 'visible', timeout: 5000 });
        await p.waitForTimeout(1000);

        const docConf = path.join(SCREENSHOTS_DOC_DIR, 'validacao_ambiente_confirmacao_3000.png');
        const artConf = path.join(ARTIFACTS_DIR, 'validacao_ambiente_confirmacao_3000.png');
        await p.screenshot({ path: docConf, fullPage: false });
        fs.copyFileSync(docConf, artConf);
        console.log(`📸 Screenshot salvo: ${docConf}`);

        results.push({
            name: 'ambiente-visual-confirmacao.html',
            url,
            effectiveUrl: p.url(),
            statusCode,
            screenshot: 'validacao_ambiente_confirmacao_3000.png',
            consoleErrors: consoleMessages.filter(m => m.type === 'error' || m.type === 'uncaught-error'),
            networkFailures,
            totalRequests: networkRequests.length
        });

        await context.close();
    }

    await browser.close();

    console.log('\n===============================================================');
    console.log('📊 RESUMO DA VALIDAÇÃO REAL EM HTTP://LOCALHOST:3000:');
    console.log('===============================================================');
    for (const r of results) {
        console.log(`[${r.statusCode === 200 ? '✅ 200 OK' : '❌ ' + r.statusCode}] ${r.url}`);
        console.log(`   URL Efetiva: ${r.effectiveUrl}`);
        console.log(`   Erros de Console: ${r.consoleErrors.length} | Falhas de Rede: ${r.networkFailures.length} | Requisições: ${r.totalRequests}`);
    }

    const reportPath = path.join(ARTIFACTS_DIR, 'validacao_live_diagnostico.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');

    return results;
}

validateLivePages().catch(err => {
    console.error('Falha geral na validação:', err);
    process.exit(1);
});
