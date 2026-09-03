const fs = require('fs');
const path = require('path');

console.log('[ROLLBACK] Iniciando restauração da base original de câmeras...');

const targets = [
    {
        src: path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas_original.json'),
        dest: path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas.json')
    },
    {
        src: path.join(__dirname, '..', 'server', 'data', 'cameras_georreferenciadas_original.json'),
        dest: path.join(__dirname, '..', 'server', 'data', 'cameras_georreferenciadas.json')
    }
];

let success = true;
targets.forEach(t => {
    if (fs.existsSync(t.src)) {
        fs.copyFileSync(t.src, t.dest);
        const stats = fs.statSync(t.dest);
        console.log(`[ROLLBACK] Sucesso: Restaurado ${t.dest} (${stats.size} bytes)`);
    } else {
        console.error(`[ROLLBACK] ERRO: Arquivo de backup não encontrado: ${t.src}`);
        success = false;
    }
});

if (success) {
    console.log('✅ Rollback concluído com sucesso em menos de 1 segundo.');
} else {
    process.exit(1);
}
