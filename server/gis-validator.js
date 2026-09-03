/**
 * Módulo Especializado de Validação Geoespacial (GIS), Detecção de Corpos Hídricos
 * e Snap-To-Road / Map Matching - Agente RIT / CCO
 * Homologado para Operação Crítica Rock in Rio e Toda a Malha Viária do RJ
 */

// 1. Polígonos Georreferenciados dos Corpos Hídricos do Rio de Janeiro (WGS84)
const WATER_BODIES = [
    {
        name: "Lagoa de Jacarepaguá e Bacia Hídrica",
        polygon: [
            [-22.9870, -43.3720],
            [-22.9980, -43.3750],
            [-22.9980, -43.3900],
            [-22.9920, -43.3980],
            [-22.9880, -43.3980],
            [-22.9870, -43.3880],
            [-22.9860, -43.3780]
        ]
    },
    {
        name: "Lagoa da Tijuca (Canal e Bacia Central)",
        polygon: [
            [-22.9950, -43.3350],
            [-23.0030, -43.3300],
            [-23.0080, -43.3320],
            [-23.0080, -43.3420],
            [-22.9970, -43.3450]
        ]
    },
    {
        name: "Lagoa de Marapendi (Espelho D'Água)",
        polygon: [
            [-23.0080, -43.3750],
            [-23.0110, -43.4200],
            [-23.0160, -43.4600],
            [-23.0200, -43.4600],
            [-23.0150, -43.4200],
            [-23.0120, -43.3750]
        ]
    },
    {
        name: "Lagoa de Camorim (Espelho D'Água)",
        polygon: [
            [-22.9790, -43.4020],
            [-22.9820, -43.4150],
            [-22.9870, -43.4150],
            [-22.9860, -43.4020]
        ]
    },
    {
        name: "Lagoa Rodrigo de Freitas (Espelho D'Água)",
        polygon: [
            [-22.9670, -43.2080],
            [-22.9690, -43.2020],
            [-22.9750, -43.2020],
            [-22.9770, -43.2080],
            [-22.9750, -43.2160],
            [-22.9690, -43.2160]
        ]
    },
    {
        name: "Baía de Guanabara (Espelho D'Água Aberto)",
        polygon: [
            [-22.8600, -43.2000],
            [-22.8600, -43.1400],
            [-22.9150, -43.1400],
            [-22.9150, -43.1630],
            [-22.8950, -43.1700],
            [-22.8800, -43.1950]
        ]
    },
    {
        name: "Enseada de Botafogo (Espelho D'Água Aberto)",
        polygon: [
            [-22.9420, -43.1750],
            [-22.9420, -43.1650],
            [-22.9520, -43.1680],
            [-22.9520, -43.1780]
        ]
    }
];

// 2. Corredores Críticos e Eixos Viários Homologados (WGS84)
const ROAD_CORRIDORS = {
    // === LOTE 1: ROCK IN RIO / BARRA OLÍMPICA / TRANSOLÍMPICA ===
    "AYRTON SENNA": [
        { lat: -22.9535, lon: -43.3642, ref: "Linha Amarela x Av. Ayrton Senna (Saída)" },
        { lat: -22.9582, lon: -43.3650, ref: "Av. Ayrton Senna prox. Via Parque / Gardênia Azul" },
        { lat: -22.9640, lon: -43.3658, ref: "Av. Ayrton Senna x Acesso Av. Abelardo Bueno" },
        { lat: -22.9715, lon: -43.3664, ref: "Av. Ayrton Senna, 5850 / Espaço Hall / Barra D'Or" },
        { lat: -22.9760, lon: -43.3665, ref: "Av. Ayrton Senna, alt. SESC Barra / Aerotown" },
        { lat: -22.9790, lon: -43.3668, ref: "Av. Ayrton Senna x BarraShopping / Passarela" },
        { lat: -22.9865, lon: -43.3665, ref: "Av. Ayrton Senna prox. Bosque da Barra" },
        { lat: -22.9930, lon: -43.3658, ref: "Av. Ayrton Senna x Ponte Ayrton Senna" },
        { lat: -23.0003, lon: -43.3655, ref: "Av. Ayrton Senna x Av. das Américas (Cebolão / Alvorada)" }
    ],
    "ABELARDO BUENO": [
        { lat: -22.9645, lon: -43.3670, ref: "Av. Abelardo Bueno x Av. Ayrton Senna (Trevo)" },
        { lat: -22.9680, lon: -43.3700, ref: "Av. Abelardo Bueno, alt. 523" },
        { lat: -22.9702, lon: -43.3725, ref: "Av. Abelardo Bueno x Shopping Metropolitano" },
        { lat: -22.9738, lon: -43.3768, ref: "Av. Abelardo Bueno, alt. 1500 / Centro Empresarial" },
        { lat: -22.9782, lon: -43.3765, ref: "Av. Abelardo Bueno x Parque Olímpico (Portão Principal / 3600)" },
        { lat: -22.9770, lon: -43.3820, ref: "Av. Abelardo Bueno x Arena Jeunesse / Jorge Faraj" },
        { lat: -22.9780, lon: -43.3880, ref: "Av. Abelardo Bueno x Estação BRT Rio 2" },
        { lat: -22.9820, lon: -43.3940, ref: "Av. Abelardo Bueno x Av. Salvador Allende (Entroncamento)" }
    ],
    "SALVADOR ALLENDE": [
        { lat: -22.9715, lon: -43.4110, ref: "Av. Salvador Allende x Riocentro / Estação BRT Riocentro" },
        { lat: -22.9770, lon: -43.4070, ref: "Av. Salvador Allende x Acesso Cidade do Rock / Parque dos Atletas" },
        { lat: -22.9815, lon: -43.4035, ref: "Av. Salvador Allende x Acesso Ilha Pura" },
        { lat: -22.9840, lon: -43.3935, ref: "Av. Salvador Allende x Estação BRT Asa Branca" },
        { lat: -22.9858, lon: -43.3995, ref: "Av. Salvador Allende x Av. Abelardo Bueno" },
        { lat: -22.9930, lon: -43.4010, ref: "Av. Salvador Allende x Estação Morro do Outeiro" },
        { lat: -23.0035, lon: -43.4045, ref: "Av. Salvador Allende x Av. das Américas (Terminal Recreio)" }
    ],
    "TRANSOLIMPICA": [
        { lat: -22.9450, lon: -43.4150, ref: "TransOlímpica x Curicica (Pedágio / Alças)" },
        { lat: -22.9600, lon: -43.4120, ref: "TransOlímpica x Colônia / Curicica" },
        { lat: -22.9720, lon: -43.4080, ref: "TransOlímpica x Terminal Olof Palme (Cidade do Rock)" },
        { lat: -22.9860, lon: -43.4000, ref: "TransOlímpica x Av. Salvador Allende" }
    ],
    "LINHA AMARELA": [
        { lat: -22.9320, lon: -43.3280, ref: "Linha Amarela - Pedágio Covanca" },
        { lat: -22.9420, lon: -43.3450, ref: "Linha Amarela x Freguesia" },
        { lat: -22.9510, lon: -43.3600, ref: "Linha Amarela x Cidade de Deus" },
        { lat: -22.9535, lon: -43.3642, ref: "Linha Amarela x Saída Av. Ayrton Senna" }
    ],
    "DAS AMERICAS": [
        { lat: -23.0075, lon: -43.3100, ref: "Estação Metrô Jardim Oceânico x Armando Lombardi" },
        { lat: -23.0050, lon: -43.3250, ref: "Av. das Américas x Estação BRT Afrânio Costa" },
        { lat: -23.0020, lon: -43.3450, ref: "Av. das Américas x Parque das Rosas" },
        { lat: -23.0003, lon: -43.3655, ref: "Terminal Alvorada x Av. das Américas / Ayrton Senna" },
        { lat: -23.0025, lon: -43.3850, ref: "Av. das Américas x Alvear / Rio Design Barra" },
        { lat: -23.0040, lon: -43.4050, ref: "Av. das Américas x Salvador Allende / Terminal Recreio" }
    ],
    "AROAZES": [
        { lat: -22.9760, lon: -43.3810, ref: "Rua Aroazes, 300" },
        { lat: -22.9775, lon: -43.3840, ref: "Rua Aroazes, 730" },
        { lat: -22.9790, lon: -43.3870, ref: "Rua Aroazes prox. Abelardo Bueno" }
    ],
    "PEDRO CORREA": [
        { lat: -22.9700, lon: -43.3780, ref: "Estrada Cel. Pedro Corrêa x Abelardo Bueno" },
        { lat: -22.9660, lon: -43.3760, ref: "Estrada Cel. Pedro Corrêa prox. Arroio Pavuna" }
    ],

    // === LOTE 2: CORREDORES URBANOS RJ ===
    "COPACABANA": [
        { lat: -22.9640, lon: -43.1740, ref: "Av. Atlântica x Praça Almirante Júlio de Noronha (Posto 1)" },
        { lat: -22.9680, lon: -43.1810, ref: "Av. Atlântica x Rua Hilário de Gouveia (Posto 3)" },
        { lat: -22.9730, lon: -43.1870, ref: "Av. Atlântica x Rua Figueiredo de Magalhães (Posto 4)" },
        { lat: -22.9790, lon: -43.1905, ref: "Av. Atlântica x Rua Xavier da Silveira (Posto 5)" },
        { lat: -22.9850, lon: -43.1900, ref: "Av. Atlântica x Posto 6 / Forte de Copacabana" },
        { lat: -22.9710, lon: -43.1840, ref: "Av. N. Sra. de Copacabana x Rua Paula Freitas" }
    ],
    "IPANEMA": [
        { lat: -22.9860, lon: -43.1970, ref: "Av. Vieira Souto x Rua Joaquim Nabuco (Posto 7)" },
        { lat: -22.9865, lon: -43.2030, ref: "Av. Vieira Souto x Praça N. Sra. da Paz (Posto 9)" },
        { lat: -22.9870, lon: -43.2100, ref: "Av. Vieira Souto x Rua Maria Quitéria (Posto 10)" },
        { lat: -22.9840, lon: -43.2050, ref: "Rua Visconde de Pirajá x Garcia d'Ávila" }
    ],
    "LEBLON": [
        { lat: -22.9875, lon: -43.2160, ref: "Av. Delfim Moreira x Rua Bartolomeu Mitre (Posto 11)" },
        { lat: -22.9880, lon: -43.2260, ref: "Av. Delfim Moreira x Praça Atahualpa (Posto 12)" },
        { lat: -22.9840, lon: -43.2240, ref: "Av. Ataulfo de Paiva x Av. Afrânio de Melo Franco" }
    ],
    "BOTAFOGO": [
        { lat: -22.9450, lon: -43.1810, ref: "Praia de Botafogo x Rua Muniz Barreto" },
        { lat: -22.9500, lon: -43.1820, ref: "Praia de Botafogo x Rua Marquês de Abrantes" },
        { lat: -22.9540, lon: -43.1850, ref: "Praia de Botafogo x Rua Voluntários da Pátria" },
        { lat: -22.9520, lon: -43.1910, ref: "Rua São Clemente x Rua Humaitá" }
    ],
    "FLAMENGO": [
        { lat: -22.9280, lon: -43.1740, ref: "Praia do Flamengo x Rua Corrêa Dutra" },
        { lat: -22.9340, lon: -43.1750, ref: "Praia do Flamengo x Rua Almirante Tamandaré" },
        { lat: -22.9400, lon: -43.1760, ref: "Praia do Flamengo x Rua Silveira Martins" }
    ],
    "CENTRO": [
        { lat: -22.8980, lon: -43.1820, ref: "Praça Mauá / Av. Rodrigues Alves (Boulevard Olímpico)" },
        { lat: -22.9030, lon: -43.1780, ref: "Av. Rio Branco x Av. Presidente Vargas" },
        { lat: -22.9068, lon: -43.1730, ref: "Av. Rio Branco x Rua do Ouvidor" },
        { lat: -22.9100, lon: -43.1760, ref: "Praça da Cinelândia / Theatro Municipal" },
        { lat: -22.9080, lon: -43.1850, ref: "Av. Presidente Vargas x Rua Uruguaiana" }
    ],
    "CAJU": [
        { lat: -22.8830, lon: -43.2160, ref: "Av. Brasil x Rua Bela (Acesso Ponte Rio-Niterói)" },
        { lat: -22.8870, lon: -43.2100, ref: "Rua Monsenhor Manuel Gomes x Caju" }
    ],
    "LAGOA": [
        { lat: -22.9630, lon: -43.2050, ref: "Av. Epitácio Pessoa x Parque dos Patins" },
        { lat: -22.9730, lon: -43.1980, ref: "Av. Epitácio Pessoa x Corte do Cantagalo" },
        { lat: -22.9780, lon: -43.2050, ref: "Av. Borges de Medeiros x Clube Monte Líbano" },
        { lat: -22.9680, lon: -43.2200, ref: "Av. Borges de Medeiros x Parque da Catacumba" }
    ],
    "URCA": [
        { lat: -22.9510, lon: -43.1650, ref: "Av. Pasteur x Acesso Pão de Açúcar" },
        { lat: -22.9460, lon: -43.1670, ref: "Av. Portugal x Praia da Urca" }
    ],
    "SÃO CONRADO": [
        { lat: -22.9960, lon: -43.2620, ref: "Av. Prefeito Mendes de Morais x Praia de São Conrado" },
        { lat: -22.9980, lon: -43.2550, ref: "Autoestrada Lagoa-Barra x Túnel Zuzu Angel" }
    ],
    "RECREIO": [
        { lat: -23.0180, lon: -43.4650, ref: "Av. Lúcio Costa x Posto 9 (Recreio)" },
        { lat: -23.0230, lon: -43.4750, ref: "Av. Lúcio Costa x Posto 10" },
        { lat: -23.0120, lon: -43.4550, ref: "Av. das Américas x Glaucio Gil" }
    ],
    "BARRA DA TIJUCA": [
        { lat: -23.0030, lon: -43.3650, ref: "Av. Lúcio Costa x Av. Ayrton Senna (Praia)" },
        { lat: -23.0050, lon: -43.3400, ref: "Av. Lúcio Costa x Posto 5 (Barra)" },
        { lat: -23.0070, lon: -43.3150, ref: "Av. Lúcio Costa x Posto 2 (Praia do Pepê)" },
        { lat: -23.0064, lon: -43.3108, ref: "Av. Armando Lombardi x Barra Point / Metrô" }
    ],
    "ILHA DO GOVERNADOR": [
        { lat: -22.8090, lon: -43.2000, ref: "Estrada do Galeão x Acesso Aeroporto Internacional" },
        { lat: -22.8120, lon: -43.1850, ref: "Estrada da Cacuia x Hospital da Ilha" },
        { lat: -22.8030, lon: -43.1950, ref: "Praia da Bica x Jardim Guanabara" }
    ]
};

// 3. Centróides Terrestres Seguros por Bairro (sempre em terra firme)
const SAFE_LAND_CENTROIDS = {
    "Barra Olímpica": { lat: -22.9790, lon: -43.3668, ref: "Av. Ayrton Senna x BarraShopping" },
    "Barra da Tijuca": { lat: -23.0003, lon: -43.3655, ref: "Terminal Alvorada / Av. das Américas" },
    "Recreio dos Bandeirantes": { lat: -23.0120, lon: -43.4550, ref: "Av. das Américas x Glaucio Gil" },
    "Lagoa": { lat: -22.9630, lon: -43.2050, ref: "Av. Epitácio Pessoa x Parque dos Patins" },
    "Copacabana": { lat: -22.9710, lon: -43.1840, ref: "Av. N. Sra. de Copacabana" },
    "Ipanema": { lat: -22.9840, lon: -43.2050, ref: "Rua Visconde de Pirajá" },
    "Leblon": { lat: -22.9840, lon: -43.2240, ref: "Av. Ataulfo de Paiva" },
    "Botafogo": { lat: -22.9520, lon: -43.1850, ref: "Praia de Botafogo / Voluntários" },
    "Flamengo": { lat: -22.9340, lon: -43.1750, ref: "Praia do Flamengo" },
    "Glória": { lat: -22.9217, lon: -43.1764, ref: "Rua da Glória" },
    "Centro": { lat: -22.9068, lon: -43.1730, ref: "Av. Rio Branco" },
    "Caju": { lat: -22.8830, lon: -43.2160, ref: "Av. Brasil x Rua Bela" },
    "Santo Cristo": { lat: -22.8983, lon: -43.2000, ref: "Rua Santo Cristo" },
    "Urca": { lat: -22.9510, lon: -43.1650, ref: "Av. Pasteur" },
    "Galeão": { lat: -22.8090, lon: -43.2000, ref: "Estrada do Galeão" },
    "Cacuia": { lat: -22.8120, lon: -43.1850, ref: "Estrada da Cacuia" },
    "Cocotá": { lat: -22.8019, lon: -43.1850, ref: "Estrada da Cacuia / Cocotá" },
    "Ribeira": { lat: -22.8233, lon: -43.1750, ref: "Praia da Ribeira" },
    "Freguesia (Ilha)": { lat: -22.7889, lon: -43.1800, ref: "Praia da Freguesia" },
    "Tauá": { lat: -22.7950, lon: -43.1900, ref: "Estrada do Dendê" },
    "Zumbi": { lat: -22.8200, lon: -43.1800, ref: "Rua Peixoto de Carvalho" },
    "São Conrado": { lat: -22.9960, lon: -43.2620, ref: "Av. Prefeito Mendes de Morais" },
    "Curicica": { lat: -22.9567, lon: -43.3989, ref: "Estr. dos Bandeirantes x Curicica" },
    "Camorim": { lat: -22.9653, lon: -43.4183, ref: "Estrada do Camorim" }
};

// 4. Algoritmo Geodésico Haversine (em metros)
function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// 5. Ray-Casting Polygon Intersection
function pointInPolygon(point, vs) {
    const x = point[0]; // lat
    const y = point[1]; // lon

    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];

        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// 6. Teste Rigoroso de Água
function isPointInWater(lat, lon) {
    if (isNaN(lat) || isNaN(lon)) return { inWater: false, bodyName: null };
    const pt = [lat, lon];

    // Checagem em polígonos delimitados
    for (let i = 0; i < WATER_BODIES.length; i++) {
        const body = WATER_BODIES[i];
        if (pointInPolygon(pt, body.polygon)) {
            return { inWater: true, bodyName: body.name };
        }
    }

    // Regra Marítima Oceânica (Sul da linha de praia)
    if (lat < -22.9880 && lon > -43.1950 && lon < -43.1700) {
        return { inWater: true, bodyName: "Oceano Atlântico (Copacabana Mar Aberto)" };
    }
    if (lat < -22.9900 && lon > -43.2350 && lon <= -43.1950) {
        return { inWater: true, bodyName: "Oceano Atlântico (Ipanema/Leblon Mar Aberto)" };
    }
    if (lat < -23.0030 && lon > -43.2750 && lon <= -43.2350) {
        return { inWater: true, bodyName: "Oceano Atlântico (São Conrado Mar Aberto)" };
    }
    if (lat < -23.0230 && lon > -43.5200 && lon <= -43.2750) {
        return { inWater: true, bodyName: "Oceano Atlântico (Barra/Recreio Mar Aberto)" };
    }

    // Baía de Guanabara Aberta (Leste da linha costeira de Niterói / Centro)
    if (lat > -22.9200 && lat < -22.8400 && lon > -43.1550) {
        return { inWater: true, bodyName: "Baía de Guanabara (Canal Central)" };
    }

    return { inWater: false, bodyName: null };
}

// 7. Identifica se a câmera é Lote 1 (Rock in Rio Crítico)
function isRockInRioCriticalCamera(cam) {
    const nome = (cam.nome || cam.caption || '').toUpperCase();
    const bairro = (cam.bairro || '').toUpperCase();
    const id = String(cam.id || '').trim();

    if (id === '006242' || id === '6242' || id === '000405' || id === '405' || id === '001010' || id === '1010' || id === '001014' || id === '1014') {
        return true;
    }

    const rirBairros = ['BARRA OLÍMPICA', 'BARRA DA TIJUCA', 'CURICICA', 'RECREIO DOS BANDEIRANTES', 'CAMORIM', 'JACAREPAGUÁ'];
    const rirKeywords = ['AYRTON SENNA', 'ABELARDO BUENO', 'SALVADOR ALLENDE', 'TRANSOLÍMPICA', 'TRANSOLIMPICA', 'PARQUE OLÍMPICO', 'CIDADE DO ROCK', 'RIOCENTRO', 'ALVORADA', 'JARDIM OCEÂNICO', 'LINHA AMARELA'];

    if (rirBairros.includes(bairro)) {
        for (const kw of rirKeywords) {
            if (nome.includes(kw)) return true;
        }
    }
    return false;
}

// 8. Snap To Road / Map Matching Completo
function snapToNearestRoad(cam, options = { maxAutoDisplacementMeters: 300 }) {
    const rawLat = parseFloat(cam.latitude || cam.lat);
    const rawLon = parseFloat(cam.longitude || cam.lon);
    const nomeUpper = (cam.nome || cam.caption || '').toUpperCase();
    const bairro = cam.bairro || 'Rio de Janeiro';
    const bairroUpper = bairro.toUpperCase();
    const camId = String(cam.id).padStart(6, '0');

    const waterCheck = isPointInWater(rawLat, rawLon);
    let matchedCorridorKey = null;

    // Detecta correspondência com vias prioritárias
    if (nomeUpper.includes('AYRTON SENNA') || camId === '006242') matchedCorridorKey = 'AYRTON SENNA';
    else if (nomeUpper.includes('ABELARDO BUENO')) matchedCorridorKey = 'ABELARDO BUENO';
    else if (nomeUpper.includes('SALVADOR ALLENDE')) matchedCorridorKey = 'SALVADOR ALLENDE';
    else if (nomeUpper.includes('TRANSOL') || nomeUpper.includes('TRANS OL')) matchedCorridorKey = 'TRANSOLIMPICA';
    else if (nomeUpper.includes('LINHA AMARELA')) matchedCorridorKey = 'LINHA AMARELA';
    else if (nomeUpper.includes('AMÉRICAS') || nomeUpper.includes('AMERICAS') || nomeUpper.includes('ALVORADA')) matchedCorridorKey = 'DAS AMERICAS';
    else if (nomeUpper.includes('AROAZES')) matchedCorridorKey = 'AROAZES';
    else if (nomeUpper.includes('PEDRO CORR') || nomeUpper.includes('PEDRO CORREA')) matchedCorridorKey = 'PEDRO CORREA';
    else if (nomeUpper.includes('ATLÂNTICA') || nomeUpper.includes('ATLANTICA') || nomeUpper.includes('COPACABANA')) matchedCorridorKey = 'COPACABANA';
    else if (nomeUpper.includes('VIEIRA SOUTO') || nomeUpper.includes('IPANEMA')) matchedCorridorKey = 'IPANEMA';
    else if (nomeUpper.includes('DELFIM MOREIRA') || nomeUpper.includes('LEBLON')) matchedCorridorKey = 'LEBLON';
    else if (nomeUpper.includes('BOTAFOGO') || nomeUpper.includes('SÃO CLEMENTE')) matchedCorridorKey = 'BOTAFOGO';
    else if (nomeUpper.includes('FLAMENGO')) matchedCorridorKey = 'FLAMENGO';
    else if (nomeUpper.includes('RIO BRANCO') || nomeUpper.includes('CENTRO')) matchedCorridorKey = 'CENTRO';
    else if (nomeUpper.includes('EPITÁCIO') || nomeUpper.includes('EPITACIO') || nomeUpper.includes('BORGES DE MEDEIROS')) matchedCorridorKey = 'LAGOA';
    else if (nomeUpper.includes('GALEÃO') || nomeUpper.includes('GALEAO') || nomeUpper.includes('CACUIA')) matchedCorridorKey = 'ILHA DO GOVERNADOR';

    let nearestPt = null;
    let minDistance = Infinity;

    // 1. Tenta casar com o corredor identificado
    if (matchedCorridorKey && ROAD_CORRIDORS[matchedCorridorKey]) {
        ROAD_CORRIDORS[matchedCorridorKey].forEach(wp => {
            const d = haversineMeters(rawLat, rawLon, wp.lat, wp.lon);
            if (d < minDistance) {
                minDistance = d;
                nearestPt = wp;
            }
        });
    }

    // 2. Se a câmera estiver sobre a água e ainda não tiver correspondência segura:
    if (waterCheck.inWater) {
        // Tenta achar em corredores do mesmo bairro ou em centróides seguros
        if (SAFE_LAND_CENTROIDS[bairro]) {
            const safeCentroid = SAFE_LAND_CENTROIDS[bairro];
            const dCentroid = haversineMeters(rawLat, rawLon, safeCentroid.lat, safeCentroid.lon);
            if (!nearestPt || dCentroid < minDistance) {
                minDistance = dCentroid;
                nearestPt = { lat: safeCentroid.lat, lon: safeCentroid.lon, ref: safeCentroid.ref };
            }
        }

        // Se ainda não tiver nearestPt ou se o atual ainda estiver em água, busca qualquer ponto viário seco mais próximo
        if (!nearestPt || isPointInWater(nearestPt.lat, nearestPt.lon).inWater) {
            Object.values(ROAD_CORRIDORS).forEach(waypoints => {
                waypoints.forEach(wp => {
                    const wpWater = isPointInWater(wp.lat, wp.lon);
                    if (!wpWater.inWater) {
                        const d = haversineMeters(rawLat, rawLon, wp.lat, wp.lon);
                        if (d < minDistance) {
                            minDistance = d;
                            nearestPt = wp;
                        }
                    }
                });
            });
        }
    }

    const isExceedingAutoLimit = minDistance > options.maxAutoDisplacementMeters;
    let finalLat = rawLat;
    let finalLon = rawLon;
    let statusCoordenada = 'VALIDADA';
    let motivoSuspeita = null;
    let deslocamentoMetros = 0;
    let foiCorrigida = false;

    // Se estiver sobre água OU se for uma câmera com corredor explícito na Barra Olímpica / Rock in Rio (ex: Ayrton Senna)
    const isExplicitRockInRioCorridor = (bairroUpper === 'BARRA OLÍMPICA' || bairroUpper === 'BARRA DA TIJUCA') && matchedCorridorKey;

    if (waterCheck.inWater || isExplicitRockInRioCorridor) {
        if (nearestPt) {
            deslocamentoMetros = Math.round(minDistance);
            finalLat = nearestPt.lat;
            finalLon = nearestPt.lon;
            foiCorrigida = true;

            if (isExceedingAutoLimit) {
                statusCoordenada = 'COORDENADA_SUSPEITA';
                motivoSuspeita = waterCheck.inWater
                    ? `Estava sobre ${waterCheck.bodyName}. Deslocamento de ${deslocamentoMetros}m (> 300m) até ${nearestPt.ref}. Marcada para homologação de campo.`
                    : `Via identificada (${matchedCorridorKey}) com deslocamento de ${deslocamentoMetros}m (> 300m) até ${nearestPt.ref}. Ajustada e marcada para revisão.`;
            } else {
                statusCoordenada = 'VALIDADA_SNAP';
                motivoSuspeita = `Ajustada para o eixo viário ${nearestPt.ref} (${deslocamentoMetros}m).`;
            }
        }
    } else if (matchedCorridorKey && nearestPt && isExceedingAutoLimit) {
        // Câmera em terra firme mas cujo nome da via discrepa muito da coordenada atual
        statusCoordenada = 'COORDENADA_SUSPEITA';
        deslocamentoMetros = Math.round(minDistance);
        motivoSuspeita = `Via indicada (${matchedCorridorKey}) a ${deslocamentoMetros}m de distância. Coordenada mantida em terra para revisão manual.`;
        finalLat = rawLat;
        finalLon = rawLon;
    } else if (matchedCorridorKey && nearestPt && minDistance <= options.maxAutoDisplacementMeters && minDistance > 30) {
        // Ajuste fino viário em terra firme dentro dos 300m
        deslocamentoMetros = Math.round(minDistance);
        finalLat = nearestPt.lat;
        finalLon = nearestPt.lon;
        foiCorrigida = true;
        statusCoordenada = 'VALIDADA_SNAP';
    }

    return {
        id: camId,
        nome: cam.nome || cam.caption,
        bairro: cam.bairro,
        latitudeOriginal: rawLat,
        longitudeOriginal: rawLon,
        latitudeCorrigida: parseFloat(finalLat.toFixed(6)),
        longitudeCorrigida: parseFloat(finalLon.toFixed(6)),
        estavaNaAgua: waterCheck.inWater,
        corpoHidrico: waterCheck.bodyName,
        deslocamentoMetros,
        foiCorrigida,
        statusCoordenada,
        motivoSuspeita,
        necessitaRevisaoManual: statusCoordenada === 'COORDENADA_SUSPEITA',
        isLote1RockInRio: isRockInRioCriticalCamera(cam)
    };
}

module.exports = {
    WATER_BODIES,
    ROAD_CORRIDORS,
    SAFE_LAND_CENTROIDS,
    haversineMeters,
    pointInPolygon,
    isPointInWater,
    isRockInRioCriticalCamera,
    snapToNearestRoad
};
