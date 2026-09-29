/**
 * Agente RIT - CHECKPOINT 5.2
 * Script de Captura de Evidências Reais de Runtime via Playwright: Acompanhamento de Caravanas
 */

const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const PORT = 3012;
const ARTIFACTS_DIR = 'C:\\Users\\fapaixao\\.gemini\\antigravity\\brain\\30b807a5-59a0-43c8-aa79-9009c86187f6';
const SCREENSHOTS_DOC_DIR = path.join(__dirname, '../docs/screenshots');

async function captureEvidence() {
    console.log('===============================================================');
    console.log('📸 INICIANDO CAPTURA DE EVIDÊNCIAS REAIS PLAYWRIGHT (CP 5.2)');
    console.log('===============================================================');

    // Garante que o diretório de destino existe
    if (!fs.existsSync(SCREENSHOTS_DOC_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DOC_DIR, { recursive: true });
    }

    // 1. Inicia servidor Express local servindo os arquivos estáticos e APIs
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../public')));

    const { createTrafficAlertRouter } = require('../server/traffic-alert/routes/traffic-alert-routes');
    const { memoryStore } = require('../server/traffic-alert/store/memory-store');
    app.use('/api/traffic-alert', createTrafficAlertRouter({ store: memoryStore }));

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    console.log(`🌐 Servidor de captura ativo em http://127.0.0.1:${PORT}`);

    const browser = await chromium.launch({ headless: true });

    try {
        // --- 1. CAPTURA: caravanas_desktop.png (1920x1080) ---
        console.log('\n[1/6] Capturando caravanas_desktop.png (1920x1080)...');
        const contextDesktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const pageDesktop = await contextDesktop.newPage();
        await pageDesktop.goto(`http://127.0.0.1:${PORT}/ambiente-visual-confirmacao.html`);
        await pageDesktop.waitForSelector('#tab-caravanas', { state: 'visible' });
        await pageDesktop.waitForTimeout(1000);

        const pathDesktopDoc = path.join(SCREENSHOTS_DOC_DIR, 'caravanas_desktop.png');
        const pathDesktopArtifact = path.join(ARTIFACTS_DIR, 'caravanas_desktop.png');
        await pageDesktop.screenshot({ path: pathDesktopDoc, fullPage: false });
        fs.copyFileSync(pathDesktopDoc, pathDesktopArtifact);
        console.log('✅ Capturado:', pathDesktopDoc);
        await contextDesktop.close();

        // --- 2. CAPTURA: caravanas_notebook.png (1366x768) ---
        console.log('\n[2/6] Capturando caravanas_notebook.png (1366x768)...');
        const contextNotebook = await browser.newContext({ viewport: { width: 1366, height: 768 } });
        const pageNotebook = await contextNotebook.newPage();
        await pageNotebook.goto(`http://127.0.0.1:${PORT}/ambiente-visual-confirmacao.html`);
        await pageNotebook.waitForSelector('#tab-caravanas', { state: 'visible' });
        await pageNotebook.waitForTimeout(1000);

        const pathNotebookDoc = path.join(SCREENSHOTS_DOC_DIR, 'caravanas_notebook.png');
        const pathNotebookArtifact = path.join(ARTIFACTS_DIR, 'caravanas_notebook.png');
        await pageNotebook.screenshot({ path: pathNotebookDoc, fullPage: false });
        fs.copyFileSync(pathNotebookDoc, pathNotebookArtifact);
        console.log('✅ Capturado:', pathNotebookDoc);
        await contextNotebook.close();

        // --- 3. CAPTURA: caravanas_drawer.png (Drawer Aberto) ---
        console.log('\n[3/6] Capturando caravanas_drawer.png (Drawer Aberto)...');
        const contextDrawer = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const pageDrawer = await contextDrawer.newPage();
        await pageDrawer.goto(`http://127.0.0.1:${PORT}/ambiente-visual-confirmacao.html`);
        await pageDrawer.waitForSelector('#card-caravan-01', { state: 'visible' });
        await pageDrawer.click('button:has-text("Ver Projeção & Rota ↗")');
        await pageDrawer.waitForSelector('#drawer-caravana', { state: 'visible' });
        await pageDrawer.waitForTimeout(800);

        const pathDrawerDoc = path.join(SCREENSHOTS_DOC_DIR, 'caravanas_drawer.png');
        const pathDrawerArtifact = path.join(ARTIFACTS_DIR, 'caravanas_drawer.png');
        await pageDrawer.screenshot({ path: pathDrawerDoc, fullPage: false });
        fs.copyFileSync(pathDrawerDoc, pathDrawerArtifact);
        console.log('✅ Capturado:', pathDrawerDoc);
        await contextDrawer.close();

        // --- 4. CAPTURA: caravanas_rota_critica.png ---
        console.log('\n[4/6] Capturando caravanas_rota_critica.png...');
        const contextCrit = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const pageCrit = await contextCrit.newPage();
        await pageCrit.goto(`http://127.0.0.1:${PORT}/ambiente-visual-confirmacao.html`);
        await pageCrit.click('#btn-caravan-critico');
        await pageCrit.waitForTimeout(800);

        const pathCritDoc = path.join(SCREENSHOTS_DOC_DIR, 'caravanas_rota_critica.png');
        const pathCritArtifact = path.join(ARTIFACTS_DIR, 'caravanas_rota_critica.png');
        await pageCrit.screenshot({ path: pathCritDoc, fullPage: false });
        fs.copyFileSync(pathCritDoc, pathCritArtifact);
        console.log('✅ Capturado:', pathCritDoc);
        await contextCrit.close();

        // --- 5. CAPTURA: caravanas_fonte_indisponivel.png ---
        console.log('\n[5/6] Capturando caravanas_fonte_indisponivel.png...');
        const contextCont = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const pageCont = await contextCont.newPage();
        await pageCont.goto(`http://127.0.0.1:${PORT}/ambiente-visual-confirmacao.html`);
        await pageCont.click('#btn-caravan-contingencia');
        await pageCont.waitForTimeout(800);

        const pathContDoc = path.join(SCREENSHOTS_DOC_DIR, 'caravanas_fonte_indisponivel.png');
        const pathContArtifact = path.join(ARTIFACTS_DIR, 'caravanas_fonte_indisponivel.png');
        await pageCont.screenshot({ path: pathContDoc, fullPage: false });
        fs.copyFileSync(pathContDoc, pathContArtifact);
        console.log('✅ Capturado:', pathContDoc);
        await contextCont.close();

        // --- 6. CAPTURA: caravanas_estado_vazio.png ---
        console.log('\n[6/6] Capturando caravanas_estado_vazio.png...');
        const contextVazio = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const pageVazio = await contextVazio.newPage();
        await pageVazio.goto(`http://127.0.0.1:${PORT}/ambiente-visual-confirmacao.html`);
        await pageVazio.click('#btn-caravan-vazio');
        await pageVazio.waitForTimeout(800);

        const pathVazioDoc = path.join(SCREENSHOTS_DOC_DIR, 'caravanas_estado_vazio.png');
        const pathVazioArtifact = path.join(ARTIFACTS_DIR, 'caravanas_estado_vazio.png');
        await pageVazio.screenshot({ path: pathVazioDoc, fullPage: false });
        fs.copyFileSync(pathVazioDoc, pathVazioArtifact);
        console.log('✅ Capturado:', pathVazioDoc);
        await contextVazio.close();

        console.log('\n===============================================================');
        console.log('🎉 6/6 CAPTURAS PLAYWRIGHT GERADAS COM SUCESSO!');
        console.log('===============================================================\n');
    } finally {
        await browser.close();
        server.close();
    }
}

if (require.main === module) {
    captureEvidence().catch(err => {
        console.error('❌ Falha na captura Playwright:', err);
        process.exit(1);
    });
}

module.exports = { captureEvidence };
