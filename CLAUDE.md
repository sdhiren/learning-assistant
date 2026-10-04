@AGENTS.md

# Project conventions

- Layering: `app/` and `components/` → `server/actions` → `server/services` → `server/repositories` / `server/ai`. `domain/` is pure and imports nothing from the app.
- All Claude calls go through the `LlmClient` interface; never import the Agent SDK outside `server/ai/claude-agent-client.ts`.
- Validate every server action input with the zod schemas in `src/domain/input-schemas.ts`.
- Never send answer keys to the client before a question is answered.
- After editing `src/server/db/schema.ts`, run `npm run db:generate` and commit the migration.
- Never ship a migration that rebuilds a table (DROP + CREATE): migrations run in one transaction where `PRAGMA foreign_keys=OFF` is ignored, so it cascade-deletes questions and attempts. Use `ALTER TABLE ADD/DROP COLUMN` (see `docs/ARCHITECTURE.md` → Migrations) and test against a copy of a real database.
- Run `npm run check` before committing.
