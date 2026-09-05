const https = require('https');

function searchBing(query) {
  return new Promise((resolve) => {
    const url = 'https://www.bing.com/images/search?q=' + encodeURIComponent(query) + '&form=HDRSC2&first=1';
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
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
            if (parsed.murl) {
              results.push({ url: parsed.murl, title: parsed.t, source: parsed.purl });
            }
          } catch(e) {}
        }
        resolve(results);
      });
    }).on('error', () => resolve([]));
  });
}

async function test() {
  console.log('--- Testing Refined Headphone & Accessory Queries ---');
  const queries = [
    'MR Marshall ME01 wireless headphone',
    'Marshall ME-01 wireless headphone headset',
    'Marshall MA-09 earphone',
    'Marshall MA-05 Type-C cable',
    'Hoco CS27B charger 20W',
    'Joyroom JR-T03S Pro TWS earbuds'
  ];

  for (const q of queries) {
    const r = await searchBing(q);
    console.log(`\nQuery: "${q}" -> found ${r.length} images`);
    if (r.length > 0) {
      console.log(`  Top 1: ${r[0].title}`);
      console.log(`  URL 1: ${r[0].url}`);
    }
  }
}

test();
