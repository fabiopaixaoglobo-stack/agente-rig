const https = require('https');

https.get('https://realdata.com.br/cameras-ao-vivo/', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log("RealData status:", res.statusCode, "length:", body.length);
        const iframes = body.match(/<iframe[^>]*src="([^"]+)"/gi);
        console.log("Iframes in Realdata:", iframes);
        const videos = body.match(/<video[^>]*src="([^"]+)"/gi);
        console.log("Videos in Realdata:", videos);
        const youtube = body.match(/youtube\.com\/embed\/[^"'\s]+/gi);
        console.log("YouTube embeds:", youtube);
    });
});
