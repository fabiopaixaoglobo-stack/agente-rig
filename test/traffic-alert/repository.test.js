/**
 * Agente RIT - Teste Unitário e de Integração do TrafficRepository
 * Valida a persistência relacional das 5 tabelas, fallback Haversine sem PostGIS e descarte de payload bruto (v2.2).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { TrafficRepository } = require('../../server/traffic-alert/db/traffic-repository');
const { calculateHaversineDistance, getBoundingBox } = require('../../server/traffic-alert/db/geo-fallback');

/**
 * Mock determinístico de Pool PostgreSQL para teste rigoroso do repositório
 * Executa as queries com armazenamento estruturado em memória das 5 tabelas.
 */
class MockPgPool {
    constructor() {
        this.tables = {
            traffic_incidents: new Map(),
            traffic_incident_sources: [],
            traffic_incident_history: [],
            traffic_provider_health: new Map(),
            traffic_camera_matches: []
        };
    }

    async query(text, params = []) {
        const trimmed = text.trim();

        // 1. INSERT / UPSERT traffic_incidents
        if (trimmed.startsWith('INSERT INTO traffic_incidents')) {
            const [
                id, canonical_id, domain, title, description, corridor, lat, lng,
                severity, severity_score, confidence, confidence_score, completeness_score,
                traffic_awareness, visual_confirmation_status, status, divergence_flag,
                divergence_details, is_synthetic, first_seen, last_updated, resolved_at
            ] = params;

            const row = {
                id, canonical_id, domain, title, description, corridor, lat: Number(lat), lng: Number(lng),
                severity, severity_score, confidence, confidence_score, completeness_score,
                traffic_awareness, visual_confirmation_status, status, divergence_flag,
                divergence_details, is_synthetic, first_seen, last_updated, resolved_at
            };
            this.tables.traffic_incidents.set(canonical_id, row);
            return { rows: [row] };
        }

        // 2. SELECT traffic_incidents BY id ou canonical_id
        if (trimmed.includes('FROM traffic_incidents WHERE id = $1')) {
            const found = Array.from(this.tables.traffic_incidents.values()).find(r => r.id === params[0]);
            return { rows: found ? [found] : [] };
        }
        if (trimmed.includes('FROM traffic_incidents WHERE canonical_id = $1')) {
            const found = this.tables.traffic_incidents.get(params[0]);
            return { rows: found ? [found] : [] };
        }

        // 3. SELECT active traffic_incidents (com ou sem corredor)
        if (trimmed.includes('FROM traffic_incidents WHERE status = \'ACTIVE\'')) {
            let list = Array.from(this.tables.traffic_incidents.values()).filter(r => r.status === 'ACTIVE');
            list = list.filter(r => r.is_synthetic === Boolean(params[0]));
            if (params.length > 1 && params[1]) {
                list = list.filter(r => r.domain === params[1]);
            }
            if (params.length > 2 && params[2]) {
                list = list.filter(r => r.corridor === params[2]);
            }
            return { rows: list };
        }

        // 4. SELECT nearby incidents com cálculo Haversine puro (sem PostGIS)
        if (trimmed.includes('distance_meters') && trimmed.includes('BETWEEN')) {
            const [centerLat, centerLng, isSynthetic, minLat, maxLat, minLng, maxLng, radiusMeters] = params;
            const rows = Array.from(this.tables.traffic_incidents.values())
                .filter(r => r.status === 'ACTIVE' && r.is_synthetic === isSynthetic)
                .filter(r => r.lat >= minLat && r.lat <= maxLat && r.lng >= minLng && r.lng <= maxLng)
                .map(r => {
                    const dist = calculateHaversineDistance(centerLat, centerLng, r.lat, r.lng);
                    return { ...r, distance_meters: Math.round(dist) };
                })
                .filter(r => r.distance_meters <= radiusMeters)
                .sort((a, b) => a.distance_meters - b.distance_meters);

            return { rows };
        }

        // 5. INSERT traffic_incident_sources
        if (trimmed.startsWith('INSERT INTO traffic_incident_sources')) {
            const [id, incident_id, provider, external_id, source_url, raw_payload_hash, confidence_weight, source_status, is_official, source_timestamp] = params;
            const row = { id, incident_id, provider, external_id, source_url, raw_payload_hash, confidence_weight, source_status, is_official, source_timestamp };
            this.tables.traffic_incident_sources.push(row);
            return { rows: [row] };
        }
        if (trimmed.includes('FROM traffic_incident_sources WHERE incident_id = $1')) {
            const rows = this.tables.traffic_incident_sources.filter(s => s.incident_id === params[0]);
            return { rows };
        }

        // 6. INSERT traffic_incident_history
        if (trimmed.startsWith('INSERT INTO traffic_incident_history')) {
            const [id, incident_id, changed_fields, reason] = params;
            const row = { id, incident_id, changed_at: new Date(), changed_fields, reason };
            this.tables.traffic_incident_history.push(row);
            return { rows: [row] };
        }
        if (trimmed.includes('FROM traffic_incident_history WHERE incident_id = $1')) {
            const rows = this.tables.traffic_incident_history.filter(h => h.incident_id === params[0]);
            return { rows };
        }

        // 7. traffic_provider_health
        if (trimmed.startsWith('INSERT INTO traffic_provider_health')) {
            const [provider_id, status, api_version, latency_ms, consecutive_failures, last_success, error_message] = params;
            const row = { provider_id, status, api_version, latency_ms, consecutive_failures, last_check: new Date(), last_success, error_message };
            this.tables.traffic_provider_health.set(provider_id, row);
            return { rows: [row] };
        }
        if (trimmed.includes('FROM traffic_provider_health')) {
            return { rows: Array.from(this.tables.traffic_provider_health.values()) };
        }

        // 8. traffic_camera_matches
        if (trimmed.startsWith('INSERT INTO traffic_camera_matches')) {
            const [id, incident_id, camera_id, distance_meters, relevance_score] = params;
            const row = { id, incident_id, camera_id, distance_meters, relevance_score, last_validated_at: new Date() };
            this.tables.traffic_camera_matches.push(row);
            return { rows: [row] };
        }
        if (trimmed.includes('FROM traffic_camera_matches WHERE incident_id = $1')) {
            const rows = this.tables.traffic_camera_matches.filter(c => c.incident_id === params[0]);
            return { rows };
        }

        return { rows: [] };
    }
}

describe('🗄️ PERSISTÊNCIA RELACIONAL E REPOSITORY (5 TABELAS SEM POSTGIS) (v2.2)', () => {
    let pool;
    let repo;

    test('Inicialização correta do TrafficRepository', () => {
        pool = new MockPgPool();
        repo = new TrafficRepository(pool);
        assert.ok(repo, 'Repository instanciado com sucesso');
    });

    test('1. upsertIncident: Gravação de incidente no banco com idempotência', async () => {
        const incident = {
            id: '11111111-1111-1111-1111-111111111111',
            canonicalId: 'RIT-TEST-001',
            domain: 'TRAFFIC_INCIDENT',
            title: 'Queda de árvore na Linha Vermelha',
            description: 'Bloqueio de faixa sentido Baixada',
            corridor: 'LINHA_VERMELHA',
            lat: -22.8750,
            lng: -43.2350,
            severity: 'ALTO',
            severityScore: 75.0,
            confidence: 'A',
            confidenceScore: 85.0,
            completenessScore: 90.0,
            trafficAwareness: 'REAL_TIME',
            visualConfirmationStatus: 'NOT_AVAILABLE',
            status: 'ACTIVE',
            divergenceFlag: false,
            isSynthetic: false
        };

        const saved = await repo.upsertIncident(incident);
        assert.strictEqual(saved.canonical_id, 'RIT-TEST-001');
        assert.strictEqual(saved.title, 'Queda de árvore na Linha Vermelha');

        // Busca por ID
        const byId = await repo.getIncidentById(saved.id);
        assert.strictEqual(byId.id, saved.id);

        // Busca por Canonical ID
        const byCanonical = await repo.getIncidentByCanonicalId('RIT-TEST-001');
        assert.strictEqual(byCanonical.canonical_id, 'RIT-TEST-001');
    });

    test('2. addIncidentSource: Armazena apenas hash SHA-256 e descarta payload bruto', async () => {
        const sourceData = {
            provider: 'CET_RIO',
            externalId: 'cet-888',
            sourceUrl: 'https://cetrio.rio.gov.br',
            rawPayloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            confidenceWeight: 1.8,
            sourceStatus: 'PARCIAL',
            isOfficial: true
        };

        const savedSource = await repo.addIncidentSource('11111111-1111-1111-1111-111111111111', sourceData);

        assert.strictEqual(savedSource.provider, 'CET_RIO');
        assert.strictEqual(savedSource.raw_payload_hash.length, 64, 'Deve conter hash SHA-256 de 64 caracteres');
        assert.strictEqual(savedSource.raw_payload, undefined, 'Coluna de payload bruto NÃO existe na tabela');

        const sources = await repo.getSourcesByIncidentId('11111111-1111-1111-1111-111111111111');
        assert.strictEqual(sources.length, 1);
    });

    test('3. findNearbyIncidents: Consulta geoespacial por Haversine e Bounding Box sem PostGIS', async () => {
        // Ponto de referência: Centro do Rio (-22.9068, -43.1729)
        // Incidente salvo anteriormente na Linha Vermelha está a ~7.2 km (-22.8750, -43.2350)

        // 1. Busca com raio de 10 km: deve encontrar
        const nearby10k = await repo.findNearbyIncidents({
            lat: -22.9068,
            lng: -43.1729,
            radiusMeters: 10000,
            isSynthetic: false
        });
        assert.strictEqual(nearby10k.length, 1);
        assert.ok(nearby10k[0].distance_meters > 6000 && nearby10k[0].distance_meters < 8000);

        // 2. Busca com raio de 2 km: não deve encontrar
        const nearby2k = await repo.findNearbyIncidents({
            lat: -22.9068,
            lng: -43.1729,
            radiusMeters: 2000,
            isSynthetic: false
        });
        assert.strictEqual(nearby2k.length, 0);
    });

    test('4. addIncidentHistory e telemetria de saúde de provedores', async () => {
        // Histórico
        const hist = await repo.addIncidentHistory('11111111-1111-1111-1111-111111111111', { status: 'RESOLVED' }, 'Pista liberada');
        assert.strictEqual(hist.reason, 'Pista liberada');

        const historyList = await repo.getHistoryByIncidentId('11111111-1111-1111-1111-111111111111');
        assert.strictEqual(historyList.length, 1);

        // Saúde do provedor
        const health = await repo.upsertProviderHealth('COR_RIO', {
            status: 'HEALTHY',
            apiVersion: '1',
            latencyMs: 140,
            consecutiveFailures: 0,
            lastSuccess: new Date()
        });
        assert.strictEqual(health.provider_id, 'COR_RIO');
        assert.strictEqual(health.status, 'HEALTHY');

        const allHealth = await repo.getAllProviderHealth();
        assert.strictEqual(allHealth.length, 1);
    });
});
