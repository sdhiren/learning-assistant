# learning-assistant

A local, Claude-powered study companion for **technical interview prep**. Pick any topic and
Claude builds a skill map for it, quizzes you at the difficulty you choose, grades your answers,
writes focused lessons, and tracks which concepts you still need to practise.

Everything runs on your own machine. Your progress is stored in a local SQLite file, and Claude
is reached through the Claude Code login on this computer, so it uses your Claude subscription
rather than a separate API bill.

## Features (Phase 1)

- **Topics with a skill map.** Claude designs a curriculum of 3 to 6 modules for any technical
  topic, with concepts ordered from fundamentals to advanced.
- **Quizzes at four difficulty levels.** Easy, Medium, Hard and Expert, with 5 or 10
  questions. Questions mix multiple choice, short answer (graded by Claude against a rubric) and
  "what does this code print?".
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

| Variable        | Default                        | Purpose                                  |
| --------------- | ------------------------------ | ---------------------------------------- |
| `DATABASE_PATH` | `./data/learning-assistant.db` | Where your progress is stored            |
| `CLAUDE_MODEL`  | `claude-opus-5-5`              | Model used for generation and grading    |
| `AI_TIMEOUT_MS` | `180000`                       | Maximum time for a single Claude request |

> **Billing note:** if `ANTHROPIC_API_KEY` is set in your environment, Claude Code uses it
> instead of your subscription, and requests are billed to that API key.

Claude usage counts against your plan's usage limits. Roughly, creating a topic, generating a
quiz or writing a lesson is one request each, and each short-answer question is one more.

## Commands

Run `make` to list everything.

| Command              | What it does                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `make setup`         | First-time setup: check prerequisites, install, create config and DB |
| `make doctor`        | Check Node.js version and Claude Code login                          |
| `make dev`           | Start in development mode at http://127.0.0.1:3000                   |
| `make start`         | Build and run in production mode (faster pages)                      |
| `make dev PORT=4000` | Use another port (works with `start` too)                            |
| `make test`          | Run the unit and integration tests                                   |
| `make check`         | Lint, typecheck, format check and tests; run before committing       |
| `make db-migrate`    | Create the database or apply pending migrations                      |
| `make db-shell`      | Open a SQL shell on your data (`.tables`, `.quit`)                   |
| `make db-backup`     | Save a timestamped copy to `data/backups/`                           |
| `make db-reset`      | Delete all progress and start fresh (asks for confirmation)          |
| `make db-generate`   | Generate a migration after editing `src/server/db/schema.ts`         |
| `make clean`         | Remove build output and caches (keeps your data)                     |

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
    ai/                LlmClient interface, Claude Agent SDK adapter, prompts, output schemas
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
