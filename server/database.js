const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : false
});

// Cria as tabelas se não existirem
async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id          SERIAL PRIMARY KEY,
                nome        TEXT NOT NULL,
                sobrenome   TEXT NOT NULL,
                matricula   TEXT UNIQUE NOT NULL,
                email       TEXT UNIQUE NOT NULL,
                senha       TEXT NOT NULL,
                funcao      TEXT DEFAULT 'Colaborador',
                area        TEXT DEFAULT 'Geral',
                criado_em   TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS auditoria (
                id               SERIAL PRIMARY KEY,
                id_usuario       INTEGER REFERENCES users(id),
                data_hora_login  TIMESTAMPTZ DEFAULT NOW(),
                data_hora_logout TIMESTAMPTZ,
                tempo_sessao     INTEGER,
                ip_origem        TEXT
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS recuperacao_senha (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                solicitado_em TIMESTAMPTZ DEFAULT NOW(),
                email_enviado BOOLEAN DEFAULT FALSE,
                cadastro_concluido BOOLEAN DEFAULT FALSE,
                concluido_em TIMESTAMPTZ
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS lotes_importacao (
                id SERIAL PRIMARY KEY,
                id_usuario INTEGER REFERENCES users(id),
                nome_arquivo TEXT NOT NULL,
                criado_em TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS rotas_importadas (
                id SERIAL PRIMARY KEY,
                id_lote INTEGER REFERENCES lotes_importacao(id) ON DELETE CASCADE,
                origem TEXT NOT NULL,
                destino TEXT NOT NULL,
                horario TEXT,
                distancia_km NUMERIC,
                tempo_min NUMERIC,
                custo_estimado NUMERIC,
                status TEXT DEFAULT 'PENDENTE',
                erro TEXT,
                criado_em TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        await client.query(`
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS matricula TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS nome_colaborador TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS area TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS transito BOOLEAN DEFAULT FALSE;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS chuva BOOLEAN DEFAULT FALSE;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS motorista_nome TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS motorista_telefone TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS tipo_veiculo TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS placa_veiculo TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS horario_termino TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS programa TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS localidade_origem TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS localidade_destino TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS passageiro TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS status_atendimento TEXT DEFAULT 'PENDENTE';
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS ot TEXT;
            ALTER TABLE rotas_importadas ADD COLUMN IF NOT EXISTS codigo_ot_detalhado TEXT;
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS posicoes_motoristas (
                motorista_nome TEXT PRIMARY KEY,
                lat NUMERIC NOT NULL,
                lng NUMERIC NOT NULL,
                placa TEXT,
                tipo_veiculo TEXT,
                programa TEXT,
                speed INTEGER,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        await client.query(`
            ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS ultimo_ping TIMESTAMPTZ;
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS historico_atendimentos (
                id SERIAL PRIMARY KEY,
                id_atendimento INTEGER NOT NULL,
                data_hora TIMESTAMPTZ DEFAULT NOW(),
                evento TEXT NOT NULL
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS gps_historico_atendimento (
                id SERIAL PRIMARY KEY,
                id_atendimento INTEGER NOT NULL,
                latitude NUMERIC NOT NULL,
                longitude NUMERIC NOT NULL,
                velocidade NUMERIC NOT NULL,
                data_hora TIMESTAMPTZ DEFAULT NOW(),
                precisao NUMERIC DEFAULT 10,
                status TEXT,
                tipo_evento TEXT DEFAULT 'GPS',
                fonte_localizacao TEXT DEFAULT 'GPS'
            );
            CREATE INDEX IF NOT EXISTS idx_gps_atendimento ON gps_historico_atendimento(id_atendimento);
            CREATE INDEX IF NOT EXISTS idx_gps_datahora ON gps_historico_atendimento(data_hora);
            CREATE INDEX IF NOT EXISTS idx_gps_atendimento_datahora ON gps_historico_atendimento(id_atendimento, data_hora);
            CREATE TABLE IF NOT EXISTS auditoria_operacional (
                id SERIAL PRIMARY KEY,
                usuario TEXT,
                atendimento INTEGER,
                placa TEXT,
                motorista TEXT,
                data_hora TIMESTAMPTZ DEFAULT NOW(),
                evento TEXT DEFAULT 'SOLICITACAO_POSICAO_GPS'
            );
        `);
        console.log('✅ Banco de dados PostgreSQL inicializado com sucesso.');
        
        // Limpeza de posições GPS obsoletas (Retenção de 12 meses)
        try {
            const deleteRes = await client.query("DELETE FROM gps_historico_atendimento WHERE data_hora < NOW() - INTERVAL '12 months'");
            console.log(`🧹 [RETENÇÃO GPS] Limpeza efetuada: ${deleteRes.rowCount} registros com mais de 12 meses removidos.`);
        } catch (gcErr) {
            console.warn('⚠️ [RETENÇÃO GPS] Falha ao executar rotina de limpeza:', gcErr.message);
        }
    } catch (err) {
        console.error('❌ Erro ao inicializar banco de dados:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { pool, initDB };
