/**
 * Product Image Downloader
 * يقوم بجلب وتحميل صور المنتجات من أي رابط وتخزينها بأعلى دقة متاحة في مجلد فرعي باسم المنتج.
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// إعدادات المجلد الرئيسي لحفظ الصور
const BASE_DOWNLOAD_DIR = path.join(__dirname, '..', 'downloaded_product_images');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
];

/**
 * تنظيف اسم المجلد من الحروف الممنوعة في نظام ويندوز
 */
function sanitizeFolderName(name) {
  if (!name) return 'Product_' + Date.now();
  // إزالة وسوم HTML
  let clean = name.replace(/<[^>]+>/g, '');
  // فك رموز وتشفيرات HTML (الرقمية والاسمية)
  clean = clean
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // إزالة علامات التنصيص الملتوية والعادية
  clean = clean.replace(/[“”"']/g, '');
  // إزالة الحروف غير المسموح بها في ويندوز \ / : * ? " < > |
  clean = clean.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  // تقليص الطول إلى 70 حرفاً كحد أقصى لمنع أخطاء مسارات ويندوز
  return clean.slice(0, 70) || ('Product_' + Date.now());
}

/**
 * استخراج اسم المنتج من الصفحة بدقة
 */
function extractProductTitle(html, targetUrl) {
  // 1. وسم h1 الخاص بعنوان المنتج في ووكومرس والمتاجر
  const h1Match = html.match(/<h1[^>]*class=["'][^"']*product_title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
                  html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const clean = h1Match[1].replace(/<[^>]+>/g, '').trim();
    if (clean) return clean;
  }

  // 2. وسم Open Graph og:title
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogTitleMatch && ogTitleMatch[1].trim()) {
    return ogTitleMatch[1].trim();
  }

  // 3. وسم <title>
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    let clean = titleMatch[1].replace(/<[^>]+>/g, '').split(/[-–|]/)[0].trim();
    if (clean) return clean;
  }

  // 4. الجزء الأخير من مسار الرابط (Slug)
  try {
    const parsed = new URL(targetUrl);
    const slug = parsed.pathname.split('/').filter(Boolean).pop();
    if (slug) return slug;
  } catch {}

  return 'Product_' + Date.now();
}

/**
 * فحص هل الرابط صورة صالحة لمنتج واستبعاد الأيقونات والإعلانات
 */
function isValidProductImageUrl(imgUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return false;
  const lower = imgUrl.toLowerCase();

  // استبعاد ملفات SVG والرموز التعبيرية واللوجوهات والأيقونات التافهة
  if (lower.endsWith('.svg') || lower.includes('.svg?')) return false;
  if (lower.includes('data:image')) return false;
  if (lower.includes('blank.gif') || lower.includes('spacer.gif') || lower.includes('pixel')) return false;
  if (lower.includes('logo') && !lower.includes('product-logo')) return false;
  if (lower.includes('favicon') || lower.includes('avatar') || lower.includes('badge')) return false;
  if (lower.includes('icon-') || lower.includes('/icons/') || lower.includes('star-')) return false;
  if (lower.includes('payment') || lower.includes('visa') || lower.includes('mastercard')) return false;

  return true;
}

/**
 * تنظيف وتكبير دقة الرابط لأعلى جودة ممكنة (إزالة معلمات التصغير)
 */
function maximizeImageResolution(imgUrl) {
  try {
    let clean = imgUrl.replace(/&amp;/g, '&');

    // إزالة أبعاد ووردبريس الشائعة مثل -300x300.jpg أو -600x600.png أو -100x100.jpg
    clean = clean.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp|avif))(\?.*)?$/i, '$1$2');

    // إزالة معلمات Shopify مثل _small, _medium, _compact, _100x100
    clean = clean.replace(/_(?:small|medium|compact|large|grande|\d+x\d*)(\.(?:jpe?g|png|webp|avif))(\?.*)?$/i, '$1$2');

    // تحويل معلمات العرض لـ AliExpress و CDN
    const parsed = new URL(clean);
    if (parsed.searchParams.has('width')) parsed.searchParams.delete('width');
    if (parsed.searchParams.has('crop')) parsed.searchParams.delete('crop');

    return parsed.toString();
  } catch {
    return imgUrl;
  }
}

/**
 * استخراج صور المنتجات من نص HTML
 */
function extractProductImagesFromHtml(html, baseUrl) {
  const imageUrls = new Set();

  function addUrl(rawUrl) {
    if (!rawUrl) return;
    rawUrl = rawUrl.trim().replace(/^["']|["']$/g, '');
    if (!rawUrl) return;

    // فك رموز HTML
    rawUrl = rawUrl.replace(/&amp;/g, '&');

    // التعامل مع الروابط النسبية
    if (rawUrl.startsWith('//')) {
      rawUrl = 'https:' + rawUrl;
    } else if (rawUrl.startsWith('/')) {
      try {
        const u = new URL(baseUrl);
        rawUrl = `${u.origin}${rawUrl}`;
      } catch {}
    } else if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      try {
        rawUrl = new URL(rawUrl, baseUrl).href;
      } catch {}
    }

    if (isValidProductImageUrl(rawUrl)) {
      const maximized = maximizeImageResolution(rawUrl);
      imageUrls.add(maximized);
    }
  }

  // 1. فحص مجلدات الرفع wp-content/uploads الخاصة بالمنتج في ووردبريس وهوكو
  const wpMatches = html.matchAll(/(https?:\/\/[^\s"'<>]+\/wp-content\/uploads\/\d{4}\/\d{2}\/[^\s"'<>]+\.(?:jpe?g|png|webp|avif))/gi);
  for (const m of wpMatches) {
    addUrl(m[1]);
  }

  // 2. فحص JSON-LD (Schema.org Product)
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      const checkObj = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj.image) {
          if (typeof obj.image === 'string') addUrl(obj.image);
          else if (Array.isArray(obj.image)) obj.image.forEach(img => addUrl(typeof img === 'string' ? img : img.url));
          else if (obj.image.url) addUrl(obj.image.url);
        }
        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === 'object') checkObj(obj[key]);
        }
      };
      if (Array.isArray(parsed)) parsed.forEach(checkObj);
      else checkObj(parsed);
    } catch {}
  }

  // 3. فحص بيانات Open Graph و Twitter Cards
  const ogMatches = html.matchAll(/<meta\s+property=["']og:image(?::secure_url)?["']\s+content=["']([^"']+)["']/gi);
  for (const m of ogMatches) addUrl(m[1]);

  const ogMatchesAlt = html.matchAll(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image(?::secure_url)?["']/gi);
  for (const m of ogMatchesAlt) addUrl(m[1]);

  const twMatches = html.matchAll(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/gi);
  for (const m of twMatches) addUrl(m[1]);

  // 4. فحص معارض الصور وخصائص التكبير (zoom, large, high-res)
  const highResMatches = html.matchAll(/(?:data-zoom-image|data-large_image|data-large-img|data-high-res|data-full|data-zoom|data-src|data-original)=["']([^"']+)["']/gi);
  for (const m of highResMatches) addUrl(m[1]);

  // 5. فحص srcset واختيار أكبر صورة
  const srcsetMatches = html.matchAll(/srcset=["']([^"']+)["']/gi);
  for (const m of srcsetMatches) {
    const parts = m[1].split(',');
    for (const part of parts) {
      const tokens = part.trim().split(/\s+/);
      if (tokens[0]) addUrl(tokens[0]);
    }
  }

  // 6. فحص وسوم img العادية
  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const m of imgMatches) addUrl(m[1]);

  // 7. فحص روابط معارض الصور داخل <a>
  const aMatches = html.matchAll(/<a[^>]+href=["']([^"']+\.(?:jpe?g|png|webp|avif))(?:\?[^"']*)?["']/gi);
  for (const m of aMatches) addUrl(m[1]);

  return Array.from(imageUrls);
}

/**
 * تنزيل صفحة الويب مع التعامل مع الأخطاء وإعادة المحاولة
 */
async function fetchHtmlPage(targetUrl) {
  const userAgent = USER_AGENTS[0];
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`فشل جلب الصفحة: HTTP ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

/**
 * تنزيل صورة واحدة وحفظها في المسار المحدد
 */
async function downloadSingleImage(imgUrl, savePath) {
  const userAgent = USER_AGENTS[0];
  const response = await fetch(imgUrl, {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Referer': imgUrl
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // التأكد من أن الملف ليس فارغاً أو بكسل تتبع صغير جداً (< 5KB)
  if (buffer.length < 5120) {
    return { skipped: true, reason: 'حجم الملف أصغر من 5 كيلوبايت (أيقونة أو بكسل تتبع)' };
  }

  fs.writeFileSync(savePath, buffer);
  return { skipped: false, size: buffer.length };
}

/**
 * الدالة الرئيسية لتنزيل كافة صور المنتج من الرابط في مجلد فرعي باسم المنتج
 */
async function downloadProductImages(targetUrl, baseDir = BASE_DOWNLOAD_DIR, customSubfolder = null) {
  console.log(`\n==================================================`);
  console.log(`🌐 بدء فحص الرابط: ${targetUrl}`);
  console.log(`==================================================\n`);

  // 1. جلب محتوى الصفحة
  console.log(`⏳ جاري تحميل الصفحة واستخراج بيانات المنتج...`);
  const html = await fetchHtmlPage(targetUrl);

  // 2. استخراج اسم المنتج وتجهيز المجلد الفرعي
  const detectedTitle = extractProductTitle(html, targetUrl);
  const folderName = customSubfolder ? sanitizeFolderName(customSubfolder) : sanitizeFolderName(detectedTitle);
  const targetDir = path.join(baseDir, folderName);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`📦 اسم المنتج المكتشف: "${detectedTitle}"`);
  console.log(`📁 مجلد الحفظ المخصص: ${targetDir}\n`);

  // 3. استخراج الروابط
  const images = extractProductImagesFromHtml(html, targetUrl);
  console.log(`🔍 تم العثور على ${images.length} رابط صور فريد.`);

  if (images.length === 0) {
    console.log(`⚠️ لم يتم العثور على صور منتجات واضحة في الرابط.`);
    return { success: false, count: 0, images: [], folder: targetDir };
  }

  const downloadedFiles = [];
  let index = 1;

  for (const imgUrl of images) {
    try {
      let ext = path.extname(new URL(imgUrl).pathname);
      if (!ext || ext.length > 5 || !['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext.toLowerCase())) {
        ext = '.jpg';
      }

      // استخدام بادئة مختصرة ونظيفة لاسم الصورة
      const shortPrefix = folderName.split(' ').slice(0, 4).join('_');
      const fileName = `${shortPrefix}_${String(index).padStart(2, '0')}${ext}`;
      const filePath = path.join(targetDir, fileName);

      process.stdout.write(`⬇️ جاري تحميل الصورة [${index}/${images.length}]: `);
      const res = await downloadSingleImage(imgUrl, filePath);

      if (res.skipped) {
        console.log(`⏩ تم التخطي (${res.reason})`);
      } else {
        const sizeKb = (res.size / 1024).toFixed(1);
        console.log(`✅ تم الحفظ: ${fileName} (${sizeKb} KB)`);
        downloadedFiles.push({ fileName, filePath, sizeKb, url: imgUrl });
        index++;
      }
    } catch (err) {
      console.log(`❌ فشل تنزيل الصورة: ${err.message}`);
    }
  }

  console.log(`\n🎉 اكتمل التنزيل بنجاح!`);
  console.log(`📦 إجمالي الصور المحفوظة: ${downloadedFiles.length} صورة.`);
  console.log(`📂 مسار المجلد: ${targetDir}\n`);

  return {
    success: true,
    productName: detectedTitle,
    folderName: folderName,
    count: downloadedFiles.length,
    downloadDir: targetDir,
    files: downloadedFiles
  };
}

// تشغيل السكربت عبر سطر الأوامر إن تم تمرير رابط
if (require.main === module) {
  const args = process.argv.slice(2);
  const targetUrl = args[0];
  const customSub = args[1] || null;

  if (!targetUrl) {
    console.log(`الاستخدام: node scripts/download_product_images.js <URL> [SUBFOLDER_NAME]`);
    process.exit(1);
  }

  downloadProductImages(targetUrl, BASE_DOWNLOAD_DIR, customSub)
    .then((res) => {
      console.log(JSON.stringify({ success: res.success, count: res.count, dir: res.downloadDir }));
      process.exit(0);
    })
    .catch((err) => {
      console.error(`❌ خطأ:`, err.message);
      process.exit(1);
    });
}

module.exports = { downloadProductImages, extractProductImagesFromHtml, extractProductTitle };
