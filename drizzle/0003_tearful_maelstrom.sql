CREATE TABLE `app_migrations` (
	`key` text PRIMARY KEY NOT NULL,
	`completed_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goods_receipt_items` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`purchase_order_item_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goods_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`purchase_order_id` text NOT NULL,
	`received_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goods_receipts_code_unique` ON `goods_receipts` (`code`);--> statement-breakpoint
CREATE INDEX `idx_receipts_order` ON `goods_receipts` (`purchase_order_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`item_kind` text NOT NULL,
	`bucket` text NOT NULL,
	`sku` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`physical_delta` integer DEFAULT 0 NOT NULL,
	`reserved_delta` integer DEFAULT 0 NOT NULL,
	`movement_type` text NOT NULL,
	`reference_type` text NOT NULL,
	`reference_id` text NOT NULL,
	`lot_id` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`actor` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_movements_sku_time` ON `inventory_movements` (`sku`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `inventory_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`order_item_id` text NOT NULL,
	`lot_kind` text NOT NULL,
	`bucket` text NOT NULL,
	`lot_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`sku` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`line_type` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reservations_lot_status` ON `inventory_reservations` (`lot_kind`,`lot_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_reservations_order_status` ON `inventory_reservations` (`order_id`,`status`);--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`event_type` text NOT NULL,
	`from_status` text DEFAULT '' NOT NULL,
	`to_status` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`actor` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_order_time` ON `order_events` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`line_type` text NOT NULL,
	`sku` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`box_sku` text DEFAULT '' NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer DEFAULT 0 NOT NULL,
	`estimated_cost` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_order_items_order` ON `order_items` (`order_id`,`line_no`);--> statement-breakpoint
CREATE TABLE `order_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`payment_date` text NOT NULL,
	`amount` integer NOT NULL,
	`payment_type` text NOT NULL,
	`method` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_payments_order_date` ON `order_payments` (`order_id`,`payment_date`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`compatible_box_sku` text DEFAULT '' NOT NULL,
	`source_supplier` text DEFAULT '' NOT NULL,
	`last_purchase_price` integer DEFAULT 0 NOT NULL,
	`suggested_sale_price` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_kind_sku` ON `products` (`kind`,`sku`);--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`kind` text NOT NULL,
	`fulfillment_type` text NOT NULL,
	`link_group_id` text DEFAULT '' NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`ordered_qty` integer NOT NULL,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`activated_qty` integer DEFAULT 0 NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_items_order` ON `purchase_order_items` (`purchase_order_id`,`line_no`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`order_date` text NOT NULL,
	`supplier` text NOT NULL,
	`status` text NOT NULL,
	`total_amount` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_code_unique` ON `purchase_orders` (`code`);--> statement-breakpoint
CREATE INDEX `idx_purchase_orders_status_date` ON `purchase_orders` (`status`,`order_date`);--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`carrier` text DEFAULT '' NOT NULL,
	`tracking_code` text DEFAULT '' NOT NULL,
	`estimated_fee` integer DEFAULT 0 NOT NULL,
	`actual_fee` integer DEFAULT 0 NOT NULL,
	`shipped_at` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipments_order_id_unique` ON `shipments` (`order_id`);--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`payment_date` text NOT NULL,
	`amount` integer NOT NULL,
	`payment_type` text NOT NULL,
	`method` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `box_lots` ADD `purchase_order_item_id` text;--> statement-breakpoint
ALTER TABLE `box_lots` ADD `receipt_id` text;--> statement-breakpoint
ALTER TABLE `box_lots` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `glasses_lots` ADD `purchase_order_item_id` text;--> statement-breakpoint
ALTER TABLE `glasses_lots` ADD `receipt_id` text;--> statement-breakpoint
ALTER TABLE `glasses_lots` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `workflow_status` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `updated_at` text DEFAULT '' NOT NULL;