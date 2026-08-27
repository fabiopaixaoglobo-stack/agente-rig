const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load config
const configPath = path.join(__dirname, '..', 'security-architecture.config.json');
let config = {
    document: "segurança/arquitetura_seguranca_rit.md",
    generatedSectionStart: "<!-- SECURITY-AUTO:START -->",
    generatedSectionEnd: "<!-- SECURITY-AUTO:END -->",
    criticalPatterns: [],
    forbiddenPatterns: []
};

if (fs.existsSync(configPath)) {
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        console.error('Erro ao ler config:', e.message);
    }
}

const docPath = path.join(__dirname, '..', config.document);

function getModifiedFiles() {
    try {
        // Get modified files in git
        const output = execSync('git status --porcelain', { encoding: 'utf8' });
        return output.split('\n')
            .map(line => line.slice(3).trim())
            .filter(file => file.length > 0);
    } catch (e) {
        // Fallback to checking mtimes of critical files vs document mtime
        const docMtime = fs.existsSync(docPath) ? fs.statSync(docPath).mtimeMs : 0;
        const modified = [];
        for (const pattern of config.criticalPatterns) {
            const pPath = path.join(__dirname, '..', pattern);
            if (fs.existsSync(pPath)) {
                if (fs.statSync(pPath).mtimeMs > docMtime) {
                    modified.push(pattern);
                }
            }
        }
        return modified;
    }
}

function scanForSecrets(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const leaks = [];
    
    // Check for high-entropy strings or password assigns
    const passwordRegex = /(password|passwd|secret|jwt_secret|private_key|api_key|token|senha|credential|credentials)\s*[:=]\s*['"`][a-zA-Z0-9_\-\.\=\+]{10,}['"`]/i;
    
    lines.forEach((line, idx) => {
        if (passwordRegex.test(line) && !line.includes('process.env')) {
            leaks.push({ line: idx + 1, file: path.basename(filePath) });
        }
    });
    
    return leaks;
}

function run() {
    const isCheck = process.argv.includes('--check');
    console.log(`[SECURITY-AUTO] Modo: ${isCheck ? 'CHECK' : 'UPDATE'}`);
    
    if (!fs.existsSync(docPath)) {
        console.error(`[ERROR] Documento não encontrado em: ${docPath}`);
        process.exit(1);
    }
    
    const modified = getModifiedFiles();
    const criticalModified = modified.filter(file => {
        return config.criticalPatterns.some(pattern => file.includes(pattern));
    });
    
    // Scan critical modified files for secrets
    let secretsFound = [];
    for (const file of criticalModified) {
        const filePath = path.join(__dirname, '..', file);
        const fileLeaks = scanForSecrets(filePath);
        if (fileLeaks.length > 0) {
            secretsFound = secretsFound.concat(fileLeaks);
        }
    }
    
    // Generate automated section markdown
    let autoSectionContent = `\n### 🚨 Controles Críticos Modificados Recentemente (Análise Automática)\n\n`;
    if (criticalModified.length === 0) {
        autoSectionContent += `✅ Nenhum arquivo de segurança crítico modificado desde a última revisão.\n`;
    } else {
        autoSectionContent += `Os seguintes arquivos críticos foram modificados e requerem revisão de segurança/privacidade:\n\n`;
        criticalModified.forEach(file => {
            autoSectionContent += `* ⚠️ **[PENDENTE DE VALIDAÇÃO]** [${path.basename(file)}](file:///${path.resolve(file).replace(/\\/g, '/')}) - Última modificação detectada recentemente.\n`;
        });
        autoSectionContent += `\n> [!WARNING]\n> Modificações em arquivos críticos de autenticação, banco de dados ou geolocalização devem passar por auditoria AppSec manual antes de serem marcadas como homologadas.\n`;
    }
    
    autoSectionContent += `\n### 🛡️ Status de Varredura de Segredos\n\n`;
    if (secretsFound.length > 0) {
        autoSectionContent += `❌ **ALERTA**: Foram encontrados possíveis segredos ou credenciais expostas no código!\n`;
        secretsFound.forEach(leak => {
            autoSectionContent += `* **[VULNERABILIDADE]** Linha ${leak.line} em ${leak.file} contém texto parecendo credencial hardcoded.\n`;
        });
    } else {
        autoSectionContent += `✅ Nenhum segredo ou credencial exposta foi detectada nos arquivos analisados.\n`;
    }
    
    autoSectionContent += `\n_Gerado automaticamente em: ${new Date().toISOString()}_\n`;
    
    const docContent = fs.readFileSync(docPath, 'utf8');
    const startIdx = docContent.indexOf(config.generatedSectionStart);
    const endIdx = docContent.indexOf(config.generatedSectionEnd);
    
    if (startIdx === -1 || endIdx === -1) {
        console.error('[ERROR] Marcadores de seção automática não encontrados no documento.');
        process.exit(1);
    }
    
    const newDocContent = docContent.slice(0, startIdx + config.generatedSectionStart.length) +
        autoSectionContent +
        docContent.slice(endIdx);
        
    // Generate JSON report
    const report = {
        timestamp: new Date().toISOString(),
        criticalModified,
        secretsFound: secretsFound.map(s => ({ file: s.file, line: s.line })),
        status: secretsFound.length > 0 ? "VULNERABLE" : (criticalModified.length > 0 ? "NEEDS_REVIEW" : "SECURE")
    };
    
    fs.writeFileSync(
        path.join(__dirname, '..', 'security-architecture-report.json'),
        JSON.stringify(report, null, 2),
        'utf8'
    );
    
    if (isCheck) {
        if (newDocContent !== docContent) {
            console.error('[CHECK FAIL] O documento de arquitetura de segurança está desatualizado.');
            process.exit(1);
        }
        if (secretsFound.length > 0) {
            console.error('[CHECK FAIL] Segredos detectados no repositório!');
            process.exit(1);
        }
        console.log('[CHECK SUCCESS] Documento atualizado e nenhum segredo encontrado.');
        process.exit(0);
    } else {
        // Backup
        const backupPath = docPath + '.bak';
        fs.writeFileSync(backupPath, docContent, 'utf8');
        console.log(`[BACKUP] Criado backup em: ${backupPath}`);
        
        fs.writeFileSync(docPath, newDocContent, 'utf8');
        console.log('[UPDATE SUCCESS] Documento de arquitetura de segurança atualizado com sucesso.');
        
        if (secretsFound.length > 0) {
            console.warn('[WARNING] Segredos foram encontrados durante a atualização! Corrija antes de commit.');
            process.exit(1);
        }
    }
}

if (require.main === module) {
    run();
}

module.exports = { getModifiedFiles, scanForSecrets, run, config, docPath };
