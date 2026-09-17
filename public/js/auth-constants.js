/**
 * Constantes e utilitários centralizados de autenticação e sessão.
 * Garante compatibilidade retroativa durante a transição Agente RIG -> Agente RIT.
 */
const TOKEN_KEYS = Object.freeze({
    CURRENT: 'rit_token',
    LEGACY: 'rig_token',
    AUDIT_CURRENT: 'rit_auditId',
    AUDIT_LEGACY: 'rig_auditId',
    USER_CURRENT: 'rit_user',
    USER_LEGACY: 'rig_user'
});

const API_HOSTS = Object.freeze({
    PRIMARY: 'https://api.agenterit.com.br',
    SECONDARY: 'https://agente-rit-backend.onrender.com',
    LEGACY: 'https://agente-rig-backend.onrender.com'
});

function getApiBaseUrl() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
        return '';
    }
    return API_HOSTS.PRIMARY;
}

function getAuthToken() {
    try {
        return localStorage.getItem(TOKEN_KEYS.CURRENT) || localStorage.getItem(TOKEN_KEYS.LEGACY) || null;
    } catch (e) {
        return null;
    }
}

function getAuthUser() {
    try {
        const raw = localStorage.getItem(TOKEN_KEYS.USER_CURRENT) || localStorage.getItem(TOKEN_KEYS.USER_LEGACY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function getAuthAuditId() {
    try {
        return localStorage.getItem(TOKEN_KEYS.AUDIT_CURRENT) || localStorage.getItem(TOKEN_KEYS.AUDIT_LEGACY) || null;
    } catch (e) {
        return null;
    }
}

function saveAuthSession(token, user, auditId) {
    try {
        if (token) {
            localStorage.setItem(TOKEN_KEYS.CURRENT, token);
            localStorage.setItem(TOKEN_KEYS.LEGACY, token);
        }
        if (user) {
            const userStr = typeof user === 'string' ? user : JSON.stringify(user);
            localStorage.setItem(TOKEN_KEYS.USER_CURRENT, userStr);
            localStorage.setItem(TOKEN_KEYS.USER_LEGACY, userStr);
        }
        if (auditId) {
            localStorage.setItem(TOKEN_KEYS.AUDIT_CURRENT, String(auditId));
            localStorage.setItem(TOKEN_KEYS.AUDIT_LEGACY, String(auditId));
        }
    } catch (e) {
        console.warn('[auth-constants] Erro ao salvar sessão no localStorage:', e);
    }
}

function clearAuthSession() {
    try {
        localStorage.removeItem(TOKEN_KEYS.CURRENT);
        localStorage.removeItem(TOKEN_KEYS.LEGACY);
        localStorage.removeItem(TOKEN_KEYS.USER_CURRENT);
        localStorage.removeItem(TOKEN_KEYS.USER_LEGACY);
        localStorage.removeItem(TOKEN_KEYS.AUDIT_CURRENT);
        localStorage.removeItem(TOKEN_KEYS.AUDIT_LEGACY);
    } catch (e) {
        console.warn('[auth-constants] Erro ao limpar sessão no localStorage:', e);
    }
}

if (typeof window !== 'undefined') {
    window.TOKEN_KEYS = TOKEN_KEYS;
    window.API_HOSTS = API_HOSTS;
    window.getApiBaseUrl = getApiBaseUrl;
    window.getAuthToken = getAuthToken;
    window.getAuthUser = getAuthUser;
    window.getAuthAuditId = getAuthAuditId;
    window.saveAuthSession = saveAuthSession;
    window.clearAuthSession = clearAuthSession;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TOKEN_KEYS,
        API_HOSTS,
        getApiBaseUrl,
        getAuthToken,
        getAuthUser,
        getAuthAuditId,
        saveAuthSession,
        clearAuthSession
    };
}
