const { db } = require('../server/db');

console.log('--- TESTING REPAIR DELETION ---');

const ins = db.prepare(`
  INSERT INTO repairs (ticket_number, customer_name, customer_phone, device_type, device_model, issue_description, parts_cost, total_charge, profit, status)
  VALUES ('REP-TEST', 'Test Customer', '07700000000', 'Phone', 'Test Phone', 'Test Screen', 1000, 2000, 1000, 'pending')
`).run();

console.log('✓ Inserted test repair ID:', ins.lastInsertRowid);

const del = db.prepare('DELETE FROM repairs WHERE id = ?').run(ins.lastInsertRowid);
console.log('✓ Deleted rows:', del.changes);

const count = db.prepare('SELECT COUNT(*) as count FROM repairs').get().count;
console.log('✓ Total repairs remaining in DB:', count);
