const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const projectRoot = 'C:/progect/MY store';
const distAppRoot = path.join(projectRoot, 'dist/MY Store-win32-x64/resources/app');
const itemsMediaSrc = path.join(projectRoot, 'public/itemsMedia');

// 1. Image mapping per product
const productImagesMap = [
  { id: 1,  model: 'M114 TC',        code: 'M114',        imgFile: 'M114.jpg' },
  { id: 2,  model: 'M104',           code: 'M104',        imgFile: 'M104_White.jpg' },
  { id: 3,  model: 'DM6',            code: 'DM6',         imgFile: 'DM6.jpg' },
  { id: 4,  model: 'EQ33',           code: 'EQ33',        imgFile: 'EQ33.jpg' },
  { id: 5,  model: 'E37',            code: 'E37',         imgFile: 'E37.jpg' },
  { id: 6,  model: 'W112',           code: 'W112',        imgFile: 'W112.jpg' },
  { id: 7,  model: 'CS27B TC-TC',    code: 'CS27B',       imgFile: 'CS27B.jpg' },
  { id: 8,  model: 'CS32B',          code: 'CS32B',       imgFile: 'CS32B.jpg' },
  { id: 9,  model: 'Z58',            code: 'Z58',         imgFile: 'Z58.jpg' },
  { id: 10, model: 'HB1A',           code: 'HB1A',        imgFile: 'HB1A.jpg' },
  { id: 11, model: 'HB51',           code: 'HB51',        imgFile: 'HB51.jpg' },
  { id: 12, model: 'UA17 TC',        code: 'UA17',        imgFile: 'UA17.jpg' },
  { id: 13, model: 'UD6 8G',         code: 'UD6',         imgFile: 'UD6.jpg' },
  { id: 14, model: 'MA05 TC-TC',     code: 'MA05',        imgFile: 'MA-05.jpg' },
  { id: 15, model: 'MA06 IP-TC',     code: 'MA06',        imgFile: 'MA-06.jpg' },
  { id: 16, model: '01',             code: '01',          imgFile: 'M001-C.jpg' },
  { id: 17, model: 'X96 - 25CM',     code: 'X96',         imgFile: 'X96.jpg' },
  { id: 18, model: 'X59',            code: 'X59',         imgFile: 'X59.jpg' },
  { id: 19, model: 'X117 IP - TC',   code: 'X117',        imgFile: 'X117.jpg' },
  { id: 20, model: 'U95 PD',         code: 'U95',         imgFile: 'U95.jpg' },
  { id: 21, model: 'X87',            code: 'X87',         imgFile: 'X87.jpg' },
  { id: 22, model: 'X112 IP',        code: 'X112',        imgFile: 'X118.jpg' },
  { id: 23, model: 'X122',           code: 'X122',        imgFile: 'X122.jpg' },
  { id: 24, model: 'X76 4IN1',       code: 'X76',         imgFile: 'X76.jpg' },
  { id: 25, model: 'لاصق جام دايموند', code: 'Diamond',    imgFile: 'diamond.jpg' },
  { id: 26, model: 'لاصق جام ماركة',  code: 'VIP_Glass',   imgFile: 'brand_glass.jpg' },
  { id: 27, model: 'MA09',           code: 'MA09',        imgFile: 'MA-09.jpg' },
  { id: 28, model: 'ME01',           code: 'ME01',        imgFile: 'ME-01.jpg' },
  { id: 29, model: 'C155B TC-TC',    code: 'UK_20W_Set',  imgFile: 'UK_20W_Set.jpg' },
  { id: 30, model: 'X118',           code: 'X118',        imgFile: 'X118.jpg' }
];

// 2. Ensure directories exist in both public and dist
const targetDirs = [
  path.join(projectRoot, 'public/itemsMedia'),
  path.join(projectRoot, 'public/images/products'),
  path.join(distAppRoot, 'public/itemsMedia'),
  path.join(distAppRoot, 'public/images/products')
];

targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created directory:', dir);
  }
});

// 3. Copy image files
console.log('Copying image files across project and dist...');
const allFiles = fs.readdirSync(itemsMediaSrc);
for (const file of allFiles) {
  const src = path.join(itemsMediaSrc, file);
  if (fs.statSync(src).isFile()) {
    // Copy to dev public/itemsMedia
    fs.copyFileSync(src, path.join(projectRoot, 'public/itemsMedia', file));
    // Copy to dev public/images/products
    fs.copyFileSync(src, path.join(projectRoot, 'public/images/products', file));
    // Copy to prod dist public/itemsMedia
    fs.copyFileSync(src, path.join(distAppRoot, 'public/itemsMedia', file));
    // Copy to prod dist public/images/products
    fs.copyFileSync(src, path.join(distAppRoot, 'public/images/products', file));
  }
}

// 4. Update SQLite Databases
const dbPaths = [
  path.join(projectRoot, 'store_data.db'),
  path.join(distAppRoot, 'store_data.db')
];

for (const currentDbPath of dbPaths) {
  if (!fs.existsSync(currentDbPath)) continue;
  console.log(`\nUpdating database: ${currentDbPath}...`);
  const database = new DatabaseSync(currentDbPath);

  const updateStmt = database.prepare(`
    UPDATE products 
    SET image_url = ? 
    WHERE id = ? OR model = ? OR model LIKE ?
  `);

  for (const item of productImagesMap) {
    const imageUrl = `/itemsMedia/${item.imgFile}`;
    const result = updateStmt.run(imageUrl, item.id, item.model, `%${item.code}%`);
    console.log(`[DB UPDATE] Product #${item.id} (${item.model}) -> ${imageUrl}`);
  }

  // Verify
  const rows = database.prepare('SELECT id, name, model, image_url FROM products').all();
  console.log(`Verified ${rows.length} products in ${path.basename(currentDbPath)}.`);
}

console.log('\nAll product images attached successfully!');
