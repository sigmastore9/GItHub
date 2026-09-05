const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcDir = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia/original_raw_photos';
const outDir = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia/processed_preview';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Function to find bounding box of the package box in the image
async function detectPackageBounds(imagePath) {
  const meta = await sharp(imagePath).metadata();
  const W = meta.width;
  const H = meta.height;

  // Downsample to small thumbnail for analysis
  const sampleW = 300;
  const sampleH = 400;
  const { data } = await sharp(imagePath)
    .resize(sampleW, sampleH)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Calculate variance across columns and rows to find where the box starts/ends
  // Center is guaranteed to be package (x: 35%-65%, y: 30%-70%)
  // Background corners (top-left, top-right, bottom-left, bottom-right)
  const cornerValues = [
    data[0], data[sampleW - 1],
    data[(sampleH - 1) * sampleW], data[(sampleH - 1) * sampleW + sampleW - 1]
  ];
  const bgAvg = cornerValues.reduce((a, b) => a + b, 0) / 4;

  // Row gradient / differences
  let top = Math.round(sampleH * 0.12);
  let bottom = Math.round(sampleH * 0.90);
  let left = Math.round(sampleW * 0.15);
  let right = Math.round(sampleW * 0.85);

  // Scan from top towards center to find top edge of box
  for (let y = Math.round(sampleH * 0.05); y < Math.round(sampleH * 0.4); y++) {
    let rowDiff = 0;
    for (let x = Math.round(sampleW * 0.3); x < Math.round(sampleW * 0.7); x++) {
      rowDiff += Math.abs(data[y * sampleW + x] - data[(y - 1) * sampleW + x]);
    }
    if (rowDiff / (sampleW * 0.4) > 18) {
      top = y;
      break;
    }
  }

  // Scan from bottom towards center
  for (let y = Math.round(sampleH * 0.98); y > Math.round(sampleH * 0.6); y--) {
    let rowDiff = 0;
    for (let x = Math.round(sampleW * 0.3); x < Math.round(sampleW * 0.7); x++) {
      rowDiff += Math.abs(data[y * sampleW + x] - data[(y - 1) * sampleW + x]);
    }
    if (rowDiff / (sampleW * 0.4) > 18) {
      bottom = y;
      break;
    }
  }

  // Scan from left towards center
  for (let x = Math.round(sampleW * 0.05); x < Math.round(sampleW * 0.35); x++) {
    let colDiff = 0;
    for (let y = Math.round(sampleH * 0.3); y < Math.round(sampleH * 0.7); y++) {
      colDiff += Math.abs(data[y * sampleW + x] - data[y * sampleW + (x - 1)]);
    }
    if (colDiff / (sampleH * 0.4) > 18) {
      left = x;
      break;
    }
  }

  // Scan from right towards center
  for (let x = Math.round(sampleW * 0.95); x > Math.round(sampleW * 0.65); x--) {
    let colDiff = 0;
    for (let y = Math.round(sampleH * 0.3); y < Math.round(sampleH * 0.7); y++) {
      colDiff += Math.abs(data[y * sampleW + x] - data[y * sampleW + (x - 1)]);
    }
    if (colDiff / (sampleH * 0.4) > 18) {
      right = x;
      break;
    }
  }

  // Map back to original dimensions
  const scaleX = W / sampleW;
  const scaleY = H / sampleH;

  return {
    left: Math.max(0, Math.round(left * scaleX)),
    top: Math.max(0, Math.round(top * scaleY)),
    width: Math.min(W, Math.round((right - left) * scaleX)),
    height: Math.min(H, Math.round((bottom - top) * scaleY)),
    origW: W,
    origH: H
  };
}

async function renderStudioPackaging(origFile, codeName) {
  const fullPath = path.join(srcDir, origFile);
  const bounds = await detectPackageBounds(fullPath);

  console.log(`Processing ${codeName} (${origFile}): bounds =`, bounds);

  // Extract package box with a slight safety margin
  // Then enhance sharpness, contrast, and brightness
  const canvasSize = 1600;
  const targetBoxHeight = 1300;

  const croppedBox = await sharp(fullPath)
    .extract({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height
    })
    .resize({ height: targetBoxHeight, fit: 'inside' })
    .modulate({
      brightness: 1.02,
      saturation: 1.05
    })
    .sharpen({
      sigma: 1.5,
      m1: 1.2,
      m2: 2.2
    })
    .toBuffer({ resolveWithObject: true });

  const boxW = croppedBox.info.width;
  const boxH = croppedBox.info.height;

  const posX = Math.round((canvasSize - boxW) / 2);
  const posY = Math.round((canvasSize - boxH) / 2) - 25;

  // Create rounded rectangle mask for the box to give it smooth clean edges
  const boxMask = Buffer.from(`
    <svg width="${boxW}" height="${boxH}">
      <rect x="0" y="0" width="${boxW}" height="${boxH}" rx="18" ry="18" fill="#ffffff" />
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

  // Create unified soft tech-blue background with realistic soft contact shadow
  const svgBg = `
    <svg width="${canvasSize}" height="${canvasSize}">
      <defs>
        <!-- Soft tech blue studio gradient -->
        <radialGradient id="techStudio" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stop-color="#23385e" />
          <stop offset="50%" stop-color="#16243d" />
          <stop offset="85%" stop-color="#0e1728" />
          <stop offset="100%" stop-color="#090f1a" />
        </radialGradient>
        
        <!-- Soft contact shadow beneath box -->
        <radialGradient id="boxShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(0,0,0,0.65)" />
          <stop offset="35%" stop-color="rgba(0,0,0,0.35)" />
          <stop offset="70%" stop-color="rgba(0,0,0,0.1)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      
      <rect width="${canvasSize}" height="${canvasSize}" fill="url(#techStudio)" />
      
      <!-- Ground shadow -->
      <ellipse cx="${canvasSize / 2}" cy="${posY + boxH + 18}" rx="${boxW * 0.48}" ry="24" fill="url(#boxShadow)" />
      <ellipse cx="${canvasSize / 2}" cy="${posY + boxH + 10}" rx="${boxW * 0.40}" ry="12" fill="rgba(0,0,0,0.45)" />
    </svg>
  `;

  const bgBuffer = Buffer.from(svgBg);

  const finalOutput = await sharp(bgBuffer)
    .composite([
      {
        input: maskedBox,
        left: posX,
        top: posY
      }
    ])
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toFile(path.join(outDir, `${codeName}.jpg`));

  console.log(`Saved ${codeName}.jpg`);
}

async function run() {
  const list = [
    { orig: 'IMG_20260830_190959.jpg', code: 'M114' },
    { orig: 'IMG_20260830_191001.jpg', code: 'M104_White' },
    { orig: 'IMG_20260830_191011.jpg', code: 'DM6' },
    { orig: 'IMG_20260830_191118.jpg', code: 'CS32B' },
    { orig: 'IMG_20260830_191147.jpg', code: 'Z58' }
  ];

  for (const item of list) {
    await renderStudioPackaging(item.orig, item.code);
  }
}

run().catch(console.error);
