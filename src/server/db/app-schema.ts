import { EXPERIENCE_LEVELS } from "@/domain/profile";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * The profile registry (`data/app.db`). It only knows which profiles exist and
 * where each one's learning database lives; learning data never goes here.
 * Migrations for this schema live in `drizzle-app/`, separate from `drizzle/`.
 */

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const profiles = sqliteTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    /** Lower-cased username, so names are unique ignoring case. */
    usernameKey: text("username_key").notNull(),
    /** `scrypt$N$r$p$salt$hash`. Null until the password is first set. */
    passwordHash: text("password_hash"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    targetRole: text("target_role").notNull().default(""),
    experienceLevel: text("experience_level", { enum: EXPERIENCE_LEVELS }),
    /** JSON array of interest strings. */
    interests: text("interests", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** This profile's learning database, as configured (relative paths resolve from the app root). */
    dbPath: text("db_path").notNull(),
    /** Null means "use the env defaults" (AI_PROVIDER / AI_MODEL). */
    aiProvider: text("ai_provider"),
    aiModel: text("ai_model"),
    /** Salt for the password-derived key that wraps the data key. Distinct from the hash salt. */
    kekSalt: text("kek_salt"),
    /** The profile's data key, wrapped by the password-derived key. Never stored in plaintext. */
    dekWrapped: text("dek_wrapped"),
    createdAt: timestamp("created_at").notNull(),
    lastLoginAt: timestamp("last_login_at"),
    /** When this profile last completed Sign in with Claude (its own CLAUDE_CONFIG_DIR). */
    claudeSignedInAt: timestamp("claude_signed_in_at"),
  },
  (table) => [uniqueIndex("profiles_username_key_unique").on(table.usernameKey)],
);

export type ProfileRow = typeof profiles.$inferSelect;

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the session token. The raw token lives only in the browser's cookie. */
    tokenHash: text("token_hash").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** The profile's data key, wrapped by a key derived from the raw session token. */
    dekWrapped: text("dek_wrapped").notNull(),
    createdAt: timestamp("created_at").notNull(),
    /** Slides forward on each use, so a session lasts 30 idle days. */
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("sessions_profile_id_idx").on(table.profileId)],
);

export type SessionRow = typeof sessions.$inferSelect;

/**
 * Secrets a profile saved in the UI (API keys, a pasted subscription token),
 * sealed with AES-256-GCM under the profile's data key with AAD
 * `${profileId}:${kind}`. `hint` is the last 4 characters, for display only.
 */
export const profileSecrets = sqliteTable(
  "profile_secrets",
  {
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    hint: text("hint").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.kind] })],
);

export type ProfileSecretRow = typeof profileSecrets.$inferSelect;
