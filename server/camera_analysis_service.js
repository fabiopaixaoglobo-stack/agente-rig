/**
 * Agente RIT - Camada Desacoplada de Análise de Câmeras por Inteligência Artificial
 * FASE 6 - Arquitetura Preparada para IA e Visão Computacional
 * 
 * Módulo desacoplado para inferência e ingestão de metadados:
 * - Congestionamento (nível, lentidão, filas)
 * - Condições climáticas (chuva, visibilidade, lâmina d'água)
 * - Pista bloqueada (veículo enguiçado, alagamento, obras)
 * - Aglomeração (densidade de pedestres, eventos públicos)
 * - Acidentes (colisão, capotamento, atropelamento)
 */

const { pool } = require('./database');

// Níveis Canônicos de Severidade e Detecção por IA
const AI_CONGESTION_LEVELS = {
    BAIXO: { label: 'Fluidez Normal', score: 0 },
    MEDIO: { label: 'Tráfego Intenso', score: 35 },
    ALTO: { label: 'Congestionamento Severo', score: 70 },
    CRITICO: { label: 'Parada Total / Pára-e-Siga', score: 95 }
};

const AI_RAIN_LEVELS = {
    NENHUMA: { label: 'Tempo Seco', risco: 0 },
    FRACA: { label: 'Chuva Fraca / Garoa', risco: 20 },
    MODERADA: { label: 'Chuva Moderada', risco: 50 },
    FORTE: { label: 'Chuva Forte / Temporal', risco: 80 },
    TEMPESTADE: { label: 'Alagamento Iminente', risco: 100 }
};

// Cache em memória de alta performance para leituras rápidas da telemetria de IA
const aiTelemetryCache = new Map(); // camera_id -> latest telemetry object

/**
 * Normaliza e valida a estrutura de metadados de IA recebida de sensores ou modelos
 */
function normalizeAiMetadata(raw = {}) {
    const congestionamentoNivel = String(raw.congestionamento_nivel || raw.congestionLevel || 'BAIXO').toUpperCase();
    const congestionLevel = AI_CONGESTION_LEVELS[congestionamentoNivel] ? congestionamentoNivel : 'BAIXO';
    const congestionScore = typeof raw.congestionamento_score === 'number' 
        ? raw.congestionamento_score 
        : AI_CONGESTION_LEVELS[congestionLevel].score;

    const chuvaIntensidade = String(raw.chuva_intensidade || raw.rainIntensity || 'NENHUMA').toUpperCase();
    const rainLevel = AI_RAIN_LEVELS[chuvaIntensidade] ? chuvaIntensidade : 'NENHUMA';
    const chuvaDetectada = raw.chuva_detectada !== undefined ? !!raw.chuva_detectada : (rainLevel !== 'NENHUMA');

    const pistaBloqueada = !!(raw.pista_bloqueada || raw.laneBlocked);
    const motivoBloqueio = raw.motivo_bloqueio || raw.blockingReason || (pistaBloqueada ? 'Obstrução Detectada' : null);

    const aglomeracaoDetectada = !!(raw.aglomeracao_detectada || raw.crowdDetected);
    const aglomeracaoDensidade = String(raw.aglomeracao_densidade || raw.crowdDensity || 'BAIXA').toUpperCase();

    const acidenteDetectado = !!(raw.acidente_detectado || raw.accidentDetected);
    const acidenteTipo = raw.acidente_tipo || raw.accidentType || (acidenteDetectado ? 'Colisão' : null);

    const confiancaIa = typeof raw.confianca_ia === 'number' ? Math.min(100, Math.max(0, raw.confianca_ia)) : 92.5;

    return {
        congestionamento_nivel: congestionLevel,
        congestionamento_score: congestionScore,
        chuva_detectada: chuvaDetectada,
        chuva_intensidade: rainLevel,
        pista_bloqueada: pistaBloqueada,
        motivo_bloqueio: motivoBloqueio,
        aglomeracao_detectada: aglomeracaoDetectada,
        aglomeracao_densidade: aglomeracaoDensidade,
        acidente_detectado: acidenteDetectado,
        acidente_tipo: acidenteTipo,
        confianca_ia: confiancaIa,
        metadados: raw.metadados || {},
        timestamp: new Date().toISOString()
    };
}

/**
 * Ingestão de telemetria de visão computacional para uma câmera
 */
async function ingestAiTelemetry(cameraId, rawData = {}, organizationId = 'globo') {
    const camIdStr = String(cameraId).padStart(6, '0');
    const normalized = normalizeAiMetadata(rawData);
    normalized.camera_id = camIdStr;
    normalized.organization_id = organizationId;

    // Atualiza cache em memória
    aiTelemetryCache.set(camIdStr, normalized);

    // Persiste no banco de dados se disponível
    try {
        await pool.query(
            `INSERT INTO camera_ai_telemetry (
                camera_id, congestionamento_nivel, congestionamento_score,
                chuva_detectada, chuva_intensidade, pista_bloqueada, motivo_bloqueio,
                aglomeracao_detectada, aglomeracao_densidade, acidente_detectado,
                acidente_tipo, confianca_ia, metadados, organization_id, data_hora
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
            [
                camIdStr,
                normalized.congestionamento_nivel,
                normalized.congestionamento_score,
                normalized.chuva_detectada,
                normalized.chuva_intensidade,
                normalized.pista_bloqueada,
                normalized.motivo_bloqueio,
                normalized.aglomeracao_detectada,
                normalized.aglomeracao_densidade,
                normalized.acidente_detectado,
                normalized.acidente_tipo,
                normalized.confianca_ia,
                JSON.stringify(normalized.metadados),
                organizationId
            ]
        );
    } catch (e) {
        console.warn(`⚠️ [CAMERA AI] Falha ao persistir telemetria para ${camIdStr}:`, e.message);
    }

    return normalized;
}

/**
 * Consulta a telemetria mais recente de IA para uma câmera específica
 */
async function getLatestAiTelemetry(cameraId) {
    const camIdStr = String(cameraId).padStart(6, '0');
    if (aiTelemetryCache.has(camIdStr)) {
        return aiTelemetryCache.get(camIdStr);
    }

    try {
        const res = await pool.query(
            `SELECT * FROM camera_ai_telemetry WHERE camera_id = $1 ORDER BY data_hora DESC LIMIT 1`,
            [camIdStr]
        );
        if (res.rows.length > 0) {
            const row = res.rows[0];
            const data = normalizeAiMetadata(row);
            data.camera_id = camIdStr;
            aiTelemetryCache.set(camIdStr, data);
            return data;
        }
    } catch (e) {
        console.warn(`⚠️ [CAMERA AI] Falha ao buscar telemetria da câmera ${camIdStr}:`, e.message);
    }

    // Retorna baseline padrão sem anomalias
    return normalizeAiMetadata({ congestionamento_nivel: 'BAIXO' });
}

/**
 * Consulta alertas críticos de IA ativos (Pista bloqueada, Acidente ou Chuva Forte)
 */
async function getActiveAiAlerts(options = {}) {
    const orgId = typeof options === 'string' ? options : (options.organizationId || options.organization_id || 'globo');
    let dbAlerts = [];
    try {
        const res = await pool.query(
            `SELECT * FROM camera_ai_telemetry 
             WHERE (pista_bloqueada = TRUE OR acidente_detectado = TRUE OR chuva_intensidade IN ('FORTE', 'TEMPESTADE'))
               AND (organization_id = $1 OR organization_id IS NULL)
             ORDER BY data_hora DESC
             LIMIT 50`,
            [orgId]
        );
        dbAlerts = res.rows.map(r => ({
            id: r.id,
            camera_id: r.camera_id,
            cameraId: r.camera_id,
            timestamp: r.data_hora,
            pistaBloqueada: r.pista_bloqueada,
            motivoBloqueio: r.motivo_bloqueio,
            acidenteDetectado: r.acidente_detectado,
            acidenteTipo: r.acidente_tipo,
            chuvaIntensidade: r.chuva_intensidade,
            confiancaIa: parseFloat(r.confianca_ia)
        }));
    } catch (e) {
        console.warn('⚠️ [CAMERA AI ALERTS] Falha ao carregar alertas ativos do banco:', e.message);
    }

    // Mescla com cache em memória (assegura baixa latência e resiliência)
    for (const [camId, cached] of aiTelemetryCache.entries()) {
        if ((cached.pista_bloqueada || cached.acidente_detectado || ['FORTE', 'TEMPESTADE'].includes(cached.chuva_intensidade))
            && (cached.organization_id === orgId || !cached.organization_id)) {
            if (!dbAlerts.find(a => a.camera_id === camId || a.cameraId === camId)) {
                dbAlerts.unshift({
                    id: 'mem-' + camId,
                    camera_id: camId,
                    cameraId: camId,
                    timestamp: cached.timestamp,
                    pistaBloqueada: cached.pista_bloqueada,
                    motivoBloqueio: cached.motivo_bloqueio,
                    acidenteDetectado: cached.acidente_detectado,
                    acidenteTipo: cached.acidente_tipo,
                    chuvaIntensidade: cached.chuva_intensidade,
                    confiancaIa: parseFloat(cached.confianca_ia)
                });
            }
        }
    }

    return dbAlerts;
}

/**
 * Resumo estatístico de IA para o Cockpit e Governança
 */
async function getAiGovernanceMetrics(organizationId = 'globo') {
    try {
        const res = await pool.query(
            `SELECT 
                COUNT(*) as total_leituras,
                COUNT(*) FILTER (WHERE pista_bloqueada = TRUE) as pistas_bloqueadas,
                COUNT(*) FILTER (WHERE acidente_detectado = TRUE) as acidentes_detectados,
                COUNT(*) FILTER (WHERE chuva_detectada = TRUE) as pontos_de_chuva,
                COUNT(*) FILTER (WHERE congestionamento_nivel IN ('ALTO', 'CRITICO')) as congestionamentos_severos,
                ROUND(AVG(confianca_ia)::numeric, 1) as media_confianca
             FROM camera_ai_telemetry
             WHERE data_hora > NOW() - INTERVAL '24 hours'
               AND organization_id = $1`,
            [organizationId]
        );
        return res.rows[0] || {
            total_leituras: 0,
            pistas_bloqueadas: 0,
            acidentes_detectados: 0,
            pontos_de_chuva: 0,
            congestionamentos_severos: 0,
            media_confianca: 95.0
        };
    } catch (e) {
        return {
            total_leituras: 0,
            pistas_bloqueadas: 0,
            acidentes_detectados: 0,
        };
    }
}

const SUPPORTED_FEATURES = ['congestionamento', 'chuva', 'pista_bloqueada', 'aglomeracao', 'acidentes'];

/**
 * Processamento e validação de telemetria recebida via API REST
 */
async function processTelemetry(payload = {}) {
    if (!payload.camera_id || payload.latitude === undefined || payload.longitude === undefined) {
        throw new Error('Campos obrigatórios ausentes: camera_id, latitude e longitude.');
    }

    if (payload.deteccoes && Array.isArray(payload.deteccoes)) {
        for (const det of payload.deteccoes) {
            if (!SUPPORTED_FEATURES.includes(det.feature)) {
                throw new Error(`Feature não suportada: ${det.feature}. Suportadas: ${SUPPORTED_FEATURES.join(', ')}`);
            }
        }
    }

    const raw = {
        metadados: {
            latitude: payload.latitude,
            longitude: payload.longitude,
            ...(payload.metadados || {})
        }
    };

    if (payload.deteccoes) {
        payload.deteccoes.forEach(d => {
            if (d.feature === 'congestionamento') {
                raw.congestionamento_nivel = d.gravidade === 'CRITICA' ? 'CRITICO' : (d.gravidade === 'ALTA' ? 'ALTO' : 'MEDIO');
                raw.confianca_ia = (d.confianca || 0.8) * 100;
            }
            if (d.feature === 'chuva') {
                raw.chuva_detectada = true;
                raw.chuva_intensidade = d.gravidade === 'CRITICA' ? 'TEMPESTADE' : 'FORTE';
            }
            if (d.feature === 'pista_bloqueada') {
                raw.pista_bloqueada = true;
                raw.motivo_bloqueio = d.motivo || 'Bloqueio viário detectado por visão computacional';
            }
            if (d.feature === 'aglomeracao') {
                raw.aglomeracao_detectada = true;
                raw.aglomeracao_densidade = d.gravidade === 'ALTA' ? 'ALTA' : 'MEDIA';
            }
            if (d.feature === 'acidentes') {
                raw.acidente_detectado = true;
                raw.acidente_tipo = d.tipo || 'Acidente detectado';
            }
        });
    }

    const saved = await ingestAiTelemetry(payload.camera_id, raw, payload.organization_id || 'globo');
    return {
        camera_id: payload.camera_id,
        total_deteccoes: payload.deteccoes ? payload.deteccoes.length : 0,
        telemetria: saved
    };
}

async function getRecentTelemetry(limit = 50) {
    try {
        const res = await pool.query(
            'SELECT * FROM camera_ai_telemetry ORDER BY data_hora DESC LIMIT $1',
            [limit]
        );
        return res.rows;
    } catch (e) {
        console.warn('⚠️ [CAMERA AI] Falha ao consultar telemetria recente:', e.message);
        return [];
    }
}

async function getCameraMetadata(cameraId) {
    return await getLatestAiTelemetry(cameraId);
}

async function getActiveAlerts(options = {}) {
    return await getActiveAiAlerts(options);
}

module.exports = {
    AI_CONGESTION_LEVELS,
    AI_RAIN_LEVELS,
    SUPPORTED_FEATURES,
    normalizeAiMetadata,
    ingestAiTelemetry,
    getLatestAiTelemetry,
    getActiveAiAlerts,
    getActiveAlerts,
    getAiGovernanceMetrics,
    processTelemetry,
    getRecentTelemetry,
    getCameraMetadata
};
