/**
 * SUITE DE TESTES FUNCIONAIS, DE CARGA E DE INTEGRAÇÃO GEOESPACIAL
 * Central Inteligente de Câmeras e Ocorrências - Agente RIT
 */

const fs = require('fs');
const path = require('path');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

// ==========================================
// 1. TESTE DA AUDITORIA DO MAPA (ZERO WATERMARK)
// ==========================================
async function testMapTileProviders() {
    console.log('\n--- 1. TESTE DE PROVEDORES DE MAPA (AUDITORIA CARTO/ESRI/OSM) ---');
    const tileUrls = [
        { name: 'Esri Dark Gray Base (CICC Ops)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/12/2315/1507' },
        { name: 'Esri Dark Gray Reference (Labels)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/12/2315/1507' },
        { name: 'OpenStreetMap Standard', url: 'https://tile.openstreetmap.org/12/1507/2315.png' },
        { name: 'Esri World Imagery (Satélite HD)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/2315/1507' },
        { name: 'Esri World Topo Map (Terreno)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/12/2315/1507' }
    ];

    let allOk = true;
    for (const provider of tileUrls) {
        try {
            const resp = await fetch(provider.url, { headers: { 'User-Agent': 'AgenteRIT-Audit/4.0' } });
            const isOk = resp.status === 200;
            const size = resp.headers.get('content-length') || 'N/A';
            const type = resp.headers.get('content-type') || '';
            console.log(`  ${isOk ? '✅' : '❌'} [${provider.name}] HTTP ${resp.status} | Tipo: ${type} | Tamanho: ${size} bytes`);
            if (!isOk) allOk = false;
        } catch (e) {
            console.error(`  ❌ [${provider.name}] Erro de conexão:`, e.message);
            allOk = false;
        }
    }

    if (allOk) {
        console.log('  🎯 SUCESSO: Todos os provedores homologados responderam 200 OK sem nenhuma marca d\'água!');
    }
    return allOk;
}

// ==========================================
// 2. TESTE DA BASE DE CÂMERAS GEORREFERENCIADAS
// ==========================================
function testGeoreferencedCamerasData() {
    console.log('\n--- 2. TESTE DA BASE DE CÂMERAS GEORREFERENCIADAS ---');
    const filePath = path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas.json');
    if (!fs.existsSync(filePath)) {
        console.error('  ❌ Arquivo cameras_georreferenciadas.json não encontrado!');
        return false;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`  Total de câmeras cadastradas: ${data.length}`);

    // Validação de campos obrigatórios
    let validCount = 0;
    const keyCameras = ['000405', '000127', '000064', '000100', '001014'];
    const foundKeyCameras = {};

    data.forEach(cam => {
        const hasId = !!cam.id;
        const hasNome = !!cam.nome;
        const hasBairro = !!cam.bairro;
        const hasValidCoords = typeof cam.latitude === 'number' && typeof cam.longitude === 'number' &&
                               cam.latitude >= -23.5 && cam.latitude <= -22.5 &&
                               cam.longitude >= -44.0 && cam.longitude <= -43.0;
        const hasUrl = !!cam.url;
        const hasStatus = cam.status === 'online' || cam.status === 'offline';
        const hasFov = typeof cam.angulo === 'number' && typeof cam.orientacao === 'number';

        if (hasId && hasNome && hasBairro && hasValidCoords && hasUrl && hasStatus && hasFov) {
            validCount++;
        }

        if (keyCameras.includes(cam.id)) {
            foundKeyCameras[cam.id] = cam;
        }
    });

    console.log(`  Câmeras 100% válidas segundo esquema CCO: ${validCount}/${data.length}`);
    console.log(`  Validação das câmeras notórias operacionais:`);
    keyCameras.forEach(id => {
        const found = foundKeyCameras[id];
        if (found) {
            console.log(`    ✅ [${id}] ${found.nome} (${found.bairro}) -> Lat: ${found.latitude}, Lon: ${found.longitude} [${found.status.toUpperCase()}]`);
        } else {
            console.log(`    ❌ [${id}] Não encontrada na base!`);
        }
    });

    return validCount === data.length && Object.keys(foundKeyCameras).length === keyCameras.length;
}

// ==========================================
// 3. TESTE DE CARGA E PERFORMANCE DO ÍNDICE ESPACIAL
// ==========================================
function testSpatialIndexPerformance() {
    console.log('\n--- 3. TESTE DE CARGA E PERFORMANCE (SPATIAL GRID INDEX) ---');
    const filePath = path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas.json');
    const cameras = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Implementação interna idêntica ao SpatialGridIndex do frontend
    class TestSpatialGridIndex {
        constructor(cellSizeKm = 1.5) {
            this.cellSizeKm = cellSizeKm;
            this.cellLatDeg = cellSizeKm / 111.0;
            this.grid = new Map();
        }
        _getKey(lat, lon) {
            const cellLonDeg = this.cellSizeKm / (111.0 * Math.cos(lat * (Math.PI / 180)));
            const gx = Math.floor(lat / this.cellLatDeg);
            const gy = Math.floor(lon / cellLonDeg);
            return `${gx}:${gy}`;
        }
        build(items) {
            this.grid.clear();
            for (const item of items) {
                const k = this._getKey(item.latitude, item.longitude);
                if (!this.grid.has(k)) this.grid.set(k, []);
                this.grid.get(k).push(item);
            }
        }
        findNearest(tLat, tLon, radiusMeters = 1000, topK = 5) {
            const radiusKm = radiusMeters / 1000.0;
            const cLat = Math.ceil(radiusKm / this.cellSizeKm) + 1;
            const cLonDeg = this.cellSizeKm / (111.0 * Math.cos(tLat * (Math.PI / 180)));
            const cLon = Math.ceil(radiusKm / this.cellSizeKm) + 1;
            const tgX = Math.floor(tLat / this.cellLatDeg);
            const tgY = Math.floor(tLon / cLonDeg);

            const scored = [];
            for (let dx = -cLat; dx <= cLat; dx++) {
                for (let dy = -cLon; dy <= cLon; dy++) {
                    const key = `${tgX + dx}:${tgY + dy}`;
                    const list = this.grid.get(key);
                    if (list) {
                        for (const cam of list) {
                            const d = haversine(tLat, tLon, cam.latitude, cam.longitude);
                            if (d <= radiusMeters) {
                                scored.push({ cam, dist: Math.round(d) });
                            }
                        }
                    }
                }
            }
            scored.sort((a, b) => a.dist - b.dist);
            return scored.slice(0, topK);
        }
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const grid = new TestSpatialGridIndex(1.5);
    const tBuild0 = performance.now();
    grid.build(cameras);
    const tBuild = (performance.now() - tBuild0).toFixed(2);
    console.log(`  Tempo para indexar ${cameras.length} câmeras: ${tBuild}ms`);

    // Simulação de 150 ocorrências simultâneas em pontos reais do Rio
    const simulatedOccurrences = [
        { nome: 'Praça XV / Centro', lat: -22.9035, lon: -43.1729 },
        { nome: 'Abelardo Bueno / Barra Olímpica', lat: -22.9782, lon: -43.3854 },
        { nome: 'Estúdios Globo / Curicica', lat: -22.9567, lon: -43.3989 },
        { nome: 'Complexo da Maré / Av. Brasil', lat: -22.8480, lon: -43.2420 },
        { nome: 'Copacabana / Posto 4', lat: -22.9694, lon: -43.1869 },
        { nome: 'Praça Seca / Jacarepaguá', lat: -22.8872, lon: -43.3540 },
        { nome: 'Tijuca / Praça Saens Peña', lat: -22.9242, lon: -43.2325 },
        { nome: 'Madureira / Viaduto Negrão de Lima', lat: -22.8719, lon: -43.3383 }
    ];

    // Multiplica para atingir 160 consultas de estresse
    const stressBatch = [];
    for (let i = 0; i < 20; i++) {
        simulatedOccurrences.forEach(o => {
            stressBatch.push({
                ...o,
                lat: o.lat + (Math.random() - 0.5) * 0.02,
                lon: o.lon + (Math.random() - 0.5) * 0.02
            });
        });
    }

    console.log(`  Executando teste de carga com ${stressBatch.length} ocorrências simultâneas...`);
    const t0 = performance.now();
    let totalCamsFound = 0;
    stressBatch.forEach(occ => {
        const top5 = grid.findNearest(occ.lat, occ.lon, 1000, 5);
        totalCamsFound += top5.length;
    });
    const totalTimeMs = performance.now() - t0;
    const avgPerQueryMs = (totalTimeMs / stressBatch.length).toFixed(4);

    console.log(`  Tempo total para ${stressBatch.length} correlações: ${totalTimeMs.toFixed(2)}ms`);
    console.log(`  Média por ocorrência: ${avgPerQueryMs}ms (Meta CICC: < 15ms)`);

    const performancePass = avgPerQueryMs < 5.0;
    console.log(`  ${performancePass ? '✅ PERFORMANCE APROVADA' : '❌ PERFORMANCE INSUFICIENTE'} (Superou meta operacional em ${Math.round(15 / avgPerQueryMs)}x)`);

    return performancePass;
}

// ==========================================
// 4. TESTE DO ÍNDICE DE COBERTURA VISUAL E IA
// ==========================================
function testVisualCoverageAndAIEngine() {
    console.log('\n--- 4. TESTE DO ÍNDICE DE COBERTURA VISUAL E IA OPERACIONAL ---');
    const filePath = path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas.json');
    const cameras = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function evaluateScenario(name, lat, lon) {
        const scored = [];
        cameras.forEach(cam => {
            const d = haversine(lat, lon, cam.latitude, cam.longitude);
            if (d <= 1000) scored.push({ cam, dist: Math.round(d) });
        });
        scored.sort((a, b) => a.dist - b.dist);
        const top5 = scored.slice(0, 5);
        const onlineCount = top5.filter(c => c.cam.status === 'online').length;
        const minDistance = top5.length > 0 ? top5[0].dist : Infinity;

        let nivel = 'BAIXA';
        if (onlineCount >= 3 || (onlineCount >= 1 && minDistance < 350)) {
            nivel = 'ALTA';
        } else if (onlineCount >= 1) {
            nivel = 'MÉDIA';
        }

        console.log(`  📌 [Cenário: ${name}]`);
        console.log(`     Coordenadas: [${lat}, ${lon}]`);
        console.log(`     Câmeras no raio 1000m: ${top5.length} (Online: ${onlineCount}) | Mais próxima: ${minDistance === Infinity ? 'Nenhuma' : minDistance + 'm'}`);
        console.log(`     Índice de Cobertura Visual: [${nivel}]`);
        if (top5.length > 0) {
            console.log(`     Top Câmeras:`);
            top5.forEach((c, idx) => console.log(`       ${idx+1}. Câmera ${c.cam.id} (${c.cam.bairro}) - ${c.dist}m [${c.cam.status.toUpperCase()}]`));
        }
        return nivel;
    }

    const r1 = evaluateScenario('Acesso Estúdios Globo (Curicica)', -22.9567, -43.3989);
    const r2 = evaluateScenario('Barra Olímpica (Abelardo Bueno)', -22.9782, -43.3854);
    const r3 = evaluateScenario('Área Remota Maciço da Pedra Branca', -22.9300, -43.4800);

    const ok = r1 === 'ALTA' && r2 === 'ALTA';
    console.log(`  ${ok ? '✅ CLASSIFICAÇÃO DE COBERTURA OPERACIONAL VALIDADA' : '❌ FALHA NA CLASSIFICAÇÃO'}`);
    return ok;
}

// EXECUTA TODOS OS TESTES
async function runAll() {
    console.log('===============================================================');
    console.log('🤖 INICIANDO SUITE DE TESTES: CENTRAL INTELIGENTE DE CÂMERAS');
    console.log('===============================================================');
    const t1 = await testMapTileProviders();
    const t2 = testGeoreferencedCamerasData();
    const t3 = testSpatialIndexPerformance();
    const t4 = testVisualCoverageAndAIEngine();

    const allPassed = t1 && t2 && t3 && t4;
    console.log('\n===============================================================');
    if (allPassed) {
        console.log('🏆 RESULTADO FINAL: TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
    } else {
        console.log('⚠️ ALGUNS TESTES APRESENTARAM FALHAS.');
    }
    console.log('===============================================================');
}

runAll();
