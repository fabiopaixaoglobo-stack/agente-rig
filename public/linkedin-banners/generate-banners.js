const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname);
const ASSETS_DIR = path.join(OUTPUT_DIR, 'assets');

// Helper para converter imagem local em Data URI Base64
function getBase64Image(filename) {
    const fPath = path.join(ASSETS_DIR, filename);
    if (!fs.existsSync(fPath)) return '';
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/svg+xml');
    return `data:${mime};base64,${fs.readFileSync(fPath).toString('base64')}`;
}

const imgGlobe = getBase64Image('media_1790778976325.png');
const imgCockpit = getBase64Image('media_1790778997808.png');
const imgRoute = getBase64Image('media_1790779021361.png');
const imgCameras = getBase64Image('media_1790779129597.jpg');
const imgAvatar = getBase64Image('fabio_avatar.png');

function getBanner1Html() {
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
    background: #050b14;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    color: #ffffff;
    position: relative;
  }

  /* Grid e Background Tecnológico */
  .bg-layer {
    position: absolute;
    inset: 0;
    background: 
      radial-gradient(circle at 85% 30%, rgba(0, 209, 255, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 50% 100%, rgba(245, 158, 11, 0.12) 0%, transparent 60%),
      radial-gradient(circle at 15% 50%, rgba(2, 132, 199, 0.18) 0%, transparent 45%),
      linear-gradient(135deg, #040810 0%, #081120 50%, #060c18 100%);
    z-index: 1;
  }

  /* Imagem sutil de rota e mapa no canto direito */
  .bg-mockup {
    position: absolute;
    right: -20px;
    top: -20px;
    width: 680px;
    height: 436px;
    background-image: url('${imgRoute}');
    background-size: cover;
    background-position: center;
    opacity: 0.28;
    filter: contrast(1.2) brightness(0.9);
    mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,1) 100%),
                linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,1) 70%, transparent 100%);
    -webkit-mask-image: linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);
    z-index: 2;
    border-radius: 16px;
  }

  /* Linhas de malha e circuitos */
  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    z-index: 2;
    opacity: 0.7;
  }

  /* Container Principal com Safe Zone para o Avatar */
  .banner-container {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    padding: 24px 44px 24px 40px;
  }

  /* Safe Zone Indicator / Espaço para o Avatar (260px) */
  .avatar-safe-zone {
    width: 290px;
    flex-shrink: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding-top: 14px;
    padding-left: 8px;
  }

  .creator-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(0, 209, 255, 0.25);
    padding: 6px 14px;
    border-radius: 30px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #38bdf8;
    text-transform: uppercase;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    width: fit-content;
  }

  .creator-badge .pulse-dot {
    width: 7px;
    height: 7px;
    background: #00d1ff;
    border-radius: 50%;
    box-shadow: 0 0 8px #00d1ff;
  }

  /* Área de Conteúdo Central */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 20px;
    padding-right: 28px;
  }

  .header-tag {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }

  .status-tag {
    background: linear-gradient(90deg, rgba(0, 209, 255, 0.15), rgba(2, 132, 199, 0.05));
    border-left: 3px solid #00d1ff;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1.2px;
    color: #7dd3fc;
    text-transform: uppercase;
  }

  .region-pill {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: #fbbf24;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.5px;
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
    text-shadow: 0 0 30px rgba(0, 209, 255, 0.3);
  }

  .title-sub {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.2px;
    background: linear-gradient(90deg, #00d1ff 0%, #38bdf8 50%, #f59e0b 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tagline {
    font-size: 14.5px;
    font-weight: 500;
    color: #94a3b8;
    margin-bottom: 16px;
    line-height: 1.35;
    max-width: 760px;
  }

  .tagline strong {
    color: #f1f5f9;
    font-weight: 700;
  }

  /* Grid dos 4 Pilares de Ganhos */
  .benefits-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    max-width: 820px;
  }

  .benefit-card {
    background: rgba(15, 23, 42, 0.7);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-top: 1px solid rgba(0, 209, 255, 0.3);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
  }

  .benefit-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .benefit-icon {
    font-size: 15px;
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

  /* Painel Lateral Direito: Links & Chamada */
  .right-panel {
    width: 360px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cta-card {
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(8, 17, 32, 0.95));
    border: 1px solid rgba(0, 209, 255, 0.35);
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
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

  .live-badge {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid #10b981;
    color: #34d399;
    padding: 2px 7px;
    border-radius: 20px;
    font-size: 9.5px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .live-badge::before {
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
    background: rgba(2, 6, 23, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .link-item-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .link-icon {
    font-size: 14px;
    color: #38bdf8;
  }

  .link-labels {
    display: flex;
    flex-direction: column;
  }

  .link-role {
    font-size: 9px;
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

  .link-badge {
    background: rgba(0, 209, 255, 0.15);
    color: #38bdf8;
    font-size: 9.5px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 5px;
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
  <div class="bg-mockup"></div>

  <div class="banner-container">
    
    <!-- Safe zone para a foto de perfil do LinkedIn (à esquerda) -->
    <div class="avatar-safe-zone">
      <div class="creator-badge">
        <span class="pulse-dot"></span>
        <span>Idealizador & Tech Lead</span>
      </div>
    </div>

    <!-- Conteúdo Principal e Ganhos -->
    <div class="main-content">
      <div class="header-tag">
        <div class="status-tag">INTELIGÊNCIA EM MOBILIDADE & CCO</div>
        <div class="region-pill">RJ + SP CONECTADOS</div>
      </div>

      <div class="title-group">
        <h1 class="title-main">AGENTE RIT</h1>
        <h2 class="title-sub">ROTA INTELIGENTE DE TRANSPORTE</h2>
      </div>

      <p class="tagline">
        Plataforma preditiva corporativa: <strong>otimização de rotas e frotas</strong>, integração de dados de trânsito em tempo real e <strong>máxima segurança operacional</strong>.
      </p>

      <!-- 4 Pilares de Ganhos Operacionais -->
      <div class="benefits-grid">
        <div class="benefit-card">
          <div class="benefit-card-header">
            <span class="benefit-icon">🛡️</span>
            <span class="benefit-title">Segurança Preditiva</span>
          </div>
          <span class="benefit-desc">Alertas em tempo real com OTT e Fogo Cruzado.</span>
        </div>

        <div class="benefit-card">
          <div class="benefit-card-header">
            <span class="benefit-icon">⚡</span>
            <span class="benefit-title">Redução de Custos</span>
          </div>
          <span class="benefit-desc">Roteirização com tráfego e score multimodal.</span>
        </div>

        <div class="benefit-card">
          <div class="benefit-card-header">
            <span class="benefit-icon">🎥</span>
            <span class="benefit-title">+4.200 Câmeras</span>
          </div>
          <span class="benefit-desc">Visão in-app de malhas públicas (COR & CET).</span>
        </div>

        <div class="benefit-card">
          <div class="benefit-card-header">
            <span class="benefit-icon">🔒</span>
            <span class="benefit-title">Privacy by Design</span>
          </div>
          <span class="benefit-desc">Conformidade LGPD estrita e Zero GPS invasivo.</span>
        </div>
      </div>
    </div>

    <!-- Painel Lateral: CTA e Links -->
    <div class="right-panel">
      <div class="cta-card">
        <div class="cta-card-title">
          <span>Acesso à Plataforma</span>
          <div class="live-badge">Operacional</div>
        </div>

        <div class="link-box">
          <div class="link-item">
            <div class="link-item-left">
              <span class="link-icon">🌐</span>
              <div class="link-labels">
                <span class="link-role">Site Oficial</span>
                <span class="link-url">www.agenterit.com.br</span>
              </div>
            </div>
            <span class="link-badge">Online</span>
          </div>

          <div class="link-item" style="border-color: rgba(245, 158, 11, 0.3);">
            <div class="link-item-left">
              <span class="link-icon" style="color: #f59e0b;">📖</span>
              <div class="link-labels">
                <span class="link-role">Como Funciona (Apresentação)</span>
                <span class="link-url" style="color: #fde68a; font-size: 11.5px;">agenterit.com.br/apresentacao.html</span>
              </div>
            </div>
            <span class="link-badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24;">Deck</span>
          </div>
        </div>

        <div class="gov-notice">
          ℹ️ <strong>Apresentação pública demonstrativa</strong>.<br>
          Acesso ao sistema operacional restrito com login CCO.
        </div>
      </div>
    </div>

  </div>
</body>
</html>
`;
}

function getBanner2Html() {
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
    background: #030712;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    color: #ffffff;
    position: relative;
  }

  .bg-layer {
    position: absolute;
    inset: 0;
    background: 
      radial-gradient(circle at 75% 20%, rgba(2, 132, 199, 0.22) 0%, transparent 55%),
      radial-gradient(circle at 95% 85%, rgba(16, 185, 129, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 10% 30%, rgba(0, 209, 255, 0.1) 0%, transparent 45%),
      linear-gradient(110deg, #020617 0%, #081226 60%, #030712 100%);
    z-index: 1;
  }

  .bg-globe {
    position: absolute;
    right: 320px;
    top: -50px;
    width: 500px;
    height: 500px;
    background-image: url('${imgGlobe}');
    background-size: cover;
    background-position: center;
    opacity: 0.18;
    mix-blend-mode: screen;
    z-index: 2;
  }

  .bg-cockpit {
    position: absolute;
    right: -10px;
    bottom: -10px;
    width: 440px;
    height: 280px;
    background-image: url('${imgCockpit}');
    background-size: cover;
    opacity: 0.25;
    border-radius: 14px;
    mask-image: linear-gradient(to top left, rgba(0,0,0,1) 30%, transparent 80%);
    -webkit-mask-image: linear-gradient(to top left, rgba(0,0,0,1) 30%, transparent 80%);
    z-index: 2;
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 48px 48px;
    z-index: 2;
  }

  .banner-container {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    padding: 24px 48px 24px 44px;
  }

  .avatar-safe-zone {
    width: 290px;
    flex-shrink: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding-top: 18px;
  }

  .profile-pill {
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 11.5px;
    font-weight: 700;
    color: #bae6fd;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 24px;
    padding-right: 36px;
  }

  .kpi-metric-strip {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
  }

  .kpi-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 700;
  }

  .kpi-chip.highlight {
    border-color: rgba(0, 209, 255, 0.4);
    color: #38bdf8;
  }

  .kpi-chip.security {
    border-color: rgba(239, 68, 68, 0.4);
    color: #f87171;
  }

  .title-main {
    font-size: 46px;
    font-weight: 900;
    letter-spacing: -0.5px;
    line-height: 1;
    margin-bottom: 4px;
  }

  .title-main span {
    background: linear-gradient(90deg, #38bdf8, #818cf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .title-sub {
    font-size: 21px;
    font-weight: 700;
    color: #94a3b8;
    margin-bottom: 16px;
    letter-spacing: 0.5px;
  }

  .title-sub strong {
    color: #f59e0b;
  }

  .metrics-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    max-width: 780px;
  }

  .metric-box {
    background: rgba(15, 23, 42, 0.7);
    border-left: 3px solid #00d1ff;
    border-radius: 8px;
    padding: 10px 14px;
  }

  .metric-box.orange { border-color: #f59e0b; }
  .metric-box.green { border-color: #10b981; }

  .metric-val {
    font-size: 18px;
    font-weight: 900;
    color: #ffffff;
    line-height: 1.1;
    margin-bottom: 2px;
  }

  .metric-lbl {
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
  }

  /* Painel de Contato / Links */
  .right-panel {
    width: 380px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .hub-card {
    background: rgba(11, 19, 36, 0.85);
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 14px;
    padding: 18px 20px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
  }

  .hub-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .hub-title {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #f8fafc;
    text-transform: uppercase;
  }

  .hub-btn-primary {
    background: linear-gradient(90deg, #0284c7, #00d1ff);
    border: none;
    border-radius: 8px;
    padding: 10px 14px;
    color: #04101e;
    font-weight: 800;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .hub-btn-secondary {
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 8px;
    padding: 9px 14px;
    color: #fef3c7;
    font-weight: 700;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .hub-notice {
    font-size: 10px;
    color: #64748b;
    line-height: 1.35;
    text-align: center;
  }

</style>
</head>
<body>
  <div class="bg-layer"></div>
  <div class="grid-overlay"></div>
  <div class="bg-globe"></div>
  <div class="bg-cockpit"></div>

  <div class="banner-container">
    <div class="avatar-safe-zone">
      <div class="profile-pill">
        <span>🚀 Inovação em Mobilidade</span>
      </div>
    </div>

    <div class="main-content">
      <div class="kpi-metric-strip">
        <div class="kpi-chip highlight">⚡ OTIMIZAÇÃO DE FROTAS</div>
        <div class="kpi-chip security">🛡️ OTT & FOGO CRUZADO</div>
        <div class="kpi-chip">📍 EXPANSÃO RJ + SP</div>
      </div>

      <h1 class="title-main">AGENTE RIT <span>TECH</span></h1>
      <h2 class="title-sub">Rota Inteligente de Transporte &bullet; <strong>Centro de Comando CCO</strong></h2>

      <div class="metrics-row">
        <div class="metric-box">
          <div class="metric-val">Segurança Total</div>
          <div class="metric-lbl">Alertas preditivos de incidentes e zonas de retenção.</div>
        </div>

        <div class="metric-box orange">
          <div class="metric-val">+4.200 Câmeras</div>
          <div class="metric-lbl">Malha viária monitorada ao vivo no RJ e São Paulo.</div>
        </div>

        <div class="metric-box green">
          <div class="metric-val">LGPD Compliance</div>
          <div class="metric-lbl">Zero GPS invasivo e estrita proteção de dados (PII).</div>
        </div>
      </div>
    </div>

    <div class="right-panel">
      <div class="hub-card">
        <div class="hub-header">
          <span class="hub-title">Conecte-se ao Projeto</span>
          <span style="font-size: 10px; color: #10b981; font-weight: 800;">● PRODUÇÃO ATIVA</span>
        </div>

        <div class="hub-btn-primary">
          <span>🌐 www.agenterit.com.br</span>
          <span>→</span>
        </div>

        <div class="hub-btn-secondary">
          <span>📖 Como Funciona: /apresentacao.html</span>
          <span>Deck</span>
        </div>

        <p class="hub-notice">
          Apresentação institucional pública de tecnologia.<br>
          Operação do sistema restrita a usuários autorizados.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

function getBanner3Html() {
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
    background: #020617;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    color: #ffffff;
    position: relative;
  }

  .bg-layer {
    position: absolute;
    inset: 0;
    background: 
      radial-gradient(circle at 80% 30%, rgba(245, 158, 11, 0.16) 0%, transparent 50%),
      radial-gradient(circle at 45% 80%, rgba(0, 209, 255, 0.14) 0%, transparent 55%),
      linear-gradient(135deg, #020617 0%, #0b1528 50%, #030712 100%);
    z-index: 1;
  }

  .bg-map {
    position: absolute;
    right: 0;
    top: 0;
    width: 720px;
    height: 396px;
    background-image: url('${imgRoute}');
    background-size: cover;
    background-position: right center;
    opacity: 0.22;
    mask-image: linear-gradient(to left, rgba(0,0,0,1) 20%, transparent 95%);
    -webkit-mask-image: linear-gradient(to left, rgba(0,0,0,1) 20%, transparent 95%);
    z-index: 2;
  }

  .banner-container {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    padding: 24px 48px;
  }

  .avatar-safe-zone {
    width: 290px;
    flex-shrink: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding-top: 14px;
  }

  .lead-badge {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(245, 158, 11, 0.4);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 800;
    color: #fde68a;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 20px;
    padding-right: 28px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 6px;
  }

  .title-text {
    font-size: 42px;
    font-weight: 900;
    letter-spacing: -0.5px;
    line-height: 1;
    background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 40%, #00d1ff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .sub-headline {
    font-size: 20px;
    font-weight: 700;
    color: #e2e8f0;
    margin-bottom: 12px;
  }

  .sub-desc {
    font-size: 14px;
    color: #94a3b8;
    max-width: 740px;
    line-height: 1.4;
    margin-bottom: 16px;
  }

  .feature-strip {
    display: flex;
    gap: 14px;
  }

  .feature-item {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .feature-bullet {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #00d1ff;
  }

  .feature-bullet.amber { background: #f59e0b; }
  .feature-bullet.green { background: #10b981; }

  .feature-text strong {
    display: block;
    font-size: 12.5px;
    color: #ffffff;
  }

  .feature-text span {
    font-size: 10.5px;
    color: #94a3b8;
  }

  /* Painel Direito */
  .right-panel {
    width: 370px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .site-card {
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(11, 19, 36, 0.95));
    border: 1px solid rgba(0, 209, 255, 0.4);
    border-radius: 12px;
    padding: 16px 18px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.4);
  }

  .site-url-box {
    background: rgba(2, 6, 23, 0.8);
    border: 1px solid rgba(0, 209, 255, 0.2);
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 10px;
  }

  .site-url-label {
    font-size: 9.5px;
    font-weight: 700;
    color: #38bdf8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: 2px;
  }

  .site-url-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    font-weight: 800;
    color: #ffffff;
  }

  .how-it-works-box {
    background: rgba(2, 6, 23, 0.8);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 8px;
  }

  .how-label {
    font-size: 9.5px;
    font-weight: 700;
    color: #f59e0b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: 2px;
  }

  .how-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 700;
    color: #fde68a;
  }

  .access-disclaimer {
    font-size: 9.5px;
    color: #64748b;
    text-align: center;
    line-height: 1.35;
  }
</style>
</head>
<body>
  <div class="bg-layer"></div>
  <div class="bg-map"></div>

  <div class="banner-container">
    <div class="avatar-safe-zone">
      <div class="lead-badge">
        <span>⚡ Liderança & Inovação</span>
      </div>
    </div>

    <div class="main-content">
      <div class="title-row">
        <h1 class="title-text">AGENTE RIT</h1>
        <span style="font-size: 13px; font-weight: 800; background: rgba(0, 209, 255, 0.15); color: #38bdf8; padding: 4px 10px; border-radius: 6px;">EXPANSÃO RJ & SP</span>
      </div>

      <h2 class="sub-headline">Rota Inteligente de Transporte & Governança CCO</h2>

      <p class="sub-desc">
        Hub corporativo de mobilidade que une <strong>visibilidade operacional</strong>, otimização preditiva de trajetos, câmeras públicas e <strong>análise de risco em tempo real</strong>.
      </p>

      <div class="feature-strip">
        <div class="feature-item">
          <div class="feature-bullet"></div>
          <div class="feature-text">
            <strong>Segurança Preditiva</strong>
            <span>OTT & Fogo Cruzado</span>
          </div>
        </div>

        <div class="feature-item">
          <div class="feature-bullet amber"></div>
          <div class="feature-text">
            <strong>Otimização de Frotas</strong>
            <span>Score & Trânsito</span>
          </div>
        </div>

        <div class="feature-item">
          <div class="feature-bullet green"></div>
          <div class="feature-text">
            <strong>Privacidade Estrita</strong>
            <span>Zero GPS / LGPD</span>
          </div>
        </div>
      </div>
    </div>

    <div class="right-panel">
      <div class="site-card">
        <div class="site-url-box">
          <span class="site-url-label">Portal da Solução</span>
          <span class="site-url-val">www.agenterit.com.br</span>
        </div>

        <div class="how-it-works-box">
          <span class="how-label">Como Funciona (Deck Institucional)</span>
          <span class="how-val">agenterit.com.br/apresentacao.html</span>
        </div>

        <div class="access-disclaimer">
          🔒 Apresentação pública para visualização do escopo.<br>
          Ambiente operacional acessível sob credenciais restritas.
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

// Template para o Mockup do Perfil do LinkedIn com o Banner e o Avatar do Fábio
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
    background: #0f172a;
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
    height: 381px; /* 1524 / 4 */
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
        <p class="headline">Agente RIT &bullet; Coordenador de Operações & Mobilidade Inteligente &bullet; Soluções CCO RJ & SP</p>
        <p class="location">Rio de Janeiro, Brasil &bullet; Mais de 500 conexões &bullet; www.agenterit.com.br</p>
      </div>
      <button class="btn-contact">Mensagem</button>
    </div>
  </div>
</body>
</html>
`;
}

async function renderBanners() {
    console.log('🚀 INICIANDO GERAÇÃO DE BANNERS LINKEDIN (1584 × 396 px)...');

    const browser = await chromium.launch({ headless: true });

    const models = [
        { name: 'linkedin-banner-modelo1', title: 'Modelo 1 - Comando CCO & Inteligência Operacional', getHtml: getBanner1Html },
        { name: 'linkedin-banner-modelo2', title: 'Modelo 2 - Executivo Corporativo Tech Mobility', getHtml: getBanner2Html },
        { name: 'linkedin-banner-modelo3', title: 'Modelo 3 - Expansão Regional RJ + SP', getHtml: getBanner3Html }
    ];

    for (const m of models) {
        console.log(`\nGerando ${m.title}...`);

        // 1. Versão Padrão LinkedIn (1584 x 396)
        const context1x = await browser.newContext({
            viewport: { width: 1584, height: 396 },
            deviceScaleFactor: 1
        });
        const page1x = await context1x.newPage();
        await page1x.setContent(m.getHtml(), { waitUntil: 'networkidle' });
        const path1x = path.join(OUTPUT_DIR, `${m.name}.png`);
        await page1x.screenshot({ path: path1x, fullPage: false });
        console.log(`  ✅ Salvo 1x (1584x396): ${path.basename(path1x)}`);
        await context1x.close();

        // 2. Versão Retina Ultra-Sharp 2x (3168 x 792)
        const context2x = await browser.newContext({
            viewport: { width: 1584, height: 396 },
            deviceScaleFactor: 2
        });
        const page2x = await context2x.newPage();
        await page2x.setContent(m.getHtml(), { waitUntil: 'networkidle' });
        const path2x = path.join(OUTPUT_DIR, `${m.name}-retina-2x.png`);
        await page2x.screenshot({ path: path2x, fullPage: false });
        console.log(`  ✅ Salvo 2x Retina (3168x792): ${path.basename(path2x)}`);
        await context2x.close();
    }

    // 3. Gera Mockup Realista com Perfil do LinkedIn do Fábio (com base no Modelo 1)
    console.log('\nGerando Mockup com Perfil do Fábio...');
    const banner1Base64 = `data:image/png;base64,${fs.readFileSync(path.join(OUTPUT_DIR, 'linkedin-banner-modelo1.png')).toString('base64')}`;
    const contextMockup = await browser.newContext({
        viewport: { width: 1584, height: 700 },
        deviceScaleFactor: 1
    });
    const pageMockup = await contextMockup.newPage();
    await pageMockup.setContent(getMockupProfileHtml(banner1Base64), { waitUntil: 'networkidle' });
    const pathMockup = path.join(OUTPUT_DIR, 'linkedin-perfil-mockup.png');
    await pageMockup.screenshot({ path: pathMockup, fullPage: false });
    console.log(`  ✅ Mockup de visualização no perfil: ${path.basename(pathMockup)}`);
    await contextMockup.close();

    await browser.close();
    console.log('\n🎉 TODOS OS BANNERS FORAM GERADOS COM SUCESSO!');
}

renderBanners().catch(err => {
    console.error('❌ Erro ao gerar banners:', err);
    process.exit(1);
});
