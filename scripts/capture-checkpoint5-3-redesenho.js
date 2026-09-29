/**
 * Agente RIT - Script de Captura Real de Telas com Playwright (CHECKPOINT 5.3)
 * Gera as 11 evidências oficiais de runtime a partir do navegador Chromium real.
 * NÃO UTILIZA IMAGENS GERADAS POR IA.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, '../docs/screenshots');
const ARTIFACTS_DIR = 'C:\\Users\\fapaixao\\.gemini\\antigravity\\brain\\30b807a5-59a0-43c8-aa79-9009c86187f6';
const BASE_URL = 'http://localhost:3000/ambiente-visual-confirmacao.html';

async function captureAll() {
    console.log('===============================================================');
    console.log('📸 CAPTURA DE TELAS DE RUNTIME COM PLAYWRIGHT (CHECKPOINT 5.3)');
    console.log('===============================================================');

    if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });

    try {
        // -------------------------------------------------------------
        // 1. rit_alerta_desktop.png (Desktop 1920x1080 com feed + mapa)
        // -------------------------------------------------------------
        console.log('\n[1/11] Capturando rit_alerta_desktop.png (1920x1080)...');
        let context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        let page = await context.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        // Clica no modo RIT ALERTA
        await page.click('#btn-mode-alerta');
        await page.waitForTimeout(1500);
        const p1 = path.join(SCREENSHOTS_DIR, 'rit_alerta_desktop.png');
        await page.screenshot({ path: p1, fullPage: false });
        console.log(`✅ Salvo: ${p1}`);
        await context.close();

        // -------------------------------------------------------------
        // 2. rit_alerta_rodovias.png (Filtro por Rodovia/Linha Vermelha ativado)
        // -------------------------------------------------------------
        console.log('\n[2/11] Capturando rit_alerta_rodovias.png (1920x1080)...');
        context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        page = await context.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        await page.click('#btn-mode-alerta');
        await page.waitForTimeout(500);
        // Seleciona Linha Vermelha no filtro
        await page.selectOption('#filter-corridor', 'Linha Vermelha');
        await page.waitForTimeout(1000);
        const p2 = path.join(SCREENSHOTS_DIR, 'rit_alerta_rodovias.png');
        await page.screenshot({ path: p2, fullPage: false });
        console.log(`✅ Salvo: ${p2}`);
        await context.close();

        // -------------------------------------------------------------
        // 3. rit_caravanas_notebook.png (Notebook 1366x768 com 4 rotas no mapa de satélite)
        // -------------------------------------------------------------
        console.log('\n[3/11] Capturando rit_caravanas_notebook.png (1366x768)...');
        context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
        page = await context.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        // Garante que está no modo Caravanas
        await page.click('#btn-mode-caravanas');
        await page.waitForTimeout(1500);
        const p3 = path.join(SCREENSHOTS_DIR, 'rit_caravanas_notebook.png');
        await page.screenshot({ path: p3, fullPage: false });
        console.log(`✅ Salvo: ${p3}`);
        await context.close();

        // -------------------------------------------------------------
        // 4. rit_caravanas_formulario.png (Modal '+ INCLUIR CARAVANA' aberto com campos preenchidos)
        // -------------------------------------------------------------
        console.log('\n[4/11] Capturando rit_caravanas_formulario.png (1920x1080)...');
        context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        page = await context.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        // Abre modal
        await page.evaluate(() => openCaravanModal());
        await page.waitForTimeout(500);
        // Preenche campos
        await page.fill('#form-data', '2026-09-28');
        await page.selectOption('#form-programa', 'Domingão');
        await page.fill('#form-nome', 'Caravana Volta Redonda - Acesso Especial');
        await page.fill('#form-endereco', 'Praça Brasil, Vila Santa Cecília, Volta Redonda - RJ');
        await page.fill('#form-empresa', 'Viação Cidade do Aço');
        await page.fill('#form-saida', '12:30');
        await page.fill('#form-limite', '15:30');
        await page.fill('#form-obs', 'Portão 3 - Plateia VIP Setor A');
        await page.waitForTimeout(500);
        const p4 = path.join(SCREENSHOTS_DIR, 'rit_caravanas_formulario.png');
        await page.screenshot({ path: p4, fullPage: false });
        console.log(`✅ Salvo: ${p4}`);
        await context.close();

        // -------------------------------------------------------------
        // 5. rit_caravanas_multiplas_rotas.png (Visão geral de todas as rotas coloridas no mapa)
        // -------------------------------------------------------------
        console.log('\n[5/11] Capturando rit_caravanas_multiplas_rotas.png (1920x1080)...');
        context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        page = await context.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        await page.click('#btn-mode-caravanas');
        await page.waitForTimeout(500);
        await page.evaluate(() => toggleAllRoutesMode(true));
        await page.waitForTimeout(2000);
        const p5 = path.join(SCREENSHOTS_DIR, 'rit_caravanas_multiplas_rotas.png');
        await page.screenshot({ path: p5, fullPage: false });
        console.log(`✅ Salvo: ${p5}`);
        await context.close();

        // -------------------------------------------------------------
        // 6. rit_caravanas_rota_individual.png (Uma rota selecionada com destaque e outras com opacidade)
        // -------------------------------------------------------------
        console.log('\n[6/11] Capturando rit_caravanas_rota_individual.png (1920x1080)...');
        context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        page = await context.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        await page.click('#btn-mode-caravanas');
        await page.waitForTimeout(800);
        // Seleciona Caravana Demonstração Norte (caravan-01)
        await page.evaluate(() => selectCaravan('caravan-01'));
        await page.waitForTimeout(1500);
        const p6 = path.join(SCREENSHOTS_DIR, 'rit_caravanas_rota_individual.png');
        await page.screenshot({ path: p6, fullPage: false });
        console.log(`✅ Salvo: ${p6}`);

        // -------------------------------------------------------------
        // 7. rit_caravanas_cameras.png (Drawer aberto exibindo câmeras do COR-Rio ao longo do trajeto)
        // -------------------------------------------------------------
        console.log('\n[7/11] Capturando rit_caravanas_cameras.png (1920x1080)...');
        // Rola o drawer para focar na seção de câmeras
        await page.evaluate(() => {
            const drawerBody = document.getElementById('drawer-body');
            if (drawerBody) drawerBody.scrollTop = drawerBody.scrollHeight;
        });
        await page.waitForTimeout(800);
        const p7 = path.join(SCREENSHOTS_DIR, 'rit_caravanas_cameras.png');
        await page.screenshot({ path: p7, fullPage: false });
        console.log(`✅ Salvo: ${p7}`);

        // -------------------------------------------------------------
        // 8. rit_caravanas_ocorrencias.png (Drawer exibindo ocorrências e atraso projetado)
        // -------------------------------------------------------------
        console.log('\n[8/11] Capturando rit_caravanas_ocorrencias.png (1920x1080)...');
        // Rola para a seção de ocorrências e alternativa consultiva
        await page.evaluate(() => {
            const drawerBody = document.getElementById('drawer-body');
            if (drawerBody) drawerBody.scrollTop = 250;
        });
        await page.waitForTimeout(800);
        const p8 = path.join(SCREENSHOTS_DIR, 'rit_caravanas_ocorrencias.png');
        await page.screenshot({ path: p8, fullPage: false });
        console.log(`✅ Salvo: ${p8}`);

        // -------------------------------------------------------------
        // 9. rit_caravanas_comparativo.png (Seção de comparativo: base x trânsito x Google x Waze)
        // -------------------------------------------------------------
        console.log('\n[9/11] Capturando rit_caravanas_comparativo.png (1920x1080)...');
        // Rola para o topo do drawer onde está o cronograma e o comparativo
        await page.evaluate(() => {
            const drawerBody = document.getElementById('drawer-body');
            if (drawerBody) drawerBody.scrollTop = 80;
        });
        await page.waitForTimeout(800);
        const p9 = path.join(SCREENSHOTS_DIR, 'rit_caravanas_comparativo.png');
        await page.screenshot({ path: p9, fullPage: false });
        console.log(`✅ Salvo: ${p9}`);
        await context.close();

        // -------------------------------------------------------------
        // 10. rit_caravanas_fallback_mapa.png (Demonstração do mapa com camada Satélite / OSM sem erro de chave)
        // -------------------------------------------------------------
        console.log('\n[10/11] Capturando rit_caravanas_fallback_mapa.png (1920x1080)...');
        context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        page = await context.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        await page.click('#btn-mode-caravanas');
        await page.waitForTimeout(500);
        // Alterna basemap para OpenStreetMap Ruas e expande controle de camadas
        await page.evaluate(() => {
            if (leafletMap && tileLayers.streets) {
                leafletMap.removeLayer(tileLayers.satellite);
                tileLayers.streets.addTo(leafletMap);
                document.getElementById('map-view-indicator').innerText = '🗺️ Ruas (OpenStreetMap)';
            }
            const ctrl = document.querySelector('.leaflet-control-layers');
            if (ctrl) ctrl.classList.add('leaflet-control-layers-expanded');
        });
        await page.waitForTimeout(1500);
        const p10 = path.join(SCREENSHOTS_DIR, 'rit_caravanas_fallback_mapa.png');
        await page.screenshot({ path: p10, fullPage: false });
        console.log(`✅ Salvo: ${p10}`);
        await context.close();

        // -------------------------------------------------------------
        // 11. rit_validacao_governanca_drawer.png (Drawer de governança aberto exibindo lista CT-01 a CT-50)
        // -------------------------------------------------------------
        console.log('\n[11/11] Capturando rit_validacao_governanca_drawer.png (1920x1080)...');
        context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        page = await context.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        // Abre o modal de governança
        await page.evaluate(() => toggleGovernanceDrawer());
        await page.waitForTimeout(800);
        const p11 = path.join(SCREENSHOTS_DIR, 'rit_validacao_governanca_drawer.png');
        await page.screenshot({ path: p11, fullPage: false });
        console.log(`✅ Salvo: ${p11}`);
        await context.close();

        // Copia todas as 11 imagens para o diretório de artefatos
        console.log('\nCopiando screenshots para o diretório de artefatos...');
        const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.startsWith('rit_'));
        for (const file of files) {
            const src = path.join(SCREENSHOTS_DIR, file);
            const dst = path.join(ARTIFACTS_DIR, file);
            fs.copyFileSync(src, dst);
        }
        console.log(`✅ ${files.length} capturas sincronizadas com o diretório de artefatos.`);

    } finally {
        await browser.close();
    }

    console.log('\n===============================================================');
    console.log('🎉 TODAS AS 11 CAPTURAS REAIS FORAM GERADAS COM SUCESSO PELO PLAYWRIGHT!');
    console.log('===============================================================\n');
}

captureAll().catch(err => {
    console.error('❌ Erro na captura de telas com Playwright:', err);
    process.exit(1);
});
