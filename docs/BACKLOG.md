# Backlog

Improvements we plan to make, picked up one at a time.

**How to use it:**

- New requirements go under **Requested** with the next free number (B15, B16, ...).
- Larger items get a design doc in `docs/design/`, linked from the item, with its open
  questions. An item is ready to build once its questions are answered.
- When work starts, set the status to `in progress` and move a short summary to **In progress**.
- When it ships, move it to **Done** with the PR link.

Status: `todo` · `in progress` · `done`. Size: S (hours), M (a day), L (several days).

## Requested

### B13. Profiles with isolated data — `todo` · L

Several profiles in one installation; two profiles never share topics, quizzes, answers, mastery,
lessons or settings.

- **Design:** [docs/design/profiles.md](design/profiles.md). Recommended approach: one SQLite
  file per profile, plus a small profile registry. Isolation is structural, with no per-query
  filtering to get wrong. Existing data becomes the "Default" profile in place.
- **Open question:** is separating data enough, or should a profile be PIN-locked so someone else
  using the same Mac can't switch into it?

### B14. Claude authentication with an API key — `todo` · M

Let the app use an Anthropic API key as well as the Claude subscription (Claude Code login).

- **Design:** [docs/design/api-key-auth.md](design/api-key-auth.md). Recommended approach: a
  second `LlmClient`, `AnthropicApiClient`, on the official Anthropic SDK. Ship with an env var
  first, then a settings page that stores the key in the macOS Keychain (never in the database
  or the browser).
- Also fixes a trap: in subscription mode, a stray `ANTHROPIC_API_KEY` in the shell silently
  bills the API key today.
- **Open questions:** one key for the app or a key per profile (recommended, needs B13)? Is the
  env var enough, or do you want the settings page too? Which model or models with an API key?

## Proposed

### B4. Report a wrong question — `todo` · S

Answer keys are AI-generated and can be wrong. A "This answer key looks wrong" button on the
feedback panel asks Claude to re-check the question. If the key is wrong, the attempt gets full
credit and the question is marked so it isn't reused in `recentQuestionPrompts`.

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
score (e.g. max 0.8). Must never reveal the answer key itself.

### B10. Mock interview mode — `todo` · L

A timed session that mixes topics, hides per-question feedback until the end and finishes with
an overall verdict and focus areas, like a real interview loop.

### B11. Backup and export — `todo` · S

Download the SQLite database (or a JSON export of topics, lessons and history), and restore from
it. Cheap insurance before risky migrations.

### B12. Search lessons — `todo` · S

Full-text search across generated lessons and key takeaways (SQLite FTS5).

## In progress

Nothing in progress.

## Done

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
