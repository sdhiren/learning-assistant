CREATE TABLE `llm_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`task` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`api_duration_ms` integer,
	`outcome` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_read_tokens` integer,
	`cache_write_tokens` integer,
	`cost_usd` real,
	`quiz_id` text,
	`concept_id` text,
	`request_id` text
);
--> statement-breakpoint
CREATE INDEX `llm_calls_started_at_idx` ON `llm_calls` (`started_at`);