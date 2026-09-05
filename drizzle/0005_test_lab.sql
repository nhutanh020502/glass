CREATE TABLE `test_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`source_supplier` text DEFAULT '' NOT NULL,
	`on_hand` integer DEFAULT 0 NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_test_inventory_kind_sku` ON `test_inventory` (`kind`,`sku`);
--> statement-breakpoint
CREATE TABLE `test_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`order_date` text NOT NULL,
	`customer` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`revenue` integer DEFAULT 0 NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`profit` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "test_orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE INDEX `idx_test_orders_status_date` ON `test_orders` (`status`,`order_date`);
--> statement-breakpoint
CREATE TABLE `test_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`inventory_id` text NOT NULL,
	`kind` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer DEFAULT 0 NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_test_order_items_order` ON `test_order_items` (`order_id`,`line_no`);
--> statement-breakpoint
CREATE TABLE `test_events` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`event_type` text NOT NULL,
	`reference_id` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`actor` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_test_events_time` ON `test_events` (`occurred_at`);
