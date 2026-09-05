const https = require('https');

function searchBingImages(query) {
  return new Promise((resolve) => {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`;
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
      }
    }, (res) => {
      let html = '';
      res.on('data', d => html += d);
      res.on('end', () => {
        const results = [];
        const mMatches = html.match(/m="(\{[^"]+\})"/g) || [];
        for (const m of mMatches) {
          try {
            const raw = m.substring(3, m.length - 1).replace(/&quot;/g, '"');
            const parsed = JSON.parse(raw);
            if (parsed.murl && (parsed.murl.startsWith('http://') || parsed.murl.startsWith('https://'))) {
              results.push({
                url: parsed.murl,
                thumbnail: parsed.turl || parsed.murl,
                title: parsed.t || query,
                source: parsed.purl ? new URL(parsed.purl).hostname : 'ويب'
              });
            }
          } catch(e) {}
        }
        resolve(results);
      });
    }).on('error', (e) => {
      resolve([]);
    });
  });
}

async function testAll() {
  const queries = ['Joyroom JR-T03S', 'Anker 20W charger', 'Borofone BA48A', 'Marshall ME-01', 'Baseus 65W GaN', 'Remax RB-M43', 'Samsung Galaxy S24 case'];
  for (const q of queries) {
    const res = await searchBingImages(q);
    console.log(`Query "${q}" -> Found ${res.length} web images`);
  }
}

testAll();
