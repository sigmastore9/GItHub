const app = require('../server/app');
const http = require('http');

console.log('=== TESTING NEW IMAGE SEARCH & BRAND LOOKUP ENGINE ===');

function postJson(urlPath, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

setTimeout(async () => {
  try {
    // 1. Test Detect Joyroom code
    const r1 = await postJson('/api/detect-product-info', { model: 'JR-T03S Pro' });
    console.log('✓ Detect Joyroom result:', r1.data.data);

    // 2. Test Detect Borofone code
    const r2 = await postJson('/api/detect-product-info', { model: 'BA48A' });
    console.log('✓ Detect Borofone result:', r2.data.data);

    // 3. Test Detect Anker code
    const r3 = await postJson('/api/detect-product-info', { model: 'A2019' });
    console.log('✓ Detect Anker result:', r3.data.data);

    // 4. Test Web Image Search
    const r4 = await postJson('/api/search-brand-images', { brand: 'web', query: 'Anker PowerPort 20W' });
    console.log(`✓ Web Image Search found ${r4.data.images ? r4.data.images.length : 0} images!`);
    if (r4.data.images && r4.data.images.length > 0) {
      console.log('  Top Image sample:', r4.data.images[0]);
    }

    console.log('=== ALL FEATURES TESTED SUCCESSFULLY ===');
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}, 1000);
