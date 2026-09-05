const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcDir = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia/original_raw_photos';
const debugDir = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia/debug_boxes';

if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true });
}

const mapping = [
  { file: 'IMG_20260830_190959.jpg', code: 'M114' },
  { file: 'IMG_20260830_191001.jpg', code: 'M104_White' },
  { file: 'IMG_20260830_191004.jpg', code: 'M104_Black' },
  { file: 'IMG_20260830_191008.jpg', code: 'MA-09' },
  { file: 'IMG_20260830_191011.jpg', code: 'DM6' },
  { file: 'IMG_20260830_191017.jpg', code: 'MA-05' },
  { file: 'IMG_20260830_191030.jpg', code: 'X87' },
  { file: 'IMG_20260830_191035.jpg', code: 'X59' },
  { file: 'IMG_20260830_191038.jpg', code: 'M001-C' },
  { file: 'IMG_20260830_191041.jpg', code: 'X122' },
  { file: 'IMG_20260830_191044.jpg', code: 'M001-I' },
  { file: 'IMG_20260830_191047.jpg', code: 'X118' },
  { file: 'IMG_20260830_191049.jpg', code: 'X117' },
  { file: 'IMG_20260830_191053.jpg', code: 'MA-06' },
  { file: 'IMG_20260830_191055.jpg', code: 'U95' },
  { file: 'IMG_20260830_191100.jpg', code: 'E37' },
  { file: 'IMG_20260830_191104.jpg', code: 'HB51' },
  { file: 'IMG_20260830_191106.jpg', code: 'HB1A' },
  { file: 'IMG_20260830_191109.jpg', code: 'X76' },
  { file: 'IMG_20260830_191112.jpg', code: 'UD6' },
  { file: 'IMG_20260830_191115.jpg', code: 'UA17' },
  { file: 'IMG_20260830_191118.jpg', code: 'CS32B' },
  { file: 'IMG_20260830_191121.jpg', code: 'CS27B' },
  { file: 'IMG_20260830_191124.jpg', code: 'X96' },
  { file: 'IMG_20260830_191126.jpg', code: 'UK_20W_Set' },
  { file: 'IMG_20260830_191134.jpg', code: 'EQ33' },
  { file: 'IMG_20260830_191141.jpg', code: 'ME-01' },
  { file: 'IMG_20260830_191147.jpg', code: 'Z58' },
  { file: 'IMG_20260830_191155.jpg', code: 'W112' }
];

async function detectBox(imagePath) {
  const meta = await sharp(imagePath).metadata();
  const W = meta.width;
  const H = meta.height;

  // Analysis grid
  const sw = 300;
  const sh = 400;

  const { data } = await sharp(imagePath)
    .resize(sw, sh)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Compute color differences / gradients
  // Pixel at (x, y) = rgb at (y * sw + x) * 3
  function getRGB(x, y) {
    const idx = (y * sw + x) * 3;
    return [data[idx], data[idx + 1], data[idx + 2]];
  }

  function colorDist(c1, c2) {
    return Math.sqrt((c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2);
  }

  // Find column gradients to locate left and right bounds of box
  // The center 40% vertical band is the body of the box (y: 30% to 70%)
  const yStart = Math.round(sh * 0.35);
  const yEnd = Math.round(sh * 0.65);

  let maxLeftGrad = 0, bestLeft = Math.round(sw * 0.15);
  for (let x = 10; x < Math.round(sw * 0.45); x++) {
    let gradSum = 0;
    for (let y = yStart; y <= yEnd; y++) {
      gradSum += colorDist(getRGB(x, y), getRGB(x - 2, y));
    }
    if (gradSum > maxLeftGrad) {
      maxLeftGrad = gradSum;
      bestLeft = x;
    }
  }

  let maxRightGrad = 0, bestRight = Math.round(sw * 0.85);
  for (let x = Math.round(sw * 0.55); x < sw - 10; x++) {
    let gradSum = 0;
    for (let y = yStart; y <= yEnd; y++) {
      gradSum += colorDist(getRGB(x, y), getRGB(x + 2, y));
    }
    if (gradSum > maxRightGrad) {
      maxRightGrad = gradSum;
      bestRight = x;
    }
  }

  // Find top and bottom bounds of box using horizontal gradient in [bestLeft+10, bestRight-10]
  const xStart = Math.round(bestLeft + (bestRight - bestLeft) * 0.25);
  const xEnd = Math.round(bestLeft + (bestRight - bestLeft) * 0.75);

  let maxTopGrad = 0, bestTop = Math.round(sh * 0.15);
  for (let y = 15; y < Math.round(sh * 0.45); y++) {
    let gradSum = 0;
    for (let x = xStart; x <= xEnd; x++) {
      gradSum += colorDist(getRGB(x, y), getRGB(x, y - 2));
    }
    if (gradSum > maxTopGrad) {
      maxTopGrad = gradSum;
      bestTop = y;
    }
  }

  let maxBottomGrad = 0, bestBottom = Math.round(sh * 0.88);
  for (let y = Math.round(sh * 0.55); y < sh - 15; y++) {
    let gradSum = 0;
    for (let x = xStart; x <= xEnd; x++) {
      gradSum += colorDist(getRGB(x, y), getRGB(x, y + 2));
    }
    if (gradSum > maxBottomGrad) {
      maxBottomGrad = gradSum;
      bestBottom = y;
    }
  }

  const scaleX = W / sw;
  const scaleY = H / sh;

  const left = Math.max(0, Math.round(bestLeft * scaleX));
  const top = Math.max(0, Math.round(bestTop * scaleY));
  const width = Math.min(W - left, Math.round((bestRight - bestLeft) * scaleX));
  const height = Math.min(H - top, Math.round((bestBottom - bestTop) * scaleY));

  return { left, top, width, height, sw, sh, bestLeft, bestRight, bestTop, bestBottom };
}

async function debugAll() {
  const results = {};
  for (const item of mapping) {
    const fullPath = path.join(srcDir, item.file);
    const bounds = await detectBox(fullPath);
    results[item.code] = bounds;
    console.log(`[${item.code}] left:${bounds.left}, top:${bounds.top}, w:${bounds.width}, h:${bounds.height}`);
  }
  fs.writeFileSync('C:/progect/MY store/scripts/detected_bounds.json', JSON.stringify(results, null, 2));
}

debugAll().catch(console.error);
