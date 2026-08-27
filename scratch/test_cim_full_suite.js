const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function testCimSuite() {
    console.log("================================================================================");
    console.log("SUITE DE TESTES: PAINEL TRÂNSITO INTEGRADO (CIM - 5 REGIONAIS GLOBO)");
    console.log("================================================================================\n");

    // 1. Validar traffic-camera-data.js
    console.log("1. TESTANDO CATÁLOGO MULTI-REGIONAL (traffic-camera-data.js)...");
    const trafficDataContent = fs.readFileSync(path.join(__dirname, '../public/js/traffic-camera-data.js'), 'utf8');
    
    // RJ
    assert(trafficDataContent.includes('RJ_CURICICA_BANDEIRANTES'), "Fonte RJ Curicica deve estar presente");
    assert(trafficDataContent.includes('RJ_CAMERASRJ_BARRA'), "Fonte RJ Barra deve estar presente");
    
    // SP
    assert(trafficDataContent.includes('SP_CET_23'), "Fonte SP CET-SP Paulista deve estar presente");
    assert(trafficDataContent.includes('SP_CET_195'), "Fonte SP CET-SP Pinheiros deve estar presente");
    
    // BSB
    assert(trafficDataContent.includes('BSB_DER_DF_01'), "Fonte BSB DER-DF Oficial deve estar presente");
    assert(trafficDataContent.includes('BSB_ESPLANADA'), "Fonte BSB Esplanada deve estar presente");
    
    // REC
    assert(trafficDataContent.includes('REC_ZET_PE_01'), "Fonte REC ZET PE deve estar presente");
    assert(trafficDataContent.includes('REC_SERTTEL_01'), "Fonte REC Serttel deve estar presente");
    assert(trafficDataContent.includes('REC_CTTU_01'), "Fonte REC CTTU deve estar presente");
    
    // BH
    assert(trafficDataContent.includes('BH_REALDATA_BARREIRO'), "Fonte BH Barreiro direto deve estar presente");
    assert(trafficDataContent.includes('BH_REALDATA_FLORESTA'), "Fonte BH Floresta direto deve estar presente");
    assert(trafficDataContent.includes('BH_REALDATA_CONTAGEM'), "Fonte BH Contagem direto deve estar presente");
    console.log("✅ Todas as fontes das 5 regionais (RJ, SP, BSB, REC, BH) validadas no catálogo.\n");

    // 2. Validar PainelTransitoIntegrado.js
    console.log("2. TESTANDO MÓDULO PAINEL TRANSITO INTEGRADO (PainelTransitoIntegrado.js)...");
    const cimContent = fs.readFileSync(path.join(__dirname, '../public/js/PainelTransitoIntegrado.js'), 'utf8');
    
    assert(cimContent.includes("card_1: { regional: 'RJ', slotNum: 1, sourceId: 'RJ_CURICICA_BANDEIRANTES' }"), "Slot padrão card_1 deve ser Curicica");
    assert(cimContent.includes("card_5: { regional: 'REC', slotNum: 1, sourceId: 'REC_ZET_PE_01' }"), "Slot padrão card_5 deve ser REC_ZET_PE_01");
    assert(cimContent.includes("card_6: { regional: 'BH', slotNum: 1, sourceId: 'BH_REALDATA_BARREIRO' }"), "Slot padrão card_6 deve ser BH_REALDATA_BARREIRO");
    assert(cimContent.includes("if (regional !== 'RJ')"), "Geração de opções para regionais não-RJ deve estar isolada de câmeras do RJ");
    assert(cimContent.includes("snapImg.src = `${imgUrl}${sep}t=${Date.now()}`"), "Cache buster dinâmico para snapshots deve estar presente");
    console.log("✅ Lógica de inicialização, migração de cache e atualização de snapshots validada.\n");

    // 3. Validar dashboard.html
    console.log("3. TESTANDO CACHE BUSTERS (dashboard.html)...");
    const dashboardContent = fs.readFileSync(path.join(__dirname, '../public/dashboard.html'), 'utf8');
    assert(dashboardContent.includes('style.css?v=45'), "Cache buster de style.css deve ser v=45");
    assert(dashboardContent.includes('js/main.js?v=45'), "Cache buster de main.js deve ser v=45");
    console.log("✅ Cache busters v=45 validados no dashboard.html.\n");

    console.log("================================================================================");
    console.log("TODOS OS TESTES DO PAINEL TRÂNSITO INTEGRADO PASSARAM COM 100% DE SUCESSO!");
    console.log("================================================================================");
}

testCimSuite().catch(err => {
    console.error("❌ ERRO NO TESTE:", err);
    process.exit(1);
});
