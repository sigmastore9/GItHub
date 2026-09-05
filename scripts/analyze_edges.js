const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const dir = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia/original_raw_photos';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg'));

async function analyze() {
  for (const f of files.slice(0, 5)) {
    const fullPath = path.join(dir, f);
    // downsample to 800x1066 for fast edge analysis
    const { data, info } = await sharp(fullPath)
      .resize(400, 533)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    console.log(`Image: ${f}, size: ${info.width}x${info.height}`);
  }
}

analyze().catch(console.error);
