import "server-only";

import { asc, eq } from "drizzle-orm";

import type { RegistryDatabase } from "@/server/db/app-client";
import { profiles, type ProfileRow } from "@/server/db/app-schema";

export type NewProfile = typeof profiles.$inferInsert;

/** Reads and writes the registry's `profiles` table. */
export class ProfileRepository {
  constructor(private readonly db: RegistryDatabase) {}

  list(): ProfileRow[] {
    return this.db.select().from(profiles).orderBy(asc(profiles.createdAt)).all();
  }

  findById(id: string): ProfileRow | undefined {
    return this.db.select().from(profiles).where(eq(profiles.id, id)).get();
  }

  findByUsername(username: string): ProfileRow | undefined {
    return this.db
      .select()
      .from(profiles)
      .where(eq(profiles.usernameKey, username.toLowerCase()))
      .get();
  }

  insert(profile: NewProfile): void {
    this.db.insert(profiles).values(profile).run();
  }

  /** Stores a new password hash with the data key wrapped by that password. */
  setPassword(
    id: string,
    credentials: { passwordHash: string; kekSalt: string; dekWrapped: string },
  ): void {
    this.db.update(profiles).set(credentials).where(eq(profiles.id, id)).run();
  }

  recordLogin(id: string, at: Date): void {
    this.db.update(profiles).set({ lastLoginAt: at }).where(eq(profiles.id, id)).run();
  }
}
