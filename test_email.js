require('dotenv').config();
const nodemailer = require('nodemailer');
const { loadBaseColaboradores } = require('./server/auth.js');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const base = loadBaseColaboradores();
const linhas = [11814, 13887, 33, 432, 8131, 8401, 9379, 10935, 11118];

async function run() {
    for (const linha of linhas) {
        const colaborador = base[linha - 2];
        if (colaborador) {
            console.log(`\nPreparando envio para Linha ${linha}: ${colaborador._nome} (${colaborador._email})`);
            const mailOptions = {
                from: `"Agente RIT Rota Inteligente de Transporte" <${process.env.SMTP_USER}>`,
                to: colaborador._email,
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

            try {
                const info = await transporter.sendMail(mailOptions);
                console.log(`✅ Sucesso! E-mail enviado. ID: ${info.messageId}`);
            } catch (err) {
                console.error(`❌ Falha ao enviar para ${colaborador._email}:`, err.message);
            }
        } else {
            console.log(`Linha ${linha}: NÃO ENCONTRADO na base.`);
        }
    }
    console.log('\nTodos os testes concluídos.');
}

run();
