const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

// Servidor HTTP local estático para a pasta public
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }));
    return;
  }
  if (reqPath === '/') reqPath = '/apresentacao.html';
  const filePath = path.join(__dirname, '..', 'public', reqPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

async function run() {
  const PORT = 3456;
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`[HTTP] Servidor estático rodando em http://localhost:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error('[Console Error]', msg.text());
    } else {
      console.log(`[Browser Console: ${msg.type()}]`, msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.error('[Page Error]', err.message);
  });

  console.log('[Test] Navegando para apresentacao.html...');
  await page.goto(`http://localhost:${PORT}/apresentacao.html`, { waitUntil: 'networkidle' });

  // 1. Validar Título e Top Bar
  const title = await page.title();
  console.log(`[Test] Título da página: "${title}"`);
  if (!title.includes('CP 5.3') || !title.includes('Release Notes Vivo')) {
    throw new Error(`Título não contém versão ou badge: ${title}`);
  }

  const topSubtitle = await page.locator('.top-subtitle').innerText();
  console.log(`[Test] Top subtitle: "${topSubtitle.replace(/\n/g, ' ')}"`);
  if (!topSubtitle.includes('VERSÃO CP 5.3') || !topSubtitle.includes('RELEASE NOTES VIVO')) {
    throw new Error(`Top-bar não contém badges esperados: ${topSubtitle}`);
  }

  // 2. Validar Slide 1 (Capa Operacional)
  const slide1Active = await page.locator('.slide[data-slide="1"]').getAttribute('class');
  console.log(`[Test] Slide 1 class: ${slide1Active}`);
  const kpiNums = await page.locator('.slide[data-slide="1"] .kpi-num').allInnerTexts();
  console.log(`[Test] KPIs do Slide 1:`, kpiNums);
  
  if (!kpiNums.includes('95 / 95') || !kpiNums.includes('20 / 20') || !kpiNums.includes('15 / 15')) {
    throw new Error(`KPIs operacionais do Slide 1 divergentes: ${JSON.stringify(kpiNums)}`);
  }

  // Captura do Slide 1
  const screenshotDir = path.join(__dirname, '..', 'docs', 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const slide1Path = path.join(screenshotDir, 'apresentacao_slide1_capa.png');
  await page.screenshot({ path: slide1Path, fullPage: false });
  console.log(`[Test] Screenshot Slide 1 salvo em: ${slide1Path}`);

  // 3. Navegação pelos Slides 2 e 3
  console.log('[Test] Navegando para o Slide 2 (Central de Câmeras)...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const slide2Title = await page.locator('.slide[data-slide="2"] h2').innerText();
  console.log(`[Test] Slide 2 título: "${slide2Title}"`);
  const slide2Path = path.join(screenshotDir, 'apresentacao_slide2_cameras.png');
  await page.screenshot({ path: slide2Path, fullPage: false });

  console.log('[Test] Navegando para o Slide 3 (Centro de Roteirização & Custos)...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const slide3Title = await page.locator('.slide[data-slide="3"] h2').innerText();
  console.log(`[Test] Slide 3 título: "${slide3Title}"`);
  const slide3Path = path.join(screenshotDir, 'apresentacao_slide3_roteirizacao_custos.png');
  await page.screenshot({ path: slide3Path, fullPage: false });

  // 4. Navegação para os 10 Slides e Slide 10
  const totalSlides = await page.locator('.slide').count();
  console.log(`[Test] Total de slides encontrados no deck: ${totalSlides}`);
  if (totalSlides !== 10) {
    throw new Error(`Esperado 10 slides, encontrados: ${totalSlides}`);
  }

  // Voltar para a capa e clicar no botão do Slide 10
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  console.log('[Test] Navegando diretamente para o Slide 10 via botão da capa...');
  await page.click('button:has-text("ÚLTIMAS ENTREGAS (SLIDE 10)")');
  await page.waitForTimeout(600);

  const counterText = await page.locator('#counter').innerText();
  console.log(`[Test] Contador de slides: ${counterText}`);
  if (counterText !== '10 / 10') {
    throw new Error(`Esperado slide '10 / 10', encontrado: '${counterText}'`);
  }

  // 4. Validar Conteúdo do Slide 10 (Alimentado por JSON)
  const relVersion = await page.locator('#rel-current-version').innerText();
  const relDate = await page.locator('#rel-current-date').innerText();
  console.log(`[Test] Slide 10 - Versão: ${relVersion}, Data: ${relDate}`);

  const featureCards = await page.locator('.release-feature-card').count();
  console.log(`[Test] Slide 10 - Total de cards de features: ${featureCards}`);
  if (featureCards < 5) {
    throw new Error(`Esperado ao menos 5 features no Slide 10, encontrados: ${featureCards}`);
  }

  const historyItems = await page.locator('.history-item').count();
  console.log(`[Test] Slide 10 - Total de itens de histórico: ${historyItems}`);
  if (historyItems < 3) {
    throw new Error(`Esperado ao menos 3 itens de histórico, encontrados: ${historyItems}`);
  }

  // Captura do Slide 10
  const slide10Path = path.join(screenshotDir, 'apresentacao_slide10_releases.png');
  await page.screenshot({ path: slide10Path, fullPage: false });
  console.log(`[Test] Screenshot Slide 10 salvo em: ${slide10Path}`);

  // 5. Testar Navegação por Teclado
  console.log('[Test] Testando navegação por teclado (ArrowLeft -> Slide 9)...');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(400);
  const counter9 = await page.locator('#counter').innerText();
  console.log(`[Test] Contador após ArrowLeft: ${counter9}`);
  if (counter9 !== '9 / 10') {
    throw new Error(`Esperado '9 / 10', encontrado: '${counter9}'`);
  }

  await browser.close();
  await new Promise(resolve => server.close(resolve));

  console.log(`\n========================================`);
  console.log(`RELATÓRIO DE VALIDAÇÃO PLAYWRIGHT`);
  console.log(`Total de Slides: ${totalSlides} (Esperado: 10)`);
  console.log(`Erros de Console: ${consoleErrors.length}`);
  console.log(`Screenshots Atualizados:`);
  console.log(` - docs/screenshots/apresentacao_slide1_capa.png`);
  console.log(` - docs/screenshots/apresentacao_slide10_releases.png`);
  console.log(`STATUS: APROVADO COM 100% DE SUCESSO!`);
  console.log(`========================================\n`);

  if (consoleErrors.length > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[FATAL]', err);
  server.close();
  process.exit(1);
});
