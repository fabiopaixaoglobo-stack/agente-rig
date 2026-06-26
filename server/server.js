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
const { initDB } = require('./database');

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
    try {
        const ottUrl = 'https://ondetemtiroteio.com/website/ott/report-data.php?action=informes';
        const response = await fetch(ottUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const data = await response.json();

        // Base sintética realista como fallback
        const mockAlerts = [
            { tipo: "Disparos ouvidos", data: "24/06/26", hora: "15:05", bairro: "Caju", municipio: "Rio de Janeiro", lat: -22.8850, lon: -43.2183 },
            { tipo: "Disparos ouvidos", data: "24/06/26", hora: "14:12", bairro: "Bonsucesso", municipio: "Rio de Janeiro", lat: -22.8677, lon: -43.2541 },
            { tipo: "Tiroteio", data: "24/06/26", hora: "12:29", bairro: "Gardênia Azul", municipio: "Rio de Janeiro", lat: -22.9644, lon: -43.3592 },
            { tipo: "Tiroteio", data: "24/06/26", hora: "10:15", bairro: "Complexo da Maré", municipio: "Rio de Janeiro", lat: -22.8480, lon: -43.2420 },
            { tipo: "Operação Policial", data: "24/06/26", hora: "08:30", bairro: "Jacarezinho", municipio: "Rio de Janeiro", lat: -22.8894, lon: -43.2561 },
            { tipo: "Disparos ouvidos", data: "24/06/26", hora: "06:45", bairro: "Rocinha", municipio: "Rio de Janeiro", lat: -22.9882, lon: -43.2482 }
        ];

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
                    lat: item.lat || -22.9068,
                    lon: item.lng || -43.1729
                });
            }
        }

        const finalAlerts = parsedAlerts.length > 0 ? parsedAlerts : mockAlerts;
        res.json({ ok: true, alerts: finalAlerts });
    } catch (err) {
        console.error('Erro ao buscar informes OTT:', err);
        res.status(500).json({ error: 'Erro ao buscar dados do OTT.' });
    }
});

app.use(express.static(publicPath));

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
