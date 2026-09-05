const https = require('https');
const fs = require('fs');

/**
 * Searches visually matching images by image URL or query
 */
function searchVisualMatches(imageUrl, query = '') {
  return new Promise((resolve) => {
    // Bing Visual Search endpoint or reverse image lookup
    const searchUrl = `https://www.bing.com/images/search?view=detailv2&iss=sbi&FORM=SBIHMP&q=imgurl:${encodeURIComponent(imageUrl)}`;
    console.log('Testing reverse image lookup:', searchUrl);
    
    https.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      timeout: 8000
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
              results.push({
                url: parsed.murl,
                thumbnail: parsed.turl || parsed.murl,
                title: parsed.t || 'مطابقة بصرية',
                source: parsed.purl ? new URL(parsed.purl).hostname : 'Google Lens / Visual Web'
              });
            }
          } catch(e) {}
        }
        resolve(results);
      });
    }).on('error', () => resolve([]));
  });
}

searchVisualMatches('https://hocotech.com/wp-content/uploads/2025/08/hoco-w112-pure-headphones-overview.jpg').then(res => {
  console.log(`Visual Search found ${res.length} matches`);
});
