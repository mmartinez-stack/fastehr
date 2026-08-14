# ADR 18 — Two test tiers, and a timezone pinned west of UTC

**Status:** accepted  
**Applies to:** `packages/db/vitest*.config.ts` · `.github/workflows/ci.yml`

Unit tests must stay runnable on a fresh clone with nothing configured — no
database, no environment. That is the property the main CI job depends on, so
integration tests are excluded from the default `test` task by filename
(`*.integration.test.ts`) and run from their own config under
`pnpm test:integration`.

Integration tests require `TEST_DATABASE_URL` and **refuse to fall back to
`DATABASE_URL`**. The suite truncates tables between cases, and a default would
eventually find someone's working database. Schema is applied by
`prisma migrate deploy` — the same command a deployment runs — so a
committed-but-broken migration fails in CI rather than in an environment that
matters.

**Both suites run pinned to `TZ=America/Los_Angeles`**, and not for a
developer's convenience. CI runners are UTC, and reading a `@db.Date` through
local time produces the correct answer *by accident* in UTC — so the
date-of-birth-off-by-one bug is invisible there. Pinning a zone west of UTC
means the test fails where it is cheap to notice. Verified by breaking the
mapper on purpose: the assertion reports `expected '1815-12-09' to be
'1815-12-10'`.
