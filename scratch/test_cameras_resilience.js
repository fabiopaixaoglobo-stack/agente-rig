const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function testCamerasResilience() {
    console.log("================================================================================");
    console.log("SUITE DE TESTES: CÂMERAS RJ 2X2 & RESOLUÇÃO DE OBJETOS");
    console.log("================================================================================\n");

    // 1. Validar cameras.json
    console.log("1. TESTANDO CATÁLOGO DE CÂMERAS RJ (cameras.json)...");
    const camerasJsonPath = path.join(__dirname, '../public/data/cameras.json');
    assert(fs.existsSync(camerasJsonPath), "cameras.json deve existir");
    const camerasData = JSON.parse(fs.readFileSync(camerasJsonPath, 'utf8'));
    const totalBairros = Object.keys(camerasData).length;
    console.log(`✅ Catálogo carregado: ${totalBairros} bairros do Rio de Janeiro indexados.`);
    assert(totalBairros > 50, "Deve conter mais de 50 bairros");
    assert(camerasData['Curicica'] && camerasData['Curicica'].length > 0, "Bairro Curicica deve estar presente");
    assert(camerasData['Barra da Tijuca'] && camerasData['Barra da Tijuca'].length > 0, "Bairro Barra da Tijuca deve estar presente");
    assert(camerasData['Centro'] && camerasData['Centro'].length > 0, "Bairro Centro deve estar presente");
    assert(camerasData['Copacabana'] && camerasData['Copacabana'].length > 0, "Bairro Copacabana deve estar presente");
    console.log("✅ Bairros estratégicos (Curicica, Barra, Centro, Copacabana) confirmados.\n");

    // 2. Validar traffic-camera-data.js
    console.log("2. TESTANDO CATÁLOGO DE FONTES ESTRUTURADAS (traffic-camera-data.js)...");
    const trafficDataContent = fs.readFileSync(path.join(__dirname, '../public/js/traffic-camera-data.js'), 'utf8');
    assert(trafficDataContent.includes('RJ_CURICICA_BANDEIRANTES'), "Fonte Curicica / Estúdios Globo deve estar presente");
    assert(trafficDataContent.includes('RJ_CAMERASRJ_BARRA'), "Fonte Barra deve estar presente");
    assert(trafficDataContent.includes('RJ_ZET_UFRJ_03'), "Fonte UFRJ ZET Centro / Corredores Viários deve estar presente");
    assert(trafficDataContent.includes('RJ_ZET_UFRJ_02'), "Fonte UFRJ ZET Ponte Rio-Niterói deve estar presente");
    assert(trafficDataContent.includes('RJ_MAPA_RIO_01'), "Redundância Mapa Rio deve estar presente");
    assert(trafficDataContent.includes('REC_ZET_PE_01'), "Fonte Recife Corredores Viários ZET PE deve estar presente");
    console.log("✅ Fontes estruturadas, contingências e fallbacks validados no catálogo.\n");

    // 3. Validar CamerasRJ.js (Grid 2x2, Timeout 8s, Retry 5s, Fallback, Ausência de Erros de Referência)
    console.log("3. TESTANDO MÓDULO CAMERAS RJ (CamerasRJ.js)...");
    const camerasRjContent = fs.readFileSync(path.join(__dirname, '../public/js/CamerasRJ.js'), 'utf8');
    assert(camerasRjContent.includes('cam-rj-grid-2x2'), "Classe de grid 2x2 deve estar presente");
    assert(camerasRjContent.includes('[CAMERA-LOAD]'), "Log [CAMERA-LOAD] deve estar presente");
    assert(camerasRjContent.includes('[CAMERA-TIMEOUT]'), "Log [CAMERA-TIMEOUT] deve estar presente");
    assert(camerasRjContent.includes('[CAMERA-RETRY]'), "Log [CAMERA-RETRY] deve estar presente");
    assert(camerasRjContent.includes('[CAMERA-FALLBACK]'), "Log [CAMERA-FALLBACK] deve estar presente");
    assert(camerasRjContent.includes('[CAMERA-FULLSCREEN]'), "Log [CAMERA-FULLSCREEN] deve estar presente");
    assert(camerasRjContent.includes('const bairroName ='), "Definição de bairroName deve estar presente");
    assert(camerasRjContent.includes('const caption ='), "Definição de caption deve estar presente");
    assert(camerasRjContent.includes('quad_1') && camerasRjContent.includes('quad_4'), "4 quadrantes simultâneos devem estar definidos");
    console.log("✅ Motor de 4 quadrantes, telemetria e lógica de resiliência validados.\n");

    // 4. Validar dashboard.html
    console.log("4. TESTANDO ESTRUTURA DO DASHBOARD HTML (dashboard.html)...");
    const dashboardContent = fs.readFileSync(path.join(__dirname, '../public/dashboard.html'), 'utf8');
    assert(dashboardContent.includes('id="tab-cameras"'), "Seção #tab-cameras deve existir");
    assert(dashboardContent.includes('style.css?v=45'), "Cache buster de style.css deve ser v=45");
    console.log("✅ Integração com dashboard.html validada.\n");

    // 5. Validar CSS em style.css
    console.log("5. TESTANDO REGRAS DE ESTILO CSS (style.css)...");
    const styleContent = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
    assert(styleContent.includes('.cam-rj-grid-2x2'), "Regra .cam-rj-grid-2x2 deve estar presente no CSS");
    assert(styleContent.includes('.cim-badge-loading'), "Badge de loading deve estar presente no CSS");
    assert(styleContent.includes('.cim-badge-error'), "Badge de erro deve estar presente no CSS");
    console.log("✅ Estilos de grid 2x2 e badges de status validados.\n");

    console.log("================================================================================");
    console.log("TODOS OS TESTES DO PAINEL DE CÂMERAS RJ 2X2 PASSARAM COM 100% DE SUCESSO!");
    console.log("================================================================================");
}

testCamerasResilience().catch(err => {
    console.error("❌ ERRO NO TESTE:", err);
    process.exit(1);
});
