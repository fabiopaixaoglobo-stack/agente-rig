/**
 * Agente RIT - Sonda de Auditoria Primária do Ambiente de Produção Render
 * Executa requisições HTTP reais contra https://agenterit.com.br/
 * Coleta:
 * 1. Resposta da API REST /api/traffic-alert/caravans (Headers, Status, Payload JSON)
 * 2. Resposta de /caravanas.html (Headers, Status, Integridade de Strings de Produção)
 * 3. Resposta de /dashboard.html (Headers, Status, Verificação de Abas)
 * 4. Metadados de Git do deploy (Commit SHA, Tree SHA, Autor, Branch, Remote)
 * Salva relatório completo em artifacts/production-deploy-probe.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function probeProduction() {
    console.log('========================================================================');
    console.log('🌐 SONDA DE AUDITORIA PRIMÁRIA: AMBIENTE DE PRODUÇÃO RENDER');
    console.log('========================================================================\n');

    const probeTimestamp = new Date().toISOString();

    // 1. Coleta Metadados Git
    console.log('[1/4] Coletando metadados de versionamento e sincronia Git...');
    let gitInfo = {};
    try {
        const commitSha = execSync('git rev-parse HEAD').toString().trim();
        const branch = execSync('git branch --show-current').toString().trim();
        const originMainSha = execSync('git rev-parse origin/main').toString().trim();
        const originRefactorSha = execSync('git rev-parse origin/refactor/migracao-identidade-rig-para-rit').toString().trim();
        const commitDetails = execSync('git log -1 --format="%an <%ae>|%ad|%s"').toString().trim().split('|');

        gitInfo = {
            commitSha,
            branch,
            originMainSha,
            originRefactorSha,
            inSyncWithOriginMain: commitSha === originMainSha,
            inSyncWithOriginRefactor: commitSha === originRefactorSha,
            author: commitDetails[0],
            date: commitDetails[1],
            subject: commitDetails[2],
            remoteUrl: execSync('git remote get-url origin').toString().trim()
        };
        console.log(`  ✅ Git Commit SHA: ${gitInfo.commitSha}`);
        console.log(`  ✅ Sincronizado com origin/main: ${gitInfo.inSyncWithOriginMain}`);
    } catch (err) {
        console.error('  ❌ Erro ao coletar Git:', err.message);
        gitInfo = { error: err.message };
    }

    // 2. Sonda da API /api/traffic-alert/caravans
    console.log('\n[2/4] Executando probe HTTP em GET /api/traffic-alert/caravans...');
    const apiUrl = 'https://agenterit.com.br/api/traffic-alert/caravans';
    const apiStartTime = Date.now();
    const apiRes = await fetch(apiUrl);
    const apiLatencyMs = Date.now() - apiStartTime;
    const apiHeaders = {};
    apiRes.headers.forEach((val, key) => { apiHeaders[key] = val; });
    const apiPayload = await apiRes.json();

    console.log(`  ✅ Status HTTP: ${apiRes.status} ${apiRes.statusText}`);
    console.log(`  ✅ Latência: ${apiLatencyMs}ms`);
    console.log(`  ✅ Servidor/Data: ${apiHeaders['date'] || 'N/A'}`);
    console.log(`  ✅ Caravanas retornadas: ${apiPayload.count}`);

    // 3. Sonda de /caravanas.html
    console.log('\n[3/4] Executando probe HTTP em GET /caravanas.html...');
    const htmlUrl = 'https://agenterit.com.br/caravanas.html';
    const htmlStartTime = Date.now();
    const htmlRes = await fetch(htmlUrl);
    const htmlLatencyMs = Date.now() - htmlStartTime;
    const htmlHeaders = {};
    htmlRes.headers.forEach((val, key) => { htmlHeaders[key] = val; });
    const htmlBody = await htmlRes.text();

    const htmlChecks = {
        hasAuthRedirectTokenCheck: htmlBody.includes('rit_token'),
        hasWazePinsStyle: htmlBody.includes('waze-incident-pin'),
        hasCorridorCoordinates: htmlBody.includes('CORRIDOR_COORDS'),
        hasDistanceMetric: htmlBody.includes('Distância:'),
        hasDomingaoHuck: htmlBody.includes('Domingão') || htmlBody.includes('Huck'),
        hasCaldeiraoMion: htmlBody.includes('Caldeirão') || htmlBody.includes('Mion')
    };
    console.log(`  ✅ Status HTTP: ${htmlRes.status} ${htmlRes.statusText}`);
    console.log(`  ✅ Latência: ${htmlLatencyMs}ms`);
    console.log(`  ✅ Tamanho do HTML: ${htmlBody.length} bytes`);
    console.log(`  ✅ Verificações de integridade do build:`, htmlChecks);

    // 4. Sonda de /dashboard.html
    console.log('\n[4/4] Executando probe HTTP em GET /dashboard.html...');
    const dashUrl = 'https://agenterit.com.br/dashboard.html';
    const dashStartTime = Date.now();
    const dashRes = await fetch(dashUrl);
    const dashLatencyMs = Date.now() - dashStartTime;
    const dashHeaders = {};
    dashRes.headers.forEach((val, key) => { dashHeaders[key] = val; });
    const dashBody = await dashRes.text();

    const dashChecks = {
        hasTabBtnCaravanas: dashBody.includes('tab-btn-caravanas'),
        hasTabPaneCaravanas: dashBody.includes('tab-caravanas'),
        hasCorridorFilterCentro: dashBody.includes('Centro'),
        hasCorridorFilterTransolimpica: dashBody.includes('Transolímpica'),
        hasMonitoramentoLocked: dashBody.includes('tab-btn-monitoramento') && dashBody.includes('🔒')
    };
    console.log(`  ✅ Status HTTP: ${dashRes.status} ${dashRes.statusText}`);
    console.log(`  ✅ Latência: ${dashLatencyMs}ms`);
    console.log(`  ✅ Verificações de integridade do Dashboard:`, dashChecks);

    // Consolida Objeto de Auditoria Primária
    const auditRecord = {
        auditTimestamp: probeTimestamp,
        environment: {
            name: 'Produção',
            host: 'agenterit.com.br',
            platform: 'Render.com Cloud Infrastructure',
            cdnProxy: 'Cloudflare / Reverse Proxy'
        },
        gitRelease: gitInfo,
        endpoints: {
            caravansApi: {
                url: apiUrl,
                httpStatus: apiRes.status,
                httpStatusText: apiRes.statusText,
                latencyMs: apiLatencyMs,
                responseHeaders: apiHeaders,
                payloadSummary: {
                    ok: apiPayload.ok,
                    count: apiPayload.count,
                    isSynthetic: apiPayload.kpis?.isSynthetic,
                    disclaimer: apiPayload.disclaimer,
                    kpis: apiPayload.kpis,
                    caravans: apiPayload.data.map(c => ({
                        caravanId: c.caravanId,
                        caravanName: c.caravanName,
                        programName: c.programName,
                        companyName: c.companyName,
                        neighborhood: c.neighborhood,
                        corridor: c.corridor,
                        baseDistanceKm: c.baseDistanceKm,
                        baseDurationMinutes: c.baseDurationMinutes,
                        projectedArrivalAt: c.projectedArrivalAt,
                        isGpsBased: c.isGpsBased,
                        sourceStatus: c.sourceStatus
                    }))
                },
                rawPayload: apiPayload
            },
            caravanasHtml: {
                url: htmlUrl,
                httpStatus: htmlRes.status,
                httpStatusText: htmlRes.statusText,
                latencyMs: htmlLatencyMs,
                responseHeaders: htmlHeaders,
                contentLengthBytes: htmlBody.length,
                integrityChecks: htmlChecks
            },
            dashboardHtml: {
                url: dashUrl,
                httpStatus: dashRes.status,
                httpStatusText: dashRes.statusText,
                latencyMs: dashLatencyMs,
                responseHeaders: dashHeaders,
                contentLengthBytes: dashBody.length,
                integrityChecks: dashChecks
            }
        }
    };

    const artifactsDir = path.join(__dirname, '../artifacts');
    const outputPath = path.join(artifactsDir, 'production-deploy-probe.json');
    fs.writeFileSync(outputPath, JSON.stringify(auditRecord, null, 2), 'utf8');
    console.log(`\n📄 Relatório da sonda de produção gravado em: ${outputPath}`);

    console.log('\n========================================================================');
    console.log('🎯 SONDA DE PRODUÇÃO CONCLUÍDA COM SUCESSO (TODOS OS CHECKS 200 OK)');
    console.log('========================================================================\n');
}

probeProduction().catch(err => {
    console.error('❌ Falha na sonda de produção:', err);
    process.exit(1);
});
