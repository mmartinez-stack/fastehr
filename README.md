# FastEHR

A pnpm + Turborepo monorepo. Next.js (App Router), Prisma 6 on PostgreSQL,
tRPC, Zod v4, Tailwind v4.

## Bootstrap

```bash
pnpm install && pnpm turbo run build lint typecheck test
```

Node and pnpm are pinned: `.nvmrc` (26.3.1), `packageManager` (pnpm 11.21.0),
and `engines.node` (`>=22.12.0`) in the root `package.json`.

## Layout

```
apps/web            Next.js — routes, UI components, tRPC server
packages/core       domain logic, framework-free
packages/contracts  Zod schemas and inferred types (the leaf)
packages/db         Prisma schema, repositories, row→contract mappers; future home of NDJSON importers
packages/config     shared tsconfig, eslint, tailwind base CSS
```

## Dependency direction

```
contracts   →  (nothing but zod)
core        →  contracts
db          →  contracts
apps/web    →  core, db, contracts, config
```

`core` must not import `db`, `next`, or the Prisma runtime client. This is
enforced mechanically — see decision 2.

## Why five packages and not seven

The workspace exists for one reason that survives scrutiny: **`core`'s purity is
enforced by manifest omission**, and manifest omission requires a package
boundary. That is a real, load-bearing constraint — you cannot get an
unresolvable-module guarantee out of a folder.

`packages/api` and `packages/ui` had no such justification. Both were defended by
a hypothetical second consumer, and neither has one today. A package boundary
costs a manifest, a tsconfig, an eslint config, a node in the task graph, and a
transpile entry; charging that against a consumer that may never exist is
speculative structure. Both were folded into `apps/web`:

- the tRPC router, context, and middleware chain → `apps/web/src/server/`
- the stub component → `apps/web/src/components/` (since replaced by shadcn's own Badge)

If a second consumer does appear, extracting them back is mechanical — which is
precisely what the `src/server/` rule below preserves.

## The server layer

`apps/web/src/server/` holds the tRPC router, the context factory, and the
auth / RBAC / PHI-audit middleware chain. Three rules hold it in place — the
first two keep it extractable, the third keeps it unavoidable:

1. **The router definition is framework-agnostic.** It is a plain function of
   its `Context`. It knows nothing about HTTP framing or how the actor was
   authenticated.
2. **Nothing under `src/server/**` may import `next/*`.** Request state — the
   session, user, and role — enters only through tRPC's `createContext`, which
   is constructed in `src/app/api/trpc/[trpc]/route.ts`. That route handler is the
   single file allowed to touch Next APIs, and it mounts the router through
   tRPC's **fetch adapter**.
3. **Nothing outside `src/server/**` may import `@fastehr/db`.** Auth, RBAC, and
   the PHI audit trail are middleware, so they run for procedure calls and
   nothing else. A Server Component reading the database directly would return
   patient data with no actor, no permission check, and no audit record — and
   would look entirely ordinary in review. Data reaches components through
   procedures.

All three are `no-restricted-imports` overrides in `apps/web/eslint.config.mjs`,
scoped by glob: rule 2 applies to `src/server/**`, rule 3 to everything else.
The route handler sits outside rule 2's glob deliberately, and imports the
server layer rather than the database, so it satisfies rule 3 unchanged. Rule 3
also blocks the relative-path route (`../../../packages/db/…`), which a package
specifier alone would miss.

The point of the first two is that a non-web client — an Electron main process,
a worker, a standalone service — can mount the same router by supplying its own
`createContext`. The moment `next/headers` is read inside the server layer, that
option is gone and the coupling is invisible until someone tries.

The point of the third is that the middleware chain is worth nothing if it can
be walked around. It mirrors Next's own Data Access Layer guidance — server-only
access, authorization inside it, DTOs out — which is the architecture already
here; the rule is what makes it the only path.

### Middleware order: audit, authenticate, authorize

`protectedProcedure` runs the PHI audit **outermost**, so it observes the
outcome of the checks beneath it and records refusals as well as reads. tRPC's
`next()` resolves rather than throws when something downstream fails, which is
what makes an outer middleware able to see a rejection at all.

An earlier version ran the audit innermost, reasoning that a record should only
be written for calls that passed authorization. That is the right instinct for
an *access* log and the wrong one for a *security* log: an actor probing records
they had no right to left no trace, while every legitimate read was faithfully
recorded. Refused attempts are what an investigation goes looking for, so
`outcome: 'denied'` is a first-class value in the event, distinct from a
procedure that merely threw.

The event type in `src/server/audit.ts` has **no field for the procedure
input**, and must not acquire one — inputs here are patient identifiers,
clinical values, and message bodies. The trail records that PHI was reached and
by whom, never the PHI itself.

`src/server/audit.test.ts` drives all of this through `appRouter.createCaller`
with a fabricated actor: no HTTP, no database, no session. That the security
behaviour is this cheap to test is the direct payoff for rule 1.

### App layout and path aliases

Everything the app owns lives under `apps/web/src/` — `src/app`, `src/components`,
`src/lib`, `src/server`. Only `public/` and the config files sit at the app root,
because Next.js requires `public/` there.

```
apps/web/
  public/
  src/
    app/          routes (App Router)
    components/   app-local components; components/ui is shadcn's output
    lib/          utils, mock data
    server/       tRPC router, context, middleware chain
```

That gives `@/*` exactly one root: `./src/*`. An earlier split layout —
`app/` at the app root alongside a `src/` sibling — needed
`paths: { "@/*": ["./*", "./src/*"] }`, and **`tsc` and Turbopack disagreed about
it**: `tsc` falls through to the second entry when the first yields no module,
while Turbopack matched the bare `components/` directory present in the first
root and resolved it to `undefined`. The result type-checked cleanly and then
failed at render with `Element type is invalid`. One root removes the whole
class of problem.

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

### Prisma 7

`packages/db` runs Prisma 7, which is Rust-free: the query engine is TypeScript
plus a wasm query compiler, a **driver adapter is mandatory**, and the
`prisma-client` generator emits ESM TypeScript source into the repository rather
than a binary into node_modules. Three consequences shape the setup here.

**Generated source is what a JIT package wants.** The generator writes nine `.ts`
files (~100 KB) to `packages/db/src/generated/client`, carrying `@ts-nocheck` and
`eslint-disable`. Emitting inside the package used to be a workaround forced by
Turbo's requirement that cached outputs live in a workspace; under `prisma-client`
it is the only option, since `output` is required. It is also exactly what
decision 1 already asks for — the app compiles real source, not a `.d.ts`
round-trip.

**The connection string lives in three places, none of them the schema.**
`datasource db` carries only `provider`; `url` there is a hard error in 7 (P1012).
At runtime the URL reaches Prisma through the pg driver adapter in
`packages/db/src/index.ts`. For the CLI it comes from `prisma.config.ts`, which
replaces the old `package.json#prisma` key and no longer auto-loads `.env` —
hence the explicit `dotenv/config` import there.

> `prisma.config.ts` deliberately does **not** declare `datasource.url`. The
> config's `env()` helper resolves eagerly at config-load time, so declaring it
> would make `prisma generate` fail without a database URL — and `generate` runs
> in CI and on a fresh clone, where there is none. Commands that actually
> connect (`migrate`, `db`, `studio`) need it supplied; `generate` does not.

**Next.js needs no Prisma-specific configuration.** Under Prisma 6 this repo
carried an `outputFileTracingExcludes` entry plus a matching
`turbopack.ignoreIssue` suppression, because the Rust engine's
`path.join(process.cwd(), …)` probe read to Turbopack as unbounded filesystem
access and made it trace the whole project. There is no engine and no probe in 7,
so both were deleted. Measured on the tRPC route, same method throughout:

| | files | size | `public/` | app source |
| --- | ---: | ---: | ---: | ---: |
| Prisma 6, no excludes | 190 | 19.5 MB | 9 | 66 |
| Prisma 6, with excludes | 115 | 19.2 MB | 0 | 0 |
| **Prisma 7, no excludes** | **200** | **7.1 MB** | **0** | **0** |

The file count rises because a Rust binary is one file and a TypeScript runtime
is many; the number that matters is that `public/` and app source are at zero
with nothing bounding the trace. 4.7 MB of the remaining 7.1 is the base64-embedded
postgres query compiler in `@prisma/client/runtime`, which Next externalises
correctly now that the generated code imports it by package specifier.

The CLI still downloads a native **schema** engine for `migrate` and `db` — that
is why the `allowBuilds` entries in `pnpm-workspace.yaml` remain. It is a
dev-time dependency of the CLI and never reaches the app bundle.

## Decisions

### 1. Internal packages ship raw TypeScript (JIT)

No `tsup`, no `composite: true`, no per-package build step. `main`, `types`, and
`exports` all point at `src/index.ts`, and `apps/web` lists every internal
package in `transpilePackages`.

**Why:** tRPC's value is end-to-end type inference from router to client. With
compiled packages that inference has to survive a `.d.ts` round-trip, which
means `composite` projects, declaration maps, and a build ordering constraint on
every lint and typecheck. Shipping source removes the round-trip entirely — the
app compiles the real types, and "go to definition" lands on the actual code.

**The cost of ever adding a build step:** it would reintroduce `^build` edges on
`lint` and `typecheck`, serialising the pipeline, and it would put a stale-output
class of bug back on the table. `allowImportingTsExtensions` in the shared
tsconfig is part of the same decision: nothing is emitted, so the `.ts` extension
in an import is honest about what is on disk.

### 2. `core` isolation is enforced by omission

`packages/core/package.json` lists neither `next` nor `@prisma/client`. pnpm's
isolated `node_modules` means those specifiers do not resolve from `core` at
all.

**Why:** a lint rule can be disabled with an inline comment; an unresolvable
module cannot. The failure is a hard `TS2307` at typecheck, in CI, with no
suppression path. `eslint-plugin-import`'s `no-extraneous-dependencies` is
layered on top purely for faster feedback in the editor. Dependency-cruiser is
deliberately not used; it would be a third description of a constraint the
package manager already enforces.

No exceptions, and no lint escape hatches.

### 3. `core` takes its types from `contracts`, never from Prisma

Domain types come from `@fastehr/contracts` via `z.infer` — exactly what the
dependency diagram already mandates. `db` returns contract-shaped objects at its
boundary; persistence shapes never cross into domain code.

**How that is enforced.** `packages/db` exports a `Db` of repositories and
nothing else — no `PrismaClient`, no generated model types, no `Prisma`
namespace. Its `package.json#exports` has a single entry (`.` →
`./src/index.ts`), so the client, the mappers, and the generated code are not
addressable from outside the package: `import … from '@fastehr/db/src/client.ts'`
fails with `TS2307`, the same unsuppressable failure decision 2 relies on. The
repository interfaces are declared in contract types only, so a query cannot be
expressed in Prisma's vocabulary through them either.

Mappers under `src/mappers/` are where rows become contracts. They list every
field explicitly rather than spreading a row — a new column is a type error, not
a silent pass-through — and they `parse` rather than cast, so drift between
`schema.prisma` and `contracts` fails at the row with the field named. The
`dateOfBirth` mapping is the worked example: a `@db.Date` column arrives as a JS
`Date` at UTC midnight and leaves as the `YYYY-MM-DD` string the contract
declares, converted through UTC because local time would shift the calendar day
west of UTC and record a birth date one day early.

**Why:** an earlier draft tried to let `core` use `import type` from the
generated Prisma client on the grounds that type imports are erased. That does
not survive decision 2 — TypeScript resolves the module specifier before it
distinguishes `import type` from a value import, so the specifier is
unresolvable from `core` either way. Rather than carve an exception into the one
boundary that is genuinely load-bearing, the requirement is withdrawn: contracts
are the single source of domain types.

**The hazard this prevents:** Prisma maps `Decimal` columns to a `Decimal`
object, not a `number`. Had Prisma types been allowed into `core`, a dosage or
a weight would arrive as a `Decimal` and type-check perfectly inside domain
arithmetic — `a - b` on two `Decimal`s compiles, and silently produces a wrong
value. Forcing every value through a Zod contract means that conversion happens
once, at the boundary, where it is visible and testable.

### 4. Tailwind v4

`packages/config/tailwind/base.css` is a **CSS file**, consumed with `@import`.

**Why:** v4 moved configuration into CSS. `@theme`, `@custom-variant`, and
`@utility` have no equivalent in a v3-style JS preset object. The base file owns
the token *contract* (dark variant, `@theme inline` mapping, base layer); each
app supplies the palette values.

```css
@import 'tailwindcss';
@import '@fastehr/config/tailwind/base.css';
```

### 5. Zod pinned exactly

`packages/contracts` declares `"zod": "4.4.3"` — no caret — and is the only
package with a direct Zod dependency.

**Why:** Zod's inferred types *are* the cross-package contract. A minor bump
that changes inference behaviour would surface as type errors in unrelated
packages during an unrelated install. Confining the dependency to one package
means there is exactly one version in the tree and one place to upgrade it.

### 6. Docker is out of scope

No Dockerfiles, no compose files.

## Turborepo

`prisma generate` is a first-class task, with `prisma/schema.prisma`,
`prisma/migrations/**`, and `prisma.config.ts` as its inputs. The generator
writes to `packages/db/src/generated/client` — **inside** the package — which
Turbo requires in order to cache the output at all, and which Prisma 7 requires
independently.

`lint` and `typecheck` depend on `^generate` and `generate`, **not** `^build`.
With JIT packages there is no build output to wait for, so `^build` would
serialize the pipeline for nothing.

`build` declares `env: ["NEXT_PUBLIC_*", "DATABASE_URL"]`, and `envMode` is
`"strict"`. This matters: Next inlines `NEXT_PUBLIC_*` values at build time, so
those variables must be part of the cache key — otherwise Turbo would restore a
build with another environment's values baked in. `.next/cache/**` is excluded
from `outputs`; it is roughly 80% of `.next` and is a local incremental cache,
not a build product.

The generated client is gitignored. Like any build output, leaving it tracked
would feed it back into Turbo's own input hashes.

### The `^generate` chain, and why it is guarded

`generate` declares `dependsOn: ["^generate"]`. This is a **named consequence of
decision 1**: because a JIT consumer compiles its dependencies' raw source,
`web#typecheck` compiles `db/src/index.ts`, which imports the generated client.
If that ordering is missing, typecheck races `prisma generate`.

`^generate` on `typecheck` expands to *direct* workspace dependencies only. The
topological `dependsOn` on `generate` itself is what carries the edge through
intermediate packages, as no-op `generate` nodes.

Its fragility is that the failure is invisible locally: a warm cache already has
`src/generated/`, so the race only bites on a cold build — CI, or a fresh clone —
as `TS2307: Cannot find module './generated/client/index.js'`.

Since `packages/api` was folded in, `apps/web` depends on `@fastehr/db`
directly, so the ordering currently comes from that direct edge and the
topological `dependsOn` is **latent insurance**. It becomes load-bearing again
the moment a package sits between the app and `db` — for instance if
`src/server` is ever extracted. That is exactly when someone is most likely to
have deleted it as dead config.

`pnpm check:graph` (`scripts/check-task-graph.mjs`) guards both halves: it
asserts `@fastehr/db#generate` is ordered before `@fastehr/web#typecheck`, *and*
that `turbo.json` still declares `generate.dependsOn: ["^generate"]`.

## Routes

`/_smoke` is the workspace wiring smoke test: it renders an app-local component
and parses a `@fastehr/contracts` schema, so broken package wiring or a bad path
alias fails the build instead of surfacing at runtime.

It is deliberately not `/health`. A liveness probe has to be answerable by a
load balancer without rendering UI or running schema validation, and `/health`
stays free for that.

> The route directory is `app/%5Fsmoke/`, not `app/_smoke/`. Next.js treats an
> underscore-prefixed folder as a *private folder* and excludes it from routing
> entirely — the page builds without error and simply has no URL. `%5F` is the
> URL-encoded underscore, which is how you get a literal leading underscore in a
> path segment.

## Adding a new package

Only add one if it earns the boundary — see "Why five packages and not seven".

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
