# Design: Profiles with isolated data (B13)

Status: **proposed** · Backlog: [B13](../BACKLOG.md#b13-profiles-with-isolated-data--todo--l)

## Requirement

Support several profiles in one installation (for example two people sharing a Mac, or "Work"
and "Personal" prep). Two profiles must never share data: topics, quizzes, answers, mastery,
lessons and settings are visible only in the profile that created them.

## Options considered

|                                                    | A. `profile_id` column on every table                                                     | **B. One SQLite file per profile (recommended)**                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| How isolation is enforced                          | Every query must filter by `profile_id`                                                   | A profile's services only hold a connection to that profile's file  |
| Risk of a leak                                     | High: one missed `where` in ~40 queries leaks data, and new code must remember it forever | Very low: there is no query that _can_ reach another profile's data |
| Schema change                                      | Column + backfill on 7 tables; unique indexes (topic names) become per-profile            | None to the learning tables                                         |
| Delete / back up / export a profile                | Multi-table deletes; filtered exports                                                     | Delete or copy one file (also gives B11 for free)                   |
| Cross-profile features (e.g. a shared leaderboard) | Easy                                                                                      | Not possible without extra work (not a requirement)                 |

**Decision: B, a database per profile.** Isolation becomes structural instead of something every
query has to get right, and it fits the existing code: today `container.ts` holds one database
and one services graph; this becomes one of each per profile.

## Design

### Storage layout

```
data/
  app.db                         ← profile registry (new, tiny)
  learning-assistant.db          ← existing data, becomes the "Default" profile in place
  profiles/<profile-id>/learning-assistant.db   ← each new profile
  backups/...
```

- **Registry** (`data/app.db`): table `profiles(id uuid, name, name_key unique, db_path,
created_at, last_used_at)`. Separate Drizzle schema and its own migrations folder
  (`drizzle-app/`), so profile databases keep the current migrations unchanged.
- `db_path` is stored per profile, so the existing database is registered **where it already is**.
  No file is moved, which avoids the WAL/iCloud problems we hit earlier.
- **First run after upgrade:** if there's no registry yet, create it with one profile, "Default",
  pointing at `data/learning-assistant.db`. All existing progress stays there.

### Which profile is active

- An `httpOnly`, `SameSite=Lax`, `Path=/` cookie, `la_profile=<uuid>`. Set by a server action
  when switching; never readable from page JavaScript.
- A new server helper `getProfileServices()` replaces `getServices()` in every page and action. It
  reads the cookie, validates it (UUID, exists in the registry) and returns that profile's
  services. If the cookie is missing or invalid, it redirects to `/profiles` to choose one.
- Pages are already dynamic (`connection()`), so nothing is cached across profiles.

### Composition root (`container.ts`)

- `Map<profileId, { db, services }>`, built lazily on first use, so each profile gets its own
  connection and services graph. Migrations run per file on open, as today.
- Close connections for profiles idle for a while (a small LRU), so many profiles don't keep many
  files open.
- The `LlmClient` is also per profile, which is where B14 (API key per profile) plugs in.

### UI

- **Header:** the current profile's name and initial, with a menu to switch or manage profiles.
- **`/profiles` page:** list, create (name only), rename, switch and delete.
  - Delete requires typing the profile name. The file is moved to `data/backups/deleted/`, not
    removed, so deletion is recoverable.
  - The last remaining profile can't be deleted.
- **Theme** stays a per-browser preference (`localStorage`). It isn't learning data.

### Makefile

- `make db-migrate`, `db-backup` and `db-reset` loop over every profile in the registry.
- `make db-shell PROFILE=<name>` opens one profile's database.

## Isolation checklist (what could still leak, and the answer)

| Path                                                       | Mitigation                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| An id from profile A typed into the URL while in profile B | Looked up in B's file, where it doesn't exist → 404. Covered by a test.                                |
| Services singleton or React `cache()`                      | Services are keyed by profile; `cache()` is per request.                                               |
| Switching profile while a Claude request is running        | Services are bound when the request starts, so the result is written to the profile that asked for it. |
| Unsent drafts or quiz state in the browser                 | Client state is reset on profile switch (full navigation to `/`).                                      |
| Backups                                                    | Named per profile; restore targets one profile.                                                        |
| Logs                                                       | Already exclude user content; add the profile id only.                                                 |

## Threat model and the open question

Profiles **separate** data; on their own they don't **protect** it from someone else using the
same computer and browser, who could just switch profile. If that matters (two people sharing a
Mac), add an optional per-profile **PIN**:

- Stored as an `scrypt` hash in the registry.
- Required when switching to that profile.
- The unlocked state lives in a signed session cookie with an expiry.

Anyone with access to the files on disk can still read the database. OS-level user accounts are
the real boundary there.

> **Decision needed:** is "separate" enough, or should profiles be PIN-locked?

## Testing

- **Unit:** cookie validation, registry service (create, rename, delete, unique names), and the
  first-run default-profile bootstrap.
- **Isolation integration tests:** two in-memory profiles, create data in A, assert every service
  method in B returns nothing or 404 for A's ids.
- **Migration test** against a copy of a real database: existing data appears unchanged under
  "Default".

## Plan (one PR each)

1. Registry, bootstrap and per-profile composition root (no UI yet; everything uses "Default").
2. Profile cookie, `getProfileServices()`, and moving all pages and actions over.
3. Profiles page and header switcher.
4. Makefile and docs. Optional PIN, if decided.

Size: **L** (about 2 to 3 days).
