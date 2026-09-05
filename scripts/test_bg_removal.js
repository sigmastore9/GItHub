const { removeBackground } = require('@imgly/background-removal-node');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function testProcessImage() {
  const inputPath = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia/original_raw_photos/IMG_20260830_190959.jpg';
  const outputPath = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia/test_M114_processed.png';
  const finalJpgPath = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia/test_M114_final.jpg';

  console.log('Reading input image...');
  const inputBuffer = fs.readFileSync(inputPath);

  // Resize first for faster and cleaner processing if very large
  const resizedBuffer = await sharp(inputBuffer)
    .resize(1600, 2133, { fit: 'inside' })
    .toBuffer();

  console.log('Removing background...');
  // removeBackground accepts Blob, ArrayBuffer, Buffer, or file url
  const blob = new Blob([resizedBuffer], { type: 'image/jpeg' });
  const resultBlob = await removeBackground(blob, {
    output: {
      format: 'image/png',
      quality: 0.95
    }
  });

  const arrayBuffer = await resultBlob.arrayBuffer();
  const isolatedBuffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, isolatedBuffer);
  console.log('Isolated box saved to:', outputPath);

  // Get dimensions of isolated box
  const isolatedMeta = await sharp(isolatedBuffer).metadata();
  console.log('Isolated dimensions:', isolatedMeta.width, isolatedMeta.height);

  // Create a 1600x1600 square tech-blue background with soft gradient and subtle tech lighting
  const width = 1600;
  const height = 1600;

  // Scale isolated box to fit comfortably in 1600x1600 with margins
  const targetBoxHeight = 1350;
  const scaledBox = await sharp(isolatedBuffer)
    .resize({ height: targetBoxHeight, fit: 'inside' })
    .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 })
    .toBuffer();

  const scaledMeta = await sharp(scaledBox).metadata();

  const left = Math.round((width - scaledMeta.width) / 2);
  const top = Math.round((height - scaledMeta.height) / 2) - 30; // slightly higher for bottom shadow

  // Create SVG gradient background: Soft Tech Blue
  const svgBackground = `
    <svg width="${width}" height="${height}">
      <defs>
        <radialGradient id="techGlow" cx="50%" cy="45%" r="70%" fx="50%" fy="40%">
          <stop offset="0%" stop-color="#243b66" />
          <stop offset="45%" stop-color="#182947" />
          <stop offset="85%" stop-color="#0f1a2e" />
          <stop offset="100%" stop-color="#0b1322" />
        </radialGradient>
        <radialGradient id="podiumShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(0,0,0,0.55)" />
          <stop offset="50%" stop-color="rgba(0,0,0,0.25)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id="techGrid" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(56, 189, 248, 0.04)" />
          <stop offset="100%" stop-color="rgba(30, 58, 138, 0.08)" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#techGlow)" />
      <!-- Subtle ground shadow under the product box -->
      <ellipse cx="${width / 2}" cy="${top + scaledMeta.height + 15}" rx="${scaledMeta.width * 0.42}" ry="25" fill="url(#podiumShadow)" />
    </svg>
  `;

  const bgBuffer = Buffer.from(svgBackground);

  // Composite isolated box onto background
  const finalImage = await sharp(bgBuffer)
    .composite([
      {
        input: scaledBox,
        top: top,
        left: left
      }
    ])
    .jpeg({ quality: 95 })
    .toFile(finalJpgPath);

  console.log('Final image saved to:', finalJpgPath);
}

testProcessImage().catch(console.error);
