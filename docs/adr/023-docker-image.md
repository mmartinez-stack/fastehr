# ADR 23 — A production image for `apps/web`

**Status:** accepted — **supersedes [ADR 6](006-no-docker.md)**  
**Applies to:** `Dockerfile` · `.dockerignore` · `apps/web/next.config.mjs`

ADR 6 kept Docker out of the repository. That was right while nothing needed
deploying. It is reversed here: `Dockerfile` builds `apps/web` for production.

Nothing else about ADR 6 changes shape — there is still no compose file, and
local development is still `pnpm dev` against a database you run however you
like. This is a deployment artifact, not a development environment.

## The build

Three stages, from the **repository root** — this is a pnpm workspace and the
app compiles its dependencies from source (ADR 1), so a context of `apps/web`
cannot work.

| stage | does |
| --- | --- |
| `deps` | `pnpm install --frozen-lockfile` from manifests alone, so source edits do not re-install |
| `build` | `pnpm turbo run build --filter=@fastehr/web` — the `^generate` edge runs `prisma generate` first (ADR 15) |
| `runner` | copies the standalone server; installs nothing |

`output: 'standalone'` in `next.config.mjs` is what makes the last stage
possible: Next emits a server plus only the node_modules the app actually
reaches. **`outputFileTracingRoot` must point at the workspace root** — tracing
defaults to the app directory, and in a monorepo that misses everything under
`../../packages` and `../../node_modules`. The build still succeeds; the
container fails at import.

No `DATABASE_URL` is needed to build, which follows from ADR 14: `generate`
takes no connection and validation is deferred to the first query.

## Things that are easy to get wrong here

**Corepack is installed explicitly.** Node 26's images no longer bundle it, so
`corepack enable` fails with `not found`. The extra layer is worth it: corepack
reads the pnpm version from `packageManager`, so it stays pinned in one place
rather than being restated in the Dockerfile and drifting from CI.

**Alpine is fine now, and would not have been before.** Prisma 7 is Rust-free —
there is no native query engine to match against musl. Under Prisma 6 this image
would have needed glibc or a matching binary target.

**`NEXT_PUBLIC_*` are build arguments, not runtime configuration.** Next inlines
them into the client bundle at build time, so an image built with one origin
cannot be promoted to an environment that uses another. That is why
`NEXT_PUBLIC_APP_URL` is an `ARG`, and why it is part of the build cache key in
`turbo.json`.

**Migrations do not run on start.** A container that migrates as it boots races
every other replica and turns a rollout into a schema change. Run
`prisma migrate deploy` as its own deployment step.

**The runner is unprivileged** (`USER node`) and writes nothing to disk.

## Verified

Built and run against a real PostgreSQL container: `/_smoke` reports all four
seams healthy from inside the image — including `hydrated: ok`, so RSC prefetch
survives a production build — `/queues` and `/patients` render, and
`/api/trpc/health` answers. Prisma's wasm query compiler is present in the
traced output, which is the piece most likely to be missing from a standalone
monorepo build.

Image is ~320 MB. Of the 42 MB of traced `node_modules`, **18.6 MB is
`sharp`/`libvips`, which this app never uses** — `images.unoptimized` is `true`.
It can be excluded with an `outputFileTracingExcludes` entry, deliberately not
done here: the exclusion and `images.unoptimized` would then be a coupled pair,
and flipping image optimisation back on would produce a container that fails at
runtime rather than a build that fails. Worth doing if image size starts to
matter, with both settings commented as belonging together.
