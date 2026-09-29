/**
 * Agente RIT - Módulo RIT ALERTA
 * Adaptador de Fonte Pública: COR-Rio (Estágio Operacional e Eventos de Trânsito).
 * Governança Estrita v2.1: Proibição de Scraping HTML e Prioridade de Provedor Estruturado.
 * 
 * Regra de Prioridade:
 * 1. Endpoint oficial documentado (JSON)
 * 2. Feed estruturado / API pública validada (JSON)
 * 3. Cache válido (em memória)
 * SEM SCRAPING.
 * 
 * Em caso de indisponibilidade de endpoint estruturado:
 * SOURCE_STATUS = UNSUPPORTED
 * Mensagem: "Fonte disponível apenas para consulta manual."
 */

const { BaseProvider } = require('./base-provider');
const { normalizeCorRioStage } = require('../engine/normalizer');
const { PROVIDER_HEALTH_STATUS, SOURCE_STATUS, STANDARD_MESSAGES } = require('../constants');
const { config } = require('../config');

class CorRioProvider extends BaseProvider {
    constructor(options = {}) {
        super('COR_RIO', {
            enabled: true,
            apiVersion: '1',
            ...options
        });
        // Endpoints oficiais exclusivamente estruturados (JSON)
        this.estagioApiUrl = options.estagioApiUrl || 'https://appcor.cor-rio.work/estagio_cidade';
        this.calorApiUrl = options.calorApiUrl || 'https://aplicativo.cocr.com.br/calor_api';
        this.timeoutMs = options.timeoutMs || 3000;
        this.userAgent = 'AgenteRIT/1.0 (transporte@globo.com)';
        
        // Cache em memória de último dado válido estruturado
        this.lastValidCache = null;

        // Proteção contra polling agressivo e controle de concorrência
        this.minIntervalMs = options.minIntervalMs || config.corRio?.minIntervalMs || 60000;
        this.lastSyncTime = 0;
        this.isSyncing = false;
    }

    async initialize() {
        await this.healthCheck();
        return true;
    }

    /**
     * Efetua requisição com timeout e User-Agent controlado, aceitando estritamente JSON.
     */
    async _fetchJsonWithTimeout(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                }
            });
            clearTimeout(timeoutId);
            return res;
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }

    /**
     * Coleta os dados de estágio e calor EXCLUSIVAMENTE via APIs estruturadas documentadas.
     * SEM SCRAPING DE HTML. Respeita COR_RIO_MIN_INTERVAL_MS e bloqueia requisições concorrentes.
     */
    async fetchData(params = {}) {
        const now = Date.now();

        // 1. Respeito ao cache local para evitar polling agressivo
        if (this.lastValidCache && (now - this.lastSyncTime < this.minIntervalMs) && !params.force) {
            return {
                ...this.lastValidCache,
                isCache: true,
                note: `Cache local válido respeitado (intervalo mínimo: ${this.minIntervalMs / 1000}s).`
            };
        }

        // 2. Proteção contra chamadas concorrentes simultâneas (Mutex)
        if (this.isSyncing) {
            if (this.lastValidCache) {
                return {
                    ...this.lastValidCache,
                    isCache: true,
                    note: 'Sincronização concorrente em andamento. Retornando cache válido.'
                };
            }
            throw new Error("[COR_RIO] Sincronização concorrente já em andamento.");
        }

        this.isSyncing = true;
        try {
            let estagioNum = null;
            let estagioNome = null;
            let estagioCor = null;
            let calorDesc = null;
            let sourceStatus = SOURCE_STATUS.ACTIVE;
            let note = null;

            // 1. Endpoint Oficial Documentado (JSON)
        try {
            const res = await this._fetchJsonWithTimeout(this.estagioApiUrl);
            const contentType = res.headers.get('content-type') || '';
            
            // Rejeição estrita a payloads HTML retornados por proxies ou telas de manutenção
            if (contentType.includes('text/html')) {
                throw new Error("Resposta recebida em HTML. Scraping não é permitido por política de governança.");
            }

            if (res.ok) {
                const data = await res.json();
                if (data && data.estagio && typeof data.estagio === 'string') {
                    const match = data.estagio.match(/Estágio\s*([1-5])/i);
                    if (match) {
                        estagioNum = parseInt(match[1], 10);
                        estagioNome = `Estágio ${estagioNum}`;
                        estagioCor = data.cor || null;
                    }
                }
            }
        } catch (err) {
            // Falha na API primária oficial estruturada
            sourceStatus = SOURCE_STATUS.UNSUPPORTED;
            note = STANDARD_MESSAGES.MANUAL_CONSULTATION_ONLY;
        }

        // 2. Feed Estruturado / API de Calor Validada (Opcional)
        try {
            const resCalor = await this._fetchJsonWithTimeout(this.calorApiUrl);
            const contentTypeCalor = resCalor.headers.get('content-type') || '';
            if (resCalor.ok && !contentTypeCalor.includes('text/html')) {
                const data = await resCalor.json();
                const nivel = data.nivel || data.level || data.heat_level || 1;
                calorDesc = `Calor Nível ${nivel}`;
            }
        } catch (err) {
            // Silencioso; índice térmico é complementar
        }

        // 3. Fallback de Cache Válido (sem scraping)
        if (estagioNum) {
            // Sucesso estruturado: atualiza o cache válido
            this.lastValidCache = {
                estagioNum,
                estagioNome,
                estagioCor,
                calorDesc,
                fetchedAt: new Date().toISOString(),
                isCache: false,
                sourceStatus: SOURCE_STATUS.ACTIVE
            };
            this.lastSyncTime = Date.now();
            return this.lastValidCache;
        }

        // Se a API estruturada falhou mas possuímos cache válido:
        if (this.lastValidCache) {
            return {
                ...this.lastValidCache,
                isCache: true,
                sourceStatus: SOURCE_STATUS.DEGRADED,
                note: 'Dados servidos a partir do último cache estruturado válido.'
            };
        }

        // 4. Sem endpoint estruturado disponível e sem cache:
        // NÃO TENTA SCRAPING. Retorna estado UNSUPPORTED com aviso para consulta manual.
        return {
            estagioNum: null,
            estagioNome: 'Indisponível',
            estagioCor: null,
            calorDesc: null,
            fetchedAt: new Date().toISOString(),
            isCache: false,
            sourceStatus: SOURCE_STATUS.UNSUPPORTED,
            note: STANDARD_MESSAGES.MANUAL_CONSULTATION_ONLY
        };
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Normaliza os dados brutos de estágio para DTO canônico.
     */
    normalize(rawData) {
        if (!rawData || rawData.sourceStatus === SOURCE_STATUS.UNSUPPORTED || !rawData.estagioNum) {
            return {
                status: 'UNSUPPORTED',
                sourceStatus: SOURCE_STATUS.UNSUPPORTED,
                message: STANDARD_MESSAGES.MANUAL_CONSULTATION_ONLY,
                isSynthetic: false,
                fetchedAt: rawData?.fetchedAt || new Date().toISOString()
            };
        }
        return normalizeCorRioStage(rawData);
    }

    /**
     * Ping de verificação de disponibilidade do endpoint JSON.
     */
    async ping() {
        try {
            const res = await this._fetchJsonWithTimeout(this.estagioApiUrl);
            return res.ok;
        } catch (err) {
            return false;
        }
    }
}

module.exports = {
    CorRioProvider
};
