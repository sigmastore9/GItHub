const { db, runTransaction } = require('../server/db');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('  🧹 ZEROING OUT TRANSACTIONS, SALES & REPAIRS');
console.log('====================================================');

runTransaction(() => {
  // 1. Reset all product sales & restore stock quantities
  db.exec(`
    UPDATE products SET
      sold_quantity = 0,
      stock_quantity = total_quantity,
      updated_at = CURRENT_TIMESTAMP;
  `);

  // 2. Clear sales table
  db.exec(`DELETE FROM sales;`);
  try { db.exec(`DELETE FROM sqlite_sequence WHERE name='sales';`); } catch(_) {}

  // 3. Clear hardware repairs
  db.exec(`DELETE FROM repairs;`);
  try { db.exec(`DELETE FROM sqlite_sequence WHERE name='repairs';`); } catch(_) {}

  // 4. Clear software services
  db.exec(`DELETE FROM software_services;`);
  try { db.exec(`DELETE FROM sqlite_sequence WHERE name='software_services';`); } catch(_) {}

  // 5. Clear online orders
  db.exec(`DELETE FROM orders;`);
  try { db.exec(`DELETE FROM sqlite_sequence WHERE name='orders';`); } catch(_) {}

  // 6. Clear customer debts and debt payments
  db.exec(`DELETE FROM debt_payments;`);
  db.exec(`DELETE FROM debts;`);
  try { db.exec(`DELETE FROM sqlite_sequence WHERE name='debt_payments';`); } catch(_) {}
  try { db.exec(`DELETE FROM sqlite_sequence WHERE name='debts';`); } catch(_) {}
});

// Optimize database
db.exec('VACUUM;');

// Verification check
const productsCount = db.prepare('SELECT COUNT(*) as count, SUM(stock_quantity) as totalStock, SUM(sold_quantity) as totalSold FROM products').get();
const salesCount = db.prepare('SELECT COUNT(*) as count FROM sales').get().count;
const repairsCount = db.prepare('SELECT COUNT(*) as count FROM repairs').get().count;
const softwareCount = db.prepare('SELECT COUNT(*) as count FROM software_services').get().count;
const ordersCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
const debtsCount = db.prepare('SELECT COUNT(*) as count FROM debts').get().count;

console.log('----------------------------------------------------');
console.log(`✓ Products preserved: ${productsCount.count} items`);
console.log(`✓ Total Stock restored: ${productsCount.totalStock} units`);
console.log(`✓ Sold Quantity reset to: ${productsCount.totalSold || 0}`);
console.log(`✓ Sales records: ${salesCount}`);
console.log(`✓ Hardware repairs: ${repairsCount}`);
console.log(`✓ Software services: ${softwareCount}`);
console.log(`✓ Online customer orders: ${ordersCount}`);
console.log(`✓ Customer debts: ${debtsCount}`);
console.log('====================================================');
console.log('  🎉 DATABASE RESET TO ZERO STATE COMPLETED CLEANLY');
console.log('====================================================');
