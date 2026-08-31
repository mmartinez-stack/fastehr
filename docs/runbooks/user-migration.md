# Runbook — legacy user migration and credential issuance

**Branch:** `feat/auth-betterauth` · **Executed against:** MongoDB 8 container
(`fastehr` db, read-only), PostgreSQL 17 container. Legacy Mongo is never
written; every rollback below leaves it exactly as found.

## Decisions this runbook implements (signed off 2026-08-21)

| Question | Decision |
| --- | --- |
| Password strategy | **Option B** — migrate users with **no credential**; admin issues temporary passwords out-of-band, forced change at first sign-in. Decisive evidence: the legacy KDF (128-hex digest + 32-hex salt, algorithm and iteration count unrecoverable, no legacy source on disk) cannot be verified against, so lazy rehash was not implementable — and the auth proposal had already ruled the legacy hashes non-migrating |
| Self sign-up | Disabled entirely (`disableSignUp: true`) |
| Role mapping | `admin`→`admin`, `doc`→`provider`, `clerk`→`frontdesk`, `csr`→`frontdesk` — one front-desk role covering clerks, MAs, and the CSR |
| Migration input | **NDJSON export**, honouring `docs/legacy-data-mapping.md` — no MongoDB driver or extraction code enters this repo |

## 1. Export (runs against the container, outside the repo)

```bash
docker exec mongo mongoexport --quiet -u admin -p secret \
  --authenticationDatabase admin -d fastehr -c users \
  --fields _id,email,firstName,lastName,group,isActive > /path/outside/repo/users.ndjson
```

The field list is deliberate: the legacy `hash`/`salt` **never leave Mongo** —
Option B has no use for them. `*.ndjson` is gitignored as a backstop; keep the
export outside the working tree anyway.

## 2. Dry run (the default) and review

```bash
cd packages/db
pnpm migrate-users -- --input /path/outside/repo/users.ndjson
```

Read `<input>.report.json`: `eligible` should equal `totalRead` minus every
listed skip. Skips are per-record hard failures — unmapped roles, email
collisions after trim+lowercase, records whose email already belongs to a
non-migrated user. **Nothing is ever defaulted, least of all to admin.**

## 3. Apply, then prove idempotency

```bash
pnpm migrate-users -- --input /path/outside/repo/users.ndjson --apply
pnpm migrate-users -- --input /path/outside/repo/users.ndjson --apply   # second run: byte-identical rows
```

All writes are one transaction; a failure rolls the whole run back.
`createdAt` is recovered from each Mongo ObjectId's embedded timestamp.

## 4. Verify

```sql
SELECT role, count(*), count(*) FILTER (WHERE "isActive") AS active
FROM users WHERE "legacyId" IS NOT NULL GROUP BY role ORDER BY role;
```

Result of the real run (2026-08-21), matching the Phase 0 discovery counts
exactly (31 legacy accounts; clerk 4 + csr 1 = frontdesk 5):

| role | count | active |
| --- | --- | --- |
| admin | 10 | 9 |
| provider | 16 | 7 |
| frontdesk | 5 | 4 |

Second apply run reproduced a byte-identical row snapshot (md5 over all
columns except `updatedAt`). Zero skips, zero collisions; all 31 records
migrated with `legacyId` and `legacyRoleRaw` populated and no `account` rows.
The full JSON report (contains staff emails, so it follows the
entity-inventory practice of keeping identifying values out of the repo)
stays with the operator alongside the export.

Also worth knowing: 22 further user ObjectIds are referenced by 38,047 legacy
visit signatures but no longer exist in Mongo `users` at all. They cannot be
migrated (nothing remains to migrate) — later collection migrations must
tolerate `legacyId` lookups that miss.

## 5. Issue credentials (Option B)

```bash
cd packages/db
pnpm issue-temp-password -- --all-active          # every active user without a credential
pnpm issue-temp-password -- --email one@example.com
```

Temporary passwords print to **stdout only** — hand them out out-of-band and
discard the output. Each sets `mustChangePassword`; the guards then refuse
that account everywhere except `/change-password` until the user proves a
password of their own. Deactivated accounts are refused without
`--include-inactive`, so the 11 inactive legacy users cannot silently become
live logins.

## 6. Tests that pin all of this

```bash
docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fastehr_test \
  -p 55432:5432 postgres:17-alpine
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/fastehr_test \
  pnpm turbo run test:integration
```

`packages/db` covers the DB-level `staff_role` constraint and both scripts
(mapping, collisions, unmapped-role refusal, idempotency, credential
verification through Better Auth's own scrypt). `apps/web` covers sign-in
(including the indistinguishable failure message and cookie flags —
HttpOnly/SameSite always, Secure under an https base URL), server-side
sign-out invalidation, sign-up/role-injection immunity, the fail-closed
guards, deactivated-account refusal, and the temp-credential lifecycle.

## Rollback

This branch is purely additive. To unwind:

```sql
-- Remove only what the migration created (accounts/sessions cascade):
DELETE FROM users WHERE "legacyId" IS NOT NULL;

-- Or remove the auth schema entirely:
DROP TABLE verifications, sessions, accounts, users CASCADE;
DROP TYPE staff_role;
```

Legacy Mongo was read-only throughout, so the pre-migration state is simply
the legacy system, untouched.
