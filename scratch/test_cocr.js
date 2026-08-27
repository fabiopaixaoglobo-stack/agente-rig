const https = require('https');

https.get('https://aplicativo.cocr.com.br/cameras_api', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}, Body size: ${body.length}`);
        try {
            const parsed = JSON.parse(body);
            console.log("Total cameras:", parsed.length);
            console.log("Sample camera:", parsed.slice(0, 3));
        } catch (e) {
            console.log("Sample:", body.substring(0, 500));
        }
    });
}).on('error', e => console.error("Error:", e.message));
