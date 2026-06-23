const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { pool } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'agente-rig-super-secret-2026';

// ──────────────────────────────────────────────
// SMTP (e-mail de recuperação)
// ──────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
    }
});

// ──────────────────────────────────────────────
// BASE DE COLABORADORES (Excel)
// ──────────────────────────────────────────────
const baseColaboradoresPath = path.resolve(
    __dirname,
    '../Normas/Base de Colaboradores Globo para validação do Agente RIT - Abril 2025.xlsx'
);

let baseColaboradoresCache = null;
let lastModifiedTime = null;

function loadBaseColaboradores() {
    try {
        if (!fs.existsSync(baseColaboradoresPath)) {
            console.warn('⚠️ Base de Colaboradores não encontrada:', baseColaboradoresPath);
            return [];
        }
        const stats = fs.statSync(baseColaboradoresPath);
        if (lastModifiedTime && lastModifiedTime.getTime() === stats.mtime.getTime() && baseColaboradoresCache) {
            return baseColaboradoresCache;
        }

        const workbook = xlsx.readFile(baseColaboradoresPath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        baseColaboradoresCache = data.map(row => {
            const norm = {};
            for (const key in row) {
                const k = key.toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, '_');
                norm[k] = row[key];
            }
            norm._email     = norm.email || norm.e_mail || norm['e-mail'] || norm.email_corporativo;
            norm._matricula = norm.matricula || norm.id || norm.registro;
            norm._nome      = norm.nome || norm.nome_funcionario || norm.nome_completo;
            return norm;
        });

        lastModifiedTime = stats.mtime;
        console.log(`✅ Base de Colaboradores carregada: ${baseColaboradoresCache.length} registros.`);
        return baseColaboradoresCache;
    } catch (err) {
        console.error('❌ Erro ao ler Base de Colaboradores:', err);
        return [];
    }
}

function findInBase(matricula, email) {
    const base = loadBaseColaboradores();
    return base.find(c => {
        let match = true;
        if (matricula) {
            match = match && c._matricula && String(c._matricula).trim() === String(matricula).trim();
        }
        if (email) {
            match = match && c._email && String(c._email).trim().toLowerCase() === String(email).trim().toLowerCase();
        }
        return match;
    });
}

// ──────────────────────────────────────────────
// ROTAS DE AUTENTICAÇÃO
// ──────────────────────────────────────────────
function setupAuthRoutes(app) {
    loadBaseColaboradores(); // pré-carrega no startup

    // ── POST /api/register ──────────────────────
    app.post('/api/register', async (req, res) => {
        try {
            const { nome, sobrenome, matricula, email, senha } = req.body;

            if (!nome || !sobrenome || !matricula || !email || !senha) {
                return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
            }

            // Regras de senha
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
            if (!passwordRegex.test(senha)) {
                return res.status(400).json({
                    error: 'A senha deve ter no mínimo 8 caracteres com: número, maiúscula, minúscula e caractere especial.'
                });
            }

            // Valida na Base Excel (por matrícula OU e-mail)
            const colaborador = findInBase(matricula, email);
            if (!colaborador) {
                return res.status(403).json({
                    error: 'Você não possui acesso. Favor entrar em contato com a Área de Transportes Globo.'
                });
            }

            const funcao = colaborador.funcao || colaborador.cargo || 'Colaborador';
            const area   = colaborador.area   || colaborador.setor || colaborador.departamento || 'Geral';

            // Verifica duplicata ou redefinição de senha
            const dup = await pool.query(
                'SELECT id, matricula, email FROM users WHERE matricula = $1 OR email = $2',
                [matricula, email]
            );
            if (dup.rows.length > 0) {
                const existingUser = dup.rows[0];
                if (existingUser.matricula === matricula && existingUser.email === email) {
                    // Redefinição de senha
                    const hashedSenha = await bcrypt.hash(senha, 10);
                    await pool.query('UPDATE users SET senha = $1 WHERE id = $2', [hashedSenha, existingUser.id]);
                    await pool.query(
                        `UPDATE recuperacao_senha
                         SET cadastro_concluido = TRUE, concluido_em = NOW()
                         WHERE email = $1 AND cadastro_concluido = FALSE`,
                        [email]
                    );
                    return res.json({
                        success: true,
                        message: 'Sua senha foi redefinida com sucesso! Você já pode entrar.',
                        funcao,
                        area
                    });
                } else {
                    return res.status(400).json({ error: 'Este usuário já possui cadastro ativo no sistema com dados divergentes.' });
                }
            }

            const hashedSenha = await bcrypt.hash(senha, 10);
            await pool.query(
                `INSERT INTO users (nome, sobrenome, matricula, email, senha, funcao, area)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [nome, sobrenome, matricula, email, hashedSenha, funcao, area]
            );
            await pool.query(
                `UPDATE recuperacao_senha
                 SET cadastro_concluido = TRUE, concluido_em = NOW()
                 WHERE email = $1 AND cadastro_concluido = FALSE`,
                [email]
            );

            return res.json({
                success: true,
                message: 'Cadastro realizado com sucesso! Você já pode entrar.',
                funcao,
                area
            });
        } catch (err) {
            console.error('Erro no /api/register:', err);
            return res.status(500).json({ error: 'Erro interno ao registrar usuário.' });
        }
    });

    // ── POST /api/login ─────────────────────────
    app.post('/api/login', async (req, res) => {
        try {
            const { identificador, senha } = req.body;
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconhecido';

            if (!identificador || !senha) {
                return res.status(400).json({ error: 'Matrícula/E-mail e senha são obrigatórios.' });
            }

            const result = await pool.query(
                'SELECT * FROM users WHERE matricula = $1 OR email = $2',
                [identificador, identificador]
            );
            const user = result.rows[0];
            if (!user) {
                return res.status(401).json({ error: 'Credenciais inválidas. Verifique os dados inseridos.' });
            }

            const validPassword = await bcrypt.compare(senha, user.senha);
            if (!validPassword) {
                return res.status(401).json({ error: 'Credenciais inválidas. Verifique a senha.' });
            }

            // Verifica se ainda consta na base Excel
            if (!findInBase(user.matricula, user.email)) {
                return res.status(403).json({
                    error: 'Você não possui acesso. Favor entrar em contato com a Área de Transportes Globo.'
                });
            }

            const token = jwt.sign(
                { id: user.id, matricula: user.matricula, role: user.funcao },
                JWT_SECRET,
                { expiresIn: '12h' }
            );

            // Fecha sessões anteriores ativas do mesmo usuário
            await pool.query(
                `UPDATE auditoria
                 SET data_hora_logout = NOW(),
                     tempo_sessao = EXTRACT(EPOCH FROM (NOW() - data_hora_login))::INTEGER
                 WHERE id_usuario = $1 AND data_hora_logout IS NULL`,
                [user.id]
            );

            // Auditoria de login
            const audit = await pool.query(
                `INSERT INTO auditoria (id_usuario, ip_origem) VALUES ($1, $2) RETURNING id`,
                [user.id, ip]
            );
            const auditId = audit.rows[0]?.id || null;

            return res.json({
                success: true,
                token,
                usuario: {
                    nome:     user.nome,
                    sobrenome: user.sobrenome,
                    area:     user.area,
                    funcao:   user.funcao
                },
                auditId
            });
        } catch (err) {
            console.error('Erro no /api/login:', err);
            return res.status(500).json({ error: 'Erro interno ao realizar login.' });
        }
    });

    // ── POST /api/logout ─────────────────────────
    app.post('/api/logout', async (req, res) => {
        try {
            const { auditId } = req.body;
            if (!auditId) {
                return res.status(400).json({ error: 'Audit ID é obrigatório para realizar logout.' });
            }

            if (auditId) {
                await pool.query(
                    `UPDATE auditoria
                     SET data_hora_logout = NOW(),
                         tempo_sessao = EXTRACT(EPOCH FROM (NOW() - data_hora_login))::INTEGER
                     WHERE id = $1`,
                    [auditId]
                );
            }
            return res.json({ success: true });
        } catch (err) {
            console.error('Erro no /api/logout:', err);
            return res.json({ success: true }); // não bloquear o logout por erro de auditoria
        }
    });

    // ── POST /api/recover ────────────────────────
    app.post('/api/recover', async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ error: 'O E-mail é obrigatório.' });

            const isGlobo = email.toLowerCase().includes('globo');
            console.log(`[RECOVER] Tentativa para: ${email}`);

            const colaborador = findInBase(null, email);
            console.log(`[RECOVER] Na base Excel? ${!!colaborador} | Globo? ${isGlobo}`);

            console.log(`[RECOVER] SMTP enabled: ${!!process.env.SMTP_HOST}`);
            console.log(`[RECOVER] Email attempt for: ${email}`);

            if (colaborador && process.env.SMTP_HOST && process.env.SMTP_USER) {
                const mailOptions = {
                    from: `"Agente RIT Rota Inteligente de Transporte" <${process.env.SMTP_USER}>`,
                    to: email,
                    subject: 'Recuperação de Senha - Agente RIT',
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:8px;">
                            <h2 style="color:#00D1FF;">Agente RIT - Redefinição de Acesso</h2>
                            <p>Olá <strong>${colaborador._nome || 'Colaborador'}</strong>,</p>
                            <p>Recebemos uma solicitação de recuperação de senha para a conta associada à matrícula <strong>${colaborador._matricula || ''}</strong>.</p>
                            <p>Para recuperar o acesso, realize um novo <strong>Cadastro (Primeiro acesso)</strong> na tela inicial do sistema com seus dados corporativos oficiais.</p>
                            <p>O sistema validará suas credenciais e recadastrará sua nova senha automaticamente.</p>
                            <br>
                            <p>Se você não solicitou isso, ignore este e-mail com segurança.</p>
                            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                            <p style="font-size:12px;color:#888;">E-mail automático — Centro de Comando e Monitoramento RIT.</p>
                        </div>
                    `
                };
                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) console.error(`❌ Email send failure`, err);
                    else     console.log(`✅ Email sent`, info.messageId);
                });
            }

            const emailEnviado = !!(colaborador && process.env.SMTP_HOST && process.env.SMTP_USER);
            await pool.query(
                `INSERT INTO recuperacao_senha (email, email_enviado)
                 VALUES ($1, $2)`,
                [email, emailEnviado]
            );

            // Resposta genérica (evita enumeração de e-mails)
            return res.json({
                success: true,
                message: 'Se o e-mail estiver na base corporativa Globo, enviaremos as instruções para redefinição de senha e recadastro.'
            });
        } catch (err) {
            console.error('Erro no /api/recover:', err);
            return res.status(500).json({ error: 'Erro interno ao processar recuperação.' });
        }
    });
    // ── MIDDLEWARE JWT ───────────────────────────
    function verifyToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
        }

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
            req.user = user;
            next();
        });
    }

    // ── GET /api/audit ───────────────────────────
    app.get('/api/audit', verifyToken, async (req, res) => {
        try {
            const query = `
                SELECT 
                    a.id AS audit_id,
                    u.nome,
                    u.sobrenome,
                    u.matricula,
                    u.email,
                    a.data_hora_login,
                    a.data_hora_logout,
                    a.tempo_sessao,
                    a.ip_origem
                FROM auditoria a
                JOIN users u ON u.id = a.id_usuario
                ORDER BY a.data_hora_login DESC;
            `;
            const result = await pool.query(query);
            return res.json({ success: true, data: result.rows });
        } catch (err) {
            console.error('Erro no /api/audit:', err);
            return res.status(500).json({ error: 'Erro interno ao buscar auditoria.' });
        }
    });

    // ── POST /api/audit/kick ─────────────────────
    app.post('/api/audit/kick', verifyToken, async (req, res) => {
        try {
            const { auditId } = req.body;
            if (!auditId) {
                return res.status(400).json({ error: 'Audit ID é obrigatório para encerrar a sessão.' });
            }

            await pool.query(
                `UPDATE auditoria
                 SET data_hora_logout = NOW(),
                     tempo_sessao = EXTRACT(EPOCH FROM (NOW() - data_hora_login))::INTEGER
                 WHERE id = $1 AND data_hora_logout IS NULL`,
                [auditId]
            );

            return res.json({ success: true, message: 'Acesso encerrado com sucesso.' });
        } catch (err) {
            console.error('Erro no /api/audit/kick:', err);
            return res.status(500).json({ error: 'Erro interno ao encerrar o acesso.' });
        }
    });

    // ── GET /api/recuperacoes ─────────────────────
    app.get('/api/recuperacoes', verifyToken, async (req, res) => {
        try {
            const query = `
                SELECT 
                    email,
                    solicitado_em,
                    email_enviado,
                    cadastro_concluido,
                    concluido_em
                FROM recuperacao_senha
                ORDER BY solicitado_em DESC;
            `;
            const result = await pool.query(query);
            return res.json({ success: true, data: result.rows });
        } catch (err) {
            console.error('Erro no /api/recuperacoes:', err);
            return res.status(500).json({ error: 'Erro interno ao buscar recuperações.' });
        }
    });
}

module.exports = { setupAuthRoutes, loadBaseColaboradores };
