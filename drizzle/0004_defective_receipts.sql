ALTER TABLE `goods_receipt_items` ADD `good_quantity` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `goods_receipt_items` ADD `defective_quantity` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `goods_receipt_items` ADD `box_stock_type` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `goods_receipt_items` ADD `unit_cost` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `goods_receipt_items` ADD `defect_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `goods_receipt_items` SET `good_quantity` = `quantity`
WHERE `good_quantity` = 0 AND `defective_quantity` = 0;
--> statement-breakpoint
UPDATE `goods_receipt_items` SET `box_stock_type` = CASE
  WHEN (SELECT `fulfillment_type` FROM `purchase_order_items` pi WHERE pi.`id` = `goods_receipt_items`.`purchase_order_item_id`) = 'ATTACHED_BOX' THEN 'ATTACHED'
  WHEN (SELECT `fulfillment_type` FROM `purchase_order_items` pi WHERE pi.`id` = `goods_receipt_items`.`purchase_order_item_id`) = 'LOOSE_BOX' THEN 'LOOSE'
  ELSE '' END
WHERE `box_stock_type` = '';
--> statement-breakpoint
CREATE TABLE `defective_products` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` text NOT NULL,
	`kind` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`purchase_order_id` text DEFAULT '' NOT NULL,
	`purchase_order_item_id` text DEFAULT '' NOT NULL,
	`receipt_id` text DEFAULT '' NOT NULL,
	`defect_reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'RECORDED' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_defective_kind_date` ON `defective_products` (`kind`,`received_at`);
--> statement-breakpoint
CREATE INDEX `idx_defective_sku` ON `defective_products` (`sku`);
--> statement-breakpoint
PRAGMA optimize;
