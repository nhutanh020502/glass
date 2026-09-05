import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

const tables = [
  'customers', 'orders', 'order_items', 'products', 'glasses_lots',
  'box_lots', 'purchase_orders', 'purchase_order_items', 'goods_receipts',
  'goods_receipt_items', 'defective_products', 'inventory_reservations',
  'inventory_movements', 'order_payments', 'order_events', 'shipments',
  'supplier_payments', 'test_orders', 'test_order_items', 'test_inventory',
  'test_events', 'app_migrations'
];

async function verify() {
  console.log('--- KIEM TRA DU LIEU TREN SUPABASE ---');
  let total = 0;
  for (const t of tables) {
    const [{ count }] = await sql.unsafe(`SELECT count(*) FROM "${t}"`);
    console.log(`- ${t}: ${count} dong`);
    total += Number(count);
  }
  console.log('====================================');
  console.log(`TONG SO DONG DA NAP VAO SUPABASE: ${total} / 1176`);
  await sql.end();
}

verify();
