-- Promote skill-map modules (previously a text label on each concept) to a
-- first-class `subtopics` table, so learners can add subtopics and quiz on them.
-- Existing data is preserved: every distinct (topic, module name) becomes a
-- subtopic and each concept is linked to it.
--
-- NOTE: the migrator runs inside a transaction, where `PRAGMA foreign_keys=OFF`
-- is ignored. Rebuilding (DROP + CREATE) `concepts` or `quizzes` would therefore
-- cascade-delete questions and attempts. Only ALTER TABLE ADD/DROP COLUMN is used.

CREATE TABLE `subtopics` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`origin` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subtopics_topic_name_key_unique` ON `subtopics` (`topic_id`,`name_key`);
--> statement-breakpoint
CREATE INDEX `subtopics_topic_idx` ON `subtopics` (`topic_id`,`position`);
--> statement-breakpoint
-- One subtopic per distinct module, ordered by where it first appears in the
-- curriculum. Ids are random RFC 4122 version-4 UUIDs.
INSERT INTO `subtopics` (`id`, `topic_id`, `name`, `name_key`, `origin`, `position`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
		substr(lower(hex(randomblob(2))), 2) || '-' ||
		substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
		lower(hex(randomblob(6))),
	`topic_id`,
	`module_name`,
	lower(trim(`module_name`)),
	'generated',
	ROW_NUMBER() OVER (PARTITION BY `topic_id` ORDER BY min(`position`)) - 1
FROM `concepts`
GROUP BY `topic_id`, `module_name`;
--> statement-breakpoint
ALTER TABLE `concepts` ADD `subtopic_id` text REFERENCES `subtopics`(`id`) ON DELETE cascade;
--> statement-breakpoint
UPDATE `concepts`
SET `subtopic_id` = (
	SELECT s.`id` FROM `subtopics` s
	WHERE s.`topic_id` = `concepts`.`topic_id` AND s.`name` = `concepts`.`module_name`
);
--> statement-breakpoint
ALTER TABLE `concepts` DROP COLUMN `module_name`;
--> statement-breakpoint
CREATE INDEX `concepts_subtopic_idx` ON `concepts` (`subtopic_id`);
--> statement-breakpoint
-- ADD COLUMN can't declare NOT NULL without a default, so enforce it with triggers.
CREATE TRIGGER `concepts_subtopic_required_insert` BEFORE INSERT ON `concepts`
WHEN NEW.`subtopic_id` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'NOT NULL constraint failed: concepts.subtopic_id');
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_subtopic_required_update` BEFORE UPDATE OF `subtopic_id` ON `concepts`
WHEN NEW.`subtopic_id` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'NOT NULL constraint failed: concepts.subtopic_id');
END;
--> statement-breakpoint
ALTER TABLE `quizzes` ADD `focus_subtopic_id` text REFERENCES `subtopics`(`id`) ON DELETE set null;
