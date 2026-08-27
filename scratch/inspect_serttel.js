const https = require('https');

https.get('https://transito-recife.serttel.com.br/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log("Transito Recife status:", res.statusCode, "x-frame:", res.headers['x-frame-options'], "body len:", body.length);
        console.log("Snippets:", body.slice(0, 500));
        const imgs = body.match(/https?:\/\/[^"'\s]+\.(jpg|jpeg|png|m3u8)/gi);
        console.log("Images/streams in Transito Recife:", imgs);
    });
});
