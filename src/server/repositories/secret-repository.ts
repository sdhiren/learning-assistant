import "server-only";

import { and, eq } from "drizzle-orm";

import type { RegistryDatabase } from "@/server/db/app-client";
import { profileSecrets, type ProfileSecretRow } from "@/server/db/app-schema";

/** Reads and writes the registry's `profile_secrets` table (ciphertext only). */
export class SecretRepository {
  constructor(private readonly db: RegistryDatabase) {}

  list(profileId: string): ProfileSecretRow[] {
    return this.db
      .select()
      .from(profileSecrets)
      .where(eq(profileSecrets.profileId, profileId))
      .all();
  }

  upsert(row: ProfileSecretRow): void {
    this.db
      .insert(profileSecrets)
      .values(row)
      .onConflictDoUpdate({
        target: [profileSecrets.profileId, profileSecrets.kind],
        set: {
          ciphertext: row.ciphertext,
          iv: row.iv,
          tag: row.tag,
          hint: row.hint,
          updatedAt: row.updatedAt,
        },
      })
      .run();
  }

  delete(profileId: string, kind: string): void {
    this.db
      .delete(profileSecrets)
      .where(and(eq(profileSecrets.profileId, profileId), eq(profileSecrets.kind, kind)))
      .run();
  }

  deleteAll(profileId: string): number {
    return this.db.delete(profileSecrets).where(eq(profileSecrets.profileId, profileId)).run()
      .changes;
  }
}
