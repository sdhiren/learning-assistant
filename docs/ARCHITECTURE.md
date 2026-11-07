# Architecture

## Context and goals

learning-assistant is a single-user, local-first web app for technical interview practice.
Phase 1 goals:

- Generate a curriculum (skill map) for any technical topic.
- Generate quizzes at a chosen difficulty, grade answers, and store every attempt.
- Estimate mastery per concept and use it to choose what to practise next.
- Generate focused lessons per concept.

Constraints: runs only on the user's machine, uses the user's Claude subscription by default
(an Anthropic, OpenAI or Gemini API key is optional, chosen with `AI_PROVIDER`), and separates
the people who use it with password-protected profiles.

## High-level design

```
Browser ──► proxy.ts (Host must be loopback)
              │
              ▼
   app/ pages (Server Components) ──read──┐
   components/ (Client) ──server actions──┤
                                          ▼
                              server/actions   validate with zod, map errors
                                          │
                                          ▼
                              server/services  use cases (no framework code)
                               │            │
                               ▼            ▼
                server/repositories     server/ai/LlmClient
                        │                       │
                        ▼                       ▼
                 SQLite (Drizzle)      InstrumentedLlmClient ──▶ llm_calls row
                        ▲               │   (timing, outcome,     + llm.call log line
                        └───────────────┤    tokens; no content)
                                        ▼
                                createLlmClient(AI_PROVIDER)
                                        │                   │
                                        ▼                   ▼
                              ClaudeAgentClient      AnthropicApiClient
                              (claude-code, default) (anthropic)
                                        │                   │
                                        ▼                   ▼
                              Claude Code login      Anthropic API
                              (Claude subscription)  (ANTHROPIC_API_KEY)
                         domain/  pure functions used by services and UI
```

**Dependency rule:** dependencies point downward only. `domain/` imports nothing from the app.
Services depend on the `LlmClient` interface and on repositories, never on Next.js.
`server/container.ts` is the only place concrete implementations are created.

**Composition root, per profile.** `ProfileContainer` (in `container.ts`) holds one database
connection and one services graph **per profile**, built lazily and cached by profile id. A
profile's services hold a connection only to that profile's SQLite file, so isolation is
structural: no query can reach another profile's data, and learning tables need no `profile_id`.
The services cache is keyed by an AI-settings fingerprint (provider and model) and
`invalidateProfile(id)` drops an entry, so a settings change takes effect on the next request.
Pages and actions call `getProfileServices()` (`server/session.ts`) once, at the start of the
request; the services stay bound to that profile, so a long AI call writes to the profile that
started it. Connections and the registry live on `globalThis` to survive dev hot reloads; services
are rebuilt from the current module code. The profile comes from the signed-in session
(`getCurrentSession()`, cached per request); with no valid session, `requireProfile()` redirects
to `/login`.

## Key decisions

| Decision       | Choice                                                                                                                                                      | Why                                                                                           | Trade-off                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Model access   | Provider registry (`server/ai/providers.ts`): Claude Agent SDK on the local Claude Code login by default, or the Anthropic, OpenAI or Gemini API with a key | Subscription needs no key to manage; the API path is faster, has typed errors and token usage | Subscription: local use only, shares the plan's limits, ~1 s subprocess per call. API: billed per token |
| Model boundary | `LlmClient` interface with one `generateStructured` method                                                                                                  | Provider can be swapped (for example to an API key) and tests use a fake                      | One more layer of indirection                                                                           |
| Output format  | JSON-schema structured output (converted per provider by `schema-adapter.ts`), validated again with zod                                                     | Model output is never trusted as-is                                                           | Schemas are kept flat and permissive; stricter per-type checks happen in `question-validation.ts`       |
| Storage        | SQLite via better-sqlite3 and Drizzle, with migrations applied at startup                                                                                   | Zero setup, a single file, transactional                                                      | Single writer; fine for one user                                                                        |
| Mutations      | Server Actions                                                                                                                                              | Built-in CSRF origin check, typed end to end, no hand-written API                             | Dispatched one at a time per client (fine for this UI)                                                  |
| Mastery        | Recency- and difficulty-weighted average per concept; "strong" requires at least 3 attempts                                                                 | Simple, explainable, testable                                                                 | Not a full knowledge-tracing model (planned for Phase 2)                                                |

## Data model

Storage is a small **registry** plus **one SQLite file per profile**:

```
data/
  app.db                                        registry (REGISTRY_PATH): profiles
  learning-assistant.db                         pre-profiles data (DATABASE_PATH), profile sdhiren
  profiles/<profile-id>/learning-assistant.db   each new profile (PROFILES_DIR)
```

The registry's `profiles` table holds the username (unique ignoring case via `username_key`),
an optional `password_hash`, names, target role, experience level, interests (JSON), `db_path`,
the optional per-profile `ai_provider` / `ai_model` (null means the env defaults), the wrapped
data key fields `kek_salt` / `dek_wrapped`, and timestamps. `db_path` is stored per profile, so the
pre-profiles database is registered **where it is**: on first start (`ensureLegacyProfile` in
`server/registry-bootstrap.ts`, run when the registry opens and by `make db-migrate`), if the
registry is empty and `DATABASE_PATH` exists, it becomes profile `sdhiren` (Dhirendra Singh) with
no password, in one transaction. Nothing is moved or rewritten. A fresh install creates no profile.

Each profile database has the learning tables:

```
topics 1─* subtopics 1─* concepts   (skill map; positions give curriculum order)
topics 1─* quizzes 1─* questions *─1 concepts
quizzes *─0..1 subtopics / concepts (optional quiz focus)
questions 1─1 attempts              (one graded answer per question)
questions 1─* clarifications        (follow-up thread per question; never affects scoring)
concepts 1─1 readings               (latest lesson)
llm_calls                           (one row per AI call; standalone, no foreign keys)
topic_suggestions                   (cached AI suggestions and dismissals; standalone)
```

`topic_suggestions` (migration 0005, CREATE only) holds `name`, `name_key` (unique, same
normalisation as `topics.name_key`), `reason`, `goal`, `source` (`catalog | ai`), `created_at`
and `dismissed_at`. "Suggested for you" on the dashboard comes from `TopicSuggestionService`:
the cached, undismissed AI rows if there are any, otherwise `suggestFromCatalog` in
`domain/interests.ts` (pure, no AI call), always leaving out topics the profile already has and
dismissed names. "Personalise" runs the `suggest-topics` task (effort low; interests, role and
level are passed through `tagged()`) and replaces the AI rows in one transaction; dismissed rows
are kept so they stay hidden. The interests themselves live in the registry, so the action reads
them from the signed-in profile and passes them in. Starting a suggestion calls
`TopicService.createTopic`, the normal create-topic flow.

`clarifications` (migration 0006, CREATE TABLE and one index only) holds one row per message:
`question_id` (FK, `ON DELETE CASCADE`, so threads go with their question, quiz or topic),
`role` (`learner | assistant`), `stage` (`before_answer | after_answer`), `content` and
`created_at`, indexed on `(question_id, created_at)`. `attempts` is unchanged.

`llm_calls` holds task, provider, configured model, `started_at`, `duration_ms`,
`api_duration_ms`, `outcome` (`ok | timeout | invalid_output | refused | auth | rate_limited |
error`), input/output/cache-read/cache-write tokens, `cost_usd`, and optional `quiz_id`,
`concept_id` and `request_id`. The ids are plain values without foreign keys, so deleting a topic
keeps its usage history. `cost_usd` is only a cost the provider reports itself (the Claude Agent
SDK's API-equivalent `total_cost_usd`); it is null for the API-key providers, whose cost the
Usage page estimates at read time from the dated price table in `server/ai/pricing.ts`.

**AI call instrumentation.** `createServices` wraps the provider client in
`InstrumentedLlmClient`. Each call is timed, its outcome is classified from the typed
`ProviderError.kind` (never message text: `no_credit` → `auth`, `overloaded` → `rate_limited`,
`bad_output`/`truncated`/`ZodError` → `invalid_output`, `unavailable`/unknown → `error`), and
exactly one row and one `llm.call` JSON log line are written (warn lines also carry the finer
`kind`). Clients report tokens through the optional `onUsage` hook as soon as a response arrives,
before parsing, so refused, truncated and invalid responses still record usage. A failed insert
is logged at warn and never changes the call's result or error. `runAction` runs each action in
an `AsyncLocalStorage` request context, so its log lines and `llm_calls` rows share a
`requestId`.

Subtopics have an `origin`: `generated` (part of the original skill map) or `learner` (added
later). Subtopic names are unique per topic, ignoring case and spacing.

Deleting a topic cascades to all of its data. Answer keys (`correct_option_index`,
`expected_answer`, `rubric`, `explanation`) live only on the server and are sent to the
browser only after the question has been answered.

## Main flows

**Create topic:** validate the name and goal → reject duplicates (case-insensitive) → Claude
generates the skill tree → insert the topic and its concepts in one transaction.

**Start quiz:** compute mastery → pick concepts (weak first, then unpractised in curriculum
order, then developing) → Claude writes the questions → each question is validated (known
concept id, 4 distinct options with a valid answer index, code present for output questions, a
rubric for short answers) → the quiz is kept if at least 60% of the questions are valid.

**Add subtopic:** reject duplicate names → Claude receives the existing skill map plus the
learner's subtopic name and notes, and returns 2 to 6 non-duplicating concepts (and a tidied
name, which is checked for duplicates again) → the subtopic and its concepts are appended in one
transaction that also assigns their positions.

**Quiz focus:** a quiz targets the learner's weak spots across the topic, a whole subtopic, or
one concept. The focus is checked to belong to the topic, then the same weakest-first selection
runs over that subtopic's or concept's questions. Generated questions about any other concept
are discarded.

**Skip and finish:** skipping is navigation only; nothing is stored, and the question stays
unanswered so the learner can return to it. Finishing a quiz with unanswered questions records
each one as a `skipped` attempt (score 0, answer revealed) and completes the quiz in one
transaction. Skipped attempts count toward mastery and accuracy as gaps.

**Lessons:** the reading prompt receives the concept, its subtopic, the up-to-four concepts that
precede it in the curriculum (as prerequisites) and its other subtopic siblings (as related
concepts), and asks for a plain-language lesson with a fixed section structure and at least
three worked examples.

**Answer:** multiple-choice questions are graded locally. Code-output answers first go through
instant rules (exact, formatting-only, line-layout-only and small-typo matches); anything they
don't match is judged by Claude for partial understanding, capped at 90%.
Short answers are graded by Claude against the stored rubric. The attempt and, when it was the
last question, the quiz completion are written in one transaction.

**Follow-ups (clarifications):** every question card has a follow-up box, before and after
answering. `ClarificationService.ask` picks the mode on the server from whether the question has
an attempt; the client can't choose it.

- **No attempt (`clarify-question`):** `buildQuestionClarificationPrompt` takes a
  `PublicQuestion` (type, prompt, code, language, options) picked field by field from the row,
  plus topic, concept, difficulty and the thread. It has no answer-key fields, so the correct
  option, model answer, reference solution, rubric and explanation can't reach it, and the
  learner's unsent answer draft is never sent. The model explains wording, scope and the kind of
  answer expected, and declines to answer, hint, judge options or judge a draft.
- **Attempt exists (`discuss-answer`):** `buildAnswerDiscussionPrompt` adds the answer key,
  rubric, explanation, the learner's answer (or "skipped"), score and grading feedback.

Both send the last 10 messages (including pre-answer ones) and tag every value. A failed call
stores nothing; a reply stores the learner message and reply in one transaction, with the stage
fixed when the call started. At most 10 learner messages per question across both stages.
Clarifications are free: they never read or write attempts or scores, so asking before
answering carries no penalty (unlike B9's planned hints). If the key or grade looks wrong, the
reply says so but the score stays (re-grading is B4). Threads ride on `QuizQuestionView`
(not inside `result`, so a reply doesn't re-run the focus-to-Next effect); pre-answer replies
were written without the key, so they are safe to send before answering.

## Security model

The app only listens on the loopback interface, and profiles separate the people who use it.
The controls:

- **Profiles and passwords:** each profile signs in with a username and password. Passwords
  are hashed with scrypt (N=2^15, r=8, p=1, 16-byte salt, stored as `scrypt$N$r$p$salt$hash`)
  and compared with `timingSafeEqual`. Unknown usernames are checked against a dummy hash, so
  timing doesn't reveal which names exist, and every wrong sign-in gets the same message. Five
  failures lock the username for 60 s (in memory, per server process).
- **Sessions:** a random 32-byte token in the `la_session` cookie (`httpOnly`,
  `SameSite=Lax`, `Path=/`; not `Secure`, since the app is plain http on loopback). The
  registry stores only the token's SHA-256. Sessions slide over 30 idle days (the proxy
  refreshes the cookie on page loads). Signing out deletes the session; changing the password
  deletes every other session of that profile.
- **Every page and action checks the session:** `requireProfile()` (`server/session.ts`) runs
  at the start of every page and server action except `/login` and `/register`, and redirects
  to `/login` without a valid session. The proxy's redirect when there is no cookie at all is
  only an optimisation; Next.js documents that a proxy matcher can silently miss server
  actions. After sign-in, `?next=` is followed only if it is a same-site path (`/…`, not `//`).
- **Profile isolation:** each profile's services hold a connection only to its own SQLite
  file, so an id from another profile is simply not found (404).
- **First sign-in of the upgraded profile:** `sdhiren` (data from before profiles) has no
  password until one is set. Signing in as `sdhiren` asks "Set your password" once; until then,
  anyone using this machine could claim it. `make profile-password USER=<name>` resets any
  profile's password from the terminal.
- **Network binding:** `dev` and `start` bind to `127.0.0.1` only.
- **DNS-rebinding guard:** `src/proxy.ts` returns 403 for any `Host` other than
  `localhost`, `127.0.0.1` or `[::1]`. Without it, a malicious website could point its own
  domain at 127.0.0.1 and call the app same-origin.
- **CSRF:** Next.js Server Actions reject requests whose `Origin` doesn't match `Host`.
- **Input validation:** every server action parses its input with zod (UUID ids, length
  limits, no control characters or newlines in topic names). Database access is parameterized
  through Drizzle.
- **Locked-down agent:** the Claude Agent SDK runs with no tools (`tools: []`), no MCP servers,
  no filesystem settings or CLAUDE.md files, no persisted sessions, `dontAsk` permissions, a
  maximum of 3 turns, a timeout, and an empty temporary working directory. Prompt-injected
  text has nothing it can act on. `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are stripped
  from its environment, so subscription mode never bills an API key.
- **API keys:** read only in `server-only` modules, never logged, never put in error messages or
  causes, and never passed to client components (the UI gets only the provider label and usage
  note). See [docs/design/ai-providers.md](design/ai-providers.md).
- **Prompt injection:** user text is wrapped in tags (with early tag closes neutralized), and
  the system prompt tells the model to treat tagged content as data. All output is
  schema-validated, and answer keys are never influenced by learner input.
- **Rendering:** React escapes all text. Lessons are rendered with `react-markdown`, which
  skips raw HTML, removes images and sanitizes URLs.
- **HTTP headers:** a Content Security Policy (`frame-ancestors 'none'`, `object-src 'none'`,
  `connect-src 'self'`), `X-Frame-Options: DENY`, `nosniff` and `no-referrer`, and the
  `x-powered-by` header is turned off.
- **Error hygiene:** only `AppError` messages reach the UI. Unexpected errors are logged on the
  server and replaced with a generic message, and logs never include prompts or answers.
- **Logs and usage records hold no prompts, answers or keys.** The logger writes one JSON line
  per event (filtered by `LOG_LEVEL`) and passes every line through `redactSecrets`. The
  instrumentation builds `llm_calls` rows and `llm.call` lines from an explicit allow-list and
  never spreads the request or error objects. A test runs a full flow with sentinel strings in
  the topic, goal, instructions and answer plus a fake key, and checks neither appears.
- **Data:** `data/` and `.env*` are git-ignored.

### Encryption

Saved secrets (API keys and subscription tokens, added from the profile page) use envelope
encryption with `node:crypto` only (`server/crypto/secret-box.ts`):

- Each profile has a random 32-byte **data key** (DEK), created when its password is first set.
  Secrets are sealed with AES-256-GCM under the DEK, with a random 12-byte IV and the AAD
  `${profileId}:${kind}`, so a ciphertext can't be moved to another profile or slot.
- The DEK is never stored in plaintext. `profiles.dek_wrapped` wraps it with a key derived by
  scrypt from the password and `kek_salt` (separate from the password-hash salt).
  `sessions.dek_wrapped` wraps it with HKDF-SHA256 of the **raw** session token (info
  `la-dek-v1`). The registry only has the token's hash, so the registry file alone can't unwrap
  it.
- Each request unwraps the DEK from its session (`resolveSession`). It lives only in memory.
- Changing the password re-wraps the same DEK, so saved secrets are kept. A forgotten-password
  reset (`make profile-password`) can't recover the old DEK: it makes a new one, signs out every
  session, deletes the profile's saved secrets, signs the profile out of Claude
  (`claude auth logout`, then deletes its config dir) and says so.
- `SecretService` (`server/services/secret-service.ts`) seals and opens rows in
  `profile_secrets`. Kinds are `api_key:anthropic|openai|gemini` and `claude_oauth_token`.
  Only the ciphertext, IV, tag and a 4-character `hint` are stored, and the UI only gets the
  hint. Decrypted values exist only in the profile's cached services graph.

### Per-profile AI provider

`resolveProfileAiConfig` (`server/ai/profile-ai-config.ts`) runs on every request with the
session's DEK. The profile's `ai_provider`/`ai_model` win, and null means the env defaults. A
saved key wins over the env key. For the subscription the order is the profile's own
`CLAUDE_CONFIG_DIR` (after Sign in with Claude), then a pasted token, then the machine's Claude
Code login. The container caches services per profile, keyed by a hash of provider, model and
credential, so a settings change applies on the next call without a restart. See
[design/ai-providers.md](design/ai-providers.md) for the Sign in with Claude flow.

### Threat model

| Attacker has                                | Outcome                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Another profile on the same app             | Sees none of your data: separate SQLite files, and every page and action checks the session.                |
| A website you visit                         | Blocked by the loopback Host guard, Next.js's Origin check on actions and `SameSite=Lax`.                   |
| A copy of `data/app.db` only                | Must guess your password offline against scrypt to read saved secrets. Tokens are hashed.                   |
| `data/app.db` **and** a live session cookie | Can read your saved secrets. Both live under your OS account, which is the real boundary.                   |
| Your OS account (or root)                   | Everything: profile databases are plain SQLite files. OS accounts protect files; passwords separate people. |
| Physical access while the server runs       | Decrypted secrets sit in the server's memory while your profile's services are cached.                      |
| Your OS account, for the Claude sign-in     | Can use your Claude login: see below.                                                                       |

**Accepted trade-off (owner, 2026-11-02):** the credential from Sign in with Claude is held by
Claude Code itself in the profile's 0700 config dir, `PROFILES_DIR/<id>/claude`. On Linux it's a
plaintext `.credentials.json`, and on macOS it's a Keychain entry for that config dir. It is
protected by the OS account, **not** by the profile password, because Claude Code rewrites it
on every refresh and it can't be wrapped in our envelope. API keys and pasted tokens keep full
envelope encryption. People normally run the app under their own OS account on their own
computer, which is where this holds.

Profile passwords separate the people using one app. They don't protect the files on disk from
someone who can log in to your OS account: use your OS account (and disk encryption) for that.

### Registry tables

```text
profiles 1─* sessions               (registry: data/app.db)
profiles 1─* profile_secrets
```

`profile_secrets` (migration 0002) has primary key (`profile_id`, `kind`), with `profile_id`
cascading, plus `ciphertext`, `iv`, `tag`, `hint` and `updated_at`. `profiles.claude_signed_in_at`
(migration 0003, `ALTER TABLE ADD`) records when the profile last completed Sign in with
Claude.

`sessions` holds `token_hash` (SHA-256 of the cookie's token, primary key), `profile_id`
(cascade), `dek_wrapped` (the profile's data key wrapped for this session), `created_at` and
`expires_at`. `profiles` holds the password hash, `kek_salt` and `dek_wrapped` (see
[Encryption](#encryption)).

## Migrations

There are two migration folders, each with its own Drizzle config:

- `drizzle/` (`drizzle.config.ts`, schema `src/server/db/schema.ts`) for every profile database.
  Each file is migrated when it is first opened.
- `drizzle-app/` (`drizzle-app.config.ts`, schema `src/server/db/app-schema.ts`) for the
  registry, migrated when it is opened.

`npm run db:generate` runs both configs. `make db-migrate` (`scripts/profiles.ts migrate`)
migrates the registry, registers the legacy database if needed, then migrates every profile
database. `make db-reset` requires `PROFILE=<username>` and recreates only that profile's file;
`make db-shell PROFILE=<username>` opens one profile (the registry without it); `make db-backup`
copies the registry and every profile database to a timestamped folder in `data/backups/`.

Drizzle runs all pending migrations inside a single transaction, where
`PRAGMA foreign_keys=OFF` has no effect. Rebuilding a table (`DROP` + `CREATE`), which is what
drizzle-kit generates for many SQLite changes, would therefore cascade-delete child rows such as
questions and attempts. Schema changes must use `ALTER TABLE … ADD/DROP COLUMN`, as
`0001_subtopics.sql` does; a `NOT NULL` that can't be declared that way is enforced with
triggers. Registry migrations contain only `CREATE TABLE` and `ALTER TABLE … ADD`. Test every
migration against a copy of a real database (`make db-backup` first).

`src/server/db/migrations.test.ts` enforces this in `npm test` and CI:

- **Static scan.** Every `*.sql` file in `drizzle/` and `drizzle-app/`, with comments removed,
  must not contain `DROP TABLE`, `ALTER TABLE … RENAME TO` or `PRAGMA foreign_keys=OFF`.
  `RENAME COLUMN`, `DROP COLUMN` and `DROP INDEX` are fine. A failure names the file and line.
  If a drop really is safe (say, a table nothing references and with no data worth keeping), add
  the file to `ALLOWED_REBUILDS` in the test, with the reason. Only the two `0000_init.sql` files
  are listed today. Each journal entry must have a SQL file and each SQL file a journal entry.
- **Seeded upgrade.** An in-memory profile database with `foreign_keys = ON` is migrated to
  `0000_init` and seeded with topics, concepts, quizzes, questions, attempts and a reading. Every
  later migration is then applied one at a time through the real drizzle migrator, using a
  journal cut to the first _k_ entries. After each step the row counts and attempt ids must be
  unchanged, and a failure names the migration just applied. The seed uses the `0000` schema,
  so it needs no upkeep when migrations are added.
- **Canary.** A synthetic drizzle-kit rebuild of `questions` must cascade-delete every attempt.
  This proves the harness reproduces the hazard and can't pass trivially.

The registry (`drizzle-app/`) gets only the static scan. Its child tables appear only in later
migrations, and they hold no study history.

## Testing

- **Unit tests** cover the domain (mastery, grading, concept selection, input schemas),
  question validation, prompt tagging and the Host guard.
- **Integration tests** run the real services and repositories against an in-memory SQLite
  database with a `FakeLlmClient`. They cover the quiz lifecycle, answer-key secrecy, duplicate
  answers and cascading deletes.
- **Usage instrumentation:** `instrumented-llm-client.test.ts` covers the outcome for every
  `ProviderErrorKind`, a `ZodError` and an unknown error, a throwing sink and the request id.
  `usage.integration.test.ts` checks one `llm_calls` row per call through `createTestApp` (which
  wraps the `FakeLlmClient` in the real decorator), the privacy sentinels, and the Usage
  aggregates; `logger.test.ts` checks the JSON line format and `LOG_LEVEL`.
- **Provider contract suite** (`llm-client.contract.test.ts`): the Anthropic, OpenAI and Gemini
  clients run against fake HTTP transports. Each must parse every schema in `AI_SCHEMAS` and map
  refusals, truncation, bad output and every HTTP error class to the same friendly message,
  without leaking the key. `schema-adapter.test.ts` checks each provider's JSON Schema dialect.
- **Topic suggestions:** `domain/interests.test.ts` covers the catalog (round-robin over
  interests, free-text interests, exclusions); `topic-suggestion-service.test.ts` covers the
  catalog fallback, leaving out existing topics, one `suggest-topics` row in `llm_calls`, cache
  replacement and dismissals from both sources; `prompts.test.ts` checks every learner value in
  the suggestions prompt is tagged.
- **Clarifications:** `clarification-service.test.ts` covers both stages (no answer-key text or
  key tags in pre-answer requests, no draft, full context afterwards, earlier turns in order),
  persistence and the session view, a failed call storing nothing, the shared 10-message limit,
  cascade on topic delete, one `llm_calls` row per follow-up with quiz and concept ids, and an
  identical score with and without pre-answer clarifications. `prompts.test.ts` checks tagging
  for both builders; profile isolation covers asking about another profile's question.
- **Migrations:** `src/server/db/migrations.test.ts` scans every migration for table rebuilds,
  applies the profile migrations one at a time to seeded study data, and runs a canary that
  proves a rebuild cascade-deletes attempts (see [Migrations](#migrations)).
- **Provider smoke test:** `make smoke-provider PROVIDER=<id> TASKS=all` makes real calls for
  every schema and prints pass or fail per task. Run it after changing provider, model or prompts.
- **Manual end-to-end:** the full flow has been run against real Claude through the browser.

Run everything with `npm run check`. CI (`.github/workflows/check.yml`) runs it on every pull
request and on each push to `main`, on Node from `.nvmrc`, with no secrets (the tests use fakes).
Branch protection on `main` requires the job's `check` status from GitHub Actions, for admins
too, so a PR merges only once it is green. Keep the job named `check`, and don't add `paths:` or
`paths-ignore:` filters: a required check that never runs leaves the PR waiting forever.

## Known limitations and what to revisit

- The home page computes progress from every stored attempt. Fine for personal use; at very
  large history sizes, persist per-topic progress or aggregate in SQL.
- Claude calls are synchronous request/response (20 to 60 s for generation) with a pending UI.
  Streaming progress would improve the experience.
- Answer keys are checked structurally but not independently re-solved. A verification pass
  (or running code-output snippets) is planned.
- Prompts were written for Claude. OpenAI and Gemini pass the smoke test, but answer quality on
  them may differ; per-provider prompt tweaks are a follow-up.
- Windows isn't supported: 0700 directory modes, the Claude config-dir handling and the `make`
  tooling assume macOS or Linux (BACKLOG B16).
