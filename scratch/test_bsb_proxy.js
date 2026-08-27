const https = require('https');

const bsbCameraMap = {
    'esplanada': {
        slug: 'combo-livre-brasil-21-esplanada',
        url: 'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-esplanada',
        name: 'Brasília - Esplanada dos Ministérios'
    },
    'parque-da-cidade': {
        slug: 'combo-livre-brasil-21-parque-da-cidade',
        url: 'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-parque-da-cidade',
        name: 'Brasília - Parque da Cidade'
    },
    'mane-garrincha': {
        slug: 'combo-livre-brasil-21-mane-garrincha',
        url: 'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-mane-garrincha',
        name: 'Brasília - Mané Garrincha'
    }
};

const bsbImageCache = new Map();

async function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 6000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function fetchImageBuffer(imageUrl) {
    return new Promise((resolve, reject) => {
        https.get(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 6000
        }, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

async function getBsbCameraImage(camKey) {
    const info = bsbCameraMap[camKey];
    if (!info) throw new Error('Câmera desconhecida');

    const now = Date.now();
    if (bsbImageCache.has(camKey)) {
        const cached = bsbImageCache.get(camKey);
        if (now - cached.timestamp < 30000) { // 30s cache
            console.log(`[CACHE HIT] ${camKey} (${cached.buffer.length} bytes)`);
            return cached.buffer;
        }
    }

    console.log(`[FETCHING NEW] ${camKey} from ${info.url}...`);
    const html = await fetchHtml(info.url);
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) throw new Error('Não foi possível extrair dados da câmera');

    const data = JSON.parse(match[1]);
    const desarquivo = data.props?.pageProps?.page?.data?.desarquivo;
    if (!desarquivo) throw new Error('URL de snapshot não encontrada');

    const imageBuffer = await fetchImageBuffer(desarquivo);
    bsbImageCache.set(camKey, { buffer: imageBuffer, timestamp: Date.now() });
    console.log(`[SUCCESS] ${camKey} downloaded (${imageBuffer.length} bytes)`);
    return imageBuffer;
}

async function test() {
    for (const k of Object.keys(bsbCameraMap)) {
        const buf = await getBsbCameraImage(k);
        console.log(`Result ${k}: ${buf.length} bytes`);
    }
}

test();
