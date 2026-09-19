const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'store_data.db');
const db = new DatabaseSync(dbPath);

// High-Performance SQLite Pragmas & Concurrency Tuning
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA cache_size = -64000;'); // 64MB memory cache
db.exec('PRAGMA temp_store = MEMORY;');
db.exec('PRAGMA busy_timeout = 5000;');

// Initialize Tables & Indexes
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      model TEXT,
      category TEXT DEFAULT 'أخرى',
      brand TEXT DEFAULT 'Hoco',
      cost_price REAL DEFAULT 0,
      selling_price REAL DEFAULT 0,
      wholesale_price REAL DEFAULT 0,
      global_price_usd REAL DEFAULT 0,
      total_quantity INTEGER DEFAULT 0,
      sold_quantity INTEGER DEFAULT 0,
      stock_quantity INTEGER DEFAULT 0,
      image_url TEXT,
      barcode TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      product_name TEXT,
      product_model TEXT,
      quantity INTEGER NOT NULL,
      unit_cost REAL DEFAULT 0,
      unit_price REAL NOT NULL,
      discount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      profit REAL NOT NULL,
      customer_name TEXT,
      sold_by TEXT DEFAULT 'مدير المتجر',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS repairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      device_type TEXT,
      device_model TEXT,
      passcode TEXT,
      issue_description TEXT,
      parts_cost REAL DEFAULT 0,
      total_charge REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      loss_cost REAL DEFAULT 0,
      loss_reason TEXT,
      status TEXT DEFAULT 'pending',
      technician TEXT DEFAULT 'فني الصيانة',
      notes TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      delivered_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS software_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      device_model TEXT,
      service_type TEXT NOT NULL,
      tool_cost REAL DEFAULT 0,
      total_charge REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      status TEXT DEFAULT 'completed',
      technician TEXT DEFAULT 'فني السوفت وير',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT,
      supplier_name TEXT,
      invoice_date TEXT,
      total_items INTEGER DEFAULT 0,
      total_amount REAL DEFAULT 0,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      city TEXT,
      address TEXT,
      notes TEXT,
      items_json TEXT NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      source_type TEXT DEFAULT 'pos_sale',
      source_id INTEGER,
      items_summary TEXT,
      total_amount REAL NOT NULL,
      paid_amount REAL DEFAULT 0,
      remaining_amount REAL NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'unpaid',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      province TEXT DEFAULT 'ذي قار',
      district TEXT DEFAULT 'الناصرية',
      address TEXT,
      is_verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_products_model ON products(model);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id);
    CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
    CREATE INDEX IF NOT EXISTS idx_repairs_ticket ON repairs(ticket_number);
    CREATE INDEX IF NOT EXISTS idx_software_created ON software_services(created_at);
    CREATE INDEX IF NOT EXISTS idx_software_ticket ON software_services(ticket_number);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_debts_customer ON debts(customer_name);
    CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
    CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id ON debt_payments(debt_id);
  `);

  // Auto-migrate new columns if missing in existing DB
  try {
    db.exec(`ALTER TABLE sales ADD COLUMN payment_type TEXT DEFAULT 'cash';`);
  } catch(e) {}

  try {
    db.exec(`ALTER TABLE repairs ADD COLUMN loss_cost REAL DEFAULT 0;`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE repairs ADD COLUMN loss_reason TEXT;`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE sales ADD COLUMN discount REAL DEFAULT 0;`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN district TEXT DEFAULT 'الناصرية';`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN cancelled_at DATETIME;`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN cancelled_by TEXT;`);
  } catch(e) {}
  // Date promised to the customer, so "متى يجهز؟" has an answer on the ticket
  try {
    db.exec(`ALTER TABLE repairs ADD COLUMN promised_at TEXT;`);
  } catch(e) {}

  // Seed default settings ONLY when absent. These used to be forced on every
  // startup, so anything saved from the settings screen (store name, phone)
  // was silently reverted the next time the app launched.
  const checkSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

  const DEFAULT_SETTINGS = {
    store_name: 'Sigma Store',
    phone: '07830860919 - 07835046817',
    store_services: 'صيانة هواتف | اكسسوارات | استنساخ | الكترونيات',
    usd_rate: '1500',
    default_retail_margin: '25',
    low_stock_threshold: '2'
  };

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!checkSetting.get(key)) {
      insertSetting.run(key, value);
    }
  }

  console.log('Sigma Store database initialized and migrated successfully.');
}

initDatabase();

const os = require('os');
const SECURE_BACKUP_DIR = 'C:\\SIGMA_STORE_SECURE_BACKUPS';
const USER_BACKUP_DIR = path.join(os.homedir(), 'SIGMA_STORE_SECURE_BACKUPS');
const LOCAL_BACKUP_DIR = path.join(__dirname, '..', '.secure_backups');

// Ensure secure backup directories exist
try {
  if (!fs.existsSync(SECURE_BACKUP_DIR)) fs.mkdirSync(SECURE_BACKUP_DIR, { recursive: true });
} catch (_) {}
try {
  if (!fs.existsSync(USER_BACKUP_DIR)) fs.mkdirSync(USER_BACKUP_DIR, { recursive: true });
} catch (_) {}
try {
  if (!fs.existsSync(LOCAL_BACKUP_DIR)) fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
} catch (_) {}

let backupDebounceTimer = null;

// Keep the most recent N snapshots per location. Backups ran on every single
// write with no cleanup, so the folders grew without bound.
const MAX_BACKUPS_PER_DIR = 60;

function pruneOldBackups(dir) {
  try {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir)
      .filter(f => /^store_data_backup_.*\.db$/.test(f))
      .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    for (const old of files.slice(MAX_BACKUPS_PER_DIR)) {
      try { fs.unlinkSync(path.join(dir, old.name)); } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Automatically creates a secure timestamped snapshot of the database
 */
function triggerAutoBackup(immediate = false) {
  if (backupDebounceTimer) {
    clearTimeout(backupDebounceTimer);
    backupDebounceTimer = null;
  }

  const performBackup = () => {
    try {
      if (!fs.existsSync(dbPath)) return;

      // In WAL mode the newest committed data may still live in store_data.db-wal.
      // Copying the .db alone could silently produce a snapshot that is missing
      // the most recent transactions. Fold the WAL into the main file first.
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (err) {
        console.error('WAL checkpoint before backup failed:', err.message);
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

      const fileName = `store_data_backup_${timestamp}.db`;

      for (const dir of [SECURE_BACKUP_DIR, USER_BACKUP_DIR, LOCAL_BACKUP_DIR]) {
        try {
          if (!fs.existsSync(dir)) continue;
          fs.copyFileSync(dbPath, path.join(dir, fileName));
          // The two off-project locations also keep a fixed "latest" copy
          if (dir !== LOCAL_BACKUP_DIR) {
            fs.copyFileSync(dbPath, path.join(dir, 'latest_store_data.db'));
          }
          pruneOldBackups(dir);
        } catch (_) {}
      }

      console.log(`🔒 [Secure Auto-Backup]: Snapshot saved safely -> ${fileName}`);
    } catch (err) {
      console.error('Auto backup error:', err.message);
    }
  };

  if (immediate) {
    performBackup();
  } else {
    // Coalesces the request-level and transaction-level triggers into one run
    backupDebounceTimer = setTimeout(performBackup, 1500);
  }
}

// Perform initial secure baseline backup
triggerAutoBackup(true);

/**
 * Execute a callback inside an atomic transaction (ACID compliant)
 */
function runTransaction(callback) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = callback();
    db.exec('COMMIT;');
    // Automatically trigger a secure backup on any successful transaction
    triggerAutoBackup();
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

module.exports = {
  db,
  runTransaction,
  triggerAutoBackup,
  SECURE_BACKUP_DIR,
  getSetting: (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },
  setSetting: (key, value) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
    triggerAutoBackup();
  }
};

