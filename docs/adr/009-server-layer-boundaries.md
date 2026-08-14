# ADR 9 — The server layer stays extractable, and unavoidable

**Status:** accepted  
**Applies to:** `apps/web/src/server` · `apps/web/eslint.config.mjs`

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
