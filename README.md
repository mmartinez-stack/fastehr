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
packages/db         Prisma schema, generated client; future home of NDJSON importers
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
auth / RBAC / PHI-audit middleware chain. Two rules keep it extractable:

1. **The router definition is framework-agnostic.** It is a plain function of
   its `Context`. It knows nothing about HTTP framing or how the actor was
   authenticated.
2. **Nothing under `src/server/**` may import `next/*`.** Request state — the
   session, user, and role — enters only through tRPC's `createContext`, which
   is constructed in `src/app/api/trpc/[trpc]/route.ts`. That route handler is the
   single file allowed to touch Next APIs, and it mounts the router through
   tRPC's **fetch adapter**.

Enforced by a `no-restricted-imports` override scoped to `src/server/**` in
`apps/web/eslint.config.mjs`. The route handler sits outside that glob
deliberately.

The point is that a non-web client — an Electron main process, a worker, a
standalone service — can mount the same router by supplying its own
`createContext`. The moment `next/headers` is read inside the server layer, that
option is gone and the coupling is invisible until someone tries.

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

`prisma generate` is a first-class task. The generator writes to
`packages/db/src/generated/client` — **inside** the package — rather than the
default `node_modules/.prisma`, because Turbo can only cache outputs that live
within a workspace.

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
