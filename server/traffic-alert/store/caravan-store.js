/**
 * Agente RIT - Módulo Acompanhamento de Caravanas (RJ + SP) (CHECKPOINT 5.3)
 * Repositório em Memória / Massa Sintética de Homologação (caravan-store.js)
 * 
 * Regra de Segurança e Governança:
 * Dados 100% sintéticos para homologação assistida do CCO.
 * ZERO dados reais, ZERO nomes pessoais, ZERO placas, ZERO telefones, ZERO GPS.
 */

const { CaravanRouteProjectionService } = require('../engine/caravan-projection-service');
const { CARAVAN_PROJECTED_STATUS } = require('../constants');
const { calculateHaversineDistance } = require('../db/geo-fallback');

// Coordenadas genéricas de destino para homologação RJ (Curicica / Jacarepaguá)
const DESTINATION_HOMOLOG_COORDS = [-22.9550, -43.4100];
const DESTINATION_HOMOLOG_LABEL = 'ESTÚDIOS GLOBO — DESTINO DE HOMOLOGAÇÃO RJ';

// Coordenadas operacionais de destino para homologação SP (Edifício Jornalista Roberto Marinho - Berrini / Chucri Zaidan)
const DESTINATION_SP_COORDS = [-23.6186, -46.6974];
const DESTINATION_SP_LABEL = 'Edifício Jornalista Roberto Marinho - São Paulo (SP)';

/**
 * Rotas Rio de Janeiro
 */
const ROUTE_NORTE_COORDS = [
    [-22.8090, -43.3640], // Pavuna
    [-22.8250, -43.3300], // Acari
    [-22.8450, -43.3000], // Irajá / Av. Brasil
    [-22.8600, -43.2600], // Ramos / Linha Vermelha
    [-22.8800, -43.2350], // Fundão / Linha Vermelha Km 12
    [-22.9050, -43.2700], // Linha Amarela Saída 7
    [-22.9300, -43.3400], // Linha Amarela / Barra
    [-22.9550, -43.4100]  // Destino Homologação RJ
];

const ROUTE_BAIXADA_COORDS = [
    [-22.7560, -43.4600], // Nova Iguaçu
    [-22.7950, -43.4100], // Dutra / Mesquita
    [-22.8350, -43.3700], // Dutra / Trevo Pavuna
    [-22.8700, -43.3850], // Deodoro / Transolímpica
    [-22.9200, -43.4000], // Magalhães Bastos
    [-22.9550, -43.4100]  // Destino Homologação RJ
];

const ROUTE_LESTE_COORDS = [
    [-22.8900, -43.1200], // Niterói Centro
    [-22.8850, -43.1600], // Vão Central da Ponte
    [-22.8800, -43.2100], // Acesso Rio / Caju
    [-22.9050, -43.2700], // Linha Amarela Norte
    [-22.9300, -43.3400], // Linha Amarela
    [-22.9550, -43.4100]  // Destino Homologação RJ
];

const ROUTE_OESTE_COORDS = [
    [-22.9030, -43.5590], // Campo Grande
    [-22.8850, -43.5000], // Bangu
    [-22.8700, -43.4300], // Realengo
    [-22.9100, -43.4100], // Transolímpica Sul
    [-22.9550, -43.4100]  // Destino Homologação RJ
];

/**
 * Rotas São Paulo (Polo Berrini / Chucri Zaidan)
 */
const ROUTE_SP_OSASCO_COORDS = [
    [-23.5325, -46.7917], // Osasco Centro
    [-23.5510, -46.7450], // Jaguaré
    [-23.5780, -46.7050], // Marginal Pinheiros / Ponte Eusébio Matoso
    [-23.6020, -46.6990], // Berrini Norte
    [-23.6186, -46.6974]  // Edifício Jornalista Roberto Marinho
];

const ROUTE_SP_GUARULHOS_COORDS = [
    [-23.4628, -46.5333], // Guarulhos
    [-23.5180, -46.6100], // Tietê / Ponte das Bandeiras
    [-23.5600, -46.6450], // 23 de Maio / Paraíso
    [-23.6050, -46.6750], // Av. dos Bandeirantes
    [-23.6186, -46.6974]  // Edifício Jornalista Roberto Marinho
];

const ROUTE_SP_ABC_COORDS = [
    [-23.6558, -46.5337], // Santo André
    [-23.6350, -46.6000], // São Caetano / Acesso Bandeirantes
    [-23.6100, -46.6600], // Aeroporto Congonhas
    [-23.6186, -46.6974]  // Edifício Jornalista Roberto Marinho
];

const ROUTE_SP_BARUERI_COORDS = [
    [-23.4985, -46.8520], // Barueri / Alphaville
    [-23.5350, -46.7700], // Castelo Branco
    [-23.5780, -46.7050], // Marginal Pinheiros
    [-23.6050, -46.6990], // Chucri Zaidan
    [-23.6186, -46.6974]  // Edifício Jornalista Roberto Marinho
];

function buildBaseSyntheticCaravans() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    return [
        {
            caravanId: 'caravan-01',
            region: 'RJ',
            routeColor: '#00d1ff',
            caravanName: 'Caravana Domingão com Huck — Niterói & São Gonçalo',
            programName: 'Domingão com Huck',
            companyName: 'Log Rio',
            operationalNotes: 'Setor A - Portão 3 · Plateia Principal',
            originLabel: 'Terminal Rodoviário João Goulart — Niterói',
            originAddress: 'Praça Renascença, Centro, Niterói - RJ',
            neighborhood: 'Niterói',
            corridor: 'Ponte Rio-Niterói / Linha Vermelha / Transolímpica',
            originCoords: [-22.8090, -43.3640],
            plannedDepartureAt: `${dateStr}T13:45:00.000Z`,
            destinationLabel: DESTINATION_HOMOLOG_LABEL,
            destinationAddress: 'Acesso Portaria Principal Estúdios Globo — Curicica / Jacarepaguá, Rio de Janeiro - RJ',
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
            region: 'RJ',
            routeColor: '#f5a623',
            caravanName: 'Caravana Caldeirão com Mion — Baixada Fluminense',
            programName: 'Caldeirão com Mion',
            companyName: 'Doce Rio',
            operationalNotes: 'Setor VIP - Portão 1 · Estúdio B',
            originLabel: 'Praça do Skate — Nova Iguaçu',
            originAddress: 'Av. Governador Portela, Centro, Nova Iguaçu - RJ',
            neighborhood: 'Nova Iguaçu',
            corridor: 'Baixada Fluminense / Presidente Dutra / Transolímpica',
            originCoords: [-22.7560, -43.4600],
            plannedDepartureAt: `${dateStr}T13:15:00.000Z`,
            destinationLabel: DESTINATION_HOMOLOG_LABEL,
            destinationAddress: 'Acesso Portaria Principal Estúdios Globo — Curicica / Jacarepaguá, Rio de Janeiro - RJ',
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
            region: 'RJ',
            routeColor: '#10b981',
            caravanName: 'Caravana Altas Horas — Zona Norte & Madureira',
            programName: 'Altas Horas',
            companyName: 'Pianeta',
            operationalNotes: 'Plateia Geral - Portão 2',
            originLabel: 'Parque Madureira — Madureira',
            originAddress: 'Rua Soares Caldeira, Madureira, Rio de Janeiro - RJ',
            neighborhood: 'Madureira',
            corridor: 'Zona Norte / Linha Amarela / Barra da Tijuca',
            originCoords: [-22.8900, -43.1200],
            plannedDepartureAt: `${dateStr}T14:30:00.000Z`,
            destinationLabel: DESTINATION_HOMOLOG_LABEL,
            destinationAddress: 'Acesso Portaria Principal Estúdios Globo — Curicica / Jacarepaguá, Rio de Janeiro - RJ',
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
            region: 'RJ',
            routeColor: '#d946ef',
            caravanName: 'Caravana Conversa com Bial — Zona Oeste & Campo Grande',
            programName: 'Conversa com Bial',
            companyName: 'Viação União',
            operationalNotes: 'Plateia Auditório - Portão 4',
            originLabel: 'Praça Raul Boaventura — Campo Grande',
            originAddress: 'Praça Raul Boaventura, Campo Grande, Rio de Janeiro - RJ',
            neighborhood: 'Campo Grande',
            corridor: 'Zona Oeste / Transolímpica / Jacarepaguá',
            originCoords: [-22.9030, -43.5590],
            plannedDepartureAt: `${dateStr}T14:15:00.000Z`,
            destinationLabel: DESTINATION_HOMOLOG_LABEL,
            destinationAddress: 'Acesso Portaria Principal Estúdios Globo — Curicica / Jacarepaguá, Rio de Janeiro - RJ',
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

function buildBaseSpCaravans() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    return [
        {
            caravanId: 'sp-caravan-01',
            region: 'SP',
            routeColor: '#00d1ff',
            caravanName: 'Caravana Encontro com Patrícia Poeta — Osasco & Região Oeste',
            programName: 'Encontro com Patrícia Poeta',
            companyName: 'Viação Osasco Sul',
            operationalNotes: 'Operação Matutina · Portaria Berrini',
            originLabel: 'Largo de Osasco — Osasco',
            originAddress: 'Rua Antônio Agú, Centro, Osasco - SP',
            neighborhood: 'Osasco',
            corridor: 'Marginal Pinheiros / Av. Eng. Luís Carlos Berrini',
            originCoords: [-23.5325, -46.7917],
            plannedDepartureAt: `${dateStr}T06:45:00.000Z`,
            destinationLabel: DESTINATION_SP_LABEL,
            destinationAddress: 'Av. Jornalista Roberto Marinho, Brooklin, São Paulo - SP',
            destinationCoords: DESTINATION_SP_COORDS,
            baseDistanceKm: 24.5,
            baseDurationMinutes: 38,
            operationalWindowStart: `${dateStr}T07:30:00.000Z`,
            operationalWindowEnd: `${dateStr}T08:15:00.000Z`,
            routeGeometry: ROUTE_SP_OSASCO_COORDS,
            isSynthetic: true
        },
        {
            caravanId: 'sp-caravan-02',
            region: 'SP',
            routeColor: '#f5a623',
            caravanName: 'Caravana Encontro com Patrícia Poeta — Guarulhos & Região Norte',
            programName: 'Encontro com Patrícia Poeta',
            companyName: 'Expresso Metropolitano SP',
            operationalNotes: 'Plateia Ao Vivo · Setor A',
            originLabel: 'Praça IV Centenário — Guarulhos',
            originAddress: 'Praça IV Centenário, Centro, Guarulhos - SP',
            neighborhood: 'Guarulhos',
            corridor: 'Marginal Tietê / Av. 23 de Maio / Bandeirantes',
            originCoords: [-23.4628, -46.5333],
            plannedDepartureAt: `${dateStr}T06:30:00.000Z`,
            destinationLabel: DESTINATION_SP_LABEL,
            destinationAddress: 'Av. Jornalista Roberto Marinho, Brooklin, São Paulo - SP',
            destinationCoords: DESTINATION_SP_COORDS,
            baseDistanceKm: 36.0,
            baseDurationMinutes: 52,
            operationalWindowStart: `${dateStr}T07:25:00.000Z`,
            operationalWindowEnd: `${dateStr}T08:15:00.000Z`,
            routeGeometry: ROUTE_SP_GUARULHOS_COORDS,
            isSynthetic: true
        },
        {
            caravanId: 'sp-caravan-03',
            region: 'SP',
            routeColor: '#10b981',
            caravanName: 'Caravana Altas Horas SP — Santo André & ABC Paulista',
            programName: 'Altas Horas',
            companyName: 'ABC Turismo & Fretamento',
            operationalNotes: 'Gravação Noturna · Portaria Chucri Zaidan',
            originLabel: 'Praça do Carmo — Santo André',
            originAddress: 'Praça do Carmo, Centro, Santo André - SP',
            neighborhood: 'Santo André',
            corridor: 'Av. dos Bandeirantes / Berrini',
            originCoords: [-23.6558, -46.5337],
            plannedDepartureAt: `${dateStr}T13:30:00.000Z`,
            destinationLabel: DESTINATION_SP_LABEL,
            destinationAddress: 'Av. Jornalista Roberto Marinho, Brooklin, São Paulo - SP',
            destinationCoords: DESTINATION_SP_COORDS,
            baseDistanceKm: 28.0,
            baseDurationMinutes: 44,
            operationalWindowStart: `${dateStr}T14:20:00.000Z`,
            operationalWindowEnd: `${dateStr}T15:00:00.000Z`,
            routeGeometry: ROUTE_SP_ABC_COORDS,
            isSynthetic: true
        },
        {
            caravanId: 'sp-caravan-04',
            region: 'SP',
            routeColor: '#d946ef',
            caravanName: 'Caravana Caldeirão com Mion SP — Barueri & Alphaville',
            programName: 'Caldeirão com Mion',
            companyName: 'Viação Castelo Branco',
            operationalNotes: 'Setor Plateia VIP · Entrada Roberto Marinho',
            originLabel: 'Alameda Rio Negro — Alphaville',
            originAddress: 'Alameda Rio Negro, Alphaville, Barueri - SP',
            neighborhood: 'Barueri',
            corridor: 'Rod. Castelo Branco / Marginal Pinheiros / Chucri Zaidan',
            originCoords: [-23.4985, -46.8520],
            plannedDepartureAt: `${dateStr}T12:00:00.000Z`,
            destinationLabel: DESTINATION_SP_LABEL,
            destinationAddress: 'Av. Jornalista Roberto Marinho, Brooklin, São Paulo - SP',
            destinationCoords: DESTINATION_SP_COORDS,
            baseDistanceKm: 32.0,
            baseDurationMinutes: 46,
            operationalWindowStart: `${dateStr}T12:50:00.000Z`,
            operationalWindowEnd: `${dateStr}T13:30:00.000Z`,
            routeGeometry: ROUTE_SP_BARUERI_COORDS,
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
        // Carga padrão das caravanas sintéticas RJ
        const baseRj = buildBaseSyntheticCaravans();
        baseRj.forEach(c => this.caravans.set(c.caravanId, c));

        // Carga complementar das caravanas sintéticas SP
        const baseSp = buildBaseSpCaravans();
        baseSp.forEach(c => this.caravans.set(c.caravanId, c));
    }

    reset() {
        this.caravans.clear();
        this.cacheProjections.clear();
        this.init();
    }

    /**
     * Interpola uma geometria viária realista de uma origem até o destino regional.
     */
    generateRealisticRouteGeometry(originCoords, destCoords = null) {
        if (!originCoords || !Array.isArray(originCoords)) return [DESTINATION_HOMOLOG_COORDS];
        const isSp = originCoords[0] < -23.4;
        const targetDest = destCoords || (isSp ? DESTINATION_SP_COORDS : DESTINATION_HOMOLOG_COORDS);
        const [oLat, oLon] = originCoords;
        const [dLat, dLon] = targetDest;

        const midLat1 = (oLat * 0.65 + dLat * 0.35);
        const midLon1 = (oLon * 0.65 + dLon * 0.35) + (oLon < dLon ? 0.015 : -0.015);
        const midLat2 = (oLat * 0.3 + dLat * 0.7);
        const midLon2 = (oLon * 0.3 + dLon * 0.7);

        return [
            [Number(oLat.toFixed(4)), Number(oLon.toFixed(4))],
            [Number(midLat1.toFixed(4)), Number(midLon1.toFixed(4))],
            [Number(((oLat + dLat) / 2).toFixed(4)), Number(((oLon + dLon) / 2).toFixed(4))],
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
        const isSp = (data.region === 'SP') || (originCoords && originCoords[0] < -23.4);
        const region = isSp ? 'SP' : (data.region || 'RJ');
        const defaultDestCoords = isSp ? DESTINATION_SP_COORDS : DESTINATION_HOMOLOG_COORDS;
        const defaultDestLabel = isSp ? DESTINATION_SP_LABEL : DESTINATION_HOMOLOG_LABEL;

        const routeGeometry = data.routeGeometry && data.routeGeometry.length >= 2 
            ? data.routeGeometry 
            : this.generateRealisticRouteGeometry(originCoords, data.destinationCoords || defaultDestCoords);

        // Estima distância e duração base caso não fornecidos
        const targetDestCoords = data.destinationCoords || defaultDestCoords;
        const distDirectMeters = calculateHaversineDistance(originCoords[0], originCoords[1], targetDestCoords[0], targetDestCoords[1]);
        const baseDistanceKm = data.baseDistanceKm || Math.round((distDirectMeters / 1000 * 1.35) * 10) / 10;
        const baseDurationMinutes = data.baseDurationMinutes || Math.round(baseDistanceKm * 1.5);

        const newPlan = {
            caravanId: id,
            region,
            caravanName: data.caravanName || 'Nova Caravana',
            programName: data.programName || (isSp ? 'Encontro com Patrícia Poeta' : 'Caldeirão'),
            companyName: data.companyName || (isSp ? 'Expresso Metropolitano SP' : 'Log Rio'),
            routeColor: data.routeColor || '#00d1ff',
            operationalNotes: data.operationalNotes || '',
            originLabel: data.originLabel || data.originAddress || 'Ponto de Partida',
            originAddress: data.originAddress || 'Endereço de Embarque',
            originCoords,
            plannedDepartureAt: data.plannedDepartureAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            destinationLabel: data.destinationLabel || defaultDestLabel,
            destinationAddress: data.destinationAddress || (isSp ? 'Av. Jornalista Roberto Marinho, Brooklin, São Paulo - SP' : 'Acesso Portaria de Homologação — Curicica, Rio de Janeiro - RJ'),
            destinationCoords: targetDestCoords,
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
            updatedPlan.routeGeometry = this.generateRealisticRouteGeometry(updateData.originCoords, updatedPlan.destinationCoords);
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
     * Recalcula todas as caravanas cadastradas da região.
     */
    recalculateAll(publicIncidents = [], filters = {}) {
        this.lastCalculatedAt = new Date().toISOString();
        return this.getAll(publicIncidents, filters).map(c => ({
            ...c,
            lastCalculatedAt: this.lastCalculatedAt
        }));
    }

    /**
     * Retorna caravanas projetadas contra ocorrências públicas ativas filtradas por região e parâmetros.
     */
    getAll(publicIncidents = [], filters = {}) {
        const results = [];
        let incidents = Array.isArray(publicIncidents) ? publicIncidents : [];
        let filterObj = {};
        if (typeof publicIncidents === 'string') {
            filterObj = { region: publicIncidents };
        } else if (typeof filters === 'string') {
            filterObj = { region: filters };
        } else if (filters && typeof filters === 'object') {
            filterObj = { ...filters };
        }
        // Default é RJ para preservar compatibilidade estrita com testes existentes de 4 caravanas
        const targetRegion = filterObj.region ? String(filterObj.region).toUpperCase() : 'RJ';

        for (const [id, plan] of this.caravans.entries()) {
            // Filtro Regional Rigoroso (RJ vs SP)
            if (targetRegion !== 'ALL') {
                const planRegion = (plan.region || 'RJ').toUpperCase();
                if (planRegion !== targetRegion) continue;
            }

            const projection = this.projectionService.calculateProjection(plan, publicIncidents);
            this.cacheProjections.set(id, projection);

            // Aplicação de filtros complementares
            let match = true;
            if (filterObj.programName && projection.programName !== filterObj.programName) match = false;
            if (filterObj.companyName && projection.companyName !== filterObj.companyName) match = false;
            if (filterObj.projectedStatus && projection.projectedStatus !== filterObj.projectedStatus) match = false;
            if (filterObj.search) {
                const s = String(filterObj.search).toLowerCase().trim();
                const text = `${projection.caravanName} ${projection.programName} ${projection.companyName} ${projection.originLabel} ${projection.originAddress} ${plan.neighborhood || ''} ${plan.corridor || ''} ${projection.destinationLabel || ''} ${projection.destinationAddress || ''}`.toLowerCase();
                const matchesDirect = text.includes(s);
                const isBarraRegion = (s === 'barra' || s.includes('barra') || s === 'jacarepaguá' || s.includes('jacarepagua') || s.includes('curicica'));
                const matchesRegion = isBarraRegion && (text.includes('transolímpica') || text.includes('transolimpica') || text.includes('amarela') || text.includes('curicica') || text.includes('jacarepaguá'));
                if (!matchesDirect && !matchesRegion) match = false;
            }
            if (filterObj.hasIncidents === true && projection.incidents.length === 0) match = false;
            if (filterObj.hasIncidents === false && projection.incidents.length > 0) match = false;

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
     * Força o recálculo da projeção comparando com a medição anterior.
     */
    recalculate(id, publicIncidents = []) {
        const plan = this.caravans.get(id);
        if (!plan) return null;

        const previousCalculation = this.cacheProjections.get(id) || null;
        const projection = this.projectionService.calculateProjection(plan, publicIncidents, {
            previousCalculation
        });

        this.cacheProjections.set(id, projection);
        this.lastCalculatedAt = new Date().toISOString();

        return {
            ...projection,
            lastCalculatedAt: this.lastCalculatedAt
        };
    }

    /**
     * Calcula os 4 KPIs compactos para o módulo de Caravanas da região informada.
     */
    getKpis(publicIncidents = [], filters = {}) {
        let incidents = Array.isArray(publicIncidents) ? publicIncidents : [];
        let filterObj = {};
        if (typeof publicIncidents === 'string') {
            filterObj = { region: publicIncidents };
        } else if (typeof filters === 'string') {
            filterObj = { region: filters };
        } else if (filters && typeof filters === 'object') {
            filterObj = { ...filters };
        }
        const projections = this.getAll(incidents, filterObj);

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

/**
 * Catálogo Oficial de Pré-Cadastro das 49 Caravanas do Rio de Janeiro (RJ)
 */
const PRE_REGISTERED_CARAVANS_RJ = [
    { id: 'CRV-RJ-01', caravana: 'ALCÂNTARA', bairro: 'Alcântara', pontoReferencia: 'TRADE CENTER ALCÂNTARA (PRÉDIO DO RELÓGIO)', regiao: 'Niterói', corridor: 'BR-101 / Ponte Rio-Niterói / Linha Amarela', coords: [-22.8169, -43.0036], baseDistanceKm: 46.5, baseDurationMinutes: 64 },
    { id: 'CRV-RJ-02', caravana: 'AUSTIN', bairro: 'Austin', pontoReferencia: 'PRAÇA DO BATUTA', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Transolímpica', coords: [-22.7114, -43.5218], baseDistanceKm: 39.2, baseDurationMinutes: 54 },
    { id: 'CRV-RJ-03', caravana: 'BANGU', bairro: 'Bangu', pontoReferencia: 'CARAV DE BANGU - Rua Boiobi, 683, Banguposto ml e hiper tinta', regiao: 'Campo Grande', corridor: 'Av. Brasil / Transolímpica', coords: [-22.8794, -43.4658], baseDistanceKm: 18.4, baseDurationMinutes: 29 },
    { id: 'CRV-RJ-04', caravana: 'BELFORD ROXO', bairro: 'Belford Roxo', pontoReferencia: 'NOVA NET E LANCHONETE MONTE SINAI', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Linha Amarela', coords: [-22.7642, -43.3996], baseDistanceKm: 33.8, baseDurationMinutes: 48 },
    { id: 'CRV-RJ-05', caravana: 'BELFORD ROXO', bairro: 'Belford Roxo', pontoReferencia: 'CONDOMÍNIO RESIDENCIAL BOTAFOGO (PARAR NA ENTRADA – PÁTIO)', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Linha Amarela', coords: [-22.7580, -43.3910], baseDistanceKm: 34.5, baseDurationMinutes: 49 },
    { id: 'CRV-RJ-06', caravana: 'CAMPO GRANDE', bairro: 'Campo Grande', pontoReferencia: 'Camelódromo de Campo Grande', regiao: 'Campo Grande', corridor: 'Av. Brasil / Transolímpica', coords: [-22.9028, -43.5594], baseDistanceKm: 26.8, baseDurationMinutes: 39 },
    { id: 'CRV-RJ-07', caravana: 'CAMPO GRANDE', bairro: 'Campo Grande', pontoReferencia: 'EM FRENTE A PIZZARIO RIO SUL GOURMET', regiao: 'Campo Grande', corridor: 'Av. Cesário de Melo / Transolímpica', coords: [-22.9075, -43.5642], baseDistanceKm: 27.4, baseDurationMinutes: 41 },
    { id: 'CRV-RJ-08', caravana: 'CAMPO GRANDE', bairro: 'Campo Grande', pontoReferencia: 'CAMELÓDROMO DE CAMPO GRANDE – NA FRENTE DA IGREJA UNIVERSAL', regiao: 'Campo Grande', corridor: 'Av. Brasil / Transolímpica', coords: [-22.9019, -43.5582], baseDistanceKm: 26.6, baseDurationMinutes: 39 },
    { id: 'CRV-RJ-09', caravana: 'CASCADURA', bairro: 'Cascadura', pontoReferencia: 'PRÓXIMO DA FEIRA MIX DE CASCADURA', regiao: 'Madureira', corridor: 'Av. Ernani Cardoso / Jacarepaguá', coords: [-22.8825, -43.3278], baseDistanceKm: 14.8, baseDurationMinutes: 26 },
    { id: 'CRV-RJ-10', caravana: 'COMENDADOR SOARES', bairro: 'Nova Iguaçu', pontoReferencia: 'AO LADO DA IGREJA CATÓLICA SÃO JOÃO BATISTA', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Transolímpica', coords: [-22.7356, -43.4892], baseDistanceKm: 36.5, baseDurationMinutes: 51 },
    { id: 'CRV-RJ-11', caravana: 'CORDOVIL', bairro: 'Cordovil', pontoReferencia: 'Em frente ao ARES Casa do Marinheiro, próximo à estação Lobo Júnior do BRT', regiao: 'Madureira', corridor: 'Av. Brasil / Linha Amarela', coords: [-22.8306, -43.2856], baseDistanceKm: 25.4, baseDurationMinutes: 38 },
    { id: 'CRV-RJ-12', caravana: 'COSMOS', bairro: 'Cosmos', pontoReferencia: 'PRAÇA DA ARAGUAINHA', regiao: 'Campo Grande', corridor: 'Av. Cesário de Melo / Transolímpica', coords: [-22.9125, -43.6158], baseDistanceKm: 32.1, baseDurationMinutes: 46 },
    { id: 'CRV-RJ-13', caravana: 'DEL CASTILHO', bairro: 'Del Castilho', pontoReferencia: 'SHOPPING NOVA AMÉRICA', regiao: 'Madureira', corridor: 'Linha Amarela / Estr. dos Bandeirantes', coords: [-22.8781, -43.2725], baseDistanceKm: 21.0, baseDurationMinutes: 32 },
    { id: 'CRV-RJ-14', caravana: 'DUQUE DE CAXIAS', bairro: 'Duque de Caxias', pontoReferencia: 'EM FRENTE AO SALÃO DE FESTAS M5R (PRAÇA DO RODO)', regiao: 'Nova Iguaçu', corridor: 'Linha Vermelha / Linha Amarela', coords: [-22.7858, -43.3119], baseDistanceKm: 31.2, baseDurationMinutes: 45 },
    { id: 'CRV-RJ-15', caravana: 'ENGENHO PEQUENO', bairro: 'Nova Iguaçu', pontoReferencia: 'RESIDENCIAL PORTAL DO SOL', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Transolímpica', coords: [-22.7420, -43.4350], baseDistanceKm: 37.0, baseDurationMinutes: 52 },
    { id: 'CRV-RJ-16', caravana: 'ESPAÇO UNIVERSITÁRIO DE ITABORAÍ', bairro: 'Itaboraí', pontoReferencia: 'EM FRENTE AO ESPAÇO UNIVERSITÁRIO - PREFEITURA DE ITABORAÍ', regiao: 'Niterói', corridor: 'BR-101 / Ponte Rio-Niterói / Linha Amarela', coords: [-22.7444, -42.8594], baseDistanceKm: 64.5, baseDurationMinutes: 82 },
    { id: 'CRV-RJ-17', caravana: 'FRAGOSO', bairro: 'Magé', pontoReferencia: 'PRAÇA DA FAZENDA - FRAGOSO/MAGÉ', regiao: 'Nova Iguaçu', corridor: 'BR-040 / Linha Vermelha / Linha Amarela', coords: [-22.6085, -43.1755], baseDistanceKm: 54.0, baseDurationMinutes: 70 },
    { id: 'CRV-RJ-18', caravana: 'IMBARIÊ', bairro: 'Imbariê', pontoReferencia: 'Próximo ao Colégio Portugal Neves', regiao: 'Nova Iguaçu', corridor: 'BR-040 / Linha Vermelha / Linha Amarela', coords: [-22.6364, -43.2186], baseDistanceKm: 49.5, baseDurationMinutes: 65 },
    { id: 'CRV-RJ-19', caravana: 'IMBARIÊ', bairro: 'Imbariê', pontoReferencia: 'PRAÇA DA VILA COCOTÁ – IMBARIÊ – DUQUE DE CAXIAS', regiao: 'Nova Iguaçu', corridor: 'BR-040 / Linha Vermelha / Linha Amarela', coords: [-22.6410, -43.2230], baseDistanceKm: 48.8, baseDurationMinutes: 64 },
    { id: 'CRV-RJ-20', caravana: 'IRAJÁ', bairro: 'Irajá', pontoReferencia: 'Próximo a PRAÇA DA LIGHT', regiao: 'Madureira', corridor: 'Av. Brasil / Linha Amarela', coords: [-22.8361, -43.3268], baseDistanceKm: 22.5, baseDurationMinutes: 34 },
    { id: 'CRV-RJ-21', caravana: 'ITABORAÍ', bairro: 'Itaboraí', pontoReferencia: 'Centro de Itaboraí - em frente a casa e vídeo no centro de Itaboraí', regiao: 'Niterói', corridor: 'BR-101 / Ponte Rio-Niterói / Linha Amarela', coords: [-22.7465, -42.8578], baseDistanceKm: 64.8, baseDurationMinutes: 83 },
    { id: 'CRV-RJ-22', caravana: 'JAPERI', bairro: 'Japeri', pontoReferencia: 'CENTRO DE TREINAMENTO KRATOS NO SALÃO DA CARINE', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Transolímpica', coords: [-22.6433, -43.6536], baseDistanceKm: 52.0, baseDurationMinutes: 68 },
    { id: 'CRV-RJ-23', caravana: 'JARDIM AMÉRICA', bairro: 'Jardim América', pontoReferencia: 'PERTO DO PONTO FINAL DO ÔNIBUS, 774', regiao: 'Madureira', corridor: 'Presidente Dutra / Av. Brasil / Linha Amarela', coords: [-22.8115, -43.3235], baseDistanceKm: 26.2, baseDurationMinutes: 39 },
    { id: 'CRV-RJ-24', caravana: 'JARDIM SULACAP', bairro: 'Jardim Sulacap', pontoReferencia: 'SHOPPING JARDIM SULACAP', regiao: 'Campo Grande', corridor: 'Transolímpica / Estr. dos Bandeirantes', coords: [-22.8856, -43.3978], baseDistanceKm: 11.2, baseDurationMinutes: 19 },
    { id: 'CRV-RJ-25', caravana: 'MARECHAL HERMES', bairro: 'Marechal Hermes', pontoReferencia: 'PRÓXIMO AO ESPAÇO BRONZE OÁSIS', regiao: 'Madureira', corridor: 'Estr. Intendente Magalhães / Transolímpica', coords: [-22.8639, -43.3722], baseDistanceKm: 15.6, baseDurationMinutes: 25 },
    { id: 'CRV-RJ-26', caravana: 'MONTE LÍBANO', bairro: 'Nova Iguaçu', pontoReferencia: 'REF. APÓS POSTO 13 NA DUTRA ENTRAR NA HONDA.', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Transolímpica', coords: [-22.7618, -43.4425], baseDistanceKm: 34.0, baseDurationMinutes: 48 },
    { id: 'CRV-RJ-27', caravana: 'NILÓPOLIS', bairro: 'Nilópolis', pontoReferencia: 'REFERÊNCIA: RODOVIÁRIA DE NILÓPOLIS', regiao: 'Nova Iguaçu', corridor: 'Via Light / Transolímpica', coords: [-22.8083, -43.4147], baseDistanceKm: 24.5, baseDurationMinutes: 36 },
    { id: 'CRV-RJ-28', caravana: 'NITERÓI', bairro: 'Niterói', pontoReferencia: 'ATRÁS DO TERMINAL DE NITERÓI NO ESTACIONAMENTO', regiao: 'Niterói', corridor: 'Ponte Rio-Niterói / Linha Vermelha / Linha Amarela', coords: [-22.8894, -43.1242], baseDistanceKm: 36.5, baseDurationMinutes: 52 },
    { id: 'CRV-RJ-29', caravana: 'NOVA IGUAÇU', bairro: 'Nova Iguaçu', pontoReferencia: 'MERCADO MARINGÁ DA PALHADA / RESTAURANTE LILICA / POSTO DE COMBUSTÍVEL CONFIANÇA', regiao: 'Nova Iguaçu', corridor: 'Estr. de Madureira / Presidente Dutra / Transolímpica', coords: [-22.7850, -43.5080], baseDistanceKm: 33.4, baseDurationMinutes: 47 },
    { id: 'CRV-RJ-30', caravana: 'NOVA IGUAÇU', bairro: 'Nova Iguaçu', pontoReferencia: 'Rua em frente mercado vianense da Luiz de Lemos', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Transolímpica', coords: [-22.7395, -43.4495], baseDistanceKm: 36.8, baseDurationMinutes: 51 },
    { id: 'CRV-RJ-31', caravana: 'PADRE MIGUEL', bairro: 'Padre Miguel', pontoReferencia: 'EM FRENTE AO MURO DA ESTAÇÃO DE TREM DE PADRE MIGUEL', regiao: 'Campo Grande', corridor: 'Transolímpica / Estr. dos Bandeirantes', coords: [-22.8744, -43.4478], baseDistanceKm: 16.2, baseDurationMinutes: 26 },
    { id: 'CRV-RJ-32', caravana: 'PENHA', bairro: 'Penha', pontoReferencia: 'CONDOMÍNIO VIVENDAS DA PENHA', regiao: 'Madureira', corridor: 'Av. Brasil / Linha Amarela', coords: [-22.8422, -43.2783], baseDistanceKm: 24.0, baseDurationMinutes: 36 },
    { id: 'CRV-RJ-33', caravana: 'POSSE', bairro: 'Nova Iguaçu', pontoReferencia: 'RUA EM FRENTE AO MERCADO VIANENSE DA LUIZ DE LEMOS', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Transolímpica', coords: [-22.7368, -43.4512], baseDistanceKm: 37.1, baseDurationMinutes: 52 },
    { id: 'CRV-RJ-34', caravana: 'QUEIMADOS', bairro: 'Queimados', pontoReferencia: 'COLÉGIO SÃO JOÃO - RUA ALEGRIA, S/Nº', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Transolímpica', coords: [-22.7156, -43.5558], baseDistanceKm: 42.5, baseDurationMinutes: 58 },
    { id: 'CRV-RJ-35', caravana: 'RICARDO DE ALBUQUERQUE', bairro: 'Ricardo de Albuquerque', pontoReferencia: 'Ponto referência: em frente a estação de trem Ricardo de Albuquerque', regiao: 'Madureira', corridor: 'Estr. Marechal Alencastro / Transolímpica', coords: [-22.8397, -43.3958], baseDistanceKm: 19.8, baseDurationMinutes: 30 },
    { id: 'CRV-RJ-36', caravana: 'RICARDO DE ALBUQUERQUE', bairro: 'Ricardo de Albuquerque', pontoReferencia: 'EM FRENTE A ESTAÇÃO DE RICARDO DE ALBUQUERQUE', regiao: 'Madureira', corridor: 'Estr. Marechal Alencastro / Transolímpica', coords: [-22.8405, -43.3965], baseDistanceKm: 19.6, baseDurationMinutes: 30 },
    { id: 'CRV-RJ-37', caravana: 'ROSA DOS VENTOS', bairro: 'Nova Iguaçu', pontoReferencia: 'Próx ao colégio João do Vale.', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Transolímpica', coords: [-22.7689, -43.4792], baseDistanceKm: 34.8, baseDurationMinutes: 49 },
    { id: 'CRV-RJ-38', caravana: 'ROSA DOS VENTOS', bairro: 'Nova Iguaçu', pontoReferencia: 'MERCADO MARINGÁ DA PALHADA / RESTAURANTE LILICA / POSTO DE COMBUSTÍVEL CONFIANÇA', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Transolímpica', coords: [-22.7745, -43.4920], baseDistanceKm: 34.2, baseDurationMinutes: 48 },
    { id: 'CRV-RJ-39', caravana: 'SÃO GONÇALO', bairro: 'São Gonçalo', pontoReferencia: 'Clube Tamoio (referência)', regiao: 'Niterói', corridor: 'BR-101 / Ponte Rio-Niterói / Linha Amarela', coords: [-22.8286, -43.0628], baseDistanceKm: 42.0, baseDurationMinutes: 58 },
    { id: 'CRV-RJ-40', caravana: 'SÃO GONÇALO', bairro: 'São Gonçalo', pontoReferencia: 'PRAÇA ZÉ GAROTO – SÃO GONÇALO - Próximo a ESCULTURA ROSA DOS VENTOS', regiao: 'Niterói', corridor: 'BR-101 / Ponte Rio-Niterói / Linha Amarela', coords: [-22.8247, -43.0519], baseDistanceKm: 43.2, baseDurationMinutes: 60 },
    { id: 'CRV-RJ-41', caravana: 'SÃO JOÃO DE MERITI', bairro: 'São João de Meriti', pontoReferencia: 'COLÉGIO ESTADUAL RUBENS FARRULA', regiao: 'Nova Iguaçu', corridor: 'Presidente Dutra / Linha Amarela', coords: [-22.8042, -43.3731], baseDistanceKm: 28.4, baseDurationMinutes: 41 },
    { id: 'CRV-RJ-42', caravana: 'SEPETIBA', bairro: 'Sepetiba', pontoReferencia: 'Clube Recôncavo e mercado Supermarket', regiao: 'Campo Grande', corridor: 'Av. Brasil / Transolímpica', coords: [-22.9694, -43.6967], baseDistanceKm: 38.5, baseDurationMinutes: 53 },
    { id: 'CRV-RJ-43', caravana: 'SEROPÉDICA', bairro: 'Seropédica', pontoReferencia: 'EM FRENTE A ACADEMIA LIFEFIT', regiao: 'Nova Iguaçu', corridor: 'BR-465 / Av. Brasil / Transolímpica', coords: [-22.7461, -43.7089], baseDistanceKm: 48.0, baseDurationMinutes: 63 },
    { id: 'CRV-RJ-44', caravana: 'SEROPÉDICA', bairro: 'Seropédica', pontoReferencia: 'EM FRENTE A PRIMEIRA IGREJA BATISTA DE SEROPEDICA/ DO LADO DA FARMÁCIA UNIVERSITÁRIA', regiao: 'Nova Iguaçu', corridor: 'BR-465 / Av. Brasil / Transolímpica', coords: [-22.7439, -43.7064], baseDistanceKm: 48.2, baseDurationMinutes: 64 },
    { id: 'CRV-RJ-45', caravana: 'TANQUE', bairro: 'Tanque', pontoReferencia: 'PRAÇA PADRE AMBRÓSIO', regiao: 'Barra da Tijuca', corridor: 'Av. Geremário Dantas / Estr. dos Bandeirantes', coords: [-22.9194, -43.3569], baseDistanceKm: 8.2, baseDurationMinutes: 15 },
    { id: 'CRV-RJ-46', caravana: 'TAQUARA', bairro: 'Taquara', pontoReferencia: 'POSTO AMIZADE - SHELL (EM FRENTE A ESTAÇÃO DE BRT SANTA EFIGÊNIA)', regiao: 'Barra da Tijuca', corridor: 'Estr. dos Bandeirantes / Curicica', coords: [-22.9297, -43.3772], baseDistanceKm: 5.4, baseDurationMinutes: 11 },
    { id: 'CRV-RJ-47', caravana: 'TAQUARA', bairro: 'Taquara', pontoReferencia: 'POSTO Mirante da Taquara ( Condomínio Merck )', regiao: 'Barra da Tijuca', corridor: 'Estr. dos Bandeirantes / Curicica', coords: [-22.9367, -43.3858], baseDistanceKm: 4.1, baseDurationMinutes: 9 },
    { id: 'CRV-RJ-48', caravana: 'VICENTE DE CARVALHO / VAZ LOBO', bairro: 'Vaz Lobo', pontoReferencia: 'supermercado Mundial', regiao: 'Madureira', corridor: 'Av. Monsenhor Félix / Madureira / Jacarepaguá', coords: [-22.8578, -43.3256], baseDistanceKm: 18.0, baseDurationMinutes: 29 },
    { id: 'CRV-RJ-49', caravana: 'ZÉ GAROTO', bairro: 'São Gonçalo', pontoReferencia: 'Próximo o Hospital Infantil Darcy Sarmanho Vargas // ESCULTURA ROSA DOS VENTOS', regiao: 'Niterói', corridor: 'BR-101 / Ponte Rio-Niterói / Linha Amarela', coords: [-22.8256, -43.0531], baseDistanceKm: 43.0, baseDurationMinutes: 59 }
];

const caravanStore = new CaravanStore();

module.exports = caravanStore;
module.exports.caravanStore = caravanStore;
module.exports.CaravanStore = CaravanStore;
module.exports.buildBaseSyntheticCaravans = buildBaseSyntheticCaravans;
module.exports.buildBaseSpCaravans = buildBaseSpCaravans;
module.exports.PRE_REGISTERED_CARAVANS_RJ = PRE_REGISTERED_CARAVANS_RJ;
module.exports.DESTINATION_HOMOLOG_COORDS = DESTINATION_HOMOLOG_COORDS;
module.exports.DESTINATION_HOMOLOG_LABEL = DESTINATION_HOMOLOG_LABEL;
module.exports.DESTINATION_SP_COORDS = DESTINATION_SP_COORDS;
module.exports.DESTINATION_SP_LABEL = DESTINATION_SP_LABEL;

