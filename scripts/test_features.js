const { db } = require('../server/db');

console.log('=== VERIFYING NEW STORE FEATURES (3, 4, 6) ===');

// 1. Verify Debts Tables
const debts = db.prepare('SELECT COUNT(*) as count FROM debts').get();
const debtPayments = db.prepare('SELECT COUNT(*) as count FROM debt_payments').get();
console.log(`✓ Debts table ready: ${debts.count} records`);
console.log(`✓ Debt payments table ready: ${debtPayments.count} records`);

// 2. Verify Top Sellers Query
const topSellers = db.prepare(`
  SELECT p.id, p.name, p.model, p.brand, p.category, p.image_url,
         COALESCE(SUM(s.quantity), 0) as total_sold,
         COALESCE(SUM(s.profit), 0) as total_profit,
         COALESCE(SUM(s.total_amount), 0) as total_revenue
  FROM products p
  LEFT JOIN sales s ON p.id = s.product_id
  GROUP BY p.id
  ORDER BY total_sold DESC, total_profit DESC
  LIMIT 5
`).all();
console.log(`✓ Top Sellers query executed successfully, found ${topSellers.length} items`);

// 3. Verify Dead Stock Query
const deadStock = db.prepare(`
  SELECT id, name, model, brand, category, image_url, stock_quantity, cost_price, selling_price,
         (stock_quantity * cost_price) as tied_up_capital,
         created_at
  FROM products
  WHERE stock_quantity > 0 AND (sold_quantity = 0 OR sold_quantity IS NULL)
  ORDER BY tied_up_capital DESC
  LIMIT 5
`).all();
console.log(`✓ Dead Stock query executed successfully, found ${deadStock.length} stagnant items`);

console.log('=== ALL DATABASE QUERIES VERIFIED SUCCESSFULLY ===');
