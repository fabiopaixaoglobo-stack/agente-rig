const https = require('https');

https.get('https://camerasdomundo.com/brasil/rio-de-janeiro/', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const matches = body.match(/href="(https:\/\/camerasdomundo\.com\/brasil\/rio-de-janeiro\/[^"]+)"/g);
        console.log("Found Rio links:", matches);
    });
});
