ALTER TABLE `glasses_lots` ADD `stock_status` text DEFAULT 'AVAILABLE' NOT NULL;--> statement-breakpoint
ALTER TABLE `glasses_lots` ADD `source_row` integer;--> statement-breakpoint
ALTER TABLE `glasses_lots` ADD `source_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_glasses_lots_status_sku_remaining` ON `glasses_lots` (`stock_status`,`sku`,`remaining_qty`,`received_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO `glasses_lots` (
  `id`, `received_at`, `supplier`, `sku`, `name`, `received_qty`, `remaining_qty`, `unit_cost`,
  `included_box_sku`, `included_box_name`, `included_box_qty`, `included_box_remaining`,
  `stock_status`, `source_row`, `source_key`, `note`, `created_at`
) VALUES
('xlsx-glass-row-17', '2025-12-26', 'TL858', 'GM HEIZER / XANH | TL858', 'GM HEIZER / XANH', 1, 1, 870000, 'BOX GM | TL858', 'BOX GM', 1, 1, 'AVAILABLE', 17, 'GM HEIZER / XANH  | TL858', 'Excel 2026 · dòng 17', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-121', '2026-05-28', 'CONG', 'GM TOMY 01 / ĐEN | CONG', 'GM TOMY 01 / ĐEN', 1, 1, 330000, 'BOX GM | CONG', 'BOX GM', 1, 1, 'AVAILABLE', 121, 'GM TOMY 01 / ĐEN | CONG', 'Excel 2026 · dòng 121', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-122', '2026-05-29', 'CONG', 'AMIRI HOLLYWOOD BS | CONG', 'AMIRI HOLLYWOOD BS', 1, 1, 1100000, 'BOX AM | CONG', 'BOX AM', 1, 1, 'AVAILABLE', 122, 'AMIRI HOLLYWOOD BS | CONG', 'Excel 2026 · dòng 122', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-130', '2026-06-06', 'CONG', 'GM EVAN 01 | CONG', 'GM EVAN 01', 1, 1, 550000, 'BOX GM | CONG', 'BOX GM', 1, 1, 'AVAILABLE', 130, 'GM EVAN 01 | CONG', 'Excel 2026 · dòng 130', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-137', '2026-06-19', 'CONG', 'GM SOUTH SIDE N 01 | CONG', 'GM South Side N 01', 1, 1, 550000, 'BOX GM | CONG', 'BOX GM', 1, 1, 'AVAILABLE', 137, 'GM South Side N 01 | CONG', 'Excel 2026 · dòng 137', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-139', '2026-06-19', 'CONG', 'GM EVAN 01 | CONG', 'GM EVAN 01', 1, 1, 550000, 'BOX GM | CONG', 'BOX GM', 1, 1, 'AVAILABLE', 139, 'GM EVAN 01 | CONG', 'Excel 2026 · dòng 139', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-144', '2026-06-24', 'HD626', 'GM MOODY 01 | HD626', 'GM Moody 01', 1, 1, 550000, 'BOX GM | HD626', 'BOX GM', 1, 1, 'AVAILABLE', 144, 'GM Moody 01 | HD626', 'Excel 2026 · dòng 144', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-147', '2026-06-25', 'CONG', 'AMIRI HOLLYWOOD BS / BLUE | CONG', 'AMIRI HOLLYWOOD BS / BLUE', 1, 1, 1100000, 'BOX AM | CONG', 'BOX AM', 1, 1, 'AVAILABLE', 147, 'AMIRI HOLLYWOOD BS / BLUE | CONG', 'Excel 2026 · dòng 147', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-149', '2026-06-28', 'CONG', 'GM MOODY 02 | CONG', 'GM Moody 02', 1, 1, 550000, 'BOX GM | CONG', 'BOX GM', 1, 1, 'AVAILABLE', 149, 'GM Moody 02 | CONG', 'Excel 2026 · dòng 149', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-150', '2026-06-28', 'CONG', 'PRADA PR65Z | CONG', 'PRADA PR65Z', 1, 1, 600000, 'BOX PR | CONG', 'BOX PR', 1, 1, 'AVAILABLE', 150, 'PRADA PR65Z | CONG', 'Excel 2026 · dòng 150', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-152', '2026-06-30', 'CONG', 'TF5934-B 016 | CONG', 'TF5934-B 016', 1, 1, 850000, 'BOX TF | CONG', 'BOX TF', 1, 1, 'AVAILABLE', 152, 'TF5934-B 016 | CONG', 'Excel 2026 · dòng 152', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-156', '2026-07-02', 'CONG', 'CL 40235U 01A BLACK / BLACK | CONG', 'CL 40235U 01A BLACK / BLACK', 1, 1, 580000, 'BOX CL | CONG', 'BOX CL', 1, 1, 'AVAILABLE', 156, 'CL 40235U 01A BLACK / BLACK | CONG', 'Excel 2026 · dòng 156', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-166', '2026-07-10', 'CONG', 'JD JOHN DALIA PROJECT 03 / BLACK | CONG', 'JD John Dalia Project 03 / Black', 1, 1, 1100000, 'BOX JD | CONG', 'BOX JD', 1, 1, 'AVAILABLE', 166, 'JD John Dalia Project 03 / Black | CONG', 'Excel 2026 · dòng 166', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-172', '2026-07-10', 'CONG', 'SL 634 NOVA 001 | CONG', 'SL 634 NOVA 001', 1, 1, 550000, 'BOX SL | CONG', 'BOX SL', 1, 1, 'AVAILABLE', 172, 'SL 634 NOVA 001 | CONG', 'Excel 2026 · dòng 172', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-178', '2026-07-18', 'CONG', 'AMIRI HOLLYWOOD BS / XANH | CONG', 'AMIRI HOLLYWOOD BS / XANH', 2, 2, 1100000, 'BOX AM | CONG', 'BOX AM', 2, 2, 'AVAILABLE', 178, 'AMIRI HOLLYWOOD BS / XANH | CONG', 'Excel 2026 · dòng 178', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-179', '2026-07-18', 'CONG', 'AMIRI HOLLYWOOD BS / ĐEN | CONG', 'AMIRI HOLLYWOOD BS / ĐEN', 1, 1, 1100000, 'BOX AM | CONG', 'BOX AM', 1, 1, 'AVAILABLE', 179, 'AMIRI HOLLYWOOD BS / ĐEN | CONG', 'Excel 2026 · dòng 179', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-182', '2026-07-21', 'HD626', 'GC GG1840 001 | HD626', 'GC GG1840 001', 3, 3, 480000, 'BOX GC | HD626', 'BOX GC', 3, 3, 'AVAILABLE', 182, 'GC GG1840 001 | HD626', 'Excel 2026 · dòng 182', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-183', '2026-07-21', 'HD626', 'JQ JACQUES MARIE MAGE JULIEN 11N / CAM | HD626', 'JQ JACQUES MARIE MAGE JULIEN 11N / CAM', 1, 1, 750000, 'BOX JQ | HD626', 'BOX JQ', 1, 1, 'AVAILABLE', 183, 'JQ JACQUES MARIE MAGE JULIEN 11N / CAM | HD626', 'Excel 2026 · dòng 183', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-184', '2026-07-21', 'HD626', 'JQ JACQUES MARIE MAGE JULIEN 11N / ĐEN | HD626', 'JQ JACQUES MARIE MAGE JULIEN 11N / ĐEN', 1, 1, 750000, 'BOX JQ | HD626', 'BOX JQ', 1, 1, 'AVAILABLE', 184, 'JQ JACQUES MARIE MAGE JULIEN 11N / ĐEN | HD626', 'Excel 2026 · dòng 184', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-191', '2026-08-04', 'HD626', 'GM ALTO 01 / TRÀ | HD626', 'GM ALTO 01 / TRÀ', 1, 1, 700000, 'BOX GM | HD626', 'BOX GM', 1, 1, 'AVAILABLE', 191, 'GM ALTO 01 / TRÀ | HD626', 'Excel 2026 · dòng 191', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-194', '2026-08-07', 'CONG', 'MONTBLANC MB02450 002 | CONG', 'MONTBLANC MB02450 002', 2, 2, 600000, 'BOX MO | CONG', 'BOX MO', 2, 2, 'AVAILABLE', 194, 'MONTBLANC MB02450 002 | CONG', 'Excel 2026 · dòng 194', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-195', '2026-08-07', 'CONG', 'MONTBLANC MB00710 002 | CONG', 'MONTBLANC MB00710 002', 2, 2, 600000, 'BOX MO | CONG', 'BOX MO', 2, 2, 'AVAILABLE', 195, 'MONTBLANC MB00710 002 | CONG', 'Excel 2026 · dòng 195', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-196', '2026-08-07', 'CONG', 'CARTIER CT02870A 002 | CONG', 'CARTIER CT02870A 002', 3, 3, 700000, 'BOX CA | CONG', 'BOX CA', 3, 3, 'AVAILABLE', 196, 'CARTIER CT02870A 002 | CONG', 'Excel 2026 · dòng 196', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-198', '2026-08-10', 'CONG', 'CH AMBIDIXTROUS BS | CONG', 'CH AMBIDIXTROUS BS', 1, 1, 850000, 'BOX CH | CONG', 'BOX CH', 1, 1, 'AVAILABLE', 198, 'CH AMBIDIXTROUS BS | CONG', 'Excel 2026 · dòng 198', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-200', '2026-08-14', 'CONG', 'GM BREEZEBE 01 / ĐEN | CONG', 'GM BREEZEBE 01 / ĐEN', 1, 1, 610000, 'BOX GM | CONG', 'BOX GM', 1, 1, 'AVAILABLE', 200, 'GM BREEZEBE 01 / ĐEN | CONG', 'Excel 2026 · dòng 200', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-201', '2026-08-14', 'HD626', 'GM ALTO 01 / CLEAR | HD626', 'GM ALTO 01 / CLEAR', 1, 1, 660000, 'BOX GM | HD626', 'BOX GM', 1, 1, 'AVAILABLE', 201, 'GM ALTO 01 / CLEAR | HD626', 'Excel 2026 · dòng 201', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-202', '2026-08-14', 'HD626', 'GM ALTO 01 / TRÀ | HD626', 'GM ALTO 01 / TRÀ', 3, 3, 660000, 'BOX GM | HD626', 'BOX GM', 3, 3, 'AVAILABLE', 202, 'GM ALTO 01 / TRÀ | HD626', 'Excel 2026 · dòng 202', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-203', '2026-08-19', 'HD626', 'CHANEL 2227S C450 | HD626', 'CHANEL 2227S C450', 1, 1, 500000, NULL, NULL, 0, 0, 'INCOMING', 203, 'CHANEL 2227S C450 | HD626', 'nobox · Excel 2026 · dòng 203', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-204', '2026-08-19', 'HD626', 'GC GG1840 001 | HD626', 'GC GG1840 001', 2, 2, 430000, NULL, NULL, 0, 0, 'INCOMING', 204, 'GC GG1840 001 | HD626', 'nobox · Excel 2026 · dòng 204', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-205', '2026-08-19', 'HD626', 'CH AMBIDIXTROUS BS | HD626', 'CH AMBIDIXTROUS BS', 2, 2, 600000, NULL, NULL, 0, 0, 'INCOMING', 205, 'CH AMBIDIXTROUS BS | HD626', 'nobox · Excel 2026 · dòng 205', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-206', '2026-08-20', 'CONG', 'TF 5683-B 005 | CONG', 'TF 5683-B 005', 2, 2, 1380000, 'BOX TF | CONG', 'BOX TF', 2, 2, 'INCOMING', 206, 'TF 5683-B 005 | CONG', 'Excel 2026 · dòng 206', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-207', '2026-08-20', 'CONG', 'GM ALTO GC9 | CONG', 'GM ALTO GC9', 2, 2, 500000, NULL, NULL, 0, 0, 'INCOMING', 207, 'GM ALTO GC9 | CONG', 'nobox · Excel 2026 · dòng 207', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-208', '2026-08-20', 'CONG', 'CHANEL | CONG', 'CHANEL', 1, 1, 830000, 'BOX CH | CONG', 'BOX CH', 1, 1, 'INCOMING', 208, 'CHANEL | CONG', 'Excel 2026 · dòng 208', '2026-08-24T00:00:00.000Z'),
('xlsx-glass-row-985', '2026-08-19', 'CONG', 'CHANEL 2227S C450 | CONG', 'CHANEL 2227S C450', 1, 1, 650000, NULL, NULL, 0, 0, 'INCOMING', 985, 'CHANEL 2227S C450 | CONG', 'CHƯA ĐẶT · Excel 2026 · dòng 985', '2026-08-24T00:00:00.000Z');
--> statement-breakpoint
INSERT OR IGNORE INTO `box_lots` (
  `id`, `received_at`, `supplier`, `sku`, `name`, `origin_type`, `received_qty`,
  `remaining_qty`, `unit_cost`, `note`, `created_at`
) VALUES
('xlsx-box-row-11', '2026-08-24', 'TL858', 'BOX KU | TL858', 'BOX KU', 'excel_2026', 1, 1, 0, 'Excel 2026 · dòng 11 · theo cột CÒN LẠI', '2026-08-24T00:00:00.000Z'),
('xlsx-box-row-22', '2026-08-24', 'CONG', 'BOX GM | CONG', 'BOX GM', 'excel_2026', 4, 4, 120000, 'Excel 2026 · dòng 22 · theo cột CÒN LẠI', '2026-08-24T00:00:00.000Z'),
('xlsx-box-row-23', '2026-08-24', 'CONG', 'BOX CH | CONG', 'BOX CH', 'excel_2026', 3, 3, 150000, 'Excel 2026 · dòng 23 · theo cột CÒN LẠI', '2026-08-24T00:00:00.000Z'),
('xlsx-box-row-24', '2026-08-24', 'CONG', 'BOX GC | CONG', 'BOX GC', 'excel_2026', 4, 4, 120000, 'Excel 2026 · dòng 24 · theo cột CÒN LẠI', '2026-08-24T00:00:00.000Z'),
('xlsx-box-row-26', '2026-08-24', 'S', 'BOX CH SAN_S | S', 'BOX CH SAN_S', 'excel_2026', 1, 1, 215000, 'Excel 2026 · dòng 26 · theo cột CÒN LẠI', '2026-08-24T00:00:00.000Z'),
('xlsx-box-row-27', '2026-08-24', 'S', 'BOX GC SAN_S | S', 'BOX GC SAN_S', 'excel_2026', 2, 2, 176000, 'Excel 2026 · dòng 27 · theo cột CÒN LẠI', '2026-08-24T00:00:00.000Z');
