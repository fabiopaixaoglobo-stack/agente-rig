/**
 * Agente RIT - Módulo Acompanhamento de Caravanas (CHECKPOINT 5.3)
 * Repositório em Memória / Massa Sintética de Homologação (caravan-store.js)
 * 
 * Regra de Segurança:
 * Dados 100% sintéticos para homologação assistida do CCO.
 * ZERO dados reais, ZERO nomes pessoais, ZERO placas, ZERO telefones.
 */

const { CaravanRouteProjectionService } = require('../engine/caravan-projection-service');
const { CARAVAN_PROJECTED_STATUS } = require('../constants');
const { calculateHaversineDistance } = require('../db/geo-fallback');

// Coordenadas genéricas de destino para homologação (Curicica / Jacarepaguá)
const DESTINATION_HOMOLOG_COORDS = [-22.9550, -43.4100];
const DESTINATION_HOMOLOG_LABEL = 'ESTÚDIOS GLOBO — PONTO DE CHEGADA HOMOLOGAÇÃO';

/**
 * Rota 1 (Norte / Pavuna -> Curicica via Linha Vermelha / Linha Amarela)
 */
const ROUTE_NORTE_COORDS = [
    [-22.8090, -43.3640], // Pavuna
    [-22.8250, -43.3300], // Acari
    [-22.8450, -43.3000], // Irajá / Av. Brasil
    [-22.8600, -43.2600], // Ramos / Linha Vermelha
    [-22.8800, -43.2350], // Fundão / Linha Vermelha Km 12 (cruza incidente crítico!)
    [-22.9050, -43.2700], // Linha Amarela Saída 7
    [-22.9300, -43.3400], // Linha Amarela / Barra
    [-22.9550, -43.4100]  // Destino Homologação
];

/**
 * Rota 2 (Baixada / Nova Iguaçu -> Curicica via Dutra / Transolímpica)
 */
const ROUTE_BAIXADA_COORDS = [
    [-22.7560, -43.4600], // Nova Iguaçu
    [-22.7950, -43.4100], // Dutra / Mesquita
    [-22.8350, -43.3700], // Dutra / Trevo Pavuna
    [-22.8700, -43.3850], // Deodoro / Transolímpica
    [-22.9200, -43.4000], // Magalhães Bastos
    [-22.9550, -43.4100]  // Destino Homologação
];

/**
 * Rota 3 (Leste / Niterói -> Curicica via Ponte Rio-Niterói / Linha Vermelha / Linha Amarela)
 */
const ROUTE_LESTE_COORDS = [
    [-22.8900, -43.1200], // Niterói Centro
    [-22.8850, -43.1600], // Vão Central da Ponte
    [-22.8800, -43.2100], // Acesso Rio / Caju
    [-22.9050, -43.2700], // Linha Amarela Norte
    [-22.9300, -43.3400], // Linha Amarela
    [-22.9550, -43.4100]  // Destino Homologação
];

/**
 * Rota 4 (Oeste / Campo Grande -> Curicica via Av. Brasil / Transolímpica)
 */
const ROUTE_OESTE_COORDS = [
    [-22.9030, -43.5590], // Campo Grande
    [-22.8850, -43.5000], // Bangu
    [-22.8700, -43.4300], // Realengo
    [-22.9100, -43.4100], // Transolímpica Sul
    [-22.9550, -43.4100]  // Destino Homologação
];

function buildBaseSyntheticCaravans() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    return [
        {
            caravanId: 'caravan-01',
            routeColor: '#00d1ff',
            caravanName: 'Caravana Demonstração Norte',
            programName: 'Domingão Especial',
            companyName: 'Log Rio',
            operationalNotes: 'Setor A - Portão 3',
            originLabel: 'Ponto de Encontro - Pavuna (Demonstração)',
            originAddress: 'Praça Central da Pavuna, Pavuna, Rio de Janeiro - RJ (Fictício)',
            originCoords: [-22.8090, -43.3640],
            plannedDepartureAt: `${dateStr}T13:45:00.000Z`,
            destinationLabel: DESTINATION_HOMOLOG_LABEL,
            destinationAddress: 'Acesso Portaria de Homologação — Curicica, Rio de Janeiro - RJ',
            destinationCoords: DESTINATION_HOMOLOG_COORDS,
            baseDistanceKm: 32.5,
            baseDurationMinutes: 48,
            operationalWindowStart: `${dateStr}T14:40:00.000Z`,
            operationalWindowEnd: `${dateStr}T15:15:00.000Z`,
            routeGeometry: ROUTE_NORTE_COORDS,
            isSynthetic: true
        },
        {
            caravanId: 'caravan-02',
            routeColor: '#f5a623',
            caravanName: 'Caravana Demonstração Baixada',
            programName: 'Caldeirão Especial',
            companyName: 'Doce Rio',
            operationalNotes: 'Setor VIP - Portão 1',
            originLabel: 'Ponto de Encontro - Nova Iguaçu (Demonstração)',
            originAddress: 'Av. Governador Portela, Centro, Nova Iguaçu - RJ (Fictício)',
            originCoords: [-22.7560, -43.4600],
            plannedDepartureAt: `${dateStr}T13:15:00.000Z`,
            destinationLabel: DESTINATION_HOMOLOG_LABEL,
            destinationAddress: 'Acesso Portaria de Homologação — Curicica, Rio de Janeiro - RJ',
            destinationCoords: DESTINATION_HOMOLOG_COORDS,
            baseDistanceKm: 38.0,
            baseDurationMinutes: 55,
            operationalWindowStart: `${dateStr}T14:15:00.000Z`,
            operationalWindowEnd: `${dateStr}T14:45:00.000Z`,
            routeGeometry: ROUTE_BAIXADA_COORDS,
            isSynthetic: true
        },
        {
            caravanId: 'caravan-03',
            routeColor: '#10b981',
            caravanName: 'Caravana Demonstração Leste',
            programName: 'Altas Horas Especial',
            companyName: 'Pianeta',
            operationalNotes: 'Plateia Geral - Portão 2',
            originLabel: 'Ponto de Encontro - Niterói (Demonstração)',
            originAddress: 'Terminal Rodoviário João Goulart, Niterói - RJ (Fictício)',
            originCoords: [-22.8900, -43.1200],
            plannedDepartureAt: `${dateStr}T14:30:00.000Z`,
            destinationLabel: DESTINATION_HOMOLOG_LABEL,
            destinationAddress: 'Acesso Portaria de Homologação — Curicica, Rio de Janeiro - RJ',
            destinationCoords: DESTINATION_HOMOLOG_COORDS,
            baseDistanceKm: 42.0,
            baseDurationMinutes: 62,
            operationalWindowStart: `${dateStr}T15:40:00.000Z`,
            operationalWindowEnd: `${dateStr}T16:15:00.000Z`,
            routeGeometry: ROUTE_LESTE_COORDS,
            isSynthetic: true
        },
        {
            caravanId: 'caravan-04',
            routeColor: '#d946ef',
            caravanName: 'Caravana Demonstração Oeste',
            programName: 'Conversa com Bial',
            companyName: 'Viação União',
            operationalNotes: 'Plateia Auditório - Portão 4',
            originLabel: 'Ponto de Encontro - Campo Grande (Demonstração)',
            originAddress: 'Praça dos Palmares, Campo Grande, Rio de Janeiro - RJ (Fictício)',
            originCoords: [-22.9030, -43.5590],
            plannedDepartureAt: `${dateStr}T14:15:00.000Z`,
            destinationLabel: DESTINATION_HOMOLOG_LABEL,
            destinationAddress: 'Acesso Portaria de Homologação — Curicica, Rio de Janeiro - RJ',
            destinationCoords: DESTINATION_HOMOLOG_COORDS,
            baseDistanceKm: 27.0,
            baseDurationMinutes: 40,
            operationalWindowStart: `${dateStr}T15:00:00.000Z`,
            operationalWindowEnd: `${dateStr}T15:30:00.000Z`,
            routeGeometry: ROUTE_OESTE_COORDS,
            isSynthetic: true
        }
    ];
}

class CaravanStore {
    constructor() {
        this.projectionService = new CaravanRouteProjectionService();
        this.caravans = new Map();
        this.cacheProjections = new Map();
        this.lastCalculatedAt = null;
        this.init();
    }

    init() {
        const base = buildBaseSyntheticCaravans();
        base.forEach(c => this.caravans.set(c.caravanId, c));
    }

    reset() {
        this.caravans.clear();
        this.cacheProjections.clear();
        this.init();
    }

    /**
     * Interpola uma geometria viária realista de uma origem até Curicica / Estúdios Globo.
     */
    generateRealisticRouteGeometry(originCoords, destCoords = DESTINATION_HOMOLOG_COORDS) {
        if (!originCoords || !Array.isArray(originCoords)) return [DESTINATION_HOMOLOG_COORDS];
        const [oLat, oLon] = originCoords;
        const [dLat, dLon] = destCoords;

        const midLat1 = (oLat * 0.65 + dLat * 0.35);
        const midLon1 = (oLon * 0.65 + dLon * 0.35) + (oLon < dLon ? 0.015 : -0.015);
        const midLat2 = (oLat * 0.3 + dLat * 0.7);
        const midLon2 = (oLon * 0.3 + dLon * 0.7);

        return [
            [Number(oLat.toFixed(4)), Number(oLon.toFixed(4))],
            [Number(midLat1.toFixed(4)), Number(midLon1.toFixed(4))],
            [-22.9100, -43.4000], // Passagem Transolímpica / Deodoro
            [Number(midLat2.toFixed(4)), Number(midLon2.toFixed(4))],
            [Number(dLat.toFixed(4)), Number(dLon.toFixed(4))]
        ];
    }

    /**
     * Cadastra uma nova caravana e calcula a projeção inicial.
     */
    addCaravan(data, publicIncidents = []) {
        const id = data.caravanId || `crv-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        const originCoords = data.originCoords || [-22.8000, -43.3500];
        const routeGeometry = data.routeGeometry && data.routeGeometry.length >= 2 
            ? data.routeGeometry 
            : this.generateRealisticRouteGeometry(originCoords);

        // Estima distância e duração base caso não fornecidos
        const distDirectMeters = calculateHaversineDistance(originCoords[0], originCoords[1], DESTINATION_HOMOLOG_COORDS[0], DESTINATION_HOMOLOG_COORDS[1]);
        const baseDistanceKm = data.baseDistanceKm || Math.round((distDirectMeters / 1000 * 1.35) * 10) / 10;
        const baseDurationMinutes = data.baseDurationMinutes || Math.round(baseDistanceKm * 1.5);

        const newPlan = {
            caravanId: id,
            caravanName: data.caravanName || 'Nova Caravana',
            programName: data.programName || 'Caldeirão',
            companyName: data.companyName || 'Log Rio',
            routeColor: data.routeColor || '#00d1ff',
            operationalNotes: data.operationalNotes || '',
            originLabel: data.originLabel || data.originAddress || 'Ponto de Partida',
            originAddress: data.originAddress || 'Endereço de Embarque',
            originCoords,
            plannedDepartureAt: data.plannedDepartureAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            destinationLabel: DESTINATION_HOMOLOG_LABEL,
            destinationAddress: 'Acesso Portaria de Homologação — Curicica, Rio de Janeiro - RJ',
            destinationCoords: DESTINATION_HOMOLOG_COORDS,
            baseDistanceKm,
            baseDurationMinutes,
            operationalWindowStart: data.operationalWindowStart || null,
            operationalWindowEnd: data.operationalWindowEnd || null,
            routeGeometry,
            isSynthetic: true
        };

        this.caravans.set(id, newPlan);
        const projection = this.projectionService.calculateProjection(newPlan, publicIncidents);
        this.cacheProjections.set(id, projection);
        return projection;
    }

    /**
     * Atualiza uma caravana existente.
     */
    updateCaravan(id, updateData, publicIncidents = []) {
        const existing = this.caravans.get(id);
        if (!existing) return null;

        const updatedPlan = { ...existing, ...updateData };
        if (updateData.originCoords && (!updateData.routeGeometry || updateData.routeGeometry.length < 2)) {
            updatedPlan.routeGeometry = this.generateRealisticRouteGeometry(updateData.originCoords);
        }

        this.caravans.set(id, updatedPlan);
        const projection = this.projectionService.calculateProjection(updatedPlan, publicIncidents);
        this.cacheProjections.set(id, projection);
        return projection;
    }

    /**
     * Exclui uma caravana.
     */
    deleteCaravan(id) {
        const existed = this.caravans.delete(id);
        this.cacheProjections.delete(id);
        return existed;
    }

    /**
     * Recalcula todas as caravanas cadastradas.
     */
    recalculateAll(publicIncidents = []) {
        this.lastCalculatedAt = new Date().toISOString();
        return this.getAll(publicIncidents).map(c => ({
            ...c,
            lastCalculatedAt: this.lastCalculatedAt
        }));
    }

    /**
     * Retorna todas as caravanas projetadas contra a lista de ocorrências públicas ativas.
     */
    getAll(publicIncidents = [], filters = {}) {
        const results = [];

        for (const [id, plan] of this.caravans.entries()) {
            const projection = this.projectionService.calculateProjection(plan, publicIncidents);
            this.cacheProjections.set(id, projection);

            // Aplicação de filtros
            let match = true;
            if (filters.programName && projection.programName !== filters.programName) match = false;
            if (filters.companyName && projection.companyName !== filters.companyName) match = false;
            if (filters.projectedStatus && projection.projectedStatus !== filters.projectedStatus) match = false;
            if (filters.search) {
                const s = String(filters.search).toLowerCase();
                const text = `${projection.caravanName} ${projection.programName} ${projection.companyName} ${projection.originLabel} ${projection.originAddress}`.toLowerCase();
                if (!text.includes(s)) match = false;
            }
            if (filters.hasIncidents === true && projection.incidents.length === 0) match = false;
            if (filters.hasIncidents === false && projection.incidents.length > 0) match = false;

            if (match) {
                results.push(projection);
            }
        }

        this.lastCalculatedAt = new Date().toISOString();
        return results;
    }

    /**
     * Retorna a projeção detalhada de uma caravana específica.
     */
    getById(id, publicIncidents = []) {
        const plan = this.caravans.get(id);
        if (!plan) return null;
        const projection = this.projectionService.calculateProjection(plan, publicIncidents);
        this.cacheProjections.set(id, projection);
        return projection;
    }

    /**
     * Força o recálculo da projeção com proteção contra cliques duplos.
     */
    recalculate(id, publicIncidents = []) {
        return this.getById(id, publicIncidents);
    }

    /**
     * Calcula os 4 KPIs compactos para o módulo de Caravanas.
     */
    getKpis(publicIncidents = []) {
        const projections = this.getAll(publicIncidents);

        const totalPlanned = projections.length;
        const withinWindow = projections.filter(p => p.projectedStatus === CARAVAN_PROJECTED_STATUS.DENTRO_DA_JANELA).length;
        const attention = projections.filter(p => p.projectedStatus === CARAVAN_PROJECTED_STATUS.ATENCAO).length;
        const delayRisk = projections.filter(p => p.projectedStatus === CARAVAN_PROJECTED_STATUS.RISCO_DE_ATRASO).length;
        const attentionOrRisk = attention + delayRisk;
        const withIncidents = projections.filter(p => p.incidents && p.incidents.length > 0).length;

        return {
            totalPlanned,
            withinWindow,
            attention,
            delayRisk,
            attentionOrRisk,
            withIncidents,
            lastCalculatedAt: this.lastCalculatedAt || new Date().toISOString(),
            isSynthetic: true
        };
    }
}

const caravanStore = new CaravanStore();

module.exports = {
    caravanStore,
    CaravanStore,
    buildBaseSyntheticCaravans,
    DESTINATION_HOMOLOG_COORDS,
    DESTINATION_HOMOLOG_LABEL
};
