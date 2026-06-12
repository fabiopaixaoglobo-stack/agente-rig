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
    fatorMadrugada: 1.2
};

router.get('/tarifas', (req, res) => {
    res.json({ ok: true, tarifas: TARIFAS_CONFIG });
});

function calcularCustoEstimado(distanciaKm, tempoMinutos, horarioCorrida) {
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

async function getCoordsParaEndereco(enderecoStr) {
    const cleaned = limparEndereco(enderecoStr);
    return await getGeocode('Rio de Janeiro', 'RJ', cleaned);
}


function findValueByHeader(row, keywords) {
    if (!row) return null;
    const keys = Object.keys(row);
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
            if (normalizedKey.includes(normalizedKw) || normalizedKw.includes(normalizedKey)) {
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

            const origemStr = findValueByHeader(row, ['origem', 'saida', 'partida', 'endereco de origem', 'endereco de saida']);
            const destinoStr = findValueByHeader(row, ['destino', 'chegada', 'retorno', 'endereco de destino', 'endereco de chegada']);
            const rawHorario = findValueByHeader(row, ['horario', 'hora', 'horario de saida', 'horario da corrida']);
            const horarioStr = formatarHorarioExcel(rawHorario);

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

            try {
                // 1. Geocode Origem
                const origemCoords = await getCoordsParaEndereco(origemStr);
                
                // 2. Geocode Destino
                const destinoCoords = await getCoordsParaEndereco(destinoStr);

                // 3. Rota OSRM
                await new Promise(r => setTimeout(r, 500)); // Rate limit OSRM public API
                const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${origemCoords.lon},${origemCoords.lat};${destinoCoords.lon},${destinoCoords.lat}?overview=false`;
                
                const response = await fetchFn(osrmUrl);
                const routeData = await response.json();

                if (routeData.code !== 'Ok' || !routeData.routes || routeData.routes.length === 0) {
                     throw new Error('Rota não encontrada no OSRM');
                }

                const distanciaKm = routeData.routes[0].distance / 1000;
                const tempoMin = routeData.routes[0].duration / 60;

                // 4. Calcular Custo
                const custo = calcularCustoEstimado(distanciaKm, tempoMin, horarioStr);

                // 5. Salvar no banco
                await pool.query(
                    `INSERT INTO rotas_importadas 
                    (id_lote, origem, destino, horario, distancia_km, tempo_min, custo_estimado, status, matricula, nome_colaborador, area) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [id_lote, origemStr, destinoStr, horarioStr, distanciaKm, tempoMin, custo, 'SUCESSO', matriculaStr, nomeStr, areaStr]
                );

                resultados.push({
                    matricula: matriculaStr,
                    nome_colaborador: nomeStr,
                    area: areaStr,
                    origem: origemStr,
                    destino: destinoStr,
                    horario: horarioStr,
                    distancia_km: distanciaKm.toFixed(2),
                    tempo_min: tempoMin.toFixed(0),
                    custo_estimado: custo.toFixed(2),
                    status: 'SUCESSO'
                });

            } catch (err) {
                console.error('Erro ao processar rota:', origemStr, destinoStr, err.message);
                
                await pool.query(
                    `INSERT INTO rotas_importadas 
                    (id_lote, origem, destino, horario, status, erro, matricula, nome_colaborador, area) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [id_lote, origemStr, destinoStr, horarioStr, 'ERRO', err.message, matriculaStr, nomeStr, areaStr]
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
