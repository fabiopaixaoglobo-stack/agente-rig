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
     * Retorna a visão consolidada dos 8 aeroportos prioritários com informes operacionais estruturados
     */
    async getAllAirportsOverview(flightsList = []) {
        const metarData = await this.metarProvider.getOperationalWeather();
        const overview = [];
        const hasAdsbFeed = Array.isArray(flightsList) && flightsList.length > 0;

        for (const [code, meta] of Object.entries(AIRPORTS)) {
            const airportFlights = this.filterFlightsForAirport(code, flightsList);
            const metar = metarData[meta.icao] || {};
            const metarDisponivel = Boolean(
                metar &&
                metar.data_mode !== 'UNAVAILABLE' &&
                metar.statusOperacional !== 'METAR_INDISPONIVEL' &&
                metar.flightRule &&
                metar.flightRule !== 'INDISPONIVEL'
            );

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

            const informes = this.buildAirportOperationalReports(meta, metar, metarDisponivel, arrivals, departures, delayedFlights, avgDelayMin, conditionStatus, hasAdsbFeed);
            const fonteStatus = (metarDisponivel || hasAdsbFeed)
                ? (metarDisponivel && hasAdsbFeed ? 'ONLINE' : 'PARCIAL')
                : 'INDISPONIVEL';

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
                regraVoo: metarDisponivel ? (metar.flightRule || 'VFR') : 'INDISPONIVEL',
                condicaoMeteorologicaVoo: metarDisponivel ? (metar.flightRule || 'VFR') : 'INDISPONIVEL',
                statusPista: 'NÃO FORNECIDO POR METAR (Consulte NOTAM / DECEA)',
                programacaoOficialDisponivel: false,
                painelProgramadoOficial: 'INDISPONÍVEL SEM API FIDS (Infraero/Aena)',
                metarDisponivel,
                telemetriaAdsbDisponivel: hasAdsbFeed,
                fonteStatus,
                informesDisponiveis: informes.some(inf => inf.disponivel),
                informes,
                movimentoDetectado: totalMovements,
                chegadasPrevistas: arrivals.length,
                partidasPrevistas: departures.length,
                voosAtrasados: delayedFlights.length,
                voosCancelados: cancelledCount,
                taxaPontualidadePct: totalMovements > 0 ? Math.max(0, 100 - delayRate) : 100,
                tempoMedioAtrasoMin: avgDelayMin,
                clima: metar
            });
        }

        return overview;
    }

    buildAirportOperationalReports(meta, metar, metarDisponivel, arrivals, departures, delayedFlights, avgDelayMin, conditionStatus, hasAdsbFeed) {
        const informes = [];
        const totalMovements = arrivals.length + departures.length;

        // 1. Informe Meteorológico Aeronáutico (METAR)
        if (metarDisponivel) {
            informes.push({
                id: `inf-metar-${meta.icao}`,
                tipo: 'METAR',
                titulo: `Boletim METAR (${meta.icao})`,
                status: metar.flightRule || 'VFR',
                disponivel: true,
                resumo: `${metar.condicoes || 'Céu Claro'} · ${metar.temperaturaC != null ? `${metar.temperaturaC}°C` : 'N/D'} · Vento ${metar.vento ? metar.vento.descricao : 'Calmo'} · Visib. ${metar.visibilidade ? metar.visibilidade.descricao : '> 10 km'} · Teto ${metar.tetoDescricao || 'Ilimitado'}`,
                codigoBruto: metar.rawMetar || null,
                atualizadoEm: metar.atualizadoEm || new Date().toISOString()
            });
        } else {
            informes.push({
                id: `inf-metar-${meta.icao}`,
                tipo: 'METAR',
                titulo: `Boletim METAR (${meta.icao})`,
                status: 'INDISPONIVEL',
                disponivel: false,
                resumo: `Boletim METAR da estação ${meta.icao} indisponível na fonte NOAA/REDEMET neste ciclo.`,
                codigoBruto: null,
                atualizadoEm: metar.atualizadoEm || new Date().toISOString()
            });
        }

        // 2. Informe de Tráfego Aéreo (ADS-B)
        if (hasAdsbFeed) {
            informes.push({
                id: `inf-trafego-${meta.iata}`,
                tipo: 'TRAFEGO_ADSB',
                titulo: 'Movimentação Aérea (Radar ADS-B)',
                status: totalMovements > 0 ? 'ATIVO' : 'SEM_MOVIMENTO',
                disponivel: true,
                resumo: totalMovements > 0
                    ? `${totalMovements} voo(s) monitorado(s) na praça (${arrivals.length} chegada(s) / ${departures.length} partida(s)).`
                    : 'Nenhum voo em aproximação ou saída imediata detectado neste instante no terminal.',
                atualizadoEm: new Date().toISOString()
            });
        } else {
            informes.push({
                id: `inf-trafego-${meta.iata}`,
                tipo: 'TRAFEGO_ADSB',
                titulo: 'Movimentação Aérea (Radar ADS-B)',
                status: 'INDISPONIVEL',
                disponivel: false,
                resumo: 'Fonte de telemetria ADS-B sem dados ativos neste ciclo.',
                atualizadoEm: new Date().toISOString()
            });
        }

        // 3. Informe Operacional / Pontualidade
        informes.push({
            id: `inf-ops-${meta.iata}`,
            tipo: 'OPERACIONAL',
            titulo: 'Condição Operacional da Praça',
            status: conditionStatus,
            disponivel: metarDisponivel || hasAdsbFeed,
            resumo: delayedFlights.length > 0
                ? `${delayedFlights.length} voo(s) com retenção operacional detectada (atraso médio: +${avgDelayMin} min).`
                : (metarDisponivel && (metar.flightRule === 'IFR' || metar.flightRule === 'LIFR')
                    ? `Operação sob instrumento (${metar.flightRule}) devido a teto/visibilidade reduzidos.`
                    : 'Operação fluindo sem retenções críticas ou alertas severos no terminal.'),
            atualizadoEm: new Date().toISOString()
        });

        return informes;
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
        const metarDisponivel = Boolean(
            metar &&
            metar.data_mode !== 'UNAVAILABLE' &&
            metar.statusOperacional !== 'METAR_INDISPONIVEL' &&
            metar.flightRule &&
            metar.flightRule !== 'INDISPONIVEL'
        );
        const airportFlights = this.filterFlightsForAirport(meta.iata, flightsList);
        const hasAdsbFeed = Array.isArray(flightsList) && flightsList.length > 0;

        const mapFlightToBoardItem = (f) => ({
            id: f.id,
            voo: f.numeroVoo,
            prefixo: f.prefixo,
            companhia: f.companhia,
            categoria: f.categoria,
            origem: f.origem,
            destino: f.destino,
            horarioPrevisto: f.horarioPrevisto,
            eta: f.eta,
            etaFormatado: (f.etaFormatado && f.etaFormatado !== '--:--')
                ? f.etaFormatado
                : (f.tempoRestanteMinutos ? `~${f.tempoRestanteMinutos}m` : '--:--'),
            tempoRestanteMinutos: f.tempoRestanteMinutos || 0,
            distanciaRestanteKm: f.distanciaRestanteKm || 0,
            altitudeFt: f.altitudeFt || 0,
            velocidadeKmh: f.velocidadeKmh || 0,
            atrasoMinutos: f.atrasoMinutos,
            status: f.status,
            ultimaAtualizacao: f.ultimaAtualizacao
        });

        const arrivals = airportFlights
            .filter(f => f.destino === meta.iata)
            .map(mapFlightToBoardItem);

        const departures = airportFlights
            .filter(f => f.origem === meta.iata)
            .map(mapFlightToBoardItem);

        const delayedFlights = airportFlights.filter(f => f.atrasoMinutos > 15 || f.status === FLIGHT_STATUS.DELAYED);
        const avgDelayMin = delayedFlights.length > 0
            ? Math.round(delayedFlights.reduce((acc, f) => acc + f.atrasoMinutos, 0) / delayedFlights.length)
            : 0;

        let conditionStatus = 'NORMAL';
        if (metar.flightRule === 'IFR') conditionStatus = 'ATENÇÃO';
        if (metar.flightRule === 'LIFR') conditionStatus = 'CRÍTICO';

        const informes = this.buildAirportOperationalReports(
            meta,
            metar,
            metarDisponivel,
            arrivals,
            departures,
            delayedFlights,
            avgDelayMin,
            conditionStatus,
            hasAdsbFeed
        );

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
            metarDisponivel,
            fonteStatus: (metarDisponivel || hasAdsbFeed) ? 'ONLINE' : 'INDISPONIVEL',
            informes,
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
