# ADR 13 — One root for `@/*`

**Status:** accepted  
**Applies to:** `apps/web/tsconfig.json`

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
