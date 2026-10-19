/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Configuração e Governança de Conexões Externas
 */

const config = {
    // Polling e Atualização
    POLL_INTERVAL_MS: 30000, // 30 segundos (Atende critério de aceite < 60s)
    CACHE_TTL_MS: 25000,     // 25 segundos no cache in-memory

    // Governança Estrita de Dados Sintéticos (Desativado por padrão em Produção e Homologação Real)
    ALLOW_SYNTHETIC_DATA: process.env.RIT_FLY_ALLOW_SYNTHETIC_DATA === 'true',

    // Provedores Homologados
    OPENSKY: {
        ENABLED: process.env.OPENSKY_ENABLED !== 'false',
        COMMERCIAL_ENABLED: process.env.OPENSKY_COMMERCIAL_ENABLED === 'true',
        BASE_URL: process.env.OPENSKY_API_URL || 'https://opensky-network.org/api/states/all',
        USERNAME: process.env.OPENSKY_USERNAME || '',
        PASSWORD: process.env.OPENSKY_PASSWORD || '',
        CLIENT_ID: process.env.OPENSKY_CLIENT_ID || '',
        CLIENT_SECRET: process.env.OPENSKY_CLIENT_SECRET || '',
        TIMEOUT_MS: 8000,
        // Bounding Box do Espaço Aéreo Brasileiro
        BBOX: {
            lamin: -34.0,
            lomin: -74.0,
            lamax: 5.5,
            lomax: -34.5
        }
    },

    METAR: {
        ENABLED: true,
        REDEMET_API_URL: process.env.REDEMET_API_URL || 'https://api.redemet.decea.mil.br/mensagens/metar',
        REDEMET_API_KEY: process.env.REDEMET_API_KEY || '',
        NOAA_FALLBACK_URL: 'https://aviationweather.gov/api/data/metar',
        TIMEOUT_MS: 5000
    },

    LOGISTICS: {
        DEFAULT_GROUND_TRANSIT_MIN: 45,
        DEFAULT_DOMESTIC_CHECKIN_MARGIN_MIN: 60,
        DEFAULT_DEPLANING_MARGIN_MIN: 20,
        HOURLY_WAITING_COST_BRL: 45.0, // Custo médio de hora parada (motorista + estacionamento aeroporto)
        PARKING_TAX_BRL: 28.0
    },

    ALLOWLIST_HOSTS: [
        'opensky-network.org',
        'aviationweather.gov',
        'api.redemet.decea.mil.br',
        'router.project-osrm.org',
        'api.adsb.lol',
        'api.aviationstack.com',
        'aerodatabox.p.rapidapi.com'
    ]
};

function isHostAllowed(urlStr) {
    try {
        const u = new URL(urlStr);
        return config.ALLOWLIST_HOSTS.some(host => u.hostname === host || u.hostname.endsWith('.' + host));
    } catch (e) {
        return false;
    }
}

module.exports = {
    config,
    ritFlyConfig: config,
    isHostAllowed
};
