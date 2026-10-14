/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Constantes Operacionais e Dicionário de Aviação do Agente RIT
 */

const FLIGHT_CATEGORIES = {
    COMERCIAL: 'comercial',
    HELICOPTERO: 'helicoptero',
    EXECUTIVO: 'executivo',
    CARGUEIRO: 'cargueiro'
};

const FLIGHT_STATUS = {
    SCHEDULED: 'PREVISTO',
    EN_ROUTE: 'EM ROTA',
    APPROACHING: 'APROXIMAÇÃO',
    LANDED: 'POUSADO',
    DELAYED: 'ATRASADO',
    CANCELLED: 'CANCELADO',
    DIVERTED: 'ALTERADO'
};

const SEVERITY_LEVELS = {
    CRITICO: 'CRITICO',
    ALTO: 'ALTO',
    MEDIO: 'MEDIO',
    INFO: 'INFO'
};

const DATA_MODE = {
    LIVE: 'LIVE',               // Dado observado em tempo real (ex: ADS-B via OpenSky)
    CACHED: 'CACHED',           // Dado real preservado em cache dentro do TTL
    ESTIMATED: 'ESTIMATED',     // Estimativa matemática ou logística gerada pelo RIT
    SYNTHETIC: 'SYNTHETIC',     // Dado simulado para demonstração/testes (bloqueado em produção)
    UNAVAILABLE: 'UNAVAILABLE'  // Provedor falhou ou dado oficial não existe
};

const CATEGORY_SOURCE = {
    ADSB_CATEGORY: 'ADSB_CATEGORY',
    AIRCRAFT_REGISTRY: 'AIRCRAFT_REGISTRY',
    OPERATOR_DATABASE: 'OPERATOR_DATABASE',
    CALLSIGN_HEURISTIC: 'CALLSIGN_HEURISTIC',
    MANUAL: 'MANUAL',
    UNKNOWN: 'UNKNOWN'
};

const ALERT_STATUS = {
    OPEN: 'OPEN',
    ACKNOWLEDGED: 'ACKNOWLEDGED',
    RESOLVED: 'RESOLVED',
    DISMISSED: 'DISMISSED'
};

const METAR_FLIGHT_RULES = {
    VFR: 'VFR',       // Visual Flight Rules (Teto >= 3000 ft, Vis >= 5000 m)
    MVFR: 'MVFR',     // Marginal VFR (Teto 1000-3000 ft, Vis 3000-5000 m)
    IFR: 'IFR',       // Instrument Flight Rules (Teto 500-1000 ft, Vis 1500-3000 m)
    LIFR: 'LIFR'      // Low IFR (Teto < 500 ft ou Vis < 1500 m)
};

// 8 Aeroportos Estratégicos Corporativos Brasileiros
const AIRPORTS = {
    GIG: {
        iata: 'GIG',
        icao: 'SBGL',
        nome: 'Aeroporto Internacional Tom Jobim (Galeão)',
        cidade: 'Rio de Janeiro',
        uf: 'RJ',
        lat: -22.8089,
        lng: -43.2436,
        elevationFt: 28,
        concessionaria: 'RIOgaleão'
    },
    SDU: {
        iata: 'SDU',
        icao: 'SBRJ',
        nome: 'Aeroporto Santos Dumont',
        cidade: 'Rio de Janeiro',
        uf: 'RJ',
        lat: -22.9105,
        lng: -43.1631,
        elevationFt: 9,
        concessionaria: 'Infraero'
    },
    CGH: {
        iata: 'CGH',
        icao: 'SBSP',
        nome: 'Aeroporto de Congonhas',
        cidade: 'São Paulo',
        uf: 'SP',
        lat: -23.6261,
        lng: -46.6564,
        elevationFt: 2631,
        concessionaria: 'Aena Brasil'
    },
    GRU: {
        iata: 'GRU',
        icao: 'SBGR',
        nome: 'Aeroporto Internacional de São Paulo / Guarulhos',
        cidade: 'Guarulhos',
        uf: 'SP',
        lat: -23.4356,
        lng: -46.4731,
        elevationFt: 2459,
        concessionaria: 'GRU Airport'
    },
    BSB: {
        iata: 'BSB',
        icao: 'SBBR',
        nome: 'Aeroporto Internacional de Brasília',
        cidade: 'Brasília',
        uf: 'DF',
        lat: -15.8711,
        lng: -47.9186,
        elevationFt: 3497,
        concessionaria: 'Inframerica'
    },
    CNF: {
        iata: 'CNF',
        icao: 'SBCF',
        nome: 'Aeroporto Internacional de Belo Horizonte / Confins',
        cidade: 'Confins',
        uf: 'MG',
        lat: -19.6244,
        lng: -43.9719,
        elevationFt: 2715,
        concessionaria: 'BH Airport'
    },
    SSA: {
        iata: 'SSA',
        icao: 'SBSV',
        nome: 'Aeroporto Internacional de Salvador - Dep. Luís Eduardo Magalhães',
        cidade: 'Salvador',
        uf: 'BA',
        lat: -12.9086,
        lng: -38.3225,
        elevationFt: 64,
        concessionaria: 'VINCI Airports'
    },
    REC: {
        iata: 'REC',
        icao: 'SBRF',
        nome: 'Aeroporto Internacional do Recife / Gilberto Freyre',
        cidade: 'Recife',
        uf: 'PE',
        lat: -8.1264,
        lng: -34.9240,
        elevationFt: 33,
        concessionaria: 'Aena Brasil'
    }
};

const AIRLINES = {
    GLO: { code: 'G3', name: 'GOL Linhas Aéreas', color: '#f97316' },
    TAM: { code: 'LA', name: 'LATAM Brasil', color: '#dc2626' },
    AZU: { code: 'AD', name: 'Azul Linhas Aéreas', color: '#0284c7' },
    PTB: { code: '2Z', name: 'Voepass Linhas Aéreas', color: '#10b981' },
    SID: { code: '0Q', name: 'Sideral Linhas Aéreas', color: '#eab308' },
    TTL: { code: 'TOTAL', name: 'Total Cargo', color: '#64748b' },
    MWM: { code: 'MODERN', name: 'Modern Logistics', color: '#6366f1' },
    LSE: { code: 'LIDER', name: 'Líder Aviação (Executiva)', color: '#a855f7' }
};

module.exports = {
    FLIGHT_CATEGORIES,
    FLIGHT_STATUS,
    SEVERITY_LEVELS,
    DATA_MODE,
    CATEGORY_SOURCE,
    ALERT_STATUS,
    METAR_FLIGHT_RULES,
    AIRPORTS,
    AIRLINES
};
