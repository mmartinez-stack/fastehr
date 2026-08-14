# ADR 17 — RSC calls the router in-process; the browser hydrates

**Status:** accepted  
**Applies to:** `apps/web/src/trpc`

```
src/trpc/
  server.tsx        RSC: in-process caller + prefetch, and HydrateClient
  client.tsx        'use client': the tRPC React client and its provider
  query-client.ts   the React Query config both sides share
  actor.ts          the one place a session becomes an Actor
```

**Server Components call the router in-process.** `api.health()` runs no HTTP
and serialises nothing, but still passes the whole middleware chain, so a
Server Component reading PHI is authenticated, authorised, and audited exactly
like a browser request. That is what makes rule 3 (no `@fastehr/db` outside
`src/server/**`) livable rather than merely strict.

**Prefetch, then hydrate.** A page calls `void api.thing.prefetch()` and wraps
the subtree in `<HydrateClient>`; a Client Component then uses
`trpc.thing.useQuery()` and renders from the hydrated cache with no request of
its own. `void` rather than `await` lets the shell stream while the query
resolves — a still-pending query is dehydrated too, so the browser picks it up
rather than starting over.

**Two serialisation boundaries, both superjson.** The tRPC link is one; React
Query's dehydrate/hydrate is a second, and prefetched data takes only the
latter. Configuring one and not the other gives `Date`s that survive a fetch and
arrive as strings when prefetched — the same value with two shapes depending on
the path it took. `query-client.ts` sets `serializeData` / `deserializeData` for
exactly this reason.

**The QueryClient is request-scoped on the server** (`cache(makeQueryClient)`)
and module-scoped in the browser. Both halves matter: a module-level client on
the server would serve one user's cache into another's render, and a
per-render client in the browser would discard the hydrated cache.

Actor resolution lives in `actor.ts`, which imports no `next/*` and is shared by
the route handler and the RSC caller — the two differ only in where the cookie
header comes from. `src/trpc/server.tsx` is the only module that resolves an
actor for RSC; `createContext` is exported, so a component *could* invent one,
and lint cannot tell that apart from the legitimate caller.

`/_smoke` exercises the whole path, and `pnpm smoke` asserts it against a
running server — see CI, below.
