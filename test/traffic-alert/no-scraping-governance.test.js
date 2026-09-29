/**
 * Agente RIT - Teste de Governança Estrita: Proibição de Scraping HTML
 * Validação dos Requisitos Técnicos Críticos: Teste 38 e Teste 39 (v2.1).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const { CorRioProvider } = require('../../server/traffic-alert/providers/cor-rio-provider');
const { SOURCE_STATUS, STANDARD_MESSAGES } = require('../../server/traffic-alert/constants');

const PROVIDERS_DIR = path.join(__dirname, '..', '..', 'server', 'traffic-alert', 'providers');

describe('🚫 POLÍTICA DE NÃO-SCRAPING E GOVERNANÇA DE FONTES (v2.1)', () => {

    /**
     * TESTE 38: Nenhum provider utiliza scraping HTML como fonte primária
     */
    test('Teste 38: Nenhum provider utiliza scraping HTML como fonte primária', () => {
        const providerFiles = fs.readdirSync(PROVIDERS_DIR).filter(f => f.endsWith('.js'));
        assert.ok(providerFiles.length > 0, 'Deve haver provedores registrados');

        const forbiddenScrapingLibraries = ['cheerio', 'puppeteer', 'playwright', 'jsdom'];
        const violations = [];

        for (const file of providerFiles) {
            const content = fs.readFileSync(path.join(PROVIDERS_DIR, file), 'utf8');

            // 1. Verifica se alguma biblioteca de web scraping foi importada
            for (const lib of forbiddenScrapingLibraries) {
                if (content.includes(`require('${lib}')`) || content.includes(`require("${lib}")`)) {
                    violations.push({ file, type: 'LIBRARY_IMPORT', detail: lib });
                }
            }

            // 2. Verifica se há regexes de parsing de tags de layout HTML para extração de dados
            if (/html\.match\(\s*\/<[a-z]+/i.test(content) || /parseEstagioFromHtml/i.test(content)) {
                violations.push({ file, type: 'HTML_PARSER_REGEX', detail: 'Parsing de tags HTML detectado' });
            }
        }

        assert.strictEqual(
            violations.length,
            0,
            `Provedores violando a política de não-scraping: ${JSON.stringify(violations, null, 2)}`
        );
    });

    /**
     * TESTE 39: Alteração de layout HTML externo não afeta ingestão do sistema
     * Cenário: Servidor externo muda de layout e passa a retornar página HTML ao invés de JSON.
     * Resultado Esperado: SOURCE_STATUS = UNSUPPORTED, nota de consulta manual e sistema NÃO falha.
     */
    test('Teste 39: Alteração de layout HTML externo não afeta ingestão do sistema (SOURCE_STATUS = UNSUPPORTED)', async () => {
        // Criação de servidor HTTP local temporário que simula portal retornando HTML por redesign
        const mockServer = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head><title>Novo Portal COR.RIO 2026</title></head>
                <body class="redesign-v4">
                    <div id="novo-painel-dinamico">
                        <span class="badge-stage">Cidade entrou em Estágio 4</span>
                    </div>
                </body>
                </html>
            `);
        });

        await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
        const port = mockServer.address().port;
        const mockHtmlUrl = `http://127.0.0.1:${port}/estagio`;

        try {
            const provider = new CorRioProvider({
                estagioApiUrl: mockHtmlUrl,
                calorApiUrl: mockHtmlUrl,
                timeoutMs: 1500
            });

            // 1. fetchData() não tenta fazer scraping do HTML retornado
            const result = await provider.fetchData();

            assert.strictEqual(
                result.sourceStatus, 
                SOURCE_STATUS.UNSUPPORTED,
                'Status da fonte deve ser UNSUPPORTED quando a API responder em HTML'
            );
            assert.strictEqual(
                result.note, 
                STANDARD_MESSAGES.MANUAL_CONSULTATION_ONLY,
                'Mensagem deve indicar estritamente consulta manual'
            );
            assert.strictEqual(result.estagioNum, null);

            // 2. Normalização trata o status UNSUPPORTED com segurança e sem falha
            const normalized = provider.normalize(result);
            assert.strictEqual(normalized.status, 'UNSUPPORTED');
            assert.strictEqual(normalized.sourceStatus, SOURCE_STATUS.UNSUPPORTED);
            assert.strictEqual(normalized.message, STANDARD_MESSAGES.MANUAL_CONSULTATION_ONLY);

        } finally {
            await new Promise(resolve => mockServer.close(resolve));
        }
    });
});
