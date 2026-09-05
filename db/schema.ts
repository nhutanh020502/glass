import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    customerKey: text("customer_key").notNull(),
    displayName: text("display_name").notNull(),
    phone: text("phone").notNull().default(""),
    phoneNormalized: text("phone_normalized").notNull().default(""),
    primaryAddress: text("primary_address").notNull().default(""),
    source: text("source").notNull().default("app"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_customers_key").on(table.customerKey),
    index("idx_customers_phone").on(table.phoneNormalized),
    index("idx_customers_name").on(table.displayName),
  ],
);

export const glassesLots = sqliteTable(
  "glasses_lots",
  {
    id: text("id").primaryKey(),
    receivedAt: text("received_at").notNull(),
    supplier: text("supplier").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    receivedQty: integer("received_qty").notNull(),
    remainingQty: integer("remaining_qty").notNull(),
    unitCost: integer("unit_cost").notNull(),
    includedBoxSku: text("included_box_sku"),
    includedBoxName: text("included_box_name"),
    includedBoxQty: integer("included_box_qty").notNull().default(0),
    includedBoxRemaining: integer("included_box_remaining").notNull().default(0),
    stockStatus: text("stock_status").notNull().default("AVAILABLE"),
    sourceRow: integer("source_row"),
    sourceKey: text("source_key").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    purchaseOrderItemId: text("purchase_order_item_id"),
    receiptId: text("receipt_id"),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (table) => [
    index("idx_glasses_lots_sku_remaining").on(table.sku, table.remainingQty, table.receivedAt),
    index("idx_glasses_lots_status_sku_remaining").on(table.stockStatus, table.sku, table.remainingQty, table.receivedAt),
  ],
);

export const boxLots = sqliteTable(
  "box_lots",
  {
    id: text("id").primaryKey(),
    receivedAt: text("received_at").notNull(),
    supplier: text("supplier").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    originType: text("origin_type").notNull(),
    receivedQty: integer("received_qty").notNull(),
    remainingQty: integer("remaining_qty").notNull(),
    unitCost: integer("unit_cost").notNull(),
    sourceGlassesLotId: text("source_glasses_lot_id"),
    sourceOrderId: text("source_order_id"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    purchaseOrderItemId: text("purchase_order_item_id"),
    receiptId: text("receipt_id"),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (table) => [
    index("idx_box_lots_sku_remaining").on(table.sku, table.remainingQty, table.receivedAt),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    orderDate: text("order_date").notNull(),
    customer: text("customer").notNull(),
    phone: text("phone").notNull().default(""),
    orderType: text("order_type").notNull(),
    glassesSku: text("glasses_sku"),
    boxSku: text("box_sku"),
    revenue: integer("revenue").notNull(),
    deposit: integer("deposit").notNull().default(0),
    ship: integer("ship").notNull().default(0),
    shipPayer: text("ship_payer").notNull().default("SELLER"),
    status: text("status").notNull(),
    glassesCost: integer("glasses_cost").notNull().default(0),
    boxCost: integer("box_cost").notNull().default(0),
    profit: integer("profit").notNull().default(0),
    glassesLotId: text("glasses_lot_id"),
    boxLotId: text("box_lot_id"),
    boxSource: text("box_source"),
    customerId: text("customer_id"),
    productCode: text("product_code").notNull().default(""),
    address: text("address").notNull().default(""),
    carrier: text("carrier").notNull().default(""),
    lensValue: integer("lens_value").notNull().default(0),
    cutLens: text("cut_lens").notNull().default(""),
    customerDebt: text("customer_debt").notNull().default(""),
    chatLink: text("chat_link").notNull().default(""),
    sourceSupplier: text("source_supplier").notNull().default(""),
    sourceKey: text("source_key").notNull().default(""),
    consumptionOrder: integer("consumption_order"),
    sourceRow: integer("source_row"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    workflowStatus: text("workflow_status"),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (table) => [
    index("idx_orders_status_date").on(table.status, table.orderDate),
    index("idx_orders_glasses_sku").on(table.glassesSku),
    index("idx_orders_box_sku").on(table.boxSku),
    index("idx_orders_customer_id").on(table.customerId),
    index("idx_orders_source_row").on(table.sourceRow),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    brand: text("brand").notNull().default(""),
    model: text("model").notNull().default(""),
    color: text("color").notNull().default(""),
    compatibleBoxSku: text("compatible_box_sku").notNull().default(""),
    sourceSupplier: text("source_supplier").notNull().default(""),
    lastPurchasePrice: integer("last_purchase_price").notNull().default(0),
    suggestedSalePrice: integer("suggested_sale_price").notNull().default(0),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_products_kind_sku").on(table.kind, table.sku)],
);

export const purchaseOrders = sqliteTable(
  "purchase_orders",
  {
    id: text("id").primaryKey(), code: text("code").notNull().unique(), orderDate: text("order_date").notNull(),
    supplier: text("supplier").notNull(), status: text("status").notNull(), totalAmount: integer("total_amount").notNull().default(0),
    shipCost: integer("ship_cost").notNull().default(0),
    mergedIntoOrderId: text("merged_into_order_id").notNull().default(""),
    mergedAt: text("merged_at").notNull().default(""),
    note: text("note").notNull().default(""), createdBy: text("created_by").notNull().default(""),
    createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_purchase_orders_status_date").on(table.status, table.orderDate),
    index("idx_purchase_orders_merged_into").on(table.mergedIntoOrderId),
  ],
);

export const purchaseOrderItems = sqliteTable(
  "purchase_order_items",
  {
    id: text("id").primaryKey(), purchaseOrderId: text("purchase_order_id").notNull(), lineNo: integer("line_no").notNull(),
    kind: text("kind").notNull(), fulfillmentType: text("fulfillment_type").notNull(), linkGroupId: text("link_group_id").notNull().default(""),
    sku: text("sku").notNull(), name: text("name").notNull(), orderedQty: integer("ordered_qty").notNull(),
    receivedQty: integer("received_qty").notNull().default(0), activatedQty: integer("activated_qty").notNull().default(0),
    unitCost: integer("unit_cost").notNull().default(0), sourceSupplier: text("source_supplier").notNull().default(""),
    originPurchaseOrderId: text("origin_purchase_order_id").notNull().default(""),
    originPurchaseOrderItemId: text("origin_purchase_order_item_id").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_purchase_items_order").on(table.purchaseOrderId, table.lineNo),
    index("idx_purchase_items_source").on(table.sourceSupplier),
  ],
);

export const supplierPayments = sqliteTable("supplier_payments", {
  id: text("id").primaryKey(), purchaseOrderId: text("purchase_order_id").notNull(), paymentDate: text("payment_date").notNull(),
  amount: integer("amount").notNull(), paymentType: text("payment_type").notNull(), method: text("method").notNull().default(""),
  note: text("note").notNull().default(""), createdBy: text("created_by").notNull().default(""), createdAt: text("created_at").notNull(),
});

export const goodsReceipts = sqliteTable(
  "goods_receipts",
  {
    id: text("id").primaryKey(), code: text("code").notNull().unique(), purchaseOrderId: text("purchase_order_id").notNull(),
    receivedAt: text("received_at").notNull(), note: text("note").notNull().default(""), createdBy: text("created_by").notNull().default(""), createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_receipts_order").on(table.purchaseOrderId, table.receivedAt)],
);

export const goodsReceiptItems = sqliteTable("goods_receipt_items", {
  id: text("id").primaryKey(), receiptId: text("receipt_id").notNull(), purchaseOrderItemId: text("purchase_order_item_id").notNull(),
  quantity: integer("quantity").notNull(), goodQuantity: integer("good_quantity").notNull().default(0),
  defectiveQuantity: integer("defective_quantity").notNull().default(0), boxStockType: text("box_stock_type").notNull().default(""),
  unitCost: integer("unit_cost").notNull().default(0), defectReason: text("defect_reason").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const defectiveProducts = sqliteTable(
  "defective_products",
  {
    id: text("id").primaryKey(), receivedAt: text("received_at").notNull(), kind: text("kind").notNull(),
    sku: text("sku").notNull(), name: text("name").notNull(), quantity: integer("quantity").notNull(),
    unitCost: integer("unit_cost").notNull().default(0), supplier: text("supplier").notNull().default(""),
    purchaseOrderId: text("purchase_order_id").notNull().default(""), purchaseOrderItemId: text("purchase_order_item_id").notNull().default(""),
    receiptId: text("receipt_id").notNull().default(""), defectReason: text("defect_reason").notNull().default(""),
    status: text("status").notNull().default("RECORDED"), note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().default(""), createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_defective_kind_date").on(table.kind, table.receivedAt), index("idx_defective_sku").on(table.sku)],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(), orderId: text("order_id").notNull(), lineNo: integer("line_no").notNull(), lineType: text("line_type").notNull(),
    sku: text("sku").notNull(), name: text("name").notNull().default(""), boxSku: text("box_sku").notNull().default(""),
    sourceSupplier: text("source_supplier").notNull().default(""), boxSourceSupplier: text("box_source_supplier").notNull().default(""),
    quantity: integer("quantity").notNull(), unitPrice: integer("unit_price").notNull().default(0), estimatedCost: integer("estimated_cost").notNull().default(0),
    createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_order_items_order").on(table.orderId, table.lineNo)],
);

export const inventoryReservations = sqliteTable(
  "inventory_reservations",
  {
    id: text("id").primaryKey(), orderId: text("order_id").notNull(), orderItemId: text("order_item_id").notNull(), lotKind: text("lot_kind").notNull(),
    bucket: text("bucket").notNull(), lotId: text("lot_id").notNull(), quantity: integer("quantity").notNull(), unitCost: integer("unit_cost").notNull().default(0),
    sku: text("sku").notNull(), name: text("name").notNull().default(""), lineType: text("line_type").notNull(), status: text("status").notNull(),
    createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_reservations_lot_status").on(table.lotKind, table.lotId, table.status), index("idx_reservations_order_status").on(table.orderId, table.status)],
);

export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    id: text("id").primaryKey(), occurredAt: text("occurred_at").notNull(), itemKind: text("item_kind").notNull(), bucket: text("bucket").notNull(),
    sku: text("sku").notNull(), name: text("name").notNull().default(""), physicalDelta: integer("physical_delta").notNull().default(0), reservedDelta: integer("reserved_delta").notNull().default(0),
    movementType: text("movement_type").notNull(), referenceType: text("reference_type").notNull(), referenceId: text("reference_id").notNull(),
    lotId: text("lot_id").notNull().default(""), reason: text("reason").notNull().default(""), actor: text("actor").notNull().default(""),
  },
  (table) => [index("idx_movements_sku_time").on(table.sku, table.occurredAt)],
);

export const orderPayments = sqliteTable(
  "order_payments",
  {
    id: text("id").primaryKey(), orderId: text("order_id").notNull(), paymentDate: text("payment_date").notNull(), amount: integer("amount").notNull(),
    paymentType: text("payment_type").notNull(), method: text("method").notNull().default(""), note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().default(""), createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_payments_order_date").on(table.orderId, table.paymentDate)],
);

export const shipments = sqliteTable("shipments", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().unique(), carrier: text("carrier").notNull().default(""),
  trackingCode: text("tracking_code").notNull().default(""), estimatedFee: integer("estimated_fee").notNull().default(0), actualFee: integer("actual_fee").notNull().default(0),
  shippedAt: text("shipped_at").notNull().default(""), status: text("status").notNull().default("PENDING"), note: text("note").notNull().default(""), updatedAt: text("updated_at").notNull(),
});

export const orderEvents = sqliteTable(
  "order_events",
  {
    id: text("id").primaryKey(), orderId: text("order_id").notNull(), eventType: text("event_type").notNull(), fromStatus: text("from_status").notNull().default(""),
    toStatus: text("to_status").notNull().default(""), reason: text("reason").notNull().default(""), actor: text("actor").notNull().default(""), createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_events_order_time").on(table.orderId, table.createdAt)],
);

export const testInventory = sqliteTable(
  "test_inventory",
  {
    id: text("id").primaryKey(), kind: text("kind").notNull(), sku: text("sku").notNull(), name: text("name").notNull(),
    sourceSupplier: text("source_supplier").notNull().default(""), onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0), unitCost: integer("unit_cost").notNull().default(0),
    createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_test_inventory_kind_sku").on(table.kind, table.sku)],
);

export const testOrders = sqliteTable(
  "test_orders",
  {
    id: text("id").primaryKey(), code: text("code").notNull().unique(), orderDate: text("order_date").notNull(),
    customer: text("customer").notNull(), phone: text("phone").notNull().default(""), status: text("status").notNull(),
    revenue: integer("revenue").notNull().default(0), cost: integer("cost").notNull().default(0),
    profit: integer("profit").notNull().default(0), note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().default(""), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_test_orders_status_date").on(table.status, table.orderDate)],
);

export const testOrderItems = sqliteTable(
  "test_order_items",
  {
    id: text("id").primaryKey(), orderId: text("order_id").notNull(), lineNo: integer("line_no").notNull(),
    inventoryId: text("inventory_id").notNull(), kind: text("kind").notNull(), sku: text("sku").notNull(), name: text("name").notNull(),
    quantity: integer("quantity").notNull(), unitPrice: integer("unit_price").notNull().default(0),
    unitCost: integer("unit_cost").notNull().default(0), createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_test_order_items_order").on(table.orderId, table.lineNo)],
);

export const testEvents = sqliteTable(
  "test_events",
  {
    id: text("id").primaryKey(), occurredAt: text("occurred_at").notNull(), eventType: text("event_type").notNull(),
    referenceId: text("reference_id").notNull().default(""), description: text("description").notNull().default(""),
    actor: text("actor").notNull().default(""),
  },
  (table) => [index("idx_test_events_time").on(table.occurredAt)],
);

export const appMigrations = sqliteTable("app_migrations", {
  key: text("key").primaryKey(), completedAt: text("completed_at").notNull(), note: text("note").notNull().default(""),
});
