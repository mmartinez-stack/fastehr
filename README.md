# FastEHR

A pnpm + Turborepo monorepo. Next.js (App Router), Prisma 7 on PostgreSQL,
tRPC, Zod v4, Tailwind v4.

This file is orientation and operation: what is where, and how to run it. The
reasoning lives in [`docs/adr/`](docs/adr/README.md) — one decision per file,
numbered permanently because code comments cite them.

## Bootstrap

```bash
pnpm install && pnpm turbo run build lint typecheck test
```

Node and pnpm are pinned: `.nvmrc` (26.3.1), `packageManager` (pnpm 11.21.0),
and `engines.node` (`>=22.12.0`) in the root `package.json`.

## Layout

```
apps/web            Next.js — routes, UI components, tRPC server and client seam
packages/core       domain logic, framework-free
packages/contracts  Zod schemas and inferred types (the leaf)
packages/db         Prisma schema, repositories, row→contract mappers; future home of NDJSON importers
packages/config     shared tsconfig, eslint, tailwind base CSS
```

Five packages, and adding a sixth needs a reason — [ADR 8](docs/adr/008-five-packages.md).

## Dependency direction

```
contracts   →  (nothing but zod)
core        →  contracts
db          →  contracts
apps/web    →  core, db, contracts, config
```

`core` must not import `db`, `next`, or the Prisma runtime client, and cannot:
those specifiers do not resolve from it ([ADR 2](docs/adr/002-core-isolation.md)).
Domain types come from `contracts`, never from Prisma
([ADR 3](docs/adr/003-contracts-own-domain-types.md)).

## Where things live in `apps/web`

```
apps/web/
  public/
  src/
    app/          routes (App Router)
    components/   app-local components; components/ui is shadcn's output
    lib/          utils, mock data
    server/       tRPC router, context, middleware chain
    trpc/         the client seam: RSC caller, browser client, query config
```

`@/*` resolves to `./src/*` and nothing else — [ADR 13](docs/adr/013-single-path-alias-root.md).

**Where a component goes** is decided by how many routes use it:

| | |
| --- | --- |
| one route | the route's own directory |
| several routes, one domain | `src/features/<domain>/` |
| several routes, no one domain | `src/components/` |
| shadcn CLI output | `src/components/ui/` — never hand-edited |

Write it in the route directory; move it when a second route needs it. Nothing
goes in a shared directory in anticipation. `src/components/ui` is fenced by
lint so it stays regenerable by `shadcn add` — [ADR 20](docs/adr/020-component-placement.md).

### The server layer

```
src/server/
  index.ts        the public surface — nothing outside imports past it
  context.ts      Actor, Context, createContext — built by the host
  trpc.ts         the tRPC instance: transformer, error shape, primitives
  procedures.ts   public / protected procedure composition
  middleware/     auth.ts (authn + RBAC), audit.ts (PHI trail)
  routers/        root.ts, plus one file per domain as they arrive
  audit-log.ts    the audit event and its sink
```

`trpc.ts` holds initialisation only, and `procedures.ts` composes the chain,
because the alternative is a cycle: middlewares need `t`, and a `t` module that
also assembled `protectedProcedure` would import the modules importing it.

Three import rules hold it in place, all enforced in
`apps/web/eslint.config.mjs`: the router never imports `next/*`, nothing outside
`src/server/**` imports `@fastehr/db`, and request state enters only through
`createContext`. What each buys is [ADR 9](docs/adr/009-server-layer-boundaries.md);
the chain order is [ADR 10](docs/adr/010-middleware-order.md).

Procedures speak superjson on the wire ([ADR 11](docs/adr/011-superjson-wire-format.md))
and return validation failures as codes rather than messages
([ADR 12](docs/adr/012-validation-errors-as-codes.md)).

### The client seam

```
src/trpc/
  server.tsx        RSC: in-process caller + prefetch, and HydrateClient
  client.tsx        'use client': the tRPC React client and its provider
  query-client.ts   the React Query config both sides share
  actor.ts          the one place a session becomes an Actor
```

```tsx
// Server Component
void api.patient.list.prefetch()
return <HydrateClient><PatientTable /></HydrateClient>

// Client Component
const patients = trpc.patient.list.useQuery()
```

Why it is shaped this way — including the two serialisation boundaries that
must agree — is [ADR 17](docs/adr/017-client-seam.md).

### shadcn/ui

Components are shadcn `base-nova` on [Base UI](https://base-ui.com) — not Radix.
`components.json` is the source of truth; `pnpm exec shadcn info` should report
`srcDirectory: Yes` and `tailwindCss: src/app/globals.css`. Add components with
the CLI rather than by hand:

```bash
cd apps/web && pnpm exec shadcn add <component>
```

They land in `src/components/ui/` and import `cn` from `@/lib/utils`, which is
why `shadcn` is a **dependency** and not a devDependency: `src/app/globals.css`
does `@import 'shadcn/tailwind.css'`, resolved through the package's exports map
at build time. Styling follows the CSS-variables convention
(`cssVariables: true`), so restyling means editing tokens, not component
classes.

## Environment and migrations

`.env.example` lists every variable and is the file to copy. Today that is one:
`DATABASE_URL`.

**Nothing needs it to build.** `pnpm install`, `turbo run build`, and CI all run
with no environment at all — `prisma generate` takes no connection, and no test
opens one. That property is load-bearing enough to be pinned by a test
(`packages/db/src/env.test.ts`): importing `@fastehr/db` must neither read nor
require configuration.

**Validation happens at first query**, not at import. `requireDatabaseUrl()`
parses `process.env.DATABASE_URL` through `@fastehr/contracts` and throws
naming the variable, so a misconfigured deployment fails on its first request
with `DATABASE_URL is not set. See .env.example` rather than an opaque driver
error. The schema lives in `contracts` because decision 5 makes it the only
package allowed a direct Zod dependency — an environment variable is a shape
agreement like any other.

The client is built lazily for the same reason, memoised per process, with the
`globalThis` handle kept only so dev survives HMR.

### Migrations

```bash
# schema change → migration, applied to your local database
pnpm --filter @fastehr/db exec prisma migrate dev --name <change>

# deploy: apply committed migrations, never generate them
pnpm --filter @fastehr/db exec prisma migrate deploy
```

`prisma/migrations/` is committed and append-only. `db push` is not part of the
workflow at any point: in a regulated system the migration history *is* the
record of how the schema got here, and a pushed change leaves no trace of
itself. `20260814025641_init` is the baseline for the placeholder model; the
persistence ticket builds on it rather than starting from empty.

Both commands need `DATABASE_URL` — they are the ones that connect. Prisma
takes it from `prisma.config.ts`, which reads `process.env` directly rather than
through the config package's eager `env()` helper, so `generate` keeps working
where no URL exists.

## Tests

Two tiers, separated because they need different things:

```bash
pnpm turbo run test              # unit — no database, no environment, anywhere
pnpm turbo run test:integration  # real PostgreSQL, real migrations
```

**Unit tests must stay runnable on a fresh clone with nothing configured.** That
is the property the main CI job depends on, so integration tests are excluded
from the default `test` task by filename (`*.integration.test.ts`) and by
`packages/db/vitest.config.ts`.

What sits where:

| | covers |
| --- | --- |
| `packages/contracts` | schema behaviour, and that no validation message escapes to the wire |
| `packages/core` | domain functions — pure, no I/O |
| `packages/db` unit | the row→contract mappers, env validation |
| `packages/db` integration | repositories against real PostgreSQL, through committed migrations |
| `apps/web/src/server` | the middleware chain via `createCaller`, the wire format, the error shape |
| `pnpm smoke` | the built app end to end, including RSC prefetch reaching the browser |

Rationale for the split and the pinned zone: [ADR 18](docs/adr/018-two-test-tiers.md).

### Integration tests

They require `TEST_DATABASE_URL`, refuse to fall back to `DATABASE_URL`, and
say so with a copyable `docker run` when it is missing. The refusal is the
point: the suite truncates tables between cases, and a default would eventually
find someone's working database.

```bash
docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fastehr_test \
  -p 55432:5432 postgres:17-alpine

TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/fastehr_test \
  pnpm turbo run test:integration
```

Schema is applied by `prisma migrate deploy` in the vitest global setup — the
same command a deployment runs, so a committed-but-broken migration fails here
instead of in an environment that matters.

### Testing procedures without a database

`createContext` takes `db` as an optional parameter, defaulting to the shared
repositories:

```ts
const caller = appRouter.createCaller(
  createContext({ actor, db: { patients: { findById: async () => ADA, listByLastName: async () => [] } } }),
)
```

Because `Db` is an interface of contract types, a fake is an object literal —
there is no client to mock and no query builder to stub. Procedure tests then
cover what procedures own (authorization order, input rejection, what reaches
the repository) while the database's own behaviour stays in `packages/db`'s
integration suite, which is the only place that can actually speak to it.

The same parameter is how a caller passes a transaction-scoped `Db` from
`createDb`, rather than a router reaching for a client of its own.

## CI

`.github/workflows/ci.yml`, on pull requests and pushes to the default branch.
Two jobs.

**`verify`** — install with `--frozen-lockfile`, `pnpm check:graph`,
`turbo run lint typecheck test build --force`, then `pnpm smoke` against the
built app.

**`integration`** — a Postgres 17 service container and
`turbo run test:integration`.

It builds cold, with no turbo cache, and the database job is separate from
`verify`. Both are deliberate — [ADR 19](docs/adr/019-ci-builds-cold.md).

## Turborepo

`prisma generate` is a first-class task whose output is cached inside the
package, and `lint` / `typecheck` depend on `^generate` rather than `^build`.
`pnpm check:graph` guards the ordering, which fails only on a cold cache when it
breaks — [ADR 15](docs/adr/015-generate-task-graph.md).

`build` declares `env: ["NEXT_PUBLIC_*", "DATABASE_URL"]` with `envMode: strict`,
because Next inlines `NEXT_PUBLIC_*` at build time and those values must be part
of the cache key. `.next/cache/**` is excluded from `outputs`: it is a local
incremental cache, not a build product.

## Routes

| route | purpose |
| --- | --- |
| `/_smoke` | workspace wiring test — components, contracts, the tRPC seam end to end |
| `/api/trpc/[trpc]` | the tRPC mount point |
| everything else | the v0 mockup, still reading `src/lib/mock-data.ts` |

`pnpm smoke` asserts `/_smoke` against a built server, and CI runs it. Why it is
not `/health`, and why the directory is `%5Fsmoke`:
[ADR 16](docs/adr/016-smoke-route-not-health.md).

## Adding a new package

Only add one if it earns the boundary — see [ADR 8](docs/adr/008-five-packages.md).

1. `mkdir -p packages/<name>/src`
2. `package.json` with `"type": "module"`, `main`/`types`/`exports` all pointing
   at `./src/index.ts`, and the `lint` / `typecheck` / `test` scripts.
3. `tsconfig.json` → `{ "extends": "@fastehr/config/tsconfig.base.json", "include": ["src/**/*.ts"] }`
4. `eslint.config.mjs` → `export { default } from '@fastehr/config/eslint'`
5. `pnpm install`.

No `turbo.json` edit is needed: pipelines apply to any workspace with a matching
script. If the app imports it, add it to `transpilePackages` in
`apps/web/next.config.mjs`. If it sits between the app and `db`, run
`pnpm check:graph`.

**Dependencies go in the package that imports them**, never the root:

```bash
pnpm --filter @fastehr/<name> add <dep>
pnpm --filter @fastehr/web add @fastehr/<name> --workspace
```

Root-level `-w` is reserved for repo-wide tooling (`turbo`, `typescript`).

## Current state

`apps/web` still carries the v0 mockup: pages read from
`apps/web/src/lib/mock-data.ts` and no database is wired up.

`noUncheckedIndexedAccess` is disabled for `apps/web` only, because the
generated mockup indexes fixture arrays unchecked in ~30 places. It is on for
every package under `packages/`.

Legacy migration mapping lives in [`docs/legacy-data-mapping.md`](docs/legacy-data-mapping.md).

## Decisions

Every decision, with its reasoning and the failure it prevents:
[`docs/adr/`](docs/adr/README.md).
