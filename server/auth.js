const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'agente-rig-super-secret-2026';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
    }
});

// The path to the Excel file specified in the prompt
const baseColaboradoresPath = path.resolve(__dirname, '../Normas/Base de Colaboradores Globo para validação do Agente RIT - Abril 2025.xlsx');

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
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);
        
        baseColaboradoresCache = data.map(row => {
            // Normalizar as chaves para facilitar a busca ignorando acentos e espaços
            const normalizedRow = {};
            for (let key in row) {
                const normKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
                normalizedRow[normKey] = row[key];
            }
            // Mapeamentos comuns para garantir que encontramos email e matrícula mesmo que as colunas variem levemente
            normalizedRow._email = normalizedRow.email || normalizedRow.e_mail || normalizedRow['e-mail'] || normalizedRow.email_corporativo;
            normalizedRow._matricula = normalizedRow.matricula || normalizedRow.id || normalizedRow.registro;
            normalizedRow._nome = normalizedRow.nome || normalizedRow.nome_funcionario || normalizedRow.nome_completo;
            return normalizedRow;
        });
        lastModifiedTime = stats.mtime;
        console.log(`✅ Base de Colaboradores carregada/atualizada: ${baseColaboradoresCache.length} registros.`);
        return baseColaboradoresCache;
    } catch (error) {
        console.error('❌ Erro ao ler a Base de Colaboradores (Excel):', error);
        return [];
    }
}

// Busca o usuário na base do Excel
function findInBase(matricula, email) {
    const base = loadBaseColaboradores();
    return base.find(c => {
        const matchMatricula = matricula && c._matricula && String(c._matricula).trim() === String(matricula).trim();
        const matchEmail = email && c._email && String(c._email).trim().toLowerCase() === String(email).trim().toLowerCase();
        return matchMatricula || matchEmail;
    });
}

function setupAuthRoutes(app) {
    // Tenta carregar no startup
    loadBaseColaboradores();

    app.post('/api/register', async (req, res) => {
        const { nome, sobrenome, matricula, email, senha } = req.body;
        
        if (!nome || !sobrenome || !matricula || !email || !senha) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        }
        
        // Regras de Senha: min 8 chars, 1 número, 1 maiúscula, 1 minúscula, 1 especial
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!passwordRegex.test(senha)) {
            return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres, contendo: número, letra maiúscula, minúscula e caractere especial.' });
        }
        
        // Verifica se matrícula/e-mail consta na Base Excel (condição do projeto)
        const colaborador = findInBase(matricula, email);
        if (!colaborador) {
            return res.status(403).json({ error: 'Você não possui acesso. Favor entrar em contato com a Área de Transportes Globo.' });
        }

        // Puxa Função e Área automaticamente (usa nomes de colunas comuns no caso de variar)
        const funcao = colaborador.funcao || colaborador.cargo || 'Colaborador';
        const area = colaborador.area || colaborador.setor || colaborador.departamento || 'Geral';

        // Verifica se já não está cadastrado no SQLite
        db.get('SELECT id FROM usuarios WHERE matricula = ? OR email = ?', [matricula, email], async (err, row) => {
            if (err) return res.status(500).json({ error: 'Erro ao conectar com o banco de dados interno.' });
            if (row) return res.status(400).json({ error: 'Este usuário já possui cadastro ativo no sistema.' });

            try {
                const hashedSenha = await bcrypt.hash(senha, 10);
                db.run('INSERT INTO usuarios (nome, sobrenome, matricula, email, senha, funcao, area) VALUES (?, ?, ?, ?, ?, ?, ?)', 
                [nome, sobrenome, matricula, email, hashedSenha, funcao, area], function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Erro ao registrar usuário localmente.' });
                    }
                    res.json({ success: true, message: 'Cadastro realizado com sucesso! Você já pode entrar.', funcao, area });
                });
            } catch (error) {
                res.status(500).json({ error: 'Erro ao processar segurança da senha.' });
            }
        });
    });

    app.post('/api/login', (req, res) => {
        const { identificador, senha } = req.body; // identificador = matrícula ou email
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconhecido';

        if (!identificador || !senha) {
            return res.status(400).json({ error: 'Matrícula/E-mail e senha são obrigatórios.' });
        }

        // Busca no SQLite
        db.get('SELECT * FROM usuarios WHERE matricula = ? OR email = ?', [identificador, identificador], async (err, user) => {
            if (err) return res.status(500).json({ error: 'Erro ao conectar com o banco de dados interno.' });
            if (!user) return res.status(401).json({ error: 'Credenciais inválidas. Verifique os dados inseridos.' });

            const validPassword = await bcrypt.compare(senha, user.senha);
            if (!validPassword) return res.status(401).json({ error: 'Credenciais inválidas. Verifique a senha.' });

            // REGRA IMPORTANTE: Bloquear se não estiver MAIS na base Excel
            const isStillInBase = findInBase(user.matricula, user.email);
            if (!isStillInBase) {
                return res.status(403).json({ error: 'Você não possui acesso. Favor entrar em contato com a Área de Transportes Globo.' });
            }

            const token = jwt.sign({ id: user.id, matricula: user.matricula, role: user.funcao }, JWT_SECRET, { expiresIn: '12h' });

            // Registro na tabela de Auditoria
            db.run('INSERT INTO auditoria (id_usuario, data_hora_login, ip_origem) VALUES (?, datetime("now", "localtime"), ?)', [user.id, ip], function(err) {
                const auditId = this ? this.lastID : null;
                res.json({ 
                    success: true, 
                    token, 
                    usuario: { nome: user.nome, sobrenome: user.sobrenome, area: user.area, funcao: user.funcao },
                    auditId 
                });
            });
        });
    });

    app.post('/api/logout', (req, res) => {
        const { auditId } = req.body;
        if (auditId) {
            // Calcula o tempo de sessão em segundos
            db.run(`UPDATE auditoria 
                    SET data_hora_logout = datetime("now", "localtime"), 
                        tempo_sessao = CAST((julianday('now', 'localtime') - julianday(data_hora_login)) * 24 * 60 * 60 AS INTEGER) 
                    WHERE id = ?`, [auditId]);
        }
        res.json({ success: true });
    });

    app.post('/api/recover', (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'O E-mail é obrigatório.' });

        const isGlobo = email.toLowerCase().includes('globo');
        
        console.log(`[RECOVER] Tentativa de recuperação para: ${email}`);
        
        // Procura na base se é válido
        const colaborador = findInBase(null, email);
        console.log(`[RECOVER] Encontrado na base Excel? ${!!colaborador}. isGlobo? ${isGlobo}`);

        if (colaborador && isGlobo) {
            if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
                console.warn('⚠️ Solicitação de recuperação recebida, mas SMTP_HOST/SMTP_USER não configurados no .env.');
            } else {
                const mailOptions = {
                    from: `"Agente RIT Rota Inteligente de Transporte" <${process.env.SMTP_USER}>`,
                    to: email,
                    subject: 'Recuperação de Senha - Agente RIT',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                            <h2 style="color: #00D1FF;">Agente RIT - Redefinição de Acesso</h2>
                            <p>Olá <strong>${colaborador._nome || colaborador.nome || 'Colaborador'}</strong>,</p>
                            <p>Recebemos uma solicitação de recuperação de senha para a sua conta associada à matrícula <strong>${colaborador._matricula || ''}</strong>.</p>
                            <p>Para recuperar o seu acesso, por favor, realize um novo <strong>Cadastro (Primeiro acesso)</strong> na tela inicial do sistema utilizando os seus dados corporativos oficiais.</p>
                            <p>O sistema irá validar suas credenciais com a Base de Transportes e recadastrar sua nova senha automaticamente.</p>
                            <br>
                            <p>Se você não solicitou isso, pode ignorar este e-mail com segurança.</p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="font-size: 12px; color: #888;">Este é um e-mail automático do Centro de Comando e Monitoramento RIT.</p>
                        </div>
                    `
                };

                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error('❌ Erro ao enviar e-mail:', error);
                    } else {
                        console.log('✅ E-mail de recuperação enviado para:', email, info.messageId);
                    }
                });
            }
            
            // Sucesso simulado/real: o fluxo exigido é apenas de exibir a confirmação e avisar para recadastrar
            return res.json({ success: true, message: 'Se o e-mail estiver na base corporativa Globo, enviaremos as instruções para redefinição de senha e recadastro.' });
        } else {
            // Mensagem idêntica por segurança (evita enumeração de e-mails válidos)
            return res.json({ success: true, message: 'Se o e-mail estiver na base corporativa Globo, enviaremos as instruções para redefinição de senha e recadastro.' });
        }
    });
}

module.exports = { setupAuthRoutes, loadBaseColaboradores };
