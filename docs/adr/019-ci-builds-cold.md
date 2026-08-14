# ADR 19 — CI builds cold, and the database job is separate

**Status:** accepted  
**Applies to:** `.github/workflows/ci.yml`

**CI runs `--force`, with no turbo cache, deliberately.** The `verify` job's main
value is being the cold build. The `^generate` race is invisible against a warm
cache — `src/generated/` is already on disk, so the ordering is never
exercised — which is why the failure "only bites on a cold build: CI, or a
fresh clone". Caching task outputs here would hide the one thing CI is best
placed to catch. The pnpm *store* is cached, which speeds installs without
touching task ordering.

The whole workspace builds cold in under ten seconds, so there is nothing to
optimise yet. When that changes, the answer is a second, cached job for fast
feedback while this one stays cold — not caching this one. Affected-only
filtering (`--filter=...[origin/<base>]`) is the same trade, and equally
premature at five packages.

`check:graph` runs before the heavy tasks: it is a dry run, and a regression it
catches would otherwise surface further down as a confusing `TS2307`.

**The integration job is separate on purpose.** `verify` proves the workspace
builds and tests with no environment at all, which is what a fresh clone gets;
giving it a database would quietly retire that guarantee. See [ADR 18](018-two-test-tiers.md).
