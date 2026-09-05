const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const width = 1024;
const height = 1024;

const svgTemplate = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background studio lighting gradient -->
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7a9ebc" />
      <stop offset="35%" stop-color="#557591" />
      <stop offset="70%" stop-color="#314251" />
      <stop offset="100%" stop-color="#202933" />
    </linearGradient>

    <!-- Radial soft ambient light on left side -->
    <radialGradient id="softLight" cx="22%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#a4c4df" stop-opacity="0.55" />
      <stop offset="45%" stop-color="#6485a3" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>

    <!-- Podium top surface gradient -->
    <linearGradient id="podiumTop" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3c4e5d" />
      <stop offset="40%" stop-color="#2c3945" />
      <stop offset="100%" stop-color="#1c252d" />
    </linearGradient>

    <!-- Podium left face gradient -->
    <linearGradient id="podiumLeft" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2b3844" />
      <stop offset="100%" stop-color="#161e25" />
    </linearGradient>

    <!-- Podium right face gradient -->
    <linearGradient id="podiumRight" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1f2832" />
      <stop offset="100%" stop-color="#10151a" />
    </linearGradient>

    <!-- Contact shadow beneath box -->
    <radialGradient id="contactShadow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(0,0,0,0.85)" />
      <stop offset="50%" stop-color="rgba(10,15,20,0.5)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0)" />
    </radialGradient>

    <!-- Edge highlight bevel -->
    <linearGradient id="edgeLight" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(170, 200, 230, 0.45)" />
      <stop offset="40%" stop-color="rgba(130, 160, 190, 0.35)" />
      <stop offset="100%" stop-color="rgba(80, 105, 125, 0.15)" />
    </linearGradient>
  </defs>

  <!-- Base studio wall -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)" />
  <rect width="${width}" height="${height}" fill="url(#softLight)" />

  <!-- Podium 3D geometry -->
  <!-- Top plane -->
  <polygon points="20,855 360,895 1004,860 1024,840 0,840" fill="url(#podiumTop)" />
  
  <!-- Left vertical face -->
  <polygon points="20,855 360,895 360,1024 20,1024" fill="url(#podiumLeft)" />

  <!-- Right vertical face -->
  <polygon points="360,895 1004,860 1024,860 1024,1024 360,1024" fill="url(#podiumRight)" />

  <!-- Contact shadow on top of podium where box will sit -->
  <ellipse cx="512" cy="880" rx="300" ry="38" fill="url(#contactShadow)" />

  <!-- Podium top edge bevel lines -->
  <polyline points="20,855 360,895 1004,860" stroke="url(#edgeLight)" stroke-width="2" fill="none" />
</svg>
`;

async function main() {
  const targetBgPath = path.join(__dirname, '../public/master_podium_template.jpg');
  await sharp(Buffer.from(svgTemplate))
    .jpeg({ quality: 98 })
    .toFile(targetBgPath);
  console.log('✓ Master podium template created successfully at:', targetBgPath);
}

main().catch(console.error);
