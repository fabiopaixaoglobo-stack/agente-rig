const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { getModifiedFiles, scanForSecrets, config, docPath } = require('./update-security-architecture.js');

console.log('🧪 Iniciando testes de arquitetura de segurança...');

try {
    // Test 1: Config exists and has expected fields
    assert.ok(config.document, 'Config deve possuir caminho do documento');
    assert.ok(config.generatedSectionStart, 'Config deve possuir marcador de início');
    assert.ok(config.generatedSectionEnd, 'Config deve possuir marcador de fim');
    console.log('✅ Teste 1: Configuração carregada com sucesso.');

    // Test 2: Document path exists
    assert.ok(fs.existsSync(docPath), 'O arquivo de arquitetura de segurança real deve existir no disco');
    console.log('✅ Teste 2: Arquivo de arquitetura real localizado.');

    // Test 3: Secret scanner detects hardcoded passwords/secrets
    const tempFile = path.join(__dirname, 'temp_test_secret.js');
    fs.writeFileSync(tempFile, "const token = '1234567890abcdef';\nconst valid = process.env.JWT_SECRET;", 'utf8');
    const leaks = scanForSecrets(tempFile);
    fs.unlinkSync(tempFile);
    
    assert.strictEqual(leaks.length, 1, 'Deveria detectar o token de alta entropia hardcoded');
    assert.strictEqual(leaks[0].line, 1, 'Deveria identificar o vazamento na linha 1');
    console.log('✅ Teste 3: Detecção de segredos hardcoded validada.');

    // Test 4: Secret scanner ignores env variables
    const tempEnvFile = path.join(__dirname, 'temp_test_env.js');
    fs.writeFileSync(tempEnvFile, "const token = process.env.TOKEN;", 'utf8');
    const envLeaks = scanForSecrets(tempEnvFile);
    fs.unlinkSync(tempEnvFile);
    assert.strictEqual(envLeaks.length, 0, 'Deveria ignorar variáveis carregadas de process.env');
    console.log('✅ Teste 4: Ignorar process.env validado.');

    console.log('\n🎉 Todos os testes de segurança passaram com sucesso!');
    process.exit(0);
} catch (e) {
    console.error('❌ Falha nos testes de segurança:', e.message);
    process.exit(1);
}
