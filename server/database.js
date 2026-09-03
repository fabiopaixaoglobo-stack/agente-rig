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
            CREATE TABLE IF NOT EXISTS monitoramento_bases (
                id SERIAL PRIMARY KEY,
                regional TEXT NOT NULL,
                nome_arquivo TEXT,
                json_mapa JSONB NOT NULL,
                qtd_registros INTEGER,
                checksum TEXT,
                ativo BOOLEAN DEFAULT TRUE,
                data_importacao TIMESTAMPTZ DEFAULT NOW(),
                criado_por TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_bases_regional_ativo ON monitoramento_bases(regional, ativo);
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
        await client.query(`
            CREATE TABLE IF NOT EXISTS acessos_externos_atendimento (
                id SERIAL PRIMARY KEY,
                id_atendimento INT NOT NULL REFERENCES rotas_importadas(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                token_prefix TEXT,
                escopo TEXT NOT NULL DEFAULT 'POSICIONAMENTO_MOTORISTA',
                status TEXT NOT NULL DEFAULT 'ATIVO',
                criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expira_em TIMESTAMPTZ NOT NULL,
                usado_em TIMESTAMPTZ,
                revogado_em TIMESTAMPTZ,
                finalizado_em TIMESTAMPTZ,
                motivo_finalizacao TEXT,
                criado_por TEXT,
                supervisor_destinatario TEXT,
                empresa_cooperativa TEXT,
                ip_criacao TEXT,
                user_agent_criacao TEXT,
                CONSTRAINT chk_acesso_status CHECK (status IN ('ATIVO','EXPIRADO','REVOGADO','USADO','FINALIZADO'))
            );
            CREATE INDEX IF NOT EXISTS idx_acessos_token_hash ON acessos_externos_atendimento(token_hash);
            CREATE INDEX IF NOT EXISTS idx_acessos_id_atendimento ON acessos_externos_atendimento(id_atendimento);
            CREATE INDEX IF NOT EXISTS idx_acessos_expira_em ON acessos_externos_atendimento(expira_em);
            CREATE INDEX IF NOT EXISTS idx_acessos_status ON acessos_externos_atendimento(status);
            CREATE INDEX IF NOT EXISTS idx_acessos_atendimento_status ON acessos_externos_atendimento(id_atendimento, status);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS eventos_seguranca (
                id SERIAL PRIMARY KEY,
                tipo_evento TEXT NOT NULL,
                entidade TEXT,
                entidade_id TEXT,
                usuario TEXT,
                ip_origem TEXT,
                user_agent TEXT,
                resultado TEXT NOT NULL,
                motivo TEXT,
                data_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                metadados JSONB
            );
            CREATE INDEX IF NOT EXISTS idx_eventos_seg_tipo_data ON eventos_seguranca(tipo_evento, data_hora);
        `);

        // Tabela Operacional de Saúde e Integridade de Câmeras (Rock in Rio / CCO)
        await client.query(`
            CREATE TABLE IF NOT EXISTS camera_health (
                camera_id            VARCHAR(32) PRIMARY KEY,
                ultima_verificacao   TIMESTAMPTZ DEFAULT NOW(),
                latencia_ms          INTEGER DEFAULT 0,
                status               VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
                frames_validos       BOOLEAN DEFAULT FALSE,
                ultimo_heartbeat     TIMESTAMPTZ,
                coordenada_validada  BOOLEAN DEFAULT TRUE,
                coordenada_suspeita  BOOLEAN DEFAULT FALSE,
                motivo_suspeita      TEXT,
                latitude             NUMERIC(10,6),
                longitude            NUMERIC(10,6),
                distancia_via_metros NUMERIC(8,2)
            );
            CREATE INDEX IF NOT EXISTS idx_camera_health_cam_id ON camera_health(camera_id);
            CREATE INDEX IF NOT EXISTS idx_camera_health_status ON camera_health(status);
            CREATE INDEX IF NOT EXISTS idx_camera_health_suspeita ON camera_health(coordenada_suspeita);
        `);

        // Tabela de Auditoria Operacional de Vídeo Real (Runtime Status)
        await client.query(`
            CREATE TABLE IF NOT EXISTS camera_runtime_status (
                camera_id            VARCHAR(32) PRIMARY KEY,
                nome                 VARCHAR(255),
                bairro               VARCHAR(100),
                status               VARCHAR(30) NOT NULL,
                tempo_abertura_ms    INTEGER,
                ultimo_teste         TIMESTAMPTZ DEFAULT NOW(),
                frames_recebidos     INTEGER DEFAULT 0,
                frames_decodificados INTEGER DEFAULT 0,
                bytes_recebidos      INTEGER DEFAULT 0,
                erro_detectado       TEXT,
                codec_detectado      VARCHAR(30),
                corredor             VARCHAR(100),
                is_rock_in_rio       BOOLEAN DEFAULT FALSE
            );
            CREATE INDEX IF NOT EXISTS idx_runtime_status ON camera_runtime_status(status);
            CREATE INDEX IF NOT EXISTS idx_runtime_corredor ON camera_runtime_status(corredor);
            CREATE INDEX IF NOT EXISTS idx_runtime_rir ON camera_runtime_status(is_rock_in_rio);
        `);

        // Adiciona Foreign Keys e Constraints na tabela gps_historico_atendimento se não existirem
        try {
            await client.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gps_atendimento') THEN
                        ALTER TABLE gps_historico_atendimento 
                        ADD CONSTRAINT fk_gps_atendimento FOREIGN KEY (id_atendimento) REFERENCES rotas_importadas(id) ON DELETE CASCADE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_gps_latitude') THEN
                        ALTER TABLE gps_historico_atendimento 
                        ADD CONSTRAINT chk_gps_latitude CHECK (latitude BETWEEN -90 AND 90);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_gps_longitude') THEN
                        ALTER TABLE gps_historico_atendimento 
                        ADD CONSTRAINT chk_gps_longitude CHECK (longitude BETWEEN -180 AND 180);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_gps_velocidade') THEN
                        ALTER TABLE gps_historico_atendimento 
                        ADD CONSTRAINT chk_gps_velocidade CHECK (velocidade IS NULL OR (velocidade >= 0 AND velocidade <= 200));
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_gps_precisao') THEN
                        ALTER TABLE gps_historico_atendimento 
                        ADD CONSTRAINT chk_gps_precisao CHECK (precisao IS NULL OR (precisao >= 0 AND precisao <= 1000));
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_historico_atendimento') THEN
                        ALTER TABLE historico_atendimentos 
                        ADD CONSTRAINT fk_historico_atendimento FOREIGN KEY (id_atendimento) REFERENCES rotas_importadas(id) ON DELETE CASCADE;
                    END IF;
                END $$;
            `);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_rotas_status_atendimento ON rotas_importadas(status_atendimento);`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_auditoria_operacional_data_hora ON auditoria_operacional(data_hora);`);
        } catch (constErr) {
            console.warn('⚠️ [HARDENING SCHEMA] Constraints ou FKs parciais:', constErr.message);
        }

        console.log('✅ Banco de dados PostgreSQL inicializado com sucesso.');

        // Correção de dados históricos corrompidos (horários gigantes oriundos do erro do Excel)
        try {
            function restaurarHorarioCorrompido(str) {
                if (!str) return null;
                const parts = str.split(':');
                if (parts.length !== 2) return str;
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                if (isNaN(hours) || isNaN(minutes) || hours < 100) return str;
                
                const totalMinutes = hours * 60 + minutes;
                const serial = totalMinutes / (24 * 60);
                
                const epoch = Date.UTC(1899, 11, 30);
                const ms = Math.round(serial * 24 * 60 * 60 * 1000);
                const date = new Date(epoch + ms);
                
                const dia = String(date.getUTCDate()).padStart(2, '0');
                const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
                const ano = date.getUTCFullYear();
                const hr = String(date.getUTCHours()).padStart(2, '0');
                const min = String(date.getUTCMinutes()).padStart(2, '0');
                return `${dia}/${mes}/${ano} ${hr}:${min}`;
            }

            const selectRes = await client.query("SELECT id, horario, horario_termino FROM rotas_importadas WHERE (horario LIKE '%:%') OR (horario_termino LIKE '%:%')");
            let corrigidas = 0;
            const updates = [];
            for (const row of selectRes.rows) {
                let alterado = false;
                let novoHorario = row.horario;
                let novoHorarioTermino = row.horario_termino;
                
                if (row.horario && row.horario.includes(':')) {
                    const hPart = parseInt(row.horario.split(':')[0], 10);
                    if (!isNaN(hPart) && hPart >= 100) {
                        novoHorario = restaurarHorarioCorrompido(row.horario);
                        alterado = true;
                    }
                }
                
                if (row.horario_termino && row.horario_termino.includes(':')) {
                    const hPart = parseInt(row.horario_termino.split(':')[0], 10);
                    if (!isNaN(hPart) && hPart >= 100) {
                        novoHorarioTermino = restaurarHorarioCorrompido(row.horario_termino);
                        alterado = true;
                    }
                }
                
                if (alterado) {
                    updates.push({ id: row.id, horario: novoHorario, horario_termino: novoHorarioTermino });
                }
            }
            
            if (updates.length > 0) {
                await client.query("BEGIN");
                for (const u of updates) {
                    await client.query("UPDATE rotas_importadas SET horario = $1, horario_termino = $2 WHERE id = $3", [u.horario, u.horario_termino, u.id]);
                    corrigidas++;
                }
                await client.query("COMMIT");
                console.log(`✅ [MIGRAÇÃO DADOS] Corrigidos ${corrigidas} registros de rotas históricas com horários corrompidos.`);
            }
        } catch (migErr) {
            console.warn('⚠️ [MIGRAÇÃO DADOS] Falha ao corrigir horários corrompidos históricos:', migErr.message);
        }
        
        // Limpeza e expurgo automático de retenção (GPS, Recuperação de Senha, Expiração de Tokens)
        try {
            // 1. Purga de posições GPS obsoletas (Retenção de 12 meses)
            const deleteRes = await client.query("DELETE FROM gps_historico_atendimento WHERE data_hora < NOW() - INTERVAL '12 months'");
            console.log(`🧹 [RETENÇÃO GPS] Limpeza efetuada: ${deleteRes.rowCount} registros com mais de 12 meses removidos.`);

            // 2. Atualização de tokens expirados
            const expTokensRes = await client.query("UPDATE acessos_externos_atendimento SET status = 'EXPIRADO' WHERE expira_em < NOW() AND status = 'ATIVO'");
            if (expTokensRes.rowCount > 0) {
                console.log(`🧹 [RETENÇÃO TOKENS] Atualizados ${expTokensRes.rowCount} tokens para status EXPIRADO.`);
            }

            // 3. Purga de solicitações de recuperação de senha antigas (padrão: 90 dias ou RECUPERACAO_RETENCAO_DIAS)
            const diasRetencaoSenha = parseInt(process.env.RECUPERACAO_RETENCAO_DIAS, 10) || 90;
            const purgeSenhaRes = await client.query("DELETE FROM recuperacao_senha WHERE solicitado_em < NOW() - ($1 || ' days')::INTERVAL", [diasRetencaoSenha]);
            console.log(`🧹 [RETENÇÃO SENHAS] Limpeza efetuada: ${purgeSenhaRes.rowCount} registros com mais de ${diasRetencaoSenha} dias removidos.`);

            // 4. Atualização de tokens expirados por inatividade (padrão: 30 minutos sem uso ou LINK_INATIVIDADE_MINUTOS)
            const minInatividade = parseInt(process.env.LINK_INATIVIDADE_MINUTOS, 10) || 30;
            const expInatRes = await client.query(
                `UPDATE acessos_externos_atendimento 
                 SET status = 'EXPIRADO', motivo_finalizacao = 'Inatividade superior ao limite configurado' 
                 WHERE status = 'ATIVO' 
                   AND COALESCE(usado_em, criado_em) < NOW() - ($1 || ' minutes')::INTERVAL`,
                [minInatividade]
            );
            if (expInatRes.rowCount > 0) {
                console.log(`🧹 [RETENÇÃO INATIVIDADE] Atualizados ${expInatRes.rowCount} tokens por inatividade (> ${minInatividade} min).`);
            }
        } catch (gcErr) {
            console.warn('⚠️ [RETENÇÃO DADOS] Falha ao executar rotina de limpeza:', gcErr.message);
        }
    } catch (err) {
        console.error('❌ Erro ao inicializar banco de dados:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

// Funções de Gestão de Saúde de Câmeras (PostgreSQL)
async function upsertCameraHealth(data) {
    const query = `
        INSERT INTO camera_health (
            camera_id, ultima_verificacao, latencia_ms, status,
            frames_validos, ultimo_heartbeat, coordenada_validada,
            coordenada_suspeita, motivo_suspeita, latitude, longitude, distancia_via_metros
        ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (camera_id) DO UPDATE SET
            ultima_verificacao = NOW(),
            latencia_ms = EXCLUDED.latencia_ms,
            status = EXCLUDED.status,
            frames_validos = EXCLUDED.frames_validos,
            ultimo_heartbeat = COALESCE(EXCLUDED.ultimo_heartbeat, camera_health.ultimo_heartbeat),
            coordenada_validada = EXCLUDED.coordenada_validada,
            coordenada_suspeita = EXCLUDED.coordenada_suspeita,
            motivo_suspeita = EXCLUDED.motivo_suspeita,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            distancia_via_metros = EXCLUDED.distancia_via_metros
        RETURNING *;
    `;
    const values = [
        String(data.camera_id || data.id).padStart(6, '0'),
        data.latencia_ms || data.latencyMs || 0,
        data.status || 'OFFLINE',
        data.frames_validos || data.framesValidos || false,
        data.ultimo_heartbeat || (data.frames_validos ? new Date() : null),
        data.coordenada_validada !== false,
        data.coordenada_suspeita || false,
        data.motivo_suspeita || data.motivo || null,
        data.latitude || null,
        data.longitude || null,
        data.distancia_via_metros || data.deslocamentoMetros || null
    ];
    return pool.query(query, values);
}

async function bulkUpsertCameraHealth(list) {
    if (!Array.isArray(list) || list.length === 0) return { rowCount: 0 };
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const item of list) {
            const query = `
                INSERT INTO camera_health (
                    camera_id, ultima_verificacao, latencia_ms, status,
                    frames_validos, ultimo_heartbeat, coordenada_validada,
                    coordenada_suspeita, motivo_suspeita, latitude, longitude, distancia_via_metros
                ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (camera_id) DO UPDATE SET
                    ultima_verificacao = NOW(),
                    latencia_ms = EXCLUDED.latencia_ms,
                    status = EXCLUDED.status,
                    frames_validos = EXCLUDED.frames_validos,
                    ultimo_heartbeat = COALESCE(EXCLUDED.ultimo_heartbeat, camera_health.ultimo_heartbeat),
                    coordenada_validada = EXCLUDED.coordenada_validada,
                    coordenada_suspeita = EXCLUDED.coordenada_suspeita,
                    motivo_suspeita = EXCLUDED.motivo_suspeita,
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    distancia_via_metros = EXCLUDED.distancia_via_metros;
            `;
            const values = [
                String(item.camera_id || item.id).padStart(6, '0'),
                item.latencia_ms || item.latencyMs || 0,
                item.status || 'OFFLINE',
                item.frames_validos || item.framesValidos || false,
                item.ultimo_heartbeat || (item.frames_validos ? new Date() : null),
                item.coordenada_validada !== false,
                item.coordenada_suspeita || false,
                item.motivo_suspeita || item.motivo || null,
                item.latitude || null,
                item.longitude || null,
                item.distancia_via_metros || item.deslocamentoMetros || null
            ];
            await client.query(query, values);
        }
        await client.query('COMMIT');
        return { success: true, count: list.length };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function getCameraHealthSummary() {
    const res = await pool.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'ONLINE') as online,
            COUNT(*) FILTER (WHERE status = 'DEGRADADA') as degradada,
            COUNT(*) FILTER (WHERE status = 'TIMEOUT') as timeout,
            COUNT(*) FILTER (WHERE status = 'OFFLINE') as offline,
            COUNT(*) FILTER (WHERE coordenada_suspeita = true) as suspeitas,
            COUNT(*) FILTER (WHERE frames_validos = true) as frames_ok,
            ROUND(AVG(latencia_ms) FILTER (WHERE status = 'ONLINE')) as latencia_media_ms
        FROM camera_health;
    `);
    return res.rows[0] || {};
}

// Funções da Auditoria Operacional de Runtime de Vídeo Real
async function bulkUpsertRuntimeStatus(list) {
    if (!Array.isArray(list) || list.length === 0) return { rowCount: 0 };
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const item of list) {
            const query = `
                INSERT INTO camera_runtime_status (
                    camera_id, nome, bairro, status, tempo_abertura_ms,
                    ultimo_teste, frames_recebidos, frames_decodificados,
                    bytes_recebidos, erro_detectado, codec_detectado, corredor, is_rock_in_rio
                ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (camera_id) DO UPDATE SET
                    nome = EXCLUDED.nome,
                    bairro = EXCLUDED.bairro,
                    status = EXCLUDED.status,
                    tempo_abertura_ms = EXCLUDED.tempo_abertura_ms,
                    ultimo_teste = NOW(),
                    frames_recebidos = EXCLUDED.frames_recebidos,
                    frames_decodificados = EXCLUDED.frames_decodificados,
                    bytes_recebidos = EXCLUDED.bytes_recebidos,
                    erro_detectado = EXCLUDED.erro_detectado,
                    codec_detectado = EXCLUDED.codec_detectado,
                    corredor = EXCLUDED.corredor,
                    is_rock_in_rio = EXCLUDED.is_rock_in_rio;
            `;
            const values = [
                String(item.camera_id || item.id).padStart(6, '0'),
                item.nome || null,
                item.bairro || null,
                item.status || 'NÃO_VERIFICADA',
                item.tempo_abertura_ms !== undefined ? item.tempo_abertura_ms : null,
                item.frames_recebidos || 0,
                item.frames_decodificados || 0,
                item.bytes_recebidos || 0,
                item.erro_detectado || null,
                item.codec_detectado || item.codec || null,
                item.corredor || null,
                item.is_rock_in_rio || false
            ];
            await client.query(query, values);
        }
        await client.query('COMMIT');
        return { success: true, count: list.length };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function getRuntimeStatusSummary() {
    const res = await pool.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'ONLINE') as online,
            COUNT(*) FILTER (WHERE status = 'LENTA') as lenta,
            COUNT(*) FILTER (WHERE status = 'DEGRADADA') as degradada,
            COUNT(*) FILTER (WHERE status = 'TIMEOUT') as timeout,
            COUNT(*) FILTER (WHERE status = 'OFFLINE') as offline,
            COUNT(*) FILTER (WHERE status = 'CODEC_INCOMPATIVEL') as codec_incompativel,
            COUNT(*) FILTER (WHERE status = 'NÃO_VERIFICADA') as nao_verificada,
            ROUND(AVG(tempo_abertura_ms) FILTER (WHERE status IN ('ONLINE', 'LENTA', 'DEGRADADA'))) as tempo_medio_abertura_ms
        FROM camera_runtime_status;
    `);
    return res.rows[0] || {};
}

async function getRuntimeCorredoresStats() {
    const res = await pool.query(`
        SELECT 
            COALESCE(corredor, 'Outros Corredores') as corredor,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'ONLINE') as online,
            COUNT(*) FILTER (WHERE status = 'LENTA') as lenta,
            COUNT(*) FILTER (WHERE status = 'DEGRADADA') as degradada,
            COUNT(*) FILTER (WHERE status = 'TIMEOUT') as timeout,
            COUNT(*) FILTER (WHERE status = 'OFFLINE') as offline,
            COUNT(*) FILTER (WHERE status = 'CODEC_INCOMPATIVEL') as codec_incompativel,
            ROUND(AVG(tempo_abertura_ms) FILTER (WHERE status IN ('ONLINE', 'LENTA', 'DEGRADADA'))) as tempo_medio_abertura_ms,
            ROUND((COUNT(*) FILTER (WHERE status IN ('ONLINE', 'LENTA', 'DEGRADADA', 'CODEC_INCOMPATIVEL'))::numeric / NULLIF(COUNT(*), 0) * 100), 1) as disponibilidade_pct
        FROM camera_runtime_status
        WHERE is_rock_in_rio = true OR corredor IS NOT NULL
        GROUP BY corredor
        ORDER BY total DESC;
    `);
    return res.rows || [];
}

async function getAllRuntimeStatuses(statusFilter = null) {
    let query = `
        SELECT 
            camera_id, nome, bairro, status, tempo_abertura_ms,
            ultimo_teste, frames_recebidos, frames_decodificados,
            bytes_recebidos, erro_detectado, codec_detectado, corredor, is_rock_in_rio
        FROM camera_runtime_status
    `;
    const params = [];
    if (statusFilter) {
        const statuses = statusFilter.split(',').map(s => s.trim().toUpperCase());
        query += ` WHERE status = ANY($1)`;
        params.push(statuses);
    }
    query += ` ORDER BY camera_id ASC`;
    const res = await pool.query(query, params);
    return res.rows || [];
}

module.exports = {
    pool,
    initDB,
    upsertCameraHealth,
    bulkUpsertCameraHealth,
    getCameraHealthSummary,
    bulkUpsertRuntimeStatus,
    getRuntimeStatusSummary,
    getRuntimeCorredoresStats,
    getAllRuntimeStatuses
};
