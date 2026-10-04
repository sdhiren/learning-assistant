CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`answer` text NOT NULL,
	`score` real NOT NULL,
	`is_correct` integer NOT NULL,
	`feedback` text NOT NULL,
	`time_taken_ms` integer NOT NULL,
	`answered_at` integer NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_question_id_unique` ON `attempts` (`question_id`);--> statement-breakpoint
CREATE TABLE `concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`module_name` text NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `concepts_topic_idx` ON `concepts` (`topic_id`,`position`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`code` text,
	`code_language` text,
	`options` text,
	`correct_option_index` integer,
	`expected_answer` text,
	`rubric` text,
	`explanation` text NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `questions_quiz_idx` ON `questions` (`quiz_id`,`position`);--> statement-breakpoint
CREATE INDEX `questions_concept_idx` ON `questions` (`concept_id`);--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`difficulty` text NOT NULL,
	`focus_concept_id` text,
	`status` text NOT NULL,
	`score` real,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`focus_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quizzes_topic_idx` ON `quizzes` (`topic_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `readings` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_id` text NOT NULL,
	`markdown` text NOT NULL,
	`key_takeaways` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `readings_concept_id_unique` ON `readings` (`concept_id`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_studied_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topics_name_key_unique` ON `topics` (`name_key`);