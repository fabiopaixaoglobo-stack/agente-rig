'use strict';

const { loadConfig } = require('../config');
const { TRAFFIC_AWARENESS } = require('../constants');
const { calculateHaversineDistance } = require('../db/geo-fallback');

/**
 * Normaliza chave textual de via/corredor para cruzamento consistente.
 * @param {string} value
 * @returns {string}
 */
function normalizeCorridorKey(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * Catálogo operacional de trechos georreferenciados e sentidos das principais vias do Rio de Janeiro.
 */
const RJ_CORRIDOR_SEGMENTS = {
    'av brasil': {
        sentidoPadrao: 'centro',
        trechoPadrao: 'penha',
        sentidos: [
            { id: 'centro', label: 'Sentido Centro', factor: 1.05, primaryDirection: true },
            { id: 'santa-cruz', label: 'Sentido Zona Oeste / Santa Cruz', factor: 0.45, primaryDirection: false }
        ],
        trechos: [
            { id: 'caju', label: 'Caju / São Cristóvão (km 0–4)', lat: -22.8888, lng: -43.2218, congestionWeight: 1.1, extraDelayMin: 4 },
            { id: 'bonsucesso', label: 'Bonsucesso / Ramos (km 6–10)', lat: -22.8615, lng: -43.2490, congestionWeight: 1.05, extraDelayMin: 2 },
            { id: 'penha', label: 'Penha / Mercado São Sebastião (km 12–16)', lat: -22.8368, lng: -43.2775, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'iraja', label: 'Irajá / Trevo das Margaridas (km 17–21)', lat: -22.8258, lng: -43.3208, congestionWeight: 0.85, extraDelayMin: -3 },
            { id: 'deodoro', label: 'Deodoro / Guadalupe (km 24–29)', lat: -22.8512, lng: -43.3835, congestionWeight: 0.72, extraDelayMin: -5 },
            { id: 'bangu', label: 'Realengo / Bangu (km 32–38)', lat: -22.8662, lng: -43.4555, congestionWeight: 0.55, extraDelayMin: -8 },
            { id: 'campo-grande', label: 'Campo Grande / Santa Cruz (km 42–56)', lat: -22.8825, lng: -43.5555, congestionWeight: 0.4, extraDelayMin: -10 }
        ]
    },
    'presidente dutra': {
        sentidoPadrao: 'rio',
        trechoPadrao: 'iraja-dutra',
        sentidos: [
            { id: 'rio', label: 'Sentido Rio de Janeiro', factor: 1.0, primaryDirection: true },
            { id: 'sp', label: 'Sentido Baixada / São Paulo', factor: 0.55, primaryDirection: false }
        ],
        trechos: [
            { id: 'iraja-dutra', label: 'Trevo das Margaridas / Irajá (km 163–167)', lat: -22.8255, lng: -43.3220, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'pavuna', label: 'Pavuna / São João de Meriti (km 168–173)', lat: -22.8015, lng: -43.3560, congestionWeight: 0.9, extraDelayMin: -1 },
            { id: 'belford-roxo', label: 'Duque de Caxias / Belford Roxo (km 174–179)', lat: -22.7805, lng: -43.3950, congestionWeight: 0.78, extraDelayMin: -3 },
            { id: 'nova-iguacu', label: 'Nova Iguaçu / Mesquita (km 180–186)', lat: -22.7580, lng: -43.4480, congestionWeight: 0.65, extraDelayMin: -4 },
            { id: 'seropedica', label: 'Queimados / Seropédica (km 190–208)', lat: -22.7280, lng: -43.5950, congestionWeight: 0.45, extraDelayMin: -6 }
        ]
    },
    'linha vermelha': {
        sentidoPadrao: 'centro',
        trechoPadrao: 'fundao',
        sentidos: [
            { id: 'centro', label: 'Sentido Centro / Túnel Rebouças', factor: 1.05, primaryDirection: true },
            { id: 'baixada', label: 'Sentido Baixada / Washington Luís', factor: 0.55, primaryDirection: false }
        ],
        trechos: [
            { id: 'sao-cristovao', label: 'São Cristóvão / Elevado Paulo de Frontin (km 0–3)', lat: -22.9055, lng: -43.2140, congestionWeight: 0.85, extraDelayMin: -4 },
            { id: 'mare', label: 'Maré / Complexo da Maré (km 4–7)', lat: -22.8640, lng: -43.2375, congestionWeight: 0.95, extraDelayMin: -2 },
            { id: 'fundao', label: 'Acesso Ilha do Fundão / UFRJ (km 8–10)', lat: -22.8455, lng: -43.2385, congestionWeight: 1.05, extraDelayMin: 0 },
            { id: 'galeao', label: 'Acesso Galeão / Ilha do Governador (km 11–13)', lat: -22.8285, lng: -43.2435, congestionWeight: 0.8, extraDelayMin: -6 },
            { id: 'duque-caxias', label: 'Vigário Geral / Duque de Caxias (km 14–18)', lat: -22.8015, lng: -43.2680, congestionWeight: 0.65, extraDelayMin: -10 }
        ]
    },
    'linha amarela': {
        sentidoPadrao: 'barra',
        trechoPadrao: 'del-castilho',
        sentidos: [
            { id: 'barra', label: 'Sentido Barra / Jacarepaguá', factor: 1.0, primaryDirection: true },
            { id: 'fundao', label: 'Sentido Fundão / Ilha do Governador', factor: 0.9, primaryDirection: false }
        ],
        trechos: [
            { id: 'bonsucesso-fundao', label: 'Fundão / Bonsucesso (Saída 10)', lat: -22.8595, lng: -43.2395, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'del-castilho', label: 'Del Castilho / Nova América (Saída 7)', lat: -22.8790, lng: -43.2715, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'engenho-dentro', label: 'Engenho de Dentro / Méier (Saída 4–5)', lat: -22.8965, lng: -43.2925, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'pedagio-covanca', label: 'Praça do Pedágio / Túnel da Covanca', lat: -22.9090, lng: -43.3145, congestionWeight: 1.1, extraDelayMin: 2 },
            { id: 'freguesia', label: 'Pechincha / Freguesia (Saída 1–2)', lat: -22.9360, lng: -43.3370, congestionWeight: 0.9, extraDelayMin: 0 },
            { id: 'barra-ayrton', label: 'Cidade de Deus / Ayrton Senna (Barra)', lat: -22.9685, lng: -43.3620, congestionWeight: 0.95, extraDelayMin: 0 }
        ]
    },
    'transolimpica': {
        sentidoPadrao: 'recreio',
        trechoPadrao: 'curicica-projac',
        sentidos: [
            { id: 'recreio', label: 'Sentido Recreio / Barra', factor: 1.0, primaryDirection: true },
            { id: 'deodoro', label: 'Sentido Deodoro / Av. Brasil', factor: 0.95, primaryDirection: false }
        ],
        trechos: [
            { id: 'deodoro-trans', label: 'Deodoro / Acesso Av. Brasil', lat: -22.8615, lng: -43.3925, congestionWeight: 0.9, extraDelayMin: 0 },
            { id: 'sulacap', label: 'Jardim Sulacap / Magalhães Bastos', lat: -22.8855, lng: -43.3945, congestionWeight: 0.95, extraDelayMin: 0 },
            { id: 'taquara', label: 'Taquara / Estrada dos Bandeirantes', lat: -22.9225, lng: -43.3990, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'curicica-projac', label: 'Curicica / Estúdios Globo (Camorim)', lat: -22.9565, lng: -43.4090, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'recreio-salvador', label: 'Recreio / Av. Salvador Allende', lat: -22.9990, lng: -43.4310, congestionWeight: 0.9, extraDelayMin: 0 }
        ]
    },
    'centro': {
        sentidoPadrao: 'candelaria',
        trechoPadrao: 'pres-vargas-rio-branco',
        sentidos: [
            { id: 'candelaria', label: 'Sentido Candelária / Praça XV', factor: 1.0, primaryDirection: true },
            { id: 'central', label: 'Sentido Central / Cidade Nova', factor: 0.85, primaryDirection: false }
        ],
        trechos: [
            { id: 'pres-vargas-rio-branco', label: 'Av. Pres. Vargas x Av. Rio Branco', lat: -22.9025, lng: -43.1795, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'central-brasil', label: 'Central do Brasil / Praça da República', lat: -22.9045, lng: -43.1915, congestionWeight: 0.95, extraDelayMin: 0 },
            { id: 'praca-maua', label: 'Porto Maravilha / Praça Mauá (Via Binário)', lat: -22.8965, lng: -43.1805, congestionWeight: 0.8, extraDelayMin: -2 },
            { id: 'aterro-sdu', label: 'Aterro do Flamengo / Aeroporto SDU', lat: -22.9120, lng: -43.1680, congestionWeight: 0.7, extraDelayMin: -3 },
            { id: 'lapa-cinelandia', label: 'Cinelândia / Lapa / Rua Mem de Sá', lat: -22.9118, lng: -43.1785, congestionWeight: 1.05, extraDelayMin: 1 }
        ]
    },
    'barra da tijuca': {
        sentidoPadrao: 'zona-sul',
        trechoPadrao: 'alvorada',
        sentidos: [
            { id: 'zona-sul', label: 'Sentido Zona Sul / Joá', factor: 1.1, primaryDirection: true },
            { id: 'recreio', label: 'Sentido Recreio / Vargens', factor: 0.85, primaryDirection: false }
        ],
        trechos: [
            { id: 'alvorada', label: 'Terminal Alvorada / Av. Ayrton Senna', lat: -23.0005, lng: -43.3655, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'americas-barrashopping', label: 'Av. das Américas / BarraShopping', lat: -22.9990, lng: -43.3565, congestionWeight: 1.15, extraDelayMin: 3 },
            { id: 'gardenia-ayrton', label: 'Av. Ayrton Senna / Gardênia Azul', lat: -22.9680, lng: -43.3575, congestionWeight: 1.0, extraDelayMin: 1 },
            { id: 'jardim-oceanico', label: 'Jardim Oceânico / Ponte da Joatinga', lat: -23.0075, lng: -43.3095, congestionWeight: 1.2, extraDelayMin: 4 },
            { id: 'bandeirantes-riocentro', label: 'Estrada dos Bandeirantes / Riocentro', lat: -22.9765, lng: -43.4095, congestionWeight: 0.9, extraDelayMin: 0 }
        ]
    },
    'zona sul': {
        sentidoPadrao: 'lagoa',
        trechoPadrao: 'reboucas',
        sentidos: [
            { id: 'lagoa', label: 'Sentido Lagoa / Barra (Sul)', factor: 1.05, primaryDirection: true },
            { id: 'centro', label: 'Sentido Centro / Aterro (Norte)', factor: 0.85, primaryDirection: false }
        ],
        trechos: [
            { id: 'reboucas', label: 'Túnel Rebouças / Cosme Velho', lat: -22.9430, lng: -43.2045, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'jardim-botanico-globo', label: 'Jardim Botânico / Rua Lopes Quintas (Globo)', lat: -22.9619, lng: -43.2165, congestionWeight: 0.95, extraDelayMin: 0 },
            { id: 'lagoa-cantagalo', label: 'Lagoa Rodrigo de Freitas / Corte do Cantagalo', lat: -22.9725, lng: -43.2035, congestionWeight: 1.05, extraDelayMin: 2 },
            { id: 'botafogo-enseada', label: 'Praia de Botafogo / Enseada', lat: -22.9480, lng: -43.1805, congestionWeight: 1.0, extraDelayMin: 1 },
            { id: 'copacabana-princesa-isabel', label: 'Copacabana / Túnel Novo (Princesa Isabel)', lat: -22.9635, lng: -43.1755, congestionWeight: 1.1, extraDelayMin: 3 },
            { id: 'autoestrada-lag-barra', label: 'Gávea / Autoestrada Lagoa–Barra', lat: -22.9895, lng: -43.2525, congestionWeight: 0.9, extraDelayMin: 0 }
        ]
    },
    'ponte rio niteroi': {
        sentidoPadrao: 'niteroi',
        trechoPadrao: 'pedagio-niteroi',
        sentidos: [
            { id: 'niteroi', label: 'Sentido Niterói / Região dos Lagos', factor: 1.05, primaryDirection: true },
            { id: 'rio', label: 'Sentido Rio de Janeiro / Av. Brasil', factor: 0.5, primaryDirection: false }
        ],
        trechos: [
            { id: 'rampa-rio', label: 'Acessos Rio / Reta do Cais (Gasômetro)', lat: -22.8895, lng: -43.2065, congestionWeight: 0.85, extraDelayMin: -6 },
            { id: 'vao-central', label: 'Vão Central (Baía de Guanabara)', lat: -22.8715, lng: -43.1535, congestionWeight: 1.0, extraDelayMin: 0 },
            { id: 'mocangue', label: 'Ilha de Mocanguê / Grande Reta', lat: -22.8725, lng: -43.1335, congestionWeight: 1.05, extraDelayMin: 2 },
            { id: 'pedagio-niteroi', label: 'Praça do Pedágio / Niterói', lat: -22.8735, lng: -43.1120, congestionWeight: 1.1, extraDelayMin: 3 }
        ]
    }
};

const DESTINATION_PRESETS_BY_REGION = {
    RJ: [
        { id: 'projac', label: 'Estúdios Globo (Jacarepaguá)', address: 'Estrada dos Bandeirantes, 6700 - Curicica, Rio de Janeiro', lat: -22.9571, lng: -43.4048 },
        { id: 'globo-jb', label: 'Globo Jardim Botânico', address: 'Rua Lopes Quintas, 303 - Jardim Botânico, Rio de Janeiro', lat: -22.9619, lng: -43.2165 },
        { id: 'galeao', label: 'Aeroporto Galeão (GIG)', address: 'Aeroporto Internacional do Galeão, Rio de Janeiro', lat: -22.8099, lng: -43.2505 },
        { id: 'sdu', label: 'Aeroporto Santos Dumont (SDU)', address: 'Praça Senador Salgado Filho, Centro, Rio de Janeiro', lat: -22.9105, lng: -43.1631 },
        { id: 'cidade-nova', label: 'Centro / Cidade Nova (COR-Rio)', address: 'Rua Beatriz Larragoiti Lucas, Cidade Nova, Rio de Janeiro', lat: -22.9083, lng: -43.2028 },
        { id: 'barrashopping', label: 'BarraShopping / Alvorada', address: 'Av. das Américas, 4666 - Barra da Tijuca, Rio de Janeiro', lat: -22.9985, lng: -43.3568 }
    ],
    SP: [
        { id: 'globo-sp', label: 'Globo São Paulo (Brooklin)', address: 'Av. Chucri Zaidan - Vila Cordeiro, São Paulo', lat: -23.6225, lng: -46.6989 },
        { id: 'congonhas', label: 'Aeroporto Congonhas (CGH)', address: 'Av. Washington Luís - Vila Congonhas, São Paulo', lat: -23.6261, lng: -46.6564 },
        { id: 'gru', label: 'Aeroporto Guarulhos (GRU)', address: 'Rod. Hélio Smidt - Cumbica, Guarulhos', lat: -23.4356, lng: -46.4731 }
    ],
    BH: [
        { id: 'globo-mg', label: 'Globo Minas (Belo Horizonte)', address: 'Av. Américo Vespúcio, Belo Horizonte', lat: -19.8975, lng: -43.9522 },
        { id: 'praca-sete', label: 'Centro / Praça Sete', address: 'Praça Sete de Setembro, Centro, Belo Horizonte', lat: -19.9191, lng: -43.9386 }
    ],
    BSB: [
        { id: 'globo-bsb', label: 'Globo Brasília (Setor Rádio e TV)', address: 'SRTVN Quadra 701, Asa Norte, Brasília', lat: -15.7867, lng: -47.8878 },
        { id: 'aero-bsb', label: 'Aeroporto Internacional de Brasília', address: 'Lago Sul, Brasília', lat: -15.8711, lng: -47.9186 }
    ],
    REC: [
        { id: 'globo-pe', label: 'Globo Nordeste (Santo Amaro)', address: 'Rua Capitão Lima, Santo Amaro, Recife', lat: -8.0468, lng: -34.8772 },
        { id: 'aero-rec', label: 'Aeroporto do Recife (REC)', address: 'Praça Ministro Salgado Filho, Imbiribeira, Recife', lat: -8.1264, lng: -34.9236 }
    ]
};

const REGION_CITY_UF = {
    RJ: { city: 'Rio de Janeiro', uf: 'RJ' },
    SP: { city: 'São Paulo', uf: 'SP' },
    BH: { city: 'Belo Horizonte', uf: 'MG' },
    BSB: { city: 'Brasília', uf: 'DF' },
    REC: { city: 'Recife', uf: 'PE' }
};

function buildFallbackSegments(corridor) {
    const pts = Array.isArray(corridor.coordinates) && corridor.coordinates.length > 0
        ? corridor.coordinates
        : (Array.isArray(corridor.geometry) && corridor.geometry.length > 0 ? corridor.geometry : []);
    const first = pts[0] || (corridor.pinLocation ? [corridor.pinLocation.lat, corridor.pinLocation.lng] : [-22.9068, -43.1729]);
    const mid = pts[Math.floor(pts.length / 2)] || first;
    const last = pts[pts.length - 1] || mid;

    const trechoCriticoLabel = String(corridor.trechoCritico || '').trim() || `Trecho Central — ${corridor.via}`;
    const trechos = [
        { id: 'inicio', label: `Início — ${corridor.via}`, lat: Number(first[0]), lng: Number(first[1]), congestionWeight: 0.9, extraDelayMin: 0 },
        { id: 'principal', label: trechoCriticoLabel, lat: Number(mid[0]), lng: Number(mid[1]), congestionWeight: 1.0, extraDelayMin: 0 },
        { id: 'extremo', label: `Extremo Op. — ${corridor.via}`, lat: Number(last[0]), lng: Number(last[1]), congestionWeight: 0.9, extraDelayMin: 0 }
    ];

    const sentidoCritico = /sentido\s+([^,;]+)/i.exec(trechoCriticoLabel);
    const dirLabelA = sentidoCritico ? `Sentido ${sentidoCritico[1].trim()}` : 'Sentido Principal (Centro)';
    const dirLabelB = 'Sentido Oposto (Bairro / Saída)';

    return {
        sentidoPadrao: 'principal',
        trechoPadrao: 'principal',
        sentidos: [
            { id: 'principal', label: dirLabelA, factor: 1.0, primaryDirection: true },
            { id: 'oposto', label: dirLabelB, factor: 0.75, primaryDirection: false }
        ],
        trechos
    };
}

/**
 * Enriquece cada corredor com `trechos` (pontos de partida georreferenciados) e `sentidos` (fluxos).
 * @param {object} corridor
 * @param {string} region
 * @returns {object}
 */
function enrichCorridorWithSegments(corridor, region = 'RJ') {
    const key = normalizeCorridorKey(corridor.via || corridor.name);
    const isRJ = String(region || 'RJ').toUpperCase() === 'RJ';
    const catalog = isRJ && RJ_CORRIDOR_SEGMENTS[key]
        ? RJ_CORRIDOR_SEGMENTS[key]
        : (corridor.trechos && corridor.sentidos
            ? {
                trechoPadrao: corridor.trechoPadrao || corridor.trechos[0]?.id,
                sentidoPadrao: corridor.sentidoPadrao || corridor.sentidos[0]?.id,
                trechos: corridor.trechos,
                sentidos: corridor.sentidos
            }
            : buildFallbackSegments(corridor));

    return {
        ...corridor,
        trechoPadrao: corridor.trechoPadrao || catalog.trechoPadrao,
        sentidoPadrao: corridor.sentidoPadrao || catalog.sentidoPadrao,
        trechos: catalog.trechos.map(t => ({ ...t })),
        sentidos: catalog.sentidos.map(s => ({ ...s }))
    };
}

/**
 * Resolve os dados locais do corredor após a escolha de trecho e sentido pelo operador.
 * @param {object} corridor
 * @param {string} region
 * @param {string} [trechoId]
 * @param {string} [sentidoId]
 */
function resolveSegmentSelection(corridor, region = 'RJ', trechoId = null, sentidoId = null) {
    const enriched = enrichCorridorWithSegments(corridor, region);
    const trecho = enriched.trechos.find(t => t.id === trechoId)
        || enriched.trechos.find(t => t.id === enriched.trechoPadrao)
        || enriched.trechos[0];
    const sentido = enriched.sentidos.find(s => s.id === sentidoId)
        || enriched.sentidos.find(s => s.id === enriched.sentidoPadrao)
        || enriched.sentidos[0];

    const baseRet = Number(enriched.retencaoMin || 0);
    const baseSpeed = Number(enriched.velocidadeAtualKmH || enriched.velocidadePadraoKmH || 50);
    const stdSpeed = Number(enriched.velocidadePadraoKmH || Math.max(baseSpeed, 60));

    let adjustedRet = baseRet;
    if (baseRet > 0) {
        const scaled = Math.round(baseRet * Number(trecho?.congestionWeight ?? 1) * Number(sentido?.factor ?? 1))
            + Number(trecho?.extraDelayMin || 0);
        adjustedRet = Math.max(1, Math.min(90, scaled));
    } else if (Number(trecho?.extraDelayMin || 0) > 0) {
        adjustedRet = Math.max(0, Number(trecho.extraDelayMin));
    }

    let adjustedSpeed = baseSpeed;
    if (baseRet > 0 && stdSpeed > baseSpeed) {
        const retRatio = baseRet > 0 ? Math.min(1.35, adjustedRet / baseRet) : 1;
        const speedDrop = (stdSpeed - baseSpeed) * retRatio;
        adjustedSpeed = Math.round(Math.max(8, Math.min(stdSpeed, stdSpeed - speedDrop)));
    }

    let adjustedStatus = enriched.status || 'Normal';
    if (baseRet === 0 && adjustedRet === 0) {
        adjustedStatus = 'Normal';
    } else if (adjustedRet >= 30) {
        adjustedStatus = 'Crítico';
    } else if (adjustedRet >= 15) {
        adjustedStatus = 'Lento';
    } else if (adjustedRet >= 5) {
        adjustedStatus = 'Moderado';
    } else {
        adjustedStatus = 'Normal';
    }

    return {
        corridor: enriched,
        trecho,
        sentido,
        origin: {
            lat: Number(trecho.lat),
            lng: Number(trecho.lng),
            label: `${enriched.via} — ${trecho.label} (${sentido.label})`
        },
        adjustedRetencaoMin: adjustedRet,
        adjustedSpeedKmH: adjustedSpeed,
        adjustedStatus,
        adjustedDiferenca: adjustedRet > 0 ? `+${adjustedRet} min` : '0 min'
    };
}

/**
 * Gera links consultivos oficiais para Google Maps e Waze a partir das coordenadas de trecho -> destino.
 */
function buildMapLinks(originLat, originLng, destLat, destLng) {
    const oLat = Number(originLat).toFixed(6);
    const oLng = Number(originLng).toFixed(6);
    const dLat = Number(destLat).toFixed(6);
    const dLng = Number(destLng).toFixed(6);

    return {
        googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${oLat},${oLng}&destination=${dLat},${dLng}&travelmode=driving`,
        wazeLiveMapUrl: `https://www.waze.com/live-map/directions?to=ll.${dLat}%2C${dLng}&from=ll.${oLat}%2C${oLng}`,
        wazeAppUrl: `https://www.waze.com/ul?ll=${dLat}%2C${dLng}&from=${oLat}%2C${oLng}&navigate=yes`
    };
}

/**
 * Decodificador padrão de Polyline Google Maps (precisão 1e-5) para array [[lat, lng]].
 */
function decodePolyline(encoded) {
    if (!encoded || typeof encoded !== 'string') return [];
    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let b;
        let shift = 0;
        let result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20 && index < encoded.length);
        const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20 && index < encoded.length);
        const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
        lng += dlng;

        points.push([Number((lat / 1e5).toFixed(5)), Number((lng / 1e5).toFixed(5))]);
    }
    return points;
}

function parseGoogleDurationSeconds(durationStr) {
    if (typeof durationStr === 'number' && Number.isFinite(durationStr)) return durationStr;
    const match = /^([0-9]+(?:\.[0-9]+)?)s$/i.exec(String(durationStr || '').trim());
    return match ? Number(match[1]) : null;
}

function getFetchFn(customFetch) {
    if (typeof customFetch === 'function') return customFetch;
    if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
    // Fallback para Node < 18 via node-fetch
    // eslint-disable-next-line global-require
    return require('node-fetch');
}

function resolveProviderSettings(env = process.env) {
    const baseCfg = loadConfig(env);
    const googleApiKey = String(env.GOOGLE_ROUTES_API_KEY || env.GOOGLE_MAPS_API_KEY || baseCfg.google?.apiKey || '').trim();
    const googleExplicit = env.GOOGLE_ROUTES_ENABLED;
    const googleEnabled = Boolean(googleApiKey) && String(googleExplicit || 'true').toLowerCase() !== 'false';

    const tomtomApiKey = String(env.TOMTOM_API_KEY || baseCfg.tomtom?.apiKey || '').trim();
    const tomtomExplicit = env.TOMTOM_ORBIS_ENABLED;
    const tomtomEnabled = Boolean(tomtomApiKey) && String(tomtomExplicit || 'true').toLowerCase() !== 'false';

    return {
        google: {
            enabled: googleEnabled,
            apiKey: googleApiKey,
            baseUrl: String(env.GOOGLE_ROUTES_BASE_URL || 'https://routes.googleapis.com').replace(/\/+$/, '')
        },
        tomtom: {
            enabled: tomtomEnabled,
            apiKey: tomtomApiKey,
            baseUrl: String(env.TOMTOM_BASE_URL || baseCfg.tomtom?.baseUrl || 'https://api.tomtom.com').replace(/\/+$/, ''),
            apiVersion: baseCfg.tomtom?.apiVersion || 1
        },
        osrm: {
            baseUrl: String(env.OSRM_BASE_URL || baseCfg.osrm?.baseUrl || 'https://router.project-osrm.org').replace(/\/+$/, ''),
            minIntervalMs: Math.max(1100, Number(env.OSRM_MIN_INTERVAL_MS || baseCfg.osrm?.minIntervalMs || 1100)),
            requestTimeoutMs: Math.max(1000, Number(env.OSRM_REQUEST_TIMEOUT_MS || baseCfg.osrm?.requestTimeoutMs || 4000)),
            cacheTtlMs: Math.max(30, Number(env.OSRM_CACHE_TTL_SECONDS || baseCfg.osrm?.cacheTtlSeconds || 300)) * 1000,
            userAgent: baseCfg.osrm?.userAgent || 'AgenteRIT-TrafficAlert/1.0'
        }
    };
}

class CorridorRouteService {
    constructor(options = {}) {
        this.cache = new Map();
        this.osrmQueue = Promise.resolve();
        this.lastOsrmCallAt = 0;
        this.defaultFetch = options.fetchImpl || null;
    }

    _getCached(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }

    _setCached(key, value, ttlMs = 300000) {
        this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        if (this.cache.size > 400) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }

    async _scheduleOsrm(fn, minIntervalMs) {
        const task = this.osrmQueue.then(async () => {
            const elapsed = Date.now() - this.lastOsrmCallAt;
            if (elapsed < minIntervalMs) {
                await new Promise(resolve => setTimeout(resolve, minIntervalMs - elapsed));
            }
            this.lastOsrmCallAt = Date.now();
            return fn();
        });
        this.osrmQueue = task.catch(() => {});
        return task;
    }

    async _fetchJsonWithTimeout(url, init, timeoutMs, fetchFn) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetchFn(url, { ...init, signal: controller.signal });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${errText.slice(0, 180)}`);
            }
            return await res.json();
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Resolve endereço textual ou coordenadas usando o geocoder do projeto + presets locais.
     */
    async resolveDestination(destinationInput, region = 'RJ', geocodeDeps = null) {
        if (!destinationInput) return null;

        if (typeof destinationInput === 'object' && Number.isFinite(Number(destinationInput.lat)) && Number.isFinite(Number(destinationInput.lng))) {
            const lat = Number(destinationInput.lat);
            const lng = Number(destinationInput.lng);
            return {
                lat,
                lng,
                label: String(destinationInput.label || destinationInput.address || destinationInput.q || `${lat.toFixed(4)}, ${lng.toFixed(4)}`).trim(),
                address: String(destinationInput.address || destinationInput.label || destinationInput.q || '').trim(),
                source: 'coordinates'
            };
        }

        const queryText = typeof destinationInput === 'string'
            ? destinationInput.trim()
            : String(destinationInput.address || destinationInput.q || destinationInput.label || '').trim();
        if (!queryText) return null;

        const normQuery = normalizeCorridorKey(queryText);
        const upperRegion = String(region || 'RJ').toUpperCase();
        const presets = DESTINATION_PRESETS_BY_REGION[upperRegion] || [];
        const presetMatch = presets.find(p =>
            p.id === queryText || normalizeCorridorKey(p.label) === normQuery || normalizeCorridorKey(p.address) === normQuery
        );
        if (presetMatch) {
            return {
                lat: presetMatch.lat,
                lng: presetMatch.lng,
                label: presetMatch.label,
                address: presetMatch.address,
                source: 'preset_poi'
            };
        }

        // Tenta resolver via módulo server/geocode (POIs Globo, CEP, Nominatim/Photon)
        const geoMod = geocodeDeps || require('../../geocode');
        if (typeof geoMod.buscarPoisLocais === 'function') {
            const localHits = geoMod.buscarPoisLocais(queryText);
            if (Array.isArray(localHits) && localHits.length > 0) {
                return {
                    lat: Number(localHits[0].lat),
                    lng: Number(localHits[0].lon),
                    label: localHits[0].label || queryText,
                    address: localHits[0].endereco || queryText,
                    source: 'globo_poi'
                };
            }
        }

        const cepDigits = queryText.replace(/\D/g, '');
        if (cepDigits.length === 8 && typeof geoMod.resolverCep === 'function') {
            const cepGeo = await geoMod.resolverCep(queryText).catch(() => null);
            if (cepGeo && Number.isFinite(Number(cepGeo.lat)) && Number.isFinite(Number(cepGeo.lon))) {
                return {
                    lat: Number(cepGeo.lat),
                    lng: Number(cepGeo.lon),
                    label: cepGeo.endereco || queryText,
                    address: cepGeo.endereco || queryText,
                    source: 'viacep'
                };
            }
        }

        if (typeof geoMod.getGeocode === 'function') {
            const regionCity = REGION_CITY_UF[upperRegion] || REGION_CITY_UF.RJ;
            const geo = await geoMod.getGeocode(regionCity.city, regionCity.uf, queryText);
            if (geo && Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lon))) {
                return {
                    lat: Number(geo.lat),
                    lng: Number(geo.lon),
                    label: queryText,
                    address: `${queryText}, ${regionCity.city} - ${regionCity.uf}`,
                    source: geo.source || 'geocode'
                };
            }
        }

        return null;
    }

    _buildFallbackMatrixItem(origin, dest, corridorContext = {}) {
        const distKmRaw = calculateHaversineDistance(origin.lat, origin.lng, dest.lat, dest.lng);
        // Fator de tortuosidade urbana 1.32x para aproximar malha viária quando offline
        const distanceKm = Number(Math.max(0.4, distKmRaw * 1.32).toFixed(1));
        const nominalSpeed = Math.max(25, Number(corridorContext.velocidadePadraoKmH || 48));
        const baseDurationMin = Math.max(2, Math.round((distanceKm / nominalSpeed) * 60));
        const corridorRetention = Math.max(0, Number(corridorContext.adjustedRetencaoMin || 0));

        return {
            distanceKm,
            baseDurationMin,
            trafficDelayMin: corridorRetention,
            estimatedTotalMin: baseDurationMin + corridorRetention,
            trafficAwareness: TRAFFIC_AWARENESS.NOT_AVAILABLE,
            estimationMode: 'HAVERSINE_PLUS_CORRIDOR_RETENTION',
            providerCode: 'HAVERSINE_CORRIDOR',
            providerLabel: 'Estimativa Viária + Retenção COR/CET (Fallback)',
            isEstimatedFallback: true,
            routeCoordinates: [[origin.lat, origin.lng], [dest.lat, dest.lng]]
        };
    }

    async _queryGoogleSingleRoute(origin, dest, settings, fetchFn) {
        const url = `${settings.google.baseUrl}/directions/v2:computeRoutes`;
        const body = {
            origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
            destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
            languageCode: 'pt-BR',
            units: 'METRIC'
        };
        const data = await this._fetchJsonWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': settings.google.apiKey,
                'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline'
            },
            body: JSON.stringify(body)
        }, 5000, fetchFn);

        const route = Array.isArray(data?.routes) ? data.routes[0] : null;
        if (!route) throw new Error('Google Routes returned empty routes');

        const durSec = parseGoogleDurationSeconds(route.duration) || 60;
        const staticSec = parseGoogleDurationSeconds(route.staticDuration) || durSec;
        const estimatedTotalMin = Math.max(1, Math.round(durSec / 60));
        const baseDurationMin = Math.max(1, Math.round(staticSec / 60));
        const trafficDelayMin = Math.max(0, estimatedTotalMin - baseDurationMin);
        const distanceKm = Number((Number(route.distanceMeters || 0) / 1000).toFixed(1));

        return {
            distanceKm,
            baseDurationMin,
            trafficDelayMin,
            estimatedTotalMin,
            trafficAwareness: TRAFFIC_AWARENESS.REAL_TIME,
            estimationMode: 'GOOGLE_ROUTES_TRAFFIC',
            providerCode: 'GOOGLE_ROUTES_TRAFFIC',
            providerLabel: 'Google Maps Routes (Trânsito Real)',
            isEstimatedFallback: false,
            routeCoordinates: decodePolyline(route.polyline?.encodedPolyline)
        };
    }

    async _queryGoogleRouteMatrix(origins, dest, settings, fetchFn) {
        const url = `${settings.google.baseUrl}/distanceMatrix/v2:computeRouteMatrix`;
        const body = {
            origins: origins.map(o => ({
                waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } }
            })),
            destinations: [
                { waypoint: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } } }
            ],
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
            languageCode: 'pt-BR',
            units: 'METRIC'
        };

        const rows = await this._fetchJsonWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': settings.google.apiKey,
                'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,staticDuration,distanceMeters,status,condition'
            },
            body: JSON.stringify(body)
        }, 6000, fetchFn);

        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error('Google RouteMatrix returned empty');
        }

        const results = new Array(origins.length).fill(null);
        for (const row of rows) {
            const idx = Number(row.originIndex);
            if (!Number.isInteger(idx) || idx < 0 || idx >= origins.length) continue;
            if (row.condition && row.condition !== 'ROUTE_EXISTS') continue;

            const durSec = parseGoogleDurationSeconds(row.duration);
            if (!durSec) continue;
            const staticSec = parseGoogleDurationSeconds(row.staticDuration) || durSec;
            const estimatedTotalMin = Math.max(1, Math.round(durSec / 60));
            const baseDurationMin = Math.max(1, Math.round(staticSec / 60));
            const trafficDelayMin = Math.max(0, estimatedTotalMin - baseDurationMin);
            const distanceKm = Number((Number(row.distanceMeters || 0) / 1000).toFixed(1));

            results[idx] = {
                distanceKm,
                baseDurationMin,
                trafficDelayMin,
                estimatedTotalMin,
                trafficAwareness: TRAFFIC_AWARENESS.REAL_TIME,
                estimationMode: 'GOOGLE_ROUTES_TRAFFIC',
                providerCode: 'GOOGLE_ROUTES_TRAFFIC',
                providerLabel: 'Google Maps Routes (Trânsito Real)',
                isEstimatedFallback: false
            };
        }
        return results;
    }

    async _queryTomTomSingleRoute(origin, dest, settings, fetchFn) {
        const url = `${settings.tomtom.baseUrl}/routing/1/calculateRoute/${origin.lat},${origin.lng}:${dest.lat},${dest.lng}/json?traffic=true&travelMode=car&routeType=fastest&key=${encodeURIComponent(settings.tomtom.apiKey)}`;
        const data = await this._fetchJsonWithTimeout(url, { method: 'GET' }, 5000, fetchFn);
        const route = Array.isArray(data?.routes) ? data.routes[0] : null;
        const summary = route?.summary;
        if (!summary) throw new Error('TomTom Routing returned empty summary');

        const travelSec = Number(summary.travelTimeInSeconds || 0);
        const noTrafficSec = Number(summary.noTrafficTravelTimeInSeconds || travelSec);
        const estimatedTotalMin = Math.max(1, Math.round(travelSec / 60));
        const baseDurationMin = Math.max(1, Math.round(noTrafficSec / 60));
        const delaySec = Number(summary.trafficDelayInSeconds);
        const trafficDelayMin = Number.isFinite(delaySec)
            ? Math.max(0, Math.round(delaySec / 60))
            : Math.max(0, estimatedTotalMin - baseDurationMin);
        const distanceKm = Number((Number(summary.lengthInMeters || 0) / 1000).toFixed(1));
        const points = route?.legs?.[0]?.points;
        const routeCoordinates = Array.isArray(points)
            ? points.map(p => [Number(p.latitude), Number(p.longitude)])
            : [];

        return {
            distanceKm,
            baseDurationMin,
            trafficDelayMin,
            estimatedTotalMin,
            trafficAwareness: TRAFFIC_AWARENESS.REAL_TIME,
            estimationMode: 'TOMTOM_TRAFFIC',
            providerCode: 'TOMTOM_TRAFFIC',
            providerLabel: 'TomTom Traffic (Trânsito Real)',
            isEstimatedFallback: false,
            routeCoordinates
        };
    }

    async _queryOsrmSingleRoute(origin, dest, settings, fetchFn) {
        const cacheKey = `osrm-single:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
        const cached = this._getCached(cacheKey);
        if (cached) return cached;

        const url = `${settings.osrm.baseUrl}/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
        const data = await this._scheduleOsrm(
            () => this._fetchJsonWithTimeout(
                url,
                { method: 'GET', headers: { 'User-Agent': settings.osrm.userAgent } },
                settings.osrm.requestTimeoutMs,
                fetchFn
            ),
            settings.osrm.minIntervalMs
        );

        const route = Array.isArray(data?.routes) ? data.routes[0] : null;
        if (!route) throw new Error('OSRM returned no routes');

        const baseDurationMin = Math.max(1, Math.round(Number(route.duration || 0) / 60));
        const distanceKm = Number((Number(route.distance || 0) / 1000).toFixed(1));
        const rawCoords = Array.isArray(route.geometry?.coordinates) ? route.geometry.coordinates : [];
        const routeCoordinates = rawCoords.map(c => [Number(c[1]), Number(c[0])]);

        const result = { distanceKm, baseDurationMin, routeCoordinates };
        this._setCached(cacheKey, result, settings.osrm.cacheTtlMs);
        return result;
    }

    async _queryOsrmTable(origins, dest, settings, fetchFn) {
        const sigOrigins = origins.map(o => `${o.lat.toFixed(4)},${o.lng.toFixed(4)}`).join('|');
        const cacheKey = `osrm-table:${sigOrigins}->${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
        const cached = this._getCached(cacheKey);
        if (cached) return cached;

        const coordParts = [
            ...origins.map(o => `${o.lng},${o.lat}`),
            `${dest.lng},${dest.lat}`
        ];
        const destIndex = origins.length;
        const sourceIndices = origins.map((_, i) => i).join(';');
        const url = `${settings.osrm.baseUrl}/table/v1/driving/${coordParts.join(';')}?sources=${sourceIndices}&destinations=${destIndex}&annotations=duration,distance`;

        const data = await this._scheduleOsrm(
            () => this._fetchJsonWithTimeout(
                url,
                { method: 'GET', headers: { 'User-Agent': settings.osrm.userAgent } },
                settings.osrm.requestTimeoutMs,
                fetchFn
            ),
            settings.osrm.minIntervalMs
        );

        if (data?.code !== 'Ok' || !Array.isArray(data.durations)) {
            throw new Error(`OSRM table failed: ${data?.code || 'unknown'}`);
        }

        const mapped = origins.map((_, idx) => {
            const durSec = data.durations?.[idx]?.[0];
            const distM = data.distances?.[idx]?.[0];
            if (!Number.isFinite(durSec) || durSec === null) return null;
            return {
                baseDurationMin: Math.max(1, Math.round(durSec / 60)),
                distanceKm: Number((Number(distM || 0) / 1000).toFixed(1))
            };
        });

        this._setCached(cacheKey, mapped, settings.osrm.cacheTtlMs);
        return mapped;
    }

    _combineOsrmWithCorridorDelay(osrmItem, corridorContext = {}) {
        const corridorRetention = Math.max(0, Number(corridorContext.adjustedRetencaoMin || 0));
        const baseDurationMin = Math.max(1, Number(osrmItem.baseDurationMin || 1));
        return {
            distanceKm: osrmItem.distanceKm,
            baseDurationMin,
            trafficDelayMin: corridorRetention,
            estimatedTotalMin: baseDurationMin + corridorRetention,
            trafficAwareness: TRAFFIC_AWARENESS.NOT_AVAILABLE,
            estimationMode: 'OSRM_PLUS_CORRIDOR_RETENTION',
            providerCode: 'OSRM_CORRIDOR',
            providerLabel: 'OSRM (Malha Viária) + Retenção COR/CET',
            isEstimatedFallback: true,
            routeCoordinates: osrmItem.routeCoordinates || []
        };
    }

    /**
     * Calcula rota e tempo estimado de deslocamento entre uma origem (trecho) e um destino.
     */
    async estimateSingleRoute({
        origin,
        destination,
        corridorContext = {},
        env = process.env,
        fetchImpl = null,
        disableExternalFetch = false
    }) {
        const settings = resolveProviderSettings(env);
        const fetchFn = getFetchFn(fetchImpl || this.defaultFetch);
        const links = buildMapLinks(origin.lat, origin.lng, destination.lat, destination.lng);

        if (disableExternalFetch) {
            return {
                origin,
                destination,
                ...this._buildFallbackMatrixItem(origin, destination, corridorContext),
                links
            };
        }

        const cacheKey = `single:${settings.google.enabled ? 'G' : settings.tomtom.enabled ? 'T' : 'O'}:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
        const cached = this._getCached(cacheKey);
        if (cached) {
            if (cached.trafficAwareness === TRAFFIC_AWARENESS.REAL_TIME) {
                return { origin, destination, ...cached, links };
            }
            return {
                origin,
                destination,
                ...this._combineOsrmWithCorridorDelay(cached, corridorContext),
                links
            };
        }

        if (settings.google.enabled) {
            try {
                const googleResult = await this._queryGoogleSingleRoute(origin, destination, settings, fetchFn);
                this._setCached(cacheKey, googleResult, 120000);
                return { origin, destination, ...googleResult, links };
            } catch (err) {
                console.warn('[CorridorRouteService] Google Routes falhou, aplicando fallback:', err.message);
            }
        }

        if (settings.tomtom.enabled) {
            try {
                const tomtomResult = await this._queryTomTomSingleRoute(origin, destination, settings, fetchFn);
                this._setCached(cacheKey, tomtomResult, 120000);
                return { origin, destination, ...tomtomResult, links };
            } catch (err) {
                console.warn('[CorridorRouteService] TomTom Routing falhou, aplicando fallback:', err.message);
            }
        }

        try {
            const osrmRaw = await this._queryOsrmSingleRoute(origin, destination, settings, fetchFn);
            this._setCached(cacheKey, osrmRaw, settings.osrm.cacheTtlMs);
            return {
                origin,
                destination,
                ...this._combineOsrmWithCorridorDelay(osrmRaw, corridorContext),
                links
            };
        } catch (err) {
            console.warn('[CorridorRouteService] OSRM single route falhou, aplicando fallback Haversine:', err.message);
            return {
                origin,
                destination,
                ...this._buildFallbackMatrixItem(origin, destination, corridorContext),
                links
            };
        }
    }

    /**
     * Calcula tempos de deslocamento de todas as vias (usando trecho e sentido escolhidos por via) até um destino.
     */
    async estimateCorridorsToDestination({
        corridors = [],
        region = 'RJ',
        destination,
        selections = {},
        focusVia = null,
        env = process.env,
        fetchImpl = null,
        disableExternalFetch = false
    }) {
        const settings = resolveProviderSettings(env);
        const fetchFn = getFetchFn(fetchImpl || this.defaultFetch);

        const selectionList = Array.isArray(selections)
            ? selections.reduce((acc, s) => {
                if (s && s.via) acc[normalizeCorridorKey(s.via)] = s;
                return acc;
            }, {})
            : Object.entries(selections || {}).reduce((acc, [k, v]) => {
                acc[normalizeCorridorKey(k)] = v;
                return acc;
            }, {});

        const resolvedCorridors = corridors.map(c => {
            const key = normalizeCorridorKey(c.via || c.name);
            const sel = selectionList[key] || selections?.[c.via] || {};
            return resolveSegmentSelection(c, region, sel.trechoId, sel.sentidoId);
        });

        if (resolvedCorridors.length === 0) {
            return {
                destination,
                providerCode: 'NONE',
                providerLabel: 'Sem corredores',
                trafficAwareness: TRAFFIC_AWARENESS.NOT_AVAILABLE,
                isEstimatedFallback: true,
                items: []
            };
        }

        const origins = resolvedCorridors.map(rc => rc.origin);
        let matrixResults = null;

        if (!disableExternalFetch) {
            if (settings.google.enabled) {
                try {
                    matrixResults = await this._queryGoogleRouteMatrix(origins, destination, settings, fetchFn);
                } catch (err) {
                    console.warn('[CorridorRouteService] Google RouteMatrix falhou, tentando fallback:', err.message);
                }
            }

            if (!matrixResults && settings.tomtom.enabled) {
                try {
                    matrixResults = await Promise.all(
                        origins.map(o => this._queryTomTomSingleRoute(o, destination, settings, fetchFn).catch(() => null))
                    );
                    if (!matrixResults.some(Boolean)) matrixResults = null;
                } catch (err) {
                    console.warn('[CorridorRouteService] TomTom batch falhou:', err.message);
                }
            }

            if (!matrixResults) {
                try {
                    const osrmTable = await this._queryOsrmTable(origins, destination, settings, fetchFn);
                    matrixResults = osrmTable.map((item, idx) =>
                        item ? this._combineOsrmWithCorridorDelay(item, resolvedCorridors[idx]) : null
                    );
                } catch (err) {
                    console.warn('[CorridorRouteService] OSRM table falhou, usando fallback Haversine:', err.message);
                }
            }
        }

        const focusKey = focusVia ? normalizeCorridorKey(focusVia) : normalizeCorridorKey(resolvedCorridors[0].corridor.via);
        let focusedPolyline = null;
        const focusIdx = resolvedCorridors.findIndex(rc => normalizeCorridorKey(rc.corridor.via) === focusKey);

        if (!disableExternalFetch && focusIdx >= 0) {
            const focusEntry = matrixResults?.[focusIdx];
            if (focusEntry && Array.isArray(focusEntry.routeCoordinates) && focusEntry.routeCoordinates.length > 1) {
                focusedPolyline = focusEntry.routeCoordinates;
            } else {
                const focusSingle = await this.estimateSingleRoute({
                    origin: origins[focusIdx],
                    destination,
                    corridorContext: resolvedCorridors[focusIdx],
                    env,
                    fetchImpl: fetchFn,
                    disableExternalFetch: false
                }).catch(() => null);
                if (focusSingle) {
                    if (!matrixResults) matrixResults = new Array(resolvedCorridors.length).fill(null);
                    matrixResults[focusIdx] = focusSingle;
                    focusedPolyline = focusSingle.routeCoordinates || null;
                }
            }
        }

        const items = resolvedCorridors.map((rc, idx) => {
            const computed = matrixResults?.[idx] || this._buildFallbackMatrixItem(rc.origin, destination, rc);
            const links = buildMapLinks(rc.origin.lat, rc.origin.lng, destination.lat, destination.lng);
            return {
                via: rc.corridor.via,
                trechoId: rc.trecho.id,
                trechoLabel: rc.trecho.label,
                sentidoId: rc.sentido.id,
                sentidoLabel: rc.sentido.label,
                origin: rc.origin,
                adjustedStatus: rc.adjustedStatus,
                adjustedRetencaoMin: rc.adjustedRetencaoMin,
                adjustedSpeedKmH: rc.adjustedSpeedKmH,
                adjustedDiferenca: rc.adjustedDiferenca,
                distanceKm: computed.distanceKm,
                baseDurationMin: computed.baseDurationMin,
                trafficDelayMin: computed.trafficDelayMin,
                estimatedTotalMin: computed.estimatedTotalMin,
                trafficAwareness: computed.trafficAwareness,
                estimationMode: computed.estimationMode,
                providerCode: computed.providerCode,
                providerLabel: computed.providerLabel,
                isEstimatedFallback: Boolean(computed.isEstimatedFallback),
                routeCoordinates: idx === focusIdx ? (focusedPolyline || computed.routeCoordinates || null) : undefined,
                links
            };
        });

        const primaryItem = items[focusIdx >= 0 ? focusIdx : 0] || items[0];
        return {
            destination,
            providerCode: primaryItem.providerCode,
            providerLabel: primaryItem.providerLabel,
            trafficAwareness: primaryItem.trafficAwareness,
            isEstimatedFallback: primaryItem.isEstimatedFallback,
            liveProvidersConfigured: {
                googleRoutes: settings.google.enabled,
                tomtomTraffic: settings.tomtom.enabled
            },
            items
        };
    }
}

const defaultCorridorRouteService = new CorridorRouteService();

module.exports = {
    RJ_CORRIDOR_SEGMENTS,
    DESTINATION_PRESETS_BY_REGION,
    normalizeCorridorKey,
    enrichCorridorWithSegments,
    resolveSegmentSelection,
    buildMapLinks,
    decodePolyline,
    resolveProviderSettings,
    CorridorRouteService,
    defaultCorridorRouteService
};
