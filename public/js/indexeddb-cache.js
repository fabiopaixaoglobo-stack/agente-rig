/**
 * indexeddb-cache.js - Agente RIT / CCO
 * Gerenciamento de Cache Persistente em IndexedDB de Alta Performance
 * Armazena buscas geoespaciais, POIs estratégicos e métricas de saúde de provedores.
 * Degradação graciosa para Map em memória caso IndexedDB esteja indisponível.
 */

class IndexedDBCache {
    constructor() {
        this.dbName = 'RIT_GEO_DB';
        this.version = 1;
        this.db = null;
        this.isSupported = typeof window !== 'undefined' && 'indexedDB' in window;
        this.memoryFallback = new Map();
        this._initPromise = null;
    }

    async init() {
        if (!this.isSupported) return false;
        if (this.db) return true;
        if (this._initPromise) return this._initPromise;

        this._initPromise = new Promise((resolve) => {
            try {
                const request = indexedDB.open(this.dbName, this.version);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('geo_cache')) {
                        db.createObjectStore('geo_cache', { keyPath: 'key' });
                    }
                    if (!db.objectStoreNames.contains('pois_cache')) {
                        db.createObjectStore('pois_cache', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('providers_health')) {
                        db.createObjectStore('providers_health', { keyPath: 'provider' });
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    console.info('[IndexedDBCache] IndexedDB inicializado com sucesso (RIT_GEO_DB).');
                    resolve(true);
                };

                request.onerror = (event) => {
                    console.warn('[IndexedDBCache] Erro ao abrir IndexedDB, usando memória:', event.target.error);
                    this.isSupported = false;
                    resolve(false);
                };
            } catch (err) {
                console.warn('[IndexedDBCache] Exceção no IndexedDB:', err);
                this.isSupported = false;
                resolve(false);
            }
        });

        return this._initPromise;
    }

    async getGeo(key) {
        const normKey = String(key || '').trim().toLowerCase();
        if (!normKey) return null;

        if (this.memoryFallback.has(`geo_${normKey}`)) {
            const item = this.memoryFallback.get(`geo_${normKey}`);
            if (Date.now() - item.time < 86400000) return item.data; // 24h
        }

        if (!this.db) await this.init();
        if (!this.db) return null;

        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('geo_cache', 'readonly');
                const store = tx.objectStore('geo_cache');
                const req = store.get(normKey);
                req.onsuccess = () => {
                    const res = req.result;
                    if (res && (Date.now() - res.timestamp < 86400000 * 7)) { // 7 dias
                        resolve(res.data);
                    } else {
                        resolve(null);
                    }
                };
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async setGeo(key, data) {
        const normKey = String(key || '').trim().toLowerCase();
        if (!normKey || !data) return;

        this.memoryFallback.set(`geo_${normKey}`, { data, time: Date.now() });

        if (!this.db) await this.init();
        if (!this.db) return;

        try {
            const tx = this.db.transaction('geo_cache', 'readwrite');
            const store = tx.objectStore('geo_cache');
            store.put({ key: normKey, data, timestamp: Date.now() });
        } catch (e) {}
    }

    async getProviderHealth(provider) {
        if (!this.db) await this.init();
        if (!this.db) return this.memoryFallback.get(`prov_${provider}`) || null;

        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('providers_health', 'readonly');
                const req = tx.objectStore('providers_health').get(provider);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async setProviderHealth(provider, stats) {
        this.memoryFallback.set(`prov_${provider}`, { provider, ...stats, timestamp: Date.now() });
        if (!this.db) await this.init();
        if (!this.db) return;

        try {
            const tx = this.db.transaction('providers_health', 'readwrite');
            tx.objectStore('providers_health').put({ provider, ...stats, timestamp: Date.now() });
        } catch (e) {}
    }
}

export const ritCache = new IndexedDBCache();
