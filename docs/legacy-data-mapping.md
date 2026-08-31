# Legacy data mapping

Per-collection mapping from the legacy system to the FastEHR schema. **Structure
only** — each section is filled in per-module as that module is migrated.

## Ground rules

**`legacyId String @unique` on every migrated table.** It holds the source
system's document id. Imports are therefore idempotent and re-runnable: an
importer upserts on `legacyId`, so a re-run after a partial failure converges
instead of duplicating. Migration is not a single cutover event — expect to
re-run a collection many times while mapping decisions are still settling.

**Importers read externally-produced NDJSON.** Extraction is somebody else's
job, upstream, and its output is a file. Each record is validated through a
`@fastehr/contracts` Zod schema before it reaches the database, so a shape
change in the source is a loud parse failure at a known line rather than a
silent bad row.

**No MongoDB driver or extraction code ever enters this repository.** Not as a
dependency, not as a script, not "temporarily". The repo's contract with the
legacy system is the NDJSON file format and nothing else; that is what keeps the
legacy system's lifetime decoupled from this one's.

Importers live in `packages/db`.

---

## `<collection-name>`

> Copy this block per collection.

### Source collection → target table

| Source | Target |
| ------ | ------ |
| `<legacy.collection>` | `<schema.Model>` |

### Field mapping

| Source field | Target column | Type | Notes |
| ------------ | ------------- | ---- | ----- |
| `_id` | `legacyId` | `String @unique` | Always. Import key. |
| | | | |

### Transform decisions

- <normalisation, unit conversion, splitting or merging fields, defaults for
  records that predate a field, how ambiguous values are resolved>

### Discarded fields

| Source field | Why discarded |
| ------------ | ------------- |
| | |

> Record fields deliberately dropped, and why. A field absent from both this
> table and the mapping above is an oversight, not a decision.

---

## `users`

Importer: `packages/db/scripts/migrate-users.ts` (dry-run by default; `--apply`
to write; JSON report per run).

### Source collection → target table

| Source | Target |
| ------ | ------ |
| `fastehr.users` | `User` (`users`) + credential `Account` (`accounts`) |

### Field mapping

| Source field | Target column | Type | Notes |
| ------------ | ------------- | ---- | ----- |
| `_id` | `legacyId` | `String @unique` | Always. Import key. |
| `email` | `email` | `String @unique` | Trimmed, lowercased. Missing → skip. |
| `firstName` + `lastName` | `name` | `String` | Joined with a space. |
| `name` | `name` | `String` | Old-shape records only; the split fields win when present. |
| `group` | `role` + `legacyRoleRaw` | `StaffRole` + `String` | `admin→admin`, `doc→provider`, `clerk/csr→frontdesk`; unmapped (`npdoc`) → hard skip, never defaulted. Raw value kept for audit. |
| `isActive` | `isActive` | `Boolean` | Missing hydrates to `true`, matching the legacy schema default; only explicit `false` deactivates. |
| `hash` + `salt` | `Account.password` | `String` | As `legacy-pbkdf2-sha1$1000$<salt>$<hash>` (ADR 26). Verified in place at sign-in, re-hashed to scrypt on first successful login. Invalid/missing pair → user migrates credential-less (see report), covered by `issue-temp-password.ts`. |
| `_id` timestamp | `createdAt` | `DateTime` | First four ObjectId bytes. |

### Transform decisions

- A credential `Account` whose stored password is *not* legacy-format is never
  overwritten on re-run — a password changed here survives the importer.
- Email collisions after normalization skip **all** colliding records.
- An email already owned by a user with a different (or no) `legacyId` skips —
  the importer never adopts rows it did not create.

### Discarded fields

| Source field | Why discarded |
| ------------ | ------------- |
| `dea`, `canPrescribe`, `reviewer`, `hasRemote` | Prescription/review workflow — returns with its own domain, not with identity. |
| `__v` | Mongoose bookkeeping. |

