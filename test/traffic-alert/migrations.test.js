/**
 * Agente RIT - Teste de Validação, Idempotência e Rollback de Migrações
 * Valida a conformidade das migrações SQL das 5 tabelas do RIT ALERTA (v2.2).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UP_MIGRATION_PATH = path.join(__dirname, '..', '..', 'migrations', '001_traffic_alert_schema.sql');
const DOWN_MIGRATION_PATH = path.join(__dirname, '..', '..', 'migrations', '001_traffic_alert_schema.down.sql');

describe('📜 MIGRAÇÕES SQL: VALIDAÇÃO, IDEMPOTÊNCIA E ROLLBACK (v2.2)', () => {

    test('1. Existência física e integridade dos arquivos UP e DOWN', () => {
        assert.ok(fs.existsSync(UP_MIGRATION_PATH), 'Arquivo UP deve existir no disco');
        assert.ok(fs.existsSync(DOWN_MIGRATION_PATH), 'Arquivo DOWN deve existir no disco');
    });

    test('2. Transacionalidade e Idempotência do script UP (001_traffic_alert_schema.sql)', () => {
        const upSql = fs.readFileSync(UP_MIGRATION_PATH, 'utf8');

        // Transacional
        assert.ok(upSql.includes('BEGIN;'), 'Migração UP deve ser transacional e iniciar com BEGIN;');
        assert.ok(upSql.includes('COMMIT;'), 'Migração UP deve finalizar com COMMIT;');

        // 5 Tabelas Obrigatórias
        const expectedTables = [
            'traffic_incidents',
            'traffic_incident_sources',
            'traffic_incident_history',
            'traffic_provider_health',
            'traffic_camera_matches'
        ];

        for (const table of expectedTables) {
            const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`, 'i');
            assert.ok(
                tableRegex.test(upSql),
                `Tabela ${table} deve ser criada com cláusula idempotente IF NOT EXISTS`
            );
        }

        // Segregação de Fixtures e descarte de raw payload no DDL
        assert.ok(upSql.includes('is_synthetic BOOLEAN NOT NULL DEFAULT FALSE'), 'is_synthetic deve ser obrigatório');
        assert.ok(upSql.includes('raw_payload_hash VARCHAR(64) NOT NULL'), 'raw_payload_hash deve existir no DDL');
        assert.ok(!upSql.includes('raw_payload JSONB'), 'raw_payload NÃO deve ser coluna persistida');

        // Índices idempotentes
        const expectedIndices = [
            'idx_traffic_incidents_lat_lng',
            'idx_traffic_incidents_active_real',
            'idx_traffic_incidents_corridor',
            'idx_traffic_incidents_domain',
            'idx_incident_sources_incident_id',
            'idx_incident_sources_hash',
            'idx_incident_history_incident_id',
            'idx_camera_matches_incident_id'
        ];

        for (const idx of expectedIndices) {
            const indexRegex = new RegExp(`CREATE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+${idx}\\b`, 'i');
            assert.ok(
                indexRegex.test(upSql),
                `Índice ${idx} deve ser criado com cláusula idempotente IF NOT EXISTS`
            );
        }
    });

    test('3. Reversibilidade Total do script DOWN (001_traffic_alert_schema.down.sql)', () => {
        const downSql = fs.readFileSync(DOWN_MIGRATION_PATH, 'utf8');

        assert.ok(downSql.includes('BEGIN;'), 'Migração DOWN deve ser transacional e iniciar com BEGIN;');
        assert.ok(downSql.includes('COMMIT;'), 'Migração DOWN deve finalizar com COMMIT;');

        const droppedTables = [
            'traffic_camera_matches',
            'traffic_provider_health',
            'traffic_incident_history',
            'traffic_incident_sources',
            'traffic_incidents'
        ];

        for (const table of droppedTables) {
            const dropRegex = new RegExp(`DROP\\s+TABLE\\s+IF\\s+EXISTS\\s+${table}\\b`, 'i');
            assert.ok(
                dropRegex.test(downSql),
                `Tabela ${table} deve possuir comando DROP TABLE IF EXISTS seguro no rollback`
            );
        }
    });

    test('4. Idempotência simulada: Execuções consecutivas são idempotentes', () => {
        const upSql = fs.readFileSync(UP_MIGRATION_PATH, 'utf8');
        // Verifica que não há comandos destrutivos ou não-idempotentes como CREATE TABLE simples sem IF NOT EXISTS
        const nonIdempotentTable = /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)[a-z_]+/i;
        assert.ok(!nonIdempotentTable.test(upSql), 'Não pode haver comandos CREATE TABLE sem IF NOT EXISTS');

        const nonIdempotentIndex = /CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)[a-z_]+/i;
        assert.ok(!nonIdempotentIndex.test(upSql), 'Não pode haver comandos CREATE INDEX sem IF NOT EXISTS');
    });
});
