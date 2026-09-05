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

// Telegram Notification Configuration
const TG_CONFIG = {
  token: '8751504494:AAFQhkPA4lX2rFNKDVsdziD1-td03hfgD48',
  chatIds: ['1390419753'] // Mohammed + friend can be added
};

// Dynamic Asset URL Resolver for GitHub Pages & Local
function resolveAssetUrl(url) {
  if (!url) return resolveAssetUrl('/images/products/EQ33.jpg');
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  
  let cleanUrl = url.startsWith('/') ? url : '/' + url;
  // Fix lowercase eq33 for Linux server case-sensitivity
  cleanUrl = cleanUrl.replace(/eq33\.jpg/gi, 'EQ33.jpg');

  const pathname = window.location.pathname;
  if (pathname.includes('/public/shop')) {
    const prefix = pathname.substring(0, pathname.indexOf('/public/shop'));
    return `${prefix}/public${cleanUrl}`;
  }
  return cleanUrl;
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
        const ph = document.getElementById('footerPhone');
        if (ph) ph.innerHTML = `<i class="fa-solid fa-phone text-blue"></i> خدمة الزبائن: ${s.phone}`;
        const wa = document.getElementById('btnWhatsAppContact');
        if (wa) wa.href = `https://wa.me/${s.phone.replace(/[^0-9]/g, '')}`;
      }
    }
  } catch (e) {}
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
    const q = shopState.searchQuery.trim().toLowerCase();
    list = list.filter(p => 
      p.name.toLowerCase().includes(q) ||
      (p.model && p.model.toLowerCase().includes(q)) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
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
    const fallbackImg = resolveAssetUrl('/images/products/eq33.jpg');
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

// Real-Time Live Sync System (BroadcastChannel + SSE + Polling Fallback)
function initLiveSync() {
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
      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'PRODUCT_UPDATED' || data.type === 'DATA_CHANGED') {
            console.log('📡 [Live Sync]: Real-time update received from server', data);
            loadShopProducts(true);
            loadStoreSettings();
          }
        } catch (err) {}
      };
      eventSource.onerror = () => {
        // SSE handles reconnection automatically
      };
    } catch (e) {}
  }

  // 3. Heartbeat Polling Fallback (every 4 seconds) to guarantee zero desync even if sleep/wake
  let lastSeenVersion = 0;
  setInterval(async () => {
    try {
      const res = await fetch('/api/sync/version');
      const data = await res.json();
      if (data.success && data.version) {
        if (lastSeenVersion && data.version !== lastSeenVersion) {
          console.log('🔄 [Live Sync]: Version change detected via heartbeat', data.version);
          loadShopProducts(true);
        }
        lastSeenVersion = data.version;
      }
    } catch (e) {}
  }, 4000);

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
function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('mystore_cart') || localStorage.getItem('sigmastore_cart');
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
    localStorage.setItem('mystore_cart', JSON.stringify(shopState.cart));
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

function addItemToCart(product, qty = 1) {
  const existing = shopState.cart.find(item => item.id === product.id);
  if (existing) {
    existing.qty += qty;
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
  toggleCart(false);
  document.getElementById('checkoutModal').style.display = 'flex';
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').style.display = 'none';
}

async function submitCustomerOrder(event) {
  event.preventDefault();

  const customer_name = document.getElementById('orderCustName').value.trim();
  const customer_phone = document.getElementById('orderCustPhone').value.trim();
  const city = document.getElementById('orderCity').value;
  const address = document.getElementById('orderAddress').value.trim();
  const notes = document.getElementById('orderNotes').value.trim();
  const btn = document.getElementById('btnSubmitOrder');

  if (!customer_name || !customer_phone || !address) {
    showShopToast('يرجى ملء الحقول المطلوبة', 'error');
    return;
  }

  const totalAmount = shopState.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  let orderNumber = 'SG-' + Math.floor(100000 + Math.random() * 900000);

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري إرسال وتأكيد الطلب...';

  try {
    const payload = {
      customer_name,
      customer_phone,
      city,
      address,
      notes,
      items: shopState.cart
    };

    // 1. Try local server endpoint if available
    try {
      const res = await fetch('/api/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.orderNumber) {
          orderNumber = data.orderNumber;
        }
      }
    } catch (_) {}

    // 2. Send instant Telegram Notification to Mohammed & team
    try {
      let itemsList = '';
      shopState.cart.forEach((it, idx) => {
        itemsList += `\n${idx + 1}. *${it.model ? `[${it.model}] ` : ''}${it.name}*\n   ▫️ الكمية: ${it.qty} قطعة | السعر: ${formatIQD(it.price * it.qty)}`;
      });

      const tgMsg = `🔔 *طلب شراء جديد من متجر Sigma Store!*
━━━━━━━━━━━━━━━━━━
🔢 *رقم الطلب:* #${orderNumber}
👤 *اسم الزبون:* ${customer_name}
📞 *رقم الهاتف:* \`${customer_phone}\`
📍 *الموقع:* ${city} - ${address}
${notes ? `📝 *ملاحظات:* ${notes}\n` : ''}━━━━━━━━━━━━━━━━━━
🛒 *المنتجات المطلوبة:*${itemsList}
━━━━━━━━━━━━━━━━━━
💰 *المجموع الكلي:* *${formatIQD(totalAmount)}*
⏰ *تاريخ ووقت الطلب:* ${new Date().toLocaleString('ar-IQ')}
━━━━━━━━━━━━━━━━━━`;

      for (const cid of TG_CONFIG.chatIds) {
        try {
          await fetch(`https://api.telegram.org/bot${TG_CONFIG.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: cid,
              text: tgMsg,
              parse_mode: 'Markdown'
            })
          });
        } catch (e) {
          console.warn('Telegram notification failed for chat:', cid, e);
        }
      }
    } catch (e) {
      console.warn('Telegram process error:', e);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> تأكيد وإرسال الطلب';

    // 3. Complete order flow on client
    closeCheckoutModal();
    clearFullCart();
    
    // Open Success Modal
    document.getElementById('successOrderRef').textContent = `#${orderNumber}`;
    document.getElementById('successOrderTotal').textContent = `المبلغ الكلي: ${formatIQD(totalAmount)}`;
    
    // WhatsApp message link
    const storeName = document.querySelector('.brand-title')?.textContent || 'Sigma Store';
    const msg = encodeURIComponent(`مرحباً ${storeName}، قمت بتأكيد طلب جديد رقم #${orderNumber} باسم (${customer_name}) بقيمة (${formatIQD(totalAmount)}).`);
    const defaultWa = document.getElementById('btnWhatsAppContact')?.getAttribute('href') || 'https://wa.me/9647700000000';
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
              <h3 style="font-size:15px;"><i class="fa-solid fa-wrench text-blue"></i> تذكرة صيانة رقم: #${rep.ticket_number}</h3>
              <span class="text-muted">الزبون: ${rep.customer_name}</span>
            </div>
            <span class="track-status-pill" style="background:${st.bg}; color:${st.color};">${st.text}</span>
          </div>

          <div class="track-row"><span>نوع وموديل الجهاز:</span> <strong>${rep.device_type} - ${rep.device_model}</strong></div>
          <div class="track-row"><span>وصف المشكلة:</span> <span>${rep.issue_description}</span></div>
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
