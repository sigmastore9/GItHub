const localtunnel = require('localtunnel');

// Must match the port server/app.js listens on. This was hardcoded to 3000 while
// the server runs on 4000, so the tunnel exposed nothing.
const PORT = Number(process.env.PORT) || 4000;

(async () => {
  try {
    const tunnel = await localtunnel({ port: PORT });
    console.log('=== SIGMA STORE LIVE PUBLIC URL ===');
    console.log(`${tunnel.url}/shop`);
    console.log('===================================');
    console.log('ملاحظة: لوحة الإدارة عبر هذا الرابط تتطلب كلمة مرور.');

    tunnel.on('close', () => {
      console.log('Tunnel connection closed.');
    });
  } catch (err) {
    console.error('Localtunnel error:', err);
  }
})();
