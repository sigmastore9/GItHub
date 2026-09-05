const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const brainDir = 'C:/Users/marcoax/.gemini/antigravity/brain/e0d4ebd3-0648-4772-b65d-a78ddc499512';
const masterBgPath = path.join(brainDir, 'master_studio_bg_1788287608753.jpg');
const publicItemsDir = path.join(__dirname, '../public/itemsMedia');
const distItemsDir = path.join(__dirname, '../dist/MY Store-win32-x64/itemsMedia');
const distAppItemsDir = path.join(__dirname, '../dist/MY Store-win32-x64/resources/app/public/itemsMedia');

// List of AI-generated high-res studio images already matched to template
const aiGeneratedMap = {
  'CS32B.jpg': path.join(brainDir, 'cs32b_enhanced_box_1788287124194.jpg'),
  'EQ33.jpg': path.join(brainDir, 'eq33_enhanced_box_1788287144346.jpg'),
  'W112.jpg': path.join(brainDir, 'w112_enhanced_box_1788287161704.jpg'),
  'Z58.jpg': path.join(brainDir, 'z58_enhanced_box_1788287180865.jpg'),
  'CS27B.jpg': path.join(brainDir, 'cs27b_enhanced_box_1788287200835.jpg'),
  'M114.jpg': path.join(brainDir, 'm114_enhanced_box_1788287220124.jpg'),
  'E37.jpg': path.join(brainDir, 'e37_enhanced_box_1788287255547.jpg'),
  'X59.jpg': path.join(brainDir, 'x59_enhanced_box_1788287277336.jpg'),
  'DM6.jpg': path.join(brainDir, 'dm6_enhanced_box_1788287657204.jpg'),
  'M104_White.jpg': path.join(brainDir, 'm104_enhanced_box_1788287679999.jpg'),
  'diamond.jpg': path.join(brainDir, 'diamond_glass_pack_1788286927500.jpg'),
  'brand_glass.jpg': path.join(brainDir, 'brand_glass_pack_1788286943393.jpg'),
};

async function processAllImages() {
  console.log('--- Starting Unified Studio Template Application ---');
  
  if (!fs.existsSync(masterBgPath)) {
    throw new Error('Master background template not found at ' + masterBgPath);
  }

  const masterBgBuffer = fs.readFileSync(masterBgPath);

  // 1. Copy direct AI-generated matches
  for (const [filename, sourcePath] of Object.entries(aiGeneratedMap)) {
    if (fs.existsSync(sourcePath)) {
      const dest = path.join(publicItemsDir, filename);
      fs.copyFileSync(sourcePath, dest);
      console.log(`[AI-Template Applied]: ${filename}`);
    }
  }

  // 2. Process all other packaging images using Sharp studio compositing
  const allFiles = fs.readdirSync(publicItemsDir).filter(f => f.endsWith('.jpg'));

  for (const filename of allFiles) {
    if (aiGeneratedMap[filename]) continue; // Already handled with direct AI generation

    const srcPath = path.join(publicItemsDir, filename);
    try {
      console.log(`[Studio Compositing]: ${filename}...`);
      const srcInputBuffer = fs.readFileSync(srcPath);

      // Prepare product overlay
      const productBuffer = await sharp(srcInputBuffer)
        .resize(560, 660, { fit: 'inside' })
        .sharpen({ sigma: 1.8, m1: 1.2, m2: 2.5 })
        .modulate({ brightness: 1.05, saturation: 1.15 })
        .toBuffer();

      const prodMeta = await sharp(productBuffer).metadata();
      const left = Math.round((1024 - prodMeta.width) / 2);
      const top = Math.round(610 - prodMeta.height); // place directly on podium top

      // Composite onto unified master background
      const outputBuffer = await sharp(masterBgBuffer)
        .composite([
          {
            input: productBuffer,
            top: Math.max(30, top),
            left: Math.max(30, left),
            blend: 'over'
          }
        ])
        .jpeg({ quality: 95 })
        .toBuffer();

      fs.writeFileSync(srcPath, outputBuffer);
      console.log(`✓ Unified: ${filename}`);
    } catch (err) {
      console.error(`Error processing ${filename}:`, err.message);
    }
  }

  // 3. Sync to dist directories
  console.log('--- Synchronizing to Dist folders ---');
  const files = fs.readdirSync(publicItemsDir);
  for (const file of files) {
    const src = path.join(publicItemsDir, file);
    fs.copyFileSync(src, path.join(distItemsDir, file));
    fs.copyFileSync(src, path.join(distAppItemsDir, file));
  }

  console.log(`=== Success! All ${files.length} items unified with the exact same background template ===`);
}

processAllImages().catch(console.error);
