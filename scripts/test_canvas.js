const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

async function testCanvas() {
  const canvas = createCanvas(800, 800);
  const ctx = canvas.getContext('2d');

  // Background gradient: Soft subtle tech blue
  const grad = ctx.createRadialGradient(400, 360, 20, 400, 360, 480);
  grad.addColorStop(0, '#22385e');
  grad.addColorStop(0.5, '#15243e');
  grad.addColorStop(0.85, '#0e172a');
  grad.addColorStop(1, '#090f1d');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 800, 800);

  const buf = canvas.toBuffer('image/jpeg');
  fs.writeFileSync('C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia/test_canvas.jpg', buf);
  console.log('Canvas test successful!');
}

testCanvas().catch(console.error);
