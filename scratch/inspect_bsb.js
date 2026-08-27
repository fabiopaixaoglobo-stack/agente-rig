const https = require('https');

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        }).on('error', reject);
    });
}

async function inspect() {
    const urls = [
        'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-esplanada',
        'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-parque-da-cidade',
        'https://www.climaaovivo.com.br/df/brasilia/combo-livre-brasil-21-mane-garrincha'
    ];
    for (const u of urls) {
        console.log('\n======================================================');
        console.log('URL:', u);
        console.log('======================================================');
        try {
            const res = await fetch(u);
            console.log('Status:', res.status);
            console.log('Body length:', res.body.length);
            
            // Search for image URLs, m3u8, mp4, img src, data-src, or snapshot endpoints
            const imgs = res.body.match(/https?:\/\/[^\"\'\s<>]+\.(jpg|jpeg|png|webp|m3u8|mp4)[^\"\'\s<>]*/gi) || [];
            console.log('Matched media URLs:');
            imgs.slice(0, 15).forEach(img => console.log('  ->', img));

            // Search for camera script variables or json
            const scripts = res.body.match(/<script[\s\S]*?<\/script>/gi) || [];
            console.log('Total scripts found:', scripts.length);
            scripts.forEach((s, idx) => {
                if (s.includes('player') || s.includes('camera') || s.includes('stream') || s.includes('video') || s.includes('hls') || s.includes('snapshot') || s.includes('live') || s.includes('video_url')) {
                    console.log(`\n--- Script ${idx} ---`);
                    console.log(s.slice(0, 1200));
                }
            });
        } catch (e) {
            console.error('Error fetching', u, e.message);
        }
    }
}

inspect();
