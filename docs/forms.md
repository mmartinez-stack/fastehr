# Forms: validation, errors, and submission

The house pattern for every form that writes. The reference implementation is
`apps/web/src/app/(app)/patients/new/page.tsx` — a working, end-to-end form
(contract schema → tRPC mutation → Prisma) that every decision below is taken
from. Copy it; don't re-derive it. The reasoning behind the load-bearing
choices is in [ADR 25](adr/025-forms-validate-through-the-contract.md).

## Where validation runs

One input schema per mutation, in `@fastehr/contracts`, parsed on both sides:

- **Client, on submit** — the form's `onSubmit` validator runs
  `schema.safeParse` and reduces failure through `describeValidationFailure`.
  This gives immediate field errors and keeps invalid submits off the network.
- **Server, always** — the procedure's `.input(schema)` is the enforcement.
  The client parse is courtesy; nothing trusts it.

The input schema owns **normalization** as well as validation: trims names,
lowercases email, reduces a phone number to digits, treats a blank optional
field as absent. Do it there, not in `onChange` handlers — the schema runs on
both sides, so the stored value is the same no matter which side parsed it.

An input schema is written by hand, not derived with `.omit()` from the entity
schema: the entity schema describes a stored record; the input schema
describes what a person types.

## How errors travel, and where copy lives

Validation failures cross the wire as **field paths and issue codes, never
messages** (ADR 12). Both the client parse and a server rejection reduce to
the same `ValidationFailure`, and both are resolved through one **copy table**
the form owns:

```ts
const COPY: FormCopy = {
  firstName: { too_small: "Enter the patient's first name." },
  dateOfBirth: {
    invalid_format: "Enter the patient's date of birth.",
    custom: "Date of birth must be a past date.",
  },
}
```

`src/lib/form-errors.ts` does the plumbing: `toFormErrors(failure, COPY)`
resolves copy (with a generic fallback for uncovered codes), and
`validationFrom(error)` extracts the failure a tRPC mutation error carries.
The contract's tests pin the codes each rule emits; if a code changes there,
the message here silently degrades to the fallback — which is why that test
file exists.

### Which tier an error renders in

| Tier | When | Mechanism |
| --- | --- | --- |
| **Field** | The failure names a field (`fieldErrors`) | `<FieldError>` under the input, `data-invalid` + `aria-invalid` on the field |
| **Form** | Not attributable to one field: `formErrors`, conflicts, network/unexpected failure while the form is on screen | `<Alert variant="destructive">` at the top of the form |
| **Toast** | Success confirmation; failures of actions whose form is no longer on screen (e.g. a row action in a table) | `sonner` |

A failed submit never *only* toasts while the form is visible — the error
belongs next to what caused it.

### Copy guidelines

A good message:

- says **what to do next** — "Enter a phone number with ten digits", not
  "Invalid phone";
- names the field's meaning, not the rule — "Date of birth must be a past
  date", not "custom validation failed";
- fits under the field it belongs to: one sentence.

A message **never**:

- repeats what was typed. Error text ends up in consoles, logs, and
  screenshots; echoing input puts patient data there (the whole point of
  ADR 12);
- names a system, table, constraint, or exception;
- blames the user ("you failed to…"), or apologises theatrically;
- speculates. If the cause is unknown, say what to try:
  "…Check your connection and try again."

## Submission

- **Pending, not optimistic.** The submit button disables on `isSubmitting`
  and shows a progress label. No optimistic UI for clinical writes — a record
  on screen must exist (ADR 25).
- **Double-submit** is prevented by that same disable; `isSubmitting` spans
  the network call because the mutation runs inside the form's
  `onSubmitAsync` validator.
- **The mutation is the submit validator.** `mutateAsync` inside
  `onSubmitAsync`; a caught error is translated back into form errors and
  *returned*, which keeps the submission failed in the library's own state. A
  `validationFrom` miss (not a validation failure) becomes a form-level
  message.
- **On success**: invalidate the affected queries, toast, navigate.

## Unsaved changes

- `useStore(form.store, s => s.isDirty)` drives a `beforeunload` listener for
  hard navigation (tab close, reload).
- In-app links out of the form guard with Next's `Link onNavigate`: if dirty,
  `preventDefault()` and open the discard dialog instead.
- Both disarm once the mutation succeeds — navigating away from saved work is
  not a warning.

App-wide chrome (sidebar links) is not yet guarded; when a second form needs
that, lift the blocking state into a context as the Next `Link` docs describe
— not before (ADR 20's rule about anticipation).

## Destructive actions

Confirmation is an `<AlertDialog>` (Base UI, via `shadcn add alert-dialog`),
never `window.confirm`. The action button states the consequence ("Discard"),
the cancel option is the safe default, and the description says what is lost:
discarding a dirty form is the reference instance. Reserve typed-confirmation
("type the name to delete") for actions that destroy stored records.

## Replicating on the next entity

1. `create<Entity>Input` in `packages/contracts`, with tests pinning its
   issue codes and normalization.
2. Repository method typed in contract terms; migration + mapper + tests in
   one commit.
3. Mutation on the appropriate procedure chain (`protectedProcedure` /
   `adminProcedure` / `officeScopedProcedure`), unit-tested with a fake repo.
4. Form: copy table + `useForm` with the two submit validators + `FieldError`
   per field + form-level `Alert` + pending submit + unsaved-changes guard.
