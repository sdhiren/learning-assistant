import { eq } from "drizzle-orm";

import type { AppDatabase } from "@/server/db/client";
import { readings, type ReadingRow } from "@/server/db/schema";

export type NewReading = typeof readings.$inferInsert;

export class ReadingRepository {
  constructor(private readonly db: AppDatabase) {}

  findByConceptId(conceptId: string): ReadingRow | undefined {
    return this.db.select().from(readings).where(eq(readings.conceptId, conceptId)).get();
  }

  /** Inserts or replaces the reading for a concept (one reading per concept). */
  upsert(reading: NewReading): void {
    this.db
      .insert(readings)
      .values(reading)
      .onConflictDoUpdate({
        target: readings.conceptId,
        set: {
          markdown: reading.markdown,
          keyTakeaways: reading.keyTakeaways,
          createdAt: reading.createdAt,
        },
      })
      .run();
  }
}
