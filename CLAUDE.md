# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

FastEHR — a pnpm + Turborepo monorepo: Next.js 16 (App Router), tRPC 11, Prisma 7
on PostgreSQL, Zod 4, Tailwind v4, shadcn on Base UI.

`README.md` is the long-form orientation; `docs/adr/` holds one decision per
file and is cited from code comments ("ADR 9"). Read the ADR before changing
something it covers — most of them exist because the obvious alternative was
tried and produced a bug that type-checked.

## Commands

```bash
pnpm install
pnpm turbo run lint typecheck test build   # what CI's verify job runs
pnpm check:graph                           # guards the generate task ordering
pnpm smoke                                 # serves the built app, asserts /_smoke (needs a prior build)
pnpm turbo run dev                         # Next dev server
```

Scope a task to one package with `--filter`:

```bash
pnpm --filter @fastehr/web typecheck
pnpm --filter @fastehr/core exec vitest run src/index.test.ts        # single file
pnpm --filter @fastehr/core exec vitest run -t 'patientDisplayName'  # single test by name
```

Package names: `@fastehr/web`, `@fastehr/core`, `@fastehr/contracts`,
`@fastehr/db`, `@fastehr/config`.

### Tests

Two tiers. `test` is unit-only and **must stay runnable on a fresh clone with no
environment at all** — that property is what CI's `verify` job depends on.

```bash
pnpm turbo run test                              # unit; no database, no env
pnpm turbo run test:integration --concurrency=1  # real PostgreSQL, real migrations; needs TEST_DATABASE_URL
```

Integration tests are excluded from `test` by filename (`*.integration.test.ts`)
and by `packages/db/vitest.config.ts`. They refuse to fall back to
`DATABASE_URL` because they truncate tables between cases — which is also why
`--concurrency=1` is not optional: the packages share one database, and run in
parallel the db suite's `TRUNCATE … CASCADE` deletes rows the web auth suite is
using mid-test.

```bash
docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fastehr_test \
  -p 55432:5432 postgres:17-alpine
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/fastehr_test \
  pnpm turbo run test:integration --concurrency=1
```

Both vitest configs pin `TZ=America/Los_Angeles` deliberately — a `@db.Date`
read through local time shifts the calendar day, and that bug is invisible on a
UTC runner (ADR 18).

### Migrations

```bash
pnpm --filter @fastehr/db exec prisma migrate dev --name <change>   # local
pnpm --filter @fastehr/db exec prisma migrate deploy                # deploy only
```

`prisma/migrations/` is committed and append-only. **`prisma db push` is not
part of any workflow here** — the migration history is the record of how the
schema got here. A schema change, its migration, and its tests go in one commit.

### shadcn components

```bash
cd apps/web && pnpm exec shadcn add <component>
```

`base-nova` style on Base UI, not Radix. Output lands in `src/components/ui/`
and is **never hand-edited** — restyling happens through CSS variables in
`src/app/globals.css`.

## Architecture

### Dependency direction (five packages, and a sixth needs a reason — ADR 8)

```
contracts   →  (zod only)
core        →  contracts
db          →  contracts
apps/web    →  core, db, contracts, config
```

- `core` cannot import `db`, `next`, or Prisma — those specifiers do not
  resolve from it, because they are absent from its manifest (ADR 2).
- Domain types come from `contracts`, never from Prisma. `@fastehr/db` exports
  a `Db` of repositories and nothing else — no `PrismaClient`, no generated
  model types, enforced by a single `exports` entry (ADR 3).
- `contracts` is the only package with a direct Zod dependency, pinned exactly
  (ADR 5). `apps/web` has no Zod of its own, so a procedure cannot invent a
  shape the contract does not describe.
- Packages ship raw TypeScript, no build step (ADR 1) — hence
  `allowImportingTsExtensions` and `.ts` in relative imports.

### The three lint fences in `apps/web/eslint.config.mjs`

Each guards something that fails **silently**. Do not disable one inline; if one
is in the way, that is a conversation.

1. `src/server/**` must not import `next/*`, `server-only`, or `client-only` —
   the layer stays mountable outside Next. Request state enters only through
   `createContext`, built by `app/api/trpc/[trpc]/route.ts` (which is outside
   the glob and free to use Next APIs). ADR 9.
2. **Only `src/server/**` may import `@fastehr/db`.** Auth, RBAC, and the PHI
   audit trail are tRPC middleware, so they run for procedure calls and nothing
   else. A Server Component reading the database directly would have no actor,
   no permission check, and no audit record — and would look ordinary in review.
3. `src/components/ui/**` may import only `@/lib/utils` and its own siblings, so
   `shadcn add` can keep overwriting it. ADR 20.

### The server layer (`apps/web/src/server`)

Everything outside imports from `src/server/index.ts`, never a file inside it.

- `trpc.ts` holds initialisation only and `procedures.ts` composes the chain,
  because the alternative is an import cycle: middlewares need `t`.
- Chain order is **audit → authenticate → authorize** (ADR 10). Audit is
  outermost on purpose: a refused probe is exactly the event an investigation
  goes looking for, and an innermost audit records only the legitimate reads.
- `officeScopedProcedure` checks the requested office against `ctx.actor.offices`.
  The office belongs to the actor, resolved server-side — never taken from a
  request or a client-side selection (ADR 22).
- Validation failures leave as issue **codes**, never messages, so a refinement
  message cannot carry a patient identifier into a console or access log
  (`describeValidationFailure` in `contracts`; ADR 12).
- The wire format is superjson, and both sides must agree (ADR 11).

Data reaches components through procedures. `ctx.db` is repositories, so
procedure tests need no database:

```ts
const caller = appRouter.createCaller(
  createContext({ actor, db: { patients: { findById: async () => ADA, listByLastName: async () => [] } } }),
)
```

### The client seam (`apps/web/src/trpc`)

`server.tsx` gives RSC an in-process caller plus `prefetch`/`HydrateClient`;
`client.tsx` is the browser client; `query-client.ts` is the config both share
(ADR 17).

```tsx
void api.patient.list.prefetch()
return <HydrateClient><PatientTable /></HydrateClient>
```

### Component placement (ADR 20)

Decided by how many routes use it: one route → the route's own directory;
several routes in one domain → `src/features/<domain>/`; several routes, no one
domain → `src/components/`; CLI output → `src/components/ui/`. Write it in the
route directory and move it when a second route needs it — nothing goes in a
shared directory in anticipation.

### Environment

Nothing is needed to install, build, or run CI: `prisma generate` takes no
connection and no unit test opens one. That is pinned by
`packages/db/src/env.test.ts` — importing `@fastehr/db` must neither read nor
require configuration. `DATABASE_URL` is validated at **first query**, through
`@fastehr/contracts`, throwing by variable name. `NEXT_PUBLIC_*` values are
inlined at build time, so they are part of the build's identity (declared in
`turbo.json` with `envMode: strict`) and an image cannot be promoted between
environments that differ in them. ADR 24.

### Turborepo

`generate` (prisma) is a first-class cached task, and `lint`/`typecheck`/`test`
depend on `^generate` rather than `^build`. Breaking that ordering fails only on
a cold cache, as `TS2307: Cannot find module './generated/client/index.js'` —
`pnpm check:graph` is what catches it. ADR 15. CI builds with `--force` for the
same reason (ADR 19).

## Current state

`apps/web` still carries most of the v0 mockup: routes under `src/app/(app)/`
read `src/lib/mock-data.ts`, except the patient roster, `/patients/new`, and
`/patients/[id]/edit`, which are wired end to end (legacy-parity form and
search — docs/legacy-data-mapping.md § patients; the `/patients/[id]` detail
view is still mockup). Auth is real (Better Auth; migrated legacy credentials
verify per ADR 26). `noUncheckedIndexedAccess` is on everywhere with no
exceptions — the mockup's fixture lookups go through the checked `at()` helper
rather than `!` (ADR 21).

## Conventions

Full detail in `CONTRIBUTING.md`.

- Branches: `<type>/<kebab-case-summary>`. `main` is the principal branch and is
  never committed to directly; `development` is the working branch every other
  branch is cut from and merged back into.
- Commits: `<type>: <lowercase summary>` — one line, **no trailers** (no
  `Co-Authored-By`), no scope parens, present tense, no trailing period.
  Types: `feat` `fix` `refactor` `docs` `chore` `test`.
- Commit the work, not the session: one commit per coherent change.
- **UI defaults**: content and components take the full width available — no
  per-page `max-w-*` caps; the app shell's `max-w-[1800px]` in
  `(app)/layout.tsx` is the only cap, and extra width is spent by gaining grid
  columns at `3xl`, never by stretching fields or tables. Every table view is
  zebra-striped — implemented once in `globals.css` against the table slot
  attributes, never per-table. Row actions are inline buttons on the row,
  never folded into a three-dot overflow menu. Required form fields are
  marked with `*` after the label (the shared `RequiredMark` component);
  optional fields carry no "Optional" text. No em dash (—) anywhere in
  user-facing text — titles, labels, descriptions, messages, placeholders,
  fixtures; use a period, comma, colon, or parentheses instead (a bare `-` is
  the empty-cell placeholder in tables).
- Add an ADR when a decision's reasoning would not survive someone asking "why
  is this like this?" — next free number, and a row in `docs/adr/README.md`.
  Superseding means a new file and a note on the old one, never a renumbering.
- **Never**: a secret in any form (including a real connection string in a
  fixture), real patient data anywhere (fixtures are invented — this covers test
  data, seed scripts, screenshots, and pasted error output), or a disabled lint
  fence.
- Dependencies go in the package that imports them
  (`pnpm --filter @fastehr/<name> add <dep>`); root `-w` is reserved for
  repo-wide tooling.
