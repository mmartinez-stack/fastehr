# ADR 21 — `noUncheckedIndexedAccess` is on everywhere, mockup included

**Status:** accepted  
**Applies to:** `apps/web/tsconfig.json` · `packages/config/tsconfig.base.json`

The base config turns it on. `apps/web` used to override it back off, with a
`TODO` to re-enable "once `src/lib/mock-data.ts` is replaced". That override is
gone; there are now no exceptions in the workspace.

## Why it could not wait for the mockup to go

The override was written as a concession to generated fixture code, and read as
one. What it actually did was compile **the whole app** without the flag — the
tRPC server layer, the middleware chain, the client seam, the repositories'
callers, and every file added after it. The mockup was the reason; it was not
the extent.

A flag with a `TODO` and no trigger does not retire. Measuring it settled the
question: 35 errors, **30 of them in `mock-data.ts` alone** and 5 across three
pages. The concession was one file wide, and paying it off cost an afternoon
rather than the rewrite the `TODO` implied.

## How the fixtures pay for it

`mock-data.ts` gets one helper:

```ts
function at<T>(items: readonly T[], index: number): T
```

Every lookup in that file is provably in range — `list[i % list.length]`, or a
fixed index into a list of known length — but the compiler cannot see that, and
is right not to try. `at` **throws** rather than asserting with `!`, so a list
that is later emptied or shortened fails loudly at import (which is to say, at
build) instead of seeding `undefined` through thirty fixtures. 32 call sites,
one helper, and deleting the file deletes the helper with it.

## The five outside the fixtures were worth fixing on their own

They are the class of thing the flag exists to catch:

- `visits.length ? visits[visits.length - 1].weight : 0` — a guard the compiler
  cannot follow, rewritten to bind the element and use `?.`
- two parallel-array reads indexed by a `map` index (`weights[i]`, `deltas[i]`)
- `smsThreads[0].id`, and a `find(...) ?? smsThreads[0]` result passed to a
  component requiring a non-optional thread — the SMS pane now renders an empty
  state instead of assuming a first row exists

**Behaviour is unchanged.** `MONTHS`, `weights` and `deltas` are all six
entries, so the `?? 0` guards never fire; the SMS empty state is reachable only
with an empty thread list, which fixtures never produce. Verified by serving the
built app: `/sms`, `/patients/p1`, `/reports`, `/queues` and `/callbacks` all
render, and the SMS page shows its conversation, not the empty state.
