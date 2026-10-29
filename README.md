# learning-assistant

A local, Claude-powered study companion for **technical interview prep**. Pick any topic and
Claude builds a skill map for it, quizzes you at the difficulty you choose, grades your answers,
writes focused lessons, and tracks which concepts you still need to practise.

Everything runs on your own machine. Your progress is stored in a local SQLite file. By default
Claude is reached through the Claude Code login on this computer, so it uses your Claude
subscription rather than a separate API bill; you can switch to an Anthropic, OpenAI or Gemini API
key instead (see [Choosing a provider](#choosing-a-provider)).

## Features (Phase 1)

- **Topics with a skill map.** Claude designs a curriculum of 3 to 6 modules for any technical
  topic, with concepts ordered from fundamentals to advanced.
- **Quizzes at four difficulty levels.** Easy, Medium, Hard and Expert, with 5 or 10
  questions. Questions mix multiple choice, short answer (graded by Claude against a rubric) and
  "what does this code print?".
- **Coding challenges.** At Medium difficulty and above, a quiz on a coding topic can include one
  "write a function that…" challenge. You edit the starter code in a code editor, and Claude
  reviews your solution for correctness, edge cases and complexity, then shows a reference
  solution. Your code is reviewed, never run.
- **Usage page** (`/settings/usage`, linked from the header). For the last 30 days it shows
  calls, failures and p50/p95 latency per AI task; for this month it shows tokens and cost per
  provider and model. API-key costs are estimates from a dated list-price table. The Claude
  subscription shows the SDK's API-equivalent cost, which is not billed and is never added to
  API costs. Prompts, answers and keys are never recorded.
- **Delete a subtopic** you no longer want, as long as you haven't answered any of its questions
  (your quiz history is never lost).
- **Your own subtopics.** Add a subtopic to any topic (for example "Node.js event loop
  phases"). Claude breaks it into concepts that don't duplicate your existing skill map, and you
  can quiz on the whole subtopic or any of its concepts.
- **Move freely through a quiz.** Skip a question and come back to it, go back to earlier
  questions, or jump to any question from the navigator. Unsent answers are kept. Questions still
  unanswered when you finish are marked "Skipped", reveal their answer, and count as gaps to
  practise.
- **Adaptive targeting.** By default each quiz focuses on your weakest and not-yet-practised
  concepts. You can also focus a quiz on one subtopic or drill a single concept.
- **Progress tracking.** Mastery per concept (weighted toward harder questions and recent
  answers), topic progress, accuracy, a score trend and quiz history. You can pick up any topic
  or unfinished quiz where you left off.
- **Lessons.** A plain-language reading for each concept that builds a clear mental model: the
  big idea with an analogy, the prerequisite concepts it builds on, a step-by-step walkthrough,
  at least three worked examples, how it relates to neighbouring concepts, common
  misconceptions, how interviewers test it, and self-check questions.

## Quick start

**Requirements:** macOS or Linux, Node.js 22.12 or later, and
[Claude Code](https://claude.com/claude-code) installed and logged in with your Claude account
(run `claude` once and log in).

```bash
make setup
```

```bash
make dev
```

Open <http://127.0.0.1:3000>.

`make setup` checks your Node.js version and Claude Code login, installs dependencies, creates
`.env.local` and creates the database. You only need it once; after that, `make dev` is
enough. Stop the app with `Ctrl+C`.

There is no database server to start. The database is a single SQLite file
(`data/learning-assistant.db`) that the app opens directly, and pending migrations are applied
automatically by `make dev` and `make start`.

## Configuration

All settings are optional. Copy `.env.example` to `.env.local` to change them.

| Variable            | Default                        | Purpose                                                                     |
| ------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `DATABASE_PATH`     | `./data/learning-assistant.db` | Where your progress is stored                                               |
| `AI_PROVIDER`       | `claude-code`                  | `claude-code` (your Claude subscription), `anthropic`, `openai` or `gemini` |
| `AI_MODEL`          | provider default               | Model used for generation and grading (see below)                           |
| `ANTHROPIC_API_KEY` | none                           | Required when `AI_PROVIDER=anthropic`; ignored in `claude-code` mode        |
| `OPENAI_API_KEY`    | none                           | Required when `AI_PROVIDER=openai`                                          |
| `GEMINI_API_KEY`    | none                           | Required when `AI_PROVIDER=gemini`                                          |
| `CLAUDE_MODEL`      | none                           | Deprecated alias for `AI_MODEL` (Claude providers only)                     |
| `AI_TIMEOUT_MS`     | `180000`                       | Maximum time for a single AI request, including retries                     |

### Choosing a provider

- **`claude-code` (default):** uses the Claude Code login on this machine, so requests count
  against your Claude plan's usage limits. Any `ANTHROPIC_API_KEY` in your shell or `.env.local`
  is deliberately **not** passed to Claude Code, so this mode never bills an API key.
- **`anthropic`:** set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in `.env.local`. Requests
  go straight to the Anthropic API and are billed per token to that key; Claude Code isn't
  needed. The server log shows token usage for each request.
- **`openai`:** set `AI_PROVIDER=openai` and `OPENAI_API_KEY`. Uses `gpt-5` through the Responses
  API, billed per token. An `AI_MODEL` override must be a reasoning model (gpt-5 family or
  o-series); other models reject the reasoning effort the app sends.
- **`gemini`:** set `AI_PROVIDER=gemini` and `GEMINI_API_KEY` (create a key in Google AI
  Studio). Uses `gemini-2.5-pro`.

Default models: `claude-opus-5-5` for `claude-code` and `anthropic`, `gpt-5` for `openai`,
`gemini-2.5-pro` for `gemini`. The prompts were written for Claude; after changing provider or
model, `make smoke-provider PROVIDER=<id> TASKS=all` runs every kind of request once against your
key and prints pass or fail for each (never prompts or keys).

Roughly, creating a topic, generating a quiz or writing a lesson is one request each, and each
short-answer question or coding challenge is one more.

## Commands

Run `make` to list everything.

| Command               | What it does                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `make setup`          | First-time setup: check prerequisites, install, create config and DB |
| `make doctor`         | Check Node.js version and Claude Code login (or API key)             |
| `make dev`            | Start in development mode at http://127.0.0.1:3000                   |
| `make start`          | Build and run in production mode (faster pages)                      |
| `make dev PORT=4000`  | Use another port (works with `start` too)                            |
| `make test`           | Run the unit and integration tests                                   |
| `make check`          | Lint, typecheck, format check and tests; run before committing       |
| `make smoke-provider` | Real AI calls via `PROVIDER=<id>` (`TASKS=all`: every request type)  |
| `make db-migrate`     | Create the database or apply pending migrations                      |
| `make db-shell`       | Open a SQL shell on your data (`.tables`, `.quit`)                   |
| `make db-backup`      | Save a timestamped copy to `data/backups/`                           |
| `make db-reset`       | Delete all progress and start fresh (asks for confirmation)          |
| `make db-generate`    | Generate a migration after editing `src/server/db/schema.ts`         |
| `make clean`          | Remove build output and caches (keeps your data)                     |

The equivalent npm scripts (`npm run dev`, `npm test`, `npm run check`, ...) also work.

## Project structure

```
src/
  app/                 Routes (Next.js App Router): pages only, no business logic
  components/          React components: ui/ primitives and feature folders
  domain/              Pure logic: mastery, grading, concept selection, input validation
  lib/                 Small shared utilities (errors, formatting)
  server/
    actions/           Server actions: validate input, call services, map errors
    ai/                LlmClient, provider registry, one client per provider, schema adapter, prompts, schemas
    db/                Drizzle schema and SQLite connection
    repositories/      Data access, one class per aggregate
    services/          Use cases (topics, quizzes, readings, progress)
    container.ts       Composition root that wires everything together
  proxy.ts             Rejects non-localhost Host headers (DNS-rebinding guard)
drizzle/               SQL migrations (applied automatically at startup)
docs/ARCHITECTURE.md   Design, data model, security model and roadmap
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and the reasoning behind it.

## Troubleshooting

- **"Claude couldn't complete the request…"**: run `claude` in a terminal to check that you
  are logged in, and check whether you've reached your plan's usage limit.
- **"Claude took too long to respond"**: try again, or raise `AI_TIMEOUT_MS`.
- **Reading the server logs:** each line is one JSON object (`ts`, `level`, `msg`, and the
  action's `requestId`), so `grep '"requestId":"<id>"'` or `jq` work; the old
  `[learning-assistant]` prefix is gone. Set `LOG_LEVEL=debug|info|warn|error` in `.env.local`.
- **Start over:** run `make db-reset` (consider `make db-backup` first).
- **Port 3000 already in use:** run `make dev PORT=4000`.

## Roadmap

1. **Phase 1 (this release):** topics, skill maps, quizzes, grading, progress, lessons.
2. **Phase 2:** spaced-repetition reviews, error-pattern tracking, confidence ratings, hint
   ladder, recommended next topics.
3. **Phase 3:** text interview mode with personas, follow-up questions, a code editor and a
   scorecard.
4. **Phase 4:** voice interview (speech in and out), replay with coaching.
5. **Later:** job-description-driven prep plans, system design whiteboard, Feynman
   ("teach it back") mode.
