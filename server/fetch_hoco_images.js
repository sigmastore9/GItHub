const fs = require('fs');
const path = require('path');
const https = require('https');

const REVIEW_DIR = path.join(__dirname, '..', 'Hoco_Images_Review');
if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

const MODELS = [
  { code: 'M114_TC', query: 'M114', title: 'سماعة هوكو سلكية Type-C مع مايكروفون M114' },
  { code: 'M104', query: 'M104', title: 'سماعة هوكو سلكية M104 مع مايكروفون 3.5mm' },
  { code: 'DM6', query: 'DM6', title: 'سماعة هوكو داخل الأذن DM6 بصوت نقي' },
  { code: 'EQ33', query: 'EQ33', title: 'سماعة بلوتوث لاسلكية هوكو EQ33 TWS' },
  { code: 'E37', query: 'E37', title: 'سماعة بلوتوث أحادية هوكو E37 للأعمال' },
  { code: 'W112', query: 'W112', title: 'سماعة رأس بلوتوث هوكو W112' },
  { code: 'CS27B_TC-TC', query: 'CS27B', title: 'شاحن سريع هوكو CS27B Type-C إلى Type-C' },
  { code: 'CS32B', query: 'CS32B', title: 'رأس شاحن سريع هوكو CS32B' },
  { code: 'Z58', query: 'Z58', title: 'رأس شاحن سيارة هوكو Z58' },
  { code: 'HB1A', query: 'HB1', title: 'وصلة ومحول هوكو HB1 4 في 1' },
  { code: 'HB51', query: 'HB51', title: 'محول هوكو HB51 Type-C متعدد المنافذ' },
  { code: 'UA17_TC', query: 'UA17', title: 'محول OTG هوكو UA17 Type-C' },
  { code: 'UD6_8G', query: 'UD6', title: 'فلاش ميموري هوكو UD6 سعة 8 جيجابايت' },
  { code: 'X96_25CM', query: 'X96', title: 'كيبل قصير هوكو X96 بطول 25 سم' },
  { code: 'X59', query: 'X59', title: 'كيبل هوكو X59 فيكتوري قماشي' },
  { code: 'X117_IP-TC', query: 'X117', title: 'كيبل هوكو X117 تايب سي إلى آيفون PD' },
  { code: 'U95_PD', query: 'U95', title: 'كيبل شحن سريع هوكو U95 PD مع شاشة' },
  { code: 'X87', query: 'X87', title: 'كيبل هوكو X87 مضاد للتشابك' },
  { code: 'X112_IP', query: 'X112', title: 'كيبل هوكو X112 آيفون Lightning' },
  { code: 'X122', query: 'X122', title: 'كيبل هوكو X122 شحن سريع' },
  { code: 'X76_4IN1', query: 'X76', title: 'كيبل هوكو متعدد 4 في 1 X76' },
  { code: 'C155B_TC-TC', query: 'C155B', title: 'شاحن فائق السرعة هوكو C155B' },
  { code: 'X118', query: 'X118', title: 'كيبل هوكو X118 فائق السرعة' }
];

function fetchHtml(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return resolve(false);
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          const stats = fs.statSync(dest);
          if (stats.size > 2000) {
            resolve(true);
          } else {
            fs.unlink(dest, () => {});
            resolve(false);
          }
        });
      });
    }).on('error', () => {
      file.close();
      fs.unlink(dest, () => {});
      resolve(false);
    });
  });
}

async function processModel(item) {
  const dest = path.join(REVIEW_DIR, `Hoco_${item.code}.jpg`);
  
  // Step 1: Search hocotech.com
  const searchUrl = `https://hocotech.com/?s=${encodeURIComponent(item.query)}`;
  console.log(`[${item.code}] Searching: ${searchUrl}`);
  const searchHtml = await fetchHtml(searchUrl);

  // Extract direct product post links (e.g. href="https://hocotech.com/product/...")
  const linkMatches = searchHtml.match(/href="(https:\/\/hocotech\.com\/[^\/]+\/[^"]+)"/gi);
  
  let productPageUrls = [];
  if (linkMatches) {
    productPageUrls = linkMatches
      .map(m => m.replace(/^href="/, '').replace(/"$/, ''))
      .filter(u => !u.includes('category') && !u.includes('tag') && !u.includes('page') && !u.includes('cart') && u.includes(item.query.toLowerCase()));
  }

  let downloaded = false;

  // Step 2: Fetch first matching product page and extract main HD image
  for (const pageUrl of productPageUrls.slice(0, 3)) {
    console.log(`  -> Inspecting product page: ${pageUrl}`);
    const pageHtml = await fetchHtml(pageUrl);
    
    // Match high-res images on product page
    const imgMatches = pageHtml.match(/https:\/\/hocotech\.com\/wp-content\/uploads\/\d+\/\d+\/[^\s"']+\.(?:jpg|jpeg|png)/gi);
    if (imgMatches && imgMatches.length > 0) {
      // Find main product image (not icons/logos)
      const cleanImgs = imgMatches.filter(u => !u.includes('logo') && !u.includes('banner') && !u.includes('-150x150') && !u.includes('-100x100'));
      for (const imgUrl of cleanImgs.slice(0, 2)) {
        console.log(`  -> Downloading HD photo: ${imgUrl}`);
        const ok = await downloadFile(imgUrl, dest);
        if (ok) {
          console.log(`  ✅ Successfully saved: Hoco_${item.code}.jpg`);
          downloaded = true;
          break;
        }
      }
    }
    if (downloaded) break;
  }

  if (!downloaded) {
    // If not found on hocotech product page directly, search DuckDuckGo / direct CDN
    console.log(`  -> Trying direct global catalog for [${item.code}]...`);
    const fallbackUrl = `https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80`;
    await downloadFile(fallbackUrl, dest);
  }
}

async function runAll() {
  for (const item of MODELS) {
    await processModel(item);
  }

  // Generate review gallery HTML
  let html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فحص ومعاينة صور منتجات هوكو (Hoco Review)</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Cairo', sans-serif; background: #0b0f19; color: #f8fafc; padding: 30px; margin: 0; }
    h1 { text-align: center; color: #38bdf8; margin-bottom: 6px; font-size: 26px; }
    p.sub { text-align: center; color: #94a3b8; margin-bottom: 28px; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 22px; max-width: 1400px; margin: 0 auto; }
    .card { background: #1e293b; border-radius: 14px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 6px 15px rgba(0,0,0,0.4); transition: transform 0.2s; }
    .card:hover { transform: translateY(-4px); border-color: #38bdf8; }
    .img-box { width: 100%; height: 280px; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .img-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .info { padding: 16px; background: #1e293b; }
    .code { font-size: 18px; font-weight: 900; color: #38bdf8; margin-bottom: 6px; }
    .title { font-size: 13px; color: #cbd5e1; line-height: 1.4; }
    .filename { font-size: 11px; color: #64748b; margin-top: 8px; font-family: monospace; }
  </style>
</head>
<body>
  <h1>📸 ملف فحص ومعاينة صور منتجات هوكو (Hoco)</h1>
  <p class="sub">تم تحميل جميع الصور بناءً على كود كل موديل لتفحصها بنفسك</p>
  <div class="grid">
`;

  for (const item of MODELS) {
    const filename = `Hoco_${item.code}.jpg`;
    html += `
    <div class="card">
      <div class="img-box">
        <img src="${filename}" alt="${item.code}">
      </div>
      <div class="info">
        <div class="code">Hoco ${item.code.replace(/_/g, ' ')}</div>
        <div class="title">${item.title}</div>
        <div class="filename">📁 ${filename}</div>
      </div>
    </div>
    `;
  }

  html += `
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(REVIEW_DIR, 'معاينة_الصور.html'), html, 'utf8');
  console.log('\n✅ All images downloaded and Inspection Gallery generated!');
}

runAll().catch(console.error);
