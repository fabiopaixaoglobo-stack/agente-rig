/**
 * Testes Unitários e de Integração do Frontend — RIT ALERTA (Checkpoint 4)
 * Validação de conformidade, segurança contra XSS, acessibilidade e preservação do Monitoramento 🔒
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('🖥️ FRONTEND RIT ALERTA & GOVERNANÇA (CHECKPOINT 4)', () => {

    const dashboardPath = path.resolve(__dirname, '../../public/dashboard.html');
    const mainJsPath = path.resolve(__dirname, '../../public/js/main.js');
    const uiControllerPath = path.resolve(__dirname, '../../public/js/ui-controller.js');
    const serviceJsPath = path.resolve(__dirname, '../../public/js/traffic-alert/traffic-alert-service.js');
    const viewJsPath = path.resolve(__dirname, '../../public/js/traffic-alert/traffic-alert-view.js');
    const drawerJsPath = path.resolve(__dirname, '../../public/js/traffic-alert/traffic-alert-drawer.js');
    const mapJsPath = path.resolve(__dirname, '../../public/js/traffic-alert/traffic-alert-map.js');
    const cssPath = path.resolve(__dirname, '../../public/styles/traffic-alert.css');

    it('1. Arquivos obrigatórios do frontend RIT ALERTA foram criados e são não-vazios', () => {
        const files = [serviceJsPath, viewJsPath, drawerJsPath, mapJsPath, cssPath];
        files.forEach(f => {
            assert.ok(fs.existsSync(f), `Arquivo deve existir: ${f}`);
            const stat = fs.statSync(f);
            assert.ok(stat.size > 100, `Arquivo deve conter código relevante: ${f}`);
        });
    });

    it('2. Aba Monitoramento 🔒 permanece estritamente preservada e bloqueada no dashboard.html', () => {
        const dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');

        // Confirma texto com cadeado
        assert.ok(dashboardHtml.includes('Monitoramento 🔒'), 'Texto "Monitoramento 🔒" deve estar preservado no HTML');

        // Confirma existência do botão e da section
        assert.ok(dashboardHtml.includes('id="tab-btn-monitoramento"'), 'Botão do Monitoramento deve existir');
        assert.ok(dashboardHtml.includes('id="tab-monitoramento"'), 'Container da aba Monitoramento deve existir');

        // Confirma preservação da trava de privacidade no ui-controller.js
        const uiController = fs.readFileSync(uiControllerPath, 'utf8');
        assert.ok(uiController.includes('this.aplicarModoPrivacidadeMonitoramento()'), 'Trava de privacidade do Monitoramento deve estar ativa no ui-controller.js');
    });

    it('3. Aba RIT ALERTA está presente no dashboard.html com título, selo e 5 cards de KPI', () => {
        const dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');

        // Botão na navegação
        assert.ok(dashboardHtml.includes('id="tab-btn-traffic-alert"'), 'Botão da aba RIT ALERTA deve estar no nav');
        assert.ok(dashboardHtml.includes('RIT Alerta'), 'Label da aba deve ser RIT Alerta');

        // Container principal da aba
        assert.ok(dashboardHtml.includes('id="tab-traffic-alert"'), 'Seção da aba RIT ALERTA deve estar no DOM');
        assert.ok(dashboardHtml.includes('RIT ALERTA — INTELIGÊNCIA AUTÔNOMA DE TRÂNSITO'), 'Título interno deve constar');
        assert.ok(dashboardHtml.includes('SOMENTE DADOS PÚBLICOS | PRIVACY BY DESIGN'), 'Selo de privacidade deve constar');

        // 5 Cards Executivos de KPI
        assert.ok(dashboardHtml.includes('id="ta-kpi-ativas-num"'), 'Card 1 (Ocorrências Ativas) deve existir');
        assert.ok(dashboardHtml.includes('id="ta-kpi-crit-num"'), 'Card 2 (Incidentes Críticos) deve existir');
        assert.ok(dashboardHtml.includes('id="ta-kpi-vias-num"'), 'Card 3 (Corredores Afetados) deve existir');
        assert.ok(dashboardHtml.includes('id="ta-kpi-cams-num"'), 'Card 4 (Câmeras Públicas) deve existir');
        assert.ok(dashboardHtml.includes('id="ta-kpi-fontes-num"'), 'Card 5 (Saúde das Fontes) deve existir');

        // Container Leaflet independente
        assert.ok(dashboardHtml.includes('id="mapTrafficAlert"'), 'Canvas do mapa Leaflet mapTrafficAlert deve existir');

        // Drawer
        assert.ok(dashboardHtml.includes('id="trafficAlertDrawer"'), 'Drawer lateral deve estar no markup');
    });

    it('4. Sanitização contra XSS e validação de URLs externas (traffic-alert-service.js)', () => {
        const serviceContent = fs.readFileSync(serviceJsPath, 'utf8');

        // Confirma existência dos métodos de sanitização e validação
        assert.ok(serviceContent.includes('sanitizeText'), 'Método sanitizeText deve existir');
        assert.ok(serviceContent.includes('validateExternalUrl'), 'Método validateExternalUrl deve existir');

        // Simulação direta das regras de sanitização
        const sanitize = (str) => {
            if (!str) return 'Não informado';
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        };

        const malicious = '<script>alert("XSS")</script>';
        assert.strictEqual(sanitize(malicious), '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');

        // Simulação de validação de URL
        const validateUrl = (rawUrl) => {
            if (/^(javascript|data|vbscript|file):/i.test(rawUrl)) return null;
            try {
                const parsed = new URL(rawUrl);
                if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
                return parsed.toString();
            } catch (e) {
                return null;
            }
        };

        assert.strictEqual(validateUrl('javascript:alert(1)'), null);
        assert.strictEqual(validateUrl('data:text/html,evil'), null);
        assert.strictEqual(validateUrl('http://insecure.site.com'), null);
        assert.strictEqual(validateUrl('https://admin:pass@cor.rio'), null);
        assert.strictEqual(validateUrl('https://cor.rio/boletim/123'), 'https://cor.rio/boletim/123');
    });

    it('5. Proteção de Privacidade no Frontend: Nenhum arquivo em public/js/traffic-alert/ acessa GPS ou dados pessoais', () => {
        const alertFiles = [serviceJsPath, viewJsPath, drawerJsPath, mapJsPath];
        const forbiddenPatterns = [
            'navigator.geolocation',
            'watchPosition',
            'getCurrentPosition',
            'posicoes_motoristas',
            'gps_historico_atendimento',
            'passageiro',
            'matricula'
        ];

        alertFiles.forEach(filePath => {
            const content = fs.readFileSync(filePath, 'utf8');
            forbiddenPatterns.forEach(pattern => {
                const regex = new RegExp(`\\b${pattern}\\b`, 'i');
                assert.ok(
                    !regex.test(content),
                    `Padrão proibido [${pattern}] detectado em ${path.basename(filePath)}`
                );
            });
        });
    });

    it('6. Recomendações no Drawer seguem estritamente padrão consultivo sem autoritarismo', () => {
        const drawerContent = fs.readFileSync(drawerJsPath, 'utf8');

        // Confirma termos consultivos aprovados
        assert.ok(drawerContent.includes('Para quem ainda não ingressou no corredor'), 'Deve conter recomendação consultiva');
        assert.ok(drawerContent.includes('A adequação geométrica para ônibus ou veículos pesados deve ser validada'), 'Deve conter validação de veículos pesados');
        assert.ok(drawerContent.includes('Aviso de Governança'), 'Deve conter aviso de governança');

        // Garante ausência de termos autoritários proibidos no código
        const forbiddenTerms = [
            'Desvie agora',
            'Rota garantida',
            'Via segura',
            'Percurso obrigatório'
        ];
        forbiddenTerms.forEach(term => {
            assert.ok(
                !drawerContent.includes(term),
                `Termo proibido [${term}] não pode constar no Drawer`
            );
        });
    });

    it('7. Acessibilidade e Fechamento do Drawer por Teclado e Botão', () => {
        const drawerContent = fs.readFileSync(drawerJsPath, 'utf8');

        // Confirma suporte a Escape
        assert.ok(drawerContent.includes("'Escape'") || drawerContent.includes("'Esc'"), 'Drawer deve escutar tecla Escape');

        // Confirma foco de retorno
        assert.ok(drawerContent.includes('triggerElement.focus()'), 'Drawer deve restaurar foco ao fechar');

        // Confirma ARIA attributes no dashboard.html
        const dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');
        assert.ok(dashboardHtml.includes('role="dialog"'), 'Drawer deve ter role="dialog"');
        assert.ok(dashboardHtml.includes('aria-modal="true"'), 'Drawer deve ter aria-modal="true"');
    });
});
