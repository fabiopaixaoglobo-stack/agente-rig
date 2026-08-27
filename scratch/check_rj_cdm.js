const https = require('https');

https.get('https://camerasdomundo.com/brasil/rio-de-janeiro-ao-vivo/', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const matches = body.match(/href="(https:\/\/camerasdomundo\.com\/[^"]+)"/g);
        console.log("Rio de Janeiro live links on CDM:", matches);
    });
});
