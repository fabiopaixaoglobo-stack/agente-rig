const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3005; // Porta dedicada para testes sem colisão
const BASE_URL = `http://localhost:${PORT}`;

console.log('🧪 Iniciando Bateria de Testes Automatizados — RIT Drive Mobile MVP...');

const serverProc = spawn('node', ['server/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
});

serverProc.stdout.on('data', (d) => {
    // console.log('[SERVER LOG]', d.toString().trim());
});

serverProc.stderr.on('data', (d) => {
    // console.error('[SERVER ERR]', d.toString().trim());
});

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchUrl(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(`${BASE_URL}${urlPath}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        }).on('error', reject);
    });
}

async function runTests() {
    // Aguarda inicialização do servidor
    console.log('⏳ Aguardando servidor inicializar na porta ' + PORT + '...');
    let ready = false;
    for (let i = 0; i < 20; i++) {
        await wait(600);
        try {
            const res = await fetchUrl('/api/health');
            if (res.status === 200) {
                ready = true;
                break;
            }
        } catch (_) {}
    }

    if (!ready) {
        serverProc.kill();
        console.error('❌ Falha ao iniciar servidor de testes.');
        process.exit(1);
    }
    console.log('✅ Servidor online e respondendo.');

    let passed = 0;
    let failed = 0;

    async function assertTest(name, fn) {
        try {
            await fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
            failed++;
        }
    }

    console.log('\n--- 1. TESTES DE ROTAS E ASSETS DO RIT DRIVE ---');
    
    await assertTest('Rota /rit-drive responde HTTP 200 com HTML', async () => {
        const res = await fetchUrl('/rit-drive');
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        if (!res.body.includes('RIT DRIVE')) throw new Error('HTML não contém RIT DRIVE');
        if (!res.body.includes('mapMobile')) throw new Error('HTML não contém mapMobile');
        if (!res.body.includes('quick-destinations-bar')) throw new Error('HTML não contém botões rápidos');
        if (!res.body.includes('bottom-sheet')) throw new Error('HTML não contém bottom-sheet');
    });

    await assertTest('Rota /rit-drive.html estática responde HTTP 200', async () => {
        const res = await fetchUrl('/rit-drive.html');
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });

    await assertTest('Estilo /styles/rit-drive.css responde HTTP 200 e contém regras mobile', async () => {
        const res = await fetchUrl('/styles/rit-drive.css');
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        if (!res.body.includes('simulated-frame')) throw new Error('CSS não contém regras de simulação 390px');
    });

    await assertTest('Script /js/rit-drive-app.js responde HTTP 200', async () => {
        const res = await fetchUrl('/js/rit-drive-app.js');
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        if (!res.body.includes('RitDriveApp')) throw new Error('Script não contém classe RitDriveApp');
    });

    await assertTest('PWA Manifest /manifest.json responde HTTP 200 com start_url correta', async () => {
        const res = await fetchUrl('/manifest.json');
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        const json = JSON.parse(res.body);
        if (json.start_url !== '/rit-drive') throw new Error('start_url inválida');
    });

    console.log('\n--- 2. TESTES DE REUTILIZAÇÃO DAS APIS DO AGENTE RIT ---');

    await assertTest('API Geocode busca "Projac" com sucesso e retorna coordenadas', async () => {
        const res = await fetchUrl('/api/geocode/search?q=Projac');
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        const json = JSON.parse(res.body);
        if (!json.ok || !json.resultado || isNaN(json.resultado.lat)) throw new Error('Coordenadas ausentes');
    });

    await assertTest('API Geocode busca "Santos Dumont" com sucesso', async () => {
        const res = await fetchUrl('/api/geocode/search?q=Santos+Dumont');
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        const json = JSON.parse(res.body);
        if (!json.ok || !json.resultado || isNaN(json.resultado.lat)) throw new Error('Coordenadas ausentes');
    });

    await assertTest('API Câmeras Próximas retorna Top 5 câmeras no raio', async () => {
        const res = await fetchUrl('/api/cameras/proximas?lat=-22.9754&lon=-43.4116&limit=5');
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        const json = JSON.parse(res.body);
        if (!json.ok || !Array.isArray(json.results)) throw new Error('Resultados ausentes');
        if (json.results.length === 0) throw new Error('Nenhuma câmera retornada no raio do Projac');
    });

    await assertTest('API Status Operacional COR.RIO responde com Estágio e Calor', async () => {
        const res = await fetchUrl('/api/status-operacional');
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        const json = JSON.parse(res.body);
        if (!json.estagio) throw new Error('Estágio COR ausente');
    });

    console.log('\n=========================================');
    console.log(`📊 RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
    console.log('=========================================');

    serverProc.kill();
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
    console.error('Erro na execução dos testes:', err);
    serverProc.kill();
    process.exit(1);
});
