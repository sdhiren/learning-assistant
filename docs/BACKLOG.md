# Backlog

Improvements we plan to make, picked up one at a time.

**How to use it:**

- New requirements go under **Requested** with the next free number (B18, B19, ...).
- Larger items get a design doc in `docs/design/`, linked from the item, with its open
  questions. An item is ready to build once its questions are answered.
- When work starts, set the status to `in progress` and move a short summary to **In progress**.
- When it ships, move it to **Done** with the PR link.

Status: `todo` · `in progress` · `done`. Size: S (hours), M (a day), L (several days).

## Requested

### B16. Windows support — `todo` · M

The app runs on macOS and Linux only. Supporting Windows needs:

- An equivalent of the 0700 modes on `data/profiles/<id>/` and the Claude config dirs (NTFS
  ACLs limited to the current user).
- Checking how Claude Code stores and isolates credentials under `CLAUDE_CONFIG_DIR` on Windows
  (Credential Manager or a file), and whether `claude auth login` can be driven without a TTY.
- Replacing the `make` and shell tooling (`make setup`, `db-*`, `profile-password`) with
  cross-platform npm scripts.

### B14. Multiple AI providers (Anthropic API key first) — `in progress` · M

Let the app use an Anthropic API key as well as the Claude subscription (Claude Code login), with
a provider registry so OpenAI and Gemini can follow (now done: LA-2).

- **Design:** [docs/design/ai-providers.md](design/ai-providers.md).
- **Stage 1 (in progress, LA-1):** provider registry (`claude-code`, `anthropic`, `openai`,
  `gemini`), `AI_PROVIDER` / `AI_MODEL` env vars (`CLAUDE_MODEL` kept as a deprecated alias),
  `AnthropicApiClient`, shared friendly error mapping with key redaction, provider-neutral UI
  copy. Also fixes the trap where a stray `ANTHROPIC_API_KEY` silently billed the API key in
  subscription mode.
- **Stage 1b (LA-2):** `OpenAiClient` (Responses API, `gpt-5`) and `GeminiClient`
  (`@google/genai`, `gemini-2.5-pro`), a per-provider JSON schema adapter, a shared contract test
  suite and `make smoke-provider`. All four providers are available.
- **Stage 2 (done, LA-9 PR 3):** per-profile AI settings on `/profile`. Keys are stored only as
  AES-256-GCM ciphertext under a per-profile data key wrapped by the user's password and by
  their session (never in plaintext, and never sent to the browser); the env var is the
  fallback. Subscription users can Sign in with Claude into a per-profile `CLAUDE_CONFIG_DIR`.
- **Open questions:** which cheaper model, if any, to offer with an API key? (Storage and key
  scope are resolved: env var first, then per-profile encrypted keys.)

## Proposed

### B4. Report a wrong question — `todo` · S

Answer keys are AI-generated and can be wrong. A "This answer key looks wrong" button on the
feedback panel asks Claude to re-check the question. If the key is wrong, the attempt gets full
credit and the question is marked so it isn't reused in `recentQuestionPrompts`. Until then,
**B18** follow-ups say plainly when a key or grade looks wrong, but never change the score.

### B6. Review my mistakes — `todo` · M

Start a quiz built only from concepts behind recently missed questions, or replay the exact
missed questions. Attempts are one-per-question today, so a replay creates fresh questions on the
same concepts rather than re-answering old ones.

### B7. Spaced repetition — `todo` · M

Mastery already decays by recency weighting. Add a "due for review" date per concept (e.g.
intervals of 1, 3, 7 and 14 days based on the last score) and surface due concepts in the
dashboard's Next up.

### B8. Edit the skill map — `todo` · M

Rename and reorder subtopics. Add, remove or rename individual concepts. Edit a topic's goal
after creation. Builds on **B2**.

### B9. Hints — `todo` · S

An optional "Show hint" before answering. It's generated with the question and costs a little
score (e.g. max 0.8). Must never reveal the answer key itself. The penalty applies to hints
only: **B18** pre-answer clarifications give no hints and stay free.

### B10. Mock interview mode — `todo` · L

A timed session that mixes topics, hides per-question feedback until the end and finishes with
an overall verdict and focus areas, like a real interview loop. It may want to turn off **B18**
pre-answer clarifications.

### B11. Backup and export — `todo` · S

Download the SQLite database (or a JSON export of topics, lessons and history), and restore from
it. Cheap insurance before risky migrations.

### B12. Search lessons — `todo` · S

Full-text search across generated lessons and key takeaways (SQLite FTS5).

### B15. Re-grade past code-output answers — `todo` · S

Answers graded before [PR #10](https://github.com/sdhiren/learning-assistant/pull/10) keep their
old scores. A one-off re-grade could re-score answers that only differ in line breaks instantly,
with no Claude usage, and optionally send the other 0% answers to Claude (one call each). Deferred
for now.

## In progress

Nothing in progress.

## Done

- **B18 / LA-10. Ask about a question or answer.** Every quiz question card has a follow-up box:
  "Unclear? Ask about this question" before answering (the `clarify-question` prompt sees only
  what the learner sees, never the answer key, and won't answer or hint), and "Ask a follow-up"
  after answering or skipping (`discuss-answer`, with the key, rubric, the learner's answer and
  feedback). The server picks the mode from whether an attempt exists. Threads are stored per
  question in `clarifications` (migration 0006, CREATE only), capped at 10 learner messages
  across both stages. Clarifications are free: no score penalty, unlike **B9** hints; a wrong
  key or grade is acknowledged but not re-scored (**B4**). PR link to follow.
- **B17 / LA-7.** CI and a migration safety net. `.github/workflows/check.yml` runs
  `npm run check` on every PR and on pushes to `main`, and branch protection on `main` requires
  its `check` status (admins included). `src/server/db/migrations.test.ts` fails on
  `DROP TABLE`, `ALTER TABLE … RENAME TO` or `PRAGMA foreign_keys=OFF` in any migration outside
  an allowlist with reasons. It also applies every profile migration one at a time to seeded
  study data and checks that no rows are lost, with a canary showing that a rebuild would
  cascade-delete attempts. No app or schema changes. PR link to follow.
- **B13 / LA-9.** Profiles with isolated data, in four stacked PRs. One SQLite file per profile
  plus a registry (`data/app.db`); the pre-profiles database is profile `sdhiren`, registered in
  place. Registration at `/register`, password sign-in with hashed cookie sessions and a
  lockout, envelope-encrypted per-profile secrets, `make profile-password`. `/profile` edits
  details and interests and chooses the AI provider per profile, including Sign in with Claude
  into a per-profile `CLAUDE_CONFIG_DIR`. The dashboard suggests topics from interests (catalog
  first, "Personalise" with the AI). Design: [docs/design/profiles.md](design/profiles.md).
- **LA-4.** Every AI call is logged with tokens, cost and latency, and shown on a Usage page.
  An `InstrumentedLlmClient` decorator writes one `llm_calls` row per call (outcome from a typed
  `ProviderError.kind`; no prompts, answers or keys), logs are one JSON line per event with a
  per-action `requestId` and `LOG_LEVEL`, and `/settings/usage` shows per-task failures and
  p50/p95 latency plus monthly tokens and reported/estimated cost per provider. Migration `0004`
  only creates `llm_calls` and its `started_at` index. PR link to follow.

- Code-output answers are graded on understanding, not just exact text. A new instant rule gives
  80% for the right values with different line breaks. Answers no rule matches are judged by
  Claude (partial credit up to 90%, with an explanation of what differs) instead of scoring 0.
  [PR #10](https://github.com/sdhiren/learning-assistant/pull/10)
- **B3.** Coding challenges. A new `coding_challenge` question type, with at most one per quiz,
  only for coding topics at Medium difficulty and above. Starter code is pre-filled in a
  monospace editor (Tab indents to match the starter code; Esc then Tab leaves the editor).
  Claude reviews the solution against the rubric and the reference solution for correctness,
  edge cases and complexity; learner code is never executed. The reference solution and rubric
  stay server-side until the question is answered. Solutions may be up to 12,000 characters.
  No migration needed. [PR #9](https://github.com/sdhiren/learning-assistant/pull/9)
- **B2.** Delete a subtopic. Allowed only when none of its questions was ever answered or
  skipped, and never for a topic's last subtopic, both re-checked inside the delete transaction.
  Quizzes that contained its unanswered questions are cleaned up: deleted if left empty,
  completed if every remaining question is answered.
  [PR #8](https://github.com/sdhiren/learning-assistant/pull/8)
- **B1 + B5.** Learner instructions for quizzes and lessons, including "Rewrite lesson" with
  instructions. Saved with the quiz and the lesson; migration `0003` only adds columns.
  [PR #5](https://github.com/sdhiren/learning-assistant/pull/5)
- Typo-tolerant grading for code-output answers.
  [PR #4](https://github.com/sdhiren/learning-assistant/pull/4), fixed for words with attached
  punctuation in [PR #6](https://github.com/sdhiren/learning-assistant/pull/6)
- UI refresh: theme switch, practice dashboard, livelier quizzes and lessons.
  [PR #3](https://github.com/sdhiren/learning-assistant/pull/3)
- Clean formatting of generated code in quizzes and lessons.
  [PR #2](https://github.com/sdhiren/learning-assistant/pull/2)
- Quiz skip and back navigation; simpler, example-rich lessons.
  [PR #1](https://github.com/sdhiren/learning-assistant/pull/1)
