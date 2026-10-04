# Architecture

## Context and goals

learning-assistant is a single-user, local-first web app for technical interview practice.
Phase 1 goals:

- Generate a curriculum (skill map) for any technical topic.
- Generate quizzes at a chosen difficulty, grade answers, and store every attempt.
- Estimate mastery per concept and use it to choose what to practise next.
- Generate focused lessons per concept.

Constraints: runs only on the user's machine, uses the user's Claude subscription (no API
key), and has no login.

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
                 SQLite (Drizzle)      ClaudeAgentClient ──► Claude Code login
                                                              (Claude subscription)
                         domain/  pure functions used by services and UI
```

**Dependency rule:** dependencies point downward only. `domain/` imports nothing from the app.
Services depend on the `LlmClient` interface and on repositories, never on Next.js.
`server/container.ts` is the only place concrete implementations are created.

## Key decisions

| Decision       | Choice                                                                                      | Why                                                                      | Trade-off                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Model access   | Claude Agent SDK using the local Claude Code login                                          | Uses the user's subscription; no API key to manage                       | Personal, local use only; shares the plan's usage limits; each call starts a subprocess (about 1 s of overhead) |
| Model boundary | `LlmClient` interface with one `generateStructured` method                                  | Provider can be swapped (for example to an API key) and tests use a fake | One more layer of indirection                                                                                   |
| Output format  | JSON-schema structured output, validated again with zod                                     | Model output is never trusted as-is                                      | Schemas are kept flat and permissive; stricter per-type checks happen in `question-validation.ts`               |
| Storage        | SQLite via better-sqlite3 and Drizzle, with migrations applied at startup                   | Zero setup, a single file, transactional                                 | Single writer; fine for one user                                                                                |
| Mutations      | Server Actions                                                                              | Built-in CSRF origin check, typed end to end, no hand-written API        | Dispatched one at a time per client (fine for this UI)                                                          |
| Mastery        | Recency- and difficulty-weighted average per concept; "strong" requires at least 3 attempts | Simple, explainable, testable                                            | Not a full knowledge-tracing model (planned for Phase 2)                                                        |

## Data model

```
topics 1─* subtopics 1─* concepts   (skill map; positions give curriculum order)
topics 1─* quizzes 1─* questions *─1 concepts
quizzes *─0..1 subtopics / concepts (optional quiz focus)
questions 1─1 attempts              (one graded answer per question)
concepts 1─1 readings               (latest lesson)
```

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

**Answer:** multiple-choice and code-output questions are graded locally and deterministically.
Short answers are graded by Claude against the stored rubric. The attempt and, when it was the
last question, the quiz completion are written in one transaction.

## Security model

There's no authentication because the app only listens on the loopback interface. The
controls that make that safe:

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
  text has nothing it can act on.
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
- **Data:** `data/` and `.env*` are git-ignored.

## Migrations

Migrations live in `drizzle/` and run automatically at startup (and with `make db-migrate`).
Drizzle runs all pending migrations inside a single transaction, where
`PRAGMA foreign_keys=OFF` has no effect. Rebuilding a table (`DROP` + `CREATE`), which is what
drizzle-kit generates for many SQLite changes, would therefore cascade-delete child rows such as
questions and attempts. Schema changes must use `ALTER TABLE … ADD/DROP COLUMN`, as
`0001_subtopics.sql` does; a `NOT NULL` that can't be declared that way is enforced with
triggers. Test every migration against a copy of a real database (`make db-backup` first).

## Testing

- **Unit tests** cover the domain (mastery, grading, concept selection, input schemas),
  question validation, prompt tagging and the Host guard.
- **Integration tests** run the real services and repositories against an in-memory SQLite
  database with a `FakeLlmClient`. They cover the quiz lifecycle, answer-key secrecy, duplicate
  answers and cascading deletes.
- **Manual end-to-end:** the full flow has been run against real Claude through the browser.

Run everything with `npm run check`.

## Known limitations and what to revisit

- The home page computes progress from every stored attempt. Fine for personal use; at very
  large history sizes, persist per-topic progress or aggregate in SQL.
- Claude calls are synchronous request/response (20 to 60 s for generation) with a pending UI.
  Streaming progress would improve the experience.
- Answer keys are checked structurally but not independently re-solved. A verification pass
  (or running code-output snippets) is planned.
- To support an API key as well, add an `AnthropicApiClient` implementing `LlmClient` and
  choose between them in `container.ts`.
