ALTER TABLE `order_items` ADD `source_supplier` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_items` ADD `box_source_supplier` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `ship_payer` text DEFAULT 'SELLER' NOT NULL;
