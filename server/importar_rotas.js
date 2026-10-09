const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool, registrarAuditoriaLGPD } = require('./database');
const { getGeocode } = require('./geocode');
const { resolveTenant } = require('./tenant-config');

// Rate limiter específico para upload de lotes
const importLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 30, // 30 uploads por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Limite de uploads excedido para este IP. Aguarde alguns minutos.' }
});

// Validação estrita de arquivo (extensão, tamanho e sanitização)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limite corporativo
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.xlsx', '.xls', '.csv'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error('Formato de arquivo inválido. Permitido apenas planilhas (.xlsx, .xls, .csv).'));
        }
        cb(null, true);
    }
});

const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : require('node-fetch');

const TARIFAS_CONFIG = {
    tarifaBase: 3.50,
    precoPorKm: 1.50,
    precoPorMinuto: 0.30,
    tarifaMinima: 6.00,
    fatorPico: 1.4,
    fatorMadrugada: 1.2,
    fatorTransito: 1.3,
    fatorChuva: 1.2,
    modais: {
        uberx: { nome: 'UberX', base: 3.50, km: 1.50, min: 0.30, minima: 6.00, categoria: 'App Individual' },
        comfort: { nome: 'Uber Comfort', base: 5.00, km: 1.95, min: 0.40, minima: 9.50, categoria: 'App Conforto' },
        black: { nome: 'Uber Black', base: 9.00, km: 2.80, min: 0.65, minima: 15.00, categoria: 'App Executivo' },
        pop99: { nome: '99Pop', base: 3.20, km: 1.45, min: 0.28, minima: 5.80, categoria: 'App Econômico' },
        taxi: { nome: 'Táxi Comum RJ', base: 6.10, kmBandeira1: 3.25, kmBandeira2: 3.90, horaParada: 37.00, categoria: 'Táxi Convencional' },
        cooperativa: { nome: 'Cooperativa Credenciada', diaria: 280.00, kmIncluso: 80, kmExtra: 3.80, horaEspera: 35.00, categoria: 'Frotista Corporativo' },
        globo: { nome: 'Transporte Frota Globo', consumoKmL: 10.0, precoLitro: 6.15, depreciacaoKm: 0.45, manutencaoKm: 0.35, diariaMotorista: 120.00, categoria: 'Frota Própria' }
    },
    pedagios: [
        { nome: "Transolímpica", valor: 9.95, lat: -22.9136, lon: -43.3851, raio: 0.005 },
        { nome: "Ponte Rio-Niterói", valor: 6.60, lat: -22.8636, lon: -43.1676, raio: 0.008 },
        { nome: "Linha Amarela", valor: 4.00, lat: -22.9072, lon: -43.3089, raio: 0.006 },
        { nome: "Pedágio Queimados", valor: 15.10, lat: -22.7161, lon: -43.5562, raio: 0.008 }
    ]
};

router.get('/tarifas', (req, res) => {
    res.json({ ok: true, tarifas: TARIFAS_CONFIG });
});

// LOG DE AUDITORIA OPERACIONAL DAS SIMULAÇÕES (GOVERNANÇA RIT)
router.post('/log-simulacao', async (req, res) => {
    try {
        const { usuario, origem, destino, waypoints, totalKm, tempoMin, pedagios, modalRecomendado, scoreRecomendado, custoRecomendado } = req.body || {};
        const logEntry = {
            data_hora: new Date().toISOString(),
            usuario: usuario || 'OPERADOR_RIT',
            origem: origem || '',
            destino: destino || '',
            waypoints: waypoints || [],
            total_km: parseFloat(totalKm) || 0,
            tempo_min: parseInt(tempoMin, 10) || 0,
            pedagios: pedagios || [],
            modal_recomendado: modalRecomendado || '',
            score_recomendado: scoreRecomendado || 0,
            custo_recomendado: custoRecomendado || 0
        };

        try {
            // Tenta gravar no banco se conectado
            await pool.query(
                `INSERT INTO eventos_seguranca (tipo_evento, entidade, entidade_id, usuario, ip_origem, user_agent, resultado, motivo, data_hora, metadados)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)`,
                [
                    'SIMULACAO_ROTA',
                    'CENTRO_ROTEIRIZACAO',
                    modalRecomendado || 'RIT',
                    usuario || 'OPERADOR_RIT',
                    req.ip || null,
                    req.headers['user-agent'] || null,
                    'SUCESSO',
                    `Simulação: ${origem} -> ${destino} (${totalKm} km)`,
                    JSON.stringify(logEntry)
                ]
            );
        } catch (dbErr) {
            // Fallback para log em arquivo se DB indisponível
            const logPath = path.join(__dirname, 'simulacoes_log.json');
            let logs = [];
            try {
                if (fsSync.existsSync(logPath)) {
                    logs = JSON.parse(await fs.promises.readFile(logPath, 'utf8'));
                }
            } catch (_) {}
            logs.unshift(logEntry);
            if (logs.length > 500) logs.pop();
            await fs.promises.writeFile(logPath, JSON.stringify(logs, null, 2), 'utf8');
        }

        return res.json({ ok: true });
    } catch (err) {
        console.warn('⚠️ [AUDITORIA] Falha ao gravar log de simulação:', err.message);
        return res.json({ ok: true, fallback: true });
    }
});

function calcularCustoEstimado(distanciaKm, tempoMinutos, horarioCorrida, transito = false, chuva = false) {
    const TARIFA_BASE = TARIFAS_CONFIG.tarifaBase;
    const PRECO_POR_KM = TARIFAS_CONFIG.precoPorKm;
    const PRECO_POR_MINUTO = TARIFAS_CONFIG.precoPorMinuto;
    const TARIFA_MINIMA = TARIFAS_CONFIG.tarifaMinima;
    
    let fatorDinamico = 1.0;
    
    // Extrai a hora. Se vier no formato "08:30" ou número de hora do excel.
    let hora = 12; // default
    if (horarioCorrida) {
        if (typeof horarioCorrida === 'string' && horarioCorrida.includes(':')) {
            hora = parseInt(horarioCorrida.split(':')[0], 10);
        } else if (!isNaN(horarioCorrida)) {
             // Caso venha como hora decimal do Excel, aproximação:
            hora = Math.floor(horarioCorrida * 24); 
        }
    }
    
    if ((hora >= 7 && hora < 9) || (hora >= 17 && hora < 19)) {
        fatorDinamico = TARIFAS_CONFIG.fatorPico;
    } else if (hora >= 22 || hora < 2) {
        fatorDinamico = TARIFAS_CONFIG.fatorMadrugada; // Madrugada
    }

    if (transito) {
        fatorDinamico *= TARIFAS_CONFIG.fatorTransito;
    }
    if (chuva) {
        fatorDinamico *= TARIFAS_CONFIG.fatorChuva;
    }

    let custoBruto = (TARIFA_BASE + (distanciaKm * PRECO_POR_KM) + (tempoMinutos * PRECO_POR_MINUTO)) * fatorDinamico;
    
    return custoBruto < TARIFA_MINIMA ? TARIFA_MINIMA : parseFloat(custoBruto.toFixed(2));
}

function limparEndereco(endereco) {
    if (!endereco) return '';
    let str = String(endereco);
    // Remover CEPs
    str = str.replace(/cep\s*:?\s*\d{5}-?\d{3}/gi, '');
    str = str.replace(/\b\d{5}-?\d{3}\b/g, '');
    // Substituir traços e travessões por vírgula
    str = str.replace(/[-–—]+/g, ',');
    // Remover termos redundantes do Rio de Janeiro
    str = str.replace(/\b(rio de janeiro|rj|brasil|brazil)\b/gi, '');
    // Limpar espaços e vírgulas duplicadas/finais
    str = str.replace(/,\s*,/g, ',');
    str = str.replace(/\s+/g, ' ');
    return str.trim().replace(/^,|,$/g, '').trim();
}

const PEDAGIOS_RJ = [
    {
        nome: "Transolímpica",
        valor: 9.95,
        lat: -22.9136,
        lon: -43.3851,
        raio: 0.005 // aproximado em graus (~500m)
    },
    {
        nome: "Ponte Rio-Niterói",
        valor: 6.60,
        lat: -22.8636,
        lon: -43.1676,
        raio: 0.008 // aproximado em graus (~800m)
    },
    {
        nome: "Linha Amarela",
        valor: 4.00,
        lat: -22.9072,
        lon: -43.3089,
        raio: 0.006 // aproximado em graus (~600m)
    }
];

function calcularDistanciaGraus(lat1, lon1, lat2, lon2) {
    const dLat = lat1 - lat2;
    const dLon = lon1 - lon2;
    return Math.sqrt(dLat * dLat + dLon * dLon);
}

function detectarPedagios(coordinates) {
    if (!coordinates || !Array.isArray(coordinates)) return [];
    
    const pedagiosDetectados = [];
    for (const pedagio of PEDAGIOS_RJ) {
        // Verifica se algum ponto da rota está dentro do raio do pedágio
        const cruzou = coordinates.some(coord => {
            // OSRM retorna GeoJSON coordinates como [lon, lat]
            const lon = coord[0];
            const lat = coord[1];
            return calcularDistanciaGraus(lat, lon, pedagio.lat, pedagio.lon) <= pedagio.raio;
        });
        
        if (cruzou) {
            pedagiosDetectados.push(pedagio);
        }
    }
    return pedagiosDetectados;
}

async function getCoordsParaEndereco(enderecoStr) {
    const cleaned = limparEndereco(enderecoStr);
    return await getGeocode('Rio de Janeiro', 'RJ', cleaned);
}


function findValueByHeader(row, keywords) {
    if (!row) return null;
    const keys = Object.keys(row);
    
    // 1. Tentar busca exata primeiro para evitar falsos positivos
    for (const key of keys) {
        const normalizedKey = key.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        for (const kw of keywords) {
            const normalizedKw = kw.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();
            if (normalizedKey === normalizedKw) {
                return row[key];
            }
        }
    }
    
    // 2. Busca parcial (se o cabeçalho contém o termo procurado)
    for (const key of keys) {
        const normalizedKey = key.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        for (const kw of keywords) {
            const normalizedKw = kw.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();
            if (normalizedKey.includes(normalizedKw)) {
                return row[key];
            }
        }
    }
    return null;
}

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

function formatarHorarioExcel(valor) {
    if (valor == null) return 'Horário não informado';
    if (typeof valor === 'string') {
        const trimmed = valor.trim();
        if (trimmed.includes(':')) {
            if (/^\d+:\d+$/.test(trimmed)) {
                const restored = restaurarHorarioCorrompido(trimmed);
                if (restored) return restored;
            }
            return trimmed;
        }
        const num = parseFloat(trimmed);
        if (isNaN(num)) return trimmed;
        valor = num;
    }
    if (typeof valor === 'number') {
        if (valor > 1) {
            const epoch = Date.UTC(1899, 11, 30);
            const ms = Math.round(valor * 24 * 60 * 60 * 1000);
            const date = new Date(epoch + ms);
            const dia = String(date.getUTCDate()).padStart(2, '0');
            const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
            const ano = date.getUTCFullYear();
            const hr = String(date.getUTCHours()).padStart(2, '0');
            const min = String(date.getUTCMinutes()).padStart(2, '0');
            return `${dia}/${mes}/${ano} ${hr}:${min}`;
        } else {
            const totalMinutos = Math.round(valor * 24 * 60);
            const hr = String(Math.floor(totalMinutos / 60)).padStart(2, '0');
            const min = String(totalMinutos % 60).padStart(2, '0');
            return `${hr}:${min}`;
        }
    }
    return String(valor).trim() || 'Horário não informado';
}

// ── GET /api/rotas/template ──────────────────────────
// FASE 4: Template Obrigatório com Modelo Padrão de Download
router.get('/template', (req, res) => {
    try {
        const headers = [
            'Origem',
            'Destino',
            'Horário',
            'Data Hora Término',
            'Matrícula',
            'Nome Colaborador',
            'Área',
            'Programa',
            'Motorista',
            'Telefone Motorista',
            'Tipo Veículo',
            'Placa Veículo',
            'OT',
            'Código OT Detalhado'
        ];

        const sampleRows = [
            {
                'Origem': 'Estrada dos Bandeirantes, 6700 - Jacarepaguá, Rio de Janeiro - RJ',
                'Destino': 'Av. das Américas, 5000 - Barra da Tijuca, Rio de Janeiro - RJ',
                'Horário': '08:30',
                'Data Hora Término': '09:30',
                'Matrícula': '990123',
                'Nome Colaborador': 'Exemplo Colaborador',
                'Área': 'Operações',
                'Programa': 'Produção RIT',
                'Motorista': 'Condutor Padrão',
                'Telefone Motorista': '21999998888',
                'Tipo Veículo': 'Sedan Executivo',
                'Placa Veículo': 'RIO2026',
                'OT': 'OT-1001',
                'Código OT Detalhado': 'PROD-2026-001'
            }
        ];

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(sampleRows, { header: headers });
        xlsx.utils.book_append_sheet(wb, ws, 'Modelo Importação RIT');
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="template_importacao_rotas_rit.xlsx"');
        return res.send(buffer);
    } catch (err) {
        console.error('Erro ao gerar template de rotas:', err);
        return res.status(500).json({ error: 'Erro interno ao gerar modelo de importação.' });
    }
});

router.post('/importar', importLimiter, upload.single('planilha'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
        // Resolve usuário e organização
        let id_usuario = req.body.id_usuario || null;
        let authMatricula = 'SISTEMA';
        if (req.headers['authorization']) {
            try {
                const token = req.headers['authorization'].split(' ')[1];
                const decoded = jwt.decode(token);
                if (decoded && decoded.id) {
                    id_usuario = decoded.id;
                    authMatricula = decoded.matricula || 'SISTEMA';
                }
            } catch (_) {}
        }
        const tenant = resolveTenant(req);
        const organization_id = tenant.organization_id || 'globo';

        // Lê a planilha
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (!data || data.length === 0) {
            return res.status(400).json({ error: 'A planilha enviada está vazia ou sem registros válidos.' });
        }

        // Validação Estrita de Layout e Cabeçalhos
        const firstRow = data[0];
        const hasOrigem = findValueByHeader(firstRow, ['origem', 'saida', 'partida', 'endereco de origem', 'localidade1 + endereco1', 'localidade1', 'localidade + endereco']);
        const hasDestino = findValueByHeader(firstRow, ['destino', 'chegada', 'retorno', 'endereco de destino', 'localidade2 + endereco2', 'localidade2']);

        if (!hasOrigem || !hasDestino) {
            try {
                await pool.query(
                    `INSERT INTO eventos_seguranca (tipo_evento, entidade, entidade_id, usuario, ip_origem, user_agent, resultado, motivo, metadados)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        'IMPORTACAO_REJEITADA_LAYOUT',
                        'PLANILHA',
                        req.file.originalname,
                        authMatricula,
                        req.ip,
                        req.headers['user-agent'],
                        'BLOQUEADO',
                        'Colunas obrigatórias Origem ou Destino ausentes',
                        JSON.stringify({ colunasEncontradas: Object.keys(firstRow) })
                    ]
                );
            } catch (_) {}

            return res.status(400).json({
                error: 'Layout inválido. A planilha deve conter obrigatoriamente colunas de Origem e Destino. Baixe o modelo padrão em /api/rotas/template.'
            });
        }

        // Bloqueio de colunas anômalas não homologadas (proteção contra injeção e dados fora de layout)
        const KNOWN_COLUMNS_REGEX = /(origem|destino|horario|hora|matricula|registro|id|nome|colaborador|funcionario|passageiro|area|setor|departamento|transito|trânsito|chuva|motorista|condutor|telefone|celular|veiculo|veículo|placa|programa|projeto|grupo|ot|codigo|código|localidade)/i;
        const unknownColumns = Object.keys(firstRow).filter(k => {
            const cleanKey = k.trim().replace(/^_+/, '');
            return cleanKey.length > 0 && !KNOWN_COLUMNS_REGEX.test(cleanKey);
        });

        if (unknownColumns.length > 4) {
            try {
                await pool.query(
                    `INSERT INTO eventos_seguranca (tipo_evento, entidade, entidade_id, usuario, ip_origem, user_agent, resultado, motivo, metadados)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        'IMPORTACAO_REJEITADA_COLUNAS_DESCONHECIDAS',
                        'PLANILHA',
                        req.file.originalname,
                        authMatricula,
                        req.ip,
                        req.headers['user-agent'],
                        'BLOQUEADO',
                        `Colunas desconhecidas detectadas: ${unknownColumns.slice(0, 5).join(', ')}`,
                        JSON.stringify({ colunasDesconhecidas: unknownColumns })
                    ]
                );
            } catch (_) {}

            return res.status(400).json({
                error: `Layout incompatível: colunas desconhecidas detectadas (${unknownColumns.slice(0, 3).join(', ')}). Utilize o modelo padrão oficial obtido em /api/rotas/template.`
            });
        }

        // Registra o lote com organization_id
        const loteResult = await pool.query(
            'INSERT INTO lotes_importacao (id_usuario, nome_arquivo, organization_id) VALUES ($1, $2, $3) RETURNING id',
            [id_usuario, req.file.originalname, organization_id]
        );
        const id_lote = loteResult.rows[0].id;

        const resultados = [];

        // Processa as linhas sequencialmente para não estourar rate limits
        for (let row of data) {
            const matriculaStr = findValueByHeader(row, ['matricula', 'registro', 'id']) || '';
            const nomeStr = findValueByHeader(row, ['nome', 'colaborador', 'funcionario']) || '';
            const areaStr = findValueByHeader(row, ['area', 'setor', 'departamento']) || '';

            const origemStr = findValueByHeader(row, ['origem', 'saida', 'partida', 'endereco de origem', 'endereco de saida', 'localidade1 + endereco1', 'localidade1 + endereço1', 'localidade1', 'localidade + endereco', 'localidade + endereço']);
            const destinoStr = findValueByHeader(row, ['destino', 'chegada', 'retorno', 'endereco de destino', 'endereco de chegada', 'localidade2 + endereco2', 'localidade2 + endereço2', 'localidade2', 'localidade2 + endereco2', 'localidade2 + endereço2']);
            const rawHorario = findValueByHeader(row, ['horario', 'hora', 'horario de saida', 'horario da corrida', 'data hora', 'data hora inicio', 'data hora início']);
            const horarioStr = formatarHorarioExcel(rawHorario);

            const transitoRaw = findValueByHeader(row, ['transito', 'trânsito']) || '';
            const chuvaRaw = findValueByHeader(row, ['chuva']) || '';

            const transito = typeof transitoRaw === 'string'
                ? transitoRaw.trim().toLowerCase() === 'sim'
                : !!transitoRaw;
            const chuva = typeof chuvaRaw === 'string'
                ? chuvaRaw.trim().toLowerCase() === 'sim'
                : !!chuvaRaw;

            // Extrair novas colunas para o rastreamento do motorista
            const motoristaNome = findValueByHeader(row, ['motorista', 'nome do motorista', 'condutor']) || '';
            const motoristaTelefone = findValueByHeader(row, ['telefone motorista', 'telefone do motorista', 'celular motorista', 'tel motorista', 'telefone']) || '';
            const tipoVeiculo = findValueByHeader(row, ['tipo de veiculo', 'tipo veiculo', 'veiculo tipo', 'categoria']) || '';
            const placaVeiculo = findValueByHeader(row, ['placa veiculo', 'placa do veiculo', 'placa']) || '';
            const passageiro = findValueByHeader(row, ['passageiro', 'colaborador', 'funcionario', 'nome_colaborador']) || '';
            
            const localidadeOrigem = findValueByHeader(row, ['localidade1', 'origem', 'localidade1 + endereco1', 'localidade1 + endereço1']) || '';
            const localidadeDestino = findValueByHeader(row, ['localidade2', 'destino', 'localidade2 + endereco2', 'localidade2 + endereço2']) || '';
            
            const rawHorarioTermino = findValueByHeader(row, ['data hora2', 'data hora termino', 'data hora término', 'hora de termino', 'termino', 'data_hora2']);
            const horarioTermino = formatarHorarioExcel(rawHorarioTermino);
            
            const programa = findValueByHeader(row, ['programa', 'projeto', 'grupo']) || '';
            const ot = findValueByHeader(row, ['ot', 'numero da ot', 'numero ot', 'nº ot']) || '';
            const codigoOtDetalhado = findValueByHeader(row, ['codigo ot detalhado', 'codigo ot detalhada', 'codigo ot', 'código ot detalhado', 'código ot detalhada']) || '';

            if (!origemStr || !destinoStr) {
                resultados.push({
                    matricula: matriculaStr,
                    nome_colaborador: nomeStr,
                    area: areaStr,
                    origem: origemStr || '',
                    destino: destinoStr || '',
                    horario: horarioStr,
                    status: 'ERRO',
                    erro: 'Origem ou Destino ausente'
                });
                continue;
            }

            if (req.query.tipo === 'monitoramento') {
                try {
                    const insertResult = await pool.query(
                        `INSERT INTO rotas_importadas 
                        (id_lote, origem, destino, horario, status, matricula, nome_colaborador, area, transito, chuva,
                         motorista_nome, motorista_telefone, tipo_veiculo, placa_veiculo, horario_termino, programa, localidade_origem, localidade_destino, passageiro, ot, codigo_ot_detalhado) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING id`,
                        [
                            id_lote, origemStr, destinoStr, horarioStr, 'SUCESSO', matriculaStr, nomeStr, areaStr, transito, chuva,
                            motoristaNome, motoristaTelefone, tipoVeiculo, placaVeiculo, horarioTermino, programa, localidadeOrigem, localidadeDestino, passageiro,
                            ot ? String(ot).trim() : '', codigoOtDetalhado ? String(codigoOtDetalhado).trim() : ''
                        ]
                    );
                    const insertedId = insertResult.rows[0]?.id;
                    if (insertedId) {
                        await pool.query(
                            'INSERT INTO historico_atendimentos (id_atendimento, evento, data_hora) VALUES ($1, $2, NOW())',
                            [insertedId, 'Atendimento criado']
                        );
                    }

                    resultados.push({
                        id: insertedId,
                        matricula: matriculaStr,
                        nome_colaborador: nomeStr,
                        area: areaStr,
                        origem: origemStr,
                        destino: destinoStr,
                        horario: horarioStr,
                        status: 'SUCESSO',
                        motorista_nome: motoristaNome,
                        motorista_telefone: motoristaTelefone,
                        tipo_veiculo: tipoVeiculo,
                        placa_veiculo: placaVeiculo,
                        horario_termino: horarioTermino,
                        programa: programa,
                        localidade_origem: localidadeOrigem,
                        localidade_destino: localidadeDestino,
                        passageiro: passageiro,
                        ot: ot ? String(ot).trim() : '',
                        codigo_ot_detalhado: codigoOtDetalhado ? String(codigoOtDetalhado).trim() : ''
                    });
                    continue;
                } catch (err) {
                    console.error("Erro ao salvar rota de monitoramento:", err);
                    resultados.push({
                        matricula: matriculaStr,
                        nome_colaborador: nomeStr,
                        status: 'ERRO',
                        erro: 'Erro de banco de dados'
                    });
                    continue;
                }
            }

            try {
                // 1. Geocode Origem
                const origemCoords = await getCoordsParaEndereco(origemStr);
                
                // 2. Geocode Destino
                const destinoCoords = await getCoordsParaEndereco(destinoStr);

                // 3. Rota OSRM
                await new Promise(r => setTimeout(r, 500)); // Rate limit OSRM public API
                const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${origemCoords.lon},${origemCoords.lat};${destinoCoords.lon},${destinoCoords.lat}?overview=full&geometries=geojson`;
                
                const response = await fetchFn(osrmUrl);
                const routeData = await response.json();

                if (routeData.code !== 'Ok' || !routeData.routes || routeData.routes.length === 0) {
                     throw new Error('Rota não encontrada no OSRM');
                }

                const distanciaKm = routeData.routes[0].distance / 1000;
                const tempoMin = routeData.routes[0].duration / 60;
                const geometryCoords = routeData.routes[0].geometry?.coordinates || [];

                // 4. Calcular Custo
                const custoBase = calcularCustoEstimado(distanciaKm, tempoMin, horarioStr, transito, chuva);
                const pedagiosDetectados = detectarPedagios(geometryCoords);
                const valorPedagios = pedagiosDetectados.reduce((acc, p) => acc + p.valor, 0);
                const custoTotal = custoBase + valorPedagios;

                // 5. Salvar no banco
                const insertResult = await pool.query(
                    `INSERT INTO rotas_importadas 
                    (id_lote, origem, destino, horario, distancia_km, tempo_min, custo_estimado, status, matricula, nome_colaborador, area, transito, chuva,
                     motorista_nome, motorista_telefone, tipo_veiculo, placa_veiculo, horario_termino, programa, localidade_origem, localidade_destino, passageiro) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING id`,
                    [
                        id_lote, origemStr, destinoStr, horarioStr, distanciaKm, tempoMin, custoTotal, 'SUCESSO', matriculaStr, nomeStr, areaStr, transito, chuva,
                        motoristaNome, motoristaTelefone, tipoVeiculo, placaVeiculo, horarioTermino, programa, localidadeOrigem, localidadeDestino, passageiro
                    ]
                );
                const insertedId = insertResult.rows[0]?.id;
                if (insertedId) {
                    await pool.query(
                        'INSERT INTO historico_atendimentos (id_atendimento, evento, data_hora) VALUES ($1, $2, NOW())',
                        [insertedId, 'Atendimento criado']
                    );
                }

                resultados.push({
                    id: insertedId,
                    matricula: matriculaStr,
                    nome_colaborador: nomeStr,
                    area: areaStr,
                    origem: origemStr,
                    destino: destinoStr,
                    horario: horarioStr,
                    distancia_km: distanciaKm.toFixed(2),
                    tempo_min: tempoMin.toFixed(0),
                    custo_base: custoBase.toFixed(2),
                    pedagios: pedagiosDetectados.map(p => ({ nome: p.nome, valor: p.valor })),
                    custo_estimado: custoTotal.toFixed(2),
                    status: 'SUCESSO',
                    motorista_nome: motoristaNome,
                    motorista_telefone: motoristaTelefone,
                    tipo_veiculo: tipoVeiculo,
                    placa_veiculo: placaVeiculo,
                    horario_termino: horarioTermino,
                    programa: programa,
                    localidade_origem: localidadeOrigem,
                    localidade_destino: localidadeDestino,
                    passageiro: passageiro
                });

            } catch (err) {
                console.error('Erro ao processar rota:', origemStr, destinoStr, err.message);
                
                await pool.query(
                    `INSERT INTO rotas_importadas 
                    (id_lote, origem, destino, horario, status, erro, matricula, nome_colaborador, area, transito, chuva,
                     motorista_nome, motorista_telefone, tipo_veiculo, placa_veiculo, horario_termino, programa, localidade_origem, localidade_destino, passageiro) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
                    [
                        id_lote, origemStr, destinoStr, horarioStr, 'ERRO', err.message, matriculaStr, nomeStr, areaStr, transito, chuva,
                        motoristaNome, motoristaTelefone, tipoVeiculo, placaVeiculo, horarioTermino, programa, localidadeOrigem, localidadeDestino, passageiro
                    ]
                );

                resultados.push({
                    matricula: matriculaStr,
                    nome_colaborador: nomeStr,
                    area: areaStr,
                    origem: origemStr,
                    destino: destinoStr,
                    horario: horarioStr,
                    status: 'ERRO',
                    erro: err.message
                });
            }
        }

        if (req.query.tipo === 'monitoramento') {
            const regional = req.query.regional || 'RJ';
            const checksum = crypto.createHash('md5').update(req.file.buffer).digest('hex');
            console.log('[IMPORT] Arquivo recebido:', req.file.originalname);
            console.log('[IMPORT] Regional selecionada:', regional);
            const successfulResults = (resultados || []).filter(r => r.status === 'SUCESSO');
            const qtd_registros = successfulResults.length;
            console.log('[IMPORT] Quantidade de registros:', qtd_registros);
            console.log('[IMPORT] Checksum calculado:', checksum);

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                console.log(`[IMPORT] Mapa anterior inativado para a regional: ${regional}`);
                await client.query(
                    'UPDATE monitoramento_bases SET ativo = FALSE WHERE regional = $1',
                    [regional]
                );
                console.log(`[IMPORT] Nova base criada e ativada para a regional: ${regional}`);
                await client.query(
                    `INSERT INTO monitoramento_bases 
                    (regional, nome_arquivo, json_mapa, qtd_registros, checksum, ativo, criado_por) 
                    VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
                    [
                        regional,
                        req.file.originalname,
                        JSON.stringify(resultados),
                        qtd_registros,
                        checksum,
                        id_usuario ? String(id_usuario) : 'Sistema'
                    ]
                );
                await client.query('COMMIT');
                console.log('[IMPORT] Processo concluído.');
            } catch (txErr) {
                await client.query('ROLLBACK');
                console.error('[ERROR] Falha na transação de importação da base. Executado ROLLBACK:', txErr);
                throw txErr;
            } finally {
                client.release();
            }
        // Rastreabilidade LGPD
        try {
            await registrarAuditoriaLGPD({
                id_usuario: id_usuario,
                usuario_identificador: authMatricula,
                recurso_acessado: 'ROTAS_IMPORTADAS',
                acao: 'IMPORTACAO',
                dado_visualizado: `Lote ${id_lote}: ${resultados.length} rotas importadas`,
                ip_origem: req.ip,
                user_agent: req.headers['user-agent'],
                organization_id: organization_id,
                detalhes: { arquivo: req.file.originalname, totalLinhas: data.length, totalProcessadas: resultados.length }
            });
        } catch (_) {}

        res.json({ ok: true, id_lote, resultados });

    } catch (error) {
        console.error('[ERROR] Endpoint: POST /importar | Mensagem original:', error.message, '| Stack:', error.stack);
        res.status(500).json({ error: 'Falha ao processar o arquivo de lotes.' });
    }
});

router.get('/mapa-ativo', async (req, res) => {
    const regional = req.query.regional;
    console.log(`[LOAD] Regional selecionada: ${regional}`);
    console.log(`[LOAD] Buscando mapa ativo`);
    
    if (!regional) {
        console.error('[ERROR] Endpoint: GET /mapa-ativo | Mensagem original: Regional não informada.');
        return res.status(400).json({ error: 'Regional não informada.' });
    }
    
    try {
        const result = await pool.query(
            `SELECT id, regional, nome_arquivo, json_mapa, qtd_registros, ativo, data_importacao 
             FROM monitoramento_bases 
             WHERE regional = $1 AND ativo = TRUE 
             LIMIT 1`,
            [regional]
        );
        
        if (result.rows.length === 0) {
            console.log(`[LOAD] Nenhum mapa ativo encontrado para a regional: ${regional}`);
            return res.json({ ok: true, resultados: [] });
        }
        
        const row = result.rows[0];
        const resultados = typeof row.json_mapa === 'string' ? JSON.parse(row.json_mapa) : row.json_mapa;
        console.log(`[LOAD] Mapa encontrado`);
        console.log(`[LOAD] Quantidade de registros carregados: ${row.qtd_registros}`);
        
        res.json({
            ok: true,
            regional: row.regional,
            ativo: row.ativo,
            data_importacao: row.data_importacao,
            qtd_registros: row.qtd_registros,
            nome_arquivo: row.nome_arquivo,
            resultados: resultados
        });
    } catch (err) {
        console.error('[ERROR] Endpoint: GET /mapa-ativo | Regional:', regional, '| Mensagem original:', err.message, '| Stack:', err.stack);
        res.status(500).json({ error: 'Erro interno ao buscar mapa ativo.' });
    }
});

module.exports = router;
