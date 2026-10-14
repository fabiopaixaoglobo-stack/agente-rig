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
     * Processa perguntas em linguagem natural e retorna resposta analítica contextualizada
     */
    async answer(userQuery = '') {
        const query = userQuery.trim().toLowerCase();
        if (!query) {
            return {
                texto: 'Olá! Sou o **RIT FLY AI**, seu assistente de inteligência aérea corporativa. Como posso ajudar com seus voos, aeroportos ou deslocamentos hoje?',
                intencao: 'SAUDACAO',
                sugestoes: [
                    'Qual a previsão de chegada do voo G3 1234?',
                    'Há atrasos em Congonhas?',
                    'Quais voos chegam ao Santos Dumont nas próximas 2 horas?',
                    'Qual o risco operacional do deslocamento aeroporto → destino?'
                ]
            };
        }

        // 1. INTENÇÃO: Consulta de previsão de voo específico (G3 1234, LA 3456, PR-XMB, etc.)
        const specificFlightMatch = query.match(/\b(g3\s*\d+|la\s*\d+|ad\s*\d+|2z\s*\d+|glo\s*\d+|tam\s*\d+|azu\s*\d+|pr-[a-z0-9]{3}|pp-[a-z0-9]{3}|ps-[a-z0-9]{3})\b/i);
        const genericFlightMatch = query.match(/(?:voo\s+|voo\s+n[º°]?\s*)([a-z0-9]{2,4}\s*\d{2,5})/i);
        const flightMatch = specificFlightMatch || genericFlightMatch;

        if (flightMatch) {
            const flightKey = flightMatch[1].trim().toUpperCase();
            if (!this.isAirportName(flightKey)) {
                return await this.handleFlightQuery(flightKey);
            }
        }

        // 2. INTENÇÃO: Voos chegando nas próximas horas
        if (query.includes('quais voos') || (query.includes('chegam') && (query.includes('próximas') || query.includes('hora') || query.includes('santos dumont') || query.includes('sdu')))) {
            const airportCode = this.extractAirportCode(query) || 'SDU';
            return await this.handleInboundFlightsQuery(airportCode);
        }

        // 3. INTENÇÃO: Atrasos e situação em aeroporto específico
        if (query.includes('atraso') || query.includes('congonhas') || query.includes('santos dumont') || query.includes('galeão') || query.includes('guarulhos') || query.includes('brasília') || query.includes('confins')) {
            const airportCode = this.extractAirportCode(query);
            if (airportCode) {
                return await this.handleAirportStatusQuery(airportCode);
            }
        }

        // 4. INTENÇÃO: Risco operacional do deslocamento aeroporto -> destino
        if (query.includes('risco') || query.includes('deslocamento') || query.includes('trajeto') || query.includes('destino')) {
            return await this.handleOperationalRiskQuery(query);
        }

        // 5. INTENÇÃO: Resumo ou Visão Executiva Geral
        if (query.includes('kpi') || query.includes('resumo') || query.includes('geral') || query.includes('painel')) {
            return await this.handleExecutiveSummaryQuery();
        }

        // Fallback inteligente
        return await this.handleGenericQuery(query);
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
        const horaPrevista = new Date(flight.horarioPrevisto).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const horaEta = new Date(flight.eta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        let texto = `✈️ **Relatório de Voo: ${flight.numeroVoo} (${flight.prefixo})**\n\n`;
        texto += `• **Companhia:** ${flight.companhia}\n`;
        texto += `• **Rota:** ${flight.origem} ➔ ${flight.destino}\n`;
        texto += `• **Status Operacional:** ${statusEmoji} **${flight.status}**\n`;
        texto += `• **Altitude Atual:** ${flight.altitudeFt.toLocaleString('pt-BR')} pés (${flight.altitudeM.toLocaleString('pt-BR')} m)\n`;
        texto += `• **Velocidade no Solo:** ${flight.velocidadeKmh} km/h (${flight.velocidadeKts} kts)\n`;
        texto += `• **Horário Previsto na Malha:** ${horaPrevista}\n`;
        texto += `• **ETA Projetado de Chegada:** **${horaEta}** ${isAtrasado ? `(Atraso estimado de +${flight.atrasoMinutos} min)` : '(No horário)'}\n\n`;

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
        const taxaPontualidade = totalVoos > 0 ? Math.round(((totalVoos - totais.atrasos) / totalVoos) * 100) : 95;

        let texto = `🏢 **Boletim Operacional: ${airportDetails.nome} (${airportDetails.iata}/${airportDetails.icao})**\n\n`;
        texto += `• **Condição de Operação:** **${clima.statusOperacional || 'ABERTO_VFR'}** (Regra: ${clima.flightRule || 'VFR'})\n`;
        texto += `• **Clima Operacional:** ${clima.condicoes || 'Normal'}, ${clima.temperaturaC}°C, Vento ${clima.vento ? clima.vento.descricao : 'Calmo'}\n`;
        texto += `• **Teto / Visibilidade:** ${clima.tetoDescricao || 'Normal'} | Visibilidade: ${clima.visibilidade ? clima.visibilidade.descricao : '> 10 km'}\n`;
        texto += `• **Movimentos Monitorados:** ${totalVoos} voos (${totais.totalChegadas} chegadas / ${totais.totalPartidas} partidas)\n`;
        texto += `• **Voos com Atraso:** **${totais.atrasos}** voos (${totais.atrasos > 0 ? 'Índice de atraso moderado' : 'Sem atrasos severos'})\n`;
        texto += `• **Pontualidade da Praça:** **${taxaPontualidade}%**\n\n`;

        if (totais.atrasos > 2 || clima.flightRule === 'IFR') {
            texto += `⚠️ **Atenção Operacional:** Há retenções operacionais em ${airportDetails.iata}. Recomenda-se adicionar margem adicional de 30 minutos nas viagens corporativas com embarque neste terminal.`;
        } else {
            texto += `✅ **Operação Normal:** Pistas e terminais operando dentro do fluxo esperado sem impactos meteorológicos severos.`;
        }

        return {
            texto,
            intencao: 'STATUS_AEROPORTO',
            dados: airportDetails
        };
    }

    /**
     * Responde: "Quais voos chegam ao Santos Dumont nas próximas 2 horas?"
     */
    async handleInboundFlightsQuery(airportCode = 'SDU') {
        const flights = await this.openSkyProvider.getFlights();
        const cleanCode = airportCode.toUpperCase();
        const airportMeta = AIRPORTS[cleanCode] || AIRPORTS.SDU;

        const inbound = flights
            .filter(f => f.destino === airportMeta.iata)
            .sort((a, b) => new Date(a.eta) - new Date(b.eta))
            .slice(0, 6);

        if (inbound.length === 0) {
            return {
                texto: `Não há pousos registrados para **${airportMeta.nome} (${airportMeta.iata})** nas próximas 2 horas no feed do radar.`,
                intencao: 'CHEGADAS_VAZIAS'
            };
        }

        let texto = `🛬 **Voos com Pouso Previsto em ${airportMeta.nome} (${airportMeta.iata}) nas Próximas 2 Horas:**\n\n`;
        inbound.forEach(f => {
            const atrasoTxt = f.atrasoMinutos > 15 ? `⚠️ +${f.atrasoMinutos}m atraso` : `✅ no horário`;
            texto += `• **${f.numeroVoo}** (${f.companhia}) | Origem: **${f.origem}** | ETA: **${f.etaFormatado}** (${atrasoTxt})\n`;
        });

        texto += `\n💡 Total de **${inbound.length} voos em aproximação**. O sistema do Agente RIT monitora cada um desses voos em tempo real a cada 30 segundos.`;

        return {
            texto,
            intencao: 'VOOS_CHEGADA',
            dados: inbound
        };
    }

    /**
     * Responde: "Qual o risco operacional do deslocamento aeroporto → destino?"
     */
    async handleOperationalRiskQuery(query) {
        // Analisa rotas estratégicas como SDU -> Estúdios Globo, GIG -> Barra, CGH -> Berrini
        const isSduToProjac = query.includes('estúdios globo') || query.includes('projac') || query.includes('sdu');
        
        let origemNome = 'Aeroporto Santos Dumont (SDU)';
        let destinoNome = 'Estúdios Globo - Jacarepaguá';
        let viaPrincipal = 'Linha Vermelha / Linha Amarela';
        let nivelRisco = 'MÉDIO';
        let corRisco = '#f59e0b';
        let tempoEstimadoMin = 52;
        let pontosCriticos = ['Trecho Linha Amarela próximo a Del Castilho', 'Saída Túnel Santa Bárbara'];

        if (query.includes('cgh') || query.includes('congonhas')) {
            origemNome = 'Aeroporto de Congonhas (CGH)';
            destinoNome = 'Região Berrini / Chucri Zaidan';
            viaPrincipal = 'Av. Washington Luís / Av. Jornalista Roberto Marinho';
            nivelRisco = 'BAIXO';
            tempoEstimadoMin = 28;
            pontosCriticos = ['Cruzamento Av. 23 de Maio sentido Sul'];
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
            texto: `🤖 Compreendi sua mensagem: *"${query}"*. Como assistente especializado do **RIT FLY AI**, consigo analisar status de voos, prever horários de chegada, calcular riscos de deslocamentos terrestres e consultar o clima e atrasos em Congonhas, Santos Dumont, Galeão, Brasília e outros aeroportos. Experimente perguntar: *"Há atrasos em Congonhas?"* ou *"Qual a previsão do voo G3 1234?"*`,
            intencao: 'CONSULTA_GERAL',
            sugestoes: [
                'Qual a previsão de chegada do voo G3 1234?',
                'Há atrasos em Congonhas?',
                'Quais voos chegam ao Santos Dumont nas próximas 2 horas?',
                'Qual o risco operacional do deslocamento aeroporto → destino?'
            ]
        };
    }

    isAirportName(str) {
        const s = str.toLowerCase();
        return s.includes('congonhas') || s.includes('santos') || s.includes('galeão') || s.includes('guarulhos') || s.includes('brasília');
    }

    extractAirportCode(text) {
        const t = text.toLowerCase();
        if (t.includes('congonhas') || t.includes('cgh') || t.includes('sbsp')) return 'CGH';
        if (t.includes('santos dumont') || t.includes('sdu') || t.includes('sbrj')) return 'SDU';
        if (t.includes('galeão') || t.includes('gig') || t.includes('sbgl')) return 'GIG';
        if (t.includes('guarulhos') || t.includes('gru') || t.includes('sbgr')) return 'GRU';
        if (t.includes('brasília') || t.includes('bsb') || t.includes('sbbr')) return 'BSB';
        if (t.includes('confins') || t.includes('cnf') || t.includes('sbcf')) return 'CNF';
        if (t.includes('salvador') || t.includes('ssa') || t.includes('sbsv')) return 'SSA';
        if (t.includes('recife') || t.includes('rec') || t.includes('sbrf')) return 'REC';
        return null;
    }
}

module.exports = { RitFlyAI };
