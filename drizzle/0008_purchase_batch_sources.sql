ALTER TABLE `purchase_orders` ADD `merged_into_order_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `merged_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `source_supplier` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `origin_purchase_order_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `origin_purchase_order_item_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `purchase_order_items`
SET `source_supplier` = COALESCE((
  SELECT `purchase_orders`.`supplier`
  FROM `purchase_orders`
  WHERE `purchase_orders`.`id` = `purchase_order_items`.`purchase_order_id`
), '')
WHERE TRIM(`source_supplier`) = '';
--> statement-breakpoint
CREATE INDEX `idx_purchase_orders_merged_into` ON `purchase_orders` (`merged_into_order_id`);
--> statement-breakpoint
CREATE INDEX `idx_purchase_items_source` ON `purchase_order_items` (`source_supplier`);
--> statement-breakpoint
PRAGMA optimize;
