const fs = require('fs');
const path = require('path');

const dir = 'C:/progect/MY store/dist/MY Store-win32-x64/itemsMedia';
const backupDir = path.join(dir, 'original_raw_photos');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const mapping = {
  'IMG_20260830_190959.jpg': 'M114.jpg',
  'IMG_20260830_191001.jpg': 'M104_White.jpg',
  'IMG_20260830_191004.jpg': 'M104_Black.jpg',
  'IMG_20260830_191008.jpg': 'MA-09.jpg',
  'IMG_20260830_191011.jpg': 'DM6.jpg',
  'IMG_20260830_191017.jpg': 'MA-05.jpg',
  'IMG_20260830_191030.jpg': 'X87.jpg',
  'IMG_20260830_191035.jpg': 'X59.jpg',
  'IMG_20260830_191038.jpg': 'M001-C.jpg',
  'IMG_20260830_191041.jpg': 'X122.jpg',
  'IMG_20260830_191044.jpg': 'M001-I.jpg',
  'IMG_20260830_191047.jpg': 'X118.jpg',
  'IMG_20260830_191049.jpg': 'X117.jpg',
  'IMG_20260830_191053.jpg': 'MA-06.jpg',
  'IMG_20260830_191055.jpg': 'U95.jpg',
  'IMG_20260830_191100.jpg': 'E37.jpg',
  'IMG_20260830_191104.jpg': 'HB51.jpg',
  'IMG_20260830_191106.jpg': 'HB1A.jpg',
  'IMG_20260830_191109.jpg': 'X76.jpg',
  'IMG_20260830_191112.jpg': 'UD6.jpg',
  'IMG_20260830_191115.jpg': 'UA17.jpg',
  'IMG_20260830_191118.jpg': 'CS32B.jpg',
  'IMG_20260830_191121.jpg': 'CS27B.jpg',
  'IMG_20260830_191124.jpg': 'X96.jpg',
  'IMG_20260830_191126.jpg': 'UK_20W_Set.jpg',
  'IMG_20260830_191134.jpg': 'EQ33.jpg',
  'IMG_20260830_191141.jpg': 'ME-01.jpg',
  'IMG_20260830_191147.jpg': 'Z58.jpg',
  'IMG_20260830_191155.jpg': 'W112.jpg'
};

console.log('Starting renaming process...');
let renamedCount = 0;

for (const [orig, codeName] of Object.entries(mapping)) {
  const origPath = path.join(dir, orig);
  const backupPath = path.join(backupDir, orig);
  const newPath = path.join(dir, codeName);

  if (fs.existsSync(origPath)) {
    fs.copyFileSync(origPath, backupPath);
    fs.renameSync(origPath, newPath);
    console.log(`[RENAMED] ${orig} -> ${codeName}`);
    renamedCount++;
  } else if (fs.existsSync(newPath)) {
    console.log(`[EXISTS] ${codeName} already exists`);
    renamedCount++;
  } else {
    console.warn(`[NOT FOUND] ${orig}`);
  }
}

console.log(`Finished. Processed ${renamedCount} files.`);
