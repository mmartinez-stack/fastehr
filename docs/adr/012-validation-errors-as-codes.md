# ADR 12 — Validation errors leave as codes, never messages

**Status:** accepted  
**Applies to:** `apps/web/src/server/trpc.ts` · `packages/contracts/src/errors.ts`

Validation failures leave as **field paths and issue codes**, with the message
replaced by a constant:

```json
{ "message": "Invalid input",
  "data": { "validation": { "fieldErrors": { "firstName": ["too_small"] }, "formErrors": [] } } }
```

Zod's own default messages do not quote the value that failed — checked across
`too_small`, `invalid_type`, `invalid_format`, `invalid_value` and
`unrecognized_keys`. The exposure is the messages *we* write: a
``.refine(…, `invalid MRN: ${value}`)`` reads as helpful and puts a patient
identifier into a payload bound for browser consoles, proxy logs, and error
trackers. Reducing to codes closes that once, instead of depending on every
future refinement being written carefully. `describeValidationFailure` lives in
`@fastehr/contracts` because decision 5 keeps Zod out of `apps/web`.

**`stack` is stripped from every error**, not just validation failures. Outside
production tRPC includes it in the response, and a `TRPCError` raised from a Zod
parse carries the whole serialised issue array in its message — so the text
removed above returns through the stack, with absolute server paths attached.
Stacks stay in the server log.
