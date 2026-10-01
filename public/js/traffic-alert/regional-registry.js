/**
 * Agente RIT - Módulo RIT ALERTA
 * Registro Canônico Centralizado de Regionais / Praças de Trânsito
 * 
 * Centraliza códigos de UF, códigos internos de API, nomes oficiais,
 * coordenadas cartográficas, zoom, fontes públicas oficiais e aliases.
 */

export const REGIONAL_REGISTRY = {
    'RJ': {
        uf: 'RJ',
        internalCode: 'RJ',
        nome: 'Rio de Janeiro',
        praca: 'RIO DE JANEIRO (RJ)',
        label: 'RJ',
        center: [-22.9068, -43.1729],
        zoom: 12,
        fontes: 'COR-Rio, CET-Rio, Alerta Rio, OSRM',
        clima: '28°C ☀️ RIO DE JANEIRO',
        aliases: ['RJ', 'RIO', 'RIO DE JANEIRO']
    },
    'SP': {
        uf: 'SP',
        internalCode: 'SP',
        nome: 'São Paulo',
        praca: 'SÃO PAULO (SP)',
        label: 'SP',
        center: [-23.5505, -46.6333],
        zoom: 12,
        fontes: 'CET-SP, CGE-SP, OSRM',
        clima: '20°C ☁️ SÃO PAULO',
        aliases: ['SP', 'SAO PAULO', 'SÃO PAULO']
    },
    'MG': {
        uf: 'MG',
        internalCode: 'BH',
        nome: 'Belo Horizonte',
        praca: 'BELO HORIZONTE (MG)',
        label: 'MG',
        center: [-19.9167, -43.9345],
        zoom: 12,
        fontes: 'BHTRANS, Defesa Civil BH, OSRM',
        clima: '22°C 🌤️ BELO HORIZONTE',
        aliases: ['MG', 'BH', 'BELO HORIZONTE', 'MINAS GERAIS']
    },
    'DF': {
        uf: 'DF',
        internalCode: 'BSB',
        nome: 'Brasília',
        praca: 'BRASÍLIA (DF)',
        label: 'DF',
        center: [-15.7975, -47.8919],
        zoom: 12,
        fontes: 'DER-DF, Detran-DF, Defesa Civil DF, OSRM',
        clima: '24°C ☀️ BRASÍLIA',
        aliases: ['DF', 'BSB', 'BRASÍLIA', 'BRASILIA', 'DISTRITO FEDERAL']
    },
    'PE': {
        uf: 'PE',
        internalCode: 'REC',
        nome: 'Recife',
        praca: 'RECIFE (PE)',
        label: 'PE',
        center: [-8.0476, -34.8770],
        zoom: 12,
        fontes: 'CTTU Recife, APAC, OSRM',
        clima: '30°C ☀️ RECIFE',
        aliases: ['PE', 'REC', 'RECIFE', 'PERNAMBUCO']
    }
};

/**
 * Normaliza qualquer string ou código de regional para o objeto canônico do REGIONAL_REGISTRY.
 * Suporta tanto a UF ('MG', 'DF', 'PE') quanto o código interno ('BH', 'BSB', 'REC') ou nome extenso.
 * 
 * @param {string} input - Identificador de regional
 * @returns {object} Configuração canônica da regional
 */
export function resolveRegionalConfig(input) {
    if (!input) return REGIONAL_REGISTRY.RJ;
    const s = String(input).toUpperCase().trim();

    // 1. Busca direta por chave
    if (REGIONAL_REGISTRY[s]) {
        return REGIONAL_REGISTRY[s];
    }

    // 2. Busca por internalCode ou UF ou aliases
    for (const cfg of Object.values(REGIONAL_REGISTRY)) {
        if (cfg.uf === s || cfg.internalCode === s || cfg.aliases.includes(s)) {
            return cfg;
        }
    }

    return REGIONAL_REGISTRY.RJ;
}

/**
 * Retorna lista de todas as regionais operacionais suportadas.
 */
export function getAllRegionals() {
    return Object.values(REGIONAL_REGISTRY);
}
