/**
 * Catálogo Corporativo de Fontes de Câmeras e Portais de Trânsito - Agente RIT / CIM
 * Suporte às 5 Regionais Globo: RJ, SP, BSB, REC, BH
 * Priorização de fontes visuais integradas (stream, snapshot e mapa) com fallback operacional
 */

/**
 * Função de detecção de suporte a codecs de vídeo WebRTC no navegador
 */
export function detectVideoCodecCapabilities() {
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const isEdge = /Edg\//i.test(ua);
    const isChrome = /Chrome\//i.test(ua) && !isEdge;
    const isFirefox = /Firefox\//i.test(ua);
    const isSafari = /Safari\//i.test(ua) && !/Chrome/i.test(ua);

    let browserName = 'Navegador Padrão';
    if (isEdge) browserName = 'Microsoft Edge';
    else if (isChrome) browserName = 'Google Chrome';
    else if (isFirefox) browserName = 'Mozilla Firefox';
    else if (isSafari) browserName = 'Apple Safari';

    const isWindows = /Windows/i.test(ua);
    const isMac = /Macintosh|Mac OS X/i.test(ua);

    let osName = 'Sistema Operacional';
    if (isWindows) osName = 'Windows';
    else if (isMac) osName = 'macOS';

    const result = {
        hasRTCRtpReceiver: false,
        supportsH265: false,
        supportsMediaSourceH265: false,
        codecs: [],
        browserName,
        osName,
        status: 'UNKNOWN'
    };

    try {
        if (
            typeof RTCRtpReceiver !== 'undefined' &&
            typeof RTCRtpReceiver.getCapabilities === 'function'
        ) {
            result.hasRTCRtpReceiver = true;
            const capabilities = RTCRtpReceiver.getCapabilities('video');
            result.codecs = (capabilities?.codecs || []).map(codec => codec.mimeType || '');

            result.supportsH265 = result.codecs.some(mime =>
                /h265|hevc/i.test(mime)
            );
        }
    } catch (error) {
        console.warn('[CamerasRJ] Falha ao detectar codecs WebRTC:', error);
    }

    try {
        if (typeof window !== 'undefined' && window.MediaSource && typeof window.MediaSource.isTypeSupported === 'function') {
            const testTypes = [
                'video/mp4; codecs="hvc1.1.6.L93.B0"',
                'video/mp4; codecs="hev1.1.6.L93.B0"',
                'video/mp4; codecs="hevc"'
            ];
            result.supportsMediaSourceH265 = testTypes.some(type => window.MediaSource.isTypeSupported(type));
        }
    } catch (e) {
        // Optional MediaSource check
    }

    if (result.supportsH265) {
        result.status = 'FULL_SUPPORT';
    } else if (result.supportsMediaSourceH265) {
        result.status = 'MEDIA_SOURCE_ONLY';
    } else {
        result.status = 'NO_HEVC_WEBRTC';
    }

    return result;
}

// Log inicial não invasivo no console
console.info('[CamerasRJ] Extended Codec detection:', detectVideoCodecCapabilities());

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
                prioridade: 2,
                observacao: "Câmeras experimentais e sensores de fluxo viário UFRJ"
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
                sourceProvider: "CamerasRJ",
                requiresCodec: "H265",
                protocol: "WebRTC/WHEP",
                compatibilityNote: "Pode exigir navegador com suporte H.265/HEVC via hardware.",
                fallbackSources: ["RJ_MAPA_RIO_01", "RJ_ZET_UFRJ_01", "RJ_CETRIO_01"],
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 3,
                observacao: "Orla de Copacabana (Requer suporte a H.265/HEVC no browser)"
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
                sourceProvider: "CamerasRJ",
                requiresCodec: "H265",
                protocol: "WebRTC/WHEP",
                compatibilityNote: "Pode exigir navegador com suporte H.265/HEVC via hardware.",
                fallbackSources: ["RJ_MAPA_RIO_01", "RJ_ZET_UFRJ_01", "RJ_CETRIO_01"],
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 4,
                observacao: "Transmissão pública CamerasRJ (Requer suporte a H.265/HEVC no browser)"
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
                sourceProvider: "CamerasRJ",
                requiresCodec: "H265",
                protocol: "WebRTC/WHEP",
                compatibilityNote: "Pode exigir navegador com suporte H.265/HEVC via hardware.",
                fallbackSources: ["RJ_MAPA_RIO_01", "RJ_ZET_UFRJ_01", "RJ_CETRIO_01"],
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 5,
                observacao: "Corredor Transoeste / Barra da Tijuca (Requer suporte a H.265/HEVC no browser)"
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
                id: "SP_CET_23",
                pasta: "23",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Paulista",
                referencia: "Av. Brigadeiro Luís Antônio",
                nome: "Paulista - Av Brigadeiro Luiz Antônio",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/23/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/23/1.jpg",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 1,
                refreshInterval: 3000,
                observacao: "Câmera ao vivo CET-SP: Eixo Financeiro e Operacional Paulista"
            },
            {
                id: "SP_CET_180",
                pasta: "180",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Consolação",
                referencia: "R. Caio Prado",
                nome: "Consolação - R Caio Prado",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/180/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/180/1.jpg",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 2,
                refreshInterval: 3000,
                observacao: "Câmera ao vivo CET-SP: Centro / Consolação"
            },
            {
                id: "SP_CET_200",
                pasta: "200",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Itaim Bibi / Faria Lima",
                referencia: "Av. Brig. Faria Lima x R. Iguatemi",
                nome: "Iguatemi - Av Brig Faria Lima",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/200/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/200/1.jpg",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 3,
                refreshInterval: 3000,
                observacao: "Câmera ao vivo CET-SP: Faria Lima / Itaim Bibi"
            },
            {
                id: "SP_CET_220",
                pasta: "220",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Cidade Jardim",
                referencia: "Av. Nove de Julho / Túnel Máx Feffer",
                nome: "Cidade Jardim - Av Nove de Julho",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/220/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/220/1.jpg",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 4,
                refreshInterval: 3000,
                observacao: "Câmera ao vivo CET-SP: Cidade Jardim / Nove de Julho"
            },
            {
                id: "SP_CET_210",
                pasta: "210",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Bela Vista / Jardins",
                referencia: "Av. Brig. Luís Antônio x Al. Santos",
                nome: "Brig Luis Antônio - Al Santos",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/210/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/210/1.jpg",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 5,
                refreshInterval: 3000,
                observacao: "Câmera ao vivo CET-SP: Jardins / Paraíso"
            },
            {
                id: "SP_CET_184",
                pasta: "184",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Jardins / Ibirapuera",
                referencia: "Av. Brasil x Av. Brig. Luís Antônio",
                nome: "Brasil - Av Brig Luis Antônio",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/184/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/184/1.jpg",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 6,
                refreshInterval: 3000,
                observacao: "Câmera ao vivo CET-SP: Av. Brasil / Pr. Armando S Oliveira"
            },
            {
                id: "SP_CET_195",
                pasta: "195",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Pinheiros / Jardins",
                referencia: "Av. Brasil x Av. Henrique Schaumann",
                nome: "Brasil - Av Henrique Schaumann",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/195/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/195/1.jpg",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 7,
                refreshInterval: 3000,
                observacao: "Câmera ao vivo CET-SP: Av. Rebouças / Henrique Schaumann"
            },
            {
                id: "SP_CET_222",
                pasta: "222",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Vila Nova Conceição",
                referencia: "Av. Hélio Pellegrino x R. Diogo Jácome",
                nome: "Hélio Pellegrino - R Diogo Jácome",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/222/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/222/1.jpg",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 8,
                refreshInterval: 3000,
                observacao: "Câmera ao vivo CET-SP: Ibirapuera / Moema"
            },
            {
                id: "SP_CET_224",
                pasta: "224",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Ibirapuera / Moema",
                referencia: "Av. Ibirapuera x R. Ipê",
                nome: "Ibirapuera - R Ipê",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/224/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/224/1.jpg",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 9,
                refreshInterval: 3000,
                observacao: "Câmera ao vivo CET-SP: Parque Ibirapuera / Moema"
            },
            {
                id: "SP_CET_225",
                pasta: "225",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Vila Clementino",
                referencia: "Av. Ascendino Reis x R. Pedro de Toledo",
                nome: "Ascendino Reis - R Pedro de Toledo",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/225/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/225/1.jpg",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 10,
                refreshInterval: 3000,
                observacao: "Câmera ao vivo CET-SP: Rubem Berta / 23 de Maio"
            },
            {
                id: "SP_CET_22",
                pasta: "22",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Paulista / Consolação",
                referencia: "Metrô Consolação / R. Augusta",
                nome: "Paulista - Metrô Consolação",
                tipoFonte: "snapshot",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                directImageUrl: "https://cameras.cetsp.com.br/Cams/22/1.jpg",
                proxyUrl: "/api/cameras/cetsp/image/22/1.jpg",
                suportaIframe: false,
                ativa: false,
                healthStatus: "indisponivel",
                lastValidation: new Date().toISOString(),
                prioridade: 11,
                refreshInterval: 3000,
                observacao: "Câmera temporariamente indisponível na CET"
            },
            {
                id: "SP_CET_PAINEL_DIRETO",
                regional: "SP",
                cidade: "São Paulo",
                bairro: "Geral / Todas as Vias",
                referencia: "CET-SP - Portal Geral",
                nome: "CET-SP - Portal de Câmeras",
                tipoFonte: "portal",
                url: "https://cameras.cetsp.com.br/View/Cam.aspx",
                embedUrl: "https://cameras.cetsp.com.br/View/Cam.aspx",
                suportaIframe: false,
                healthStatus: "externo",
                lastValidation: new Date().toISOString(),
                prioridade: 12,
                observacao: "Portal oficial de monitoramento da CET São Paulo"
            }
        ]
    },
    BSB: {
        label: "Brasília",
        cidade: "Brasília",
        slots: 1,
        sources: [
            {
                id: "BSB_ESPLANADA",
                slug: "esplanada",
                regional: "BSB",
                cidade: "Brasília",
                bairro: "Plano Piloto / Esplanada",
                referencia: "Torre de TV Brasil 21 - Esplanada",
                nome: "Brasília - Esplanada dos Ministérios",
                tipoFonte: "snapshot",
                url: "https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-esplanada",
                directImageUrl: "/api/cameras/brasilia/image/esplanada",
                proxyUrl: "/api/cameras/brasilia/image/esplanada",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 1,
                refreshInterval: 30000,
                observacao: "Câmera ao vivo Clima ao Vivo / Brasil 21: Esplanada dos Ministérios"
            },
            {
                id: "BSB_PARQUE_CIDADE",
                slug: "parque-da-cidade",
                regional: "BSB",
                cidade: "Brasília",
                bairro: "Asa Sul / Parque da Cidade",
                referencia: "Torre de TV Brasil 21 - Parque da Cidade",
                nome: "Brasília - Parque da Cidade",
                tipoFonte: "snapshot",
                url: "https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-parque-da-cidade",
                directImageUrl: "/api/cameras/brasilia/image/parque-da-cidade",
                proxyUrl: "/api/cameras/brasilia/image/parque-da-cidade",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 2,
                refreshInterval: 30000,
                observacao: "Câmera ao vivo Clima ao Vivo / Brasil 21: Parque da Cidade"
            },
            {
                id: "BSB_MANE_GARRINCHA",
                slug: "mane-garrincha",
                regional: "BSB",
                cidade: "Brasília",
                bairro: "Eixo Monumental / Noroeste",
                referencia: "Torre de TV Brasil 21 - Mané Garrincha",
                nome: "Brasília - Mané Garrincha",
                tipoFonte: "snapshot",
                url: "https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-mane-garrincha",
                directImageUrl: "/api/cameras/brasilia/image/mane-garrincha",
                proxyUrl: "/api/cameras/brasilia/image/mane-garrincha",
                suportaIframe: false,
                ativa: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 3,
                refreshInterval: 30000,
                observacao: "Câmera ao vivo Clima ao Vivo / Brasil 21: Mané Garrincha"
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
                prioridade: 4,
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
                id: "REC_AEROPORTO_01",
                regional: "REC",
                cidade: "Recife",
                bairro: "Imbiribeira / Aeroporto",
                referencia: "Aeroporto Internacional Gilberto Freyre",
                nome: "Recife ao Vivo - Câmeras do Mundo",
                tipoFonte: "stream",
                url: "https://camerasdomundo.com/brasil/recife/aeroporto-internacional-do-recife/",
                embedUrl: "https://camerasdomundo.com/brasil/recife/aeroporto-internacional-do-recife/",
                suportaIframe: true,
                healthStatus: "online",
                lastValidation: new Date().toISOString(),
                prioridade: 2,
                observacao: "Transmissão ao vivo de Recife e acessos viários do Aeroporto"
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
                prioridade: 3,
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
                prioridade: 4,
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
                if (src.healthStatus === 'online' || src.suportaIframe || src.tipoFonte === 'snapshot') {
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
