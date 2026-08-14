# ADR 14 — Prisma 7: rust-free, driver adapter, config in one file

**Status:** accepted  
**Applies to:** `packages/db`

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
