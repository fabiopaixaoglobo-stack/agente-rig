require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const Groq = require('groq-sdk');
const geocodeRouter = require('./geocode');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.json());

// ROTAS
app.use('/api', geocodeRouter);

const publicPath = path.resolve(__dirname, '../public');
app.use(express.static(publicPath));

// BASES DE DADOS
let NORMAS_DATABASE = [];
let CONTRATOS_DATABASE = {};

async function carregarBases() {
    try {
        const normasPath = path.join(publicPath, 'assets/normas_transporte.json');
        const contratosPath = path.join(__dirname, 'data/contratos.json');

        if (fsSync.existsSync(normasPath)) {
            const data = await fs.readFile(normasPath, 'utf8');
            NORMAS_DATABASE = JSON.parse(data);
        }

        if (fsSync.existsSync(contratosPath)) {
            const data = await fs.readFile(contratosPath, 'utf8');
            CONTRATOS_DATABASE = JSON.parse(data);
        }
        
        console.log('✅ Bases de dados carregadas com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao carregar bases de dados:', error);
    }
}

carregarBases();

// ENDPOINTS API
app.get('/api/health', (req, res) => res.json({ status: 'online', version: '3.5.0' }));

app.get('/api/normas', (req, res) => {
    res.json(NORMAS_DATABASE.map(n => ({ 
        id: n.id, 
        titulo: n.titulo, 
        icone: n.icone, 
        resumo: n.resumo 
    })));
});

app.post('/api/chat', async (req, res) => {
    const { message, contexto } = req.body;
    if (!message) return res.status(400).json({ error: "Mensagem vazia." });

    const query = message.toLowerCase();
    
    // 1. Busca na Base de Normas
    let matches = NORMAS_DATABASE.filter(n => 
        n.titulo.toLowerCase().includes(query) || 
        (n.palavras_chave && n.palavras_chave.some(kw => query.includes(kw.toLowerCase())))
    );

    // 2. Busca nos Contratos
    let contractInfo = "";
    if (contexto && CONTRATOS_DATABASE[contexto]) {
        contractInfo = CONTRATOS_DATABASE[contexto].map(c => `[${c.tema}] ${c.texto}`).join("\n");
    } else {
        Object.values(CONTRATOS_DATABASE).flat().forEach(c => {
            if (query.includes(c.tema.toLowerCase())) contractInfo += `[${c.tema}] ${c.texto}\n`;
        });
    }

    if (!groq) {
        return res.json({ response: "🤖 IA Offline. Configure a GROQ_API_KEY no servidor." });
    }

    try {
        const systemPrompt = `
        Você é o "Consultor RIT v3.5", especialista em normas e contratos de transporte.
        PRIORIDADE DE RESPOSTA:
        1. Norma de Transportes (Contexto: ${matches.map(m => m.texto).join(" ")})
        2. Contratos Operacionais (Contexto: ${contractInfo})
        3. Conhecimento logístico geral da RIT.

        REGRAS:
        - Se não encontrar na base, oriente com base nas diretrizes relacionadas.
        - Responda de forma executiva, use tópicos e ícones.
        - Sempre cite o documento fonte (Ex: [Norma ID 4] ou [Contrato Cargas]).
        - Contexto atual: ${contexto || 'Geral'}.
        `;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message }
            ],
            model: "llama-3.1-8b-instant",
        });

        res.json({ response: completion.choices[0].message.content });
    } catch (error) {
        console.error('Erro no Chat:', error);
        res.status(500).json({ error: "Falha na comunicação com o serviço de IA." });
    }
});

// FALLBACK PARA SPA
app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.listen(PORT, () => {
    console.log(`🚀 Agente RIG v3.5 rodando na porta ${PORT}`);
});
