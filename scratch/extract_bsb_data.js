const https = require('https');

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function run() {
    const urls = {
        esplanada: 'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-esplanada',
        parque: 'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-parque-da-cidade',
        mane: 'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-mane-garrincha'
    };

    for (const [key, url] of Object.entries(urls)) {
        const html = await fetch(url);
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (match) {
            const data = JSON.parse(match[1]);
            const pageData = data.props?.pageProps?.page?.data;
            console.log(`\n=== ${key.toUpperCase()} ===`);
            console.log('ID Camera:', pageData?.idcamera);
            console.log('Codigo:', pageData?.descodigo);
            console.log('Titulo:', pageData?.destitulo);
            console.log('Descricao:', pageData?.desdescricao);
            console.log('Streaming Embed:', pageData?.desurlextreaming);
            console.log('Snapshot / Images:', pageData?.desurl, pageData?.idarquivo);
            // Search all keys in pageData
            console.log('All PageData Keys:', Object.keys(pageData || {}));
            console.log('PageData:', JSON.stringify(pageData, null, 2));
        }
    }
}

run();
