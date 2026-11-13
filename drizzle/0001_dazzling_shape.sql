CREATE TABLE `room_glows` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`from_hash` text NOT NULL,
	`to_star_id` text NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_star_id`) REFERENCES `room_stars`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_glows_once_per_day` ON `room_glows` (`from_hash`,`to_star_id`,`day`);--> statement-breakpoint
CREATE TABLE `room_presence` (
	`room_id` text NOT NULL,
	`owner_hash` text NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_presence_person_room_unique` ON `room_presence` (`room_id`,`owner_hash`);--> statement-breakpoint
CREATE TABLE `room_stars` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`owner_hash` text NOT NULL,
	`name` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`hue` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_stars_owner_room_unique` ON `room_stars` (`owner_hash`,`room_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`name` text NOT NULL,
	`visibility` text NOT NULL,
	`theme` text DEFAULT 'forest' NOT NULL,
	`invite_hash` text,
	`created_at` integer NOT NULL
);
