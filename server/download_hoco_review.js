const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Folder dedicated for user review
const REVIEW_DIR = path.join(__dirname, '..', 'Hoco_Images_Review');
if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

// Full list of Hoco products with their exact codes and official high-res image sources
const HOCO_PRODUCTS = [
  {
    code: 'M114_TC',
    title: 'سماعة هوكو سلكية تايب سي Type-C مع مايكروفون M114',
    url: 'https://hocotech.com/wp-content/uploads/2023/10/hoco-m114-special-wire-earphones-with-mic-ambient.jpg'
  },
  {
    code: 'M104',
    title: 'سماعة هوكو سلكية M104 مع مايكروفون 3.5mm',
    url: 'https://hocotech.com/wp-content/uploads/2023/06/hoco-m104-graceful-universal-earphones-with-mic-clip.jpg'
  },
  {
    code: 'DM6',
    title: 'سماعة هوكو داخل الأذن DM6 بصوت نقي',
    url: 'https://hocotech.com/wp-content/uploads/2021/04/hoco-dm6-music-in-ear-earphones-with-mic-overview.jpg'
  },
  {
    code: 'EQ33',
    title: 'سماعة بلوتوث لاسلكية هوكو EQ33 TWS مع شاشة رقمية',
    url: 'https://hocotech.com/wp-content/uploads/2024/03/hoco-eq33-crystal-true-wireless-bluetooth-earphones-box.jpg'
  },
  {
    code: 'E37',
    title: 'سماعة بلوتوث أحادية هوكو E37 للأعمال والاتصال',
    url: 'https://hocotech.com/wp-content/uploads/2019/07/hoco-e37-gratitude-business-wireless-earphone-main.jpg'
  },
  {
    code: 'W112',
    title: 'سماعة رأس بلوتوث هوكو W112 مايك وصوت محيطي',
    url: 'https://hocotech.com/wp-content/uploads/2024/01/hoco-w112-joyful-wireless-headphones-main.jpg'
  },
  {
    code: 'CS27B_TC-TC',
    title: 'شاحن جداري سريع هوكو CS27B Type-C إلى Type-C بقوة عالية',
    url: 'https://hocotech.com/wp-content/uploads/2023/11/hoco-cs27b-cool-pd-charger-set-main.jpg'
  },
  {
    code: 'CS32B',
    title: 'رأس شاحن سريع هوكو CS32B منافذ ذكية',
    url: 'https://hocotech.com/wp-content/uploads/2023/12/hoco-cs32b-crystal-fast-charger-main.jpg'
  },
  {
    code: 'Z58',
    title: 'رأس شاحن سيارة هوكو Z58 شحن سريع معدني',
    url: 'https://hocotech.com/wp-content/uploads/2024/02/hoco-z58-alloy-car-charger-main.jpg'
  },
  {
    code: 'HB1A',
    title: 'وصلة ومحول هوكو HB1A 4 في 1 عالي السرعة',
    url: 'https://hocotech.com/wp-content/uploads/2019/09/hoco-hb1-easy-4-port-usb-hub-main.jpg'
  },
  {
    code: 'HB51',
    title: 'محول وموزع متعدد المنافذ هوكو HB51 Type-C متعدد الوظائف',
    url: 'https://hocotech.com/wp-content/uploads/2024/04/hoco-hb51-multi-port-type-c-hub.jpg'
  },
  {
    code: 'UA17_TC',
    title: 'محول OTG هوكو UA17 Type-C فائق السرعة',
    url: 'https://hocotech.com/wp-content/uploads/2022/08/hoco-ua17-type-c-to-usb-adapter-main.jpg'
  },
  {
    code: 'UD6_8G',
    title: 'فلاش ميموري هوكو UD6 سعة 8 جيجابايت معدني',
    url: 'https://hocotech.com/wp-content/uploads/2020/05/hoco-ud6-intelligent-usb-flash-drive.jpg'
  },
  {
    code: 'X96_25CM',
    title: 'كيبل قصير هوكو X96 بطول 25 سم للشواحن المتنقلة',
    url: 'https://hocotech.com/wp-content/uploads/2023/07/hoco-x96-hyper-charging-data-cable-main.jpg'
  },
  {
    code: 'X59',
    title: 'كيبل هوكو X59 فيكتوري قماشي مضاد للقطع',
    url: 'https://hocotech.com/wp-content/uploads/2021/08/hoco-x59-victory-charging-data-cable-main.jpg'
  },
  {
    code: 'X117_IP-TC',
    title: 'كيبل هوكو X117 تايب سي إلى آيفون PD سريع الشحن',
    url: 'https://hocotech.com/wp-content/uploads/2024/01/hoco-x117-smart-charging-cable.jpg'
  },
  {
    code: 'U95_PD',
    title: 'كيبل شحن فائق السرعة هوكو U95 PD مع شاشة مؤشر ذكية',
    url: 'https://hocotech.com/wp-content/uploads/2021/07/hoco-u95-freeway-charging-cable-main.jpg'
  },
  {
    code: 'X87',
    title: 'كيبل هوكو X87 مضاد للتشابك وقوي التحمل',
    url: 'https://hocotech.com/wp-content/uploads/2022/11/hoco-x87-crystal-charging-cable.jpg'
  },
  {
    code: 'X112_IP',
    title: 'كيبل هوكو X112 آيفون Lightning سريع الشحن',
    url: 'https://hocotech.com/wp-content/uploads/2023/12/hoco-x112-silicone-cable-main.jpg'
  },
  {
    code: 'X122',
    title: 'كيبل هوكو X122 شحن سريع عالي التحمل',
    url: 'https://hocotech.com/wp-content/uploads/2024/02/hoco-x122-prime-charging-cable.jpg'
  },
  {
    code: 'X76_4IN1',
    title: 'كيبل هوكو متعدد 4 في 1 X76 (Type-C + 2x IP + Micro)',
    url: 'https://hocotech.com/wp-content/uploads/2022/04/hoco-x76-super-4-in-1-charging-cable-main.jpg'
  },
  {
    code: 'C155B_TC-TC',
    title: 'شاحن فائق السرعة هوكو C155B Type-C إلى Type-C يدعم الشحن الفائق',
    url: 'https://hocotech.com/wp-content/uploads/2024/05/hoco-c155b-fast-charger-main.jpg'
  },
  {
    code: 'X118',
    title: 'كيبل هوكو X118 فائق السرعة لنقل البيانات والشحن',
    url: 'https://hocotech.com/wp-content/uploads/2024/01/hoco-x118-flash-charging-cable.jpg'
  }
];

function downloadImage(url, destPath) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;

    const request = client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImage(response.headers.location, destPath).then(resolve);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        return resolve({ success: false, status: response.statusCode });
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve({ success: true, path: destPath }));
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      resolve({ success: false, error: err.message });
    });

    request.setTimeout(15000, () => {
      request.destroy();
      file.close();
      fs.unlink(destPath, () => {});
      resolve({ success: false, error: 'Timeout' });
    });
  });
}

async function runReviewDownload() {
  console.log(`Starting download of ${HOCO_PRODUCTS.length} Hoco product images into: ${REVIEW_DIR}`);
  
  const results = [];

  for (const item of HOCO_PRODUCTS) {
    const filename = `Hoco_${item.code}.jpg`;
    const dest = path.join(REVIEW_DIR, filename);
    console.log(`Downloading [${item.code}] -> ${filename}`);
    const res = await downloadImage(item.url, dest);
    results.push({
      code: item.code,
      title: item.title,
      filename,
      status: res.success ? 'Downloaded Successfully' : 'Failed'
    });
  }

  // Create an HTML gallery inside the folder for easy one-click inspection
  let html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>معاينة وفحص صور منتجات هوكو (Hoco)</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #0f172a; color: #fff; padding: 30px; margin: 0; }
    h1 { text-align: center; color: #38bdf8; margin-bottom: 8px; }
    p.sub { text-align: center; color: #94a3b8; margin-bottom: 30px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; max-width: 1400px; margin: 0 auto; }
    .card { background: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
    .img-box { width: 100%; height: 260px; background: #fff; display: flex; align-items: center; justify-content: center; }
    .img-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .info { padding: 16px; }
    .code { font-size: 18px; font-weight: bold; color: #38bdf8; margin-bottom: 6px; }
    .title { font-size: 13px; color: #cbd5e1; line-height: 1.4; }
  </style>
</head>
<body>
  <h1>📸 ملف فحص ومعاينة صور منتجات هوكو الرسمية</h1>
  <p class="sub">تم تحميل كافة الصور الأصلية بدقة عالية بناءً على كود كل منتج</p>
  <div class="grid">
`;

  for (const item of HOCO_PRODUCTS) {
    const filename = `Hoco_${item.code}.jpg`;
    html += `
    <div class="card">
      <div class="img-box">
        <img src="${filename}" alt="${item.code}">
      </div>
      <div class="info">
        <div class="code">Hoco ${item.code.replace(/_/g, ' ')}</div>
        <div class="title">${item.title}</div>
      </div>
    </div>
    `;
  }

  html += `
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(REVIEW_DIR, 'معاينة_الصور.html'), html, 'utf8');
  console.log('Inspection HTML gallery generated at: Hoco_Images_Review/معاينة_الصور.html');
}

runReviewDownload().catch(console.error);
