/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Painel e Provedor dos 8 Aeroportos Estratégicos Brasileiros
 */

const { config } = require('../config');
const { AIRPORTS, FLIGHT_STATUS } = require('../constants');

class AirportProvider {
    constructor(metarProvider) {
        this.metarProvider = metarProvider;
        this.airportStatsCache = new Map();
    }

    /**
     * Retorna a visão consolidada dos 8 aeroportos prioritários
     */
    async getAllAirportsOverview(flightsList = []) {
        const metarData = await this.metarProvider.getOperationalWeather();
        const overview = [];

        for (const [code, meta] of Object.entries(AIRPORTS)) {
            const airportFlights = this.filterFlightsForAirport(code, flightsList);
            const metar = metarData[meta.icao] || {};
            
            // Cálculo de Chegadas, Partidas e Atrasos Observados via ADS-B
            const arrivals = airportFlights.filter(f => f.destino === code);
            const departures = airportFlights.filter(f => f.origem === code);
            const delayedFlights = airportFlights.filter(f => f.atrasoMinutos > 15 || f.status === FLIGHT_STATUS.DELAYED);
            
            // Sem forjar cancelamentos esporádicos quando dados sintéticos estiverem desligados
            const cancelledCount = config.ALLOW_SYNTHETIC_DATA ? Math.floor(Math.random() * 2) : 0;

            const totalMovements = arrivals.length + departures.length;
            const delayRate = totalMovements > 0 ? Math.round((delayedFlights.length / totalMovements) * 100) : 0;
            const avgDelayMin = delayedFlights.length > 0 
                ? Math.round(delayedFlights.reduce((acc, f) => acc + f.atrasoMinutos, 0) / delayedFlights.length) 
                : 0;

            let conditionStatus = 'NORMAL';
            if (metar.flightRule === 'IFR' || delayRate > 30) conditionStatus = 'ATENÇÃO';
            if (metar.flightRule === 'LIFR' || delayRate > 60) conditionStatus = 'CRÍTICO';

            overview.push({
                iata: meta.iata,
                icao: meta.icao,
                nome: meta.nome,
                cidade: meta.cidade,
                uf: meta.uf,
                lat: meta.lat,
                lng: meta.lng,
                elevationFt: meta.elevationFt,
                concessionaria: meta.concessionaria,
                statusOperacional: conditionStatus,
                regraVoo: metar.flightRule || 'VFR',
                condicaoMeteorologicaVoo: metar.flightRule || 'VFR',
                statusPista: 'NÃO FORNECIDO POR METAR (Consulte NOTAM / DECEA)',
                painelProgramadoOficial: 'INDISPONÍVEL SEM API FIDS (Infraero/Aena)',
                chegadasPrevistas: arrivals.length,
                partidasPrevistas: departures.length,
                voosAtrasados: delayedFlights.length,
                voosCancelados: cancelledCount,
                taxaPontualidadePct: Math.max(0, 100 - delayRate),
                tempoMedioAtrasoMin: avgDelayMin,
                clima: metar
            });
        }

        return overview;
    }

    /**
     * Detalhes operacionais e quadro de voos (Board FIDS) de um aeroporto específico
     */
    async getAirportDetails(code, flightsList = []) {
        const cleanCode = (code || '').toUpperCase();
        const meta = AIRPORTS[cleanCode] || Object.values(AIRPORTS).find(a => a.icao === cleanCode || a.iata === cleanCode);

        if (!meta) {
            return null;
        }

        const metar = await this.metarProvider.getMetarForStation(meta.icao);
        const airportFlights = this.filterFlightsForAirport(meta.iata, flightsList);

        const arrivals = airportFlights
            .filter(f => f.destino === meta.iata)
            .map(f => ({
                id: f.id,
                voo: f.numeroVoo,
                prefixo: f.prefixo,
                companhia: f.companhia,
                categoria: f.categoria,
                origem: f.origem,
                horarioPrevisto: f.horarioPrevisto,
                eta: f.eta,
                etaFormatado: f.etaFormatado,
                atrasoMinutos: f.atrasoMinutos,
                status: f.status
            }));

        const departures = airportFlights
            .filter(f => f.origem === meta.iata)
            .map(f => ({
                id: f.id,
                voo: f.numeroVoo,
                prefixo: f.prefixo,
                companhia: f.companhia,
                categoria: f.categoria,
                destino: f.destino,
                horarioPrevisto: f.horarioPrevisto,
                eta: f.eta,
                etaFormatado: f.etaFormatado,
                atrasoMinutos: f.atrasoMinutos,
                status: f.status
            }));

        return {
            iata: meta.iata,
            icao: meta.icao,
            nome: meta.nome,
            cidade: meta.cidade,
            uf: meta.uf,
            lat: meta.lat,
            lng: meta.lng,
            elevationFt: meta.elevationFt,
            concessionaria: meta.concessionaria,
            clima: metar,
            chegadas: arrivals,
            partidas: departures,
            totais: {
                totalChegadas: arrivals.length,
                totalPartidas: departures.length,
                atrasos: arrivals.filter(a => a.atrasoMinutos > 15).length + departures.filter(d => d.atrasoMinutos > 15).length
            }
        };
    }

    filterFlightsForAirport(airportIata, flightsList) {
        return flightsList.filter(f => f.origem === airportIata || f.destino === airportIata);
    }
}

module.exports = { AirportProvider };
