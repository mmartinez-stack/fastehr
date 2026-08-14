# ADR 11 — The wire format is superjson

**Status:** accepted  
**Applies to:** `apps/web/src/server/trpc.ts` · `apps/web/src/trpc`

`initTRPC.create({ transformer: superjson })`. Plain JSON has no `Date`, so
without a transformer a procedure typed as returning one hands the client a
string while the inferred type still says `Date` — the same class of silent,
type-checking-perfectly wrongness decision 3 describes, moved from the ORM
boundary to the transport boundary. Here it would land on dates of birth,
appointment times, and dose timestamps.

Contracts currently express dates as ISO strings (`z.iso.date()`), so nothing
depends on this yet. It is what makes the first `z.date()` or bare `new Date()`
in a procedure result behave as its type promises.

Two consequences:

- **Any client must set the same transformer**, and in tRPC v11 it goes on the
  link (`httpBatchLink` / `httpBatchStreamLink`), not the client root. A
  `createCaller` consumer never serialises and is unaffected.
- **Responses are enveloped.** `GET /api/trpc/health` returns
  `{"result":{"data":{"json":{"status":"ok"}}}}`, and inputs are wrapped the
  same way — worth knowing before debugging with `curl`.

`src/server/transformer.test.ts` pins this over a real fetch-adapter round-trip.
