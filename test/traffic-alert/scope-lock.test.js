/**
 * Agente RIT - Teste Automatizado de Trava Estática de Escopo e Dependências Proibidas
 * Valida a fronteira arquitetural de server/traffic-alert/ conforme Ressalva 4 e 11 (v2.1).
 * Não gera falsos positivos em comentários, mensagens de conformidade ou documentação.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TRAFFIC_ALERT_DIR = path.join(__dirname, '..', '..', 'server', 'traffic-alert');

// Módulos proibidos em imports/requires
const FORBIDDEN_MODULE_KEYWORDS = [
    'monitoramento',
    'motorista',
    'passageiro',
    'viagem',
    'atendimento',
    'position',
    'gps'
];

// Tabelas proibidas no banco de dados
const FORBIDDEN_SQL_TABLES = [
    'posicoes_motoristas',
    'gps_historico_atendimento',
    'rotas_importadas'
];

// Chamadas de funções de rastreamento/geolocalização proibidas
const FORBIDDEN_GPS_CALLS = [
    'navigator.geolocation',
    'watchPosition',
    'getCurrentPosition'
];

/**
 * Remove comentários de bloco e linha única para analisar apenas código executável e strings de código.
 */
function stripComments(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '') // remove /* ... */
        .replace(/\/\/.*/g, '');           // remove // ...
}

/**
 * Coleta recursiva de todos os arquivos JS na pasta de destino
 */
function getJsFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getJsFiles(fullPath));
        } else if (file.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

describe('🔒 TRAVA ESTÁTICA DE ESCOPO - RIT ALERTA (v2.1)', () => {

    const files = getJsFiles(TRAFFIC_ALERT_DIR);

    test('Diretório server/traffic-alert/ deve existir e possuir arquivos canônicos', () => {
        assert.ok(files.length > 0, 'A pasta server/traffic-alert deve conter arquivos para análise');
    });

    test('Nenhum arquivo em server/traffic-alert/ deve importar módulos operacionais ou de rastreamento', () => {
        const violations = [];

        for (const file of files) {
            const rawContent = fs.readFileSync(file, 'utf8');
            const cleanCode = stripComments(rawContent);

            // Regex para capturar require('...') e import ... from '...'
            const importRegex = /(?:require\s*\(\s*['"]|import\s+.*?from\s+['"]|import\s*\(\s*['"])([^'"]+)/g;
            let match;

            while ((match = importRegex.exec(cleanCode)) !== null) {
                const importedPath = match[1].toLowerCase();
                for (const keyword of FORBIDDEN_MODULE_KEYWORDS) {
                    if (importedPath.includes(keyword)) {
                        violations.push({
                            file: path.relative(TRAFFIC_ALERT_DIR, file),
                            keyword,
                            statement: match[0]
                        });
                    }
                }
            }
        }

        assert.strictEqual(
            violations.length, 
            0, 
            `Violações de imports proibidos detectadas: ${JSON.stringify(violations, null, 2)}`
        );
    });

    test('Nenhum arquivo em server/traffic-alert/ deve referenciar tabelas proibidas de motoristas/atendimentos', () => {
        const violations = [];

        for (const file of files) {
            const rawContent = fs.readFileSync(file, 'utf8');
            const cleanCode = stripComments(rawContent);

            for (const table of FORBIDDEN_SQL_TABLES) {
                // Detecta o nome exato da tabela no código limpo
                const tableRegex = new RegExp(`\\b${table}\\b`, 'i');
                if (tableRegex.test(cleanCode)) {
                    violations.push({
                        file: path.relative(TRAFFIC_ALERT_DIR, file),
                        table
                    });
                }
            }
        }

        assert.strictEqual(
            violations.length, 
            0, 
            `Violações de acesso a tabelas proibidas detectadas: ${JSON.stringify(violations, null, 2)}`
        );
    });

    test('Nenhum arquivo em server/traffic-alert/ deve invocar APIs de geolocalização por hardware (GPS)', () => {
        const violations = [];

        for (const file of files) {
            const rawContent = fs.readFileSync(file, 'utf8');
            const cleanCode = stripComments(rawContent);

            for (const gpsCall of FORBIDDEN_GPS_CALLS) {
                if (cleanCode.includes(gpsCall)) {
                    violations.push({
                        file: path.relative(TRAFFIC_ALERT_DIR, file),
                        gpsCall
                    });
                }
            }
        }

        assert.strictEqual(
            violations.length, 
            0, 
            `Violações de chamadas diretas de GPS detectadas: ${JSON.stringify(violations, null, 2)}`
        );
    });

    test('Verificação de não-falso-positivo: Comentários e textos de conformidade são permitidos', () => {
        // Testa um trecho simulado que conteria a palavra em comentário
        const testCode = `
            // Este módulo não utiliza dados de motorista nem de passageiro.
            /* Monitoramento bloqueado */
            const x = 10;
        `;
        const stripped = stripComments(testCode);
        assert.ok(!stripped.includes('motorista'), 'Comentários devem ser removidos sem acusar violação');
        assert.ok(!stripped.includes('passageiro'), 'Comentários devem ser removidos sem acusar violação');
    });
});
