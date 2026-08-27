const https = require('https');
const fs = require('fs');

https.get('https://josebritz.github.io/camerasrio/', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        fs.writeFileSync('scratch/josebritz_full.html', body);
        console.log("Saved scratch/josebritz_full.html. Length:", body.length);
        const scriptMatch = body.match(/<script[\s\S]*?<\/script>/gi);
        console.log("Found", scriptMatch ? scriptMatch.length : 0, "script blocks.");
    });
});
