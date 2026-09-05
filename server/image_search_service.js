const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('[ImageSearchService] Sharp optional module not loaded, using direct image mode.');
}

/**
 * Advanced Multi-Brand & Global Web Product Image Search Engine
 * Supports: Hoco, Borofone, Joyroom, Anker, Baseus, Remax, Acefast, Marshall, Samsung, Apple, Xiaomi, and Global Web
 */

const BRAND_CONFIGS = {
  web: {
    id: 'web',
    name: '🌐 بحث شامل في الويب (Global Web Search)',
    domain: 'global-web'
  },
  hoco: {
    id: 'hoco',
    name: '🏢 هوكو (Hoco - hocotech.com)',
    domain: 'hocotech.com'
  },
  borofone: {
    id: 'borofone',
    name: '🏢 بوروفون (Borofone - borofone.com)',
    domain: 'borofone.com'
  },
  joyroom: {
    id: 'joyroom',
    name: '🏢 جويروم (Joyroom - joyroom.com)',
    domain: 'joyroom.com'
  },
  anker: {
    id: 'anker',
    name: '🏢 أنكر (Anker - anker.com)',
    domain: 'anker.com'
  },
  baseus: {
    id: 'baseus',
    name: '🏢 بيسوس (Baseus - baseus.com)',
    domain: 'baseus.com'
  },
  remax: {
    id: 'remax',
    name: '🏢 ريماكس (Remax - remax.hk)',
    domain: 'remax.hk'
  },
  acefast: {
    id: 'acefast',
    name: '🏢 آيسي فاست (Acefast - acefast.com)',
    domain: 'acefast.com'
  },
  marshall: {
    id: 'marshall',
    name: '🏢 مارشال (Marshall)',
    domain: 'marshall'
  },
  samsung: {
    id: 'samsung',
    name: '📱 سامسونج (Samsung)',
    domain: 'samsung.com'
  },
  apple: {
    id: 'apple',
    name: '🍏 آبل (Apple)',
    domain: 'apple.com'
  },
  xiaomi: {
    id: 'xiaomi',
    name: '📱 شاومي (Xiaomi)',
    domain: 'mi.com'
  }
};

/**
 * Automatically detects the brand from the model code or name
 */
function detectBrand(modelStr = '', nameStr = '') {
  const combined = (modelStr + ' ' + nameStr).trim().toUpperCase();
  
  if (/^JR-|^JOYROOM|جويروم/i.test(combined)) return 'joyroom';
  if (/^A2\d{3}|^A3\d{3}|ANKER|SOUNDCORE|POWERPORT|أنكر/i.test(combined)) return 'anker';
  if (/^BA\d+|^BC\d+|^BO\d+|^BX\d+|^BJ\d+|^BR\d+|BOROFONE|بوروفون/i.test(combined)) return 'borofone';
  if (/BASEUS|بيسوس|باسيوس/i.test(combined)) return 'baseus';
  if (/^RP-|^RC-|^RB-|^RTL-|REMAX|ريماكس/i.test(combined)) return 'remax';
  if (/^MA-?0\d|^ME-?0\d|MARSHALL|مارشال/i.test(combined)) return 'marshall';
  if (/ACEFAST|ايسي فاست|آيسي/i.test(combined)) return 'acefast';
  if (/SAMSUNG|GALAXY|سامسونج/i.test(combined)) return 'samsung';
  if (/IPHONE|APPLE|آيفون|ايفون|ابل|آبل/i.test(combined)) return 'apple';
  if (/XIAOMI|REDMI|POCO|شاومي|ريدمي|بوكو/i.test(combined)) return 'xiaomi';
  if (/^CS|^EQ|^M1|^W1|^X\d|^HB|^UA|^UD|^U9|^E3|HOCO|هوكو/i.test(combined)) return 'hoco';

  return 'hoco'; // Default to Hoco
}

function fetchUrl(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
        },
        timeout: timeoutMs
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            const parsed = new URL(url);
            nextUrl = parsed.origin + nextUrl;
          }
          return fetchUrl(nextUrl, timeoutMs).then(resolve);
        }
        if (res.statusCode !== 200) {
          return resolve('');
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('timeout', () => { req.destroy(); resolve(''); });
      req.on('error', () => resolve(''));
    } catch(e) {
      resolve('');
    }
  });
}

/**
 * Searches global web images with multi-page pagination up to 100 results
 */
function searchWebImages(query, maxResults = 100) {
  return new Promise(async (resolve) => {
    const allResults = [];
    const seenUrls = new Set();
    const pagesNeeded = Math.min(3, Math.ceil(maxResults / 35));

    for (let page = 0; page < pagesNeeded; page++) {
      const offset = page * 35 + 1;
      const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=${offset}`;

      try {
        const pageResults = await new Promise((resPage) => {
          https.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
            },
            timeout: 9000
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
                  if (parsed.murl && (parsed.murl.startsWith('http://') || parsed.murl.startsWith('https://')) && !seenUrls.has(parsed.murl)) {
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
        if (allResults.length >= maxResults || pageResults.length === 0) break;
      } catch (e) {
        break;
      }
    }

    resolve(allResults.slice(0, maxResults));
  });
}

/**
 * Downloads an external image to /uploads/
 */
function downloadAndSaveImage(imageUrl, destFilename) {
  return new Promise((resolve) => {
    try {
      const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const destPath = path.join(uploadsDir, destFilename);
      const file = fs.createWriteStream(destPath);
      const client = imageUrl.startsWith('https') ? https : http;

      const req = client.get(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        timeout: 12000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            const parsed = new URL(imageUrl);
            nextUrl = parsed.origin + nextUrl;
          }
          return downloadAndSaveImage(nextUrl, destFilename).then(resolve);
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(destPath); } catch(_) {}
          return resolve(null);
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try {
              const stats = fs.statSync(destPath);
              if (stats.size > 1500) {
                resolve(`/uploads/${destFilename}`);
              } else {
                try { fs.unlinkSync(destPath); } catch(_) {}
                resolve(null);
              }
            } catch(e) {
              resolve(null);
            }
          });
        });
      });

      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => {
        file.close();
        try { fs.unlinkSync(destPath); } catch(_) {}
        resolve(null);
      });
    } catch(e) {
      resolve(null);
    }
  });
}

/**
 * Processes an image and composites it onto the Master Studio Podium Template
 */
async function compositeOntoMasterPodium(rawImagePath, outputFilename) {
  try {
    const masterTemplatePath = path.join(__dirname, '..', 'public', 'master_podium_template.jpg');
    if (!fs.existsSync(masterTemplatePath)) {
      throw new Error('Master template not found');
    }
    const masterTemplateBuffer = fs.readFileSync(masterTemplatePath);

    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
    const fullSrcPath = path.join(__dirname, '..', 'public', rawImagePath.replace(/^\//, ''));
    
    if (!fs.existsSync(fullSrcPath)) {
      return rawImagePath; // fallback
    }

    const trimmedBox = await sharp(fullSrcPath)
      .trim({ threshold: 25 })
      .toBuffer({ resolveWithObject: true });

    const rawWidth = trimmedBox.info.width;
    const rawHeight = trimmedBox.info.height;
    const isSquareOrWide = (rawWidth / rawHeight) > 0.75;

    const targetMaxHeight = isSquareOrWide ? 660 : 760;
    const targetMaxWidth = isSquareOrWide ? 700 : 540;

    const sizedBoxBuffer = await sharp(trimmedBox.data)
      .resize(targetMaxWidth, targetMaxHeight, {
        fit: 'inside',
        withoutEnlargement: false
      })
      .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 })
      .toBuffer({ resolveWithObject: true });

    const boxW = sizedBoxBuffer.info.width;
    const boxH = sizedBoxBuffer.info.height;

    const left = Math.round((1024 - boxW) / 2);
    const top = Math.max(90, 875 - boxH);

    const shadowW = Math.round(boxW * 1.08);
    const shadowH = 38;
    const shadowSvg = `
      <svg width="${shadowW}" height="${shadowH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="shadowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(0,0,0,0.85)" />
            <stop offset="55%" stop-color="rgba(2,6,15,0.4)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        <ellipse cx="${shadowW / 2}" cy="${shadowH / 2}" rx="${shadowW / 2}" ry="${shadowH / 2}" fill="url(#shadowGrad)" />
      </svg>
    `;
    const shadowBuffer = await sharp(Buffer.from(shadowSvg)).png().toBuffer();
    const shadowLeft = Math.round((1024 - shadowW) / 2);
    const shadowTop = top + boxH - 18;

    const outputBuffer = await sharp(masterTemplateBuffer)
      .composite([
        {
          input: shadowBuffer,
          top: Math.min(1024 - shadowH, shadowTop),
          left: Math.max(0, shadowLeft),
          blend: 'multiply'
        },
        {
          input: sizedBoxBuffer.data,
          top: top,
          left: left,
          blend: 'over'
        }
      ])
      .jpeg({ quality: 98, progressive: true })
      .toBuffer();

    const destPath = path.join(uploadsDir, outputFilename);
    fs.writeFileSync(destPath, outputBuffer);

    // Also mirror to dist if exists
    const distUploads = path.join(__dirname, '..', 'dist', 'MY Store-win32-x64', 'resources', 'app', 'public', 'uploads');
    if (fs.existsSync(distUploads)) {
      fs.writeFileSync(path.join(distUploads, outputFilename), outputBuffer);
    }

    return `/uploads/${outputFilename}`;
  } catch (err) {
    console.error('Error compositing onto podium:', err.message);
    return rawImagePath; // fallback
  }
}

/**
 * Generates smart product category keywords for precise image search
 */
function getCategorySearchKeywords(category = '', name = '', model = '') {
  const combined = (category + ' ' + name + ' ' + model).toLowerCase();

  if (/سماعة|سماعه|headphone|earphone|headset|earbuds|airpod|tws|buds/i.test(combined)) {
    if (/رأس|over-ear|wireless headphone|بلوتوث رأس|محيطي/i.test(combined)) {
      return 'wireless headphone headset';
    }
    return 'earphones wireless earbuds';
  }
  if (/كيبل|كابل|cable|wire|cord|usb-c|lightning|type-c/i.test(combined)) {
    return 'charging cable wire';
  }
  if (/شاحن|charger|adapter|power adapter|wall charger|car charger/i.test(combined)) {
    if (/سيارة|car/i.test(combined)) return 'car charger adapter';
    return 'fast charger power adapter';
  }
  if (/محول|hub|otg|splitter|dock/i.test(combined)) {
    return 'usb c hub adapter otg';
  }
  if (/فلاش|flash|drive|memory|usb drive/i.test(combined)) {
    return 'usb flash drive';
  }
  if (/لاصق|جام|glass|screen protector|film/i.test(combined)) {
    return 'screen protector tempered glass';
  }
  return '';
}

/**
 * Searches for all available product images across official brand sites, web, and local library
 */
async function searchProductImages(brandKey = 'hoco', query = '', modelCode = '', category = '', productName = '') {
  let brand = (brandKey || 'hoco').toLowerCase();
  const rawQuery = (query || modelCode || productName || '').trim();
  const cleanCode = (modelCode || rawQuery).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // If brand is auto or not specified, detect from query
  if (brand === 'auto' || !brand) {
    brand = detectBrand(rawQuery, modelCode);
  }

  const results = [];
  const seenUrls = new Set();

  function addResult(url, title, source, type = 'official', thumbnail = null) {
    if (!url || seenUrls.has(url)) return;
    const urlLower = url.toLowerCase();
    if (urlLower.includes('favicon') || urlLower.includes('avatar') || urlLower.includes('1x1') || urlLower.includes('placeholder')) return;
    
    seenUrls.add(url);
    results.push({
      url,
      thumbnail: thumbnail || url,
      title: title || rawQuery,
      source,
      type
    });
  }

  // 1. Check Local Calibrated & Studio Gallery Images First
  const localItemsMediaDir = path.join(__dirname, '..', 'public', 'itemsMedia');
  if (fs.existsSync(localItemsMediaDir)) {
    const localFiles = fs.readdirSync(localItemsMediaDir);
    for (const f of localFiles) {
      const fUpper = f.toUpperCase();
      if (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp')) {
        if (cleanCode && (fUpper.includes(cleanCode) || cleanCode.includes(fUpper.replace(/\.[^.]+$/, '')))) {
          addResult(`/itemsMedia/${f}`, `غلاف المنتج الأصلي على منصة الاستوديو (${f})`, 'المكتبة المحلية (استوديو)', 'local_studio');
        }
      }
    }
  }

  // 2. Determine Smart Category Keywords
  const catKeywords = getCategorySearchKeywords(category, productName, rawQuery);

  // 3. Build Multi-Query Search Strategies
  const brandName = (BRAND_CONFIGS[brand] ? BRAND_CONFIGS[brand].name.split(' ')[1] : brand) || brand;
  const queriesToRun = [];

  if (brand === 'marshall') {
    // Tailored queries for mobile accessory headphones / cables / chargers
    if (catKeywords) {
      queriesToRun.push(`Marshall ${rawQuery} ${catKeywords}`);
      queriesToRun.push(`MR Marshall ${rawQuery} ${catKeywords}`);
      queriesToRun.push(`${rawQuery} ${catKeywords}`);
    } else {
      queriesToRun.push(`Marshall ${rawQuery} wireless headphone earphone cable`);
      queriesToRun.push(`MR Marshall ${rawQuery}`);
    }
  } else if (brand === 'web') {
    queriesToRun.push(`${rawQuery} ${catKeywords}`.trim());
    queriesToRun.push(rawQuery);
  } else {
    if (catKeywords) {
      queriesToRun.push(`${brandName} ${rawQuery} ${catKeywords}`.trim());
    }
    queriesToRun.push(`${brandName} ${rawQuery}`.trim());
  }

  console.log(`[ImageSearch] Running queries with category context:`, queriesToRun);

  // 4. Run Web Image Scraper up to 100 images
  for (const q of queriesToRun) {
    const webResults = await searchWebImages(q, 100);
    webResults.forEach(item => {
      addResult(item.url, item.title, item.source, 'web_hd', item.thumbnail);
    });
    if (results.length >= 100) break;
  }

  // 5. Check Brand Site Scrapers for Hoco / Acefast
  if (brand === 'hoco') {
    const searchUrl = `https://hocotech.com/?s=${encodeURIComponent(rawQuery)}`;
    const searchHtml = await fetchUrl(searchUrl);
    if (searchHtml) {
      const imgRegex = /https:\/\/hocotech\.com\/wp-content\/uploads\/\d+\/\d+\/[^\s"'\)\?]+\.(?:jpg|jpeg|png|webp)/gi;
      const allImgs = searchHtml.match(imgRegex) || [];
      allImgs.forEach(img => {
        const clean = img.replace(/-\d+x\d+(\.(?:jpg|jpeg|png|webp))$/i, '$1');
        const imgLower = clean.toLowerCase();
        if (!imgLower.includes('logo') && !imgLower.includes('banner') && !imgLower.includes('category-image') && !imgLower.includes('icon')) {
          addResult(clean, `صورة رسمية من هوكو (${path.basename(clean)})`, 'hocotech.com (الرسمي)', 'official_hd');
        }
      });
    }
  }

  // 6. Fallback from Known Models Catalog
  const { KNOWN_MODELS } = require('./scraper');
  for (const [k, item] of Object.entries(KNOWN_MODELS)) {
    if (cleanCode && (k.includes(cleanCode) || cleanCode.includes(k))) {
      if (item.image_url) {
        addResult(item.image_url, `الصورة المعتمدة مسبقاً (${item.name})`, 'الكاتالوج الداخلي', 'catalog_default');
      }
    }
  }

  console.log(`[ImageSearch] Returning ${results.length} smart-filtered images for "${rawQuery}" (Brand: ${brand})`);
  return {
    success: true,
    brand,
    query: rawQuery,
    count: results.length,
    images: results
  };
}

module.exports = {
  BRAND_CONFIGS,
  detectBrand,
  searchProductImages,
  downloadAndSaveImage,
  compositeOntoMasterPodium
};

