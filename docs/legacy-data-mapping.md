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

---

## `patients`

Schema and application surface are in place (`Patient` model, `patient.*`
procedures, the shared form in `apps/web/src/features/patients/`); the
collection importer itself is a future ticket and will follow the users
pattern (`legacyId` upsert, NDJSON in, report out).

### Source collection → target table

| Source | Target |
| ------ | ------ |
| `fastehr.patients` | `Patient` (`patients`) |

### Field mapping

| Source field | Target column | Type | Notes |
| ------------ | ------------- | ---- | ----- |
| `_id` | `legacyId` | `String @unique` | Always. Import key. |
| `firstName` / `lastName` | same | `String` | |
| `dobStr` | `dateOfBirth` | `DateTime @db.Date` | The string was the legacy source of truth; `dob` (a timestamp) is derived and discarded. |
| `gender` | `gender` | `PatientGender?` | Legacy enum `male/female`, kept as a PG enum. |
| `height` | `heightInches` | `Float?` | Unit named in the column, as the legacy form labeled it. |
| `healthyWeight` | `healthyWeight` | `Float?` | |
| `language` | `language` | `PatientLanguage?` | Legacy enum `english/spanish`. |
| `office` | `office` | `String?` | Free string on the entity so historical values import; the form input constrains to the current list. |
| `email` | `email` | `String?` | Normalized by the contract on write. |
| `phone.number` | `phone` | `String?` | Legacy stored a *Number*; here ten bare digits as a string. |
| `phone.permission` | `phoneFollowUpAllowed` | `Boolean` | Default `true`, the legacy form default. |
| `address.street/city/state/zip` | `addressStreet/City/State/Zip` | `String?` | Flattened. |
| `referralSource` | `referralSource` | `String?` | Free string on the entity, pick-list on the input. |
| `referredByPt` | `referredByPatientId` | self-relation | Resolved through patient `legacyId` at import time. |
| `hx` | `historyNotes` | `String?` | "Current medications and pertinent history". |
| `programType` | `programType` | `String?` | Pick-list on the input; `None` → NULL. |
| `status` | `status` | `PatientStatus` | Legacy free string; `inactive` maps to `inactive`, anything else to `active` (matching the legacy UI's own check). |

### Transform decisions

- There is no patient delete, here or in legacy (its route was disabled);
  deactivation is `patient.setStatus`.
- Search reproduces legacy semantics: names exact-but-case-insensitive, DOB by
  calendar day, phone by its ten digits; the default roster view is the most
  recent 30.

### Discarded fields

| Source field | Why discarded |
| ------------ | ------------- |
| `creditCardNumber`, `creditCardCVV`, `creditCardExpMonth/Year`, `creditCardZip`, `walletId`, `preferredPaymentId`, `last4Digits` | Stored in **plaintext** in legacy (its encryption call sites were commented out). Card data does not enter this system until there is a payments decision — likely tokenized via a processor, never raw PAN/CVV. |
| `visits`, `recentVisit`, `recentText`, `callLog`, `callAfter` | Visit/outreach domain — migrates with its own collections. |
| `referrals[]` (credit bookkeeping), `lastVideoSent`, `videoOneSent` | Campaign features, not patient identity. |
| consent blobs (`treatmentConsent*`, `liposhotConsent*`, `ozempicWaiver*`, `testimonialConsent`) | Consent management is its own module with signature handling; a free-string signature column is not it. |
| `isAtHome` | Derived from `office` (`… Home` suffix) — derived data is computed, not stored twice. |
| `preferredContactTime`, `cutoffDate`, `programPrice`, `weight` | Defined in the legacy form group but never rendered to users (dead fields), or programmatically patched only. |
| `dob` | Derived from `dobStr` (see above). |

