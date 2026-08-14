# ADR 8 — Five packages, not seven

**Status:** accepted  
**Applies to:** the workspace

The workspace exists for one reason that survives scrutiny: **`core`'s purity is
enforced by manifest omission**, and manifest omission requires a package
boundary. That is a real, load-bearing constraint — you cannot get an
unresolvable-module guarantee out of a folder.

`packages/api` and `packages/ui` had no such justification. Both were defended by
a hypothetical second consumer, and neither has one today. A package boundary
costs a manifest, a tsconfig, an eslint config, a node in the task graph, and a
transpile entry; charging that against a consumer that may never exist is
speculative structure. Both were folded into `apps/web`:

- the tRPC router, context, and middleware chain → `apps/web/src/server/`
- the stub component → `apps/web/src/components/` (since replaced by shadcn's own Badge)

If a second consumer does appear, extracting them back is mechanical — which is
precisely what the `src/server/` rule below preserves.
