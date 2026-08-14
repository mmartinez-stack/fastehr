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
> nothing bounding it. See [ADR 14](adr/014-prisma-7.md) for the current setup
> and the full measurement table. The remaining findings below are unaffected.

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

> **Done** (2026-08-13). superjson on `initTRPC.create()`, pinned by
> `src/server/transformer.test.ts` over a real fetch-adapter round-trip; both
> tests fail with the transformer removed. Responses are now enveloped
> (`{"result":{"data":{"json":…}}}`), and any future client must set the same
> transformer on its **link** — noted in the README for finding 11.
>
> **Scope correction worth recording.** No procedure returns a `Date` today,
> because contracts express dates as ISO strings (`z.iso.date()`). This was
> therefore latent rather than an active bug — the original finding overstated
> it. The fix still earns its place as the guarantee for the first `z.date()`
> that appears, but if you would rather the contract layer own the wire format
> outright, the alternative is `.output(schema)` on every procedure, which
> makes a non-JSON-safe return a runtime failure instead. The two are
> compatible; only the second is enforcement.

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

> **Done** (2026-08-13). `packages/db` now exports a `Db` of repositories and
> nothing else; `PrismaClient`, the generated types, and the mappers are behind
> the single-entry `exports` map and fail with `TS2307` from outside the
> package (verified). Context holds `db` instead of `prisma`. `dateOfBirth` was
> added to the placeholder model so the first mapper is real rather than
> illustrative. Finding 13 (injectable client) is untouched — `createDb()` takes
> the client as a parameter, but `createContext` still resolves the default.

**What.** [ADR 3](adr/003-contracts-own-domain-types.md): "*`db` returns contract-shaped objects at its
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

> **Done** (2026-08-13). A `no-restricted-imports` override in
> `apps/web/eslint.config.mjs` bans `@fastehr/db` — and the relative path into
> `packages/db` — everywhere except `src/server/**`. Verified by probe in both
> directions: the ban fires on a page and on a component, the server layer is
> still free to import `db`, and rule 2's `next/*` ban still fires there.
> [ADR 9](adr/009-server-layer-boundaries.md) now documents three rules rather
> than two.
>
> **Residual, deliberately left open.** `createContext` is exported from
> `@/server`, so a Server Component could still construct a context with an
> actor of its own invention and call `appRouter.createCaller(…)`. Lint cannot
> distinguish that from the legitimate RSC caller, which needs exactly the same
> import. The answer is finding 11: one file resolves the actor and exports the
> caller, and *that* file gets the exemption — which is only decidable once the
> RSC seam exists. Worth remembering when it does.

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

> **Done** (2026-08-13). The audit now runs outermost in `protectedProcedure`,
> so refusals are recorded with the actor that made them. The payload is a typed
> `AuditEvent` in the new `src/server/audit.ts`, with `outcome: allowed | denied
> | error` distinguishing a refusal from a procedure that threw, and **no field
> for the input** — the type is the enforcement. `recordAuditEvent` is the only
> thing the audit ticket has to replace. Four tests in `src/server/audit.test.ts`
> drive the chain through `createCaller`; the two denial tests were confirmed to
> fail under the old ordering, so they are testing the fix rather than passing
> vacuously.

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

> **Done** (2026-08-13). `<Analytics />` removed from the root layout,
> `@vercel/analytics` dropped from the app's dependencies, and the
> `generator: 'v0.app'` metadata tag removed with it. Recorded as README
> decision 7, which also states what a compliant analytics story would look
> like if one is wanted later. An audit of `apps/web/src` found no other
> external host; `next/font` self-hosts Inter at build time and is not an
> exception.
>
> Taken as the straightforward reading of "remove it, or gate it behind an
> explicit decision" — it is one line and trivially reversible. If you do want
> product analytics, say so and the server-side shape in decision 7 is the
> place to start.

**What.** `apps/web/src/app/layout.tsx` renders `<Analytics />` in production.
Routes include `/patients/[id]` and `/queues/start-treatment/[id]`.

**Why it matters.** Page-path telemetry carrying record identifiers to a third
party is a disclosure question requiring a business-associate answer, not a
scaffold default. It is free to remove now and awkward to explain later.

**Fix.** Remove it, or gate it behind an explicit, documented decision.
`metadata.generator: 'v0.app'` in the same file is cosmetic leftover from the
mockup.

### 7. Office scoping lives in client state

> **Done** (2026-08-14), and it did not need auth after all — the plumbing is
> what needed doing, and the session only fills it in. [ADR 22](adr/022-office-scoping.md).
>
> `officeSchema` moved to `@fastehr/contracts` (an authorization boundary
> defined in `mock-data.ts` is one the server cannot enforce), `Actor` gained
> `offices`, and `officeScopedProcedure` throws `FORBIDDEN` unless the requested
> site is in the actor's set. Six tests cover it, including that the refusal is
> audited as a denial and that the audit never records which site was asked for.
> `OfficeProvider` now takes the permitted list as a prop from the `(app)`
> layout and no longer invents a `"Downtown"` default; an actor scoped to no
> site gets an empty state.
>
> **Two things to know.** Every `(app)` route is now dynamic, because the layout
> reads headers — correct for an authenticated EHR, but a real change from
> mostly `○` to uniformly `ƒ`. And `permittedOffices()` still returns every site
> to an anonymous caller so the mockup renders; that fallback is the auth
> ticket's to delete, and it grants no data today because the procedure re-checks
> against the actor regardless.
>
> **A cycle caught in passing.** The first version put `officeScopedProcedure`
> in `src/server/middleware/office.ts`, which imported `protectedProcedure` from
> `procedures.ts` while `procedures.ts` re-exported it — exactly the cycle ADR 9
> describes, failing at import with `Cannot read properties of undefined
> (reading 'input')`. It composes `.input()` with a check, so it is a procedure,
> not a middleware, and belongs in `procedures.ts`.
>
> Still open, and deliberately: no product procedure is office-scoped, because
> nothing reads site-owned data yet — `Patient` has no office column, and adding
> one is the persistence ticket's call.

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

> **Done** (2026-08-13). `.github/workflows/ci.yml` — one job on PRs and pushes
> to the default branch: `pnpm install --frozen-lockfile`, `pnpm check:graph`,
> then `turbo run lint typecheck test build --force`.
>
> Rehearsed against a fresh `git clone` with no node_modules, no `.turbo`, no
> generated client and no `.env`: 16/16 tasks, 12 tests, 8.6s. Both regressions
> the job exists to catch were simulated in that clone and both fail it —
> deleting `generate.dependsOn: ["^generate"]` from turbo.json exits `check:graph`
> non-zero with its explanatory message, and an out-of-sync manifest is rejected
> by `--frozen-lockfile`.
>
> **Departure from the finding as written.** It proposed remote caching plus a
> separate cold job. The job is cold *only*, with no turbo cache at all: at
> ten seconds cold, caching buys nothing and would mask the `^generate` race,
> which is the specific thing CI is here to catch. Affected-only filtering was
> skipped on the same reasoning. Both are noted in the workflow and the README
> as the first thing to revisit when the build stops being this fast.

`check:graph`, the cold-cache `TS2307` race, and `envMode: "strict"` are all
machinery built for a CI that does not exist. The README is explicit that the
`^generate` failure "is invisible locally … it only bites on a cold build — CI,
or a fresh clone." There is no cold build.

Add GitHub Actions: install, then `turbo run lint typecheck test build` with
remote caching, plus one job that runs cold (`--force`) and `pnpm check:graph`.
Use `--filter=...[origin/<base>]` for affected-only runs on PRs.

### 9. No migrations, no `.env.example`, no env validation

> **Done** (2026-08-13). All three parts, verified against a throwaway
> Postgres 17 container rather than reasoned about:
>
> - **Migrations.** `20260814025641_init` generated *and applied* by
>   `prisma migrate dev`, with `migration_lock.toml`. The table was inspected in
>   the database afterwards — `dateOfBirth` is a real `DATE` column. Workflow and
>   the no-`db push` rule are in the README.
> - **Env validation.** `databaseUrlSchema` / `serverEnvSchema` in
>   `@fastehr/contracts` (decision 5 forbids a second Zod dependency, so it goes
>   where Zod already lives), parsed by `requireDatabaseUrl()` in `packages/db`.
>   Checked in both directions: unset and wrong-protocol produce messages naming
>   the variable, and importing the package with no env still works.
> - **`.env.example`** added; `.gitignore` already had the negation for it.
>
> **Two things this turned up.** Validation had to be lazy — at first query, not
> at import — or `next build` and the CI job from finding 8 would need a fake
> DATABASE_URL, trading a loud failure for a value that looks configured. The
> client is now memoised and built on demand, and repositories take a getter so
> `createDb()` stays free of I/O. Separately, `prisma.config.ts` had lost its
> `datasource.url` during the Prisma 7 work, which left `migrate` with no URL
> source at all; it now reads `process.env` directly, which `generate` tolerates
> and `migrate` requires.
>
> While a real database was up, finding 3's mapper was re-checked against it
> under `TZ=America/Los_Angeles`: a `DATE` of `1815-12-10` comes back as
> `"1815-12-10"`, not the previous day. The UTC assumption holds against real
> Postgres, not just a synthetic `Date`.

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

> **Done** (2026-08-13). Split into `context.ts`, `trpc.ts` (init only),
> `procedures.ts` (chain composition), `middleware/{auth,audit}.ts`,
> `routers/root.ts`, `audit-log.ts`, behind the existing `index.ts`. Init and
> composition are separate files because middlewares need `t`, so a single
> module would import the modules importing it. Nothing outside `src/server/**`
> changed — the route handler and `api-types.ts` still import the barrel.
>
> `errorFormatter` added: validation failures leave as field paths and issue
> codes with the message replaced by `Invalid input`.
>
> **Two corrections that came out of testing this.** First, the rationale in the
> original finding — and in my first version of the code comments — said Zod's
> messages quote the value that failed. They do not, checked across five issue
> codes. The real exposure is author-written `.refine` messages, which is a
> better argument for the same fix, and the comments now say so.
>
> Second, and more serious: the first implementation replaced `message`
> correctly and the entire serialised `ZodError` still came back through
> `data.stack`, which tRPC includes outside production, with absolute server
> paths attached. Found only because a test asserted against the whole response
> body rather than the parsed fields. The formatter now strips `stack` from
> every error, and a test names that regression.

One `router.ts` and one `trpc.ts` will not survive patients, schedule, SMS, and
reports. Move to `src/server/{trpc.ts, context.ts, middleware/, routers/,
root.ts}` now, while it is a thirty-line change and the extraction guarantee the
README describes is still trivially true.

Add an `errorFormatter` that flattens Zod issues, with the same rule as the
audit log: error messages never echo input.

### 11. There is no client seam yet

> **Done** (2026-08-13). `src/trpc/{server.tsx, client.tsx, query-client.ts,
> actor.ts}`: `createHydrationHelpers` for the RSC caller and prefetch,
> `createTRPCReact` + `httpBatchStreamLink` for the browser, provider mounted in
> the root layout. `/_smoke` now exercises the whole path and `pnpm smoke`
> asserts it.
>
> Verified against a served production build: the Client Component's badge
> reads `hydrated: ok` **in the server-rendered HTML**, so the prefetch →
> dehydrate → hydrate path genuinely carried the data rather than the browser
> fetching after mount. Also checked that no server code reached the client
> bundle — `PrismaClient`, `@prisma`, `phi-audit`, `DATABASE_URL` and the router
> internals appear in zero of 44 chunks — which is the type-only
> `@/lib/api-types` import doing its job. Every mockup page stayed statically
> rendered, so wrapping the app in the provider cost nothing.
>
> **Consequence worth knowing:** `/_smoke` was statically prerendered, so a
> broken seam used to fail `next build`. Calling a procedure made it dynamic and
> that guarantee silently lapsed. `scripts/smoke.mjs` restores it one level out —
> serve the build, assert every badge — and CI runs it after the build step. It
> was mutation-tested: removing the prefetch makes it fail with `missing:
> hydrated: ok` and a message pointing at the two transformer configs.
>
> **Also closed finding 4's residual, by convention rather than by lint.**
> `actor.ts` is the single place a session becomes an `Actor`, shared by the
> route handler and the RSC caller — they differ only in where the cookie header
> comes from. Lint still cannot stop a component calling `createContext` with an
> invented actor; one file resolving actors is what makes that visible in review.

`apps/web` has no `@trpc/client`, no `@tanstack/react-query`, and no server-side
`createCaller`. `src/lib/api-types.ts` exports the type surface for a client that
does not exist.

The current App Router pattern is `createCaller` plus `createHydrationHelpers`
for RSC prefetch, with `httpBatchStreamLink` for interactive components. Choose
it before wiring the first real page: it decides whether `mock-data.ts` retires
page by page or in one sweep, and it is the second consumer of `createContext`
that proves the layer is actually transport-agnostic.

### 12. Testing is `--passWithNoTests` in three of four packages

> **Mostly done** (2026-08-13). Item 1 (RBAC/audit via `createCaller`) landed
> with finding 5. Item 2 is done here: `packages/db` integration tests against
> real PostgreSQL, schema applied by `prisma migrate deploy` in vitest global
> setup, run by a separate CI job with a Postgres 17 service container. Vitest
> configs now exist for both tiers, and `test`'s phantom `outputs: coverage/**`
> is gone with the four warnings it emitted every run.
>
> Item 3 (Playwright) is **deliberately not done** — see below.
>
> Safety property worth keeping: integration tests require `TEST_DATABASE_URL`
> and refuse to fall back to `DATABASE_URL`, because they truncate between
> cases. The error prints a copyable `docker run`.
>
> **The find that justified the whole exercise.** Both suites are now pinned to
> `TZ=America/Los_Angeles`. CI runners are UTC, and reading a `@db.Date` through
> local time is correct *by accident* in UTC — so the date-of-birth-off-by-one
> bug this repo already guards against in a unit test was invisible in CI.
> Confirmed by breaking the mapper on purpose: with the zone pinned it fails
> `expected '1815-12-09' to be '1815-12-10'` in both tiers; without it, under
> `TZ=UTC`, the unit suite passed with the bug present.
>
> **On Playwright.** The flow it would cover (queue → start-treatment) is
> `mock-data.ts` with no behaviour behind it, so the suite would assert the
> mockup and then be rewritten the moment those pages are wired to procedures —
> churn bought with a browser download in CI. `pnpm smoke` already covers "the
> built app serves and the data path works" end to end. The time to add it is
> after auth and one real page, when there is a flow whose breaking would
> matter. Say the word if you would rather have it now.

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

> **Done** (2026-08-13). `createContext({ actor, db? })`, defaulting to the
> shared repositories. The finding said "one line", and the change itself is —
> but a parameter with no caller is untestable API, so this also adds the first
> router that reads data (`routers/patient.ts`: `byId`, `list`) and five
> procedure tests driven with fake repositories: no database, no Prisma, no
> environment, no HTTP.
>
> Because `Db` is an interface of contract types, a fake is an object literal.
> That is a downstream benefit of finding 3 — had `db` still exported
> `PrismaClient`, faking it would mean mocking a query builder.
>
> Mutation-tested: making `createContext` ignore the parameter fails three of
> the five with `DATABASE_URL is not set`, so the injection is load-bearing. The
> other two — input rejection and the unauthenticated refusal — pass either way,
> correctly, because they never reach the repository. That the authorization
> test can assert `findById` was *not called* is the part worth having.

`createContext({ actor })` closes over the module-level `prisma`, so no test can
inject a transaction-scoped client and no alternative host can supply its own.
Make it a parameter defaulting to the singleton — one line, and it is what makes
finding 12 practical.

### 14. UI structure: write down the promotion rule

> **Done** (2026-08-13). [ADR 20](adr/020-component-placement.md), plus a lint
> fence keeping `src/components/ui` regenerable, and a short table in the README.
>
> The rule was written against the tree rather than from taste, and it ratifies
> the current layout with **no moves required**: every route-colocated component
> is used by exactly one route, and `page-header` (11 routes) and
> `status-badges` (7) span patients, queues and RFI, so `src/components/` is the
> right home for both. `src/features/` is described but not created — the first
> promotion creates it.
>
> **The enforceable half turned out to be the `ui` directory, not the promotion
> rule.** Promotion is a judgment call lint cannot make; "generated code must
> stay regenerable" is mechanical, and the failure is nasty — a primitive that
> imports a domain type is silently overwritten by the next `shadcn add`, and
> the file still compiles afterwards. It now may import only `@/lib/utils` and
> its siblings.
>
> Worth recording: my first version of that fence used a gitignore-style
> negation (`'!@/components/ui/**'`) and broke eleven real files, because the
> negation does not carve siblings back out of the broader pattern. A `regex`
> with `(?!ui/)` does. Caught by running lint on the tree rather than only on a
> probe — the probe alone would have looked like a pass.

Route-directory colocation is Next-idiomatic and correct at this size. The rule
worth stating before it is needed: promote a component to `src/features/<domain>/`
when a second route uses it; `src/components/ui` stays shadcn CLI output and is
never hand-edited.

### 15. `noUncheckedIndexedAccess: false` needs an exit

The concession is documented and the reason is sound, but a flag with no
retirement condition never retires. Isolate the fixtures behind one module so
the flag can flip the day the last page is wired.

### 16. The README is doing two jobs

> **Done** (2026-08-13). README 705 → 314 lines: orientation, layout, and how to
> run. Nineteen ADRs in [`docs/adr/`](adr/README.md), each holding its original
> reasoning **verbatim** — the prose was moved, not rewritten.
>
> **Numbers were preserved, not reassigned.** Around twenty code comments cite
> "decision N", so decisions 1–7 kept their numbers as ADRs 1–7 and the
> previously-unnumbered decisions extracted from prose took 8–19. Every one of
> those citations was rewritten from "decision N" / "README, §" to "ADR N", and
> the index says numbers are permanent so a superseded decision gets a new file
> rather than a renumbering.
>
> Checked afterwards: zero broken relative links across all markdown, zero
> remaining "decision N" references in code, and the distinctive phrases from
> each original section still present. Two sections that had been duplicated
> into both places were trimmed from the README; the `src/trpc/` file tree is
> duplicated on purpose, because an ADR should be readable on its own.

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
