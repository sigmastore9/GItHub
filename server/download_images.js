const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images', 'products');
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Product images sources
const PRODUCT_IMAGE_SOURCES = {
  'M114': 'https://hocotech.com/wp-content/uploads/2023/10/hoco-m114-special-wire-earphones-with-mic-ambient.jpg',
  'M104': 'https://hocotech.com/wp-content/uploads/2023/06/hoco-m104-graceful-universal-earphones-with-mic-clip.jpg',
  'DM6': 'https://hocotech.com/wp-content/uploads/2021/04/hoco-dm6-music-in-ear-earphones-with-mic-overview.jpg',
  'EQ33': 'https://hocotech.com/wp-content/uploads/2024/03/hoco-eq33-crystal-true-wireless-bluetooth-earphones-box.jpg',
  'E37': 'https://hocotech.com/wp-content/uploads/2019/07/hoco-e37-gratitude-business-wireless-earphone-main.jpg',
  'W112': 'https://hocotech.com/wp-content/uploads/2024/01/hoco-w112-joyful-wireless-headphones-main.jpg',
  'CS27B': 'https://hocotech.com/wp-content/uploads/2023/11/hoco-cs27b-cool-pd-charger-set-main.jpg',
  'CS32B': 'https://hocotech.com/wp-content/uploads/2023/12/hoco-cs32b-crystal-fast-charger-main.jpg',
  'Z58': 'https://hocotech.com/wp-content/uploads/2024/02/hoco-z58-alloy-car-charger-main.jpg',
  'HB1A': 'https://hocotech.com/wp-content/uploads/2019/09/hoco-hb1-easy-4-port-usb-hub-main.jpg',
  'HB51': 'https://hocotech.com/wp-content/uploads/2024/04/hoco-hb51-multi-port-type-c-hub.jpg',
  'UA17': 'https://hocotech.com/wp-content/uploads/2022/08/hoco-ua17-type-c-to-usb-adapter-main.jpg',
  'UD6': 'https://hocotech.com/wp-content/uploads/2020/05/hoco-ud6-intelligent-usb-flash-drive.jpg',
  'MA05': 'https://images.unsplash.com/photo-1608755728617-aefab37d2edd?w=800&q=80',
  'MA06': 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&q=80',
  'MARSHALL_01': 'https://images.unsplash.com/photo-1591488320449-011701bb6704?w=800&q=80',
  'X96': 'https://hocotech.com/wp-content/uploads/2023/07/hoco-x96-hyper-charging-data-cable-main.jpg',
  'X59': 'https://hocotech.com/wp-content/uploads/2021/08/hoco-x59-victory-charging-data-cable-main.jpg',
  'X117': 'https://hocotech.com/wp-content/uploads/2024/01/hoco-x117-smart-charging-cable.jpg',
  'U95': 'https://hocotech.com/wp-content/uploads/2021/07/hoco-u95-freeway-charging-cable-main.jpg',
  'X87': 'https://hocotech.com/wp-content/uploads/2022/11/hoco-x87-crystal-charging-cable.jpg',
  'X112': 'https://hocotech.com/wp-content/uploads/2023/12/hoco-x112-silicone-cable-main.jpg',
  'X122': 'https://hocotech.com/wp-content/uploads/2024/02/hoco-x122-prime-charging-cable.jpg',
  'X76': 'https://hocotech.com/wp-content/uploads/2022/04/hoco-x76-super-4-in-1-charging-cable-main.jpg',
  'DIAMOND': 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=800&q=80',
  'BRAND_GLASS': 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800&q=80',
  'MA09': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80',
  'ME01': 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=80',
  'C155B': 'https://hocotech.com/wp-content/uploads/2024/05/hoco-c155b-fast-charger-main.jpg',
  'X118': 'https://hocotech.com/wp-content/uploads/2024/01/hoco-x118-flash-charging-cable.jpg'
};

function downloadImage(url, destPath) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;

    const request = client.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImage(response.headers.location, destPath).then(resolve);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        return resolve(false);
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(true));
      });
    });

    request.on('error', () => {
      file.close();
      fs.unlink(destPath, () => {});
      resolve(false);
    });

    request.setTimeout(10000, () => {
      request.destroy();
      file.close();
      fs.unlink(destPath, () => {});
      resolve(false);
    });
  });
}

async function downloadAllProductImages() {
  console.log('Downloading high-resolution product images locally...');
  for (const [code, url] of Object.entries(PRODUCT_IMAGE_SOURCES)) {
    const filename = `${code.toLowerCase()}.jpg`;
    const dest = path.join(IMAGES_DIR, filename);
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
      console.log(`Downloading image for [${code}] from: ${url}`);
      await downloadImage(url, dest);
    }
  }
  console.log('All local product images are ready.');
}

downloadAllProductImages().catch(console.error);
