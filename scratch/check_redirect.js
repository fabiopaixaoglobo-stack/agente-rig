const http = require('http');
const https = require('https');
const { URL } = require('url');

function follow(urlStr) {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === 'https:' ? https : http;
    mod.get(urlStr, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        console.log(`URL: ${urlStr} -> ${res.statusCode} | x-frame: ${res.headers['x-frame-options']} | loc: ${res.headers.location}`);
        if (res.headers.location) {
            const nextUrl = new URL(res.headers.location, urlStr).toString();
            follow(nextUrl);
        }
    }).on('error', e => console.error(urlStr, e.message));
}

follow('https://www.camerasrj.com.br/camera/1010/');
follow('https://www.camerasrj.com.br/camera/1014/');
