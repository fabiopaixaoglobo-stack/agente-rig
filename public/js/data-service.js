import { CONFIG } from './config.js';

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
                    const workbook = XLSX.read(data, { type: "array" });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
                    
                    this.baseAtendimentos = rows.map(l => {
                        const placa = String(l[CONFIG.EXCEL_COLUMNS.PLACA] || "").trim();
                        if (!placa) return null;
                        
                        const bairroRaw = String(l[CONFIG.EXCEL_COLUMNS.ENDERECO] || "").split(",");
                        const bairro = bairroRaw.pop().trim() || "Rio de Janeiro";
                        
                        return {
                            motorista: String(l[CONFIG.EXCEL_COLUMNS.MOTORISTA] || ""),
                            tipoVeiculo: String(l[CONFIG.EXCEL_COLUMNS.TIPO] || ""),
                            programa: String(l[CONFIG.EXCEL_COLUMNS.PROGRAMA] || "RIT").split("/")[0].trim(),
                            placa: placa,
                            bairro: bairro,
                            lat: null,
                            lng: null
                        };
                    }).filter(Boolean);
                    
                    resolve(this.baseAtendimentos);
                } catch (e) {
                    reject(e);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    async geocodificar(onProgress) {
        const bairrosUnicos = [...new Set(this.baseAtendimentos.map(a => a.bairro))];
        const cacheCoords = new Map();

        if (bairrosUnicos.length === 0) {
            if (onProgress) onProgress(100);
            return this.baseAtendimentos;
        }

        const chunkSize = 3;
        for (let i = 0; i < bairrosUnicos.length; i += chunkSize) {
            const chunk = bairrosUnicos.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (b) => {
                try {
                    const r = await fetch(`${CONFIG.API_ENDPOINTS.GEOCODE}?bairro=${encodeURIComponent(b)}`);
                    const d = await r.json();
                    if (d.ok) cacheCoords.set(b, { lat: d.lat, lng: d.lon });
                } catch (e) {
                    console.error(`Erro ao geocodificar ${b}:`, e);
                }
            }));
            const done = Math.min(i + chunk.length, bairrosUnicos.length);
            if (onProgress) onProgress(Math.round((done / bairrosUnicos.length) * 100));
        }

        this.baseAtendimentos.forEach(a => {
            const c = cacheCoords.get(a.bairro);
            if (c) { a.lat = c.lat; a.lng = c.lng; }
        });

        return this.baseAtendimentos;
    }
}
