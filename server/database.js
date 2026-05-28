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
        console.log('✅ Banco de dados PostgreSQL inicializado com sucesso.');
    } catch (err) {
        console.error('❌ Erro ao inicializar banco de dados:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { pool, initDB };
