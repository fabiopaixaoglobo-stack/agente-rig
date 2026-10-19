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
     * Constrói o Painel de Ocorrências Consolidadas cruzando:
     * 1. Alertas ativos e viagens integradas em solo/transfer
     * 2. Condições meteorológicas METAR (IFR, MVFR, névoa/chuva/vento) nos 8 hubs
     * 3. Voos atrasados (> 15 min) detectados na malha ativa
     * 4. Movimentação operacional e densidade de tráfego nos hubs
     */
    buildConsolidatedOccurrences(flights = [], airports = [], limit = 30) {
        const nowIso = new Date().toISOString();
        const occurrences = [];
        const seenKeys = new Set();

        const addOcc = (occ) => {
            const key = occ.deduplication_key || occ.id;
            if (key && seenKeys.has(key)) return;
            if (key) seenKeys.add(key);
            occurrences.push({
                id: occ.id || `occ-${occurrences.length + 1}`,
                deduplication_key: key || null,
                categoria: occ.categoria || 'OPERACIONAL',
                severidade: occ.severidade || SEVERITY_LEVELS.INFO,
                titulo: occ.titulo || 'Ocorrência Operacional',
                descricao: occ.descricao || '',
                acaoSugerida: occ.acaoSugerida || null,
                aeroporto: occ.aeroporto || null,
                voo: occ.voo || null,
                idVoo: occ.idVoo || null,
                source: occ.source || 'RIT_FLY_CONSOLIDATED',
                status: 'OPEN',
                timestamp: occ.timestamp || nowIso
            });
        };

        // 1. Alertas persistidos no store (ex: reprogramações de viagens e alertas registrados)
        for (const a of this.alerts) {
            if (a.status && a.status !== 'OPEN') continue;
            const isClima = a.alert_type === 'CLIMA_METAR' || /METAR|IFR|MVFR|Clima|Teto|Nevoeiro/i.test(a.titulo || '');
            const cat = isClima ? 'CLIMA_METAR' : (a.voo ? 'ATRASOS_MALHA' : 'SOLO_TRANSFERS');
            addOcc({
                ...a,
                categoria: cat
            });
        }

        // 2. Viagens terrestres vinculadas ativas
        for (const t of this.getAllTrips()) {
            const isDelayed = (t.atrasoVooMinutos || 0) > 0;
            addOcc({
                id: `occ-trip-${t.id}`,
                deduplication_key: `occ-trip-${t.id}`,
                categoria: 'SOLO_TRANSFERS',
                severidade: isDelayed ? (t.atrasoVooMinutos >= 30 ? SEVERITY_LEVELS.CRITICO : SEVERITY_LEVELS.ALTO) : SEVERITY_LEVELS.INFO,
                titulo: isDelayed
                    ? `Transfer Reprogramado: Voo ${t.numeroVoo} (+${t.atrasoVooMinutos} min)`
                    : `Transfer Sincronizado: Voo ${t.numeroVoo} (${t.aeroportoIata || 'Hub'})`,
                descricao: `${t.passageiro || 'Equipe Corporativa'} — ${t.origemTransporte} ➔ ${t.destinoTransporte}.`,
                acaoSugerida: isDelayed
                    ? `Saída do veículo ajustada automaticamente (${t.economiaEsperaMinutos || t.atrasoVooMinutos} min de espera evitada).`
                    : 'Monitoramento ativo de ETA entre aeronave e frota terrestre.',
                aeroporto: t.aeroportoIata || null,
                voo: t.numeroVoo || null,
                timestamp: t.atualizadoEm || nowIso
            });
        }

        // 3. Ocorrências Meteorológicas (METAR) e Operacionais por Aeroporto (8 Hubs)
        if (Array.isArray(airports)) {
            for (const a of airports) {
                if (!a || !a.iata) continue;
                const clima = a.clima || {};
                const metarOk = a.metarDisponivel !== false && clima.disponivel !== false && clima.condicoes && clima.condicoes !== 'METAR_INDISPONIVEL';
                const regra = clima.flightRule || a.regraVoo || 'VFR';
                const condStr = String(clima.condicoes || '');
                const ventoKt = Number(clima.vento?.velocidadeKt || 0);

                if (metarOk) {
                    const hasWeatherPhenomenon = /Névoa|Nevoeiro|Chuva|Trovoada|Tempestade| Pancadas/i.test(condStr);
                    if (regra === 'IFR' || regra === 'LIFR' || a.statusOperacional === 'CRÍTICO') {
                        addOcc({
                            id: `occ-metar-ifr-${a.iata}`,
                            deduplication_key: `occ-metar-${a.iata}`,
                            categoria: 'CLIMA_METAR',
                            severidade: SEVERITY_LEVELS.CRITICO,
                            titulo: `Operação por Instrumentos (${regra}) em ${a.iata} — ${a.cidade}`,
                            descricao: `METAR ${a.icao}: ${condStr}, ${clima.temperaturaC ?? '--'}°C | Vento: ${clima.vento?.descricao || 'N/D'} | Visib.: ${clima.visibilidade?.descricao || 'N/D'}.`,
                            acaoSugerida: `Considerar margem adicional de 20 a 30 min para pousos e receptivo terrestre em ${a.iata}.`,
                            aeroporto: a.iata,
                            timestamp: clima.atualizadoEm || nowIso
                        });
                    } else if (regra === 'MVFR' || a.statusOperacional === 'ATENÇÃO' || hasWeatherPhenomenon || ventoKt >= 14) {
                        addOcc({
                            id: `occ-metar-mvfr-${a.iata}`,
                            deduplication_key: `occ-metar-${a.iata}`,
                            categoria: 'CLIMA_METAR',
                            severidade: SEVERITY_LEVELS.ALTO,
                            titulo: `Atenção Meteorológica (${regra}) em ${a.iata} — ${condStr}`,
                            descricao: `METAR ${a.icao}: ${condStr}, ${clima.temperaturaC ?? '--'}°C | Vento: ${clima.vento?.descricao || 'N/D'} | Visib.: ${clima.visibilidade?.descricao || 'N/D'}.`,
                            acaoSugerida: `Acompanhar evolução de teto/visibilidade e janelas de aproximação em ${a.iata}.`,
                            aeroporto: a.iata,
                            timestamp: clima.atualizadoEm || nowIso
                        });
                    }
                }

                // Atrasos consolidados no aeroporto
                if ((a.voosAtrasados || 0) > 0) {
                    addOcc({
                        id: `occ-hub-delay-${a.iata}`,
                        deduplication_key: `occ-hub-delay-${a.iata}`,
                        categoria: 'ATRASOS_MALHA',
                        severidade: a.voosAtrasados >= 3 ? SEVERITY_LEVELS.CRITICO : SEVERITY_LEVELS.ALTO,
                        titulo: `Retenção de Malha em ${a.iata}: ${a.voosAtrasados} voo(s) com atraso`,
                        descricao: `Terminal ${a.nome} apresenta ${a.voosAtrasados} aeronave(s) com desvio > 15 min (Pontualidade atual: ${a.taxaPontualidadePct ?? 100}%).`,
                        acaoSugerida: `Verificar impacto nos desembarques corporativos em ${a.iata}.`,
                        aeroporto: a.iata,
                        timestamp: nowIso
                    });
                }

                // Fluxo operacional relevante nos hubs (movimentação ativa ADS-B)
                const movTotal = (a.chegadasPrevistas || 0) + (a.partidasPrevistas || 0);
                if (movTotal > 0) {
                    addOcc({
                        id: `occ-fluxo-${a.iata}`,
                        deduplication_key: `occ-fluxo-${a.iata}`,
                        categoria: 'FLUXO_HUB',
                        severidade: movTotal >= 10 ? SEVERITY_LEVELS.MEDIO : SEVERITY_LEVELS.INFO,
                        titulo: `Fluxo Ativo em ${a.iata} (${a.cidade}): ${movTotal} aeronave(s) no setor`,
                        descricao: `${a.chegadasPrevistas || 0} chegada(s) / aproximação e ${a.partidasPrevistas || 0} partida(s) monitoradas via ADS-B (${metarOk ? regra : 'ADS-B'}).`,
                        acaoSugerida: `Inspecionar quadro de voos de ${a.iata} para acompanhamento de embarques/desembarques.`,
                        aeroporto: a.iata,
                        timestamp: nowIso
                    });
                }
            }
        }

        // 4. Voos individuais com atraso (> 15 min) na malha aérea
        if (Array.isArray(flights)) {
            const delayedFlights = flights.filter(f => f && (f.atrasoMinutos || 0) > 15);
            for (const f of delayedFlights.slice(0, 10)) {
                const numVoo = f.numeroVoo || f.callsign || f.prefixo || f.id;
                addOcc({
                    id: `occ-flight-delay-${f.id || numVoo}`,
                    deduplication_key: `alt-${numVoo}-${f.severidade || 'ALTO'}`,
                    categoria: 'ATRASOS_MALHA',
                    severidade: f.atrasoMinutos >= 35 ? SEVERITY_LEVELS.CRITICO : SEVERITY_LEVELS.ALTO,
                    titulo: `Atraso de Voo: ${numVoo} (+${f.atrasoMinutos} min)`,
                    descricao: `${f.companhia || 'Operador'} (${f.prefixo || f.icao24 || 'S/P'}) na rota ${f.origem || 'N/D'} ➔ ${f.destino || 'N/D'} | ETA: ${f.etaFormatado || '--:--'}.`,
                    acaoSugerida: `Postergar acionamento de transfer terrestre vinculado ao voo ${numVoo}.`,
                    aeroporto: f.destino || f.origem || null,
                    voo: numVoo,
                    idVoo: f.id,
                    timestamp: nowIso
                });
            }
        }

        // Ordenação por prioridade operacional (CRITICO -> ALTO -> MEDIO -> INFO)
        const rank = { CRITICO: 4, ALTO: 3, MEDIO: 2, INFO: 1 };
        occurrences.sort((a, b) => (rank[b.severidade] || 0) - (rank[a.severidade] || 0));

        const sliced = occurrences.slice(0, limit);
        const summary = {
            total: sliced.length,
            criticos: sliced.filter(o => o.severidade === 'CRITICO').length,
            atencao: sliced.filter(o => o.severidade === 'ALTO' || o.severidade === 'MEDIO').length,
            informativos: sliced.filter(o => o.severidade === 'INFO').length,
            porCategoria: {
                clima: sliced.filter(o => o.categoria === 'CLIMA_METAR').length,
                atrasos: sliced.filter(o => o.categoria === 'ATRASOS_MALHA').length,
                hubs: sliced.filter(o => o.categoria === 'FLUXO_HUB').length,
                solo: sliced.filter(o => o.categoria === 'SOLO_TRANSFERS').length
            }
        };

        return { occurrences: sliced, summary };
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
