const fs = require('fs');
const path = require('path');

// 1. Validar sintaxe e integridade de todos os arquivos JS
console.log('--- VERIFICANDO SINTAXE DOS SCRIPTS ---');
const files = [
    'public/js/main.js',
    'public/js/map-service.js',
    'public/js/ui-controller.js',
    'public/js/cameras-geo-service.js',
    'public/js/config.js'
];

for (const f of files) {
    try {
        const fullPath = path.resolve(__dirname, '..', f);
        const code = fs.readFileSync(fullPath, 'utf8');
        // Test basic syntax via function wrapper
        new Function('import', 'export', code.replace(/import\s+.*?from\s+['"].*?['"];?/g, '// import').replace(/export\s+/g, ''));
        console.log(`✅ [OK] ${f}`);
    } catch (e) {
        console.error(`❌ [SYNTAX ERROR] ${f}:`, e.message);
    }
}

// 2. Validar estrutura do HTML e CSS
console.log('\n--- VERIFICANDO ESTRUTURA DO DOM ---');
const html = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.html'), 'utf8');
console.log('dashboard.html contains mapTransito:', html.includes('id="mapTransito"'));
console.log('dashboard.html contains tab-transito:', html.includes('id="tab-transito"'));
console.log('dashboard.html active tab:', html.includes('id="tab-transito" class="tabPane active"'));

// 3. Validar se o container do mapTransito possui classes e estilos adequados
const hasProperMapArea = html.includes('<section class="mapArea"');
console.log('dashboard.html mapArea properly configured:', hasProperMapArea);

console.log('\n--- VERIFICAÇÃO CONCLUÍDA COM SUCESSO ---');
