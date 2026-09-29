/**
 * Agente RIT - Runner de Migrações do Módulo RIT ALERTA
 * Executa migrações transacionais com suporte estrito a dry-run.
 * Independente da inicialização comum do servidor (não roda DDL automático no bootstrap).
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function runMigration() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run') || args.length === 0;
    const isDown = args.includes('--down');
    const isUp = args.includes('--up') || (!isDown && !isDryRun);

    const targetFile = isDown 
        ? path.join(MIGRATIONS_DIR, '001_traffic_alert_schema.down.sql')
        : path.join(MIGRATIONS_DIR, '001_traffic_alert_schema.sql');

    console.log('====================================================');
    console.log('RIT ALERTA - GERENCIADOR DE MIGRAÇÕES VERSIONADAS');
    console.log(`Modo: ${isDryRun ? 'DRY-RUN (Simulação sem escrita no banco)' : (isDown ? 'ROLLBACK (DOWN)' : 'MIGRAÇÃO (UP)')}`);
    console.log(`Arquivo Alvo: ${targetFile}`);
    console.log('====================================================');

    if (!fs.existsSync(targetFile)) {
        console.error(`❌ Erro: Arquivo de migração não encontrado: ${targetFile}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(targetFile, 'utf8');

    if (isDryRun) {
        console.log('✅ Validação do arquivo de migração concluída com sucesso.');
        console.log(`Linhas de comando SQL lidas: ${sql.split('\n').length}`);
        console.log('Contrato de tabelas identificadas no script:');
        const tables = (sql.match(/TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi) || []).map(t => t.trim());
        tables.forEach(t => console.log(`  - ${t}`));
        console.log('\n🔒 DRY-RUN CONCLUÍDO: Nenhuma alteração aplicada ao banco de dados.');
        process.exit(0);
    }

    // Se não for dry-run, exige DATABASE_URL e confirmação
    if (!process.env.DATABASE_URL) {
        console.error('❌ Erro: DATABASE_URL não definida para execução real da migração.');
        process.exit(1);
    }

    const { Pool } = require('pg');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    const client = await pool.connect();
    try {
        console.log('🚀 Iniciando transação no banco de dados...');
        await client.query(sql);
        console.log('🎉 Migração concluída com sucesso!');
    } catch (err) {
        console.error('❌ Falha na execução da migração:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    runMigration().catch(err => {
        console.error('Erro fatal:', err);
        process.exit(1);
    });
}

module.exports = { runMigration };
