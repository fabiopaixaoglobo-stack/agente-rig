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

export function parseDataHora(v) {
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

const KNOWN_COORDS = {
    'JACAREPAGUA': { lat: -22.9515, lng: -43.3654 },
    'CURICICA': { lat: -22.9567, lng: -43.3854 },
    'BARRA DA TIJUCA': { lat: -23.0003, lng: -43.3659 },
    'RECREIO DOS BANDEIRANTES': { lat: -23.0189, lng: -43.4697 },
    'SUMARE': { lat: -22.9467, lng: -43.2254 },
    'ALTO DA BOA VISTA': { lat: -22.9615, lng: -43.2554 },
    'COPACABANA': { lat: -22.9694, lng: -43.1868 },
    'IPANEMA': { lat: -22.9838, lng: -43.2045 },
    'GALEAO': { lat: -22.8143, lng: -43.2486 },
    'CENTRO': { lat: -22.9068, lng: -43.1729 },
    'GUARATIBA': { lat: -22.9967, lng: -43.5954 },
    'TAQUARA': { lat: -22.9215, lng: -43.3754 },
    'VARGEM GRANDE': { lat: -22.9815, lng: -43.4954 },
    'VARGEM PEQUENA': { lat: -22.9715, lng: -43.4654 },
    'REALENGO': { lat: -22.8715, lng: -43.4254 },
    'SANTA TERESA': { lat: -22.9215, lng: -43.1854 },
    'LARANJEIRAS': { lat: -22.9315, lng: -43.1854 },
    'ICARAI': { lat: -22.9015, lng: -43.1154 }
};

export class DataService {
    constructor() {
        this.baseAtendimentos = [];
    }

    garantirCoordenadas(lista) {
        if (!Array.isArray(lista)) return [];
        lista.forEach((a) => {
            if (!a) return;
            if (a.lat && a.lng && !isNaN(parseFloat(a.lat)) && !isNaN(parseFloat(a.lng))) {
                a.lat = parseFloat(a.lat);
                a.lng = parseFloat(a.lng);
                return;
            }
            const b = String(a.bairro || a.destino || '').toUpperCase().trim();
            let matchKey = null;
            for (const key of Object.keys(KNOWN_COORDS)) {
                if (b.includes(key)) {
                    matchKey = key;
                    break;
                }
            }
            const base = matchKey ? KNOWN_COORDS[matchKey] : { lat: -22.9068, lng: -43.1729 };
            const jitterLat = (Math.random() - 0.5) * 0.04;
            const jitterLng = (Math.random() - 0.5) * 0.04;
            a.lat = base.lat + jitterLat;
            a.lng = base.lng + jitterLng;
        });
        return lista;
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
                                dataHoraInicioRaw,
                                dataHoraFimRaw,
                                horarioInicio,
                                lat: null,
                                lng: null,
                            };
                        })
                        .filter(Boolean);

                    this.garantirCoordenadas(this.baseAtendimentos);
                    resolve(this.baseAtendimentos);
                } catch (e) {
                    reject(e);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    async geocodificar(onProgress) {
        try {
            this.garantirCoordenadas(this.baseAtendimentos);

            const rawBairros = (this.baseAtendimentos || [])
                .map((a) => a && a.bairro)
                .filter((b) => typeof b === 'string' && b.trim().length > 0);

            const bairrosUnicos = [...new Set(rawBairros)];
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
                            const cleanB = String(b).split(' - ')[0].split(' — ')[0].trim();
                            const r = await fetch(
                                `${CONFIG.API_ENDPOINTS.GEOCODE}?bairro=${encodeURIComponent(cleanB)}`
                            );
                            if (r.ok) {
                                const d = await r.json();
                                if (d && d.ok && d.lat && (d.lon || d.lng)) {
                                    cacheCoords.set(b, { lat: parseFloat(d.lat), lng: parseFloat(d.lon || d.lng) });
                                }
                            }
                        } catch (e) {
                            console.warn(`[GEOCODE] Falha parcial para ${b}:`, e.message);
                        }
                    })
                );
                const done = Math.min(i + chunk.length, bairrosUnicos.length);
                if (onProgress) onProgress(Math.round((done / bairrosUnicos.length) * 100));
            }

            this.baseAtendimentos.forEach((a) => {
                if (!a) return;
                const c = cacheCoords.get(a.bairro);
                if (c) {
                    const jitterLat = (Math.random() - 0.5) * 0.0018;
                    const jitterLng = (Math.random() - 0.5) * 0.0018;
                    a.lat = c.lat + jitterLat;
                    a.lng = c.lng + jitterLng;
                }
            });
        } catch (globalErr) {
            console.error("[GEOCODE] Erro global silenciado para nao interromper plotagem:", globalErr);
        }

        return this.baseAtendimentos;
    }
}
