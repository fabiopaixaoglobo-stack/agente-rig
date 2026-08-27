const https = require('https');

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function testImg(url) {
    return new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            console.log('Image status:', res.statusCode, 'Content-Type:', res.headers['content-type'], 'Length:', res.headers['content-length']);
            let len = 0;
            res.on('data', d => len += d.length);
            res.on('end', () => {
                console.log('Downloaded bytes:', len);
                resolve(res.statusCode);
            });
        }).on('error', e => {
            console.error('Img error:', e.message);
            resolve(500);
        });
    });
}

async function run() {
    const urls = [
        'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-esplanada',
        'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-parque-da-cidade',
        'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-mane-garrincha'
    ];

    for (const u of urls) {
        console.log('\nTesting', u);
        const html = await fetch(u);
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (match) {
            const data = JSON.parse(match[1]);
            const pageData = data.props?.pageProps?.page?.data;
            console.log('Title:', pageData?.destitulo);
            console.log('desarquivo URL:', pageData?.desarquivo);
            if (pageData?.desarquivo) {
                await testImg(pageData.desarquivo);
            }
        }
    }
}

run();
