/**
 * Agente RIT - Módulo RIT ALERTA
 * Memory Store Temporário para Ingestão, Normalização e Deduplicação.
 * Garante validação completa de dados em memória antes da persistência definitiva em banco (v2.1).
 */

class MemoryStore {
    constructor() {
        this.incidents = new Map();         // id -> TrafficIncidentDTO / PublicSafetyEventDTO
        this.incidentSources = new Map();  // incidentId -> Array<IncidentSourceDTO>
        this.history = [];                 // Array de transições de estado
        this.providerHealth = new Map();   // providerId -> health object
    }

    /**
     * Limpa o estado em memória (útil para suítes de teste).
     */
    clear() {
        this.incidents.clear();
        this.incidentSources.clear();
        this.history = [];
        this.providerHealth.clear();
    }

    /**
     * Insere ou atualiza um incidente no store em memória.
     */
    upsertIncident(incident) {
        if (!incident || !incident.id) {
            throw new Error("[MemoryStore] Incidente inválido ou sem ID.");
        }

        const existing = this.incidents.get(incident.id);
        const now = new Date().toISOString();

        if (existing) {
            // Registra histórico de mudanças relevantes
            const changedFields = {};
            if (existing.status !== incident.status) changedFields.status = { from: existing.status, to: incident.status };
            if (existing.severity !== incident.severity) changedFields.severity = { from: existing.severity, to: incident.severity };
            if (existing.confidence !== incident.confidence) changedFields.confidence = { from: existing.confidence, to: incident.confidence };
            if (existing.divergenceFlag !== incident.divergenceFlag) changedFields.divergenceFlag = incident.divergenceFlag;

            if (Object.keys(changedFields).length > 0) {
                this.history.push({
                    id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    incidentId: incident.id,
                    changedAt: now,
                    changedFields,
                    reason: 'Atualização automática por nova fonte ou recalculo'
                });
            }
        } else {
            // Histórico de criação
            this.history.push({
                id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                incidentId: incident.id,
                changedAt: now,
                changedFields: { action: 'CREATED', title: incident.title, domain: incident.domain },
                reason: 'Primeira ingestão do incidente'
            });
        }

        this.incidents.set(incident.id, incident);

        // Atualiza índice de fontes
        if (Array.isArray(incident.sources)) {
            this.incidentSources.set(incident.id, [...incident.sources]);
        }

        return incident;
    }

    /**
     * Busca incidente por ID.
     */
    getIncidentById(id) {
        return this.incidents.get(id) || null;
    }

    /**
     * Retorna todos os incidentes ativos filtrados por domínio e segregação de fixtures.
     */
    getActiveIncidents({ domain = null, isSynthetic = false, corridor = null } = {}) {
        const list = [];
        for (const inc of this.incidents.values()) {
            if (inc.status === 'RESOLVED' || inc.status === 'DISMISSED') continue;
            if (domain && inc.domain !== domain) continue;
            if (inc.isSynthetic !== isSynthetic) continue;
            if (corridor && inc.corridor !== corridor) continue;
            list.push(inc);
        }
        return list;
    }

    /**
     * Retorna todo o repositório consolidado em memória.
     */
    getAllIncidents() {
        return Array.from(this.incidents.values());
    }

    /**
     * Retorna fontes associadas a um incidente.
     */
    getSourcesByIncidentId(incidentId) {
        return this.incidentSources.get(incidentId) || [];
    }

    /**
     * Retorna o histórico de transições de um incidente.
     */
    getHistoryByIncidentId(incidentId) {
        return this.history.filter(h => h.incidentId === incidentId);
    }

    /**
     * Atualiza o registro de saúde de um provedor.
     */
    updateProviderHealth(providerId, health) {
        this.providerHealth.set(providerId, {
            providerId,
            ...health,
            updatedAt: new Date().toISOString()
        });
    }

    /**
     * Retorna o estado de saúde de todos os provedores registrados.
     */
    getAllProviderHealth() {
        return Array.from(this.providerHealth.values());
    }
}

// Instância singleton para uso em runtime isolado
const memoryStore = new MemoryStore();

module.exports = {
    MemoryStore,
    memoryStore
};
