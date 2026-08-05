require('dotenv').config();
const fetch = require('node-fetch');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const Groq = require('groq-sdk');
const rateLimit = require('express-rate-limit');
const { router: geocodeRouter } = require('./geocode');
const { setupAuthRoutes } = require('./auth');
const { pool, initDB } = require('./database');
const { getRobotStatus, triggerDiagnostics } = require('./robot');

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

/** Limita tamanho do prompt de sistema (tokens / custo / latência) */
const RAG_MAX_NORMAS = 8;
const RAG_MAX_CHARS_NORMA_TEXTO = 900;
const RAG_MAX_CHARS_CONTRATOS = 3500;

// CONFIGURAÇÃO GROQ
let groq = null;
if (process.env.GROQ_API_KEY) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log('✅ GROQ_API_KEY configurada — IA online.');
} else {
    console.error('⚠️ GROQ_API_KEY não encontrada — chatbot ficará offline. Configure a variável no Render.');
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

const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.CHAT_RATE_LIMIT_MAX) || 24,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas mensagens em pouco tempo. Aguarde um minuto e tente novamente.' },
});

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
const { parseDocument } = require('./document-parser');
const activeDocuments = {};

app.post('/api/chat-rit/upload', upload.single('doc'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }
        const fileToken = req.body.token || 'global';
        const fileBuffer = req.file.buffer;
        const mimeType = req.file.mimetype;
        const fileName = req.file.originalname;

        const extractedText = await parseDocument(fileBuffer, mimeType, fileName);
        
        activeDocuments[fileToken] = {
            fileName,
            text: extractedText,
            uploadedAt: new Date().toISOString()
        };

        console.log(`[Chat RIT] Documento carregado: ${fileName} (${extractedText.length} caracteres)`);
        
        res.json({
            ok: true,
            fileName,
            charCount: extractedText.length,
            message: 'Documento processado com sucesso.'
        });
    } catch (err) {
        console.error('Erro ao processar documento no Chat RIT:', err);
        res.status(500).json({ error: `Erro ao processar arquivo: ${err.message}` });
    }
});

app.post('/api/chat-rit/remover', (req, res) => {
    const fileToken = req.body.token || 'global';
    delete activeDocuments[fileToken];
    res.json({ ok: true });
});

app.post('/api/chat-rit/pergunta', chatLimiter, async (req, res) => {
    const { message, token, acao } = req.body;
    const fileToken = token || 'global';

    const docContext = activeDocuments[fileToken];
    if (!docContext) {
        return res.status(400).json({ error: 'Nenhum documento ativo. Por favor, anexe um arquivo antes.' });
    }

    if (!groq) {
        return res.json({
            response: '🤖 IA Offline. Configure a GROQ_API_KEY no servidor.',
            status: 'offline'
        });
    }

    try {
        let userMessage = message;
        let systemPrompt = `Você é o "Chat RIT", um robô assistente especializado em analisar documentos e responder a perguntas com base no arquivo anexado.
Use estritamente as informações contidas no documento abaixo para responder, resumir, explicar ou extrair pontos-chave. Se a resposta não estiver no documento, informe isso de forma honesta.

--- CONTEXTO DO DOCUMENTO ---
Nome do Arquivo: ${docContext.fileName}
Conteúdo do Documento:
${docContext.text.slice(0, 150000)}
-----------------------------
`;

        if (acao === 'resumo') {
            userMessage = 'Faça um resumo executivo estruturado e detalhado das informações mais importantes deste documento.';
        } else if (acao === 'pontos') {
            userMessage = 'Identifique e extraia os pontos-chave e informações mais críticas presentes neste documento.';
        } else if (acao === 'acoes') {
            userMessage = 'Identifique todos os planos de ação recomendados, obrigações, prazos e responsabilidades indicadas neste documento.';
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.2
        });

        const reply = chatCompletion.choices[0].message.content;
        res.json({ ok: true, response: reply });
    } catch (err) {
        console.error('Erro na resposta do Groq no Chat RIT:', err);
        res.status(500).json({ error: `Erro de processamento da IA: ${err.message}` });
    }
});

// Cache do status do COR-Rio com atualização periódica a cada 3 horas
let corCache = {
    estagio: { estagio: "Estágio 1", cor: "#228d46" },
    calor: "calor 1",
    lastUpdated: null
};

async function atualizarCacheCOR() {
    try {
        console.log('[COR-CACHE] Atualizando cache de status do COR-Rio...');
        const resEstagio = await fetch('https://appcor.cor-rio.work/estagio_cidade', { timeout: 10000 });
        if (resEstagio.ok) {
            const data = await resEstagio.json();
            if (data && data.estagio) {
                corCache.estagio = {
                    estagio: data.estagio,
                    cor: data.cor || '#228d46'
                };
            }
        } else {
            throw new Error(`Estágio API HTTP ${resEstagio.status}`);
        }
        
        const resCalor = await fetch('https://appcor.cor-rio.work/calor_api', { timeout: 10000 });
        if (resCalor.ok) {
            const data = await resCalor.json();
            const nivel = data.nivel || data.level || data.heat_level || 1;
            corCache.calor = `calor ${nivel}`;
        } else {
            throw new Error(`Calor API HTTP ${resCalor.status}`);
        }
        
        corCache.lastUpdated = new Date().toISOString();
        console.log('[COR-CACHE] Cache atualizado com sucesso:', corCache);
    } catch (err) {
        console.error('[COR-CACHE] Erro ao atualizar cache do COR-Rio:', err.message);
    }
}

// Inicializa a primeira busca e agenda a execução a cada 3 horas
atualizarCacheCOR();
setInterval(atualizarCacheCOR, 3 * 60 * 60 * 1000);

app.get('/api/cor/estagio', (req, res) => {
    res.json(corCache.estagio);
});

app.get('/api/cor/calor', (req, res) => {
    res.send(corCache.calor);
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

app.post('/api/chat', chatLimiter, async (req, res) => {
    const { message, contexto } = req.body;
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Mensagem vazia ou inválida.' });
    }

    const query = message.toLowerCase().trim();

    // 1. Normas — título contém trecho curto OU palavra-chave na mensagem
    const queryWords = query.split(/\s+/).filter((w) => w.length > 2);
    let matches = NORMAS_DATABASE.filter((n) => {
        const titulo = (n.titulo || '').toLowerCase();
        if (titulo && (query.includes(titulo) || titulo.includes(query.slice(0, 80)))) return true;
        if (n.palavras_chave && Array.isArray(n.palavras_chave)) {
            return n.palavras_chave.some((kw) => {
                const k = String(kw).toLowerCase();
                return k && (query.includes(k) || queryWords.some((w) => k.includes(w) || w.includes(k)));
            });
        }
        return false;
    }).slice(0, RAG_MAX_NORMAS);

    const blocoNormas = matches
        .map((m) => `[Norma ID ${m.id}] ${truncar(m.texto || m.resumo || '', RAG_MAX_CHARS_NORMA_TEXTO)}`)
        .join('\n');

    // 2. Contratos
    let contractInfo = '';
    if (contexto && CONTRATOS_DATABASE[contexto]) {
        contractInfo = CONTRATOS_DATABASE[contexto]
            .map((c) => `[${c.tema}] ${c.texto}`)
            .join('\n');
    } else {
        Object.values(CONTRATOS_DATABASE)
            .flat()
            .forEach((c) => {
                const tema = (c.tema || '').toLowerCase();
                if (tema && query.includes(tema)) contractInfo += `[${c.tema}] ${c.texto}\n`;
            });
    }
    contractInfo = truncar(contractInfo, RAG_MAX_CHARS_CONTRATOS);

    if (!groq) {
        console.error('[CHAT] Requisição recebida, mas GROQ_API_KEY ausente.');
        return res.json({
            response: '🤖 IA Offline. Configure a GROQ_API_KEY no servidor.',
            status: 'offline',
            message: 'GROQ API key not configured'
        });
    }

    console.log(`[CHAT] Requisição recebida — normas: ${matches.length}, contratos: ${contractInfo ? 'sim' : 'não'}`);

    try {
        const systemPrompt = `
Você é o "Consultor RIT v3.5", especialista em normas e contratos de transporte.

PRIORIDADE DE RESPOSTA (use nesta ordem quando houver conteúdo):
1. Normas de transportes (trechos recuperados da base interna).
2. Contratos operacionais (trechos recuperados).
3. Conhecimento logístico geral da RIT, sem contradizer 1 e 2.

TRECHOS — NORMAS:
${blocoNormas || '(Nenhum trecho automático; use o título da pergunta e o contexto do utilizador.)'}

TRECHOS — CONTRATOS:
${contractInfo || '(Nenhum trecho automático de contrato.)'}

REGRAS:
- Se não encontrar na base, oriente com base nas diretrizes relacionadas e diga que extrapolou.
- Resposta executiva, tópicos curtos quando fizer sentido.
- Cite sempre a fonte quando usar trecho: [Norma ID n] ou [Contrato tema].
- Contexto de documento selecionado pelo utilizador: ${contexto || 'Geral'}.
`.trim();

        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message.slice(0, 8000) },
            ],
            model: 'llama-3.1-8b-instant',
        });

        const content = completion.choices[0]?.message?.content;
        res.json({ response: typeof content === 'string' ? content : 'Resposta vazia do modelo.' });
    } catch (error) {
        console.error('[CHAT] Erro na comunicação com Groq:', error?.message || error);
        if (error?.status === 401) {
            return res.status(500).json({ error: 'GROQ_API_KEY inválida. Verifique a chave configurada no Render.' });
        }
        if (error?.status === 429) {
            return res.status(429).json({ error: 'Limite de requisições da API Groq atingido. Tente novamente em instantes.' });
        }
        res.status(500).json({ error: 'Falha na comunicação com o serviço de IA.' });
    }
});

// ENDPOINT PARA INFORMES OTT RJ
app.get('/api/ott', async (req, res) => {
    const mockAlerts = [
        { tipo: "Disparos ouvidos", data: "24/06/26", hora: "15:05", bairro: "Caju", municipio: "Rio de Janeiro", lat: -22.8850, lon: -43.2183 },
        { tipo: "Disparos ouvidos", data: "24/06/26", hora: "14:12", bairro: "Bonsucesso", municipio: "Rio de Janeiro", lat: -22.8677, lon: -43.2541 },
        { tipo: "Tiroteio", data: "24/06/26", hora: "12:29", bairro: "Gardênia Azul", municipio: "Rio de Janeiro", lat: -22.9644, lon: -43.3592 },
        { tipo: "Tiroteio", data: "24/06/26", hora: "10:15", bairro: "Complexo da Maré", municipio: "Rio de Janeiro", lat: -22.8480, lon: -43.2420 },
        { tipo: "Operação Policial", data: "24/06/26", hora: "08:30", bairro: "Jacarezinho", municipio: "Rio de Janeiro", lat: -22.8894, lon: -43.2561 },
        { tipo: "Disparos ouvidos", data: "24/06/26", hora: "06:45", bairro: "Rocinha", municipio: "Rio de Janeiro", lat: -22.9882, lon: -43.2482 }
    ];

    let data = null;
    try {
        const ottUrl = 'https://ondetemtiroteio.com/website/ott/report-data.php?action=informes';
        const response = await fetch(ottUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        data = await response.json();
    } catch (fetchErr) {
        console.warn('⚠️ Falha ao buscar dados do OTT real, usando mockAlerts:', fetchErr.message);
    }

    try {
        const parsedAlerts = [];
        if (data && Array.isArray(data.items)) {
            // Filtramos alertas do estado do RJ
            const rjItems = data.items.filter(item => item.state === 'RJ');
            for (const item of rjItems) {
                let dataStr = "";
                let horaStr = "";
                if (item.date && item.date.includes(' ')) {
                    const parts = item.date.split(' ');
                    dataStr = parts[0];
                    horaStr = parts[1];
                } else {
                    dataStr = item.date || "";
                    horaStr = "";
                }

                parsedAlerts.push({
                    tipo: item.type || "Ocorrência",
                    data: dataStr,
                    hora: horaStr,
                    bairro: item.neighborhood || "Desconhecido",
                    municipio: item.city || "Rio de Janeiro",
                    lat: item.lat ? parseFloat(item.lat) : -22.9068,
                    lon: item.lng ? parseFloat(item.lng) : -43.1729
                });
            }
        }

        const finalAlerts = parsedAlerts.length > 0 ? parsedAlerts : mockAlerts;
        res.json({ ok: true, alerts: finalAlerts });
    } catch (err) {
        console.error('Erro ao processar informes OTT:', err);
        res.status(500).json({ error: 'Erro ao processar dados do OTT.' });
    }
});

app.get('/api/rotas/detalhes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });
        const result = await pool.query('SELECT * FROM rotas_importadas WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Rota não encontrada.' });
        
        const rota = result.rows[0];
        rota.data_atendimento = extrairDataDeHorario(rota.horario);
        
        res.json({ ok: true, rota });
    } catch (err) {
        console.error('Erro ao buscar detalhes da rota:', err);
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
        const points = trackRes.rows;

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

        if (points.length === 0) {
            return res.json({
                ok: true,
                metadata,
                points: [],
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
                    classificacao: 'Dentro da Rota'
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
                classificacao
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
        const { motorista, lat, lng, placa, tipo_veiculo, programa, speed, id_rota, status_atendimento, precisao, fonte_localizacao } = req.body;
        if (!motorista || !lat || !lng) {
            return res.status(400).json({ error: 'Dados incompletos (motorista, lat, lng são obrigatórios).' });
        }

        // Upsert na tabela posicoes_motoristas
        await pool.query(
            `INSERT INTO posicoes_motoristas (motorista_nome, lat, lng, placa, tipo_veiculo, programa, speed, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (motorista_nome) DO UPDATE 
             SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, placa = EXCLUDED.placa, 
                 tipo_veiculo = EXCLUDED.tipo_veiculo, programa = EXCLUDED.programa, 
                 speed = EXCLUDED.speed, timestamp = NOW()`,
            [motorista, lat, lng, placa, tipo_veiculo, programa, speed || 0]
        );

        // Gravação da trilha GPS em tempo real na tabela de histórico
        const idAtendimentoInt = parseInt(id_rota, 10);
        if (id_rota && !isNaN(idAtendimentoInt)) {
            const rResult = await pool.query('SELECT status_atendimento FROM rotas_importadas WHERE id = $1', [idAtendimentoInt]);
            const statusAt = rResult.rows[0]?.status_atendimento;

            if (statusAt !== 'FINALIZADO') {
                const pr = parseFloat(precisao) || 10;
                const fl = String(fonte_localizacao || 'GPS').trim();
                const vel = parseFloat(speed) || 0;

                // Verifica se é o primeiro ponto da rota
                const countPointsRes = await pool.query('SELECT COUNT(*) FROM gps_historico_atendimento WHERE id_atendimento = $1', [idAtendimentoInt]);
                const isFirst = parseInt(countPointsRes.rows[0].count, 10) === 0;

                let tipoEv = 'GPS';
                if (isFirst) {
                    tipoEv = 'INICIO';
                } else if (vel === 0) {
                    tipoEv = 'PARADA';
                }

                await pool.query(
                    `INSERT INTO gps_historico_atendimento 
                     (id_atendimento, latitude, longitude, velocidade, data_hora, precisao, status, tipo_evento, fonte_localizacao)
                     VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)`,
                    [idAtendimentoInt, lat, lng, vel, pr, statusAt || 'EM_TRANSITO', tipoEv, fl]
                );
            }
        }

        // Se passar id_rota e status_atendimento, atualiza o status de atendimento
        if (id_rota && !isNaN(idAtendimentoInt) && status_atendimento) {
            // Verifica o status anterior para evitar duplicidade de logs no histórico
            const statusResult = await pool.query('SELECT status_atendimento FROM rotas_importadas WHERE id = $1', [idAtendimentoInt]);
            const prevStatus = statusResult.rows[0]?.status_atendimento;

            await pool.query(
                `UPDATE rotas_importadas SET status_atendimento = $1 WHERE id = $2`,
                [status_atendimento, idAtendimentoInt]
            );

            if (prevStatus !== status_atendimento) {
                // Se for a primeira transição após a importação, adiciona vínculos operacionais
                const countResult = await pool.query('SELECT COUNT(*) FROM historico_atendimentos WHERE id_atendimento = $1', [id_rota]);
                const count = parseInt(countResult.rows[0]?.count || '0', 10);
                if (count <= 1) {
                    await pool.query(
                        "INSERT INTO historico_atendimentos (id_atendimento, evento, data_hora) VALUES ($1, 'Motorista vinculado', NOW() - INTERVAL '3 minutes')",
                        [id_rota]
                    );
                    await pool.query(
                        "INSERT INTO historico_atendimentos (id_atendimento, evento, data_hora) VALUES ($1, 'Veículo vinculado', NOW() - INTERVAL '2 minutes')",
                        [idAtendimentoInt]
                    );
                }

                let eventText = `Alteração de status para ${status_atendimento}`;
                if (status_atendimento === 'EM_TRANSITO') eventText = 'Viagem iniciada';
                else if (status_atendimento === 'PAUSADO') eventText = 'Transmissão interrompida';
                else if (status_atendimento === 'FINALIZADO') eventText = 'Atendimento finalizado';

                await pool.query(
                    'INSERT INTO historico_atendimentos (id_atendimento, evento, data_hora) VALUES ($1, $2, NOW())',
                    [idAtendimentoInt, eventText]
                );
            }
            
            // Se finalizado, remove da tabela de posicoes para tirar do mapa ativo e insere evento final FIM no historico GPS
            if (status_atendimento === 'FINALIZADO') {
                await pool.query(
                    `INSERT INTO gps_historico_atendimento 
                     (id_atendimento, latitude, longitude, velocidade, data_hora, precisao, status, tipo_evento, fonte_localizacao)
                     VALUES ($1, $2, $3, 0, NOW(), 10, 'FINALIZADO', 'FIM', 'GPS')`,
                    [idAtendimentoInt, lat, lng]
                );
                await pool.query('DELETE FROM posicoes_motoristas WHERE motorista_nome = $1', [motorista]);
            }
        }

        res.json({ ok: true, message: 'Localização atualizada com sucesso.' });
    } catch (err) {
        console.error('Erro ao salvar geolocalização:', err);
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

app.use(express.static(publicPath, {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
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
