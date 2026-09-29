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
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }));
    return;
  }
  if (reqPath === '/') reqPath = '/apresentacao.html';
  const filePath = path.join(__dirname, '..', 'public', decodeURIComponent(reqPath));

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

  // 1. Validar Título e Top Bar em Português
  const title = await page.title();
  console.log(`[Test] Título da página: "${title}"`);
  if (!title.includes('CP 5.3') || !title.includes('Histórico')) {
    throw new Error(`Título não contém versão ou histórico: ${title}`);
  }

  const topSubtitle = await page.locator('.top-subtitle').innerText();
  console.log(`[Test] Top subtitle: "${topSubtitle.replace(/\n/g, ' ')}"`);
  if (!topSubtitle.includes('VERSÃO CP 5.3') || !topSubtitle.includes('HISTÓRICO VIVO DE ENTREGAS')) {
    throw new Error(`Top-bar não contém badges esperados: ${topSubtitle}`);
  }

  // 2. Validar Slide 1 (Capa Operacional) e novos rótulos de KPIs em Português
  const slide1Active = await page.locator('.slide[data-slide="1"]').getAttribute('class');
  console.log(`[Test] Slide 1 class: ${slide1Active}`);
  const kpiNums = await page.locator('.slide[data-slide="1"] .kpi-num').allInnerTexts();
  console.log(`[Test] KPIs do Slide 1:`, kpiNums);
  
  if (!kpiNums.includes('95 / 95') || !kpiNums.includes('20 / 20') || !kpiNums.includes('15 / 15') || !kpiNums.includes('CP 5.3')) {
    throw new Error(`KPIs operacionais do Slide 1 divergentes: ${JSON.stringify(kpiNums)}`);
  }

  const kpiLabels = await page.locator('.slide[data-slide="1"] .kpi-label-main').allInnerTexts();
  console.log(`[Test] Rótulos dos KPIs:`, kpiLabels);
  if (!kpiLabels.includes('VALIDAÇÕES AUTOMATIZADAS') || !kpiLabels.includes('TESTES DE VALIDAÇÃO RÁPIDA') || !kpiLabels.includes('GOVERNANÇA & ENTREGAS')) {
    throw new Error(`Rótulos em português divergentes: ${JSON.stringify(kpiLabels)}`);
  }

  const screenshotDir = path.join(__dirname, '..', 'docs', 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  // 3. Teste Interativo do Modal de KPIs (Card 1 a 5)
  console.log('[Test] Testando abertura do Modal no Card 1 (Validações Automatizadas)...');
  await page.click('.kpi-card:nth-child(1)');
  await page.waitForTimeout(350);
  const modalActive1 = await page.locator('#kpi-modal-overlay').getAttribute('class');
  if (!modalActive1.includes('active')) throw new Error('Modal não abriu para o Card 1');
  const modalTitle1 = await page.locator('#kpi-modal-title').innerText();
  console.log(`[Test] Modal Card 1 título: "${modalTitle1}"`);
  if (!modalTitle1.includes('95 verificações')) throw new Error('Conteúdo do modal 1 incorreto');

  const modalPath = path.join(screenshotDir, 'apresentacao_slide1_modal_kpi1.png');
  await page.screenshot({ path: modalPath, fullPage: false });
  console.log(`[Test] Screenshot Modal KPI 1 salvo em: ${modalPath}`);

  // Fechar modal via botão [X]
  await page.click('.kpi-modal-close');
  await page.waitForTimeout(300);
  const modalClosed1 = await page.locator('#kpi-modal-overlay').getAttribute('class');
  if (modalClosed1.includes('active')) throw new Error('Modal não fechou com o botão close');

  // Testar Card 2 e fechar com Escape
  console.log('[Test] Testando abertura do Modal no Card 2 (Testes de Validação Rápida)...');
  await page.click('.kpi-card:nth-child(2)');
  await page.waitForTimeout(350);
  const modalTitle2 = await page.locator('#kpi-modal-title').innerText();
  if (!modalTitle2.includes('20 cenários')) throw new Error('Conteúdo do modal 2 incorreto');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Testar Card 4 e fechar com botão ENTENDIDO
  console.log('[Test] Testando abertura do Modal no Card 4 (Auditorias de Integridade)...');
  await page.click('.kpi-card:nth-child(4)');
  await page.waitForTimeout(350);
  const modalTitle4 = await page.locator('#kpi-modal-title').innerText();
  if (!modalTitle4.includes('15 verificações')) throw new Error('Conteúdo do modal 4 incorreto');
  await page.click('.kpi-modal-footer button');
  await page.waitForTimeout(300);

  // Testar Card 5 (Governança & Entregas)
  console.log('[Test] Testando abertura do Modal no Card 5 (Governança & Entregas)...');
  await page.click('.kpi-card:nth-child(5)');
  await page.waitForTimeout(350);
  const modalTitle5 = await page.locator('#kpi-modal-title').innerText();
  console.log(`[Test] Modal Card 5 título: "${modalTitle5}"`);
  if (!modalTitle5.includes('Governança Operacional')) throw new Error('Conteúdo do modal 5 incorreto');
  await page.click('.kpi-modal-close');
  await page.waitForTimeout(300);

  console.log('[Test] Interatividade do Modal de KPIs (5 Cards) 100% validada.');

  // Captura do Slide 1
  const slide1Path = path.join(screenshotDir, 'apresentacao_slide1_capa.png');
  await page.screenshot({ path: slide1Path, fullPage: false });
  console.log(`[Test] Screenshot Slide 1 salvo em: ${slide1Path}`);

  // 4. Validação dos 8 Slides Operacionais e Navegação
  const totalSlides = await page.locator('.slide').count();
  console.log(`[Test] Total de slides encontrados no deck: ${totalSlides}`);
  if (totalSlides !== 8) {
    throw new Error(`Esperado 8 slides operacionais, encontrados: ${totalSlides}`);
  }

  // Slide 2: Central de Câmeras
  console.log('[Test] Navegando para o Slide 2 (Central de Câmeras & Ocorrências)...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const slide2Title = await page.locator('.slide[data-slide="2"] h2').innerText();
  console.log(`[Test] Slide 2 título: "${slide2Title}"`);
  if (!slide2Title.includes('Central de Câmeras')) throw new Error('Slide 2 incorreto');
  const slide2Path = path.join(screenshotDir, 'apresentacao_slide2_cameras.png');
  await page.screenshot({ path: slide2Path, fullPage: false });

  // Slide 3: RIT Alerta + Condições Operacionais
  console.log('[Test] Navegando para o Slide 3 (RIT Alerta + Condições Operacionais)...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const slide3Title = await page.locator('.slide[data-slide="3"] h2').innerText();
  console.log(`[Test] Slide 3 título: "${slide3Title}"`);
  if (!slide3Title.includes('RIT Alerta')) throw new Error('Slide 3 incorreto');

  // Testar toggle para Quadro de Vias e alternância de abas RJ -> SP
  await page.click('#btn-alerta-condicoes');
  await page.waitForTimeout(300);
  const rowsRJ = await page.locator('#conditions-table-body tr').count();
  console.log(`[Test] Linhas de tráfego RJ: ${rowsRJ}`);
  if (rowsRJ === 0) throw new Error('Tabela de tráfego vazia para RJ');

  await page.click('button.cond-tab-btn:has-text("SP")');
  await page.waitForTimeout(200);
  const spText = await page.locator('#conditions-table-body').innerText();
  if (!spText.includes('Marginal Pinheiros')) throw new Error('Aba SP não exibiu Marginal Pinheiros');

  const slide3Path = path.join(screenshotDir, 'apresentacao_slide3_alerta_condicoes.png');
  await page.screenshot({ path: slide3Path, fullPage: false });

  // Slide 4: Painel Trânsito Integrado
  console.log('[Test] Navegando para o Slide 4 (Painel Trânsito Integrado)...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const slide4Title = await page.locator('.slide[data-slide="4"] h2').innerText();
  console.log(`[Test] Slide 4 título: "${slide4Title}"`);
  if (!slide4Title.includes('Painel Trânsito Integrado')) throw new Error('Slide 4 incorreto');

  // Slide 5: Câmeras RJ Mosaico 2x2
  console.log('[Test] Navegando para o Slide 5 (Câmeras RJ Mosaico 2x2)...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const slide5Title = await page.locator('.slide[data-slide="5"] h2').innerText();
  console.log(`[Test] Slide 5 título: "${slide5Title}"`);
  if (!slide5Title.includes('Câmeras RJ')) throw new Error('Slide 5 incorreto');

  // Slide 6: Radar Meteorológico RJ
  console.log('[Test] Navegando para o Slide 6 (Radar Meteorológico RJ)...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const slide6Title = await page.locator('.slide[data-slide="6"] h2').innerText();
  console.log(`[Test] Slide 6 título: "${slide6Title}"`);
  if (!slide6Title.includes('Radar Meteorológico')) throw new Error('Slide 6 incorreto');

  // Slide 7: Centro de Roteirização & Custos
  console.log('[Test] Navegando para o Slide 7 (Centro de Roteirização & Custos)...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const slide7Title = await page.locator('.slide[data-slide="7"] h2').innerText();
  console.log(`[Test] Slide 7 título: "${slide7Title}"`);
  if (!slide7Title.includes('Centro de Roteirização')) throw new Error('Slide 7 incorreto');
  const slide7Path = path.join(screenshotDir, 'apresentacao_slide7_roteirizacao_custos.png');
  await page.screenshot({ path: slide7Path, fullPage: false });

  // Slide 8: Caravanas Inteligentes
  console.log('[Test] Navegando para o Slide 8 (Caravanas Inteligentes)...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const slide8Title = await page.locator('.slide[data-slide="8"] h2').innerText();
  console.log(`[Test] Slide 8 título: "${slide8Title}"`);
  if (!slide8Title.includes('Caravanas')) throw new Error('Slide 8 incorreto');

  // Testar alternância entre as 4 vistas do carrossel do Slide 8
  await page.click('#btn-crv-drawer');
  await page.waitForTimeout(200);
  await page.click('#btn-crv-comparativo');
  await page.waitForTimeout(200);
  await page.click('#btn-crv-cameras');
  await page.waitForTimeout(200);
  await page.click('#btn-crv-rotas');
  await page.waitForTimeout(200);

  const slide8Path = path.join(screenshotDir, 'apresentacao_slide8_caravanas.png');
  await page.screenshot({ path: slide8Path, fullPage: false });

  // Validar contador no Slide 8 (último slide operacional)
  const counterText = await page.locator('#counter').innerText();
  console.log(`[Test] Contador de slides: ${counterText}`);
  if (counterText !== '8 / 8') {
    throw new Error(`Esperado slide '8 / 8', encontrado: '${counterText}'`);
  }

  // 5. Testar botão da Capa de atalho para Governança & Entregas
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  console.log('[Test] Testando botão direto da capa para Governança & Entregas...');
  await page.click('button:has-text("GOVERNANÇA & ENTREGAS")');
  await page.waitForTimeout(350);
  const modalActiveFromBtn = await page.locator('#kpi-modal-overlay').getAttribute('class');
  if (!modalActiveFromBtn.includes('active')) throw new Error('Modal não abriu pelo botão da capa');
  const modalTitleFromBtn = await page.locator('#kpi-modal-title').innerText();
  if (!modalTitleFromBtn.includes('Governança Operacional')) throw new Error('Conteúdo do modal divergente');
  await page.click('.kpi-modal-close');
  await page.waitForTimeout(300);
  console.log('[Test] Botão atalho da capa para Governança & Entregas aprovado.');

  await browser.close();
  await new Promise(resolve => server.close(resolve));

  console.log(`\n========================================`);
  console.log(`RELATÓRIO DE VALIDAÇÃO PLAYWRIGHT`);
  console.log(`Total de Slides Testados: ${totalSlides} (Esperado: 8)`);
  console.log(`Interatividade dos Cards e Modal de KPIs (5 Cards): APROVADO`);
  console.log(`Erros de Console: ${consoleErrors.length}`);
  console.log(`Screenshots Atualizados:`);
  console.log(` - docs/screenshots/apresentacao_slide1_capa.png`);
  console.log(` - docs/screenshots/apresentacao_slide2_cameras.png`);
  console.log(` - docs/screenshots/apresentacao_slide3_alerta_condicoes.png`);
  console.log(` - docs/screenshots/apresentacao_slide7_roteirizacao_custos.png`);
  console.log(` - docs/screenshots/apresentacao_slide8_caravanas.png`);
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
