/**
 * Agente RIT - Módulo RIT ALERTA
 * Contrato Base e Ciclo de Vida dos Provedores Externos.
 * Em conformidade com as Diretrizes Arquiteturais v2.1.
 */

const { PROVIDER_HEALTH_STATUS } = require('../constants');

class BaseProvider {
    /**
     * @param {string} name Nome identificador do provedor (ex: OSRM, TOMTOM_ORBIS, COR_RIO)
     * @param {object} options Configurações e flags do provedor
     */
    constructor(name, options = {}) {
        if (!name || typeof name !== 'string') {
            throw new Error("[BaseProvider] Nome do provedor é obrigatório.");
        }
        this.name = name;
        this.options = options;
        this.isEnabled = Boolean(options.enabled);
        this.apiVersion = options.apiVersion || '1';
        this.lastHealth = {
            status: PROVIDER_HEALTH_STATUS.UNKNOWN,
            apiVersion: this.apiVersion,
            latencyMs: 0,
            consecutiveFailures: 0,
            lastCheck: new Date(),
            lastSuccess: null,
            errorMessage: null
        };
    }

    /**
     * Inicializa recursos, valida dependências e verifica se o provedor está apto a operar.
     */
    async initialize() {
        throw new Error(`[BaseProvider] Método initialize() não implementado pelo provedor ${this.name}.`);
    }

    /**
     * Obtém os dados brutos da fonte externa com controle de timeout e cancelamento.
     */
    async fetchData(params = {}) {
        throw new Error(`[BaseProvider] Método fetchData() não implementado pelo provedor ${this.name}.`);
    }

    /**
     * Converte o payload bruto no formato canônico (TrafficIncidentDTO, RouteDTO, etc).
     */
    normalize(rawPayload) {
        throw new Error(`[BaseProvider] Método normalize() não implementado pelo provedor ${this.name}.`);
    }

    /**
     * Executa checagem de saúde e atualiza o estado interno de integridade.
     */
    async healthCheck() {
        const start = Date.now();
        try {
            const isOk = await this.ping();
            const latencyMs = Date.now() - start;
            this.lastHealth = {
                status: isOk ? PROVIDER_HEALTH_STATUS.HEALTHY : PROVIDER_HEALTH_STATUS.DEGRADED,
                apiVersion: this.apiVersion,
                latencyMs,
                consecutiveFailures: isOk ? 0 : this.lastHealth.consecutiveFailures + 1,
                lastCheck: new Date(),
                lastSuccess: isOk ? new Date() : this.lastHealth.lastSuccess,
                errorMessage: isOk ? null : 'Ping respondeu de forma anômala'
            };
            return this.lastHealth;
        } catch (err) {
            const latencyMs = Date.now() - start;
            this.lastHealth = {
                status: PROVIDER_HEALTH_STATUS.UNAVAILABLE,
                apiVersion: this.apiVersion,
                latencyMs,
                consecutiveFailures: this.lastHealth.consecutiveFailures + 1,
                lastCheck: new Date(),
                lastSuccess: this.lastHealth.lastSuccess,
                errorMessage: err.message
            };
            return this.lastHealth;
        }
    }

    /**
     * Método leve de ping/verificação de disponibilidade.
     */
    async ping() {
        return true;
    }

    /**
     * Retorna o snapshot atual de saúde do provedor para telemetria.
     */
    getHealthStatus() {
        return {
            providerId: this.name,
            ...this.lastHealth
        };
    }
}

module.exports = {
    BaseProvider
};
