const https = require('https');

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 8000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function run() {
    const html = await fetch('https://player.camerasrj.com.br/camera/1010/');
    const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
    scripts.forEach((s, idx) => {
        console.log(`\n=================== SCRIPT ${idx} ===================`);
        console.log(s);
    });
}
run();
