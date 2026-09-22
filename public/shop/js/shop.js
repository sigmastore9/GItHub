// ==========================================================
// SIGMA STORE - CUSTOMER E-COMMERCE FRONTEND (SHOP.JS)
// ==========================================================

const shopState = {
  products: [],
  filteredProducts: [],
  selectedCategory: 'all',
  searchQuery: '',
  sortBy: 'default',
  cart: [],
  activeQvProduct: null,
  qvQty: 1
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadStoreSettings();
  loadCartFromStorage();
  loadShopProducts();
  initLiveSync();
});

// Telegram notifications are dispatched by the server when the order is saved.
// A bot token in browser code is readable by every visitor, so it never lives here.

// Dynamic Asset URL Resolver for GitHub Pages & Local
function resolveAssetUrl(url) {
  if (!url) return '../images/products/EQ33.jpg';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  
  let clean = url.startsWith('/') ? url.slice(1) : url;
  clean = clean.replace(/eq33\.jpg/gi, 'EQ33.jpg');

  // If running on GitHub Pages (where current page is in /public/shop/ or on github.io domain)
  if (window.location.hostname.includes('github.io') || window.location.pathname.includes('/public/shop')) {
    if (clean.startsWith('itemsMedia/') || clean.startsWith('images/') || clean.startsWith('uploads/')) {
      return `../${clean}`;
    }
  }
  return `/${clean}`;
}

// Dynamic Store Settings Sync with Backend DB (with GitHub Pages fallback)
async function loadStoreSettings() {
  try {
    let s = null;
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.settings) s = data.settings;
      }
    } catch (_) {}

    if (!s) {
      try {
        const res = await fetch(`products.json?_t=${Date.now()}`);
        const data = await res.json();
        if (data && data.settings) s = data.settings;
      } catch (_) {}
    }

    if (s) {
      if (s.store_name) {
        document.querySelectorAll('.brand-title').forEach(el => el.textContent = s.store_name);
        document.title = `${s.store_name} - الإلكترونيات والملحقات الأصلية`;
      }
      if (s.phone) {
        // The phone setting can hold several numbers ("07830860919 - 07835046817").
        // Stripping every non-digit from the whole string glued them into one
        // invalid number (0783086091907835046817) for the WhatsApp button below.
        // Split first, then clean each number on its own.
        const numbers = parsePhoneNumbers(s.phone);

        const ph = document.getElementById('footerPhone');
        if (ph && numbers.length) {
          const links = numbers
            .map(n => `<a href="tel:+${getIraqiPhoneInternational(n)}" class="footer-copy-link" title="اضغط للاتصال">${n}</a>`)
            .join(' - ');
          ph.innerHTML = `<i class="fa-solid fa-phone text-blue"></i> خدمة الزبائن: ${links}`;
        }

        // Footer WhatsApp row: one link per configured number, up to how many slots exist
        const waLinks = document.querySelectorAll('.footer-whatsapp-link');
        const waSep = document.querySelector('.footer-whatsapp-sep');
        waLinks.forEach((el, i) => {
          if (numbers[i]) {
            el.href = `https://wa.me/${getIraqiPhoneInternational(numbers[i])}`;
            el.textContent = numbers[i];
            el.style.display = '';
          } else {
            el.style.display = 'none';
          }
        });
        if (waSep) waSep.style.display = numbers.length > 1 ? '' : 'none';

        // Default contact button (order-success modal) always uses the first number
        const wa = document.getElementById('btnWhatsAppContact');
        if (wa && numbers[0]) wa.href = `https://wa.me/${getIraqiPhoneInternational(numbers[0])}`;
      }
    }
  } catch (e) {}
}

// Splits a settings string like "07830860919 - 07835046817" into clean numbers.
// Also tolerates a comma or slash between numbers.
function parsePhoneNumbers(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[-,/]+/)
    .map(part => cleanIraqiPhone(part.trim()))
    .filter(Boolean);
}

// Folds the spellings Arabic shoppers mix freely, so "سماعه" finds "سماعة".
// The storefront filters in the browser, so it needs its own copy of the same
// folding the server applies to its LIKE queries.
const ARABIC_FOLDINGS = [
  ['أ', 'ا'], ['إ', 'ا'], ['آ', 'ا'], ['ٱ', 'ا'],
  ['ة', 'ه'], ['ى', 'ي'], ['ؤ', 'و'], ['ئ', 'ي'],
  ['ـ', ''],
  ['ً', ''], ['ٌ', ''], ['ٍ', ''],
  ['َ', ''], ['ُ', ''], ['ِ', ''],
  ['ّ', ''], ['ْ', '']
];

function foldArabic(text) {
  let out = String(text || '');
  for (const [from, to] of ARABIC_FOLDINGS) {
    out = out.split(from).join(to);
  }
  return out.toLowerCase().trim();
}

// Escapes text before it goes into innerHTML
function escapeShopHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Format Currency
function formatIQD(num) {
  return (Math.round(num || 0)).toLocaleString('en-US') + ' د.ع';
}

// Generate Realistic, Grounded Product Description
function getProductDescription(product) {
  const model = (product.model || '').toUpperCase();
  const name = product.name || '';
  const cat = product.category || '';
  const brand = product.brand || 'Hoco';

  // Specific Models Knowledge Base
  if (model.includes('EQ33')) {
    return 'سماعة بلوتوث لاسلكية TWS تدعم تقنية البلوتوث 5.3 مع علبة شحن مزودة بشاشة رقمية LED لعرض نسبة البطارية، صوت ستريو نقي، وميكروفون مدمج للمكالمات.';
  }
  if (model.includes('W112')) {
    return 'سماعة رأس بلوتوث محيطية مريحة تدعم الاتصال اللاسلكي والسلكي عبر كابل AUX 3.5mm، مع بطارية تدوم لساعات طويلة ومايكروفون واضح للألعاب والمكالمات.';
  }
  if (model.includes('E37')) {
    return 'سماعة بلوتوث أحادية للأذن مصممة للمكالمات والأعمال أثناء القيادة والمشي، خفيفة الوزن مع بطارية قوية ونقاء صوت عالي.';
  }
  if (model.includes('M114')) {
    return 'سماعة أذن سلكية متطورة بمنفذ Type-C متوافقة مع هواتف الآيفون الحديثة والسامسونج وأجهزة الأندرويد، تدعم أزرار التحكم بالصوت والرد على المكالمات.';
  }
  if (model.includes('M104') || model.includes('DM6') || model.includes('MA09')) {
    return 'سماعة أذن سلكية بمنفذ 3.5mm قياسي مع كابل مرن عالي التحمل، ميكروفون مدمج، وصوت نقي للموسيقى والمكالمات اليومية.';
  }
  if (model.includes('CS32B') || model.includes('CS27B')) {
    return 'شاحن جداري فائق السرعة يدعم تقنية PD و Quick Charge 3.0 مع دارات حماية إلكترونية متطورة ضد الشحن الزائد وارتفاع درجات الحرارة.';
  }
  if (model.includes('Z58')) {
    return 'شاحن سيارة معدني مدمج سريع يركب على ولاعة السيارة مباشرة، يحتوي على منفذي شحن مع إضاءة خفيفة وحماية كاملة لبطارية هاتفك.';
  }
  if (model.includes('X59') || model.includes('X87') || model.includes('X122') || model.includes('MA05') || model.includes('M001')) {
    return 'كابل شحن ونقل بيانات فائق المتانة مغطى بنسيج معزز لمقاومة القطع والثني المتكرر، يدعم الشحن السريع ونقل الصور والملفات بكفاءة.';
  }
  if (model.includes('X76')) {
    return 'كابل شحن متعدد 4 في 1 يجمع منافذ (Type-C + Lightning + Micro USB) لشحن عدة أجهزة وهواتف مختلفة في وقت واحد من منفذ واحد.';
  }
  if (model.includes('HB1A') || model.includes('HB51')) {
    return 'محول وموزع منافذ Hub عالي السرعة يتيح لك توصيل الفلاشات، الماوس، لوحة المفاتيح، والملحقات بحاسوبك أو هاتفك بسهولة وثبات.';
  }
  if (model.includes('UD6') || cat === 'تخزين وفلاشات') {
    return 'فلاش ميموري تخزين بتصميم معدني عملي ومقاوم، مناسب لحفظ ونقل الملفات والصور ومقاطع الفيديو بسرعة بين الحواسيب والشاشات والسيارات.';
  }
  if (cat === 'حماية ولواصق شاشة' || name.includes('لاصق') || name.includes('دايموند')) {
    return 'لاصق شاشة زجاجي مقسى عالي الصلابة (9D Tempered Glass) مقاوم للخدوش والصدمات والبصمات، مع وضوح شاشة فائق وحواف منحنية ناعمة.';
  }

  // Generic fallback based on category
  if (cat === 'سماعات') {
    return `سماعة أصلية من ماركة ${brand} تتميز بصوت واضح وجودة تصنيع عالية مناسبة للاستخدام اليومي والمكالمات.`;
  }
  if (cat === 'شواحن') {
    return `شاحن أصلي معتمد من ماركة ${brand} يوفر شحناً آمناً ومستقراً لبطارية جهازك مع حماية مدمجة ضد التيار الزائد.`;
  }
  if (cat === 'كابلات') {
    return `كابل شحن ونقل بيانات سريع من ماركة ${brand} بجودة عالية ومقاومة ممتازة للثني والتآكل.`;
  }

  return `منتج أصلي معتمد من ماركة ${brand} بجودة تصنيع ممتازة وكفالة ضد عيوب المصنع.`;
}

// 1. Fetch & Render Products (Supports Silent Live Sync & GitHub Pages fallback)
async function loadShopProducts(isSilent = false) {
  const loading = document.getElementById('shopLoading');
  const empty = document.getElementById('shopEmpty');
  const grid = document.getElementById('shopProductsGrid');

  if (!isSilent) {
    loading.style.display = 'block';
    empty.style.display = 'none';
    grid.innerHTML = '';
  }

  try {
    let data = null;
    try {
      const res = await fetch(`/api/products?_t=${Date.now()}`);
      if (res.ok) {
        data = await res.json();
      }
    } catch (_) {}

    // Fallback for static GitHub Pages hosting
    if (!data || !data.products) {
      const res = await fetch(`products.json?_t=${Date.now()}`);
      data = await res.json();
    }

    if (!isSilent) loading.style.display = 'none';

    if (data && data.success && data.products) {
      shopState.products = data.products;
      // Prices and stock may have moved since the cart was saved
      reconcileCartWithCatalogue();
      applyShopFilters(isSilent);
      syncHeroBanner(data.products);
    } else {
      if (!isSilent) empty.style.display = 'block';
    }
  } catch (error) {
    if (!isSilent) {
      loading.style.display = 'none';
      empty.style.display = 'block';
      showShopToast('حدث خطأ أثناء تحميل المنتجات', 'error');
    }
  }
}

function applyShopFilters(isSilent = false) {
  let list = [...shopState.products];

  // 1. Category Filter
  if (shopState.selectedCategory !== 'all') {
    list = list.filter(p => p.category === shopState.selectedCategory);
  }

  // 2. Search Query Filter
  if (shopState.searchQuery.trim()) {
    const q = foldArabic(shopState.searchQuery);
    list = list.filter(p =>
      foldArabic(p.name).includes(q) ||
      foldArabic(p.model).includes(q) ||
      foldArabic(p.brand).includes(q) ||
      foldArabic(p.category).includes(q)
    );
  }

  // 3. Sorting
  if (shopState.sortBy === 'price-low') {
    list.sort((a, b) => a.selling_price - b.selling_price);
  } else if (shopState.sortBy === 'price-high') {
    list.sort((a, b) => b.selling_price - a.selling_price);
  } else if (shopState.sortBy === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  shopState.filteredProducts = list;
  renderShopProductsGrid(isSilent);
}

function renderShopProductsGrid(isSilent = false) {
  const grid = document.getElementById('shopProductsGrid');
  const empty = document.getElementById('shopEmpty');
  const countLabel = document.getElementById('productsCountLabel');

  if (shopState.filteredProducts.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    countLabel.textContent = '0 منتج معروض';
    return;
  }

  empty.style.display = 'none';
  countLabel.textContent = `معروض ${shopState.filteredProducts.length} منتج متوفر`;

  // Build new cards fragment
  const fragment = document.createDocumentFragment();

  shopState.filteredProducts.forEach(p => {
    const fallbackImg = resolveAssetUrl('/images/products/EQ33.jpg');
    // Append updated_at timestamp to bust browser cache immediately upon image change!
    const v = p.updated_at ? encodeURIComponent(p.updated_at) : Date.now();
    const rawImg = p.image_url ? (p.image_url.includes('?') ? p.image_url : `${p.image_url}?v=${v}`) : fallbackImg;
    const imgSrc = resolveAssetUrl(rawImg);
    const isAvailable = (p.stock_quantity !== undefined && p.stock_quantity !== null) ? p.stock_quantity > 0 : true;

    const card = document.createElement('div');
    card.className = 'shop-product-card';
    card.setAttribute('data-id', p.id);
    card.innerHTML = `
      <div class="product-img-box" onclick="openQuickView(${p.id})">
        <img src="${imgSrc}" alt="${p.name}" loading="lazy" onerror="this.src='${fallbackImg}'">
        <div class="card-top-tags">
          <span class="brand-tag">ماركة: ${p.brand || 'Hoco'}</span>
          <span class="stock-status-tag ${isAvailable ? 'in-stock' : 'out-stock'}">
            ${isAvailable ? '<i class="fa-solid fa-check"></i> متوفر' : '<i class="fa-solid fa-xmark"></i> غير متوفر'}
          </span>
        </div>
      </div>

      <div class="product-info-box">
        <div class="product-category-row">
          <span>${p.category || 'أخرى'}</span>
          ${p.model ? `<span class="product-model-text">الموديل: ${p.model}</span>` : ''}
        </div>
        
        <h3 class="product-name-title" title="${p.name}">${p.name}</h3>

        <div class="product-price-row">
          <span class="price-label-tag">السعر:</span>
          <span class="price-amount">${formatIQD(p.selling_price)}</span>
        </div>

        <div class="product-card-actions">
          <button class="btn-add-cart" onclick="addToCartById(${p.id})" ${!isAvailable ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
            <i class="fa-solid fa-cart-plus"></i> ${isAvailable ? 'أضف إلى السلة' : 'غير متوفر'}
          </button>
          <button class="btn-quick-view" onclick="openQuickView(${p.id})" title="معاينة وتفاصيل المنتج">
            <i class="fa-solid fa-eye"></i>
          </button>
        </div>
      </div>
    `;
    fragment.appendChild(card);
  });

  grid.innerHTML = '';
  grid.appendChild(fragment);

  // If silent update, show subtle live sync indicator
  if (isSilent) {
    showLiveSyncPill();
  }
}

// Synchronize Hero Banner Image with the Products database dynamically
function syncHeroBanner(products) {
  const heroImg = document.getElementById('heroShowcaseImg');
  if (!heroImg) return;

  const prods = products || shopState.products || [];
  if (prods.length === 0) return;

  // Look for EQ33 (the hero product featured in banner) or first product
  const heroProduct = prods.find(p => 
    (p.model && p.model.toUpperCase().includes('EQ33')) ||
    (p.name && p.name.includes('EQ33'))
  ) || prods[0];

  if (heroProduct && heroProduct.image_url) {
    // Append updated_at / timestamp for immediate cache-busting
    const v = heroProduct.updated_at ? encodeURIComponent(heroProduct.updated_at) : Date.now();
    const rawSrc = heroProduct.image_url.includes('?') 
      ? heroProduct.image_url 
      : `${heroProduct.image_url}?v=${v}`;
    const imgSrc = resolveAssetUrl(rawSrc);

    if (heroImg.getAttribute('data-current-src') !== imgSrc) {
      heroImg.setAttribute('data-current-src', imgSrc);
      
      // Smooth fade transition
      heroImg.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      heroImg.style.opacity = '0.3';
      
      const tempImg = new Image();
      tempImg.onload = () => {
        heroImg.src = imgSrc;
        heroImg.alt = heroProduct.name || 'إعلان منتج Sigma Store';
        heroImg.style.opacity = '1';
      };
      tempImg.onerror = () => {
        heroImg.src = resolveAssetUrl('/images/products/EQ33.jpg');
        heroImg.style.opacity = '1';
      };
      tempImg.src = imgSrc;

      heroImg.style.cursor = 'pointer';
      heroImg.title = `اضغط لمعاينة وتفاصيل ${heroProduct.name || heroProduct.model}`;
      heroImg.onclick = () => openQuickView(heroProduct.id);
    }
  }
}

// Visual Live Sync Toast/Indicator
let syncPillTimer = null;
function showLiveSyncPill() {
  let pill = document.getElementById('shopLiveSyncPill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'shopLiveSyncPill';
    pill.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      background: rgba(14, 165, 233, 0.95);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 20px;
      box-shadow: 0 4px 15px rgba(0, 229, 255, 0.4);
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 6px;
      backdrop-filter: blur(8px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      opacity: 0;
      transform: translateY(10px);
      pointer-events: none;
    `;
    pill.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> تم تحديث الأسعار والصور لحظياً!';
    document.body.appendChild(pill);
  }
  
  clearTimeout(syncPillTimer);
  pill.style.opacity = '1';
  pill.style.transform = 'translateY(0)';
  
  syncPillTimer = setTimeout(() => {
    pill.style.opacity = '0';
    pill.style.transform = 'translateY(10px)';
  }, 2200);
}

// True while the SSE stream is delivering updates; the polling fallback stands
// down whenever this is set so the two channels never duplicate each other.
let sseConnected = false;

// Real-Time Live Sync System (BroadcastChannel + SSE + Polling Fallback)
function initLiveSync() {
  // If running on static GitHub Pages hosting, disable background SSE and polling loops to prevent hanging!
  if (window.location.hostname.includes('github.io') || window.location.protocol === 'file:') {
    return;
  }

  // 1. Instant 0ms BroadcastChannel (syncs between Electron program & local shop windows)
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel('sigmastore_realtime_sync');
      channel.onmessage = (event) => {
        console.log('⚡ [Live Sync]: Instant update received via BroadcastChannel', event.data);
        loadShopProducts(true);
        loadStoreSettings();
      };
    } catch (e) {}
  }

  // 2. Server-Sent Events (SSE) (syncs to mobile phones and tablets over WiFi/Network)
  if (typeof EventSource !== 'undefined') {
    try {
      const eventSource = new EventSource('/api/sync/events');
      eventSource.onopen = () => { sseConnected = true; };
      eventSource.onmessage = (e) => {
        sseConnected = true;
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'PRODUCT_UPDATED' || data.type === 'DATA_CHANGED') {
            loadShopProducts(true);
            loadStoreSettings();
          }
        } catch (err) {}
      };
      eventSource.onerror = () => {
        // Hand the job back to the polling fallback until SSE reconnects
        sseConnected = false;
      };
    } catch (e) {}
  }

  // 3. Heartbeat polling — a FALLBACK, not a second live channel.
  // It used to fire every 4s unconditionally (about 900 requests an hour on a
  // shopper's phone) even while the SSE stream was already delivering updates and
  // even while the tab sat in the background. Now it only runs when SSE is not
  // carrying the load, and it pauses whenever the page is hidden.
  let lastSeenVersion = 0;

  const checkVersion = async () => {
    if (document.hidden) return;
    if (sseConnected) return;
    try {
      const res = await fetch('/api/sync/version');
      const data = await res.json();
      if (data.success && data.version) {
        if (lastSeenVersion && data.version !== lastSeenVersion) {
          loadShopProducts(true);
        }
        lastSeenVersion = data.version;
      }
    } catch (e) {}
  };

  setInterval(checkVersion, 20000);

  // 4. Page Focus / Tab Visibility Trigger
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      loadShopProducts(true);
    }
  });
  window.addEventListener('focus', () => {
    loadShopProducts(true);
  });
}

// 2. Search & Category Filters
function handleShopSearch() {
  const val = document.getElementById('shopSearchInput').value;
  shopState.searchQuery = val;
  document.getElementById('clearShopSearch').style.display = val ? 'block' : 'none';
  applyShopFilters();
}

function clearShopSearch() {
  document.getElementById('shopSearchInput').value = '';
  shopState.searchQuery = '';
  document.getElementById('clearShopSearch').style.display = 'none';
  applyShopFilters();
}

function filterShopCategory(cat, pillBtn) {
  shopState.selectedCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(btn => btn.classList.remove('active'));
  if (pillBtn) pillBtn.classList.add('active');
  applyShopFilters();
}

function applyShopSorting() {
  shopState.sortBy = document.getElementById('shopSortSelect').value;
  applyShopFilters();
}

function resetShopFilters() {
  shopState.selectedCategory = 'all';
  shopState.searchQuery = '';
  document.getElementById('shopSearchInput').value = '';
  document.getElementById('clearShopSearch').style.display = 'none';
  document.querySelectorAll('.cat-pill').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === 0);
  });
  applyShopFilters();
}

// 3. Quick View Modal
function openQuickView(productId) {
  const p = shopState.products.find(item => item.id === productId);
  if (!p) return;

  shopState.activeQvProduct = p;
  shopState.qvQty = 1;

  const fallbackImg = resolveAssetUrl('/images/products/EQ33.jpg');
  document.getElementById('qvImage').src = resolveAssetUrl(p.image_url) || fallbackImg;
  document.getElementById('qvBrandBadge').textContent = `ماركة: ${p.brand || 'Hoco'}`;
  document.getElementById('qvModelBadge').textContent = p.model ? `موديل: ${p.model}` : 'ملحقات أصلية';
  document.getElementById('qvCategory').textContent = p.category || 'أخرى';
  document.getElementById('qvName').textContent = p.name;
  document.getElementById('qvPrice').textContent = formatIQD(p.selling_price);
  document.getElementById('qvQtyDisplay').textContent = '1';

  // Realistic factual description
  document.getElementById('qvDescription').textContent = getProductDescription(p);

  const stockEl = document.getElementById('qvStockStatus');
  const isAvailable = (p.stock_quantity !== undefined && p.stock_quantity !== null) ? p.stock_quantity > 0 : true;

  if (isAvailable) {
    stockEl.innerHTML = `<i class="fa-solid fa-circle-check text-green"></i> متوفر وجاهز للتوصيل الفوري`;
  } else {
    stockEl.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger"></i> غير متوفر حالياً في المتجر`;
  }

  document.getElementById('productQuickViewModal').style.display = 'flex';
}

function closeQuickView() {
  document.getElementById('productQuickViewModal').style.display = 'none';
  shopState.activeQvProduct = null;
}

function changeQvQty(delta) {
  if (!shopState.activeQvProduct) return;
  const newQty = shopState.qvQty + delta;
  if (newQty >= 1 && newQty <= 99) {
    shopState.qvQty = newQty;
    document.getElementById('qvQtyDisplay').textContent = newQty;
  }
}

function addQvToCart() {
  if (!shopState.activeQvProduct) return;
  addItemToCart(shopState.activeQvProduct, shopState.qvQty);
  closeQuickView();
  toggleCart(true);
}

// 4. Cart Management & Drawer
const CART_STORAGE_KEY = 'sigmastore_cart';
const LEGACY_CART_STORAGE_KEY = 'mystore_cart';

function loadCartFromStorage() {
  try {
    // Fall back to the legacy key so carts saved before the rename survive
    const saved = localStorage.getItem(CART_STORAGE_KEY) || localStorage.getItem(LEGACY_CART_STORAGE_KEY);
    if (saved) {
      shopState.cart = JSON.parse(saved) || [];
    }
  } catch (e) {
    shopState.cart = [];
  }
  updateCartBadge();
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(shopState.cart));
    localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
  } catch (e) {}
  updateCartBadge();
  renderCartDrawer();
}

function addToCartById(productId) {
  const p = shopState.products.find(item => item.id === productId);
  if (!p) return;
  addItemToCart(p, 1);
  showShopToast(`تمت إضافة [${p.model || p.name}] إلى سلتك`, 'success');
}

function availableStock(product) {
  const s = product.stock_quantity;
  // Older exports may omit the field; treat that as "no limit known"
  return (s === undefined || s === null) ? Infinity : s;
}

function addItemToCart(product, qty = 1) {
  const limit = availableStock(product);
  if (limit <= 0) {
    showShopToast(`${product.model || product.name} غير متوفر حالياً`, 'error');
    return false;
  }

  const existing = shopState.cart.find(item => item.id === product.id);
  const current = existing ? existing.qty : 0;

  // The cart used to accept any quantity, so a shopper could order 61 of a
  // product with 10 in stock and only discover it after filling in the whole
  // checkout form. Cap it here, where they can still react.
  if (current + qty > limit) {
    const room = limit - current;
    if (room <= 0) {
      showShopToast(`لا تتوفر كمية إضافية من ${product.model || product.name} (الحد ${limit})`, 'error');
      return false;
    }
    qty = room;
    showShopToast(`الكمية المتوفرة ${limit} فقط، تمت إضافة ${room}`, 'error');
  }

  if (existing) {
    existing.qty += qty;
    // Always take the live price, never the one frozen when it was added
    existing.price = product.selling_price;
    existing.name = product.name;
    existing.model = product.model;
    existing.image_url = product.image_url;
  } else {
    shopState.cart.push({
      id: product.id,
      name: product.name,
      model: product.model,
      price: product.selling_price,
      image_url: product.image_url,
      qty: qty
    });
  }
  saveCartToStorage();
  return true;
}

// Brings a cart restored from localStorage back in line with the live catalogue:
// refreshes prices and names, drops products that no longer exist, and trims
// quantities down to what is actually on the shelf. Without this the shopper can
// see one total while the server records another.
function reconcileCartWithCatalogue() {
  if (!shopState.cart.length || !shopState.products.length) return;

  const notices = [];
  const reconciled = [];

  for (const item of shopState.cart) {
    const live = shopState.products.find(p => p.id === item.id);

    if (!live) {
      notices.push(`${item.model || item.name} لم يعد متوفراً وأُزيل من سلتك`);
      continue;
    }

    const limit = availableStock(live);
    if (limit <= 0) {
      notices.push(`${live.model || live.name} نفد من المخزن وأُزيل من سلتك`);
      continue;
    }

    if (Number(item.price) !== Number(live.selling_price)) {
      notices.push(`تغيّر سعر ${live.model || live.name} إلى ${formatIQD(live.selling_price)}`);
    }

    let qty = item.qty;
    if (qty > limit) {
      notices.push(`الكمية المتوفرة من ${live.model || live.name} أصبحت ${limit}`);
      qty = limit;
    }

    reconciled.push({
      id: live.id,
      name: live.name,
      model: live.model,
      price: live.selling_price,
      image_url: live.image_url,
      qty
    });
  }

  const changed =
    reconciled.length !== shopState.cart.length ||
    reconciled.some((r, i) => r.price !== shopState.cart[i].price || r.qty !== shopState.cart[i].qty);

  shopState.cart = reconciled;

  if (changed) {
    saveCartToStorage();
    notices.slice(0, 3).forEach((msg, i) => setTimeout(() => showShopToast(msg, 'error'), i * 900));
  }
}

function updateCartItemQty(index, delta) {
  const item = shopState.cart[index];
  if (!item) return;

  const newQty = item.qty + delta;
  if (newQty <= 0) {
    shopState.cart.splice(index, 1);
  } else {
    item.qty = newQty;
  }
  saveCartToStorage();
}

function removeCartItem(index) {
  shopState.cart.splice(index, 1);
  saveCartToStorage();
}

function clearFullCart() {
  shopState.cart = [];
  saveCartToStorage();
}

function toggleCart(open = true) {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (open) {
    renderCartDrawer();
    drawer.classList.add('active');
    overlay.classList.add('active');
  } else {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
  }
}

function updateCartBadge() {
  const totalCount = shopState.cart.reduce((sum, item) => sum + item.qty, 0);
  const totalAmount = shopState.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

  const badgeHeader = document.getElementById('cartCountBadge');
  if (badgeHeader) badgeHeader.textContent = totalCount;
  const totalHeader = document.getElementById('cartTotalHeader');
  if (totalHeader) totalHeader.textContent = formatIQD(totalAmount);
  const drawerCount = document.getElementById('cartDrawerCount');
  if (drawerCount) drawerCount.textContent = totalCount;

  // Mobile Bottom Nav Cart Badge & Amount
  const mBadge = document.getElementById('mobileCartCountBadge');
  if (mBadge) mBadge.textContent = totalCount;
  const mLabel = document.getElementById('mobileCartTotalLabel');
  if (mLabel) mLabel.textContent = totalCount > 0 ? formatIQD(totalAmount) : 'السلة';
}

function focusShopSearch() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const input = document.getElementById('shopSearchInput');
  if (input) {
    input.focus();
    input.select();
  }
}

function renderCartDrawer() {
  const container = document.getElementById('cartDrawerItems');
  const totalEl = document.getElementById('cartDrawerTotal');

  if (shopState.cart.length === 0) {
    container.innerHTML = `
      <div class="text-center p-4 text-muted">
        <i class="fa-solid fa-bag-shopping fa-3x mb-3 text-muted"></i>
        <h4>سلة المشتريات فارغة</h4>
        <p style="font-size: 12px;">اختر المنتجات التي ترغب بشرائها لإضافتها هنا</p>
      </div>
    `;
    totalEl.textContent = '0 د.ع';
    return;
  }

  container.innerHTML = '';
  let subtotal = 0;

  shopState.cart.forEach((item, index) => {
    subtotal += item.price * item.qty;
    const fallbackImg = resolveAssetUrl('/images/products/EQ33.jpg');

    const row = document.createElement('div');
    row.className = 'cart-drawer-item';
    row.innerHTML = `
      <img src="${resolveAssetUrl(item.image_url) || fallbackImg}" class="cart-item-thumb" onerror="this.src='${fallbackImg}'">
      <div class="cart-item-details">
        <div class="cart-item-title" title="${item.name}">${item.model ? `[${item.model}] ` : ''}${item.name}</div>
        <div class="cart-item-price">${formatIQD(item.price)}</div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="updateCartItemQty(${index}, -1)">-</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" onclick="updateCartItemQty(${index}, 1)">+</button>
          <button class="btn-remove-item" onclick="removeCartItem(${index})" title="حذف">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  totalEl.textContent = formatIQD(subtotal);
}

// 5. Checkout Modal & Order Submission
function openCheckoutModal() {
  if (shopState.cart.length === 0) {
    showShopToast('سلة المشتريات فارغة', 'error');
    return;
  }

  const subtotal = shopState.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  document.getElementById('checkoutTotalVal').textContent = formatIQD(subtotal);

  // Pre-fill customer info if available from session
  const cust = getCustomerSession();
  if (cust) {
    if (document.getElementById('orderCustName')) document.getElementById('orderCustName').value = cust.name || '';
    if (document.getElementById('orderCustPhone')) document.getElementById('orderCustPhone').value = cust.phone || '';
    if (document.getElementById('orderDistrict') && cust.district) document.getElementById('orderDistrict').value = cust.district;
    if (document.getElementById('orderAddress')) document.getElementById('orderAddress').value = cust.address || '';
  }

  toggleCart(false);
  document.getElementById('checkoutModal').style.display = 'flex';
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').style.display = 'none';
}

async function submitCustomerOrder(event) {
  event.preventDefault();

  const customer_name = document.getElementById('orderCustName').value.trim();
  const rawPhone = document.getElementById('orderCustPhone').value.trim();
  const customer_phone = cleanIraqiPhone(rawPhone);
  const city = 'ذي قار';
  const district = document.getElementById('orderDistrict') ? document.getElementById('orderDistrict').value : 'الناصرية';
  const address = document.getElementById('orderAddress').value.trim();
  const notes = document.getElementById('orderNotes').value.trim();
  const btn = document.getElementById('btnSubmitOrder');

  if (!customer_name || !customer_phone || !address) {
    showShopToast('يرجى ملء الحقول المطلوبة', 'error');
    return;
  }

  if (!isValidIraqiPhone(customer_phone)) {
    showShopToast('يرجى إدخال رقم هاتف عراقي صحيح مكون من 11 رقماً (مثل: 07830860919)', 'error');
    return;
  }

  const totalAmount = shopState.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  let orderNumber = 'SG-' + Math.floor(100000 + Math.random() * 900000);

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري إرسال وتأكيد الطلب...';

  try {
    const payload = {
      orderNumber,
      customer_name,
      customer_phone,
      city,
      district,
      address,
      notes,
      items: shopState.cart,
      totalAmount
    };

    // 1. Try local server endpoint if available.
    // A rejection from OUR server (out of stock, bad data) must stop the order.
    // No backend at all (GitHub Pages static hosting) must NOT stop it — the
    // WhatsApp/Telegram route is the real order channel there.
    //
    // The bug this replaces: on static hosting, POSTing to /api/shop/orders
    // doesn't throw — the static host answers with its own HTML error page
    // (GitHub Pages returns 405 for any non-GET request), so `res.ok` was false
    // and the code below treated that identically to a genuine server rejection:
    // it showed "تعذر إتمام الطلب" and stopped, before the WhatsApp fallback ever
    // ran. Every order placed on the published site failed silently this way.
    // The fix: only trust the response as a real rejection when it is actually
    // JSON from our own Express server (it always answers with res.json()); a
    // static host's error page is HTML and is treated like no backend at all.
    try {
      const res = await fetch('/api/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('not-a-real-backend');
      }

      const data = await res.json();

      if (!res.ok || data.success === false) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> تأكيد وإرسال الطلب';
        showShopToast(data.message || 'تعذر إتمام الطلب، يرجى المحاولة مرة أخرى', 'error');
        loadShopProducts(true);
        return;
      }

      if (data.orderNumber) {
        orderNumber = data.orderNumber;
      }
    } catch (_) {
      // No real backend reachable (static hosting, or a genuine network error):
      // fall through to the WhatsApp/Telegram notification path below.
    }

    // 2. The server sends the Telegram alert when it saves the order, so the bot
    // token stays on the server and out of this file.

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> تأكيد وإرسال الطلب';

    // 3. Complete order flow on client
    // Remember the shopper so the next checkout is pre-filled. openCheckoutModal()
    // already reads this session, but nothing ever wrote it, so returning
    // customers had to retype everything.
    saveCustomerSession({ name: customer_name, phone: customer_phone, district, address });

    closeCheckoutModal();
    clearFullCart();
    
    // Open Success Modal
    document.getElementById('successOrderRef').textContent = `#${orderNumber}`;
    document.getElementById('successOrderTotal').textContent = `المبلغ الكلي: ${formatIQD(totalAmount)}`;
    
    // WhatsApp message link
    const storeName = document.querySelector('.brand-title')?.textContent || 'SIGMA STORE';
    const msg = encodeURIComponent(`مرحباً ${storeName}، قمت بتأكيد طلب جديد رقم #${orderNumber} باسم (${customer_name}) في ذي قار (${district}) بقيمة (${formatIQD(totalAmount)}).`);
    const defaultWa = document.getElementById('btnWhatsAppContact')?.getAttribute('href') || 'https://wa.me/9647830860919';
    const cleanWaBase = defaultWa.split('?')[0];
    const btnWa = document.getElementById('btnWhatsAppContact');
    if (btnWa) btnWa.href = `${cleanWaBase}?text=${msg}`;

    document.getElementById('orderSuccessModal').style.display = 'flex';
  } catch (error) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> تأكيد وإرسال الطلب';
    showShopToast('حدث خطأ أثناء معالجة الطلب', 'error');
  }
}

function closeSuccessModal() {
  document.getElementById('orderSuccessModal').style.display = 'none';
  loadShopProducts();
}

// 6. Customer Repair Tracking
function openTrackModal() {
  document.getElementById('trackResultBox').style.display = 'none';
  document.getElementById('trackQueryInput').value = '';
  document.getElementById('trackRepairModal').style.display = 'flex';
}

function closeTrackModal() {
  document.getElementById('trackRepairModal').style.display = 'none';
}

async function searchCustomerRepair() {
  const query = document.getElementById('trackQueryInput').value.trim();
  const resultBox = document.getElementById('trackResultBox');
  const btn = document.getElementById('btnTrackSearch');

  if (!query) {
    showShopToast('يرجى إدخال رقم التذكرة أو رقم الهاتف', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري البحث...';

  try {
    const res = await fetch(`/api/shop/track-repair/${encodeURIComponent(query)}`);
    const data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> استعلام';

    if (data.success && data.repair) {
      const rep = data.repair;
      const statusMap = {
        'pending': { text: '🟡 قيد الفحص والتشخيص', bg: '#fef3c7', color: '#b45309' },
        'in_progress': { text: '🔵 قيد العمل والتصليح', bg: '#e0f2fe', color: '#0369a1' },
        'ready': { text: '🟢 جاهز للاستلام بالمحل', bg: '#dcfce7', color: '#15803d' },
        'delivered': { text: '✅ تم التسليم والمحاسبة', bg: '#f3f4f6', color: '#374151' },
        'unrepaired': { text: '❌ تعذر التصليح / ملغي', bg: '#fee2e2', color: '#b91c1c' }
      };
      const st = statusMap[rep.status] || { text: rep.status, bg: '#eee', color: '#333' };

      resultBox.innerHTML = `
        <div class="track-result-card">
          <div class="d-flex justify-between align-center mb-3">
            <div>
              <h3 style="font-size:15px;"><i class="fa-solid fa-wrench text-blue"></i> تذكرة صيانة رقم: #${escapeShopHtml(rep.ticket_number)}</h3>
              <span class="text-muted">الزبون: ${escapeShopHtml(rep.customer_name)}</span>
            </div>
            <span class="track-status-pill" style="background:${st.bg}; color:${st.color};">${st.text}</span>
          </div>

          <div class="track-row"><span>نوع وموديل الجهاز:</span> <strong>${escapeShopHtml(rep.device_type)} - ${escapeShopHtml(rep.device_model)}</strong></div>
          <div class="track-row"><span>وصف المشكلة:</span> <span>${escapeShopHtml(rep.issue_description)}</span></div>
          <div class="track-row"><span>المبلغ المتفق عليه:</span> <strong class="text-blue">${formatIQD(rep.total_charge)}</strong></div>
          <div class="track-row"><span>تاريخ الاستلام:</span> <small class="text-muted">${new Date(rep.received_at).toLocaleDateString('ar-IQ')}</small></div>
        </div>
      `;
      resultBox.style.display = 'block';
    } else {
      resultBox.innerHTML = `
        <div class="track-result-card text-center text-muted p-4">
          <i class="fa-solid fa-triangle-exclamation fa-2x mb-2 text-danger"></i>
          <p>لم يتم العثور على تذكرة صيانة مطابقة لهذا الرقم أو الهاتف. يرجى التأكد من الرقم المسجل في الوصل.</p>
        </div>
      `;
      resultBox.style.display = 'block';
    }
  } catch (error) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> استعلام';
    showShopToast('تعذر جلب تفاصيل التذكرة', 'error');
  }
}

// 7. Toast Notifications
function showShopToast(msg, type = 'success') {
  const container = document.getElementById('shopToastContainer');
  const toast = document.createElement('div');
  toast.className = `shop-toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check text-green' : 'fa-circle-exclamation text-danger'}"></i> <span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ==========================================================
// ==========================================================
// 8. IRAQI PHONE HELPERS & CUSTOMER SESSION
// ==========================================================
// The customer-account / OTP portal was reverted (commit 6c2f814) and its ~670
// lines referenced DOM elements that no longer exist. Only the helpers the live
// checkout flow actually calls are kept here.

function cleanIraqiPhone(phone) {
  if (!phone) return '';
  let p = phone.replace(/[\s\-\+\(\)]/g, '');
  if (p.startsWith('00964')) p = '0' + p.slice(5);
  else if (p.startsWith('964')) p = '0' + p.slice(3);
  return p;
}

function isValidIraqiPhone(phone) {
  const p = cleanIraqiPhone(phone);
  // Iraqi numbers start with 07 followed by 3-9, and are exactly 11 digits total
  return /^(07[3-9]\d{8})$/.test(p);
}

function detectCarrier(phone) {
  const p = cleanIraqiPhone(phone);
  if (!p || p.length < 3) return '';
  const prefix = p.substring(0, 3);
  if (prefix === '077') return 'شبكة آسيا سيل (Asiacell)';
  if (prefix === '078' || prefix === '079') return 'شبكة زين العراق (Zain)';
  if (prefix === '075') return 'شبكة كورك تيليكوم (Korek)';
  return 'رقم هاتف عراقي غير معروف';
}

// Convert an Iraqi number (07830860919) to international form (9647830860919)
function getIraqiPhoneInternational(phone) {
  let clean = (phone || '').replace(/\D/g, '');
  if (clean.startsWith('0')) clean = '964' + clean.substring(1);
  else if (!clean.startsWith('964')) clean = '964' + clean;
  return clean;
}

// Used by the checkout modal to pre-fill a returning shopper's details
function getCustomerSession() {
  try {
    const raw = localStorage.getItem('sigmastore_customer_session');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveCustomerSession(cust) {
  try {
    localStorage.setItem('sigmastore_customer_session', JSON.stringify(cust));
  } catch (e) {}
}
