const https = require('https');

function searchDuckDuckGoImages(query) {
  return new Promise((resolve) => {
    // DuckDuckGo image search endpoint
    const url = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&s=0&u=bing&f=,,,`;
    
    // First get token (vqd)
    const tokenUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&iar=images&iax=images&ia=images`;
    
    https.get(tokenUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }, (res) => {
      let html = '';
      res.on('data', d => html += d);
      res.on('end', () => {
        const vqdMatch = html.match(/vqd=([a-zA-Z0-9_\-]+)/) || html.match(/vqd=["']([a-zA-Z0-9_\-]+)["']/);
        const vqd = vqdMatch ? vqdMatch[1] : '';
        console.log('Got vqd token:', vqd);

        if (!vqd) {
          // Fallback search
          return resolve([]);
        }

        const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,`;
        https.get(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': 'https://duckduckgo.com/'
          }
        }, (apiRes) => {
          let jsonStr = '';
          apiRes.on('data', chunk => jsonStr += chunk);
          apiRes.on('end', () => {
            try {
              const data = JSON.parse(jsonStr);
              const results = (data.results || []).map(r => ({
                url: r.image,
                thumbnail: r.thumbnail,
                title: r.title,
                source: r.source || 'ويب'
              }));
              resolve(results);
            } catch(e) {
              console.log('JSON parse error:', e.message);
              resolve([]);
            }
          });
        }).on('error', (e) => {
          console.log('API error:', e.message);
          resolve([]);
        });
      });
    }).on('error', (e) => {
      console.log('Token error:', e.message);
      resolve([]);
    });
  });
}

searchDuckDuckGoImages('Hoco W112').then(res => {
  console.log(`Found ${res.length} web images for "Hoco W112":`);
  res.slice(0, 5).forEach((item, idx) => {
    console.log(`[${idx + 1}] ${item.title} -> ${item.url}`);
  });
});
