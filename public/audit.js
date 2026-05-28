document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('rig_token');
    
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    let auditData = [];
    let chartHourlyInstance = null;
    let chartUsersInstance = null;

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

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';

    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('rig_token');
        localStorage.removeItem('rig_audit_id');
        localStorage.removeItem('rig_user');
        window.location.href = '/login.html';
    });

    filterDate.addEventListener('change', renderDashboard);
    filterUser.addEventListener('input', renderDashboard);

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

    function renderDashboard() {
        // 1. Filter Data
        const dateVal = filterDate.value; // YYYY-MM-DD
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

        // 2. Update KPIs
        updateKPIs(filtered);

        // 3. Update Charts
        updateCharts(filtered);

        // 4. Update Table
        renderTable(filtered);
    }

    function updateKPIs(data) {
        let activeCount = 0;
        let todayLogins = 0;
        const uniqueUsers = new Set();
        let totalSessionTime = 0;
        let sessionsWithTime = 0;
        const userCounts = {};

        const todayStr = new Date().toISOString().split('T')[0];

        data.forEach(row => {
            // Active users: no logout time
            if (!row.data_hora_logout) activeCount++;

            // Today's logins
            if (row.data_hora_login) {
                const loginDate = new Date(row.data_hora_login).toISOString().split('T')[0];
                if (loginDate === todayStr) todayLogins++;
            }

            // Unique users
            uniqueUsers.add(row.matricula);

            // Avg session
            if (row.tempo_sessao !== null && row.tempo_sessao !== undefined) {
                totalSessionTime += row.tempo_sessao;
                sessionsWithTime++;
            }

            // Top user
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
            kpiAvg.textContent = '0m';
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

    function updateCharts(data) {
        const hourlyCounts = Array(24).fill(0);
        const userCounts = {};

        data.forEach(row => {
            if (row.data_hora_login) {
                const date = new Date(row.data_hora_login);
                hourlyCounts[date.getHours()]++;
            }

            const userName = `${row.nome} ${row.sobrenome}`;
            userCounts[userName] = (userCounts[userName] || 0) + 1;
        });

        // Prepare Top Users (limit to 10)
        const sortedUsers = Object.entries(userCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        const topUserLabels = sortedUsers.map(u => u[0]);
        const topUserData = sortedUsers.map(u => u[1]);

        // Render Hourly Chart
        const ctxHourly = document.getElementById('chart-hourly').getContext('2d');
        if (chartHourlyInstance) chartHourlyInstance.destroy();
        chartHourlyInstance = new Chart(ctxHourly, {
            type: 'bar',
            data: {
                labels: Array.from({length: 24}, (_, i) => `${i}h`),
                datasets: [{
                    label: 'Logins',
                    data: hourlyCounts,
                    backgroundColor: '#00D1FF',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false } }
            }
        });

        // Render Top Users Chart
        const ctxUsers = document.getElementById('chart-top-users').getContext('2d');
        if (chartUsersInstance) chartUsersInstance.destroy();
        chartUsersInstance = new Chart(ctxUsers, {
            type: 'bar',
            data: {
                labels: topUserLabels,
                datasets: [{
                    label: 'Sessões',
                    data: topUserData,
                    backgroundColor: '#10b981',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false } }
            }
        });
    }

    function formatDateTime(isoString) {
        if (!isoString) return '-';
        const date = new Date(isoString);
        return date.toLocaleString('pt-BR');
    }

    function formatSessionTime(seconds) {
        if (seconds === null || seconds === undefined) return '-';
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const hrs = Math.floor(minutes / 60);
        const remMin = minutes % 60;
        
        if (hrs > 0) {
            return `${hrs}h ${remMin}m`;
        }
        return `${minutes}m`;
    }

    function renderTable(rows) {
        tbody.innerHTML = '';
        
        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum registro encontrado.</td></tr>';
            return;
        }

        rows.forEach(row => {
            const tr = document.createElement('tr');
            
            const nomeCompleto = `${row.nome} ${row.sobrenome}`;
            
            // Determine Status and styling
            let statusHtml = '';
            let rowClass = '';
            let statusText = '';
            
            const isLongSession = row.tempo_sessao && row.tempo_sessao > 3600; // > 1 hour
            const isActive = !row.data_hora_logout;

            if (isActive) {
                statusHtml = `<span class="status-dot status-active"></span> Ativo`;
                rowClass = 'row-active';
            } else if (isLongSession) {
                statusHtml = `<span class="status-dot status-long"></span> Longa (>1h)`;
                rowClass = 'row-warning';
            } else {
                statusHtml = `<span class="status-dot status-normal"></span> Normal`;
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

    loadAuditData();
});
