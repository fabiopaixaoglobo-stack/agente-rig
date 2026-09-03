/**
 * Robô de Monitoramento Contínuo de Câmeras - Agente RIT / CCO
 * Intervalo de Ciclo: 60 segundos
 * Prioridade Máxima: Lote 1 (Corredores Críticos Rock in Rio)
 * Cache Operacional: 45 segundos em memória
 * Persistência Assíncrona no PostgreSQL (tabela camera_health)
 */

const fs = require('fs');
const path = require('path');
const { validateCameraStream, validateBatch } = require('./stream-validator');
const { isRockInRioCriticalCamera } = require('./gis-validator');
const { upsertCameraHealth, bulkUpsertCameraHealth, getCameraHealthSummary, pool } = require('./database');

// 1. Estado e Cache em Memória de Alta Performance
const healthCache = new Map(); // camera_id -> { data, timestamp }
const CACHE_TTL_MS = 45000; // 45 segundos (Ajuste Importante nº 5)

let robotState = {
    isRunning: false,
    lastRunTimestamp: null,
    lastExecutionDurationMs: 0,
    totalAudited: 0,
    activeAlerts: [],
    stats: {
        total: 0,
        online: 0,
        degradada: 0,
        timeout: 0,
        offline: 0,
        suspeitas: 0,
        latenciaMediaMs: 0,
        saudePercentual: 100,
        rockInRio: {
            total: 0,
            online: 0,
            degradada: 0,
            timeout: 0,
            offline: 0,
            saudePercentual: 100
        }
    }
};

let cachedCamerasList = null;
let lote1RockInRioList = [];
let lote2GeralList = [];
let lote2RotationIndex = 0;
const LOTE2_CHUNK_SIZE = 40; // Câmeras gerais verificadas por ciclo para evitar rate-limits

function loadCamerasCatalog() {
    if (cachedCamerasList && cachedCamerasList.length > 0) return cachedCamerasList;

    const paths = [
        path.join(__dirname, 'data', 'cameras_georreferenciadas.json'),
        path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas.json')
    ];

    for (const p of paths) {
        if (fs.existsSync(p)) {
            try {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                cachedCamerasList = data;
                lote1RockInRioList = data.filter(c => isRockInRioCriticalCamera(c));
                lote2GeralList = data.filter(c => !isRockInRioCriticalCamera(c));
                console.info(`[ROBÔ CÂMERAS] Catálogo carregado: ${data.length} câmeras (Lote 1 RIR: ${lote1RockInRioList.length} | Lote 2: ${lote2GeralList.length})`);
                return cachedCamerasList;
            } catch (e) {
                console.error(`[ROBÔ CÂMERAS] Erro ao ler catálogo em ${p}:`, e.message);
            }
        }
    }
    return [];
}

/**
 * Ciclo Principal de Monitoramento (Executa a cada 60s)
 */
async function runMonitoringCycle() {
    if (robotState.isRunning) {
        console.warn('[ROBÔ CÂMERAS] Ciclo anterior ainda em execução. Pulando...');
        return;
    }

    robotState.isRunning = true;
    const t0 = Date.now();
    console.log(`\n[ROBÔ CÂMERAS] >>> Iniciando ciclo de monitoramento (${new Date().toLocaleTimeString('pt-BR')})...`);

    try {
        loadCamerasCatalog();
        const batchToVerify = [];

        // 1. Sempre inclui 100% das câmeras do Lote 1 (Rock in Rio Crítico)
        batchToVerify.push(...lote1RockInRioList);

        // 2. Inclui chunk rotativo do Lote 2 (Demais câmeras RJ)
        if (lote2GeralList.length > 0) {
            const chunk = lote2GeralList.slice(lote2RotationIndex, lote2RotationIndex + LOTE2_CHUNK_SIZE);
            batchToVerify.push(...chunk);
            lote2RotationIndex = (lote2RotationIndex + LOTE2_CHUNK_SIZE) % lote2GeralList.length;
        }

        console.log(`[ROBÔ CÂMERAS] Validando lote prioritário de ${batchToVerify.length} câmeras (${lote1RockInRioList.length} RIR + ${batchToVerify.length - lote1RockInRioList.length} rotativas)...`);

        // 3. Execução paralela com controle de concorrência
        const results = await validateBatch(batchToVerify, 10, 2500);

        // 4. Atualização do Cache Operacional em Memória e Lista de Alertas
        const newAlerts = [];
        const dbPersistList = [];
        const now = Date.now();

        results.forEach(res => {
            const camOriginal = batchToVerify.find(c => String(c.id).padStart(6, '0') === res.camera_id) || {};
            const isRir = isRockInRioCriticalCamera(camOriginal);

            const record = {
                camera_id: res.camera_id,
                nome: camOriginal.nome || `Câmera #${res.camera_id}`,
                bairro: camOriginal.bairro || 'Rio de Janeiro',
                status: res.status,
                latencia_ms: res.latencia_ms,
                frames_validos: res.frames_validos,
                motivo: res.motivo,
                coordenada_validada: !camOriginal.coordenada_suspeita,
                coordenada_suspeita: !!camOriginal.coordenada_suspeita,
                latitude: camOriginal.latitude,
                longitude: camOriginal.longitude,
                distancia_via_metros: camOriginal.deslocamento_metros || 0,
                isRockInRio: isRir,
                timestamp: now
            };

            healthCache.set(res.camera_id, { data: record, time: now });
            dbPersistList.push(record);

            // Geração de Alertas CCO
            if (res.status === 'OFFLINE' && isRir) {
                newAlerts.push({
                    tipo: 'OFFLINE_CRITICA',
                    gravidade: 'ALTA',
                    camera_id: res.camera_id,
                    nome: record.nome,
                    bairro: record.bairro,
                    motivo: res.motivo,
                    horario: new Date().toISOString()
                });
            } else if (res.status === 'TIMEOUT') {
                newAlerts.push({
                    tipo: 'TIMEOUT_STREAM',
                    gravidade: 'MEDIA',
                    camera_id: res.camera_id,
                    nome: record.nome,
                    bairro: record.bairro,
                    motivo: res.motivo,
                    horario: new Date().toISOString()
                });
            }

            if (camOriginal.coordenada_suspeita) {
                newAlerts.push({
                    tipo: 'COORDENADA_SUSPEITA',
                    gravidade: 'INFO',
                    camera_id: res.camera_id,
                    nome: record.nome,
                    bairro: record.bairro,
                    motivo: camOriginal.motivo_auditoria || 'Deslocamento > 300m para via viária',
                    horario: new Date().toISOString()
                });
            }
        });

        robotState.activeAlerts = newAlerts;

        // 5. Atualização de Estatísticas Agregadas
        let onlineCount = 0, degradadaCount = 0, timeoutCount = 0, offlineCount = 0;
        let rirOnline = 0, rirDegradada = 0, rirTimeout = 0, rirOffline = 0;
        let totalLat = 0, countLat = 0;

        healthCache.forEach(entry => {
            const d = entry.data;
            if (d.status === 'ONLINE') {
                onlineCount++;
                if (d.latencia_ms > 0) { totalLat += d.latencia_ms; countLat++; }
            } else if (d.status === 'DEGRADADA') degradadaCount++;
            else if (d.status === 'TIMEOUT') timeoutCount++;
            else offlineCount++;

            if (d.isRockInRio) {
                if (d.status === 'ONLINE') rirOnline++;
                else if (d.status === 'DEGRADADA') rirDegradada++;
                else if (d.status === 'TIMEOUT') rirTimeout++;
                else rirOffline++;
            }
        });

        const totalInCache = healthCache.size;
        const latMedia = countLat > 0 ? Math.round(totalLat / countLat) : 480;
        const saudeGeral = totalInCache > 0 ? Math.round(((onlineCount + degradadaCount * 0.7) / totalInCache) * 100) : 100;
        const rirTotal = rirOnline + rirDegradada + rirTimeout + rirOffline;
        const rirSaude = rirTotal > 0 ? Math.round(((rirOnline + rirDegradada * 0.7) / rirTotal) * 100) : 100;

        robotState.stats = {
            total: cachedCamerasList ? cachedCamerasList.length : totalInCache,
            verificadasRecentes: totalInCache,
            online: onlineCount,
            degradada: degradadaCount,
            timeout: timeoutCount,
            offline: offlineCount,
            latenciaMediaMs: latMedia,
            saudePercentual: saudeGeral,
            rockInRio: {
                total: lote1RockInRioList.length,
                verificadas: rirTotal,
                online: rirOnline,
                degradada: rirDegradada,
                timeout: rirTimeout,
                offline: rirOffline,
                saudePercentual: rirSaude
            }
        };

        // 6. Persistência Assíncrona em PostgreSQL (background)
        bulkUpsertCameraHealth(dbPersistList).catch(err => {
            console.warn('[ROBÔ CÂMERAS] Falha não impeditiva na gravação em banco:', err.message);
        });

        const duration = Date.now() - t0;
        robotState.lastRunTimestamp = new Date().toISOString();
        robotState.lastExecutionDurationMs = duration;

        console.log(`[ROBÔ CÂMERAS] ✅ Ciclo finalizado em ${duration}ms. Status: ${onlineCount} Online | ${degradadaCount} Degradadas | ${offlineCount} Offline | ${timeoutCount} Timeout | RIR Saúde: ${rirSaude}%`);

    } catch (err) {
        console.error('[ROBÔ CÂMERAS] Erro no ciclo de monitoramento:', err);
    } finally {
        robotState.isRunning = false;
    }
}

/**
 * Obtém a saúde de uma câmera individual (Prioriza Cache < 45s)
 */
async function getCameraHealth(cameraId) {
    const normId = String(cameraId).padStart(6, '0');
    const now = Date.now();

    if (healthCache.has(normId)) {
        const cached = healthCache.get(normId);
        if (now - cached.time < CACHE_TTL_MS) {
            return { ok: true, cached: true, ...cached.data };
        }
    }

    loadCamerasCatalog();
    const cam = (cachedCamerasList || []).find(c => String(c.id).padStart(6, '0') === normId || String(c.id) === String(cameraId));

    if (!cam) {
        return { ok: false, error: 'Câmera não localizada no catálogo.' };
    }

    // Se expirou do cache ou primeira chamada, valida pontualmente
    const validation = await validateCameraStream(cam, 2500);
    const record = {
        camera_id: normId,
        nome: cam.nome,
        bairro: cam.bairro,
        status: validation.status,
        latencia_ms: validation.latencia_ms,
        frames_validos: validation.frames_validos,
        motivo: validation.motivo,
        coordenada_validada: !cam.coordenada_suspeita,
        coordenada_suspeita: !!cam.coordenada_suspeita,
        latitude: cam.latitude,
        longitude: cam.longitude,
        distancia_via_metros: cam.deslocamento_metros || 0,
        isRockInRio: isRockInRioCriticalCamera(cam),
        timestamp: now
    };

    healthCache.set(normId, { data: record, time: now });
    upsertCameraHealth(record).catch(() => {});

    return { ok: true, cached: false, ...record };
}

/**
 * Retorna estatísticas completas e alertas para o Dashboard CCO
 */
function getRobotDashboardStats() {
    return {
        ok: true,
        timestamp: new Date().toISOString(),
        lastRun: robotState.lastRunTimestamp,
        cicloDuracaoMs: robotState.lastExecutionDurationMs,
        stats: robotState.stats,
        alertasAtivos: robotState.activeAlerts.slice(0, 15)
    };
}

// Inicia loop periódico (intervalo padrão de 60 segundos)
let robotIntervalId = null;

function startRobot(intervalMs = 60000) {
    if (robotIntervalId) clearInterval(robotIntervalId);
    console.log(`[ROBÔ CÂMERAS] Serviço de Monitoramento Ativado (Intervalo: ${intervalMs / 1000}s)`);
    // Executa primeira rodada imediatamente
    runMonitoringCycle();
    robotIntervalId = setInterval(runMonitoringCycle, intervalMs);
}

function stopRobot() {
    if (robotIntervalId) {
        clearInterval(robotIntervalId);
        robotIntervalId = null;
    }
}

module.exports = {
    startRobot,
    stopRobot,
    runMonitoringCycle,
    getCameraHealth,
    getRobotDashboardStats,
    healthCache
};
