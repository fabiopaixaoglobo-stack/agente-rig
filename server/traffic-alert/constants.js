/**
 * Agente RIT - Módulo RIT ALERTA
 * Constantes canônicas e padronizadas do sistema de trânsito público.
 * Em conformidade com as Diretrizes de Governança e Privacidade v2.1.
 */

const INCIDENT_DOMAINS = Object.freeze({
    TRAFFIC_INCIDENT: 'TRAFFIC_INCIDENT',
    PUBLIC_SAFETY_EVENT: 'PUBLIC_SAFETY_EVENT'
});

const SEVERITY_LEVELS = Object.freeze({
    BAIXO: 'BAIXO',
    MEDIO: 'MEDIO',
    ALTO: 'ALTO',
    CRITICO: 'CRITICO'
});

const CONFIDENCE_LEVELS = Object.freeze({
    D: 'D',
    C: 'C',
    B: 'B',
    A: 'A',
    A_PLUS: 'A+'
});

const TRAFFIC_AWARENESS = Object.freeze({
    REAL_TIME: 'REAL_TIME',
    HISTORICAL: 'HISTORICAL',
    NOT_AVAILABLE: 'NOT_AVAILABLE'
});

const VISUAL_CONFIRMATION_STATUS = Object.freeze({
    NOT_AVAILABLE: 'NOT_AVAILABLE',
    CAMERA_AVAILABLE: 'CAMERA_AVAILABLE',
    PENDING_HUMAN_CONFIRMATION: 'PENDING_HUMAN_CONFIRMATION',
    HUMAN_CONFIRMED: 'HUMAN_CONFIRMED',
    INCONCLUSIVE: 'INCONCLUSIVE'
});

const INCIDENT_STATUS = Object.freeze({
    ACTIVE: 'ACTIVE',
    UPDATED: 'UPDATED',
    RESOLVED: 'RESOLVED',
    DISMISSED: 'DISMISSED'
});

const OSRM_USAGE_MODES = Object.freeze({
    DEMO: 'demo',
    SELF_HOSTED: 'self_hosted',
    CONTRACTED: 'contracted'
});

const PROVIDER_HEALTH_STATUS = Object.freeze({
    HEALTHY: 'HEALTHY',
    DEGRADED: 'DEGRADED',
    UNAVAILABLE: 'UNAVAILABLE',
    UNKNOWN: 'UNKNOWN'
});

const SOURCE_STATUS = Object.freeze({
    ACTIVE: 'ACTIVE',
    UNSUPPORTED: 'UNSUPPORTED',
    DEGRADED: 'DEGRADED',
    MANUAL_ONLY: 'MANUAL_ONLY'
});

// Mensagens padrão auditadas e aprovadas de UI
const STANDARD_MESSAGES = Object.freeze({
    OSRM_NO_REAL_TIME: 'Alternativa viária calculada, sem validação de trânsito em tempo real.',
    DIVERGENCE_WARNING: 'Fontes divergem quanto à severidade ou situação atual.',
    PUBLIC_SAFETY_NO_TRAFFIC_CONFIRMATION: 'Ocorrência pública de segurança registrada nas proximidades. Não foi possível confirmar impacto viário.',
    SERVICE_UNAVAILABLE_TEMPLATE: (lastValidDate) => 
        `Dados de trânsito temporariamente indisponíveis. Última atualização válida: ${lastValidDate || 'N/A'}.`,
    GOOGLE_ROUTES_NO_ADDITIONAL: 'Não foram encontradas alternativas válidas adicionais.',
    MANUAL_CONSULTATION_ONLY: 'Fonte disponível apenas para consulta manual.'
});

const CARAVAN_PROJECTED_STATUS = Object.freeze({
    PLANEJADA: 'PLANEJADA',
    DENTRO_DA_JANELA: 'DENTRO DA JANELA',
    ATENCAO: 'ATENÇÃO',
    RISCO_DE_ATRASO: 'RISCO DE ATRASO',
    FONTE_INDISPONIVEL: 'FONTE INDISPONÍVEL',
    AGUARDANDO_CALCULO: 'AGUARDANDO CÁLCULO',
    DADOS_INCOMPLETOS: 'DADOS INCOMPLETOS'
});

const CARAVAN_DISCLAIMER = 'PROJEÇÃO OPERACIONAL BASEADA NO ENDEREÇO E HORÁRIO PLANEJADOS. NÃO REPRESENTA A LOCALIZAÇÃO REAL DO ÔNIBUS.';

module.exports = {
    INCIDENT_DOMAINS,
    SEVERITY_LEVELS,
    CONFIDENCE_LEVELS,
    TRAFFIC_AWARENESS,
    VISUAL_CONFIRMATION_STATUS,
    INCIDENT_STATUS,
    OSRM_USAGE_MODES,
    PROVIDER_HEALTH_STATUS,
    SOURCE_STATUS,
    STANDARD_MESSAGES,
    CARAVAN_PROJECTED_STATUS,
    CARAVAN_DISCLAIMER
};
