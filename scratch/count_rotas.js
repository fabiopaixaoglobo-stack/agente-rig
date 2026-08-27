const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
async function main() {
    const res = await pool.query("SELECT COUNT(*) FROM rotas_importadas WHERE horario ~ '^\\d{3,}:' OR horario_termino ~ '^\\d{3,}:'");
    console.log("Total rotas corrompidas:", res.rows[0].count);
    await pool.end();
}
main().catch(console.error);
