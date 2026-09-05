CREATE TABLE `box_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` text NOT NULL,
	`supplier` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`origin_type` text NOT NULL,
	`received_qty` integer NOT NULL,
	`remaining_qty` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	`source_glasses_lot_id` text,
	`source_order_id` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_box_lots_sku_remaining` ON `box_lots` (`sku`,`remaining_qty`,`received_at`);--> statement-breakpoint
CREATE TABLE `glasses_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` text NOT NULL,
	`supplier` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`received_qty` integer NOT NULL,
	`remaining_qty` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	`included_box_sku` text,
	`included_box_name` text,
	`included_box_qty` integer DEFAULT 0 NOT NULL,
	`included_box_remaining` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_glasses_lots_sku_remaining` ON `glasses_lots` (`sku`,`remaining_qty`,`received_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`order_date` text NOT NULL,
	`customer` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`order_type` text NOT NULL,
	`glasses_sku` text,
	`box_sku` text,
	`revenue` integer NOT NULL,
	`deposit` integer DEFAULT 0 NOT NULL,
	`ship` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`glasses_cost` integer DEFAULT 0 NOT NULL,
	`box_cost` integer DEFAULT 0 NOT NULL,
	`profit` integer DEFAULT 0 NOT NULL,
	`glasses_lot_id` text,
	`box_lot_id` text,
	`box_source` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_code_unique` ON `orders` (`code`);--> statement-breakpoint
CREATE INDEX `idx_orders_status_date` ON `orders` (`status`,`order_date`);--> statement-breakpoint
CREATE INDEX `idx_orders_glasses_sku` ON `orders` (`glasses_sku`);--> statement-breakpoint
CREATE INDEX `idx_orders_box_sku` ON `orders` (`box_sku`);