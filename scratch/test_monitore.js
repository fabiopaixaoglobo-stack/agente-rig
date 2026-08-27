const https = require('https');

const bhUrl = 'https://monitore.realdata.com.br/#/cembed/5d326b838ea84f3fc93511410e413d252819164665e34d751733ba0c5240baa1a7fd96d5c4cae01d172ed56045ec';

https.get('https://monitore.realdata.com.br/', (res) => {
    console.log("Monitore Realdata status:", res.statusCode, "x-frame:", res.headers['x-frame-options']);
});
