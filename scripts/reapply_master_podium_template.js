const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const masterTemplatePath = path.join(__dirname, '../public/master_podium_template.jpg');
const publicItemsDir = path.join(__dirname, '../public/itemsMedia');
const distItemsDir = path.join(__dirname, '../dist/MY Store-win32-x64/itemsMedia');
const distAppItemsDir = path.join(__dirname, '../dist/MY Store-win32-x64/resources/app/public/itemsMedia');

async function processAllProducts() {
  console.log('===============================================================');
  console.log('  🎯 REAPPLYING EXACT CS27B PODIUM & LIGHTING TEMPLATE TO ALL');
  console.log('===============================================================');

  if (!fs.existsSync(masterTemplatePath)) {
    throw new Error('Master template not found at ' + masterTemplatePath);
  }

  const masterTemplateBuffer = fs.readFileSync(masterTemplatePath);
  const files = fs.readdirSync(publicItemsDir).filter(f => f.endsWith('.jpg'));

  console.log(`Found ${files.length} product images to process...`);

  for (const filename of files) {
    const srcPath = path.join(publicItemsDir, filename);

    try {
      console.log(`Processing [${filename}]...`);
      const srcBuffer = fs.readFileSync(srcPath);

      // 1. Process and size the product box
      // Target box height ~780px to sit proportionally on top of podium at y=880
      const boxBuffer = await sharp(srcBuffer)
        .resize(560, 780, { fit: 'inside' })
        .sharpen({ sigma: 1.5, m1: 1.1, m2: 2.2 })
        .modulate({ brightness: 1.03, saturation: 1.08 })
        .toBuffer();

      const boxMeta = await sharp(boxBuffer).metadata();

      // Horizontal centering
      const left = Math.round((1024 - boxMeta.width) / 2);
      // Place the bottom of the box directly on the podium top plane (y = 880)
      const top = Math.max(90, 880 - boxMeta.height);

      // 2. Generate a soft custom contact shadow matching the exact box width
      const shadowWidth = Math.round(boxMeta.width * 1.1);
      const shadowHeight = 44;
      const shadowSvg = `
        <svg width="${shadowWidth}" height="${shadowHeight}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="boxShadow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="rgba(0,0,0,0.88)" />
              <stop offset="60%" stop-color="rgba(5,10,18,0.45)" />
              <stop offset="100%" stop-color="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>
          <ellipse cx="${shadowWidth / 2}" cy="${shadowHeight / 2}" rx="${shadowWidth / 2}" ry="${shadowHeight / 2}" fill="url(#boxShadow)" />
        </svg>
      `;
      const shadowBuffer = await sharp(Buffer.from(shadowSvg)).png().toBuffer();
      const shadowLeft = Math.round((1024 - shadowWidth) / 2);
      const shadowTop = top + boxMeta.height - 20;

      // 3. Composite everything onto the exact master background template
      const outputBuffer = await sharp(masterTemplateBuffer)
        .composite([
          {
            input: shadowBuffer,
            top: Math.min(1024 - shadowHeight, shadowTop),
            left: Math.max(0, shadowLeft),
            blend: 'multiply'
          },
          {
            input: boxBuffer,
            top: top,
            left: left,
            blend: 'over'
          }
        ])
        .jpeg({ quality: 96 })
        .toBuffer();

      fs.writeFileSync(srcPath, outputBuffer);
      console.log(`✓ Completed: ${filename} (Box: ${boxMeta.width}x${boxMeta.height} at top: ${top})`);
    } catch (err) {
      console.error(`Error processing ${filename}:`, err.message);
    }
  }

  // 4. Synchronize to all dist and app directories
  console.log('---------------------------------------------------------------');
  console.log('  🔄 Synchronizing to Desktop App and Dist Folders...');
  console.log('---------------------------------------------------------------');

  for (const file of files) {
    const src = path.join(publicItemsDir, file);
    fs.copyFileSync(src, path.join(distItemsDir, file));
    fs.copyFileSync(src, path.join(distAppItemsDir, file));
  }

  console.log(`===============================================================`);
  console.log(`  🎉 SUCCESS! ALL ${files.length} PRODUCTS STRICTLY UNIFIED TO TEMPLATE`);
  console.log(`===============================================================`);
}

processAllProducts().catch(console.error);
