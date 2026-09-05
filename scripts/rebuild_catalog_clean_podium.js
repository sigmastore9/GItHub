const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rawProductsDir = path.join(__dirname, '../public/images/products');
const masterTemplatePath = path.join(__dirname, '../public/master_podium_template.jpg');
const publicItemsDir = path.join(__dirname, '../public/itemsMedia');
const distItemsDir = path.join(__dirname, '../dist/MY Store-win32-x64/itemsMedia');
const distAppItemsDir = path.join(__dirname, '../dist/MY Store-win32-x64/resources/app/public/itemsMedia');

async function rebuildAllProductsCleanly() {
  console.log('===============================================================');
  console.log('  🎨 GENERATING CLEAN FULL-SIZE PRODUCTS ON FIXED PODIUM TEMPLATE');
  console.log('===============================================================');

  if (!fs.existsSync(masterTemplatePath)) {
    throw new Error('Master template not found at ' + masterTemplatePath);
  }

  const masterTemplateBuffer = fs.readFileSync(masterTemplatePath);

  // Map of primary catalog image filenames
  const targetProducts = [
    'CS27B.jpg', 'CS32B.jpg', 'DM6.jpg', 'E37.jpg', 'EQ33.jpg',
    'HB1A.jpg', 'HB51.jpg', 'M001-C.jpg', 'M001-I.jpg', 'M104_Black.jpg',
    'M104_White.jpg', 'M114.jpg', 'MA-05.jpg', 'MA-06.jpg', 'MA-09.jpg',
    'ME-01.jpg', 'U95.jpg', 'UA17.jpg', 'UD6.jpg', 'UK_20W_Set.jpg',
    'W112.jpg', 'X117.jpg', 'X118.jpg', 'X122.jpg', 'X59.jpg',
    'X76.jpg', 'X87.jpg', 'X96.jpg', 'Z58.jpg', 'brand_glass.jpg', 'diamond.jpg'
  ];

  for (const filename of targetProducts) {
    const rawPath = path.join(rawProductsDir, filename);
    const destPath = path.join(publicItemsDir, filename);

    if (!fs.existsSync(rawPath)) {
      console.warn(`Raw image for ${filename} not found in raw products dir!`);
      continue;
    }

    try {
      // 1. Cleanly trim the product packaging to eliminate any background borders
      const trimmedBox = await sharp(rawPath)
        .trim({ threshold: 25 })
        .toBuffer({ resolveWithObject: true });

      const rawWidth = trimmedBox.info.width;
      const rawHeight = trimmedBox.info.height;
      const isSquareOrWide = (rawWidth / rawHeight) > 0.75;

      // 2. Scale proportionally to sit prominent and large on the master podium
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

      // 3. Position the product box centered horizontally, resting directly on the stone podium
      const left = Math.round((1024 - boxW) / 2);
      const top = Math.max(90, 875 - boxH);

      // 4. Create natural contact drop shadow matching box width
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

      // 5. Composite onto master podium template
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

      fs.writeFileSync(destPath, outputBuffer);

      // Mirror to dist and app folders
      if (fs.existsSync(distItemsDir)) {
        fs.writeFileSync(path.join(distItemsDir, filename), outputBuffer);
      }
      if (fs.existsSync(distAppItemsDir)) {
        fs.writeFileSync(path.join(distAppItemsDir, filename), outputBuffer);
      }

      console.log(`✓ Cleanly generated [${filename}]: ${boxW}x${boxH} on podium at (x:${left}, y:${top})`);
    } catch (err) {
      console.error(`Error processing ${filename}:`, err.message);
    }
  }

  console.log('===============================================================');
  console.log('  🎉 ALL CATALOG IMAGES CLEANLY REGENERATED ON MASTER TEMPLATE');
  console.log('===============================================================');
}

rebuildAllProductsCleanly().catch(console.error);
