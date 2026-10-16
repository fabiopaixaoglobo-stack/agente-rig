/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Interface Canônica Desacoplada: FlightPositionProvider
 * 
 * Contrato formal para ingestão de telemetria de aeronaves em tempo real
 * por provedores homologados (AeroAPI, Cirium, AeroDataBox, ADS-B Commercial, OpenSky).
 */

class FlightPositionProvider {
    /**
     * Verifica a conectividade e saúde da API do provedor
     * @returns {Promise<{ healthy: boolean, status: string, latencyMs: number, message: string }>}
     */
    async healthCheck() {
        throw new Error('Método healthCheck() deve ser implementado pelo provedor');
    }

    /**
     * Consulta a lista de voos em tempo real com base na área de cobertura e filtros
     * @param {Object} bounds - Bounding box { lamin, lomin, lamax, lomax }
     * @param {Object} filters - Filtros adicionais { categoria, status, search, companhia }
     * @returns {Promise<import('../types/flight-dto').FlightDTO[]>}
     */
    async getCurrentFlights(bounds = {}, filters = {}) {
        throw new Error('Método getCurrentFlights() deve ser implementado pelo provedor');
    }

    /**
     * Consulta detalhes operacionais de um voo ou aeronave específica por ICAO24 ou Callsign
     * @param {string} id - Código ICAO 24-bit ou callsign do voo
     * @returns {Promise<import('../types/flight-dto').FlightDTO|null>}
     */
    async getFlightById(id) {
        throw new Error('Método getFlightById() deve ser implementado pelo provedor');
    }

    /**
     * Retorna os metadados contratuais e técnicos do provedor
     * @returns {{ id: string, name: string, license: string, plan: string, coverage: string, sla: string }}
     */
    getProviderMetadata() {
        throw new Error('Método getProviderMetadata() deve ser implementado pelo provedor');
    }

    /**
     * Retorna o status de rate limit e cota de chamadas
     * @returns {{ status: 'OK'|'RATE_LIMITED'|'EXHAUSTED'|'UNAVAILABLE', remaining: number|null, resetTime: string|null }}
     */
    getRateLimitStatus() {
        throw new Error('Método getRateLimitStatus() deve ser implementado pelo provedor');
    }

    /**
     * Aplica filtros operacionais (categoria, status, busca, companhia) sobre a lista de voos
     * @param {Array} flights
     * @param {Object} filters
     * @returns {Array}
     */
    applyFilters(flights = [], filters = {}) {
        if (!Array.isArray(flights)) return [];
        let result = flights;

        if (filters.categoria && filters.categoria !== 'todos' && filters.categoria !== 'TODAS') {
            const catTarget = filters.categoria.toLowerCase();
            result = result.filter(f => (f.categoria || '').toLowerCase() === catTarget);
        }

        if (filters.status && filters.status !== 'todos') {
            const stTarget = filters.status.toUpperCase();
            result = result.filter(f => (f.status || '').toUpperCase() === stTarget);
        }

        if (filters.companhia && filters.companhia !== 'todas' && filters.companhia !== 'TODAS') {
            const compTarget = filters.companhia.trim().toLowerCase();
            if (compTarget === 'executivos' || compTarget === 'executivo') {
                result = result.filter(f => (f.categoria || '').toLowerCase() === 'executivo' || (f.companhia || '').toLowerCase().includes('executiv'));
            } else if (compTarget === 'helicopteros' || compTarget === 'helicoptero') {
                result = result.filter(f => (f.categoria || '').toLowerCase() === 'helicoptero');
            } else if (compTarget === 'cargueiros' || compTarget === 'cargueiro') {
                result = result.filter(f => (f.categoria || '').toLowerCase() === 'cargueiro');
            } else if (compTarget === 'nao_identificada') {
                result = result.filter(f => !f.companhia || f.companhia === 'Não Identificada');
            } else {
                result = result.filter(f => (f.companhia || '').toLowerCase().includes(compTarget));
            }
        }

        if (filters.search) {
            const s = filters.search.trim().toLowerCase();
            result = result.filter(f =>
                (f.callsign && f.callsign.toLowerCase().includes(s)) ||
                (f.numeroVoo && f.numeroVoo.toLowerCase().includes(s)) ||
                (f.prefixo && f.prefixo.toLowerCase().includes(s)) ||
                (f.origem && f.origem.toLowerCase().includes(s)) ||
                (f.destino && f.destino.toLowerCase().includes(s)) ||
                (f.companhia && f.companhia.toLowerCase().includes(s))
            );
        }

        return result;
    }
}

module.exports = {
    FlightPositionProvider
};
