# ADR 1 — Internal packages ship raw TypeScript (JIT)

**Status:** accepted  
**Applies to:** every package · `apps/web/next.config.mjs`

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
