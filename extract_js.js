const fs = require('fs');
const code = fs.readFileSync('C:/Users/fapaixao/.gemini/antigravity/brain/55e6da1d-0fb2-49e8-ab8f-d3b2be490a9d/.system_generated/steps/136/content.md', 'utf8');

// Look for camera player URL construction logic
console.log("Looking for hls, m3u8, iframe, player in code...");
const snippets = code.match(/.{0,50}(m3u8|hls\.js|video|iframe|player|url).{0,50}/gi);
if (snippets) {
    const unique = [...new Set(snippets)];
    console.log(unique.slice(0, 10));
} else {
    console.log("Not found.");
}
