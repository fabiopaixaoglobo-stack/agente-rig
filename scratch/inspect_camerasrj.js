const https = require('https');

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 8000
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                console.log('Redirecting to:', res.headers.location);
                let loc = res.headers.location;
                if (loc.startsWith('/')) loc = 'https://www.camerasrj.com.br' + loc;
                return fetch(loc).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, finalUrl: url }));
        }).on('error', reject);
    });
}

async function run() {
    try {
        const res = await fetch('https://www.camerasrj.com.br/camera/1010/');
        console.log('FINAL URL:', res.finalUrl);
        console.log('STATUS:', res.status);
        console.log('BODY LENGTH:', res.body.length);

        const matches = res.body.match(/(webrtc|hevc|h265|h264|rtp|sdp|whep|stream|video|player|janus|go2rtc|mediamtx|flv|m3u8|mp4|h265)/gi) || [];
        console.log('Keywords found:', [...new Set(matches.map(m => m.toLowerCase()))]);

        const scripts = res.body.match(/<script[\s\S]*?<\/script>/gi) || [];
        console.log('Total scripts found:', scripts.length);
        scripts.forEach((s, idx) => {
            if (s.includes('webrtc') || s.includes('player') || s.includes('h265') || s.includes('video') || s.includes('stream') || s.includes('camera') || s.includes('sdp') || s.includes('HEVC')) {
                console.log(`\n--- SCRIPT ${idx} ---`);
                console.log(s.slice(0, 1500));
            }
        });
    } catch (e) {
        console.error('FETCH ERROR:', e.message);
    }
}
run();
