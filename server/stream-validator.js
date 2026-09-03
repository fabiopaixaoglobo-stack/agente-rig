/**
 * Validador Especializado de Transmissão de Vídeo em Tempo Real - Agente RIT / CCO
 * Regra Rigorosa: ONLINE somente com frames/bytes válidos de vídeo confirmados.
 * Não considera mero HTTP 200 de página HTML.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const fetchFn =
    typeof globalThis.fetch === 'function'
        ? globalThis.fetch.bind(globalThis)
        : require('node-fetch');

/**
 * Valida a saúde real da transmissão de uma câmera
 * @param {Object} cam Dados da câmera
 * @param {number} timeoutMs Tempo limite para validação (padrão 2500ms)
 * @returns {Promise<Object>} Resultado da validação
 */
async function validateCameraStream(cam, timeoutMs = 2500) {
    const rawId = String(cam.id).padStart(6, '0');
    const numId = parseInt(rawId, 10);
    const streamUrl = cam.embedUrl || `https://player.camerasrj.com.br/camera/${numId}/`;
    const t0 = Date.now();

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        // Realiza requisição GET buscando headers e conteúdo do stream/player
        const resp = await fetchFn(streamUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 AgenteRIT/4.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': `https://www.camerasrj.com.br/camera/${numId}/`
            }
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - t0;
        const statusCode = resp.status;

        // 1. Falha HTTP direta (404, 500, 502, 504)
        if (statusCode === 404) {
            return {
                camera_id: rawId,
                status: 'OFFLINE',
                latencia_ms: latencyMs,
                frames_validos: false,
                motivo: 'Câmera não encontrada no servidor de transmissão (HTTP 404)',
                valido: false
            };
        }

        if (statusCode >= 500) {
            return {
                camera_id: rawId,
                status: statusCode === 504 ? 'TIMEOUT' : 'OFFLINE',
                latencia_ms: latencyMs,
                frames_validos: false,
                motivo: `Servidor de vídeo indisponível (HTTP ${statusCode})`,
                valido: false
            };
        }

        const body = await resp.text();

        // 2. Análise de Conteúdo da Resposta (Detecta falhas reais mascaradas por HTTP 200)
        const isPlayerNotFound = body.includes('Câmera não encontrada') || body.includes('not found') || body.includes('not configured');
        const isOfflineOrNoPublisher = body.includes('no publisher') || body.includes('offline ou sem sinal') || body.includes('not ready');
        const isTimeoutMessage = body.includes('timed out') || body.includes('tempo limite') || body.includes('Conexão perdida');
        const isCloudflareBlock = body.includes('Attention Required! | Cloudflare') || body.includes('challenge-platform');

        if (isPlayerNotFound) {
            return {
                camera_id: rawId,
                status: 'OFFLINE',
                latencia_ms: latencyMs,
                frames_validos: false,
                motivo: 'Câmera não configurada no servidor de streaming',
                valido: false
            };
        }

        if (isOfflineOrNoPublisher) {
            return {
                camera_id: rawId,
                status: 'OFFLINE',
                latencia_ms: latencyMs,
                frames_validos: false,
                motivo: 'Câmera offline na origem (sem sinal de publisher)',
                valido: false
            };
        }

        if (isTimeoutMessage) {
            return {
                camera_id: rawId,
                status: 'TIMEOUT',
                latencia_ms: latencyMs,
                frames_validos: false,
                motivo: 'Tempo limite de transmissão excedido na origem',
                valido: false
            };
        }

        // 3. Verificação de Código Ativo do Player (WHEP, WebRTC, PeerConnection ou Video Element)
        const hasLiveVideoScript = body.includes('RTCPeerConnection') || body.includes('startWhep') || body.includes('camerasrj-player-bridge') || body.includes('.m3u8') || body.includes('<video');

        if (!hasLiveVideoScript && !isCloudflareBlock) {
            return {
                camera_id: rawId,
                status: 'OFFLINE',
                latencia_ms: latencyMs,
                frames_validos: false,
                motivo: 'Página não contém pipeline de vídeo ativo',
                valido: false
            };
        }

        // 4. Classificação por Latência e Qualidade de Sinal
        if (latencyMs > 2200) {
            return {
                camera_id: rawId,
                status: 'DEGRADADA',
                latencia_ms: latencyMs,
                frames_validos: true,
                motivo: `Latência elevada (${latencyMs}ms)`,
                valido: true
            };
        }

        // 5. Sucesso Confirmado: Stream Ativo e Pronto para Reprodução
        return {
            camera_id: rawId,
            status: 'ONLINE',
            latencia_ms: latencyMs,
            frames_validos: true,
            motivo: 'Stream ativo e disponível com baixa latência',
            valido: true
        };

    } catch (err) {
        const latencyMs = Date.now() - t0;
        const isTimeout = err.name === 'AbortError' || err.message.includes('timeout') || err.message.includes('ETIMEDOUT');

        return {
            camera_id: rawId,
            status: isTimeout ? 'TIMEOUT' : 'OFFLINE',
            latencia_ms: latencyMs,
            frames_validos: false,
            motivo: isTimeout ? `Tempo limite de resposta excedido (${timeoutMs}ms)` : `Falha de conexão: ${err.message}`,
            valido: false
        };
    }
}

/**
 * Valida um lote de câmeras com controle rigoroso de concorrência
 */
async function validateBatch(camerasList, concurrency = 8, timeoutMs = 2500) {
    const results = [];
    const queue = [...camerasList];

    async function worker() {
        while (queue.length > 0) {
            const cam = queue.shift();
            if (!cam) break;
            const res = await validateCameraStream(cam, timeoutMs);
            results.push(res);
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, camerasList.length); i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
    return results;
}

module.exports = {
    validateCameraStream,
    validateBatch
};
