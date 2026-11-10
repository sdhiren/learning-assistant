CREATE TABLE `clarifications` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`role` text NOT NULL,
	`stage` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clarifications_question_idx` ON `clarifications` (`question_id`,`created_at`);