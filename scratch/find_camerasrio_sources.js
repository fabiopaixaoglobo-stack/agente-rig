const https = require('https');

https.get('https://josebritz.github.io/camerasrio/', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        // find camera urls inside
        const imgMatches = body.match(/http[^"']+(?:jpg|jpeg|png|m3u8|mp4|stream|camera)[^"']*/gi);
        console.log("Found URLs in camerasrio:", (imgMatches || []).slice(0, 10));
    });
});
