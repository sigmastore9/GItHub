const localtunnel = require('localtunnel');

(async () => {
  try {
    const tunnel = await localtunnel({ port: 3000 });
    console.log('=== SIGMA STORE LIVE PUBLIC URL ===');
    console.log(`${tunnel.url}/shop`);
    console.log('===================================');

    tunnel.on('close', () => {
      console.log('Tunnel connection closed.');
    });
  } catch (err) {
    console.error('Localtunnel error:', err);
  }
})();
