const https = require('https');
const http = require('http');
const { URL } = require('url');

const testUrls = [
    'https://josebritz.github.io/camerasrio/',
    'https://www02.smt.ufrj.br/~tvdigital/zet/page_03.html',
    'https://www.camerasrj.com.br/camera/1010/',
    'https://www.camerasrj.com.br/camera/1014/',
    'https://www.camerasrj.com.br/',
    'https://cetrio.prefeitura.rio/'
];

async function checkUrl(urlStr) {
    return new Promise((resolve) => {
        try {
            const parsed = new URL(urlStr);
            const lib = parsed.protocol === 'https:' ? https : http;
            const req = lib.request(urlStr, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 8000 }, (res) => {
                resolve({
                    url: urlStr,
                    statusCode: res.statusCode,
                    xFrameOptions: res.headers['x-frame-options'] || 'NONE',
                    csp: res.headers['content-security-policy'] || 'NONE',
                    contentType: res.headers['content-type']
                });
            });
            req.on('error', (e) => resolve({ url: urlStr, error: e.message }));
            req.on('timeout', () => { req.destroy(); resolve({ url: urlStr, error: 'TIMEOUT' }); });
            req.end();
        } catch (e) {
            resolve({ url: urlStr, error: e.message });
        }
    });
}

async function run() {
    console.log("TESTANDO HEADERS E SUPORTE A IFRAME DAS FONTES DO RIO:");
    for (const u of testUrls) {
        const res = await checkUrl(u);
        console.log(JSON.stringify(res, null, 2));
    }
}

run();
