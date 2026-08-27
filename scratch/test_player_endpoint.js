const https = require('https');

function testPlayer(id) {
    const url = `https://player.camerasrj.com.br/camera/${id}/`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log(`Player ID: ${id} -> Status: ${res.statusCode}, Body size: ${body.length}`);
            console.log("HTML Sample:", body.substring(0, 400));
        });
    });
}

testPlayer('1010'); // Barra
testPlayer('1014'); // Curicica
testPlayer('1301'); // Copacabana
testPlayer('001010'); // Centro/Av. Francisco Bicalho
