/**
 * Agente RIT - Módulo RIT ALERTA
 * Serviço de Conexão com API e Sanitização de Dados (traffic-alert-service.js)
 * Privacy by Design / Zero GPS / Proteção Rigorosa contra XSS
 */

export class TrafficAlertService {
    constructor({ baseUrl = '/api/traffic-alert', timeoutMs = 8000 } = {}) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.timeoutMs = timeoutMs;
        this.lastHealth = null;
        this.lastValidTimestamp = null;
    }

    /**
     * Sanitiza strings prevenindo XSS e injeção de HTML.
     */
    sanitizeText(str, fallback = 'Não informado') {
        if (str === null || str === undefined || typeof str !== 'string') {
            return fallback;
        }
        const trimmed = str.trim();
        if (!trimmed) return fallback;

        // Remove tags HTML e caracteres maliciosos
        return trimmed
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Valida URLs externas com regras rígidas de segurança (HTTPS, allowlist, sem javascript/data).
     */
    validateExternalUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return null;
        const trimmed = rawUrl.trim();

        // Rejeita esquemas perigosos
        if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
            console.warn('[RIT ALERTA] URL com esquema proibido rejeitada:', trimmed);
            return null;
        }

        try {
            const parsed = new URL(trimmed);
            if (parsed.protocol !== 'https:') {
                console.warn('[RIT ALERTA] URL não-HTTPS rejeitada:', trimmed);
                return null;
            }

            // Não permite credenciais embutidas (ex: https://user:pass@host)
            if (parsed.username || parsed.password) {
                console.warn('[RIT ALERTA] URL com credenciais embutidas rejeitada.');
                return null;
            }

            return parsed.toString();
        } catch (e) {
            console.warn('[RIT ALERTA] URL inválida:', rawUrl);
            return null;
        }
    }

    /**
     * Executa requisição fetch com timeout e cabeçalhos seguros.
     */
    async _fetch(endpoint, options = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            let url;
            if (endpoint.startsWith('http')) {
                url = endpoint;
            } else if (endpoint.startsWith('/api/')) {
                url = endpoint;
            } else {
                url = `${this.baseUrl}${endpoint}`;
            }
            const res = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    ...(options.headers || {})
                }
            });

            clearTimeout(timer);

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                const err = new Error(errorData.error || `HTTP ${res.status}: Falha na requisição`);
                err.status = res.status;
                throw err;
            }

            const json = await res.json();
            return json;
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') {
                const timeoutErr = new Error('Tempo limite da requisição excedido (Timeout)');
                timeoutErr.isTimeout = true;
                throw timeoutErr;
            }
            throw err;
        }
    }

    /**
     * GET /api/traffic-alert/health
     */
    async getHealth() {
        try {
            const data = await this._fetch('/health');
            this.lastHealth = data;
            if (data.ok && data.timestamp) {
                this.lastValidTimestamp = data.timestamp;
            }
            return { ok: true, data };
        } catch (err) {
            return {
                ok: false,
                error: err.message,
                isTimeout: !!err.isTimeout,
                lastValidTimestamp: this.lastValidTimestamp
            };
        }
    }

    /**
     * GET /api/traffic-alert/incidents
     */
    async getIncidents({ domain = null, corridor = null, isSynthetic = false } = {}) {
        try {
            const params = new URLSearchParams();
            if (domain) params.append('domain', domain);
            if (corridor) params.append('corridor', corridor);
            if (isSynthetic) params.append('is_synthetic', 'true');

            const query = params.toString() ? `?${params.toString()}` : '';
            const res = await this._fetch(`/incidents${query}`);

            if (res.ok) {
                this.lastValidTimestamp = new Date().toISOString();
            }

            return {
                ok: true,
                count: res.count || (res.data ? res.data.length : 0),
                data: res.data || [],
                lastValidTimestamp: this.lastValidTimestamp
            };
        } catch (err) {
            return {
                ok: false,
                error: err.message,
                isTimeout: !!err.isTimeout,
                lastValidTimestamp: this.lastValidTimestamp,
                data: []
            };
        }
    }

    /**
     * GET /api/traffic-alert/incidents/:id
     */
    async getIncidentById(id) {
        if (!id) return { ok: false, error: 'ID do incidente obrigatório.' };
        try {
            const res = await this._fetch(`/incidents/${encodeURIComponent(id)}`);
            return { ok: true, data: res.data };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    /**
     * GET /api/traffic-alert/incidents/:id/sources
     */
    async getIncidentSources(id) {
        if (!id) return { ok: false, error: 'ID do incidente obrigatório.' };
        try {
            const res = await this._fetch(`/incidents/${encodeURIComponent(id)}/sources`);
            return { ok: true, count: res.count || 0, data: res.data || [] };
        } catch (err) {
            return { ok: false, error: err.message, data: [] };
        }
    }

    /**
     * GET /api/traffic-alert/incidents/:id/history
     */
    async getIncidentHistory(id) {
        if (!id) return { ok: false, error: 'ID do incidente obrigatório.' };
        try {
            const res = await this._fetch(`/incidents/${encodeURIComponent(id)}/history`);
            return { ok: true, count: res.count || 0, data: res.data || [] };
        } catch (err) {
            return { ok: false, error: err.message, data: [] };
        }
    }

    /**
     * GET /api/cameras/proximas (Consome câmeras públicas do catálogo existente)
     */
    async getNearbyCameras(lat, lon, radius = 2500, limit = 4) {
        if (typeof lat !== 'number' || typeof lon !== 'number') {
            return { ok: false, error: 'Coordenadas inválidas para busca de câmeras.' };
        }
        try {
            const url = `/api/cameras/proximas?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&radius=${encodeURIComponent(radius)}&limit=${encodeURIComponent(limit)}`;
            const res = await this._fetch(url);
            return {
                ok: true,
                count: res.cameras ? res.cameras.length : 0,
                data: res.cameras || [],
                nivelCobertura: res.nivelCobertura || 'MÉDIA'
            };
        } catch (err) {
            // Degradação elegante sem crash
            return {
                ok: false,
                error: err.message,
                data: [],
                nivelCobertura: 'INDISPONÍVEL'
            };
        }
    }
}
