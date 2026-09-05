const fs = require('fs');
const path = require('path');

// Catalog of known Hoco & Marshall official product models with local high-res photos and details
const KNOWN_MODELS = {
  'M114': {
    name: 'سماعة هوكو سلكية Type-C مع مايكروفون M114',
    model: 'M114 TC',
    brand: 'Hoco',
    category: 'سماعات',
    image_url: '/images/products/m114.jpg'
  },
  'M104': {
    name: 'سماعة هوكو سلكية M104 مع مايك 3.5mm',
    model: 'M104',
    brand: 'Hoco',
    category: 'سماعات',
    image_url: '/images/products/m104.jpg'
  },
  'DM6': {
    name: 'سماعة هوكو إن-إير DM6 بصوت نقي',
    model: 'DM6',
    brand: 'Hoco',
    category: 'سماعات',
    image_url: '/images/products/dm6.jpg'
  },
  'EQ33': {
    name: 'سماعة بلوتوث لاسلكية هوكو EQ33 TWS مع شاشة رقمية',
    model: 'EQ33',
    brand: 'Hoco',
    category: 'سماعات',
    image_url: '/images/products/eq33.jpg'
  },
  'E37': {
    name: 'سماعة بلوتوث أحادية هوكو E37 للأعمال والاتصال',
    model: 'E37',
    brand: 'Hoco',
    category: 'سماعات',
    image_url: '/images/products/e37.jpg'
  },
  'W112': {
    name: 'سماعة رأس بلوتوث هوكو W112 بصوت محيطي ومايك',
    model: 'W112',
    brand: 'Hoco',
    category: 'سماعات',
    image_url: '/images/products/w112.jpg'
  },
  'CS27B': {
    name: 'شاحن جداري سريع هوكو CS27B Type-C إلى Type-C بقوة عالية',
    model: 'CS27B TC-TC',
    brand: 'Hoco',
    category: 'شواحن',
    image_url: '/images/products/cs27b.jpg'
  },
  'CS32B': {
    name: 'رأس شاحن سريع هوكو CS32B مع منافذ شحن ذكية',
    model: 'CS32B',
    brand: 'Hoco',
    category: 'شواحن',
    image_url: '/images/products/cs32b.jpg'
  },
  'Z58': {
    name: 'رأس شاحن سيارة هوكو Z58 شحن سريع معدني',
    model: 'Z58',
    brand: 'Hoco',
    category: 'شواحن',
    image_url: '/images/products/z58.jpg'
  },
  'HB1A': {
    name: 'وصلة ومحول هوكو HB1A 4 في 1 عالي السرعة',
    model: 'HB1A',
    brand: 'Hoco',
    category: 'محولات وتوصيلات',
    image_url: '/images/products/hb1a.jpg'
  },
  'HB51': {
    name: 'محول وموزع متعدد المنافذ هوكو HB51 Type-C متعدد الوظائف',
    model: 'HB51',
    brand: 'Hoco',
    category: 'محولات وتوصيلات',
    image_url: '/images/products/hb51.jpg'
  },
  'UA17': {
    name: 'محول OTG هوكو UA17 Type-C لنقل البيانات فائق السرعة',
    model: 'UA17 TC',
    brand: 'Hoco',
    category: 'محولات وتوصيلات',
    image_url: '/images/products/ua17.jpg'
  },
  'UD6': {
    name: 'فلاش ميموري هوكو UD6 سعة 8 جيجابايت معدني',
    model: 'UD6 8G',
    brand: 'Hoco',
    category: 'تخزين وفلاشات',
    image_url: '/images/products/ud6.jpg'
  },
  'MA05': {
    name: 'كيبل شحن ونقل بيانات مارشال MA05 Type-C إلى Type-C سريع',
    model: 'MA05 TC-TC',
    brand: 'Marshall',
    category: 'كابلات',
    image_url: '/images/products/ma05.jpg'
  },
  'MA06': {
    name: 'كيبل شحن مارشال MA06 آيفون إلى تايب سي IP to Type-C',
    model: 'MA06 IP-TC',
    brand: 'Marshall',
    category: 'كابلات',
    image_url: '/images/products/ma06.jpg'
  },
  'X96': {
    name: 'كيبل قصير هوكو X96 بطول 25 سم للشواحن المتنقلة',
    model: 'X96 - 25CM',
    brand: 'Hoco',
    category: 'كابلات',
    image_url: '/images/products/x96.jpg'
  },
  'X59': {
    name: 'كيبل هوكو X59 فيكتوري قماشي مضاد للقطع',
    model: 'X59',
    brand: 'Hoco',
    category: 'كابلات',
    image_url: '/images/products/x59.jpg'
  },
  'X117': {
    name: 'كيبل هوكو X117 تايب سي إلى آيفون PD سريع الشحن',
    model: 'X117 IP - TC',
    brand: 'Hoco',
    category: 'كابلات',
    image_url: '/images/products/x117.jpg'
  },
  'U95': {
    name: 'كيبل شحن فائق السرعة هوكو U95 PD مع شاشة مؤشر ذكية',
    model: 'U95 PD',
    brand: 'Hoco',
    category: 'كابلات',
    image_url: '/images/products/u95.jpg'
  },
  'X87': {
    name: 'كيبل هوكو X87 مضاد للتشابك وقوي التحمل',
    model: 'X87',
    brand: 'Hoco',
    category: 'كابلات',
    image_url: '/images/products/x87.jpg'
  },
  'X112': {
    name: 'كيبل هوكو X112 آيفون Lightning سريع الشحن',
    model: 'X112 IP',
    brand: 'Hoco',
    category: 'كابلات',
    image_url: '/images/products/x112.jpg'
  },
  'X122': {
    name: 'كيبل هوكو X122 شحن سريع عالي التحمل',
    model: 'X122',
    brand: 'Hoco',
    category: 'كابلات',
    image_url: '/images/products/x122.jpg'
  },
  'X76': {
    name: 'كيبل هوكو متعدد 4 في 1 X76 (Type-C + 2x IP + Micro)',
    model: 'X76 4IN1',
    brand: 'Hoco',
    category: 'كابلات',
    image_url: '/images/products/x76.jpg'
  },
  'MA09': {
    name: 'سماعة سلكية مارشال MA09 بصوت عالي الدقة ونقي',
    model: 'MA09',
    brand: 'Marshall',
    category: 'سماعات',
    image_url: '/images/products/ma09.jpg'
  },
  'ME01': {
    name: 'سماعة بلوتوث مارشال ME01 لاسلكية مع ميكروفون وبطارية ضخمة',
    model: 'ME01',
    brand: 'Marshall',
    category: 'سماعات',
    image_url: '/images/products/me01.jpg'
  },
  'C155B': {
    name: 'شاحن فائق السرعة هوكو C155B Type-C إلى Type-C يدعم الشحن الفائق',
    model: 'C155B TC-TC',
    brand: 'Hoco',
    category: 'شواحن',
    image_url: '/images/products/c155b.jpg'
  },
  'X118': {
    name: 'كيبل هوكو X118 فائق السرعة لنقل البيانات والشحن',
    model: 'X118',
    brand: 'Hoco',
    category: 'كابلات',
    image_url: '/images/products/x118.jpg'
  },
  'MARSHALL 01': {
    name: 'كيبل مارشال 01 شحن ونقل بيانات اقتصادي',
    model: '01',
    brand: 'Marshall',
    category: 'كابلات',
    image_url: '/images/products/marshall_01.jpg'
  },
  'DIAMOND': {
    name: 'لاصق شاشة زجاجي دايموند مقسى مضاد للكسر والبصمات',
    model: 'لاصق جام دايموند',
    brand: 'Diamond',
    category: 'حماية ولواصق شاشة',
    image_url: '/images/products/diamond.jpg'
  },
  'BRAND_GLASS': {
    name: 'لاصق شاشة ماركة أصلي 9D عالي الحماية مع فلتر خصوصية',
    model: 'لاصق جام ماركة',
    brand: 'VIP Glass',
    category: 'حماية ولواصق شاشة',
    image_url: '/images/products/brand_glass.jpg'
  }
};

/**
 * Normalizes model key for lookup (Longest keys matched first)
 */
function findModelData(modelString, rawName = '') {
  const cleanRaw = rawName.replace(/\s+/g, ' ');
  const combined = (modelString + ' ' + cleanRaw).toUpperCase().replace(/[\s\-_]/g, '');
  
  // Sort known models by key length descending
  const sortedKeys = Object.keys(KNOWN_MODELS).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const cleanKey = key.toUpperCase().replace(/[\s\-_]/g, '');
    if (combined.includes(cleanKey)) {
      return { ...KNOWN_MODELS[key], key };
    }
  }

  // Handle Marshall 01
  if ((combined.includes('MARSHALL') && combined.includes('01')) || (combined.includes('مارشال') && combined.includes('01'))) {
    return { ...KNOWN_MODELS['MARSHALL 01'], key: 'MARSHALL 01' };
  }

  // Handle diamond and brand glass specifically
  if (combined.includes('دايموند') || combined.includes('د ا ي م و ن د') || combined.includes('DIAMOND')) {
    return { ...KNOWN_MODELS['DIAMOND'], key: 'DIAMOND' };
  }
  if (combined.includes('ماركة') || combined.includes('م ا ر ك ة') || combined.includes('BRAND')) {
    return { ...KNOWN_MODELS['BRAND_GLASS'], key: 'BRAND_GLASS' };
  }

  // Multi-Brand Prefix & Pattern Categorization
  let category = 'أخرى';
  let brand = 'Hoco';
  const cleanModel = modelString.trim().toUpperCase();
  const textToCheck = (rawName + ' ' + modelString).replace(/\s+/g, '').toUpperCase();

  // 1. Detect Brand
  if (/^JR-|^JOYROOM|جويروم/i.test(textToCheck)) brand = 'Joyroom';
  else if (/^A2\d{3}|^A3\d{3}|ANKER|SOUNDCORE|أنكر/i.test(textToCheck)) brand = 'Anker';
  else if (/^BA\d+|^BC\d+|^BO\d+|^BX\d+|^BJ\d+|BOROFONE|بوروفون/i.test(textToCheck)) brand = 'Borofone';
  else if (/BASEUS|بيسوس|باسيوس/i.test(textToCheck)) brand = 'Baseus';
  else if (/^RP-|^RC-|^RB-|^RTL-|REMAX|ريماكس/i.test(textToCheck)) brand = 'Remax';
  else if (/^MA-?0\d|^ME-?0\d|MARSHALL|مارشال/i.test(textToCheck)) brand = 'Marshall';
  else if (/ACEFAST|ايسي|آيسي/i.test(textToCheck)) brand = 'Acefast';
  else if (/SAMSUNG|GALAXY|سامسونج/i.test(textToCheck)) brand = 'Samsung';
  else if (/IPHONE|APPLE|آيفون|ايفون|ابل|آبل/i.test(textToCheck)) brand = 'Apple';
  else if (/XIAOMI|REDMI|POCO|شاومي|ريدمي/i.test(textToCheck)) brand = 'Xiaomi';

  // 2. Detect Category
  if (/سماعة|سماعه|earphone|headphone|airpod|tws|buds|audio|^EQ|^M1|^W1|^BO\d|^JR-T|^A3\d|^RB-/i.test(textToCheck)) {
    category = 'سماعات';
  } else if (/كيبل|كابل|cable|wire|cord|^X\d|^MA-05|^MA-06|^BX\d|^RC-|^JR-L/i.test(textToCheck)) {
    category = 'كابلات';
  } else if (/شاحن|نحاش|charger|adapter|wall|car|power|^CS|^Z\d|^C\d|^BA\d|^BC\d|^A2\d|^RP-/i.test(textToCheck)) {
    category = 'شواحن';
  } else if (/لاصق|جام|glass|screenprotector|shield|film|9d|11d|matte|privacy/i.test(textToCheck)) {
    category = 'حماية ولواصق شاشة';
  } else if (/فلاش|تخزين|flash|usb|drive|memory|card|sd|^UD/i.test(textToCheck)) {
    category = 'تخزين وفلاشات';
  } else if (/توصالة|تقسيم|hub|otg|adapter|convert|^HB|^UA/i.test(textToCheck)) {
    category = 'محولات وتوصيلات';
  }

  let generatedName = rawName.trim();
  if (!generatedName) {
    generatedName = `${category !== 'أخرى' ? category.replace(/ات$/, 'ة') : 'منتج'} ${brand} موديل ${modelString.trim()}`;
  }

  return {
    name: generatedName,
    model: modelString.trim(),
    brand,
    category,
    image_url: '/images/products/eq33.jpg'
  };
}

module.exports = {
  KNOWN_MODELS,
  findModelData
};
