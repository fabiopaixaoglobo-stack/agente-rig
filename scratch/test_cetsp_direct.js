const https = require('https');

function testEndpoint(url) {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, rejectUnauthorized: false }, res => {
        console.log(url, "-> Status:", res.statusCode, "Content-Type:", res.headers['content-type']);
    }).on('error', e => console.error(url, "Error:", e.message));
}

testEndpoint('https://cameras.cetsp.com.br/Cams/23/1.jpg');
testEndpoint('https://cameras.cetsp.com.br/Cams/195/1.jpg');
