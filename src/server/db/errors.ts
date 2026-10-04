/** True when a SQLite UNIQUE constraint was violated (checks the whole cause chain). */
export function isUniqueConstraintError(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ("code" in current && current.code === "SQLITE_CONSTRAINT_UNIQUE") return true;
  }
  return false;
}
