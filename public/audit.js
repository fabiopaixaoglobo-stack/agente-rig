document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('rig_token');
    
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    let auditData = [];

    // Elements
    const tbody = document.getElementById('audit-tbody');
    const errorMessage = document.getElementById('error-message');
    const btnLogout = document.getElementById('btn-logout');
    const filterDate = document.getElementById('filter-date');
    const filterUser = document.getElementById('filter-user');

    // KPI Elements
    const kpiActive = document.getElementById('kpi-active-users');
    const kpiToday = document.getElementById('kpi-logins-today');
    const kpiUnique = document.getElementById('kpi-unique-users');
    const kpiAvg = document.getElementById('kpi-avg-session');
    const kpiTopUser = document.getElementById('kpi-top-user');

    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('rig_token');
        localStorage.removeItem('rig_audit_id');
        localStorage.removeItem('rig_user');
        window.location.href = '/login.html';
    });

    filterDate.addEventListener('change', renderDashboard);
    filterUser.addEventListener('input', renderDashboard);

    // ── Data Fetch ──────────────────────────────
    async function loadAuditData() {
        try {
            const response = await fetch('/api/audit', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('rig_token');
                window.location.href = '/login.html';
                return;
            }

            const data = await response.json();

            if (response.ok && data.success) {
                auditData = data.data;
                renderDashboard();
            } else {
                showError(data.error || 'Erro ao buscar dados de auditoria.');
            }
        } catch (error) {
            console.error('Audit fetch error:', error);
            showError('Erro de conexão com o servidor.');
        }
    }

    // ── Render Pipeline ─────────────────────────
    function renderDashboard() {
        const dateVal = filterDate.value;
        const userVal = filterUser.value.toLowerCase().trim();

        let filtered = auditData;

        if (dateVal) {
            filtered = filtered.filter(row => {
                if (!row.data_hora_login) return false;
                const rowDate = new Date(row.data_hora_login).toISOString().split('T')[0];
                return rowDate === dateVal;
            });
        }

        if (userVal) {
            filtered = filtered.filter(row => {
                const name = `${row.nome} ${row.sobrenome}`.toLowerCase();
                const mat = (row.matricula || '').toLowerCase();
                return name.includes(userVal) || mat.includes(userVal);
            });
        }

        updateKPIs(filtered);
        renderTable(filtered);
    }

    // ── KPI Computation ─────────────────────────
    function updateKPIs(data) {
        let activeCount = 0;
        let todayLogins = 0;
        const uniqueUsers = new Set();
        let totalSessionTime = 0;
        let sessionsWithTime = 0;
        const userCounts = {};

        const todayStr = new Date().toISOString().split('T')[0];

        data.forEach(row => {
            if (!row.data_hora_logout) activeCount++;

            if (row.data_hora_login) {
                const loginDate = new Date(row.data_hora_login).toISOString().split('T')[0];
                if (loginDate === todayStr) todayLogins++;
            }

            uniqueUsers.add(row.matricula);

            if (row.tempo_sessao !== null && row.tempo_sessao !== undefined) {
                totalSessionTime += row.tempo_sessao;
                sessionsWithTime++;
            }

            const userName = `${row.nome} ${row.sobrenome}`;
            userCounts[userName] = (userCounts[userName] || 0) + 1;
        });

        kpiActive.textContent = activeCount;
        kpiToday.textContent = todayLogins;
        kpiUnique.textContent = uniqueUsers.size;
        
        if (sessionsWithTime > 0) {
            const avgSec = Math.floor(totalSessionTime / sessionsWithTime);
            kpiAvg.textContent = formatSessionTime(avgSec);
        } else {
            kpiAvg.textContent = '-';
        }

        let topUser = '-';
        let maxCount = 0;
        for (const [user, count] of Object.entries(userCounts)) {
            if (count > maxCount) {
                maxCount = count;
                topUser = user;
            }
        }
        kpiTopUser.textContent = topUser;
    }

    // ── Table Rendering ─────────────────────────
    function renderTable(rows) {
        tbody.innerHTML = '';
        
        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum registro encontrado.</td></tr>';
            return;
        }

        rows.forEach(row => {
            const tr = document.createElement('tr');
            const nomeCompleto = `${row.nome} ${row.sobrenome}`;

            const isActive = !row.data_hora_logout;
            const isLongSession = row.tempo_sessao && row.tempo_sessao > 3600;

            let statusHtml = '';
            let rowClass = '';

            if (isActive) {
                statusHtml = '<span class="status-dot status-active"></span> Ativo';
                rowClass = 'row-active';
            } else if (isLongSession) {
                statusHtml = '<span class="status-dot status-long"></span> Longa';
                rowClass = 'row-long';
            } else {
                statusHtml = '<span class="status-dot status-normal"></span> Normal';
            }

            tr.className = rowClass;
            tr.innerHTML = `
                <td>${statusHtml}</td>
                <td>${escapeHTML(nomeCompleto)}</td>
                <td>${escapeHTML(row.matricula)}</td>
                <td>${formatDateTime(row.data_hora_login)}</td>
                <td>${formatDateTime(row.data_hora_logout)}</td>
                <td>${formatSessionTime(row.tempo_sessao)}</td>
                <td>${escapeHTML(row.ip_origem || '-')}</td>
            `;

            tbody.appendChild(tr);
        });
    }

    // ── Formatters ──────────────────────────────
    function formatDateTime(isoString) {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleString('pt-BR');
    }

    function formatSessionTime(seconds) {
        if (seconds === null || seconds === undefined) return '-';
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const hrs = Math.floor(minutes / 60);
        const remMin = minutes % 60;
        return hrs > 0 ? `${hrs}h ${remMin}m` : `${minutes}m`;
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
    }

    // ── Init ────────────────────────────────────
    loadAuditData();
});
