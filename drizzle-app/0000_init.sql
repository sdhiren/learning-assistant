CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_key` text NOT NULL,
	`password_hash` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`target_role` text DEFAULT '' NOT NULL,
	`experience_level` text,
	`interests` text DEFAULT '[]' NOT NULL,
	`db_path` text NOT NULL,
	`ai_provider` text,
	`ai_model` text,
	`kek_salt` text,
	`dek_wrapped` text,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_username_key_unique` ON `profiles` (`username_key`);