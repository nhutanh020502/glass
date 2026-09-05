import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const jsonDir = path.join(rootDir, 'database-json');
const outputFile = path.join(rootDir, 'supabase-init-full.sql');

const tables = [
  {
    name: 'customers',
    ddl: `CREATE TABLE IF NOT EXISTS "customers" (
  "id" TEXT PRIMARY KEY,
  "customer_key" TEXT NOT NULL UNIQUE,
  "display_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL DEFAULT '',
  "phone_normalized" TEXT NOT NULL DEFAULT '',
  "primary_address" TEXT NOT NULL DEFAULT '',
  "source" TEXT NOT NULL DEFAULT 'app',
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_customers_phone" ON "customers" ("phone_normalized");
CREATE INDEX IF NOT EXISTS "idx_customers_name" ON "customers" ("display_name");`
  },
  {
    name: 'products',
    ddl: `CREATE TABLE IF NOT EXISTS "products" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "brand" TEXT NOT NULL DEFAULT '',
  "model" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '',
  "compatible_box_sku" TEXT NOT NULL DEFAULT '',
  "source_supplier" TEXT NOT NULL DEFAULT '',
  "last_purchase_price" BIGINT NOT NULL DEFAULT 0,
  "suggested_sale_price" BIGINT NOT NULL DEFAULT 0,
  "active" BIGINT NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "idx_products_kind_sku" UNIQUE ("kind", "sku")
);`
  },
  {
    name: 'glasses_lots',
    ddl: `CREATE TABLE IF NOT EXISTS "glasses_lots" (
  "id" TEXT PRIMARY KEY,
  "received_at" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "received_qty" BIGINT NOT NULL,
  "remaining_qty" BIGINT NOT NULL,
  "unit_cost" BIGINT NOT NULL,
  "included_box_sku" TEXT,
  "included_box_name" TEXT,
  "included_box_qty" BIGINT NOT NULL DEFAULT 0,
  "included_box_remaining" BIGINT NOT NULL DEFAULT 0,
  "stock_status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "source_row" BIGINT,
  "source_key" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL,
  "purchase_order_item_id" TEXT,
  "receipt_id" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_glasses_lots_sku_remaining" ON "glasses_lots" ("sku", "remaining_qty", "received_at");
CREATE INDEX IF NOT EXISTS "idx_glasses_lots_status_sku_remaining" ON "glasses_lots" ("stock_status", "sku", "remaining_qty", "received_at");`
  },
  {
    name: 'box_lots',
    ddl: `CREATE TABLE IF NOT EXISTS "box_lots" (
  "id" TEXT PRIMARY KEY,
  "received_at" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "origin_type" TEXT NOT NULL,
  "received_qty" BIGINT NOT NULL,
  "remaining_qty" BIGINT NOT NULL,
  "unit_cost" BIGINT NOT NULL,
  "source_glasses_lot_id" TEXT,
  "source_order_id" TEXT,
  "note" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL,
  "purchase_order_item_id" TEXT,
  "receipt_id" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_box_lots_sku_remaining" ON "box_lots" ("sku", "remaining_qty", "received_at");`
  },
  {
    name: 'purchase_orders',
    ddl: `CREATE TABLE IF NOT EXISTS "purchase_orders" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "order_date" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "total_amount" BIGINT NOT NULL DEFAULT 0,
  "ship_cost" BIGINT NOT NULL DEFAULT 0,
  "merged_into_order_id" TEXT NOT NULL DEFAULT '',
  "merged_at" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_status_date" ON "purchase_orders" ("status", "order_date");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_merged_into" ON "purchase_orders" ("merged_into_order_id");`
  },
  {
    name: 'purchase_order_items',
    ddl: `CREATE TABLE IF NOT EXISTS "purchase_order_items" (
  "id" TEXT PRIMARY KEY,
  "purchase_order_id" TEXT NOT NULL,
  "line_no" BIGINT NOT NULL,
  "kind" TEXT NOT NULL,
  "fulfillment_type" TEXT NOT NULL,
  "link_group_id" TEXT NOT NULL DEFAULT '',
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ordered_qty" BIGINT NOT NULL,
  "received_qty" BIGINT NOT NULL DEFAULT 0,
  "activated_qty" BIGINT NOT NULL DEFAULT 0,
  "unit_cost" BIGINT NOT NULL DEFAULT 0,
  "source_supplier" TEXT NOT NULL DEFAULT '',
  "origin_purchase_order_id" TEXT NOT NULL DEFAULT '',
  "origin_purchase_order_item_id" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_purchase_items_order" ON "purchase_order_items" ("purchase_order_id", "line_no");
CREATE INDEX IF NOT EXISTS "idx_purchase_items_source" ON "purchase_order_items" ("source_supplier");`
  },
  {
    name: 'supplier_payments',
    ddl: `CREATE TABLE IF NOT EXISTS "supplier_payments" (
  "id" TEXT PRIMARY KEY,
  "purchase_order_id" TEXT NOT NULL,
  "payment_date" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "payment_type" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL
);`
  },
  {
    name: 'goods_receipts',
    ddl: `CREATE TABLE IF NOT EXISTS "goods_receipts" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "purchase_order_id" TEXT NOT NULL,
  "received_at" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_receipts_order" ON "goods_receipts" ("purchase_order_id", "received_at");`
  },
  {
    name: 'goods_receipt_items',
    ddl: `CREATE TABLE IF NOT EXISTS "goods_receipt_items" (
  "id" TEXT PRIMARY KEY,
  "receipt_id" TEXT NOT NULL,
  "purchase_order_item_id" TEXT NOT NULL,
  "quantity" BIGINT NOT NULL,
  "good_quantity" BIGINT NOT NULL DEFAULT 0,
  "defective_quantity" BIGINT NOT NULL DEFAULT 0,
  "box_stock_type" TEXT NOT NULL DEFAULT '',
  "unit_cost" BIGINT NOT NULL DEFAULT 0,
  "defect_reason" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL
);`
  },
  {
    name: 'defective_products',
    ddl: `CREATE TABLE IF NOT EXISTS "defective_products" (
  "id" TEXT PRIMARY KEY,
  "received_at" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" BIGINT NOT NULL,
  "unit_cost" BIGINT NOT NULL DEFAULT 0,
  "supplier" TEXT NOT NULL DEFAULT '',
  "purchase_order_id" TEXT NOT NULL DEFAULT '',
  "purchase_order_item_id" TEXT NOT NULL DEFAULT '',
  "receipt_id" TEXT NOT NULL DEFAULT '',
  "defect_reason" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'RECORDED',
  "note" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_defective_kind_date" ON "defective_products" ("kind", "received_at");
CREATE INDEX IF NOT EXISTS "idx_defective_sku" ON "defective_products" ("sku");`
  },
  {
    name: 'orders',
    ddl: `CREATE TABLE IF NOT EXISTS "orders" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "order_date" TEXT NOT NULL,
  "customer" TEXT NOT NULL,
  "phone" TEXT NOT NULL DEFAULT '',
  "order_type" TEXT NOT NULL,
  "glasses_sku" TEXT,
  "box_sku" TEXT,
  "revenue" BIGINT NOT NULL,
  "deposit" BIGINT NOT NULL DEFAULT 0,
  "ship" BIGINT NOT NULL DEFAULT 0,
  "ship_payer" TEXT NOT NULL DEFAULT 'SELLER',
  "status" TEXT NOT NULL,
  "glasses_cost" BIGINT NOT NULL DEFAULT 0,
  "box_cost" BIGINT NOT NULL DEFAULT 0,
  "profit" BIGINT NOT NULL DEFAULT 0,
  "glasses_lot_id" TEXT,
  "box_lot_id" TEXT,
  "box_source" TEXT,
  "customer_id" TEXT,
  "product_code" TEXT NOT NULL DEFAULT '',
  "address" TEXT NOT NULL DEFAULT '',
  "carrier" TEXT NOT NULL DEFAULT '',
  "lens_value" BIGINT NOT NULL DEFAULT 0,
  "cut_lens" TEXT NOT NULL DEFAULT '',
  "customer_debt" TEXT NOT NULL DEFAULT '',
  "chat_link" TEXT NOT NULL DEFAULT '',
  "source_supplier" TEXT NOT NULL DEFAULT '',
  "source_key" TEXT NOT NULL DEFAULT '',
  "consumption_order" BIGINT,
  "source_row" BIGINT,
  "note" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL,
  "workflow_status" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_orders_status_date" ON "orders" ("status", "order_date");
CREATE INDEX IF NOT EXISTS "idx_orders_glasses_sku" ON "orders" ("glasses_sku");
CREATE INDEX IF NOT EXISTS "idx_orders_box_sku" ON "orders" ("box_sku");
CREATE INDEX IF NOT EXISTS "idx_orders_customer_id" ON "orders" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_orders_source_row" ON "orders" ("source_row");`
  },
  {
    name: 'order_items',
    ddl: `CREATE TABLE IF NOT EXISTS "order_items" (
  "id" TEXT PRIMARY KEY,
  "order_id" TEXT NOT NULL,
  "line_no" BIGINT NOT NULL,
  "line_type" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "box_sku" TEXT NOT NULL DEFAULT '',
  "source_supplier" TEXT NOT NULL DEFAULT '',
  "box_source_supplier" TEXT NOT NULL DEFAULT '',
  "quantity" BIGINT NOT NULL,
  "unit_price" BIGINT NOT NULL DEFAULT 0,
  "estimated_cost" BIGINT NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "order_items" ("order_id", "line_no");`
  },
  {
    name: 'inventory_reservations',
    ddl: `CREATE TABLE IF NOT EXISTS "inventory_reservations" (
  "id" TEXT PRIMARY KEY,
  "order_id" TEXT NOT NULL,
  "order_item_id" TEXT NOT NULL,
  "lot_kind" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "lot_id" TEXT NOT NULL,
  "quantity" BIGINT NOT NULL,
  "unit_cost" BIGINT NOT NULL DEFAULT 0,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "line_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_reservations_lot_status" ON "inventory_reservations" ("lot_kind", "lot_id", "status");
CREATE INDEX IF NOT EXISTS "idx_reservations_order_status" ON "inventory_reservations" ("order_id", "status");`
  },
  {
    name: 'inventory_movements',
    ddl: `CREATE TABLE IF NOT EXISTS "inventory_movements" (
  "id" TEXT PRIMARY KEY,
  "occurred_at" TEXT NOT NULL,
  "item_kind" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "physical_delta" BIGINT NOT NULL DEFAULT 0,
  "reserved_delta" BIGINT NOT NULL DEFAULT 0,
  "movement_type" TEXT NOT NULL,
  "reference_type" TEXT NOT NULL,
  "reference_id" TEXT NOT NULL,
  "lot_id" TEXT NOT NULL DEFAULT '',
  "reason" TEXT NOT NULL DEFAULT '',
  "actor" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_movements_sku_time" ON "inventory_movements" ("sku", "occurred_at");`
  },
  {
    name: 'order_payments',
    ddl: `CREATE TABLE IF NOT EXISTS "order_payments" (
  "id" TEXT PRIMARY KEY,
  "order_id" TEXT NOT NULL,
  "payment_date" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "payment_type" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_payments_order_date" ON "order_payments" ("order_id", "payment_date");`
  },
  {
    name: 'shipments',
    ddl: `CREATE TABLE IF NOT EXISTS "shipments" (
  "id" TEXT PRIMARY KEY,
  "order_id" TEXT NOT NULL UNIQUE,
  "carrier" TEXT NOT NULL DEFAULT '',
  "tracking_code" TEXT NOT NULL DEFAULT '',
  "estimated_fee" BIGINT NOT NULL DEFAULT 0,
  "actual_fee" BIGINT NOT NULL DEFAULT 0,
  "shipped_at" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT NOT NULL DEFAULT '',
  "updated_at" TEXT NOT NULL
);`
  },
  {
    name: 'order_events',
    ddl: `CREATE TABLE IF NOT EXISTS "order_events" (
  "id" TEXT PRIMARY KEY,
  "order_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "from_status" TEXT NOT NULL DEFAULT '',
  "to_status" TEXT NOT NULL DEFAULT '',
  "reason" TEXT NOT NULL DEFAULT '',
  "actor" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_events_order_time" ON "order_events" ("order_id", "created_at");`
  },
  {
    name: 'test_inventory',
    ddl: `CREATE TABLE IF NOT EXISTS "test_inventory" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "source_supplier" TEXT NOT NULL DEFAULT '',
  "on_hand" BIGINT NOT NULL DEFAULT 0,
  "reserved" BIGINT NOT NULL DEFAULT 0,
  "unit_cost" BIGINT NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "idx_test_inventory_kind_sku" UNIQUE ("kind", "sku")
);`
  },
  {
    name: 'test_orders',
    ddl: `CREATE TABLE IF NOT EXISTS "test_orders" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "order_date" TEXT NOT NULL,
  "customer" TEXT NOT NULL,
  "phone" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL,
  "revenue" BIGINT NOT NULL DEFAULT 0,
  "cost" BIGINT NOT NULL DEFAULT 0,
  "profit" BIGINT NOT NULL DEFAULT 0,
  "note" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_test_orders_status_date" ON "test_orders" ("status", "order_date");`
  },
  {
    name: 'test_order_items',
    ddl: `CREATE TABLE IF NOT EXISTS "test_order_items" (
  "id" TEXT PRIMARY KEY,
  "order_id" TEXT NOT NULL,
  "line_no" BIGINT NOT NULL,
  "inventory_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" BIGINT NOT NULL,
  "unit_price" BIGINT NOT NULL DEFAULT 0,
  "unit_cost" BIGINT NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_test_order_items_order" ON "test_order_items" ("order_id", "line_no");`
  },
  {
    name: 'test_events',
    ddl: `CREATE TABLE IF NOT EXISTS "test_events" (
  "id" TEXT PRIMARY KEY,
  "occurred_at" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "reference_id" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "actor" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_test_events_time" ON "test_events" ("occurred_at");`
  },
  {
    name: 'app_migrations',
    ddl: `CREATE TABLE IF NOT EXISTS "app_migrations" (
  "key" TEXT PRIMARY KEY,
  "completed_at" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT ''
);`
  }
];

function escapeSqlVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

let sql = `-- =============================================================================
-- ORD Studio - Supabase (PostgreSQL) Database Initialization & Migration Script
-- Contains 22 Tables + Indexes + 1,176 Rows of Data
-- Generated on: ${new Date().toISOString()}
-- =============================================================================

`;

for (const t of tables) {
  sql += `-- -----------------------------------------------------------------------------\n`;
  sql += `-- Table: ${t.name}\n`;
  sql += `-- -----------------------------------------------------------------------------\n`;
  sql += t.ddl + '\n\n';

  const jsonPath = path.join(jsonDir, `${t.name}.json`);
  if (fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const rows = Array.isArray(data) ? data : (Array.isArray(data.rows) ? data.rows : []);
    if (rows.length > 0) {
      const cols = data.columns || Object.keys(rows[0]);
      const colList = cols.map(c => `"${c}"`).join(', ');

      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valuesList = batch.map(row => {
          const vals = cols.map(c => escapeSqlVal(row[c]));
          return `  (${vals.join(', ')})`;
        }).join(',\n');

        sql += `INSERT INTO "${t.name}" (${colList})\nVALUES\n${valuesList}\nON CONFLICT DO NOTHING;\n\n`;
      }
    }
  }
}

fs.writeFileSync(outputFile, sql, 'utf8');
console.log(`Generated ${outputFile} (${Math.round(fs.statSync(outputFile).size / 1024)} KB)`);
