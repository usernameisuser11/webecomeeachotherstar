CREATE TABLE `glows` (
	`id` text PRIMARY KEY NOT NULL,
	`from_hash` text NOT NULL,
	`to_star_id` text NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`to_star_id`) REFERENCES `stars`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `glows_once_per_day` ON `glows` (`from_hash`,`to_star_id`,`day`);--> statement-breakpoint
CREATE TABLE `presence` (
	`owner_hash` text PRIMARY KEY NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stars` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`name` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`hue` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stars_owner_unique` ON `stars` (`owner_hash`);