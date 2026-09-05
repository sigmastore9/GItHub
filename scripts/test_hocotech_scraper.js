const https = require('https');

function fetchHtml(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location).then(resolve);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', (e) => {
      console.error('Fetch error:', e.message);
      resolve('');
    });
  });
}

async function searchHocotechImages(query) {
  console.log(`Searching hocotech.com for: "${query}"...`);
  const searchUrl = `https://hocotech.com/?s=${encodeURIComponent(query)}`;
  const searchHtml = await fetchHtml(searchUrl);

  const foundImages = [];
  const foundLinks = [];

  // 1. Direct images in search results
  const searchImgMatches = searchHtml.match(/https:\/\/hocotech\.com\/wp-content\/uploads\/\d+\/\d+\/[^\s"'\)]+\.(?:jpg|jpeg|png|webp)/gi) || [];
  searchImgMatches.forEach(img => {
    if (!img.includes('logo') && !img.includes('banner') && !img.includes('icon') && !foundImages.includes(img)) {
      foundImages.push(img);
    }
  });

  // 2. Extract product post links
  const linkMatches = searchHtml.match(/href="(https:\/\/hocotech\.com\/[^\/]+\/[^"]+)"/gi) || [];
  linkMatches.forEach(m => {
    const link = m.replace(/^href="/, '').replace(/"$/, '');
    if (!link.includes('category') && !link.includes('tag') && !link.includes('page') && !link.includes('cart') && !link.includes('checkout') && !foundLinks.includes(link)) {
      foundLinks.push(link);
    }
  });

  console.log(`Found ${foundLinks.length} product links on hocotech.com:`, foundLinks.slice(0, 3));

  // 3. Inspect top product pages for full gallery
  for (const pageUrl of foundLinks.slice(0, 3)) {
    console.log(`Inspecting page: ${pageUrl}`);
    const pageHtml = await fetchHtml(pageUrl);
    const pageImgs = pageHtml.match(/https:\/\/hocotech\.com\/wp-content\/uploads\/\d+\/\d+\/[^\s"'\)]+\.(?:jpg|jpeg|png|webp)/gi) || [];
    pageImgs.forEach(img => {
      // Remove tiny thumbnails (like -100x100, -150x150)
      const cleanImg = img.replace(/-\d+x\d+(\.(?:jpg|jpeg|png|webp))$/i, '$1');
      if (!cleanImg.includes('logo') && !cleanImg.includes('banner') && !cleanImg.includes('icon') && !foundImages.includes(cleanImg)) {
        foundImages.push(cleanImg);
      }
    });
  }

  console.log(`Total unique images found for "${query}": ${foundImages.length}`);
  foundImages.slice(0, 10).forEach((img, i) => console.log(`  [${i+1}] ${img}`));
  return foundImages;
}

searchHocotechImages('EQ33').then(() => searchHocotechImages('CS32B'));
