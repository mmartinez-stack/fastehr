# ADR 25 — Forms validate through the contract, and the mutation is the submit validator

**Status:** accepted  
**Applies to:** `apps/web/src/app/(app)/patients/new` · `apps/web/src/lib/form-errors.ts` · `packages/contracts`

Forms are the bulk of this application's surface. This records the decisions
made once, on `patients/new`, so the next eleven entities copy a shape instead
of re-deciding it. The working pattern is documented in
[`../forms.md`](../forms.md); this file records why it is shaped that way.

## One schema, two parses

The input schema (`createPatientInput`) lives in `@fastehr/contracts` and is
parsed twice per submit: once in the browser, for immediate field errors, and
again in the tRPC mutation, as the enforcement. The client parse is courtesy —
nothing about it is trusted, and deleting it would change latency, not safety.

This falls out of ADR 5 rather than being new: `apps/web` has no Zod of its
own, so a form *cannot* invent a validation rule the contract does not
describe. Normalization (trimmed names, lowercased email, phone reduced to
digits) lives in the schema too, which is why the value the repository stores
is identical whether the parse that produced it ran in Chrome or in the
procedure.

## The form library is TanStack Form, used thinly

Chosen over react-hook-form for stack coherence (TanStack Query is already the
data layer) and because it needs no adapter package. But the deliberate part is
what it is **not** used for: the schema is *not* handed to the library's
validator slot, even though both sides support that via Standard Schema.

A library-run schema surfaces Zod's own issue *messages*. ADR 12 keeps
messages out of the wire because a refinement message can carry a patient
identifier; the same reasoning applies to what a form displays, and it would
make the client-caught and server-caught paths render different text for the
same mistake. Instead the submit validator runs `safeParse` and reduces the
error through `describeValidationFailure` — the exact reduction the server's
errorFormatter applies — so both directions produce a `ValidationFailure`, and
one copy table (field × issue code → message, owned by the form) is the single
place user-facing text exists.

The failure this prevents: two sources of truth for error copy, drifting, with
the rarely-exercised server path showing raw Zod text in production.

## The mutation runs inside `onSubmitAsync`

Not in an `onSubmit` handler after validation. Returning the mapped server
errors *from the validator* keeps the submission failed in the library's own
state — errors clear on the next submit, `isSubmitting` spans the network
call (which is the double-submit guard), and the success path cannot run
before the row exists. An earlier sketch with the mutation in the submit
handler needed hand-rolled error state that the next form would have
reimplemented slightly differently.

## No optimistic writes

Pending state, disabled submit, then navigate on success. Optimistic UI shows
a clinician a patient record that may not exist; for clinical writes the
hundred milliseconds are not worth it. This is a default, not a ban — a
low-stakes toggle can revisit it, with the rollback story written down.
