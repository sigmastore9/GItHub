// ==========================================================
// MY STORE INTERNAL ERP - APP LOGIC & STATE (UPDATED)
// ==========================================================

// Real-Time Cross-Window Sync with Customer Shop & Mobile Devices (Sigma Store)
let realtimeSyncChannel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    realtimeSyncChannel = new BroadcastChannel('sigmastore_realtime_sync');
  }
} catch (e) {}

function broadcastLocalSync(data = {}) {
  try {
    if (realtimeSyncChannel) {
      realtimeSyncChannel.postMessage({
        type: 'PRODUCT_UPDATED',
        timestamp: Date.now(),
        ...data
      });
    }
  } catch (e) {}
}

const state = {
  activeTab: 'inventory',
  products: [],
  filteredProducts: [],
  selectedCategory: 'all',
  searchQuery: '',
  stockFilter: 'all',
  viewMode: 'grid',
  
  // POS State
  posCart: [],
  posProducts: [],
  touchPosMode: false,
  posSelectedCategory: 'all',
  posPaymentType: 'cash',

  // Debts State
  debts: [],
  activeDebtForStatement: null,

  // Repairs State
  repairs: [],

  // Software Services State
  softwareServices: [],

  // Active product for image / quick sell modal
  activeImageProduct: null,
  activeQuickSellProduct: null,

  // Temp invoice parsed data
  parsedInvoiceData: null,

  // Settings
  settings: {
    store_name: 'Sigma Store',
    phone: '07830860919 - 07835046817',
    low_stock_threshold: 2
  }
};

// ==========================================================
// 1. INITIALIZATION & NAVIGATION
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
  initSidebarState();
  loadSettings();
  loadStats();
  loadProducts();
  loadRepairs();
  loadSoftwareServices();
  loadInvoicesList();
  loadOnlineOrders();
  loadDebts();
});

// Sidebar Collapse / Expand Functionality
function toggleSidebar() {
  const sidebar = document.getElementById('appSidebar') || document.querySelector('.app-sidebar');
  const toggleIcon = document.getElementById('sidebarToggleIcon');
  if (!sidebar) return;

  const isCollapsed = sidebar.classList.toggle('collapsed');
  localStorage.setItem('sigma_sidebar_collapsed', isCollapsed ? 'true' : 'false');

  if (toggleIcon) {
    toggleIcon.className = isCollapsed ? 'fa-solid fa-angles-left' : 'fa-solid fa-angles-right';
  }
}

function initSidebarState() {
  if (localStorage.getItem('sigma_sidebar_collapsed') === 'true') {
    const sidebar = document.getElementById('appSidebar') || document.querySelector('.app-sidebar');
    const toggleIcon = document.getElementById('sidebarToggleIcon');
    if (sidebar) {
      sidebar.classList.add('collapsed');
      if (toggleIcon) toggleIcon.className = 'fa-solid fa-angles-left';
    }
  }
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add('active');

  const navBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (tabId === 'inventory') {
    loadProducts();
  } else if (tabId === 'pos') {
    initPosCatalog();
  } else if (tabId === 'debts') {
    loadDebts();
  } else if (tabId === 'online-orders') {
    loadOnlineOrders();
  } else if (tabId === 'repairs') {
    loadRepairs();
  } else if (tabId === 'software') {
    loadSoftwareServices();
  } else if (tabId === 'stats') {
    loadStats();
    loadRecentSales();
  } else if (tabId === 'invoices') {
    loadInvoicesList();
  }
}

function formatCurrency(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 د.ع';
  const num = Number(amount);
  if (num < 0) {
    return `-${Math.abs(num).toLocaleString('ar-IQ')} د.ع`;
  }
  return num.toLocaleString('ar-IQ') + ' د.ع';
}

function formatNumber(num) {
  if (num === undefined || num === null || isNaN(num)) return '0';
  return Number(num).toLocaleString('ar-IQ');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================================
// 2. STATS & ALL-IN-ONE PROFITS
// ==========================================================
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (!data.success) return;

    const stats = data.stats;

    // Header Badges
    document.getElementById('headNetProfit').textContent = formatCurrency(stats.profit.totalNetProfit);
    document.getElementById('headInventoryValue').textContent = formatCurrency(stats.inventory.total_inventory_cost_value);
    
    const activeRepairsCount = (stats.repairs.all.pending_repairs || 0) + (stats.repairs.all.in_progress_repairs || 0) + (stats.repairs.all.ready_repairs || 0);
    document.getElementById('headActiveRepairs').textContent = `${formatNumber(activeRepairsCount)} جهاز`;
    document.getElementById('navRepairCount').textContent = activeRepairsCount;

    document.getElementById('headSoftwareProfit').textContent = formatCurrency(stats.profit.softwareProfit || 0);
    document.getElementById('navSoftwareCount').textContent = stats.software.all.total_software_count || 0;
    document.getElementById('navStockCount').textContent = formatNumber(stats.inventory.total_stock_units || 0);

    // Debts nav badge
    const navDebtsCountEl = document.getElementById('navDebtsCount');
    if (navDebtsCountEl && stats.debts) {
      navDebtsCountEl.textContent = formatNumber(stats.debts.active_debtors_count || 0);
    }

    // Tab 5: Dedicated Profit Section
    const masterProfitEl = document.getElementById('statMasterProfit');
    if (masterProfitEl) {
      masterProfitEl.textContent = formatCurrency(stats.profit.totalNetProfit);
      document.getElementById('statTodayProfit').textContent = formatCurrency(stats.profit.todayNetProfit);
      
      // 1. Product Sales Profit
      document.getElementById('statSalesProfit').textContent = formatCurrency(stats.profit.salesProfit);
      document.getElementById('statSalesRevenue').textContent = formatCurrency(stats.sales.all.total_sales_revenue);
      
      // 2. Hardware Repairs Profit & Losses
      document.getElementById('statWorkshopProfit').textContent = formatCurrency(stats.profit.repairNetProfit);
      document.getElementById('statWorkshopLoss').textContent = formatCurrency(stats.profit.repairLoss || 0);
      
      // 3. Software Profit
      document.getElementById('statSoftwareProfit').textContent = formatCurrency(stats.profit.softwareProfit);
      document.getElementById('statSoftwareRevenue').textContent = formatCurrency(stats.software.all.total_software_revenue);

      // Inventory Values
      document.getElementById('statInventoryCost').textContent = formatCurrency(stats.inventory.total_inventory_cost_value);
      document.getElementById('statInventoryRetail').textContent = formatCurrency(stats.inventory.total_inventory_retail_value);
      document.getElementById('statStockUnits').textContent = `${formatNumber(stats.inventory.total_stock_units)} قطعة`;
      document.getElementById('statSoldUnits').textContent = `${formatNumber(stats.inventory.total_sold_units)} قطعة`;
      document.getElementById('statLowStockCount').textContent = `${formatNumber(stats.stockAlerts.lowStock)} منتج`;

      // Render Smart Retail Analytics (Top Sellers & Dead Stock)
      renderTopSellers(stats.topSellers || []);
      renderDeadStock(stats.deadStock || []);
    }

    // Tab 3: Repair KPIs
    const repPendingEl = document.getElementById('repairPendingCount');
    if (repPendingEl) {
      repPendingEl.textContent = formatNumber(stats.repairs.all.pending_repairs || 0);
      document.getElementById('repairProgressCount').textContent = formatNumber(stats.repairs.all.in_progress_repairs || 0);
      document.getElementById('repairReadyCount').textContent = formatNumber(stats.repairs.all.ready_repairs || 0);
      document.getElementById('repairUnrepairedCount').textContent = `${formatNumber(stats.repairs.all.unrepaired_repairs || 0)} (${formatCurrency(stats.repairs.loss || 0)})`;
      document.getElementById('repairTotalProfit').textContent = formatCurrency(stats.repairs.netProfit || 0);
    }

    // Tab 4: Software KPIs
    const sftTotalEl = document.getElementById('sftTotalCount');
    if (sftTotalEl) {
      sftTotalEl.textContent = formatNumber(stats.software.all.total_software_count || 0);
      document.getElementById('sftCompletedCount').textContent = formatNumber(stats.software.all.completed_software || 0);
      document.getElementById('sftTotalProfit').textContent = formatCurrency(stats.software.all.total_software_profit || 0);
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Render Top 5 Best Sellers Leaderboard
function renderTopSellers(topSellers) {
  const container = document.getElementById('topSellersList');
  if (!container) return;

  if (topSellers.length === 0) {
    container.innerHTML = '<div class="p-3 text-center text-muted">لا توجد مبيعات مسجلة حتى الآن</div>';
    return;
  }

  container.innerHTML = '';
  topSellers.forEach((p, index) => {
    const rank = index + 1;
    let rankClass = 'rank-badge';
    let medal = `${rank}`;
    if (rank === 1) { rankClass += ' rank-1'; medal = '🥇'; }
    else if (rank === 2) { rankClass += ' rank-2'; medal = '🥈'; }
    else if (rank === 3) { rankClass += ' rank-3'; medal = '🥉'; }

    const item = document.createElement('div');
    item.className = 'top-seller-item';
    item.innerHTML = `
      <div class="d-flex align-center">
        <span class="${rankClass}">${medal}</span>
        <img src="${p.image_url || '/images/products/eq33.jpg'}" class="item-thumb-sm" onerror="this.src='/images/products/eq33.jpg'">
        <div>
          <strong class="text-info">${p.model || p.name}</strong>
          <div style="font-size:11px; color:var(--text-muted);">${p.category} | ${p.brand || 'Hoco'}</div>
        </div>
      </div>
      <div class="text-left">
        <div><span class="badge badge-success">${formatNumber(p.total_sold)} مباع</span></div>
        <strong class="text-success" style="font-size:12px;">+${formatCurrency(p.total_profit)} أرباح</strong>
      </div>
    `;
    container.appendChild(item);
  });
}

// Render Dead Stock & Tied-up Capital
function renderDeadStock(deadStock) {
  const container = document.getElementById('deadStockList');
  const tiedCapEl = document.getElementById('deadStockTiedCapital');
  if (!container) return;

  if (deadStock.length === 0) {
    container.innerHTML = '<div class="p-3 text-center text-success"><i class="fa-solid fa-circle-check"></i> ممتااز! لا يوجد أي مخزون راكد، كل المنتجات تتحرك</div>';
    if (tiedCapEl) tiedCapEl.textContent = 'رأس مال مجمد: 0 د.ع';
    return;
  }

  let totalTiedCapital = 0;
  container.innerHTML = '';

  deadStock.forEach(p => {
    totalTiedCapital += (p.tied_up_capital || 0);

    const item = document.createElement('div');
    item.className = 'dead-stock-item';
    item.innerHTML = `
      <div class="d-flex align-center">
        <img src="${p.image_url || '/images/products/eq33.jpg'}" class="item-thumb-sm" onerror="this.src='/images/products/eq33.jpg'">
        <div>
          <strong class="text-warning">${p.model || p.name}</strong>
          <div style="font-size:11px; color:var(--text-muted);">
            المتوفر: <b>${p.stock_quantity}</b> | سعر الشراء: ${formatCurrency(p.cost_price)}
          </div>
        </div>
      </div>
      <div class="text-left">
        <strong class="text-danger">${formatCurrency(p.tied_up_capital)}</strong>
        <div style="font-size:11px; color:var(--text-muted);">رأس مال مجمد</div>
      </div>
    `;
    container.appendChild(item);
  });

  if (tiedCapEl) {
    tiedCapEl.textContent = `رأس مال مجمد: ${formatCurrency(totalTiedCapital)}`;
  }
}

// ==========================================================
// 3. PRODUCTS & INVENTORY (SIMPLIFIED PRICING)
// ==========================================================
async function loadProducts() {
  const loading = document.getElementById('productsLoading');
  const empty = document.getElementById('productsEmpty');
  const grid = document.getElementById('productsGrid');

  loading.style.display = 'block';
  empty.style.display = 'none';

  try {
    const stockStatus = document.getElementById('stockFilterSelect').value;
    let url = `/api/products?stockStatus=${stockStatus}`;
    if (state.searchQuery) url += `&search=${encodeURIComponent(state.searchQuery)}`;
    if (state.selectedCategory && state.selectedCategory !== 'all') url += `&category=${encodeURIComponent(state.selectedCategory)}`;

    const res = await fetch(url);
    const data = await res.json();
    loading.style.display = 'none';

    if (!data.success || !data.products || data.products.length === 0) {
      state.products = [];
      empty.style.display = 'block';
      grid.innerHTML = '';
      document.getElementById('productsTableBody').innerHTML = '';
      updateCategoryCounts([]);
      return;
    }

    state.products = data.products;
    renderProducts();
    updateCategoryCounts(state.products);
  } catch (error) {
    loading.style.display = 'none';
    showToast('حدث خطأ أثناء تحميل المنتجات', 'error');
  }
}

// High-Speed Debounce Helper to eliminate redundant network requests
function debounce(fn, delay = 200) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function handleProductSearch() {
  const val = document.getElementById('productSearchInput').value.trim();
  state.searchQuery = val;
  document.getElementById('clearSearchBtn').style.display = val ? 'block' : 'none';
  loadProducts();
}

const debouncedProductSearch = debounce(handleProductSearch, 200);

function clearSearch() {
  document.getElementById('productSearchInput').value = '';
  state.searchQuery = '';
  document.getElementById('clearSearchBtn').style.display = 'none';
  loadProducts();
}

function filterCategory(category, chipElement) {
  state.selectedCategory = category;
  document.querySelectorAll('.category-chips .chip').forEach(c => c.classList.remove('active'));
  if (chipElement) chipElement.classList.add('active');
  loadProducts();
}

function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById('btnViewGrid').classList.toggle('active', mode === 'grid');
  document.getElementById('btnViewTable').classList.toggle('active', mode === 'table');
  document.getElementById('productsGrid').style.display = mode === 'grid' ? 'grid' : 'none';
  document.getElementById('productsTableContainer').style.display = mode === 'table' ? 'block' : 'none';
}

function updateCategoryCounts(products) {
  document.getElementById('catCountAll').textContent = products.length;
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const tbody = document.getElementById('productsTableBody');
  grid.innerHTML = '';
  tbody.innerHTML = '';

  const lowStockLimit = parseInt(state.settings.low_stock_threshold || 2, 10);

  state.products.forEach(p => {
    const unitProfit = p.selling_price - p.cost_price;
    const profitMarginPercent = p.cost_price > 0 ? Math.round((unitProfit / p.cost_price) * 100) : 0;

    let stockClass = 'stock-remain';
    if (p.stock_quantity <= 0) stockClass += ' out';
    else if (p.stock_quantity <= lowStockLimit) stockClass += ' low';

    const fallbackImg = '/images/products/eq33.jpg';
    const cacheBuster = p.updated_at ? encodeURIComponent(p.updated_at) : Date.now();
    const imgSrc = p.image_url ? (p.image_url.includes('?') ? p.image_url : `${p.image_url}?v=${cacheBuster}`) : fallbackImg;

    // 1. Grid Card
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="card-img-wrap" onclick="openImageModal(${p.id})">
        <img src="${imgSrc}" alt="${p.name}" loading="lazy" onerror="this.src='${fallbackImg}'">
        <span class="card-badge-brand">${p.brand || 'Hoco'}</span>
        <span class="card-badge-category">${p.category || 'أخرى'}</span>
        <span class="card-zoom-hint"><i class="fa-solid fa-expand"></i> تكبير وتغيير الصورة</span>
      </div>

      <div class="card-body">
        <div class="card-title-row">
          <span class="card-model">${p.model || ''}</span>
        </div>
        <h4 class="card-name" title="${p.name}">${p.name}</h4>

        <!-- 3-Counters (Remaining, Sold, Total) -->
        <div class="stock-counters-row">
          <div class="stock-box">
            <span class="stock-label">المتوفر بالمخزن</span>
            <span class="stock-value ${stockClass}">${formatNumber(p.stock_quantity)}</span>
          </div>
          <div class="stock-box">
            <span class="stock-label">تم بيعه</span>
            <span class="stock-value stock-sold">${formatNumber(p.sold_quantity)}</span>
          </div>
          <div class="stock-box">
            <span class="stock-label">إجمالي الشراء</span>
            <span class="stock-value stock-total">${formatNumber(p.total_quantity)}</span>
          </div>
        </div>

        <!-- Simplified Pricing: سعر الجملة & سعر البيع للزبون -->
        <div class="pricing-block">
          <div class="price-row">
            <span class="price-cost">سعر الجملة (التكلفة):</span>
            <strong>${formatCurrency(p.cost_price)}</strong>
          </div>
          <div class="price-row">
            <span>سعر البيع للزبون:</span>
            <span class="price-sell">${formatCurrency(p.selling_price)}</span>
          </div>
          <div class="price-row" style="border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 4px; margin-top: 4px;">
            <span class="text-muted">الربح المتوقع بالقطعة:</span>
            <span class="price-profit-badge">+${formatCurrency(unitProfit)} (${profitMarginPercent}%)</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="card-actions">
          <button class="btn-quick-sell" onclick="openQuickSellModal(${p.id})" ${p.stock_quantity <= 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} title="بيع مع إمكانية تعديل السعر أو الخصم">
            <i class="fa-solid fa-bolt"></i> بيع قطعة
          </button>
          <button class="btn-icon-action" onclick="openEditProductModal(${p.id})" title="تعديل تفاصيل المنتج والأسعار">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn-icon-action btn-del" onclick="deleteProductItem(${p.id})" title="حذف المنتج">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);

    // 2. Table Row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <img src="${imgSrc}" class="table-thumbnail" onclick="openImageModal(${p.id})" onerror="this.src='${fallbackImg}'">
      </td>
      <td>
        <strong class="text-info">${p.model || ''}</strong><br>
        <small>${p.name}</small>
      </td>
      <td>${p.category}</td>
      <td>${formatCurrency(p.cost_price)}</td>
      <td><strong class="text-success">${formatCurrency(p.selling_price)}</strong></td>
      <td>${formatNumber(p.total_quantity)}</td>
      <td>${formatNumber(p.sold_quantity)}</td>
      <td><strong class="${p.stock_quantity <= 0 ? 'text-danger' : 'text-success'}">${formatNumber(p.stock_quantity)}</strong></td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-success" onclick="openQuickSellModal(${p.id})" ${p.stock_quantity <= 0 ? 'disabled' : ''}><i class="fa-solid fa-bolt"></i></button>
          <button class="btn btn-sm btn-secondary" onclick="openEditProductModal(${p.id})"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-ghost" onclick="deleteProductItem(${p.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================================
// 4. QUICK SELL MODAL WITH CUSTOM PRICE & DISCOUNT
// ==========================================================
function openQuickSellModal(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod || prod.stock_quantity <= 0) {
    showToast('المنتج غير متوفر في المخزن حالياً', 'error');
    return;
  }

  state.activeQuickSellProduct = prod;
  document.getElementById('qsProductId').value = prod.id;
  document.getElementById('qsProductName').textContent = `[${prod.model || ''}] ${prod.name}`;
  document.getElementById('qsProductCost').textContent = formatCurrency(prod.cost_price);
  document.getElementById('qsProductDefaultPrice').textContent = formatCurrency(prod.selling_price);

  document.getElementById('qsQuantity').value = 1;
  document.getElementById('qsUnitPrice').value = prod.selling_price;
  document.getElementById('qsDiscount').value = 0;
  document.getElementById('qsCustomerName').value = '';

  calcQuickSellProfit();
  document.getElementById('quickSellModal').style.display = 'flex';
}

function closeQuickSellModal() {
  document.getElementById('quickSellModal').style.display = 'none';
  state.activeQuickSellProduct = null;
}

function calcQuickSellProfit() {
  if (!state.activeQuickSellProduct) return;
  const cost = state.activeQuickSellProduct.cost_price;
  const qty = parseInt(document.getElementById('qsQuantity').value, 10) || 1;
  const unitPrice = parseFloat(document.getElementById('qsUnitPrice').value) || 0;
  const discount = parseFloat(document.getElementById('qsDiscount').value) || 0;

  const totalAmount = Math.max(0, (unitPrice * qty) - discount);
  const totalCost = cost * qty;
  const profit = totalAmount - totalCost;

  const profitEl = document.getElementById('qsProfitPreview');
  profitEl.textContent = formatCurrency(profit);
  profitEl.className = profit >= 0 ? 'profit-box' : 'profit-box text-danger';
}

async function submitQuickSell(event) {
  event.preventDefault();
  if (!state.activeQuickSellProduct) return;

  const prod = state.activeQuickSellProduct;
  const qty = parseInt(document.getElementById('qsQuantity').value, 10) || 1;
  const unitPrice = parseFloat(document.getElementById('qsUnitPrice').value) || prod.selling_price;
  const discount = parseFloat(document.getElementById('qsDiscount').value) || 0;
  const customerName = document.getElementById('qsCustomerName').value.trim() || 'زبون مباشر';

  try {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: prod.id,
        quantity: qty,
        unit_price: unitPrice,
        discount: discount,
        customer_name: customerName,
        sold_by: 'مدير المتجر'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`تم بيع (${qty}) قطع بنجاح! + ربح: ${formatCurrency(data.profit)}`, 'success');
      closeQuickSellModal();
      loadProducts();
      loadStats();
      broadcastLocalSync({ type: 'STOCK_CHANGED', productId: prod.id });
    } else {
      showToast(data.message || 'حدث خطأ أثناء البيع', 'error');
    }
  } catch (error) {
    showToast('فشل في تسجيل عملية البيع', 'error');
  }
}

async function deleteProductItem(productId) {
  if (!confirm('هل أنت متأكد من حذف هذا المنتج نهائياً من المخزن؟')) return;
  try {
    const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('تم حذف المنتج بنجاح', 'success');
      loadProducts();
      loadStats();
      broadcastLocalSync({ type: 'PRODUCT_DELETED', productId });
    }
  } catch (error) {
    showToast('فشل في حذف المنتج', 'error');
  }
}

// ==========================================================
// 5. MULTI-BRAND IMAGE LIGHTBOX & LIVE OFFICIAL GALLERY
// ==========================================================
let formImageSearchTarget = null; // 'productForm' or 'existingProduct'

function openImageModal(productId) {
  formImageSearchTarget = null;
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  state.activeImageProduct = prod;
  const modal = document.getElementById('imageLightboxModal');
  document.getElementById('viewerImageElement').src = prod.image_url || '';
  document.getElementById('viewerProductName').textContent = prod.name;
  document.getElementById('viewerProductModel').textContent = `الموديل: ${prod.model || 'غير محدد'} | الصنف: ${prod.category} | الماركة: ${prod.brand || 'Hoco'}`;
  document.getElementById('viewerUrlInput').value = prod.image_url || '';

  // Auto detect brand selector
  const brandSelect = document.getElementById('imgSearchBrand');
  const bLower = (prod.brand || '').toLowerCase();
  if (bLower.includes('borofone') || bLower.includes('بوروفون')) brandSelect.value = 'borofone';
  else if (bLower.includes('joyroom') || bLower.includes('جويروم')) brandSelect.value = 'joyroom';
  else if (bLower.includes('anker') || bLower.includes('أنكر')) brandSelect.value = 'anker';
  else if (bLower.includes('baseus') || bLower.includes('بيسوس')) brandSelect.value = 'baseus';
  else if (bLower.includes('remax') || bLower.includes('ريماكس')) brandSelect.value = 'remax';
  else if (bLower.includes('acefast') || bLower.includes('ايسي')) brandSelect.value = 'acefast';
  else if (bLower.includes('marshall') || bLower.includes('مارشال')) brandSelect.value = 'marshall';
  else if (bLower.includes('samsung') || bLower.includes('سامسونج')) brandSelect.value = 'samsung';
  else if (bLower.includes('apple') || bLower.includes('آبل')) brandSelect.value = 'apple';
  else if (bLower.includes('xiaomi') || bLower.includes('شاومي')) brandSelect.value = 'xiaomi';
  else if (bLower.includes('hoco') || bLower.includes('هوكو')) brandSelect.value = 'hoco';
  else brandSelect.value = 'web';

  // Pre-fill clean model code (e.g., "EQ33" from "EQ33 TWS")
  let cleanCode = (prod.model || '').replace(/TC-TC|IP-TC|25CM|4IN1/gi, '').trim();
  if (!cleanCode) cleanCode = prod.name.split(' ')[0] || '';
  document.getElementById('imgSearchQuery').value = cleanCode;

  modal.style.display = 'flex';

  // Automatically trigger search for the model
  performBrandImageSearch();
}

function searchWebImageForForm() {
  formImageSearchTarget = 'productForm';
  const model = document.getElementById('prodFormModel').value.trim();
  const name = document.getElementById('prodFormName').value.trim();
  const brand = document.getElementById('prodFormBrand').value.trim();

  const modal = document.getElementById('imageLightboxModal');
  document.getElementById('viewerProductName').textContent = name || 'منتج جديد';
  document.getElementById('viewerProductModel').textContent = `الموديل: ${model || 'غير محدد'} | الماركة: ${brand || 'عام'}`;
  document.getElementById('viewerImageElement').src = document.getElementById('prodFormImageUrl').value || '';
  document.getElementById('viewerUrlInput').value = document.getElementById('prodFormImageUrl').value || '';

  const brandSelect = document.getElementById('imgSearchBrand');
  const bLower = (brand || '').toLowerCase();
  if (bLower.includes('borofone') || bLower.includes('بوروفون')) brandSelect.value = 'borofone';
  else if (bLower.includes('joyroom') || bLower.includes('جويروم')) brandSelect.value = 'joyroom';
  else if (bLower.includes('anker') || bLower.includes('أنكر')) brandSelect.value = 'anker';
  else if (bLower.includes('baseus') || bLower.includes('بيسوس')) brandSelect.value = 'baseus';
  else if (bLower.includes('remax') || bLower.includes('ريماكس')) brandSelect.value = 'remax';
  else if (bLower.includes('acefast') || bLower.includes('ايسي')) brandSelect.value = 'acefast';
  else if (bLower.includes('marshall') || bLower.includes('مارشال')) brandSelect.value = 'marshall';
  else if (bLower.includes('samsung') || bLower.includes('سامسونج')) brandSelect.value = 'samsung';
  else if (bLower.includes('apple') || bLower.includes('آبل')) brandSelect.value = 'apple';
  else if (bLower.includes('xiaomi') || bLower.includes('شاومي')) brandSelect.value = 'xiaomi';
  else if (bLower.includes('hoco') || bLower.includes('هوكو')) brandSelect.value = 'hoco';
  else brandSelect.value = 'web';

  document.getElementById('imgSearchQuery').value = model || name;
  modal.style.display = 'flex';

  if (model || name) {
    performBrandImageSearch();
  }
}

function closeImageModal() {
  document.getElementById('imageLightboxModal').style.display = 'none';
  state.activeImageProduct = null;
  formImageSearchTarget = null;
}

async function performBrandImageSearch() {
  const brand = document.getElementById('imgSearchBrand').value;
  const query = document.getElementById('imgSearchQuery').value.trim();
  const loading = document.getElementById('imgSearchResultsLoading');
  const empty = document.getElementById('imgSearchResultsEmpty');
  const grid = document.getElementById('imgSearchResultsGrid');

  if (!query) {
    showToast('يرجى إدخال موديل أو اسم المنتج للبحث', 'error');
    return;
  }

  loading.style.display = 'block';
  empty.style.display = 'none';
  grid.innerHTML = '';

  const category = state.activeImageProduct ? state.activeImageProduct.category : (document.getElementById('prodFormCategory') ? document.getElementById('prodFormCategory').value : '');
  const productName = state.activeImageProduct ? state.activeImageProduct.name : (document.getElementById('prodFormName') ? document.getElementById('prodFormName').value : '');
  const model = state.activeImageProduct ? state.activeImageProduct.model : query;

  try {
    const res = await fetch('/api/search-brand-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand,
        query,
        model,
        category,
        productName
      })
    });

    const data = await res.json();
    loading.style.display = 'none';

    if (data.success && data.images && data.images.length > 0) {
      renderBrandSearchResults(data.images);
    } else {
      empty.style.display = 'block';
      const badge = document.getElementById('imgResultsCountBadge');
      if (badge) badge.style.display = 'none';
    }
  } catch (error) {
    loading.style.display = 'none';
    empty.style.display = 'block';
    const badge = document.getElementById('imgResultsCountBadge');
    if (badge) badge.style.display = 'none';
    showToast('تعذر الاتصال بالويب للبحث عن الصور', 'error');
  }
}

function openInGoogleLens() {
  const currentUrl = document.getElementById('viewerUrlInput').value.trim() || (state.activeImageProduct ? state.activeImageProduct.image_url : '');
  const query = document.getElementById('imgSearchQuery').value.trim();
  const brand = document.getElementById('imgSearchBrand').value;
  const cat = state.activeImageProduct ? state.activeImageProduct.category : (document.getElementById('prodFormCategory') ? document.getElementById('prodFormCategory').value : '');

  if (currentUrl && (currentUrl.startsWith('http://') || currentUrl.startsWith('https://'))) {
    // Direct reverse lookup via Google Lens
    window.open(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(currentUrl)}`, '_blank');
  } else {
    // Open Google Images with the smart product query
    const brandPrefix = (brand && brand !== 'web') ? brand : '';
    const fullQuery = `${brandPrefix} ${query} ${cat}`.trim();
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(fullQuery || 'mobile accessories')}`, '_blank');
  }
}

function renderBrandSearchResults(images) {
  const grid = document.getElementById('imgSearchResultsGrid');
  grid.innerHTML = '';

  const badge = document.getElementById('imgResultsCountBadge');
  if (badge) {
    badge.style.display = 'inline-block';
    badge.textContent = `🎯 تم العثور على ${images.length} صورة متوفرة بجودة عالية`;
  }

  const currentUrl = state.activeImageProduct ? state.activeImageProduct.image_url : (document.getElementById('prodFormImageUrl') ? document.getElementById('prodFormImageUrl').value : '');

  images.forEach((imgItem, idx) => {
    const isCurrent = currentUrl === imgItem.url;
    const card = document.createElement('div');
    card.className = `brand-img-card ${isCurrent ? 'active-selected' : ''}`;
    
    let sourceLabel = imgItem.source || 'الموقع الرسمي';
    let sourceClass = imgItem.type === 'local_studio' ? 'local' : (imgItem.type === 'web_hd' ? 'web' : '');

    card.innerHTML = `
      <div class="brand-img-thumb" onclick="previewLargeImage('${imgItem.url}')" title="اضغط للتكبير والمعاينة">
        <span class="brand-source-tag ${sourceClass}">${sourceLabel}</span>
        <img src="${imgItem.thumbnail || imgItem.url}" alt="${imgItem.title}" loading="lazy" onerror="this.parentElement.parentElement.style.display='none'">
      </div>
      <div class="brand-card-footer">
        <span class="brand-img-title" title="${imgItem.title}">${imgItem.title}</span>
        <div class="brand-card-actions">
          <button class="btn-select-podium" onclick="selectAndApplyImage('${imgItem.url}', this, true)" title="تفريغ الخلفية وتركيب المنتج على منصة الاستوديو">
            <i class="fa-solid fa-wand-magic-sparkles"></i> استوديو
          </button>
          <button class="btn-select-direct" onclick="selectAndApplyImage('${imgItem.url}', this, false)" title="اعتماد الصورة الأصلية كما هي">
            <i class="fa-solid fa-check"></i> مباشر
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function previewLargeImage(url) {
  document.getElementById('viewerImageElement').src = url;
  document.getElementById('viewerUrlInput').value = url;
}

async function selectAndApplyImage(imageUrl, buttonEl, compositePodium = false) {
  // If target is Add/Edit Product form:
  if (formImageSearchTarget === 'productForm') {
    if (buttonEl) buttonEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ...';
    
    // Download image or composite if needed
    try {
      showToast('جاري حفظ الصورة وتجهيزها للمنتج...', 'info');
      const res = await fetch('/api/apply-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: document.getElementById('prodFormId').value || 0,
          imageUrl: imageUrl,
          compositePodium: compositePodium
        })
      });
      const data = await res.json();
      const finalUrl = data.imageUrl || imageUrl;
      
      document.getElementById('prodFormImageUrl').value = finalUrl;
      document.getElementById('viewerImageElement').src = finalUrl;
      showToast(compositePodium ? 'تم دمج الصورة على منصة الاستوديو وتعيينها للمنتج!' : 'تم تعيين صورة المنتج بنجاح!', 'success');
      closeImageModal();
      return;
    } catch(e) {
      document.getElementById('prodFormImageUrl').value = imageUrl;
      showToast('تم تعيين رابط الصورة للمنتج', 'success');
      closeImageModal();
      return;
    }
  }

  // If target is existing product in table:
  if (!state.activeImageProduct) return;
  const p = state.activeImageProduct;

  if (buttonEl) {
    buttonEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
  }

  try {
    const res = await fetch('/api/apply-product-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: p.id,
        imageUrl: imageUrl,
        compositePodium: compositePodium
      })
    });

    const data = await res.json();
    if (data.success) {
      p.image_url = data.imageUrl;
      document.getElementById('viewerImageElement').src = data.imageUrl;
      document.getElementById('viewerUrlInput').value = data.imageUrl;
      
      // Update UI cards
      document.querySelectorAll('.brand-img-card').forEach(c => c.classList.remove('active-selected'));
      if (buttonEl) {
        buttonEl.closest('.brand-img-card').classList.add('active-selected');
      }

      showToast(data.message || 'تم اعتماد وتثبيت صورة المنتج بنجاح!', 'success');
      loadProducts();
      broadcastLocalSync({ type: 'IMAGE_UPDATED', productId: p.id, imageUrl: data.imageUrl });
    } else {
      showToast(data.message || 'فشل في حفظ الصورة', 'error');
    }
  } catch (error) {
    showToast('حدث خطأ أثناء حفظ الصورة', 'error');
  }
}

// Auto-detect brand & category when user types model code in Add Product Form
let modelDetectTimer = null;
function onProductModelInput() {
  clearTimeout(modelDetectTimer);
  modelDetectTimer = setTimeout(async () => {
    const model = document.getElementById('prodFormModel').value.trim();
    if (!model || model.length < 2) return;

    try {
      const res = await fetch('/api/detect-product-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      });
      const data = await res.json();
      if (data.success && data.data) {
        const info = data.data;
        if (info.brand) document.getElementById('prodFormBrand').value = info.brand;
        if (info.category && info.category !== 'أخرى') document.getElementById('prodFormCategory').value = info.category;
        
        // If product name is empty, prefill smart name
        const nameInput = document.getElementById('prodFormName');
        if (!nameInput.value.trim() && info.name) {
          nameInput.value = info.name;
        }
      }
    } catch(e) {}
  }, 400);
}

async function uploadProductImage(event) {
  const file = event.target.files[0];
  if (!file || !state.activeImageProduct) return;

  const formData = new FormData();
  formData.append('image', file);

  try {
    showToast('جاري رفع الصورة...', 'success');
    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.success) {
      await updateProductImageUrl(data.imageUrl);
      document.getElementById('viewerImageElement').src = data.imageUrl;
      showToast('تم رفع وتثبيت صورة المنتج بنجاح!', 'success');
    }
  } catch (error) {
    showToast('فشل في رفع الصورة', 'error');
  }
}

async function applyImageUrl() {
  const url = document.getElementById('viewerUrlInput').value.trim();
  if (!url || !state.activeImageProduct) return;

  await updateProductImageUrl(url);
  document.getElementById('viewerImageElement').src = url;
  showToast('تم تحديث صورة المنتج بنجاح!', 'success');
}

async function updateProductImageUrl(imageUrl) {
  if (!state.activeImageProduct) return;
  const p = state.activeImageProduct;

  await fetch(`/api/products/${p.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl })
  });

  p.image_url = imageUrl;
  loadProducts();
  broadcastLocalSync({ type: 'IMAGE_UPDATED', productId: p.id, imageUrl });
}

async function handleImageFileUpload(file) {
  if (!file) return;
  
  // If target is product form
  if (formImageSearchTarget === 'productForm') {
    const formData = new FormData();
    formData.append('image', file);
    try {
      showToast('جاري رفع وتثبيت الصورة للمنتج...', 'info');
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        document.getElementById('prodFormImageUrl').value = data.imageUrl;
        document.getElementById('viewerImageElement').src = data.imageUrl;
        showToast('تم تعيين الصورة للمنتج بنجاح!', 'success');
        closeImageModal();
      }
    } catch(e) {}
    return;
  }

  if (!state.activeImageProduct) return;
  const formData = new FormData();
  formData.append('image', file);

  try {
    showToast('جاري استيراد الصورة وتثبيتها...', 'info');
    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      await updateProductImageUrl(data.imageUrl);
      document.getElementById('viewerImageElement').src = data.imageUrl;
      document.getElementById('viewerUrlInput').value = data.imageUrl;
      showToast('تم استيراد وحفظ صورة المنتج بنجاح!', 'success');
    }
  } catch (error) {
    showToast('فشل في حفظ الصورة', 'error');
  }
}

async function pasteImageFromClipboard() {
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find(type => type.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        const file = new File([blob], `clipboard-${Date.now()}.png`, { type: imageType });
        await handleImageFileUpload(file);
        return;
      }
    }
  } catch (e) {}

  try {
    const text = (await navigator.clipboard.readText() || '').trim();
    if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('/uploads/') || text.startsWith('data:image/')) {
      document.getElementById('viewerUrlInput').value = text;
      await applyImageUrl();
      return;
    }
  } catch (e) {}

  showToast('يرجى نسخ صورة أو رابط صورة أولاً من المتصفح، ثم الضغط على لصق', 'info');
}

// Global Drag & Drop + Paste listeners for seamless import
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('viewerImgDropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#38bdf8';
      dropZone.style.boxShadow = '0 0 15px rgba(56, 189, 248, 0.4)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '';
      dropZone.style.boxShadow = '';
    });
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.boxShadow = '';

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await handleImageFileUpload(e.dataTransfer.files[0]);
        return;
      }

      const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        document.getElementById('viewerUrlInput').value = text;
        await applyImageUrl();
      }
    });
  }

  // Global Ctrl + V handler
  window.addEventListener('paste', async (e) => {
    const modal = document.getElementById('imageLightboxModal');
    if (modal && modal.style.display !== 'none') {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

      if (e.clipboardData && e.clipboardData.items) {
        for (const item of e.clipboardData.items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              await handleImageFileUpload(file);
              return;
            }
          }
        }
        const text = e.clipboardData.getData('text');
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          document.getElementById('viewerUrlInput').value = text;
          await applyImageUrl();
        }
      }
    }
  });
});

// ==========================================================
// 6. PRODUCT ADD / EDIT MODAL
// ==========================================================
function showAddProductModal() {
  document.getElementById('productModalTitle').innerHTML = '<i class="fa-solid fa-plus-circle"></i> إضافة منتج جديد';
  document.getElementById('productForm').reset();
  document.getElementById('prodFormId').value = '';
  document.getElementById('prodFormStockGroup').style.display = 'none';
  document.getElementById('productFormModal').style.display = 'flex';
}

function openEditProductModal(productId) {
  const p = state.products.find(item => item.id === productId);
  if (!p) return;

  document.getElementById('productModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل بيانات المنتج';
  document.getElementById('prodFormId').value = p.id;
  document.getElementById('prodFormName').value = p.name;
  document.getElementById('prodFormModel').value = p.model || '';
  document.getElementById('prodFormCategory').value = p.category || 'أخرى';
  document.getElementById('prodFormBrand').value = p.brand || 'Hoco';
  document.getElementById('prodFormCost').value = p.cost_price;
  document.getElementById('prodFormSelling').value = p.selling_price;
  document.getElementById('prodFormTotalQty').value = p.total_quantity;
  document.getElementById('prodFormStockQty').value = p.stock_quantity;
  document.getElementById('prodFormImageUrl').value = p.image_url || '';
  document.getElementById('prodFormBarcode').value = p.barcode || '';

  document.getElementById('prodFormStockGroup').style.display = 'block';
  document.getElementById('productFormModal').style.display = 'flex';
}

function closeProductModal() {
  document.getElementById('productFormModal').style.display = 'none';
}

function calcSuggestedPrices() {
  const cost = parseFloat(document.getElementById('prodFormCost').value) || 0;
  if (cost > 0) {
    const suggestedRetail = Math.ceil((cost * 1.3) / 250) * 250;
    document.getElementById('prodFormSelling').value = suggestedRetail;
  }
}

async function uploadModalImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  try {
    showToast('جاري رفع الصورة...', 'success');
    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      document.getElementById('prodFormImageUrl').value = data.imageUrl;
      showToast('تم رفع الصورة بنجاح', 'success');
    }
  } catch (error) {
    showToast('فشل في رفع الصورة', 'error');
  }
}

async function saveProduct(event) {
  event.preventDefault();
  const id = document.getElementById('prodFormId').value;

  const payload = {
    name: document.getElementById('prodFormName').value.trim(),
    model: document.getElementById('prodFormModel').value.trim(),
    category: document.getElementById('prodFormCategory').value,
    brand: document.getElementById('prodFormBrand').value.trim(),
    cost_price: parseFloat(document.getElementById('prodFormCost').value) || 0,
    selling_price: parseFloat(document.getElementById('prodFormSelling').value) || 0,
    total_quantity: parseInt(document.getElementById('prodFormTotalQty').value, 10) || 0,
    image_url: document.getElementById('prodFormImageUrl').value.trim(),
    barcode: document.getElementById('prodFormBarcode').value.trim()
  };

  if (id) {
    payload.stock_quantity = parseInt(document.getElementById('prodFormStockQty').value, 10);
  }

  try {
    const url = id ? `/api/products/${id}` : '/api/products';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast(id ? 'تم تحديث بيانات المنتج بنجاح' : 'تمت إضافة المنتج بنجاح', 'success');
      closeProductModal();
      loadProducts();
      loadStats();
      broadcastLocalSync({ type: 'PRODUCT_UPDATED', productId: id });
    }
  } catch (error) {
    showToast('فشل في حفظ المنتج', 'error');
  }
}

// ==========================================================
// 7. POS POINT OF SALE & TOUCHSCREEN MODE
// ==========================================================
function initPosCatalog() {
  state.posProducts = [...state.products];
  if (state.posSelectedCategory && state.posSelectedCategory !== 'all') {
    state.posProducts = state.products.filter(p => p.category === state.posSelectedCategory);
  }
  renderPosCatalog();
  renderPosCart();
}

function toggleTouchPosMode() {
  state.touchPosMode = !state.touchPosMode;
  const tabPos = document.getElementById('tab-pos');
  const btn = document.getElementById('btnToggleTouchMode');
  const label = document.getElementById('touchModeLabelText');

  if (state.touchPosMode) {
    tabPos.classList.add('pos-touch-mode');
    btn.classList.add('active');
    label.textContent = 'الوضع الكلاسيكي';
    showToast('📱 تم تفعيل وضع شاشة اللمس السريعة', 'info');
  } else {
    tabPos.classList.remove('pos-touch-mode');
    btn.classList.remove('active');
    label.textContent = 'وضع شاشة اللمس';
    showToast('📋 تم تفعيل وضع القائمة الكلاسيكي', 'info');
  }
  renderPosCatalog();
}

function filterPosByCategory(category, btnEl) {
  state.posSelectedCategory = category;
  document.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const val = document.getElementById('posSearchInput').value.trim().toLowerCase();
  state.posProducts = state.products.filter(p => {
    const matchCat = category === 'all' || p.category === category;
    const matchSearch = !val || (
      p.name.toLowerCase().includes(val) || 
      (p.model && p.model.toLowerCase().includes(val)) ||
      (p.barcode && p.barcode.toLowerCase().includes(val))
    );
    return matchCat && matchSearch;
  });

  renderPosCatalog();
}

function handlePosSearch() {
  const val = document.getElementById('posSearchInput').value.trim().toLowerCase();
  const category = state.posSelectedCategory || 'all';

  state.posProducts = state.products.filter(p => {
    const matchCat = category === 'all' || p.category === category;
    const matchSearch = !val || (
      p.name.toLowerCase().includes(val) || 
      (p.model && p.model.toLowerCase().includes(val)) ||
      (p.barcode && p.barcode.toLowerCase().includes(val))
    );
    return matchCat && matchSearch;
  });
  renderPosCatalog();
}

const debouncedPosSearch = debounce(handlePosSearch, 150);

function handlePosBarcodeEnter(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const val = document.getElementById('posSearchInput').value.trim().toLowerCase();
    if (!val) return;

    // Direct exact match by barcode or model
    const match = state.products.find(p => 
      (p.barcode && p.barcode.toLowerCase() === val) ||
      (p.model && p.model.toLowerCase() === val)
    ) || (state.posProducts.length === 1 ? state.posProducts[0] : null);

    if (match) {
      if (match.stock_quantity <= 0) {
        showToast(`المنتج [${match.model || match.name}] نافد من المخزن`, 'error');
        return;
      }
      addToCart(match);
      document.getElementById('posSearchInput').value = '';
      initPosCatalog();
      showToast(`⚡ تم مسح وإضافة [${match.model || match.name}] للسلة!`, 'success');
    }
  }
}

function renderPosCatalog() {
  const grid = document.getElementById('posProductsGrid');
  grid.innerHTML = '';
  const fallbackImg = '/images/products/eq33.jpg';

  if (state.posProducts.length === 0) {
    grid.innerHTML = '<div class="p-4 text-center text-muted" style="grid-column: 1/-1;">لا توجد منتجات مطابقة للبحث أو الصنف المختار</div>';
    return;
  }

  state.posProducts.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pos-item-card';
    card.onclick = () => addToCart(p);
    
    // Count currently in cart for this product
    const inCart = state.posCart.find(i => i.product.id === p.id);
    const cartCountBadge = inCart ? `<span class="badge badge-primary" style="position:absolute; top:8px; left:8px;">${inCart.qty} بالسلة</span>` : '';

    card.innerHTML = `
      <div style="position:relative;">
        <img src="${p.image_url || fallbackImg}" class="pos-item-img" onerror="this.src='${fallbackImg}'">
        ${cartCountBadge}
      </div>
      <span class="pos-item-model">${p.model || ''}</span>
      <span class="pos-item-name">${p.name}</span>
      <div class="pos-item-bottom">
        <span class="pos-item-price">${formatCurrency(p.selling_price)}</span>
        <span class="pos-item-stock">متوفر: ${formatNumber(p.stock_quantity)}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function addToCart(product) {
  if (product.stock_quantity <= 0) {
    showToast('الكمية نافدة من المخزن', 'error');
    return;
  }

  const existing = state.posCart.find(item => item.product.id === product.id);
  if (existing) {
    if (existing.qty + 1 > product.stock_quantity) {
      showToast('لا يمكن تجاوز الكمية المتوفرة بالمخزن', 'warning');
      return;
    }
    existing.qty++;
  } else {
    state.posCart.push({
      product,
      qty: 1,
      price: product.selling_price
    });
  }

  renderPosCart();
  renderPosCatalog();
}

function updateCartQty(index, change) {
  const item = state.posCart[index];
  if (!item) return;

  const newQty = item.qty + change;
  if (newQty <= 0) {
    state.posCart.splice(index, 1);
  } else if (newQty > item.product.stock_quantity) {
    showToast('لا يمكن تجاوز الكمية المتوفرة بالمخزن', 'warning');
  } else {
    item.qty = newQty;
  }

  renderPosCart();
  renderPosCatalog();
}

function updateCartItemPrice(index, newPrice) {
  const item = state.posCart[index];
  if (!item) return;
  item.price = parseFloat(newPrice) || 0;
  renderPosCartSummary();
}

function clearCart() {
  state.posCart = [];
  renderPosCart();
  renderPosCatalog();
}

function handlePaymentTypeChange() {
  const selectedType = document.querySelector('input[name="posPaymentType"]:checked').value;
  state.posPaymentType = selectedType;

  const phoneInput = document.getElementById('cartCustomerPhone');
  const initialPaidInput = document.getElementById('cartInitialPaid');
  const remainingNotice = document.getElementById('cartRemainingDebtNotice');
  const btnCheckoutLabel = document.getElementById('btnCheckoutLabel');
  const customerNameInput = document.getElementById('cartCustomerName');

  if (selectedType === 'credit') {
    phoneInput.style.display = 'block';
    initialPaidInput.style.display = 'block';
    remainingNotice.style.display = 'flex';
    btnCheckoutLabel.textContent = 'تسجيل البيع بالآجل (دين)';
    customerNameInput.placeholder = 'اسم العميل / المحل (مطلوب للآجل)';
  } else {
    phoneInput.style.display = 'none';
    initialPaidInput.style.display = 'none';
    remainingNotice.style.display = 'none';
    btnCheckoutLabel.textContent = 'تأكيد البيع وخصم المخزون';
    customerNameInput.placeholder = 'اسم الزبون (اختياري)';
  }

  renderPosCartSummary();
}

function renderPosCart() {
  const container = document.getElementById('cartItemsList');

  if (state.posCart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <i class="fa-solid fa-basket-shopping"></i>
        <p>اختر منتجاً من القائمة لبدء عملية البيع</p>
      </div>
    `;
    renderPosCartSummary();
    return;
  }

  container.innerHTML = '';

  state.posCart.forEach((item, index) => {
    const itemTotal = item.price * item.qty;

    const row = document.createElement('div');
    row.className = 'cart-row';
    row.innerHTML = `
      <div class="cart-row-info">
        <div class="cart-row-title">${item.product.model || item.product.name}</div>
        <div class="cart-row-unit-price">
          سعر القطعة: 
          <input type="number" value="${item.price}" step="250" class="cart-price-input" onchange="updateCartItemPrice(${index}, this.value)">
        </div>
      </div>
      <div class="cart-row-qty">
        <button class="cart-qty-btn" onclick="updateCartQty(${index}, -1)">-</button>
        <span>${item.qty}</span>
        <button class="cart-qty-btn" onclick="updateCartQty(${index}, 1)">+</button>
      </div>
      <div class="cart-row-total">${formatCurrency(itemTotal)}</div>
    `;
    container.appendChild(row);
  });

  renderPosCartSummary();
}

function renderPosCartSummary() {
  const totalCostEl = document.getElementById('cartTotalCost');
  const totalProfitEl = document.getElementById('cartTotalProfit');
  const totalSellingEl = document.getElementById('cartTotalSelling');
  const globalDiscount = parseFloat(document.getElementById('cartGlobalDiscount').value) || 0;
  const initialPaid = parseFloat(document.getElementById('cartInitialPaid').value) || 0;
  const remainingDebtEl = document.getElementById('cartRemainingDebtAmount');

  let totalCost = 0;
  let totalGrossSelling = 0;

  state.posCart.forEach(item => {
    totalCost += item.product.cost_price * item.qty;
    totalGrossSelling += item.price * item.qty;
  });

  const finalSelling = Math.max(0, totalGrossSelling - globalDiscount);
  const totalProfit = finalSelling - totalCost;
  const remainingDebt = Math.max(0, finalSelling - initialPaid);

  totalCostEl.textContent = formatCurrency(totalCost);
  totalProfitEl.textContent = formatCurrency(totalProfit);
  totalSellingEl.textContent = formatCurrency(finalSelling);

  if (remainingDebtEl) {
    remainingDebtEl.textContent = formatCurrency(remainingDebt);
  }
}

async function checkoutSale() {
  if (state.posCart.length === 0) {
    showToast('السلة فارغة، يرجى اختيار منتجات أولاً', 'error');
    return;
  }

  const isCredit = state.posPaymentType === 'credit';
  const customerName = document.getElementById('cartCustomerName').value.trim();
  const customerPhone = document.getElementById('cartCustomerPhone').value.trim();
  const initialPaid = parseFloat(document.getElementById('cartInitialPaid').value) || 0;
  const soldBy = document.getElementById('cartSellerName').value.trim() || 'مدير المتجر';
  const globalDiscount = parseFloat(document.getElementById('cartGlobalDiscount').value) || 0;

  if (isCredit && !customerName) {
    showToast('يرجى كتابة اسم العميل / المحل لتسجيل البيع بالآجل', 'warning');
    document.getElementById('cartCustomerName').focus();
    return;
  }

  try {
    let earnedProfit = 0;

    // Distribute discount proportionally across items if any
    const totalGross = state.posCart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const finalTotal = Math.max(0, totalGross - globalDiscount);
    const receiptItems = state.posCart.map(i => ({
      name: i.product.model || i.product.name,
      qty: i.qty,
      price: i.price
    }));

    // If credit with multiple items, distribute initial paid proportionally
    for (let idx = 0; idx < state.posCart.length; idx++) {
      const item = state.posCart[idx];
      const itemGross = item.price * item.qty;
      const itemDiscount = totalGross > 0 ? (itemGross / totalGross) * globalDiscount : 0;
      const itemFinal = Math.max(0, itemGross - itemDiscount);
      const itemInitialPaid = finalTotal > 0 ? (itemFinal / finalTotal) * initialPaid : 0;

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: item.product.id,
          quantity: item.qty,
          unit_price: item.price,
          discount: itemDiscount,
          customer_name: customerName || 'زبون عام',
          customer_phone: customerPhone,
          sold_by: soldBy,
          payment_type: isCredit ? 'credit' : 'cash',
          initial_paid: itemInitialPaid,
          debt_notes: `فاتورة بيع آجل POS`
        })
      });
      const data = await res.json();
      if (data.success) {
        earnedProfit += data.profit;
      }
    }

    state.lastSaleReceipt = {
      customerName: customerName || (isCredit ? 'عميل آجل' : 'زبون عام'),
      customerPhone,
      soldBy,
      paymentType: isCredit ? 'آجل (دين)' : 'نقدي',
      initialPaid: isCredit ? initialPaid : finalTotal,
      remainingDebt: isCredit ? Math.max(0, finalTotal - initialPaid) : 0,
      discount: globalDiscount,
      finalTotal,
      items: receiptItems
    };

    if (isCredit) {
      showToast(`📝 تم تسجيل البيع بالآجل بنجاح! متبقي: ${formatCurrency(Math.max(0, finalTotal - initialPaid))}`, 'success');
    } else {
      showToast(`💵 تمت عملية البيع النقدي بنجاح! ربح: +${formatCurrency(earnedProfit)}`, 'success');
    }

    clearCart();
    document.getElementById('cartGlobalDiscount').value = 0;
    document.getElementById('cartCustomerName').value = '';
    document.getElementById('cartCustomerPhone').value = '';
    document.getElementById('cartInitialPaid').value = 0;
    loadProducts();
    loadStats();
    loadDebts();
  } catch (error) {
    showToast('حدث خطأ أثناء تنفيذ عملية البيع', 'error');
  }
}

// ==========================================================
// 7.5 CUSTOMER DEBTS & CREDIT LEDGER (سجل الديون والآجل)
// ==========================================================
async function loadDebts() {
  const status = document.getElementById('debtStatusFilter') ? document.getElementById('debtStatusFilter').value : 'all';
  const search = document.getElementById('debtSearchInput') ? document.getElementById('debtSearchInput').value.trim() : '';

  try {
    let url = `/api/debts?status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) return;

    state.debts = data.debts || [];
    const stats = data.stats || {};

    // Update KPI Cards
    const outEl = document.getElementById('debtTotalOutstanding');
    if (outEl) {
      outEl.textContent = formatCurrency(stats.total_outstanding_debt || 0);
      document.getElementById('debtTotalCollected').textContent = formatCurrency(stats.total_debt_collected || 0);
      document.getElementById('debtActiveCount').textContent = formatNumber(stats.active_debtors_count || 0);
      document.getElementById('debtTotalCreated').textContent = formatCurrency(stats.total_debt_created || 0);
    }

    // Update Nav Badge
    const navBadge = document.getElementById('navDebtsCount');
    if (navBadge) {
      navBadge.textContent = stats.active_debtors_count || 0;
    }

    renderDebtsTable();
  } catch (error) {
    console.error('Error loading debts:', error);
  }
}

function handleDebtSearch() {
  loadDebts();
}

const debouncedDebtSearch = debounce(handleDebtSearch, 200);

function renderDebtsTable() {
  const tbody = document.getElementById('debtsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (state.debts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center p-4 text-muted">لا توجد حسابات ديون مسجلة في هذا القسم</td></tr>';
    return;
  }

  state.debts.forEach(d => {
    let statusBadge = '';
    if (d.status === 'paid') {
      statusBadge = '<span class="badge badge-success">🟢 مسدد بالكامل</span>';
    } else if (d.status === 'partially_paid') {
      statusBadge = '<span class="badge badge-warning">🟡 مسدد جزئياً</span>';
    } else {
      statusBadge = '<span class="badge badge-danger">🔴 غير مسدد</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#D-${d.id}</strong></td>
      <td>
        <strong class="text-info">${d.customer_name}</strong><br>
        <small class="text-muted">${d.customer_phone ? d.customer_phone : 'بدون هاتف'}</small>
      </td>
      <td><small>${d.items_summary || 'مبيعات متنوعة'}</small></td>
      <td><strong>${formatCurrency(d.total_amount)}</strong></td>
      <td><span class="text-success">${formatCurrency(d.paid_amount)}</span></td>
      <td><strong class="text-danger" style="font-size:14px;">${formatCurrency(d.remaining_amount)}</strong></td>
      <td>${statusBadge}</td>
      <td><small class="text-muted">${new Date(d.created_at).toLocaleDateString('ar-IQ')}</small></td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-success" onclick="showDebtPaymentModal(${d.id})" title="تسديد دفعة نقدية" ${d.status === 'paid' ? 'disabled' : ''}>
            <i class="fa-solid fa-hand-holding-dollar"></i> تسديد
          </button>
          <button class="btn btn-sm btn-outline" onclick="showDebtStatementModal(${d.id})" title="كشف الحساب وسجل الدفعات">
            <i class="fa-solid fa-file-invoice"></i> كشف
          </button>
          ${d.customer_phone ? `
            <button class="btn btn-sm btn-secondary" onclick="sendDebtWhatsAppReminder(${d.id})" title="إرسال تذكير بالواتساب">
              <i class="fa-brands fa-whatsapp"></i>
            </button>
          ` : ''}
          <button class="btn btn-sm btn-ghost" onclick="deleteDebt(${d.id})" title="حذف السجل">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function showDebtPaymentModal(debtId) {
  const debt = state.debts.find(d => d.id === debtId);
  if (!debt) return;

  document.getElementById('payModalDebtId').value = debt.id;
  document.getElementById('payModalCustomerName').textContent = `${debt.customer_name} ${debt.customer_phone ? '(' + debt.customer_phone + ')' : ''}`;
  document.getElementById('payModalTotalDebt').textContent = formatCurrency(debt.total_amount);
  document.getElementById('payModalRemainingDebt').textContent = formatCurrency(debt.remaining_amount);
  document.getElementById('payModalAmount').value = debt.remaining_amount;
  document.getElementById('payModalAmount').max = debt.remaining_amount;
  document.getElementById('payModalNotes').value = '';

  document.getElementById('debtPaymentModal').style.display = 'flex';
}

function closeDebtPaymentModal() {
  document.getElementById('debtPaymentModal').style.display = 'none';
}

async function submitDebtPayment(event) {
  event.preventDefault();
  const debtId = document.getElementById('payModalDebtId').value;
  const amount = parseFloat(document.getElementById('payModalAmount').value);
  const notes = document.getElementById('payModalNotes').value.trim();

  if (!debtId || isNaN(amount) || amount <= 0) {
    showToast('يرجى إدخال مبلغ سداد صالح', 'error');
    return;
  }

  try {
    const res = await fetch('/api/debts/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ debt_id: debtId, amount, notes })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeDebtPaymentModal();
      loadDebts();
      loadStats();
    } else {
      showToast(data.message || 'فشل في تسجيل السداد', 'error');
    }
  } catch (error) {
    showToast('حدث خطأ أثناء الاتصال بالسيرفر', 'error');
  }
}

async function showDebtStatementModal(debtId) {
  try {
    const res = await fetch(`/api/debts/${debtId}/statement`);
    const data = await res.json();
    if (!data.success) {
      showToast('فشل في جلب كشف الحساب', 'error');
      return;
    }

    state.activeDebtForStatement = data;
    const debt = data.debt;
    const payments = data.payments || [];

    const content = document.getElementById('debtStatementContent');
    content.innerHTML = `
      <div class="d-flex justify-between align-center border-bottom pb-2 mb-2">
        <div>
          <h3 class="text-info m-0">${debt.customer_name}</h3>
          <span class="text-muted" style="font-size:12px;"><i class="fa-solid fa-phone"></i> ${debt.customer_phone || 'لا يوجد هاتف'}</span>
        </div>
        <div class="text-left">
          <span class="badge ${debt.status === 'paid' ? 'badge-success' : 'badge-danger'}">
            ${debt.status === 'paid' ? 'مسدد بالكامل' : 'مستحق'}
          </span>
        </div>
      </div>
      <div class="d-flex justify-between my-1">
        <span>المواد المشتراة / المصدر:</span>
        <strong>${debt.items_summary || 'بضاعة POS'}</strong>
      </div>
      <div class="d-flex justify-between my-1">
        <span>إجمالي قيمة الفاتورة:</span>
        <strong>${formatCurrency(debt.total_amount)}</strong>
      </div>
      <div class="d-flex justify-between my-1">
        <span>إجمالي المبالغ المسددة:</span>
        <strong class="text-success">${formatCurrency(debt.paid_amount)}</strong>
      </div>
      <div class="d-flex justify-between my-1 border-top pt-2">
        <span>المبلغ المتبقي بذمة العميل:</span>
        <strong class="text-danger" style="font-size:18px;">${formatCurrency(debt.remaining_amount)}</strong>
      </div>
    `;

    const payBody = document.getElementById('debtStatementPaymentsBody');
    payBody.innerHTML = '';

    if (payments.length === 0) {
      payBody.innerHTML = '<tr><td colspan="3" class="text-center p-3 text-muted">لم يتم تسجيل أي دفعات مسددة حتى الآن</td></tr>';
    } else {
      payments.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${new Date(p.payment_date).toLocaleString('ar-IQ')}</td>
          <td><strong class="text-success">+${formatCurrency(p.amount)}</strong></td>
          <td><small class="text-muted">${p.notes || '-'}</small></td>
        `;
        payBody.appendChild(tr);
      });
    }

    document.getElementById('debtStatementModal').style.display = 'flex';
  } catch (error) {
    showToast('حدث خطأ أثناء جلب كشف الحساب', 'error');
  }
}

function closeDebtStatementModal() {
  document.getElementById('debtStatementModal').style.display = 'none';
  state.activeDebtForStatement = null;
}

function printDebtStatement() {
  if (!state.activeDebtForStatement) return;
  const { debt, payments } = state.activeDebtForStatement;
  const storeName = state.settings.store_name || 'MY Store';

  const printWindow = window.open('', '_blank', 'width=650,height=800');
  let paymentsHtml = '';
  payments.forEach(p => {
    paymentsHtml += `
      <tr>
        <td style="padding:6px;border-bottom:1px solid #ddd;">${new Date(p.payment_date).toLocaleDateString('ar-IQ')}</td>
        <td style="padding:6px;border-bottom:1px solid #ddd;color:green;font-weight:bold;">${formatCurrency(p.amount)}</td>
        <td style="padding:6px;border-bottom:1px solid #ddd;">${p.notes || '-'}</td>
      </tr>
    `;
  });

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>كشف حساب عميل - ${debt.customer_name}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; color: #111; line-height: 1.5; }
        .header { text-align: center; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 15px; }
        .box { background: #f8f9fa; border: 1px solid #ddd; padding: 12px; border-radius: 6px; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
        th { background: #eee; padding: 8px; text-align: right; border-bottom: 2px solid #ccc; }
        .total-box { font-size: 16px; font-weight: bold; color: #b91c1c; text-align: left; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 style="margin:0;">${storeName}</h2>
        <p style="margin:4px 0 0 0; color:#555;">كشف حساب ديون ومستحقات العميل</p>
      </div>
      <div class="box">
        <div><strong>اسم العميل:</strong> ${debt.customer_name}</div>
        <div><strong>رقم الهاتف:</strong> ${debt.customer_phone || 'غير مسجل'}</div>
        <div><strong>المواد / الفاتورة:</strong> ${debt.items_summary}</div>
        <div><strong>تاريخ العملية:</strong> ${new Date(debt.created_at).toLocaleDateString('ar-IQ')}</div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <span>إجمالي الفاتورة: <b>${formatCurrency(debt.total_amount)}</b></span>
        <span>المسدد: <b style="color:green;">${formatCurrency(debt.paid_amount)}</b></span>
        <span style="color:#b91c1c;">المتبقي بذمة العميل: <b>${formatCurrency(debt.remaining_amount)}</b></span>
      </div>
      <h4>سجل الدفعات المسددة:</h4>
      <table>
        <thead>
          <tr>
            <th>تاريخ الدفعة</th>
            <th>المبلغ</th>
            <th>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${paymentsHtml || '<tr><td colspan="3" style="text-align:center;padding:10px;">لا توجد دفعات مسددة</td></tr>'}
        </tbody>
      </table>
      <div class="total-box">
        المبلغ المطلوب سداده حالياً: ${formatCurrency(debt.remaining_amount)}
      </div>
      <script>
        window.onload = () => { window.print(); window.close(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function sendDebtWhatsAppReminder(debtId) {
  const debt = state.debts.find(d => d.id === debtId);
  if (!debt || !debt.customer_phone) {
    showToast('رقم هاتف العميل غير متوفر', 'error');
    return;
  }

  let phone = debt.customer_phone.replace(/\D/g, '');
  if (phone.startsWith('07')) phone = '964' + phone.substring(1);
  else if (!phone.startsWith('964')) phone = '964' + phone;

  const storeName = state.settings.store_name || 'MY Store';
  const message = `مرحباً أخي ${debt.customer_name}،
نود تذكيرك بوجود مبلغ متبقي بذمتك في محلات ${storeName} بقيمة (${formatCurrency(debt.remaining_amount)}) عن حساب [${debt.items_summary}].
شاكرين لك حسن تعاملك معنا دائماً.`;

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
}

async function deleteDebt(debtId) {
  if (!confirm('هل أنت متأكد من حذف سجل الدين هذا؟')) return;
  try {
    const res = await fetch(`/api/debts/${debtId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('تم حذف سجل الدين بنجاح', 'success');
      loadDebts();
      loadStats();
    }
  } catch (error) {
    showToast('فشل في حذف السجل', 'error');
  }
}

// ==========================================================
// 8. HARDWARE REPAIRS (مع خيار لم يتم التصليح وتكاليف الخسارة)
// ==========================================================
async function loadRepairs() {
  const status = document.getElementById('repairStatusFilter') ? document.getElementById('repairStatusFilter').value : 'all';
  const search = document.getElementById('repairSearchInput') ? document.getElementById('repairSearchInput').value.trim() : '';

  try {
    let url = `/api/repairs?status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) return;

    state.repairs = data.repairs || [];
    renderRepairs();
  } catch (error) {
    console.error('Error loading repairs:', error);
  }
}

function renderRepairs() {
  const tbody = document.getElementById('repairsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (state.repairs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center p-4 text-muted">
          <i class="fa-solid fa-wrench" style="font-size: 24px;"></i><br>
          لا توجد تذاكر صيانة مسجلة حالياً
        </td>
      </tr>
    `;
    return;
  }

  const statusMap = {
    'pending': { label: 'قيد الفحص', class: 'status-pending' },
    'in_progress': { label: 'قيد التصليح', class: 'status-in_progress' },
    'ready': { label: 'جاهز للاستلام', class: 'status-ready' },
    'delivered': { label: 'تم التسليم والمحاسبة', class: 'status-delivered' },
    'unrepaired': { label: 'لم يتم التصليح', class: 'status-unrepaired' }
  };

  state.repairs.forEach(rep => {
    const isUnrepaired = rep.status === 'unrepaired';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${rep.ticket_number}</strong></td>
      <td>
        <strong>${rep.customer_name}</strong><br>
        <small class="text-muted"><i class="fa-solid fa-phone"></i> ${rep.customer_phone || '-'}</small>
      </td>
      <td>
        <strong class="text-info">${rep.device_model}</strong><br>
        <small class="text-muted">${rep.device_type} ${rep.passcode ? `| رمز: ${rep.passcode}` : ''}</small>
      </td>
      <td>
        <span title="${rep.issue_description}">${rep.issue_description}</span>
        ${isUnrepaired && rep.loss_reason ? `<br><small class="text-danger">سبب الإلغاء: ${rep.loss_reason}</small>` : ''}
      </td>
      <td>${formatCurrency(rep.parts_cost)}</td>
      <td><strong>${isUnrepaired ? '0 د.ع' : formatCurrency(rep.total_charge)}</strong></td>
      <td>
        <strong class="${isUnrepaired ? 'text-danger' : 'text-success'}">
          ${isUnrepaired ? `خسارة: ${formatCurrency(rep.loss_cost)}` : `+${formatCurrency(rep.profit)}`}
        </strong>
      </td>
      <td>
        <select class="form-select form-select-sm" onchange="updateRepairStatus(${rep.id}, this.value)">
          <option value="pending" ${rep.status === 'pending' ? 'selected' : ''}>🟡 قيد الفحص</option>
          <option value="in_progress" ${rep.status === 'in_progress' ? 'selected' : ''}>🔵 قيد التصليح</option>
          <option value="ready" ${rep.status === 'ready' ? 'selected' : ''}>🟢 جاهز للاستلام</option>
          <option value="delivered" ${rep.status === 'delivered' ? 'selected' : ''}>✅ تم التسليم والمحاسبة</option>
          <option value="unrepaired" ${rep.status === 'unrepaired' ? 'selected' : ''}>❌ لم يتم التصليح</option>
        </select>
      </td>
      <td><small>${new Date(rep.received_at).toLocaleDateString('ar-IQ')}</small></td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-outline" onclick="printRepairTicket(${rep.id})" title="طباعة وصل استلام الصيانة"><i class="fa-solid fa-print"></i></button>
          <button class="btn btn-sm btn-secondary" onclick="openEditRepairModal(${rep.id})" title="تعديل"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-ghost" onclick="deleteRepairTicket(${rep.id})" title="حذف"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleRepairStatusChange() {
  const status = document.getElementById('repFormStatus').value;
  const lossBox = document.getElementById('repairLossFields');
  const normalFields = document.getElementById('repairNormalPriceFields');

  if (status === 'unrepaired') {
    lossBox.style.display = 'block';
    normalFields.style.display = 'none';
  } else {
    lossBox.style.display = 'none';
    normalFields.style.display = 'block';
  }
  calcRepairProfitPreview();
}

function showAddRepairModal() {
  document.getElementById('repairModalTitle').innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i> استلام جهاز جديد للصيانة';
  document.getElementById('repairForm').reset();
  document.getElementById('repFormId').value = '';
  document.getElementById('repFormPartsCost').value = '0';
  document.getElementById('repFormTotalCharge').value = '';
  document.getElementById('repFormLossCost').value = '0';
  document.getElementById('repFormLossReason').value = '';
  document.getElementById('repFormStatus').value = 'pending';
  handleRepairStatusChange();
  document.getElementById('repairFormModal').style.display = 'flex';
}

function openEditRepairModal(repairId) {
  const rep = state.repairs.find(r => r.id === repairId);
  if (!rep) return;

  document.getElementById('repairModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل تذكرة الصيانة';
  document.getElementById('repFormId').value = rep.id;
  document.getElementById('repFormCustomerName').value = rep.customer_name;
  document.getElementById('repFormCustomerPhone').value = rep.customer_phone;
  document.getElementById('repFormDeviceType').value = rep.device_type;
  document.getElementById('repFormDeviceModel').value = rep.device_model;
  document.getElementById('repFormPasscode').value = rep.passcode || '';
  document.getElementById('repFormIssue').value = rep.issue_description;
  document.getElementById('repFormPartsCost').value = rep.parts_cost;
  document.getElementById('repFormTotalCharge').value = rep.total_charge;
  document.getElementById('repFormLossCost').value = rep.loss_cost || 0;
  document.getElementById('repFormLossReason').value = rep.loss_reason || '';
  document.getElementById('repFormStatus').value = rep.status;
  document.getElementById('repFormTechnician').value = rep.technician;
  document.getElementById('repFormNotes').value = rep.notes || '';

  handleRepairStatusChange();
  document.getElementById('repairFormModal').style.display = 'flex';
}

function closeRepairModal() {
  document.getElementById('repairFormModal').style.display = 'none';
}

function calcRepairProfitPreview() {
  const status = document.getElementById('repFormStatus').value;
  const previewEl = document.getElementById('repFormProfitPreview');
  if (!previewEl) return;

  if (status === 'unrepaired') {
    const loss = parseFloat(document.getElementById('repFormLossCost').value) || 0;
    previewEl.textContent = `خسارة: -${formatCurrency(loss)}`;
    previewEl.className = 'profit-box text-danger';
  } else {
    const parts = parseFloat(document.getElementById('repFormPartsCost').value) || 0;
    const charge = parseFloat(document.getElementById('repFormTotalCharge').value) || 0;
    const profit = charge - parts;
    previewEl.textContent = `+${formatCurrency(profit)}`;
    previewEl.className = 'profit-box';
  }
}

async function saveRepair(event) {
  event.preventDefault();
  const id = document.getElementById('repFormId').value;
  const status = document.getElementById('repFormStatus').value;

  const payload = {
    customer_name: document.getElementById('repFormCustomerName').value.trim(),
    customer_phone: document.getElementById('repFormCustomerPhone').value.trim(),
    device_type: document.getElementById('repFormDeviceType').value,
    device_model: document.getElementById('repFormDeviceModel').value.trim(),
    passcode: document.getElementById('repFormPasscode').value.trim(),
    issue_description: document.getElementById('repFormIssue').value.trim(),
    parts_cost: parseFloat(document.getElementById('repFormPartsCost').value) || 0,
    total_charge: parseFloat(document.getElementById('repFormTotalCharge').value) || 0,
    loss_cost: parseFloat(document.getElementById('repFormLossCost').value) || 0,
    loss_reason: document.getElementById('repFormLossReason').value.trim(),
    status: status,
    technician: document.getElementById('repFormTechnician').value.trim(),
    notes: document.getElementById('repFormNotes').value.trim()
  };

  try {
    const url = id ? `/api/repairs/${id}` : '/api/repairs';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast(id ? 'تم تحديث بيانات الصيانة بنجاح' : 'تم استلام الجهاز وإنشاء التذكرة بنجاح', 'success');
      closeRepairModal();
      loadRepairs();
      loadStats();
    }
  } catch (error) {
    showToast('فشل في حفظ بيانات الصيانة', 'error');
  }
}

async function updateRepairStatus(repairId, newStatus) {
  try {
    const res = await fetch(`/api/repairs/${repairId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await res.json();
    if (data.success) {
      showToast('تم تحديث حالة الجهاز بنجاح', 'success');
      loadRepairs();
      loadStats();
    }
  } catch (error) {
    showToast('فشل في تحديث حالة الجهاز', 'error');
  }
}

async function deleteRepairTicket(repairId) {
  if (!confirm('هل أنت متأكد من حذف تذكرة الصيانة؟')) return;
  try {
    const res = await fetch(`/api/repairs/${repairId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('تم حذف تذكرة الصيانة بنجاح', 'success');
      loadRepairs();
      loadStats();
    }
  } catch (error) {
    showToast('فشل في حذف التذكرة', 'error');
  }
}

// ==========================================================
// 9. SOFTWARE SERVICES (FRP, Accounts, Format, Viruses)
// ==========================================================
async function loadSoftwareServices() {
  const status = document.getElementById('softwareStatusFilter') ? document.getElementById('softwareStatusFilter').value : 'all';
  const search = document.getElementById('softwareSearchInput') ? document.getElementById('softwareSearchInput').value.trim() : '';

  try {
    let url = `/api/software?status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) return;

    state.softwareServices = data.services || [];
    renderSoftwareServices();
  } catch (error) {
    console.error('Error loading software services:', error);
  }
}

function renderSoftwareServices() {
  const tbody = document.getElementById('softwareTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (state.softwareServices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center p-4 text-muted">
          <i class="fa-solid fa-laptop-code" style="font-size: 24px;"></i><br>
          لا توجد عمليات سوفت وير مسجلة حالياً
        </td>
      </tr>
    `;
    return;
  }

  state.softwareServices.forEach(sft => {
    const isCompleted = sft.status === 'completed';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${sft.ticket_number}</strong></td>
      <td>
        <strong>${sft.customer_name}</strong><br>
        <small class="text-muted"><i class="fa-solid fa-phone"></i> ${sft.customer_phone || '-'}</small>
      </td>
      <td><strong class="text-info">${sft.device_model}</strong></td>
      <td><span class="badge badge-brand">${sft.service_type}</span></td>
      <td>${formatCurrency(sft.tool_cost)}</td>
      <td><strong>${formatCurrency(sft.total_charge)}</strong></td>
      <td><strong class="text-success">+${formatCurrency(sft.profit)}</strong></td>
      <td>
        <span class="status-badge ${isCompleted ? 'status-ready' : 'status-in_progress'}">
          ${isCompleted ? '✅ تم الإنجاز' : '🔵 قيد المعالجة'}
        </span>
      </td>
      <td><small>${new Date(sft.created_at).toLocaleDateString('ar-IQ')}</small></td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-secondary" onclick="openEditSoftwareModal(${sft.id})" title="تعديل"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-ghost" onclick="deleteSoftwareService(${sft.id})" title="حذف"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function showAddSoftwareModal() {
  document.getElementById('softwareModalTitle').innerHTML = '<i class="fa-solid fa-laptop-code"></i> تسجيل خدمة سوفت وير جديدة';
  document.getElementById('softwareForm').reset();
  document.getElementById('sftFormId').value = '';
  document.getElementById('sftFormToolCost').value = '0';
  document.getElementById('sftFormTotalCharge').value = '';
  calcSoftwareProfitPreview();
  document.getElementById('softwareFormModal').style.display = 'flex';
}

function openEditSoftwareModal(id) {
  const sft = state.softwareServices.find(s => s.id === id);
  if (!sft) return;

  document.getElementById('softwareModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل خدمة السوفت وير';
  document.getElementById('sftFormId').value = sft.id;
  document.getElementById('sftFormCustomerName').value = sft.customer_name;
  document.getElementById('sftFormCustomerPhone').value = sft.customer_phone;
  document.getElementById('sftFormDeviceModel').value = sft.device_model;
  document.getElementById('sftFormServiceType').value = sft.service_type;
  document.getElementById('sftFormToolCost').value = sft.tool_cost;
  document.getElementById('sftFormTotalCharge').value = sft.total_charge;
  document.getElementById('sftFormStatus').value = sft.status;
  document.getElementById('sftFormTechnician').value = sft.technician;
  document.getElementById('sftFormNotes').value = sft.notes || '';

  calcSoftwareProfitPreview();
  document.getElementById('softwareFormModal').style.display = 'flex';
}

function closeSoftwareModal() {
  document.getElementById('softwareFormModal').style.display = 'none';
}

function calcSoftwareProfitPreview() {
  const cost = parseFloat(document.getElementById('sftFormToolCost').value) || 0;
  const charge = parseFloat(document.getElementById('sftFormTotalCharge').value) || 0;
  const profit = charge - cost;
  const previewEl = document.getElementById('sftFormProfitPreview');
  if (previewEl) {
    previewEl.textContent = `+${formatCurrency(profit)}`;
  }
}

async function saveSoftwareService(event) {
  event.preventDefault();
  const id = document.getElementById('sftFormId').value;

  const payload = {
    customer_name: document.getElementById('sftFormCustomerName').value.trim(),
    customer_phone: document.getElementById('sftFormCustomerPhone').value.trim(),
    device_model: document.getElementById('sftFormDeviceModel').value.trim(),
    service_type: document.getElementById('sftFormServiceType').value,
    tool_cost: parseFloat(document.getElementById('sftFormToolCost').value) || 0,
    total_charge: parseFloat(document.getElementById('sftFormTotalCharge').value) || 0,
    status: document.getElementById('sftFormStatus').value,
    technician: document.getElementById('sftFormTechnician').value.trim(),
    notes: document.getElementById('sftFormNotes').value.trim()
  };

  try {
    const url = id ? `/api/software/${id}` : '/api/software';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast(id ? 'تم تحديث بيانات خدمة السوفت وير' : 'تم تسجيل خدمة السوفت وير بنجاح', 'success');
      closeSoftwareModal();
      loadSoftwareServices();
      loadStats();
    }
  } catch (error) {
    showToast('فشل في حفظ خدمة السوفت وير', 'error');
  }
}

async function deleteSoftwareService(id) {
  if (!confirm('هل تريد حذف سجل خدمة السوفت وير هذه؟')) return;
  try {
    const res = await fetch(`/api/software/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('تم حذف السجل بنجاح', 'success');
      loadSoftwareServices();
      loadStats();
    }
  } catch (error) {
    showToast('فشل في حذف السجل', 'error');
  }
}

// ==========================================================
// 10. SALES HISTORY LOG
// ==========================================================
async function loadRecentSales() {
  const filter = document.getElementById('salesTimeFilter') ? document.getElementById('salesTimeFilter').value : 'all';
  try {
    const res = await fetch(`/api/sales?timeRange=${filter}`);
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('recentSalesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data.sales || data.sales.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3 text-muted">لا توجد مبيعات في هذه الفترة</td></tr>';
      return;
    }

    data.sales.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${s.product_model || s.product_name}</strong></td>
        <td>${s.quantity}</td>
        <td>${formatCurrency(s.total_amount)}</td>
        <td><small class="text-muted">${s.discount ? formatCurrency(s.discount) : '-'}</small></td>
        <td><strong class="text-success">+${formatCurrency(s.profit)}</strong></td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="cancelSale(${s.id})" title="إلغاء البيع وإرجاع الكمية للمخزن">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('Error loading sales:', error);
  }
}

async function cancelSale(saleId) {
  if (!confirm('هل تريد إلغاء هذه البيعة وإرجاع المنتجات إلى المخزن؟')) return;
  try {
    const res = await fetch(`/api/sales/${saleId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('تم إلغاء البيع واسترجاع الكمية للمخزن', 'success');
      loadStats();
      loadProducts();
      loadRecentSales();
    }
  } catch (error) {
    showToast('فشل في إلغاء البيع', 'error');
  }
}

// ==========================================================
// 11. PDF INVOICE IMPORTER
// ==========================================================
function showInvoiceModal() {
  document.getElementById('invoicePreviewSection').style.display = 'none';
  document.getElementById('invoiceDropZone').style.display = 'block';
  document.getElementById('invoiceImportModal').style.display = 'flex';
}

function closeInvoiceModal() {
  document.getElementById('invoiceImportModal').style.display = 'none';
}

async function importDefaultInvoice() {
  const loading = document.getElementById('invoiceParseLoading');
  const dropZone = document.getElementById('invoiceDropZone');
  const previewSection = document.getElementById('invoicePreviewSection');

  dropZone.style.display = 'none';
  loading.style.display = 'block';

  try {
    const res = await fetch('/api/invoices/import-pdf', { method: 'POST' });
    const data = await res.json();
    loading.style.display = 'none';

    if (data.success && data.data) {
      state.parsedInvoiceData = data.data;
      renderInvoicePreview(data.data);
      previewSection.style.display = 'block';
      showToast(`تم استخراج ${data.data.totalItems} منتجاً بنجاح!`, 'success');
    } else {
      dropZone.style.display = 'block';
      showToast(data.message || 'فشل في استخراج بيانات الفاتورة', 'error');
    }
  } catch (error) {
    loading.style.display = 'none';
    dropZone.style.display = 'block';
    showToast('حدث خطأ أثناء قراءة ملف الفاتورة', 'error');
  }
}

async function handlePdfFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const loading = document.getElementById('invoiceParseLoading');
  const dropZone = document.getElementById('invoiceDropZone');
  const previewSection = document.getElementById('invoicePreviewSection');

  dropZone.style.display = 'none';
  loading.style.display = 'block';

  const formData = new FormData();
  formData.append('pdfFile', file);

  try {
    const res = await fetch('/api/invoices/import-pdf', { method: 'POST', body: formData });
    const data = await res.json();
    loading.style.display = 'none';

    if (data.success && data.data) {
      state.parsedInvoiceData = data.data;
      renderInvoicePreview(data.data);
      previewSection.style.display = 'block';
      showToast(`تم استخراج ${data.data.totalItems} منتجاً بنجاح!`, 'success');
    } else {
      dropZone.style.display = 'block';
      showToast(data.message || 'فشل في تحليل الفاتورة', 'error');
    }
  } catch (error) {
    loading.style.display = 'none';
    dropZone.style.display = 'block';
    showToast('حدث خطأ أثناء قراءة ملف الفاتورة', 'error');
  }
}

function renderInvoicePreview(invoiceData) {
  document.getElementById('previewInvoiceTitle').textContent = `معاينة المواد المستخرجة (${invoiceData.totalItems} منتج)`;
  document.getElementById('previewInvoiceDetails').textContent = `رقم الفاتورة: ${invoiceData.invoiceNumber} | التاريخ: ${invoiceData.invoiceDate} | إجمالي الفاتورة: ${formatCurrency(invoiceData.totalAmount)}`;

  const tbody = document.getElementById('previewInvoiceTableBody');
  tbody.innerHTML = '';
  const fallbackImg = '/images/products/eq33.jpg';

  invoiceData.products.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.item_index || (idx + 1)}</td>
      <td><img src="${p.image_url || fallbackImg}" class="table-thumbnail" onerror="this.src='${fallbackImg}'"></td>
      <td><strong class="text-info">${p.model}</strong></td>
      <td><small>${p.name}</small></td>
      <td><span class="badge">${p.category}</span></td>
      <td><strong>${formatNumber(p.stock_quantity)}</strong></td>
      <td>${formatCurrency(p.cost_price)}</td>
      <td><strong class="text-success">${formatCurrency(p.selling_price)}</strong></td>
      <td>${formatCurrency(p.total_cost)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function confirmImportProducts() {
  if (!state.parsedInvoiceData || !state.parsedInvoiceData.products) return;

  const btn = document.getElementById('btnConfirmImport');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ في المخزن...';

  try {
    const res = await fetch('/api/invoices/confirm-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.parsedInvoiceData)
    });

    const data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> اعتماد وحفظ الكل في المخزن';

    if (data.success) {
      showToast(data.message, 'success');
      closeInvoiceModal();
      loadProducts();
      loadStats();
      loadInvoicesList();
    } else {
      showToast(data.message || 'فشل في حفظ المنتجات', 'error');
    }
  } catch (error) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> اعتماد وحفظ الكل في المخزن';
    showToast('حدث خطأ أثناء حفظ المنتجات', 'error');
  }
}

async function loadInvoicesList() {
  try {
    const res = await fetch('/api/invoices');
    const data = await res.json();
    if (!data.success) return;

    const container = document.getElementById('invoicesListGrid');
    if (!container) return;
    container.innerHTML = '';

    if (!data.invoices || data.invoices.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-file-invoice empty-icon"></i>
          <h3>لا توجد فواتير موردين مستوردة بعد</h3>
          <p>يمكنك استيراد فاتورة هوكو المرفقة بضغطة زر لبدء تعبئة المخزن.</p>
          <button class="btn btn-primary mt-2" onclick="showInvoiceModal()">
            <i class="fa-solid fa-cloud-arrow-up"></i> استيراد فاتورة الآن
          </button>
        </div>
      `;
      return;
    }

    data.invoices.forEach(inv => {
      const card = document.createElement('div');
      card.className = 'card p-3 mb-3';
      card.innerHTML = `
        <div class="d-flex justify-between align-center">
          <div>
            <h3><i class="fa-solid fa-file-invoice text-info"></i> فاتورة رقم: #${inv.invoice_number}</h3>
            <span class="text-muted">المورد: ${inv.supplier_name} | التاريخ: ${inv.invoice_date}</span>
          </div>
          <div class="text-left">
            <div class="text-muted">عدد المواد: <b>${inv.total_items} مادة</b></div>
            <div class="text-success" style="font-size: 16px; font-weight: 800;">الإجمالي: ${formatCurrency(inv.total_amount)}</div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading invoices:', error);
  }
}

// ==========================================================
// 12. SETTINGS
// ==========================================================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      state.settings = { ...state.settings, ...data.settings };
      document.getElementById('headerStoreName').textContent = state.settings.store_name || 'MY Store';
      document.getElementById('settingStoreName').value = state.settings.store_name || 'MY Store';
      document.getElementById('settingLowStock').value = state.settings.low_stock_threshold || 2;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSettings() {
  const payload = {
    settings: {
      store_name: document.getElementById('settingStoreName').value.trim() || 'MY Store',
      low_stock_threshold: document.getElementById('settingLowStock').value
    }
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast('تم حفظ الإعدادات بنجاح', 'success');
      loadSettings();
    }
  } catch (error) {
    showToast('فشل في حفظ الإعدادات', 'error');
  }
}

// ==========================================================
// 13. PRINTING ENGINES (THERMAL RECEIPTS & REPAIR TICKETS)
// ==========================================================
const debouncedRepairSearch = debounce(loadRepairs, 200);
const debouncedSoftwareSearch = debounce(loadSoftwareServices, 200);

function printRepairTicket(repairId) {
  const rep = state.repairs.find(r => r.id === repairId);
  if (!rep) return;

  const storeName = state.settings.store_name || 'MY Store';
  const printWin = window.open('', '_blank', 'width=650,height=750');
  if (!printWin) {
    showToast('يرجى السماح بالنوافذ المنبثقة للطباعة', 'error');
    return;
  }

  printWin.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>وصل استلام صيانة - ${rep.ticket_number || ''}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 25px; color: #111; direction: rtl; }
        .receipt-card { border: 2px dashed #333; padding: 20px; border-radius: 8px; max-width: 500px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 15px; }
        .header h2 { margin: 0 0 5px 0; font-size: 22px; }
        .ticket-no { font-size: 16px; font-weight: bold; background: #eee; padding: 4px 10px; border-radius: 4px; display: inline-block; }
        .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
        .row strong { min-width: 130px; color: #444; }
        .row span { font-weight: bold; }
        .divider { border-top: 1px dashed #ccc; margin: 12px 0; }
        .total-box { font-size: 18px; font-weight: bold; text-align: center; background: #f4f4f4; padding: 10px; border-radius: 6px; margin-top: 15px; }
        .footer { text-align: center; font-size: 11px; color: #777; margin-top: 15px; border-top: 1px solid #ddd; padding-top: 10px; }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="receipt-card">
        <div class="header">
          <h2>${storeName}</h2>
          <div>وصل استلام جهاز للصيانة والتصليح</div>
          <div class="ticket-no" style="margin-top:6px;">رقم التذكرة: ${rep.ticket_number || ('REP-' + rep.id)}</div>
        </div>

        <div class="row"><strong>اسم الزبون:</strong> <span>${rep.customer_name}</span></div>
        <div class="row"><strong>رقم الهاتف:</strong> <span>${rep.customer_phone || '-'}</span></div>
        <div class="row"><strong>نوع وموديل الجهاز:</strong> <span>${rep.device_type} - ${rep.device_model}</span></div>
        <div class="row"><strong>رمز القفل (Passcode):</strong> <span>${rep.passcode || 'لا يوجد'}</span></div>
        <div class="divider"></div>
        <div class="row"><strong>وصف العطل / المشكلة:</strong> <span>${rep.issue_description}</span></div>
        <div class="row"><strong>الفني المسؤول:</strong> <span>${rep.technician || 'فني الصيانة'}</span></div>
        <div class="row"><strong>تاريخ الاستلام:</strong> <span>${new Date(rep.received_at).toLocaleString('ar-IQ')}</span></div>
        
        <div class="total-box">
          المبلغ المتفق عليه: ${formatCurrency(rep.total_charge)}
        </div>

        <div class="footer">
          * نرجو إبراز هذا الوصل عند استلام الجهاز.<br>
          * المحل غير مسؤول عن الأجهزة المتروكة لأكثر من 30 يوماً.<br>
          شكراً لتعاملكم معنا!
        </div>
      </div>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
}

function printPosReceipt(saleData) {
  const storeName = state.settings.store_name || 'MY Store';
  const printWin = window.open('', '_blank', 'width=450,height=600');
  if (!printWin) return;
  
  let itemsHtml = '';
  saleData.items.forEach(item => {
    itemsHtml += `
      <tr>
        <td style="text-align:right; padding: 4px 0;">${item.name}</td>
        <td style="text-align:center; padding: 4px 0;">${item.qty}</td>
        <td style="text-align:left; padding: 4px 0;">${formatCurrency(item.price * item.qty)}</td>
      </tr>
    `;
  });

  printWin.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>فاتورة مبيعات - ${storeName}</title>
      <style>
        body { font-family: monospace, system-ui; width: 300px; margin: 0 auto; padding: 10px; font-size: 12px; direction: rtl; color: #000; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
        th, td { border-bottom: 1px dashed #444; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; }
        .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin: 4px 0; }
        @media print { body { width: 100%; } }
      </style>
    </head>
    <body>
      <div class="center bold" style="font-size:16px;">${storeName}</div>
      <div class="center">فاتورة مبيعات نقدية</div>
      <div class="center"><small>${new Date().toLocaleString('ar-IQ')}</small></div>
      <div class="divider"></div>
      <div>الزبون: ${saleData.customerName || 'زبون عام'}</div>
      <div>البائع: ${saleData.soldBy || 'مدير المتجر'}</div>
      
      <table>
        <thead>
          <tr>
            <th style="text-align:right; padding: 4px 0;">المادة</th>
            <th style="text-align:center; padding: 4px 0;">العدد</th>
            <th style="text-align:left; padding: 4px 0;">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      ${saleData.discount > 0 ? `<div class="total-row"><span>الخصم:</span> <span>-${formatCurrency(saleData.discount)}</span></div>` : ''}
      <div class="total-row" style="font-size:16px;"><span>الإجمالي الصافي:</span> <span>${formatCurrency(saleData.finalTotal)}</span></div>
      
      <div class="divider"></div>
      <div class="center" style="font-size:10px; margin-top:8px;">البضاعة المباعة تخضع لشروط الضمان الرسمي<br>شكراً لزيارتكم!</div>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
}

function printLastSaleReceipt() {
  if (!state.lastSaleReceipt) {
    showToast('لا توجد عملية بيع سابقة لطباعتها', 'warning');
    return;
  }
  printPosReceipt(state.lastSaleReceipt);
}

// ==========================================================
// 14. ONLINE ORDERS MANAGEMENT (إدارة طلبات المتجر أونلاين)
// ==========================================================
async function loadOnlineOrders() {
  try {
    const res = await fetch('/api/shop/orders');
    const data = await res.json();
    if (!data.success) return;

    state.onlineOrders = data.orders || [];
    const badge = document.getElementById('navOrdersCount');
    if (badge) badge.textContent = state.onlineOrders.length;

    const tbody = document.getElementById('onlineOrdersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (state.onlineOrders.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center p-4 text-muted">
            <i class="fa-solid fa-truck-ramp-box fa-2x mb-2 text-muted"></i><br>
            لا توجد طلبات واردة من الموقع الإلكتروني حتى الآن
          </td>
        </tr>
      `;
      return;
    }

    state.onlineOrders.forEach(o => {
      let itemsListHtml = '';
      (o.items || []).forEach(it => {
        itemsListHtml += `<div style="margin-bottom:2px;">• <b>${it.qty}x</b> [${it.model || ''}] ${it.name} (${formatCurrency(it.price)})</div>`;
      });

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong class="text-info">${o.order_number}</strong></td>
        <td>
          <strong>${o.customer_name}</strong><br>
          <small class="text-muted"><i class="fa-solid fa-phone"></i> ${o.customer_phone}</small>
        </td>
        <td>
          <strong>${o.city}</strong><br>
          <small class="text-muted">${o.address}</small>
        </td>
        <td><div style="font-size:12px; line-height:1.4;">${itemsListHtml}</div></td>
        <td><strong class="text-success" style="font-size:15px;">${formatCurrency(o.total_amount)}</strong></td>
        <td>
          <select class="form-select form-select-sm" onchange="updateOnlineOrderStatus(${o.id}, this.value)">
            <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>🟡 قيد المراجعة</option>
            <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>🔵 تم التأكيد والتجهيز</option>
            <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>🚚 تم الإرسال مع المندوب</option>
            <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>✅ تم التسليم بنجاح</option>
            <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>❌ ملغي</option>
          </select>
        </td>
        <td><small>${new Date(o.created_at).toLocaleDateString('ar-IQ')}</small></td>
        <td>
          <a href="https://wa.me/964${o.customer_phone.replace(/^0/, '')}" target="_blank" class="btn btn-sm btn-outline" style="border-color:#25d366; color:#25d366;" title="مراسلة الزبون على واتساب">
            <i class="fa-brands fa-whatsapp"></i> واتساب
          </a>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('Error loading online orders:', error);
  }
}

async function updateOnlineOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/shop/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast('تم تحديث حالة الطلب بنجاح', 'success');
      loadOnlineOrders();
    }
  } catch (error) {
    showToast('فشل في تحديث حالة الطلب', 'error');
  }
}



