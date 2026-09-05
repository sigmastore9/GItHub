const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, runTransaction, getSetting, setSetting, triggerAutoBackup, SECURE_BACKUP_DIR } = require('./db');
const { parseSupplierInvoice } = require('./pdfParser');
const { findModelData } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Smart Online Redirect: Direct online web visitors straight to the customer shop
app.get('/', (req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  if (host.includes('onrender.com') || host.includes('render.com') || req.query.view === 'shop') {
    return res.redirect('/shop');
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

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

const upload = multer({ storage });

// ==========================================
// TELEGRAM NOTIFICATIONS & STATIC JSON SYNC
// ==========================================
function exportStaticProductsJson() {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    settingsRows.forEach(r => settings[r.key] = r.value);
    const data = {
      success: true,
      count: products.length,
      products: products,
      settings: settings,
      updated_at: new Date().toISOString()
    };
    const targetPath = path.join(__dirname, '..', 'public', 'shop', 'products.json');
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error exporting static products.json:', e);
  }
}

async function sendTelegramProductAlert(prod) {
  try {
    const token = getSetting('telegram_bot_token') || '8751504494:AAFQhkPA4lX2rFNKDVsdziD1-td03hfgD48';
    const chatIdsStr = getSetting('telegram_chat_ids') || '1390419753';
    const chatIds = chatIdsStr.split(',').map(s => s.trim()).filter(Boolean);

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
      query += ' AND (name LIKE ? OR model LIKE ? OR barcode LIKE ? OR brand LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
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
    res.json({ success: true, products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
    }
    res.json({ success: true, product });
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
      image_url || '/images/products/eq33.jpg',
      barcode || `PRD-${Date.now()}`,
      notes || ''
    );

    exportStaticProductsJson();
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

    res.json({ success: true, message: 'تم تحديث بيانات المنتج بنجاح' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
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
        WHERE id = ?
      `);
      updateProductStmt.run(qty, qty, product.id);

      const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);

      return {
        saleId,
        updatedStock: updatedProduct.stock_quantity,
        isCredit,
        remainingDebt
      };
    });

    res.json({
      success: true,
      saleId: result.saleId,
      profit,
      totalAmount,
      updatedStock: result.updatedStock,
      isCredit: result.isCredit,
      remainingDebt: result.remainingDebt,
      message: result.isCredit 
        ? `تم تسجيل البيع بالآجل (دين متبقي: ${result.remainingDebt.toLocaleString()} د.ع)` 
        : `تم تسجيل البيع نقداً بنجاح وتحقيق ربح بقيمة ${profit.toLocaleString()} د.ع`
    });
  } catch (error) {
    console.error('Error recording sale:', error);
    res.status(500).json({ success: false, message: error.message });
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
      query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR device_model LIKE ? OR ticket_number LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
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
      notes
    } = req.body;

    const parts = parseFloat(parts_cost) || 0;
    const charge = parseFloat(total_charge) || 0;
    const profit = charge - parts;
    const ticketNumber = `REP-${Date.now().toString().slice(-6)}`;

    const stmt = db.prepare(`
      INSERT INTO repairs (
        ticket_number, customer_name, customer_phone, device_type,
        device_model, passcode, issue_description, parts_cost,
        total_charge, profit, loss_cost, loss_reason, status, technician, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', 'pending', ?, ?)
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
      notes || ''
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
      notes
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
        status = ?, technician = ?, notes = ?, completed_at = ?, delivered_at = ?
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
      query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR device_model LIKE ? OR service_type LIKE ? OR ticket_number LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
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
    const ticketNumber = `SFT-${Date.now().toString().slice(-6)}`;

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
      message: `تم تسجيل خدمة السوفت وير بنجاح بربح (+${profit.toLocaleString()} د.ع)`
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
  try {
    let buffer;
    if (req.file) {
      buffer = fs.readFileSync(req.file.path);
    } else {
      const defaultPdfPath = path.join(__dirname, '..', 'مركز sigma-1.pdf');
      if (fs.existsSync(defaultPdfPath)) {
        buffer = fs.readFileSync(defaultPdfPath);
      } else {
        return res.status(400).json({ success: false, message: 'يرجى رفع ملف الفاتورة بصيغة PDF' });
      }
    }

    const parsedData = await parseSupplierInvoice(buffer);
    res.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('Error parsing PDF invoice:', error);
    res.status(500).json({ success: false, message: error.message });
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
          p.image_url || '/images/products/eq33.jpg',
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
      const ext = path.extname(imageUrl.split('?')[0]) || '.jpg';
      const filename = `brand-img-${Date.now()}-${Math.round(Math.random()*1000)}${ext}`;
      const localPath = await downloadAndSaveImage(imageUrl, filename);
      if (localPath) {
        finalImageUrl = localPath;
      }
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
      query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR items_summary LIKE ? OR notes LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
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
      message: `تم تسجيل سداد مبلغ ${payAmount.toLocaleString()} د.ع بنجاح`
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
    res.json({ success: true, settings });
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

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    let calculatedTotal = 0;

    const validatedItems = items.map(item => {
      const p = db.prepare('SELECT id, name, model, selling_price, cost_price, image_url, stock_quantity FROM products WHERE id = ?').get(item.id);
      const qty = parseInt(item.qty, 10) || 1;
      const price = p ? p.selling_price : (parseFloat(item.price) || 0);
      calculatedTotal += price * qty;

      return {
        id: item.id,
        name: p ? p.name : item.name,
        model: p ? p.model : item.model,
        price,
        qty,
        image_url: p ? p.image_url : (item.image_url || '/images/products/eq33.jpg')
      };
    });

    const result = runTransaction(() => {
      const orderStmt = db.prepare(`
        INSERT INTO orders (
          order_number, customer_name, customer_phone, city, address, notes,
          items_json, total_amount, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `);

      const orderRes = orderStmt.run(
        orderNumber,
        customer_name.trim(),
        customer_phone.trim(),
        city || 'بغداد',
        address || 'استلام من المحل / توصيل للمنزل',
        notes || '',
        JSON.stringify(validatedItems),
        calculatedTotal
      );

      // Decrement stock for ordered items
      for (const item of validatedItems) {
        db.prepare(`
          UPDATE products SET
            stock_quantity = MAX(0, stock_quantity - ?),
            sold_quantity = sold_quantity + ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(item.qty, item.qty, item.id);
      }

      return orderRes;
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
app.put('/api/shop/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: 'تم تحديث حالة الطلب بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

// Start server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  🚀 نظام Sigma Store الداخلي يعمل الآن بنجاح!`);
  console.log(`  🔗 لوحة الإدارة الداخلية: http://localhost:${PORT}`);
  console.log(`  🛍️ متجر الزبائن الإلكتروني: http://localhost:${PORT}/shop`);
  console.log(`====================================================`);
});
