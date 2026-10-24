@AGENTS.md

# Project conventions

- Layering: `app/` and `components/` → `server/actions` → `server/services` → `server/repositories` / `server/ai`. `domain/` is pure and imports nothing from the app.
- All model calls go through the `LlmClient` interface, built by `createLlmClient` from `AI_PROVIDER` (see `server/ai/providers.ts`). Provider SDKs are imported only in their client file under `server/ai/` (`claude-agent-client.ts`, `anthropic-api-client.ts`); ESLint enforces this.
- User-facing copy in `src/app` and `src/components` uses the provider label (`useAiProvider()` / `getAiProviderInfo()`), never a literal "Claude"; ESLint enforces this.
- Never log, return or pass API keys to client components.
- Validate every server action input with the zod schemas in `src/domain/input-schemas.ts`.
- Never send answer keys to the client before a question is answered.
- After editing `src/server/db/schema.ts`, run `npm run db:generate` and commit the migration.
- Never ship a migration that rebuilds a table (DROP + CREATE): migrations run in one transaction where `PRAGMA foreign_keys=OFF` is ignored, so it cascade-deletes questions and attempts. Use `ALTER TABLE ADD/DROP COLUMN` (see `docs/ARCHITECTURE.md` → Migrations) and test against a copy of a real database.
- Run `npm run check` before committing.
