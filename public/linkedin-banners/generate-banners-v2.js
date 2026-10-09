const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname);
const ASSETS_DIR = path.join(OUTPUT_DIR, 'assets');

function getBase64Image(filename) {
    const fPath = path.join(ASSETS_DIR, filename);
    if (!fs.existsSync(fPath)) return '';
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/svg+xml');
    return `data:${mime};base64,${fs.readFileSync(fPath).toString('base64')}`;
}

const imgGloboNovo = getBase64Image('globo_novo.jpg');
const imgAvatar = getBase64Image('fabio_avatar.png');

function getBannerV2Html(variant = 'A') {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1584px;
    height: 396px;
    overflow: hidden;
    background: #040813;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    color: #ffffff;
    position: relative;
  }

  /* Fundo degradê de profundidade cibernética */
  .bg-layer {
    position: absolute;
    inset: 0;
    background: 
      radial-gradient(circle at 65% 35%, rgba(0, 209, 255, 0.22) 0%, transparent 55%),
      radial-gradient(circle at 90% 80%, rgba(245, 158, 11, 0.14) 0%, transparent 50%),
      radial-gradient(circle at 20% 50%, rgba(2, 132, 199, 0.16) 0%, transparent 45%),
      linear-gradient(135deg, #02050e 0%, #061022 50%, #030814 100%);
    z-index: 1;
  }

  /* Imagem Oficial do Globo Digital de Alta Resolução */
  .bg-globe {
    position: absolute;
    ${variant === 'A' 
      ? 'right: 180px; top: -75px; width: 660px; height: 550px; opacity: 0.52;' 
      : 'right: 40px; top: -65px; width: 620px; height: 530px; opacity: 0.58;'
    }
    background-image: url('${imgGloboNovo}');
    background-size: cover;
    background-position: center;
    mix-blend-mode: screen;
    filter: drop-shadow(0 0 45px rgba(0, 209, 255, 0.45)) contrast(1.15) brightness(1.05);
    mask-image: radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 48%, rgba(0,0,0,0.85) 65%, transparent 85%);
    -webkit-mask-image: radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 48%, rgba(0,0,0,0.85) 65%, transparent 85%);
    z-index: 2;
  }

  /* Linhas e grade de malha viária inteligente */
  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba(0, 209, 255, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 209, 255, 0.035) 1px, transparent 1px);
    background-size: 44px 44px;
    z-index: 2;
  }

  .banner-container {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    padding: 22px 42px 22px 38px;
  }

  /* Safe Zone para a foto de perfil do LinkedIn (0 a 290px) */
  .avatar-safe-zone {
    width: 290px;
    flex-shrink: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding-top: 14px;
    padding-left: 6px;
  }

  .role-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(0, 209, 255, 0.3);
    padding: 6px 14px;
    border-radius: 30px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.6px;
    color: #38bdf8;
    text-transform: uppercase;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    width: fit-content;
  }

  .role-badge .pulse-dot {
    width: 7px;
    height: 7px;
    background: #00d1ff;
    border-radius: 50%;
    box-shadow: 0 0 10px #00d1ff;
  }

  /* Conteúdo Principal */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 18px;
    padding-right: 24px;
  }

  /* Badge do Sistema de Apoio à Mobilidade Urbana */
  .system-badge-container {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .system-badge {
    background: linear-gradient(90deg, rgba(0, 209, 255, 0.22), rgba(2, 132, 199, 0.08));
    border-left: 3.5px solid #00d1ff;
    border-top: 1px solid rgba(0, 209, 255, 0.3);
    border-bottom: 1px solid rgba(0, 209, 255, 0.3);
    border-right: 1px solid rgba(0, 209, 255, 0.3);
    padding: 4px 14px;
    border-radius: 4px;
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 1.1px;
    color: #38bdf8;
    text-transform: uppercase;
    box-shadow: 0 2px 10px rgba(0, 209, 255, 0.15);
  }

  .title-group {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 4px;
  }

  .title-main {
    font-size: 42px;
    font-weight: 900;
    letter-spacing: -0.5px;
    line-height: 1.05;
    background: linear-gradient(90deg, #ffffff 30%, #e0f2fe 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 0 28px rgba(0, 209, 255, 0.35);
  }

  .title-sub {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.2px;
    background: linear-gradient(90deg, #00d1ff 0%, #38bdf8 55%, #f59e0b 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tagline {
    font-size: 14px;
    font-weight: 500;
    color: #94a3b8;
    margin-bottom: 16px;
    line-height: 1.35;
    max-width: 780px;
  }

  .tagline strong {
    color: #f1f5f9;
    font-weight: 700;
  }

  /* Grid com os 3 Pilares de Ganhos (sem privacy by design, com mais espaço e leitura clara) */
  .benefits-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    max-width: 820px;
  }

  .benefit-card {
    background: rgba(11, 19, 36, 0.78);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-top: 2px solid #00d1ff;
    border-radius: 10px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .benefit-card.amber-top {
    border-top-color: #f59e0b;
  }

  .benefit-card.emerald-top {
    border-top-color: #10b981;
  }

  .benefit-card-header {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .benefit-icon {
    font-size: 16px;
  }

  .benefit-title {
    font-size: 12px;
    font-weight: 800;
    color: #f8fafc;
    letter-spacing: 0.2px;
  }

  .benefit-desc {
    font-size: 10.5px;
    font-weight: 500;
    color: #94a3b8;
    line-height: 1.25;
  }

  /* Painel Lateral Direito: Links & Chamada 100% em Português */
  .right-panel {
    width: 370px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    z-index: 20;
  }

  .cta-card {
    background: linear-gradient(135deg, rgba(11, 20, 38, 0.92), rgba(6, 12, 24, 0.96));
    border: 1px solid rgba(0, 209, 255, 0.4);
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cta-card-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 800;
    color: #00d1ff;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .status-badge {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid #10b981;
    color: #34d399;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .status-badge::before {
    content: '';
    width: 5px;
    height: 5px;
    background: #10b981;
    border-radius: 50%;
  }

  .link-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .link-item {
    background: rgba(2, 6, 23, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .link-item.amber-border {
    border-color: rgba(245, 158, 11, 0.35);
  }

  .link-item-left {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .link-icon {
    font-size: 15px;
    color: #38bdf8;
  }

  .link-icon.amber {
    color: #f59e0b;
  }

  .link-labels {
    display: flex;
    flex-direction: column;
  }

  .link-role {
    font-size: 9.5px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .link-url {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 700;
    color: #f8fafc;
    letter-spacing: -0.2px;
  }

  .link-url.amber-text {
    color: #fde68a;
    font-size: 11.5px;
  }

  .link-badge {
    background: rgba(0, 209, 255, 0.15);
    color: #38bdf8;
    font-size: 9.5px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 5px;
  }

  .link-badge.amber {
    background: rgba(245, 158, 11, 0.18);
    color: #fbbf24;
  }

  .gov-notice {
    font-size: 9.5px;
    color: #64748b;
    line-height: 1.35;
    text-align: center;
    padding: 0 4px;
  }

  .gov-notice strong {
    color: #94a3b8;
  }

</style>
</head>
<body>
  <div class="bg-layer"></div>
  <div class="grid-overlay"></div>
  <div class="bg-globe"></div>

  <div class="banner-container">
    
    <!-- Safe zone para o avatar do LinkedIn -->
    <div class="avatar-safe-zone">
      <div class="role-badge">
        <span class="pulse-dot"></span>
        <span>Idealizador & Liderança Técnica</span>
      </div>
    </div>

    <!-- Conteúdo Principal com as alterações solicitadas -->
    <div class="main-content">
      <div class="system-badge-container">
        <div class="system-badge">SISTEMA DE APOIO À MOBILIDADE URBANA</div>
      </div>

      <div class="title-group">
        <h1 class="title-main">AGENTE RIT</h1>
        <h2 class="title-sub">ROTA INTELIGENTE DE TRANSPORTE</h2>
      </div>

      <p class="tagline">
        Plataforma preditiva corporativa: <strong>otimização de rotas e frotas</strong>, integração de dados de trânsito em tempo real e <strong>máxima segurança operacional</strong>.
      </p>

      <!-- 3 Pilares de Ganhos Operacionais (sem o box de privacy by design) -->
      <div class="benefits-grid">
        <div class="benefit-card">
          <div class="benefit-card-header">
            <span class="benefit-icon">🛡️</span>
            <span class="benefit-title">Segurança Preditiva</span>
          </div>
          <span class="benefit-desc">Alertas em tempo real com dados de segurança do OTT e Fogo Cruzado.</span>
        </div>

        <div class="benefit-card amber-top">
          <div class="benefit-card-header">
            <span class="benefit-icon">⚡</span>
            <span class="benefit-title">Otimização de Trajetos & Custos</span>
          </div>
          <span class="benefit-desc">Roteirização com impacto de tráfego e score multimodal inteligente.</span>
        </div>

        <div class="benefit-card emerald-top">
          <div class="benefit-card-header">
            <span class="benefit-icon">🎥</span>
            <span class="benefit-title">Monitoramento Integrado</span>
          </div>
          <span class="benefit-desc">Visão centralizada de milhares de câmeras públicas da malha viária.</span>
        </div>
      </div>
    </div>

    <!-- Painel Lateral: Links 100% em Português -->
    <div class="right-panel">
      <div class="cta-card">
        <div class="cta-card-title">
          <span>Acesso à Plataforma</span>
          <div class="status-badge">Operacional</div>
        </div>

        <div class="link-box">
          <div class="link-item">
            <div class="link-item-left">
              <span class="link-icon">🌐</span>
              <div class="link-labels">
                <span class="link-role">Portal Oficial</span>
                <span class="link-url">www.agenterit.com.br</span>
              </div>
            </div>
            <span class="link-badge">No Ar</span>
          </div>

          <div class="link-item amber-border">
            <div class="link-item-left">
              <span class="link-icon amber">📖</span>
              <div class="link-labels">
                <span class="link-role">Como Funciona (Apresentação)</span>
                <span class="link-url amber-text">agenterit.com.br/apresentacao.html</span>
              </div>
            </div>
            <span class="link-badge amber">Apresentação</span>
          </div>
        </div>

        <div class="gov-notice">
          ℹ️ <strong>Apresentação pública demonstrativa</strong>.<br>
          Acesso ao sistema operacional restrito com login de comando.
        </div>
      </div>
    </div>

  </div>
</body>
</html>
`;
}

// Template de Mockup do Perfil com o novo Banner
function getMockupProfileHtml(bannerBase64) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1584px;
    height: 700px;
    background: #0b1120;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    color: #ffffff;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 30px;
  }
  .card {
    width: 1524px;
    background: #1e293b;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0,0,0,0.6);
    border: 1px solid rgba(255,255,255,0.1);
    position: relative;
  }
  .banner-wrap {
    width: 100%;
    height: 381px;
    background-image: url('${bannerBase64}');
    background-size: cover;
    background-position: center;
    position: relative;
  }
  .profile-bar {
    position: relative;
    padding: 0 40px 30px 40px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }
  .avatar-container {
    position: absolute;
    top: -100px;
    left: 40px;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    border: 6px solid #1e293b;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    background: #0f172a;
    overflow: hidden;
  }
  .avatar-container img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .info-group {
    margin-left: 210px;
    padding-top: 16px;
  }
  .name {
    font-size: 26px;
    font-weight: 800;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .headline {
    font-size: 15px;
    font-weight: 600;
    color: #38bdf8;
    margin-top: 4px;
  }
  .location {
    font-size: 13px;
    color: #94a3b8;
    margin-top: 4px;
  }
  .btn-contact {
    background: #0284c7;
    color: #ffffff;
    font-weight: 700;
    font-size: 14px;
    padding: 10px 24px;
    border-radius: 24px;
    border: none;
    box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
    margin-bottom: 8px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="banner-wrap"></div>
    <div class="profile-bar">
      <div class="avatar-container">
        <img src="${imgAvatar}" alt="Fábio Paixão">
      </div>
      <div class="info-group">
        <h2 class="name">Fábio Paixão <span style="font-size: 16px; color: #00d1ff;">✦ 1º</span></h2>
        <p class="headline">Agente RIT &bullet; Coordenador de Operações & Mobilidade Inteligente &bullet; Sistema de Apoio à Mobilidade Urbana</p>
        <p class="location">Rio de Janeiro, Brasil &bullet; Mais de 500 conexões &bullet; www.agenterit.com.br</p>
      </div>
      <button class="btn-contact">Mensagem</button>
    </div>
  </div>
</body>
</html>
`;
}

async function renderUpdatedBanners() {
    console.log('🚀 RENDERIZANDO NOVO BANNER LINKEDIN V2 COM GLOBO E TEXTO ATUALIZADO...');

    const browser = await chromium.launch({ headless: true });

    // 1. Gera Variação A (1x e 2x Retina)
    const context1x = await browser.newContext({
        viewport: { width: 1584, height: 396 },
        deviceScaleFactor: 1
    });
    const page1x = await context1x.newPage();
    await page1x.setContent(getBannerV2Html('A'), { waitUntil: 'networkidle' });
    const path1x = path.join(OUTPUT_DIR, 'linkedin-banner-modelo1-v2.png');
    await page1x.screenshot({ path: path1x, fullPage: false });
    console.log(`  ✅ Salvo V2 (1584x396): ${path.basename(path1x)}`);
    await context1x.close();

    const context2x = await browser.newContext({
        viewport: { width: 1584, height: 396 },
        deviceScaleFactor: 2
    });
    const page2x = await context2x.newPage();
    await page2x.setContent(getBannerV2Html('A'), { waitUntil: 'networkidle' });
    const path2x = path.join(OUTPUT_DIR, 'linkedin-banner-modelo1-v2-retina-2x.png');
    await page2x.screenshot({ path: path2x, fullPage: false });
    console.log(`  ✅ Salvo V2 Retina 2x (3168x792): ${path.basename(path2x)}`);
    await context2x.close();

    // 2. Gera Mockup Atualizado do Perfil
    console.log('\nGerando Mockup com o Novo Banner...');
    const bannerV2Base64 = `data:image/png;base64,${fs.readFileSync(path1x).toString('base64')}`;
    const contextMockup = await browser.newContext({
        viewport: { width: 1584, height: 700 },
        deviceScaleFactor: 1
    });
    const pageMockup = await contextMockup.newPage();
    await pageMockup.setContent(getMockupProfileHtml(bannerV2Base64), { waitUntil: 'networkidle' });
    const pathMockup = path.join(OUTPUT_DIR, 'linkedin-perfil-mockup-v2.png');
    await pageMockup.screenshot({ path: pathMockup, fullPage: false });
    console.log(`  ✅ Mockup V2 salvo: ${path.basename(pathMockup)}`);
    await contextMockup.close();

    await browser.close();
    console.log('🎉 GERAÇÃO V2 CONCLUÍDA COM SUCESSO!');
}

renderUpdatedBanners().catch(err => {
    console.error('❌ Erro ao gerar banners V2:', err);
    process.exit(1);
});
