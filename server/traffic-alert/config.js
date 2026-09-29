/**
 * Agente RIT - Módulo RIT ALERTA
 * Gerenciador de Configuração com Validação Rígida e Sanitização de URLs.
 * Em conformidade com as Ressalvas Técnicas v2.1.
 */

const { OSRM_USAGE_MODES } = require('./constants');

// Lista estrita de hosts permitidos para chamadas externas
const ALLOWED_EXTERNAL_HOSTS = new Set([
    'router.project-osrm.org',
    'api.tomtom.com',
    'routes.googleapis.com',
    'api.windy.com'
]);

/**
 * Valida e sanitiza URLs externas garantindo padrões de segurança.
 * Rejeita tags HTML, esquemas inválidos, credenciais e hosts fora da allowlist.
 */
function validateAndSanitizeUrl(rawUrl, fieldName, options = { requireAllowlist: true, allowEmpty: false }) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        if (options.allowEmpty) return null;
        throw new Error(`[Configuração Inválida] O campo '${fieldName}' não pode ser vazio.`);
    }

    const trimmed = rawUrl.trim();

    // 1. Rejeição estrita a elementos HTML ou scripts
    if (/<[a-z][\s\S]*>/i.test(trimmed) || /javascript:/i.test(trimmed)) {
        throw new Error(`[Segurança] O campo '${fieldName}' contém elementos HTML ou scripts não permitidos.`);
    }

    // 2. Parse da URL
    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch (err) {
        throw new Error(`[Configuração Inválida] O campo '${fieldName}' não é uma URL válida: ${err.message}`);
    }

    // 3. Rejeição a credenciais embutidas (ex: https://user:pass@host)
    if (parsed.username || parsed.password) {
        throw new Error(`[Segurança] O campo '${fieldName}' não pode conter credenciais de autenticação embutidas na URL.`);
    }

    // 4. Protocolo deve ser HTTPS obrigatoriamente para fontes externas
    if (parsed.protocol !== 'https:') {
        // Exceção apenas para mocks em ambiente de teste local controlado
        const isLocalTest = (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') &&
            (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

        if (!isLocalTest) {
            throw new Error(`[Segurança] O campo '${fieldName}' deve utilizar obrigatoriamente o protocolo HTTPS.`);
        }
    }

    // 5. Verificação da allowlist de hosts
    if (options.requireAllowlist && !ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
        throw new Error(`[Segurança] O host '${parsed.hostname}' configurado em '${fieldName}' não está na allowlist autorizada.`);
    }

    // 6. Remoção segura de barra final (trailing slash) para consistência
    const cleanOrigin = `${parsed.protocol}//${parsed.host}`;
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    return `${cleanOrigin}${cleanPath}`;
}

/**
 * Carrega e valida todas as variáveis de ambiente do subsistema RIT ALERTA.
 */
function loadConfig(env = process.env) {
    const isProduction = env.NODE_ENV === 'production';

    // 1. Governança e Fixtures
    // Em produção, fixtures são SEMPRE terminantemente desativadas
    const rawDemoMode = String(env.RIT_ALERT_DEMO_MODE).toLowerCase() === 'true';
    const rawAllowFixtures = String(env.RIT_ALERT_ALLOW_FIXTURES).toLowerCase() === 'true';

    const allowFixtures = isProduction ? false : rawAllowFixtures;
    const demoMode = isProduction ? false : (rawDemoMode && allowFixtures);

    // 2. Armazenamento de Payload Bruto
    const storeRawPayload = String(env.RIT_ALERT_STORE_RAW_PAYLOAD).toLowerCase() === 'true';
    const rawRetentionHours = parseInt(env.RIT_ALERT_RAW_RETENTION_HOURS || '0', 10);

    // 3. OSRM Configuration
    const osrmUsageMode = (env.OSRM_USAGE_MODE || OSRM_USAGE_MODES.DEMO).toLowerCase();
    const validModes = Object.values(OSRM_USAGE_MODES);
    if (!validModes.includes(osrmUsageMode)) {
        throw new Error(`[Configuração Inválida] OSRM_USAGE_MODE deve ser um dos seguintes: ${validModes.join(', ')}.`);
    }

    const osrmBaseUrlRaw = env.OSRM_BASE_URL || 'https://router.project-osrm.org';
    const isPublicOsrm = osrmBaseUrlRaw.includes('router.project-osrm.org');

    const osrmBaseUrl = validateAndSanitizeUrl(osrmBaseUrlRaw, 'OSRM_BASE_URL', {
        requireAllowlist: isPublicOsrm,
        allowEmpty: false
    });

    let osrmMaxConcurrent = parseInt(env.OSRM_MAX_CONCURRENT_REQUESTS || '1', 10);
    let osrmMinIntervalMs = parseInt(env.OSRM_MIN_INTERVAL_MS || '1100', 10);

    // Regra Rígida v2.1: Servidor demo do OSRM é limitado a 1 req/s com concorrência 1
    if (osrmUsageMode === OSRM_USAGE_MODES.DEMO || isPublicOsrm) {
        osrmMaxConcurrent = 1;
        if (osrmMinIntervalMs < 1000) {
            osrmMinIntervalMs = 1100;
        }
    }

    const osrmRequestTimeoutMs = parseInt(env.OSRM_REQUEST_TIMEOUT_MS || '4000', 10);
    const osrmCacheTtlSeconds = parseInt(env.OSRM_CACHE_TTL_SECONDS || '300', 10);

    // 4. TomTom Orbis Configuration (v2)
    const tomtomOrbisEnabled = String(env.TOMTOM_ORBIS_ENABLED).toLowerCase() === 'true';
    const tomtomApiVersion = parseInt(env.TOMTOM_TRAFFIC_API_VERSION || '2', 10);
    const tomtomApiKey = env.TOMTOM_API_KEY || null;

    let tomtomOrbisBaseUrl = 'https://api.tomtom.com';
    if (env.TOMTOM_ORBIS_BASE_URL) {
        tomtomOrbisBaseUrl = validateAndSanitizeUrl(env.TOMTOM_ORBIS_BASE_URL, 'TOMTOM_ORBIS_BASE_URL', {
            requireAllowlist: true,
            allowEmpty: false
        });
    }

    // Se habilitado, exige chave e versão suportada
    if (tomtomOrbisEnabled) {
        if (!tomtomApiKey) {
            throw new Error("[Segurança] TOMTOM_ORBIS_ENABLED está ativo, mas TOMTOM_API_KEY não foi fornecida.");
        }
        if (![1, 2].includes(tomtomApiVersion)) {
            throw new Error(`[Configuração Inválida] Versão da API TomTom não suportada: ${tomtomApiVersion}. Versões suportadas: 1, 2.`);
        }
    }

    // 5. Google Routes Configuration
    const googleRoutesEnabled = String(env.GOOGLE_ROUTES_ENABLED).toLowerCase() === 'true';
    const googleRoutesApiKey = env.GOOGLE_ROUTES_API_KEY || null;
    if (googleRoutesEnabled && !googleRoutesApiKey) {
        throw new Error("[Segurança] GOOGLE_ROUTES_ENABLED está ativo, mas GOOGLE_ROUTES_API_KEY não foi fornecida.");
    }

    // 6. Windy Webcams Configuration
    const windyWebcamsEnabled = String(env.WINDY_WEBCAMS_ENABLED).toLowerCase() === 'true';
    const windyApiKey = env.WINDY_API_KEY || null;
    if (windyWebcamsEnabled && !windyApiKey) {
        throw new Error("[Segurança] WINDY_WEBCAMS_ENABLED está ativo, mas WINDY_API_KEY não foi fornecida.");
    }

    // 7. Parâmetros de Deduplicação e Agrupamento Espaço-Temporal
    const matchRadiusMeters = parseInt(env.INCIDENT_MATCH_RADIUS_METERS || '1500', 10);
    const matchCorridorRadiusMeters = parseInt(env.INCIDENT_MATCH_CORRIDOR_RADIUS_METERS || '2500', 10);
    const matchWindowMinutes = parseInt(env.INCIDENT_MATCH_WINDOW_MINUTES || '45', 10);

    // 8. Proteção contra Polling Agressivo no COR-Rio
    const corRioMinIntervalMs = parseInt(env.COR_RIO_MIN_INTERVAL_MS || '60000', 10);

    return Object.freeze({
        isProduction,
        governance: {
            demoMode,
            allowFixtures,
            storeRawPayload,
            rawRetentionHours
        },
        corRio: {
            minIntervalMs: corRioMinIntervalMs
        },
        deduplication: {
            matchRadiusMeters,
            matchCorridorRadiusMeters,
            matchWindowMinutes,
            matchWindowMs: matchWindowMinutes * 60 * 1000
        },
        osrm: {
            baseUrl: osrmBaseUrl,
            usageMode: osrmUsageMode,
            maxConcurrentRequests: osrmMaxConcurrent,
            minIntervalMs: osrmMinIntervalMs,
            requestTimeoutMs: osrmRequestTimeoutMs,
            cacheTtlSeconds: osrmCacheTtlSeconds,
            userAgent: 'AgenteRIT/1.0 (transporte@globo.com)'
        },
        tomtom: {
            enabled: tomtomOrbisEnabled,
            baseUrl: tomtomOrbisBaseUrl,
            apiVersion: tomtomApiVersion,
            apiKey: tomtomApiKey
        },
        google: {
            enabled: googleRoutesEnabled,
            apiKey: googleRoutesApiKey
        },
        windy: {
            enabled: windyWebcamsEnabled,
            apiKey: windyApiKey
        },
        caravanMonitoring: {
            enabled: env.CARAVAN_MONITORING_ENABLED !== 'false',
            destinationLabel: env.CARAVAN_DESTINATION_LABEL || 'ESTÚDIOS GLOBO — PONTO DE CHEGADA HOMOLOGAÇÃO',
            corridorBufferMeters: parseInt(env.CARAVAN_CORRIDOR_BUFFER_METERS || '1200', 10),
            projectionTtlMinutes: parseInt(env.CARAVAN_PROJECTION_TTL_MINUTES || '15', 10)
        }
    });
}

module.exports = {
    ALLOWED_EXTERNAL_HOSTS,
    validateAndSanitizeUrl,
    loadConfig,
    config: loadConfig()
};
