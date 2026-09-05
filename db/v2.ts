import { getDb, type DatabaseAdapter } from "./supabase";
import { ensureSchema } from "./store";

export type WorkflowStatus =
  | "DRAFT"
  | "WAITING_STOCK"
  | "DEPOSIT_RECEIVED"
  | "ORDERING_SUPPLIER"
  | "GOODS_RECEIVED"
  | "READY_TO_SHIP"
  | "SHIPPING"
  | "COMPLETED"
  | "CANCELLED"
  | "RETURNED"
  | "REFUNDED";

type PurchaseLineInput = {
  type: "FULL_BOX" | "GLASSES_ONLY" | "LOOSE_BOX";
  sku: string;
  name: string;
  sourceSupplier?: string;
  quantity: number;
  unitCost: number;
  boxSku?: string;
  boxName?: string;
  note?: string;
};

type SalesLineInput = {
  type: "GLASSES_WITH_ATTACHED" | "GLASSES_ONLY" | "GLASSES_WITH_LOOSE" | "BOX_ONLY";
  sku: string;
  name?: string;
  boxSku?: string;
  sourceSupplier?: string;
  boxSourceSupplier?: string;
  quantity: number;
  unitPrice: number;
};

type ShipPayer = "SELLER" | "RECIPIENT";

type ReservationPlan = {
  id: string;
  orderId: string;
  orderItemId: string;
  lotKind: "GLASSES" | "BOX";
  bucket: "GLASSES" | "ATTACHED_BOX" | "LOOSE_BOX";
  lotId: string;
  quantity: number;
  unitCost: number;
  sku: string;
  name: string;
  lineType: SalesLineInput["type"];
};

const RESERVED_STATUSES = new Set<WorkflowStatus>([
  "DEPOSIT_RECEIVED",
  "ORDERING_SUPPLIER",
  "GOODS_RECEIVED",
  "READY_TO_SHIP",
  "SHIPPING",
]);

let v2SchemaPromise: Promise<void> | null = null;
const V2_SCHEMA_MARKER = "runtime_schema_ready_v3";

function db(): DatabaseAdapter {
  return getDb();
}

function text(value: unknown, label: string) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`Vui lòng nhập ${label}.`);
  return result;
}

function optionalText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedSku(value: unknown, label = "mã sản phẩm") {
  return text(value, label).replace(/\s+/g, " ").toUpperCase();
}

function integer(value: unknown, label: string, min = 0) {
  const result = Number(value ?? 0);
  if (!Number.isInteger(result) || result < min) throw new Error(`${label} không hợp lệ.`);
  return result;
}

function signedInteger(value: unknown, label: string) {
  const result = Number(value);
  if (!Number.isInteger(result)) throw new Error(`${label} không hợp lệ.`);
  return result;
}

function shipPayer(value: unknown): ShipPayer {
  return String(value || "SELLER") === "RECIPIENT" ? "RECIPIENT" : "SELLER";
}

function customerTotal(revenue: number, ship: number, payer: ShipPayer) {
  return revenue + (payer === "RECIPIENT" ? ship : 0);
}

function orderProfit(revenue: number, cost: number, ship: number, payer: ShipPayer) {
  return revenue - cost - (payer === "SELLER" ? ship : 0);
}

function validDate(value: unknown, label: string) {
  const result = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || result < "2026-01-01") {
    throw new Error(`${label} phải từ ngày 01/01/2026 trở đi.`);
  }
  return result;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function now() {
  return new Date().toISOString();
}

function code(prefix: string) {
  return `${prefix}-${today().replaceAll("-", "").slice(2)}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
}

function actorName(actor?: string) {
  return optionalText(actor) || "Chủ tài khoản";
}

async function addColumns(table: string, columns: Array<[string, string]>) {
  const database = db();
  const info = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  const existing = new Set(info.results.map((column) => String(column.name)));
  for (const [name, definition] of columns) {
    if (!existing.has(name)) await database.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
  }
}

export function ensureV2Schema() {
  v2SchemaPromise ??= (async () => {
    const database = db();
    try {
      const marker = await database.prepare("SELECT key FROM app_migrations WHERE key = ?")
        .bind(V2_SCHEMA_MARKER).first();
      if (marker) return;
    } catch {
      // A brand-new local database may not have app_migrations yet.
    }
    await ensureSchema();
    const statements = [
      `CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('GLASSES','BOX')),
        sku TEXT NOT NULL, name TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '',
        compatible_box_sku TEXT NOT NULL DEFAULT '', source_supplier TEXT NOT NULL DEFAULT '',
        last_purchase_price INTEGER NOT NULL DEFAULT 0, suggested_sale_price INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, order_date TEXT NOT NULL,
        supplier TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('DRAFT','ORDERED','PARTIAL','RECEIVED','CANCELLED')),
        total_amount INTEGER NOT NULL DEFAULT 0, ship_cost INTEGER NOT NULL DEFAULT 0,
        merged_into_order_id TEXT NOT NULL DEFAULT '', merged_at TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS purchase_order_items (
        id TEXT PRIMARY KEY, purchase_order_id TEXT NOT NULL, line_no INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('GLASSES','BOX')),
        fulfillment_type TEXT NOT NULL CHECK(fulfillment_type IN ('FULL_BOX_GLASS','GLASSES_ONLY','ATTACHED_BOX','LOOSE_BOX')),
        link_group_id TEXT NOT NULL DEFAULT '', sku TEXT NOT NULL, name TEXT NOT NULL,
        ordered_qty INTEGER NOT NULL CHECK(ordered_qty > 0), received_qty INTEGER NOT NULL DEFAULT 0,
        activated_qty INTEGER NOT NULL DEFAULT 0, unit_cost INTEGER NOT NULL DEFAULT 0,
        source_supplier TEXT NOT NULL DEFAULT '', origin_purchase_order_id TEXT NOT NULL DEFAULT '',
        origin_purchase_order_item_id TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS supplier_payments (
        id TEXT PRIMARY KEY, purchase_order_id TEXT NOT NULL, payment_date TEXT NOT NULL,
        amount INTEGER NOT NULL, payment_type TEXT NOT NULL CHECK(payment_type IN ('DEPOSIT','PAYMENT','REFUND')),
        method TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS goods_receipts (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, purchase_order_id TEXT NOT NULL,
        received_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS goods_receipt_items (
        id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL, purchase_order_item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity > 0), good_quantity INTEGER NOT NULL DEFAULT 0,
        defective_quantity INTEGER NOT NULL DEFAULT 0, box_stock_type TEXT NOT NULL DEFAULT '',
        unit_cost INTEGER NOT NULL DEFAULT 0, defect_reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS defective_products (
        id TEXT PRIMARY KEY, received_at TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('GLASSES','BOX')),
        sku TEXT NOT NULL, name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
        unit_cost INTEGER NOT NULL DEFAULT 0, supplier TEXT NOT NULL DEFAULT '',
        purchase_order_id TEXT NOT NULL DEFAULT '', purchase_order_item_id TEXT NOT NULL DEFAULT '',
        receipt_id TEXT NOT NULL DEFAULT '', defect_reason TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'RECORDED', note TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, line_no INTEGER NOT NULL,
        line_type TEXT NOT NULL CHECK(line_type IN ('GLASSES_WITH_ATTACHED','GLASSES_ONLY','GLASSES_WITH_LOOSE','BOX_ONLY')),
        sku TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', box_sku TEXT NOT NULL DEFAULT '',
        source_supplier TEXT NOT NULL DEFAULT '', box_source_supplier TEXT NOT NULL DEFAULT '',
        quantity INTEGER NOT NULL CHECK(quantity > 0), unit_price INTEGER NOT NULL DEFAULT 0,
        estimated_cost INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS inventory_reservations (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, order_item_id TEXT NOT NULL,
        lot_kind TEXT NOT NULL CHECK(lot_kind IN ('GLASSES','BOX')),
        bucket TEXT NOT NULL CHECK(bucket IN ('GLASSES','ATTACHED_BOX','LOOSE_BOX')),
        lot_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), unit_cost INTEGER NOT NULL DEFAULT 0,
        sku TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', line_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('RESERVED','CONSUMED','RELEASED','RETURNED')),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, item_kind TEXT NOT NULL,
        bucket TEXT NOT NULL, sku TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
        physical_delta INTEGER NOT NULL DEFAULT 0, reserved_delta INTEGER NOT NULL DEFAULT 0,
        movement_type TEXT NOT NULL, reference_type TEXT NOT NULL, reference_id TEXT NOT NULL,
        lot_id TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS order_payments (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, payment_date TEXT NOT NULL,
        amount INTEGER NOT NULL, payment_type TEXT NOT NULL CHECK(payment_type IN ('DEPOSIT','PAYMENT','SHIP','REFUND')),
        method TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS shipments (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, carrier TEXT NOT NULL DEFAULT '',
        tracking_code TEXT NOT NULL DEFAULT '', estimated_fee INTEGER NOT NULL DEFAULT 0,
        actual_fee INTEGER NOT NULL DEFAULT 0, shipped_at TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SHIPPED','DELIVERED','FAILED','RETURNED')),
        note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS order_events (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, event_type TEXT NOT NULL,
        from_status TEXT NOT NULL DEFAULT '', to_status TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS test_inventory (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('GLASSES','BOX')),
        sku TEXT NOT NULL, name TEXT NOT NULL, source_supplier TEXT NOT NULL DEFAULT '',
        on_hand INTEGER NOT NULL DEFAULT 0 CHECK(on_hand >= 0),
        reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= on_hand),
        unit_cost INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS test_orders (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, order_date TEXT NOT NULL,
        customer TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK(status IN ('DRAFT','PROCESS','COMPLETED','CANCELLED','RETURNED')),
        revenue INTEGER NOT NULL DEFAULT 0, cost INTEGER NOT NULL DEFAULT 0, profit INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS test_order_items (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, line_no INTEGER NOT NULL, inventory_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('GLASSES','BOX')), sku TEXT NOT NULL, name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity > 0), unit_price INTEGER NOT NULL DEFAULT 0,
        unit_cost INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS test_events (
        id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, event_type TEXT NOT NULL,
        reference_id TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS app_migrations (
        key TEXT PRIMARY KEY, completed_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
      )`,
    ];
    for (const sql of statements) await database.prepare(sql).run();

    await addColumns("orders", [
      ["workflow_status", "TEXT"],
      ["updated_at", "TEXT NOT NULL DEFAULT ''"],
      ["ship_payer", "TEXT NOT NULL DEFAULT 'SELLER'"],
    ]);
    await addColumns("order_items", [
      ["source_supplier", "TEXT NOT NULL DEFAULT ''"],
      ["box_source_supplier", "TEXT NOT NULL DEFAULT ''"],
    ]);
    await addColumns("purchase_orders", [
      ["ship_cost", "INTEGER NOT NULL DEFAULT 0"],
      ["merged_into_order_id", "TEXT NOT NULL DEFAULT ''"],
      ["merged_at", "TEXT NOT NULL DEFAULT ''"],
    ]);
    await addColumns("purchase_order_items", [
      ["source_supplier", "TEXT NOT NULL DEFAULT ''"],
      ["origin_purchase_order_id", "TEXT NOT NULL DEFAULT ''"],
      ["origin_purchase_order_item_id", "TEXT NOT NULL DEFAULT ''"],
    ]);
    await addColumns("glasses_lots", [
      ["purchase_order_item_id", "TEXT"],
      ["receipt_id", "TEXT"],
      ["updated_at", "TEXT NOT NULL DEFAULT ''"],
    ]);
    await addColumns("box_lots", [
      ["purchase_order_item_id", "TEXT"],
      ["receipt_id", "TEXT"],
      ["updated_at", "TEXT NOT NULL DEFAULT ''"],
    ]);
    await addColumns("goods_receipt_items", [
      ["good_quantity", "INTEGER NOT NULL DEFAULT 0"],
      ["defective_quantity", "INTEGER NOT NULL DEFAULT 0"],
      ["box_stock_type", "TEXT NOT NULL DEFAULT ''"],
      ["unit_cost", "INTEGER NOT NULL DEFAULT 0"],
      ["defect_reason", "TEXT NOT NULL DEFAULT ''"],
    ]);

    const indexes = [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_kind_sku ON products(kind, sku)",
      "CREATE INDEX IF NOT EXISTS idx_purchase_orders_status_date ON purchase_orders(status, order_date)",
      "CREATE INDEX IF NOT EXISTS idx_purchase_items_order ON purchase_order_items(purchase_order_id, line_no)",
      "CREATE INDEX IF NOT EXISTS idx_purchase_items_source ON purchase_order_items(source_supplier)",
      "CREATE INDEX IF NOT EXISTS idx_purchase_orders_merged_into ON purchase_orders(merged_into_order_id)",
      "CREATE INDEX IF NOT EXISTS idx_receipts_order ON goods_receipts(purchase_order_id, received_at)",
      "CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id, line_no)",
      "CREATE INDEX IF NOT EXISTS idx_reservations_lot_status ON inventory_reservations(lot_kind, lot_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_reservations_order_status ON inventory_reservations(order_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_movements_sku_time ON inventory_movements(sku, occurred_at)",
      "CREATE INDEX IF NOT EXISTS idx_payments_order_date ON order_payments(order_id, payment_date)",
      "CREATE INDEX IF NOT EXISTS idx_events_order_time ON order_events(order_id, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_defective_kind_date ON defective_products(kind, received_at)",
      "CREATE INDEX IF NOT EXISTS idx_defective_sku ON defective_products(sku)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_test_inventory_kind_sku ON test_inventory(kind, sku)",
      "CREATE INDEX IF NOT EXISTS idx_test_orders_status_date ON test_orders(status, order_date)",
      "CREATE INDEX IF NOT EXISTS idx_test_order_items_order ON test_order_items(order_id, line_no)",
      "CREATE INDEX IF NOT EXISTS idx_test_events_time ON test_events(occurred_at)",
    ];
    for (const sql of indexes) await database.prepare(sql).run();

    await database.prepare(`UPDATE purchase_order_items SET source_supplier = COALESCE((
      SELECT po.supplier FROM purchase_orders po WHERE po.id = purchase_order_items.purchase_order_id
    ), '') WHERE TRIM(source_supplier) = ''`).run();

    await database.prepare(`UPDATE goods_receipt_items SET good_quantity = quantity
      WHERE good_quantity = 0 AND defective_quantity = 0`).run();
    await database.prepare(`UPDATE goods_receipt_items SET box_stock_type = CASE
      WHEN (SELECT fulfillment_type FROM purchase_order_items pi WHERE pi.id = goods_receipt_items.purchase_order_item_id) = 'ATTACHED_BOX' THEN 'ATTACHED'
      WHEN (SELECT fulfillment_type FROM purchase_order_items pi WHERE pi.id = goods_receipt_items.purchase_order_item_id) = 'LOOSE_BOX' THEN 'LOOSE'
      ELSE '' END WHERE box_stock_type = ''`).run();

    await database.prepare(`UPDATE orders SET workflow_status = CASE
      WHEN status = 'DONE' THEN 'COMPLETED' ELSE 'DEPOSIT_RECEIVED' END
      WHERE workflow_status IS NULL OR workflow_status = ''`).run();
    await backfillOrderItems(database);
    await backfillProducts(database);
    await backfillSalesLineSources(database);
    await migrateIncomingLots(database);
    await migrateReceivedLots(database);
    await backfillLegacyPayments(database);
    await backfillLegacyReservations(database);
    await database.prepare("INSERT OR REPLACE INTO app_migrations (key, completed_at, note) VALUES (?, ?, ?)")
      .bind(V2_SCHEMA_MARKER, now(), "Schema runtime đã sẵn sàng; request nghiệp vụ chỉ cần kiểm tra marker.").run();
    await database.prepare("PRAGMA optimize").run();
  })();
  return v2SchemaPromise;
}

async function backfillOrderItems(database: D1Database) {
  const created = now();
  await database.prepare(`INSERT INTO order_items (
    id, order_id, line_no, line_type, sku, name, box_sku, quantity, unit_price,
    estimated_cost, created_at, updated_at
  ) SELECT 'legacy-item-' || o.id, o.id, 1,
    CASE
      WHEN o.order_type = 'box_only' THEN 'BOX_ONLY'
      WHEN o.order_type = 'glasses_only' THEN 'GLASSES_ONLY'
      WHEN o.box_source = 'included' THEN 'GLASSES_WITH_ATTACHED'
      ELSE 'GLASSES_WITH_LOOSE'
    END,
    CASE WHEN o.order_type = 'box_only' THEN COALESCE(o.box_sku, '') ELSE COALESCE(o.glasses_sku, '') END,
    COALESCE(NULLIF(o.product_code, ''), CASE WHEN o.order_type = 'box_only' THEN o.box_sku ELSE o.glasses_sku END, ''),
    CASE WHEN o.order_type = 'glasses_with_box' THEN COALESCE(o.box_sku, '') ELSE '' END,
    1, o.revenue, o.glasses_cost + o.box_cost, ?, ?
    FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)`).bind(created, created).run();
}

async function backfillSalesLineSources(database: D1Database) {
  const migrationKey = "sales_line_sources_v1";
  const marker = await database.prepare("SELECT key FROM app_migrations WHERE key = ?").bind(migrationKey).first();
  if (marker) return;
  await database.prepare(`UPDATE order_items SET source_supplier = COALESCE(
    NULLIF((SELECT g.supplier FROM inventory_reservations r JOIN glasses_lots g ON g.id=r.lot_id
      WHERE r.order_item_id=order_items.id AND r.bucket='GLASSES' ORDER BY CASE r.status WHEN 'CONSUMED' THEN 0 WHEN 'RESERVED' THEN 1 ELSE 2 END LIMIT 1),''),
    NULLIF((SELECT b.supplier FROM inventory_reservations r JOIN box_lots b ON b.id=r.lot_id
      WHERE r.order_item_id=order_items.id AND r.bucket='LOOSE_BOX' AND order_items.line_type='BOX_ONLY'
      ORDER BY CASE r.status WHEN 'CONSUMED' THEN 0 WHEN 'RESERVED' THEN 1 ELSE 2 END LIMIT 1),''),
    NULLIF((SELECT o.source_supplier FROM orders o WHERE o.id=order_items.order_id),''),
    NULLIF((SELECT p.source_supplier FROM products p WHERE p.sku=order_items.sku
      AND p.kind=CASE WHEN order_items.line_type='BOX_ONLY' THEN 'BOX' ELSE 'GLASSES' END LIMIT 1),''), '')
    WHERE TRIM(source_supplier)=''`).run();
  await database.prepare(`UPDATE order_items SET box_source_supplier = CASE
    WHEN line_type='GLASSES_WITH_ATTACHED' THEN source_supplier
    WHEN line_type='GLASSES_WITH_LOOSE' THEN COALESCE(
      NULLIF((SELECT b.supplier FROM inventory_reservations r JOIN box_lots b ON b.id=r.lot_id
        WHERE r.order_item_id=order_items.id AND r.bucket='LOOSE_BOX'
        ORDER BY CASE r.status WHEN 'CONSUMED' THEN 0 WHEN 'RESERVED' THEN 1 ELSE 2 END LIMIT 1),''),
      NULLIF((SELECT p.source_supplier FROM products p WHERE p.kind='BOX' AND p.sku=order_items.box_sku LIMIT 1),''), '')
    ELSE '' END WHERE TRIM(box_source_supplier)=''`).run();
  await database.prepare("INSERT INTO app_migrations (key, completed_at, note) VALUES (?, ?, ?)")
    .bind(migrationKey, now(), "Đã chuyển nguồn đơn bán cũ xuống từng dòng; đơn cũ mặc định người bán trả ship.").run();
}

async function backfillProducts(database: D1Database) {
  const created = now();
  await database.prepare(`INSERT OR IGNORE INTO products (
    id, kind, sku, name, source_supplier, last_purchase_price, created_at, updated_at
  ) SELECT 'prd-g-' || lower(hex(randomblob(12))), 'GLASSES', sku, MAX(name),
    MAX(supplier), MAX(unit_cost), ?, ? FROM glasses_lots WHERE sku <> '' GROUP BY sku`).bind(created, created).run();
  await database.prepare(`INSERT OR IGNORE INTO products (
    id, kind, sku, name, source_supplier, last_purchase_price, created_at, updated_at
  ) SELECT 'prd-b-' || lower(hex(randomblob(12))), 'BOX', sku, MAX(name),
    MAX(supplier), MAX(unit_cost), ?, ? FROM box_lots WHERE sku <> '' GROUP BY sku`).bind(created, created).run();
  await database.prepare(`INSERT OR IGNORE INTO products (
    id, kind, sku, name, source_supplier, last_purchase_price, created_at, updated_at
  ) SELECT 'prd-ib-' || lower(hex(randomblob(12))), 'BOX', included_box_sku,
    MAX(COALESCE(included_box_name, included_box_sku)), MAX(supplier), 0, ?, ?
    FROM glasses_lots WHERE included_box_sku IS NOT NULL AND included_box_sku <> '' GROUP BY included_box_sku`).bind(created, created).run();
}

async function migrateIncomingLots(database: D1Database) {
  const marker = await database.prepare("SELECT key FROM app_migrations WHERE key = 'incoming_lots_to_po_v2'").first();
  if (marker) return;
  const lots = await database.prepare(`SELECT * FROM glasses_lots WHERE stock_status = 'INCOMING'
    ORDER BY received_at, created_at`).all<Record<string, string | number | null>>();
  for (const lot of lots.results) {
    const purchaseId = `legacy-po-${lot.id}`;
    const groupId = `legacy-group-${lot.id}`;
    const created = String(lot.created_at || now());
    const quantity = Math.max(Number(lot.remaining_qty || lot.received_qty || 0), 1);
    const purchaseCode = `DN-CU-${String(lot.source_row || String(lot.id).slice(0, 6)).replace(/[^A-Za-z0-9-]/g, "")}`;
    const itemStatements: D1PreparedStatement[] = [
      database.prepare(`INSERT OR IGNORE INTO purchase_orders (
        id, code, order_date, supplier, status, total_amount, note, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'ORDERED', ?, ?, 'Dữ liệu 2026', ?, ?)`).bind(
        purchaseId, purchaseCode, String(lot.received_at), String(lot.supplier),
        quantity * Number(lot.unit_cost || 0), String(lot.note || ""), created, created,
      ),
      database.prepare(`INSERT OR IGNORE INTO purchase_order_items (
        id, purchase_order_id, line_no, kind, fulfillment_type, link_group_id, sku, name,
        ordered_qty, received_qty, activated_qty, unit_cost, note, created_at, updated_at
      ) VALUES (?, ?, 1, 'GLASSES', ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`).bind(
        `legacy-po-item-g-${lot.id}`, purchaseId,
        Number(lot.included_box_remaining || 0) > 0 ? "FULL_BOX_GLASS" : "GLASSES_ONLY",
        groupId, String(lot.sku), String(lot.name), quantity, Number(lot.unit_cost || 0),
        String(lot.note || ""), created, created,
      ),
    ];
    if (Number(lot.included_box_remaining || 0) > 0 && lot.included_box_sku) {
      itemStatements.push(database.prepare(`INSERT OR IGNORE INTO purchase_order_items (
        id, purchase_order_id, line_no, kind, fulfillment_type, link_group_id, sku, name,
        ordered_qty, received_qty, activated_qty, unit_cost, note, created_at, updated_at
      ) VALUES (?, ?, 2, 'BOX', 'ATTACHED_BOX', ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`).bind(
        `legacy-po-item-b-${lot.id}`, purchaseId, groupId, String(lot.included_box_sku),
        String(lot.included_box_name || lot.included_box_sku), quantity,
        "Box full-box đang đặt từ dữ liệu cũ", created, created,
      ));
    }
    await database.batch(itemStatements);
  }
  await database.prepare("INSERT INTO app_migrations (key, completed_at, note) VALUES ('incoming_lots_to_po_v2', ?, ?)")
    .bind(now(), `Đã chuyển ${lots.results.length} lô đang đặt cũ thành đơn nhập.`).run();
}

async function migrateReceivedLots(database: D1Database) {
  const migrationKey = "received_lots_to_po_v3";
  const marker = await database.prepare("SELECT key FROM app_migrations WHERE key = ?").bind(migrationKey).first();
  if (marker) return;
  const timestamp = now();
  const eligibleGlasses = "substr(received_at,1,10) >= '2026-01-01' AND received_qty > 0 AND stock_status <> 'INCOMING' AND COALESCE(purchase_order_item_id,'') = ''";
  const eligibleBoxes = `substr(received_at,1,10) >= '2026-01-01' AND received_qty > 0
    AND COALESCE(purchase_order_item_id,'') = '' AND origin_type IN ('box_only','purchased_extra')`;
  const glassCount = await database.prepare(`SELECT COUNT(*) AS value FROM glasses_lots WHERE ${eligibleGlasses}`).first<{ value: number }>();
  const boxCount = await database.prepare(`SELECT COUNT(*) AS value FROM box_lots WHERE ${eligibleBoxes}`).first<{ value: number }>();

  await database.batch([
    database.prepare(`INSERT OR IGNORE INTO purchase_orders (
      id, code, order_date, supplier, status, total_amount, ship_cost, note, created_by, created_at, updated_at
    ) SELECT 'legacy-received-po-g-' || id, 'DN-KINH-CU-' || replace(id,'-',''), substr(received_at,1,10),
      supplier, 'RECEIVED', received_qty * unit_cost, 0,
      'Lịch sử kính đã nhận từ dữ liệu 2026. Không làm thay đổi tồn kho.', 'Dữ liệu 2026',
      COALESCE(NULLIF(created_at,''),?), COALESCE(NULLIF(updated_at,''),NULLIF(created_at,''),?)
      FROM glasses_lots WHERE ${eligibleGlasses}`).bind(timestamp, timestamp),
    database.prepare(`INSERT OR IGNORE INTO purchase_order_items (
      id, purchase_order_id, line_no, kind, fulfillment_type, link_group_id, sku, name,
      ordered_qty, received_qty, activated_qty, unit_cost, note, created_at, updated_at
    ) SELECT 'legacy-received-item-g-' || id, 'legacy-received-po-g-' || id, 1, 'GLASSES',
      CASE WHEN included_box_qty > 0 AND COALESCE(included_box_sku,'') <> '' THEN 'FULL_BOX_GLASS' ELSE 'GLASSES_ONLY' END,
      'legacy-received-group-' || id, sku, name, received_qty, received_qty, received_qty, unit_cost,
      'Đã nhận từ lô lịch sử 2026', COALESCE(NULLIF(created_at,''),?), COALESCE(NULLIF(updated_at,''),NULLIF(created_at,''),?)
      FROM glasses_lots WHERE ${eligibleGlasses}`).bind(timestamp, timestamp),
    database.prepare(`INSERT OR IGNORE INTO purchase_order_items (
      id, purchase_order_id, line_no, kind, fulfillment_type, link_group_id, sku, name,
      ordered_qty, received_qty, activated_qty, unit_cost, note, created_at, updated_at
    ) SELECT 'legacy-received-item-ab-' || id, 'legacy-received-po-g-' || id, 2, 'BOX', 'ATTACHED_BOX',
      'legacy-received-group-' || id, included_box_sku, COALESCE(NULLIF(included_box_name,''),included_box_sku),
      included_box_qty, included_box_qty, included_box_qty, 0, 'Box kèm kính — giá vốn 0đ',
      COALESCE(NULLIF(created_at,''),?), COALESCE(NULLIF(updated_at,''),NULLIF(created_at,''),?)
      FROM glasses_lots WHERE ${eligibleGlasses} AND included_box_qty > 0 AND COALESCE(included_box_sku,'') <> ''`).bind(timestamp, timestamp),
    database.prepare(`INSERT OR IGNORE INTO goods_receipts (
      id, code, purchase_order_id, received_at, note, created_by, created_at
    ) SELECT 'legacy-received-receipt-g-' || id, 'PN-KINH-CU-' || replace(id,'-',''),
      'legacy-received-po-g-' || id, substr(received_at,1,10), 'Phiếu nhận lịch sử 2026', 'Dữ liệu 2026',
      COALESCE(NULLIF(created_at,''),?) FROM glasses_lots WHERE ${eligibleGlasses}`).bind(timestamp),
    database.prepare(`INSERT OR IGNORE INTO goods_receipt_items (
      id, receipt_id, purchase_order_item_id, quantity, good_quantity, defective_quantity,
      box_stock_type, unit_cost, defect_reason, created_at
    ) SELECT 'legacy-received-ri-g-' || id, 'legacy-received-receipt-g-' || id,
      'legacy-received-item-g-' || id, received_qty, received_qty, 0, '', unit_cost, '',
      COALESCE(NULLIF(created_at,''),?) FROM glasses_lots WHERE ${eligibleGlasses}`).bind(timestamp),
    database.prepare(`INSERT OR IGNORE INTO goods_receipt_items (
      id, receipt_id, purchase_order_item_id, quantity, good_quantity, defective_quantity,
      box_stock_type, unit_cost, defect_reason, created_at
    ) SELECT 'legacy-received-ri-ab-' || id, 'legacy-received-receipt-g-' || id,
      'legacy-received-item-ab-' || id, included_box_qty, included_box_qty, 0, 'ATTACHED', 0, '',
      COALESCE(NULLIF(created_at,''),?) FROM glasses_lots
      WHERE ${eligibleGlasses} AND included_box_qty > 0 AND COALESCE(included_box_sku,'') <> ''`).bind(timestamp),
    database.prepare(`UPDATE glasses_lots SET purchase_order_item_id = 'legacy-received-item-g-' || id,
      receipt_id = 'legacy-received-receipt-g-' || id, updated_at = COALESCE(NULLIF(updated_at,''),?)
      WHERE ${eligibleGlasses}`).bind(timestamp),

    database.prepare(`INSERT OR IGNORE INTO purchase_orders (
      id, code, order_date, supplier, status, total_amount, ship_cost, note, created_by, created_at, updated_at
    ) SELECT 'legacy-received-po-b-' || id, 'DN-BOX-CU-' || replace(id,'-',''), substr(received_at,1,10),
      supplier, 'RECEIVED', received_qty * unit_cost, 0,
      'Lịch sử box nhập lẻ đã nhận từ dữ liệu 2026. Không làm thay đổi tồn kho.', 'Dữ liệu 2026',
      COALESCE(NULLIF(created_at,''),?), COALESCE(NULLIF(updated_at,''),NULLIF(created_at,''),?)
      FROM box_lots WHERE ${eligibleBoxes}`).bind(timestamp, timestamp),
    database.prepare(`INSERT OR IGNORE INTO purchase_order_items (
      id, purchase_order_id, line_no, kind, fulfillment_type, link_group_id, sku, name,
      ordered_qty, received_qty, activated_qty, unit_cost, note, created_at, updated_at
    ) SELECT 'legacy-received-item-b-' || id, 'legacy-received-po-b-' || id, 1, 'BOX', 'LOOSE_BOX',
      'legacy-received-group-b-' || id, sku, name, received_qty, received_qty, received_qty, unit_cost,
      'Đã nhận từ lô box lịch sử 2026', COALESCE(NULLIF(created_at,''),?), COALESCE(NULLIF(updated_at,''),NULLIF(created_at,''),?)
      FROM box_lots WHERE ${eligibleBoxes}`).bind(timestamp, timestamp),
    database.prepare(`INSERT OR IGNORE INTO goods_receipts (
      id, code, purchase_order_id, received_at, note, created_by, created_at
    ) SELECT 'legacy-received-receipt-b-' || id, 'PN-BOX-CU-' || replace(id,'-',''),
      'legacy-received-po-b-' || id, substr(received_at,1,10), 'Phiếu nhận box lịch sử 2026', 'Dữ liệu 2026',
      COALESCE(NULLIF(created_at,''),?) FROM box_lots WHERE ${eligibleBoxes}`).bind(timestamp),
    database.prepare(`INSERT OR IGNORE INTO goods_receipt_items (
      id, receipt_id, purchase_order_item_id, quantity, good_quantity, defective_quantity,
      box_stock_type, unit_cost, defect_reason, created_at
    ) SELECT 'legacy-received-ri-b-' || id, 'legacy-received-receipt-b-' || id,
      'legacy-received-item-b-' || id, received_qty, received_qty, 0, 'LOOSE', unit_cost, '',
      COALESCE(NULLIF(created_at,''),?) FROM box_lots WHERE ${eligibleBoxes}`).bind(timestamp),
    database.prepare(`UPDATE box_lots SET purchase_order_item_id = 'legacy-received-item-b-' || id,
      receipt_id = 'legacy-received-receipt-b-' || id, updated_at = COALESCE(NULLIF(updated_at,''),?)
      WHERE ${eligibleBoxes}`).bind(timestamp),
  ]);
  await database.prepare("INSERT INTO app_migrations (key, completed_at, note) VALUES (?, ?, ?)").bind(
    migrationKey, now(), `Đã đưa ${Number(glassCount?.value || 0)} lô kính và ${Number(boxCount?.value || 0)} lô box lịch sử vào Đơn nhập.`,
  ).run();
}

async function backfillLegacyPayments(database: D1Database) {
  const marker = await database.prepare("SELECT key FROM app_migrations WHERE key = 'legacy_deposits_v2'").first();
  if (marker) return;
  const created = now();
  await database.prepare(`INSERT INTO order_payments (
    id, order_id, payment_date, amount, payment_type, method, note, created_by, created_at
  ) SELECT 'legacy-pay-' || id, id, order_date, deposit, 'DEPOSIT', '',
    'Tiền cọc chuyển từ dữ liệu đơn cũ', 'Dữ liệu 2026', ? FROM orders WHERE deposit > 0`).bind(created).run();
  await database.prepare("INSERT INTO app_migrations (key, completed_at, note) VALUES ('legacy_deposits_v2', ?, 'Đã chuyển tiền cọc cũ.')")
    .bind(created).run();
}

async function backfillLegacyReservations(database: D1Database) {
  const marker = await database.prepare("SELECT key FROM app_migrations WHERE key = 'legacy_process_reservations_v2'").first();
  if (marker) return;
  const rows = await database.prepare(`SELECT o.id, o.code, i.id AS item_id, i.line_type, i.sku, i.name, i.box_sku,
    i.source_supplier, i.box_source_supplier, o.source_supplier AS order_source,
    i.quantity, i.unit_price FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.workflow_status = 'DEPOSIT_RECEIVED'
      AND NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.order_id = o.id)
    ORDER BY o.order_date, o.created_at LIMIT 500`).all<Record<string, string | number | null>>();
  let reserved = 0;
  let warnings = 0;
  for (const row of rows.results) {
    try {
      const plans = await planReservations(database, String(row.id), [{
        id: String(row.item_id), type: String(row.line_type) as SalesLineInput["type"],
        sku: String(row.sku), name: String(row.name || row.sku), boxSku: String(row.box_sku || ""),
        sourceSupplier: String(row.source_supplier || ""), boxSourceSupplier: String(row.box_source_supplier || ""),
        quantity: Number(row.quantity), unitPrice: Number(row.unit_price),
      }], "", String(row.order_source || ""));
      await saveReservations(database, plans, String(row.id), "Dữ liệu 2026", "Giữ kho từ đơn PROCESS cũ");
      reserved += 1;
    } catch (error) {
      await database.prepare(`INSERT INTO order_events (
        id, order_id, event_type, reason, actor, created_at
      ) VALUES (?, ?, 'RESERVATION_WARNING', ?, 'Dữ liệu 2026', ?)`).bind(
        crypto.randomUUID(), String(row.id), error instanceof Error ? error.message : "Không đủ tồn để giữ hàng", now(),
      ).run();
      warnings += 1;
    }
  }
  await database.prepare("INSERT INTO app_migrations (key, completed_at, note) VALUES ('legacy_process_reservations_v2', ?, ?)")
    .bind(now(), `Giữ kho ${reserved} đơn cũ; ${warnings} đơn cần kiểm tra.`).run();
}

async function customerRecord(nameValue: unknown, phoneValue: unknown, addressValue: unknown) {
  const displayName = text(nameValue, "tên khách hàng");
  const phone = optionalText(phoneValue);
  const phoneNormalized = phone.replace(/\D/g, "");
  const address = optionalText(addressValue);
  const normalizedName = displayName.normalize("NFKC").toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");
  const key = phoneNormalized.length >= 8 ? `phone:${phoneNormalized}` : `fallback:${normalizedName}|${address.toLocaleLowerCase("vi-VN")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { id: `cust-${hash.slice(0, 16)}`, key, displayName, phone, phoneNormalized, address };
}

function upsertCustomer(database: D1Database, customer: Awaited<ReturnType<typeof customerRecord>>, timestamp: string) {
  return database.prepare(`INSERT INTO customers (
    id, customer_key, display_name, phone, phone_normalized, primary_address, source, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'app_v2', ?, ?)
  ON CONFLICT(customer_key) DO UPDATE SET display_name = excluded.display_name,
    phone = CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE customers.phone END,
    phone_normalized = CASE WHEN excluded.phone_normalized <> '' THEN excluded.phone_normalized ELSE customers.phone_normalized END,
    primary_address = CASE WHEN excluded.primary_address <> '' THEN excluded.primary_address ELSE customers.primary_address END,
    updated_at = excluded.updated_at`).bind(
      customer.id, customer.key, customer.displayName, customer.phone, customer.phoneNormalized,
      customer.address, timestamp, timestamp,
    );
}

function movementStatement(database: D1Database, input: {
  kind: string; bucket: string; sku: string; name?: string; physical?: number; reserved?: number;
  type: string; referenceType: string; referenceId: string; lotId?: string; reason?: string; actor?: string; occurredAt?: string;
}) {
  return database.prepare(`INSERT INTO inventory_movements (
    id, occurred_at, item_kind, bucket, sku, name, physical_delta, reserved_delta,
    movement_type, reference_type, reference_id, lot_id, reason, actor
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), input.occurredAt || now(), input.kind, input.bucket, input.sku,
    input.name || input.sku, input.physical || 0, input.reserved || 0, input.type,
    input.referenceType, input.referenceId, input.lotId || "", input.reason || "", actorName(input.actor),
  );
}

async function upsertProduct(database: D1Database, input: {
  kind: "GLASSES" | "BOX"; sku: string; name: string; supplier?: string; unitCost?: number;
  compatibleBoxSku?: string; brand?: string; model?: string; color?: string; suggestedSalePrice?: number;
}, timestamp: string) {
  await database.prepare(`INSERT INTO products (
    id, kind, sku, name, brand, model, color, compatible_box_sku, source_supplier,
    last_purchase_price, suggested_sale_price, active, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  ON CONFLICT(kind, sku) DO UPDATE SET name = excluded.name,
    brand = CASE WHEN excluded.brand <> '' THEN excluded.brand ELSE products.brand END,
    model = CASE WHEN excluded.model <> '' THEN excluded.model ELSE products.model END,
    color = CASE WHEN excluded.color <> '' THEN excluded.color ELSE products.color END,
    compatible_box_sku = CASE WHEN excluded.compatible_box_sku <> '' THEN excluded.compatible_box_sku ELSE products.compatible_box_sku END,
    source_supplier = CASE WHEN excluded.source_supplier <> '' THEN excluded.source_supplier ELSE products.source_supplier END,
    last_purchase_price = CASE WHEN excluded.last_purchase_price > 0 THEN excluded.last_purchase_price ELSE products.last_purchase_price END,
    suggested_sale_price = CASE WHEN excluded.suggested_sale_price > 0 THEN excluded.suggested_sale_price ELSE products.suggested_sale_price END,
    active = 1, updated_at = excluded.updated_at`).bind(
      crypto.randomUUID(), input.kind, input.sku, input.name, input.brand || "", input.model || "", input.color || "",
      input.compatibleBoxSku || "", input.supplier || "", input.unitCost || 0, input.suggestedSalePrice || 0,
      timestamp, timestamp,
    ).run();
}

type ExpandedPurchaseItem = {
  id: string; lineNo: number; kind: "GLASSES" | "BOX"; fulfillment: string; group: string;
  sku: string; name: string; qty: number; cost: number; sourceSupplier: string; note: string;
};

function purchaseSourceSummary(sources: string[]) {
  return Array.from(new Set(sources.map((source) => source.trim()).filter(Boolean))).join(", ") || "Chưa xác định";
}

async function expandPurchaseLines(database: D1Database, rawLines: PurchaseLineInput[], timestamp: string, fallbackSupplier = "") {
  if (!rawLines.length) throw new Error("Đơn nhập phải có ít nhất một dòng sản phẩm.");
  const expanded: ExpandedPurchaseItem[] = [];
  let lineNo = 1;
  let total = 0;
  for (const [index, raw] of rawLines.entries()) {
    const quantity = integer(raw.quantity, "Số lượng đặt", 1);
    const unitCost = integer(raw.unitCost, "Giá nhập");
    const itemSku = normalizedSku(raw.sku);
    const itemName = text(raw.name, "tên sản phẩm");
    const sourceSupplier = text(raw.sourceSupplier || fallbackSupplier, `nguồn nhập dòng ${index + 1}`);
    const group = crypto.randomUUID();
    if (raw.type === "FULL_BOX") {
      const boxSku = normalizedSku(raw.boxSku, "mã box đi kèm");
      const boxName = text(raw.boxName, "tên box đi kèm");
      expanded.push({ id: crypto.randomUUID(), lineNo: lineNo++, kind: "GLASSES", fulfillment: "FULL_BOX_GLASS", group, sku: itemSku, name: itemName, qty: quantity, cost: unitCost, sourceSupplier, note: optionalText(raw.note) });
      expanded.push({ id: crypto.randomUUID(), lineNo: lineNo++, kind: "BOX", fulfillment: "ATTACHED_BOX", group, sku: boxSku, name: boxName, qty: quantity, cost: 0, sourceSupplier, note: "Box kèm kính — giá vốn 0đ" });
      await upsertProduct(database, { kind: "GLASSES", sku: itemSku, name: itemName, supplier: sourceSupplier, unitCost, compatibleBoxSku: boxSku }, timestamp);
      await upsertProduct(database, { kind: "BOX", sku: boxSku, name: boxName, supplier: sourceSupplier, unitCost: 0 }, timestamp);
    } else if (raw.type === "GLASSES_ONLY") {
      expanded.push({ id: crypto.randomUUID(), lineNo: lineNo++, kind: "GLASSES", fulfillment: "GLASSES_ONLY", group, sku: itemSku, name: itemName, qty: quantity, cost: unitCost, sourceSupplier, note: optionalText(raw.note) });
      await upsertProduct(database, { kind: "GLASSES", sku: itemSku, name: itemName, supplier: sourceSupplier, unitCost }, timestamp);
    } else if (raw.type === "LOOSE_BOX") {
      expanded.push({ id: crypto.randomUUID(), lineNo: lineNo++, kind: "BOX", fulfillment: "LOOSE_BOX", group, sku: itemSku, name: itemName, qty: quantity, cost: unitCost, sourceSupplier, note: optionalText(raw.note) });
      await upsertProduct(database, { kind: "BOX", sku: itemSku, name: itemName, supplier: sourceSupplier, unitCost }, timestamp);
    } else {
      throw new Error("Loại sản phẩm trong đơn nhập không hợp lệ.");
    }
    total += quantity * unitCost;
  }
  return { expanded, total, supplier: purchaseSourceSummary(expanded.map((item) => item.sourceSupplier)) };
}

export async function createPurchaseOrder(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const orderDate = validDate(input.orderDate || today(), "ngày đặt hàng");
  const status = input.status === "DRAFT" ? "DRAFT" : "ORDERED";
  const shipCost = integer(input.shipCost, "Chi phí ship");
  const rawLines = Array.isArray(input.lines) ? input.lines as PurchaseLineInput[] : [];
  const timestamp = now();
  const purchaseId = crypto.randomUUID();
  const purchaseCode = code("DN");
  const statements: D1PreparedStatement[] = [];
  const { expanded, total, supplier } = await expandPurchaseLines(database, rawLines, timestamp, optionalText(input.supplier));
  statements.push(database.prepare(`INSERT INTO purchase_orders (
    id, code, order_date, supplier, status, total_amount, ship_cost, note, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    purchaseId, purchaseCode, orderDate, supplier, status, total, shipCost, optionalText(input.note), actorName(actor), timestamp, timestamp,
  ));
  for (const item of expanded) {
    statements.push(database.prepare(`INSERT INTO purchase_order_items (
      id, purchase_order_id, line_no, kind, fulfillment_type, link_group_id, sku, name,
      ordered_qty, received_qty, activated_qty, unit_cost, source_supplier,
      origin_purchase_order_id, origin_purchase_order_item_id, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, '', '', ?, ?, ?)`).bind(
      item.id, purchaseId, item.lineNo, item.kind, item.fulfillment, item.group, item.sku,
      item.name, item.qty, item.cost, item.sourceSupplier, item.note, timestamp, timestamp,
    ));
  }
  const deposit = integer(input.deposit, "Tiền cọc nhà cung cấp");
  if (deposit > total + shipCost) throw new Error("Tiền cọc nhà cung cấp không thể lớn hơn tổng tiền hàng và phí ship.");
  if (deposit > 0) {
    statements.push(database.prepare(`INSERT INTO supplier_payments (
      id, purchase_order_id, payment_date, amount, payment_type, method, note, created_by, created_at
    ) VALUES (?, ?, ?, ?, 'DEPOSIT', ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), purchaseId, orderDate, deposit, optionalText(input.paymentMethod),
      "Tiền cọc khi tạo đơn nhập", actorName(actor), timestamp,
    ));
  }
  await database.batch(statements);
  return { ok: true, id: purchaseId, code: purchaseCode };
}

export async function updatePurchaseOrder(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const id = text(input.id, "mã đơn nhập");
  const purchase = await database.prepare("SELECT * FROM purchase_orders WHERE id = ?").bind(id).first<Record<string, string | number>>();
  if (!purchase) throw new Error("Không tìm thấy đơn nhập.");
  if (String(purchase.merged_into_order_id || "")) throw new Error("Đơn nháp này đã được gom vào đơn đặt tổng nên không thể sửa riêng.");
  const received = await database.prepare("SELECT COALESCE(SUM(received_qty), 0) AS value FROM purchase_order_items WHERE purchase_order_id = ?")
    .bind(id).first<{ value: number }>();
  const consolidatedOrigins = await database.prepare("SELECT COUNT(DISTINCT origin_purchase_order_id) AS value FROM purchase_order_items WHERE purchase_order_id = ? AND TRIM(origin_purchase_order_id) <> ''")
    .bind(id).first<{ value: number }>();
  let supplier = String(purchase.supplier || "Chưa xác định");
  const orderDate = validDate(input.orderDate ?? purchase.order_date, "ngày đặt hàng");
  const requestedStatus = String(input.status ?? purchase.status);
  if (!['DRAFT','ORDERED','PARTIAL','RECEIVED','CANCELLED'].includes(requestedStatus)) throw new Error("Trạng thái đơn nhập không hợp lệ.");
  if (Number(received?.value || 0) > 0 && requestedStatus === "CANCELLED") throw new Error("Đơn đã nhận hàng; không thể hủy trực tiếp. Hãy điều chỉnh/hoàn kho trước.");
  const timestamp = now();
  const updateStatements: D1PreparedStatement[] = [];
  let totalAmount = Number(purchase.total_amount);
  const shipCost = integer(input.shipCost ?? purchase.ship_cost, "Chi phí ship");
  if (Number(consolidatedOrigins?.value || 0) > 0 && Array.isArray(input.lines)) {
    throw new Error("Đơn đặt tổng đang liên kết với các đơn nháp nguồn nên không thể thay danh sách sản phẩm.");
  }
  if (Number(received?.value || 0) === 0 && Array.isArray(input.lines)) {
    const rawLines = input.lines as PurchaseLineInput[];
    const expandedResult = await expandPurchaseLines(database, rawLines, timestamp, optionalText(input.supplier));
    const expanded = expandedResult.expanded;
    totalAmount = expandedResult.total;
    supplier = expandedResult.supplier;
    const paid = await database.prepare("SELECT COALESCE(SUM(amount),0) AS value FROM supplier_payments WHERE purchase_order_id = ?")
      .bind(id).first<{ value: number }>();
    if (Number(paid?.value || 0) > totalAmount + shipCost) throw new Error("Tổng chi mới thấp hơn số đã thanh toán cho nhà cung cấp.");
    updateStatements.push(database.prepare("DELETE FROM purchase_order_items WHERE purchase_order_id = ?").bind(id));
    for (const item of expanded) {
      updateStatements.push(database.prepare(`INSERT INTO purchase_order_items (
        id, purchase_order_id, line_no, kind, fulfillment_type, link_group_id, sku, name,
        ordered_qty, received_qty, activated_qty, unit_cost, source_supplier,
        origin_purchase_order_id, origin_purchase_order_item_id, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, '', '', ?, ?, ?)`).bind(
        item.id, id, item.lineNo, item.kind, item.fulfillment, item.group, item.sku, item.name,
        item.qty, item.cost, item.sourceSupplier, item.note, timestamp, timestamp,
      ));
    }
  } else {
    const itemSources = await database.prepare("SELECT source_supplier FROM purchase_order_items WHERE purchase_order_id = ?")
      .bind(id).all<{ source_supplier: string }>();
    supplier = purchaseSourceSummary(itemSources.results.map((item) => String(item.source_supplier || purchase.supplier || "")));
  }
  updateStatements.push(database.prepare(`UPDATE purchase_orders SET order_date = ?, supplier = ?, status = ?, total_amount = ?, ship_cost = ?, note = ?,
    updated_at = ? WHERE id = ?`).bind(orderDate, supplier, requestedStatus, totalAmount, shipCost, optionalText(input.note ?? purchase.note), timestamp, id));
  await database.batch(updateStatements);
  await database.prepare(`INSERT INTO inventory_movements (
    id, occurred_at, item_kind, bucket, sku, name, movement_type, reference_type, reference_id, reason, actor
  ) VALUES (?, ?, 'SYSTEM', 'PURCHASE_ORDER', ?, ?, 'PURCHASE_ORDER_EDIT', 'PURCHASE_ORDER', ?, ?, ?)`).bind(
    crypto.randomUUID(), now(), String(purchase.code), String(purchase.code), id, "Cập nhật thông tin đơn nhập", actorName(actor),
  ).run();
  return { ok: true };
}

export async function consolidatePurchaseOrders(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const purchaseOrderIds = Array.from(new Set((Array.isArray(input.purchaseOrderIds) ? input.purchaseOrderIds : [])
    .map((id) => optionalText(id)).filter(Boolean)));
  if (purchaseOrderIds.length < 2) throw new Error("Hãy chọn ít nhất 2 đơn nháp để gom.");
  const placeholders = purchaseOrderIds.map(() => "?").join(",");
  const selectedOrders = await database.prepare(`SELECT * FROM purchase_orders WHERE id IN (${placeholders})
    ORDER BY order_date, created_at, code`).bind(...purchaseOrderIds).all<Record<string, string | number>>();
  if (selectedOrders.results.length !== purchaseOrderIds.length) throw new Error("Có đơn nháp không còn tồn tại. Hãy tải lại danh sách.");
  for (const order of selectedOrders.results) {
    if (String(order.status) !== "DRAFT") throw new Error(`${order.code}: chỉ đơn Nháp mới được gom.`);
    if (String(order.merged_into_order_id || "")) throw new Error(`${order.code}: đơn này đã được gom trước đó.`);
  }
  const selectedItems = await database.prepare(`SELECT * FROM purchase_order_items WHERE purchase_order_id IN (${placeholders})
    ORDER BY purchase_order_id, line_no`).bind(...purchaseOrderIds).all<Record<string, string | number>>();
  if (!selectedItems.results.length) throw new Error("Các đơn nháp đã chọn chưa có sản phẩm.");
  if (selectedItems.results.some((item) => Number(item.received_qty || 0) > 0)) {
    throw new Error("Có đơn nháp đã nhận hàng nên không thể gom.");
  }
  const paid = await database.prepare(`SELECT COALESCE(SUM(amount),0) AS value FROM supplier_payments
    WHERE purchase_order_id IN (${placeholders})`).bind(...purchaseOrderIds).first<{ value: number }>();
  if (Number(paid?.value || 0) !== 0) {
    throw new Error("Có đơn nháp đã phát sinh thanh toán nhà cung cấp. Hãy xử lý khoản thanh toán trước khi gom.");
  }

  const timestamp = now();
  const purchaseId = crypto.randomUUID();
  const purchaseCode = code("DN");
  const orderDate = validDate(input.orderDate || today(), "ngày đặt hàng tổng");
  const orderById = new Map(selectedOrders.results.map((order) => [String(order.id), order]));
  const sources = selectedItems.results.map((item) => String(item.source_supplier || orderById.get(String(item.purchase_order_id))?.supplier || ""));
  const supplier = purchaseSourceSummary(sources);
  const total = selectedItems.results.reduce((sum, item) => sum + Number(item.ordered_qty || 0) * Number(item.unit_cost || 0), 0);
  const defaultShipCost = selectedOrders.results.reduce((sum, order) => sum + Number(order.ship_cost || 0), 0);
  const shipCost = input.shipCost === undefined ? defaultShipCost : integer(input.shipCost, "Chi phí ship");
  const deposit = integer(input.deposit, "Tiền cọc nhà cung cấp");
  if (deposit > total + shipCost) throw new Error("Tiền cọc nhà cung cấp không thể lớn hơn tổng tiền hàng và phí ship.");
  const sourceCodes = selectedOrders.results.map((order) => String(order.code));
  const customNote = optionalText(input.note);
  const note = `${customNote ? `${customNote} · ` : ""}Gom từ ${sourceCodes.join(", ")}`;
  const statements: D1PreparedStatement[] = [database.prepare(`INSERT INTO purchase_orders (
    id, code, order_date, supplier, status, total_amount, ship_cost, note, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'ORDERED', ?, ?, ?, ?, ?, ?)`).bind(
    purchaseId, purchaseCode, orderDate, supplier, total, shipCost, note, actorName(actor), timestamp, timestamp,
  )];
  const groupMap = new Map<string, string>();
  let lineNo = 1;
  for (const sourceOrder of selectedOrders.results) {
    const orderItems = selectedItems.results.filter((item) => String(item.purchase_order_id) === String(sourceOrder.id));
    for (const item of orderItems) {
      const originalGroup = String(item.link_group_id || item.id);
      const groupKey = `${sourceOrder.id}:${originalGroup}`;
      if (!groupMap.has(groupKey)) groupMap.set(groupKey, crypto.randomUUID());
      const sourceSupplier = String(item.source_supplier || sourceOrder.supplier || "").trim();
      statements.push(database.prepare(`INSERT INTO purchase_order_items (
        id, purchase_order_id, line_no, kind, fulfillment_type, link_group_id, sku, name,
        ordered_qty, received_qty, activated_qty, unit_cost, source_supplier,
        origin_purchase_order_id, origin_purchase_order_item_id, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), purchaseId, lineNo++, String(item.kind), String(item.fulfillment_type), groupMap.get(groupKey),
        String(item.sku), String(item.name), Number(item.ordered_qty), Number(item.unit_cost), sourceSupplier,
        String(sourceOrder.id), String(item.id), String(item.note || ""), timestamp, timestamp,
      ));
    }
    statements.push(database.prepare(`UPDATE purchase_orders SET merged_into_order_id = ?, merged_at = ?, updated_at = ?
      WHERE id = ? AND status = 'DRAFT' AND merged_into_order_id = ''`).bind(purchaseId, timestamp, timestamp, String(sourceOrder.id)));
    statements.push(database.prepare(`INSERT INTO inventory_movements (
      id, occurred_at, item_kind, bucket, sku, name, movement_type, reference_type, reference_id, reason, actor
    ) VALUES (?, ?, 'SYSTEM', 'PURCHASE_ORDER', ?, ?, 'PURCHASE_ORDER_CONSOLIDATED', 'PURCHASE_ORDER', ?, ?, ?)`).bind(
      crypto.randomUUID(), timestamp, String(sourceOrder.code), String(sourceOrder.code), String(sourceOrder.id),
      `Đã gom vào ${purchaseCode}`, actorName(actor),
    ));
  }
  if (deposit > 0) {
    statements.push(database.prepare(`INSERT INTO supplier_payments (
      id, purchase_order_id, payment_date, amount, payment_type, method, note, created_by, created_at
    ) VALUES (?, ?, ?, ?, 'DEPOSIT', ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), purchaseId, orderDate, deposit, optionalText(input.paymentMethod),
      "Tiền cọc khi gom đơn nháp", actorName(actor), timestamp,
    ));
  }
  await database.batch(statements);
  return { ok: true, id: purchaseId, code: purchaseCode, mergedCount: selectedOrders.results.length };
}

export async function addSupplierPayment(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const purchaseOrderId = text(input.purchaseOrderId, "đơn nhập");
  const purchase = await database.prepare("SELECT id, total_amount, merged_into_order_id FROM purchase_orders WHERE id = ?").bind(purchaseOrderId).first<{ id: string; total_amount: number; merged_into_order_id: string }>();
  if (!purchase) throw new Error("Không tìm thấy đơn nhập.");
  if (purchase.merged_into_order_id) throw new Error("Đơn nháp này đã được gom; hãy thanh toán trên đơn đặt tổng.");
  const paymentType = input.paymentType === "REFUND" ? "REFUND" : input.paymentType === "DEPOSIT" ? "DEPOSIT" : "PAYMENT";
  const rawAmount = integer(input.amount, "Số tiền", 1);
  const amount = paymentType === "REFUND" ? -rawAmount : rawAmount;
  await database.prepare(`INSERT INTO supplier_payments (
    id, purchase_order_id, payment_date, amount, payment_type, method, note, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), purchaseOrderId, validDate(input.paymentDate || today(), "ngày thanh toán"), amount,
    paymentType, optionalText(input.method), optionalText(input.note), actorName(actor), now(),
  ).run();
  return { ok: true };
}

async function reconcileAttachedBoxes(database: D1Database, purchaseOrderId: string, groupId: string, receiptId: string, actor?: string) {
  const items = await database.prepare(`SELECT * FROM purchase_order_items
    WHERE purchase_order_id = ? AND link_group_id = ? ORDER BY line_no`).bind(purchaseOrderId, groupId)
    .all<Record<string, string | number>>();
  const glass = items.results.find((item) => item.fulfillment_type === "FULL_BOX_GLASS");
  const box = items.results.find((item) => item.fulfillment_type === "ATTACHED_BOX");
  if (!glass || !box) return;
  const [glassGood, attachedBoxGood] = await Promise.all([
    database.prepare("SELECT COALESCE(SUM(good_quantity),0) AS value FROM goods_receipt_items WHERE purchase_order_item_id = ?")
      .bind(String(glass.id)).first<{ value: number }>(),
    database.prepare("SELECT COALESCE(SUM(good_quantity),0) AS value FROM goods_receipt_items WHERE purchase_order_item_id = ? AND box_stock_type = 'ATTACHED'")
      .bind(String(box.id)).first<{ value: number }>(),
  ]);
  const target = Math.min(Number(glassGood?.value || 0), Number(attachedBoxGood?.value || 0));
  let remaining = target - Number(box.activated_qty || 0);
  if (remaining <= 0) return;
  const lots = await database.prepare(`SELECT id, received_qty, included_box_qty, included_box_remaining
    FROM glasses_lots WHERE purchase_order_item_id = ? AND stock_status = 'AVAILABLE'
    ORDER BY received_at, created_at, id`).bind(String(glass.id)).all<Record<string, string | number>>();
  const statements: D1PreparedStatement[] = [];
  let activated = 0;
  for (const lot of lots.results) {
    if (remaining <= 0) break;
    const capacity = Number(lot.received_qty) - Number(lot.included_box_qty || 0);
    const qty = Math.min(capacity, remaining);
    if (qty <= 0) continue;
    statements.push(database.prepare(`UPDATE glasses_lots SET included_box_sku = ?, included_box_name = ?,
      included_box_qty = included_box_qty + ?, included_box_remaining = included_box_remaining + ?, updated_at = ?
      WHERE id = ?`).bind(String(box.sku), String(box.name), qty, qty, now(), String(lot.id)));
    statements.push(movementStatement(database, {
      kind: "BOX", bucket: "ATTACHED_BOX", sku: String(box.sku), name: String(box.name), physical: qty,
      type: "ATTACHED_BOX_ACTIVATED", referenceType: "GOODS_RECEIPT", referenceId: receiptId,
      lotId: String(lot.id), reason: "Box kèm đã ghép với kính đã nhận", actor,
    }));
    activated += qty;
    remaining -= qty;
  }
  if (activated > 0) {
    statements.push(database.prepare("UPDATE purchase_order_items SET activated_qty = activated_qty + ?, updated_at = ? WHERE id = ?")
      .bind(activated, now(), String(box.id)));
    await database.batch(statements);
  }
}

export async function receivePurchaseOrder(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const purchaseOrderId = text(input.purchaseOrderId, "đơn nhập");
  const purchase = await database.prepare("SELECT * FROM purchase_orders WHERE id = ?").bind(purchaseOrderId)
    .first<Record<string, string | number>>();
  if (!purchase) throw new Error("Không tìm thấy đơn nhập.");
  if (purchase.status === "CANCELLED") throw new Error("Đơn nhập đã hủy nên không thể nhận hàng.");
  if (String(purchase.merged_into_order_id || "")) throw new Error("Đơn nháp này đã được gom; hãy nhận hàng trên đơn đặt tổng.");
  const rawItems = Array.isArray(input.items) ? input.items as Array<{
    itemId: string; quantity?: number; goodQuantity?: number; defectiveQuantity?: number;
    boxStockType?: "LOOSE" | "ATTACHED"; unitCost?: number; defectReason?: string;
  }> : [];
  const receiveItems = rawItems.filter((item) => Number(item.goodQuantity ?? item.quantity ?? 0) + Number(item.defectiveQuantity || 0) > 0);
  if (!receiveItems.length) throw new Error("Hãy nhập số lượng thực nhận cho ít nhất một dòng.");
  const timestamp = now();
  const receiptId = crypto.randomUUID();
  const receiptCode = code("PN");
  const receivedAt = validDate(input.receivedAt || today(), "ngày nhận hàng");
  const statements: D1PreparedStatement[] = [database.prepare(`INSERT INTO goods_receipts (
    id, code, purchase_order_id, received_at, note, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
    receiptId, receiptCode, purchaseOrderId, receivedAt, optionalText(input.note), actorName(actor), timestamp,
  )];
  const touchedGroups = new Set<string>();
  const looseBoxProducts: Array<{ sku: string; name: string; cost: number; sourceSupplier: string }> = [];
  for (const receive of receiveItems) {
    const item = await database.prepare("SELECT * FROM purchase_order_items WHERE id = ? AND purchase_order_id = ?")
      .bind(receive.itemId, purchaseOrderId).first<Record<string, string | number>>();
    if (!item) throw new Error("Có dòng nhận hàng không thuộc đơn nhập này.");
    const sourceSupplier = String(item.source_supplier || purchase.supplier || "").trim();
    const goodQuantity = integer(receive.goodQuantity ?? receive.quantity ?? 0, "Số lượng hàng tốt");
    const defectiveQuantity = integer(receive.defectiveQuantity ?? 0, "Số lượng hàng lỗi");
    const quantity = goodQuantity + defectiveQuantity;
    if (quantity <= 0) continue;
    const pending = Number(item.ordered_qty) - Number(item.received_qty);
    if (quantity > pending) throw new Error(`${item.name}: chỉ còn chờ ${pending}, không thể nhận ${quantity}.`);
    const boxStockType = item.kind === "BOX"
      ? receive.boxStockType === "LOOSE" ? "LOOSE" : receive.boxStockType === "ATTACHED" ? "ATTACHED"
        : item.fulfillment_type === "LOOSE_BOX" ? "LOOSE" : "ATTACHED"
      : "";
    if (boxStockType === "ATTACHED" && item.fulfillment_type !== "ATTACHED_BOX") {
      throw new Error(`${item.name}: dòng box này không có kính liên kết nên phải nhận là box lẻ.`);
    }
    const receiptUnitCost = boxStockType === "LOOSE"
      ? integer(receive.unitCost ?? item.unit_cost, "Giá nhập box lẻ")
      : Number(item.unit_cost || 0);
    const defectReason = defectiveQuantity > 0 ? text(receive.defectReason, `lý do lỗi của ${item.name}`) : "";
    statements.push(database.prepare(`INSERT INTO goods_receipt_items (
      id, receipt_id, purchase_order_item_id, quantity, good_quantity, defective_quantity,
      box_stock_type, unit_cost, defect_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), receiptId, String(item.id), quantity, goodQuantity, defectiveQuantity,
      boxStockType, receiptUnitCost, defectReason, timestamp,
    ));
    statements.push(database.prepare("UPDATE purchase_order_items SET received_qty = received_qty + ?, updated_at = ? WHERE id = ?")
      .bind(quantity, timestamp, String(item.id)));

    if (item.kind === "GLASSES" && goodQuantity > 0) {
      const lotId = crypto.randomUUID();
      statements.push(database.prepare(`INSERT INTO glasses_lots (
        id, received_at, supplier, sku, name, received_qty, remaining_qty, unit_cost,
        included_box_qty, included_box_remaining, stock_status, source_key, note, created_at,
        purchase_order_item_id, receipt_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'AVAILABLE', ?, ?, ?, ?, ?, ?)`).bind(
        lotId, receivedAt, sourceSupplier, String(item.sku), String(item.name), goodQuantity, goodQuantity,
        Number(item.unit_cost), String(purchase.code), optionalText(input.note), timestamp, String(item.id), receiptId, timestamp,
      ));
      statements.push(movementStatement(database, {
        kind: "GLASSES", bucket: "GLASSES", sku: String(item.sku), name: String(item.name), physical: goodQuantity,
        type: "PURCHASE_RECEIPT", referenceType: "GOODS_RECEIPT", referenceId: receiptId, lotId,
        reason: `Nhận từ ${purchase.code}`, actor, occurredAt: timestamp,
      }));
    } else if (item.kind === "BOX" && boxStockType === "LOOSE" && goodQuantity > 0) {
      const lotId = crypto.randomUUID();
      statements.push(database.prepare(`INSERT INTO box_lots (
        id, received_at, supplier, sku, name, origin_type, received_qty, remaining_qty,
        unit_cost, note, created_at, purchase_order_item_id, receipt_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'box_only', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        lotId, receivedAt, sourceSupplier, String(item.sku), String(item.name), goodQuantity, goodQuantity,
        receiptUnitCost, optionalText(input.note), timestamp, String(item.id), receiptId, timestamp,
      ));
      statements.push(movementStatement(database, {
        kind: "BOX", bucket: "LOOSE_BOX", sku: String(item.sku), name: String(item.name), physical: goodQuantity,
        type: "PURCHASE_RECEIPT", referenceType: "GOODS_RECEIPT", referenceId: receiptId, lotId,
        reason: `Nhận box lẻ từ ${purchase.code}`, actor, occurredAt: timestamp,
      }));
      looseBoxProducts.push({ sku: String(item.sku), name: String(item.name), cost: receiptUnitCost, sourceSupplier });
    } else if (item.fulfillment_type === "ATTACHED_BOX" && goodQuantity > 0) {
      statements.push(movementStatement(database, {
        kind: "BOX", bucket: "ATTACHED_PENDING", sku: String(item.sku), name: String(item.name), physical: 0,
        type: "ATTACHED_BOX_RECEIVED_PENDING", referenceType: "GOODS_RECEIPT", referenceId: receiptId,
        reason: "Box full-box đã về nhưng chỉ khả dụng khi ghép với kính", actor, occurredAt: timestamp,
      }));
    }
    if (defectiveQuantity > 0) {
      statements.push(database.prepare(`INSERT INTO defective_products (
        id, received_at, kind, sku, name, quantity, unit_cost, supplier, purchase_order_id,
        purchase_order_item_id, receipt_id, defect_reason, status, note, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?, ?, ?)`).bind(
        crypto.randomUUID(), receivedAt, String(item.kind), String(item.sku), String(item.name), defectiveQuantity,
        receiptUnitCost, sourceSupplier, purchaseOrderId, String(item.id), receiptId,
        defectReason, optionalText(input.note), actorName(actor), timestamp,
      ));
      statements.push(movementStatement(database, {
        kind: String(item.kind), bucket: "DEFECTIVE", sku: String(item.sku), name: String(item.name),
        type: "DEFECT_RECEIVED", referenceType: "GOODS_RECEIPT", referenceId: receiptId,
        reason: defectReason, actor, occurredAt: timestamp,
      }));
    }
    if (String(item.link_group_id)) touchedGroups.add(String(item.link_group_id));
  }
  await database.batch(statements);
  for (const product of looseBoxProducts) {
    await upsertProduct(database, { kind: "BOX", sku: product.sku, name: product.name, supplier: product.sourceSupplier, unitCost: product.cost }, timestamp);
  }
  for (const group of touchedGroups) await reconcileAttachedBoxes(database, purchaseOrderId, group, receiptId, actor);
  const totals = await database.prepare(`SELECT SUM(ordered_qty) AS ordered_qty, SUM(received_qty) AS received_qty
    FROM purchase_order_items WHERE purchase_order_id = ?`).bind(purchaseOrderId).first<{ ordered_qty: number; received_qty: number }>();
  const newStatus = Number(totals?.received_qty || 0) === 0 ? "ORDERED"
    : Number(totals?.received_qty || 0) >= Number(totals?.ordered_qty || 0) ? "RECEIVED" : "PARTIAL";
  await database.prepare("UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?")
    .bind(newStatus, now(), purchaseOrderId).run();
  return { ok: true, receiptId, code: receiptCode, status: newStatus };
}

function workflow(value: unknown): WorkflowStatus {
  const result = String(value || "DRAFT") as WorkflowStatus;
  if (!["DRAFT","WAITING_STOCK","DEPOSIT_RECEIVED","ORDERING_SUPPLIER","GOODS_RECEIVED","READY_TO_SHIP","SHIPPING","COMPLETED","CANCELLED","RETURNED","REFUNDED"].includes(result)) {
    throw new Error("Trạng thái đơn hàng không hợp lệ.");
  }
  return result;
}

async function planReservations(
  database: D1Database,
  orderId: string,
  lines: Array<SalesLineInput & { id: string }>,
  excludeOrderId = "",
  fallbackSourceSupplier = "",
) {
  const plans: ReservationPlan[] = [];
  const planned = new Map<string, number>();
  const add = (plan: ReservationPlan) => {
    plans.push(plan);
    const key = `${plan.bucket}:${plan.lotId}`;
    planned.set(key, (planned.get(key) || 0) + plan.quantity);
  };
  for (const line of lines) {
    const quantity = integer(line.quantity, "Số lượng bán", 1);
    const itemSku = normalizedSku(line.sku);
    const requestedSource = optionalText(line.sourceSupplier) || optionalText(fallbackSourceSupplier);
    if (line.type !== "BOX_ONLY") {
      const requestedAttachedSku = line.type === "GLASSES_WITH_ATTACHED" ? normalizedSku(line.boxSku, "box kèm") : "";
      const lots = await database.prepare(`SELECT g.id, g.sku, g.name, g.unit_cost, g.remaining_qty,
        g.included_box_remaining,
        COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r
          WHERE r.lot_kind = 'GLASSES' AND r.lot_id = g.id AND r.bucket = 'GLASSES'
            AND r.status = 'RESERVED' AND r.order_id <> ?), 0) AS reserved_glasses,
        COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r
          WHERE r.lot_kind = 'GLASSES' AND r.lot_id = g.id AND r.bucket = 'ATTACHED_BOX'
            AND r.status = 'RESERVED' AND r.order_id <> ?), 0) AS reserved_boxes
        FROM glasses_lots g WHERE g.stock_status = 'AVAILABLE' AND g.sku = ? AND g.remaining_qty > 0
          AND (? = '' OR LOWER(TRIM(g.supplier)) = LOWER(?))
          AND (? = '' OR g.included_box_sku = ?)
        ORDER BY CASE WHEN g.included_box_remaining = 0 THEN 0 ELSE 1 END, g.received_at, g.created_at, g.id`)
        .bind(excludeOrderId, excludeOrderId, itemSku, requestedSource, requestedSource, requestedAttachedSku, requestedAttachedSku).all<Record<string, string | number>>();
      let remaining = quantity;
      for (const lot of lots.results) {
        if (remaining <= 0) break;
        const plannedGlasses = planned.get(`GLASSES:${lot.id}`) || 0;
        const glassAvailable = Number(lot.remaining_qty) - Number(lot.reserved_glasses) - plannedGlasses;
        const plannedBoxes = planned.get(`ATTACHED_BOX:${lot.id}`) || 0;
        const boxAvailable = Number(lot.included_box_remaining) - Number(lot.reserved_boxes) - plannedBoxes;
        const available = line.type === "GLASSES_WITH_ATTACHED" ? Math.min(glassAvailable, boxAvailable) : glassAvailable;
        const take = Math.min(Math.max(available, 0), remaining);
        if (take <= 0) continue;
        add({ id: crypto.randomUUID(), orderId, orderItemId: line.id, lotKind: "GLASSES", bucket: "GLASSES", lotId: String(lot.id), quantity: take, unitCost: Number(lot.unit_cost), sku: String(lot.sku), name: String(lot.name), lineType: line.type });
        if (line.type === "GLASSES_WITH_ATTACHED") {
          add({ id: crypto.randomUUID(), orderId, orderItemId: line.id, lotKind: "GLASSES", bucket: "ATTACHED_BOX", lotId: String(lot.id), quantity: take, unitCost: 0, sku: normalizedSku(line.boxSku || itemSku, "box kèm"), name: `Box kèm ${lot.name}`, lineType: line.type });
        }
        remaining -= take;
      }
      if (remaining > 0) {
        const label = line.type === "GLASSES_WITH_ATTACHED" ? "kính có box kèm khả dụng" : "kính khả dụng";
        const sourceLabel = requestedSource ? ` tại nguồn ${requestedSource}` : "";
        throw new Error(`${itemSku}: không đủ ${label}${sourceLabel}; còn thiếu ${remaining}.`);
      }
      if (line.type === "GLASSES_WITH_LOOSE") {
        const boxSku = normalizedSku(line.boxSku, "box lẻ cho kính");
        await planLooseBoxes(database, plans, planned, orderId, line, boxSku, quantity, excludeOrderId, optionalText(line.boxSourceSupplier));
      }
    } else {
      await planLooseBoxes(database, plans, planned, orderId, line, itemSku, quantity, excludeOrderId, requestedSource);
    }
  }
  return plans;
}

async function planLooseBoxes(
  database: D1Database,
  plans: ReservationPlan[],
  planned: Map<string, number>,
  orderId: string,
  line: SalesLineInput & { id: string },
  boxSku: string,
  quantity: number,
  excludeOrderId: string,
  sourceSupplier = "",
) {
  const requestedSource = optionalText(sourceSupplier);
  const lots = await database.prepare(`SELECT b.id, b.sku, b.name, b.unit_cost, b.remaining_qty,
    COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r
      WHERE r.lot_kind = 'BOX' AND r.lot_id = b.id AND r.bucket = 'LOOSE_BOX'
        AND r.status = 'RESERVED' AND r.order_id <> ?), 0) AS reserved_qty
    FROM box_lots b WHERE b.sku = ? AND b.remaining_qty > 0
      AND (? = '' OR LOWER(TRIM(b.supplier)) = LOWER(?))
    ORDER BY b.received_at, b.created_at, b.id`).bind(excludeOrderId, boxSku, requestedSource, requestedSource)
    .all<Record<string, string | number>>();
  let remaining = quantity;
  for (const lot of lots.results) {
    if (remaining <= 0) break;
    const key = `LOOSE_BOX:${lot.id}`;
    const available = Number(lot.remaining_qty) - Number(lot.reserved_qty) - (planned.get(key) || 0);
    const take = Math.min(Math.max(available, 0), remaining);
    if (take <= 0) continue;
    const plan: ReservationPlan = { id: crypto.randomUUID(), orderId, orderItemId: line.id, lotKind: "BOX", bucket: "LOOSE_BOX", lotId: String(lot.id), quantity: take, unitCost: Number(lot.unit_cost), sku: String(lot.sku), name: String(lot.name), lineType: line.type };
    plans.push(plan);
    planned.set(key, (planned.get(key) || 0) + take);
    remaining -= take;
  }
  if (remaining > 0) {
    const sourceLabel = requestedSource ? ` tại nguồn ${requestedSource}` : "";
    throw new Error(`${boxSku}: không đủ box lẻ khả dụng${sourceLabel}; còn thiếu ${remaining}.`);
  }
}

async function saveReservations(database: D1Database, plans: ReservationPlan[], orderId: string, actor?: string, reason = "Giữ hàng cho đơn đã nhận cọc") {
  const timestamp = now();
  const statements: D1PreparedStatement[] = [];
  for (const plan of plans) {
    statements.push(database.prepare(`INSERT INTO inventory_reservations (
      id, order_id, order_item_id, lot_kind, bucket, lot_id, quantity, unit_cost,
      sku, name, line_type, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESERVED', ?, ?)`).bind(
      plan.id, orderId, plan.orderItemId, plan.lotKind, plan.bucket, plan.lotId, plan.quantity,
      plan.unitCost, plan.sku, plan.name, plan.lineType, timestamp, timestamp,
    ));
    statements.push(movementStatement(database, {
      kind: plan.bucket === "GLASSES" ? "GLASSES" : "BOX", bucket: plan.bucket,
      sku: plan.sku, name: plan.name, reserved: plan.quantity, type: "RESERVE",
      referenceType: "SALES_ORDER", referenceId: orderId, lotId: plan.lotId, reason, actor,
    }));
  }
  if (statements.length) await database.batch(statements);
}

async function releaseReservations(database: D1Database, orderId: string, actor?: string, reason = "Giải phóng hàng") {
  const rows = await database.prepare("SELECT * FROM inventory_reservations WHERE order_id = ? AND status = 'RESERVED'")
    .bind(orderId).all<Record<string, string | number>>();
  const statements: D1PreparedStatement[] = [];
  for (const row of rows.results) {
    statements.push(database.prepare("UPDATE inventory_reservations SET status = 'RELEASED', updated_at = ? WHERE id = ?")
      .bind(now(), String(row.id)));
    statements.push(movementStatement(database, {
      kind: row.bucket === "GLASSES" ? "GLASSES" : "BOX", bucket: String(row.bucket),
      sku: String(row.sku), name: String(row.name), reserved: -Number(row.quantity), type: "RELEASE",
      referenceType: "SALES_ORDER", referenceId: orderId, lotId: String(row.lot_id), reason, actor,
    }));
  }
  if (statements.length) await database.batch(statements);
}

async function consumeReservations(database: D1Database, orderId: string, actor?: string) {
  const rows = await database.prepare("SELECT * FROM inventory_reservations WHERE order_id = ? AND status = 'RESERVED' ORDER BY bucket")
    .bind(orderId).all<Record<string, string | number>>();
  if (!rows.results.length) throw new Error("Đơn chưa có hàng được giữ nên chưa thể hoàn tất.");
  const statements: D1PreparedStatement[] = [];
  let glassesCost = 0;
  let boxCost = 0;
  for (const row of rows.results) {
    const qty = Number(row.quantity);
    if (row.bucket === "GLASSES") {
      statements.push(database.prepare("UPDATE glasses_lots SET remaining_qty = remaining_qty - ?, updated_at = ? WHERE id = ? AND remaining_qty >= ?")
        .bind(qty, now(), String(row.lot_id), qty));
      glassesCost += qty * Number(row.unit_cost);
      if (row.line_type === "GLASSES_ONLY" || row.line_type === "GLASSES_WITH_LOOSE") {
        const lot = await database.prepare(`SELECT * FROM glasses_lots WHERE id = ?`).bind(String(row.lot_id))
          .first<Record<string, string | number | null>>();
        const reservedAttached = await database.prepare(`SELECT COALESCE(SUM(quantity), 0) AS value
          FROM inventory_reservations WHERE lot_kind = 'GLASSES' AND lot_id = ? AND bucket = 'ATTACHED_BOX'
          AND status = 'RESERVED' AND order_id <> ?`).bind(String(row.lot_id), orderId).first<{ value: number }>();
        const releasable = Math.min(qty, Math.max(Number(lot?.included_box_remaining || 0) - Number(reservedAttached?.value || 0), 0));
        if (releasable > 0 && lot?.included_box_sku) {
          const releasedLotId = crypto.randomUUID();
          statements.push(database.prepare("UPDATE glasses_lots SET included_box_remaining = included_box_remaining - ?, updated_at = ? WHERE id = ?")
            .bind(releasable, now(), String(row.lot_id)));
          statements.push(database.prepare(`INSERT INTO box_lots (
            id, received_at, supplier, sku, name, origin_type, received_qty, remaining_qty,
            unit_cost, source_glasses_lot_id, source_order_id, note, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'released_from_glasses', ?, ?, 0, ?, ?, ?, ?, ?)`).bind(
            releasedLotId, today(), String(lot.supplier), String(lot.included_box_sku),
            String(lot.included_box_name || lot.included_box_sku), releasable, releasable,
            String(row.lot_id), orderId, "Box tách ra khi bán kính không dùng box kèm", now(), now(),
          ));
          statements.push(movementStatement(database, {
            kind: "BOX", bucket: "LOOSE_BOX", sku: String(lot.included_box_sku),
            name: String(lot.included_box_name || lot.included_box_sku), physical: 0,
            type: "BOX_RELEASED_FROM_GLASSES", referenceType: "SALES_ORDER", referenceId: orderId,
            lotId: releasedLotId, reason: "Bán kính không lấy box kèm", actor,
          }));
        }
      }
    } else if (row.bucket === "ATTACHED_BOX") {
      statements.push(database.prepare("UPDATE glasses_lots SET included_box_remaining = included_box_remaining - ?, updated_at = ? WHERE id = ? AND included_box_remaining >= ?")
        .bind(qty, now(), String(row.lot_id), qty));
    } else {
      statements.push(database.prepare("UPDATE box_lots SET remaining_qty = remaining_qty - ?, updated_at = ? WHERE id = ? AND remaining_qty >= ?")
        .bind(qty, now(), String(row.lot_id), qty));
      boxCost += qty * Number(row.unit_cost);
    }
    statements.push(database.prepare("UPDATE inventory_reservations SET status = 'CONSUMED', updated_at = ? WHERE id = ?")
      .bind(now(), String(row.id)));
    statements.push(movementStatement(database, {
      kind: row.bucket === "GLASSES" ? "GLASSES" : "BOX", bucket: String(row.bucket),
      sku: String(row.sku), name: String(row.name), physical: -qty, reserved: -qty, type: "SALE",
      referenceType: "SALES_ORDER", referenceId: orderId, lotId: String(row.lot_id), reason: "Hoàn tất đơn hàng", actor,
    }));
  }
  await database.batch(statements);
  const order = await database.prepare("SELECT revenue, ship, ship_payer FROM orders WHERE id = ?").bind(orderId)
    .first<{ revenue: number; ship: number; ship_payer: string }>();
  const profit = orderProfit(Number(order?.revenue || 0), glassesCost + boxCost, Number(order?.ship || 0), shipPayer(order?.ship_payer));
  await database.prepare("UPDATE orders SET glasses_cost = ?, box_cost = ?, profit = ?, status = 'DONE', updated_at = ? WHERE id = ?")
    .bind(glassesCost, boxCost, profit, now(), orderId).run();
}

async function returnConsumed(database: D1Database, orderId: string, actor?: string) {
  const rows = await database.prepare("SELECT * FROM inventory_reservations WHERE order_id = ? AND status = 'CONSUMED' ORDER BY bucket DESC")
    .bind(orderId).all<Record<string, string | number>>();
  if (!rows.results.length) throw new Error("Đơn không có hàng đã xuất để hoàn lại.");
  const releaseByGlassesLot = new Map<string, number>();
  for (const row of rows.results) {
    if (row.bucket === "GLASSES" && (row.line_type === "GLASSES_ONLY" || row.line_type === "GLASSES_WITH_LOOSE")) {
      releaseByGlassesLot.set(String(row.lot_id), (releaseByGlassesLot.get(String(row.lot_id)) || 0) + Number(row.quantity));
    }
  }
  for (const [lotId, qty] of releaseByGlassesLot) {
    const availableReleased = await database.prepare(`SELECT COALESCE(SUM(remaining_qty), 0) AS value
      FROM box_lots WHERE source_order_id = ? AND source_glasses_lot_id = ?`).bind(orderId, lotId).first<{ value: number }>();
    if (Number(availableReleased?.value || 0) < qty) {
      throw new Error("Box từng tách từ kính đã được dùng cho đơn khác; chưa thể hoàn lại toàn bộ đơn này.");
    }
  }
  const statements: D1PreparedStatement[] = [];
  for (const row of rows.results) {
    const qty = Number(row.quantity);
    if (row.bucket === "GLASSES") {
      statements.push(database.prepare("UPDATE glasses_lots SET remaining_qty = remaining_qty + ?, updated_at = ? WHERE id = ?")
        .bind(qty, now(), String(row.lot_id)));
      if (row.line_type === "GLASSES_ONLY" || row.line_type === "GLASSES_WITH_LOOSE") {
        const releasedLots = await database.prepare(`SELECT id, remaining_qty FROM box_lots
          WHERE source_order_id = ? AND source_glasses_lot_id = ? AND remaining_qty > 0 ORDER BY created_at`)
          .bind(orderId, String(row.lot_id)).all<{ id: string; remaining_qty: number }>();
        let remaining = qty;
        for (const lot of releasedLots.results) {
          const take = Math.min(remaining, Number(lot.remaining_qty));
          if (take === Number(lot.remaining_qty)) statements.push(database.prepare("DELETE FROM box_lots WHERE id = ?").bind(lot.id));
          else statements.push(database.prepare("UPDATE box_lots SET remaining_qty = remaining_qty - ?, updated_at = ? WHERE id = ?").bind(take, now(), lot.id));
          remaining -= take;
          if (remaining <= 0) break;
        }
        statements.push(database.prepare("UPDATE glasses_lots SET included_box_remaining = included_box_remaining + ?, updated_at = ? WHERE id = ?")
          .bind(qty, now(), String(row.lot_id)));
      }
    } else if (row.bucket === "ATTACHED_BOX") {
      statements.push(database.prepare("UPDATE glasses_lots SET included_box_remaining = included_box_remaining + ?, updated_at = ? WHERE id = ?")
        .bind(qty, now(), String(row.lot_id)));
    } else {
      statements.push(database.prepare("UPDATE box_lots SET remaining_qty = remaining_qty + ?, updated_at = ? WHERE id = ?")
        .bind(qty, now(), String(row.lot_id)));
    }
    statements.push(database.prepare("UPDATE inventory_reservations SET status = 'RETURNED', updated_at = ? WHERE id = ?")
      .bind(now(), String(row.id)));
    statements.push(movementStatement(database, {
      kind: row.bucket === "GLASSES" ? "GLASSES" : "BOX", bucket: String(row.bucket),
      sku: String(row.sku), name: String(row.name), physical: qty, type: "RETURN",
      referenceType: "SALES_ORDER", referenceId: orderId, lotId: String(row.lot_id), reason: "Khách trả hàng", actor,
    }));
  }
  await database.batch(statements);
}

function salesLines(value: unknown) {
  const raw = Array.isArray(value) ? value as SalesLineInput[] : [];
  if (!raw.length) throw new Error("Đơn hàng phải có ít nhất một dòng sản phẩm.");
  return raw.map((line, index) => {
    if (!["GLASSES_WITH_ATTACHED","GLASSES_ONLY","GLASSES_WITH_LOOSE","BOX_ONLY"].includes(line.type)) throw new Error("Loại dòng sản phẩm không hợp lệ.");
    const sourceSupplier = text(line.sourceSupplier, line.type === "BOX_ONLY" ? `nguồn box dòng ${index + 1}` : `nguồn kính dòng ${index + 1}`);
    return {
      id: crypto.randomUUID(),
      lineNo: index + 1,
      type: line.type,
      sku: normalizedSku(line.sku),
      name: optionalText(line.name) || normalizedSku(line.sku),
      boxSku: line.type === "GLASSES_WITH_ATTACHED" || line.type === "GLASSES_WITH_LOOSE" ? normalizedSku(line.boxSku, "mã box") : "",
      sourceSupplier,
      boxSourceSupplier: line.type === "GLASSES_WITH_ATTACHED" ? sourceSupplier
        : line.type === "GLASSES_WITH_LOOSE" ? text(line.boxSourceSupplier, `nguồn box lẻ dòng ${index + 1}`) : "",
      quantity: integer(line.quantity, "Số lượng", 1),
      unitPrice: integer(line.unitPrice, "Giá bán"),
    };
  });
}

export async function createSalesOrder(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const timestamp = now();
  const lines = salesLines(input.lines);
  const status = workflow(input.status || "DRAFT");
  if (["CANCELLED","RETURNED","REFUNDED"].includes(status)) throw new Error("Không thể tạo mới đơn ở trạng thái này.");
  const customer = await customerRecord(input.customer, input.phone, input.address);
  const orderId = crypto.randomUUID();
  const orderCode = code("DH");
  const revenue = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const ship = integer(input.ship, "Phí ship");
  const payer = shipPayer(input.shipPayer);
  const orderSources = Array.from(new Set(lines.flatMap((line) => [line.sourceSupplier, line.boxSourceSupplier]).filter(Boolean))).join(", ");
  const orderType = lines[0].type === "BOX_ONLY" ? "box_only" : lines[0].type === "GLASSES_ONLY" ? "glasses_only" : "glasses_with_box";
  const legacyStatus = status === "COMPLETED" ? "DONE" : "PROCESS";
  const deposit = integer(input.deposit, "Tiền cọc");
  if (deposit > customerTotal(revenue, ship, payer)) throw new Error("Tiền cọc không thể lớn hơn tổng khách phải thanh toán.");
  let plans: ReservationPlan[] = [];
  if (RESERVED_STATUSES.has(status) || status === "COMPLETED") plans = await planReservations(database, orderId, lines, "", optionalText(input.sourceSupplier));
  const statements: D1PreparedStatement[] = [
    upsertCustomer(database, customer, timestamp),
    database.prepare(`INSERT INTO orders (
      id, code, order_date, customer, phone, order_type, glasses_sku, box_sku,
      revenue, deposit, ship, ship_payer, status, workflow_status, glasses_cost, box_cost, profit,
      customer_id, product_code, address, carrier, source_supplier, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      orderId, orderCode, validDate(input.orderDate || today(), "ngày đơn"), customer.displayName,
      customer.phone, orderType, lines.find((line) => line.type !== "BOX_ONLY")?.sku || null,
      lines.find((line) => line.type === "BOX_ONLY")?.sku || lines.find((line) => line.boxSku)?.boxSku || null,
      revenue, deposit, ship, payer, legacyStatus, status, orderProfit(revenue, 0, ship, payer), customer.id,
      lines.map((line) => line.sku).join(" + "), customer.address, optionalText(input.carrier),
      orderSources, optionalText(input.note), timestamp, timestamp,
    ),
  ];
  for (const line of lines) {
    statements.push(database.prepare(`INSERT INTO order_items (
      id, order_id, line_no, line_type, sku, name, box_sku, source_supplier, box_source_supplier,
      quantity, unit_price, estimated_cost, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(
      line.id, orderId, line.lineNo, line.type, line.sku, line.name, line.boxSku, line.sourceSupplier, line.boxSourceSupplier,
      line.quantity, line.unitPrice, timestamp, timestamp,
    ));
  }
  if (deposit > 0) {
    statements.push(database.prepare(`INSERT INTO order_payments (
      id, order_id, payment_date, amount, payment_type, method, note, created_by, created_at
    ) VALUES (?, ?, ?, ?, 'DEPOSIT', ?, 'Cọc khi tạo đơn', ?, ?)`).bind(
      crypto.randomUUID(), orderId, validDate(input.orderDate || today(), "ngày đơn"), deposit,
      optionalText(input.paymentMethod), actorName(actor), timestamp,
    ));
  }
  statements.push(database.prepare(`INSERT INTO order_events (
    id, order_id, event_type, to_status, reason, actor, created_at
  ) VALUES (?, ?, 'CREATED', ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), orderId, status, optionalText(input.note), actorName(actor), timestamp,
  ));
  await database.batch(statements);
  if (plans.length) await saveReservations(database, plans, orderId, actor);
  if (status === "COMPLETED") await consumeReservations(database, orderId, actor);
  return { ok: true, id: orderId, code: orderCode };
}

export async function updateSalesOrder(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const orderId = text(input.id, "mã đơn hàng");
  const order = await database.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId)
    .first<Record<string, string | number | null>>();
  if (!order) throw new Error("Không tìm thấy đơn hàng.");
  const currentStatus = workflow(order.workflow_status);
  if (["COMPLETED","REFUNDED"].includes(currentStatus)) {
    throw new Error("Đơn đã xuất hoặc hoàn tiền. Hãy Trả hàng trước; sau khi trả có thể sửa sản phẩm để thực hiện đổi hàng.");
  }
  const lines = salesLines(input.lines);
  const nextStatus = workflow(input.status ?? currentStatus);
  if (["COMPLETED","RETURNED","REFUNDED"].includes(nextStatus)) throw new Error("Hãy dùng nút đổi trạng thái để thực hiện nghiệp vụ này.");
  const customer = await customerRecord(input.customer ?? order.customer, input.phone ?? order.phone, input.address ?? order.address);
  const revenue = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const ship = integer(input.ship ?? order.ship, "Phí ship");
  const payer = shipPayer(input.shipPayer ?? order.ship_payer);
  const orderSources = Array.from(new Set(lines.flatMap((line) => [line.sourceSupplier, line.boxSourceSupplier]).filter(Boolean))).join(", ");
  let plans: ReservationPlan[] = [];
  if (RESERVED_STATUSES.has(nextStatus)) plans = await planReservations(database, orderId, lines, orderId);
  if (RESERVED_STATUSES.has(currentStatus)) await releaseReservations(database, orderId, actor, "Sửa nội dung đơn hàng");
  const timestamp = now();
  const orderType = lines[0].type === "BOX_ONLY" ? "box_only" : lines[0].type === "GLASSES_ONLY" ? "glasses_only" : "glasses_with_box";
  const statements: D1PreparedStatement[] = [
    upsertCustomer(database, customer, timestamp),
    database.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId),
    database.prepare(`UPDATE orders SET order_date = ?, customer = ?, phone = ?, address = ?, customer_id = ?,
      order_type = ?, glasses_sku = ?, box_sku = ?, product_code = ?, revenue = ?, ship = ?, source_supplier = ?,
      ship_payer = ?, profit = ?, workflow_status = ?, status = 'PROCESS', note = ?, updated_at = ? WHERE id = ?`).bind(
      validDate(input.orderDate ?? order.order_date, "ngày đơn"), customer.displayName, customer.phone,
      customer.address, customer.id, orderType, lines.find((line) => line.type !== "BOX_ONLY")?.sku || null,
      lines.find((line) => line.type === "BOX_ONLY")?.sku || lines.find((line) => line.boxSku)?.boxSku || null,
      lines.map((line) => line.sku).join(" + "), revenue, ship, orderSources, payer,
      orderProfit(revenue, Number(order.glasses_cost || 0) + Number(order.box_cost || 0), ship, payer),
      nextStatus, optionalText(input.note ?? order.note), timestamp, orderId,
    ),
    database.prepare(`INSERT INTO order_events (
      id, order_id, event_type, from_status, to_status, reason, actor, created_at
    ) VALUES (?, ?, 'EDITED', ?, ?, 'Cập nhật nội dung đơn', ?, ?)`).bind(
      crypto.randomUUID(), orderId, currentStatus, nextStatus, actorName(actor), timestamp,
    ),
  ];
  for (const line of lines) {
    statements.push(database.prepare(`INSERT INTO order_items (
      id, order_id, line_no, line_type, sku, name, box_sku, source_supplier, box_source_supplier,
      quantity, unit_price, estimated_cost, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(
      line.id, orderId, line.lineNo, line.type, line.sku, line.name, line.boxSku, line.sourceSupplier,
      line.boxSourceSupplier, line.quantity, line.unitPrice, timestamp, timestamp,
    ));
  }
  await database.batch(statements);
  if (plans.length) await saveReservations(database, plans, orderId, actor, "Giữ lại hàng sau khi sửa đơn");
  return { ok: true };
}

export async function changeSalesStatus(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const orderId = text(input.orderId, "đơn hàng");
  const target = workflow(input.status);
  const order = await database.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId)
    .first<Record<string, string | number | null>>();
  if (!order) throw new Error("Không tìm thấy đơn hàng.");
  const current = workflow(order.workflow_status);
  if (current === target) return { ok: true };
  const reason = optionalText(input.reason);
  if (["CANCELLED","RETURNED","REFUNDED"].includes(target) && !reason) throw new Error("Vui lòng nhập lý do xử lý.");

  if (RESERVED_STATUSES.has(target) && !RESERVED_STATUSES.has(current)) {
    const items = await database.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY line_no").bind(orderId)
      .all<Record<string, string | number>>();
    const lines = items.results.map((item) => ({
      id: String(item.id), type: String(item.line_type) as SalesLineInput["type"], sku: String(item.sku),
      name: String(item.name), boxSku: String(item.box_sku || ""), sourceSupplier: String(item.source_supplier || ""),
      boxSourceSupplier: String(item.box_source_supplier || ""), quantity: Number(item.quantity), unitPrice: Number(item.unit_price),
    }));
    const plans = await planReservations(database, orderId, lines, orderId, optionalText(order.source_supplier));
    await saveReservations(database, plans, orderId, actor);
  } else if (target === "COMPLETED") {
    if (!RESERVED_STATUSES.has(current)) throw new Error("Đơn phải giữ hàng trước khi hoàn tất.");
    await consumeReservations(database, orderId, actor);
  } else if (target === "CANCELLED") {
    if (RESERVED_STATUSES.has(current)) await releaseReservations(database, orderId, actor, reason);
    if (current === "COMPLETED") throw new Error("Đơn đã hoàn tất; hãy dùng Trả hàng thay vì Hủy đơn.");
  } else if (target === "RETURNED") {
    if (current === "COMPLETED") await returnConsumed(database, orderId, actor);
    else if (RESERVED_STATUSES.has(current)) await releaseReservations(database, orderId, actor, reason);
    else throw new Error("Chỉ có thể trả hàng cho đơn đã giữ hoặc đã hoàn tất.");
  } else if (target === "REFUNDED") {
    if (!(current === "RETURNED" || current === "CANCELLED")) throw new Error("Hãy hủy/trả hàng trước khi đánh dấu hoàn tiền.");
  } else if ((target === "DRAFT" || target === "WAITING_STOCK") && RESERVED_STATUSES.has(current)) {
    await releaseReservations(database, orderId, actor, target === "WAITING_STOCK" ? "Chuyển sang chờ nhập hàng" : "Chuyển đơn về nháp");
  }

  const legacyStatus = target === "COMPLETED" ? "DONE" : "PROCESS";
  await database.batch([
    database.prepare("UPDATE orders SET workflow_status = ?, status = ?, updated_at = ? WHERE id = ?")
      .bind(target, legacyStatus, now(), orderId),
    database.prepare(`INSERT INTO order_events (
      id, order_id, event_type, from_status, to_status, reason, actor, created_at
    ) VALUES (?, ?, 'STATUS_CHANGED', ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), orderId, current, target, reason, actorName(actor), now(),
    ),
  ]);
  return { ok: true };
}

export async function addOrderPayment(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const orderId = text(input.orderId, "đơn hàng");
  const order = await database.prepare("SELECT id FROM orders WHERE id = ?").bind(orderId).first();
  if (!order) throw new Error("Không tìm thấy đơn hàng.");
  const type = ["DEPOSIT","PAYMENT","SHIP","REFUND"].includes(String(input.paymentType)) ? String(input.paymentType) : "PAYMENT";
  const rawAmount = integer(input.amount, "Số tiền", 1);
  const amount = type === "REFUND" ? -rawAmount : rawAmount;
  const timestamp = now();
  await database.batch([
    database.prepare(`INSERT INTO order_payments (
      id, order_id, payment_date, amount, payment_type, method, note, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), orderId, validDate(input.paymentDate || today(), "ngày thanh toán"), amount,
      type, optionalText(input.method), optionalText(input.note), actorName(actor), timestamp,
    ),
    database.prepare(`INSERT INTO order_events (
      id, order_id, event_type, reason, actor, created_at
    ) VALUES (?, ?, 'PAYMENT', ?, ?, ?)`).bind(
      crypto.randomUUID(), orderId, `${type}: ${amount}`, actorName(actor), timestamp,
    ),
  ]);
  const paid = await database.prepare("SELECT COALESCE(SUM(amount), 0) AS value FROM order_payments WHERE order_id = ?")
    .bind(orderId).first<{ value: number }>();
  await database.prepare("UPDATE orders SET deposit = ?, updated_at = ? WHERE id = ?")
    .bind(Math.max(Number(paid?.value || 0), 0), timestamp, orderId).run();
  return { ok: true };
}

export async function upsertShipment(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const orderId = text(input.orderId, "đơn hàng");
  const status = ["PENDING","SHIPPED","DELIVERED","FAILED","RETURNED"].includes(String(input.status)) ? String(input.status) : "PENDING";
  const actualFee = integer(input.actualFee, "Phí ship thực tế");
  const timestamp = now();
  await database.batch([
    database.prepare(`INSERT INTO shipments (
      id, order_id, carrier, tracking_code, estimated_fee, actual_fee, shipped_at, status, note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET carrier = excluded.carrier, tracking_code = excluded.tracking_code,
      estimated_fee = excluded.estimated_fee, actual_fee = excluded.actual_fee, shipped_at = excluded.shipped_at,
      status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`).bind(
      crypto.randomUUID(), orderId, optionalText(input.carrier), optionalText(input.trackingCode),
      integer(input.estimatedFee, "Phí ship dự kiến"), actualFee, optionalText(input.shippedAt),
      status, optionalText(input.note), timestamp,
    ),
    database.prepare(`UPDATE orders SET carrier = ?, ship = ?,
      profit = revenue - glasses_cost - box_cost - CASE WHEN ship_payer='SELLER' THEN ? ELSE 0 END,
      updated_at = ? WHERE id = ?`)
      .bind(optionalText(input.carrier), actualFee, actualFee, timestamp, orderId),
    database.prepare(`INSERT INTO order_events (
      id, order_id, event_type, reason, actor, created_at
    ) VALUES (?, ?, 'SHIPMENT', ?, ?, ?)`).bind(
      crypto.randomUUID(), orderId, `${status} · ${optionalText(input.trackingCode)}`, actorName(actor), timestamp,
    ),
  ]);
  return { ok: true };
}

export async function saveProduct(input: Record<string, unknown>) {
  await ensureV2Schema();
  const database = db();
  const kind = input.kind === "BOX" ? "BOX" : "GLASSES";
  const itemSku = normalizedSku(input.sku);
  const itemName = text(input.name, "tên sản phẩm");
  await upsertProduct(database, {
    kind, sku: itemSku, name: itemName, brand: optionalText(input.brand), model: optionalText(input.model),
    color: optionalText(input.color), compatibleBoxSku: optionalText(input.compatibleBoxSku).toUpperCase(),
    supplier: optionalText(input.sourceSupplier), unitCost: integer(input.lastPurchasePrice, "Giá nhập gần nhất"),
    suggestedSalePrice: integer(input.suggestedSalePrice, "Giá bán đề xuất"),
  }, now());
  return { ok: true };
}

export async function editLot(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const kind = input.kind === "BOX" ? "BOX" : "GLASSES";
  const table = kind === "BOX" ? "box_lots" : "glasses_lots";
  const id = text(input.id, "mã lô");
  const lot = await database.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, string | number>>();
  if (!lot) throw new Error("Không tìm thấy lô hàng.");
  const itemSku = normalizedSku(input.sku ?? lot.sku);
  const itemName = text(input.name ?? lot.name, "tên sản phẩm");
  await database.batch([
    database.prepare(`UPDATE ${table} SET received_at = ?, supplier = ?, sku = ?, name = ?, unit_cost = ?, note = ?, updated_at = ? WHERE id = ?`)
      .bind(validDate(input.receivedAt ?? lot.received_at, "ngày nhập"), text(input.supplier ?? lot.supplier, "nguồn nhập"),
        itemSku, itemName, integer(input.unitCost ?? lot.unit_cost, "Giá vốn"), optionalText(input.note ?? lot.note), now(), id),
    movementStatement(database, {
      kind, bucket: kind === "BOX" ? "LOOSE_BOX" : "GLASSES", sku: itemSku, name: itemName,
      type: "LOT_EDIT", referenceType: "LOT", referenceId: id, lotId: id,
      reason: optionalText(input.reason) || "Sửa thông tin lô", actor,
    }),
  ]);
  await upsertProduct(database, { kind, sku: itemSku, name: itemName, supplier: String(input.supplier ?? lot.supplier), unitCost: Number(input.unitCost ?? lot.unit_cost) }, now());
  return { ok: true };
}

export async function adjustInventory(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const kind = input.kind === "BOX" ? "BOX" : "GLASSES";
  const table = kind === "BOX" ? "box_lots" : "glasses_lots";
  const id = text(input.id, "mã lô");
  const lot = await database.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, string | number>>();
  if (!lot) throw new Error("Không tìm thấy lô hàng.");
  const delta = signedInteger(input.delta, "Số lượng điều chỉnh");
  if (delta === 0) throw new Error("Số lượng điều chỉnh phải khác 0.");
  const next = Number(lot.remaining_qty) + delta;
  if (next < 0) throw new Error(`Lô chỉ còn ${lot.remaining_qty}; không thể giảm ${Math.abs(delta)}.`);
  const reason = text(input.reason, "lý do điều chỉnh");
  await database.batch([
    database.prepare(`UPDATE ${table} SET remaining_qty = ?, updated_at = ? WHERE id = ?`).bind(next, now(), id),
    movementStatement(database, {
      kind, bucket: kind === "BOX" ? "LOOSE_BOX" : "GLASSES", sku: String(lot.sku), name: String(lot.name),
      physical: delta, type: String(input.adjustmentType || "STOCKTAKE"), referenceType: "LOT", referenceId: id,
      lotId: id, reason, actor,
    }),
  ]);
  return { ok: true, remaining: next };
}

type TestOrderLineInput = { inventoryId: string; quantity: number; unitPrice: number };

function testEvent(database: D1Database, eventType: string, referenceId: string, description: string, actor?: string, occurredAt?: string) {
  return database.prepare(`INSERT INTO test_events (
    id, occurred_at, event_type, reference_id, description, actor
  ) VALUES (?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), occurredAt || now(), eventType, referenceId, description, actorName(actor),
  );
}

export async function receiveTestInventory(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const kind = input.kind === "BOX" ? "BOX" : "GLASSES";
  const sku = normalizedSku(input.sku);
  const name = text(input.name, "tên sản phẩm test");
  const quantity = integer(input.quantity, "Số lượng nhập test", 1);
  const unitCost = integer(input.unitCost, "Giá nhập test");
  const source = optionalText(input.sourceSupplier);
  const timestamp = now();
  const existing = await database.prepare("SELECT id FROM test_inventory WHERE kind = ? AND sku = ?").bind(kind, sku).first<{ id: string }>();
  const inventoryId = existing?.id || crypto.randomUUID();
  await database.batch([
    database.prepare(`INSERT INTO test_inventory (
      id, kind, sku, name, source_supplier, on_hand, reserved, unit_cost, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(kind, sku) DO UPDATE SET name = excluded.name,
      source_supplier = CASE WHEN excluded.source_supplier <> '' THEN excluded.source_supplier ELSE test_inventory.source_supplier END,
      on_hand = test_inventory.on_hand + excluded.on_hand, unit_cost = excluded.unit_cost, updated_at = excluded.updated_at`).bind(
      inventoryId, kind, sku, name, source, quantity, unitCost, timestamp, timestamp,
    ),
    testEvent(database, "RECEIVE", inventoryId, `Nhập test ${quantity} ${kind === "BOX" ? "box" : "kính"} · ${sku} · ${unitCost}đ/SP`, actor, timestamp),
  ]);
  return { ok: true, inventoryId };
}

async function testInventoryForLines(database: D1Database, lines: TestOrderLineInput[]) {
  const result: Array<Record<string, string | number>> = [];
  for (const line of lines) {
    const item = await database.prepare("SELECT * FROM test_inventory WHERE id = ?").bind(line.inventoryId).first<Record<string, string | number>>();
    if (!item) throw new Error("Có sản phẩm không tồn tại trong kho test.");
    result.push(item);
  }
  return result;
}

function aggregateTestQuantities(lines: TestOrderLineInput[]) {
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.inventoryId, (totals.get(line.inventoryId) || 0) + line.quantity);
  return totals;
}

export async function createTestOrder(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const rawLines = Array.isArray(input.lines) ? input.lines as Array<Record<string, unknown>> : [];
  if (!rawLines.length) throw new Error("Đơn test cần ít nhất một sản phẩm.");
  const lines: TestOrderLineInput[] = rawLines.map((line) => ({
    inventoryId: text(line.inventoryId, "sản phẩm test"),
    quantity: integer(line.quantity, "Số lượng bán test", 1),
    unitPrice: integer(line.unitPrice, "Giá bán test"),
  }));
  const inventory = await testInventoryForLines(database, lines);
  const totals = aggregateTestQuantities(lines);
  const requestedStatus = String(input.status) === "DRAFT" ? "DRAFT" : "PROCESS";
  if (requestedStatus === "PROCESS") {
    for (const [inventoryId, quantity] of totals) {
      const item = inventory.find((candidate) => String(candidate.id) === inventoryId)!;
      const available = Number(item.on_hand) - Number(item.reserved);
      if (available < quantity) throw new Error(`${item.name} chỉ còn ${available} sản phẩm có thể bán trong kho test.`);
    }
  }
  const orderId = crypto.randomUUID();
  const orderCode = code("TEST");
  const timestamp = now();
  const revenue = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const cost = lines.reduce((sum, line, index) => sum + line.quantity * Number(inventory[index].unit_cost || 0), 0);
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT INTO test_orders (
      id, code, order_date, customer, phone, status, revenue, cost, profit, note, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      orderId, orderCode, validDate(input.orderDate || today(), "ngày đơn test"), text(input.customer, "tên khách test"),
      optionalText(input.phone), requestedStatus, revenue, cost, revenue - cost, optionalText(input.note), actorName(actor), timestamp, timestamp,
    ),
  ];
  lines.forEach((line, index) => {
    const item = inventory[index];
    statements.push(database.prepare(`INSERT INTO test_order_items (
      id, order_id, line_no, inventory_id, kind, sku, name, quantity, unit_price, unit_cost, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), orderId, index + 1, line.inventoryId, item.kind, item.sku, item.name,
      line.quantity, line.unitPrice, item.unit_cost, timestamp,
    ));
  });
  if (requestedStatus === "PROCESS") {
    for (const [inventoryId, quantity] of totals) {
      statements.push(database.prepare("UPDATE test_inventory SET reserved = reserved + ?, updated_at = ? WHERE id = ?")
        .bind(quantity, timestamp, inventoryId));
    }
  }
  statements.push(testEvent(database, "ORDER_CREATED", orderId, `Tạo ${orderCode} · ${requestedStatus === "PROCESS" ? "giữ hàng test" : "nháp test"}`, actor, timestamp));
  await database.batch(statements);
  return { ok: true, orderId, code: orderCode };
}

export async function changeTestOrderStatus(input: Record<string, unknown>, actor?: string) {
  await ensureV2Schema();
  const database = db();
  const orderId = text(input.orderId, "đơn test");
  const next = String(input.status);
  const order = await database.prepare("SELECT * FROM test_orders WHERE id = ?").bind(orderId).first<Record<string, string | number>>();
  if (!order) throw new Error("Không tìm thấy đơn test.");
  const current = String(order.status);
  const allowed: Record<string, string[]> = {
    DRAFT: ["PROCESS", "COMPLETED", "CANCELLED"],
    PROCESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: ["RETURNED"],
  };
  if (!allowed[current]?.includes(next)) throw new Error(`Không thể chuyển đơn test từ ${current} sang ${next}.`);
  const itemRows = await database.prepare("SELECT * FROM test_order_items WHERE order_id = ? ORDER BY line_no").bind(orderId).all<Record<string, string | number>>();
  const totals = new Map<string, number>();
  for (const item of itemRows.results) totals.set(String(item.inventory_id), (totals.get(String(item.inventory_id)) || 0) + Number(item.quantity));
  const inventory: Record<string, Record<string, string | number>> = {};
  for (const inventoryId of totals.keys()) {
    const item = await database.prepare("SELECT * FROM test_inventory WHERE id = ?").bind(inventoryId).first<Record<string, string | number>>();
    if (!item) throw new Error("Sản phẩm của đơn không còn trong kho test.");
    inventory[inventoryId] = item;
  }
  if ((current === "DRAFT" && ["PROCESS", "COMPLETED"].includes(next))) {
    for (const [inventoryId, quantity] of totals) {
      const item = inventory[inventoryId];
      const available = Number(item.on_hand) - Number(item.reserved);
      if (available < quantity) throw new Error(`${item.name} chỉ còn ${available} sản phẩm có thể bán trong kho test.`);
    }
  }
  const timestamp = now();
  const statements: D1PreparedStatement[] = [];
  for (const [inventoryId, quantity] of totals) {
    if (current === "DRAFT" && next === "PROCESS") {
      statements.push(database.prepare("UPDATE test_inventory SET reserved = reserved + ?, updated_at = ? WHERE id = ?").bind(quantity, timestamp, inventoryId));
    } else if (current === "DRAFT" && next === "COMPLETED") {
      statements.push(database.prepare("UPDATE test_inventory SET on_hand = on_hand - ?, updated_at = ? WHERE id = ?").bind(quantity, timestamp, inventoryId));
    } else if (current === "PROCESS" && next === "COMPLETED") {
      statements.push(database.prepare("UPDATE test_inventory SET on_hand = on_hand - ?, reserved = reserved - ?, updated_at = ? WHERE id = ?").bind(quantity, quantity, timestamp, inventoryId));
    } else if (current === "PROCESS" && next === "CANCELLED") {
      statements.push(database.prepare("UPDATE test_inventory SET reserved = reserved - ?, updated_at = ? WHERE id = ?").bind(quantity, timestamp, inventoryId));
    } else if (current === "COMPLETED" && next === "RETURNED") {
      statements.push(database.prepare("UPDATE test_inventory SET on_hand = on_hand + ?, updated_at = ? WHERE id = ?").bind(quantity, timestamp, inventoryId));
    }
  }
  statements.push(
    database.prepare("UPDATE test_orders SET status = ?, updated_at = ? WHERE id = ?").bind(next, timestamp, orderId),
    testEvent(database, next, orderId, `${order.code}: ${current} → ${next}${optionalText(input.reason) ? ` · ${optionalText(input.reason)}` : ""}`, actor, timestamp),
  );
  await database.batch(statements);
  return { ok: true };
}

export async function resetTestLab(actor?: string) {
  await ensureV2Schema();
  const database = db();
  await database.batch([
    database.prepare("DELETE FROM test_events"),
    database.prepare("DELETE FROM test_order_items"),
    database.prepare("DELETE FROM test_orders"),
    database.prepare("DELETE FROM test_inventory"),
  ]);
  return { ok: true, message: `Đã xóa dữ liệu test bởi ${actorName(actor)}.` };
}

export async function getTestLabDashboard() {
  await ensureV2Schema();
  const database = db();
  const [metricsResult, inventory, orders, orderItems, events] = await database.batch([
    database.prepare(`SELECT
      COALESCE(SUM(on_hand),0) AS on_hand,
      COALESCE(SUM(reserved),0) AS reserved,
      COALESCE(SUM(on_hand-reserved),0) AS available,
      (SELECT COUNT(*) FROM test_orders) AS orders,
      (SELECT COALESCE(SUM(revenue),0) FROM test_orders WHERE status='COMPLETED') AS revenue,
      (SELECT COALESCE(SUM(profit),0) FROM test_orders WHERE status='COMPLETED') AS profit
      FROM test_inventory`),
    database.prepare("SELECT *, on_hand-reserved AS available FROM test_inventory ORDER BY kind, name, sku"),
    database.prepare("SELECT * FROM test_orders ORDER BY order_date DESC, created_at DESC LIMIT 100"),
    database.prepare("SELECT * FROM test_order_items ORDER BY order_id, line_no"),
    database.prepare("SELECT * FROM test_events ORDER BY occurred_at DESC, rowid DESC LIMIT 150"),
  ]);
  const metrics = (metricsResult.results?.[0] || {}) as Record<string, unknown>;
  const itemsByOrder = (orderItems.results as Record<string, unknown>[]).reduce<Record<string, Record<string, unknown>[]>>((result, item) => {
    (result[String(item.order_id)] ||= []).push(item); return result;
  }, {});
  return {
    metrics: metrics || {}, inventory: inventory.results,
    orders: (orders.results as Record<string, unknown>[]).map((order) => ({ ...order, items: itemsByOrder[String(order.id)] || [] })),
    events: events.results, generatedAt: now(),
    isolation: "Dữ liệu chỉ nằm trong các bảng test_*; không tham gia kho, doanh thu hoặc lợi nhuận thật.",
  };
}

export async function runV2Action(action: string, input: Record<string, unknown>, actor?: string) {
  switch (action) {
    case "create_purchase_order": return createPurchaseOrder(input, actor);
    case "consolidate_purchase_orders": return consolidatePurchaseOrders(input, actor);
    case "update_purchase_order": return updatePurchaseOrder(input, actor);
    case "receive_purchase_order": return receivePurchaseOrder(input, actor);
    case "add_supplier_payment": return addSupplierPayment(input, actor);
    case "create_sales_order": return createSalesOrder(input, actor);
    case "update_sales_order": return updateSalesOrder(input, actor);
    case "change_sales_status": return changeSalesStatus(input, actor);
    case "add_order_payment": return addOrderPayment(input, actor);
    case "upsert_shipment": return upsertShipment(input, actor);
    case "save_product": return saveProduct(input);
    case "edit_lot": return editLot(input, actor);
    case "adjust_inventory": return adjustInventory(input, actor);
    case "test_receive": return receiveTestInventory(input, actor);
    case "test_create_order": return createTestOrder(input, actor);
    case "test_change_status": return changeTestOrderStatus(input, actor);
    case "test_reset": return resetTestLab(actor);
    default: throw new Error("Thao tác không hợp lệ.");
  }
}

export async function getSalesDashboard(filters: Record<string, string | string[]> = {}) {
  await ensureV2Schema();
  const database = db();
  const fromDate = validDate(typeof filters.fromDate === "string" ? filters.fromDate || "2026-01-01" : "2026-01-01", "ngày bắt đầu");
  const toDate = validDate(typeof filters.toDate === "string" ? filters.toDate || today() : today(), "ngày kết thúc");
  if (fromDate > toDate) throw new Error("Ngày bắt đầu không thể sau ngày kết thúc.");
  const sources = (Array.isArray(filters.sources) ? filters.sources : typeof filters.source === "string" && filters.source ? [filters.source] : [])
    .map(optionalText).filter(Boolean);
  const glasses = optionalText(typeof filters.glasses === "string" ? filters.glasses : "");
  const baseSql = `WITH base_lines AS (
    SELECT o.id AS order_id,o.code AS order_code,o.order_date,substr(o.order_date,1,7) AS sale_month,
      i.id AS order_item_id,i.sku,COALESCE(NULLIF(i.name,''),NULLIF(p.name,''),i.sku) AS name,
      i.quantity AS line_qty,i.unit_price,
      COALESCE(NULLIF(i.source_supplier,''),NULLIF(o.source_supplier,''),NULLIF(p.source_supplier,''),'Chưa xác định') AS fallback_source
    FROM orders o JOIN order_items i ON i.order_id=o.id
    LEFT JOIN products p ON p.kind='GLASSES' AND p.sku=i.sku
    WHERE o.workflow_status='COMPLETED' AND i.line_type<>'BOX_ONLY'
  ), sales AS (
    SELECT b.order_id,b.order_code,b.order_date,b.sale_month,b.order_item_id,b.sku,b.name,
      r.quantity AS glasses_qty,r.quantity*b.unit_price AS revenue,
      COALESCE(NULLIF(g.supplier,''),b.fallback_source) AS source_supplier
    FROM base_lines b JOIN inventory_reservations r ON r.order_item_id=b.order_item_id
      AND r.bucket='GLASSES' AND r.status='CONSUMED'
    JOIN glasses_lots g ON g.id=r.lot_id
    UNION ALL
    SELECT b.order_id,b.order_code,b.order_date,b.sale_month,b.order_item_id,b.sku,b.name,
      b.line_qty AS glasses_qty,b.line_qty*b.unit_price AS revenue,b.fallback_source AS source_supplier
    FROM base_lines b WHERE NOT EXISTS (
      SELECT 1 FROM inventory_reservations r WHERE r.order_item_id=b.order_item_id
        AND r.bucket='GLASSES' AND r.status='CONSUMED'
    )
  )`;
  const predicates = ["order_date>=?", "order_date<=?"];
  const values: string[] = [fromDate, toDate];
  if (sources.length) { predicates.push(`source_supplier IN (${sources.map(() => "?").join(",")})`); values.push(...sources); }
  if (glasses) { predicates.push("(name LIKE ? OR sku LIKE ?)"); values.push(`%${glasses}%`, `%${glasses}%`); }
  const whereSql = `WHERE ${predicates.join(" AND ")}`;
  const [summaryResult, monthly, topGlasses, topSources, sourceOptions, glassesOptions, coverageResult] = await database.batch([
    database.prepare(`${baseSql} SELECT
      COALESCE(SUM(glasses_qty),0) AS glasses_sold,
      COALESCE(SUM(revenue),0) AS revenue,
      COUNT(DISTINCT order_id) AS completed_orders,
      COUNT(DISTINCT sku) AS distinct_glasses,
      CASE WHEN COALESCE(SUM(glasses_qty),0)>0 THEN CAST(ROUND(SUM(revenue)*1.0/SUM(glasses_qty)) AS INTEGER) ELSE 0 END AS average_revenue_per_glasses
      FROM sales ${whereSql}`).bind(...values),
    database.prepare(`${baseSql} SELECT sale_month,
      SUM(glasses_qty) AS glasses_sold,SUM(revenue) AS revenue,COUNT(DISTINCT order_id) AS completed_orders
      FROM sales ${whereSql} GROUP BY sale_month ORDER BY sale_month`).bind(...values),
    database.prepare(`${baseSql} SELECT sku,name,SUM(glasses_qty) AS glasses_sold,
      SUM(revenue) AS revenue,COUNT(DISTINCT order_id) AS completed_orders
      FROM sales ${whereSql} GROUP BY sku,name ORDER BY glasses_sold DESC,revenue DESC,name LIMIT 10`).bind(...values),
    database.prepare(`${baseSql} SELECT source_supplier,SUM(glasses_qty) AS glasses_sold,
      SUM(revenue) AS revenue,COUNT(DISTINCT order_id) AS completed_orders
      FROM sales ${whereSql} GROUP BY source_supplier ORDER BY glasses_sold DESC,revenue DESC,source_supplier LIMIT 10`).bind(...values),
    database.prepare(`${baseSql} SELECT DISTINCT source_supplier FROM sales ORDER BY source_supplier`),
    database.prepare(`${baseSql} SELECT DISTINCT sku,name FROM sales ORDER BY name,sku`),
    database.prepare(`${baseSql} SELECT MIN(order_date) AS first_sale_date,MAX(order_date) AS last_sale_date,COUNT(*) AS line_count FROM sales`),
  ]);
  const summary = (summaryResult.results?.[0] || {}) as Record<string, unknown>;
  const coverage = (coverageResult.results?.[0] || {}) as Record<string, unknown>;
  return {
    filters: { fromDate, toDate, sources, glasses }, summary: summary || {},
    monthly: monthly.results, topGlasses: topGlasses.results, topSources: topSources.results,
    sourceOptions: sourceOptions.results, glassesOptions: glassesOptions.results,
    coverage: coverage || {}, generatedAt: now(),
    metricDefinition: "Chỉ tính dòng kính thuộc đơn Hoàn tất; doanh thu = số lượng × đơn giá của từng dòng kính, không gồm phí ship và dòng box-only.",
  };
}

export async function getV2Dashboard(filters: Record<string, string | string[]> = {}) {
  await ensureV2Schema();
  const database = db();
  const orderWhere: string[] = [];
  const orderValues: string[] = [];
  const customerFilter = typeof filters.customer === "string" ? filters.customer : "";
  const productFilter = typeof filters.product === "string" ? filters.product : "";
  const fromDateFilter = typeof filters.fromDate === "string" ? filters.fromDate : "";
  const toDateFilter = typeof filters.toDate === "string" ? filters.toDate : "";
  const statusFilter = typeof filters.status === "string" ? filters.status : "";
  const sourceFilters = (Array.isArray(filters.sources) ? filters.sources : typeof filters.source === "string" && filters.source ? [filters.source] : [])
    .map(optionalText).filter(Boolean);
  if (customerFilter) { orderWhere.push("(o.customer LIKE ? OR o.phone LIKE ?)"); orderValues.push(`%${customerFilter}%`, `%${customerFilter}%`); }
  if (productFilter) { orderWhere.push("EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.sku LIKE ? OR oi.name LIKE ? OR oi.box_sku LIKE ?))"); orderValues.push(`%${productFilter}%`, `%${productFilter}%`, `%${productFilter}%`); }
  if (fromDateFilter) { orderWhere.push("o.order_date >= ?"); orderValues.push(validDate(fromDateFilter, "ngày bắt đầu")); }
  if (toDateFilter) { orderWhere.push("o.order_date <= ?"); orderValues.push(validDate(toDateFilter, "ngày kết thúc")); }
  if (statusFilter) { orderWhere.push("o.workflow_status = ?"); orderValues.push(statusFilter); }
  if (sourceFilters.length) {
    const sourceClauses: string[] = [];
    if (sourceFilters.includes("__EMPTY__")) sourceClauses.push(`(COALESCE(TRIM(o.source_supplier),'') = '' AND NOT EXISTS (
      SELECT 1 FROM order_items oi WHERE oi.order_id=o.id
        AND (COALESCE(TRIM(oi.source_supplier),'') <> '' OR COALESCE(TRIM(oi.box_source_supplier),'') <> '')
    ) AND NOT EXISTS (
      SELECT 1 FROM inventory_reservations sr
      LEFT JOIN glasses_lots sg ON sr.lot_kind='GLASSES' AND sg.id=sr.lot_id
      LEFT JOIN box_lots sb ON sr.lot_kind='BOX' AND sb.id=sr.lot_id
      WHERE sr.order_id=o.id AND COALESCE(NULLIF(TRIM(sg.supplier),''),NULLIF(TRIM(sb.supplier),''),'') <> ''
    ))`);
    for (const source of sourceFilters.filter((item) => item !== "__EMPTY__")) {
      sourceClauses.push(`(TRIM(o.source_supplier) = ? OR EXISTS (
        SELECT 1 FROM order_items oi WHERE oi.order_id=o.id
          AND (TRIM(oi.source_supplier)=? OR TRIM(oi.box_source_supplier)=?)
      ) OR EXISTS (
        SELECT 1 FROM inventory_reservations sr
        LEFT JOIN glasses_lots sg ON sr.lot_kind='GLASSES' AND sg.id=sr.lot_id
        LEFT JOIN box_lots sb ON sr.lot_kind='BOX' AND sb.id=sr.lot_id
        WHERE sr.order_id=o.id AND COALESCE(NULLIF(TRIM(sg.supplier),''),NULLIF(TRIM(sb.supplier),'')) = ?
      ))`);
      orderValues.push(source, source, source, source);
    }
    if (sourceClauses.length) orderWhere.push(`(${sourceClauses.join(" OR ")})`);
  }
  const whereSql = orderWhere.length ? `WHERE ${orderWhere.join(" AND ")}` : "";

  const inventoryProductFilter = typeof filters.inventoryProduct === "string" ? optionalText(filters.inventoryProduct) : "";
  const inventoryFromDateFilter = typeof filters.inventoryFromDate === "string" && filters.inventoryFromDate
    ? validDate(filters.inventoryFromDate, "ngày nhập bắt đầu") : "";
  const inventoryToDateFilter = typeof filters.inventoryToDate === "string" && filters.inventoryToDate
    ? validDate(filters.inventoryToDate, "ngày nhập kết thúc") : "";
  if (inventoryFromDateFilter && inventoryToDateFilter && inventoryFromDateFilter > inventoryToDateFilter) {
    throw new Error("Ngày nhập bắt đầu không thể sau ngày nhập kết thúc.");
  }
  const inventorySourceFilters = (Array.isArray(filters.inventorySources) ? filters.inventorySources : [])
    .map(optionalText).filter(Boolean);
  const inventoryFilter = ({sku,name,supplier,date,base}:{sku:string;name:string;supplier:string;date:string;base:string[]}) => {
    const clauses = [...base];
    const values: string[] = [];
    if (inventoryProductFilter) {
      clauses.push(`(${sku} LIKE ? OR ${name} LIKE ?)`);
      values.push(`%${inventoryProductFilter}%`, `%${inventoryProductFilter}%`);
    }
    if (inventorySourceFilters.length) {
      clauses.push(`TRIM(${supplier}) IN (${inventorySourceFilters.map(() => "?").join(",")})`);
      values.push(...inventorySourceFilters);
    }
    if (inventoryFromDateFilter) { clauses.push(`substr(${date},1,10) >= ?`); values.push(inventoryFromDateFilter); }
    if (inventoryToDateFilter) { clauses.push(`substr(${date},1,10) <= ?`); values.push(inventoryToDateFilter); }
    return { sql: clauses.join(" AND "), values };
  };
  const glassInventoryFilter = inventoryFilter({sku:"g.sku",name:"g.name",supplier:"g.supplier",date:"g.received_at",base:["g.stock_status='AVAILABLE'"]});
  const looseBoxInventoryFilter = inventoryFilter({sku:"b.sku",name:"b.name",supplier:"b.supplier",date:"b.received_at",base:["b.remaining_qty>0"]});
  const attachedBoxInventoryFilter = inventoryFilter({sku:"g.included_box_sku",name:"g.included_box_name",supplier:"g.supplier",date:"g.received_at",base:["g.stock_status='AVAILABLE'", "g.included_box_sku IS NOT NULL", "g.included_box_remaining>0"]});
  const pendingBoxInventoryFilter = inventoryFilter({sku:"pi.sku",name:"pi.name",supplier:"COALESCE(NULLIF(TRIM(pi.source_supplier),''),po.supplier)",date:"po.order_date",base:["pi.fulfillment_type='ATTACHED_BOX'", `COALESCE((SELECT SUM(gri.good_quantity) FROM goods_receipt_items gri WHERE gri.purchase_order_item_id=pi.id AND gri.box_stock_type='ATTACHED'),0)>pi.activated_qty`]});
  const boxLotHistoryFilter = inventoryFilter({sku:"b.sku",name:"b.name",supplier:"b.supplier",date:"b.received_at",base:["1=1"]});

  const requestedScope = typeof filters.scope === "string" ? filters.scope : "all";
  const allowedScopes = new Set(["all", "overview", "sales", "purchases", "inventory", "products", "defects", "customers", "activity", "form-options"]);
  const scope = allowedScopes.has(requestedScope) ? requestedScope : "overview";
  const scopeKeys: Record<string, string[]> = {
    all: ["metrics", "orderRows", "orderItems", "orderSources", "reservationSources", "payments", "shipments", "purchaseRows", "purchaseSources", "inventorySources", "purchaseItems", "supplierPayments", "receipts", "products", "glassesInventory", "boxInventory", "glassLots", "boxLots", "movements", "customers", "defectiveProducts"],
    overview: ["metrics", "orderRows", "orderItems", "reservationSources", "payments", "shipments", "purchaseRows", "purchaseItems", "supplierPayments", "receipts"],
    sales: ["orderRows", "orderItems", "orderSources", "reservationSources", "payments", "shipments", "products", "glassesInventory", "boxInventory", "glassLots", "boxLots", "inventorySources"],
    purchases: ["purchaseRows", "purchaseSources", "purchaseItems", "supplierPayments", "receipts", "products", "glassesInventory", "boxInventory", "glassLots", "boxLots", "inventorySources"],
    inventory: ["metrics", "inventorySources", "glassesInventory", "boxInventory", "glassLots", "boxLots", "movements"],
    products: ["products"],
    defects: ["defectiveProducts"],
    customers: ["customers"],
    activity: ["movements"],
    "form-options": ["products", "glassesInventory", "boxInventory", "glassLots", "boxLots", "inventorySources"],
  };
  const requestedKeys = new Set(scopeKeys[scope]);
  const orderLimit = scope === "overview" ? 8 : 100;
  const selectedOrderIdsSql = `SELECT o.id FROM orders o ${whereSql} ORDER BY o.order_date DESC, o.created_at DESC LIMIT ${orderLimit}`;
  const purchaseScopeWhere = scope === "overview" ? "WHERE po.status IN ('DRAFT','ORDERED','PARTIAL') AND po.merged_into_order_id=''" : "";
  const purchaseLimit = scope === "overview" ? 6 : 500;
  const selectedPurchaseIdsSql = `SELECT po.id FROM purchase_orders po ${purchaseScopeWhere}
    ORDER BY CASE WHEN po.status='PARTIAL' THEN 0 WHEN po.status='ORDERED' THEN 1 WHEN po.status='DRAFT' THEN 2 ELSE 3 END,
    po.order_date DESC, po.created_at DESC LIMIT ${purchaseLimit}`;

  const queryDefinitions: Array<{ key: string; statement: D1PreparedStatement }> = [
    { key: "metrics", statement: database.prepare(`SELECT
      (SELECT COALESCE(SUM(remaining_qty),0) FROM glasses_lots WHERE stock_status='AVAILABLE') AS glasses_on_hand,
      (SELECT COALESCE(SUM(quantity),0) FROM inventory_reservations WHERE bucket='GLASSES' AND status='RESERVED') AS glasses_reserved,
      (SELECT COALESCE(SUM(remaining_qty),0) FROM box_lots) + (SELECT COALESCE(SUM(included_box_remaining),0) FROM glasses_lots WHERE stock_status='AVAILABLE') AS boxes_on_hand,
      (SELECT COALESCE(SUM(quantity),0) FROM inventory_reservations WHERE bucket IN ('LOOSE_BOX','ATTACHED_BOX') AND status='RESERVED') AS boxes_reserved,
      (SELECT COUNT(*) FROM purchase_orders WHERE status IN ('ORDERED','PARTIAL')) AS open_purchase_orders,
      (SELECT COUNT(*) FROM orders WHERE workflow_status IN ('WAITING_STOCK','DEPOSIT_RECEIVED','ORDERING_SUPPLIER','GOODS_RECEIVED','READY_TO_SHIP','SHIPPING')) AS active_sales_orders,
      (SELECT COUNT(*) FROM customers) AS customers,
      (SELECT COALESCE(SUM(profit),0) FROM orders WHERE workflow_status='COMPLETED' AND substr(order_date,1,7)=substr(date('now'),1,7)) AS monthly_profit`) },
    { key: "orderRows", statement: database.prepare(`SELECT o.*,
      COALESCE((SELECT SUM(p.amount) FROM order_payments p WHERE p.order_id=o.id),0) AS paid_amount,
      o.revenue + CASE WHEN o.ship_payer='RECIPIENT' THEN o.ship ELSE 0 END AS customer_total,
      o.revenue + CASE WHEN o.ship_payer='RECIPIENT' THEN o.ship ELSE 0 END
        - COALESCE((SELECT SUM(p.amount) FROM order_payments p WHERE p.order_id=o.id),0) AS outstanding,
      CASE WHEN o.workflow_status IN ('WAITING_STOCK','CANCELLED','RETURNED','REFUNDED') THEN 0
        WHEN EXISTS (SELECT 1 FROM inventory_reservations cr WHERE cr.order_id=o.id AND cr.status IN ('RESERVED','CONSUMED'))
          THEN o.revenue-CASE WHEN o.ship_payer='SELLER' THEN o.ship ELSE 0 END
            -COALESCE((SELECT SUM(cr.quantity*cr.unit_cost) FROM inventory_reservations cr WHERE cr.order_id=o.id AND cr.status IN ('RESERVED','CONSUMED')),0)
        ELSE o.profit END AS display_profit,
      COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.order_id=o.id AND r.status='RESERVED'),0) AS reserved_qty
      FROM orders o ${whereSql} ORDER BY o.order_date DESC, o.created_at DESC LIMIT ${orderLimit}`).bind(...orderValues) },
    { key: "orderItems", statement: database.prepare(`SELECT * FROM order_items
      WHERE order_id IN (${selectedOrderIdsSql}) ORDER BY order_id, line_no`).bind(...orderValues) },
    { key: "orderSources", statement: database.prepare(`SELECT source_supplier FROM (
      SELECT DISTINCT TRIM(source_supplier) AS source_supplier FROM orders
        WHERE TRIM(source_supplier) <> '' AND INSTR(source_supplier, ',') = 0
      UNION SELECT DISTINCT TRIM(source_supplier) FROM order_items WHERE TRIM(source_supplier) <> ''
      UNION SELECT DISTINCT TRIM(box_source_supplier) FROM order_items WHERE TRIM(box_source_supplier) <> ''
      UNION SELECT DISTINCT TRIM(g.supplier) FROM inventory_reservations r JOIN glasses_lots g ON r.lot_kind='GLASSES' AND g.id=r.lot_id WHERE TRIM(g.supplier) <> ''
      UNION SELECT DISTINCT TRIM(b.supplier) FROM inventory_reservations r JOIN box_lots b ON r.lot_kind='BOX' AND b.id=r.lot_id WHERE TRIM(b.supplier) <> ''
    ) ORDER BY source_supplier`) },
    { key: "reservationSources", statement: database.prepare(`SELECT order_id,GROUP_CONCAT(DISTINCT source) AS sources FROM (
      SELECT order_id,TRIM(source_supplier) AS source FROM order_items WHERE TRIM(source_supplier)<>''
      UNION ALL SELECT order_id,TRIM(box_source_supplier) FROM order_items WHERE TRIM(box_source_supplier)<>''
      UNION ALL SELECT r.order_id,COALESCE(NULLIF(TRIM(g.supplier),''),NULLIF(TRIM(b.supplier),''))
        FROM inventory_reservations r
        LEFT JOIN glasses_lots g ON r.lot_kind='GLASSES' AND g.id=r.lot_id
        LEFT JOIN box_lots b ON r.lot_kind='BOX' AND b.id=r.lot_id
        WHERE COALESCE(NULLIF(TRIM(g.supplier),''),NULLIF(TRIM(b.supplier),'')) IS NOT NULL
    ) WHERE order_id IN (${selectedOrderIdsSql}) GROUP BY order_id`).bind(...orderValues) },
    { key: "payments", statement: database.prepare(`SELECT * FROM order_payments
      WHERE order_id IN (${selectedOrderIdsSql}) ORDER BY payment_date DESC, created_at DESC`).bind(...orderValues) },
    { key: "shipments", statement: database.prepare(`SELECT * FROM shipments
      WHERE order_id IN (${selectedOrderIdsSql}) ORDER BY updated_at DESC`).bind(...orderValues) },
    { key: "purchaseRows", statement: database.prepare(`SELECT po.*,
      COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.purchase_order_id=po.id),0) AS paid_amount,
      CASE WHEN po.merged_into_order_id<>'' THEN 0 ELSE po.total_amount+po.ship_cost-
        COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.purchase_order_id=po.id),0) END AS outstanding,
      COALESCE((SELECT SUM(ordered_qty) FROM purchase_order_items pi WHERE pi.purchase_order_id=po.id),0) AS ordered_qty,
      COALESCE((SELECT SUM(received_qty) FROM purchase_order_items pi WHERE pi.purchase_order_id=po.id),0) AS received_qty,
      COALESCE(NULLIF((SELECT GROUP_CONCAT(source, ', ') FROM (
        SELECT DISTINCT TRIM(pi2.source_supplier) AS source FROM purchase_order_items pi2
        WHERE pi2.purchase_order_id=po.id AND TRIM(pi2.source_supplier)<>'' ORDER BY source
      )),''),po.supplier) AS tracking_sources,
      (SELECT COUNT(DISTINCT pi3.origin_purchase_order_id) FROM purchase_order_items pi3
        WHERE pi3.purchase_order_id=po.id AND TRIM(pi3.origin_purchase_order_id)<>'') AS consolidated_from_count,
      merged.code AS merged_into_code
      FROM purchase_orders po LEFT JOIN purchase_orders merged ON merged.id=po.merged_into_order_id
      ${purchaseScopeWhere}
      ORDER BY CASE WHEN po.merged_into_order_id<>'' THEN 4 WHEN po.status='PARTIAL' THEN 0 WHEN po.status='ORDERED' THEN 1 WHEN po.status='DRAFT' THEN 2 ELSE 3 END,
      po.order_date DESC, po.created_at DESC LIMIT ${purchaseLimit}`) },
    { key: "purchaseSources", statement: database.prepare("SELECT DISTINCT TRIM(source_supplier) AS supplier FROM purchase_order_items WHERE TRIM(source_supplier) <> '' ORDER BY supplier") },
    { key: "inventorySources", statement: database.prepare(`SELECT supplier FROM (
      SELECT DISTINCT TRIM(supplier) AS supplier FROM glasses_lots WHERE TRIM(supplier) <> ''
      UNION SELECT DISTINCT TRIM(supplier) FROM box_lots WHERE TRIM(supplier) <> ''
      UNION SELECT DISTINCT TRIM(source_supplier) FROM purchase_order_items WHERE TRIM(source_supplier) <> ''
    ) ORDER BY supplier`) },
    { key: "purchaseItems", statement: database.prepare(`SELECT pi.*, pi.ordered_qty-pi.received_qty AS pending_qty,
      COALESCE((SELECT SUM(gri.good_quantity) FROM goods_receipt_items gri WHERE gri.purchase_order_item_id=pi.id),0) AS good_received_qty,
      COALESCE((SELECT SUM(gri.defective_quantity) FROM goods_receipt_items gri WHERE gri.purchase_order_item_id=pi.id),0) AS defective_received_qty,
      CASE WHEN pi.fulfillment_type='ATTACHED_BOX' THEN MAX(0,
        COALESCE((SELECT SUM(gri.good_quantity) FROM goods_receipt_items gri
          WHERE gri.purchase_order_item_id=pi.id AND gri.box_stock_type='ATTACHED'),0)-pi.activated_qty) ELSE 0 END AS waiting_for_glasses
      FROM purchase_order_items pi WHERE pi.purchase_order_id IN (${selectedPurchaseIdsSql})
      ORDER BY pi.purchase_order_id, pi.line_no`) },
    { key: "supplierPayments", statement: database.prepare(`SELECT * FROM supplier_payments
      WHERE purchase_order_id IN (${selectedPurchaseIdsSql}) ORDER BY payment_date DESC, created_at DESC`) },
    { key: "receipts", statement: database.prepare(`SELECT * FROM goods_receipts
      WHERE purchase_order_id IN (${selectedPurchaseIdsSql}) ORDER BY received_at DESC, created_at DESC`) },
    { key: "products", statement: database.prepare(`SELECT p.*,
      CASE WHEN p.kind='GLASSES' THEN COALESCE((SELECT SUM(g.remaining_qty) FROM glasses_lots g WHERE g.stock_status='AVAILABLE' AND g.sku=p.sku),0)
      ELSE COALESCE((SELECT SUM(b.remaining_qty) FROM box_lots b WHERE b.sku=p.sku),0) + COALESCE((SELECT SUM(g.included_box_remaining) FROM glasses_lots g WHERE g.stock_status='AVAILABLE' AND g.included_box_sku=p.sku),0) END AS on_hand,
      CASE WHEN p.kind='GLASSES' THEN COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.bucket='GLASSES' AND r.sku=p.sku AND r.status='RESERVED'),0)
      ELSE COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.bucket IN ('LOOSE_BOX','ATTACHED_BOX') AND r.sku=p.sku AND r.status='RESERVED'),0) END AS reserved
      FROM products p WHERE p.active=1 ORDER BY p.kind, p.name`) },
    { key: "glassesInventory", statement: database.prepare(`SELECT g.sku, MAX(g.name) AS name, GROUP_CONCAT(DISTINCT g.supplier) AS suppliers,
      MAX(COALESCE(g.included_box_sku,'')) AS included_box_sku,
      SUM(g.remaining_qty) AS on_hand,
      SUM(COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.bucket='GLASSES' AND r.lot_kind='GLASSES' AND r.lot_id=g.id AND r.status='RESERVED'),0)) AS reserved,
      SUM(g.remaining_qty)-SUM(COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.bucket='GLASSES' AND r.lot_kind='GLASSES' AND r.lot_id=g.id AND r.status='RESERVED'),0)) AS available,
      SUM(g.included_box_remaining) AS attached_boxes
      FROM glasses_lots g WHERE ${glassInventoryFilter.sql} GROUP BY g.sku HAVING SUM(g.remaining_qty)>0 ORDER BY name`).bind(...glassInventoryFilter.values) },
    { key: "boxInventory", statement: database.prepare(`SELECT sku, MAX(name) AS name, GROUP_CONCAT(DISTINCT supplier) AS suppliers,
      SUM(loose_qty) AS loose_qty, SUM(attached_qty) AS attached_qty, SUM(pending_attached_qty) AS pending_attached_qty,
      SUM(reserved_qty) AS reserved, SUM(loose_qty+attached_qty-reserved_qty) AS available
      FROM (
        SELECT b.sku,b.name,b.supplier,b.remaining_qty AS loose_qty,0 AS attached_qty,0 AS pending_attached_qty,
          COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.bucket='LOOSE_BOX' AND r.lot_kind='BOX' AND r.lot_id=b.id AND r.status='RESERVED'),0) AS reserved_qty
          FROM box_lots b WHERE ${looseBoxInventoryFilter.sql}
        UNION ALL
        SELECT g.included_box_sku,g.included_box_name,g.supplier,0,g.included_box_remaining,0,
          COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.bucket='ATTACHED_BOX' AND r.lot_kind='GLASSES' AND r.lot_id=g.id AND r.status='RESERVED'),0)
          FROM glasses_lots g WHERE ${attachedBoxInventoryFilter.sql}
        UNION ALL
        SELECT pi.sku,pi.name,COALESCE(NULLIF(TRIM(pi.source_supplier),''),po.supplier),0,0,MAX(0,
          COALESCE((SELECT SUM(gri.good_quantity) FROM goods_receipt_items gri
            WHERE gri.purchase_order_item_id=pi.id AND gri.box_stock_type='ATTACHED'),0)-pi.activated_qty),0
          FROM purchase_order_items pi JOIN purchase_orders po ON po.id=pi.purchase_order_id
          WHERE ${pendingBoxInventoryFilter.sql}
      ) x GROUP BY sku HAVING SUM(loose_qty+attached_qty+pending_attached_qty)>0 ORDER BY name`).bind(
        ...looseBoxInventoryFilter.values, ...attachedBoxInventoryFilter.values, ...pendingBoxInventoryFilter.values,
      ) },
    { key: "glassLots", statement: database.prepare(`SELECT g.*, 'GLASSES' AS kind,
      COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.lot_kind='GLASSES' AND r.lot_id=g.id AND r.bucket='GLASSES' AND r.status='RESERVED'),0) AS reserved_qty
      FROM glasses_lots g WHERE ${glassInventoryFilter.sql} ORDER BY g.received_at DESC,g.created_at DESC LIMIT 500`).bind(...glassInventoryFilter.values) },
    { key: "boxLots", statement: database.prepare(`SELECT b.*, 'BOX' AS kind,
      COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.lot_kind='BOX' AND r.lot_id=b.id AND r.bucket='LOOSE_BOX' AND r.status='RESERVED'),0) AS reserved_qty
      FROM box_lots b WHERE ${boxLotHistoryFilter.sql} ORDER BY b.received_at DESC,b.created_at DESC LIMIT 500`).bind(...boxLotHistoryFilter.values) },
    { key: "movements", statement: database.prepare("SELECT * FROM inventory_movements ORDER BY occurred_at DESC, rowid DESC LIMIT 200") },
    { key: "customers", statement: database.prepare(`SELECT c.id,c.display_name,c.phone,c.primary_address,COUNT(o.id) AS order_count,
      COALESCE(SUM(o.revenue),0) AS total_revenue,
      COALESCE(SUM(CASE WHEN o.workflow_status IN ('CANCELLED','RETURNED','REFUNDED') THEN 0
        WHEN EXISTS (SELECT 1 FROM inventory_reservations cr WHERE cr.order_id=o.id AND cr.status IN ('RESERVED','CONSUMED'))
          THEN o.revenue-CASE WHEN o.ship_payer='SELLER' THEN o.ship ELSE 0 END
            -COALESCE((SELECT SUM(cr.quantity*cr.unit_cost) FROM inventory_reservations cr WHERE cr.order_id=o.id AND cr.status IN ('RESERVED','CONSUMED')),0)
        ELSE o.profit END),0) AS total_profit,
      MAX(o.order_date) AS last_order_date FROM customers c LEFT JOIN orders o ON o.customer_id=c.id
      GROUP BY c.id,c.display_name,c.phone,c.primary_address ORDER BY last_order_date DESC,c.updated_at DESC LIMIT 100`) },
    { key: "defectiveProducts", statement: database.prepare(`SELECT d.*, po.code AS purchase_order_code, gr.code AS receipt_code
      FROM defective_products d
      LEFT JOIN purchase_orders po ON po.id=d.purchase_order_id
      LEFT JOIN goods_receipts gr ON gr.id=d.receipt_id
      ORDER BY d.received_at DESC,d.created_at DESC LIMIT 500`) },
  ];
  const selectedQueries = queryDefinitions.filter((query) => requestedKeys.has(query.key));
  const queryResults = selectedQueries.length ? await database.batch(selectedQueries.map((query) => query.statement)) : [];
  const rowsByKey = new Map<string, Record<string, unknown>[]>();
  selectedQueries.forEach((query, index) => rowsByKey.set(query.key, (queryResults[index]?.results || []) as Record<string, unknown>[]));
  const rowsFor = (key: string) => rowsByKey.get(key) || [];
  const asResult = (key: string) => ({ results: rowsFor(key) });
  const metrics = rowsFor("metrics")[0] || {};
  const orderRows = asResult("orderRows");
  const orderItems = asResult("orderItems");
  const orderSources = asResult("orderSources");
  const reservationSources = asResult("reservationSources");
  const payments = asResult("payments");
  const shipments = asResult("shipments");
  const purchaseRows = asResult("purchaseRows");
  const purchaseSources = asResult("purchaseSources");
  const inventorySources = asResult("inventorySources");
  const purchaseItems = asResult("purchaseItems");
  const supplierPayments = asResult("supplierPayments");
  const receipts = asResult("receipts");
  const products = asResult("products");
  const glassesInventory = asResult("glassesInventory");
  const boxInventory = asResult("boxInventory");
  const glassLots = asResult("glassLots");
  const boxLots = asResult("boxLots");
  const movements = asResult("movements");
  const customers = asResult("customers");
  const defectiveProducts = asResult("defectiveProducts");

  const group = <T extends Record<string, unknown>>(rows: T[], key: string) => rows.reduce<Record<string, T[]>>((acc, row) => {
    const id = String(row[key] ?? "");
    (acc[id] ||= []).push(row);
    return acc;
  }, {});
  const itemsByOrder = group(orderItems.results as Record<string, unknown>[], "order_id");
  const sourcesByOrder = Object.fromEntries((reservationSources.results as Record<string, unknown>[]).map((row) => [String(row.order_id), String(row.sources || "")]));
  const paymentsByOrder = group(payments.results as Record<string, unknown>[], "order_id");
  const shipmentsByOrder = Object.fromEntries((shipments.results as Record<string, unknown>[]).map((row) => [String(row.order_id), row]));
  const purchaseItemsByOrder = group(purchaseItems.results as Record<string, unknown>[], "purchase_order_id");
  const supplierPaymentsByOrder = group(supplierPayments.results as Record<string, unknown>[], "purchase_order_id");
  const receiptsByOrder = group(receipts.results as Record<string, unknown>[], "purchase_order_id");
  const response: Record<string, unknown> = { scope };
  if (requestedKeys.has("metrics")) response.metrics = metrics;
  if (requestedKeys.has("orderRows")) response.orders = (orderRows.results as Record<string, unknown>[]).map((row) => ({ ...row,
      tracking_source: sourcesByOrder[String(row.id)] || String(row.source_supplier || "").trim() || "",
      items: itemsByOrder[String(row.id)] || [], payments: paymentsByOrder[String(row.id)] || [], shipment: shipmentsByOrder[String(row.id)] || null }));
  if (requestedKeys.has("purchaseRows")) response.purchaseOrders = (purchaseRows.results as Record<string, unknown>[]).map((row) => ({ ...row,
      status: String(row.merged_into_order_id || "") ? "MERGED" : row.status,
      items: purchaseItemsByOrder[String(row.id)] || [], payments: supplierPaymentsByOrder[String(row.id)] || [], receipts: receiptsByOrder[String(row.id)] || [] }));
  if (requestedKeys.has("products")) response.products = products.results;
  if (requestedKeys.has("glassesInventory")) response.glassesInventory = glassesInventory.results;
  if (requestedKeys.has("boxInventory")) response.boxInventory = boxInventory.results;
  if (requestedKeys.has("glassLots") || requestedKeys.has("boxLots")) {
    response.lots = [...glassLots.results, ...boxLots.results].sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
  }
  if (requestedKeys.has("movements")) response.movements = movements.results;
  if (requestedKeys.has("customers")) response.customers = customers.results;
  if (requestedKeys.has("defectiveProducts")) response.defectiveProducts = defectiveProducts.results;
  if (requestedKeys.has("orderSources")) response.orderSources = orderSources.results;
  if (requestedKeys.has("purchaseSources")) response.purchaseSources = purchaseSources.results;
  if (requestedKeys.has("inventorySources")) response.inventorySources = inventorySources.results;
  return response;
}
