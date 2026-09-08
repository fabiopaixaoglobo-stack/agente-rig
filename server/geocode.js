const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const fetchFn =
    typeof globalThis.fetch === 'function'
        ? globalThis.fetch.bind(globalThis)
        : require('node-fetch');

const CACHE_FILE = path.join(__dirname, 'cache.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias de retenção conforme governança corporativa

const FALLBACK_CENTROID = { lat: -22.9068, lon: -43.1729, precision: 'fallback_city' };

// BASE HOMOLOGADA DE POIS GLOBO, PONTOS ESTRATÉGICOS E PEDÁGIOS RJ (ZERO LATÊNCIA)
const GLOBO_POIS = [
    {
        id: 'globo_projac',
        label: 'Estúdios Globo (Projac)',
        endereco: 'Estrada dos Bandeirantes, 6700 - Jacarepaguá, Rio de Janeiro - RJ',
        aliases: ['estudios globo', 'projac', 'curicica', 'globo jacarepagua', 'globo'],
        lat: -22.9754,
        lon: -43.4116,
        tipo: 'globo',
        categoria: 'Base Operacional'
    },
    {
        id: 'globo_p1',
        label: 'Estúdios Globo - Portaria 1 (Allende)',
        endereco: 'Av. Salvador Allende, s/n - Jacarepaguá, Rio de Janeiro - RJ',
        aliases: ['portaria 1', 'portaria 1 jacarepagua', 'estudios globo portaria 1', 'p1 globo', 'allende'],
        lat: -22.9735,
        lon: -43.4140,
        tipo: 'globo',
        categoria: 'Portaria'
    },
    {
        id: 'globo_p2',
        label: 'Estúdios Globo - Portaria 2 (Curicica)',
        endereco: 'Estrada Coronel Pedro Corrêa / Curicica, Rio de Janeiro - RJ',
        aliases: ['portaria 2', 'portaria 2 jacarepagua', 'estudios globo portaria 2', 'p2 globo'],
        lat: -22.9780,
        lon: -43.4095,
        tipo: 'globo',
        categoria: 'Portaria'
    },
    {
        id: 'globo_p3',
        label: 'Estúdios Globo - Portaria 3 (Bandeirantes)',
        endereco: 'Estrada dos Bandeirantes, 6700 - Jacarepaguá, Rio de Janeiro - RJ',
        aliases: ['portaria 3', 'portaria 3 jacarepagua', 'estudios globo portaria 3', 'p3 globo', 'bandeirantes'],
        lat: -22.9754,
        lon: -43.4116,
        tipo: 'globo',
        categoria: 'Portaria'
    },
    {
        id: 'globo_p4',
        label: 'Estúdios Globo - Portaria 4 (Apoio)',
        endereco: 'Estrada dos Bandeirantes - Jacarepaguá, Rio de Janeiro - RJ',
        aliases: ['portaria 4', 'portaria 4 jacarepagua', 'estudios globo portaria 4', 'p4 globo'],
        lat: -22.9721,
        lon: -43.4150,
        tipo: 'globo',
        categoria: 'Portaria'
    },
    {
        id: 'globo_jb',
        label: 'Jardim Botânico Globo (Lopes Quintas)',
        endereco: 'Rua Lopes Quintas, 303 - Jardim Botânico, Rio de Janeiro - RJ',
        aliases: ['globo jardim botanico', 'jardim botanico', 'lopes quintas', 'globo jb', 'jornalismo globo'],
        lat: -22.9669,
        lon: -43.2268,
        tipo: 'globo',
        categoria: 'Sede / Jornalismo'
    },
    {
        id: 'globo_jb_von_martius',
        label: 'Jardim Botânico Globo (Von Martius)',
        endereco: 'Rua Von Martius, 22 - Jardim Botânico, Rio de Janeiro - RJ',
        aliases: ['von martius', 'globo von martius', 'jb von martius'],
        lat: -22.9648,
        lon: -43.2245,
        tipo: 'globo',
        categoria: 'Portaria'
    },
    {
        id: 'globo_sp',
        label: 'Globo São Paulo (Berrini)',
        endereco: 'Av. Jornalista Roberto Marinho, Brooklin, São Paulo - SP',
        aliases: ['globo sp', 'berrini', 'globo sao paulo', 'roberto marinho sp'],
        lat: -23.6186,
        lon: -46.6974,
        tipo: 'globo',
        categoria: 'Regional SP'
    },
    {
        id: 'evento_cidade_rock',
        label: 'Rock in Rio - Cidade do Rock',
        endereco: 'Parque Olímpico, Av. Salvador Allende - Barra da Tijuca, Rio de Janeiro - RJ',
        aliases: ['rock in rio', 'cidade do rock', 'rock in rio cidade do rock', 'parque olimpico', 'rir'],
        lat: -22.9789,
        lon: -43.3956,
        tipo: 'evento',
        categoria: 'Grande Evento'
    },
    {
        id: 'evento_riocentro',
        label: 'Riocentro',
        endereco: 'Av. Salvador Allende, 6555 - Barra Olímpica, Rio de Janeiro - RJ',
        aliases: ['riocentro', 'rio centro', 'centro de convencoes riocentro'],
        lat: -22.9790,
        lon: -43.4072,
        tipo: 'evento',
        categoria: 'Convenções'
    },
    {
        id: 'evento_maracana',
        label: 'Maracanã (Estádio Jornalista Mário Filho)',
        endereco: 'Av. Presidente Castelo Branco - Maracanã, Rio de Janeiro - RJ',
        aliases: ['maracana', 'estadio maracana', 'maraca'],
        lat: -22.9121,
        lon: -43.2302,
        tipo: 'evento',
        categoria: 'Estádio'
    },
    {
        id: 'evento_sambodromo',
        label: 'Sambódromo Marquês de Sapucaí',
        endereco: 'Rua Marquês de Sapucaí - Santo Cristo, Rio de Janeiro - RJ',
        aliases: ['sambodromo', 'sapucai', 'marques de sapucai', 'carnaval'],
        lat: -22.9118,
        lon: -43.1963,
        tipo: 'evento',
        categoria: 'Carnaval / Eventos'
    },
    {
        id: 'aero_sdu',
        label: 'Aeroporto Santos Dumont (SDU)',
        endereco: 'Praça Senador Salgado Filho, s/n - Centro, Rio de Janeiro - RJ',
        aliases: ['santos dumont', 'aeroporto santos dumont', 'sdu', 'aeroporto sdu'],
        lat: -22.9105,
        lon: -43.1631,
        tipo: 'aeroporto',
        categoria: 'Aeroporto'
    },
    {
        id: 'aero_gig',
        label: 'Aeroporto Internacional Tom Jobim (Galeão - GIG)',
        endereco: 'Av. Vinte de Janeiro, s/n - Ilha do Governador, Rio de Janeiro - RJ',
        aliases: ['galeao', 'aeroporto galeao', 'tom jobim', 'gig', 'aeroporto internacional'],
        lat: -22.8134,
        lon: -43.2494,
        tipo: 'aeroporto',
        categoria: 'Aeroporto'
    },
    {
        id: 'hotel_windsor_barra',
        label: 'Hotel Windsor Barra',
        endereco: 'Av. Lúcio Costa, 2630 - Barra da Tijuca, Rio de Janeiro - RJ',
        aliases: ['windsor barra', 'hotel windsor', 'windsor lucio costa', 'hotel windsor barra'],
        lat: -23.0118,
        lon: -43.3225,
        tipo: 'hotel',
        categoria: 'Hotelaria'
    },
    {
        id: 'hotel_windsor_marapendi',
        label: 'Hotel Windsor Marapendi',
        endereco: 'Av. Lúcio Costa, 5400 - Barra da Tijuca, Rio de Janeiro - RJ',
        aliases: ['windsor marapendi', 'hotel windsor marapendi'],
        lat: -23.0125,
        lon: -43.3488,
        tipo: 'hotel',
        categoria: 'Hotelaria'
    },
    {
        id: 'hotel_grand_hyatt',
        label: 'Hotel Grand Hyatt Rio',
        endereco: 'Av. Lúcio Costa, 9600 - Barra da Tijuca, Rio de Janeiro - RJ',
        aliases: ['grand hyatt', 'hyatt barra', 'hotel grand hyatt'],
        lat: -23.0101,
        lon: -43.3855,
        tipo: 'hotel',
        categoria: 'Hotelaria'
    },
    {
        id: 'shop_barrashopping',
        label: 'BarraShopping',
        endereco: 'Av. das Américas, 4666 - Barra da Tijuca, Rio de Janeiro - RJ',
        aliases: ['barrashopping', 'barra shopping', 'new york city center'],
        lat: -22.9996,
        lon: -43.3601,
        tipo: 'ponto_interesse',
        categoria: 'Shopping / Apoio'
    },
    {
        id: 'central_brasil',
        label: 'Central do Brasil',
        endereco: 'Praça Cristiano Otoni, s/n - Centro, Rio de Janeiro - RJ',
        aliases: ['central do brasil', 'estacao central', 'estacao central do brasil'],
        lat: -22.9035,
        lon: -43.1915,
        tipo: 'ponto_interesse',
        categoria: 'Terminal / Hub'
    },
    {
        id: 'pedagio_transolimpica',
        label: 'Pedágio Transolímpica',
        endereco: 'Estrada do Engenho Velho - Taquara, Rio de Janeiro - RJ',
        aliases: ['pedagio transolimpica', 'transolimpica pedagio', 'transolimpica'],
        lat: -22.9136,
        lon: -43.3851,
        tipo: 'pedagio',
        categoria: 'Praça de Pedágio (R$ 9,95)'
    },
    {
        id: 'pedagio_linha_amarela',
        label: 'Pedágio Linha Amarela',
        endereco: 'Linha Amarela, KM 15 - Água Santa, Rio de Janeiro - RJ',
        aliases: ['pedagio linha amarela', 'linha amarela pedagio', 'linha amarela'],
        lat: -22.9072,
        lon: -43.3089,
        tipo: 'pedagio',
        categoria: 'Praça de Pedágio (R$ 4,00)'
    },
    {
        id: 'pedagio_ponte',
        label: 'Pedágio Ponte Rio-Niterói',
        endereco: 'Ponte Pres. Costa e Silva, KM 322 - Ilha do Mocanguê, Niterói - RJ',
        aliases: ['pedagio ponte', 'pedagio ponte rio niteroi', 'ponte rio niteroi'],
        lat: -22.8636,
        lon: -43.1676,
        tipo: 'pedagio',
        categoria: 'Praça de Pedágio (R$ 6,60)'
    },
    {
        id: 'pedagio_queimados',
        label: 'Pedágio Queimados',
        endereco: 'Rodovia Presidente Dutra, KM 193 - Queimados - RJ',
        aliases: ['pedagio queimados', 'queimados pedagio', 'pedagio queimados rj', 'queimados'],
        lat: -22.7161,
        lon: -43.5562,
        tipo: 'pedagio',
        categoria: 'Praça de Pedágio'
    },
    {
        id: 'barra_olimpica',
        label: 'Barra Olímpica',
        endereco: 'Barra Olímpica - Zona Oeste, Rio de Janeiro - RJ',
        aliases: ['barra olimpica', 'barra olimpica rj', 'regiao olimpica'],
        lat: -22.9810,
        lon: -43.3980,
        tipo: 'ponto_interesse',
        categoria: 'Bairro / Região'
    }
];

let cacheMutex = Promise.resolve();

function withCacheLock(fn) {
    const p = cacheMutex.then(() => fn());
    cacheMutex = p.catch(() => {});
    return p;
}

function normalizarTexto(str) {
    return String(str || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

async function lerCache() {
    try {
        if (fsSync.existsSync(CACHE_FILE)) {
            const data = await fs.readFile(CACHE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.warn('⚠️ [CACHE] Falha ao ler cache.json:', err.message);
    }
    return {};
}

async function salvarCache(cache) {
    try {
        await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
        console.warn('⚠️ [CACHE] Falha ao salvar cache.json:', err.message);
    }
}

// BUSCA LOCAL NOS POIS HOMOLOGADOS DA GLOBO & RJ
function buscarPoisLocais(query, limit = 6) {
    const qNorm = normalizarTexto(query);
    if (!qNorm || qNorm.length < 2) return [];

    const matches = [];
    for (const poi of GLOBO_POIS) {
        let score = 0;
        const labelNorm = normalizarTexto(poi.label);
        const endNorm = normalizarTexto(poi.endereco);

        if (labelNorm === qNorm) {
            score = 100;
        } else if (labelNorm.startsWith(qNorm)) {
            score = 80;
        } else if (poi.aliases.some(a => normalizarTexto(a) === qNorm)) {
            score = 90;
        } else if (poi.aliases.some(a => normalizarTexto(a).startsWith(qNorm))) {
            score = 75;
        } else if (labelNorm.includes(qNorm) || endNorm.includes(qNorm)) {
            score = 60;
        } else if (poi.aliases.some(a => normalizarTexto(a).includes(qNorm))) {
            score = 50;
        }

        if (score > 0) {
            matches.push({
                id: poi.id,
                label: poi.label,
                endereco: poi.endereco,
                lat: poi.lat,
                lon: poi.lon,
                tipo: poi.tipo,
                categoria: poi.categoria,
                score
            });
        }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit);
}

// RESOLUÇÃO DE CEP VIA VIACEP COM CACHE
async function resolverCep(cepLimpo) {
    const cacheKey = `CEP_${cepLimpo}`;
    const cache = await lerCache();
    const item = cache[cacheKey];

    if (item && item.timestamp && (Date.now() - item.timestamp < CACHE_TTL_MS)) {
        return item.data;
    }

    try {
        const resp = await fetchFn(`https://viacep.com.br/ws/${cepLimpo}/json/`, { timeout: 3500 });
        if (resp.ok) {
            const cepData = await resp.json();
            if (!cepData.erro) {
                const label = `${cepData.logradouro ? cepData.logradouro + ', ' : ''}${cepData.bairro || ''} - ${cepData.localidade}/${cepData.uf}`;
                const geocodeData = await getGeocode(cepData.localidade, cepData.uf, cepData.logradouro || cepData.bairro);
                
                const resultado = {
                    id: `cep_${cepLimpo}`,
                    label: `CEP ${cepLimpo} (${label})`,
                    endereco: `${label}, CEP ${cepLimpo}`,
                    lat: geocodeData.lat,
                    lon: geocodeData.lon,
                    tipo: 'cep',
                    categoria: 'Código Postal'
                };

                cache[cacheKey] = { data: resultado, timestamp: Date.now() };
                await salvarCache(cache);
                return resultado;
            }
        }
    } catch (e) {
        console.warn(`[CEP] Falha na consulta ViaCEP para ${cepLimpo}:`, e.message);
    }
    return null;
}

// GEOCODIFICAÇÃO RESILIENTE COM CACHE DE 7 DIAS
async function getGeocode(targetMunicipio, targetUF, bairro = '') {
    const cacheKey = `${targetUF}|${targetMunicipio}|${bairro}`.toUpperCase().trim();

    return withCacheLock(async () => {
        const cache = await lerCache();
        const cachedItem = cache[cacheKey];
        if (cachedItem) {
            // Suporta legado onde cache guardava direto objeto ou com timestamp
            const isFresh = !cachedItem.timestamp || (Date.now() - cachedItem.timestamp < CACHE_TTL_MS);
            if (isFresh) {
                const data = cachedItem.lat ? cachedItem : (cachedItem.data || cachedItem);
                return { ok: true, ...data, source: 'cache_7d' };
            }
        }

        let query = '';
        let precision = '';
        if (bairro && bairro.length > 2) {
            query = `${bairro}, ${targetMunicipio}, ${targetUF}, Brasil`;
            precision = 'bairro';
        } else {
            query = `${targetMunicipio}, ${targetUF}, Brasil`;
            precision = 'municipio';
        }

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);

            let response = await fetchFn(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
                {
                    headers: { 'User-Agent': 'AgenteRIT/4.2 (operacao.transportes@globo.com)' },
                    signal: controller.signal
                }
            );
            clearTimeout(timer);

            if (response.ok) {
                let data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    const result = {
                        lat: parseFloat(data[0].lat),
                        lon: parseFloat(data[0].lon),
                        precision: precision,
                    };
                    cache[cacheKey] = { data: result, timestamp: Date.now() };
                    await salvarCache(cache);
                    return { ok: true, ...result, source: 'nominatim' };
                }
            }
        } catch (e) {
            console.warn(`[GEOCODE] Falha Nominatim para '${query}':`, e.message);
        }

        // Tenta Photon (OSM mirror rápido e de alta tolerância)
        try {
            const pResp = await fetchFn(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`, { timeout: 3500 });
            if (pResp.ok) {
                const pData = await pResp.json();
                if (pData.features && pData.features.length > 0) {
                    const coords = pData.features[0].geometry.coordinates; // [lon, lat]
                    const result = {
                        lat: coords[1],
                        lon: coords[0],
                        precision: precision
                    };
                    cache[cacheKey] = { data: result, timestamp: Date.now() };
                    await salvarCache(cache);
                    return { ok: true, ...result, source: 'photon' };
                }
            }
        } catch (pe) {
            console.warn(`[GEOCODE] Falha Photon para '${query}':`, pe.message);
        }

        // Fallback Seguro
        const result = FALLBACK_CENTROID;
        cache[cacheKey] = { data: result, timestamp: Date.now() };
        await salvarCache(cache);
        return { ok: true, ...result, source: 'fallback_resiliente' };
    });
}

// 1. ENDPOINT DE AUTOCOMPLETE INTELIGENTE (< 500ms)
router.get('/geocode/autocomplete', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
        return res.json({ ok: true, sugestoes: [] });
    }

    const sugestoes = [];

    // A. Busca Imediata em POIs Globo / Rio (Instantânea)
    const poiMatches = buscarPoisLocais(q, 6);
    sugestoes.push(...poiMatches);

    // B. Detecção de CEP (ex: 22775-000 ou 22775000)
    const mCep = q.match(/\b\d{5}-?\d{3}\b/);
    if (mCep) {
        const cepLimpo = mCep[0].replace('-', '');
        const resCep = await resolverCep(cepLimpo);
        if (resCep && !sugestoes.some(s => s.lat === resCep.lat && s.lon === resCep.lon)) {
            sugestoes.unshift(resCep);
        }
    }

    // C. Consulta em Cache e Nominatim/Photon se a busca não foi exata
    if (sugestoes.length < 4 && q.length >= 3) {
        const cacheKey = `SEARCH_${normalizarTexto(q)}`;
        const cache = await lerCache();
        const cachedSearch = cache[cacheKey];

        if (cachedSearch && cachedSearch.timestamp && (Date.now() - cachedSearch.timestamp < CACHE_TTL_MS)) {
            const cachedItems = cachedSearch.items || [];
            cachedItems.forEach(ci => {
                if (!sugestoes.some(s => s.label === ci.label)) {
                    sugestoes.push(ci);
                }
            });
        } else {
            try {
                const queryRJ = `${q}, Rio de Janeiro, Brasil`;
                const resp = await fetchFn(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryRJ)}&limit=4&addressdetails=1`,
                    { headers: { 'User-Agent': 'AgenteRIT/4.2 (operacao.transportes@globo.com)' }, timeout: 2500 }
                );
                if (resp.ok) {
                    const data = await resp.json();
                    if (Array.isArray(data)) {
                        const newItems = data.map((item, idx) => ({
                            id: `osm_${item.place_id || idx}`,
                            label: item.display_name.split(',').slice(0, 3).join(','),
                            endereco: item.display_name,
                            lat: parseFloat(item.lat),
                            lon: parseFloat(item.lon),
                            tipo: 'endereco',
                            categoria: item.type || 'Logradouro'
                        }));

                        cache[cacheKey] = { items: newItems, timestamp: Date.now() };
                        await salvarCache(cache);

                        newItems.forEach(ni => {
                            if (!sugestoes.some(s => s.label === ni.label)) {
                                sugestoes.push(ni);
                            }
                        });
                    }
                }
            } catch (err) {
                // Degradação graciosa: ignora sem travar
            }
        }
    }

    return res.json({ ok: true, sugestoes: sugestoes.slice(0, 8) });
});

// 2. ENDPOINT DE BUSCA DE PONTO ESPECÍFICO (SEARCH)
router.get('/geocode/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
        return res.status(400).json({ ok: false, error: 'Parâmetro de busca (q) obrigatório.' });
    }

    // 1. Tentar POI Local
    const localPois = buscarPoisLocais(q, 1);
    if (localPois.length > 0 && localPois[0].score >= 70) {
        return res.json({ ok: true, resultado: localPois[0], source: 'globo_poi' });
    }

    // 2. Tentar CEP
    const mCep = q.match(/\b\d{5}-?\d{3}\b/);
    if (mCep) {
        const resCep = await resolverCep(mCep[0].replace('-', ''));
        if (resCep) {
            return res.json({ ok: true, resultado: resCep, source: 'viacep' });
        }
    }

    // 3. Geocode Resiliente Geral
    try {
        const geo = await getGeocode('Rio de Janeiro', 'RJ', q);
        return res.json({
            ok: true,
            resultado: {
                id: `geo_${Date.now()}`,
                label: q,
                endereco: `${q}, Rio de Janeiro, Brasil`,
                lat: geo.lat,
                lon: geo.lon,
                tipo: 'endereco',
                categoria: 'Endereço Geral'
            },
            source: geo.source
        });
    } catch (err) {
        return res.json({
            ok: true,
            resultado: {
                id: `fallback_${Date.now()}`,
                label: q,
                endereco: 'Rio de Janeiro, Brasil',
                lat: FALLBACK_CENTROID.lat,
                lon: FALLBACK_CENTROID.lon,
                tipo: 'fallback',
                categoria: 'Centróide Regional'
            },
            source: 'fallback_error'
        });
    }
});

// 3. ENDPOINT LEGADO MANTIDO PARA COMPATIBILIDADE
router.get('/geocode', async (req, res) => {
    const { bairro, municipio, uf } = req.query;
    const targetMunicipio = municipio || 'Rio de Janeiro';
    const targetUF = uf || 'RJ';

    try {
        const result = await getGeocode(targetMunicipio, targetUF, bairro);
        res.json(result);
    } catch (error) {
        console.error('Erro Geocode Legado:', error);
        if (!res.headersSent) {
            res.json({ ok: true, ...FALLBACK_CENTROID, source: 'error_fallback' });
        }
    }
});

module.exports = { router, getGeocode, GLOBO_POIS };
