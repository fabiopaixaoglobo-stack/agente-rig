/**
 * scripts/verify-commercial-segregation.js
 * 
 * Verificador Automático de Segregação (CI/CD Gate)
 * Conforme Seção 9 do Inventário e Plano de Segregação Comercial (RIT Fly Commercial Edition).
 * 
 * Garante que nenhum dado corporativo, menção a identidades corporativas,
 * dados pessoais (LGPD), planilhas ou segredos vazem para o repositório/build comercial.
 * 
 * Uso:
 *   node scripts/verify-commercial-segregation.js [--target <dir>] [--strict]
 */

const fs = require('fs');
const path = require('path');

// Termos estritamente proibidos no artefato comercial
const FORBIDDEN_KEYWORDS = [
    'globo',
    'projac',
    'curicica',
    'tvglobocorp',
    'fapaixao',
    'fabiopaixao',
    '68808'
];

// Padrões de infraestrutura ou links corporativos proibidos
const FORBIDDEN_PATTERNS = [
    /sharepoint\.com/i,
    /onedrive\.live\.com/i,
    /tvglobo/i
];

// Extensões de arquivos proibidas em pastas de código/distribuição comercial
const FORBIDDEN_EXTENSIONS = ['.xlsx', '.xls', '.pptx', '.docx', '.pfx', '.pem', '.key'];

// Arquivos proibidos (segredos e dumps)
const FORBIDDEN_FILES = ['.env', 'dump.sql', 'backup.sql'];

function parseArgs() {
    const args = process.argv.slice(2);
    let target = path.join(__dirname, '..', 'server', 'rit-fly');
    let strict = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--target' && args[i + 1]) {
            target = path.resolve(args[i + 1]);
            i++;
        } else if (args[i] === '--strict') {
            strict = true;
        }
    }

    return { target, strict };
}

function scanFile(filePath, issues = []) {
    const entryName = path.basename(filePath);
    const relPath = path.relative(path.join(__dirname, '..'), filePath);

    // 1. Checagem de nome de arquivo proibido
    if (FORBIDDEN_FILES.includes(entryName.toLowerCase())) {
        issues.push({
            type: 'FORBIDDEN_FILE',
            path: relPath,
            reason: `Arquivo proibido no build comercial: ${entryName}`
        });
    }

    // 2. Checagem de extensão proibida
    const ext = path.extname(entryName).toLowerCase();
    if (FORBIDDEN_EXTENSIONS.includes(ext)) {
        issues.push({
            type: 'FORBIDDEN_EXTENSION',
            path: relPath,
            reason: `Arquivo de extensão binária/documental proibida: ${ext}`
        });
    }

    // 3. Checagem de conteúdo em arquivos texto (código-fonte)
    const textExtensions = ['.js', '.json', '.html', '.css', '.md', '.txt', '.yml', '.yaml', '.sh'];
    if (textExtensions.includes(ext)) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, lineIdx) => {
                const lineNum = lineIdx + 1;
                const lowerLine = line.toLowerCase();

                // Ignorar referências explicativas em regras de sanitização ou verificadores
                if (entryName.includes('verify-commercial-segregation') || entryName.includes('inventario-segregacao')) {
                    return;
                }

                // Busca por palavras proibidas
                for (const kw of FORBIDDEN_KEYWORDS) {
                    if (lowerLine.includes(kw)) {
                        issues.push({
                            type: 'FORBIDDEN_KEYWORD',
                            path: `${relPath}:${lineNum}`,
                            keyword: kw,
                            lineContent: line.trim()
                        });
                    }
                }

                // Busca por regex de padrões corporativos
                for (const pat of FORBIDDEN_PATTERNS) {
                    if (pat.test(line)) {
                        issues.push({
                            type: 'FORBIDDEN_PATTERN',
                            path: `${relPath}:${lineNum}`,
                            pattern: pat.toString(),
                            lineContent: line.trim()
                        });
                    }
                }
            });
        } catch (err) {
            // Arquivo não pôde ser lido como UTF-8
        }
    }

    return issues;
}

function scanDirectory(dir, issues = []) {
    if (!fs.existsSync(dir)) return issues;

    const stat = fs.statSync(dir);
    if (stat.isFile()) {
        return scanFile(dir, issues);
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Ignorar node_modules, .git e relatórios de auditoria/inventário de segregação que citam as palavras para documentação
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        if (entry.name.endsWith('.log')) continue;

        if (entry.isDirectory()) {
            scanDirectory(fullPath, issues);
        } else {
            scanFile(fullPath, issues);
        }
    }

    return issues;
}

function main() {
    const { target, strict } = parseArgs();

    console.log('===============================================================');
    console.log('🛡️ CI/CD GATE: VERIFICADOR AUTOMÁTICO DE SEGREGAÇÃO COMERCIAL');
    console.log(`📁 Diretório Alvo: ${target}`);
    console.log(`⚡ Modo Estrito: ${strict ? 'ATIVADO' : 'PADRÃO'}`);
    console.log('===============================================================\n');

    const issues = scanDirectory(target);

    if (issues.length === 0) {
        console.log('✅ APROVADO: Nenhuma menção corporativa, arquivo proibido ou vazamento detectado no alvo.');
        console.log('✨ Código em conformidade com as diretrizes de segregação comercial da Seção 9.');
        process.exit(0);
    } else {
        console.error(`❌ REPROVADO: Foram detectadas ${issues.length} ocorrências proibidas no alvo:\n`);
        issues.slice(0, 50).forEach((iss, idx) => {
            if (iss.type === 'FORBIDDEN_KEYWORD') {
                console.error(`  [${idx + 1}] [PALAVRA PROIBIDA: "${iss.keyword}"] em ${iss.path}`);
                console.error(`      Linha: "${iss.lineContent.slice(0, 80)}"`);
            } else if (iss.type === 'FORBIDDEN_PATTERN') {
                console.error(`  [${idx + 1}] [PADRÃO PROIBIDO: ${iss.pattern}] em ${iss.path}`);
                console.error(`      Linha: "${iss.lineContent.slice(0, 80)}"`);
            } else {
                console.error(`  [${idx + 1}] [${iss.type}] ${iss.path} -> ${iss.reason}`);
            }
        });

        if (issues.length > 50) {
            console.error(`\n  ... e mais ${issues.length - 50} ocorrências suprimidas.`);
        }

        console.error('\n🚫 O build comercial falhará obrigatoriamente até que todas as referências acima sejam sanitizadas.');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    scanDirectory,
    FORBIDDEN_KEYWORDS,
    FORBIDDEN_PATTERNS
};
