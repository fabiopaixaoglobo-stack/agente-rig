document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('rig_token');
    
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    const tbody = document.getElementById('audit-tbody');
    const errorMessage = document.getElementById('error-message');
    const btnLogout = document.getElementById('btn-logout');

    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('rig_token');
        localStorage.removeItem('rig_audit_id');
        localStorage.removeItem('rig_user');
        window.location.href = '/login.html';
    });

    async function loadAuditData() {
        try {
            const response = await fetch('/api/audit', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('rig_token');
                window.location.href = '/login.html';
                return;
            }

            const data = await response.json();

            if (response.ok && data.success) {
                renderTable(data.data);
            } else {
                showError(data.error || 'Erro ao buscar dados de auditoria.');
            }
        } catch (error) {
            console.error('Audit fetch error:', error);
            showError('Erro de conexão com o servidor.');
        }
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
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }

    function renderTable(rows) {
        tbody.innerHTML = '';
        
        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum registro encontrado.</td></tr>';
            return;
        }

        rows.forEach(row => {
            const tr = document.createElement('tr');
            
            const nomeCompleto = `${row.nome} ${row.sobrenome}`;
            
            tr.innerHTML = `
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
