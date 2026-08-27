const https = require('https');

https.get('https://camerasdomundo.com/brasil/', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const matches = body.match(/href="([^"]*rio[^"]*)"/gi);
        console.log("Brazil Rio matches:", matches);
    });
});
