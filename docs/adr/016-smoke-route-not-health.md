# ADR 16 — `/_smoke` is the wiring test; `/health` stays free

**Status:** accepted  
**Applies to:** `apps/web/src/app/%5Fsmoke` · `scripts/smoke.mjs`

`/_smoke` is the workspace wiring smoke test: it renders an app-local component,
parses a `@fastehr/contracts` schema, calls a tRPC procedure in-process, and
prefetches one for a Client Component to hydrate from — so broken package
wiring, a bad path alias, or a mismatched transformer fails a check rather than
surfacing in a product page.

It is deliberately not `/health`. A liveness probe has to be answerable by a
load balancer without rendering UI or running schema validation, and `/health`
stays free for that.

It used to fail the *build*, because it was statically prerendered. Calling a
procedure made it dynamic (the caller reads headers), so `next build` no longer
renders it. `pnpm smoke` restores the guarantee one level out: it serves the
build and asserts every badge, and CI runs it after the build step.

> The route directory is `app/%5Fsmoke/`, not `app/_smoke/`. Next.js treats an
> underscore-prefixed folder as a *private folder* and excludes it from routing
> entirely — the page builds without error and simply has no URL. `%5F` is the
> URL-encoded underscore, which is how you get a literal leading underscore in a
> path segment.
