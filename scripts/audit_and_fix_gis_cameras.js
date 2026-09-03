/**
 * Auditoria GIS e Correção Espacial das 4.297 Câmeras - Operação Rock in Rio
 * Executa em 2 Lotes:
 * Lote 1: Corredores Críticos Rock in Rio (Barra Olímpica, Ayrton Senna, Abelardo Bueno, Salvador Allende, etc.)
 * Lote 2: Demais Câmeras RJ
 * Respeita a regra dos 300 metros e garante 0 câmeras sobre a água.
 */

const fs = require('fs');
const path = require('path');
const {
    WATER_BODIES,
    isPointInWater,
    isRockInRioCriticalCamera,
    snapToNearestRoad,
    haversineMeters
} = require('../server/gis-validator');

console.log('===============================================================');
console.log('🚀 INICIANDO AUDITORIA GEOESPACIAL DAS 4.297 CÂMERAS - AGENTE RIT');
console.log('🎯 FOCO CRÍTICO: OPERAÇÃO ROCK IN RIO / CCO');
console.log('===============================================================\n');

const originalPath = path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas_original.json');
if (!fs.existsSync(originalPath)) {
    console.error(`❌ Base original não encontrada em: ${originalPath}`);
    process.exit(1);
}

const rawCameras = JSON.parse(fs.readFileSync(originalPath, 'utf8'));
console.log(`📦 Câmeras carregadas da base original: ${rawCameras.length}\n`);

let stats = {
    total: rawCameras.length,
    lote1RockInRio: 0,
    lote2Geral: 0,
    inicialNaAgua: 0,
    inicialEmTerra: 0,
    corrigidas: 0,
    suspeitasMais300m: 0,
    validadasDiretas: 0,
    validadasComSnap: 0,
    finalNaAgua: 0,
    detalhesCorposHidricos: {},
    camerasCorrigidasLista: [],
    camerasSuspeitasLista: []
};

const processedCameras = [];

rawCameras.forEach((cam, idx) => {
    const isLote1 = isRockInRioCriticalCamera(cam);
    if (isLote1) stats.lote1RockInRio++;
    else stats.lote2Geral++;

    const latOrig = parseFloat(cam.latitude);
    const lonOrig = parseFloat(cam.longitude);

    const checkAgua = isPointInWater(latOrig, lonOrig);
    if (checkAgua.inWater) {
        stats.inicialNaAgua++;
        stats.detalhesCorposHidricos[checkAgua.bodyName] = (stats.detalhesCorposHidricos[checkAgua.bodyName] || 0) + 1;
    } else {
        stats.inicialEmTerra++;
    }

    // Executa Snap-To-Road com threshold de 300m
    const result = snapToNearestRoad(cam, { maxAutoDisplacementMeters: 300 });

    if (result.foiCorrigida) {
        stats.corrigidas++;
        stats.camerasCorrigidasLista.push({
            id: result.id,
            nome: result.nome,
            bairro: result.bairro,
            origemAgua: result.estavaNaAgua ? result.corpoHidrico : 'Terra',
            de: [result.latitudeOriginal, result.longitudeOriginal],
            para: [result.latitudeCorrigida, result.longitudeCorrigida],
            deslocamentoMetros: result.deslocamentoMetros,
            status: result.statusCoordenada,
            motivo: result.motivoSuspeita
        });
    }

    if (result.statusCoordenada === 'COORDENADA_SUSPEITA') {
        stats.suspeitasMais300m++;
        stats.camerasSuspeitasLista.push({
            id: result.id,
            nome: result.nome,
            bairro: result.bairro,
            deslocamentoMetros: result.deslocamentoMetros,
            motivo: result.motivoSuspeita
        });
    } else if (result.statusCoordenada === 'VALIDADA_SNAP') {
        stats.validadasComSnap++;
    } else {
        stats.validadasDiretas++;
    }

    // Validação de segurança: a nova coordenada ainda está na água?
    const checkFinal = isPointInWater(result.latitudeCorrigida, result.longitudeCorrigida);
    if (checkFinal.inWater) {
        stats.finalNaAgua++;
    }

    // Monta objeto final da câmera
    processedCameras.push({
        ...cam,
        latitudeOriginal: result.latitudeOriginal,
        longitudeOriginal: result.longitudeOriginal,
        latitude: result.latitudeCorrigida,
        longitude: result.longitudeCorrigida,
        coordenada_status: result.statusCoordenada,
        coordenada_suspeita: result.necessitaRevisaoManual,
        deslocamento_metros: result.deslocamentoMetros,
        motivo_auditoria: result.motivoSuspeita,
        isRockInRio: isLote1
    });
});

console.log('---------------------------------------------------------------');
console.log('📊 RELATÓRIO DE AUDITORIA GEOESPACIAL (RESULTADOS CONSOLIDADOS)');
console.log('---------------------------------------------------------------');
console.log(`Total de Câmeras Auditadas:       ${stats.total}`);
console.log(`  - Lote 1 (Rock in Rio Crítico): ${stats.lote1RockInRio}`);
console.log(`  - Lote 2 (Demais Regiões RJ):   ${stats.lote2Geral}`);
console.log(`\nDiagnóstico de Entrada:`);
console.log(`  - Câmeras originalmente sobre Água: ${stats.inicialNaAgua}`);
Object.entries(stats.detalhesCorposHidricos).forEach(([nome, qtd]) => {
    console.log(`      * ${nome}: ${qtd} câmeras`);
});
console.log(`  - Câmeras em Terra Firme:           ${stats.inicialEmTerra}`);
console.log(`\nResultado da Correção Espacial (Snap-To-Road):`);
console.log(`  - Câmeras Corrigidas/Ajustadas:     ${stats.corrigidas}`);
console.log(`  - Validadas Diretas (sem snap):     ${stats.validadasDiretas}`);
console.log(`  - Validadas com Snap (<= 300m):     ${stats.validadasComSnap}`);
console.log(`  - Suspeitas / Revisão (> 300m):     ${stats.suspeitasMais300m}`);
console.log(`\nVerificação de Aceite:`);
console.log(`  - Câmeras restantes sobre água:     ${stats.finalNaAgua} (Critério: ZERO)`);

if (stats.finalNaAgua === 0) {
    console.log(`  ✅ CRITÉRIO DE ACEITE ATINGIDO: NENHUMA CÂMERA SOBRE A ÁGUA!`);
} else {
    console.error(`  ❌ FALHA: Ainda existem ${stats.finalNaAgua} câmeras sobre a água!`);
}

// 7. Inspeção Específica da Câmera #006242 (Av. Ayrton Senna)
const cam6242 = processedCameras.find(c => String(c.id).includes('6242'));
console.log('\n---------------------------------------------------------------');
console.log('🔍 CASO DE TESTE CRÍTICO: CÂMERA #006242 (AV. AYRTON SENNA)');
console.log('---------------------------------------------------------------');
if (cam6242) {
    console.log(`ID:                     ${cam6242.id}`);
    console.log(`Nome:                   ${cam6242.nome}`);
    console.log(`Bairro:                 ${cam6242.bairro}`);
    console.log(`Coordenada Original:    Lat ${cam6242.latitudeOriginal}, Lon ${cam6242.longitudeOriginal}`);
    console.log(`Coordenada Corrigida:   Lat ${cam6242.latitude}, Lon ${cam6242.longitude}`);
    console.log(`Deslocamento:           ${cam6242.deslocamento_metros} metros`);
    console.log(`Status de Coordenada:   ${cam6242.coordenada_status}`);
    console.log(`Motivo:                 ${cam6242.motivo_auditoria}`);
    const check6242 = isPointInWater(cam6242.latitude, cam6242.longitude);
    console.log(`Sobre água pós-ajuste?  ${check6242.inWater ? 'SIM ❌' : 'NÃO (Sobre via viária) ✅'}`);
} else {
    console.warn('⚠️ Câmera #006242 não localizada no dataset.');
}

// 8. Salva datasets de saída (Ajuste Importante nº 1: datasets corrigidos dedicados)
const publicCorrigidoPath = path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas_corrigidas.json');
const serverCorrigidoPath = path.join(__dirname, '..', 'server', 'data', 'cameras_georreferenciadas_corrigidas.json');

fs.writeFileSync(publicCorrigidoPath, JSON.stringify(processedCameras, null, 2), 'utf8');
fs.writeFileSync(serverCorrigidoPath, JSON.stringify(processedCameras, null, 2), 'utf8');
console.log('\n💾 Arquivos corrigidos gravados com sucesso:');
console.log(`  - ${publicCorrigidoPath}`);
console.log(`  - ${serverCorrigidoPath}`);

// Grava relatório de auditoria em JSON para consumo automatizado
const relatorioPath = path.join(__dirname, '..', 'scratch', 'relatorio_auditoria_gis.json');
fs.writeFileSync(relatorioPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    estatisticas: stats,
    exemploAyrtonSenna: cam6242
}, null, 2), 'utf8');
console.log(`  - Relatório detalhado salvo em: ${relatorioPath}\n`);

// 9. Se tudo validado e finalNaAgua === 0, promove para produção
if (stats.finalNaAgua === 0) {
    const publicProdPath = path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas.json');
    const serverProdPath = path.join(__dirname, '..', 'server', 'data', 'cameras_georreferenciadas.json');
    fs.copyFileSync(publicCorrigidoPath, publicProdPath);
    fs.copyFileSync(serverCorrigidoPath, serverProdPath);
    console.log('✅ BASE CORRIGIDA PROMOVIDA COM SUCESSO PARA PRODUÇÃO!');
} else {
    console.error('❌ Base não promovida devido a falha nos critérios de aceite.');
    process.exit(1);
}
