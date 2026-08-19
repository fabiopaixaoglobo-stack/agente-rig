/**
 * Catálogo Corporativo de Fontes de Câmeras e Portais de Trânsito - Agente RIT / CIM
 * Suporte às 5 Regionais Globo: RJ, SP, BSB, REC, BH
 * Priorização de fontes visuais integradas (stream e mapa) com fallback resiliente
 */
export const trafficCameraSources = {
    RJ: {
        label: "Rio de Janeiro",
        cidade: "Rio de Janeiro",
        slots: 2,
        sources: [
            {
                id: "RJ_MAPA_RIO_01",
                regional: "RJ",
                cidade: "Rio de Janeiro",
                bairro: "Geral / Todas as Vias",
                referencia: "José Britz / Mapa Câmeras Rio",
                nome: "Mapa Interativo de Câmeras do Rio",
                tipoFonte: "mapa",
                url: "https://josebritz.github.io/camerasrio/",
                embedUrl: "https://josebritz.github.io/camerasrio/",
                suportaIframe: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 1,
                observacao: "Painel georreferenciado com todas as câmeras públicas do Rio (Redundância principal)"
            },
            {
                id: "RJ_CAMERASRJ_COPACABANA",
                regional: "RJ",
                cidade: "Rio de Janeiro",
                bairro: "Copacabana",
                referencia: "Av. Atlântica - Posto 4",
                nome: "CamerasRJ - Copacabana / Orla",
                tipoFonte: "stream",
                url: "https://www.camerasrj.com.br/camera/1301/",
                embedUrl: "https://www.camerasrj.com.br/camera/1301/",
                suportaIframe: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 2,
                observacao: "Orla de Copacabana"
            },
            {
                id: "RJ_ZET_UFRJ_01",
                regional: "RJ",
                cidade: "Rio de Janeiro",
                bairro: "Ilha do Fundão / Universitária",
                referencia: "UFRJ ZET Cidades",
                nome: "UFRJ ZET - Câmeras de Tráfego",
                tipoFonte: "stream",
                url: "https://www02.smt.ufrj.br/~tvdigital/zet/page_03.html",
                embedUrl: "https://www02.smt.ufrj.br/~tvdigital/zet/page_03.html",
                suportaIframe: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 3,
                observacao: "Câmeras experimentais e sensores de fluxo viário UFRJ"
            },
            {
                id: "RJ_CAMERASRJ_CENTRO",
                regional: "RJ",
                cidade: "Rio de Janeiro",
                bairro: "Centro",
                referencia: "Av. Pres. Vargas x Rio Branco",
                nome: "CamerasRJ - Centro / Presidente Vargas",
                tipoFonte: "stream",
                url: "https://www.camerasrj.com.br/",
                embedUrl: "https://www.camerasrj.com.br/",
                suportaIframe: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 4,
                observacao: "Transmissão pública CamerasRJ"
            },
            {
                id: "RJ_CAMERASRJ_BARRA",
                regional: "RJ",
                cidade: "Rio de Janeiro",
                bairro: "Barra da Tijuca",
                referencia: "Av. das Américas / Alvorada",
                nome: "CamerasRJ - Barra Alvorada / Transoeste",
                tipoFonte: "stream",
                url: "https://www.camerasrj.com.br/camera/1010/",
                embedUrl: "https://www.camerasrj.com.br/camera/1010/",
                suportaIframe: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 5,
                observacao: "Corredor Transoeste / Barra da Tijuca"
            },
            {
                id: "RJ_CETRIO_01",
                regional: "RJ",
                cidade: "Rio de Janeiro",
                bairro: "Vias Expressas (L. Vermelha / Av. Brasil)",
                referencia: "CET-Rio / Prefeitura",
                nome: "CET-Rio - Centro de Operações",
                tipoFonte: "portal",
                url: "https://cetrio.prefeitura.rio/",
                embedUrl: "https://cetrio.prefeitura.rio/",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 6,
                observacao: "Portal oficial de operações viárias e condições de trânsito"
            }
        ]
    },
    SP: {
        label: "São Paulo",
        cidade: "São Paulo",
        slots: 1,
        sources: [
            {
                id: "SP_CET_PAINEL_DIRETO",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Marginais e Eixos Estruturais SP",
                referencia: "CET-SP - Painel de Câmeras",
                nome: "CET-SP - Painel Direto de Câmeras",
                tipoFonte: "mapa",
                url: "https://cameras.cetsp.com.br/",
                embedUrl: "https://cameras.cetsp.com.br/",
                suportaIframe: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 1,
                observacao: "Fonte visual prioritária para exibição integrada de câmeras em São Paulo"
            },
            {
                id: "SP_CET_OFICIAL_01",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Marginais e Corredores CET",
                referencia: "CET-SP Oficial",
                nome: "CET-SP - Portal Oficial de Câmeras",
                tipoFonte: "portal",
                url: "https://www.cetsp.com.br/consultas/cameras-cet.aspx",
                embedUrl: "https://www.cetsp.com.br/consultas/cameras-cet.aspx",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 2,
                observacao: "Monitoramento oficial das principais vias da CET-SP"
            },
            {
                id: "SP_PAULISTA_01",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Bela Vista / Cerqueira César",
                referencia: "Av. Paulista x Rua da Consolação",
                nome: "CET-SP - Eixo Av. Paulista",
                tipoFonte: "portal",
                url: "https://www.cetsp.com.br/consultas/cameras-cet.aspx",
                embedUrl: "https://www.cetsp.com.br/consultas/cameras-cet.aspx",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 3,
                observacao: "Eixo Financeiro e Operacional Paulista"
            },
            {
                id: "SP_MARGINAL_TIETE_01",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Santana / Casa Verde / Lapa",
                referencia: "Marginal Tietê / Pontes Principais",
                nome: "CET-SP - Marginal Tietê",
                tipoFonte: "portal",
                url: "https://www.cetsp.com.br/consultas/cameras-cet.aspx",
                embedUrl: "https://www.cetsp.com.br/consultas/cameras-cet.aspx",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 4,
                observacao: "Marginal Tietê Sentido Ayrton Senna / Castelo"
            },
            {
                id: "SP_MARGINAL_PINHEIROS_01",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Pinheiros / Morumbi / Sto Amaro",
                referencia: "Marginal Pinheiros / Ponte Estaiada",
                nome: "CET-SP - Marginal Pinheiros",
                tipoFonte: "portal",
                url: "https://www.cetsp.com.br/consultas/cameras-cet.aspx",
                embedUrl: "https://www.cetsp.com.br/consultas/cameras-cet.aspx",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 5,
                observacao: "Marginal Pinheiros Sentido Interlagos / Castelo"
            }
        ]
    },
    BSB: {
        label: "Brasília",
        cidade: "Brasília",
        slots: 1,
        sources: [
            {
                id: "BSB_CAMERAS_MUNDO_01",
                regional: "BSB",
                cidade: "Brasília",
                bairro: "Eixo Monumental / Plano Piloto",
                referencia: "Câmeras do Mundo Brasília",
                nome: "Brasília ao Vivo - Câmeras do Mundo",
                tipoFonte: "stream",
                url: "https://camerasdomundo.com/brasil/brasilia/",
                embedUrl: "https://camerasdomundo.com/brasil/brasilia/",
                suportaIframe: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 1,
                observacao: "Fonte visual prioritária para Brasília com transmissão ao vivo"
            },
            {
                id: "BSB_DF_AGORA_01",
                regional: "BSB",
                cidade: "Brasília",
                bairro: "Plano Piloto / Asa Sul / Asa Norte",
                referencia: "DF Agora Trânsito",
                nome: "DF Agora - Trânsito DF Ao Vivo & Mapa",
                tipoFonte: "mapa",
                url: "https://www.dfagora.com.br/transito-df-ao-vivo/",
                embedUrl: "https://www.dfagora.com.br/transito-df-ao-vivo/",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 2,
                observacao: "Transmissões e mapas de trânsito em tempo real DF"
            },
            {
                id: "BSB_DER_DF_01",
                regional: "BSB",
                cidade: "Brasília",
                bairro: "Rodovias Distritais / EPTG / EPNB / DF-001",
                referencia: "DER-DF Monitoramento",
                nome: "DER-DF - Relação de Câmeras",
                tipoFonte: "portal",
                url: "https://der.df.gov.br/relacao-de-cameras-de-monitoramento/",
                embedUrl: "https://der.df.gov.br/relacao-de-cameras-de-monitoramento/",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 3,
                observacao: "Monitoramento oficial das rodovias do Distrito Federal"
            }
        ]
    },
    REC: {
        label: "Recife",
        cidade: "Recife",
        slots: 1,
        sources: [
            {
                id: "REC_MAPA_VERCEL_01",
                regional: "REC",
                cidade: "Recife",
                bairro: "Rede Integrada Recife",
                referencia: "Mapa CTTU PE",
                nome: "Mapa de Câmeras Recife (CTTU PE)",
                tipoFonte: "mapa",
                url: "https://cttupe-cameras.vercel.app/",
                embedUrl: "https://cttupe-cameras.vercel.app/",
                suportaIframe: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 1,
                observacao: "Mapa visual integrado com posições de câmeras em Recife"
            },
            {
                id: "REC_SERTTEL_01",
                regional: "REC",
                cidade: "Recife",
                bairro: "Corredores Principais / RMR",
                referencia: "Portal Trânsito Recife (Serttel)",
                nome: "Portal Trânsito Recife - Serttel / CTTU",
                tipoFonte: "portal",
                url: "https://transito-recife.serttel.com.br/",
                embedUrl: "https://transito-recife.serttel.com.br/",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 2,
                observacao: "Câmeras semafóricas e monitoramento viário Serttel"
            },
            {
                id: "REC_CTTU_01",
                regional: "REC",
                cidade: "Recife",
                bairro: "Boa Viagem / Derby / Agamenon / Centro",
                referencia: "CTTU Recife Oficial",
                nome: "CTTU Recife - Câmeras de Trânsito",
                tipoFonte: "portal",
                url: "https://cttu.recife.pe.gov.br/cameras-da-cttu",
                embedUrl: "https://cttu.recife.pe.gov.br/cameras-da-cttu",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 3,
                observacao: "Autarquia de Trânsito e Transporte Urbano do Recife"
            }
        ]
    },
    BH: {
        label: "Belo Horizonte",
        cidade: "Belo Horizonte",
        slots: 1,
        sources: [
            {
                id: "BH_REALDATA_01",
                regional: "BH",
                cidade: "Belo Horizonte",
                bairro: "Barreiro / Floresta / Contagem",
                referencia: "RealData Telecom",
                nome: "RealData Telecom - Câmeras ao Vivo",
                tipoFonte: "stream",
                url: "https://realdata.com.br/cameras-ao-vivo/",
                embedUrl: "https://realdata.com.br/cameras-ao-vivo/",
                suportaIframe: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 1,
                observacao: "Fonte visual prioritária com câmeras online em BH e região"
            },
            {
                id: "BH_MINEIRINHO_01",
                regional: "BH",
                cidade: "Belo Horizonte",
                bairro: "Afonso Pena / Amazonas / Contorno",
                referencia: "Jornal Mineirinho BH",
                nome: "Jornal Mineirinho - Trânsito ao Vivo BH",
                tipoFonte: "portal",
                url: "https://jornalmineirinho.blogspot.com/p/transito.html",
                embedUrl: "https://jornalmineirinho.blogspot.com/p/transito.html",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 2,
                observacao: "Câmeras ao vivo de trânsito em Belo Horizonte e RMBH"
            },
            {
                id: "BH_PORTAL_JM_01",
                regional: "BH",
                cidade: "Belo Horizonte",
                bairro: "Cristiano Machado / Linha Verde / MG-010",
                referencia: "Portal JM Belo Horizonte",
                nome: "Portal JM - Trânsito ao Vivo BH",
                tipoFonte: "portal",
                url: "https://portaljm.wixsite.com/jornal-mineirinho/transito-ao-vivo-belo-horizonte-jm",
                embedUrl: "https://portaljm.wixsite.com/jornal-mineirinho/transito-ao-vivo-belo-horizonte-jm",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 3,
                observacao: "Monitoramento de avenidas e acessos da Grande BH"
            }
        ]
    }
};

/**
 * Normaliza URLs para garantir HTTPS e evitar Mixed Content
 */
export function normalizeEmbedUrl(url) {
    if (!url) return '';
    let cleanUrl = String(url).trim();
    if (cleanUrl.startsWith('http://cameras.cetsp.com.br')) {
        cleanUrl = cleanUrl.replace('http://', 'https://');
    }
    return cleanUrl;
}

/**
 * Função utilitária para contagem de métricas do catálogo CIM
 */
export function getCatalogStats() {
    let totalSources = 0;
    let onlineCount = 0;
    let externalCount = 0;
    let citiesCount = Object.keys(trafficCameraSources).length;

    Object.values(trafficCameraSources).forEach(reg => {
        if (Array.isArray(reg.sources)) {
            totalSources += reg.sources.length;
            reg.sources.forEach(src => {
                if (src.healthStatus === 'online' || src.suportaIframe) {
                    onlineCount++;
                } else {
                    externalCount++;
                }
            });
        }
    });

    return {
        totalSources,
        onlineCount,
        externalCount,
        citiesCount
    };
}
