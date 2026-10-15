/**
 * scripts/reproduce-fase1-audit.js
 * Fase 1 - Reprodução Limpa e Auditoria em Produção (agenterit.com.br)
 * Executa em nova sessão Chromium sem reaproveitar cache, cookies, Service Worker ou LocalStorage.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runAudit() {
  const timestamp = new Date().toISOString();
  console.log(`[FASE 1 AUDIT] Iniciando reprodução em ${timestamp}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AuditBot/1.0'
  });

  const page = await context.newPage();

  // Injetar token de autenticação no LocalStorage antes do carregamento da página
  await page.addInitScript(() => {
    try {
      localStorage.setItem('rit_token', 'audit_token_fase1_prod');
      localStorage.setItem('rit_user', JSON.stringify({
        id: 'USR-AUDIT',
        nome: 'Fábio Paixão',
        email: 'fabio.paixao@example.com',
        funcao: 'COORD OPERACAO TRANSPORTES',
        perfil: 'Administrador'
      }));
    } catch(e) {}
  });

  const networkRequests = [];
  const networkResponses = [];
  const consoleMessages = [];
  const pageErrors = [];

  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });

  page.on('pageerror', err => {
    pageErrors.push({
      message: err.message,
      stack: err.stack
    });
  });

  page.on('request', req => {
    networkRequests.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType()
    });
  });

  page.on('response', async res => {
    const entry = {
      url: res.url(),
      status: res.status(),
      statusText: res.statusText(),
      headers: res.headers(),
      resourceType: res.request().resourceType()
    };
    if (res.url().includes('/api/') || res.url().includes('version') || res.url().includes('rit-fly')) {
      try {
        const text = await res.text();
        entry.bodySnippet = text.slice(0, 1000);
      } catch (e) {
        entry.bodySnippet = `[Error reading body: ${e.message}]`;
      }
    }
    networkResponses.push(entry);
  });

  console.log('[FASE 1 AUDIT] Navegando para https://agenterit.com.br/dashboard.html...');
  const mainNav = await page.goto('https://agenterit.com.br/dashboard.html', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  const finalUrl = page.url();
  const htmlStatus = mainNav ? mainNav.status() : null;
  const rawHtml = await page.content();

  // Verificar se elementos novos do v1.1 estão no HTML bruto
  const htmlAudit = {
    hasFlyBtnTutorial: rawHtml.includes('fly-btn-tutorial'),
    hasRitFlyV1_1: rawHtml.includes('v1.1'),
    hasRitFlyMapLayers: rawHtml.includes('rit-fly-map-layers') || rawHtml.includes('satélite') || rawHtml.includes('satelite'),
    hasRitFlyAirlineFilter: rawHtml.includes('rit-fly-airline-filter') || rawHtml.includes('companhia aérea'),
    hasVersionBadge: rawHtml.includes('Versão:') || rawHtml.includes('Build:'),
    htmlLength: rawHtml.length
  };

  await page.waitForTimeout(2000);

  // Clicar na aba RIT FLY (#tab-btn-rit-fly)
  let ritFlyTabClicked = false;
  try {
    const tab = await page.$('#tab-btn-rit-fly, button[data-tab="tab-rit-fly"]');
    if (tab) {
      await tab.click();
      ritFlyTabClicked = true;
      console.log('[FASE 1 AUDIT] Aba #tab-btn-rit-fly encontrada e clicada com sucesso.');
      await page.waitForTimeout(3000);
    } else {
      console.log('[FASE 1 AUDIT] Aba #tab-btn-rit-fly NÃO encontrada no DOM.');
    }
  } catch (e) {
    console.warn('[FASE 1 AUDIT] Erro ao clicar na aba RIT FLY:', e.message);
  }

  // Capturar screenshot do dashboard com a aba RIT FLY ativa
  const screenshotDashboardPath = path.resolve(__dirname, '..', 'reproducao-dashboard.png');
  await page.screenshot({ path: screenshotDashboardPath, fullPage: false });
  console.log(`[FASE 1 AUDIT] Screenshot salvo em: ${screenshotDashboardPath}`);

  // Inspeções específicas do RIT FLY no DOM do navegador
  const domAudit = await page.evaluate(() => {
    // 1. Botão de mudança de camada
    const layerControls = Array.from(document.querySelectorAll('#fly-select-map-layer, .leaflet-control-layers, .leaflet-control-layers-toggle, [data-action="change-layer"], .fly-layer-select'));
    
    // 2. Opções de camada
    const allTextNodes = Array.from(document.querySelectorAll('button, label, span, div, a, select, option'));
    const hasSat = allTextNodes.some(el => el.textContent && el.textContent.trim().toLowerCase().includes('satélite'));
    const hasTerr = allTextNodes.some(el => el.textContent && el.textContent.trim().toLowerCase().includes('terreno'));
    const hasTrans = allTextNodes.some(el => el.textContent && el.textContent.trim().toLowerCase().includes('trânsito'));

    // 5. Aeronaves no mapa
    const planeMarkers = document.querySelectorAll('.leaflet-marker-icon.aircraft-marker, .aircraft-icon, .plane-marker, [data-aircraft-id], svg.plane-icon');
    const allMarkers = document.querySelectorAll('.leaflet-marker-icon');

    // 6. Filtro por companhia
    const airlineFilter = document.querySelector('#fly-airline-pills, .fly-airline-pill, select[name="airline"], .airline-select, [data-filter="airline"]');
    const airlineOptions = allTextNodes.filter(el => /latam|gol|azul|voepass|companhia/i.test(el.textContent));

    // 7. Tooltips nos controles
    const elementsWithTooltip = document.querySelectorAll('[data-tooltip], [title], .tooltip');

    // 8. Painel lateral / drawer de voo
    const flightDrawer = document.querySelector('#fly-flight-drawer, #flight-detail-drawer, .flight-drawer, .flight-sidebar, #rit-fly-flight-panel');
    const flightDrawerVisible = flightDrawer ? window.getComputedStyle(flightDrawer).display !== 'none' : false;

    // Aeroportos e contadores
    const airportCards = document.querySelectorAll('.fly-airport-card, .airport-card, .rit-fly-hub-card, [data-iata], .rit-fly-card');
    
    // KPIs de voo
    const voosCounterEl = document.querySelector('#fly-kpi-voos-num, #fly-kpi-voos, #fly-total-voos, .voos-monitorados-count');
    const voosCounterText = voosCounterEl ? voosCounterEl.textContent.trim() : null;

    // RIT FLY AI Chat Input
    const aiChatInput = document.querySelector('#fly-ai-input, #rit-fly-ai-input, input[placeholder*="pergunta"], textarea[placeholder*="pergunta"]');
    const aiChatContainer = document.querySelector('#fly-ai-messages-container, #fly-ai-messages, .rit-fly-ai-history, #painel-rit-fly-ai');

    return {
      hasLayerControl: layerControls.length > 0,
      layerControlsCount: layerControls.length,
      hasSatelliteOption: hasSat,
      hasTerrainOption: hasTerr,
      hasTrafficOption: hasTrans,
      planeMarkersCount: planeMarkers.length,
      allMarkersCount: allMarkers.length,
      hasAirlineFilter: !!airlineFilter || airlineOptions.length > 0,
      airlineOptionsCount: airlineOptions.length,
      elementsWithTooltipCount: elementsWithTooltip.length,
      hasFlightDrawer: !!flightDrawer,
      flightDrawerVisible,
      airportCardsCount: airportCards.length,
      voosCounterText,
      hasAiChatInput: !!aiChatInput,
      hasAiChatContainer: !!aiChatContainer
    };
  });

  // Testar chamadas diretas às APIs
  console.log('[FASE 1 AUDIT] Testando endpoints de API diretamente pelo navegador...');
  const apiFlightsEvaluation = await page.evaluate(async () => {
    const endpoints = [
      '/api/rit-fly/flights',
      '/api/rit-fly/status',
      '/api/rit-fly/airports',
      '/api/rit-fly/stats',
      '/api/version'
    ];
    const results = {};
    for (const ep of endpoints) {
      try {
        const start = performance.now();
        const res = await fetch(ep);
        const duration = Math.round(performance.now() - start);
        let data = null;
        try {
          data = await res.json();
        } catch (je) {
          data = await res.text();
        }
        results[ep] = {
          status: res.status,
          ok: res.ok,
          durationMs: duration,
          data
        };
      } catch (err) {
        results[ep] = {
          status: 'NETWORK_ERROR',
          error: err.message
        };
      }
    }
    return results;
  });

  // Navegar para apresentacao.html
  console.log('[FASE 1 AUDIT] Navegando para https://agenterit.com.br/apresentacao.html...');
  await page.goto('https://agenterit.com.br/apresentacao.html', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  const screenshotApresentacaoPath = path.resolve(__dirname, '..', 'reproducao-apresentacao.png');
  await page.screenshot({ path: screenshotApresentacaoPath, fullPage: false });

  const apresentacaoAudit = await page.evaluate(() => {
    const textContent = document.body.textContent || '';
    const slide9El = document.querySelector('[data-slide="9"]');
    const slide9Text = slide9El ? slide9El.textContent : '';
    const hasRitFly = /RIT\s*FLY/i.test(textContent);
    const hasAviationSection = /intelig[êe]ncia a[ée]rea|monitoramento de aeronaves/i.test(textContent);
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, .section-title, .slide-title')).map(h => h.textContent.trim());
    return {
      hasRitFly,
      hasAviationSection,
      hasSlide9: !!slide9El,
      slide9Snippet: slide9Text.slice(0, 300),
      headings: headings.slice(0, 30),
      bodyLength: textContent.length
    };
  });

  await browser.close();

  // Filtrar arquivos JS e CSS carregados
  const jsFiles = networkResponses
    .filter(r => r.resourceType === 'script' || r.url.endsWith('.js') || r.url.includes('.js?'))
    .map(r => ({
      url: r.url,
      status: r.status,
      etag: r.headers['etag'] || null,
      cacheControl: r.headers['cache-control'] || null,
      lastModified: r.headers['last-modified'] || null
    }));

  const cssFiles = networkResponses
    .filter(r => r.resourceType === 'stylesheet' || r.url.endsWith('.css') || r.url.includes('.css?'))
    .map(r => ({
      url: r.url,
      status: r.status,
      etag: r.headers['etag'] || null,
      cacheControl: r.headers['cache-control'] || null,
      lastModified: r.headers['last-modified'] || null
    }));

  const apiCalls = networkResponses
    .filter(r => r.resourceType === 'fetch' || r.resourceType === 'xhr' || r.url.includes('/api/'))
    .map(r => ({
      url: r.url,
      status: r.status,
      bodySnippet: r.bodySnippet || null
    }));

  const auditReport = {
    metadata: {
      timestamp,
      testedDomain: 'https://agenterit.com.br',
      finalUrl,
      htmlStatus,
      ritFlyTabClicked
    },
    htmlAudit,
    domAudit,
    apresentacaoAudit,
    apiFlightsEvaluation,
    jsFiles,
    cssFiles,
    apiCalls,
    consoleMessages,
    pageErrors
  };

  const reportPath = path.resolve(__dirname, '..', 'reproducao-fase1.json');
  fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2), 'utf8');
  console.log(`[FASE 1 AUDIT] Relatório consolidado salvo em: ${reportPath}`);

  return auditReport;
}

runAudit()
  .then(res => {
    console.log('\n======================================================');
    console.log('             RESULTADOS AUDITORIA FASE 1              ');
    console.log('======================================================');
    console.log(`- HTML Status: ${res.metadata.htmlStatus}`);
    console.log(`- HTML possui v1.1: ${res.htmlAudit.hasRitFlyV1_1}`);
    console.log(`- HTML possui tutorial: ${res.htmlAudit.hasFlyBtnTutorial}`);
    console.log(`- Layer Control no DOM: ${res.domAudit.hasLayerControl}`);
    console.log(`- Opção Satélite: ${res.domAudit.hasSatelliteOption}`);
    console.log(`- Opção Terreno: ${res.domAudit.hasTerrainOption}`);
    console.log(`- Opção Trânsito: ${res.domAudit.hasTrafficOption}`);
    console.log(`- Marcadores de Aeronave: ${res.domAudit.planeMarkersCount}`);
    console.log(`- Marcadores Totais no Mapa: ${res.domAudit.allMarkersCount}`);
    console.log(`- Filtro de Companhias: ${res.domAudit.hasAirlineFilter}`);
    console.log(`- Elementos com Tooltip: ${res.domAudit.elementsWithTooltipCount}`);
    console.log(`- Drawer de Detalhes de Voo: ${res.domAudit.hasFlightDrawer}`);
    console.log(`- Chat Input RIT FLY AI: ${res.domAudit.hasAiChatInput}`);
    console.log(`- RIT FLY na Apresentação: ${res.apresentacaoAudit.hasRitFly}`);
    console.log(`- API /api/rit-fly/flights: ${res.apiFlightsEvaluation['/api/rit-fly/flights']?.status} (${JSON.stringify(res.apiFlightsEvaluation['/api/rit-fly/flights']?.data?.flights?.length ?? res.apiFlightsEvaluation['/api/rit-fly/flights']?.data?.data?.length ?? 0)} voos)`);
    console.log(`- API /api/rit-fly/status: ${res.apiFlightsEvaluation['/api/rit-fly/status']?.status}`);
    console.log(`- API /api/version: ${res.apiFlightsEvaluation['/api/version']?.status}`);
    console.log(`- Erros no Console: ${res.consoleMessages.filter(m => m.type === 'error').length}`);
    console.log(`- Erros de Página: ${res.pageErrors.length}`);
    console.log('======================================================\n');
  })
  .catch(err => {
    console.error('[FASE 1 AUDIT] Erro crítico na execução da auditoria:', err);
    process.exit(1);
  });
