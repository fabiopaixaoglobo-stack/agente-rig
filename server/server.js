require('dotenv').config();
const fetch = require('node-fetch');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { router: geocodeRouter } = require('./geocode');
const { setupAuthRoutes, verifyToken } = require('./auth');
const { pool, initDB } = require('./database');
const { getRobotStatus, triggerDiagnostics } = require('./robot');

function generateOpaqueToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
    if (!token) return '';
    return crypto.createHash('sha256').update(String(token).trim()).digest('hex');
}

function minimizarNome(nome) {
    if (!nome || typeof nome !== 'string') return null;
    let limpo = nome.trim().replace(/^(dr\.|dra\.|prof\.|profª\.|sr\.|sra\.)\s+/i, '');
    const partes = limpo.split(/\s+/).filter(Boolean);
    if (partes.length === 0) return null;
    if (partes.length === 1) return partes[0];
    const primeiro = partes[0];
    const inicialSegundo = partes[1].charAt(0).toUpperCase();
    return `${primeiro} ${inicialSegundo}.`;
}

async function registrarEventoSeguranca(tipo_evento, entidade, entidade_id, usuario, ip_origem, user_agent, resultado, motivo, metadados = {}) {
    try {
        await pool.query(
            `INSERT INTO eventos_seguranca (tipo_evento, entidade, entidade_id, usuario, ip_origem, user_agent, resultado, motivo, data_hora, metadados)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)`,
            [
                tipo_evento,
                entidade || null,
                entidade_id ? String(entidade_id) : null,
                usuario || 'SISTEMA',
                ip_origem || null,
                user_agent || null,
                resultado,
                motivo || null,
                JSON.stringify(metadados)
            ]
        );
    } catch (e) {
        console.warn('⚠️ [AUDITORIA SEGURANÇA] Falha ao gravar evento_seguranca:', e.message);
    }
}

function extrairDataDeHorario(horario) {
    if (!horario) return 'Data não informada';
    const str = String(horario).trim();
    
    // Testa formato DD/MM/YYYY
    const regexBR = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    const mBR = str.match(regexBR);
    if (mBR) {
        return `${String(mBR[1]).padStart(2, '0')}/${String(mBR[2]).padStart(2, '0')}/${mBR[3]}`;
    }
    
    // Testa formato YYYY-MM-DD
    const regexISO = /(\d{4})-(\d{1,2})-(\d{1,2})/;
    const mISO = str.match(regexISO);
    if (mISO) {
        return `${String(mISO[3]).padStart(2, '0')}/${String(mISO[2]).padStart(2, '0')}/${mISO[1]}`;
    }
    
    console.warn(`[DATA INCONSISTENTE] Horário sem data reconhecível: ${horario}`);
    return 'Data não informada';
}

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.TRUST_PROXY === '1' || process.env.RENDER) {
    app.set('trust proxy', 1);
}

// MIDDLEWARES — CORS: defina ALLOWED_ORIGINS (lista separada por vírgula) em produção
const allowedOrigins = process.env.ALLOWED_ORIGINS;
if (allowedOrigins && allowedOrigins.trim()) {
    const list = allowedOrigins.split(',').map((s) => s.trim()).filter(Boolean);
    app.use(cors({ origin: list.length === 1 ? list[0] : list }));
} else {
    app.use(cors());
}
app.use(express.json({ limit: '512kb' }));

// ROTAS API (antes do static para não haver ambiguidade com ficheiros em public/)
app.use('/api', geocodeRouter);
const importarRotas = require('./importar_rotas');
app.use('/api/rotas', importarRotas);
setupAuthRoutes(app);

const publicPath = path.resolve(__dirname, '../public');

// BASES DE DADOS
let NORMAS_DATABASE = [];
let CONTRATOS_DATABASE = {};

function truncar(texto, max) {
    if (!texto || typeof texto !== 'string') return '';
    const t = texto.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
}

async function carregarBases() {
    const normasPath = path.join(publicPath, 'assets/normas_transporte.json');
    const contratosPath = path.join(__dirname, 'data/contratos.json');

    try {
        if (fsSync.existsSync(normasPath)) {
            const raw = await fs.readFile(normasPath, 'utf8');
            const parsed = JSON.parse(raw);
            NORMAS_DATABASE = Array.isArray(parsed) ? parsed : [];
        } else {
            NORMAS_DATABASE = [];
            console.warn('⚠️ normas_transporte.json não encontrado:', normasPath);
        }

        if (fsSync.existsSync(contratosPath)) {
            const raw = await fs.readFile(contratosPath, 'utf8');
            const parsed = JSON.parse(raw);
            CONTRATOS_DATABASE = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } else {
            CONTRATOS_DATABASE = {};
            console.warn('⚠️ contratos.json não encontrado:', contratosPath);
        }

        console.log(
            `✅ Bases carregadas: ${NORMAS_DATABASE.length} normas; ${Object.keys(CONTRATOS_DATABASE).length} chaves de contratos.`
        );
    } catch (error) {
        console.error('❌ Erro ao carregar bases de dados:', error);
        NORMAS_DATABASE = [];
        CONTRATOS_DATABASE = {};
    }
}

// ENDPOINTS API
app.get('/api/health', async (req, res) => {
    try {
        const startTime = Date.now();
        const dbResult = await pool.query('SELECT NOW() as db_time');
        const dbLatency = Date.now() - startTime;

        let activeConns = -1;
        try {
            const connResult = await pool.query('SELECT count(*) as active FROM pg_stat_activity');
            activeConns = parseInt(connResult.rows[0].active, 10);
        } catch (e) {
            // Ignora se não for superusuário
        }

        res.json({
            status: 'online',
            database: 'online',
            latency_ms: dbLatency,
            active_connections: activeConns,
            db_time: dbResult.rows[0].db_time,
            version: '3.5.2'
        });
    } catch (err) {
        console.error('❌ ERRO NO HEALTH CHECK (DATABASE OFFLINE):', err.message);
        res.status(500).json({
            status: 'online',
            database: 'offline',
            error: err.message,
            symptoms: [
                'Erro Interno 500 ao tentar fazer login ou cadastrar primeiro acesso',
                'Falha ao importar e processar novos lotes de planilhas',
                'Registros de auditoria de acessos não estão sendo gravados'
            ],
            sugestoes: [
                'Verifique se a instância do banco de dados no Render não foi suspensa ou pausada por inatividade',
                'Verifique se o limite de conexões simultâneas do plano gratuito do Render foi excedido',
                'Verifique se as credenciais do DATABASE_URL no .env do Render continuam válidas'
            ],
            version: '3.5.2'
        });
    }
});

app.get('/api/normas', (req, res) => {
    res.json(
        NORMAS_DATABASE.map((n) => ({
            id: n.id,
            titulo: n.titulo,
            icone: n.icone,
            resumo: n.resumo,
        }))
    );
});

// Multer and parser config for Chat RIT
const multer = require('multer');
const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB limit
// Cache do status do COR-Rio com atualização periódica
let corCache = {
    estagio: { estagio: "Estágio 1", cor: "#228d46" },
    calor: "calor 1",
    lastUpdated: null
};

// 15-second TTL cache for the live endpoint to prevent external API abuse
let lastLiveFetchTime = 0;
const LIVE_CACHE_TTL_MS = 15000; // 15 seconds

async function parseEstagioFromHtml() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('https://cor.rio/', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            const html = await res.text();
            
            // Regex patterns to identify stage in title tags, news headings or banner filenames
            const regexes = [
                /entrou em Estágio\s*([1-5])/i,
                /entrou no Estágio\s*([1-5])/i,
                /Cidade em Estágio\s*([1-5])/i,
                /Cidade do Rio em Estágio\s*([1-5])/i,
                /2025-painel-cor-estagio-0([1-5])/i
            ];
            
            for (const regex of regexes) {
                const match = html.match(regex);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num >= 1 && num <= 5) {
                        return num;
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[SCRAPE-COR] Erro ao parsear HTML de cor.rio:', e.message);
    }
    return null;
}

const STAGE_COLORS = {
    1: '#228d46',
    2: '#f2c94c',
    3: '#f2994a',
    4: '#e05757',
    5: '#8e1f24'
};

async function atualizarCacheCORLive(force = false) {
    const agora = Date.now();
    if (!force && (agora - lastLiveFetchTime < LIVE_CACHE_TTL_MS) && corCache.lastUpdated) {
        return corCache;
    }
    
    console.log('[COR-CACHE] Atualizando status em tempo real do COR-Rio...');
    
    let estagioNum = null;
    let estagioCor = null;
    let estagioNome = null;
    
    // 1. Tentar API do estágio
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
        const resEstagio = await fetch('https://appcor.cor-rio.work/estagio_cidade', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (resEstagio.ok) {
            const data = await resEstagio.json();
            if (data && data.estagio) {
                const match = data.estagio.match(/Estágio\s*([1-5])/i);
                if (match) {
                    estagioNum = parseInt(match[1], 10);
                    estagioNome = `Estágio ${estagioNum}`;
                    estagioCor = data.cor || STAGE_COLORS[estagioNum];
                }
            }
        }
    } catch (err) {
        console.warn('[COR-CACHE] API de Estágio offline, tentando fallback scraping:', err.message);
    }
    
    // 2. Se a API de Estágio falhou ou retornou inválido, tenta o Scraper de cor.rio
    if (!estagioNum) {
        const scrapedNum = await parseEstagioFromHtml();
        if (scrapedNum) {
            estagioNum = scrapedNum;
            estagioNome = `Estágio ${estagioNum}`;
            estagioCor = STAGE_COLORS[estagioNum];
            console.log(`[COR-CACHE] Estágio obtido via Scraping HTML de cor.rio: ${estagioNome}`);
        }
    }
    
    // Atualiza estágio se encontrado
    if (estagioNum) {
        corCache.estagio = {
            estagio: estagioNome,
            cor: estagioCor
        };
    }
    
    // 3. Tentar API de Calor
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const resCalor = await fetch('https://aplicativo.cocr.com.br/calor_api', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (resCalor.ok) {
            const data = await resCalor.json();
            const nivel = data.nivel || data.level || data.heat_level || 1;
            corCache.calor = `calor ${nivel}`;
        }
    } catch (err) {
        console.warn('[COR-CACHE] API de Calor indisponível:', err.message);
    }
    
    corCache.lastUpdated = new Date().toISOString();
    lastLiveFetchTime = agora;
    console.log('[COR-CACHE] Cache atualizado:', corCache);
    return corCache;
}

// Inicializa a primeira busca
atualizarCacheCORLive(true).catch(err => console.error('[COR-CACHE] Erro inicial:', err.message));

app.get('/api/status-operacional', async (req, res) => {
    const force = req.query.force === 'true';
    const cache = await atualizarCacheCORLive(force);
    res.json(cache);
});

app.get('/api/cor/estagio', async (req, res) => {
    const cache = await atualizarCacheCORLive(false);
    res.json(cache.estagio);
});

app.get('/api/cor/calor', async (req, res) => {
    const cache = await atualizarCacheCORLive(false);
    res.send(cache.calor);
});

const serverGeocodeCache = new Map();

const handleReverseGeocode = async (req, res) => {
    const lat = req.query.lat;
    const lng = req.query.lng || req.query.lon;
    const speed = req.query.speed;

    if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
        return res.status(400).json({ ok: false, address: 'Endereço indisponível' });
    }

    const cacheKey = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
    if (serverGeocodeCache.has(cacheKey)) {
        return res.json({ ok: true, address: serverGeocodeCache.get(cacheKey) });
    }

    try {
        const zoom = speed && Number(speed) > 0 ? 16 : 18;
        const queryUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR&zoom=${zoom}`;
        
        const response = await fetch(queryUrl, {
            headers: {
                'User-Agent': 'AgenteRIT/1.0 (fabio.paixao.globo@gmail.com)',
                'Accept-Language': 'pt-BR'
            },
            timeout: 3000
        }).catch(() => null);

        if (response && response.ok) {
            const geo = await response.json().catch(() => ({}));
            let addressText = '';
            const sp = Number(speed || 0);
            
            if (geo && geo.address) {
                if (sp > 0) {
                    const road = geo.address.road || geo.address.suburb || '';
                    const city = geo.address.city || geo.address.town || '';
                    addressText = road ? `${road}, ${city}` : (geo.display_name || '');
                } else {
                    const road = geo.address.road || '';
                    const houseNumber = geo.address.house_number || '';
                    const suburb = geo.address.suburb || '';
                    const ref = geo.address.amenity || geo.address.shop || geo.address.building || '';
                    let formatted = [];
                    if (ref) formatted.push(`[${ref}]`);
                    if (road) formatted.push(road);
                    if (houseNumber) formatted.push(houseNumber);
                    if (suburb) formatted.push(suburb);
                    addressText = formatted.length > 0 ? formatted.join(', ') : (geo.display_name || '');
                }
            } else if (geo && geo.display_name) {
                addressText = geo.display_name;
            }

            if (addressText) {
                serverGeocodeCache.set(cacheKey, addressText);
                return res.json({ ok: true, address: addressText });
            }
        }
        
        console.warn("[RIT GEO] Falha ao obter endereço OSM", { status: response ? response.status : 'timeout/network', lat, lng });
        const fallbackAddr = 'Endereço indisponível';
        return res.json({ ok: false, address: fallbackAddr });
    } catch (err) {
        console.warn("[RIT GEO] Exceção na geocodificação", { error: err.message, lat, lng });
        return res.json({ ok: false, address: 'Endereço indisponível' });
    }
};

app.get('/api/cor/reverse-geocode', handleReverseGeocode);
app.get('/reverse-geocode', handleReverseGeocode);

// =========================================================================
// PROXY DE CÂMERAS PÚBLICAS CET-SP (SÃO PAULO) COM CACHE EM MEMÓRIA
// =========================================================================
const httpsModule = require('https');
const cetImageCache = new Map();

app.get('/api/cameras/cetsp/image/:pasta/:img?', (req, res) => {
    const pasta = String(req.params.pasta || '').replace(/[^0-9]/g, '');
    const img = String(req.params.img || '1').replace(/[^0-9]/g, '');
    if (!pasta) {
        return res.status(400).json({ error: 'Parâmetro de câmera inválido' });
    }

    const cacheKey = `${pasta}_${img}`;
    const now = Date.now();
    if (cetImageCache.has(cacheKey)) {
        const cached = cetImageCache.get(cacheKey);
        if (now - cached.timestamp < 3000) { // 3s cache TTL
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=3');
            return res.send(cached.buffer);
        }
    }

    const targetUrl = `https://cameras.cetsp.com.br/Cams/${pasta}/${img || 1}.jpg`;
    const cetRequest = httpsModule.get(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://cameras.cetsp.com.br/View/Cam.aspx',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        },
        rejectUnauthorized: false,
        timeout: 5000
    }, (cetRes) => {
        if (cetRes.statusCode === 200) {
            const chunks = [];
            cetRes.on('data', chunk => chunks.push(chunk));
            cetRes.on('end', () => {
                const buffer = Buffer.concat(chunks);
                cetImageCache.set(cacheKey, { buffer, timestamp: Date.now() });
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=3');
                res.send(buffer);
            });
        } else {
            if (cetImageCache.has(cacheKey)) {
                const cached = cetImageCache.get(cacheKey);
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=1');
                return res.send(cached.buffer);
            }
            res.status(cetRes.statusCode).json({ error: 'Câmera CET indisponível no momento' });
        }
    });

    cetRequest.on('error', (err) => {
        console.warn(`⚠️ [CET-SP PROXY] Falha ao obter imagem da câmera ${pasta}:`, err.message);
        if (cetImageCache.has(cacheKey)) {
            const cached = cetImageCache.get(cacheKey);
            res.setHeader('Content-Type', 'image/jpeg');
            return res.send(cached.buffer);
        }
        if (!res.headersSent) {
            res.status(502).json({ error: 'Falha de conexão com CET-SP' });
        }
    });

    cetRequest.on('timeout', () => {
        cetRequest.destroy();
        if (cetImageCache.has(cacheKey)) {
            const cached = cetImageCache.get(cacheKey);
            res.setHeader('Content-Type', 'image/jpeg');
            return res.send(cached.buffer);
        }
        if (!res.headersSent) {
            res.status(504).json({ error: 'Timeout ao conectar com CET-SP' });
        }
    });
});

// =========================================================================
// PROXY DE CÂMERAS PÚBLICAS BRASÍLIA (CLIMA AO VIVO / BRASIL 21)
// =========================================================================
const bsbCameraUrls = {
    'esplanada': 'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-esplanada',
    'parque-da-cidade': 'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-parque-da-cidade',
    'mane-garrincha': 'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-mane-garrincha'
};
const bsbImageCache = new Map();

app.get('/api/cameras/brasilia/image/:camId', async (req, res) => {
    const camId = String(req.params.camId || '').toLowerCase().trim();
    const targetPageUrl = bsbCameraUrls[camId];
    if (!targetPageUrl) {
        return res.status(400).json({ error: 'Câmera de Brasília não encontrada' });
    }

    const now = Date.now();
    if (bsbImageCache.has(camId)) {
        const cached = bsbImageCache.get(camId);
        if (now - cached.timestamp < 30000) { // 30s cache TTL
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=15');
            return res.send(cached.buffer);
        }
    }

    try {
        const pageHtml = await new Promise((resolve, reject) => {
            httpsModule.get(targetPageUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                },
                timeout: 5000
            }, (pageRes) => {
                let data = '';
                pageRes.on('data', chunk => data += chunk);
                pageRes.on('end', () => resolve(data));
            }).on('error', reject);
        });

        const match = pageHtml.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) throw new Error('Não foi possível extrair metadados da página Clima ao Vivo');

        const pageJson = JSON.parse(match[1]);
        const desarquivo = pageJson.props?.pageProps?.page?.data?.desarquivo;
        if (!desarquivo) throw new Error('URL de snapshot não encontrada');

        const imageBuffer = await new Promise((resolve, reject) => {
            httpsModule.get(desarquivo, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                },
                timeout: 5000
            }, (imgRes) => {
                if (imgRes.statusCode !== 200) return reject(new Error(`HTTP ${imgRes.statusCode}`));
                const chunks = [];
                imgRes.on('data', chunk => chunks.push(chunk));
                imgRes.on('end', () => resolve(Buffer.concat(chunks)));
            }).on('error', reject);
        });

        bsbImageCache.set(camId, { buffer: imageBuffer, timestamp: Date.now() });
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=15');
        res.send(imageBuffer);
    } catch (err) {
        console.warn(`⚠️ [BRASÍLIA PROXY] Falha ao obter imagem da câmera ${camId}:`, err.message);
        if (bsbImageCache.has(camId)) {
            const cached = bsbImageCache.get(camId);
            res.setHeader('Content-Type', 'image/jpeg');
            return res.send(cached.buffer);
        }
        if (!res.headersSent) {
            res.status(502).json({ error: 'Falha ao buscar snapshot de Brasília' });
        }
    }
});

// =========================================================================
// POC EXPERIMENTAL (FLAGGED) DE SNAPSHOT/TRANSCODING DO RIO DE JANEIRO
// =========================================================================
app.get('/api/cameras/rj/snapshot-poc/:id', (req, res) => {
    if (process.env.ENABLE_RJ_SNAPSHOT_POC !== 'true') {
        return res.status(403).json({
            error: 'POC experimental de snapshot do Rio desativada por padrão em produção via flag (ENABLE_RJ_SNAPSHOT_POC)'
        });
    }
    const id = req.params.id;
    console.info(`[CamerasRJ] [POC EXPERIMENTAL] Requisição de snapshot para ID ${id}`);
    res.status(501).json({
        message: 'Endpoint POC reservado para ambiente de testes com ffmpeg/go2rtc.'
    });
});

// HELPER: Obter data e limites do dia em America/Sao_Paulo (Horário Oficial de Brasília)
function getHojeSaoPaulo() {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    return {
        day,
        month,
        year, // "2026"
        yearShort: year.slice(-2), // "26"
        dateFull: `${day}/${month}/${year}`, // "25/08/2026"
        dateShort: `${day}/${month}/${year.slice(-2)}`, // "25/08/26"
        inicioDia: '00:00:00',
        fimDia: '23:59:59',
        timezone: 'America/Sao_Paulo'
    };
}

// HELPER: Parser robusto para datas retornadas pelo OTT
function parseOttDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    
    // Match formato brasileiro: DD/MM/YY ou DD/MM/YYYY com ou sem HH:mm(:ss)
    const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (brMatch) {
        let [, d, m, y, h, min, s] = brMatch;
        const day = d.padStart(2, '0');
        const month = m.padStart(2, '0');
        let year = y;
        if (year.length === 2) {
            year = '20' + year;
        }
        const hour = (h || '00').padStart(2, '0');
        const minute = (min || '00').padStart(2, '0');
        const second = (s || '00').padStart(2, '0');
        
        return {
            day,
            month,
            year,
            dateFormatted: `${day}/${month}/${year}`,
            dateFormattedShort: `${day}/${month}/${year.slice(-2)}`,
            horaFormatted: `${hour}:${minute}`,
            horaFull: `${hour}:${minute}:${second}`
        };
    }

    // Match formato ISO: YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
        let [, y, m, d, h, min, s] = isoMatch;
        const day = d.padStart(2, '0');
        const month = m.padStart(2, '0');
        const year = y;
        const hour = (h || '00').padStart(2, '0');
        const minute = (min || '00').padStart(2, '0');
        const second = (s || '00').padStart(2, '0');
        return {
            day,
            month,
            year,
            dateFormatted: `${day}/${month}/${year}`,
            dateFormattedShort: `${day}/${month}/${year.slice(-2)}`,
            horaFormatted: `${hour}:${minute}`,
            horaFull: `${hour}:${minute}:${second}`
        };
    }

    return null;
}

// ENDPOINT PARA INFORMES OTT (FILTRO POR DATA ATUAL - AMERICA/SAO_PAULO)
app.get('/api/ott', async (req, res) => {
    const estadoAlvo = (req.query.state || req.query.uf || 'RJ').toUpperCase();
    const hoje = getHojeSaoPaulo();
    
    console.log(`[OTT-REQUEST] Consultando API OTT | Estado: ${estadoAlvo} | Data Alvo: ${hoje.dateFull} (${hoje.inicioDia} às ${hoje.fimDia}) | Timezone: ${hoje.timezone}`);

    let data = null;
    try {
        const ottUrl = 'https://ondetemtiroteio.com/website/ott/report-data.php?action=informes';
        const response = await fetch(ottUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://ondetemtiroteio.com/website/ott/index.html',
                'Accept': 'application/json, text/plain, */*'
            }
        });

        if (response.ok) {
            data = await response.json();
            const totalBr = Array.isArray(data.items) ? data.items.length : 0;
            console.log(`[OTT-RESPONSE] Status HTTP: ${response.status} | Total recebido (Brasil 24h): ${totalBr}`);
        } else {
            console.warn(`[OTT-RESPONSE] Resposta HTTP inesperada da API OTT: ${response.status} ${response.statusText}`);
        }
    } catch (fetchErr) {
        console.warn(`[OTT-RESPONSE] Falha na comunicação com a API OTT:`, fetchErr.message);
    }

    try {
        const parsedAlerts = [];
        let totalEstado24h = 0;
        let descartadosOutrasDatas = 0;

        if (data && Array.isArray(data.items)) {
            // Filtramos alertas do estado desejado (padrão RJ)
            const estadoItems = (estadoAlvo === 'TODOS' || estadoAlvo === 'ALL')
                ? data.items
                : data.items.filter(item => (item.state || '').toUpperCase() === estadoAlvo);

            totalEstado24h = estadoItems.length;
            console.log(`[OTT-PARSE] Total no estado ${estadoAlvo} (feed 24h): ${totalEstado24h}`);

            for (const item of estadoItems) {
                const parsedDate = parseOttDate(item.date);
                
                // Validação de Data Atual no Timezone America/Sao_Paulo (00:00:00 a 23:59:59)
                const isHoje = parsedDate && 
                               parsedDate.day === hoje.day && 
                               parsedDate.month === hoje.month && 
                               parsedDate.year === hoje.year;

                if (isHoje) {
                    parsedAlerts.push({
                        tipo: item.type || "Ocorrência",
                        data: parsedDate.dateFormattedShort, // "DD/MM/YY"
                        dataFull: parsedDate.dateFormatted,   // "DD/MM/YYYY"
                        hora: parsedDate.horaFormatted,       // "HH:mm"
                        bairro: item.neighborhood || "Desconhecido",
                        municipio: item.city || "Rio de Janeiro",
                        estado: item.state || estadoAlvo,
                        lat: item.lat ? parseFloat(item.lat) : -22.9068,
                        lon: item.lng ? parseFloat(item.lng) : -43.1729,
                        endereco: item.address || ""
                    });
                } else {
                    descartadosOutrasDatas++;
                }
            }

            console.log(`[OTT-FILTRO-DATA] Alertas de HOJE (${hoje.dateFull}): ${parsedAlerts.length} | Descartados (outras datas): ${descartadosOutrasDatas}`);
        } else {
            console.warn(`[OTT-PARSE] Nenhum dado de items recebido da fonte OTT.`);
        }

        // Validação de completude e divergência
        if (totalEstado24h !== (parsedAlerts.length + descartadosOutrasDatas)) {
            const diferenca = totalEstado24h - (parsedAlerts.length + descartadosOutrasDatas);
            console.warn(`[OTT-DIVERGENCIA] Divergência na contagem! OTT retornou: ${totalEstado24h} | Processados: ${parsedAlerts.length + descartadosOutrasDatas} | Diferença: ${diferenca}`);
        }

        res.json({
            ok: true,
            alerts: parsedAlerts,
            stats: {
                total_ott_br_24h: data?.items ? data.items.length : 0,
                total_estado_24h: totalEstado24h,
                total_filtrado_hoje: parsedAlerts.length,
                descartados_outras_datas: descartadosOutrasDatas,
                data_referencia: hoje.dateFull,
                timezone: hoje.timezone,
                inicio_dia: hoje.inicioDia,
                fim_dia: hoje.fimDia
            }
        });
    } catch (err) {
        console.error('Erro ao processar informes OTT:', err);
        res.status(500).json({ error: 'Erro ao processar dados do OTT.' });
    }
});

app.get('/api/motorista/atendimento', async (req, res) => {
    try {
        const rawToken = req.query.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
        
        console.log(`[DIAGNOSTICO-MOTORISTA] GET /api/motorista/atendimento chamado.`);
        console.log(`[DIAGNOSTICO-MOTORISTA] Token recebido: "${rawToken || 'NENHUM'}"`);

        if (!rawToken) {
            console.warn(`[DIAGNOSTICO-MOTORISTA] REJEITADO: Token não fornecido.`);
            await registrarEventoSeguranca('CONSULTA_LINK_EXTERNO', 'acessos_externos_atendimento', null, 'PUBLICO', req.ip, req.headers['user-agent'], 'BLOQUEADO', 'TOKEN_NAO_FORNECIDO');
            return res.status(401).json({
                erro: 'LINK_EXPIRADO',
                mensagem: 'Este link não está mais disponível. Entre em contato com o supervisor responsável pela operação.'
            });
        }

        const tokenHash = hashToken(rawToken);
        const tokenPrefix = String(rawToken).substring(0, 8);
        console.log(`[DIAGNOSTICO-MOTORISTA] Token Prefix: "${tokenPrefix}", Token Hash: "${tokenHash}"`);

        const result = await pool.query(
            `SELECT a.*, r.id as rota_id, r.motorista_nome, r.placa_veiculo, r.tipo_veiculo, r.programa,
                    r.origem, r.destino, r.horario, r.horario_termino, r.passageiro, r.nome_colaborador, r.status_atendimento
             FROM acessos_externos_atendimento a
             JOIN rotas_importadas r ON a.id_atendimento = r.id
             WHERE a.token_hash = $1`,
            [tokenHash]
        );

        console.log(`[DIAGNOSTICO-MOTORISTA] Consulta DB por token_hash retornou ${result.rows.length} registros.`);

        if (result.rows.length === 0) {
            console.warn(`[DIAGNOSTICO-MOTORISTA] REJEITADO: Token Hash "${tokenHash}" não localizado no banco (ou rota_importada foi excluída).`);
            await registrarEventoSeguranca('CONSULTA_LINK_EXTERNO', 'acessos_externos_atendimento', null, 'PUBLICO', req.ip, req.headers['user-agent'], 'BLOQUEADO', 'TOKEN_INVALIDO', { token_prefix: tokenPrefix });
            return res.status(401).json({
                erro: 'LINK_EXPIRADO',
                mensagem: 'Este link não está mais disponível. Entre em contato com o supervisor responsável pela operação.'
            });
        }

        const acesso = result.rows[0];
        console.log(`[DIAGNOSTICO-MOTORISTA] Registro encontrado: ID Atendimento=${acesso.id_atendimento}, Status Token=${acesso.status}, Expira Em=${acesso.expira_em}, Status Rota=${acesso.status_atendimento}`);

        // 1. Checa status da rota. Se o atendimento estiver FINALIZADO, ENCERRADO ou CANCELADO, invalida imediatamente o token!
        const statusRota = (acesso.status_atendimento || '').toUpperCase();
        if (['FINALIZADO', 'ENCERRADO', 'CANCELADO'].includes(statusRota)) {
            console.warn(`[DIAGNOSTICO-MOTORISTA] REJEITADO: Atendimento já possui status_atendimento="${statusRota}".`);
            if (acesso.status === 'ATIVO') {
                await pool.query(
                    `UPDATE acessos_externos_atendimento 
                     SET status = 'FINALIZADO', finalizado_em = NOW(), motivo_finalizacao = 'ATENDIMENTO_CONCLUIDO' 
                     WHERE id = $1`,
                    [acesso.id]
                );
            }
            await registrarEventoSeguranca('CONSULTA_LINK_EXTERNO', 'acessos_externos_atendimento', acesso.id_atendimento, 'PUBLICO', req.ip, req.headers['user-agent'], 'BLOQUEADO', 'ATENDIMENTO_FINALIZADO', { token_prefix: tokenPrefix, status_atendimento: statusRota });
            return res.status(401).json({
                erro: 'LINK_EXPIRADO',
                mensagem: 'Este link não está mais disponível. Entre em contato com o supervisor responsável pela operação.'
            });
        }

        // 2. Checa status do token, validade de tempo e expiração por inatividade (padrão 30 minutos ou LINK_INATIVIDADE_MINUTOS)
        const minInatividade = parseInt(process.env.LINK_INATIVIDADE_MINUTOS, 10) || 30;
        const ultimaInteracao = acesso.usado_em ? new Date(acesso.usado_em) : new Date(acesso.criado_em);
        const limiteInatividade = new Date(Date.now() - minInatividade * 60 * 1000);

        console.log(`[DIAGNOSTICO-MOTORISTA] Validação Token: status="${acesso.status}", expira_em="${acesso.expira_em}", ultimaInteracao="${ultimaInteracao.toISOString()}", limiteInatividade="${limiteInatividade.toISOString()}"`);

        if (acesso.status !== 'ATIVO' || new Date(acesso.expira_em) < new Date() || ultimaInteracao < limiteInatividade) {
            let tipoEventoAudit = 'CONSULTA_LINK_EXTERNO';
            let motivoBloqueio = 'TOKEN_EXPIRADO_OU_INATIVO';

            if (ultimaInteracao < limiteInatividade && acesso.status === 'ATIVO') {
                tipoEventoAudit = 'TOKEN_EXPIRADO_POR_INATIVIDADE';
                motivoBloqueio = 'Inatividade superior ao limite configurado';
                console.warn(`[DIAGNOSTICO-MOTORISTA] REJEITADO: Token inativo por mais de ${minInatividade} minutos.`);
                await pool.query(
                    `UPDATE acessos_externos_atendimento 
                     SET status = 'EXPIRADO', motivo_finalizacao = 'Inatividade superior ao limite configurado' 
                     WHERE id = $1`,
                    [acesso.id]
                );
            } else if (acesso.status === 'ATIVO' && new Date(acesso.expira_em) < new Date()) {
                console.warn(`[DIAGNOSTICO-MOTORISTA] REJEITADO: Token excedeu data de expiração (${acesso.expira_em}).`);
                await pool.query("UPDATE acessos_externos_atendimento SET status = 'EXPIRADO' WHERE id = $1", [acesso.id]);
            } else {
                console.warn(`[DIAGNOSTICO-MOTORISTA] REJEITADO: Token status="${acesso.status}" diferente de ATIVO.`);
            }

            await registrarEventoSeguranca(tipoEventoAudit, 'acessos_externos_atendimento', acesso.id_atendimento, 'PUBLICO', req.ip, req.headers['user-agent'], 'BLOQUEADO', motivoBloqueio, { token_prefix: tokenPrefix, status_token: acesso.status, inatividade_minutos: minInatividade });
            return res.status(401).json({
                erro: 'LINK_EXPIRADO',
                mensagem: 'Este link não está mais disponível. Entre em contato com o supervisor responsável pela operação.'
            });
        }

        // Marca uso do token
        await pool.query('UPDATE acessos_externos_atendimento SET usado_em = NOW() WHERE id = $1', [acesso.id]);
        await registrarEventoSeguranca('CONSULTA_LINK_EXTERNO', 'acessos_externos_atendimento', acesso.id_atendimento, 'PUBLICO', req.ip, req.headers['user-agent'], 'SUCESSO', 'CONSULTA_AUTORIZADA', { token_prefix: tokenPrefix });

        // Retorna payload mínimo sem PII sensível (sem telefone de passageiro, sem e-mail, sem matrícula)
        const nomeMinimizado = minimizarNome(acesso.passageiro || acesso.nome_colaborador);
        const payloadRetorno = {
            ok: true,
            atendimento: {
                id_atendimento: acesso.rota_id,
                motorista_nome: acesso.motorista_nome || 'Motorista RIT',
                placa_veiculo: acesso.placa_veiculo || 'N/D',
                tipo_veiculo: acesso.tipo_veiculo || 'Executivo',
                programa: acesso.programa || 'RIT',
                origem: acesso.origem,
                destino: acesso.destino,
                horario: acesso.horario,
                horario_termino: acesso.horario_termino,
                status_atendimento: acesso.status_atendimento || 'PENDENTE',
                passageiro_resumido: nomeMinimizado,
                passageiro: nomeMinimizado,
                nome_colaborador: nomeMinimizado
            }
        };

        console.log(`[DIAGNOSTICO-MOTORISTA] SUCESSO: Payload entregue para id_atendimento=${acesso.rota_id}, passageiro="${nomeMinimizado}".`);
        res.json(payloadRetorno);
    } catch (err) {
        console.error('[DIAGNOSTICO-MOTORISTA] ERRO CRÍTICO no GET /api/motorista/atendimento:', err);
        res.status(500).json({ error: 'Erro interno ao processar requisição.' });
    }
});

app.post('/api/motorista/finalizar', async (req, res) => {
    try {
        const { token } = req.body;
        console.log(`[DIAGNOSTICO-MOTORISTA] POST /api/motorista/finalizar chamado. Token: "${token || 'NENHUM'}"`);

        if (!token) {
            console.warn(`[DIAGNOSTICO-MOTORISTA] FINALIZAR REJEITADO: Token não fornecido.`);
            return res.status(400).json({ error: 'TOKEN_INVALIDO', mensagem: 'Token de acesso não fornecido.' });
        }

        const tokenHash = hashToken(token);
        const tokenPrefix = String(token).substring(0, 8);
        console.log(`[DIAGNOSTICO-MOTORISTA] Finalizar Prefix: "${tokenPrefix}", Hash: "${tokenHash}"`);

        const tokenRes = await pool.query(
            `SELECT a.*, r.id as id_rota, r.motorista_nome as rota_motorista
             FROM acessos_externos_atendimento a
             JOIN rotas_importadas r ON a.id_atendimento = r.id
             WHERE a.token_hash = $1`,
            [tokenHash]
        );

        if (tokenRes.rows.length === 0) {
            console.warn(`[DIAGNOSTICO-MOTORISTA] FINALIZAR REJEITADO: Token Hash "${tokenHash}" não localizado.`);
            return res.status(401).json({ erro: 'LINK_EXPIRADO', mensagem: 'Este link não está mais disponível. Entre em contato com o supervisor responsável pela operação.' });
        }

        const acesso = tokenRes.rows[0];
        const idAtendimentoInt = acesso.id_rota;
        console.log(`[DIAGNOSTICO-MOTORISTA] Finalizando Atendimento ID=${idAtendimentoInt}, Rota Motorista="${acesso.rota_motorista}"`);

        // 1. Atualiza status da rota para FINALIZADO
        await pool.query("UPDATE rotas_importadas SET status_atendimento = 'FINALIZADO' WHERE id = $1", [idAtendimentoInt]);

        // 2. Invalida imediatamente todos os tokens ativos vinculados a este atendimento
        await pool.query(
            `UPDATE acessos_externos_atendimento 
             SET status = 'FINALIZADO', finalizado_em = NOW(), motivo_finalizacao = 'FINALIZADO_PELO_MOTORISTA' 
             WHERE id_atendimento = $1 AND status = 'ATIVO'`,
            [idAtendimentoInt]
        );

        // 3. Remove do mapa ativo e registra historico/auditoria
        if (acesso.rota_motorista) {
            await pool.query('DELETE FROM posicoes_motoristas WHERE motorista_nome = $1', [acesso.rota_motorista]);
        }
        await pool.query(
            "INSERT INTO historico_atendimentos (id_atendimento, evento, data_hora) VALUES ($1, 'Atendimento finalizado pelo motorista', NOW())",
            [idAtendimentoInt]
        );

        await registrarEventoSeguranca('UPDATE_GPS', 'rotas_importadas', idAtendimentoInt, acesso.rota_motorista || 'MOTORISTA', req.ip, req.headers['user-agent'], 'SUCESSO', 'ATENDIMENTO_FINALIZADO_TOKEN_REVOGADO', { token_prefix: tokenPrefix });

        console.log(`[DIAGNOSTICO-MOTORISTA] FINALIZADO COM SUCESSO: id_atendimento=${idAtendimentoInt}`);
        return res.json({
            ok: true,
            mensagem: 'Atendimento finalizado com sucesso.'
        });
    } catch (err) {
        console.error('[DIAGNOSTICO-MOTORISTA] ERRO CRÍTICO no POST /api/motorista/finalizar:', err);
        res.status(500).json({ error: 'Erro interno ao finalizar atendimento.' });
    }
});

app.get('/api/rotas/detalhes/:id', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });
        const result = await pool.query('SELECT * FROM rotas_importadas WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Rota não encontrada.' });
        
        const rota = result.rows[0];
        rota.data_atendimento = extrairDataDeHorario(rota.horario);
        
        await registrarEventoSeguranca('CONSULTA_ROTA_OPERADOR', 'rotas_importadas', id, req.user?.matricula || 'OPERADOR', req.ip, req.headers['user-agent'], 'SUCESSO', 'ACESSO_JWT');
        res.json({ ok: true, rota });
    } catch (err) {
        console.error('Erro ao buscar detalhes da rota:', err.message);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

app.get('/api/rotas/listar', async (req, res) => {
    try {
        const loteResult = await pool.query('SELECT id FROM lotes_importacao ORDER BY id DESC LIMIT 1');
        if (loteResult.rows.length === 0) {
            return res.json({ ok: true, resultados: [] });
        }
        const lastLoteId = loteResult.rows[0].id;
        const rotasResult = await pool.query(
            'SELECT * FROM rotas_importadas WHERE id_lote = $1 ORDER BY id ASC',
            [lastLoteId]
        );
        const rotas = rotasResult.rows.map(r => {
            r.data_atendimento = extrairDataDeHorario(r.horario);
            return r;
        });
        res.json({ ok: true, resultados: rotas });
    } catch (err) {
        console.error('Erro ao listar rotas do lote:', err);
        res.status(500).json({ error: 'Erro interno ao carregar base.' });
    }
});

// APIs Oficiais de Atendimento conforme Requisito
app.get('/api/atendimentos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });
        const result = await pool.query('SELECT * FROM rotas_importadas WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Atendimento não encontrado.' });
        
        const rota = result.rows[0];
        rota.data_atendimento = extrairDataDeHorario(rota.horario);
        
        res.json({ ok: true, atendimento: rota });
    } catch (err) {
        console.error('Erro ao buscar atendimento:', err);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

app.get('/api/atendimentos/:id/historico', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });
        
        // Busca histórico persistido
        const result = await pool.query('SELECT * FROM historico_atendimentos WHERE id_atendimento = $1 ORDER BY data_hora ASC', [id]);
        
        // Mapeia os dados do banco
        const timeline = result.rows.map(row => ({
            data_hora: row.data_hora,
            evento: row.evento
        }));
        
        res.json({ ok: true, historico: timeline });
    } catch (err) {
        console.error('Erro ao buscar histórico:', err);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

// Helper de distância haversine para telemetria
function calcularDistanciaGps(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

app.get('/api/atendimentos/:id/track', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

        // Detalhes da Rota
        const rRes = await pool.query('SELECT * FROM rotas_importadas WHERE id = $1', [id]);
        if (rRes.rows.length === 0) return res.status(404).json({ error: 'Atendimento não encontrado.' });
        const rota = rRes.rows[0];

        // Trilha GPS
        const trackRes = await pool.query('SELECT * FROM gps_historico_atendimento WHERE id_atendimento = $1 ORDER BY data_hora ASC', [id]);
        let points = trackRes.rows;

        // Se a trilha está vazia, mas o motorista tem uma posição ativa, inicializamos o início retroativo
        if (points.length === 0) {
            const posRes = await pool.query(
                `SELECT p.* FROM posicoes_motoristas p 
                 JOIN rotas_importadas r ON p.motorista_nome = r.motorista_nome
                 WHERE r.id = $1`, [id]
            );
            if (posRes.rows.length > 0) {
                const pos = posRes.rows[0];
                const newPt = {
                    id_atendimento: id,
                    latitude: parseFloat(pos.lat),
                    longitude: parseFloat(pos.lng),
                    velocidade: parseFloat(pos.speed) || 0,
                    data_hora: pos.timestamp || new Date(),
                    precisao: 10,
                    status: rota.status_atendimento || 'EM_TRANSITO',
                    tipo_evento: 'INICIO',
                    fonte_localizacao: 'GPS'
                };
                points = [newPt];

                // Salva no banco para que o histórico continue gravando a partir daqui
                await pool.query(
                    `INSERT INTO gps_historico_atendimento 
                     (id_atendimento, latitude, longitude, velocidade, data_hora, precisao, status, tipo_evento, fonte_localizacao)
                     VALUES ($1, $2, $3, $4, $5, 10, $6, 'INICIO', 'GPS')`,
                    [id, pos.lat, pos.lng, pos.speed || 0, pos.timestamp || new Date(), rota.status_atendimento || 'EM_TRANSITO']
                );
            }
        }

        // Metadados básicos
        const metadata = {
            id: rota.id,
            motorista: rota.motorista_nome || rota.motorista || 'Não informado',
            veiculo: rota.tipo_veiculo || rota.tipoVeiculo || 'N/D',
            placa: rota.placa_veiculo || rota.placa || 'N/D',
            programa: rota.programa || 'RIT',
            distancia_prevista: parseFloat(rota.distancia_km) || 0,
            origem: rota.origem,
            destino: rota.destino
        };

        const onlineRes = await pool.query('SELECT COUNT(*) FROM posicoes_motoristas WHERE motorista_nome = $1', [rota.motorista_nome]);
        const veiculoOnline = parseInt(onlineRes.rows[0].count, 10) > 0;

        const totalPosicoes = points.length;
        const rastreamentoDisponivel = totalPosicoes > 0;
        let classificacaoTrack = 'SEM_TELEMETRIA';
        if (totalPosicoes === 0) {
            classificacaoTrack = 'SEM_TELEMETRIA';
        } else if (veiculoOnline) {
            classificacaoTrack = 'RASTREAMENTO_ATIVO';
        } else {
            classificacaoTrack = 'HISTORICO_DISPONIVEL';
        }

        console.log('[TRACK]', {
            atendimento: id,
            placa: metadata.placa,
            motorista: metadata.motorista,
            total_posicoes: totalPosicoes,
            veiculo_online: veiculoOnline,
            classificacao: classificacaoTrack
        });

        if (points.length === 0) {
            return res.json({
                ok: true,
                metadata,
                points: [],
                total_posicoes: 0,
                veiculo_online: veiculoOnline,
                rastreamento_disponivel: false,
                classificacao_track: classificacaoTrack,
                metrics: {
                    distancia_percorrida: 0,
                    distancia_linha_reta: 0,
                    tempo_total: '0 min',
                    tempo_total_min: 0,
                    tempo_rodando_min: 0,
                    tempo_parado_min: 0,
                    maior_parada_min: 0,
                    qtd_paradas: 0,
                    velocidade_media: 0,
                    velocidade_maxima: 0,
                    precisao_media: 0,
                    maior_falha_sinal_min: 0,
                    total_pontos: 0,
                    classificacao: 'SEM TELEMETRIA'
                }
            });
        }

        // Calculos de Distancia e Velocidade
        let distPercorrida = 0;
        let velMaxima = 0;
        let velSoma = 0;
        let precSoma = 0;
        let maiorFalhaSinalMs = 0;
        let tempoParadoMs = 0;
        let maiorParadaMs = 0;
        let qtdParadas = 0;

        const firstPt = points[0];
        const lastPt = points[points.length - 1];
        const distLinhaReta = calcularDistanciaGps(
            parseFloat(firstPt.latitude), parseFloat(firstPt.longitude),
            parseFloat(lastPt.latitude), parseFloat(lastPt.longitude)
        );

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const v = parseFloat(p.velocidade) || 0;
            velSoma += v;
            precSoma += parseFloat(p.precisao) || 10;
            if (v > velMaxima) velMaxima = v;

            if (i > 0) {
                const prev = points[i - 1];
                const d = calcularDistanciaGps(
                    parseFloat(prev.latitude), parseFloat(prev.longitude),
                    parseFloat(p.latitude), parseFloat(p.longitude)
                );
                distPercorrida += d;

                // Gap de tempo / perda de sinal
                const diffMs = new Date(p.data_hora) - new Date(prev.data_hora);
                if (diffMs > 5 * 60 * 1000) {
                    if (diffMs > maiorFalhaSinalMs) {
                        maiorFalhaSinalMs = diffMs;
                    }
                }

                // Calculo de tempo parado (quando speed === 0 consecutivamente)
                if (parseFloat(prev.velocidade) === 0 && parseFloat(p.velocidade) === 0) {
                    tempoParadoMs += diffMs;
                    if (diffMs > maiorParadaMs) {
                        maiorParadaMs = diffMs;
                    }
                    if (diffMs >= 2 * 60 * 1000) {
                        qtdParadas++;
                    }
                }
            }
        }

        const tempoTotalMs = new Date(lastPt.data_hora) - new Date(firstPt.data_hora);
        const tempoTotalMin = Math.round(tempoTotalMs / 60000);
        const tempoParadoMin = Math.round(tempoParadoMs / 60000);
        const tempoRodandoMin = Math.max(0, tempoTotalMin - tempoParadoMin);

        // Classificação Automática
        let classificacao = 'Dentro da Rota';
        const distPrevista = metadata.distancia_prevista;
        if (distPrevista > 0 && (distPercorrida - distPrevista > 5 || distPercorrida / distPrevista > 1.3)) {
            classificacao = 'Possível Desvio';
        } else if (tempoParadoMin > 30) {
            classificacao = 'Tempo Parado Elevado';
        } else if (maiorFalhaSinalMs > 15 * 60 * 1000) {
            classificacao = 'Falha de Sinal';
        } else if (velMaxima > 80) {
            classificacao = 'Velocidade Excessiva';
        }

        res.json({
            ok: true,
            metadata,
            points,
            total_posicoes: totalPosicoes,
            veiculo_online: veiculoOnline,
            rastreamento_disponivel: true,
            classificacao_track: classificacaoTrack,
            metrics: {
                distancia_percorrida: parseFloat(distPercorrida.toFixed(2)),
                distancia_linha_reta: parseFloat(distLinhaReta.toFixed(2)),
                tempo_total: tempoTotalMin + ' min',
                tempo_total_min: tempoTotalMin,
                tempo_rodando_min: tempoRodandoMin,
                tempo_parado_min: tempoParadoMin,
                maior_parada_min: Math.round(maiorParadaMs / 60000),
                qtd_paradas: qtdParadas,
                velocidade_media: Math.round(velSoma / points.length),
                velocidade_maxima: velMaxima,
                precisao_media: Math.round(precSoma / points.length),
                maior_falha_sinal_min: Math.round(maiorFalhaSinalMs / 60000),
                total_pontos: points.length,
                classificacao: classificacaoTrack
            }
        });
    } catch (err) {
        console.error('Erro no track do atendimento:', err);
        res.status(500).json({ error: 'Erro interno ao obter telemetria.' });
    }
});

app.get('/api/atendimentos/:id/auditoria-consolidada', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

        const histRes = await pool.query('SELECT * FROM historico_atendimentos WHERE id_atendimento = $1', [id]);
        const gpsEventsRes = await pool.query("SELECT * FROM gps_historico_atendimento WHERE id_atendimento = $1 AND tipo_evento IN ('INICIO', 'PARADA', 'FIM') ORDER BY data_hora ASC", [id]);

        const merged = [];
        
        histRes.rows.forEach(r => {
            merged.push({
                data_hora: r.data_hora,
                evento: r.evento,
                tipo: 'OPERACIONAL'
            });
        });

        gpsEventsRes.rows.forEach(r => {
            let label = r.tipo_evento === 'INICIO' ? 'Compartilhamento iniciado'
                      : r.tipo_evento === 'FIM' ? 'Compartilhamento encerrado'
                      : `Parada detectada (Velocidade: 0 km/h)`;
            merged.push({
                data_hora: r.data_hora,
                evento: label,
                tipo: 'TELEMETRIA',
                latitude: r.latitude,
                longitude: r.longitude
            });
        });

        // Ordenacao Cronologica
        merged.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

        res.json({ ok: true, timeline: merged });
    } catch (err) {
        console.error('Erro na auditoria consolidada:', err);
        res.status(500).json({ error: 'Erro interno ao buscar auditoria.' });
    }
});

app.post('/api/gps/update', async (req, res) => {
    try {
        const { token, motorista, lat, lng, placa, tipo_veiculo, programa, speed, status_atendimento, precisao, fonte_localizacao } = req.body;
        
        // 1. Exige token opaco
        if (!token) {
            await registrarEventoSeguranca('UPDATE_GPS', 'gps_historico_atendimento', null, motorista || 'ANONIMO', req.ip, req.headers['user-agent'], 'BLOQUEADO', 'TOKEN_GPS_NAO_FORNECIDO');
            return res.status(401).json({ error: 'TOKEN_INVALIDO', mensagem: 'Token de acesso inválido ou não fornecido.' });
        }

        const tokenHash = hashToken(token);
        const tokenPrefix = String(token).substring(0, 8);

        // Busca o token e a rota vinculada
        const tokenRes = await pool.query(
            `SELECT a.*, r.id as id_rota, r.status_atendimento as rota_status, r.motorista_nome as rota_motorista
             FROM acessos_externos_atendimento a
             JOIN rotas_importadas r ON a.id_atendimento = r.id
             WHERE a.token_hash = $1`,
            [tokenHash]
        );

        if (tokenRes.rows.length === 0) {
            await registrarEventoSeguranca('UPDATE_GPS', 'acessos_externos_atendimento', null, motorista || 'ANONIMO', req.ip, req.headers['user-agent'], 'BLOQUEADO', 'TOKEN_GPS_INVALIDO', { token_prefix: tokenPrefix });
            return res.status(401).json({ error: 'LINK_EXPIRADO', mensagem: 'Este link não está mais disponível. Entre em contato com o supervisor responsável pela operação.' });
        }

        const acesso = tokenRes.rows[0];
        const idAtendimentoInt = acesso.id_rota;

        // 2. Checa se o atendimento está FINALIZADO, ENCERRADO ou CANCELADO
        const currentStatusRota = (acesso.rota_status || '').toUpperCase();
        if (['FINALIZADO', 'ENCERRADO', 'CANCELADO'].includes(currentStatusRota)) {
            if (acesso.status === 'ATIVO') {
                await pool.query(
                    `UPDATE acessos_externos_atendimento 
                     SET status = 'FINALIZADO', finalizado_em = NOW(), motivo_finalizacao = 'ATENDIMENTO_CONCLUIDO' 
                     WHERE id = $1`,
                    [acesso.id]
                );
            }
            await registrarEventoSeguranca('UPDATE_GPS', 'rotas_importadas', idAtendimentoInt, motorista || acesso.rota_motorista, req.ip, req.headers['user-agent'], 'BLOQUEADO', 'ATENDIMENTO_FINALIZADO', { token_prefix: tokenPrefix });
            return res.status(409).json({
                erro: 'ATENDIMENTO_FINALIZADO',
                mensagem: 'O atendimento foi finalizado e o compartilhamento de localização foi encerrado.'
            });
        }

        // 3. Checa validade do token e expiração por inatividade (padrão 30 minutos ou LINK_INATIVIDADE_MINUTOS)
        const minInatividadeGPS = parseInt(process.env.LINK_INATIVIDADE_MINUTOS, 10) || 30;
        const ultimaInteracaoGPS = acesso.usado_em ? new Date(acesso.usado_em) : new Date(acesso.criado_em);
        const limiteInatividadeGPS = new Date(Date.now() - minInatividadeGPS * 60 * 1000);

        if (acesso.status !== 'ATIVO' || new Date(acesso.expira_em) < new Date() || ultimaInteracaoGPS < limiteInatividadeGPS) {
            let tipoEventoAuditGPS = 'UPDATE_GPS';
            let motivoBloqueioGPS = 'TOKEN_EXPIRADO_OU_INATIVO';

            if (ultimaInteracaoGPS < limiteInatividadeGPS && acesso.status === 'ATIVO') {
                tipoEventoAuditGPS = 'TOKEN_EXPIRADO_POR_INATIVIDADE';
                motivoBloqueioGPS = 'Inatividade superior ao limite configurado';
                await pool.query(
                    `UPDATE acessos_externos_atendimento 
                     SET status = 'EXPIRADO', motivo_finalizacao = 'Inatividade superior ao limite configurado' 
                     WHERE id = $1`,
                    [acesso.id]
                );
            }

            await registrarEventoSeguranca(tipoEventoAuditGPS, 'acessos_externos_atendimento', idAtendimentoInt, motorista || acesso.rota_motorista, req.ip, req.headers['user-agent'], 'BLOQUEADO', motivoBloqueioGPS, { token_prefix: tokenPrefix, inatividade_minutos: minInatividadeGPS });
            return res.status(401).json({
                erro: 'LINK_EXPIRADO',
                mensagem: 'Este link não está mais disponível. Entre em contato com o supervisor responsável pela operação.'
            });
        }

        // Atualiza marca de última atividade GPS
        await pool.query('UPDATE acessos_externos_atendimento SET usado_em = NOW() WHERE id = $1', [acesso.id]);

        // 4. Validação estrita de coordenadas e velocidade
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        const velocidade = parseFloat(speed) || 0;
        const prec = parseFloat(precisao) || 10;

        if (isNaN(latitude) || latitude < -90 || latitude > 90 ||
            isNaN(longitude) || longitude < -180 || longitude > 180 ||
            velocidade < 0 || velocidade > 200) {
            await registrarEventoSeguranca('UPDATE_GPS', 'gps_historico_atendimento', idAtendimentoInt, motorista || acesso.rota_motorista, req.ip, req.headers['user-agent'], 'BLOQUEADO', 'COORDENADAS_INVALIDAS', { lat, lng, speed });
            return res.status(400).json({
                erro: 'COORDENADAS_INVALIDAS',
                mensagem: 'Coordenadas geográficas ou dados de velocidade fora dos limites operacionais.'
            });
        }

        const motNome = motorista || acesso.rota_motorista || 'Motorista RIT';

        // Upsert na tabela posicoes_motoristas (somente se não finalizado)
        await pool.query(
            `INSERT INTO posicoes_motoristas (motorista_nome, lat, lng, placa, tipo_veiculo, programa, speed, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (motorista_nome) DO UPDATE 
             SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, placa = EXCLUDED.placa, 
                 tipo_veiculo = EXCLUDED.tipo_veiculo, programa = EXCLUDED.programa, 
                 speed = EXCLUDED.speed, timestamp = NOW()`,
            [motNome, latitude, longitude, placa, tipo_veiculo, programa, Math.round(velocidade)]
        );

        // Gravação da trilha GPS na tabela de histórico
        const countPointsRes = await pool.query('SELECT COUNT(*) FROM gps_historico_atendimento WHERE id_atendimento = $1', [idAtendimentoInt]);
        const isFirst = parseInt(countPointsRes.rows[0].count, 10) === 0;

        let tipoEv = 'GPS';
        if (isFirst) {
            tipoEv = 'INICIO';
        } else if (velocidade === 0) {
            tipoEv = 'PARADA';
        }

        await pool.query(
            `INSERT INTO gps_historico_atendimento 
             (id_atendimento, latitude, longitude, velocidade, data_hora, precisao, status, tipo_evento, fonte_localizacao)
             VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)`,
            [idAtendimentoInt, latitude, longitude, velocidade, prec, status_atendimento || currentStatusRota || 'EM_TRANSITO', tipoEv, fonte_localizacao || 'GPS']
        );

        // Se status_atendimento for passado e houver transição de estado
        if (status_atendimento) {
            const statusNorm = String(status_atendimento).toUpperCase();
            await pool.query('UPDATE rotas_importadas SET status_atendimento = $1 WHERE id = $2', [statusNorm, idAtendimentoInt]);

            let eventText = `Alteração de status para ${statusNorm}`;
            if (statusNorm === 'EM_TRANSITO') eventText = 'Viagem iniciada';
            else if (statusNorm === 'PAUSADO') eventText = 'Transmissão interrompida';
            else if (statusNorm === 'FINALIZADO') eventText = 'Atendimento finalizado';

            await pool.query(
                'INSERT INTO historico_atendimentos (id_atendimento, evento, data_hora) VALUES ($1, $2, NOW())',
                [idAtendimentoInt, eventText]
            );

            // SE O MOTORISTA FINALIZOU A CORRIDA: Invalida o token opaco imediatamente!
            if (statusNorm === 'FINALIZADO') {
                await pool.query(
                    `UPDATE acessos_externos_atendimento 
                     SET status = 'FINALIZADO', finalizado_em = NOW(), motivo_finalizacao = 'FINALIZADO_PELO_MOTORISTA' 
                     WHERE id_atendimento = $1 AND status = 'ATIVO'`,
                    [idAtendimentoInt]
                );
                await pool.query(
                    `INSERT INTO gps_historico_atendimento 
                     (id_atendimento, latitude, longitude, velocidade, data_hora, precisao, status, tipo_evento, fonte_localizacao)
                     VALUES ($1, $2, $3, 0, NOW(), 10, 'FINALIZADO', 'FIM', 'GPS')`,
                    [idAtendimentoInt, latitude, longitude]
                );
                await pool.query('DELETE FROM posicoes_motoristas WHERE motorista_nome = $1', [motNome]);
                await registrarEventoSeguranca('UPDATE_GPS', 'rotas_importadas', idAtendimentoInt, motNome, req.ip, req.headers['user-agent'], 'SUCESSO', 'ATENDIMENTO_FINALIZADO_TOKEN_REVOGADO');

                return res.json({
                    ok: true,
                    erro: 'ATENDIMENTO_FINALIZADO',
                    mensagem: 'O atendimento foi finalizado e o compartilhamento de localização foi encerrado.'
                });
            }
        }

        console.log('[TRACK]', {
            atendimento: idAtendimentoInt,
            token_prefix: tokenPrefix,
            speed: Math.round(velocidade),
            status: status_atendimento || currentStatusRota
        });

        res.json({ ok: true, message: 'Localização atualizada com sucesso.' });
    } catch (err) {
        console.error('Erro ao salvar geolocalização:', err.message);
        res.status(500).json({ error: 'Erro ao processar localização.' });
    }
});

app.get('/api/gps/active-trackers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, p.motorista_nome AS motorista_name, r.id as id_rota, r.status_atendimento, r.motorista_telefone,
                   r.passageiro, r.origem, r.destino, r.horario, r.horario_termino, r.placa_veiculo, r.tipo_veiculo,
                   r.ot, r.codigo_ot_detalhado
            FROM posicoes_motoristas p
            LEFT JOIN (
                SELECT DISTINCT ON (motorista_nome) id, motorista_nome, status_atendimento, motorista_telefone,
                       passageiro, origem, destino, horario, horario_termino, placa_veiculo, tipo_veiculo,
                       ot, codigo_ot_detalhado
                FROM rotas_importadas 
                ORDER BY motorista_nome, id DESC
            ) r ON p.motorista_nome = r.motorista_nome
        `);
        const trackers = result.rows.map(t => {
            t.data_atendimento = extrairDataDeHorario(t.horario);
            return t;
        });
        res.json({ ok: true, trackers });
    } catch (err) {
        console.error('Erro ao buscar motoristas ativos:', err);
        res.status(500).json({ error: 'Erro ao obter rastreamentos ativos.' });
    }
});

app.post('/api/gps/desconectar', async (req, res) => {
    try {
        const { id_rota, motorista } = req.body;
        if (!id_rota && !motorista) {
            return res.status(400).json({ error: 'ID da rota ou Nome do motorista é obrigatório.' });
        }
        
        if (id_rota) {
            const result = await pool.query('SELECT motorista_nome FROM rotas_importadas WHERE id = $1', [id_rota]);
            if (result.rows.length > 0) {
                const mot = result.rows[0].motorista_nome;
                await pool.query('DELETE FROM posicoes_motoristas WHERE motorista_nome = $1', [mot]);
            }
            await pool.query(
                `UPDATE rotas_importadas SET status_atendimento = 'FINALIZADO' WHERE id = $1`,
                [id_rota]
            );
            await pool.query(
                `UPDATE acessos_externos_atendimento SET status = 'FINALIZADO', finalizado_em = NOW(), motivo_finalizacao = 'DESCONECTADO_MANUAL' WHERE id_atendimento = $1 AND status = 'ATIVO'`,
                [id_rota]
            );
        } else if (motorista) {
            await pool.query('DELETE FROM posicoes_motoristas WHERE motorista_nome = $1', [motorista]);
        }
        
        res.json({ ok: true, message: 'Motorista desconectado com sucesso.' });
    } catch (err) {
        console.error('Erro ao desconectar motorista:', err);
        res.status(500).json({ error: 'Erro interno ao desconectar.' });
    }
});

app.get('/api/robot/status', (req, res) => {
    res.json(getRobotStatus());
});

app.post('/api/robot/run', async (req, res) => {
    try {
        const status = await triggerDiagnostics();
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auditoria/solicitar-posicao', async (req, res) => {
    try {
        const { atendimento, placa, motorista, supervisor_email, empresa_cooperativa } = req.body;
        const usuario = req.headers['x-user-matricula'] || 'Operador Equipe de Transportes';

        const idAtendimento = parseInt(atendimento, 10);
        console.log(`[DIAGNOSTICO-MOTORISTA] POST /api/auditoria/solicitar-posicao recebido para atendimento="${atendimento}" (parsed=${idAtendimento}).`);

        if (isNaN(idAtendimento)) {
            console.warn(`[DIAGNOSTICO-MOTORISTA] GERAR TOKEN REJEITADO: ID Atendimento inválido (${atendimento}).`);
            return res.status(400).json({ error: 'ID do atendimento inválido.' });
        }

        // Verifica se o atendimento existe
        const rRes = await pool.query('SELECT id, motorista_nome, placa_veiculo, status_atendimento FROM rotas_importadas WHERE id = $1', [idAtendimento]);
        console.log(`[DIAGNOSTICO-MOTORISTA] Consulta rotas_importadas por id=${idAtendimento} retornou ${rRes.rows.length} registros.`);

        if (rRes.rows.length === 0) {
            console.warn(`[DIAGNOSTICO-MOTORISTA] GERAR TOKEN REJEITADO: id_atendimento ${idAtendimento} não encontrado no banco rotas_importadas.`);
            return res.status(404).json({ error: 'Atendimento não encontrado.' });
        }

        const rota = rRes.rows[0];
        console.log(`[DIAGNOSTICO-MOTORISTA] Rota encontrada: id=${rota.id}, motorista="${rota.motorista_nome}", status_atendimento="${rota.status_atendimento}"`);

        // Se a rota já estiver finalizada, rejeita nova geração de token
        if (['FINALIZADO', 'ENCERRADO', 'CANCELADO'].includes((rota.status_atendimento || '').toUpperCase())) {
            console.warn(`[DIAGNOSTICO-MOTORISTA] GERAR TOKEN REJEITADO: Rota ${idAtendimento} está com status "${rota.status_atendimento}".`);
            return res.status(400).json({ error: 'Não é possível solicitar posicionamento para um atendimento já finalizado.' });
        }

        // Revoga tokens antigos ativos para o mesmo atendimento
        await pool.query(
            `UPDATE acessos_externos_atendimento SET status = 'REVOGADO', revogado_em = NOW() WHERE id_atendimento = $1 AND status = 'ATIVO'`,
            [idAtendimento]
        );

        // Gerar novo token opaco de alta entropia
        const pureToken = generateOpaqueToken();
        const tokenHash = hashToken(pureToken);
        const tokenPrefix = pureToken.substring(0, 8);

        // Validade de 24 horas para o link
        const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000);

        console.log(`[DIAGNOSTICO-MOTORISTA] Token Gerado! PureToken: "${pureToken}", Prefix: "${tokenPrefix}", Hash: "${tokenHash}", ExpiraEm: "${expiraEm.toISOString()}"`);

        const insertRes = await pool.query(
            `INSERT INTO acessos_externos_atendimento 
             (id_atendimento, token_hash, token_prefix, escopo, status, criado_em, expira_em, criado_por, supervisor_destinatario, empresa_cooperativa, ip_criacao, user_agent_criacao)
             VALUES ($1, $2, $3, 'POSICIONAMENTO_MOTORISTA', 'ATIVO', NOW(), $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [idAtendimento, tokenHash, tokenPrefix, expiraEm, usuario, supervisor_email || null, empresa_cooperativa || null, req.ip, req.headers['user-agent']]
        );

        console.log(`[DIAGNOSTICO-MOTORISTA] Token gravado no PostgreSQL com Sucesso! acessos_externos_atendimento.id = ${insertRes.rows[0]?.id}`);

        // Grava auditoria operacional
        await pool.query(
            `INSERT INTO auditoria_operacional (usuario, atendimento, placa, motorista, data_hora, evento)
             VALUES ($1, $2, $3, $4, NOW(), 'SOLICITACAO_POSICAO_GPS')`,
            [usuario, idAtendimento, placa || rota.placa_veiculo || null, motorista || rota.motorista_nome || null]
        );

        await registrarEventoSeguranca('SOLICITAR_POSICAO', 'rotas_importadas', idAtendimento, usuario, req.ip, req.headers['user-agent'], 'SUCESSO', 'TOKEN_GERADO', { token_prefix: tokenPrefix, supervisor: supervisor_email || 'NAO_CADASTRADO' });

        const host = req.get('host');
        const protocol = req.protocol || 'https';
        const link = `${protocol}://${host}/motorista.html?token=${pureToken}`;

        let emailEnviado = false;
        let emailMensagem = 'Supervisor não cadastrado. Copie o link abaixo e envie ao supervisor responsável pela operação.';

        // Disparo SMTP se e-mail do supervisor estiver presente e SMTP configurado
        if (supervisor_email && process.env.SMTP_HOST && process.env.SMTP_USER) {
            try {
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: Number(process.env.SMTP_PORT) || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                });

                await transporter.sendMail({
                    from: `"Agente RIT — Transportes" <${process.env.SMTP_USER}>`,
                    to: supervisor_email,
                    subject: `[Agente RIT] Solicitação de Posicionamento — Atendimento #${idAtendimento}`,
                    text: `Prezado Supervisor,\n\nSolicitamos a ativação do compartilhamento de posicionamento GPS para o atendimento #${idAtendimento} (Veículo: ${placa || rota.placa_veiculo || 'N/D'}).\n\nLink seguro de acesso: ${link}\n\nNota: Este link é válido por 24 horas e será automaticamente expirado assim que a corrida for finalizada.\n\nAtenciosamente,\nEquipe de Transportes Globo`,
                    html: `<p>Prezado Supervisor,</p><p>Solicitamos a ativação do compartilhamento de posicionamento GPS para o atendimento <strong>#${idAtendimento}</strong> (Veículo: <strong>${placa || rota.placa_veiculo || 'N/D'}</strong>).</p><p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#00D1FF;color:#000;text-decoration:none;border-radius:5px;font-weight:bold;">Acessar Portal do Motorista</a></p><p><small>Link seguro: ${link}</small></p><p><em>Nota: Este link é válido por 24 horas e expira automaticamente após a finalização do atendimento.</em></p>`
                });
                emailEnviado = true;
                emailMensagem = `Solicitação enviada por e-mail com sucesso ao supervisor (${supervisor_email}).`;
            } catch (mailErr) {
                console.warn('⚠️ [SMTP SUPERVISOR] Falha ao enviar e-mail:', mailErr.message);
                emailMensagem = `Link gerado com sucesso, mas o e-mail não pôde ser entregue automaticamente ao supervisor.`;
            }
        }

        res.json({
            ok: true,
            atendimento: idAtendimento,
            token_prefix: tokenPrefix,
            link,
            email_enviado: emailEnviado,
            message: emailMensagem
        });
    } catch (err) {
        console.error('Erro ao solicitar posição:', err.message);
        res.status(500).json({ error: 'Erro interno ao processar solicitação.' });
    }
});

app.use(express.static(publicPath, {
    setHeaders: (res, path) => {
        if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// FALLBACK PARA SPA
app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

// KEEP-ALIVE: evita o Cold Start no plano gratuito do Render
// Faz um ping no próprio servidor a cada 14 minutos
function iniciarKeepAlive() {
    const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
    if (!RENDER_URL) {
        console.log('ℹ️  RENDER_EXTERNAL_URL não definida — keep-alive desativado (ambiente local).');
        return;
    }
    const pingUrl = `${RENDER_URL}/api/health`;
    const INTERVALO_MS = 14 * 60 * 1000; // 14 minutos

    setInterval(async () => {
        try {
            const res = await fetch(pingUrl);
            console.log(`✅ [Keep-Alive] Ping OK — status ${res.status} — ${new Date().toISOString()}`);
        } catch (err) {
            console.warn(`⚠️  [Keep-Alive] Falha no ping: ${err.message}`);
        }
    }, INTERVALO_MS);

    console.log(`🔔 Keep-Alive ativado — pingando ${pingUrl} a cada 14 min.`);
}

async function iniciar() {
    try {
        await initDB();
    } catch (dbErr) {
        console.error('⚠️ [Startup Warning] Não foi possível conectar ao banco de dados:', dbErr.message);
    }
    await carregarBases();
    app.listen(PORT, () => {
        console.log(`🚀 Agente RIG v3.5.1 na porta ${PORT}`);
        iniciarKeepAlive();
    });
}

iniciar().catch((err) => {
    console.error('Falha ao iniciar servidor:', err);
});
