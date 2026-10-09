/**
 * Agente RIT - Módulo de Governança Multiempresa (Multi-tenancy / SaaS B2B)
 * FASE 7 - Preparação Comercial e Isolamento por Organization_ID
 * 
 * Permite que a plataforma atenda múltiplos clientes corporativos (Tenants),
 * mantendo compatibilidade integral com as operações existentes (Globo/CSC/Produção).
 */

const DEFAULT_ORGANIZATION_ID = process.env.DEFAULT_ORGANIZATION_ID || 'globo';

// Catálogo de Organizações e Operações Pré-configuradas
const TENANT_CATALOG = {
    'globo': {
        organization_id: 'globo',
        empresa_nome: 'Grupo Globo',
        operacao_nome: 'CSC - Central de Serviços Compartilhados & Produção Audiovisual',
        setores: ['Transportes CSC', 'Produção Globo', 'Jornalismo', 'Eventos Especiais', 'Operações'],
        destinos_oficiais: [
            { id: 'projac', nome: 'Estúdios Globo (Curicica / Jacarepaguá)', uf: 'RJ', lat: -22.9754, lon: -43.4116 },
            { id: 'jb', nome: 'Globo Jardim Botânico (Rua Lopes Quintas)', uf: 'RJ', lat: -22.9672, lon: -43.2241 },
            { id: 'sp', nome: 'Globo São Paulo (Edifício Jornalista Roberto Marinho - Brooklin)', uf: 'SP', lat: -23.6231, lon: -46.6991 },
            { id: 'bsb', nome: 'Globo Brasília (SRTVS Quadra 701)', uf: 'DF', lat: -15.7989, lon: -47.8931 }
        ],
        regras_negocio: {
            permite_caravanas: true,
            modais_permitidos: ['uberx', 'comfort', 'black', 'taxi', 'cooperativa', 'globo'],
            exigir_validacao_colaborador: true
        }
    },
    'padrao_corporativo': {
        organization_id: 'padrao_corporativo',
        empresa_nome: 'Operação Corporativa Padrão',
        operacao_nome: 'Transporte de Colaboradores e Logística B2B',
        setores: ['Logística', 'Operações', 'Administrativo', 'Diretoria'],
        destinos_oficiais: [
            { id: 'sede_rj', nome: 'Centro Empresarial Rio', uf: 'RJ', lat: -22.9068, lon: -43.1729 },
            { id: 'sede_sp', nome: 'Complexo Faria Lima / Berrini', uf: 'SP', lat: -23.5874, lon: -46.6806 }
        ],
        regras_negocio: {
            permite_caravanas: true,
            modais_permitidos: ['uberx', 'comfort', 'black', 'taxi', 'cooperativa'],
            exigir_validacao_colaborador: false
        }
    }
};

/**
 * Resolve o Tenant da requisição a partir de:
 * 1. Header HTTP x-organization-id
 * 2. Token JWT do usuário (req.user.organization_id)
 * 3. Query string (?organization_id=...)
 * 4. Fallback padrão: 'globo' (preserva compatibilidade absoluta)
 */
function resolveTenant(input = {}) {
    let rawOrg;
    if (typeof input === 'string') {
        rawOrg = input;
    } else {
        rawOrg = (
            (input.headers && input.headers['x-organization-id']) ||
            (input.user && input.user.organization_id) ||
            (input.query && input.query.organization_id) ||
            DEFAULT_ORGANIZATION_ID
        );
    }
    const orgKey = String(rawOrg || DEFAULT_ORGANIZATION_ID).trim().toLowerCase();
    
    let base = TENANT_CATALOG[orgKey];
    if (!base) {
        base = {
            organization_id: orgKey,
            empresa_nome: `Organização ${orgKey.toUpperCase()}`,
            operacao_nome: 'Operação B2B Personalizada',
            setores: ['Geral'],
            destinos_oficiais: [],
            regras_negocio: {
                permite_caravanas: true,
                modais_permitidos: ['uberx', 'comfort', 'taxi', 'cooperativa'],
                exigir_validacao_colaborador: false
            }
        };
    }

    return {
        ...base,
        organizationId: base.organization_id,
        empresa: base.empresa_nome,
        operacao: base.operacao_nome,
        isMultiTenant: base.organization_id !== 'globo'
    };
}

/**
 * Middleware Express para injeção automática de contexto do Tenant
 */
function tenantContextMiddleware(req, res, next) {
    req.tenant = resolveTenant(req);
    res.setHeader('X-Organization-Context', req.tenant.organization_id);
    next();
}

module.exports = {
    DEFAULT_ORGANIZATION_ID,
    TENANT_CATALOG,
    resolveTenant,
    tenantContextMiddleware
};
