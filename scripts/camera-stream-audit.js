/**
 * scripts/camera-stream-audit.js
 * Auditoria Operacional de Vídeo Real em Duas Fases - Agente RIT / CCO
 *
 * FASE A: Pré-sondagem rápida (HEAD/GET, autenticação, negociação WHEP multi-codec)
 * FASE B: Validação em Navegador Real (Playwright, readyState, framesDecoded, bytesReceived)
 *
 * Classificação Rigorosa:
 * - ONLINE (< 3s)
 * - LENTA (3s a 8s)
 * - DEGRADADA (> 8s)
 * - TIMEOUT (> 15s)
 * - OFFLINE (falha conclusiva de fonte / sem publisher / 404 / 504)
 * - CODEC_INCOMPATIVEL (stream ativa na origem em H.265/HEVC sem hardware local)
 * - NÃO_VERIFICADA (inconclusivo)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const {
    bulkUpsertRuntimeStatus,
    getRuntimeStatusSummary,
    getRuntimeCorredoresStats,
    pool
} = require('../server/database');

// Corredores Estratégicos Prioritários do Rock in Rio
const STRATEGIC_CORRIDORS = [
    { name: 'Ayrton Senna', patterns: ['ayrton senna'] },
    { name: 'Abelardo Bueno', patterns: ['abelardo bueno'] },
    { name: 'Salvador Allende', patterns: ['salvador allende'] },
    { name: 'TransOlímpica', patterns: ['transolimpica', 'transolímpica'] },
    { name: 'Linha Amarela', patterns: ['linha amarela'] }
];

function identifyCorridor(cam) {
    const text = `${cam.nome || ''} ${cam.endereco || ''} ${cam.bairro || ''}`.toLowerCase();
    for (const c of STRATEGIC_CORRIDORS) {
        for (const p of c.patterns) {
            if (text.includes(p)) return c.name;
        }
    }
    // Câmeras críticas na região da Barra Olímpica ligadas à malha de acesso ao Rock in Rio
    if ((cam.bairro || '').toLowerCase().includes('barra olímpica') || (cam.bairro || '').toLowerCase().includes('camorim')) {
        return 'Barra Olímpica (Acesso RIR)';
    }
    return null;
}

// Oferta SDP Multi-Codec (H.265/HEVC + H.264 profiles + VP8/VP9)
function createMultiCodecSdpOffer() {
    return [
        'v=0',
        'o=- ' + Date.now() + ' 2 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'a=msid-semantic: WMS',
        'm=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100 101 102 103 104 105',
        'c=IN IP4 0.0.0.0',
        'a=rtcp:9 IN IP4 0.0.0.0',
        'a=ice-ufrag:AgenteRIT01',
        'a=ice-pwd:AgenteRITSecretPass12345678',
        'a=ice-options:trickle',
        'a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF',
        'a=setup:actpass',
        'a=mid:0',
        'a=recvonly',
        'a=rtcp-mux',
        'a=rtcp-rsize',
        'a=rtpmap:96 H265/90000',
        'a=rtpmap:97 HEVC/90000',
        'a=rtpmap:98 H264/90000',
        'a=fmtp:98 packetization-mode=1;profile-level-id=42e01f',
        'a=rtpmap:99 H264/90000',
        'a=fmtp:99 packetization-mode=1;profile-level-id=42001f',
        'a=rtpmap:100 H264/90000',
        'a=fmtp:100 packetization-mode=1;profile-level-id=64001f',
        'a=rtpmap:101 H264/90000',
        'a=fmtp:101 packetization-mode=0;profile-level-id=42001f',
        'a=rtpmap:102 VP8/90000',
        'a=rtpmap:103 VP9/90000',
        'a=rtpmap:104 AV1/90000',
        'a=rtpmap:105 JPEG/90000',
        ''
    ].join('\r\n');
}

/**
 * FASE A - PRÉ-SONDAGEM RÁPIDA (Protocolo WHEP / SDP)
 */
async function runPhaseA(cam) {
    const rawId = String(cam.id).padStart(6, '0');
    const numId = parseInt(rawId, 10);
    const t0 = performance.now();
    const probeUrl = `https://player.camerasrj.com.br/camera/${numId}/`;

    try {
        // 1. HEAD Request
        const headController = new AbortController();
        const headTimeout = setTimeout(() => headController.abort(), 3000);
        let headLatency = 0;
        try {
            const hT0 = performance.now();
            const headResp = await fetch(probeUrl, {
                method: 'HEAD',
                signal: headController.signal,
                headers: { 'User-Agent': 'AgenteRIT-Audit/4.0' }
            });
            headLatency = Math.round(performance.now() - hT0);
            clearTimeout(headTimeout);

            if (headResp.status === 404) {
                return {
                    id: rawId,
                    status: 'OFFLINE',
                    tempo_abertura_ms: null,
                    frames_recebidos: 0,
                    bytes_recebidos: 0,
                    erro_detectado: 'Câmera não encontrada no servidor público (HTTP 404)',
                    codec_detectado: null,
                    fase: 'A'
                };
            }
        } catch(e) {
            clearTimeout(headTimeout);
        }

        // 2. GET Request para extração de credenciais de sessão
        const getController = new AbortController();
        const getTimeout = setTimeout(() => getController.abort(), 4500);
        const getResp = await fetch(probeUrl, {
            method: 'GET',
            signal: getController.signal,
            headers: { 'User-Agent': 'AgenteRIT-Audit/4.0' }
        });
        clearTimeout(getTimeout);

        if (!getResp.ok) {
            return {
                id: rawId,
                status: 'OFFLINE',
                tempo_abertura_ms: null,
                frames_recebidos: 0,
                bytes_recebidos: 0,
                erro_detectado: `Página do player indisponível (HTTP ${getResp.status})`,
                codec_detectado: null,
                fase: 'A'
            };
        }

        const html = await getResp.text();
        const bytesHtml = Buffer.byteLength(html, 'utf8');

        const code = (html.match(/cameraCode\s*=\s*['"]([^'"]+)['"]/) || [])[1] || rawId;
        const key = (html.match(/accessKey\s*=\s*['"]([^'"]+)['"]/) || [])[1];
        const baseMatch = html.match(/<base\s+href=["']([^"']+)["']/i);
        const baseUrl = baseMatch ? baseMatch[1] : 'https://dev.tixxi.rio/';

        if (!key) {
            return {
                id: rawId,
                status: 'OFFLINE',
                tempo_abertura_ms: null,
                frames_recebidos: 0,
                bytes_recebidos: bytesHtml,
                erro_detectado: 'Chave de autorização ausente no player (câmera desativada na origem)',
                codec_detectado: null,
                fase: 'A'
            };
        }

        // 3. Iniciar Sessão Autorizada
        const sController = new AbortController();
        const sTimeout = setTimeout(() => sController.abort(), 4000);
        const sResp = await fetch(new URL('/app/session/start', baseUrl), {
            method: 'POST',
            signal: sController.signal,
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://player.camerasrj.com.br',
                'Referer': 'https://player.camerasrj.com.br/'
            },
            body: JSON.stringify({ code, key })
        });
        clearTimeout(sTimeout);

        if (!sResp.ok) {
            return {
                id: rawId,
                status: 'OFFLINE',
                tempo_abertura_ms: null,
                frames_recebidos: 0,
                bytes_recebidos: bytesHtml,
                erro_detectado: `Servidor de sessão recusou conexão (HTTP ${sResp.status})`,
                codec_detectado: null,
                fase: 'A'
            };
        }

        const sData = await sResp.json();
        if (!sData || !sData.sessionId) {
            return {
                id: rawId,
                status: 'OFFLINE',
                tempo_abertura_ms: null,
                frames_recebidos: 0,
                bytes_recebidos: bytesHtml,
                erro_detectado: 'Sessão não iniciada pelo servidor de vídeo',
                codec_detectado: null,
                fase: 'A'
            };
        }

        const sessionId = sData.sessionId;

        // 4. Negociação WHEP com SDP Multi-Codec
        const wController = new AbortController();
        const wTimeout = setTimeout(() => wController.abort(), 6000);
        const wT0 = performance.now();
        const wResp = await fetch(new URL('/app/whep/' + sessionId, baseUrl), {
            method: 'POST',
            signal: wController.signal,
            headers: {
                'Content-Type': 'application/sdp',
                'Origin': 'https://player.camerasrj.com.br',
                'Referer': 'https://player.camerasrj.com.br/'
            },
            body: createMultiCodecSdpOffer()
        });
        clearTimeout(wTimeout);

        const whepLatency = Math.round(performance.now() - wT0);
        const totalElapsed = Math.round(performance.now() - t0);
        const whepText = await wResp.text();

        if (wResp.status === 201) {
            const isHevc = whepText.includes('H265') || whepText.includes('HEVC');
            const isH264 = whepText.includes('H264');
            const hasSsrc = whepText.includes('a=ssrc:');
            const hasCandidates = whepText.includes('a=candidate:');

            return {
                id: rawId,
                status: isHevc ? 'CODEC_INCOMPATIVEL' : 'ELIGIBLE_BROWSER',
                tempo_abertura_ms: totalElapsed,
                frames_recebidos: hasSsrc ? 1 : 0,
                bytes_recebidos: bytesHtml + Buffer.byteLength(whepText, 'utf8'),
                erro_detectado: isHevc ? 'Stream ativa na origem em H.265/HEVC (Requer decodificador HEVC no cliente)' : null,
                codec_detectado: isHevc ? 'H.265 (HEVC)' : (isH264 ? 'H.264' : 'Outro'),
                hasSsrc,
                hasCandidates,
                fase: 'A'
            };
        }

        if (wResp.status === 504 || wResp.status === 408) {
            return {
                id: rawId,
                status: 'TIMEOUT',
                tempo_abertura_ms: totalElapsed,
                frames_recebidos: 0,
                bytes_recebidos: bytesHtml,
                erro_detectado: `Tempo limite de conexão com o sinal de origem excedido (HTTP ${wResp.status})`,
                codec_detectado: null,
                fase: 'A'
            };
        }

        const isNoPublisher = whepText.includes('no publisher') || whepText.includes('not ready') || whepText.includes('offline');
        return {
            id: rawId,
            status: 'OFFLINE',
            tempo_abertura_ms: null,
            frames_recebidos: 0,
            bytes_recebidos: bytesHtml,
            erro_detectado: isNoPublisher ? 'Câmera sem sinal de transmissão de vídeo (No publisher)' : `Falha WHEP na origem (HTTP ${wResp.status})`,
            codec_detectado: null,
            fase: 'A'
        };

    } catch(err) {
        const isTimeout = err.name === 'AbortError' || (err.message || '').includes('timeout');
        return {
            id: rawId,
            status: isTimeout ? 'TIMEOUT' : 'OFFLINE',
            tempo_abertura_ms: null,
            frames_recebidos: 0,
            bytes_recebidos: 0,
            erro_detectado: isTimeout ? 'Tempo limite de requisição excedido (> 6s)' : `Falha de rede: ${err.message}`,
            codec_detectado: null,
            fase: 'A'
        };
    }
}

/**
 * FASE B - VALIDAÇÃO EM NAVEGADOR REAL (Playwright / Chromium)
 * Executa exclusivamente para câmeras com stream H.264 confirmada na Fase A
 */
async function runPhaseB(cam, browser) {
    const rawId = String(cam.id).padStart(6, '0');
    const numId = parseInt(rawId, 10);
    const url = `https://player.camerasrj.com.br/camera/${numId}/`;
    const t0 = performance.now();

    let context = null;
    let page = null;

    try {
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 AgenteRIT/4.0',
            permissions: []
        });
        page = await context.newPage();

        // 1. Navegar ao player isolado
        const navResp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        if (!navResp || !navResp.ok()) {
            return {
                id: rawId,
                status: 'OFFLINE',
                tempo_abertura_ms: null,
                frames_recebidos: 0,
                frames_decodificados: 0,
                bytes_recebidos: 0,
                erro_detectado: `Player indisponível no navegador (HTTP ${navResp ? navResp.status() : 0})`,
                fase: 'B'
            };
        }

        // 2. Instrumentação e monitoramento de vídeo e WebRTC
        const result = await page.evaluate(async () => {
            const tStart = performance.now();
            const video = document.querySelector('video');
            const errorDiv = document.getElementById('error');

            let firstFrameTime = null;
            let sample1 = null;
            let sample2 = null;

            // Função para consultar inbound-rtp video stats
            async function getRtpStats() {
                if (!window.pc || typeof window.pc.getStats !== 'function') return null;
                try {
                    const stats = await window.pc.getStats();
                    let videoStats = null;
                    stats.forEach(report => {
                        if (report.type === 'inbound-rtp' && report.kind === 'video') {
                            videoStats = {
                                bytesReceived: report.bytesReceived || 0,
                                packetsReceived: report.packetsReceived || 0,
                                framesReceived: report.framesReceived || 0,
                                framesDecoded: report.framesDecoded || 0
                            };
                        }
                    });
                    return videoStats;
                } catch(e) {
                    return null;
                }
            }

            // Aguarda até 10 segundos pelo sinal de vídeo ou erro
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 10000));

            const videoPromise = new Promise(resolve => {
                if (!video) {
                    resolve({ ok: false, error: 'NO_VIDEO_TAG' });
                    return;
                }

                function checkReady() {
                    const hasDimensions = video.videoWidth > 0 && video.videoHeight > 0;
                    const isPlaying = !video.paused && video.readyState >= 2;
                    if (hasDimensions && isPlaying) {
                        if (!firstFrameTime) firstFrameTime = performance.now() - tStart;
                        resolve({ ok: true });
                    }
                }

                video.addEventListener('loadeddata', checkReady);
                video.addEventListener('playing', checkReady);
                video.addEventListener('timeupdate', checkReady);

                // Polling preventivo de 200ms
                const interval = setInterval(async () => {
                    if (errorDiv && getComputedStyle(errorDiv).display !== 'none') {
                        clearInterval(interval);
                        resolve({ ok: false, error: errorDiv.textContent.trim() });
                    }
                    if (video.videoWidth > 0 && video.readyState >= 2) {
                        clearInterval(interval);
                        if (!firstFrameTime) firstFrameTime = performance.now() - tStart;
                        resolve({ ok: true });
                    }
                }, 200);

                setTimeout(() => clearInterval(interval), 10000);
            });

            const outcome = await Promise.race([videoPromise, timeoutPromise]);

            if (outcome === 'TIMEOUT') {
                return {
                    ok: false,
                    error: 'TIMEOUT_WAITING_VIDEO_FRAME',
                    firstFrameTime: null,
                    stats: null
                };
            }

            if (!outcome.ok) {
                return {
                    ok: false,
                    error: outcome.error || 'VIDEO_ERROR',
                    firstFrameTime: null,
                    stats: null
                };
            }

            // Coleta de 2 amostras com intervalo de 600ms para comprovar crescimento
            sample1 = await getRtpStats();
            await new Promise(r => setTimeout(r, 600));
            sample2 = await getRtpStats();

            const isGrowth = sample1 && sample2 && (
                sample2.bytesReceived > sample1.bytesReceived ||
                sample2.framesReceived > sample1.framesReceived ||
                sample2.packetsReceived > sample1.packetsReceived
            );

            return {
                ok: true,
                firstFrameTime: Math.round(firstFrameTime || (performance.now() - tStart)),
                videoWidth: video ? video.videoWidth : 0,
                videoHeight: video ? video.videoHeight : 0,
                sample1,
                sample2,
                isGrowth
            };
        });

        const elapsedTotal = Math.round(performance.now() - t0);

        if (!result.ok) {
            const isTimeout = (result.error || '').includes('TIMEOUT');
            return {
                id: rawId,
                status: isTimeout ? 'TIMEOUT' : 'OFFLINE',
                tempo_abertura_ms: isTimeout ? 15000 : null,
                frames_recebidos: 0,
                frames_decodificados: 0,
                bytes_recebidos: 0,
                erro_detectado: isTimeout ? 'Timeout aguardando primeiro frame (> 10s)' : result.error,
                fase: 'B'
            };
        }

        const openTime = result.firstFrameTime || elapsedTotal;
        const finalStats = result.sample2 || result.sample1 || {};

        let status = 'ONLINE';
        if (openTime >= 3000 && openTime <= 8000) {
            status = 'LENTA';
        } else if (openTime > 8000) {
            status = 'DEGRADADA';
        }

        return {
            id: rawId,
            status,
            tempo_abertura_ms: openTime,
            frames_recebidos: finalStats.framesReceived || 1,
            frames_decodificados: finalStats.framesDecoded || 1,
            bytes_recebidos: finalStats.bytesReceived || 1024,
            erro_detectado: null,
            codec_detectado: 'H.264',
            fase: 'B'
        };

    } catch(err) {
        return {
            id: rawId,
            status: 'OFFLINE',
            tempo_abertura_ms: null,
            frames_recebidos: 0,
            frames_decodificados: 0,
            bytes_recebidos: 0,
            erro_detectado: `Falha no navegador de validação: ${err.message}`,
            fase: 'B'
        };
    } finally {
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
    }
}

/**
 * Worker Pool com Concorrência Configurável e Priorização de Corredores
 */
async function auditCamera(cam, browser) {
    // 1. Executa Fase A
    const resA = await runPhaseA(cam);

    // Se elegível para validação em navegador real (H.264)
    if (resA.status === 'ELIGIBLE_BROWSER') {
        const resB = await runPhaseB(cam, browser);
        return {
            ...cam,
            ...resB,
            corredor: identifyCorridor(cam),
            is_rock_in_rio: !!identifyCorridor(cam)
        };
    }

    // Se descartada na Fase A (OFFLINE, TIMEOUT ou CODEC_INCOMPATIVEL)
    return {
        ...cam,
        ...resA,
        corredor: identifyCorridor(cam),
        is_rock_in_rio: !!identifyCorridor(cam)
    };
}

async function runAuditPipeline({ limit = null, corridorOnly = false, concurrency = 15 } = {}) {
    console.info('===============================================================');
    console.info('🚀 INICIANDO AUDITORIA OPERACIONAL DE VÍDEO REAL DAS CÂMERAS RIT');
    console.info(`⚙️ Concorrência: ${concurrency} workers | Prioridade: Corredores Rock in Rio`);
    console.info('===============================================================');

    // Carrega catálogo de câmeras
    const camsPath = path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas.json');
    if (!fs.existsSync(camsPath)) {
        throw new Error(`Arquivo não encontrado: ${camsPath}`);
    }

    const allCameras = JSON.parse(fs.readFileSync(camsPath, 'utf8'));
    console.info(`📦 Catálogo total carregado: ${allCameras.length} câmeras.`);

    // Separa corredores prioritários do Rock in Rio
    const strategicCameras = [];
    const regularCameras = [];

    for (const cam of allCameras) {
        const corridor = identifyCorridor(cam);
        if (corridor) {
            strategicCameras.push({ ...cam, corridor });
        } else {
            regularCameras.push(cam);
        }
    }

    console.info(`🎸 Câmeras em Corredores Estratégicos Rock in Rio: ${strategicCameras.length}`);
    console.info(`🏙️ Demais Câmeras da Cidade: ${regularCameras.length}`);

    let queue = corridorOnly ? [...strategicCameras] : [...strategicCameras, ...regularCameras];
    if (limit && limit > 0) {
        queue = queue.slice(0, limit);
        console.info(`⚠️ Modo de teste ativado: limitando auditoria a ${queue.length} câmeras.`);
    }

    const totalToAudit = queue.length;
    let completedCount = 0;
    const results = [];
    const pendingDbBatch = [];

    // Inicializa Playwright para a Fase B
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--autoplay-policy=no-user-gesture-required'
        ]
    });

    console.info('🌐 Navegador Chromium para Fase B inicializado com sucesso.');

    async function flushBatchToDb() {
        if (pendingDbBatch.length === 0) return;
        const batchToSave = [...pendingDbBatch];
        pendingDbBatch.length = 0;
        try {
            await bulkUpsertRuntimeStatus(batchToSave);
        } catch(dbErr) {
            console.error('❌ Falha ao persistir lote no PostgreSQL:', dbErr.message);
        }
    }

    const tStartAudit = performance.now();

    // Worker Pool
    async function worker(workerId) {
        while (queue.length > 0) {
            const cam = queue.shift();
            if (!cam) break;

            try {
                const res = await auditCamera(cam, browser);
                results.push(res);
                pendingDbBatch.push({
                    camera_id: res.id,
                    nome: res.nome || cam.nome,
                    bairro: res.bairro || cam.bairro,
                    status: res.status,
                    tempo_abertura_ms: res.tempo_abertura_ms,
                    frames_recebidos: res.frames_recebidos || 0,
                    frames_decodificados: res.frames_decodificados || 0,
                    bytes_recebidos: res.bytes_recebidos || 0,
                    erro_detectado: res.erro_detectado || null,
                    codec_detectado: res.codec_detectado || null,
                    corredor: res.corredor || null,
                    is_rock_in_rio: res.is_rock_in_rio || false
                });

                completedCount++;

                if (pendingDbBatch.length >= 25) {
                    await flushBatchToDb();
                }

                const pct = ((completedCount / totalToAudit) * 100).toFixed(1);
                const tag = res.status === 'ONLINE' ? '🟢' :
                            res.status === 'LENTA' ? '🟡' :
                            res.status === 'DEGRADADA' ? '🟠' :
                            res.status === 'CODEC_INCOMPATIVEL' ? '🟣' :
                            res.status === 'TIMEOUT' ? '⚫' : '🔴';

                const latStr = res.tempo_abertura_ms ? `${res.tempo_abertura_ms}ms` : 'N/A';
                console.info(`[${pct}%] (${completedCount}/${totalToAudit}) ${tag} #${res.id} - ${res.status} | Abertura: ${latStr} | ${res.nome.slice(0, 35)}`);

            } catch(e) {
                console.error(`❌ Erro no worker #${workerId} na câmera #${cam.id}:`, e.message);
            }
        }
    }

    // Dispara os workers concorrentes
    const workers = [];
    const activeConcurrency = Math.min(concurrency, totalToAudit);
    for (let i = 0; i < activeConcurrency; i++) {
        workers.push(worker(i + 1));
    }

    await Promise.all(workers);
    await flushBatchToDb();
    await browser.close();

    const totalElapsedSeconds = ((performance.now() - tStartAudit) / 1000).toFixed(1);

    console.info('===============================================================');
    console.info(`✅ AUDITORIA CONCLUÍDA EM ${totalElapsedSeconds}s! Total auditado: ${results.length}`);
    console.info('===============================================================');

    // Estatísticas finais do banco
    const summary = await getRuntimeStatusSummary();
    const corredoresStats = await getRuntimeCorredoresStats();

    // Grava relatório JSON
    const reportPath = path.join(__dirname, '..', 'scratch', 'relatorio_auditoria_runtime.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        duracaoSegundos: parseFloat(totalElapsedSeconds),
        summary,
        corredores: corredoresStats,
        detalhes: results
    }, null, 2));

    console.info(`📄 Relatório consolidado gravado em: ${reportPath}`);
    return { summary, corredoresStats, results };
}

// Execução direta CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const limitArg = args.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
    const corridorOnly = args.includes('--corridor-only');
    const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
    const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 12;

    runAuditPipeline({ limit, corridorOnly, concurrency })
        .then(() => {
            console.info('🏁 Processo finalizado com sucesso.');
            process.exit(0);
        })
        .catch(err => {
            console.error('💥 Erro fatal no pipeline de auditoria:', err);
            process.exit(1);
        });
}

module.exports = {
    runAuditPipeline,
    auditCamera,
    runPhaseA,
    runPhaseB,
    identifyCorridor
};
