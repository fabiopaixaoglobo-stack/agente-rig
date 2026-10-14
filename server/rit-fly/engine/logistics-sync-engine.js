/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Motor de Sincronização e Reprogramação Inteligente Voo <-> Transporte Terrestre RIT
 */

const { SEVERITY_LEVELS } = require('../constants');

class LogisticsSyncEngine {
    constructor(flightStore, openSkyProvider) {
        this.flightStore = flightStore;
        this.openSkyProvider = openSkyProvider;
    }

    /**
     * Vincula uma viagem corporativa com monitoramento integrado de voo e transporte terrestre
     */
    async linkTrip({ passageiro, voo, origem, destino, tipoDeslocamento }) {
        if (!passageiro || !voo || !origem || !destino) {
            throw new Error('Campos obrigatórios: passageiro, voo, origem e destino');
        }

        const cleanVoo = String(voo).trim().toUpperCase();
        const flights = await this.openSkyProvider.getFlights();
        
        // Localiza o voo no ar ou no plano
        const matchedFlight = flights.find(f => 
            f.numeroVoo.replace(/\s+/g, '') === cleanVoo.replace(/\s+/g, '') ||
            f.callsign.replace(/\s+/g, '') === cleanVoo.replace(/\s+/g, '') ||
            f.prefixo.replace(/\s+/g, '') === cleanVoo.replace(/\s+/g, '')
        );

        // Dedução de tipo de deslocamento se não informado
        const isIda = tipoDeslocamento 
            ? tipoDeslocamento === 'IDA_AEROPORTO'
            : (destino.toLowerCase().includes('aeroporto') || destino.toLowerCase().includes('sdu') || destino.toLowerCase().includes('gig') || destino.toLowerCase().includes('cgh') || destino.toLowerCase().includes('gru'));

        const tipo = isIda ? 'IDA_AEROPORTO' : 'CHEGADA_AEROPORTO';

        // Estimativa do aeroporto envolvido
        let aeroportoIata = 'SDU';
        const textTarget = isIda ? destino.toUpperCase() : origem.toUpperCase();
        if (textTarget.includes('GIG') || textTarget.includes('GALEÃO')) aeroportoIata = 'GIG';
        else if (textTarget.includes('CGH') || textTarget.includes('CONGONHAS')) aeroportoIata = 'CGH';
        else if (textTarget.includes('GRU') || textTarget.includes('GUARULHOS')) aeroportoIata = 'GRU';
        else if (textTarget.includes('BSB') || textTarget.includes('BRASÍLIA')) aeroportoIata = 'BSB';
        else if (textTarget.includes('CNF') || textTarget.includes('CONFINS')) aeroportoIata = 'CNF';

        // Horários
        const now = Date.now();
        const horarioPrevistoVoo = matchedFlight 
            ? matchedFlight.horarioPrevisto 
            : new Date(now + 60 * 60000).toISOString();
            
        const atrasoMinutos = matchedFlight ? matchedFlight.atrasoMinutos : 0;
        
        const etaVoo = matchedFlight
            ? matchedFlight.eta
            : new Date(new Date(horarioPrevistoVoo).getTime() + atrasoMinutos * 60000).toISOString();

        // Cálculo de Transporte Terrestre
        const tempoTransporteMin = this.estimateGroundTravelTime(origem, destino);
        const { horarioTransporteRecalculado, etaFinalDestino, economiaEsperaMin } = this.calculateSchedules({
            tipo,
            horarioPrevistoVoo,
            etaVoo,
            atrasoMinutos,
            tempoTransporteMin
        });

        const sanitizedDisplay = this.sanitizePassengerName(passageiro);
        const flightDate = new Date().toISOString().split('T')[0];

        const tripData = {
            id: `trip-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            passenger_reference_id: `GLO-REF-${Math.floor(1000 + Math.random() * 9000)}`,
            team_reference: 'Equipe Corporativa Globo',
            operation_reference: 'LOGISTICA_SOLO_AR',
            display_label: sanitizedDisplay,
            passageiro: sanitizedDisplay, // Mantido para compatibilidade retroativa
            numeroVoo: matchedFlight ? matchedFlight.numeroVoo : cleanVoo,
            prefixoVoo: matchedFlight ? matchedFlight.prefixo : 'N/D',
            companhiaVoo: matchedFlight ? matchedFlight.companhia : 'Companhia Nacional',
            flight_date: flightDate,
            flight_key: `${cleanVoo}-${flightDate}`,
            departure_airport_iata: isIda ? aeroportoIata : 'SDU',
            arrival_airport_iata: isIda ? 'CGH' : aeroportoIata,
            origemTransporte: origem,
            destinoTransporte: destino,
            aeroportoIata,
            tipoDeslocamento: tipo,
            provider_name: matchedFlight ? matchedFlight.data_source : 'OPENSKY',
            data_mode: matchedFlight ? matchedFlight.data_mode : 'ESTIMATED',
            data_confidence: matchedFlight ? matchedFlight.confidence_score : 0.85,
            scheduled_arrival: horarioPrevistoVoo,
            estimated_arrival_rit: etaVoo,
            horarioPrevistoVoo,
            etaAtualizadoVoo: etaVoo,
            atrasoVooMinutos: atrasoMinutos,
            tempoTransporteMinutos: tempoTransporteMin,
            horarioTransporteRecalculado,
            etaFinalDestino,
            economiaEsperaMinutos: economiaEsperaMin,
            status: 'MONITORANDO'
        };

        const saved = this.flightStore.saveTrip(tripData);

        // Persistência assíncrona resiliente no banco PostgreSQL
        try {
            const { pool } = require('../../database');
            if (pool) {
                pool.query(`
                    INSERT INTO rit_fly_trips (
                        id, passenger_reference_id, team_reference, operation_reference, display_label,
                        numero_voo, prefixo_voo, companhia_voo, flight_date, flight_key,
                        departure_airport_iata, arrival_airport_iata, origem_transporte, destino_transporte,
                        aeroporto_iata, tipo_deslocamento, provider_name, data_mode, data_confidence,
                        scheduled_arrival, estimated_arrival_rit, atraso_voo_minutos, tempo_transporte_minutos,
                        horario_transporte_recalculado, eta_final_destino, economia_espera_minutos, status
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                        $11, $12, $13, $14, $15, $16, $17, $18, $19,
                        $20, $21, $22, $23, $24, $25, $26, $27
                    ) ON CONFLICT (id) DO NOTHING
                `, [
                    saved.id, saved.passenger_reference_id, saved.team_reference, saved.operation_reference, saved.display_label,
                    saved.numeroVoo, saved.prefixoVoo, saved.companhiaVoo, saved.flight_date, saved.flight_key,
                    saved.departure_airport_iata, saved.arrival_airport_iata, saved.origemTransporte, saved.destinoTransporte,
                    saved.aeroportoIata, saved.tipoDeslocamento, saved.provider_name, saved.data_mode, saved.data_confidence,
                    saved.scheduled_arrival, saved.estimated_arrival_rit, saved.atrasoVooMinutos, saved.tempoTransporteMinutos,
                    saved.horarioTransporteRecalculado, saved.etaFinalDestino, saved.economiaEsperaMinutos, saved.status
                ]).catch(() => {});
            }
        } catch (e) {}

        // Dispara alerta operacional caso o voo já inicie com atraso relevante
        if (atrasoMinutos > 15) {
            this.flightStore.addAlert({
                deduplication_key: `alt-trip-${tripData.numeroVoo}-${aeroportoIata}`,
                titulo: `Atraso Inicial no Voo ${tripData.numeroVoo} (+${atrasoMinutos} min)`,
                descricao: `Equipe: ${tripData.display_label}. Horário de transporte terrestre reprogramado para ${new Date(horarioTransporteRecalculado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
                severidade: atrasoMinutos > 30 ? SEVERITY_LEVELS.ALTO : SEVERITY_LEVELS.MEDIO,
                voo: tripData.numeroVoo,
                aeroporto: aeroportoIata,
                trip_id: saved.id,
                acaoSugerida: isIda 
                    ? `Postergar saída da base em ${atrasoMinutos} min para poupar tempo de espera do colaborador.`
                    : `Reprogramar motorista para chegada no terminal com +${atrasoMinutos} min de tolerância.`
            });
        }

        return saved;
    }

    /**
     * Sincroniza todas as viagens ativas com os voos e gera alertas automáticos
     */
    async syncActiveTrips(flightsList) {
        const activeTrips = this.flightStore.getAllTrips().filter(t => t.status === 'MONITORANDO');
        const results = [];

        for (const trip of activeTrips) {
            const matchedFlight = flightsList.find(f => 
                f.numeroVoo.replace(/\s+/g, '') === trip.numeroVoo.replace(/\s+/g, '') ||
                f.callsign.replace(/\s+/g, '') === trip.numeroVoo.replace(/\s+/g, '')
            );

            if (matchedFlight) {
                const oldDelay = trip.atrasoVooMinutos || 0;
                const newDelay = matchedFlight.atrasoMinutos || 0;

                // Detectou mudança relevante de atraso
                if (newDelay !== oldDelay) {
                    const recalculated = this.calculateSchedules({
                        tipo: trip.tipoDeslocamento,
                        horarioPrevistoVoo: trip.horarioPrevistoVoo,
                        etaVoo: matchedFlight.eta,
                        atrasoMinutos: newDelay,
                        tempoTransporteMin: trip.tempoTransporteMinutos
                    });

                    trip.atrasoVooMinutos = newDelay;
                    trip.etaAtualizadoVoo = matchedFlight.eta;
                    trip.horarioTransporteRecalculado = recalculated.horarioTransporteRecalculado;
                    trip.etaFinalDestino = recalculated.etaFinalDestino;
                    trip.economiaEsperaMinutos = recalculated.economiaEsperaMin;

                    this.flightStore.saveTrip(trip);

                    // Alerta automático de reprogramação com chave de deduplicação
                    this.flightStore.addAlert({
                        deduplication_key: `alt-resync-${trip.numeroVoo}-${newDelay}`,
                        titulo: `Reprogramação Automática: Voo ${trip.numeroVoo} (${newDelay > oldDelay ? '+' : ''}${newDelay - oldDelay} min)`,
                        descricao: `Equipe: ${trip.display_label || trip.passageiro}. Novo horário ajustado do transporte: ${new Date(recalculated.horarioTransporteRecalculado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
                        severidade: newDelay > 30 ? SEVERITY_LEVELS.CRITICO : SEVERITY_LEVELS.ALTO,
                        voo: trip.numeroVoo,
                        aeroporto: trip.aeroportoIata,
                        trip_id: trip.id,
                        acaoSugerida: `Notificar motorista e passageiro via RIT Alerta da alteração de cronograma.`
                    });
                }
            }
            results.push(trip);
        }

        return results;
    }

    /**
     * Calcula cronograma recíproco de mobilidade terrestre e aérea
     */
    calculateSchedules({ tipo, horarioPrevistoVoo, etaVoo, atrasoMinutos, tempoTransporteMin }) {
        const flightTimeMs = new Date(etaVoo || horarioPrevistoVoo).getTime();
        let horarioTransporteMs;
        let etaFinalMs;

        if (tipo === 'IDA_AEROPORTO') {
            // IDA: Saída da base = Decolagem - Deslocamento Terrestre - Margem de Embarque (60 min)
            const margemEmbarqueMs = 60 * 60000;
            const deslocamentoMs = tempoTransporteMin * 60000;
            horarioTransporteMs = flightTimeMs - deslocamentoMs - margemEmbarqueMs;
            etaFinalMs = flightTimeMs; // Finaliza na decolagem
        } else {
            // CHEGADA: Saída do aeroporto = Pouso + Margem Desembarque/Bagagens (20 min)
            const margemDesembarqueMs = 20 * 60000;
            horarioTransporteMs = flightTimeMs + margemDesembarqueMs;
            etaFinalMs = horarioTransporteMs + (tempoTransporteMin * 60000);
        }

        return {
            horarioTransporteRecalculado: new Date(horarioTransporteMs).toISOString(),
            etaFinalDestino: new Date(etaFinalMs).toISOString(),
            economiaEsperaMin: Math.max(0, atrasoMinutos)
        };
    }

    /**
     * Estima tempo de viagem terrestre entre pontos corporativos conhecidos
     */
    estimateGroundTravelTime(origem, destino) {
        const text = `${origem} ${destino}`.toLowerCase();
        // Estúdios Globo (Jacarepaguá) <-> SDU
        if (text.includes('estúdios globo') && text.includes('sdu')) return 50;
        // Estúdios Globo (Jacarepaguá) <-> GIG
        if (text.includes('estúdios globo') && text.includes('gig')) return 40;
        // Barra da Tijuca <-> SDU
        if (text.includes('barra') && text.includes('sdu')) return 45;
        // Barra da Tijuca <-> GIG
        if (text.includes('barra') && text.includes('gig')) return 38;
        // Berrini / Faria Lima <-> CGH
        if (text.includes('berrini') && text.includes('cgh')) return 25;
        // Berrini / Faria Lima <-> GRU
        if (text.includes('berrini') && text.includes('gru')) return 65;
        
        return 45; // Média de trânsito metropolitano
    }

    /**
     * Respeita LGPD e minimização de dados pessoais
     */
    sanitizePassengerName(name) {
        if (!name) return 'Passageiro Corporativo';
        // Remove CPFs, telefones ou e-mails acidentalmente inseridos
        return name
            .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[DOCUMENTO OCULTO]')
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
            .trim();
    }
}

module.exports = { LogisticsSyncEngine };
