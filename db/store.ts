import { getDb, type DatabaseAdapter } from "./supabase";

type LotType = "full_box" | "glasses_only" | "box_only";
type OrderType = "glasses_with_box" | "glasses_only" | "box_only";
type OrderStatus = "PROCESS" | "DONE";
type BoxMode = "attached" | "loose";

export type CreateLotInput = {
  lotType: LotType;
  receivedAt: string;
  supplier: string;
  glassesSku?: string;
  glassesName?: string;
  glassesQty?: number;
  glassesUnitCost?: number;
  boxSku?: string;
  boxName?: string;
  totalBoxQty?: number;
  looseBoxUnitCost?: number;
  note?: string;
};

export type CreateOrderInput = {
  orderDate: string;
  customer: string;
  phone?: string;
  address?: string;
  orderType: OrderType;
  glassesSku?: string;
  boxSku?: string;
  boxMode?: BoxMode;
  revenue: number;
  deposit?: number;
  ship?: number;
  status: OrderStatus;
  note?: string;
};

export type UpdateOrderInput = CreateOrderInput & {
  glassesCost?: number;
  boxCost?: number;
  productCode?: string;
  carrier?: string;
  lensValue?: number;
  cutLens?: string;
  customerDebt?: string;
  chatLink?: string;
  sourceSupplier?: string;
};

export type OrderSearchInput = {
  customer?: string;
  product?: string;
  fromDate?: string;
  toDate?: string;
  status?: "PROCESS" | "DONE" | "";
  page?: number;
  pageSize?: number;
};

export type HistoricalOrderInput = {
  id: string;
  code: string;
  sourceRow: number;
  orderDate: string;
  customer: string;
  phone?: string;
  address?: string;
  productCode?: string;
  carrier?: string;
  lensValue?: number;
  cutLens?: string;
  customerDebt?: string;
  chatLink?: string;
  sourceSupplier?: string;
  sourceKey?: string;
  consumptionOrder?: number;
  orderType: OrderType;
  glassesSku?: string | null;
  boxSku?: string | null;
  revenue: number;
  deposit: number;
  ship: number;
  status: OrderStatus;
  glassesCost: number;
  boxCost: number;
  profit: number;
  note?: string;
};

type GlassesLot = {
  id: string;
  sku: string;
  name: string;
  unit_cost: number;
  remaining_qty: number;
  included_box_sku: string | null;
  included_box_name: string | null;
  included_box_remaining: number;
  supplier: string;
};

type BoxLot = {
  id: string;
  sku: string;
  name: string;
  unit_cost: number;
  remaining_qty: number;
};

type AllocationPlan = {
  glassesLot: GlassesLot | null;
  boxLot: BoxLot | null;
  glassesCost: number;
  boxCost: number;
  boxSource: "included" | "loose" | "loose_override" | "none";
  resolvedBoxSku: string | null;
  resolvedBoxName: string | null;
  releasesIncludedBox: boolean;
};

type InventoryCredit = {
  glassesLotId?: string | null;
  includedBoxCredit?: boolean;
  boxLotId?: string | null;
};

type CustomerRecord = {
  id: string;
  key: string;
  displayName: string;
  phone: string;
  phoneNormalized: string;
  primaryAddress: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type PreparedHistoricalOrder = {
  input: HistoricalOrderInput;
  id: string;
  code: string;
  sourceRow: number;
  orderDate: string;
  customer: string;
  phone: string;
  address: string;
  glassesSku: string | null;
  boxSku: string | null;
  revenue: number;
  deposit: number;
  ship: number;
  glassesCost: number;
  boxCost: number;
  lensValue: number;
  consumptionOrder: number;
  profit: number;
  createdAt: string;
  customerProfile: CustomerRecord;
};

let schemaPromise: Promise<void> | null = null;

function getD1(): DatabaseAdapter {
  return getDb();
}

export function ensureSchema() {
  schemaPromise ??= (async () => {
    const db = getD1();
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        customer_key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        phone_normalized TEXT NOT NULL DEFAULT '',
        primary_address TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'app',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS glasses_lots (
        id TEXT PRIMARY KEY,
        received_at TEXT NOT NULL,
        supplier TEXT NOT NULL,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        received_qty INTEGER NOT NULL CHECK(received_qty > 0),
        remaining_qty INTEGER NOT NULL CHECK(remaining_qty >= 0),
        unit_cost INTEGER NOT NULL CHECK(unit_cost >= 0),
        included_box_sku TEXT,
        included_box_name TEXT,
        included_box_qty INTEGER NOT NULL DEFAULT 0 CHECK(included_box_qty >= 0),
        included_box_remaining INTEGER NOT NULL DEFAULT 0 CHECK(included_box_remaining >= 0),
        stock_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(stock_status IN ('AVAILABLE','INCOMING')),
        source_row INTEGER,
        source_key TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS box_lots (
        id TEXT PRIMARY KEY,
        received_at TEXT NOT NULL,
        supplier TEXT NOT NULL,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        origin_type TEXT NOT NULL,
        received_qty INTEGER NOT NULL CHECK(received_qty > 0),
        remaining_qty INTEGER NOT NULL CHECK(remaining_qty >= 0),
        unit_cost INTEGER NOT NULL CHECK(unit_cost >= 0),
        source_glasses_lot_id TEXT,
        source_order_id TEXT,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        order_date TEXT NOT NULL,
        customer TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        order_type TEXT NOT NULL CHECK(order_type IN ('glasses_with_box','glasses_only','box_only')),
        glasses_sku TEXT,
        box_sku TEXT,
        revenue INTEGER NOT NULL CHECK(revenue >= 0),
        deposit INTEGER NOT NULL DEFAULT 0 CHECK(deposit >= 0),
        ship INTEGER NOT NULL DEFAULT 0 CHECK(ship >= 0),
        status TEXT NOT NULL CHECK(status IN ('PROCESS','DONE')),
        glasses_cost INTEGER NOT NULL DEFAULT 0,
        box_cost INTEGER NOT NULL DEFAULT 0,
        profit INTEGER NOT NULL DEFAULT 0,
        glasses_lot_id TEXT,
        box_lot_id TEXT,
        box_source TEXT,
        customer_id TEXT,
        product_code TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        carrier TEXT NOT NULL DEFAULT '',
        lens_value INTEGER NOT NULL DEFAULT 0,
        cut_lens TEXT NOT NULL DEFAULT '',
        customer_debt TEXT NOT NULL DEFAULT '',
        chat_link TEXT NOT NULL DEFAULT '',
        source_supplier TEXT NOT NULL DEFAULT '',
        source_key TEXT NOT NULL DEFAULT '',
        consumption_order INTEGER,
        source_row INTEGER,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_glasses_lots_sku_remaining ON glasses_lots(sku, remaining_qty, received_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_box_lots_sku_remaining ON box_lots(sku, remaining_qty, received_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, order_date)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_glasses_sku ON orders(glasses_sku)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_box_sku ON orders(box_sku)"),
    ]);

    const orderColumns = await db.prepare("PRAGMA table_info(orders)").all<{ name: string }>();
    const existingColumns = new Set(orderColumns.results.map((column) => String(column.name)));
    const additions: Array<[string, string]> = [
      ["customer_id", "TEXT"],
      ["product_code", "TEXT NOT NULL DEFAULT ''"],
      ["address", "TEXT NOT NULL DEFAULT ''"],
      ["carrier", "TEXT NOT NULL DEFAULT ''"],
      ["lens_value", "INTEGER NOT NULL DEFAULT 0"],
      ["cut_lens", "TEXT NOT NULL DEFAULT ''"],
      ["customer_debt", "TEXT NOT NULL DEFAULT ''"],
      ["chat_link", "TEXT NOT NULL DEFAULT ''"],
      ["source_supplier", "TEXT NOT NULL DEFAULT ''"],
      ["source_key", "TEXT NOT NULL DEFAULT ''"],
      ["consumption_order", "INTEGER"],
      ["source_row", "INTEGER"],
    ];
    for (const [name, definition] of additions) {
      if (!existingColumns.has(name)) await db.prepare(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`).run();
    }

    const glassesColumns = await db.prepare("PRAGMA table_info(glasses_lots)").all<{ name: string }>();
    const existingGlassesColumns = new Set(glassesColumns.results.map((column) => String(column.name)));
    const glassesAdditions: Array<[string, string]> = [
      ["stock_status", "TEXT NOT NULL DEFAULT 'AVAILABLE'"],
      ["source_row", "INTEGER"],
      ["source_key", "TEXT NOT NULL DEFAULT ''"],
    ];
    for (const [name, definition] of glassesAdditions) {
      if (!existingGlassesColumns.has(name)) await db.prepare(`ALTER TABLE glasses_lots ADD COLUMN ${name} ${definition}`).run();
    }

    await db.batch([
      db.prepare("CREATE INDEX IF NOT EXISTS idx_glasses_lots_status_sku_remaining ON glasses_lots(stock_status, sku, remaining_qty, received_at)"),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_key ON customers(customer_key)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_normalized)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(display_name)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_source_row ON orders(source_row)"),
      db.prepare("PRAGMA optimize"),
    ]);
  })();
  return schemaPromise;
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`Vui lòng nhập ${label}.`);
  return text;
}

function sku(value: unknown, label: string) {
  return requiredText(value, label).replace(/\s+/g, " ").toUpperCase();
}

function amount(value: unknown, label: string, min = 0) {
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed < min) throw new Error(`${label} không hợp lệ.`);
  return parsed;
}

function signedInteger(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} không hợp lệ.`);
  return parsed;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateFrom2026(value: unknown, label: string) {
  const parsed = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || parsed < "2026-01-01") {
    throw new Error(`${label} phải từ ngày 01/01/2026 trở đi.`);
  }
  return parsed;
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeKeyText(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");
}

async function customerRecord(
  nameValue: unknown,
  phoneValue: unknown,
  addressValue: unknown,
  source: string,
  updatedAt: string,
): Promise<CustomerRecord> {
  const displayName = requiredText(nameValue, "tên khách hàng");
  const phone = String(phoneValue ?? "").trim();
  const phoneNormalized = normalizePhone(phone);
  const primaryAddress = String(addressValue ?? "").trim();
  const key = phoneNormalized.length >= 8
    ? `phone:${phoneNormalized}`
    : `fallback:${normalizeKeyText(displayName)}|${normalizeKeyText(primaryAddress)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    id: `cust-${hash.slice(0, 16)}`,
    key,
    displayName,
    phone,
    phoneNormalized,
    primaryAddress,
    source,
    createdAt: updatedAt,
    updatedAt,
  };
}

function upsertCustomerStatement(db: D1Database, customer: CustomerRecord) {
  return db.prepare(`INSERT INTO customers (
    id, customer_key, display_name, phone, phone_normalized, primary_address,
    source, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(customer_key) DO UPDATE SET
    display_name = CASE WHEN excluded.updated_at >= customers.updated_at THEN excluded.display_name ELSE customers.display_name END,
    phone = CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE customers.phone END,
    phone_normalized = CASE WHEN excluded.phone_normalized <> '' THEN excluded.phone_normalized ELSE customers.phone_normalized END,
    primary_address = CASE WHEN excluded.updated_at >= customers.updated_at AND excluded.primary_address <> '' THEN excluded.primary_address ELSE customers.primary_address END,
    source = CASE WHEN customers.source = 'app' THEN customers.source ELSE excluded.source END,
    updated_at = MAX(customers.updated_at, excluded.updated_at)`)
    .bind(customer.id, customer.key, customer.displayName, customer.phone, customer.phoneNormalized,
      customer.primaryAddress, customer.source, customer.createdAt, customer.updatedAt);
}

function orderCode() {
  const stamp = today().replaceAll("-", "").slice(2);
  return `DH-${stamp}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

export async function createLot(input: CreateLotInput) {
  await ensureSchema();
  const db = getD1();
  const now = new Date().toISOString();
  const receivedAt = dateFrom2026(input.receivedAt || today(), "Ngày nhập");
  const supplier = requiredText(input.supplier, "nguồn nhập");
  const note = String(input.note ?? "").trim();
  const statements: D1PreparedStatement[] = [];

  if (input.lotType === "full_box" || input.lotType === "glasses_only") {
    const glassesSku = sku(input.glassesSku, "mã kính");
    const glassesName = requiredText(input.glassesName, "tên kính");
    const glassesQty = amount(input.glassesQty, "Số lượng kính", 1);
    const glassesUnitCost = amount(input.glassesUnitCost, "Giá nhập kính");
    const glassLotId = crypto.randomUUID();
    let includedBoxSku: string | null = null;
    let includedBoxName: string | null = null;
    let includedBoxQty = 0;

    if (input.lotType === "full_box") {
      includedBoxSku = sku(input.boxSku, "mã box");
      includedBoxName = requiredText(input.boxName, "tên box");
      const totalBoxQty = amount(input.totalBoxQty, "Tổng số box", glassesQty);
      includedBoxQty = glassesQty;
      const looseQty = totalBoxQty - includedBoxQty;
      statements.push(
        db.prepare(`INSERT INTO glasses_lots (
          id, received_at, supplier, sku, name, received_qty, remaining_qty, unit_cost,
          included_box_sku, included_box_name, included_box_qty, included_box_remaining,
          note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(glassLotId, receivedAt, supplier, glassesSku, glassesName, glassesQty, glassesQty, glassesUnitCost,
            includedBoxSku, includedBoxName, includedBoxQty, includedBoxQty, note, now),
      );
      if (looseQty > 0) {
        const looseCost = amount(input.looseBoxUnitCost, "Giá nhập box lẻ");
        statements.push(
          db.prepare(`INSERT INTO box_lots (
            id, received_at, supplier, sku, name, origin_type, received_qty,
            remaining_qty, unit_cost, source_glasses_lot_id, note, created_at
          ) VALUES (?, ?, ?, ?, ?, 'purchased_extra', ?, ?, ?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), receivedAt, supplier, includedBoxSku, includedBoxName,
              looseQty, looseQty, looseCost, glassLotId, note, now),
        );
      }
    } else {
      statements.push(
        db.prepare(`INSERT INTO glasses_lots (
          id, received_at, supplier, sku, name, received_qty, remaining_qty, unit_cost,
          included_box_qty, included_box_remaining, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`)
          .bind(glassLotId, receivedAt, supplier, glassesSku, glassesName, glassesQty, glassesQty, glassesUnitCost, note, now),
      );
    }
  } else if (input.lotType === "box_only") {
    const boxSku = sku(input.boxSku, "mã box");
    const boxName = requiredText(input.boxName, "tên box");
    const boxQty = amount(input.totalBoxQty, "Số lượng box", 1);
    const boxCost = amount(input.looseBoxUnitCost, "Giá nhập box");
    statements.push(
      db.prepare(`INSERT INTO box_lots (
        id, received_at, supplier, sku, name, origin_type, received_qty,
        remaining_qty, unit_cost, note, created_at
      ) VALUES (?, ?, ?, ?, ?, 'box_only', ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), receivedAt, supplier, boxSku, boxName, boxQty, boxQty, boxCost, note, now),
    );
  } else {
    throw new Error("Loại lô nhập không hợp lệ.");
  }

  await db.batch(statements);
  return { ok: true };
}

async function buildAllocation(
  input: Pick<CreateOrderInput, "orderType" | "glassesSku" | "boxSku" | "boxMode">,
  credit: InventoryCredit = {},
): Promise<AllocationPlan> {
  const db = getD1();
  let glassesLot: GlassesLot | null = null;
  let boxLot: BoxLot | null = null;
  let glassesCost = 0;
  let boxCost = 0;
  let boxSource: AllocationPlan["boxSource"] = "none";
  let resolvedBoxSku: string | null = input.boxSku ? sku(input.boxSku, "mã box") : null;
  let resolvedBoxName: string | null = null;
  let releasesIncludedBox = false;
  const requestedBoxMode: BoxMode = input.boxMode === "loose" ? "loose" : "attached";

  if (input.orderType !== "box_only") {
    const glassesSku = sku(input.glassesSku, "mã kính");
    const creditedGlassesLotId = credit.glassesLotId ?? "";
    if (input.orderType === "glasses_with_box") {
      glassesLot = await db.prepare(`SELECT id, sku, name, unit_cost, remaining_qty,
        included_box_sku, included_box_name, included_box_remaining, supplier
        FROM glasses_lots WHERE stock_status = 'AVAILABLE' AND sku = ?
          AND (remaining_qty > 0 OR id = ?)
          AND (included_box_remaining > 0 OR (id = ? AND ? = 1))
        ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, received_at, created_at, id LIMIT 1`)
        .bind(glassesSku, creditedGlassesLotId, creditedGlassesLotId,
          credit.includedBoxCredit ? 1 : 0, creditedGlassesLotId).first<GlassesLot>();
    }
    if (!glassesLot) {
      glassesLot = await db.prepare(`SELECT id, sku, name, unit_cost, remaining_qty,
        included_box_sku, included_box_name, included_box_remaining, supplier
        FROM glasses_lots WHERE stock_status = 'AVAILABLE' AND sku = ? AND (remaining_qty > 0 OR id = ?)
        ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, received_at, created_at, id LIMIT 1`)
        .bind(glassesSku, creditedGlassesLotId, creditedGlassesLotId).first<GlassesLot>();
    }
    if (!glassesLot) throw new Error(`Kính ${glassesSku} đã hết tồn kho.`);
    if (glassesLot.id === credit.glassesLotId) {
      glassesLot = {
        ...glassesLot,
        remaining_qty: glassesLot.remaining_qty + 1,
        included_box_remaining: glassesLot.included_box_remaining + (credit.includedBoxCredit ? 1 : 0),
      };
    }
    glassesCost = glassesLot.unit_cost;
  }

  if (input.orderType === "glasses_with_box" && glassesLot) {
    const hasIncludedBox = glassesLot.included_box_remaining > 0 && Boolean(glassesLot.included_box_sku);
    if (requestedBoxMode === "attached" && hasIncludedBox) {
      boxSource = "included";
      boxCost = 0;
      resolvedBoxSku = glassesLot.included_box_sku;
      resolvedBoxName = glassesLot.included_box_name;
    } else {
      const selectedBoxSku = sku(resolvedBoxSku, "box lẻ cho đơn hàng");
      boxLot = await db.prepare(`SELECT id, sku, name, unit_cost, remaining_qty
        FROM box_lots WHERE sku = ? AND (remaining_qty > 0 OR id = ?)
        ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, received_at, created_at, id LIMIT 1`)
        .bind(selectedBoxSku, credit.boxLotId ?? "", credit.boxLotId ?? "").first<BoxLot>();
      if (!boxLot) throw new Error(`Box ${selectedBoxSku} đã hết tồn kho.`);
      if (boxLot.id === credit.boxLotId) boxLot = { ...boxLot, remaining_qty: boxLot.remaining_qty + 1 };
      if (requestedBoxMode === "loose" && hasIncludedBox) {
        boxSource = "loose_override";
        releasesIncludedBox = true;
      } else {
        boxSource = "loose";
      }
      boxCost = boxLot.unit_cost;
      resolvedBoxSku = boxLot.sku;
      resolvedBoxName = boxLot.name;
    }
  }

  if (input.orderType === "glasses_only" && glassesLot?.included_box_remaining) {
    releasesIncludedBox = true;
    resolvedBoxSku = glassesLot.included_box_sku;
    resolvedBoxName = glassesLot.included_box_name;
  }

  if (input.orderType === "box_only") {
    const selectedBoxSku = sku(resolvedBoxSku, "mã box");
    boxLot = await db.prepare(`SELECT id, sku, name, unit_cost, remaining_qty
      FROM box_lots WHERE sku = ? AND (remaining_qty > 0 OR id = ?)
      ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, received_at, created_at, id LIMIT 1`)
      .bind(selectedBoxSku, credit.boxLotId ?? "", credit.boxLotId ?? "").first<BoxLot>();
    if (!boxLot) throw new Error(`Box ${selectedBoxSku} đã hết tồn kho.`);
    if (boxLot.id === credit.boxLotId) boxLot = { ...boxLot, remaining_qty: boxLot.remaining_qty + 1 };
    boxSource = "loose";
    boxCost = boxLot.unit_cost;
    resolvedBoxSku = boxLot.sku;
    resolvedBoxName = boxLot.name;
  }

  return { glassesLot, boxLot, glassesCost, boxCost, boxSource, resolvedBoxSku, resolvedBoxName, releasesIncludedBox };
}

function allocationStatements(db: D1Database, plan: AllocationPlan, orderId: string, now: string, orderDate: string) {
  const statements: D1PreparedStatement[] = [];
  if (plan.glassesLot) {
    const includedDelta = plan.boxSource === "included" || plan.releasesIncludedBox ? 1 : 0;
    statements.push(
      db.prepare(`UPDATE glasses_lots SET
        remaining_qty = remaining_qty - 1,
        included_box_remaining = included_box_remaining - ?
        WHERE id = ? AND remaining_qty > 0 AND included_box_remaining >= ?`)
        .bind(includedDelta, plan.glassesLot.id, includedDelta),
    );
  }
  if (plan.boxLot) {
    statements.push(
      db.prepare("UPDATE box_lots SET remaining_qty = remaining_qty - 1 WHERE id = ? AND remaining_qty > 0")
        .bind(plan.boxLot.id),
    );
  }
  if (plan.releasesIncludedBox && plan.glassesLot?.included_box_sku && plan.glassesLot.included_box_name) {
    statements.push(
      db.prepare(`INSERT INTO box_lots (
        id, received_at, supplier, sku, name, origin_type, received_qty, remaining_qty,
        unit_cost, source_glasses_lot_id, source_order_id, note, created_at
      ) VALUES (?, ?, ?, ?, ?, 'released_included', 1, 1, 0, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), orderDate, plan.glassesLot.supplier, plan.glassesLot.included_box_sku,
          plan.glassesLot.included_box_name, plan.glassesLot.id, orderId,
          plan.boxSource === "loose_override"
            ? "Box kèm được tách ra vì đơn dùng box lẻ nguồn khác"
            : "Box được tách ra khi bán kính không kèm box",
          now),
    );
  }
  return statements;
}

export async function createOrder(input: CreateOrderInput) {
  await ensureSchema();
  const db = getD1();
  const customer = requiredText(input.customer, "tên khách hàng");
  const phone = String(input.phone ?? "").trim();
  const address = String(input.address ?? "").trim();
  const orderDate = dateFrom2026(input.orderDate || today(), "Ngày đơn");
  const revenue = amount(input.revenue, "Doanh thu");
  const deposit = amount(input.deposit, "Tiền cọc");
  const ship = amount(input.ship, "Phí ship");
  if (deposit > revenue) throw new Error("Tiền cọc không thể lớn hơn doanh thu.");
  const plan = await buildAllocation(input);
  const id = crypto.randomUUID();
  const code = orderCode();
  const now = new Date().toISOString();
  const profit = revenue - plan.glassesCost - plan.boxCost - ship;
  const customerProfile = await customerRecord(customer, phone, address, "app", now);
  const statements: D1PreparedStatement[] = [upsertCustomerStatement(db, customerProfile)];

  if (input.status === "DONE") statements.push(...allocationStatements(db, plan, id, now, orderDate));
  statements.push(
    db.prepare(`INSERT INTO orders (
      id, code, order_date, customer, phone, order_type, glasses_sku, box_sku,
      revenue, deposit, ship, status, glasses_cost, box_cost, profit,
      glasses_lot_id, box_lot_id, box_source, customer_id, address, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, code, orderDate, customer, phone, input.orderType,
        plan.glassesLot?.sku ?? null, plan.resolvedBoxSku, revenue, deposit, ship, input.status,
        plan.glassesCost, plan.boxCost, profit, input.status === "DONE" ? plan.glassesLot?.id ?? null : null,
        input.status === "DONE" ? plan.boxLot?.id ?? null : null, plan.boxSource, customerProfile.id, address,
        String(input.note ?? "").trim(), now),
  );
  await db.batch(statements);
  return { ok: true, code };
}

export async function receiveGlassesLot(idValue: string) {
  await ensureSchema();
  const id = requiredText(idValue, "mã lô kính");
  const db = getD1();
  const result = await db.prepare(`UPDATE glasses_lots
    SET stock_status = 'AVAILABLE'
    WHERE id = ? AND stock_status = 'INCOMING'`).bind(id).run();
  if (Number(result.meta.changes ?? 0) === 0) {
    const lot = await db.prepare("SELECT stock_status FROM glasses_lots WHERE id = ?").bind(id)
      .first<{ stock_status: string }>();
    if (!lot) throw new Error("Không tìm thấy lô kính.");
    if (lot.stock_status === "AVAILABLE") return { ok: true, received: false };
    throw new Error("Trạng thái lô kính không hợp lệ.");
  }
  return { ok: true, received: true };
}

export async function importHistoricalOrders(inputs: HistoricalOrderInput[]) {
  await ensureSchema();
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 300) {
    throw new Error("Danh sách đơn nhập phải có từ 1 đến 300 dòng.");
  }
  const db = getD1();
  const prepared: PreparedHistoricalOrder[] = [];
  for (const input of inputs) {
    const id = requiredText(input.id, "mã nguồn");
    const code = requiredText(input.code, "mã đơn");
    if (!/^xlsx-2026-row-\d{4}$/.test(id) || !/^XLS26-\d{4}$/.test(code)) {
      throw new Error("Mã dòng Excel không đúng định dạng.");
    }
    const sourceRow = amount(input.sourceRow, "Dòng Excel", 2);
    const orderDate = dateFrom2026(input.orderDate, "Ngày đơn");
    const customer = requiredText(input.customer, "tên khách hàng");
    const phone = String(input.phone ?? "").trim();
    const address = String(input.address ?? "").trim();
    if (!(["glasses_with_box", "glasses_only", "box_only"] as string[]).includes(input.orderType)) {
      throw new Error(`Loại đơn ở dòng ${sourceRow} không hợp lệ.`);
    }
    if (!(["PROCESS", "DONE"] as string[]).includes(input.status)) {
      throw new Error(`Trạng thái ở dòng ${sourceRow} không hợp lệ.`);
    }
    const glassesSku = input.glassesSku ? requiredText(input.glassesSku, "tên kính") : null;
    const boxSku = input.boxSku ? requiredText(input.boxSku, "tên box") : null;
    if (input.orderType !== "box_only" && !glassesSku) throw new Error(`Dòng ${sourceRow} thiếu kính.`);
    if (input.orderType !== "glasses_only" && !boxSku) throw new Error(`Dòng ${sourceRow} thiếu box.`);
    const revenue = amount(input.revenue, "Doanh thu");
    const deposit = amount(input.deposit, "Tiền cọc");
    const ship = amount(input.ship, "Phí ship");
    const glassesCost = amount(input.glassesCost, "Giá nhập kính");
    const boxCost = amount(input.boxCost, "Giá box");
    const lensValue = amount(input.lensValue, "Giá tròng");
    const consumptionOrder = amount(input.consumptionOrder, "Thứ tự tiêu thụ", 1);
    const profit = signedInteger(input.profit, "Lợi nhuận");
    if (deposit > revenue) throw new Error(`Tiền cọc dòng ${sourceRow} lớn hơn doanh thu.`);
    const createdAt = `${orderDate}T12:00:${String(sourceRow % 60).padStart(2, "0")}.000Z`;
    const customerProfile = await customerRecord(customer, phone, address, "excel_2026", createdAt);
    prepared.push({ input, id, code, sourceRow, orderDate, customer, phone, address, glassesSku, boxSku,
      revenue, deposit, ship, glassesCost, boxCost, lensValue, consumptionOrder, profit, createdAt, customerProfile });
  }

  const customerMap = new Map<string, CustomerRecord>();
  for (const row of prepared) {
    const current = customerMap.get(row.customerProfile.id);
    if (!current || row.customerProfile.updatedAt >= current.updatedAt) customerMap.set(row.customerProfile.id, row.customerProfile);
  }
  const customerStatements = [...customerMap.values()].map((customer) => upsertCustomerStatement(db, customer));
  for (let start = 0; start < customerStatements.length; start += 50) {
    await db.batch(customerStatements.slice(start, start + 50));
  }

  const statements = prepared.map((row) => db.prepare(`INSERT INTO orders (
      id, code, order_date, customer, phone, order_type, glasses_sku, box_sku,
      revenue, deposit, ship, status, glasses_cost, box_cost, profit,
      glasses_lot_id, box_lot_id, box_source, customer_id, product_code, address,
      carrier, lens_value, cut_lens, customer_debt, chat_link, source_supplier, source_key,
      consumption_order, source_row,
      note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'excel_2026',
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      order_date = excluded.order_date,
      customer = excluded.customer,
      phone = excluded.phone,
      order_type = excluded.order_type,
      glasses_sku = excluded.glasses_sku,
      box_sku = excluded.box_sku,
      revenue = excluded.revenue,
      deposit = excluded.deposit,
      ship = excluded.ship,
      status = excluded.status,
      glasses_cost = excluded.glasses_cost,
      box_cost = excluded.box_cost,
      profit = excluded.profit,
      box_source = excluded.box_source,
      customer_id = excluded.customer_id,
      product_code = excluded.product_code,
      address = excluded.address,
      carrier = excluded.carrier,
      lens_value = excluded.lens_value,
      cut_lens = excluded.cut_lens,
      customer_debt = excluded.customer_debt,
      chat_link = excluded.chat_link,
      source_supplier = excluded.source_supplier,
      source_key = excluded.source_key,
      consumption_order = excluded.consumption_order,
      source_row = excluded.source_row,
      note = excluded.note,
      created_at = excluded.created_at`)
      .bind(row.id, row.code, row.orderDate, row.customer, row.phone, row.input.orderType,
        row.glassesSku, row.boxSku, row.revenue, row.deposit, row.ship, row.input.status,
        row.glassesCost, row.boxCost, row.profit, row.customerProfile.id,
        String(row.input.productCode ?? "").trim(), row.address, String(row.input.carrier ?? "").trim(),
        row.lensValue, String(row.input.cutLens ?? "").trim(), String(row.input.customerDebt ?? "").trim(),
        String(row.input.chatLink ?? "").trim(), String(row.input.sourceSupplier ?? "").trim(),
        String(row.input.sourceKey ?? "").trim(), row.consumptionOrder, row.sourceRow,
        String(row.input.note ?? "").trim(), row.createdAt));

  for (let start = 0; start < statements.length; start += 50) {
    await db.batch(statements.slice(start, start + 50));
  }

  const audit = await db.prepare(`SELECT
    COUNT(*) AS imported,
    COUNT(DISTINCT customer_id) AS customers,
    COALESCE(SUM(revenue), 0) AS revenue,
    COALESCE(SUM(deposit), 0) AS deposit,
    COALESCE(SUM(ship), 0) AS ship,
    COALESCE(SUM(glasses_cost), 0) AS glasses_cost,
    COALESCE(SUM(box_cost), 0) AS box_cost,
    COALESCE(SUM(profit), 0) AS profit,
    COALESCE(SUM(CASE WHEN status = 'PROCESS' THEN 1 ELSE 0 END), 0) AS processing
    FROM orders WHERE id LIKE 'xlsx-2026-row-%'`).first<Record<string, number>>();
  return {
    ok: true,
    imported: Number(audit?.imported ?? 0),
    customers: Number(audit?.customers ?? 0),
    processing: Number(audit?.processing ?? 0),
    totals: {
      revenue: Number(audit?.revenue ?? 0),
      deposit: Number(audit?.deposit ?? 0),
      ship: Number(audit?.ship ?? 0),
      glassesCost: Number(audit?.glasses_cost ?? 0),
      boxCost: Number(audit?.box_cost ?? 0),
      profit: Number(audit?.profit ?? 0),
    },
  };
}

export async function completeOrder(id: string) {
  await ensureSchema();
  const db = getD1();
  const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<Record<string, string | number | null>>();
  if (!order) throw new Error("Không tìm thấy đơn hàng.");
  if (order.status === "DONE") return { ok: true };
  if (order.box_source === "excel_2026") {
    await db.prepare("UPDATE orders SET status = 'DONE' WHERE id = ? AND status = 'PROCESS'").bind(id).run();
    return { ok: true };
  }
  const plan = await buildAllocation({
    orderType: order.order_type as OrderType,
    glassesSku: order.glasses_sku as string | undefined,
    boxSku: order.box_sku as string | undefined,
    boxMode: order.order_type === "glasses_with_box" && order.box_source !== "included" ? "loose" : "attached",
  });
  const now = new Date().toISOString();
  const profit = Number(order.revenue) - plan.glassesCost - plan.boxCost - Number(order.ship);
  const statements = allocationStatements(db, plan, id, now, String(order.order_date));
  statements.push(
    db.prepare(`UPDATE orders SET status = 'DONE', glasses_cost = ?, box_cost = ?, profit = ?,
      glasses_lot_id = ?, box_lot_id = ?, box_source = ?, box_sku = ? WHERE id = ? AND status = 'PROCESS'`)
      .bind(plan.glassesCost, plan.boxCost, profit, plan.glassesLot?.id ?? null, plan.boxLot?.id ?? null,
        plan.boxSource, plan.resolvedBoxSku, id),
  );
  await db.batch(statements);
  return { ok: true };
}

export async function updateOrder(idValue: string, input: UpdateOrderInput) {
  await ensureSchema();
  const db = getD1();
  const id = requiredText(idValue, "mã đơn");
  const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id)
    .first<Record<string, string | number | null>>();
  if (!order) throw new Error("Không tìm thấy đơn hàng.");

  const orderType = input.orderType;
  if (!(Object.keys({ glasses_with_box: 1, glasses_only: 1, box_only: 1 }) as string[]).includes(orderType)) {
    throw new Error("Loại đơn không hợp lệ.");
  }
  const status = input.status;
  if (!(status === "PROCESS" || status === "DONE")) throw new Error("Trạng thái đơn không hợp lệ.");

  const isHistorical = order.box_source === "excel_2026" || /^xlsx-2026-row-\d{4}$/.test(id);
  const customer = requiredText(input.customer, "tên khách hàng");
  const phone = String(input.phone ?? "").trim();
  const address = String(input.address ?? "").trim();
  const orderDate = dateFrom2026(input.orderDate, "Ngày đơn");
  const revenue = amount(input.revenue, "Doanh thu");
  const deposit = amount(input.deposit, "Tiền cọc");
  const ship = amount(input.ship, "Phí ship");
  if (deposit > revenue) throw new Error("Tiền cọc không thể lớn hơn doanh thu.");

  const normalizeEditedSku = (value: unknown, label: string) => isHistorical
    ? requiredText(value, label).replace(/\s+/g, " ")
    : sku(value, label);
  const requestedBoxMode: BoxMode = input.boxMode === "loose" ? "loose" : "attached";
  const glassesSku = orderType === "box_only" ? null : normalizeEditedSku(input.glassesSku, "kính");
  const boxSku = orderType === "glasses_only"
    ? null
    : isHistorical || orderType === "box_only" || requestedBoxMode === "loose"
      ? normalizeEditedSku(input.boxSku, "box")
      : null;
  const oldGlassesSku = order.glasses_sku ? String(order.glasses_sku) : null;
  const oldBoxSku = order.box_sku ? String(order.box_sku) : null;
  const oldBoxMode: BoxMode = order.box_source === "included" ? "attached" : "loose";
  const boxSelectionChanged = isHistorical
    ? oldBoxSku !== boxSku
    : orderType === "box_only"
      ? oldBoxSku !== boxSku
      : orderType === "glasses_with_box"
        ? oldBoxMode !== requestedBoxMode || (requestedBoxMode === "loose" && oldBoxSku !== boxSku)
        : false;
  const allocationChanged = String(order.status) !== status
    || String(order.order_type) !== orderType
    || oldGlassesSku !== glassesSku
    || boxSelectionChanged;

  const now = new Date().toISOString();
  const customerProfile = await customerRecord(customer, phone, address, isHistorical ? "excel_2026" : "app", now);
  const statements: D1PreparedStatement[] = [upsertCustomerStatement(db, customerProfile)];

  let glassesCost = isHistorical ? amount(input.glassesCost, "Giá vốn kính") : Number(order.glasses_cost ?? 0);
  let boxCost = isHistorical ? amount(input.boxCost, "Giá vốn box") : Number(order.box_cost ?? 0);
  let glassesLotId = order.glasses_lot_id ? String(order.glasses_lot_id) : null;
  let boxLotId = order.box_lot_id ? String(order.box_lot_id) : null;
  let boxSource = order.box_source ? String(order.box_source) : "none";
  let storedGlassesSku = isHistorical ? glassesSku : oldGlassesSku;
  let storedBoxSku = isHistorical ? boxSku : oldBoxSku;

  if (!isHistorical && allocationChanged) {
    const releasedBox = await db.prepare(
      "SELECT id, remaining_qty FROM box_lots WHERE source_order_id = ? LIMIT 1",
    ).bind(id).first<{ id: string; remaining_qty: number }>();
    if (releasedBox && Number(releasedBox.remaining_qty) !== 1) {
      throw new Error("Box tách từ đơn này đã được dùng cho đơn khác nên chưa thể đổi sản phẩm hoặc trạng thái.");
    }

    const wasDone = order.status === "DONE";
    const credit: InventoryCredit = wasDone ? {
      glassesLotId,
      includedBoxCredit: boxSource === "included" || boxSource === "loose_override" || Boolean(releasedBox),
      boxLotId,
    } : {};

    if (wasDone) {
      if (glassesLotId) {
        statements.push(db.prepare(`UPDATE glasses_lots SET
          remaining_qty = remaining_qty + 1,
          included_box_remaining = included_box_remaining + ?
          WHERE id = ?`).bind(credit.includedBoxCredit ? 1 : 0, glassesLotId));
      }
      if (boxLotId) statements.push(db.prepare("UPDATE box_lots SET remaining_qty = remaining_qty + 1 WHERE id = ?").bind(boxLotId));
      if (releasedBox) statements.push(db.prepare("DELETE FROM box_lots WHERE id = ? AND remaining_qty = 1").bind(releasedBox.id));
    }

    const plan = await buildAllocation({
      orderType,
      glassesSku: glassesSku ?? undefined,
      boxSku: boxSku ?? undefined,
      boxMode: orderType === "glasses_with_box" ? requestedBoxMode : undefined,
    }, credit);
    glassesCost = plan.glassesCost;
    boxCost = plan.boxCost;
    boxSource = plan.boxSource;
    storedGlassesSku = plan.glassesLot?.sku ?? null;
    storedBoxSku = plan.resolvedBoxSku;
    glassesLotId = null;
    boxLotId = null;
    if (status === "DONE") {
      statements.push(...allocationStatements(db, plan, id, now, orderDate));
      glassesLotId = plan.glassesLot?.id ?? null;
      boxLotId = plan.boxLot?.id ?? null;
    }
  }

  if (isHistorical) {
    glassesLotId = null;
    boxLotId = null;
    boxSource = "excel_2026";
  }
  const profit = revenue - glassesCost - boxCost - ship;
  statements.push(
    db.prepare(`UPDATE orders SET
      order_date = ?, customer = ?, phone = ?, order_type = ?, glasses_sku = ?, box_sku = ?,
      revenue = ?, deposit = ?, ship = ?, status = ?, glasses_cost = ?, box_cost = ?, profit = ?,
      glasses_lot_id = ?, box_lot_id = ?, box_source = ?, customer_id = ?, product_code = ?,
      address = ?, carrier = ?, lens_value = ?, cut_lens = ?, customer_debt = ?, chat_link = ?,
      source_supplier = ?, note = ? WHERE id = ?`)
      .bind(orderDate, customer, phone, orderType, storedGlassesSku, storedBoxSku,
        revenue, deposit, ship, status, glassesCost, boxCost, profit,
        glassesLotId, boxLotId, boxSource, customerProfile.id,
        String(input.productCode ?? order.product_code ?? "").trim(), address,
        String(input.carrier ?? order.carrier ?? "").trim(),
        amount(input.lensValue ?? order.lens_value ?? 0, "Giá tròng"),
        String(input.cutLens ?? order.cut_lens ?? "").trim(),
        String(input.customerDebt ?? order.customer_debt ?? "").trim(),
        String(input.chatLink ?? order.chat_link ?? "").trim(),
        String(input.sourceSupplier ?? order.source_supplier ?? "").trim(),
        String(input.note ?? "").trim(), id),
  );
  if (!allocationChanged && !isHistorical && order.status === "DONE" && order.order_type === "glasses_only") {
    statements.push(db.prepare("UPDATE box_lots SET received_at = ? WHERE source_order_id = ?").bind(orderDate, id));
  }
  if (order.customer_id) {
    statements.push(db.prepare(`DELETE FROM customers WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM orders WHERE customer_id = ?)`)
      .bind(String(order.customer_id), String(order.customer_id)));
  }

  await db.batch(statements);
  return { ok: true, updated: true, code: String(order.code) };
}

export async function searchOrders(input: OrderSearchInput = {}) {
  await ensureSchema();
  const db = getD1();
  const customer = String(input.customer ?? "").trim();
  const product = String(input.product ?? "").trim();
  if (customer.length > 100 || product.length > 100) throw new Error("Nội dung tìm kiếm tối đa 100 ký tự.");

  const fromDate = input.fromDate ? dateFrom2026(input.fromDate, "Ngày bắt đầu") : "";
  const toDate = input.toDate ? dateFrom2026(input.toDate, "Ngày kết thúc") : "";
  if (fromDate && toDate && fromDate > toDate) throw new Error("Ngày bắt đầu không thể sau ngày kết thúc.");
  const status = String(input.status ?? "");
  if (status && status !== "PROCESS" && status !== "DONE") throw new Error("Trạng thái lọc không hợp lệ.");

  const conditions: string[] = [];
  const values: Array<string | number> = [];
  if (customer) {
    conditions.push("(customer LIKE ? OR phone LIKE ?)");
    values.push(`%${customer}%`, `%${customer}%`);
  }
  if (product) {
    conditions.push("(COALESCE(glasses_sku, '') LIKE ? OR COALESCE(box_sku, '') LIKE ? OR COALESCE(product_code, '') LIKE ?)");
    values.push(`%${product}%`, `%${product}%`, `%${product}%`);
  }
  if (fromDate) {
    conditions.push("order_date >= ?");
    values.push(fromDate);
  }
  if (toDate) {
    conditions.push("order_date <= ?");
    values.push(toDate);
  }
  if (status) {
    conditions.push("status = ?");
    values.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const requestedPage = Number.isInteger(Number(input.page)) && Number(input.page) > 0 ? Number(input.page) : 1;
  const pageSize = Number.isInteger(Number(input.pageSize))
    ? Math.min(Math.max(Number(input.pageSize), 10), 100)
    : 50;
  const count = await db.prepare(`SELECT COUNT(*) AS value FROM orders ${where}`)
    .bind(...values).first<{ value: number }>();
  const total = Number(count?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const rows = await db.prepare(`SELECT *, revenue - deposit AS outstanding
    FROM orders ${where}
    ORDER BY order_date DESC, created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...values, pageSize, offset).all();

  return { orders: rows.results, total, page, pageSize, totalPages };
}

export async function getDashboard() {
  await ensureSchema();
  const db = getD1();
  const [glassesMetric, looseBoxMetric, includedBoxMetric, incomingGlassesMetric, incomingBoxesMetric, orderMetric, profitMetric, customerMetric, orderRows, customerRows, glassRows, boxRows, glassesInventory, boxInventory, incomingLots, recentGlassLots, recentBoxLots] = await Promise.all([
    db.prepare("SELECT COALESCE(SUM(remaining_qty), 0) AS value FROM glasses_lots WHERE stock_status = 'AVAILABLE'").first<{ value: number }>(),
    db.prepare("SELECT COALESCE(SUM(remaining_qty), 0) AS value FROM box_lots").first<{ value: number }>(),
    db.prepare("SELECT COALESCE(SUM(included_box_remaining), 0) AS value FROM glasses_lots WHERE stock_status = 'AVAILABLE'").first<{ value: number }>(),
    db.prepare("SELECT COALESCE(SUM(remaining_qty), 0) AS value FROM glasses_lots WHERE stock_status = 'INCOMING'").first<{ value: number }>(),
    db.prepare("SELECT COALESCE(SUM(included_box_remaining), 0) AS value FROM glasses_lots WHERE stock_status = 'INCOMING'").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM orders WHERE status = 'PROCESS'").first<{ value: number }>(),
    db.prepare("SELECT COALESCE(SUM(profit), 0) AS value FROM orders WHERE status = 'DONE' AND substr(order_date, 1, 7) = substr(date('now'), 1, 7)").first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM customers").first<{ value: number }>(),
    db.prepare("SELECT *, revenue - deposit AS outstanding FROM orders ORDER BY order_date DESC, created_at DESC LIMIT 20").all(),
    db.prepare(`SELECT c.id, c.display_name, c.phone, c.primary_address,
      COUNT(o.id) AS order_count,
      COALESCE(SUM(o.revenue), 0) AS total_revenue,
      COALESCE(SUM(o.revenue - o.deposit), 0) AS outstanding,
      MAX(o.order_date) AS last_order_date
      FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id, c.display_name, c.phone, c.primary_address
      ORDER BY last_order_date DESC, c.updated_at DESC LIMIT 30`).all(),
    db.prepare(`SELECT g.sku, MAX(g.name) AS name, SUM(g.remaining_qty) AS remaining_qty,
      SUM(g.included_box_remaining) AS included_box_remaining,
      (SELECT g2.included_box_sku FROM glasses_lots g2
        WHERE g2.stock_status = 'AVAILABLE' AND g2.sku = g.sku
          AND g2.remaining_qty > 0 AND g2.included_box_remaining > 0
        ORDER BY g2.received_at, g2.created_at, g2.id LIMIT 1) AS included_box_sku,
      (SELECT g2.included_box_name FROM glasses_lots g2
        WHERE g2.stock_status = 'AVAILABLE' AND g2.sku = g.sku
          AND g2.remaining_qty > 0 AND g2.included_box_remaining > 0
        ORDER BY g2.received_at, g2.created_at, g2.id LIMIT 1) AS included_box_name
      FROM glasses_lots g WHERE g.stock_status = 'AVAILABLE'
      GROUP BY g.sku HAVING SUM(g.remaining_qty) > 0 ORDER BY name`).all(),
    db.prepare("SELECT sku, MAX(name) AS name, SUM(remaining_qty) AS remaining_qty FROM box_lots GROUP BY sku HAVING SUM(remaining_qty) > 0 ORDER BY name").all(),
    db.prepare(`SELECT sku, MAX(name) AS name, GROUP_CONCAT(DISTINCT supplier) AS suppliers,
      SUM(CASE WHEN stock_status = 'AVAILABLE' THEN remaining_qty ELSE 0 END) AS available_qty,
      SUM(CASE WHEN stock_status = 'AVAILABLE' THEN MIN(remaining_qty, included_box_remaining) ELSE 0 END) AS with_box_qty,
      SUM(CASE WHEN stock_status = 'AVAILABLE' THEN remaining_qty - MIN(remaining_qty, included_box_remaining) ELSE 0 END) AS without_box_qty,
      SUM(CASE WHEN stock_status = 'INCOMING' THEN remaining_qty ELSE 0 END) AS incoming_qty,
      SUM(CASE WHEN stock_status = 'INCOMING' THEN included_box_remaining ELSE 0 END) AS incoming_box_qty
      FROM glasses_lots
      GROUP BY sku
      HAVING SUM(remaining_qty) > 0
      ORDER BY available_qty DESC, incoming_qty DESC, name`).all(),
    db.prepare(`SELECT sku, MAX(name) AS name, GROUP_CONCAT(DISTINCT supplier) AS suppliers,
      SUM(loose_qty) AS loose_qty, SUM(included_qty) AS included_qty,
      SUM(loose_qty + included_qty) AS available_qty, SUM(incoming_qty) AS incoming_qty
      FROM (
        SELECT sku, name, supplier, remaining_qty AS loose_qty, 0 AS included_qty, 0 AS incoming_qty
        FROM box_lots WHERE remaining_qty > 0
        UNION ALL
        SELECT included_box_sku AS sku, included_box_name AS name, supplier, 0 AS loose_qty,
          CASE WHEN stock_status = 'AVAILABLE' THEN included_box_remaining ELSE 0 END AS included_qty,
          CASE WHEN stock_status = 'INCOMING' THEN included_box_remaining ELSE 0 END AS incoming_qty
        FROM glasses_lots WHERE included_box_sku IS NOT NULL AND included_box_remaining > 0
      ) inventory
      GROUP BY sku
      HAVING SUM(loose_qty + included_qty + incoming_qty) > 0
      ORDER BY available_qty DESC, incoming_qty DESC, name`).all(),
    db.prepare(`SELECT id, received_at, supplier, sku, name, received_qty, remaining_qty,
      unit_cost, included_box_qty, included_box_remaining, stock_status, source_row, note,
      'glasses' AS kind FROM glasses_lots WHERE stock_status = 'INCOMING'
      ORDER BY received_at, source_row, created_at`).all(),
    db.prepare(`SELECT id, received_at, supplier, sku, name, received_qty, remaining_qty,
      unit_cost, included_box_qty, included_box_remaining, stock_status, source_row, note, 'glasses' AS kind
      FROM glasses_lots ORDER BY received_at DESC, created_at DESC LIMIT 8`).all(),
    db.prepare(`SELECT id, received_at, supplier, sku, name, received_qty, remaining_qty,
      unit_cost, origin_type, 'AVAILABLE' AS stock_status, NULL AS source_row, note, 'box' AS kind
      FROM box_lots ORDER BY received_at DESC, created_at DESC LIMIT 8`).all(),
  ]);

  const recentLots = [...recentGlassLots.results, ...recentBoxLots.results]
    .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
    .slice(0, 8);

  return {
    metrics: {
      glasses: Number(glassesMetric?.value ?? 0),
      looseBoxes: Number(looseBoxMetric?.value ?? 0),
      includedBoxes: Number(includedBoxMetric?.value ?? 0),
      totalBoxes: Number(looseBoxMetric?.value ?? 0) + Number(includedBoxMetric?.value ?? 0),
      incomingGlasses: Number(incomingGlassesMetric?.value ?? 0),
      incomingBoxes: Number(incomingBoxesMetric?.value ?? 0),
      processingOrders: Number(orderMetric?.value ?? 0),
      monthlyProfit: Number(profitMetric?.value ?? 0),
      customers: Number(customerMetric?.value ?? 0),
    },
    orders: orderRows.results,
    customers: customerRows.results,
    glassesOptions: glassRows.results,
    boxOptions: boxRows.results,
    glassesInventory: glassesInventory.results,
    boxInventory: boxInventory.results,
    incomingLots: incomingLots.results,
    recentLots,
  };
}
