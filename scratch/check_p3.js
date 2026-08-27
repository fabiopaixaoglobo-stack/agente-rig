const https = require('https');

https.get('https://www02.smt.ufrj.br/~tvdigital/zet/page_03.html', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log("page_03 HTML snippet:\n", body.substring(0, 1500));
    });
});
