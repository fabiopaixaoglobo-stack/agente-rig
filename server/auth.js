const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool, registrarAuditoriaLGPD } = require('./database');

const JWT_SECRET_CURRENT = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET || 'agente-rit-super-secret-2026';
const JWT_SECRET_LEGACY = process.env.JWT_SECRET_LEGACY || 'agente-rig-super-secret-2026';

// ──────────────────────────────────────────────
// RATE LIMITERS DE AUTENTICAÇÃO (BRUTE FORCE DEFENSE)
// ──────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Limite de tentativas de autenticação excedido. Tente novamente em 15 minutos.' }
});

const recoverLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Limite de solicitações de recuperação excedido. Tente novamente em 15 minutos.' }
});

// ──────────────────────────────────────────────
// MIDDLEWARE JWT (Validação em cascata CURRENT -> LEGACY)
// ──────────────────────────────────────────────
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    jwt.verify(token, JWT_SECRET_CURRENT, (errCurrent, userCurrent) => {
        if (!errCurrent) {
            req.user = userCurrent;
            return next();
        }

        // Se falhar com a chave corrente, tenta com o segredo legado para manter sessões ativas
        jwt.verify(token, JWT_SECRET_LEGACY, (errLegacy, userLegacy) => {
            if (!errLegacy) {
                req.user = userLegacy;
                return next();
            }
            return res.status(403).json({ error: 'Token inválido ou expirado.' });
        });
    });
}

// ──────────────────────────────────────────────
// MIDDLEWARE RBAC (Controle de Acesso Baseado em Papéis)
// Perfis suportados: Administrador, Gestor, Auditor, Colaborador
// ──────────────────────────────────────────────
function requireRole(allowedRoles) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Acesso negado. Usuário não autenticado.' });
        }
        let userRole = req.user.role || req.user.papel || req.user.funcao || 'Colaborador';
        const userMat = String(req.user.matricula || '').trim().replace(/^0+/, '');
        const userEmail = String(req.user.email || '').trim().toLowerCase();

        // Super-Administrador: Fábio Paixão e credenciais master da plataforma
        if (
            userMat === '68808' ||
            userEmail.includes('fabio.paixao') ||
            userEmail.includes('fapaixao') ||
            userEmail.startsWith('agente.rit') ||
            userEmail.includes('admin')
        ) {
            userRole = 'Administrador';
            req.user.role = 'Administrador';
        }

        // Administrador possui acesso irrestrito a todas as rotas
        if (userRole === 'Administrador' || roles.includes(userRole)) {
            return next();
        }
        return res.status(403).json({
            error: `Acesso negado. Esta operação exige perfil ${roles.join(' ou ')}. Seu perfil atual é: ${userRole}.`
        });
    };
}

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
    // Se a base Excel não estiver presente no servidor (ex: ambiente Render sem planilha no Git por LGPD),
    // valida o acesso diretamente pelo PostgreSQL para não bloquear o login dos usuários cadastrados.
    if (!base || base.length === 0) {
        return { _fallback: true, funcao: 'Colaborador', area: 'Geral', cargo: 'Colaborador' };
    }

    const normMat = (m) => String(m || '').trim().replace(/^0+/, '');
    const normMail = (e) => String(e || '').trim().toLowerCase();

    const targetMat = normMat(matricula);
    const targetMail = normMail(email);

    const found = base.find(c => {
        const cMat = normMat(c._matricula);
        const cMail = normMail(c._email);

        if (targetMat && cMat && targetMat === cMat) return true;
        if (targetMail && cMail && targetMail === cMail) return true;
        return false;
    });

    return found || null;
}

function determineUserRole(colaborador, email = '', matricula = '') {
    const mat = String(matricula || colaborador?._matricula || colaborador?.matricula || '').trim().replace(/^0+/, '');
    const e = String(email || colaborador?._email || colaborador?.email || '').toLowerCase();
    const cargo = String(colaborador?.cargo || colaborador?.funcao || colaborador?.papel || '').toLowerCase();

    // Administrador Mestre (Fábio Paixão e contas administrativas)
    if (
        mat === '68808' ||
        e.includes('fabio.paixao') ||
        e.includes('fapaixao') ||
        e.startsWith('agente.rit') ||
        e.includes('admin') ||
        cargo.includes('admin')
    ) {
        return 'Administrador';
    }

    if (
        cargo.includes('auditor') ||
        cargo.includes('compliance') ||
        cargo.includes('seguranca') ||
        cargo.includes('segurança')
    ) {
        return 'Auditor';
    }

    if (
        cargo.includes('gerente') ||
        cargo.includes('gestor') ||
        cargo.includes('coord') ||
        cargo.includes('coordenador') ||
        cargo.includes('supervisor') ||
        cargo.includes('especialista') ||
        cargo.includes('diretor')
    ) {
        return 'Gestor';
    }

    return 'Colaborador';
}

// ──────────────────────────────────────────────
// ROTAS DE AUTENTICAÇÃO
// ──────────────────────────────────────────────
function setupAuthRoutes(app) {
    loadBaseColaboradores(); // pré-carrega no startup

    // ── POST /api/register ──────────────────────
    app.post('/api/register', authLimiter, async (req, res) => {
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
            const papel  = determineUserRole(colaborador, email, matricula);
            const orgId  = req.headers['x-organization-id'] || 'globo';

            // Normaliza e-mail e matrícula para comparação segura (case-insensitive, sem espaços extras)
            const normalizedEmail = email.trim().toLowerCase();
            const normalizedMatricula = String(matricula).trim();

            // Verifica duplicata ou redefinição de senha
            const dup = await pool.query(
                'SELECT id, matricula, email FROM users WHERE matricula = $1 OR LOWER(TRIM(email)) = $2',
                [normalizedMatricula, normalizedEmail]
            );
            if (dup.rows.length > 0) {
                // Procura um registro que corresponda AMBOS matrícula E e-mail (correspondência exata normalizada)
                const exactMatch = dup.rows.find(u =>
                    String(u.matricula).trim() === normalizedMatricula &&
                    String(u.email).trim().toLowerCase() === normalizedEmail
                );

                if (exactMatch) {
                    // Redefinição de senha — matrícula e e-mail coincidem com o mesmo registro
                    console.log(`[REGISTER] Redefinição de senha para matrícula ${normalizedMatricula} (user ID ${exactMatch.id})`);
                    const hashedSenha = await bcrypt.hash(senha, 10);
                    await pool.query(
                        'UPDATE users SET senha = $1, email = $2, papel = $3 WHERE id = $4',
                        [hashedSenha, normalizedEmail, papel, exactMatch.id]
                    );
                    await pool.query(
                        `UPDATE recuperacao_senha
                         SET cadastro_concluido = TRUE, concluido_em = NOW()
                         WHERE LOWER(TRIM(email)) = $1 AND cadastro_concluido = FALSE`,
                        [normalizedEmail]
                    );
                    return res.json({
                        success: true,
                        message: 'Sua senha foi redefinida com sucesso! Você já pode entrar.',
                        funcao,
                        papel,
                        area
                    });
                }

                // Correspondência parcial — verifica se matrícula ou e-mail pertencem a registros diferentes
                const partialByMatricula = dup.rows.find(u =>
                    String(u.matricula).trim() === normalizedMatricula
                );
                const partialByEmail = dup.rows.find(u =>
                    String(u.email).trim().toLowerCase() === normalizedEmail
                );

                if (partialByMatricula && partialByEmail && partialByMatricula.id !== partialByEmail.id) {
                    // Matrícula pertence a um usuário e e-mail a outro — realmente divergente
                    console.warn(`[REGISTER] Dados divergentes reais: matrícula ${normalizedMatricula} (user ${partialByMatricula.id}) vs email ${normalizedEmail} (user ${partialByEmail.id})`);
                    return res.status(400).json({
                        error: 'Este usuário já possui cadastro ativo no sistema com dados divergentes.'
                    });
                }

                if (partialByMatricula) {
                    // Mesma matrícula mas e-mail diferente — atualiza o e-mail e redefine a senha
                    console.log(`[REGISTER] Redefinição com atualização de e-mail: matrícula ${normalizedMatricula}, email antigo: ${partialByMatricula.email}, novo: ${normalizedEmail}`);
                    const hashedSenha = await bcrypt.hash(senha, 10);
                    await pool.query(
                        'UPDATE users SET senha = $1, email = $2, papel = $3 WHERE id = $4',
                        [hashedSenha, normalizedEmail, papel, partialByMatricula.id]
                    );
                    await pool.query(
                        `UPDATE recuperacao_senha
                         SET cadastro_concluido = TRUE, concluido_em = NOW()
                         WHERE LOWER(TRIM(email)) = $1 AND cadastro_concluido = FALSE`,
                        [normalizedEmail]
                    );
                    return res.json({
                        success: true,
                        message: 'Sua senha foi redefinida com sucesso! Você já pode entrar.',
                        funcao,
                        papel,
                        area
                    });
                }

                // E-mail já cadastrado com matrícula diferente
                console.warn(`[REGISTER] E-mail ${normalizedEmail} já usado por outra matrícula (user ${partialByEmail?.id}).`);
                return res.status(400).json({
                    error: 'Este e-mail já está associado a outro cadastro. Verifique sua matrícula ou entre em contato com o suporte.'
                });
            }

            const hashedSenha = await bcrypt.hash(senha, 10);
            await pool.query(
                `INSERT INTO users (nome, sobrenome, matricula, email, senha, funcao, papel, area, organization_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [nome, sobrenome, normalizedMatricula, normalizedEmail, hashedSenha, funcao, papel, area, orgId]
            );
            await pool.query(
                `UPDATE recuperacao_senha
                 SET cadastro_concluido = TRUE, concluido_em = NOW()
                 WHERE LOWER(TRIM(email)) = $1 AND cadastro_concluido = FALSE`,
                [normalizedEmail]
            );

            return res.json({
                success: true,
                message: 'Cadastro realizado com sucesso! Você já pode entrar.',
                funcao,
                papel,
                area
            });
        } catch (err) {
            console.error('Erro no /api/register:', err);
            return res.status(500).json({ error: 'Erro interno ao registrar usuário.' });
        }
    });

    // ── POST /api/login ─────────────────────────
    app.post('/api/login', authLimiter, async (req, res) => {
        try {
            const { identificador, senha } = req.body;
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconhecido';
            const userAgent = req.headers['user-agent'] || 'desconhecido';

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
            const colab = findInBase(user.matricula, user.email);
            if (!colab) {
                return res.status(403).json({
                    error: 'Você não possui acesso. Favor entrar em contato com a Área de Transportes Globo.'
                });
            }

            const normMat = String(user.matricula || '').trim().replace(/^0+/, '');
            const normMail = String(user.email || '').trim().toLowerCase();

            let role = determineUserRole(colab, user.email, user.matricula);
            if (normMat === '68808' || normMail.includes('fabio.paixao') || normMail.includes('fapaixao')) {
                role = 'Administrador';
            } else if (!role || role === 'Colaborador') {
                if (user.papel && user.papel !== 'Colaborador') {
                    role = user.papel;
                }
            }

            // Atualiza papel no banco de dados se houver discrepância
            if (user.papel !== role) {
                try {
                    await pool.query('UPDATE users SET papel = $1 WHERE id = $2', [role, user.id]);
                    user.papel = role;
                } catch (updateErr) {
                    console.warn('[AUTH] Aviso ao persistir papel atualizado no DB:', updateErr.message);
                }
            }

            const orgId = user.organization_id || req.headers['x-organization-id'] || 'globo';

            const token = jwt.sign(
                { id: user.id, matricula: user.matricula, email: user.email, role: role, organization_id: orgId },
                JWT_SECRET_CURRENT,
                { expiresIn: '12h' }
            );

            // Controle de Sessões Simultâneas: encerra sessões anteriores inativas do mesmo usuário
            await pool.query(
                `UPDATE auditoria 
                 SET data_hora_logout = NOW(),
                     tempo_sessao = EXTRACT(EPOCH FROM (NOW() - data_hora_login))::INTEGER
                 WHERE id_usuario = $1 AND data_hora_logout IS NULL AND (ultimo_ping < NOW() - INTERVAL '30 minutes' OR ultimo_ping IS NULL)`,
                [user.id]
            );

            // Auditoria de login
            const audit = await pool.query(
                `INSERT INTO auditoria (id_usuario, ip_origem, ultimo_ping, organization_id) VALUES ($1, $2, NOW(), $3) RETURNING id`,
                [user.id, ip, orgId]
            );
            const auditId = audit.rows[0]?.id || null;

            return res.json({
                success: true,
                token,
                usuario: {
                    id:       user.id,
                    nome:     user.nome,
                    sobrenome: user.sobrenome,
                    area:     user.area,
                    funcao:   user.funcao,
                    papel:    role,
                    organization_id: orgId
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

    // ── POST /api/session/ping ───────────────────
    // Heartbeat: o frontend chama a cada 5 minutos para manter a sessão viva.
    app.post('/api/session/ping', async (req, res) => {
        try {
            const { auditId } = req.body;
            let userId = null;

            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET_CURRENT);
                    userId = decoded.id;
                } catch (e) {
                    try {
                        const decodedLeg = jwt.verify(token, JWT_SECRET_LEGACY);
                        userId = decodedLeg.id;
                    } catch (_) {}
                }
            }

            if (auditId) {
                await pool.query(
                    `UPDATE auditoria SET ultimo_ping = NOW() WHERE id = $1 AND data_hora_logout IS NULL`,
                    [auditId]
                );
            } else if (userId) {
                await pool.query(
                    `UPDATE auditoria SET ultimo_ping = NOW() WHERE id_usuario = $1 AND data_hora_logout IS NULL`,
                    [userId]
                );
            }
            return res.json({ success: true });
        } catch (err) {
            console.error('Erro no /api/session/ping:', err);
            return res.json({ success: false });
        }
    });

    // ── POST /api/session/close ──────────────────
    // Usado pelo sendBeacon quando o browser fecha (não requer JWT pois beacon é fire-and-forget)
    app.post('/api/session/close', async (req, res) => {
        try {
            const { auditId } = req.body;
            if (!auditId) return res.json({ success: false });
            await pool.query(
                `UPDATE auditoria
                 SET data_hora_logout = NOW(),
                     tempo_sessao = EXTRACT(EPOCH FROM (NOW() - data_hora_login))::INTEGER
                 WHERE id = $1 AND data_hora_logout IS NULL`,
                [auditId]
            );
            return res.json({ success: true });
        } catch (err) {
            console.error('Erro no /api/session/close:', err);
            return res.json({ success: false });
        }
    });

    // ── POST /api/recover ────────────────────────
    app.post('/api/recover', recoverLimiter, async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ error: 'O E-mail é obrigatório.' });

            const normalizedEmail = String(email).trim().toLowerCase();
            const colaborador = findInBase(null, normalizedEmail);

            const rawResetToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');

            let emailEnviado = false;
            if (colaborador && process.env.SMTP_HOST && process.env.SMTP_USER) {
                const mailOptions = {
                    from: `"Agente RIT Rota Inteligente de Transporte" <${process.env.SMTP_USER}>`,
                    to: normalizedEmail,
                    subject: 'Recuperação de Senha - Agente RIT',
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:8px;">
                            <h2 style="color:#00D1FF;">Agente RIT - Redefinição de Acesso</h2>
                            <p>Olá <strong>${colaborador._nome || 'Colaborador'}</strong>,</p>
                            <p>Recebemos uma solicitação de recuperação de senha para a conta associada à matrícula <strong>${colaborador._matricula || ''}</strong>.</p>
                            <p>Código temporário de redefinição de acesso: <strong>${rawResetToken}</strong> (Válido por 1 hora).</p>
                            <p>Para recuperar o acesso, realize um novo <strong>Cadastro (Primeiro acesso)</strong> na tela inicial do sistema com seus dados corporativos oficiais ou utilize a rota de redefinição direta.</p>
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
                emailEnviado = true;
            }

            try {
                await pool.query(
                    `INSERT INTO recuperacao_senha (email, email_enviado, solicitado_em)
                     VALUES ($1, $2, NOW())`,
                    [normalizedEmail, emailEnviado]
                );
            } catch (recErr) {
                console.warn('⚠️ Falha ao salvar log de recuperação:', recErr.message);
            }

            // Resposta genérica (evita enumeração de e-mails)
            return res.json({
                success: true,
                message: 'Se o e-mail estiver na base corporativa homologada, enviaremos as instruções para redefinição de senha e recadastro.'
            });
        } catch (err) {
            console.error('Erro no /api/recover:', err);
            return res.status(500).json({ error: 'Erro interno ao processar recuperação.' });
        }
    });

    // ── POST /api/recover/reset ───────────────────
    app.post('/api/recover/reset', recoverLimiter, async (req, res) => {
        try {
            const { email, matricula, novaSenha } = req.body;
            if (!email || !matricula || !novaSenha) {
                return res.status(400).json({ error: 'E-mail, matrícula e nova senha são obrigatórios.' });
            }

            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
            if (!passwordRegex.test(novaSenha)) {
                return res.status(400).json({
                    error: 'A senha deve ter no mínimo 8 caracteres com: número, maiúscula, minúscula e caractere especial.'
                });
            }

            const normalizedEmail = String(email).trim().toLowerCase();
            const normalizedMatricula = String(matricula).trim();

            const userRes = await pool.query(
                'SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 AND matricula = $2',
                [normalizedEmail, normalizedMatricula]
            );

            if (userRes.rows.length === 0) {
                return res.status(404).json({ error: 'Usuário não localizado com os dados informados.' });
            }

            const hashed = await bcrypt.hash(novaSenha, 10);
            await pool.query('UPDATE users SET senha = $1 WHERE id = $2', [hashed, userRes.rows[0].id]);
            await pool.query(
                `UPDATE recuperacao_senha SET cadastro_concluido = TRUE, concluido_em = NOW()
                 WHERE LOWER(TRIM(email)) = $1 AND cadastro_concluido = FALSE`,
                [normalizedEmail]
            );

            return res.json({ success: true, message: 'Senha redefinida com sucesso! Você já pode entrar.' });
        } catch (err) {
            console.error('Erro no /api/recover/reset:', err);
            return res.status(500).json({ error: 'Erro interno ao redefinir senha.' });
        }
    });

    // ── POST /api/auth/refresh ───────────────────
    app.post('/api/auth/refresh', verifyToken, async (req, res) => {
        try {
            const { id, matricula, role, organization_id } = req.user;
            let finalRole = role || 'Colaborador';
            const userMat = String(matricula || '').trim().replace(/^0+/, '');
            const userEmail = String(req.user.email || '').trim().toLowerCase();
            if (userMat === '68808' || userEmail.includes('fabio.paixao') || userEmail.includes('fapaixao')) {
                finalRole = 'Administrador';
            }
            const newToken = jwt.sign(
                { id, matricula, email: req.user.email, role: finalRole, organization_id: organization_id || 'globo' },
                JWT_SECRET_CURRENT,
                { expiresIn: '12h' }
            );
            return res.json({ success: true, token: newToken });
        } catch (err) {
            console.error('Erro no /api/auth/refresh:', err);
            return res.status(500).json({ error: 'Falha ao renovar sessão.' });
        }
    });

    // ── GET /api/auth/me ─────────────────────────
    app.get('/api/auth/me', verifyToken, async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT id, nome, sobrenome, matricula, email, funcao, papel, area, organization_id, criado_em FROM users WHERE id = $1',
                [req.user.id]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }
            const u = result.rows[0];
            let userRole = u.papel || u.funcao || 'Colaborador';
            const normMat = String(u.matricula || '').trim().replace(/^0+/, '');
            const normMail = String(u.email || '').trim().toLowerCase();
            if (normMat === '68808' || normMail.includes('fabio.paixao') || normMail.includes('fapaixao')) {
                userRole = 'Administrador';
            }
            return res.json({
                success: true,
                user: {
                    id: u.id,
                    nome: u.nome,
                    sobrenome: u.sobrenome,
                    matricula: u.matricula,
                    email: u.email,
                    funcao: u.funcao,
                    papel: userRole,
                    area: u.area,
                    organization_id: u.organization_id || 'globo',
                    criado_em: u.criado_em
                }
            });
        } catch (err) {
            console.error('Erro no /api/auth/me:', err);
            return res.status(500).json({ error: 'Erro interno ao consultar perfil do usuário.' });
        }
    });

    // ── GET /api/audit ───────────────────────────
    // RBAC: Estritamente restrito a Administradores, Auditores e Gestores
    app.get('/api/audit', verifyToken, requireRole(['Administrador', 'Auditor', 'Gestor']), async (req, res) => {
        try {
            // Se o usuário logado está consultando ativamente o painel, renova o heartbeat da sua sessão aberta
            if (req.user && req.user.id) {
                await pool.query(
                    `UPDATE auditoria SET ultimo_ping = NOW() WHERE id_usuario = $1 AND data_hora_logout IS NULL`,
                    [req.user.id]
                );
            }

            // Auto-cleanup: fecha sessões que estão sem ping há mais de 45 minutos (ou sem ping inicial há mais de 45min)
            // OU com mais de 12 horas corridas
            await pool.query(`
                UPDATE auditoria
                SET data_hora_logout = COALESCE(ultimo_ping, data_hora_login + INTERVAL '30 minutes'),
                    tempo_sessao = EXTRACT(EPOCH FROM (
                        COALESCE(ultimo_ping, data_hora_login + INTERVAL '30 minutes') - data_hora_login
                    ))::INTEGER
                WHERE data_hora_logout IS NULL
                  AND (
                      data_hora_login < NOW() - INTERVAL '12 hours'
                      OR (ultimo_ping IS NOT NULL AND ultimo_ping < NOW() - INTERVAL '45 minutes')
                      OR (ultimo_ping IS NULL AND data_hora_login < NOW() - INTERVAL '45 minutes')
                  )
            `);

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
                    a.ip_origem,
                    COALESCE(a.organization_id, 'globo') AS organization_id
                FROM auditoria a
                JOIN users u ON u.id = a.id_usuario
                ORDER BY a.data_hora_login DESC;
            `;
            const result = await pool.query(query);

            // Rastreabilidade LGPD
            await registrarAuditoriaLGPD({
                id_usuario: req.user.id,
                usuario_identificador: req.user.matricula,
                papel_usuario: req.user.role,
                recurso_acessado: 'AUDITORIA_SESSOES',
                acao: 'CONSULTA',
                dado_visualizado: `Registros de ${result.rows.length} sessões`,
                ip_origem: req.ip || req.headers['x-forwarded-for'],
                user_agent: req.headers['user-agent'],
                organization_id: req.user.organization_id || 'globo'
            });

            return res.json({ success: true, data: result.rows });
        } catch (err) {
            console.error('Erro no /api/audit:', err);
            return res.status(500).json({ error: 'Erro interno ao buscar auditoria.' });
        }
    });

    // ── POST /api/audit/kick ─────────────────────
    // RBAC: Restrito a Administradores e Gestores
    app.post('/api/audit/kick', verifyToken, requireRole(['Administrador', 'Gestor']), async (req, res) => {
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

            // Rastreabilidade LGPD
            await registrarAuditoriaLGPD({
                id_usuario: req.user.id,
                usuario_identificador: req.user.matricula,
                papel_usuario: req.user.role,
                recurso_acessado: 'SESSAO_USUARIO',
                acao: 'EXCLUSAO',
                dado_visualizado: `Encerramento forçado de sessão ID ${auditId}`,
                ip_origem: req.ip || req.headers['x-forwarded-for'],
                user_agent: req.headers['user-agent'],
                organization_id: req.user.organization_id || 'globo',
                detalhes: { auditId }
            });

            return res.json({ success: true, message: 'Acesso encerrado com sucesso.' });
        } catch (err) {
            console.error('Erro no /api/audit/kick:', err);
            return res.status(500).json({ error: 'Erro interno ao encerrar o acesso.' });
        }
    });

    // ── GET /api/recuperacoes ─────────────────────
    // RBAC: Restrito a Administradores e Auditores
    app.get('/api/recuperacoes', verifyToken, requireRole(['Administrador', 'Auditor']), async (req, res) => {
        try {
            const query = `
                SELECT 
                    r.id,
                    r.email,
                    u.nome,
                    u.sobrenome,
                    u.matricula,
                    r.solicitado_em,
                    r.email_enviado,
                    r.cadastro_concluido,
                    r.concluido_em,
                    (
                        SELECT a.data_hora_login 
                        FROM auditoria a 
                        WHERE a.id_usuario = u.id AND a.data_hora_login >= (r.solicitado_em - INTERVAL '5 minutes')
                        ORDER BY a.data_hora_login ASC 
                        LIMIT 1
                    ) AS login_pos_recuperacao,
                    (
                        SELECT a.data_hora_login 
                        FROM auditoria a 
                        WHERE a.id_usuario = u.id 
                        ORDER BY a.data_hora_login DESC 
                        LIMIT 1
                    ) AS ultimo_login_geral,
                    EXISTS (
                        SELECT 1 
                        FROM auditoria a 
                        WHERE a.id_usuario = u.id AND a.data_hora_login >= (r.solicitado_em - INTERVAL '5 minutes')
                    ) AS conseguiu_logar
                FROM recuperacao_senha r
                LEFT JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(r.email))
                ORDER BY r.solicitado_em DESC;
            `;
            const result = await pool.query(query);

            await registrarAuditoriaLGPD({
                id_usuario: req.user.id,
                usuario_identificador: req.user.matricula,
                papel_usuario: req.user.role,
                recurso_acessado: 'RECUPERACOES_SENHA',
                acao: 'CONSULTA',
                dado_visualizado: `Histórico de ${result.rows.length} recuperações`,
                ip_origem: req.ip || req.headers['x-forwarded-for'],
                user_agent: req.headers['user-agent'],
                organization_id: req.user.organization_id || 'globo'
            });

            return res.json({ success: true, data: result.rows });
        } catch (err) {
            console.error('Erro no /api/recuperacoes:', err);
            return res.status(500).json({ error: 'Erro interno ao buscar recuperações.' });
        }
    });

    // ── POST /api/audit/force-reset ────────────────
    // RBAC: Estritamente restrito a Administradores
    app.post('/api/audit/force-reset', verifyToken, requireRole(['Administrador']), async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(400).json({ error: 'E-mail é obrigatório.' });
            }

            const userResult = await pool.query(
                'SELECT id, nome, sobrenome, email FROM users WHERE email = $1',
                [email.toLowerCase()]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'Nenhum usuário cadastrado com este e-mail.' });
            }

            const targetUser = userResult.rows[0];
            const colaborador = findInBase(null, email);

            let emailEnviado = false;
            if (process.env.SMTP_HOST && process.env.SMTP_USER) {
                const mailOptions = {
                    from: `"Agente RIT - Rotas Inteligentes de Transportes" <${process.env.SMTP_USER}>`,
                    to: email,
                    subject: '⚠️ Redefinição de Senha Obrigatória - Agente RIT',
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:8px;">
                            <h2 style="color:#00D1FF;">Agente RIT - Redefinição de Acesso Obrigatória</h2>
                            <p>Olá <strong>${targetUser.nome} ${targetUser.sobrenome}</strong>,</p>
                            <p>Por razões de <strong>segurança</strong>, o administrador do sistema solicitou a redefinição da sua senha de acesso.</p>
                            <p>Para recuperar o acesso, siga as etapas abaixo:</p>
                            <ol>
                                <li>Acesse a tela de login do sistema.</li>
                                <li>Clique em <strong>"Esqueci minha senha"</strong> ou acesse a opção de <strong>Primeiro Acesso</strong>.</li>
                                <li>Informe seus dados corporativos (matrícula e e-mail) para validação.</li>
                                <li>Crie uma nova senha segura.</li>
                            </ol>
                            <p>Se você já realizou a redefinição ou não reconhece esta solicitação, entre em contato com o suporte de TI.</p>
                            <br>
                            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                            <p style="font-size:12px;color:#888;">Esta mensagem foi gerada automaticamente pelo Centro de Comando e Monitoramento RIT. Não responda a este e-mail.</p>
                        </div>
                    `
                };

                try {
                    await transporter.sendMail(mailOptions);
                    emailEnviado = true;
                    console.log(`✅ [force-reset] E-mail enviado para: ${email}`);
                } catch (mailErr) {
                    console.error(`❌ [force-reset] Falha ao enviar e-mail:`, mailErr);
                    emailEnviado = false;
                }
            }

            await pool.query(
                `INSERT INTO recuperacao_senha (email, email_enviado)
                 VALUES ($1, $2)`,
                [email.toLowerCase(), emailEnviado]
            );

            await registrarAuditoriaLGPD({
                id_usuario: req.user.id,
                usuario_identificador: req.user.matricula,
                papel_usuario: req.user.role,
                recurso_acessado: 'REDEFINICAO_FORCADA',
                acao: 'ATUALIZACAO',
                dado_visualizado: `Redefinição forçada disparada para ${email}`,
                ip_origem: req.ip || req.headers['x-forwarded-for'],
                user_agent: req.headers['user-agent'],
                organization_id: req.user.organization_id || 'globo'
            });

            return res.json({
                success: true,
                emailEnviado,
                message: emailEnviado
                    ? `E-mail de redefinição enviado para ${email} com sucesso.`
                    : `Solicitação registrada, mas o e-mail não pôde ser enviado (verifique as configurações de SMTP).`
            });
        } catch (err) {
            console.error('Erro no /api/audit/force-reset:', err);
            return res.status(500).json({ error: 'Erro interno ao forçar redefinição.' });
        }
    });
}

module.exports = { setupAuthRoutes, loadBaseColaboradores, verifyToken, requireRole, JWT_SECRET_CURRENT, JWT_SECRET_LEGACY };
