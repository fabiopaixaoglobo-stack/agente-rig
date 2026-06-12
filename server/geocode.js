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

const FALLBACK_CENTROID = { lat: -22.9068, lon: -43.1729, precision: 'fallback_city' };

let cacheMutex = Promise.resolve();

function withCacheLock(fn) {
    const p = cacheMutex.then(() => fn());
    cacheMutex = p.catch(() => {});
    return p;
}

async function lerCache() {
    try {
        if (fsSync.existsSync(CACHE_FILE)) {
            const data = await fs.readFile(CACHE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Erro ao ler cache:', err);
    }
    return {};
}

async function salvarCache(cache) {
    try {
        await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
        console.error('Erro ao salvar cache:', err);
    }
}

async function getGeocode(targetMunicipio, targetUF, bairro = '') {
    const cacheKey = `${targetUF}|${targetMunicipio}|${bairro}`.toUpperCase().trim();

    return withCacheLock(async () => {
        const cache = await lerCache();
        if (cache[cacheKey]) {
            return { ok: true, ...cache[cacheKey], source: 'cache' };
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

        await new Promise((resolve) => setTimeout(resolve, 1000)); // Rate limit 1 sec

        let response = await fetchFn(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
            { headers: { 'User-Agent': 'AgenteRIG/3.5' } }
        );

        if (!response.ok) throw new Error(`Erro na API: ${response.status}`);

        let data = await response.json();

        if (data.length === 0 && precision === 'bairro') {
            query = `${targetMunicipio}, ${targetUF}, Brasil`;
            precision = 'municipio';
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Rate limit 1 sec
            response = await fetchFn(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
                { headers: { 'User-Agent': 'AgenteRIG/3.5' } }
            );
            data = await response.json();
        }

        if (data.length === 0) {
            const result = FALLBACK_CENTROID;
            cache[cacheKey] = result;
            await salvarCache(cache);
            return { ok: true, ...result, source: 'fallback' };
        }

        const result = {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            precision: precision,
        };
        cache[cacheKey] = result;
        await salvarCache(cache);
        return { ok: true, ...result, source: 'api' };
    });
}

router.get('/geocode', async (req, res) => {
    const { bairro, municipio, uf } = req.query;
    const targetMunicipio = municipio || 'Rio de Janeiro';
    const targetUF = uf || 'RJ';

    try {
        const result = await getGeocode(targetMunicipio, targetUF, bairro);
        res.json(result);
    } catch (error) {
        console.error('Erro Geocode:', error);
        if (!res.headersSent) {
            res.json({ ok: true, ...FALLBACK_CENTROID, source: 'error_fallback' });
        }
    }
});

module.exports = { router, getGeocode };

