document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const btnLogin = document.querySelector('.btn-login');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const identificador = document.getElementById('identificador').value.trim();
        const senha = document.getElementById('senha').value;
        
        if (!identificador || !senha) {
            showError('Por favor, preencha todos os campos.');
            return;
        }

        try {
            btnLogin.textContent = 'Entrando...';
            btnLogin.disabled = true;
            errorMessage.style.display = 'none';

            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ identificador, senha })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Store JWT and Audit ID
                localStorage.setItem('rig_token', data.token);
                if (data.auditId) {
                    localStorage.setItem('rig_audit_id', data.auditId);
                }
                localStorage.setItem('rig_user', JSON.stringify(data.usuario));
                
                // Redirect to main page
                window.location.href = '/index.html';
            } else {
                showError(data.error || 'Erro ao realizar login. Verifique suas credenciais.');
            }
        } catch (error) {
            showError('Erro de conexão com o servidor. Tente novamente mais tarde.');
            console.error('Login error:', error);
        } finally {
            btnLogin.textContent = 'Entrar';
            btnLogin.disabled = false;
        }
    });

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
    }
});
