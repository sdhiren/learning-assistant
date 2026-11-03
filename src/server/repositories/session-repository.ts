import "server-only";

import { and, count, eq, lte, ne } from "drizzle-orm";

import type { RegistryDatabase } from "@/server/db/app-client";
import { sessions, type SessionRow } from "@/server/db/app-schema";

/** Reads and writes the registry's `sessions` table. Tokens are only ever handled as hashes. */
export class SessionRepository {
  constructor(private readonly db: RegistryDatabase) {}

  insert(session: SessionRow): void {
    this.db.insert(sessions).values(session).run();
  }

  find(tokenHash: string): SessionRow | undefined {
    return this.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
  }

  extend(tokenHash: string, expiresAt: Date): void {
    this.db.update(sessions).set({ expiresAt }).where(eq(sessions.tokenHash, tokenHash)).run();
  }

  delete(tokenHash: string): void {
    this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
  }

  /** Deletes every session of a profile, except `keepTokenHash` when given. */
  deleteForProfile(profileId: string, keepTokenHash?: string): void {
    const ofProfile = eq(sessions.profileId, profileId);
    this.db
      .delete(sessions)
      .where(keepTokenHash ? and(ofProfile, ne(sessions.tokenHash, keepTokenHash)) : ofProfile)
      .run();
  }

  deleteExpired(now: Date): number {
    return this.db.delete(sessions).where(lte(sessions.expiresAt, now)).run().changes;
  }

  countForProfile(profileId: string): number {
    return (
      this.db
        .select({ count: count() })
        .from(sessions)
        .where(eq(sessions.profileId, profileId))
        .get()?.count ?? 0
    );
  }
}
