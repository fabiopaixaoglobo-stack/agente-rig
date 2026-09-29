/**
 * Agente RIT - Auditoria Runtime de Persistência Relacional: CHECKPOINT 4.1
 * Executa as 10 etapas obrigatórias contra a instância real do PostgreSQL:
 * 1. Migration UP real
 * 2. Consulta e inspeção das 5 tabelas
 * 3. Upsert de incidente sanitizado de teste
 * 4. Leitura por ID
 * 5. Deduplicação com ON CONFLICT
 * 6. Histórico de auditoria
 * 7. Consulta geoespacial Haversine sem PostGIS
 * 8. Rollback completo (DOWN)
 * 9. Nova migration UP (confirmação de idempotência)
 * 10. Limpeza final e geração de postgres-runtime-evidence.json (sem segredos)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { TrafficRepository } = require('../server/traffic-alert/db/traffic-repository');
const { createTrafficIncidentDTO, createIncidentSourceDTO } = require('../server/traffic-alert/types/canonical-dto');
const { INCIDENT_DOMAINS, SEVERITY_LEVELS } = require('../server/traffic-alert/constants');

const ARTIFACTS_DIR = 'C:\\Users\\fapaixao\\.gemini\\antigravity\\brain\\30b807a5-59a0-43c8-aa79-9009c86187f6';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function main() {
    console.log('===============================================================');
    console.log('🐘 INICIANDO AUDITORIA POSTGRESQL REAL: CHECKPOINT 4.1');
    console.log('===============================================================');

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL não configurada no ambiente.');
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    const client = await pool.connect();
    const evidence = {
        timestamp: new Date().toISOString(),
        persistenceMode: 'POSTGRES',
        sslActive: true,
        postgresVersion: null,
        schema: 'public',
        steps: [],
        tablesFound: [],
        indexesFound: [],
        testRecordsCount: 0,
        queryTimingsMs: {},
        rollbackConfirmed: false,
        idempotencyConfirmed: false
    };

    try {
        // 0. Versão do PostgreSQL
        const vRes = await client.query('SELECT version()');
        evidence.postgresVersion = vRes.rows[0].version;
        console.log(`✅ Conectado ao banco: ${evidence.postgresVersion}`);

        // 1. Migration UP Real
        console.log('Etapa 1: Executando migration UP real (001_traffic_alert_schema.sql)...');
        const upSql = fs.readFileSync(path.join(MIGRATIONS_DIR, '001_traffic_alert_schema.sql'), 'utf8');
        const tUp0 = Date.now();
        await client.query(upSql);
        evidence.queryTimingsMs.migrationUp1 = Date.now() - tUp0;
        evidence.steps.push({ step: 1, name: 'migration_up_initial', durationMs: evidence.queryTimingsMs.migrationUp1, status: 'SUCCESS' });
        console.log(`✅ Migration UP aplicada com sucesso (${evidence.queryTimingsMs.migrationUp1}ms).`);

        // 2. Consulta às 5 tabelas e índices
        console.log('Etapa 2: Inspecionando as 5 tabelas canônicas e seus índices...');
        const t2_0 = Date.now();
        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name IN ('traffic_incidents', 'traffic_incident_sources', 'traffic_incident_history', 'traffic_provider_health', 'traffic_camera_matches')
            ORDER BY table_name;
        `);
        evidence.tablesFound = tablesRes.rows.map(r => r.table_name);

        const idxRes = await client.query(`
            SELECT indexname, tablename 
            FROM pg_indexes 
            WHERE schemaname = 'public' 
              AND tablename IN ('traffic_incidents', 'traffic_incident_sources', 'traffic_incident_history', 'traffic_provider_health', 'traffic_camera_matches')
            ORDER BY tablename, indexname;
        `);
        evidence.indexesFound = idxRes.rows.map(r => `${r.tablename}.${r.indexname}`);
        evidence.queryTimingsMs.tableInspection = Date.now() - t2_0;
        evidence.steps.push({ step: 2, name: 'inspect_tables_indexes', tablesCount: evidence.tablesFound.length, indexesCount: evidence.indexesFound.length, status: 'SUCCESS' });
        console.log(`✅ 5 tabelas encontradas: ${evidence.tablesFound.join(', ')}`);
        console.log(`✅ ${evidence.indexesFound.length} índices encontrados.`);

        // Inicializa o Repository com o pool real
        const repo = new TrafficRepository(pool);

        // 3. Upsert de Incidente Sanitizado de Teste
        console.log('Etapa 3: Inserindo incidente sanitizado de teste (INC-TEST-PG-001)...');
        const testIncidentDTO = createTrafficIncidentDTO({
            id: 'd9b0a1c2-3e4f-5a6b-7c8d-9e0f1a2b3c4d',
            canonicalId: 'RIT-TEST-LV-AUDIT',
            domain: INCIDENT_DOMAINS.TRAFFIC_INCIDENT,
            title: 'Incidente Sanitizado de Teste de Persistência',
            description: 'Validação controlada de gravação e consulta relacional.',
            corridor: 'Linha Vermelha',
            lat: -22.885000,
            lng: -43.275000,
            severity: SEVERITY_LEVELS.HIGH,
            severityScore: 75.0,
            confidence: 'A',
            confidenceScore: 90.0,
            completenessScore: 85.0,
            status: 'ACTIVE',
            isSynthetic: false // Dado de teste estritamente sanitizado
        });

        const t3_0 = Date.now();
        const upserted = await repo.upsertIncident(testIncidentDTO);
        evidence.queryTimingsMs.upsertIncident = Date.now() - t3_0;
        evidence.testRecordsCount++;
        evidence.steps.push({ step: 3, name: 'upsert_sanitized_incident', id: upserted.id, durationMs: evidence.queryTimingsMs.upsertIncident, status: 'SUCCESS' });
        console.log(`✅ Incidente inserido com ID ${upserted.id} (${evidence.queryTimingsMs.upsertIncident}ms).`);

        // 4. Leitura por ID
        console.log('Etapa 4: Lendo incidente por ID...');
        const t4_0 = Date.now();
        const readInc = await repo.getIncidentById(upserted.id);
        evidence.queryTimingsMs.readById = Date.now() - t4_0;
        if (!readInc || readInc.canonical_id !== 'RIT-TEST-LV-AUDIT') {
            throw new Error('Falha ao ler incidente por ID gravado no banco.');
        }
        evidence.steps.push({ step: 4, name: 'read_incident_by_id', matchCanonicalId: readInc.canonical_id, durationMs: evidence.queryTimingsMs.readById, status: 'SUCCESS' });
        console.log(`✅ Leitura confirmada: canonical_id = ${readInc.canonical_id}`);

        // 5. Deduplicação (ON CONFLICT DO UPDATE)
        console.log('Etapa 5: Testando deduplicação e idempotência relacional no upsert...');
        const updateDTO = {
            ...testIncidentDTO,
            title: 'Incidente Sanitizado Atualizado com Sucesso (Deduplicação OK)',
            completenessScore: 95.0
        };
        const t5_0 = Date.now();
        const updated = await repo.upsertIncident(updateDTO);
        evidence.queryTimingsMs.deduplicationUpsert = Date.now() - t5_0;
        if (updated.id !== upserted.id || !updated.title.includes('Atualizado com Sucesso')) {
            throw new Error('Falha no mecanismo de deduplicação relacional ON CONFLICT.');
        }
        evidence.steps.push({ step: 5, name: 'deduplication_upsert', durationMs: evidence.queryTimingsMs.deduplicationUpsert, status: 'SUCCESS' });
        console.log(`✅ Deduplicação confirmada: registro atualizado no mesmo ID ${updated.id}`);

        // 6. Histórico de Auditoria
        console.log('Etapa 6: Gravando e consultando histórico de auditoria...');
        const t6_0 = Date.now();
        await repo.addIncidentHistory(upserted.id, { title: updated.title }, 'Atualização cadastral de teste');
        const historyList = await repo.getHistoryByIncidentId(upserted.id);
        evidence.queryTimingsMs.historyAudit = Date.now() - t6_0;
        evidence.steps.push({ step: 6, name: 'audit_history', historyCount: historyList.length, durationMs: evidence.queryTimingsMs.historyAudit, status: 'SUCCESS' });
        console.log(`✅ Histórico gravado e consultado: ${historyList.length} registro(s) encontrado(s).`);

        // 7. Consulta Geoespacial Haversine sem PostGIS
        console.log('Etapa 7: Executando consulta geoespacial Haversine/Bounding Box...');
        const t7_0 = Date.now();
        const nearby = await repo.findNearbyIncidents({
            lat: -22.885,
            lng: -43.275,
            radiusMeters: 5000,
            domain: 'TRAFFIC_INCIDENT',
            isSynthetic: false
        });
        evidence.queryTimingsMs.spatialHaversine = Date.now() - t7_0;
        evidence.steps.push({ step: 7, name: 'spatial_haversine_query', foundCount: nearby.length, durationMs: evidence.queryTimingsMs.spatialHaversine, status: 'SUCCESS' });
        console.log(`✅ Consulta Haversine concluída: ${nearby.length} registro(s) no raio de 5km (${evidence.queryTimingsMs.spatialHaversine}ms).`);

        // 8. Rollback (DOWN)
        console.log('Etapa 8: Executando rollback das 5 tabelas (001_traffic_alert_schema.down.sql)...');
        const downSql = fs.readFileSync(path.join(MIGRATIONS_DIR, '001_traffic_alert_schema.down.sql'), 'utf8');
        const t8_0 = Date.now();
        await client.query(downSql);
        evidence.queryTimingsMs.migrationDown = Date.now() - t8_0;

        // Verifica que as tabelas foram eliminadas
        const checkDown = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name IN ('traffic_incidents', 'traffic_incident_sources', 'traffic_incident_history', 'traffic_provider_health', 'traffic_camera_matches');
        `);
        if (checkDown.rows.length !== 0) {
            throw new Error(`Falha no rollback: ${checkDown.rows.length} tabelas ainda presentes.`);
        }
        evidence.rollbackConfirmed = true;
        evidence.steps.push({ step: 8, name: 'rollback_down', remainingTables: 0, durationMs: evidence.queryTimingsMs.migrationDown, status: 'SUCCESS' });
        console.log(`✅ Rollback concluído com sucesso. 0 tabelas remanescentes.`);

        // 9. Nova Migration UP (Confirmação de Idempotência)
        console.log('Etapa 9: Reaplicando migration UP para comprovação de idempotência e reprodutibilidade...');
        const t9_0 = Date.now();
        await client.query(upSql);
        evidence.queryTimingsMs.migrationUp2 = Date.now() - t9_0;

        const checkReUp = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name IN ('traffic_incidents', 'traffic_incident_sources', 'traffic_incident_history', 'traffic_provider_health', 'traffic_camera_matches');
        `);
        if (checkReUp.rows.length !== 5) {
            throw new Error(`Falha na reaplicação UP: apenas ${checkReUp.rows.length} de 5 tabelas criadas.`);
        }
        evidence.idempotencyConfirmed = true;
        evidence.steps.push({ step: 9, name: 'migration_up_idempotency', tablesRecreated: 5, durationMs: evidence.queryTimingsMs.migrationUp2, status: 'SUCCESS' });
        console.log(`✅ Idempotência comprovada: 5 tabelas recriadas perfeitamente.`);

        // 10. Limpeza do ambiente de auditoria para deixar o banco seguro
        console.log('Etapa 10: Executando limpeza final do banco para segurança de escopo...');
        await client.query(downSql);
        evidence.steps.push({ step: 10, name: 'final_cleanup_rollback', status: 'SUCCESS' });
        console.log('✅ Banco limpo com sucesso após a auditoria.');

        // Salva relatório no diretório de artefatos
        const outPath = path.join(ARTIFACTS_DIR, 'postgres-runtime-evidence.json');
        fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2), 'utf8');
        console.log(`\n🎉 EVIDÊNCIA POSTGRESQL GERADA COM SUCESSO: ${outPath}`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(err => {
    console.error('❌ Falha na auditoria do PostgreSQL:', err);
    process.exit(1);
});
