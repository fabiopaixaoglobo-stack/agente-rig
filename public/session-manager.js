/**
 * Session Manager — Gerencia o heartbeat e fechamento de sessão.
 *
 * • Envia um ping a cada 5 minutos (POST /api/session/ping)
 * • Usa sendBeacon ao fechar o browser/aba para encerrar a sessão
 * • Não fecha a sessão ao navegar entre páginas do mesmo site
 */
(function () {
    const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
    const AUDIT_KEY = 'rig_auditId';
    const TOKEN_KEY = 'rig_token';

    function getAuditId() {
        return localStorage.getItem(AUDIT_KEY);
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    // Flag: marcada como true quando o usuário clica em logout ou navega internamente
    window.__rigInternalNav = false;

    // ── Heartbeat (ping) ────────────────────────
    function sendPing() {
        const auditId = getAuditId();
        const token = getToken();
        if (!auditId || !token) return;

        fetch('/api/session/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auditId })
        }).catch(() => { /* silencioso */ });
    }

    // ── Encerrar sessão via sendBeacon ───────────
    function closeSession() {
        // Se for navegação interna, não fechar a sessão
        if (window.__rigInternalNav) return;

        const auditId = getAuditId();
        if (!auditId) return;

        const payload = JSON.stringify({ auditId });

        // sendBeacon é fire-and-forget: funciona mesmo quando o browser está fechando
        if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon('/api/session/close', blob);
        } else {
            // Fallback síncrono para browsers antigos
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/session/close', false);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(payload);
            } catch (e) { /* silencioso */ }
        }
    }

    // ── Interceptar links internos ──────────────
    // Marca navegação interna para não fechar sessão ao clicar em links do sistema
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (link) {
            const url = new URL(link.href, window.location.origin);
            if (url.origin === window.location.origin) {
                window.__rigInternalNav = true;
            }
        }
    });

    // Também interceptar redirecionamentos via window.location (forms, buttons)
    // O doLogout e outros redirecionamentos já fazem a chamada à API de logout,
    // então basta marcar como navegação interna.
    const _origAssign = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    if (_origAssign && _origAssign.set) {
        Object.defineProperty(window.location, 'href', {
            set: function (val) {
                const url = new URL(val, window.location.origin);
                if (url.origin === window.location.origin) {
                    window.__rigInternalNav = true;
                }
                _origAssign.set.call(this, val);
            },
            get: _origAssign.get
        });
    }

    // ── Event Listeners ─────────────────────────
    // Ao fechar aba ou browser
    window.addEventListener('beforeunload', closeSession);

    // ── Iniciar heartbeat ───────────────────────
    if (getAuditId() && getToken()) {
        // Ping imediato no carregamento
        sendPing();
        // Ping periódico
        setInterval(sendPing, PING_INTERVAL_MS);
    }
})();
