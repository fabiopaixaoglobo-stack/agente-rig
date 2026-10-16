/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * DTO Canônico de Voo Normalizado com Proveniência, Governança e Segregação de Tempos
 */

const { FLIGHT_CATEGORIES, FLIGHT_STATUS, AIRLINES, AIRPORTS, DATA_MODE, CATEGORY_SOURCE } = require('../constants');

class FlightDTO {
    constructor(data = {}) {
        this.id = data.id || `flight-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        this.icao24 = (data.icao24 || '').trim().toLowerCase();
        this.prefixo = (data.prefixo || '').trim().toUpperCase();
        this.callsign = (data.callsign || '').trim().toUpperCase();
        this.numeroVoo = (data.numeroVoo || this.formatarNumeroVoo(this.callsign)).toUpperCase();
        this.companhia = data.companhia || this.identificarCompanhia(this.callsign);
        
        // Categoria e Proveniência da Classificação
        this.category_source = data.category_source || this.deduzirFonteCategoria(data);
        this.categoria = data.categoria || this.identificarCategoria(this.callsign, this.prefixo, data.altitudeFt, data.velocidadeKmh);
        
        // Origem e Destino (NÃO inventar SDU/CGH se não informado por rota ou plano)
        this.origem = data.origem ? String(data.origem).toUpperCase() : null;
        this.destino = data.destino ? String(data.destino).toUpperCase() : null;
        this.origin_source = data.origem ? (data.origin_source || 'FLIGHT_PLAN') : 'UNKNOWN';
        
        // Cinemática e Telemetria ADS-B
        this.latitude = typeof data.latitude === 'number' ? Number(data.latitude.toFixed(6)) : 0;
        this.longitude = typeof data.longitude === 'number' ? Number(data.longitude.toFixed(6)) : 0;
        
        this.altitudeFt = Math.round(Number(data.altitudeFt) || 0);
        this.altitudeM = Math.round(this.altitudeFt * 0.3048);
        
        this.velocidadeKts = Math.round(Number(data.velocidadeKts) || 0);
        this.velocidadeKmh = Math.round(this.velocidadeKts * 1.852);
        
        this.rumo = Math.round(Number(data.rumo) || 0); // 0-360 graus
        this.taxaVerticalFpm = Math.round(Number(data.taxaVerticalFpm) || 0); // pés por minuto
        
        this.onGround = Boolean(data.onGround);
        this.status = data.status || this.determinarStatus();
        this.atrasoMinutos = typeof data.atrasoMinutos === 'number' ? Math.max(0, Math.round(data.atrasoMinutos)) : 0;

        // Distâncias, Progresso e Tempo Restante (FlightRadar24 Style)
        const metrics = this.calcularMetricasProgresso(data);
        this.distanciaTotalKm = metrics.distanciaTotalKm;
        this.distanciaPercorridaKm = metrics.distanciaPercorridaKm;
        this.distanciaRestanteKm = metrics.distanciaRestanteKm;
        this.tempoRestanteMinutos = metrics.tempoRestanteMinutos;
        this.progressoVooPct = metrics.progressoVooPct;
        
        // Governança de Modos de Dados & Confiança
        this.data_mode = data.data_mode || DATA_MODE.ESTIMATED;
        this.data_source = data.data_source || 'OPENSKY_ADS-B';
        this.confidence_score = typeof data.confidence_score === 'number' ? data.confidence_score : 0.85;
        this.last_provider_update = data.last_provider_update || data.ultimaAtualizacao || new Date().toISOString();
        this.calculated_at = data.calculated_at || new Date().toISOString();

        // Segregação Estrita de Tempos (Oficial vs Estimado RIT)
        this.scheduled_departure = data.scheduled_departure || null;
        this.estimated_departure_provider = data.estimated_departure_provider || null;
        this.actual_departure = data.actual_departure || null;

        this.scheduled_arrival = data.scheduled_arrival || data.horarioPrevisto || null;
        this.estimated_arrival_provider = data.estimated_arrival_provider || null;
        this.estimated_arrival_rit = data.estimated_arrival_rit || data.eta || this.calcularEta(this.scheduled_arrival, this.atrasoMinutos);
        this.actual_landing = data.actual_landing || null;
        this.actual_gate_arrival = data.actual_gate_arrival || null;

        // Aliases de Retrocompatibilidade
        this.horarioPrevisto = this.scheduled_arrival;
        this.eta = this.estimated_arrival_rit;
        this.etaFormatado = this.formatarHora(this.eta);
        
        this.ultimaAtualizacao = this.last_provider_update;
        this.modeloAeronave = data.modeloAeronave || this.deduzirModelo();
    }

    determinarStatus() {
        if (this.onGround) return FLIGHT_STATUS.LANDED;
        if (this.atrasoMinutos > 15) return FLIGHT_STATUS.DELAYED;
        if (this.altitudeFt < 3500 && this.taxaVerticalFpm < -200) return FLIGHT_STATUS.APPROACHING;
        return FLIGHT_STATUS.EN_ROUTE;
    }

    deduzirFonteCategoria(data) {
        if (data.categoria) return CATEGORY_SOURCE.MANUAL;
        if (data.callsign) return CATEGORY_SOURCE.CALLSIGN_HEURISTIC;
        return CATEGORY_SOURCE.UNKNOWN;
    }

    formatarNumeroVoo(callsign) {
        if (!callsign) return 'S/N';
        const clean = callsign.replace(/\s+/g, '');
        if (clean.startsWith('GLO')) return `G3 ${clean.slice(3)}`;
        if (clean.startsWith('TAM')) return `LA ${clean.slice(3)}`;
        if (clean.startsWith('AZU')) return `AD ${clean.slice(3)}`;
        if (clean.startsWith('PTB')) return `2Z ${clean.slice(3)}`;
        if (clean.startsWith('SID')) return `0Q ${clean.slice(3)}`;
        return clean;
    }

    identificarCompanhia(callsign) {
        if (!callsign) return 'Aviação Executiva / Privada';
        const prefix = callsign.slice(0, 3).toUpperCase();
        if (AIRLINES[prefix]) return AIRLINES[prefix].name;
        if (callsign.startsWith('GLO')) return 'GOL Linhas Aéreas';
        if (callsign.startsWith('TAM')) return 'LATAM Brasil';
        if (callsign.startsWith('AZU')) return 'Azul Linhas Aéreas';
        if (callsign.startsWith('PTB')) return 'Voepass Linhas Aéreas';
        if (callsign.startsWith('SID')) return 'Sideral Cargo';
        if (callsign.startsWith('TTL')) return 'Total Cargo';
        if (callsign.startsWith('MWM')) return 'Modern Logistics';
        return 'Aviação Executiva / Corporativa';
    }

    identificarCategoria(callsign, prefixo, altFt = 0, velKmh = 0) {
        const cs = (callsign || '').toUpperCase();
        const pref = (prefixo || '').toUpperCase();

        if (cs.startsWith('GLO') || cs.startsWith('TAM') || cs.startsWith('AZU') || cs.startsWith('PTB')) {
            return FLIGHT_CATEGORIES.COMERCIAL;
        }
        if (cs.startsWith('SID') || cs.startsWith('TTL') || cs.startsWith('MWM') || cs.includes('CARGO')) {
            return FLIGHT_CATEGORIES.CARGUEIRO;
        }
        if (pref.includes('GLOBO') || pref.includes('HELI') || cs.includes('HELI') || (altFt < 2500 && velKmh > 0 && velKmh < 240)) {
            return FLIGHT_CATEGORIES.HELICOPTERO;
        }
        return FLIGHT_CATEGORIES.EXECUTIVO;
    }

    deduzirModelo() {
        if (this.categoria === FLIGHT_CATEGORIES.HELICOPTERO) {
            return 'Eurocopter AS350 / Bell 407';
        }
        if (this.categoria === FLIGHT_CATEGORIES.CARGUEIRO) {
            return 'Boeing 737-400F Cargo';
        }
        if (this.companhia.includes('GOL')) return 'Boeing 737-800 SFP';
        if (this.companhia.includes('LATAM')) return 'Airbus A320neo';
        if (this.companhia.includes('Azul')) return 'Embraer E195-E2';
        if (this.companhia.includes('Voepass')) return 'ATR 72-600';
        return 'Embraer Phenom 300 / Citation';
    }

    calcularMetricasProgresso(data = {}) {
        if (typeof data.distanciaTotalKm === 'number' && typeof data.distanciaRestanteKm === 'number') {
            return {
                distanciaTotalKm: data.distanciaTotalKm,
                distanciaPercorridaKm: data.distanciaPercorridaKm || 0,
                distanciaRestanteKm: data.distanciaRestanteKm,
                tempoRestanteMinutos: data.tempoRestanteMinutos || 0,
                progressoVooPct: data.progressoVooPct || 50
            };
        }

        const origMeta = this.origem ? AIRPORTS[this.origem] : null;
        const destMeta = this.destino ? AIRPORTS[this.destino] : null;

        if (origMeta && destMeta) {
            const R = 6371; // Raio da Terra em km
            const toRad = (deg) => (deg * Math.PI) / 180;

            const calcDist = (lat1, lon1, lat2, lon2) => {
                const dLat = toRad(lat2 - lat1);
                const dLon = toRad(lon2 - lon1);
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                          Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return Math.round(R * c);
            };

            const distTotal = calcDist(origMeta.lat, origMeta.lng, destMeta.lat, destMeta.lng);
            const distPercorrida = (this.latitude && this.longitude)
                ? calcDist(origMeta.lat, origMeta.lng, this.latitude, this.longitude)
                : Math.round(distTotal * 0.5);
            const distRestante = (this.latitude && this.longitude)
                ? calcDist(this.latitude, this.longitude, destMeta.lat, destMeta.lng)
                : Math.max(0, distTotal - distPercorrida);

            const progressoPct = distTotal > 0
                ? Math.min(100, Math.max(5, Math.round((distPercorrida / distTotal) * 100)))
                : 50;

            const velKmh = this.velocidadeKmh > 50 ? this.velocidadeKmh : 750;
            const tempoRestanteMin = distRestante > 0 ? Math.round((distRestante / velKmh) * 60) : 0;

            return {
                distanciaTotalKm: distTotal,
                distanciaPercorridaKm: distPercorrida,
                distanciaRestanteKm: distRestante,
                tempoRestanteMinutos: tempoRestanteMin,
                progressoVooPct: progressoPct
            };
        }

        return {
            distanciaTotalKm: 360,
            distanciaPercorridaKm: 180,
            distanciaRestanteKm: 180,
            tempoRestanteMinutos: 25,
            progressoVooPct: 50
        };
    }

    calcularEta(horarioPrevisto, atrasoMin = 0) {
        if (!horarioPrevisto) return null;
        try {
            const base = new Date(horarioPrevisto);
            base.setMinutes(base.getMinutes() + (atrasoMin || 0));
            return base.toISOString();
        } catch (e) {
            return null;
        }
    }

    formatarHora(isoString) {
        if (!isoString) return '--:--';
        try {
            const d = new Date(isoString);
            return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '--:--';
        }
    }

    toJSON() {
        return {
            id: this.id,
            icao24: this.icao24,
            prefixo: this.prefixo,
            callsign: this.callsign,
            numeroVoo: this.numeroVoo,
            companhia: this.companhia,
            categoria: this.categoria,
            category_source: this.category_source,
            origem: this.origem || 'N/D',
            destino: this.destino || 'N/D',
            origin_source: this.origin_source,
            latitude: this.latitude,
            longitude: this.longitude,
            altitudeFt: this.altitudeFt,
            altitudeM: this.altitudeM,
            velocidadeKts: this.velocidadeKts,
            velocidadeKmh: this.velocidadeKmh,
            rumo: this.rumo,
            taxaVerticalFpm: this.taxaVerticalFpm,
            onGround: this.onGround,
            status: this.status,
            atrasoMinutos: this.atrasoMinutos,

            // Distâncias e Métricas de Progresso
            distanciaTotalKm: this.distanciaTotalKm,
            distanciaPercorridaKm: this.distanciaPercorridaKm,
            distanciaRestanteKm: this.distanciaRestanteKm,
            tempoRestanteMinutos: this.tempoRestanteMinutos,
            progressoVooPct: this.progressoVooPct,
            
            // Tempos Segregados & Proveniência
            data_mode: this.data_mode,
            data_source: this.data_source,
            confidence_score: this.confidence_score,
            scheduled_departure: this.scheduled_departure,
            estimated_departure_provider: this.estimated_departure_provider,
            actual_departure: this.actual_departure,
            scheduled_arrival: this.scheduled_arrival,
            estimated_arrival_provider: this.estimated_arrival_provider,
            estimated_arrival_rit: this.estimated_arrival_rit,
            actual_landing: this.actual_landing,
            actual_gate_arrival: this.actual_gate_arrival,
            calculated_at: this.calculated_at,
            last_provider_update: this.last_provider_update,

            // Retrocompatibilidade
            horarioPrevisto: this.horarioPrevisto,
            eta: this.eta,
            etaFormatado: this.etaFormatado,
            modeloAeronave: this.modeloAeronave,
            ultimaAtualizacao: this.ultimaAtualizacao
        };
    }
}

module.exports = { FlightDTO };
