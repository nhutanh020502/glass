CREATE TABLE IF NOT EXISTS `app_migrations` (
  `key` text PRIMARY KEY NOT NULL,
  `completed_at` text NOT NULL,
  `note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
INSERT OR REPLACE INTO `app_migrations` (`key`, `completed_at`, `note`)
VALUES (
  'runtime_schema_ready_v3',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'Schema runtime ready; read requests skip DDL and data backfills.'
);
--> statement-breakpoint
PRAGMA optimize;
