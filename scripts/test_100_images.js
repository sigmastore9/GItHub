const https = require('https');

function searchWebImagesPaged(query, targetCount = 100) {
  return new Promise(async (resolve) => {
    const allResults = [];
    const seenUrls = new Set();

    // Fetch in pages of 35
    for (let page = 0; page < 3; page++) {
      const offset = page * 35 + 1;
      const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=${offset}`;
      
      try {
        const pageResults = await new Promise((resPage) => {
          https.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 8000
          }, (res) => {
            let html = '';
            res.on('data', d => html += d);
            res.on('end', () => {
              const list = [];
              const mMatches = html.match(/m="(\{[^"]+\})"/g) || [];
              for (const m of mMatches) {
                try {
                  const raw = m.substring(3, m.length - 1).replace(/&quot;/g, '"');
                  const parsed = JSON.parse(raw);
                  if (parsed.murl && !seenUrls.has(parsed.murl)) {
                    seenUrls.add(parsed.murl);
                    list.push({
                      url: parsed.murl,
                      thumbnail: parsed.turl || parsed.murl,
                      title: parsed.t || query,
                      source: parsed.purl ? new URL(parsed.purl).hostname : 'ويب'
                    });
                  }
                } catch(e) {}
              }
              resPage(list);
            });
          }).on('error', () => resPage([]));
        });

        allResults.push(...pageResults);
        if (allResults.length >= targetCount || pageResults.length === 0) break;
      } catch (e) {
        break;
      }
    }

    resolve(allResults.slice(0, targetCount));
  });
}

searchWebImagesPaged('Hoco W112 wireless headphone', 100).then(res => {
  console.log(`Total images fetched: ${res.length}`);
  console.log('Sample image 1:', res[0]);
  console.log(`Sample image ${res.length}:`, res[res.length - 1]);
});
