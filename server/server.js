require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const Groq = require('groq-sdk');
const rateLimit = require('express-rate-limit');
const geocodeRouter = require('./geocode');
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
app.get('/api/health', (req, res) => res.json({ status: 'online', version: '3.5.1' }));

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
        return res.json({ response: '🤖 IA Offline. Configure a GROQ_API_KEY no servidor.' });
    }

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
        console.error('Erro no Chat:', error);
        res.status(500).json({ error: 'Falha na comunicação com o serviço de IA.' });
    }
});

app.use(express.static(publicPath));

// FALLBACK PARA SPA
app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

async function iniciar() {
    await initDB();
    await carregarBases();
    app.listen(PORT, () => {
        console.log(`🚀 Agente RIG v3.5.1 na porta ${PORT}`);
    });
}

iniciar().catch((err) => {
    console.error('Falha ao iniciar servidor:', err);
    process.exit(1);
});
