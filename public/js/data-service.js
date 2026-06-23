import { CONFIG } from './config.js';

/** Normaliza cabeçalho de coluna para comparação (espaços, minúsculas). */
function normHeader(s) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Constrói mapa: nome normalizado CONFIG -> chave real na planilha.
 * Usa as chaves das primeiras linhas para tolerar espaços a mais/menos nos cabeçalhos.
 */
function buildColumnKeyMap(rows, columnNames) {
    const map = Object.create(null);
    const wanted = new Set(columnNames.map(normHeader));
    const scan = Math.min(rows.length, 25);
    for (let i = 0; i < scan; i++) {
        const row = rows[i];
        if (!row || typeof row !== 'object') continue;
        for (const rawKey of Object.keys(row)) {
            const nk = normHeader(rawKey);
            if (wanted.has(nk)) map[nk] = rawKey;
        }
    }
    return map;
}

function getCell(row, keyMap, configColumnName) {
    const nk = normHeader(configColumnName);
    const sheetKey = keyMap[nk];
    if (sheetKey != null && Object.prototype.hasOwnProperty.call(row, sheetKey)) {
        return row[sheetKey];
    }
    for (const rawKey of Object.keys(row)) {
        if (normHeader(rawKey) === nk) return row[rawKey];
    }
    return '';
}

function parseDataHora(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    
    if (typeof v === 'number') {
        return new Date(Math.round((v - 25569) * 86400 * 1000));
    }
    
    const str = String(v).trim();
    const regexBR = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/;
    const mBR = str.match(regexBR);
    if (mBR) {
        return new Date(
            Number(mBR[3]),
            Number(mBR[2]) - 1,
            Number(mBR[1]),
            Number(mBR[4]),
            Number(mBR[5])
        );
    }
    
    const regexISO = /(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{2})/;
    const mISO = str.match(regexISO);
    if (mISO) {
        return new Date(
            Number(mISO[1]),
            Number(mISO[2]) - 1,
            Number(mISO[3]),
            Number(mISO[4]),
            Number(mISO[5])
        );
    }
    
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
        return new Date(parsed);
    }
    
    return null;
}

function calcularDiferencaAtendimento(inicioVal, fimVal) {
    const inicio = parseDataHora(inicioVal);
    const fim = parseDataHora(fimVal);
    
    if (!inicio || !fim) return '';
    
    const diffMs = fim - inicio;
    if (diffMs < 0) return '';
    
    const diffMin = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    
    if (hrs === 0 && mins === 0) return '0min';
    if (hrs === 0) return `${mins}min`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}min`;
}

function extrairHora(v) {
    const date = parseDataHora(v);
    if (!date) {
        const m = String(v).match(/(\d{1,2}:\d{2})/);
        return m ? m[1] : '';
    }
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
}

function extrairValoresDataHora(row, keyMap) {
    let inicio = getCell(row, keyMap, CONFIG.EXCEL_COLUMNS.DATA_HORA_INICIO);
    let fim = getCell(row, keyMap, CONFIG.EXCEL_COLUMNS.DATA_HORA_FIM);

    if (!inicio || !fim) {
        const keys = Object.keys(row);
        const dataHoraKeys = keys.filter(k => {
            const nk = String(k || '').replace(/\s+/g, ' ').trim().toLowerCase();
            return nk.startsWith('data hora');
        });
        if (dataHoraKeys.length >= 2) {
            if (!inicio) inicio = row[dataHoraKeys[0]];
            if (!fim) fim = row[dataHoraKeys[1]];
        } else if (dataHoraKeys.length === 1 && !inicio) {
            inicio = row[dataHoraKeys[0]];
        }
    }
    
    return { inicio, fim };
}

export class DataService {
    constructor() {
        this.baseAtendimentos = [];
    }

    async processExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                    const cols = Object.values(CONFIG.EXCEL_COLUMNS);
                    const keyMap = buildColumnKeyMap(rows, cols);

                    this.baseAtendimentos = rows
                        .map((l) => {
                            const placa = String(getCell(l, keyMap, CONFIG.EXCEL_COLUMNS.PLACA) || '').trim();
                            if (!placa) return null;

                            const enderecoRaw = String(
                                getCell(l, keyMap, CONFIG.EXCEL_COLUMNS.ENDERECO) || ''
                            );
                            const bairroParts = enderecoRaw.split(',');
                            const bairro = bairroParts.pop().trim() || 'Rio de Janeiro';

                            const { inicio: dataHoraInicioRaw, fim: dataHoraFimRaw } = extrairValoresDataHora(l, keyMap);

                            const emAtendimento = calcularDiferencaAtendimento(dataHoraInicioRaw, dataHoraFimRaw);
                            const horarioInicio = extrairHora(dataHoraInicioRaw);

                            return {
                                motorista: String(
                                    getCell(l, keyMap, CONFIG.EXCEL_COLUMNS.MOTORISTA) || ''
                                ).trim(),
                                tipoVeiculo: String(
                                    getCell(l, keyMap, CONFIG.EXCEL_COLUMNS.TIPO) || ''
                                ).trim(),
                                programa: String(getCell(l, keyMap, CONFIG.EXCEL_COLUMNS.PROGRAMA) || 'RIT')
                                    .split('/')[0]
                                    .trim(),
                                placa,
                                bairro,
                                emAtendimento,
                                horarioInicio,
                                lat: null,
                                lng: null,
                            };
                        })
                        .filter(Boolean);

                    resolve(this.baseAtendimentos);
                } catch (e) {
                    reject(e);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    async geocodificar(onProgress) {
        const bairrosUnicos = [...new Set(this.baseAtendimentos.map((a) => a.bairro))];
        const cacheCoords = new Map();

        if (bairrosUnicos.length === 0) {
            if (onProgress) onProgress(100);
            return this.baseAtendimentos;
        }

        const chunkSize = 3;
        for (let i = 0; i < bairrosUnicos.length; i += chunkSize) {
            const chunk = bairrosUnicos.slice(i, i + chunkSize);
            await Promise.all(
                chunk.map(async (b) => {
                    try {
                        const r = await fetch(
                            `${CONFIG.API_ENDPOINTS.GEOCODE}?bairro=${encodeURIComponent(b)}`
                        );
                        const d = await r.json();
                        if (d.ok) cacheCoords.set(b, { lat: d.lat, lng: d.lon });
                    } catch (e) {
                        console.error(`Erro ao geocodificar ${b}:`, e);
                    }
                })
            );
            const done = Math.min(i + chunk.length, bairrosUnicos.length);
            if (onProgress) onProgress(Math.round((done / bairrosUnicos.length) * 100));
        }

        this.baseAtendimentos.forEach((a) => {
            const c = cacheCoords.get(a.bairro);
            if (c) {
                a.lat = c.lat;
                a.lng = c.lng;
            }
        });

        return this.baseAtendimentos;
    }
}
