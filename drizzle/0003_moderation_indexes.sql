CREATE INDEX IF NOT EXISTS `reports_room_id_idx` ON `reports` (`room_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reports_reporter_created_idx` ON `reports` (`reporter_hash`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `room_stars_room_id_idx` ON `room_stars` (`room_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `room_glows_room_id_idx` ON `room_glows` (`room_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `rooms_owner_hash_idx` ON `rooms` (`owner_hash`);
