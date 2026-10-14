/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Cliente de Serviços da API RIT FLY
 */

export class RitFlyService {
    constructor() {
        this.baseUrl = '/api/rit-fly';
    }

    async getFlights(filters = {}) {
        const params = new URLSearchParams();
        if (filters.categoria && filters.categoria !== 'todos') params.append('categoria', filters.categoria);
        if (filters.companhia && filters.companhia !== 'todas') params.append('companhia', filters.companhia);
        if (filters.status) params.append('status', filters.status);
        if (filters.search) params.append('search', filters.search);

        const url = `${this.baseUrl}/flights${params.toString() ? '?' + params.toString() : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Erro ao buscar voos (${res.status})`);
        return await res.json();
    }

    async getFlightDetails(identifier) {
        const res = await fetch(`${this.baseUrl}/flights/${encodeURIComponent(identifier)}`);
        if (!res.ok) throw new Error(`Voo não encontrado (${res.status})`);
        return await res.json();
    }

    async getAirports() {
        const res = await fetch(`${this.baseUrl}/airports`);
        if (!res.ok) throw new Error(`Erro ao carregar aeroportos (${res.status})`);
        return await res.json();
    }

    async getAirportDetails(code) {
        const res = await fetch(`${this.baseUrl}/airports/${encodeURIComponent(code)}`);
        if (!res.ok) throw new Error(`Erro ao detalhar aeroporto (${res.status})`);
        return await res.json();
    }

    async getKpis() {
        const res = await fetch(`${this.baseUrl}/kpis`);
        if (!res.ok) throw new Error(`Erro ao buscar KPIs (${res.status})`);
        return await res.json();
    }

    async getAlerts(limit = 20) {
        const res = await fetch(`${this.baseUrl}/alerts?limit=${limit}`);
        if (!res.ok) throw new Error(`Erro ao buscar alertas (${res.status})`);
        return await res.json();
    }

    async getTrips() {
        const res = await fetch(`${this.baseUrl}/trips`);
        if (!res.ok) throw new Error(`Erro ao buscar viagens integradas (${res.status})`);
        return await res.json();
    }

    async createTrip(tripData) {
        const res = await fetch(`${this.baseUrl}/trips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tripData)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Erro ao vincular viagem (${res.status})`);
        }
        return await res.json();
    }

    async deleteTrip(tripId) {
        const res = await fetch(`${this.baseUrl}/trips/${encodeURIComponent(tripId)}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error(`Erro ao remover viagem (${res.status})`);
        return await res.json();
    }

    async askAI(query) {
        const res = await fetch(`${this.baseUrl}/ai/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        if (!res.ok) throw new Error(`Erro na consulta à IA (${res.status})`);
        return await res.json();
    }

    async syncNow() {
        const res = await fetch(`${this.baseUrl}/sync`, { method: 'POST' });
        if (!res.ok) throw new Error(`Erro no sync (${res.status})`);
        return await res.json();
    }
}
