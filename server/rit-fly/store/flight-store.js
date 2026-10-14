/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Repositório e Gestor de Estado em Memória & KPIs Operacionais
 */

const { config } = require('../config');
const { SEVERITY_LEVELS, ALERT_STATUS } = require('../constants');

class FlightStore {
    constructor() {
        this.flightTracks = new Map(); // id/callsign -> array de { lat, lng, alt, timestamp }
        this.trips = new Map();        // id -> trip data
        this.alerts = [];              // array de alertas operacionais recentes
        this.maxTrackPoints = 15;
        this.maxAlerts = 50;

        // Só popula viagens de demonstração se dados sintéticos estiverem autorizados
        if (config.ALLOW_SYNTHETIC_DATA) {
            this.seedInitialTrips();
        }
    }

    /**
     * Atualiza o rastro (trail/flight path) das aeronaves
     */
    updateFlightTrack(flight) {
        if (!flight || !flight.id) return;
        const key = flight.numeroVoo || flight.callsign || flight.id;
        let track = this.flightTracks.get(key) || [];

        const lastPoint = track[track.length - 1];
        if (!lastPoint || (Math.hypot(lastPoint.lat - flight.latitude, lastPoint.lng - flight.longitude) > 0.001)) {
            track.push({
                lat: flight.latitude,
                lng: flight.longitude,
                altFt: flight.altitudeFt,
                speedKmh: flight.velocidadeKmh,
                timestamp: Date.now()
            });

            if (track.length > this.maxTrackPoints) {
                track = track.slice(-this.maxTrackPoints);
            }
            this.flightTracks.set(key, track);
        }
    }

    getFlightTrack(key) {
        return this.flightTracks.get(key) || [];
    }

    /**
     * Adiciona um alerta operacional com chave de deduplicação e ciclo de vida
     */
    addAlert(alert) {
        const dedupKey = alert.deduplication_key || (alert.voo ? `alt-${alert.voo}-${alert.severidade}` : null);
        
        // Deduplicação: se já existe alerta OPEN com a mesma chave, atualiza sem duplicar
        if (dedupKey) {
            const existing = this.alerts.find(a => a.deduplication_key === dedupKey && a.status === 'OPEN');
            if (existing) {
                existing.last_detected_at = new Date().toISOString();
                existing.descricao = alert.descricao || existing.descricao;
                return existing;
            }
        }

        const nowIso = new Date().toISOString();
        const item = {
            id: `alt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            deduplication_key: dedupKey,
            titulo: alert.titulo || 'Alerta Operacional',
            descricao: alert.descricao || '',
            severidade: alert.severidade || SEVERITY_LEVELS.INFO,
            alert_type: alert.alert_type || 'ATRASO_VOO',
            voo: alert.voo || null,
            aeroporto: alert.aeroporto || null,
            source: alert.source || 'RIT_FLY_ENGINE',
            status: alert.status || 'OPEN',
            acaoSugerida: alert.acaoSugerida || null,
            first_detected_at: alert.first_detected_at || nowIso,
            last_detected_at: nowIso,
            timestamp: nowIso
        };

        this.alerts.unshift(item);
        if (this.alerts.length > this.maxAlerts) {
            this.alerts = this.alerts.slice(0, this.maxAlerts);
        }
        return item;
    }

    getAlerts(limit = 20) {
        return this.alerts.slice(0, limit);
    }

    /**
     * Gestão de Viagens Integradas (Passageiro + Voo + Rota Terrestre)
     */
    saveTrip(trip) {
        const id = trip.id || `trip-${Date.now()}`;
        const record = {
            ...trip,
            id,
            atualizadoEm: new Date().toISOString()
        };
        this.trips.set(id, record);
        return record;
    }

    getTrip(id) {
        return this.trips.get(id) || null;
    }

    getAllTrips() {
        return Array.from(this.trips.values()).sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm));
    }

    deleteTrip(id) {
        return this.trips.delete(id);
    }

    /**
     * Cálculo dos 5 KPIs do Painel Executivo (Estritamente baseado em dados apurados)
     */
    calculateKpis(flightsList = []) {
        const totalFlights = flightsList.length;
        const delayedFlights = flightsList.filter(f => (f.atrasoMinutos || 0) > 15);
        const totalDelayMin = delayedFlights.reduce((acc, f) => acc + (f.atrasoMinutos || 0), 0);
        
        const allTrips = this.getAllTrips();
        const rescheduledTrips = allTrips.filter(t => (t.atrasoVooMinutos || 0) > 0);
        
        // Tempo economizado calculado estritamente sobre as viagens reprogramadas reais
        const tempoEconomizadoMin = rescheduledTrips.reduce((acc, t) => acc + (t.economiaEsperaMinutos || t.atrasoVooMinutos || 0), 0);
        
        // Economia estimada em Reais: R$ 0,75/minuto de espera de frota evitada
        const economiaFinanceiraReais = Math.round(tempoEconomizadoMin * 0.75);

        const slaEmbarque = totalFlights > 0 
            ? Math.round(((totalFlights - delayedFlights.length) / totalFlights) * 100) 
            : 100;

        return {
            voosMonitorados: totalFlights,
            voosAtrasados: delayedFlights.length,
            taxaPontualidadePct: slaEmbarque,
            tempoMedioEsperaEvitadoMin: rescheduledTrips.length > 0 ? Math.round(tempoEconomizadoMin / (rescheduledTrips.length || 1)) : 0,
            totalTempoEconomizadoMin: tempoEconomizadoMin,
            economiaReprogramacaoBRL: economiaFinanceiraReais,
            slaEmbarquePct: slaEmbarque,
            viagensCorporativasAtivas: allTrips.length,
            alertasAtivos: this.alerts.filter(a => a.status === 'OPEN').length
        };
    }

    seedInitialTrips() {
        // Viagem 1: IDA - Estúdios Globo -> SDU com Voo G3 1234 (Modo Sintético Homologado)
        this.saveTrip({
            id: 'trip-001',
            passenger_reference_id: 'GLO-REF-1001',
            team_reference: 'Diretoria de Produção e Entretenimento',
            display_label: 'Produção / Equipe Estúdios Globo',
            passageiro: 'Produção / Equipe Estúdios Globo',
            numeroVoo: 'G3 1234',
            origemTransporte: 'Estúdios Globo - Estrada dos Bandeirantes, Jacarepaguá',
            destinoTransporte: 'Aeroporto Santos Dumont (SDU)',
            aeroportoIata: 'SDU',
            tipoDeslocamento: 'IDA_AEROPORTO',
            data_mode: 'SYNTHETIC',
            horarioPrevistoVoo: new Date(Date.now() + 90 * 60000).toISOString(),
            etaAtualizadoVoo: new Date(Date.now() + 125 * 60000).toISOString(),
            atrasoVooMinutos: 35,
            tempoTransporteMinutos: 50,
            horarioTransporteRecalculado: new Date(Date.now() + 25 * 60000).toISOString(),
            economiaEsperaMinutos: 35,
            status: 'MONITORANDO'
        });

        // Viagem 2: CHEGADA - Voo LA 3456 no GIG -> Hotel Windsor Barra
        this.saveTrip({
            id: 'trip-002',
            passenger_reference_id: 'GLO-REF-1002',
            team_reference: 'Jornalismo Brasília',
            display_label: 'Jornalismo / Cobertura Especial',
            passageiro: 'Jornalismo / Cobertura Especial',
            numeroVoo: 'LA 3456',
            origemTransporte: 'Aeroporto Internacional Galeão (GIG)',
            destinoTransporte: 'Windsor Oceânico Hotel - Barra da Tijuca',
            aeroportoIata: 'GIG',
            tipoDeslocamento: 'CHEGADA_AEROPORTO',
            data_mode: 'SYNTHETIC',
            horarioPrevistoVoo: new Date(Date.now() + 45 * 60000).toISOString(),
            etaAtualizadoVoo: new Date(Date.now() + 85 * 60000).toISOString(),
            atrasoVooMinutos: 40,
            tempoTransporteMinutos: 42,
            horarioTransporteRecalculado: new Date(Date.now() + 85 * 60000).toISOString(),
            economiaEsperaMinutos: 40,
            status: 'MONITORANDO'
        });

        // Alertas iniciais de contexto
        this.addAlert({
            deduplication_key: 'alt-initial-g31234',
            titulo: 'Atraso Detectado: Voo G3 1234 (+35 min)',
            descricao: 'Decolagem postergada. Saída do transporte terrestre remarcada para 35 minutos depois.',
            severidade: SEVERITY_LEVELS.ALTO,
            voo: 'G3 1234',
            aeroporto: 'SDU',
            acaoSugerida: 'Reprogramar saída da van executiva nos Estúdios Globo para evitar espera no terminal.'
        });

        this.addAlert({
            deduplication_key: 'alt-initial-metar-gru',
            titulo: 'Condição Meteorológica IFR em Guarulhos (GRU)',
            descricao: 'Teto de nuvens baixo (1.400 ft) e chuva leve provocando esperas nas aproximações.',
            severidade: SEVERITY_LEVELS.MEDIO,
            aeroporto: 'GRU',
            acaoSugerida: 'Adicionar 20 minutos de margem operacional nos desembarques de voos vindos de GRU.'
        });
    }
}

module.exports = { FlightStore };
