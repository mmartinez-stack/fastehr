# ADR 15 — `generate` is a first-class task, and the chain is guarded

**Status:** accepted  
**Applies to:** `turbo.json` · `scripts/check-task-graph.mjs`

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
