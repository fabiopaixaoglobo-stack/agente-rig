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
