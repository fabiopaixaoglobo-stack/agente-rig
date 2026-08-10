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

                    resolve(this.baseAtendimentos);
                } catch (e) {
                    reject(e);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    async geocodificar(onProgress) {
        // Collect unique bairros/locations to geocode
        // Uses a priority chain: bairro from destino -> from origem -> 'Rio de Janeiro'
        const bairrosUnicos = [...new Set(
            this.baseAtendimentos.map((a) => {
                // Try multiple fields for location
                const bairro = (a.bairro || '').trim();
                if (bairro && bairro.length > 2 && bairro !== 'Rio de Janeiro') return bairro;
                // Fallback: use last segment of destino
                const destParts = (a.destino || '').split(',');
                const destBairro = destParts.pop()?.trim() || '';
                if (destBairro && destBairro.length > 2) return destBairro;
                // Fallback: use last segment of origem
                const origParts = (a.origem || '').split(',');
                const origBairro = origParts.pop()?.trim() || '';
                if (origBairro && origBairro.length > 2) return origBairro;
                return 'Jacarepaguá';
            })
        )];

        const cacheCoords = new Map();

        if (bairrosUnicos.length === 0) {
            if (onProgress) onProgress(100);
            return this.baseAtendimentos;
        }

        console.log(`[GEOCODE] Iniciando geocodificação de ${bairrosUnicos.length} bairros únicos para ${this.baseAtendimentos.length} atendimentos`);

        const chunkSize = 3;
        for (let i = 0; i < bairrosUnicos.length; i += chunkSize) {
            const chunk = bairrosUnicos.slice(i, i + chunkSize);
            await Promise.all(
                chunk.map(async (b) => {
                    try {
                        const cleanB = b.split(' - ')[0].split(' — ')[0].trim();
                        const r = await fetch(
                            `${CONFIG.API_ENDPOINTS.GEOCODE}?bairro=${encodeURIComponent(cleanB)}`
                        );
                        const d = await r.json();
                        if (d.ok) {
                            const lat = parseFloat(d.lat);
                            // Fix: API returns d.lon (not d.lng) — handle both
                            const lng = parseFloat(d.lon ?? d.lng);
                            if (isFinite(lat) && isFinite(lng)) {
                                cacheCoords.set(b, { lat, lng });
                            } else {
                                console.warn(`[GEOCODE] Coordenadas inválidas para "${b}": lat=${d.lat} lon=${d.lon}`);
                            }
                        }
                    } catch (e) {
                        console.error(`[GEOCODE] Erro ao geocodificar "${b}":`, e);
                    }
                })
            );
            const done = Math.min(i + chunk.length, bairrosUnicos.length);
            if (onProgress) onProgress(Math.round((done / bairrosUnicos.length) * 100));
        }

        // Rio de Janeiro reference points for fallback jitter (Jacarepaguá area)
        const RIO_LAT = -22.9068;
        const RIO_LNG = -43.1729;

        let geocodedCount = 0;
        let fallbackCount = 0;

        this.baseAtendimentos.forEach((a) => {
            // Determine which bairro was used for this atendimento
            let bairroKey = (a.bairro || '').trim();
            if (!bairroKey || bairroKey.length <= 2 || bairroKey === 'Rio de Janeiro') {
                const destParts = (a.destino || '').split(',');
                const destBairro = destParts.pop()?.trim() || '';
                if (destBairro && destBairro.length > 2) bairroKey = destBairro;
                else {
                    const origParts = (a.origem || '').split(',');
                    bairroKey = origParts.pop()?.trim() || 'Jacarepaguá';
                }
            }

            const c = cacheCoords.get(bairroKey);
            if (c && isFinite(c.lat) && isFinite(c.lng)) {
                // Add small jitter so overlapping markers spread slightly
                const jitterLat = (Math.random() - 0.5) * 0.002;
                const jitterLng = (Math.random() - 0.5) * 0.002;
                a.lat = c.lat + jitterLat;
                a.lng = c.lng + jitterLng;
                geocodedCount++;
            } else {
                // Fallback: spread around Rio de Janeiro center so markers are always visible
                a.lat = RIO_LAT + (Math.random() - 0.5) * 0.15;
                a.lng = RIO_LNG + (Math.random() - 0.5) * 0.15;
                fallbackCount++;
            }
        });

        console.log(`[GEOCODE] Concluído: ${geocodedCount} com coordenadas reais, ${fallbackCount} com fallback (Rio de Janeiro)`);
        return this.baseAtendimentos;
    }
}
