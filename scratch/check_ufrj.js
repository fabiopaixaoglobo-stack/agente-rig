const https = require('https');

['page_01.html', 'page_02.html', 'page_03.html', 'page_04.html'].forEach(p => {
    const url = `https://www02.smt.ufrj.br/~tvdigital/zet/${p}`;
    https.get(url, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log(p, "-> Status:", res.statusCode, "Length:", body.length);
            const title = (body.match(/<title>([^<]+)<\/title>/i) || [])[1];
            console.log(p, "Title:", title);
        });
    });
});
