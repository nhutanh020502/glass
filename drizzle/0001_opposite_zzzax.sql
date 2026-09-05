CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_key` text NOT NULL,
	`display_name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`phone_normalized` text DEFAULT '' NOT NULL,
	`primary_address` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'app' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_key` ON `customers` (`customer_key`);--> statement-breakpoint
CREATE INDEX `idx_customers_phone` ON `customers` (`phone_normalized`);--> statement-breakpoint
CREATE INDEX `idx_customers_name` ON `customers` (`display_name`);--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `product_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `carrier` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `lens_value` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `cut_lens` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_debt` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `chat_link` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `source_supplier` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `source_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `consumption_order` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `source_row` integer;--> statement-breakpoint
CREATE INDEX `idx_orders_customer_id` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_source_row` ON `orders` (`source_row`);