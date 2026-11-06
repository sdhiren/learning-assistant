import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Drizzle runs every pending migration inside one transaction, where `PRAGMA foreign_keys=OFF`
// is ignored. A drizzle-kit table rebuild (DROP + CREATE + RENAME) therefore cascade-deletes
// child rows such as questions and attempts. See docs/ARCHITECTURE.md → Migrations.

const MIGRATION_FOLDERS = ["drizzle", "drizzle-app"] as const;

/**
 * Migrations allowed to contain a rebuild pattern, keyed by "<folder>/<file>", with the reason.
 * Add an entry only when the dropped table can't have rows worth keeping, and say why.
 */
const ALLOWED_REBUILDS: Record<string, string> = {
  "drizzle/0000_init.sql": "initial schema, no existing data",
  "drizzle-app/0000_init.sql": "initial schema, no existing data",
};

const REBUILD_PATTERNS = [
  /\bDROP\s+TABLE\b/gi,
  // Table renames only: `RENAME COLUMN` and `RENAME a TO b` (a column) stay allowed.
  /\bALTER\s+TABLE\s+\S+\s+RENAME\s+TO\b/gi,
  // drizzle-kit emits this with every rebuild; inside the migrator's transaction it does nothing.
  /\bPRAGMA\s+foreign_keys\s*=\s*['"]?(OFF|0|FALSE|NO)\b/gi,
];

type Journal = { entries: { idx: number; when: number; tag: string }[] };

function folderPath(folder: string) {
  return path.join(process.cwd(), folder);
}

function sqlFiles(folder: string) {
  return readdirSync(folderPath(folder))
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

function readJournal(folder: string): Journal {
  return JSON.parse(readFileSync(path.join(folderPath(folder), "meta", "_journal.json"), "utf8"));
}

/** Blanks out `--` and block comments, keeping line numbers. */
function stripComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, "");
}

/** Every rebuild pattern in `sql`, with its 1-based line number. */
function findRebuilds(sql: string) {
  const code = stripComments(sql);
  return REBUILD_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({
      line: code.slice(0, match.index).split("\n").length,
      match: match[0].replace(/\s+/g, " "),
    })),
  ).sort((a, b) => a.line - b.line);
}

describe("migrations never rebuild a table", () => {
  it.each(MIGRATION_FOLDERS)("no file in %s/ drops, renames or disables foreign keys", (folder) => {
    const violations = sqlFiles(folder)
      .filter((file) => !(`${folder}/${file}` in ALLOWED_REBUILDS))
      .flatMap((file) =>
        findRebuilds(readFileSync(path.join(folderPath(folder), file), "utf8")).map(
          ({ line, match }) => `${folder}/${file}:${line} contains "${match}".`,
        ),
      );

    expect(
      violations,
      `${violations.join("\n")}\nMigrations run in one transaction where PRAGMA foreign_keys=OFF ` +
        "is ignored, so rebuilding a table cascade-deletes questions and attempts. Use " +
        "ALTER TABLE … ADD/DROP COLUMN instead. See docs/ARCHITECTURE.md → Migrations. If the " +
        "drop is really safe, add the file to ALLOWED_REBUILDS with a reason.",
    ).toEqual([]);
  });

  it.each(MIGRATION_FOLDERS)(
    "every journal entry in %s/ has a SQL file and vice versa",
    (folder) => {
      const tags = readJournal(folder).entries.map((entry) => `${entry.tag}.sql`);
      expect(tags.sort()).toEqual(sqlFiles(folder));
    },
  );

  it("allowlists only files that exist", () => {
    for (const key of Object.keys(ALLOWED_REBUILDS)) {
      const [folder, file] = key.split("/");
      expect(sqlFiles(folder!), key).toContain(file);
    }
  });

  it("flags drizzle-kit's rebuild output", () => {
    const sql = [
      "PRAGMA foreign_keys=OFF;--> statement-breakpoint",
      "CREATE TABLE `__new_quizzes` (`id` text PRIMARY KEY NOT NULL);",
      "--> statement-breakpoint",
      "INSERT INTO `__new_quizzes`(`id`) SELECT `id` FROM `quizzes`;--> statement-breakpoint",
      "DROP TABLE `quizzes`;--> statement-breakpoint",
      "ALTER TABLE `__new_quizzes` RENAME TO `quizzes`;--> statement-breakpoint",
      "PRAGMA foreign_keys=ON;",
    ].join("\n");

    expect(findRebuilds(sql)).toEqual([
      { line: 1, match: "PRAGMA foreign_keys=OFF" },
      { line: 5, match: "DROP TABLE" },
      { line: 6, match: "ALTER TABLE `__new_quizzes` RENAME TO" },
    ]);
  });

  it("flags a statement split across lines", () => {
    expect(findRebuilds("ALTER TABLE `a`\n  RENAME TO `b`;\ndrop\ntable `c`;")).toEqual([
      { line: 1, match: "ALTER TABLE `a` RENAME TO" },
      { line: 3, match: "drop table" },
    ]);
  });

  it("allows column renames, index drops and commented-out drops", () => {
    const sql = [
      "ALTER TABLE `quizzes` RENAME COLUMN `score` TO `final_score`;",
      "ALTER TABLE `quizzes` RENAME `status` TO `state`;",
      "DROP INDEX `quizzes_topic_idx`;",
      "ALTER TABLE `quizzes` DROP COLUMN `score`;",
      "-- Rebuilding (DROP TABLE + CREATE) would cascade-delete attempts.",
      "/* DROP TABLE `quizzes`; */",
      "PRAGMA foreign_keys=ON;",
    ].join("\n");

    expect(findRebuilds(sql)).toEqual([]);
  });
});

describe("applying profile migrations keeps study data", () => {
  const journal = readJournal("drizzle");
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "la-migrations-"));
    mkdirSync(path.join(dir, "meta"));
    for (const file of sqlFiles("drizzle")) {
      copyFileSync(path.join(folderPath("drizzle"), file), path.join(dir, file));
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Same pragma as `createDatabase`: without it nothing cascades and the test proves nothing. */
  function openDb() {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    return { sqlite, db: drizzle(sqlite) };
  }

  /** Applies pending migrations from a journal cut to `entries`, through the real migrator. */
  function applyJournal(db: ReturnType<typeof openDb>["db"], entries: Journal["entries"]) {
    writeFileSync(path.join(dir, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
    migrate(db, { migrationsFolder: dir });
  }

  const STUDY_TABLES = ["topics", "concepts", "quizzes", "questions", "attempts", "readings"];

  function count(sqlite: Database.Database, table: string) {
    return sqlite.prepare(`SELECT count(*) FROM \`${table}\``).pluck().get() as number;
  }

  function rowCounts(sqlite: Database.Database) {
    return Object.fromEntries(STUDY_TABLES.map((table) => [table, count(sqlite, table)]));
  }

  function attemptIds(sqlite: Database.Database) {
    return sqlite.prepare("SELECT id FROM attempts ORDER BY id").pluck().all() as string[];
  }

  function tableExists(sqlite: Database.Database, table: string) {
    return (
      sqlite
        .prepare("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?")
        .pluck()
        .get(table) === 1
    );
  }

  /**
   * Study data written against the `0000_init` schema, which never changes, so the seed needs no
   * upkeep as migrations are added. Two modules per topic, so `0001` creates subtopics.
   */
  function seed(sqlite: Database.Database) {
    const now = 1_790_000_000_000;
    sqlite.exec(`
      INSERT INTO topics (id, name, name_key, goal, summary, created_at, last_studied_at) VALUES
        ('t1', 'Node.js', 'node.js', 'Senior backend interview', 'Runtime and modules', ${now}, ${now}),
        ('t2', 'SQL', 'sql', '', 'Joins and indexes', ${now}, NULL);

      INSERT INTO concepts (id, topic_id, module_name, name, summary, position) VALUES
        ('c1', 't1', 'Runtime', 'Event loop', 'Phases of the loop', 0),
        ('c2', 't1', 'Runtime', 'Streams', 'Backpressure', 1),
        ('c3', 't1', 'Modules', 'ESM vs CJS', 'Resolution rules', 2),
        ('c4', 't2', 'Joins', 'Inner join', 'Matching rows', 0),
        ('c5', 't2', 'Indexes', 'B-tree index', 'Range scans', 1);

      INSERT INTO quizzes (id, topic_id, difficulty, focus_concept_id, status, score, created_at, completed_at) VALUES
        ('qz1', 't1', 'medium', NULL, 'completed', 0.5, ${now}, ${now + 60_000}),
        ('qz2', 't2', 'easy', 'c4', 'in_progress', NULL, ${now}, NULL);

      INSERT INTO questions (id, quiz_id, concept_id, position, type, prompt, code, code_language,
                             options, correct_option_index, expected_answer, rubric, explanation) VALUES
        ('qn1', 'qz1', 'c1', 0, 'multiple_choice', 'Which phase runs timers?', NULL, NULL,
         '["timers","poll","check","close"]', 0, NULL, NULL, 'Timers run first.'),
        ('qn2', 'qz1', 'c3', 1, 'short_answer', 'How does ESM resolve?', NULL, NULL,
         NULL, NULL, 'Full specifiers', 'Mentions file extensions', 'ESM needs extensions.'),
        ('qn3', 'qz2', 'c4', 0, 'multiple_choice', 'What does an inner join return?', NULL, NULL,
         '["matches","all left","all right","none"]', 0, NULL, NULL, 'Only matching rows.'),
        ('qn4', 'qz2', 'c5', 1, 'code_output', 'What prints?', 'console.log(1)', 'javascript',
         NULL, NULL, '1', NULL, 'It prints 1.');

      INSERT INTO attempts (id, question_id, answer, score, is_correct, feedback, time_taken_ms, answered_at) VALUES
        ('a1', 'qn1', '0', 1, 1, 'Correct.', 4000, ${now + 10_000}),
        ('a2', 'qn2', 'Extensions', 0, 0, 'Partly.', 9000, ${now + 20_000}),
        ('a3', 'qn3', '0', 1, 1, 'Correct.', 3000, ${now + 30_000});

      INSERT INTO readings (id, concept_id, markdown, key_takeaways, created_at) VALUES
        ('r1', 'c1', '# Event loop', '["Timers run first"]', ${now});
    `);
  }

  /** The shape drizzle-kit generates when a SQLite change needs a table rebuild. */
  const REBUILD_QUESTIONS = `PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE \`__new_questions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`quiz_id\` text NOT NULL,
	\`concept_id\` text NOT NULL,
	\`position\` integer NOT NULL,
	\`type\` text NOT NULL,
	\`prompt\` text NOT NULL,
	\`code\` text,
	\`code_language\` text,
	\`options\` text,
	\`correct_option_index\` integer,
	\`expected_answer\` text,
	\`rubric\` text,
	\`explanation\` text NOT NULL,
	FOREIGN KEY (\`quiz_id\`) REFERENCES \`quizzes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`concept_id\`) REFERENCES \`concepts\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO \`__new_questions\`("id", "quiz_id", "concept_id", "position", "type", "prompt", "code", "code_language", "options", "correct_option_index", "expected_answer", "rubric", "explanation") SELECT "id", "quiz_id", "concept_id", "position", "type", "prompt", "code", "code_language", "options", "correct_option_index", "expected_answer", "rubric", "explanation" FROM \`questions\`;--> statement-breakpoint
DROP TABLE \`questions\`;--> statement-breakpoint
ALTER TABLE \`__new_questions\` RENAME TO \`questions\`;--> statement-breakpoint
PRAGMA foreign_keys=ON;`;

  it("keeps every row and attempt through each migration after 0000_init", () => {
    const { sqlite, db } = openDb();
    applyJournal(db, journal.entries.slice(0, 1));
    seed(sqlite);
    const seeded = rowCounts(sqlite);
    const seededAttempts = attemptIds(sqlite);
    let subtopics: number | undefined;

    for (let k = 2; k <= journal.entries.length; k++) {
      applyJournal(db, journal.entries.slice(0, k));
      const tag = journal.entries[k - 1]!.tag;

      expect(count(sqlite, "__drizzle_migrations"), `${tag} was not applied`).toBe(k);
      expect(rowCounts(sqlite), `row counts changed after applying ${tag}`).toEqual(seeded);
      expect(attemptIds(sqlite), `attempts lost after applying ${tag}`).toEqual(seededAttempts);

      if (tableExists(sqlite, "subtopics")) {
        const now = count(sqlite, "subtopics");
        expect(now, `no subtopics after applying ${tag}`).toBeGreaterThan(0);
        expect(now, `subtopic count changed after applying ${tag}`).toBe(subtopics ?? now);
        subtopics = now;
      }
    }
    expect(subtopics, "subtopics table never created").toBeDefined();
    sqlite.close();
  });

  it("canary: a drizzle-kit rebuild of questions cascade-deletes the attempts", () => {
    const { sqlite, db } = openDb();
    applyJournal(db, journal.entries.slice(0, 1));
    seed(sqlite);
    applyJournal(db, journal.entries);
    expect(count(sqlite, "attempts")).toBe(3);

    const last = journal.entries.at(-1)!;
    writeFileSync(path.join(dir, "9999_rebuild_questions.sql"), REBUILD_QUESTIONS);
    applyJournal(db, [
      ...journal.entries,
      { ...last, idx: last.idx + 1, when: last.when + 1, tag: "9999_rebuild_questions" },
    ]);

    // The rebuild keeps the questions but `PRAGMA foreign_keys=OFF` is ignored inside the
    // migrator's transaction, so `DROP TABLE questions` takes every attempt with it.
    expect(count(sqlite, "questions")).toBe(4);
    expect(count(sqlite, "attempts"), "the harness no longer reproduces the cascade").toBe(0);
    sqlite.close();
  });
});
