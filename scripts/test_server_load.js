const http = require('http');
const fetch = require('node-fetch');

async function test() {
    console.log('--- TESTANDO SERVIDOR LOCAL ---');
    const app = require('../server/server.js');
    
    // Aguarda o servidor estar online
    for (let i = 0; i < 30; i++) {
        try {
            const h = await fetch('http://localhost:3000/api/health');
            if (h.status === 200) {
                console.log(`✅ Servidor online após ${i}s!`);
                break;
            }
        } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const endpoints = [
        'http://localhost:3000/dashboard.html',
        'http://localhost:3000/js/main.js',
        'http://localhost:3000/js/map-service.js',
        'http://localhost:3000/js/ui-controller.js',
        'http://localhost:3000/js/cameras-geo-service.js',
        'http://localhost:3000/data/cameras_georreferenciadas.json',
        'http://localhost:3000/api/cameras/georreferenciadas?limit=5',
        'http://localhost:3000/api/cameras/proximas?lat=-22.9782&lon=-43.3854&radius=1000',
        'http://localhost:3000/api/seguranca/ocorrencias?state=RJ'
    ];

    for (const url of endpoints) {
        try {
            const resp = await fetch(url);
            const text = await resp.text();
            console.log(`[HTTP ${resp.status}] ${url} -> ${text.length} bytes`);
        } catch (e) {
            console.error(`[ERROR] ${url}:`, e.message);
        }
    }

    console.log('--- TESTE CONCLUÍDO ---');
    process.exit(0);
}

test();
