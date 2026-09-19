const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, runTransaction, getSetting, setSetting, triggerAutoBackup, SECURE_BACKUP_DIR } = require('./db');
const { parseSupplierInvoice } = require('./pdfParser');
const { findModelData } = require('./scraper');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware. 50mb allowed any anonymous caller to tie up memory; product
// payloads are a few KB, and real uploads go through multer instead.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Smart Online Redirect: Direct online web visitors straight to the customer shop
app.get('/', (req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  if (host.includes('onrender.com') || host.includes('render.com') || req.query.view === 'shop') {
    return res.redirect('/shop');
  }
  next();
});

// ==========================================
// ADMIN LOGIN GATE
// ==========================================
const generatedAdminPassword = auth.initAdminPassword();

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!auth.checkPassword(password)) {
    // Slow the response down so the password cannot be brute forced quickly
    return setTimeout(() => {
      res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
    }, 600);
  }
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https');
  res.setHeader('Set-Cookie', auth.sessionCookieHeader(auth.issueSession(), secure));
  res.json({ success: true, message: 'تم تسجيل الدخول بنجاح' });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', auth.clearCookieHeader());
  res.json({ success: true, message: 'تم تسجيل الخروج' });
});

app.get('/api/auth/status', (req, res) => {
  res.json({
    success: true,
    authenticated: auth.isAuthenticated(req),
    local: auth.isLocalRequest(req)
  });
});

app.post('/api/auth/change-password', auth.requireAdmin, (req, res) => {
  try {
    const { newPassword } = req.body || {};
    auth.setPassword(newPassword);
    res.setHeader('Set-Cookie', auth.sessionCookieHeader(auth.issueSession(), false));
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// The admin dashboard itself. Remote visitors get the login screen instead of
// the panel; the shop under /shop stays completely public.
app.get(['/', '/index.html'], (req, res, next) => {
  if (auth.isAuthenticated(req)) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// ==========================================
// API ACCESS GATE
// ==========================================
// Everything under /api requires the admin session EXCEPT the routes the public
// storefront genuinely needs. Adding a route to this list is a deliberate act.
const PUBLIC_API_ROUTES = [
  { method: 'GET', path: /^\/api\/sync\/(events|version)$/ },
  { method: 'GET', path: /^\/api\/products$/ },
  { method: 'GET', path: /^\/api\/products\/\d+$/ },
  { method: 'GET', path: /^\/api\/settings$/ },
  { method: 'POST', path: /^\/api\/shop\/orders$/ },
  { method: 'GET', path: /^\/api\/shop\/track-repair\/.+$/ },
  // Customer self-service; these enforce phone ownership individually
  { method: 'POST', path: /^\/api\/customer\/(request-otp|register|login|cancel-order)$/ },
  { method: 'GET', path: /^\/api\/customer\/orders$/ },
  { method: 'PUT', path: /^\/api\/customer\/profile$/ }
];

function isPublicApiRoute(req) {
  return PUBLIC_API_ROUTES.some(r => r.method === req.method && r.path.test(req.path));
}

// Fields a shopper may see. Cost and wholesale prices are the shop's margin and
// must never leave the building; the admin panel gets the full row.
const PUBLIC_PRODUCT_FIELDS = [
  'id', 'name', 'model', 'category', 'brand',
  'selling_price', 'stock_quantity', 'image_url', 'barcode', 'updated_at'
];

function publicProductView(product, req) {
  if (auth.isAuthenticated(req)) return product;
  const out = {};
  for (const f of PUBLIC_PRODUCT_FIELDS) out[f] = product[f];
  return out;
}

// Settings hold the Telegram bot token and the admin password hash.
const PUBLIC_SETTING_KEYS = ['store_name', 'phone', 'store_services'];

function publicSettingsView(settings, req) {
  if (auth.isAuthenticated(req)) return settings;
  const out = {};
  for (const k of PUBLIC_SETTING_KEYS) {
    if (settings[k] !== undefined) out[k] = settings[k];
  }
  return out;
}

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/api/auth/')) return next();
  if (isPublicApiRoute(req)) return next();
  return auth.requireAdmin(req, res, next);
});

// ==========================================
// REAL-TIME SYNC INFRASTRUCTURE (SSE & Live Broadcast)
// ==========================================
const sseClients = new Set();
let lastSyncVersion = Date.now();

function broadcastSync(eventData = {}) {
  lastSyncVersion = Date.now();
  const payload = {
    type: eventData.type || 'PRODUCT_UPDATED',
    timestamp: lastSyncVersion,
    ...eventData
  };
  const dataString = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(dataString);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// SSE Live Stream Endpoint for website and mobile clients
app.get('/api/sync/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial handshake
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', version: lastSyncVersion })}\n\n`);
  sseClients.add(res);

  // Heartbeat ping every 20 seconds to prevent connection drops
  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Fast Polling / Version Check Endpoint
app.get('/api/sync/version', (req, res) => {
  res.json({
    success: true,
    version: lastSyncVersion,
    clientsCount: sseClients.size
  });
});

// GitHub One-Click Cloud Sync & Repository Resolution
const { exec } = require('child_process');

// Returns the git repo this copy of the app actually lives in, or null.
// There used to be a hardcoded fallback to 'C:\progect\Sigma Store', which meant
// ANY copy of the app running anywhere (a test run, a packaged build) would commit
// and push to the real store repository. Never guess the repository.
function getGitRepoRoot() {
  let current = __dirname;
  while (current && current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}

function mirrorUploadsToGit() {
  try {
    const gitRoot = getGitRepoRoot();
    if (!gitRoot) return;
    const currentUploads = path.join(__dirname, '..', 'public', 'uploads');
    const targetUploads = path.join(gitRoot, 'public', 'uploads');
    if (path.resolve(currentUploads) === path.resolve(targetUploads)) return;
    if (!fs.existsSync(currentUploads)) return;
    if (!fs.existsSync(targetUploads)) {
      fs.mkdirSync(targetUploads, { recursive: true });
    }
    const files = fs.readdirSync(currentUploads);
    for (const f of files) {
      const src = path.join(currentUploads, f);
      const dst = path.join(targetUploads, f);
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
      }
    }
  } catch (err) {
    console.error('Error mirroring uploads to git repo:', err);
  }
}

let gitSyncTimeout = null;
// Single entry point for "the storefront must reflect this change".
// It regenerates the static catalogue the published site reads, tells every open
// shop window to refresh, and queues the push to GitHub. Anything that alters a
// price, an image, stock or the store's public details should call this — not
// just product edits, which is all that used to be wired up. Selling from the POS
// or changing the shop phone left the published site showing stale figures.
function syncStorefront(reason = 'DATA_CHANGED') {
  try {
    exportStaticProductsJson();
    broadcastSync({ type: 'PRODUCT_UPDATED', reason });
    triggerGitHubCloudSync();
  } catch (err) {
    console.error('Storefront sync failed:', err.message);
  }
}

function triggerGitHubCloudSync(debounceMs = 3000) {
  if (gitSyncTimeout) clearTimeout(gitSyncTimeout);
  return new Promise((resolve) => {
    gitSyncTimeout = setTimeout(() => {
      exportStaticProductsJson();
      mirrorUploadsToGit();
      const gitRoot = getGitRepoRoot();
      if (!gitRoot) {
        return resolve({ success: false, message: 'هذه النسخة لا تعمل داخل مستودع Git، تم تخطي المزامنة' });
      }
      const addCmd = 'git add public/shop/products.json public/uploads public/itemsMedia';
      exec(addCmd, { cwd: gitRoot }, (err1) => {
        if (err1) {
          console.error('Git add failed:', err1.message);
          return resolve({ success: false, message: err1.message });
        }
        exec('git diff --cached --quiet', { cwd: gitRoot }, (err2) => {
          if (!err2) {
            console.log('No git changes detected, pushing to verify upstream sync...');
            exec('git push origin main', { cwd: gitRoot }, (pushErr, stdout) => {
              resolve({ success: true, message: 'موقع المتجر متزامن ومحدث بالكامل!', stdout });
            });
            return;
          }
          const commitPushCmd = 'git commit -m "Auto sync store products and images [skip ci]" && git push origin main';
          exec(commitPushCmd, { cwd: gitRoot }, (commitErr, stdout, stderr) => {
            if (commitErr) {
              console.error('Git commit/push error:', commitErr.message, stderr);
              resolve({ success: false, message: commitErr.message, stderr });
            } else {
              console.log('Git commit & push successful:', stdout);
              resolve({ success: true, message: 'تم تحديث موقع المتجر ورفع كافة الصور والمنتجات بنجاح!', stdout });
            }
          });
        });
      });
    }, debounceMs);
  });
}

app.post('/api/sync/github', async (req, res) => {
  try {
    const result = await triggerGitHubCloudSync(100);
    res.json({ 
      success: true, 
      message: result.message || 'تمت مزامنة كافة المنتجات، الصور والأسعار مع موقع GitHub بنجاح!' 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Global Auto-Backup & Live Sync Middleware on any data change (POST, PUT, DELETE)
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        triggerAutoBackup();
        // Immediately broadcast live update to all open shop windows and mobile phones
        broadcastSync({ type: 'PRODUCT_UPDATED', path: req.path });
      }
    });
  }
  next();
});

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Only real images and PDFs, capped in size. Without a filter an uploaded .html
// would be served from /uploads on this same origin, i.e. stored XSS.
const ALLOWED_UPLOAD_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']);
const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'
]);

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_UPLOAD_EXT.has(ext) || !ALLOWED_UPLOAD_MIME.has(file.mimetype)) {
      const err = new Error('نوع الملف غير مسموح، يُقبل فقط: JPG, PNG, WEBP, GIF, PDF');
      err.status = 400;           // surfaced as-is by the global error handler
      err.expose = true;
      return cb(err);
    }
    cb(null, true);
  }
});

// ==========================================
// UNIQUE REFERENCE NUMBER GENERATORS
// ==========================================
// `Date.now().toString().slice(-6)` repeats roughly every 17 minutes and collides
// outright within the same millisecond, while these columns are UNIQUE. We derive a
// candidate, then keep bumping it until the table actually accepts it.
function generateUniqueRef(prefix, table, column) {
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`);
  for (let attempt = 0; attempt < 50; attempt++) {
    const stamp = Date.now().toString(36).toUpperCase().slice(-6);
    const rand = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
    const candidate = `${prefix}-${stamp}${rand}`;
    if (!exists.get(candidate)) return candidate;
  }
  // Practically unreachable; keeps the caller from inserting a duplicate.
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

const generateRepairTicket = () => generateUniqueRef('REP', 'repairs', 'ticket_number');
const generateSoftwareTicket = () => generateUniqueRef('SFT', 'software_services', 'ticket_number');
const generateOrderNumber = () => generateUniqueRef('ORD', 'orders', 'order_number');

// ==========================================
// ARABIC-AWARE SEARCH
// ==========================================
// Typing "سماعه" found nothing while "سماعة" found 8 products, because LIKE
// compares raw code points. Both sides are folded to one spelling first:
// alef forms -> ا, ta marbuta -> ه, alef maqsura -> ي, and diacritics dropped.
const ARABIC_FOLDINGS = [
  ['أ', 'ا'], ['إ', 'ا'], ['آ', 'ا'], ['ٱ', 'ا'],
  ['ة', 'ه'], ['ى', 'ي'], ['ؤ', 'و'], ['ئ', 'ي'],
  ['ـ', ''],                                    // tatweel
  ['ً', ''], ['ٌ', ''], ['ٍ', ''], // tanween
  ['َ', ''], ['ُ', ''], ['ِ', ''], // fatha/damma/kasra
  ['ّ', ''], ['ْ', '']                  // shadda/sukun
];

function normalizeArabic(text) {
  let out = String(text || '');
  for (const [from, to] of ARABIC_FOLDINGS) {
    out = out.split(from).join(to);
  }
  return out.toLowerCase();
}

// Builds the equivalent folding as a SQL expression over a column
function arabicSearchExpr(column) {
  let expr = `LOWER(${column})`;
  for (const [from, to] of ARABIC_FOLDINGS) {
    expr = `REPLACE(${expr}, '${from}', '${to}')`;
  }
  return expr;
}

// Produces "(<expr> LIKE ? OR <expr> LIKE ? ...)" plus the matching params
function buildArabicSearch(columns, term) {
  const needle = `%${normalizeArabic(term.trim())}%`;
  const clause = '(' + columns.map(c => `${arabicSearchExpr(c)} LIKE ?`).join(' OR ') + ')';
  return { clause, params: columns.map(() => needle) };
}

// Phone numbers arrive in several shapes (spaces, +964, 00964). Compare them normalized.
function normalizePhone(phone) {
  let p = (phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (p.startsWith('00964')) p = '0' + p.slice(5);
  else if (p.startsWith('964')) p = '0' + p.slice(3);
  return p;
}

function parseOrderItems(order) {
  try {
    const items = JSON.parse(order.items_json || '[]');
    return Array.isArray(items) ? items : [];
  } catch (_) {
    return [];
  }
}

// Puts the items of a cancelled order back into stock. Caller must wrap it in a
// transaction. Guarded by sold_quantity so a double cancel cannot inflate stock.
function restoreOrderStock(order) {
  for (const item of parseOrderItems(order)) {
    const qty = parseInt(item.qty, 10);
    if (!Number.isFinite(qty) || qty <= 0 || !item.id) continue;
    db.prepare(`
      UPDATE products SET
        stock_quantity = stock_quantity + ?,
        sold_quantity = MAX(0, sold_quantity - ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(qty, qty, item.id);
  }
}

// Re-deducts stock when a cancelled order is reinstated. Refuses if the goods
// are no longer on the shelf, so the order cannot be revived out of thin air.
function deductOrderStock(order) {
  for (const item of parseOrderItems(order)) {
    const qty = parseInt(item.qty, 10);
    if (!Number.isFinite(qty) || qty <= 0 || !item.id) continue;
    const upd = db.prepare(`
      UPDATE products SET
        stock_quantity = stock_quantity - ?,
        sold_quantity = sold_quantity + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND stock_quantity >= ?
    `).run(qty, qty, item.id, qty);

    if (upd.changes === 0) {
      throw new Error(`لا يمكن إعادة تفعيل الطلب: الكمية المتوفرة من (${item.name || item.id}) غير كافية`);
    }
  }
}

// ==========================================
// TELEGRAM NOTIFICATIONS & STATIC JSON SYNC
// ==========================================
function exportStaticProductsJson() {
  try {
    const products = db.prepare(`
      SELECT id, name, model, category, brand, selling_price, stock_quantity, image_url, updated_at
      FROM products
      ORDER BY id DESC
    `).all();
    const data = {
      success: true,
      count: products.length,
      products: products,
      settings: {
        store_name: getSetting('store_name') || 'SIGMA STORE',
        phone: getSetting('phone') || '07830860919'
      },
      updated_at: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(data, null, 2);

    // Write to app directory
    const targetPath = path.join(__dirname, '..', 'public', 'shop', 'products.json');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, jsonStr, 'utf8');

    // Mirror to git repo root if running from dist
    const gitRoot = getGitRepoRoot();
    if (gitRoot) {
      const gitTargetPath = path.join(gitRoot, 'public', 'shop', 'products.json');
      if (path.resolve(gitTargetPath) !== path.resolve(targetPath)) {
        fs.mkdirSync(path.dirname(gitTargetPath), { recursive: true });
        fs.writeFileSync(gitTargetPath, jsonStr, 'utf8');
      }
    }

    mirrorUploadsToGit();
  } catch (e) {
    console.error('Error exporting static products.json:', e);
  }
}

async function sendTelegramProductAlert(prod) {
  try {
    // Never hardcode the token: it ends up in git history and in the browser.
    // Configure it via the TELEGRAM_BOT_TOKEN env var or the settings screen.
    const token = process.env.TELEGRAM_BOT_TOKEN || getSetting('telegram_bot_token');
    const chatIdsStr = process.env.TELEGRAM_CHAT_IDS || getSetting('telegram_chat_ids') || '';
    const chatIds = chatIdsStr.split(',').map(s => s.trim()).filter(Boolean);

    if (!token || chatIds.length === 0) {
      return; // Notifications simply stay off until configured
    }

    const priceFmt = (Math.round(prod.selling_price || 0)).toLocaleString('en-US') + ' د.ع';
    const text = `✨ *إضافة منتج جديد في Sigma Store!*
━━━━━━━━━━━━━━━━━━
📦 *الاسم:* ${prod.name}
🏷️ *الموديل:* ${prod.model || 'غير محدد'}
📁 *القسم:* ${prod.category || 'عام'}
🏷️ *الماركة:* ${prod.brand || 'Hoco'}
💰 *سعر البيع:* *${priceFmt}*
📊 *الكمية الأولية:* ${prod.stock_quantity || 0} قطعة
⏰ *الوقت:* ${new Date().toLocaleString('ar-IQ')}
━━━━━━━━━━━━━━━━━━`;

    for (const cid of chatIds) {
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cid,
          text: text,
          parse_mode: 'Markdown'
        })
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to dispatch telegram product alert:', err);
  }
}

async function sendTelegramOrderAlert(order) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN || getSetting('telegram_bot_token');
    const chatIdsStr = process.env.TELEGRAM_CHAT_IDS || getSetting('telegram_chat_ids') || '';
    const chatIds = chatIdsStr.split(',').map(s => s.trim()).filter(Boolean);
    if (!token || chatIds.length === 0) return;

    const itemsList = order.items
      .map((it, i) => `\n${i + 1}. ${it.model ? `[${it.model}] ` : ''}${it.name}\n   ▫️ الكمية: ${it.qty} | ${Math.round(it.price * it.qty).toLocaleString('en-US')} د.ع`)
      .join('');

    let intl = String(order.customer_phone || '').replace(/\D/g, '');
    if (intl.startsWith('0')) intl = '964' + intl.slice(1);

    const text = `🔔 طلب شراء جديد من متجر Sigma Store!
━━━━━━━━━━━━━━━━━━
🔢 رقم الطلب: #${order.orderNumber}
👤 الزبون: ${order.customer_name}
📞 الهاتف: ${order.customer_phone}
📍 الموقع: ذي قار - ${order.district} (${order.address})
${order.notes ? `📝 ملاحظات: ${order.notes}\n` : ''}━━━━━━━━━━━━━━━━━━
🛒 المنتجات:${itemsList}
━━━━━━━━━━━━━━━━━━
💰 المجموع: ${Math.round(order.total).toLocaleString('en-US')} د.ع
⏰ ${new Date().toLocaleString('ar-IQ')}
━━━━━━━━━━━━━━━━━━
💬 واتساب الزبون: https://wa.me/${intl}`;

    for (const cid of chatIds) {
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cid, text })
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to dispatch telegram order alert:', err.message);
  }
}

// Initial export on startup
exportStaticProductsJson();

// ==========================================
// 1. PRODUCTS & INVENTORY API
// ==========================================

app.get('/api/products', (req, res) => {
  try {
    const { search, category, stockStatus } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (search && search.trim()) {
      const s = buildArabicSearch(['name', 'model', 'barcode', 'brand', 'category'], search);
      query += ` AND ${s.clause}`;
      params.push(...s.params);
    }

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (stockStatus === 'in_stock') {
      query += ' AND stock_quantity > 0';
    } else if (stockStatus === 'low_stock') {
      const threshold = parseInt(getSetting('low_stock_threshold') || '2', 10);
      query += ' AND stock_quantity > 0 AND stock_quantity <= ?';
      params.push(threshold);
    } else if (stockStatus === 'out_of_stock') {
      query += ' AND stock_quantity <= 0';
    }

    query += ' ORDER BY id DESC';

    const stmt = db.prepare(query);
    const products = stmt.all(...params);
    // Shoppers must never see cost or wholesale prices
    res.json({ success: true, products: products.map(p => publicProductView(p, req)) });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Counts per category for the filter chips. Deliberately NOT mounted under
// /api/products/... so it can never be captured by the /api/products/:id route.
app.get('/api/product-categories', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(category), ''), 'أخرى') AS category, COUNT(*) AS count
      FROM products
      GROUP BY category
    `).all();

    const total = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
    const counts = {};
    for (const r of rows) counts[r.category] = r.count;

    res.json({ success: true, total, counts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }
    res.json({ success: true, product: publicProductView(product, req) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const {
      name,
      model,
      category,
      brand,
      cost_price, // سعر الجملة / التكلفة
      selling_price, // سعر البيع للزبون
      total_quantity,
      image_url,
      barcode,
      notes
    } = req.body;

    const totalQty = parseInt(total_quantity, 10) || 0;
    const cost = parseFloat(cost_price) || 0;
    const selling = parseFloat(selling_price) || 0;

    const stmt = db.prepare(`
      INSERT INTO products (
        name, model, category, brand, cost_price, selling_price,
        wholesale_price, global_price_usd, total_quantity, sold_quantity,
        stock_quantity, image_url, barcode, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name || 'منتج جديد',
      model || '',
      category || 'أخرى',
      brand || 'Hoco',
      cost,
      selling,
      cost, // wholesale_price = cost_price
      totalQty,
      totalQty,
      image_url || '/images/products/EQ33.jpg',
      barcode || `PRD-${Date.now()}`,
      notes || ''
    );

    syncStorefront();
    sendTelegramProductAlert({
      name: name || 'منتج جديد',
      model: model || '',
      category: category || 'أخرى',
      brand: brand || 'Hoco',
      selling_price: selling,
      stock_quantity: totalQty
    });

    res.json({ success: true, id: result.lastInsertRowid, message: 'تمت إضافة المنتج بنجاح' });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    const {
      name,
      model,
      category,
      brand,
      cost_price,
      selling_price,
      total_quantity,
      sold_quantity,
      stock_quantity,
      image_url,
      barcode,
      notes
    } = req.body;

    const totalQty = total_quantity !== undefined ? parseInt(total_quantity, 10) : existing.total_quantity;
    const soldQty = sold_quantity !== undefined ? parseInt(sold_quantity, 10) : existing.sold_quantity;
    const stockQty = stock_quantity !== undefined ? parseInt(stock_quantity, 10) : (totalQty - soldQty);
    const cost = cost_price !== undefined ? parseFloat(cost_price) : existing.cost_price;
    const selling = selling_price !== undefined ? parseFloat(selling_price) : existing.selling_price;

    const stmt = db.prepare(`
      UPDATE products SET
        name = ?, model = ?, category = ?, brand = ?, cost_price = ?,
        selling_price = ?, wholesale_price = ?,
        total_quantity = ?, sold_quantity = ?, stock_quantity = ?,
        image_url = ?, barcode = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      name || existing.name,
      model !== undefined ? model : existing.model,
      category || existing.category,
      brand || existing.brand,
      cost,
      selling,
      cost,
      totalQty,
      soldQty,
      stockQty,
      image_url || existing.image_url,
      barcode || existing.barcode,
      notes !== undefined ? notes : existing.notes,
      id
    );

    syncStorefront();

    res.json({ success: true, message: 'تم تحديث بيانات المنتج بنجاح' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }
    syncStorefront();
    res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. SALES API (نقطة البيع مع الخصم والسعر المخصص)
// ==========================================

app.get('/api/sales', (req, res) => {
  try {
    const { timeRange } = req.query;
    let query = 'SELECT * FROM sales WHERE 1=1';
    const params = [];

    if (timeRange === 'today') {
      query += " AND date(created_at, 'localtime') = date('now', 'localtime')";
    } else if (timeRange === 'week') {
      query += " AND date(created_at, 'localtime') >= date('now', '-7 days', 'localtime')";
    } else if (timeRange === 'month') {
      query += " AND strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')";
    }

    query += ' ORDER BY id DESC LIMIT 200';
    const sales = db.prepare(query).all(...params);
    res.json({ success: true, sales });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/sales', (req, res) => {
  try {
    const {
      product_id,
      quantity,
      unit_price,
      discount,
      customer_name,
      customer_phone,
      sold_by,
      payment_type,
      initial_paid,
      debt_notes
    } = req.body;

    const qty = parseInt(quantity, 10) || 1;
    const price = parseFloat(unit_price);
    const disc = parseFloat(discount) || 0;

    // Reject non-positive quantities: a negative qty would invent stock and fake profit
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'الكمية يجب أن تكون رقماً موجباً' });
    }
    if (!Number.isFinite(disc) || disc < 0) {
      return res.status(400).json({ success: false, message: 'الخصم يجب أن يكون رقماً موجباً أو صفراً' });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }

    if (product.stock_quantity < qty) {
      return res.status(400).json({
        success: false,
        message: `الكمية المتوفرة بالمخزن (${product.stock_quantity}) غير كافية لإتمام البيع (${qty})`
      });
    }

    const salePrice = !isNaN(price) && price >= 0 ? price : product.selling_price;
    const totalAmount = Math.max(0, (salePrice * qty) - disc);
    const totalCost = product.cost_price * qty;
    const profit = totalAmount - totalCost;

    const isCredit = payment_type === 'credit';
    const paidAmount = isCredit ? Math.min(totalAmount, Math.max(0, parseFloat(initial_paid) || 0)) : totalAmount;
    const remainingDebt = Math.max(0, totalAmount - paidAmount);

    const result = runTransaction(() => {
      const saleStmt = db.prepare(`
        INSERT INTO sales (
          product_id, product_name, product_model, quantity,
          unit_cost, unit_price, discount, total_amount, profit, customer_name, sold_by, payment_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const saleResult = saleStmt.run(
        product.id,
        product.name,
        product.model,
        qty,
        product.cost_price,
        salePrice,
        disc,
        totalAmount,
        profit,
        customer_name || 'زبون عام',
        sold_by || 'مدير المتجر',
        isCredit ? 'credit' : 'cash'
      );

      const saleId = saleResult.lastInsertRowid;

      // If credit/debt, record into debts table
      if (isCredit && remainingDebt > 0) {
        const debtStmt = db.prepare(`
          INSERT INTO debts (
            customer_name, customer_phone, source_type, source_id,
            items_summary, total_amount, paid_amount, remaining_amount,
            notes, status
          ) VALUES (?, ?, 'pos_sale', ?, ?, ?, ?, ?, ?, ?)
        `);

        const debtStatus = paidAmount > 0 ? 'partially_paid' : 'unpaid';
        const debtRes = debtStmt.run(
          customer_name || 'زبون آجل',
          customer_phone || '',
          saleId,
          `${product.model || product.name} (${qty}x)`,
          totalAmount,
          paidAmount,
          remainingDebt,
          debt_notes || '',
          debtStatus
        );

        if (paidAmount > 0) {
          db.prepare(`
            INSERT INTO debt_payments (debt_id, amount, notes)
            VALUES (?, ?, 'دفعة أولى عند البيع')
          `).run(debtRes.lastInsertRowid, paidAmount);
        }
      }

      const updateProductStmt = db.prepare(`
        UPDATE products SET
          sold_quantity = sold_quantity + ?,
          stock_quantity = stock_quantity - ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND stock_quantity >= ?
      `);
      const upd = updateProductStmt.run(qty, qty, product.id, qty);
      if (upd.changes === 0) {
        throw new Error(`نفدت الكمية المتوفرة من (${product.name}) أثناء تسجيل البيع`);
      }

      const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);

      return {
        saleId,
        updatedStock: updatedProduct.stock_quantity,
        isCredit,
        remainingDebt
      };
    });

    syncStorefront('SALE');

    res.json({
      success: true,
      saleId: result.saleId,
      profit,
      totalAmount,
      updatedStock: result.updatedStock,
      isCredit: result.isCredit,
      remainingDebt: result.remainingDebt,
      message: result.isCredit 
        ? `تم تسجيل البيع بالآجل (دين متبقي: ${result.remainingDebt.toLocaleString('en-US')} د.ع)` 
        : `تم تسجيل البيع نقداً بنجاح وتحقيق ربح بقيمة ${profit.toLocaleString('en-US')} د.ع`
    });
  } catch (error) {
    console.error('Error recording sale:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Sells a whole cart in ONE transaction. The POS used to fire a separate request
// per line, so a rejection halfway through left the earlier lines committed with
// no way back, and a credit sale produced one debt record per item instead of one
// per invoice.
app.post('/api/sales/bulk', (req, res) => {
  try {
    const {
      items,
      customer_name,
      customer_phone,
      sold_by,
      payment_type,
      initial_paid,
      debt_notes
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'السلة فارغة' });
    }

    // Validate everything up front so nothing is written on a bad cart
    const lines = [];
    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
      if (!product) {
        return res.status(404).json({ success: false, message: 'أحد المنتجات لم يعد موجوداً في المخزن' });
      }

      const qty = parseInt(item.quantity, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ success: false, message: `الكمية غير صالحة للمنتج (${product.name})` });
      }
      if (product.stock_quantity < qty) {
        return res.status(400).json({
          success: false,
          message: `الكمية المتوفرة من (${product.name}) هي ${product.stock_quantity} فقط، وقد طلبت ${qty}`
        });
      }

      const rawPrice = parseFloat(item.unit_price);
      const price = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : product.selling_price;
      const disc = Math.max(0, parseFloat(item.discount) || 0);

      // Iraqi dinars are not fractional; keep the ledger on whole numbers
      const total = Math.max(0, Math.round(price * qty - disc));
      const cost = Math.round(product.cost_price * qty);

      lines.push({ product, qty, price, disc, total, profit: total - cost });
    }

    const grandTotal = lines.reduce((s, l) => s + l.total, 0);
    const grandProfit = lines.reduce((s, l) => s + l.profit, 0);

    const isCredit = payment_type === 'credit';
    const paidAmount = isCredit
      ? Math.min(grandTotal, Math.max(0, Math.round(parseFloat(initial_paid) || 0)))
      : grandTotal;
    const remainingDebt = Math.max(0, grandTotal - paidAmount);

    const result = runTransaction(() => {
      const saleStmt = db.prepare(`
        INSERT INTO sales (
          product_id, product_name, product_model, quantity,
          unit_cost, unit_price, discount, total_amount, profit,
          customer_name, sold_by, payment_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const stockStmt = db.prepare(`
        UPDATE products SET
          sold_quantity = sold_quantity + ?,
          stock_quantity = stock_quantity - ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND stock_quantity >= ?
      `);

      const saleIds = [];
      for (const l of lines) {
        const r = saleStmt.run(
          l.product.id, l.product.name, l.product.model, l.qty,
          l.product.cost_price, l.price, l.disc, l.total, l.profit,
          customer_name || 'زبون عام',
          sold_by || 'مدير المتجر',
          isCredit ? 'credit' : 'cash'
        );
        saleIds.push(r.lastInsertRowid);

        const upd = stockStmt.run(l.qty, l.qty, l.product.id, l.qty);
        if (upd.changes === 0) {
          throw new Error(`نفدت الكمية المتوفرة من (${l.product.name}) أثناء إتمام البيع`);
        }
      }

      // One debt entry for the whole invoice
      if (isCredit && remainingDebt > 0) {
        const summary = lines.map(l => `${l.product.model || l.product.name} (${l.qty}x)`).join('، ');
        const debtRes = db.prepare(`
          INSERT INTO debts (
            customer_name, customer_phone, source_type, source_id,
            items_summary, total_amount, paid_amount, remaining_amount, notes, status
          ) VALUES (?, ?, 'pos_sale', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          customer_name || 'زبون آجل',
          customer_phone || '',
          saleIds[0],
          summary,
          grandTotal,
          paidAmount,
          remainingDebt,
          debt_notes || '',
          paidAmount > 0 ? 'partially_paid' : 'unpaid'
        );

        if (paidAmount > 0) {
          db.prepare(`
            INSERT INTO debt_payments (debt_id, amount, notes)
            VALUES (?, ?, 'دفعة أولى عند البيع')
          `).run(debtRes.lastInsertRowid, paidAmount);
        }
      }

      return { saleIds };
    });

    syncStorefront('SALE');

    res.json({
      success: true,
      saleIds: result.saleIds,
      itemsCount: lines.length,
      totalAmount: grandTotal,
      profit: grandProfit,
      isCredit,
      paidAmount,
      remainingDebt,
      message: isCredit
        ? `تم تسجيل البيع بالآجل (دين متبقي: ${remainingDebt.toLocaleString('en-US')} د.ع)`
        : `تم تسجيل البيع نقداً بنجاح وتحقيق ربح بقيمة ${grandProfit.toLocaleString('en-US')} د.ع`
    });
  } catch (error) {
    console.error('Error recording bulk sale:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.delete('/api/sales/:id', (req, res) => {
  try {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'حركة البيع غير موجودة' });
    }

    runTransaction(() => {
      if (sale.product_id) {
        db.prepare(`
          UPDATE products SET
            sold_quantity = MAX(0, sold_quantity - ?),
            stock_quantity = stock_quantity + ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(sale.quantity, sale.quantity, sale.product_id);
      }

      db.prepare('DELETE FROM sales WHERE id = ?').run(sale.id);
    });

    syncStorefront('SALE_DELETED');
    res.json({ success: true, message: 'تم إلغاء عملية البيع واسترجاع الكمية للمخزن بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. REPAIRS & WORKSHOP API (مع خيار لم يتم التصليح والخسائر)
// ==========================================

app.get('/api/repairs', (req, res) => {
  try {
    const { status, search } = req.query;
    let query = 'SELECT * FROM repairs WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      const s = buildArabicSearch(['customer_name', 'customer_phone', 'device_model', 'ticket_number'], search);
      query += ` AND ${s.clause}`;
      params.push(...s.params);
    }

    query += ' ORDER BY id DESC';
    const repairs = db.prepare(query).all(...params);
    res.json({ success: true, repairs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/repairs', (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      device_type,
      device_model,
      passcode,
      issue_description,
      parts_cost,
      total_charge,
      technician,
      notes,
      promised_at
    } = req.body;

    const parts = parseFloat(parts_cost) || 0;
    const charge = parseFloat(total_charge) || 0;
    const profit = charge - parts;
    const ticketNumber = generateRepairTicket();

    const stmt = db.prepare(`
      INSERT INTO repairs (
        ticket_number, customer_name, customer_phone, device_type,
        device_model, passcode, issue_description, parts_cost,
        total_charge, profit, loss_cost, loss_reason, status, technician, notes, promised_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', 'pending', ?, ?, ?)
    `);

    const result = stmt.run(
      ticketNumber,
      customer_name || 'زبون عام',
      customer_phone || '',
      device_type || 'هاتف',
      device_model || '',
      passcode || '',
      issue_description || '',
      parts,
      charge,
      profit,
      technician || 'فني الصيانة',
      notes || '',
      promised_at || null
    );

    res.json({
      success: true,
      id: result.lastInsertRowid,
      ticketNumber,
      message: `تم إنشاء تذكرة الصيانة بنجاح برقم (${ticketNumber})`
    });
  } catch (error) {
    console.error('Error creating repair ticket:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/repairs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'تذكرة الصيانة غير موجودة' });
    }

    const {
      customer_name,
      customer_phone,
      device_type,
      device_model,
      passcode,
      issue_description,
      parts_cost,
      total_charge,
      loss_cost,
      loss_reason,
      status,
      technician,
      notes,
      promised_at
    } = req.body;

    const parts = parts_cost !== undefined ? parseFloat(parts_cost) : existing.parts_cost;
    const charge = total_charge !== undefined ? parseFloat(total_charge) : existing.total_charge;
    const loss = loss_cost !== undefined ? parseFloat(loss_cost) : (existing.loss_cost || 0);
    const currentStatus = status || existing.status;

    let profit = 0;
    if (currentStatus === 'unrepaired') {
      profit = -loss; // Negative profit = direct loss
    } else {
      profit = charge - parts;
    }

    let completedAt = existing.completed_at;
    let deliveredAt = existing.delivered_at;

    if (currentStatus === 'ready' && !existing.completed_at) {
      completedAt = new Date().toISOString();
    }
    if ((currentStatus === 'delivered' || currentStatus === 'unrepaired') && !existing.delivered_at) {
      deliveredAt = new Date().toISOString();
      if (!completedAt) completedAt = deliveredAt;
    }

    const stmt = db.prepare(`
      UPDATE repairs SET
        customer_name = ?, customer_phone = ?, device_type = ?,
        device_model = ?, passcode = ?, issue_description = ?,
        parts_cost = ?, total_charge = ?, profit = ?, loss_cost = ?, loss_reason = ?,
        status = ?, technician = ?, notes = ?, completed_at = ?, delivered_at = ?,
        promised_at = ?
      WHERE id = ?
    `);

    stmt.run(
      customer_name || existing.customer_name,
      customer_phone !== undefined ? customer_phone : existing.customer_phone,
      device_type || existing.device_type,
      device_model || existing.device_model,
      passcode !== undefined ? passcode : existing.passcode,
      issue_description !== undefined ? issue_description : existing.issue_description,
      parts,
      currentStatus === 'unrepaired' ? 0 : charge,
      profit,
      loss,
      loss_reason !== undefined ? loss_reason : (existing.loss_reason || ''),
      currentStatus,
      technician || existing.technician,
      notes !== undefined ? notes : existing.notes,
      completedAt,
      deliveredAt,
      promised_at !== undefined ? (promised_at || null) : existing.promised_at,
      id
    );

    res.json({
      success: true,
      profit,
      message: 'تم تحديث بيانات تذكرة الصيانة بنجاح'
    });
  } catch (error) {
    console.error('Error updating repair ticket:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/repairs/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM repairs WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف تذكرة الصيانة بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. SOFTWARE SERVICES API (أعمال وخدمات السوفت وير)
// ==========================================

app.get('/api/software', (req, res) => {
  try {
    const { status, search } = req.query;
    let query = 'SELECT * FROM software_services WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      const s = buildArabicSearch(['customer_name', 'customer_phone', 'device_model', 'service_type', 'ticket_number'], search);
      query += ` AND ${s.clause}`;
      params.push(...s.params);
    }

    query += ' ORDER BY id DESC';
    const services = db.prepare(query).all(...params);
    res.json({ success: true, services });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/software', (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      device_model,
      service_type,
      tool_cost,
      total_charge,
      status,
      technician,
      notes
    } = req.body;

    const cost = parseFloat(tool_cost) || 0;
    const charge = parseFloat(total_charge) || 0;
    const profit = charge - cost;
    const ticketNumber = generateSoftwareTicket();

    const stmt = db.prepare(`
      INSERT INTO software_services (
        ticket_number, customer_name, customer_phone, device_model,
        service_type, tool_cost, total_charge, profit, status, technician, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      ticketNumber,
      customer_name || 'زبون عام',
      customer_phone || '',
      device_model || '',
      service_type || 'تخطي حساب FRP',
      cost,
      charge,
      profit,
      status || 'completed',
      technician || 'فني السوفت وير',
      notes || ''
    );

    res.json({
      success: true,
      id: result.lastInsertRowid,
      ticketNumber,
      profit,
      message: `تم تسجيل خدمة السوفت وير بنجاح بربح (+${profit.toLocaleString('en-US')} د.ع)`
    });
  } catch (error) {
    console.error('Error creating software service:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/software/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM software_services WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'الخدمة غير موجودة' });
    }

    const {
      customer_name,
      customer_phone,
      device_model,
      service_type,
      tool_cost,
      total_charge,
      status,
      technician,
      notes
    } = req.body;

    const cost = tool_cost !== undefined ? parseFloat(tool_cost) : existing.tool_cost;
    const charge = total_charge !== undefined ? parseFloat(total_charge) : existing.total_charge;
    const currentStatus = status || existing.status;
    const profit = currentStatus === 'failed' ? -cost : (charge - cost);

    const stmt = db.prepare(`
      UPDATE software_services SET
        customer_name = ?, customer_phone = ?, device_model = ?,
        service_type = ?, tool_cost = ?, total_charge = ?, profit = ?,
        status = ?, technician = ?, notes = ?
      WHERE id = ?
    `);

    stmt.run(
      customer_name || existing.customer_name,
      customer_phone !== undefined ? customer_phone : existing.customer_phone,
      device_model || existing.device_model,
      service_type || existing.service_type,
      cost,
      charge,
      profit,
      currentStatus,
      technician || existing.technician,
      notes !== undefined ? notes : existing.notes,
      id
    );

    res.json({ success: true, profit, message: 'تم تحديث بيانات خدمة السوفت وير بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/software/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM software_services WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'تم حذف خدمة السوفت وير بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. INVOICES & PDF IMPORT API
// ==========================================

app.post('/api/invoices/import-pdf', upload.single('pdfFile'), async (req, res) => {
  // The uploaded PDF is only needed for parsing; never leave it sitting in /uploads
  const cleanupUpload = () => {
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  };

  try {
    let buffer;
    if (req.file) {
      buffer = fs.readFileSync(req.file.path);
    } else {
      const defaultPdfPath = path.join(__dirname, '..', 'مركز sigma-1.pdf');
      if (fs.existsSync(defaultPdfPath)) {
        buffer = fs.readFileSync(defaultPdfPath);
      } else {
        cleanupUpload();
        return res.status(400).json({ success: false, message: 'يرجى رفع ملف الفاتورة بصيغة PDF' });
      }
    }

    const parsedData = await parseSupplierInvoice(buffer);
    cleanupUpload();
    res.json({ success: true, data: parsedData });
  } catch (error) {
    cleanupUpload();
    console.error('Error parsing PDF invoice:', error);
    res.status(500).json({ success: false, message: 'تعذر قراءة ملف الفاتورة، تأكد أنه ملف PDF سليم' });
  }
});

app.post('/api/invoices/confirm-import', (req, res) => {
  try {
    const { invoiceNumber, supplierName, invoiceDate, totalAmount, products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, message: 'لا توجد منتجات للاستيراد' });
    }

    const result = runTransaction(() => {
      const invStmt = db.prepare(`
        INSERT INTO invoices (invoice_number, supplier_name, invoice_date, total_items, total_amount)
        VALUES (?, ?, ?, ?, ?)
      `);
      const invResult = invStmt.run(
        invoiceNumber || `INV-${Date.now()}`,
        supplierName || 'ومضة العراق',
        invoiceDate || new Date().toISOString().split('T')[0],
        products.length,
        parseFloat(totalAmount) || 0
      );

      const insertProductStmt = db.prepare(`
        INSERT INTO products (
          name, model, category, brand, cost_price, selling_price,
          wholesale_price, global_price_usd, total_quantity, sold_quantity,
          stock_quantity, image_url, barcode, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)
      `);

      let importedCount = 0;
      for (const p of products) {
        const qty = parseInt(p.total_quantity || p.stock_quantity, 10) || 1;
        const cost = parseFloat(p.cost_price) || 0;
        const selling = parseFloat(p.selling_price) || (cost * 1.3);

        insertProductStmt.run(
          p.name || `منتج ${p.model}`,
          p.model || '',
          p.category || 'أخرى',
          p.brand || 'Hoco',
          cost,
          selling,
          cost,
          qty,
          qty,
          p.image_url || '/images/products/EQ33.jpg',
          p.barcode || `INV${invoiceNumber}-${p.model || Math.random()}`,
          `مستورد من فاتورة رقم ${invoiceNumber}`
        );
        importedCount++;
      }

      return {
        importedCount,
        invoiceId: invResult.lastInsertRowid
      };
    });

    res.json({
      success: true,
      importedCount: result.importedCount,
      invoiceId: result.invoiceId,
      message: `تم استيراد وإضافة ${result.importedCount} منتجاً إلى المخزن بنجاح مع الصور الدقيقة والأسعار!`
    });
  } catch (error) {
    console.error('Error confirming invoice import:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/invoices', (req, res) => {
  try {
    const invoices = db.prepare('SELECT * FROM invoices ORDER BY id DESC').all();
    res.json({ success: true, invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. MULTI-BRAND IMAGE SEARCH & UPLOADS
// ==========================================

const { BRAND_CONFIGS, detectBrand, searchProductImages, downloadAndSaveImage, compositeOntoMasterPodium } = require('./image_search_service');

app.get('/api/brands', (req, res) => {
  try {
    const brands = Object.entries(BRAND_CONFIGS).map(([key, val]) => ({
      id: key,
      name: val.name,
      domain: val.domain
    }));
    res.json({ success: true, brands });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/search-brand-images', async (req, res) => {
  try {
    const { brand, query, model, category, productName } = req.body;
    const searchTarget = (query || model || productName || '').trim();
    if (!searchTarget) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال كود الموديل أو اسم المنتج للبحث' });
    }

    const data = await searchProductImages(brand || 'hoco', searchTarget, model, category, productName);
    res.json(data);
  } catch (error) {
    console.error('Error searching brand images:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/apply-product-image', async (req, res) => {
  try {
    const { productId, imageUrl, compositePodium } = req.body;
    if (!productId || !imageUrl) {
      return res.status(400).json({ success: false, message: 'معرف المنتج أو رابط الصورة مفقود' });
    }

    let finalImageUrl = imageUrl;

    // If external URL, download and save locally for offline support
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      let ext = path.extname(imageUrl.split('?')[0]).toLowerCase();
      if (!ALLOWED_UPLOAD_EXT.has(ext) || ext === '.pdf') ext = '.jpg';
      const filename = `brand-img-${Date.now()}-${Math.round(Math.random()*1000)}${ext}`;
      const localPath = await downloadAndSaveImage(imageUrl, filename);
      if (!localPath) {
        // Blocked (private/internal address) or simply unreachable. Storing the raw
        // URL would leave a broken, unvetted link on the product.
        return res.status(400).json({
          success: false,
          message: 'تعذر تحميل الصورة من هذا الرابط، تأكد أنه رابط صورة عام وصحيح'
        });
      }
      finalImageUrl = localPath;
    }

    // If requested, composite onto Master Studio Podium
    if (compositePodium && finalImageUrl) {
      const outputFilename = `podium-${Date.now()}-${Math.round(Math.random()*1000)}.jpg`;
      const podiumPath = await compositeOntoMasterPodium(finalImageUrl, outputFilename);
      if (podiumPath) {
        finalImageUrl = podiumPath;
      }
    }

    // Update SQLite database
    db.prepare('UPDATE products SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(finalImageUrl, productId);

    syncStorefront();

    res.json({
      success: true,
      imageUrl: finalImageUrl,
      message: compositePodium ? 'تم حفظ الصورة ودمجها على منصة الاستوديو الفاخرة بنجاح!' : 'تم تعيين وتثبيت صورة المنتج بنجاح!'
    });
  } catch (error) {
    console.error('Error applying product image:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/detect-product-info', (req, res) => {
  try {
    const { model, name } = req.body;
    const info = findModelData(model || '', name || '');
    const detectedBrandKey = detectBrand(model || '', name || '');
    res.json({
      success: true,
      data: {
        ...info,
        brandKey: detectedBrandKey
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/upload-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'لم يتم اختيار صورة' });
    }
    mirrorUploadsToGit();
    const relativePath = `/uploads/${req.file.filename}`;
    res.json({ success: true, imageUrl: relativePath, message: 'تم رفع الصورة بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/search-image', (req, res) => {
  try {
    const { model, name } = req.body;
    const modelData = findModelData(model || '', name || '');
    res.json({ success: true, data: modelData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 7. STATS & ALL-IN-ONE PROFIT OVERVIEW
// ==========================================

app.get('/api/stats', (req, res) => {
  try {
    // 1. Inventory & Products
    const invStats = db.prepare(`
      SELECT
        COUNT(*) as total_distinct_products,
        COALESCE(SUM(stock_quantity), 0) as total_stock_units,
        COALESCE(SUM(sold_quantity), 0) as total_sold_units,
        COALESCE(SUM(cost_price * stock_quantity), 0) as total_inventory_cost_value,
        COALESCE(SUM(selling_price * stock_quantity), 0) as total_inventory_retail_value
      FROM products
    `).get();

    // 2. Sales Profits
    const salesAll = db.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) as total_sales_revenue,
        COALESCE(SUM(profit), 0) as total_sales_profit,
        COUNT(*) as total_sales_count
      FROM sales
    `).get();

    const salesToday = db.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) as today_sales_revenue,
        COALESCE(SUM(profit), 0) as today_sales_profit,
        COUNT(*) as today_sales_count
      FROM sales
      WHERE date(created_at, 'localtime') = date('now', 'localtime')
    `).get();

    // 3. Hardware Repairs Profits & Losses
    const repairsAll = db.prepare(`
      SELECT
        COUNT(*) as total_repairs_count,
        COALESCE(SUM(CASE WHEN status IN ('ready', 'delivered') THEN total_charge ELSE 0 END), 0) as total_repair_revenue,
        COALESCE(SUM(CASE WHEN status IN ('ready', 'delivered') THEN parts_cost ELSE 0 END), 0) as total_repair_parts_cost,
        COALESCE(SUM(CASE WHEN status IN ('ready', 'delivered') THEN profit ELSE 0 END), 0) as total_repair_profit,
        COALESCE(SUM(CASE WHEN status = 'unrepaired' THEN loss_cost ELSE 0 END), 0) as total_repair_loss,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_repairs,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_repairs,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready_repairs,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_repairs,
        SUM(CASE WHEN status = 'unrepaired' THEN 1 ELSE 0 END) as unrepaired_repairs
      FROM repairs
    `).get();

    const netRepairProfit = (repairsAll.total_repair_profit || 0) - (repairsAll.total_repair_loss || 0);

    const repairsToday = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('ready', 'delivered') THEN profit ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN status = 'unrepaired' THEN loss_cost ELSE 0 END), 0) as today_repair_profit,
        COALESCE(SUM(total_charge), 0) as today_repair_revenue
      FROM repairs
      WHERE date(COALESCE(delivered_at, completed_at, received_at), 'localtime') = date('now', 'localtime')
    `).get();

    // 4. Software Services Profits
    const softwareAll = db.prepare(`
      SELECT
        COUNT(*) as total_software_count,
        COALESCE(SUM(total_charge), 0) as total_software_revenue,
        COALESCE(SUM(tool_cost), 0) as total_software_tool_cost,
        COALESCE(SUM(profit), 0) as total_software_profit,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_software,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_software
      FROM software_services
    `).get();

    const softwareToday = db.prepare(`
      SELECT
        COALESCE(SUM(total_charge), 0) as today_software_revenue,
        COALESCE(SUM(profit), 0) as today_software_profit,
        COUNT(*) as today_software_count
      FROM software_services
      WHERE date(created_at, 'localtime') = date('now', 'localtime')
    `).get();

    // 5. Overall Net Profit
    const totalNetProfit = (salesAll.total_sales_profit || 0) + netRepairProfit + (softwareAll.total_software_profit || 0);
    const todayNetProfit = (salesToday.today_sales_profit || 0) + (repairsToday.today_repair_profit || 0) + (softwareToday.today_software_profit || 0);

    // 6. Low stock alerts
    const threshold = parseInt(getSetting('low_stock_threshold') || '2', 10);
    const lowStockCount = db.prepare(`
      SELECT COUNT(*) as count FROM products WHERE stock_quantity > 0 AND stock_quantity <= ?
    `).get(threshold).count;

    const outOfStockCount = db.prepare(`
      SELECT COUNT(*) as count FROM products WHERE stock_quantity <= 0
    `).get().count;

    // 7. Top 5 Best Sellers & Profit Drivers
    const topSellers = db.prepare(`
      SELECT p.id, p.name, p.model, p.brand, p.category, p.image_url,
             COALESCE(SUM(s.quantity), 0) as total_sold,
             COALESCE(SUM(s.profit), 0) as total_profit,
             COALESCE(SUM(s.total_amount), 0) as total_revenue
      FROM products p
      INNER JOIN sales s ON p.id = s.product_id
      GROUP BY p.id
      ORDER BY total_sold DESC, total_profit DESC
      LIMIT 5
    `).all();

    // 8. Dead / Stagnant Stock (المنتجات الراكدة التي لم تباع بعد)
    const deadStock = db.prepare(`
      SELECT id, name, model, brand, category, image_url, stock_quantity, cost_price, selling_price,
             (stock_quantity * cost_price) as tied_up_capital,
             created_at
      FROM products
      WHERE stock_quantity > 0 AND (sold_quantity = 0 OR sold_quantity IS NULL)
      ORDER BY tied_up_capital DESC
      LIMIT 8
    `).all();

    // 9. Debt Summary
    const debtStats = db.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) as total_debt_created,
        COALESCE(SUM(paid_amount), 0) as total_debt_collected,
        COALESCE(SUM(remaining_amount), 0) as total_outstanding_debt,
        COUNT(CASE WHEN status != 'paid' THEN 1 END) as active_debtors_count
      FROM debts
    `).get();

    res.json({
      success: true,
      stats: {
        inventory: invStats,
        sales: {
          all: salesAll,
          today: salesToday
        },
        repairs: {
          all: repairsAll,
          netProfit: netRepairProfit,
          loss: repairsAll.total_repair_loss || 0,
          today: repairsToday
        },
        software: {
          all: softwareAll,
          today: softwareToday
        },
        profit: {
          totalNetProfit,
          todayNetProfit,
          salesProfit: salesAll.total_sales_profit || 0,
          repairNetProfit: netRepairProfit,
          repairGrossProfit: repairsAll.total_repair_profit || 0,
          repairLoss: repairsAll.total_repair_loss || 0,
          softwareProfit: softwareAll.total_software_profit || 0
        },
        stockAlerts: {
          lowStock: lowStockCount,
          outOfStock: outOfStockCount
        },
        topSellers: topSellers || [],
        deadStock: deadStock || [],
        debts: debtStats
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 8. DEBTS & CUSTOMER CREDIT LEDGER API (سجل الديون والآجل)
// ==========================================

app.get('/api/debts', (req, res) => {
  try {
    const { search, status } = req.query;
    let query = 'SELECT * FROM debts WHERE 1=1';
    const params = [];

    if (search && search.trim()) {
      const s = buildArabicSearch(['customer_name', 'customer_phone', 'items_summary', 'notes'], search);
      query += ` AND ${s.clause}`;
      params.push(...s.params);
    }

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY id DESC';
    const debts = db.prepare(query).all(...params);

    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) as total_debt_created,
        COALESCE(SUM(paid_amount), 0) as total_debt_collected,
        COALESCE(SUM(remaining_amount), 0) as total_outstanding_debt,
        COUNT(CASE WHEN status != 'paid' THEN 1 END) as active_debtors_count,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as settled_count
      FROM debts
    `).get();

    res.json({ success: true, debts, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/debts/payment', (req, res) => {
  try {
    const { debt_id, amount, notes } = req.body;
    const payAmount = parseFloat(amount);
    if (!debt_id || isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ success: false, message: 'المبلغ المدخل غير صالح' });
    }

    const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(debt_id);
    if (!debt) {
      return res.status(404).json({ success: false, message: 'حساب الدين غير موجود' });
    }

    const newPaid = debt.paid_amount + payAmount;
    const newRemaining = Math.max(0, debt.total_amount - newPaid);
    const newStatus = newRemaining <= 0 ? 'paid' : 'partially_paid';

    runTransaction(() => {
      db.prepare(`
        INSERT INTO debt_payments (debt_id, amount, notes)
        VALUES (?, ?, ?)
      `).run(debt_id, payAmount, notes || 'تسديد دفعة نقدية');

      db.prepare(`
        UPDATE debts SET
          paid_amount = ?,
          remaining_amount = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newPaid, newRemaining, newStatus, debt_id);
    });

    res.json({
      success: true,
      paidAmount: payAmount,
      remaining: newRemaining,
      status: newStatus,
      message: `تم تسجيل سداد مبلغ ${payAmount.toLocaleString('en-US')} د.ع بنجاح`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/debts/:id/statement', (req, res) => {
  try {
    const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(req.params.id);
    if (!debt) {
      return res.status(404).json({ success: false, message: 'حساب الدين غير موجود' });
    }
    const payments = db.prepare('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY id DESC').all(req.params.id);
    res.json({ success: true, debt, payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/debts/:id', (req, res) => {
  try {
    runTransaction(() => {
      db.prepare('DELETE FROM debt_payments WHERE debt_id = ?').run(req.params.id);
      db.prepare('DELETE FROM debts WHERE id = ?').run(req.params.id);
    });
    res.json({ success: true, message: 'تم حذف سجل الدين بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 8. SETTINGS & BACKUP API
// ==========================================

app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, settings: publicSettingsView(settings, req) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const { settings } = req.body;
    if (settings && typeof settings === 'object') {
      for (const [key, value] of Object.entries(settings)) {
        setSetting(key, value);
      }
    }
    syncStorefront('SETTINGS');
    res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/backup', (req, res) => {
  try {
    const dbPath = path.join(__dirname, '..', 'store_data.db');
    if (fs.existsSync(dbPath)) {
      res.download(dbPath, `backup_store_data_${Date.now()}.db`);
    } else {
      res.status(404).json({ success: false, message: 'ملف قاعدة البيانات غير موجود' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/backups/secure-list', (req, res) => {
  try {
    let files = [];
    if (fs.existsSync(SECURE_BACKUP_DIR)) {
      files = fs.readdirSync(SECURE_BACKUP_DIR)
        .filter(f => f.endsWith('.db'))
        .map(f => {
          const stats = fs.statSync(path.join(SECURE_BACKUP_DIR, f));
          return {
            filename: f,
            sizeBytes: stats.size,
            createdAt: stats.mtime
          };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    res.json({
      success: true,
      secureLocation: SECURE_BACKUP_DIR,
      totalBackups: files.length,
      backups: files
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/backups/trigger', (req, res) => {
  try {
    triggerAutoBackup(true);
    res.json({ success: true, message: 'تم أخذ نسخة احتياطية آمنة فورية بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 9. CUSTOMER ONLINE STOREFRONT API (متجر الزبائن الإلكتروني)
// ==========================================

// Serve customer shop portal
app.get(['/shop', '/store'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'shop', 'index.html'));
});

// Place new customer online order
app.post('/api/shop/orders', (req, res) => {
  try {
    const { customer_name, customer_phone, city, address, notes, items } = req.body;

    if (!customer_name || !customer_phone) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال الاسم ورقم الهاتف لإتمام الطلب' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'سلة المشتريات فارغة' });
    }

    const orderNumber = generateOrderNumber();
    let calculatedTotal = 0;

    // Every item must resolve to a real product; prices always come from the DB,
    // never from the request body, and quantity may not exceed available stock.
    const validatedItems = [];
    for (const item of items) {
      const p = db.prepare('SELECT id, name, model, selling_price, image_url, stock_quantity FROM products WHERE id = ?').get(item.id);
      if (!p) {
        return res.status(400).json({ success: false, message: `أحد المنتجات في سلتك لم يعد متوفراً في المتجر` });
      }

      const qty = parseInt(item.qty, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ success: false, message: `الكمية المطلوبة للمنتج (${p.name}) غير صالحة` });
      }
      if (qty > p.stock_quantity) {
        return res.status(400).json({
          success: false,
          message: `الكمية المتوفرة من (${p.name}) هي ${p.stock_quantity} قطعة فقط، وقد طلبت ${qty}`
        });
      }

      calculatedTotal += p.selling_price * qty;
      validatedItems.push({
        id: p.id,
        name: p.name,
        model: p.model,
        price: p.selling_price,
        qty,
        image_url: p.image_url || '/images/products/EQ33.jpg'
      });
    }

    const result = runTransaction(() => {
      const district = (req.body.district || 'الناصرية').trim();
      const orderStmt = db.prepare(`
        INSERT INTO orders (
          order_number, customer_name, customer_phone, city, district, address, notes,
          items_json, total_amount, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `);

      const orderRes = orderStmt.run(
        orderNumber,
        customer_name.trim(),
        customer_phone.trim(),
        'ذي قار',
        district,
        address || 'توصيل للمنزل داخل محافظة ذي قار',
        notes || '',
        JSON.stringify(validatedItems),
        calculatedTotal
      );

      // Auto-upsert into customers table
      try {
        db.prepare(`
          INSERT INTO customers (name, phone, province, district, address, is_verified, updated_at)
          VALUES (?, ?, 'ذي قار', ?, ?, 1, CURRENT_TIMESTAMP)
          ON CONFLICT(phone) DO UPDATE SET
            name = excluded.name,
            district = excluded.district,
            address = excluded.address,
            updated_at = CURRENT_TIMESTAMP
        `).run(customer_name.trim(), customer_phone.trim(), district, address || '');
      } catch(e) {}

      // Decrement stock for ordered items. The WHERE guard makes this safe against
      // two orders racing for the last piece: the loser matches 0 rows and we abort.
      for (const item of validatedItems) {
        const upd = db.prepare(`
          UPDATE products SET
            stock_quantity = stock_quantity - ?,
            sold_quantity = sold_quantity + ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND stock_quantity >= ?
        `).run(item.qty, item.qty, item.id, item.qty);

        if (upd.changes === 0) {
          throw new Error(`نفدت الكمية المتوفرة من (${item.name}) أثناء إتمام الطلب، يرجى تعديل سلتك`);
        }
      }

      return orderRes;
    });

    syncStorefront('ONLINE_ORDER');

    sendTelegramOrderAlert({
      orderNumber,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      district: (req.body.district || 'الناصرية').trim(),
      address: address || 'توصيل للمنزل داخل محافظة ذي قار',
      notes,
      items: validatedItems,
      total: calculatedTotal
    });

    res.json({
      success: true,
      orderNumber,
      orderId: result.lastInsertRowid,
      totalAmount: calculatedTotal,
      message: `تم استلام طلبك بنجاح! رقم طلبك هو: #${orderNumber}`
    });
  } catch (error) {
    console.error('Error placing online customer order:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// CUSTOMER AUTH, PHONE VERIFICATION & PORTAL API
// ==========================================

const activeOtps = new Map();

// Request OTP endpoint
app.post('/api/customer/request-otp', (req, res) => {
  try {
    const { phone, name, district, address, otp } = req.body;
    const cleanPhone = normalizePhone(phone);
    const code = otp || Math.floor(100000 + Math.random() * 900000).toString();
    
    activeOtps.set(cleanPhone, {
      code,
      name: name || '',
      district: district || 'الناصرية',
      address: address || '',
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    console.log(`[Customer OTP] Code generated for ${cleanPhone}: ${code}`);
    res.json({ success: true, message: 'تم إرسال كود التحقق بنجاح', debugOtp: code });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Register or update verified customer
app.post('/api/customer/register', (req, res) => {
  try {
    const { name, phone, district, address, is_verified } = req.body;
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || !name) {
      return res.status(400).json({ success: false, message: 'الاسم ورقم الهاتف مطلوبان' });
    }

    const stmt = db.prepare(`
      INSERT INTO customers (name, phone, province, district, address, is_verified, updated_at)
      VALUES (?, ?, 'ذي قار', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(phone) DO UPDATE SET
        name = excluded.name,
        district = excluded.district,
        address = excluded.address,
        is_verified = excluded.is_verified,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(name.trim(), cleanPhone, district || 'الناصرية', address || '', is_verified ? 1 : 0);
    const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(cleanPhone);
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Customer login by phone
app.post('/api/customer/login', (req, res) => {
  try {
    const { phone } = req.body;
    const cleanPhone = normalizePhone(phone);
    const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(cleanPhone);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'رقم الهاتف غير مسجل' });
    }
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update customer profile
app.put('/api/customer/profile', (req, res) => {
  try {
    const { name, phone, district, address } = req.body;
    const cleanPhone = normalizePhone(phone);
    // `name.trim()` threw a 500 whenever name was absent
    if (!cleanPhone || !name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'الاسم ورقم الهاتف مطلوبان' });
    }

    const result = db.prepare(`
      UPDATE customers SET
        name = ?, district = ?, address = ?, updated_at = CURRENT_TIMESTAMP
      WHERE phone = ?
    `).run(String(name).trim(), district || 'الناصرية', address || '', cleanPhone);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'لا يوجد حساب مسجل بهذا الرقم' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(cleanPhone);
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get customer orders by phone
app.get('/api/customer/orders', (req, res) => {
  try {
    const { phone } = req.query;
    const cleanPhone = normalizePhone(phone);
    const orders = db.prepare('SELECT * FROM orders WHERE customer_phone = ? ORDER BY id DESC').all(cleanPhone);
    const formatted = orders.map(o => ({
      ...o,
      orderNumber: o.order_number,
      totalAmount: o.total_amount,
      items: JSON.parse(o.items_json || '[]')
    }));
    res.json({ success: true, orders: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Customer cancels order
app.post('/api/customer/cancel-order', (req, res) => {
  try {
    const { orderNumber, phone } = req.body;
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب لإلغاء الطلب' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);
    if (!order) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }
    // The order must belong to the caller, otherwise anyone could cancel anyone's order
    if (normalizePhone(order.customer_phone) !== cleanPhone) {
      return res.status(403).json({ success: false, message: 'لا تملك صلاحية إلغاء هذا الطلب' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب لأنه قيد المعالجة أو تم شحنه بالفعل' });
    }

    runTransaction(() => {
      restoreOrderStock(order);
      db.prepare(`
        UPDATE orders SET
          status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = 'customer'
        WHERE order_number = ?
      `).run(orderNumber);
    });

    syncStorefront('ORDER_CANCELLED');
    res.json({ success: true, message: 'تم إلغاء الطلب وإرجاع الكميات للمخزن بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get online orders for management
app.get('/api/shop/orders', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all();
    const formatted = orders.map(o => ({
      ...o,
      items: JSON.parse(o.items_json || '[]')
    }));
    res.json({ success: true, orders: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update online order status
const ALLOWED_ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

app.put('/api/shop/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!ALLOWED_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'حالة الطلب غير معروفة' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }
    if (order.status === status) {
      return res.json({ success: true, message: 'حالة الطلب لم تتغير' });
    }

    runTransaction(() => {
      // Moving into cancelled returns the goods; moving back out takes them again.
      if (status === 'cancelled') {
        restoreOrderStock(order);
        db.prepare(`
          UPDATE orders SET status = ?, cancelled_at = CURRENT_TIMESTAMP, cancelled_by = 'store'
          WHERE id = ?
        `).run(status, order.id);
      } else {
        if (order.status === 'cancelled') {
          deductOrderStock(order);
        }
        db.prepare(`
          UPDATE orders SET status = ?, cancelled_at = NULL, cancelled_by = NULL
          WHERE id = ?
        `).run(status, order.id);
      }
    });

    syncStorefront('ORDER_STATUS');
    res.json({ success: true, message: 'تم تحديث حالة الطلب بنجاح' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Track repair status for customer
app.get('/api/shop/track-repair/:query', (req, res) => {
  try {
    const query = req.params.query.trim();
    const repair = db.prepare(`
      SELECT ticket_number, customer_name, device_type, device_model, issue_description,
             total_charge, status, received_at, completed_at, delivered_at
      FROM repairs
      WHERE ticket_number = ? OR customer_phone LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get(query, `%${query}%`);

    if (!repair) {
      return res.status(404).json({ success: false, message: 'لم يتم العثور على تذكرة صيانة بهذا الرقم أو الهاتف' });
    }

    res.json({ success: true, repair });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================
// Without this, multer rejections and malformed JSON bodies fall through to
// Express's default handler, which answers with an HTML stack trace.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  console.error(`[${req.method} ${req.path}]`, err);

  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'حجم الملف كبير جداً' });
  }
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ success: false, message: 'صيغة البيانات المرسلة غير صحيحة' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'حجم البيانات المرسلة كبير جداً' });
  }
  // Errors we raised ourselves carry a message meant for the user
  if (err && err.expose && err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }

  // Internal details stay in the server log, not in the response
  res.status(500).json({ success: false, message: 'حدث خطأ غير متوقع في الخادم' });
});

// Start server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  🚀 نظام Sigma Store الداخلي يعمل الآن بنجاح!`);
  console.log(`  🔗 لوحة الإدارة الداخلية: http://localhost:${PORT}`);
  console.log(`  🛍️ متجر الزبائن الإلكتروني: http://localhost:${PORT}/shop`);
  console.log(`====================================================`);

  if (generatedAdminPassword) {
    console.log(``);
    console.log(`  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║   🔐 كلمة مرور الإدارة (احفظها الآن!)        ║`);
    console.log(`  ╠══════════════════════════════════════════════╣`);
    console.log(`  ║        ${generatedAdminPassword}                     ║`);
    console.log(`  ╚══════════════════════════════════════════════╝`);
    console.log(`  تظهر هذه الرسالة مرة واحدة فقط.`);
    console.log(`  يمكنك تغييرها من شاشة الإعدادات في لوحة الإدارة.`);
    console.log(``);
  }
  console.log(`  ℹ️  الدخول من هذا الجهاز لا يحتاج كلمة مرور.`);
  console.log(`     الدخول من الإنترنت أو الشبكة يحتاجها.`);
  console.log(`====================================================`);
});
