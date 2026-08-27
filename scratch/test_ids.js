const https = require('https');

['1010', '1014', '1301', '1001', '1012'].forEach(id => {
    https.get(`https://player.camerasrj.com.br/camera/${id}/`, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log(`ID ${id} -> Status ${res.statusCode} | Title:`, (body.match(/<title>(.*?)<\/title>/) || [])[1]);
        });
    });
});
