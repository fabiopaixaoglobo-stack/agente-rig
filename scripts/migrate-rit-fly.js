/**
 * Script de Execução e Verificação de Migração: RIT FLY
 * Aplica 002_rit_fly_schema.sql com transacionalidade e idempotência.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/database');

async function migrate() {
    console.log('===============================================================');
    console.log('🚀 EXECUTANDO MIGRAÇÃO REAL: 002_rit_fly_schema.sql');
    console.log('===============================================================');

    const sqlPath = path.join(__dirname, '../migrations/002_rit_fly_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    const client = await pool.connect();
    try {
        console.log('[MIGRATE] Conectado ao PostgreSQL:', process.env.DATABASE_URL ? 'Render Cloud PG (SSL)' : 'Local PG');
        console.log('[MIGRATE] Aplicando migration SQL UP...');
        await client.query(sql);
        console.log('✅ [MIGRATE] Migration aplicada com sucesso!');

        // Verificação das tabelas criadas
        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name IN ('rit_fly_trips', 'rit_fly_alerts')
            ORDER BY table_name;
        `);
        console.log('\n[AUDIT] Tabelas confirmadas:', tablesRes.rows.map(r => r.table_name));

        for (const t of tablesRes.rows) {
            const colsRes = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = $1
                ORDER BY ordinal_position;
            `, [t.table_name]);
            console.log(`\n[COLUNAS] ${t.table_name} (${colsRes.rows.length} colunas):`);
            colsRes.rows.forEach(c => console.log(`  - ${c.column_name} [${c.data_type}] (nullable: ${c.is_nullable})`));
        }

        // Verificação de índices
        const idxRes = await client.query(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename IN ('rit_fly_trips', 'rit_fly_alerts')
            ORDER BY tablename, indexname;
        `);
        console.log('\n[ÍNDICES] Índices confirmados:');
        idxRes.rows.forEach(i => console.log(`  - ${i.indexname}: ${i.indexdef}`));

        console.log('\n===============================================================');
        console.log('🎉 MIGRAÇÃO 002_RIT_FLY HOMOLOGADA NO BANCO DE DADOS');
        console.log('===============================================================');
        process.exit(0);
    } catch (err) {
        console.error('❌ [MIGRATE] Falha na migração:', err.message);
        process.exit(1);
    } finally {
        client.release();
    }
}

migrate();
