const https = require('https');

const urls = [
    'https://camerasdomundo.com/brasil/rio-de-janeiro/praia-de-copacabana-ao-vivo/',
    'https://camerasdomundo.com/brasil/rio-de-janeiro/aeroporto-santos-dumont/',
    'https://camerasdomundo.com/brasil/rio-de-janeiro/barra-da-tijuca/',
    'https://www02.smt.ufrj.br/~tvdigital/zet/page_03.html'
];

urls.forEach(u => {
    https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
        console.log(u, "-> Status:", res.statusCode, "x-frame:", res.headers['x-frame-options']);
    }).on('error', e => console.error(u, e.message));
});
