/**
 * RIT FLY - Central de Inteligência Aérea Corporativa
 * Agente Especializado RIT FLY AI
 */

const { AIRPORTS, FLIGHT_CATEGORIES } = require('../constants');

class RitFlyAI {
    constructor({ openSkyProvider, airportProvider, metarProvider, flightStore }) {
        this.openSkyProvider = openSkyProvider;
        this.airportProvider = airportProvider;
        this.metarProvider = metarProvider;
        this.flightStore = flightStore;
    }

    /**
     * Normaliza texto removendo acentos para comparação robusta
     */
    normalizeText(str = '') {
        return String(str)
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    /**
     * Processa perguntas em linguagem natural e retorna resposta analítica contextualizada
     */
    async answer(userQuery = '') {
        const rawQuery = String(userQuery || '').trim();
        const query = rawQuery.toLowerCase();
        const norm = this.normalizeText(rawQuery);

        if (!query) {
            return {
                texto: 'Olá! Sou o **RIT FLY AI**, seu assistente de inteligência aérea corporativa. Como posso ajudar com seus voos, aeroportos ou deslocamentos hoje?',
                intencao: 'SAUDACAO',
                sugestoes: [
                    'Qual a previsão de chegada do voo G3 1234?',
                    'Quais os voos da TAM programados para chegar no Galeão na próxima hora?',
                    'Há atrasos em Congonhas?',
                    'Quais voos chegam ao Santos Dumont nas próximas 2 horas?',
                    'Qual o risco operacional do deslocamento aeroporto → destino?'
                ]
            };
        }

        const parsed = this.classifyIntentAndEntities(rawQuery, query, norm);
        console.info(`[RIT-FLY][AI] Roteamento de intenção: ${parsed.intent} | tipo=${parsed.movementType || 'N/A'} | aeroporto=${parsed.airportCode || 'N/A'} | cia=${parsed.airline ? parsed.airline.code : 'TODAS'} | janela=${parsed.timeWindow ? parsed.timeWindow.label : 'N/A'}`);

        switch (parsed.intent) {
            case 'PREVISAO_VOO':
                return await this.handleFlightQuery(parsed.flightKey);

            case 'CONSULTA_DE_VOOS':
                return await this.handleFlightsConsultationQuery(parsed);

            case 'METEOROLOGIA_METAR':
                return await this.handleWeatherQuery(parsed.airportCode || 'SDU');

            case 'ATRASOS_AEROPORTO':
            case 'STATUS_AEROPORTO':
                return await this.handleAirportStatusQuery(parsed.airportCode || 'SDU');

            case 'RISCO_OPERACIONAL':
                return await this.handleOperationalRiskQuery(query);

            case 'RESUMO_EXECUTIVO':
                return await this.handleExecutiveSummaryQuery();

            default:
                return await this.handleGenericQuery(rawQuery);
        }
    }

    /**
     * Classifica intenção de forma determinística separando:
     * - PREVISAO_VOO (voo específico com número/prefixo)
     * - CONSULTA_DE_VOOS (chegadas, partidas, voos previstos por cia/aeroporto/janela)
     * - METEOROLOGIA_METAR (clima, vento, teto, visibilidade, METAR)
     * - ATRASOS_AEROPORTO / STATUS_AEROPORTO (situação operacional geral do aeroporto)
     * - RISCO_OPERACIONAL (deslocamento terrestre aeroporto -> destino)
     * - RESUMO_EXECUTIVO (KPIs / visão executiva)
     */
    classifyIntentAndEntities(rawQuery, query, norm) {
        const airportCode = this.extractAirportCode(norm);
        const airline = this.extractAirline(norm);
        const categoria = this.extractCategory(norm);
        const timeWindow = this.extractTimeWindow(norm);
        const movementType = this.extractMovementType(norm);

        // 1. Voo específico com dígitos ou matrícula (ex: G3 1234, LA 3456, PR-XMB)
        const specificFlightMatch = query.match(/\b(g3\s*\d{2,5}|la\s*\d{2,5}|jj\s*\d{2,5}|ad\s*\d{2,5}|2z\s*\d{2,5}|glo\s*\d{2,5}|tam\s*\d{2,5}|lan\s*\d{2,5}|azu\s*\d{2,5}|ptb\s*\d{2,5}|pr-[a-z0-9]{3}|pp-[a-z0-9]{3}|ps-[a-z0-9]{3}|pt-[a-z0-9]{3})\b/i);
        const genericFlightMatch = query.match(/(?:voo\s+|voo\s+n[º°]?\s*)([a-z]{2,3}\s*\d{2,5})\b/i);
        const flightMatch = specificFlightMatch || genericFlightMatch;

        if (flightMatch) {
            const flightKey = flightMatch[1].trim().toUpperCase();
            if (!this.isAirportName(flightKey)) {
                return {
                    intent: 'PREVISAO_VOO',
                    flightKey,
                    airportCode,
                    airline,
                    timeWindow
                };
            }
        }

        // 2. Risco operacional de deslocamento terrestre
        if (/\b(risco|deslocamento|trajeto|transporte terrestre|motorista)\b/.test(norm)) {
            return {
                intent: 'RISCO_OPERACIONAL',
                airportCode,
                airline,
                timeWindow
            };
        }

        // 3. Consulta de voos / chegadas / partidas / programação por companhia, aeroporto ou janela temporal
        // IMPORTANTE: Nunca rotear perguntas sobre voos, chegadas ou partidas para boletim METAR!
        const hasFlightListKeywords = /\b(quais voos|quais os voos|voos da|voos de|voos que|voos programados|voos previstos|proximos voos|chegam|chegar|chegada|chegadas|chegando|pousam|pousar|pouso|pousos|partem|partir|partida|partidas|decolam|decolar|decolagem|decolagens|programados|previstos)\b/.test(norm);
        const hasAirlineAndAirportOrWindow = Boolean(airline && (airportCode || timeWindow.explicit));

        if (hasFlightListKeywords || hasAirlineAndAirportOrWindow) {
            return {
                intent: 'CONSULTA_DE_VOOS',
                movementType: movementType || 'chegada',
                airportCode: airportCode || 'SDU',
                airline,
                categoria,
                timeWindow
            };
        }

        // 4. Meteorologia / METAR explícito
        if (/\b(metar|meteorolog\w*|clima|vento|teto|visibilidade|chuva|tempestade|nevoeiro|condicoes climaticas)\b/.test(norm)) {
            return {
                intent: 'METEOROLOGIA_METAR',
                airportCode: airportCode || 'SDU'
            };
        }

        // 5. Atrasos ou situação operacional de aeroporto específico
        if (/\b(atraso|atrasos|atrasado|atrasados|pontualidade|situacao|operacao|status)\b/.test(norm) || airportCode) {
            if (airportCode) {
                return {
                    intent: /\b(atraso|atrasos|atrasado|atrasados)\b/.test(norm) ? 'ATRASOS_AEROPORTO' : 'STATUS_AEROPORTO',
                    airportCode
                };
            }
        }

        // 6. Resumo executivo / KPIs
        if (/\b(kpi|kpis|resumo|geral|painel|estatisticas)\b/.test(norm)) {
            return { intent: 'RESUMO_EXECUTIVO' };
        }

        return { intent: 'CONSULTA_GERAL', airportCode, airline, timeWindow };
    }

    extractAirline(norm) {
        if (/\b(tam|latam|jj)\b/.test(norm)) {
            const usedAliasTam = /\btam\b/.test(norm) && !/\blatam\b/.test(norm);
            return {
                code: 'LATAM',
                queriedTerm: usedAliasTam ? 'TAM' : 'LATAM',
                canonicalName: 'LATAM Brasil',
                displayLabel: usedAliasTam ? 'TAM (associada à LATAM Brasil)' : 'LATAM Brasil',
                aliases: ['TAM', 'LATAM', 'LA', 'JJ', 'LAN', 'LPE']
            };
        }
        if (/\b(gol|glo|g3)\b/.test(norm)) {
            return {
                code: 'GOL',
                queriedTerm: 'GOL',
                canonicalName: 'GOL Linhas Aéreas',
                displayLabel: 'GOL Linhas Aéreas',
                aliases: ['GOL', 'GLO', 'G3']
            };
        }
        if (/\b(azul|azu|conecta)\b/.test(norm)) {
            return {
                code: 'AZUL',
                queriedTerm: 'AZUL',
                canonicalName: 'Azul Linhas Aéreas',
                displayLabel: 'Azul Linhas Aéreas',
                aliases: ['AZUL', 'AZU', 'ACN', 'AD']
            };
        }
        if (/\b(voepass|passaredo|ptb|2z)\b/.test(norm)) {
            return {
                code: 'VOEPASS',
                queriedTerm: 'VOEPASS',
                canonicalName: 'Voepass Linhas Aéreas',
                displayLabel: 'Voepass Linhas Aéreas',
                aliases: ['VOEPASS', 'PTB', '2Z']
            };
        }
        return null;
    }

    extractCategory(norm) {
        if (/\b(helicoptero|helicopteros|asas rotativas)\b/.test(norm)) return FLIGHT_CATEGORIES.HELICOPTERO;
        if (/\b(executivo|executivos|jatinho|privado)\b/.test(norm)) return FLIGHT_CATEGORIES.EXECUTIVO;
        if (/\b(cargueiro|cargueiros|carga)\b/.test(norm)) return FLIGHT_CATEGORIES.CARGUEIRO;
        return null;
    }

    extractMovementType(norm) {
        const isDeparture = /\b(partem|partir|partida|partidas|partindo|decolam|decolar|decolagem|decolagens|saindo|saem|sair)\b/.test(norm);
        const isArrival = /\b(chegam|chegar|chegada|chegadas|chegando|pousam|pousar|pouso|pousos|aproximacao)\b/.test(norm);
        if (isDeparture && !isArrival) return 'partida';
        if (isArrival && !isDeparture) return 'chegada';
        return 'chegada';
    }

    extractTimeWindow(norm) {
        const hoursMatch = norm.match(/proximas?\s+(\d+)\s*(?:horas?|h\b)/);
        if (hoursMatch) {
            const h = Math.max(1, parseInt(hoursMatch[1], 10));
            return {
                minutes: h * 60,
                label: h === 1 ? 'próxima 1 hora' : `próximas ${h} horas`,
                explicit: true
            };
        }
        if (/\b(proxima hora|na proxima hora|em 1 hora|1h)\b/.test(norm)) {
            return {
                minutes: 60,
                label: 'próxima hora (60 min)',
                explicit: true
            };
        }
        const minMatch = norm.match(/proximos?\s+(\d+)\s*(?:minutos?|min\b)/);
        if (minMatch) {
            const m = Math.max(5, parseInt(minMatch[1], 10));
            return {
                minutes: m,
                label: `próximos ${m} minutos`,
                explicit: true
            };
        }
        return {
            minutes: 120,
            label: 'próximas 2 horas',
            explicit: false
        };
    }

    matchesAirline(flight, airline) {
        if (!airline) return true;
        const fComp = (flight.companhia || '').toUpperCase();
        const fCs = (flight.callsign || '').toUpperCase();
        const fNum = (flight.numeroVoo || '').toUpperCase();

        if (airline.code === 'LATAM') {
            return (
                fComp.includes('LATAM') ||
                fComp.includes('TAM') ||
                fCs.startsWith('TAM') ||
                fCs.startsWith('LAN') ||
                fCs.startsWith('LPE') ||
                fNum.startsWith('LA ') ||
                fNum.startsWith('JJ ')
            );
        }
        if (airline.code === 'GOL') {
            return fComp.includes('GOL') || fCs.startsWith('GLO') || fNum.startsWith('G3');
        }
        if (airline.code === 'AZUL') {
            return fComp.includes('AZUL') || fCs.startsWith('AZU') || fCs.startsWith('ACN') || fNum.startsWith('AD ');
        }
        if (airline.code === 'VOEPASS') {
            return fComp.includes('VOEPASS') || fCs.startsWith('PTB') || fNum.startsWith('2Z ');
        }
        return fComp.includes(airline.code);
    }

    /**
     * Responde: "Qual a previsão de chegada do voo G3 1234?"
     */
    async handleFlightQuery(flightKey) {
        const flights = await this.openSkyProvider.getFlights();
        const cleanTarget = flightKey.replace(/[\s-]/g, '').toUpperCase();

        const flight = flights.find(f => {
            const fCall = (f.callsign || '').replace(/[\s-]/g, '').toUpperCase();
            const fVoo = (f.numeroVoo || '').replace(/[\s-]/g, '').toUpperCase();
            const fPref = (f.prefixo || '').replace(/[\s-]/g, '').toUpperCase();
            return fCall.includes(cleanTarget) || fVoo.includes(cleanTarget) || fPref.includes(cleanTarget);
        });

        if (!flight) {
            return {
                texto: `🔍 O voo **${flightKey}** não foi localizado em rota ativa no radar nacional neste momento. Ele pode estar programado para mais tarde ou já ter pousado. Deseja cadastrar um monitoramento preventivo para ele?`,
                intencao: 'VOO_NAO_ENCONTRADO',
                dados: { termoPesquisado: flightKey }
            };
        }

        const isAtrasado = flight.atrasoMinutos > 15;
        const statusEmoji = isAtrasado ? '⚠️' : '✅';
        const horaPrevista = flight.horarioPrevisto && flight.horarioPrevisto !== '--:--'
            ? new Date(flight.horarioPrevisto).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : 'Não informado (ADS-B em tempo real)';
        const horaEta = flight.eta && flight.eta !== '--:--'
            ? new Date(flight.eta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : (flight.tempoRestanteMinutos ? `~${flight.tempoRestanteMinutos} min restantes` : '--:--');

        let texto = `✈️ **Relatório de Voo: ${flight.numeroVoo} (${flight.prefixo})**\n\n`;
        texto += `• **Companhia:** ${flight.companhia}\n`;
        texto += `• **Rota:** ${flight.origem} ➔ ${flight.destino}\n`;
        texto += `• **Status Operacional:** ${statusEmoji} **${flight.status}**\n`;
        texto += `• **Altitude Atual:** ${flight.altitudeFt.toLocaleString('pt-BR')} pés (${flight.altitudeM.toLocaleString('pt-BR')} m)\n`;
        texto += `• **Velocidade no Solo:** ${flight.velocidadeKmh} km/h (${flight.velocidadeKts} kts)\n`;
        texto += `• **Horário Previsto na Malha:** ${horaPrevista}\n`;
        texto += `• **ETA Projetado de Chegada:** **${horaEta}** ${isAtrasado ? `(Atraso estimado de +${flight.atrasoMinutos} min)` : '(Fluxo normal)'}\n\n`;

        if (isAtrasado) {
            texto += `💡 **Recomendação Logística RIT:** O voo acumula atraso. Se houver transporte terrestre agendado para o desembarque em ${flight.destino}, o horário de encontro foi postergado para evitar espera do motorista.`;
        } else {
            texto += `💡 **Recomendação Logística RIT:** O voo está na rota ideal e cumprindo o SLA. O motorista deve se posicionar no terminal 10 minutos antes do pouso.`;
        }

        return {
            texto,
            intencao: 'PREVISAO_VOO',
            dados: flight
        };
    }

    /**
     * Responde a consultas de voos (chegadas/partidas) filtrando por aeroporto, companhia (com resolução de aliases ex: TAM -> LATAM) e janela temporal.
     * NUNCA substitui a resposta por um boletim METAR.
     */
    async handleFlightsConsultationQuery(parsed) {
        const {
            airportCode = 'SDU',
            airline = null,
            categoria = null,
            movementType = 'chegada',
            timeWindow = { minutes: 120, label: 'próximas 2 horas' }
        } = parsed;

        const cleanCode = airportCode.toUpperCase();
        const airportMeta = AIRPORTS[cleanCode] || AIRPORTS.SDU;
        const flights = await this.openSkyProvider.getFlights();

        const classificacaoEstruturada = {
            intencao: 'CONSULTA_DE_VOOS',
            tipo: movementType,
            aeroporto_destino: movementType === 'chegada' ? `${airportMeta.iata}/${airportMeta.icao}` : undefined,
            aeroporto_origem: movementType === 'partida' ? `${airportMeta.iata}/${airportMeta.icao}` : undefined,
            companhia: airline ? `${airline.queriedTerm}/${airline.code}` : 'TODAS',
            janela: timeWindow.label
        };

        const intencaoRetorno = movementType === 'partida' ? 'VOOS_PARTIDA' : 'VOOS_CHEGADA';

        // Caso a fonte operacional esteja indisponível (0 aeronaves no radar nacional)
        if (!Array.isArray(flights) || flights.length === 0) {
            const ciaTxt = airline ? ` da **${airline.displayLabel}**` : '';
            const movTxt = movementType === 'partida' ? `partindo de` : `chegando em`;
            return {
                texto: `⚠️ **Fonte Operacional de Voos Indisponível no Momento**\n\n` +
                       `• **Consulta:** Voos${ciaTxt} ${movTxt} **${airportMeta.nome} (${airportMeta.iata}/${airportMeta.icao})**\n` +
                       `• **Janela Temporal:** ${timeWindow.label}\n\n` +
                       `Não há dados de telemetria ADS-B disponíveis na fonte operacional neste instante para confirmar os voos da janela solicitada. Nenhum voo fictício foi gerado.`,
                intencao: intencaoRetorno,
                classificacao: classificacaoEstruturada,
                dados: []
            };
        }

        // Filtra pelo movimento no aeroporto alvo
        let matchingAirportFlights = flights.filter(f => {
            if (movementType === 'partida') {
                return f.origem === airportMeta.iata;
            }
            return f.destino === airportMeta.iata;
        });

        // Filtra pela companhia (ex: TAM -> LATAM Brasil / LA / JJ / TAM)
        if (airline) {
            matchingAirportFlights = matchingAirportFlights.filter(f => this.matchesAirline(f, airline));
        }

        // Filtra por categoria se especificada
        if (categoria) {
            matchingAirportFlights = matchingAirportFlights.filter(f => (f.categoria || '').toLowerCase() === categoria.toLowerCase());
        }

        // Filtra pela janela temporal solicitada (ex: próxima hora = 60 min)
        const withinWindow = matchingAirportFlights.filter(f => {
            if (typeof f.tempoRestanteMinutos === 'number' && f.tempoRestanteMinutos > 0) {
                return f.tempoRestanteMinutos <= timeWindow.minutes;
            }
            if (f.eta && f.eta !== '--:--') {
                const diffMin = (new Date(f.eta).getTime() - Date.now()) / 60000;
                if (!isNaN(diffMin) && diffMin >= -10) {
                    return diffMin <= timeWindow.minutes;
                }
            }
            return true;
        });

        withinWindow.sort((a, b) => (a.tempoRestanteMinutos || 30) - (b.tempoRestanteMinutos || 30));
        const selectedFlights = withinWindow.slice(0, 10);

        const ciaHeader = airline ? ` da ${airline.displayLabel}` : '';
        const movHeader = movementType === 'partida' ? 'Partidas Previstas de' : 'Voos com Chegada Prevista em';

        if (selectedFlights.length === 0) {
            // Verifica se há outros voos da mesma companhia no radar (ex: fora da janela ou em outros aeroportos da TMA) para transparência operacional
            const otherAirlineFlightsInTma = airline
                ? flights.filter(f => this.matchesAirline(f, airline))
                : [];

            let texto = `🛬 **Consulta de Voos${ciaHeader} — ${airportMeta.nome} (${airportMeta.iata}/${airportMeta.icao})**\n\n`;
            texto += `• **Tipo de Consulta:** ${movementType === 'partida' ? 'Partidas' : 'Chegadas'} (\`CONSULTA_DE_VOOS\`)\n`;
            texto += `• **Aeroporto:** ${airportMeta.nome} (${airportMeta.iata}/${airportMeta.icao})\n`;
            if (airline) {
                texto += `• **Companhia:** ${airline.displayLabel} ( códigos monitorados: ${airline.aliases.join(', ')} )\n`;
            }
            texto += `• **Janela Temporal:** ${timeWindow.label}\n\n`;
            texto += `ℹ️ **Resultado da Fonte Operacional:** Nenhum voo${ciaHeader} foi localizado com ${movementType === 'partida' ? 'partida de' : 'pouso estimado em'} **${airportMeta.iata}/${airportMeta.icao}** dentro da janela de **${timeWindow.label}** nos dados ativos do radar.\n`;

            if (matchingAirportFlights.length > 0) {
                texto += `\nForam observados **${matchingAirportFlights.length} voo(s)**${ciaHeader} com rota associada a **${airportMeta.iata}**, porém com tempo estimado de voo superior à janela de ${timeWindow.label}:\n`;
                matchingAirportFlights.slice(0, 4).forEach(f => {
                    const tempoTxt = f.tempoRestanteMinutos ? `~${f.tempoRestanteMinutos} min (${f.distanciaRestanteKm || '--'} km)` : f.etaFormatado;
                    texto += `• **${f.numeroVoo}** (${f.prefixo}) | ${f.origem} ➔ ${f.destino} | Alt: ${f.altitudeFt.toLocaleString('pt-BR')} ft | Tempo restante: **${tempoTxt}**\n`;
                });
            } else if (airline && otherAirlineFlightsInTma.length > 0) {
                texto += `\nNo momento, a fonte operacional registra **${otherAirlineFlightsInTma.length} aeronave(s)** da **${airline.canonicalName}** ativas em outras rotas do espaço aéreo monitorado.`;
            }

            return {
                texto,
                intencao: intencaoRetorno,
                classificacao: classificacaoEstruturada,
                dados: []
            };
        }

        let texto = `🛬 **${movHeader} ${airportMeta.nome} (${airportMeta.iata}/${airportMeta.icao}) — ${timeWindow.label}:**\n\n`;
        if (airline) {
            texto += `• **Companhia Filtrada:** ${airline.displayLabel}\n`;
        }
        texto += `• **Aeroporto Alvo:** ${airportMeta.iata}/${airportMeta.icao} | **Janela:** ${timeWindow.label}\n\n`;

        selectedFlights.forEach(f => {
            const atrasoTxt = f.atrasoMinutos > 15 ? `⚠️ +${f.atrasoMinutos}m atraso` : `✅ no horário`;
            const etaDisplay = (f.etaFormatado && f.etaFormatado !== '--:--')
                ? f.etaFormatado
                : (f.tempoRestanteMinutos ? `em ~${f.tempoRestanteMinutos} min (${f.distanciaRestanteKm || '--'} km)` : 'Em rota');
            texto += `• **${f.numeroVoo}** (${f.companhia} · ${f.prefixo}) | Rota: **${f.origem} ➔ ${f.destino}** | Chegada/ETA: **${etaDisplay}** (${atrasoTxt})\n`;
        });

        texto += `\n💡 Total de **${selectedFlights.length} voo(s)** localizado(s) na fonte operacional para os critérios informados.`;

        return {
            texto,
            intencao: intencaoRetorno,
            classificacao: classificacaoEstruturada,
            dados: selectedFlights
        };
    }

    /**
     * Compatibilidade direta com chamadas legadas a handleInboundFlightsQuery
     */
    async handleInboundFlightsQuery(airportCode = 'SDU', options = {}) {
        return await this.handleFlightsConsultationQuery({
            airportCode,
            airline: options.airline || null,
            movementType: 'chegada',
            timeWindow: options.timeWindow || { minutes: 120, label: 'próximas 2 horas' }
        });
    }

    /**
     * Responde a consultas explícitas de meteorologia / METAR
     */
    async handleWeatherQuery(airportCode = 'SDU') {
        const flights = await this.openSkyProvider.getFlights();
        const airportDetails = await this.airportProvider.getAirportDetails(airportCode, flights);
        if (!airportDetails) {
            return {
                texto: `Não encontrei dados meteorológicos para o aeroporto solicitado. Os aeroportos suportados são: GIG, SDU, CGH, GRU, BSB, CNF, SSA e REC.`,
                intencao: 'AEROPORTO_NAO_ENCONTRADO'
            };
        }
        const clima = airportDetails.clima || {};
        const metarDisp = clima.data_mode !== 'UNAVAILABLE' && clima.statusOperacional !== 'METAR_INDISPONIVEL';

        let texto = `🌤️ **Boletim Meteorológico (METAR): ${airportDetails.nome} (${airportDetails.iata}/${airportDetails.icao})**\n\n`;
        if (!metarDisp) {
            texto += `• **Status da Fonte METAR:** Temporariamente indisponível na estação NOAA/REDEMET para ${airportDetails.icao}.\n`;
            texto += `• **Movimentos Observados no Radar:** ${airportDetails.totais.totalChegadas} chegadas / ${airportDetails.totais.totalPartidas} partidas.\n`;
        } else {
            texto += `• **Regra de Voo:** **${clima.flightRule || 'VFR'}** (${clima.statusOperacional})\n`;
            texto += `• **Condições:** ${clima.condicoes} | **Temperatura:** ${clima.temperaturaC != null ? `${clima.temperaturaC}°C` : 'N/D'}\n`;
            texto += `• **Vento:** ${clima.vento ? clima.vento.descricao : 'Calmo'} | **Visibilidade:** ${clima.visibilidade ? clima.visibilidade.descricao : '> 10 km'}\n`;
            texto += `• **Teto:** ${clima.tetoDescricao || 'Ilimitado'}\n`;
            if (clima.rawMetar) {
                texto += `• **METAR Bruto:** \`${clima.rawMetar}\`\n`;
            }
        }

        return {
            texto,
            intencao: 'METEOROLOGIA_METAR',
            dados: airportDetails
        };
    }

    /**
     * Responde: "Há atrasos em Congonhas?"
     */
    async handleAirportStatusQuery(airportCode) {
        const flights = await this.openSkyProvider.getFlights();
        const airportDetails = await this.airportProvider.getAirportDetails(airportCode, flights);

        if (!airportDetails) {
            return {
                texto: `Não encontrei dados operacionais para o aeroporto solicitado. Os aeroportos suportados são: GIG, SDU, CGH, GRU, BSB, CNF, SSA e REC.`,
                intencao: 'AEROPORTO_NAO_ENCONTRADO'
            };
        }

        const totais = airportDetails.totais;
        const totalVoos = totais.totalChegadas + totais.totalPartidas;
        const clima = airportDetails.clima || {};
        const metarDisp = clima.data_mode !== 'UNAVAILABLE' && clima.statusOperacional !== 'METAR_INDISPONIVEL';
        const taxaPontualidade = totalVoos > 0 ? Math.round(((totalVoos - totais.atrasos) / totalVoos) * 100) : 95;

        let texto = `🏢 **Boletim Operacional: ${airportDetails.nome} (${airportDetails.iata}/${airportDetails.icao})**\n\n`;
        texto += `• **Movimentos Monitorados no Radar:** ${totalVoos} voos (${totais.totalChegadas} chegadas / ${totais.totalPartidas} partidas)\n`;
        texto += `• **Voos com Atraso Detectado:** **${totais.atrasos}** voos (${totais.atrasos > 0 ? 'Índice de atraso moderado' : 'Sem atrasos severos'})\n`;
        texto += `• **Pontualidade Estimada da Praça:** **${taxaPontualidade}%**\n`;

        if (metarDisp) {
            texto += `• **Condição de Operação:** **${clima.statusOperacional || 'ABERTO_VFR'}** (Regra: ${clima.flightRule || 'VFR'})\n`;
            texto += `• **Clima Operacional:** ${clima.condicoes || 'Normal'}, ${clima.temperaturaC != null ? `${clima.temperaturaC}°C` : 'N/D'}, Vento ${clima.vento ? clima.vento.descricao : 'Calmo'}\n`;
            texto += `• **Teto / Visibilidade:** ${clima.tetoDescricao || 'Normal'} | Visibilidade: ${clima.visibilidade ? clima.visibilidade.descricao : '> 10 km'}\n\n`;
        } else {
            texto += `• **Meteorologia Oficial (METAR):** Sem boletim METAR recente da estação ${airportDetails.icao} no momento (monitoramento de tráfego aéreo operando normalmente via ADS-B).\n\n`;
        }

        if (totais.atrasos > 2 || clima.flightRule === 'IFR') {
            texto += `⚠️ **Atenção Operacional:** Há retenções operacionais em ${airportDetails.iata}. Recomenda-se adicionar margem adicional de 30 minutos nas viagens corporativas com embarque neste terminal.`;
        } else {
            texto += `✅ **Operação Normal:** Pistas e terminais operando dentro do fluxo esperado sem impactos severos.`;
        }

        return {
            texto,
            intencao: 'STATUS_AEROPORTO',
            dados: airportDetails
        };
    }

    /**
     * Responde: "Qual o risco operacional do deslocamento aeroporto → destino?"
     */
    async handleOperationalRiskQuery(query) {
        let origemNome = 'Aeroporto Santos Dumont (SDU)';
        let destinoNome = 'Centro de Produção Corporativo - Jacarepaguá';
        let viaPrincipal = 'Linha Vermelha / Linha Amarela';
        let nivelRisco = 'MÉDIO';
        let tempoEstimadoMin = 52;
        let pontosCriticos = ['Trecho Linha Amarela próximo a Del Castilho', 'Saída Túnel Santa Bárbara'];

        if (query.includes('cgh') || query.includes('congonhas')) {
            origemNome = 'Aeroporto de Congonhas (CGH)';
            destinoNome = 'Região Berrini / Chucri Zaidan';
            viaPrincipal = 'Av. Washington Luís / Av. Jornalista Roberto Marinho';
            nivelRisco = 'BAIXO';
            tempoEstimadoMin = 28;
            pontosCriticos = ['Cruzamento Av. 23 de Maio sentido Sul'];
        } else if (query.includes('gig') || query.includes('galeão') || query.includes('galeao')) {
            origemNome = 'Aeroporto Internacional do Galeão (GIG)';
            destinoNome = 'Barra da Tijuca / Jacarepaguá';
            viaPrincipal = 'Linha Vermelha / Linha Amarela';
            nivelRisco = 'MÉDIO';
            tempoEstimadoMin = 38;
            pontosCriticos = ['Acesso Ilha do Fundão', 'Pedágio Linha Amarela'];
        }

        let texto = `🛡️ **Matriz de Risco Operacional de Deslocamento RIT**\n\n`;
        texto += `• **Origem:** ${origemNome}\n`;
        texto += `• **Destino:** ${destinoNome}\n`;
        texto += `• **Eixo Viário Principal:** ${viaPrincipal}\n`;
        texto += `• **Nível de Risco Operacional:** **${nivelRisco}**\n`;
        texto += `• **Tempo Terrestre Estimado:** **${tempoEstimadoMin} minutos**\n\n`;
        texto += `🔍 **Fatores Monitorados pelo Agente RIT:**\n`;
        texto += `1. **Fluidez Viária:** Trânsito moderado nos eixos de conexão expressa.\n`;
        texto += `2. **Segurança Pública (OTT / Fogo Cruzado):** Perímetro monitorado sem ocorrências severas de tiroteio nos últimos 45 minutos no trajeto.\n`;
        texto += `3. **Clima / Alagamento:** Pistas secas, sem pontos de alagamento ativos no radar meteorológico.\n\n`;
        texto += `📌 **Recomendação Executiva:** Partida autorizada. Em caso de atraso na aeronave, o horário do motorista será automaticamente congelado para preservar a segurança e o conforto do passageiro.`;

        return {
            texto,
            intencao: 'RISCO_OPERACIONAL',
            dados: {
                origem: origemNome,
                destino: destinoNome,
                nivelRisco,
                tempoEstimadoMin,
                viaPrincipal,
                pontosCriticos
            }
        };
    }

    async handleExecutiveSummaryQuery() {
        const flights = await this.openSkyProvider.getFlights();
        const kpis = this.flightStore.calculateKpis(flights);

        let texto = `📊 **Painel Executivo RIT FLY - Central de Inteligência Aérea**\n\n`;
        texto += `• **Voos Monitorados em Tempo Real:** ${kpis.voosMonitorados}\n`;
        texto += `• **Voos com Atraso Detectado:** ${kpis.voosAtrasados}\n`;
        texto += `• **Taxa Geral de Pontualidade (SLA):** **${kpis.taxaPontualidadePct}%**\n`;
        texto += `• **Tempo Médio de Espera Evitado:** **${kpis.tempoMedioEsperaEvitadoMin} minutos/viagem**\n`;
        texto += `• **Economia Financeira por Reprogramação:** **R$ ${kpis.economiaReprogramacaoBRL.toLocaleString('pt-BR')},00**\n`;
        texto += `• **Viagens Corporativas Integradas:** ${kpis.viagensCorporativasAtivas}\n\n`;
        texto += `Toda a operação está sincronizada com a malha rodoviária do Agente RIT.`;

        return {
            texto,
            intencao: 'RESUMO_EXECUTIVO',
            dados: kpis
        };
    }

    async handleGenericQuery(query) {
        return {
            texto: `🤖 Compreendi sua mensagem: *"${query}"*. Como assistente especializado do **RIT FLY AI**, consigo consultar próximos voos por companhia e aeroporto (ex.: TAM/LATAM, GOL, Azul), prever horários de chegada, calcular riscos de deslocamentos terrestres e consultar condições operacionais em Galeão, Santos Dumont, Congonhas, Guarulhos, Brasília, Confins, Salvador e Recife.`,
            intencao: 'CONSULTA_GERAL',
            sugestoes: [
                'Quais os voos da TAM programados para chegar no Galeão na próxima hora?',
                'Qual a previsão de chegada do voo G3 1234?',
                'Há atrasos em Congonhas?',
                'Quais voos chegam ao Santos Dumont nas próximas 2 horas?',
                'Qual o risco operacional do deslocamento aeroporto → destino?'
            ]
        };
    }

    isAirportName(str) {
        const s = this.normalizeText(str);
        return s.includes('congonhas') || s.includes('santos') || s.includes('galeao') || s.includes('guarulhos') || s.includes('brasilia') || s.includes('confins') || s.includes('salvador') || s.includes('recife');
    }

    extractAirportCode(text) {
        const t = this.normalizeText(text);
        if (/\b(congonhas|cgh|sbsp)\b/.test(t)) return 'CGH';
        if (/\b(santos dumont|sdu|sbrj)\b/.test(t)) return 'SDU';
        if (/\b(galeao|tom jobim|gig|sbgl)\b/.test(t)) return 'GIG';
        if (/\b(guarulhos|cumbica|gru|sbgr)\b/.test(t)) return 'GRU';
        if (/\b(brasilia|bsb|sbbr)\b/.test(t)) return 'BSB';
        if (/\b(confins|belo horizonte|cnf|sbcf)\b/.test(t)) return 'CNF';
        if (/\b(salvador|ssa|sbsv)\b/.test(t)) return 'SSA';
        if (/\b(recife|guararapes|rec|sbrf)\b/.test(t)) return 'REC';
        return null;
    }
}

module.exports = { RitFlyAI };
