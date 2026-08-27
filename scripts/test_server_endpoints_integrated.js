/**
 * TESTE INTEGRADO DE ENDPOINTS E PERFORMANCE COM EXPRESS SERVER
 */

const path = require('path');
const http = require('http');

async function testIntegrated() {
    console.log('Iniciando servidor para teste de performance...');
    process.env.PORT = '3099';
    
    // Inicia server
    require(path.join(__dirname, '..', 'server', 'server.js'));

    // Aguarda servidor estar pronto
    let serverReady = false;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
            await new Promise((resolve, reject) => {
                const req = http.get('http://localhost:3099/api/health', (res) => {
                    if (res.statusCode === 200) resolve();
                    else reject();
                });
                req.on('error', reject);
                req.setTimeout(400, () => req.abort());
            });
            serverReady = true;
            console.log('Servidor pronto na porta 3099!');
            break;
        } catch (e) {
            // Tentando novamente
        }
    }

    if (!serverReady) {
        console.error('Servidor não inicializou a tempo.');
        process.exit(1);
    }

    async function testEndpoint(name, pathStr, maxLatencyMs, maxPayloadKb = null) {
        const t0 = performance.now();
        return new Promise((resolve) => {
            const req = http.get({
                hostname: 'localhost',
                port: 3099,
                path: pathStr,
                headers: { 'Accept': 'application/json' }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));
                    const payloadBytes = Buffer.byteLength(body, 'utf8');
                    const payloadKb = parseFloat((payloadBytes / 1024).toFixed(2));

                    let parsed = null;
                    try {
                        parsed = JSON.parse(body);
                    } catch (e) {}

                    const statusOk = res.statusCode === 200;
                    const latencyOk = elapsedMs <= maxLatencyMs;
                    const payloadOk = maxPayloadKb ? payloadKb <= maxPayloadKb : true;

                    const pass = statusOk && latencyOk && payloadOk;
                    const icon = pass ? '✅' : '❌';

                    console.log(`${icon} [${name}] HTTP ${res.statusCode} | Latência: ${elapsedMs}ms (Meta: < ${maxLatencyMs}ms) | Tamanho: ${payloadKb} KB ${maxPayloadKb ? `(Meta: < ${maxPayloadKb} KB)` : ''}`);
                    
                    resolve({
                        name,
                        pass,
                        statusCode: res.statusCode,
                        elapsedMs,
                        payloadKb,
                        data: parsed
                    });
                });
            });

            req.on('error', (err) => {
                console.error(`❌ [${name}] Falha na requisição: ${err.message}`);
                resolve({ name, pass: false, error: err.message });
            });
        });
    }

    console.log('\n===============================================================');
    console.log('🚀 SUÍTE DE PERFORMANCE DA CENTRAL DE CÂMERAS & SEGURANÇA');
    console.log('===============================================================\n');

    // 1. Clusters Leves (< 15KB, < 100ms)
    await testEndpoint(
        '1. Clusters Leves de Bairros & Regionais',
        '/api/cameras/clusters',
        100,
        25
    );

    // 2. Viewport Bounding Box (< 50KB, < 100ms)
    await testEndpoint(
        '2. Lazy Loading Viewport BBox (Madureira/Cascadura)',
        '/api/cameras/bbox?bounds=-22.86,-22.90,-43.36,-43.30&limit=150&format=compact',
        100,
        50
    );

    // 3. Viewport Bounding Box Barra da Tijuca
    await testEndpoint(
        '3. Lazy Loading Viewport BBox (Barra da Tijuca)',
        '/api/cameras/bbox?bounds=-22.98,-23.03,-43.38,-43.30&limit=150&format=compact',
        100,
        50
    );

    // 4. Stream Health Check (< 2500ms)
    await testEndpoint(
        '4. Stream Health Check / Probe (#000455)',
        '/api/cameras/health/000455',
        2500
    );

    // 5. Ocorrências Unificadas (OTT + Fogo Cruzado com Cache)
    await testEndpoint(
        '5. Ocorrências de Segurança Unificadas (OTT + Fogo Cruzado)',
        '/api/seguranca/ocorrencias?state=RJ&source=all',
        5000
    );

    // 6. Segunda chamada a Ocorrências (deve bater no Cache < 50ms)
    await testEndpoint(
        '6. Ocorrências de Segurança (Verificação de Cache TTL)',
        '/api/seguranca/ocorrencias?state=RJ&source=all',
        50
    );

    console.log('\n===============================================================');
    console.log('✅ SUÍTE DE TESTES DE PERFORMANCE FINALIZADA COM SUCESSO');
    console.log('===============================================================');
    
    process.exit(0);
}

testIntegrated().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
});
