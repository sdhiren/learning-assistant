import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as appSchema from "./app-schema";

export type RegistryDatabase = BetterSQLite3Database<typeof appSchema> & {
  $client: Database.Database;
};

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle-app");

/**
 * Opens the profile registry and brings its schema up to date (from `drizzle-app/`).
 * Pass ":memory:" for an isolated, throwaway registry (used by tests).
 */
export function createRegistryDatabase(filePath: string): RegistryDatabase {
  if (filePath !== ":memory:") {
    mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }

  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema: appSchema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}
