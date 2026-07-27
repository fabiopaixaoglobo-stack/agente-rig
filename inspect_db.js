const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/agente_rig',
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        console.log("Conectando ao banco de dados...");
        const resPos = await pool.query('SELECT * FROM posicoes_motoristas');
        console.log("\n--- POSIÇÕES MOTORISTAS (%s) ---", resPos.rows.length);
        console.log(resPos.rows);

        const resRotas = await pool.query('SELECT id, motorista_nome, status_atendimento, horario FROM rotas_importadas WHERE status_atendimento != \'PENDENTE\' LIMIT 10');
        console.log("\n--- ROTAS ALTERADAS (%s) ---", resRotas.rows.length);
        console.log(resRotas.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
