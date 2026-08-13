# FastEHR

A pnpm + Turborepo monorepo. This document covers the layout, the bootstrap
command, and the rules the build enforces.

## Bootstrap

```bash
nvm use          # reads .nvmrc (Node 26.3.1)
corepack enable  # pins pnpm from the packageManager field
pnpm install
pnpm build
```

`pnpm install` is the only setup step; `packageManager` in `package.json` pins
pnpm to 11.21.0 and `.nvmrc` pins Node to 26.3.1, so every machine and CI runner
resolves the same toolchain.

## Layout

```
apps/
  web                 Next.js application (App Router, React 19, Tailwind v4)
packages/
  db                  persistence layer and generated client
  core                domain logic and use cases, framework-free
  contracts           shared schemas and types (zod)
  ui                  design system and components
  config              shared tsconfig, eslint, and tailwind presets
scripts/
  check-boundaries.mjs  manifest-level architecture check
```

### Dependency direction

```
web  ──▶  ui, core, contracts, db
db   ──▶  core, contracts        (db implements the ports core declares)
core ──▶  contracts              (nothing else — see "Boundaries")
ui   ──▶  react (peer)
```

`core` sits at the bottom and depends only on `contracts`. Persistence is
reached through ports that `core` declares and `db` implements, so the domain
never learns which ORM is underneath.

## Tasks

Every task runs through Turborepo from the repo root:

| Command           | What it does                                             |
| ----------------- | -------------------------------------------------------- |
| `pnpm build`      | `tsc` for packages, `next build` for the app              |
| `pnpm dev`        | Next dev server + `tsc --watch` for every package         |
| `pnpm lint`       | ESLint 9 flat config, per package                         |
| `pnpm typecheck`  | `tsc --noEmit`, per package                               |
| `pnpm test`       | Vitest, per package                                       |
| `pnpm check:boundaries` | Architecture check over the package manifests       |
| `pnpm clean`      | Removes build output and per-package `.turbo`             |

Scope a task to one workspace with `--filter`:

```bash
pnpm turbo run test --filter=@fastehr/core
pnpm turbo run build --filter=@fastehr/web...   # ...also builds its deps
```

## Caching

Local caching is on by default and writes to `.turbo/cache` (`cacheDir` in
`turbo.json`). A second run with unchanged inputs is a full cache hit:

```
$ pnpm turbo run build lint typecheck test    # cold
 Tasks:    23 successful, 23 total
Cached:    0 cached, 23 total
  Time:    6.421s

$ pnpm turbo run build lint typecheck test    # warm
 Tasks:    23 successful, 23 total
Cached:    23 cached, 23 total
  Time:    15ms >>> FULL TURBO
```

The cache restores artifacts, not just task status — deleting
`packages/*/dist` and `apps/web/.next` and rebuilding replays them out of the
cache rather than recompiling.

Build output is gitignored (`dist/`, `.next/`). That matters for more than
repo hygiene: Turborepo hashes every non-ignored file, so un-ignored build
output would feed its own artifacts back into the input hash and miss the cache
on any clean checkout.

### Remote caching

Not enabled — local caching covers the single-developer case today. To turn it
on for CI, run `pnpm turbo login && pnpm turbo link`, or set `TURBO_TOKEN` and
`TURBO_TEAM` in the CI environment. No `turbo.json` change is needed.

## Boundaries

`packages/core` must not depend on Next.js, React, or any ORM or database
driver. Two independent checks enforce this:

1. **ESLint** — `@fastehr/config/eslint/core-boundaries` applies
   `no-restricted-imports` inside `packages/core`, so a forbidden `import`
   fails `pnpm lint`.
2. **Manifest check** — `scripts/check-boundaries.mjs` reads the package
   manifests and fails if a forbidden dependency is declared, catching cases
   that never reach the linter (config files, scripts, generated code).

Both should run in CI; the second is a plain Node script with no dependencies.

Adding persistence to a use case means declaring a port in
`packages/core/src/ports/` and implementing it in `packages/db` — see
`PatientRepository` and `createInMemoryPatientRepository` for the shape.

## Shared configuration

`@fastehr/config` holds the presets the other workspaces extend:

- **tsconfig** — `base`, `library`, `react-library`, `next`. Presets carry
  `compilerOptions` only. Path-relative keys (`rootDir`, `outDir`, `include`,
  `paths`) resolve against the *preset's* directory when inherited, so each
  package sets those itself.
- **eslint** — `base`, `library`, `react-library`, `next`, `core-boundaries`.
- **tailwind** — `preset.css` carries the design-token contract (the `dark`
  variant, the `@theme inline` mapping, the base layer). The app supplies the
  palette values, so a second surface can reuse the token names with a
  different palette.

## Current state

The `apps/web` UI is a mockup: pages read from `apps/web/lib/mock-data.ts` and
there is no database yet. Two follow-ups are staked out in the code:

- No ORM is selected. `packages/db` ships
  `createInMemoryPatientRepository` as a placeholder until the persistence
  ticket lands the schema, migrations, and generated client.
- The 26 shadcn primitives still live in `apps/web/components/ui`. They move to
  `packages/ui` in the design-system extraction ticket; `packages/ui` currently
  seeds `cn` and a `Button`, and `apps/web/lib/utils.ts` re-exports `cn` from it.
- `noUncheckedIndexedAccess` is off for `apps/web` only, because the generated
  mockup indexes fixture arrays unchecked in ~30 places. It is on everywhere
  under `packages/`, and should be turned back on for the app once
  `mock-data.ts` is replaced.
