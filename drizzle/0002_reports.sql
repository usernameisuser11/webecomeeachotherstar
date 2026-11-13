CREATE TABLE IF NOT EXISTS `reports` (
  `id` text PRIMARY KEY NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `room_id` text,
  `reporter_hash` text NOT NULL,
  `reason` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `reports_target_reporter_unique`
  ON `reports` (`target_type`, `target_id`, `reporter_hash`);
