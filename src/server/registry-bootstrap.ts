import "server-only";

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import type { RegistryDatabase } from "@/server/db/app-client";
import { profiles } from "@/server/db/app-schema";
import { logger } from "@/server/logger";

/** The owner of the data that existed before profiles. */
export const LEGACY_PROFILE = {
  username: "sdhiren",
  firstName: "Dhirendra",
  lastName: "Singh",
} as const;

/**
 * First start after upgrading: if the registry has no profiles and the
 * pre-profiles database exists, register it as `sdhiren` **where it is**.
 * Nothing is moved or rewritten. It has no password until one is set.
 * A fresh install (no legacy file) creates no profile. Safe to call on every start.
 */
export function ensureLegacyProfile(
  registry: RegistryDatabase,
  legacyDbPath: string,
  now: () => Date = () => new Date(),
): boolean {
  if (legacyDbPath === ":memory:" || !existsSync(legacyDbPath)) return false;

  const created = registry.transaction((tx) => {
    if (tx.select({ id: profiles.id }).from(profiles).limit(1).get()) return false;
    tx.insert(profiles)
      .values({
        id: randomUUID(),
        username: LEGACY_PROFILE.username,
        usernameKey: LEGACY_PROFILE.username,
        passwordHash: null,
        firstName: LEGACY_PROFILE.firstName,
        lastName: LEGACY_PROFILE.lastName,
        interests: [],
        dbPath: legacyDbPath,
        createdAt: now(),
      })
      .run();
    return true;
  });

  if (created) logger.info("Registered the existing database as a profile");
  return created;
}
