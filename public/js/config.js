export const API_HOSTS = Object.freeze({
    PRIMARY: 'https://api.agenterit.com.br',
    SECONDARY: 'https://agente-rit-backend.onrender.com',
    LEGACY: 'https://agente-rig-backend.onrender.com'
});

export function getApiBaseUrl() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
        return '';
    }
    return API_HOSTS.PRIMARY;
}

export const CONFIG = {
    // Feature Flag de Monitoramento (true: ativo, false: temporariamente suspenso)
    FEATURE_MONITORAMENTO: false,
    API_HOSTS,
    getApiBaseUrl,
    DEFAULT_CENTER: [-22.9068, -43.1729],
    DEFAULT_ZOOM: 11,
    MAP_TILE_LAYER: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    MAP_ATTRIBUTION: '© OpenStreetMap contributors',
    API_ENDPOINTS: {
        NORMAS: '/api/normas',
        GEOCODE: '/api/geocode'
    },
    EXCEL_COLUMNS: {
        PLACA: "Placa Veículo",
        MOTORISTA: "Motorista",
        TIPO: "Tipo de Veículo",
        PROGRAMA: "Programa",
        ENDERECO: "Localidade + Endereço",
        DATA_HORA_INICIO: "Data Hora",
        DATA_HORA_FIM: "Data Hora2"
    }
};
