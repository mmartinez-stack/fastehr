# ADR 22 — The office is part of the actor, not of the request

**Status:** accepted, amended 2026-09-13  
**Applies to:** `apps/web/src/server/procedures.ts` · `apps/web/src/components/office-provider.tsx` · `packages/contracts/src/office.ts`

A clinic with several sites has an authorization boundary between them: a
front-desk user at Downtown has no business reading Eastside's queue.

So the set of sites a user may reach is part of their **identity**
(`Actor.offices`, resolved server-side from the session), and a request that
names an office is checked against that set rather than believed.

## What it started as

`office` was a React context. `OfficeProvider` chose the list (`OFFICES`, a
fixture constant), chose the default (`"Downtown"`), and the nav let the user
switch. Every consumer read it with `useOffice()`.

That is fine for a mockup with no server. It becomes a horizontal access control
bug the moment a procedure filters by an office taken from its input: the server
would be asking the client which records it is entitled to, and the answer would
arrive in a query string that anyone can edit. Nothing about the resulting
request looks wrong in a log — the actor is real, the site exists, the query is
well-formed.

The reason to fix it before the first office-scoped query rather than after is
that afterwards it is not one change, it is every query.

## What holds now

- **`officeSchema` lives in `@fastehr/contracts`.** An authorization boundary
  defined in `src/lib/mock-data.ts` is one the server cannot enforce. The
  mockup re-exports the contract type, so there is one definition.
- **`Actor.offices`** carries the granted sites. Adding it made the compiler
  list every place an identity is constructed — five, all in tests, each now
  stating what it is scoped to.
- **`officeScopedProcedure`** takes `{ office }` as input and throws `FORBIDDEN`
  unless `ctx.actor.offices` includes it. `FORBIDDEN`, not `NOT_FOUND`: the
  actor is known and the site exists; they are simply not entitled to it. The
  audit middleware records the refusal, and records no office name.
- **`OfficeProvider` takes the permitted list as a prop**, supplied by the
  `(app)` layout from `permittedOffices()`. It no longer picks a default; an
  actor scoped to no site gets an empty state rather than an invented
  `"Downtown"`. The nav offers exactly what the server granted.

Narrowing the client list is **not** the enforcement — a request for another
site is refused regardless. It only stops honest users asking for what they
cannot have.

## Two consequences worth knowing

**Every `(app)` route is now dynamic.** The layout awaits `permittedOffices()`,
which reads headers, so pages that were statically prerendered are now
server-rendered per request. That is correct for an authenticated EHR — a
prerendered page cannot be scoped to a user — but it is a real change in the
build output, from mostly `○` to uniformly `ƒ`.

**One fallback remains for the auth ticket to delete.** With no session there is
no actor, and the mockup still has to render, so `permittedOffices()` currently
returns every site to an anonymous caller. It is survivable only because nothing
is scoped by it yet: `officeScopedProcedure` re-checks against
`ctx.actor.offices`, so a wide list grants no data. When sessions exist that
function becomes `actor.offices` outright and an anonymous caller gets nothing.

## What is still open

No product procedure is office-scoped yet, because no procedure reads
site-owned data yet — `Patient` has no office column, and adding one is the
persistence ticket's business. `src/server/office-scope.test.ts` exercises the
procedure kind against a local router so the behaviour is pinned before the
first real caller inherits it.

## Amendment, 2026-09-13: offices became locations, and a filter

The Aug 21 sync decided that nobody logs into a site and a location is a
**filter** (queues, reports), not a permission boundary; ADR 32 made the
sites rows. The mechanism here is kept with its names changed: the actor
carries `locations` (every clinic, for every role), the input is
`{ location }` where `location` is a clinic slug or `'all'`, and
`locationFilteredProcedure` refuses a slug outside the actor's set. Today
that refuses only a slug the contract does not know, because every actor
holds every clinic. The check stays because the hazard has not moved: the
value still arrives from a nav selector the browser controls, and a
procedure must never take from its input which records the caller may see.
`LocationProvider` replaces `OfficeProvider`, with the active clinics
supplied by `location.listActive` and a remembered per-browser choice
defaulting to all locations.
