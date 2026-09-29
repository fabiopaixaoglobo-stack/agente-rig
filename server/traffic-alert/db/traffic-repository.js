/**
 * Agente RIT - Módulo RIT ALERTA
 * Repositório Relacional PostgreSQL Desacoplado das 5 Tabelas Canônicas.
 * Inclui Fallback Geoespacial Haversine sem dependência de PostGIS (v2.2).
 */

const crypto = require('crypto');
const { getBoundingBox, getSqlHaversineDistanceExpr, calculateHaversineDistance } = require('./geo-fallback');

class TrafficRepository {
    /**
     * @param {object} pool Instância de pg.Pool ou cliente SQL
     */
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Executa query com o pool configurado.
     */
    async query(text, params = []) {
        if (!this.pool) {
            throw new Error("[TrafficRepository] Pool de banco de dados não configurado.");
        }
        return this.pool.query(text, params);
    }

    /**
     * 1. Insere ou atualiza um incidente no banco relacional (Idempotência via ON CONFLICT).
     */
    async upsertIncident(incident) {
        const id = incident.id || crypto.randomUUID();
        const text = `
            INSERT INTO traffic_incidents (
                id, canonical_id, domain, title, description, corridor, lat, lng,
                severity, severity_score, confidence, confidence_score, completeness_score,
                traffic_awareness, visual_confirmation_status, status, divergence_flag,
                divergence_details, is_synthetic, first_seen, last_updated, resolved_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
            )
            ON CONFLICT (canonical_id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                corridor = EXCLUDED.corridor,
                lat = EXCLUDED.lat,
                lng = EXCLUDED.lng,
                severity = EXCLUDED.severity,
                severity_score = EXCLUDED.severity_score,
                confidence = EXCLUDED.confidence,
                confidence_score = EXCLUDED.confidence_score,
                completeness_score = EXCLUDED.completeness_score,
                traffic_awareness = EXCLUDED.traffic_awareness,
                visual_confirmation_status = EXCLUDED.visual_confirmation_status,
                status = EXCLUDED.status,
                divergence_flag = EXCLUDED.divergence_flag,
                divergence_details = EXCLUDED.divergence_details,
                last_updated = NOW(),
                resolved_at = EXCLUDED.resolved_at
            RETURNING *;
        `;

        const values = [
            id,
            incident.canonicalId,
            incident.domain || 'TRAFFIC_INCIDENT',
            incident.title,
            incident.description || '',
            incident.corridor || 'MALHA_URBANA',
            incident.lat,
            incident.lng,
            incident.severity,
            Number(incident.severityScore) || 0,
            incident.confidence,
            Number(incident.confidenceScore) || 0,
            Number(incident.completenessScore) || 0,
            incident.trafficAwareness || 'NOT_AVAILABLE',
            incident.visualConfirmationStatus || 'NOT_AVAILABLE',
            incident.status || 'ACTIVE',
            Boolean(incident.divergenceFlag),
            incident.divergenceDetails ? JSON.stringify(incident.divergenceDetails) : null,
            Boolean(incident.isSynthetic),
            incident.firstSeen ? new Date(incident.firstSeen) : new Date(),
            new Date(),
            incident.resolvedAt ? new Date(incident.resolvedAt) : null
        ];

        const res = await this.query(text, values);
        return res.rows[0];
    }

    /**
     * Busca incidente por ID.
     */
    async getIncidentById(id) {
        const res = await this.query('SELECT * FROM traffic_incidents WHERE id = $1', [id]);
        return res.rows[0] || null;
    }

    /**
     * Busca incidente por Canonical ID.
     */
    async getIncidentByCanonicalId(canonicalId) {
        const res = await this.query('SELECT * FROM traffic_incidents WHERE canonical_id = $1', [canonicalId]);
        return res.rows[0] || null;
    }

    /**
     * Lista incidentes ativos filtrados por domínio e segregação de fixtures.
     */
    async getActiveIncidents({ domain = null, isSynthetic = false, corridor = null } = {}) {
        let queryText = "SELECT * FROM traffic_incidents WHERE status = 'ACTIVE' AND is_synthetic = $1";
        const params = [Boolean(isSynthetic)];

        if (domain) {
            params.push(domain);
            queryText += ` AND domain = $${params.length}`;
        }

        if (corridor) {
            params.push(corridor);
            queryText += ` AND corridor = $${params.length}`;
        }

        queryText += ' ORDER BY severity_score DESC, last_updated DESC';

        const res = await this.query(queryText, params);
        return res.rows;
    }

    /**
     * Consulta geoespacial otimizada sem PostGIS.
     * Utiliza Bounding Box para filtro em índice numérico (lat, lng) e distância Haversine esférica.
     */
    async findNearbyIncidents({ lat, lng, radiusMeters = 2000, isSynthetic = false, domain = null }) {
        const bbox = getBoundingBox(lat, lng, radiusMeters);
        const haversineExpr = getSqlHaversineDistanceExpr(1, 2);

        let queryText = `
            SELECT *,
                   ${haversineExpr} AS distance_meters
            FROM traffic_incidents
            WHERE status = 'ACTIVE'
              AND is_synthetic = $3
              AND lat BETWEEN $4 AND $5
              AND lng BETWEEN $6 AND $7
        `;
        const params = [lat, lng, isSynthetic, bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng];

        if (domain) {
            params.push(domain);
            queryText += ` AND domain = $${params.length}`;
        }

        params.push(radiusMeters);
        queryText += ` AND ${haversineExpr} <= $${params.length}`;
        queryText += ' ORDER BY distance_meters ASC';

        const res = await this.query(queryText, params);
        return res.rows;
    }

    /**
     * 2. Registra uma fonte para o incidente (armazena apenas hash, sem payload bruto).
     */
    async addIncidentSource(incidentId, source) {
        const id = crypto.randomUUID();
        const text = `
            INSERT INTO traffic_incident_sources (
                id, incident_id, provider, external_id, source_url, raw_payload_hash,
                confidence_weight, source_status, is_official, source_timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;
        const values = [
            id,
            incidentId,
            source.provider,
            source.externalId || null,
            source.sourceUrl || null,
            source.rawPayloadHash, // Apenas o SHA-256
            Number(source.confidenceWeight) || 1.0,
            source.sourceStatus || null,
            Boolean(source.isOfficial),
            source.sourceTimestamp ? new Date(source.sourceTimestamp) : new Date()
        ];
        const res = await this.query(text, values);
        return res.rows[0];
    }

    /**
     * Retorna fontes de um incidente.
     */
    async getSourcesByIncidentId(incidentId) {
        const res = await this.query(
            'SELECT * FROM traffic_incident_sources WHERE incident_id = $1 ORDER BY source_timestamp ASC',
            [incidentId]
        );
        return res.rows;
    }

    /**
     * 3. Registra histórico de transição de estado para auditoria.
     */
    async addIncidentHistory(incidentId, changedFields, reason = null) {
        const id = crypto.randomUUID();
        const text = `
            INSERT INTO traffic_incident_history (
                id, incident_id, changed_at, changed_fields, reason
            ) VALUES ($1, $2, NOW(), $3, $4)
            RETURNING *;
        `;
        const values = [id, incidentId, JSON.stringify(changedFields), reason];
        const res = await this.query(text, values);
        return res.rows[0];
    }

    /**
     * Retorna histórico de transições de um incidente.
     */
    async getHistoryByIncidentId(incidentId) {
        const res = await this.query(
            'SELECT * FROM traffic_incident_history WHERE incident_id = $1 ORDER BY changed_at ASC',
            [incidentId]
        );
        return res.rows;
    }

    /**
     * 4. Registra ou atualiza telemetria de saúde de um provedor.
     */
    async upsertProviderHealth(providerId, health) {
        const text = `
            INSERT INTO traffic_provider_health (
                provider_id, status, api_version, latency_ms, consecutive_failures, last_check, last_success, error_message
            ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
            ON CONFLICT (provider_id) DO UPDATE SET
                status = EXCLUDED.status,
                api_version = EXCLUDED.api_version,
                latency_ms = EXCLUDED.latency_ms,
                consecutive_failures = EXCLUDED.consecutive_failures,
                last_check = NOW(),
                last_success = COALESCE(EXCLUDED.last_success, traffic_provider_health.last_success),
                error_message = EXCLUDED.error_message
            RETURNING *;
        `;
        const values = [
            providerId,
            health.status || 'UNKNOWN',
            health.apiVersion || '1',
            Number(health.latencyMs) || 0,
            Number(health.consecutiveFailures) || 0,
            health.lastSuccess ? new Date(health.lastSuccess) : null,
            health.errorMessage || null
        ];
        const res = await this.query(text, values);
        return res.rows[0];
    }

    /**
     * Retorna a lista de saúde de todos os provedores.
     */
    async getAllProviderHealth() {
        const res = await this.query('SELECT * FROM traffic_provider_health ORDER BY provider_id ASC');
        return res.rows;
    }

    /**
     * 5. Associa uma câmera pública a um incidente.
     */
    async addCameraMatch(incidentId, match) {
        const id = crypto.randomUUID();
        const text = `
            INSERT INTO traffic_camera_matches (
                id, incident_id, camera_id, distance_meters, relevance_score, last_validated_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING *;
        `;
        const values = [
            id,
            incidentId,
            match.cameraId,
            Number(match.distanceMeters) || 0,
            Number(match.relevanceScore) || 0.0
        ];
        const res = await this.query(text, values);
        return res.rows[0];
    }

    /**
     * Retorna câmeras vinculadas a um incidente.
     */
    async getCameraMatchesByIncidentId(incidentId) {
        const res = await this.query(
            'SELECT * FROM traffic_camera_matches WHERE incident_id = $1 ORDER BY distance_meters ASC',
            [incidentId]
        );
        return res.rows;
    }
}

module.exports = {
    TrafficRepository
};
