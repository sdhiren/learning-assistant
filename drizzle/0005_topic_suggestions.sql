CREATE TABLE `topic_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`reason` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`dismissed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_suggestions_name_key_unique` ON `topic_suggestions` (`name_key`);