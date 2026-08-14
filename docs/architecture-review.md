# Architecture review

Reviewed 2026-08-13 against `87e37c2`, on `infra/config-monorepo`. Covers the
workspace layout, the task graph, the server layer, and the four packages —
against the current state of the stack (Next.js 16, Prisma 7, tRPC 11).

The scaffold is well reasoned and most of its decisions survive scrutiny. The
gaps cluster in one place: **several invariants the README states are not yet
defended by anything.** A documented boundary that nothing enforces is a
boundary that will be crossed, and the crossing will be invisible until it is
expensive.

Findings are ordered by consequence, not by effort.

---

## What holds up

No action needed on any of these; they are listed so a later reader does not
relitigate them.

| Decision | Verdict |
| --- | --- |
| JIT packages, no build step (decision 1) | Correct. tRPC's value is inference that never round-trips through `.d.ts`. |
| `core` isolation by manifest omission (decision 2) | Correct, and genuinely load-bearing. An unresolvable module has no suppression path. |
| Five packages, not seven | Correct. Resist adding more; the additions proposed below all land in existing packages. |
| Tailwind v4 base as CSS (decision 4) | Correct. `@theme` / `@custom-variant` have no JS-preset equivalent. |
| Zod pinned exactly (decision 5) | Correct. One version in the tree, one place to upgrade. |
| `check:graph` guarding the `^generate` chain | Good. Its one weakness is that nothing runs it — see finding 8. |
| `%5Fsmoke` over `/health` | Correct, and the reasoning is right. |

---

## Tier 1 — defects

### 1. Prisma 6 → 7 deletes the largest piece of config debt in the repo

> **Done** (2026-08-13). Upgraded to 7.9.1 with `@prisma/adapter-pg`.
> `outputFileTracingExcludes`, `turbopack.ignoreIssue`, and the schema's
> `datasource.url` are gone; `prisma.config.ts` is new. Trace on the tRPC route:
> 19.2 MB → 7.1 MB, still zero `public/` and zero app-source entries with
> nothing bounding it. See README, "Prisma 7", for the current setup and the
> full measurement table. The remaining findings below are unaffected.

**What.** `packages/db` is on Prisma 6.19.3. Prisma 7 is stable and current
(7.9.x). v7 is Rust-free — the query engine is TypeScript + WebAssembly, and
bundle output drops from roughly 14 MB to 1.6 MB. The `prisma-client` generator
replaces `prisma-client-js`, is ESM-first, and emits **TypeScript source into
the repository** rather than `node_modules`. Driver adapters
(`@prisma/adapter-pg`) become mandatory.

**Why it matters.** Every premise of the workaround in `apps/web/next.config.mjs`
dissolves. There is no engine binary to trace and no
`path.join(process.cwd(), …)` runtime scan, so Turbopack has nothing to read as
unbounded filesystem access:

- `outputFileTracingExcludes` — delete
- `turbopack.ignoreIssue` — delete (the README already says these two go
  together)
- the ~19 MB of engine binary and wasm the README calls "genuinely needed at
  runtime" — no longer needed
- `'**/src/generated/**'` in the shared eslint `ignores` — the generated client
  stops being a foreign `.js` blob and becomes ordinary TypeScript

There is also a philosophical fit worth naming: generating into
`packages/db/src/generated` was a workaround forced by Turbo's requirement that
cached outputs live inside a workspace. In v7 that is the **sanctioned default**,
and generated-source-in-repo is exactly the JIT model decision 1 already commits
to.

**Cost.** Config moves from the schema and `package.json` to `prisma.config.ts`.
Environment variables are no longer auto-loaded — `dotenv/config` must be
imported explicitly. `$use` middleware is removed (unused here; the interception
this repo needs lives in tRPC middleware anyway, which is the better place for
it). `Prisma.validator` is legacy in favour of `satisfies`.

**Fix.** Do this first, before more code depends on the current shape. Re-run the
before/after trace measurement afterwards — the README already establishes the
methodology and the table format, and the numbers there become historical.

> One caveat found while researching: `queryCompiler` + `driverAdapters` under
> Prisma **6** preview flags had a monorepo bug where the wasm file was resolved
> against the consuming app rather than the owning package. That was a
> preview-flag issue; v7 stable is the supported path. Verify the trace size
> after upgrading rather than assuming it.

### 2. No tRPC transformer — `Date` values lie over the wire

**What.** `apps/web/src/server/trpc.ts` calls
`initTRPC.context<Context>().create()` with no `transformer`.

**Why it matters.** A procedure typed as returning `Date` returns a **string** at
runtime through the fetch adapter, while the client's inferred type still says
`Date`. This is the same failure class decision 3 exists to prevent — a value
that type-checks perfectly and is silently wrong — relocated from the ORM
boundary to the transport boundary. In this domain that is dates of birth,
appointment times, and dose timestamps.

**Fix.** superjson on both ends. Note that in tRPC v11 the client-side
transformer moved onto the link (`httpBatchLink` / `httpBatchStreamLink`), not
the client root; a v10-style client config fails with a specific error about
this. If `Decimal` ever crosses the wire, `trpc-transformer` is superjson plus
decimal.js support — though decision 3 argues Decimals should have been
converted at the contract boundary long before that point.

### 3. `packages/db` contradicts decision 3 at its own boundary

**What.** README decision 3: "*`db` returns contract-shaped objects at its
boundary; persistence shapes never cross into domain code.*" But
`packages/db/src/index.ts` is:

```ts
export { PrismaClient }
export type * from './generated/client/index.js'
```

**Why it matters.** Every Prisma type — `Decimal`, nullable columns, relation
payloads — is one import away from `apps/web/src/server`, and from there into any
call site that also touches `core`. The boundary is documented, not enforced.
Decision 2 is enforced by the package manager; decision 3 is enforced by nobody,
and it is the decision protecting arithmetic on clinical values.

**Fix.** Repositories and mappers inside `packages/db`. The package index exports
repository functions and contract types only. `PrismaClient` stays internal, or
is exported as a narrow `Db` type for the tRPC context to hold. The `export type *`
line is the leak and should go.

### 4. Nothing stops a page from importing `@fastehr/db` directly

**What.** `apps/web` depends on `@fastehr/db` at the app level. The only import
restriction in `apps/web/eslint.config.mjs` is `src/server/**` ↛ `next/*`.

**Why it matters.** Any Server Component can `import { prisma } from '@fastehr/db'`
and read PHI, bypassing authentication, RBAC, and the audit trail entirely. The
middleware chain — the repo's strongest architectural asset — is currently
opt-in, and the opt-out is a single import that no review step catches.

**Fix.** Mirror the pattern already in that file: a `no-restricted-imports`
override banning `@fastehr/db` outside `src/server/**`. The tRPC route handler
and the future RSC caller are the two permitted bridges, exactly as the route
handler is already the one permitted Next bridge inward. This is what Next's own
data-security guide calls a Data Access Layer: server-only, authorization inside
it, DTOs out — which is the architecture this repo already has, minus the fence.

### 5. Denied PHI access leaves no audit trail

**What.** The chain in `trpc.ts` is `requireAuth → requireRole → auditPhiAccess`.

**Why it matters.** A `FORBIDDEN` thrown by `requireRole` never reaches the audit
middleware, so the single most security-relevant event — an actor attempting to
reach a record they may not touch — produces no record at all. Successful
accesses are logged; refused ones vanish. HIPAA audit controls (§164.312(b))
expect failed attempts to be recorded, and in practice a denial trail is what
an investigation actually reads.

The current ordering comment explains the intent ("only for calls that passed
authorization"), which is a defensible reading for *access* logging and the wrong
one for *security* logging.

**Fix.** Either move the audit outermost and have it record the outcome
including the rejection, or emit an explicit denial event from `requireAuth` and
`requireRole`. Separately: make the payload a typed event object now, so
swapping `console.info` for the audit table is a one-line change rather than a
reshaping. Add the standing rule while the file is still short — **procedure
inputs are never logged**, only `path`, `type`, actor, and outcome.

### 6. Vercel Analytics runs on routes whose URLs contain patient identifiers

**What.** `apps/web/src/app/layout.tsx` renders `<Analytics />` in production.
Routes include `/patients/[id]` and `/queues/start-treatment/[id]`.

**Why it matters.** Page-path telemetry carrying record identifiers to a third
party is a disclosure question requiring a business-associate answer, not a
scaffold default. It is free to remove now and awkward to explain later.

**Fix.** Remove it, or gate it behind an explicit, documented decision.
`metadata.generator: 'v0.app'` in the same file is cosmetic leftover from the
mockup.

### 7. Office scoping lives in client state

**What.** `apps/web/src/components/office-provider.tsx` holds the selected office
in React context.

**Why it matters.** In a multi-site clinic, office is an authorization boundary.
A value chosen on the client and trusted by the server is a horizontal access
control bug, and if it is wired into the first real query it will be wired into
every one after it.

**Fix.** Resolve the office set from the actor server-side and carry it in
`Context`. The client context then selects among offices the actor already
provably has, and every procedure scopes its queries from `ctx`, never from
input. Decide this before the first real query, not after.

---

## Tier 2 — missing structure

### 8. There is no CI

`check:graph`, the cold-cache `TS2307` race, and `envMode: "strict"` are all
machinery built for a CI that does not exist. The README is explicit that the
`^generate` failure "is invisible locally … it only bites on a cold build — CI,
or a fresh clone." There is no cold build.

Add GitHub Actions: install, then `turbo run lint typecheck test build` with
remote caching, plus one job that runs cold (`--force`) and `pnpm check:graph`.
Use `--filter=...[origin/<base>]` for affected-only runs on PRs.

### 9. No migrations, no `.env.example`, no env validation

`turbo.json` lists `prisma/migrations/**` as a `generate` input for a directory
that does not exist, and declares `DATABASE_URL` as a build cache key that
nothing validates. Under `envMode: "strict"` a missing variable is quietly
absent rather than loud.

Add a zod-validated, `server-only` env module, and commit `prisma/migrations/`
from the first real model onward. For a regulated system, schema history is
evidence, not convenience — `db push` is not an option past the placeholder
stage. Keep the variable list in `turbo.json` `env` and the validation schema in
sync; they are two halves of one declaration.

### 10. The server layer needs its shape before it needs its content

One `router.ts` and one `trpc.ts` will not survive patients, schedule, SMS, and
reports. Move to `src/server/{trpc.ts, context.ts, middleware/, routers/,
root.ts}` now, while it is a thirty-line change and the extraction guarantee the
README describes is still trivially true.

Add an `errorFormatter` that flattens Zod issues, with the same rule as the
audit log: error messages never echo input.

### 11. There is no client seam yet

`apps/web` has no `@trpc/client`, no `@tanstack/react-query`, and no server-side
`createCaller`. `src/lib/api-types.ts` exports the type surface for a client that
does not exist.

The current App Router pattern is `createCaller` plus `createHydrationHelpers`
for RSC prefetch, with `httpBatchStreamLink` for interactive components. Choose
it before wiring the first real page: it decides whether `mock-data.ts` retires
page by page or in one sweep, and it is the second consumer of `createContext`
that proves the layer is actually transport-agnostic.

### 12. Testing is `--passWithNoTests` in three of four packages

`packages/core/src/index.test.ts` is the only test in the repo, and there is no
vitest config anywhere.

The transport-agnostic router exists *specifically* so that
`appRouter.createCaller(ctx)` works with a fabricated actor and no HTTP. That is
the payoff for the entire design, and nothing uses it. In priority order:

1. RBAC and audit middleware behaviour via `createCaller` — this doubles as
   compliance evidence, and it is the cheapest test in the repo to write
2. `db` integration tests against ephemeral Postgres (testcontainers or pglite),
   which is where the contract-shaped-boundary claim in finding 3 gets verified
3. one Playwright pass over queue → start-treatment

### 13. `createContext` hardcodes the Prisma singleton

`createContext({ actor })` closes over the module-level `prisma`, so no test can
inject a transaction-scoped client and no alternative host can supply its own.
Make it a parameter defaulting to the singleton — one line, and it is what makes
finding 12 practical.

### 14. UI structure: write down the promotion rule

Route-directory colocation is Next-idiomatic and correct at this size. The rule
worth stating before it is needed: promote a component to `src/features/<domain>/`
when a second route uses it; `src/components/ui` stays shadcn CLI output and is
never hand-edited.

### 15. `noUncheckedIndexedAccess: false` needs an exit

The concession is documented and the reason is sound, but a flag with no
retirement condition never retires. Isolate the fixtures behind one module so
the flag can flip the day the last page is wired.

### 16. The README is doing two jobs

At ~330 lines it interleaves orientation with decision rationale, and the
decision count only grows from here — this document adds sixteen more. Split it:
README keeps layout, dependency direction, and how to run; `docs/adr/NNN-*.md`
takes one decision each, with the existing rationale preserved verbatim. The
prose is the repo's most valuable artifact and should not be diluted by
how-to-run content.

---

## Suggested sequence

1. **Prisma 7.** Deletes roughly sixty lines of `next.config.mjs` and an entire
   README section. Everything else is easier afterwards.
2. **`packages/db` repositories and mappers.** Stop re-exporting generated types.
3. **Server layer restructure** — split files, superjson, `no-restricted-imports`
   on `@fastehr/db`, audit reordering.
4. **CI, migrations, env validation.** The guards that already exist start
   guarding.
5. **Auth, session, and office scoping in `Context`.** Everything above is a
   prerequisite for doing this once.
6. **Retire `mock-data.ts`** page by page behind the tRPC seam, then flip
   `noUncheckedIndexedAccess`.

Findings 1–7 are defects. Findings 8–16 are structure that is missing rather than
wrong, and can be taken in the order the roadmap makes convenient.

---

## Sources

- [Prisma 7 release announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [Prisma v6 → v7 migration guide](https://tomodahinata.com/en/blog/prisma-orm-v6-to-v7-migration-guide)
- [Prisma 7.2 release notes](https://www.prisma.io/blog/announcing-prisma-orm-7-2-0)
- [tRPC — data transformers](https://trpc.io/docs/server/data-transformers)
- [tRPC v11 — transformer moved to links](https://github.com/trpc/trpc/discussions/5570)
- [`trpc-transformer` — superjson with decimal.js support](https://github.com/icflorescu/trpc-transformer)
- [tRPC with React Server Components (2026)](https://www.christadrian.dev/blogs/mastering-trpc-with-react-server-components-the-definitive-2026-guide)
- Next.js 16 bundled docs: `01-app/02-guides/data-security.md`,
  `01-app/01-getting-started/16-proxy.md`, resolved from
  `apps/web/node_modules/next/dist/docs/`
