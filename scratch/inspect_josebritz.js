const https = require('https');

https.get('https://josebritz.github.io/camerasrio/', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log("José Britz HTML:", body.substring(0, 1000));
        const scripts = body.match(/<script[^>]*src="([^"]+)"/g);
        console.log("Scripts:", scripts);
    });
});
