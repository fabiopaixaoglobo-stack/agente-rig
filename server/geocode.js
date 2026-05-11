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

// Centroid seguro para fallback (Centro do Rio de Janeiro)
const FALLBACK_CENTROID = { lat: -22.9068, lon: -43.1729, precision: "fallback_city" };

// Função para ler o cache de forma assíncrona
async function lerCache() {
    try {
        if (fsSync.existsSync(CACHE_FILE)) {
            const data = await fs.readFile(CACHE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error("Erro ao ler cache:", err);
    }
    return {};
}

// Função para salvar o cache de forma assíncrona
async function salvarCache(cache) {
    try {
        await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
        console.error("Erro ao salvar cache:", err);
    }
}

router.get('/geocode', async (req, res) => {
    const { bairro, municipio, uf } = req.query;

    const targetMunicipio = municipio || "Rio de Janeiro";
    const targetUF = uf || "RJ";

    const cacheKey = `${targetUF}|${targetMunicipio}|${bairro || ''}`.toUpperCase().trim();
    
    // 1. Checar Cache
    const cache = await lerCache();
    if (cache[cacheKey]) {
        return res.json({ ok: true, ...cache[cacheKey], source: 'cache' });
    }

    try {
        // 2. Tentar por Bairro
        let query = "";
        let precision = "";

        if (bairro && bairro.length > 2) {
            query = `${bairro}, ${targetMunicipio}, ${targetUF}, Brasil`;
            precision = "bairro";
        } else {
            query = `${targetMunicipio}, ${targetUF}, Brasil`;
            precision = "municipio";
        }

        // Delay para evitar rate-limit agressivo se chamado em massa
        await new Promise(resolve => setTimeout(resolve, 100));

        let response = await fetchFn(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
            headers: { 'User-Agent': 'AgenteRIG/3.5' }
        });
        
        if (!response.ok) throw new Error(`Erro na API: ${response.status}`);
        
        let data = await response.json();

        // 3. Fallback para Município se o bairro falhar
        if (data.length === 0 && precision === "bairro") {
            query = `${targetMunicipio}, ${targetUF}, Brasil`;
            precision = "municipio";
            response = await fetchFn(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
                headers: { 'User-Agent': 'AgenteRIG/3.5' }
            });
            data = await response.json();
        }

        // 4. Fallback Final (Centro da Cidade)
        if (data.length === 0) {
            const result = FALLBACK_CENTROID;
            cache[cacheKey] = result;
            await salvarCache(cache);
            return res.json({ ok: true, ...result, source: 'fallback' });
        }

        // 5. Retornar e salvar
        const result = {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            precision: precision
        };
        cache[cacheKey] = result;
        await salvarCache(cache);
        return res.json({ ok: true, ...result, source: 'api' });

    } catch (error) {
        console.error("Erro Geocode:", error);
        // Retorna o centroid em vez de erro para não quebrar o mapa no frontend
        res.json({ ok: true, ...FALLBACK_CENTROID, source: 'error_fallback' });
    }
});

module.exports = router;
