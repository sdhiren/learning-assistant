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

### B2. Delete a subtopic — `todo` · S

- `deleteSubtopicAction` → `SubtopicService.deleteSubtopic` → repository delete, plus a confirm
  button on the subtopic page (mirror `delete-topic-button.tsx`).
- **Decided:** only subtopics with no answered questions can be deleted, so no quiz history is
  ever lost. If any of its concepts has an attempt, hide the button (or disable it with a short
  reason). Re-check on the server, not just in the UI.
- A subtopic whose quizzes were generated but never answered can still be deleted. Its
  unanswered questions cascade away with the concepts.
- Keep at least one subtopic per topic.

### B3. Coding challenges in quizzes — `todo` · L

A new question type `coding_challenge`: "write a function that…", with starter code.

- Add to `QUESTION_TYPES`, the AI schema, `question-validation.ts` and the quiz prompt
  ("include one when the topic involves code and the difficulty is medium or higher").
- Fields: prompt, starter code, language, reference solution, rubric (correctness, edge cases,
  complexity), explanation. The reference solution stays server-side until answered.
- Answer UI: a code editor area (monospace textarea first; a real editor like CodeMirror later).
- **Decided:** Claude grades the code through the existing `LlmClient` (Claude Code / Agent
  SDK). It reviews the solution against the rubric and reference solution and returns a score
  plus feedback on correctness, edge cases and complexity. Learner code is not executed.
- Allow longer answers than `ANSWER_MAX_LENGTH` for this type, and maybe a longer time budget.

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
