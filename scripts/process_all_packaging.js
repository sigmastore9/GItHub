const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcDir = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia/original_raw_photos';
const outDir = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia';
const publicDir = 'C:/progect/MY store/public/itemsMedia';

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 29 items mapping with accurate box crop percentages [left%, top%, width%, height%]
// Based on visual inspection of the raw camera photos:
const itemsConfig = [
  { file: 'IMG_20260830_190959.jpg', code: 'M114', name: 'سماعة هوكو M114 تايب سي', crop: [0.28, 0.16, 0.44, 0.72] },
  { file: 'IMG_20260830_191001.jpg', code: 'M104_White', name: 'سماعة هوكو M104 بيضاء', crop: [0.26, 0.14, 0.48, 0.76] },
  { file: 'IMG_20260830_191004.jpg', code: 'M104_Black', name: 'سماعة هوكو M104 سوداء', crop: [0.26, 0.14, 0.48, 0.76] },
  { file: 'IMG_20260830_191008.jpg', code: 'MA-09', name: 'سماعة سلكية مارشال MA-09', crop: [0.28, 0.18, 0.44, 0.68] },
  { file: 'IMG_20260830_191011.jpg', code: 'DM6', name: 'سماعة أذن هوكو DM6', crop: [0.18, 0.16, 0.64, 0.70] },
  { file: 'IMG_20260830_191017.jpg', code: 'MA-05', name: 'كيبل مارشال MA-05 PD100W', crop: [0.28, 0.12, 0.44, 0.78] },
  { file: 'IMG_20260830_191030.jpg', code: 'X87', name: 'كيبل هوكو X87 تايب سي 3A', crop: [0.26, 0.10, 0.48, 0.80] },
  { file: 'IMG_20260830_191035.jpg', code: 'X59', name: 'كيبل هوكو X59 فيكتوري 3A', crop: [0.25, 0.14, 0.50, 0.74] },
  { file: 'IMG_20260830_191038.jpg', code: 'M001-C', name: 'كيبل مارشال M001-C تايب سي', crop: [0.24, 0.18, 0.52, 0.68] },
  { file: 'IMG_20260830_191041.jpg', code: 'X122', name: 'كيبل هوكو X122 مايكرو 2.4A', crop: [0.28, 0.15, 0.44, 0.72] },
  { file: 'IMG_20260830_191044.jpg', code: 'M001-I', name: 'كيبل مارشال M001-I لايتنينج', crop: [0.28, 0.15, 0.44, 0.72] },
  { file: 'IMG_20260830_191047.jpg', code: 'X118', name: 'كيبل هوكو X118 شاشة رقمية', crop: [0.28, 0.20, 0.44, 0.65] },
  { file: 'IMG_20260830_191049.jpg', code: 'X117', name: 'كيبل هوكو X117 تايب سي لآيفون', crop: [0.28, 0.20, 0.44, 0.65] },
  { file: 'IMG_20260830_191053.jpg', code: 'MA-06', name: 'كيبل مارشال MA-06 PD30W', crop: [0.27, 0.10, 0.46, 0.80] },
  { file: 'IMG_20260830_191055.jpg', code: 'U95', name: 'كيبل هوكو U95 شحن سريع PD', crop: [0.24, 0.22, 0.52, 0.62] },
  { file: 'IMG_20260830_191100.jpg', code: 'E37', name: 'سماعة هوكو E37 أحادية', crop: [0.20, 0.14, 0.60, 0.72] },
  { file: 'IMG_20260830_191104.jpg', code: 'HB51', name: 'محول هوكو HB51 6في1 تايب سي', crop: [0.25, 0.22, 0.50, 0.60] },
  { file: 'IMG_20260830_191106.jpg', code: 'HB1A', name: 'محول هوكو HB1A 4في1 USB', crop: [0.15, 0.10, 0.70, 0.80] },
  { file: 'IMG_20260830_191109.jpg', code: 'X76', name: 'كيبل هوكو X76 4في1 متعدد', crop: [0.25, 0.08, 0.50, 0.84] },
  { file: 'IMG_20260830_191112.jpg', code: 'UD6', name: 'فلاش ميموري هوكو UD6 8GB', crop: [0.24, 0.24, 0.52, 0.56] },
  { file: 'IMG_20260830_191115.jpg', code: 'UA17', name: 'محول هوكو UA17 OTG تايب سي', crop: [0.22, 0.12, 0.56, 0.78] },
  { file: 'IMG_20260830_191118.jpg', code: 'CS32B', name: 'شاحن هوكو CS32B منفذين UK', crop: [0.23, 0.20, 0.44, 0.62] },
  { file: 'IMG_20260830_191121.jpg', code: 'CS27B', name: 'شاحن هوكو CS27B 67W 4 منافذ', crop: [0.26, 0.22, 0.48, 0.60] },
  { file: 'IMG_20260830_191124.jpg', code: 'X96', name: 'كيبل هوكو X96 قصير 25 سم', crop: [0.26, 0.24, 0.48, 0.56] },
  { file: 'IMG_20260830_191126.jpg', code: 'UK_20W_Set', name: 'طقم شاحن هوكو 20W تايب سي UK', crop: [0.20, 0.24, 0.60, 0.56] },
  { file: 'IMG_20260830_191134.jpg', code: 'EQ33', name: 'سماعة هوكو EQ33 TWS بلوتوث', crop: [0.26, 0.24, 0.48, 0.56] },
  { file: 'IMG_20260830_191141.jpg', code: 'ME-01', name: 'سماعة رأس مارشال ME-01 لاسلكية', crop: [0.12, 0.15, 0.76, 0.70] },
  { file: 'IMG_20260830_191147.jpg', code: 'Z58', name: 'شاحن سيارة هوكو Z58 30W PD', crop: [0.20, 0.18, 0.60, 0.68] },
  { file: 'IMG_20260830_191155.jpg', code: 'W112', name: 'سماعة رأس هوكو W112 مع مايك', crop: [0.28, 0.16, 0.44, 0.72] }
];

async function processAll() {
  console.log(`Starting processing of ${itemsConfig.length} product packaging images...`);
  const canvasSize = 1600;
  const targetBoxHeight = 1260;

  const galleryItems = [];

  for (let i = 0; i < itemsConfig.length; i++) {
    const item = itemsConfig[i];
    const srcFile = path.join(srcDir, item.file);

    if (!fs.existsSync(srcFile)) {
      console.warn(`File not found: ${srcFile}`);
      continue;
    }

    const meta = await sharp(srcFile).metadata();
    const W = meta.width;
    const H = meta.height;

    const [leftP, topP, widthP, heightP] = item.crop;
    const left = Math.round(W * leftP);
    const top = Math.round(H * topP);
    const width = Math.round(W * widthP);
    const height = Math.round(H * heightP);

    // 1. Crop box, enhance clarity and sharpness
    const croppedBox = await sharp(srcFile)
      .extract({ left, top, width, height })
      .resize({ height: targetBoxHeight, fit: 'inside' })
      .modulate({
        brightness: 1.03,
        saturation: 1.06
      })
      .sharpen({
        sigma: 1.6,
        m1: 1.3,
        m2: 2.4
      })
      .toBuffer({ resolveWithObject: true });

    const boxW = croppedBox.info.width;
    const boxH = croppedBox.info.height;

    const posX = Math.round((canvasSize - boxW) / 2);
    const posY = Math.round((canvasSize - boxH) / 2) - 20;

    // Smooth rounded edge mask (16px radius)
    const boxMask = Buffer.from(`
      <svg width="${boxW}" height="${boxH}">
        <rect x="0" y="0" width="${boxW}" height="${boxH}" rx="14" ry="14" fill="#ffffff" />
      </svg>
    `);

    const maskedBox = await sharp(croppedBox.data)
      .composite([
        {
          input: boxMask,
          blend: 'dest-in'
        }
      ])
      .png()
      .toBuffer();

    // 2. High-end Unified Tech-Blue Studio Background with Ambient & Ground Shadow
    const svgBg = `
      <svg width="${canvasSize}" height="${canvasSize}">
        <defs>
          <radialGradient id="techStudioBg" cx="50%" cy="46%" r="76%">
            <stop offset="0%" stop-color="#233a63" />
            <stop offset="42%" stop-color="#162642" />
            <stop offset="80%" stop-color="#0e172a" />
            <stop offset="100%" stop-color="#080e1a" />
          </radialGradient>
          
          <radialGradient id="groundShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(0,0,0,0.68)" />
            <stop offset="40%" stop-color="rgba(0,0,0,0.32)" />
            <stop offset="75%" stop-color="rgba(0,0,0,0.08)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0)" />
          </radialGradient>

          <!-- Subtle tech grid pattern -->
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(56, 189, 248, 0.025)" stroke-width="1"/>
          </pattern>
        </defs>
        
        <rect width="${canvasSize}" height="${canvasSize}" fill="url(#techStudioBg)" />
        <rect width="${canvasSize}" height="${canvasSize}" fill="url(#grid)" />
        
        <!-- Soft realistic ground contact shadow -->
        <ellipse cx="${canvasSize / 2}" cy="${posY + boxH + 18}" rx="${boxW * 0.46}" ry="26" fill="url(#groundShadow)" />
        <ellipse cx="${canvasSize / 2}" cy="${posY + boxH + 8}" rx="${boxW * 0.38}" ry="12" fill="rgba(0,0,0,0.48)" />
      </svg>
    `;

    const bgBuffer = Buffer.from(svgBg);

    const outDistPath = path.join(outDir, `${item.code}.jpg`);
    const outPublicPath = path.join(publicDir, `${item.code}.jpg`);

    const finalBuffer = await sharp(bgBuffer)
      .composite([
        {
          input: maskedBox,
          left: posX,
          top: posY
        }
      ])
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();

    fs.writeFileSync(outDistPath, finalBuffer);
    fs.writeFileSync(outPublicPath, finalBuffer);

    galleryItems.push({
      code: item.code,
      name: item.name,
      origFile: item.file,
      resultFile: `${item.code}.jpg`
    });

    console.log(`[${i + 1}/29] Done: ${item.code}.jpg (${item.name})`);
  }

  // Generate HTML Gallery for User Verification
  const galleryHtml = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>معرض صور غلاف المنتجات مع توحيد الخلفية التقنية</title>
  <style>
    :root {
      --bg: #0b1120;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --border: #334155;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 30px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .header h1 {
      color: var(--accent);
      margin-bottom: 10px;
      font-size: 28px;
    }
    .header p {
      color: var(--text-muted);
      font-size: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 25px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 15px 30px -5px rgba(56, 189, 248, 0.2);
    }
    .card-img-container {
      width: 100%;
      height: 320px;
      background-color: #080e1a;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card-img-container img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .card-body {
      padding: 16px 20px;
    }
    .card-code {
      display: inline-block;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: #ffffff;
      margin: 0 0 6px 0;
    }
    .card-sub {
      font-size: 13px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>معرض صور غلاف المنتجات مع توحيد الخلفية التقنية</h1>
    <p>تم الحفاظ على الغلاف الأصلي للمنتجات بدقة عالية، وتوضيح وتنعيم الحواف، ووضعها على خلفية استوديو تقنية زرقاء موحدة وناعمة.</p>
  </div>
  <div class="grid">
    ${galleryItems.map(item => `
      <div class="card">
        <div class="card-img-container">
          <img src="./${item.resultFile}" alt="${item.code}" />
        </div>
        <div class="card-body">
          <span class="card-code">كود: ${item.code}</span>
          <h3 class="card-title">${item.name}</h3>
          <span class="card-sub">الملف: ${item.resultFile}</span>
        </div>
      </div>
    `).join('')}
  </div>
</body>
</html>
  `;

  fs.writeFileSync(path.join(outDir, 'gallery.html'), galleryHtml);
  fs.writeFileSync(path.join(publicDir, 'gallery.html'), galleryHtml);
  console.log('Successfully generated gallery.html and all 29 images!');
}

processAll().catch(console.error);
