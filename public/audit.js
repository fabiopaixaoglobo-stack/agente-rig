document.addEventListener('DOMContentLoaded', () => {
    const token = (typeof getAuthToken === 'function') ? getAuthToken() : (localStorage.getItem('rit_token') || localStorage.getItem('rig_token'));
    
    if (!token) {
        sessionStorage.setItem('rit_redirect', '/audit.html');
        window.location.href = '/login.html?redirect=' + encodeURIComponent('/audit.html');
        return;
    }

    let auditData = [];
    let recoverData = [];
    let lgpdData = [];
    let securityData = [];
    let uploadsData = [];

    // Elementos DOM
    const tbody = document.getElementById('audit-tbody');
    const recoverTbody = document.getElementById('recover-tbody');
    const lgpdTbody = document.getElementById('lgpd-tbody');
    const securityTbody = document.getElementById('security-tbody');
    const uploadsTbody = document.getElementById('uploads-tbody');
    const errorMessage = document.getElementById('error-message');
    const btnLogout = document.getElementById('btn-logout');
    const btnRefresh = document.getElementById('btn-refresh');
    const btnExpurgoLGPD = document.getElementById('btn-expurgo-lgpd');
    
    // Filtros
    const filterDate = document.getElementById('filter-date');
    const filterUser = document.getElementById('filter-user');
    const filterStatus = document.getElementById('filter-status');
    const filterRecoverUser = document.getElementById('filter-recover-user');
    const filterLgpdSearch = document.getElementById('filter-lgpd-search');
    const filterSecuritySearch = document.getElementById('filter-security-search');
    const filterUploadsSearch = document.getElementById('filter-uploads-search');

    // Elementos KPI
    const kpiActive = document.getElementById('kpi-active-users');
    const kpiToday = document.getElementById('kpi-logins-today');
    const kpiUnique = document.getElementById('kpi-unique-users');
    const kpiAvg = document.getElementById('kpi-avg-session');
    const kpiTopUser = document.getElementById('kpi-top-user');

    // Ação: Logout
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (typeof clearAuthSession === 'function') {
                clearAuthSession();
            } else {
                localStorage.removeItem('rit_token');
                localStorage.removeItem('rig_token');
                localStorage.removeItem('rit_auditId');
                localStorage.removeItem('rig_auditId');
                localStorage.removeItem('rit_user');
                localStorage.removeItem('rig_user');
            }
            window.location.href = '/login.html';
        });
    }

    // Ação: Refresh manual
    if (btnRefresh) {
        btnRefresh.addEventListener('click', async () => {
            btnRefresh.classList.add('spinning');
            btnRefresh.disabled = true;
            try {
                await loadAuditData();
                await loadGovernanceData();
            } finally {
                setTimeout(() => {
                    btnRefresh.classList.remove('spinning');
                    btnRefresh.disabled = false;
                }, 400);
            }
        });
    }

    // Eventos de Filtro
    if (filterDate) filterDate.addEventListener('change', renderDashboard);
    if (filterUser) filterUser.addEventListener('input', renderDashboard);
    if (filterStatus) filterStatus.addEventListener('change', renderDashboard);
    if (filterRecoverUser) filterRecoverUser.addEventListener('input', renderRecoverDashboard);
    if (filterLgpdSearch) filterLgpdSearch.addEventListener('input', renderLGPDTable);
    if (filterSecuritySearch) filterSecuritySearch.addEventListener('input', renderSecurityTable);
    if (filterUploadsSearch) filterUploadsSearch.addEventListener('input', renderUploadsTable);

    // Ação: Expurgo LGPD (90 dias)
    if (btnExpurgoLGPD) {
        btnExpurgoLGPD.addEventListener('click', async () => {
            if (!confirm('Deseja executar o expurgo seguro de registros de auditoria LGPD com mais de 90 dias?\n\nEsta ação é irreversível e em estrita conformidade com a política de retenção mínima da LGPD.')) {
                return;
            }
            try {
                btnExpurgoLGPD.disabled = true;
                btnExpurgoLGPD.innerHTML = '<i class="ph ph-spinner"></i> Executando expurgo...';
                const response = await fetch('/api/governance/expurgo-lgpd', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ dias_retencao: 90 })
                });
                const resData = await response.json();
                if (response.ok && resData.ok) {
                    alert(`Expurgo concluído: ${resData.expurgados} registros antigos foram limpos com sucesso.`);
                    await loadGovernanceData();
                } else {
                    alert(resData.error || 'Erro ao executar expurgo LGPD.');
                }
            } catch (err) {
                console.error('Erro no expurgo LGPD:', err);
                alert('Erro de conexão ao executar expurgo.');
            } finally {
                btnExpurgoLGPD.disabled = false;
                btnExpurgoLGPD.innerHTML = '<i class="ph ph-trash"></i> Expurgo LGPD (90 dias)';
            }
        });
    }

    // Alternância de Abas
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            const targetContent = document.getElementById(tabId);
            if (targetContent) targetContent.classList.add('active');

            if (tabId === 'tab-recuperacoes') {
                loadRecoverData();
            } else if (tabId === 'tab-lgpd') {
                loadLGPDData();
            } else if (tabId === 'tab-seguranca') {
                loadSecurityData();
            } else if (tabId === 'tab-uploads') {
                loadUploadsData();
            } else {
                loadAuditData();
            }
        });
    });

    // Carregamento de Governança Integrada
    async function loadGovernanceData() {
        try {
            const response = await fetch('/api/governance/dashboard', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                if (typeof clearAuthSession === 'function') {
                    clearAuthSession();
                } else {
                    localStorage.removeItem('rit_token');
                    localStorage.removeItem('rig_token');
                }
                sessionStorage.setItem('rit_redirect', '/audit.html');
                window.location.href = '/login.html?redirect=' + encodeURIComponent('/audit.html');
                return;
            }

            if (response.status === 403) {
                const data = await response.json().catch(() => ({}));
                showAccessDenied(data.error || 'Acesso restrito. Este módulo exige perfil de Administrador, Gestor ou Auditor.');
                return;
            }

            const data = await response.json();
            if (response.ok && data.ok) {
                lgpdData = data.auditorias_lgpd || [];
                securityData = data.eventos_seguranca || [];
                uploadsData = data.uploads || [];
                
                renderLGPDTable();
                renderSecurityTable();
                renderUploadsTable();
            }
        } catch (err) {
            console.warn('Erro ao carregar dados de governança integrados:', err);
        }
    }

    // Carregamento de Auditoria / Acessos
    async function loadAuditData(isSilent = false) {
        try {
            const response = await fetch('/api/audit', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                if (typeof clearAuthSession === 'function') {
                    clearAuthSession();
                } else {
                    localStorage.removeItem('rit_token');
                    localStorage.removeItem('rig_token');
                }
                sessionStorage.setItem('rit_redirect', '/audit.html');
                window.location.href = '/login.html?redirect=' + encodeURIComponent('/audit.html');
                return;
            }

            if (response.status === 403) {
                const data = await response.json().catch(() => ({}));
                showAccessDenied(data.error || 'Acesso restrito. Este painel exige perfil de Administrador, Gestor ou Auditor.');
                return;
            }

            const data = await response.json();

            if (response.ok && data.success) {
                auditData = data.data || [];
                renderDashboard();
                if (errorMessage) errorMessage.style.display = 'none';
            } else {
                if (!isSilent) showError(data.error || 'Erro ao buscar dados de auditoria.');
            }
        } catch (error) {
            console.error('Audit fetch error:', error);
            if (!isSilent) showError('Erro de conexão com o servidor ao consultar histórico de logins.');
        }
    }

    // Carregamento de Logs LGPD
    async function loadLGPDData() {
        try {
            const response = await fetch('/api/governance/lgpd-logs', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (response.ok && data.ok) {
                lgpdData = data.logs || [];
                renderLGPDTable();
            }
        } catch (err) {
            console.error('Erro ao carregar logs LGPD:', err);
        }
    }

    async function loadSecurityData() {
        await loadGovernanceData();
    }

    async function loadUploadsData() {
        await loadGovernanceData();
    }

    // Carregamento de Recuperações
    async function loadRecoverData() {
        try {
            const response = await fetch('/api/recuperacoes', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                if (typeof clearAuthSession === 'function') {
                    clearAuthSession();
                } else {
                    localStorage.removeItem('rit_token');
                    localStorage.removeItem('rig_token');
                }
                sessionStorage.setItem('rit_redirect', '/audit.html');
                window.location.href = '/login.html?redirect=' + encodeURIComponent('/audit.html');
                return;
            }

            if (response.status === 403) {
                const data = await response.json().catch(() => ({}));
                showAccessDenied(data.error || 'Acesso restrito ao histórico de recuperações.');
                return;
            }

            const data = await response.json();

            if (response.ok && data.success) {
                recoverData = data.data || [];
                renderRecoverDashboard();
            } else {
                showError(data.error || 'Erro ao buscar dados de recuperações.');
            }
        } catch (error) {
            console.error('Recover fetch error:', error);
            showError('Erro de conexão ao buscar dados de recuperações.');
        }
    }

    // Render Dashboard Principal (Filtros + KPIs + Tabela)
    function renderDashboard() {
        const dateVal = filterDate?.value;
        const userVal = (filterUser?.value || '').toLowerCase().trim();
        const statusVal = filterStatus?.value;

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
                const name = `${row.nome || ''} ${row.sobrenome || ''}`.toLowerCase();
                const mat = (row.matricula || '').toLowerCase();
                const email = (row.email || '').toLowerCase();
                return name.includes(userVal) || mat.includes(userVal) || email.includes(userVal);
            });
        }

        if (statusVal) {
            filtered = filtered.filter(row => {
                const isActive = !row.data_hora_logout;
                let effectiveSeconds = row.tempo_sessao;
                if (isActive && row.data_hora_login) {
                    effectiveSeconds = Math.floor((Date.now() - new Date(row.data_hora_login).getTime()) / 1000);
                }
                const isLong = effectiveSeconds && effectiveSeconds > 3600;
                let rowStatus;
                if (isActive && isLong) {
                    rowStatus = 'Longa';
                } else if (isActive) {
                    rowStatus = 'Ativo';
                } else if (isLong) {
                    rowStatus = 'Longa';
                } else {
                    rowStatus = 'Normal';
                }
                return rowStatus === statusVal;
            });
        }

        updateKPIs(auditData);
        renderTable(filtered);
    }

    // Render Recuperação de Senhas
    function renderRecoverDashboard() {
        const emailFilter = (filterRecoverUser?.value || '').toLowerCase().trim();
        let filtered = recoverData;

        if (emailFilter) {
            filtered = filtered.filter(row => (row.email || '').toLowerCase().includes(emailFilter));
        }

        renderRecoverTable(filtered);
    }

    // Cálculo e Exibição dos KPIs
    function updateKPIs(data) {
        let activeCount = 0;
        let todayLogins = 0;
        const uniqueUsers = new Set();
        let totalSessionTime = 0;
        let sessionsWithTime = 0;
        const userCounts = {};

        const todayStr = new Date().toISOString().split('T')[0];

        data.forEach(row => {
            const isActive = !row.data_hora_logout;
            if (isActive) activeCount++;

            if (row.data_hora_login) {
                const loginDate = new Date(row.data_hora_login).toISOString().split('T')[0];
                if (loginDate === todayStr) todayLogins++;
            }

            if (row.matricula) uniqueUsers.add(row.matricula);

            if (row.tempo_sessao !== null && row.tempo_sessao !== undefined) {
                totalSessionTime += row.tempo_sessao;
                sessionsWithTime++;
            } else if (isActive && row.data_hora_login) {
                const elapsed = Math.floor((Date.now() - new Date(row.data_hora_login).getTime()) / 1000);
                if (elapsed > 0) {
                    totalSessionTime += elapsed;
                    sessionsWithTime++;
                }
            }

            const userName = `${row.nome || ''} ${row.sobrenome || ''}`.trim() || 'Usuário';
            userCounts[userName] = (userCounts[userName] || 0) + 1;
        });

        if (kpiActive) kpiActive.textContent = activeCount;
        if (kpiToday) kpiToday.textContent = todayLogins;
        if (kpiUnique) kpiUnique.textContent = uniqueUsers.size;
        
        if (kpiAvg) {
            if (sessionsWithTime > 0) {
                const avgSec = Math.floor(totalSessionTime / sessionsWithTime);
                kpiAvg.textContent = formatSessionTime(avgSec);
            } else {
                kpiAvg.textContent = '0m';
            }
        }

        let topUser = '-';
        let maxCount = 0;
        for (const [user, count] of Object.entries(userCounts)) {
            if (count > maxCount) {
                maxCount = count;
                topUser = user;
            }
        }
        if (kpiTopUser) {
            kpiTopUser.textContent = topUser;
            kpiTopUser.title = `${topUser} (${maxCount} acessos registrados)`;
        }
    }

    // Render Tabela de Auditoria de Acessos
    function renderTable(rows) {
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum registro de acesso localizado com os filtros atuais.</td></tr>';
            return;
        }

        rows.forEach(row => {
            const tr = document.createElement('tr');
            const nomeCompleto = `${row.nome || ''} ${row.sobrenome || ''}`.trim() || 'Colaborador';

            const isActive = !row.data_hora_logout;
            
            // Cálculo do tempo decorrido em tempo real se ativo
            let effectiveSeconds = row.tempo_sessao;
            if (isActive && row.data_hora_login) {
                effectiveSeconds = Math.max(0, Math.floor((Date.now() - new Date(row.data_hora_login).getTime()) / 1000));
            }
            const isLongSession = effectiveSeconds && effectiveSeconds > 3600;

            let statusHtml = '';
            let rowClass = '';

            if (isActive && isLongSession) {
                statusHtml = `<span class="badge-status badge-long" data-tooltip="Sessão ativa prolongada com mais de 1 hora de conexão"><span class="status-dot status-long"></span> Ativo (Longa)</span>`;
                rowClass = 'row-long';
            } else if (isActive) {
                statusHtml = `<span class="badge-status badge-active" data-tooltip="Usuário com conexão ativa e operando no momento"><span class="status-dot status-active"></span> Conectado</span>`;
                rowClass = 'row-active';
            } else if (isLongSession) {
                statusHtml = `<span class="badge-status badge-long" data-tooltip="Sessão finalizada com tempo superior a 1 hora"><span class="status-dot status-long"></span> Longa</span>`;
                rowClass = 'row-long';
            } else {
                statusHtml = `<span class="badge-status badge-normal" data-tooltip="Sessão finalizada com duração normal"><span class="status-dot status-normal"></span> Finalizado</span>`;
            }

            // Coluna de Logout
            const logoutHtml = isActive
                ? `<span style="color:#00D1FF; font-weight:600; font-size:11px;" data-tooltip="Conexão ainda aberta - usuário autenticado no sistema"><i class="ph ph-pulse"></i> Em Aberto (Ativo)</span>`
                : formatDateTime(row.data_hora_logout);

            // Coluna de Tempo de Sessão
            const tempoSessaoHtml = isActive
                ? `<span class="badge-tempo badge-tempo-live" data-tooltip="Tempo de conexão em tempo real desde o login"><i class="ph ph-timer"></i> <strong>${formatSessionTime(effectiveSeconds)}</strong> <span class="tag-live">ONLINE</span></span>`
                : `<span class="badge-tempo badge-tempo-closed" data-tooltip="Duração total da conexão"><i class="ph ph-check"></i> ${formatSessionTime(row.tempo_sessao)}</span>`;

            // Coluna de Ações: botão Deslogar (apenas ativos) e botão Forçar Reset (se tiver email)
            const kickBtn = isActive
                ? `<button class="btn-kick" data-id="${row.audit_id}" data-user="${escapeHTML(nomeCompleto)}" data-tooltip="Deslogar este usuário imediatamente e encerrar a sessão ativa" title="Deslogar Usuário"><i class="ph ph-sign-out"></i> Deslogar</button>`
                : '';
            const resetBtn = row.email
                ? `<button class="btn-force-reset" data-email="${escapeHTML(row.email)}" data-name="${escapeHTML(nomeCompleto)}" data-tooltip="Enviar e-mail para ${escapeHTML(row.email)} para redefinir senha" title="Redefinir Senha"><i class="ph ph-key"></i> Redefinir Senha</button>`
                : '';
            
            const actionHtml = (kickBtn || resetBtn)
                ? `<div class="action-group">${kickBtn}${resetBtn}</div>`
                : `<span style="color:#64748b; font-size:11px;">Encerrada</span>`;

            tr.className = rowClass;
            tr.innerHTML = `
                <td>${statusHtml}</td>
                <td><strong>${escapeHTML(nomeCompleto)}</strong></td>
                <td><code>${escapeHTML(row.matricula || '-')}</code></td>
                <td>${formatDateTime(row.data_hora_login)}</td>
                <td>${logoutHtml}</td>
                <td>${tempoSessaoHtml}</td>
                <td><small style="color:#94a3b8;">${escapeHTML(row.ip_origem || '-')}</small></td>
                <td>${actionHtml}</td>
            `;

            tbody.appendChild(tr);
        });
    }

    // Delegação de Eventos na Tabela (Deslogar e Redefinir Senha)
    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            // Ação 1: Deslogar (Kick Session)
            const kickBtn = e.target.closest('.btn-kick');
            if (kickBtn) {
                const auditId = kickBtn.getAttribute('data-id');
                const userName = kickBtn.getAttribute('data-user') || 'o colaborador';

                if (confirm(`Deseja realmente deslogar ${userName}?\n\nA sessão ativa será encerrada imediatamente e o usuário será desconectado da plataforma.`)) {
                    try {
                        kickBtn.disabled = true;
                        kickBtn.innerHTML = '<i class="ph ph-spinner"></i> Deslogando...';

                        const response = await fetch('/api/audit/kick', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ auditId })
                        });

                        const data = await response.json();
                        if (response.ok && data.success) {
                            await loadAuditData();
                        } else {
                            alert(data.error || 'Erro ao deslogar a sessão do usuário.');
                            kickBtn.disabled = false;
                            kickBtn.innerHTML = '<i class="ph ph-sign-out"></i> Deslogar';
                        }
                    } catch (error) {
                        console.error('Kick session error:', error);
                        alert('Erro de conexão ao tentar deslogar o usuário.');
                        kickBtn.disabled = false;
                        kickBtn.innerHTML = '<i class="ph ph-sign-out"></i> Deslogar';
                    }
                }
                return;
            }

            // Ação 2: Forçar Redefinição de Senha
            const resetBtn = e.target.closest('.btn-force-reset');
            if (resetBtn) {
                const email = resetBtn.getAttribute('data-email');
                const name = resetBtn.getAttribute('data-name') || email;

                if (confirm(`Deseja enviar um e-mail de redefinição de senha para ${name} (${email})?`)) {
                    try {
                        resetBtn.disabled = true;
                        resetBtn.innerHTML = '<i class="ph ph-spinner"></i> Enviando...';

                        const response = await fetch('/api/audit/force-reset', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ email })
                        });

                        const data = await response.json();
                        if (response.ok && data.success) {
                            if (data.smtpConfigured) {
                                alert(`E-mail de recuperação enviado com sucesso para ${email}!`);
                            } else {
                                alert(`Solicitação processada com sucesso!\n\nNota: Como o servidor SMTP não está ativo no ambiente, o link de recuperação gerado é:\n\n${data.resetLink || 'Verifique o terminal'}`);
                            }
                        } else {
                            alert(data.error || 'Erro ao processar redefinição de senha.');
                        }
                    } catch (error) {
                        console.error('Force-reset error:', error);
                        alert('Erro de conexão ao solicitar redefinição de senha.');
                    } finally {
                        resetBtn.disabled = false;
                        resetBtn.innerHTML = '<i class="ph ph-key"></i> Redefinir Senha';
                    }
                }
            }
        });
    }

    // Render Tabela LGPD
    function renderLGPDTable() {
        if (!lgpdTbody) return;
        lgpdTbody.innerHTML = '';

        const search = (filterLgpdSearch?.value || '').toLowerCase().trim();
        let filtered = lgpdData;

        if (search) {
            filtered = filtered.filter(row => {
                const user = (row.usuario_nome || '').toLowerCase();
                const papel = (row.usuario_papel || '').toLowerCase();
                const rec = (row.recurso_acessado || '').toLowerCase();
                const op = (row.operacao || '').toLowerCase();
                return user.includes(search) || papel.includes(search) || rec.includes(search) || op.includes(search);
            });
        }

        if (!filtered || filtered.length === 0) {
            lgpdTbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum registro de conformidade LGPD encontrado.</td></tr>';
            return;
        }

        filtered.forEach(row => {
            const tr = document.createElement('tr');
            const campos = Array.isArray(row.campos_visualizados) 
                ? row.campos_visualizados.join(', ') 
                : (row.campos_visualizados || '-');

            tr.innerHTML = `
                <td>#${row.id}</td>
                <td>${formatDateTime(row.data_hora)}</td>
                <td><strong>${escapeHTML(row.usuario_nome || '-')}</strong></td>
                <td><span style="font-size:11px; padding:2px 6px; border-radius:4px; background:rgba(0, 209, 255, 0.15); color:#00D1FF; font-weight:600;">${escapeHTML(row.usuario_papel || 'Colaborador')}</span></td>
                <td><span style="font-size:11px; font-weight:600; color:#cbd5e1;">${escapeHTML(row.operacao || 'LEITURA')}</span></td>
                <td><code>${escapeHTML(row.recurso_acessado || '-')}</code></td>
                <td><small style="color:#94a3b8;">${escapeHTML(campos)}</small></td>
                <td>${escapeHTML(row.ip || '-')}</td>
                <td><span style="font-size:11px; padding:2px 6px; border-radius:4px; background:rgba(255, 255, 255, 0.08);">${escapeHTML(row.organization_id || 'globo')}</span></td>
            `;
            lgpdTbody.appendChild(tr);
        });
    }

    // Render Tabela Eventos de Segurança
    function renderSecurityTable() {
        if (!securityTbody) return;
        securityTbody.innerHTML = '';

        const search = (filterSecuritySearch?.value || '').toLowerCase().trim();
        let filtered = securityData;

        if (search) {
            filtered = filtered.filter(row => {
                const tipo = (row.tipo_evento || '').toLowerCase();
                const user = (row.usuario || '').toLowerCase();
                const ip = (row.ip_origem || '').toLowerCase();
                const mot = (row.motivo || '').toLowerCase();
                return tipo.includes(search) || user.includes(search) || ip.includes(search) || mot.includes(search);
            });
        }

        if (!filtered || filtered.length === 0) {
            securityTbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum evento de segurança registrado.</td></tr>';
            return;
        }

        filtered.forEach(row => {
            const tr = document.createElement('tr');
            const isSuccess = row.resultado === 'SUCESSO';
            const statusBadge = isSuccess 
                ? '<span style="color:#10b981; font-weight:700;">● SUCESSO</span>' 
                : '<span style="color:#ef4444; font-weight:700;">● BLOQUEADO / FALHA</span>';

            tr.innerHTML = `
                <td>#${row.id}</td>
                <td>${formatDateTime(row.data_hora)}</td>
                <td><strong>${escapeHTML(row.tipo_evento)}</strong></td>
                <td>${escapeHTML(row.entidade || '-')}</td>
                <td>${escapeHTML(row.usuario || '-')}</td>
                <td>${escapeHTML(row.ip_origem || '-')}</td>
                <td>${statusBadge}</td>
                <td style="max-width:320px; white-space:normal;"><small style="color:#cbd5e1;">${escapeHTML(row.motivo || '-')}</small></td>
            `;
            securityTbody.appendChild(tr);
        });
    }

    // Render Tabela de Uploads
    function renderUploadsTable() {
        if (!uploadsTbody) return;
        uploadsTbody.innerHTML = '';

        const search = (filterUploadsSearch?.value || '').toLowerCase().trim();
        let filtered = uploadsData;

        if (search) {
            filtered = filtered.filter(row => {
                const arq = (row.nome_arquivo || '').toLowerCase();
                const user = (row.criado_por || '').toLowerCase();
                return arq.includes(search) || user.includes(search);
            });
        }

        if (!filtered || filtered.length === 0) {
            uploadsTbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum lote de importação localizado.</td></tr>';
            return;
        }

        filtered.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${row.id}</td>
                <td><strong>${escapeHTML(row.nome_arquivo)}</strong></td>
                <td>${row.total_linhas || 0}</td>
                <td><span style="color:#10b981; font-weight:700;">${row.linhas_validas || 0}</span></td>
                <td><span style="color:${(row.linhas_invalidas > 0 ? '#ef4444' : '#94a3b8')}; font-weight:700;">${row.linhas_invalidas || 0}</span></td>
                <td>${formatDateTime(row.criado_em)}</td>
                <td>${escapeHTML(row.criado_por || '-')}</td>
                <td><span style="font-size:11px; padding:2px 6px; border-radius:4px; background:rgba(255, 255, 255, 0.08);">${escapeHTML(row.organization_id || 'globo')}</span></td>
            `;
            uploadsTbody.appendChild(tr);
        });
    }

    // Render Tabela de Recuperações de Senha
    function renderRecoverTable(rows) {
        if (!recoverTbody) return;
        recoverTbody.innerHTML = '';

        if (!rows || rows.length === 0) {
            recoverTbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum registro de recuperação encontrado com os filtros atuais.</td></tr>';
            return;
        }

        rows.forEach(row => {
            const tr = document.createElement('tr');

            // Colaborador
            const nomeCompleto = `${row.nome || ''} ${row.sobrenome || ''}`.trim();
            const colaboradorHtml = nomeCompleto 
                ? `<div><strong>${escapeHTML(nomeCompleto)}</strong> <span style="font-size:10.5px; color:#00D1FF; background:rgba(0,209,255,0.12); padding:1px 6px; border-radius:4px; margin-left:4px;">Mat: ${escapeHTML(row.matricula || '-')}</span></div>`
                : `<span style="color:#94a3b8; font-style:italic;">Não localizado na base</span>`;

            // E-mail Enviado
            const emailEnviadoHtml = row.email_enviado 
                ? '<span class="badge-status badge-normal"><i class="ph ph-check-circle"></i> Sim</span>' 
                : '<span class="badge-status badge-long"><i class="ph ph-x-circle"></i> Não</span>';

            // Senha Redefinida?
            const senhaRedefinidaHtml = row.cadastro_concluido 
                ? `<span class="badge-status badge-normal"><i class="ph ph-check-circle"></i> Sim</span> <small style="display:block; color:#94a3b8; font-size:10.5px; margin-top:2px;">${formatDateTime(row.concluido_em)}</small>` 
                : '<span class="badge-status badge-active"><i class="ph ph-clock"></i> Pendente</span>';

            // Conseguiu Logar? (Sucesso efetivo do processo)
            let loginSucessoHtml = '';
            if (row.conseguiu_logar || row.login_pos_recuperacao) {
                loginSucessoHtml = `<span class="badge-status badge-normal" style="background:rgba(16,185,129,0.2); border-color:#10b981; color:#34d399; font-weight:700;"><i class="ph ph-check-circle"></i> Logou com Sucesso</span>`;
            } else if (row.cadastro_concluido) {
                loginSucessoHtml = `<span class="badge-status badge-active" style="background:rgba(245,158,11,0.2); border-color:#f59e0b; color:#fbbf24;"><i class="ph ph-hourglass-medium"></i> Senha Criada (Sem Acesso)</span>`;
            } else {
                loginSucessoHtml = `<span class="badge-status badge-long" style="background:rgba(239,68,68,0.2); border-color:#ef4444; color:#fca5a5;"><i class="ph ph-x-circle"></i> Não Acessou (Pendente)</span>`;
            }

            // Data Login Pós-Troca
            let dataLoginHtml = '';
            if (row.login_pos_recuperacao) {
                dataLoginHtml = `<strong style="color:#00D1FF;">${formatDateTime(row.login_pos_recuperacao)}</strong>`;
            } else if (row.ultimo_login_geral) {
                dataLoginHtml = `<span style="color:#94a3b8; font-size:11px;">Último anterior: ${formatDateTime(row.ultimo_login_geral)}</span>`;
            } else {
                dataLoginHtml = `<span style="color:#64748b; font-size:11px;">Nunca acessou</span>`;
            }

            tr.innerHTML = `
                <td>${colaboradorHtml}</td>
                <td><strong>${escapeHTML(row.email)}</strong></td>
                <td>${formatDateTime(row.solicitado_em)}</td>
                <td>${emailEnviadoHtml}</td>
                <td>${senhaRedefinidaHtml}</td>
                <td>${loginSucessoHtml}</td>
                <td>${dataLoginHtml}</td>
            `;

            recoverTbody.appendChild(tr);
        });
    }

    // Formatadores de Data e Tempo
    function formatDateTime(isoString) {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function formatSessionTime(seconds) {
        if (seconds === null || seconds === undefined || isNaN(seconds)) return '-';
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
        if (errorMessage) {
            errorMessage.textContent = msg;
            errorMessage.style.display = 'block';
        }
    }

    function showAccessDenied(msg) {
        if (errorMessage) {
            errorMessage.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.4); border-radius:8px; padding:14px 18px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <i class="ph ph-shield-warning" style="font-size:26px; color:#ef4444;"></i>
                        <div>
                            <strong style="display:block; font-size:13.5px; color:#ef4444; margin-bottom:3px;">Acesso Restrito ao Painel de Auditoria</strong>
                            <span style="font-size:12.5px; color:#fca5a5;">${escapeHTML(msg)}</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <a href="/dashboard.html" class="btn-nav" style="background:rgba(0,209,255,0.15); border:1px solid #00d1ff; color:#00d1ff; padding:6px 14px; border-radius:6px; text-decoration:none; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
                            <i class="ph ph-map-trifold"></i> Command Center
                        </a>
                        <a href="/index.html" class="btn-nav" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:6px 14px; border-radius:6px; text-decoration:none; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
                            Início
                        </a>
                    </div>
                </div>
            `;
            errorMessage.style.display = 'block';
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // DRILL-DOWN DOS KPIS E MODAL INTERATIVO DE DETALHES
    // ═══════════════════════════════════════════════════════════════════
    const kpiModal = document.getElementById('kpi-modal');
    const kpiModalClose = document.getElementById('kpi-modal-close');
    const kpiModalHeading = document.getElementById('kpi-modal-heading');
    const kpiModalIcon = document.getElementById('kpi-modal-icon');
    const kpiModalBody = document.getElementById('kpi-modal-body');

    function openKPIModal(heading, iconClass, bodyHtml) {
        if (!kpiModal) return;
        if (kpiModalHeading) kpiModalHeading.textContent = heading;
        if (kpiModalIcon) kpiModalIcon.className = iconClass;
        if (kpiModalBody) kpiModalBody.innerHTML = bodyHtml;
        kpiModal.style.display = 'flex';
    }

    function closeKPIModal() {
        if (kpiModal) kpiModal.style.display = 'none';
    }

    if (kpiModalClose) {
        kpiModalClose.addEventListener('click', closeKPIModal);
    }
    if (kpiModal) {
        kpiModal.addEventListener('click', (e) => {
            if (e.target === kpiModal) closeKPIModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && kpiModal && kpiModal.style.display === 'flex') {
            closeKPIModal();
        }
    });

    function switchToAcessosTab() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const btnAcessos = document.querySelector('.tab-btn[data-tab="tab-acessos"]');
        const contentAcessos = document.getElementById('tab-acessos');
        if (btnAcessos) btnAcessos.classList.add('active');
        if (contentAcessos) contentAcessos.classList.add('active');
    }

    function scrollToTable() {
        const tableSec = document.querySelector('.table-section');
        if (tableSec) {
            tableSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
            tableSec.style.boxShadow = '0 0 20px rgba(0, 209, 255, 0.45)';
            setTimeout(() => {
                tableSec.style.boxShadow = '';
            }, 1200);
        }
    }

    // ── Drill-down 1: Usuários Ativos (Agora) ───────────────────
    const cardKpiActive = document.getElementById('card-kpi-active');
    if (cardKpiActive) {
        cardKpiActive.addEventListener('click', () => {
            switchToAcessosTab();
            if (filterStatus) {
                filterStatus.value = (filterStatus.value === 'Ativo') ? '' : 'Ativo';
            }
            renderDashboard();
            scrollToTable();
        });
    }

    // ── Drill-down 2: Logins Hoje ───────────────────────────────
    const cardKpiToday = document.getElementById('card-kpi-today');
    if (cardKpiToday) {
        cardKpiToday.addEventListener('click', () => {
            switchToAcessosTab();
            const todayStr = new Date().toISOString().split('T')[0];
            if (filterDate) {
                filterDate.value = (filterDate.value === todayStr) ? '' : todayStr;
            }
            renderDashboard();
            scrollToTable();
        });
    }

    // ── Drill-down 3: Usuários Únicos (Modal Detalhado) ──────────
    const cardKpiUnique = document.getElementById('card-kpi-unique');
    if (cardKpiUnique) {
        cardKpiUnique.addEventListener('click', () => {
            const uniqueMap = new Map();
            auditData.forEach(row => {
                const key = row.matricula || row.email || 'desconhecido';
                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, {
                        nome: `${row.nome || ''} ${row.sobrenome || ''}`.trim() || 'Colaborador',
                        matricula: row.matricula || '-',
                        email: row.email || '-',
                        totalLogins: 0,
                        primeiroLogin: row.data_hora_login,
                        ultimoLogin: row.data_hora_login,
                        ativoAgora: false
                    });
                }
                const entry = uniqueMap.get(key);
                entry.totalLogins++;
                if (!row.data_hora_logout) entry.ativoAgora = true;
                if (new Date(row.data_hora_login) > new Date(entry.ultimoLogin)) {
                    entry.ultimoLogin = row.data_hora_login;
                }
                if (new Date(row.data_hora_login) < new Date(entry.primeiroLogin)) {
                    entry.primeiroLogin = row.data_hora_login;
                }
            });

            const uniqueList = Array.from(uniqueMap.values()).sort((a, b) => b.totalLogins - a.totalLogins);

            let tableHtml = `
                <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <span style="color: #94a3b8; font-size: 12px;">Total de colaboradores individuais: <strong>${uniqueList.length}</strong></span>
                    <span style="color: #00D1FF; font-size: 11.5px; font-weight: 600;">Classificado por volume histórico de acessos</span>
                </div>
                <div style="overflow-x: auto;">
                    <table class="drilldown-table">
                        <thead>
                            <tr>
                                <th>Colaborador</th>
                                <th>Matrícula</th>
                                <th>E-mail</th>
                                <th>Total Acessos</th>
                                <th>Último Acesso</th>
                                <th>Status Atual</th>
                                <th>Ação</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            uniqueList.forEach(u => {
                const statusTag = u.ativoAgora 
                    ? '<span class="badge-status badge-active" style="padding: 2px 8px; font-size: 11px;"><span class="status-dot status-active"></span> Conectado</span>'
                    : '<span class="badge-status badge-normal" style="padding: 2px 8px; font-size: 11px;">Finalizado</span>';

                tableHtml += `
                    <tr>
                        <td><strong>${escapeHTML(u.nome)}</strong></td>
                        <td><code>${escapeHTML(u.matricula)}</code></td>
                        <td>${escapeHTML(u.email)}</td>
                        <td><span style="background: rgba(0, 209, 255, 0.12); color: #00D1FF; padding: 2px 8px; border-radius: 4px; font-weight: 700;">${u.totalLogins}</span></td>
                        <td>${formatDateTime(u.ultimoLogin)}</td>
                        <td>${statusTag}</td>
                        <td>
                            <button class="btn-filter-user-modal" data-user="${escapeHTML(u.matricula)}" style="background: rgba(0,209,255,0.15); border: 1px solid #00D1FF; color: #00D1FF; padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 600;">
                                Filtrar Histórico
                            </button>
                        </td>
                    </tr>
                `;
            });

            tableHtml += `
                        </tbody>
                    </table>
                </div>
            `;

            openKPIModal('Detalhamento de Colaboradores Únicos Cadastrados', 'ph ph-user-check', tableHtml);

            document.querySelectorAll('.btn-filter-user-modal').forEach(btn => {
                btn.addEventListener('click', () => {
                    const mat = btn.getAttribute('data-user');
                    closeKPIModal();
                    switchToAcessosTab();
                    if (filterUser) filterUser.value = mat;
                    renderDashboard();
                    scrollToTable();
                });
            });
        });
    }

    // ── Drill-down 4: Média de Sessão (Modal) ───────────────────
    const cardKpiAvg = document.getElementById('card-kpi-avg');
    if (cardKpiAvg) {
        cardKpiAvg.addEventListener('click', () => {
            let totalSecs = 0;
            let count = 0;
            let fast = 0;
            let medium = 0;
            let long = 0;

            const sessions = [];

            auditData.forEach(row => {
                let sec = row.tempo_sessao;
                const isActive = !row.data_hora_logout;
                if (isActive && row.data_hora_login) {
                    sec = Math.floor((Date.now() - new Date(row.data_hora_login).getTime()) / 1000);
                }
                if (sec !== null && sec !== undefined && !isNaN(sec)) {
                    totalSecs += sec;
                    count++;
                    if (sec < 900) fast++;
                    else if (sec <= 3600) medium++;
                    else long++;

                    sessions.push({
                        nome: `${row.nome || ''} ${row.sobrenome || ''}`.trim() || 'Colaborador',
                        matricula: row.matricula || '-',
                        login: row.data_hora_login,
                        segundos: sec,
                        ativo: isActive
                    });
                }
            });

            const avgSec = count > 0 ? Math.floor(totalSecs / count) : 0;
            const top5 = sessions.sort((a, b) => b.segundos - a.segundos).slice(0, 5);

            let bodyHtml = `
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px;">
                    <div style="background: rgba(0,209,255,0.08); border: 1px solid rgba(0,209,255,0.3); border-radius: 8px; padding: 12px; text-align: center;">
                        <span style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 2px;">TEMPO MÉDIO GERAL</span>
                        <strong style="font-size: 18px; color: #00D1FF;">${formatSessionTime(avgSec)}</strong>
                    </div>
                    <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px; padding: 12px; text-align: center;">
                        <span style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 2px;">RÁPIDAS (&le; 15 min)</span>
                        <strong style="font-size: 18px; color: #10b981;">${fast}</strong>
                    </div>
                    <div style="background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; padding: 12px; text-align: center;">
                        <span style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 2px;">MÉDIAS (15m a 1h)</span>
                        <strong style="font-size: 18px; color: #f59e0b;">${medium}</strong>
                    </div>
                    <div style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 12px; text-align: center;">
                        <span style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 2px;">LONGAS (&gt; 1h)</span>
                        <strong style="font-size: 18px; color: #ef4444;">${long}</strong>
                    </div>
                </div>

                <h4 style="font-size: 13px; color: #00D1FF; margin-bottom: 8px; text-transform: uppercase;">Top 5 Sessões Mais Prolongadas Registradas</h4>
                <div style="overflow-x: auto;">
                    <table class="drilldown-table">
                        <thead>
                            <tr>
                                <th>Colaborador</th>
                                <th>Matrícula</th>
                                <th>Início do Acesso</th>
                                <th>Tempo Conectado</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            top5.forEach(s => {
                bodyHtml += `
                    <tr>
                        <td><strong>${escapeHTML(s.nome)}</strong></td>
                        <td><code>${escapeHTML(s.matricula)}</code></td>
                        <td>${formatDateTime(s.login)}</td>
                        <td><strong style="color: #fca5a5;">${formatSessionTime(s.segundos)}</strong></td>
                        <td>${s.ativo ? '<span class="badge-status badge-active" style="padding: 2px 6px; font-size: 10px;"><span class="status-dot status-active"></span> Ativo</span>' : '<span class="badge-status badge-normal" style="padding: 2px 6px; font-size: 10px;">Finalizado</span>'}</td>
                    </tr>
                `;
            });

            bodyHtml += `
                        </tbody>
                    </table>
                </div>
            `;

            openKPIModal('Análise de Tempo de Conexão e Permanência', 'ph ph-clock', bodyHtml);
        });
    }

    // ── Drill-down 5: Usuário Mais Ativo ────────────────────────
    const cardKpiTop = document.getElementById('card-kpi-top');
    if (cardKpiTop) {
        cardKpiTop.addEventListener('click', () => {
            const topUserName = (kpiTopUser?.textContent || '').trim();
            if (topUserName && topUserName !== '-') {
                switchToAcessosTab();
                if (filterUser) filterUser.value = topUserName;
                renderDashboard();
                scrollToTable();
            }
        });
    }

    // Anti-Freeze: Ticker ao vivo a cada 10 segundos para atualizar tempos de conexões ativas
    setInterval(() => {
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.getAttribute('data-tab') === 'tab-acessos' && auditData.length > 0) {
            renderDashboard();
        }
    }, 10000);

    // Auto-refresh silencioso a cada 30 segundos para puxar novos logins/logouts
    setInterval(() => {
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.getAttribute('data-tab') === 'tab-acessos') {
            loadAuditData(true);
        }
    }, 30000);

    // Inicialização
    loadAuditData();
});
