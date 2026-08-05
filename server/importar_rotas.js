const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { pool } = require('./database');
const { getGeocode } = require('./geocode');

const upload = multer({ storage: multer.memoryStorage() });

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
    pedagios: [
        { nome: "Transolímpica", valor: 9.95 },
        { nome: "Ponte Rio-Niterói", valor: 6.60 },
        { nome: "Linha Amarela", valor: 4.00 }
    ]
};

router.get('/tarifas', (req, res) => {
    res.json({ ok: true, tarifas: TARIFAS_CONFIG });
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

function formatarHorarioExcel(valor) {
    if (valor == null) return '12:00';
    if (typeof valor === 'string') {
        if (valor.includes(':')) return valor.trim();
        const num = parseFloat(valor);
        if (isNaN(num)) return valor.trim();
        valor = num;
    }
    if (typeof valor === 'number') {
        const totalMinutos = Math.round(valor * 24 * 60);
        const horas = Math.floor(totalMinutos / 60);
        const minutos = totalMinutos % 60;
        return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
    }
    return String(valor).trim();
}

router.post('/importar', upload.single('planilha'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
        const id_usuario = req.body.id_usuario || null; // Pode vir do token em prod

        // Registra o lote
        const loteResult = await pool.query(
            'INSERT INTO lotes_importacao (id_usuario, nome_arquivo) VALUES ($1, $2) RETURNING id',
            [id_usuario, req.file.originalname]
        );
        const id_lote = loteResult.rows[0].id;

        // Lê a planilha
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

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

        res.json({ ok: true, id_lote, resultados });

    } catch (error) {
        console.error('Erro no upload de base:', error);
        res.status(500).json({ error: 'Falha ao processar o arquivo de lotes.' });
    }
});

module.exports = router;
