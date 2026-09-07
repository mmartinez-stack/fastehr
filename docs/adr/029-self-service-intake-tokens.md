# ADR 29 — Self-service intake: a single-use token bound to a request, not a patient

**Status:** accepted  
**Applies to:** `packages/contracts/src/intake.ts` · `packages/db/src/repositories/intake.ts` · `apps/web/src/server/routers/intake.ts` · `apps/web/src/server/sms.ts` · `apps/web/src/app/intake/[token]`

The Aug 31 sync (DIA-72) kept the legacy intake model — the front desk texts a
person a link, the person fills the patient form on their phone, the
submission waits in a queue until the front desk accepts it — and asked for
the link to carry "a single-use, expiring token bound to that patient".

## The problem with "bound to that patient"

No patient exists when the text goes out; the whole point of the flow is that
the person creates their own record. The legacy system resolved this by
texting one generic URL with no token at all and upserting whatever came back
straight into the patients collection with `status: "new"` — the form posted
its entire body unfiltered, and the only match was a name-plus-birthday
regex. That is what this design replaces.

## Decision

- **The token is bound to an `IntakeRequest`**, a row the front desk creates
  with the person's name, phone, and language. The patient row is created
  only on acceptance, from the reviewed submission. Nothing about a patient
  is guessed from what arrives.
- **The token is 32 random bytes, base64url, and only its SHA-256 is
  stored.** The server compares hashes; a read of the table cannot produce a
  working link. The token exists in the text message and in the URL, nowhere
  else — the send procedure returns the request without it.
- **Single-use and expiring.** A request is `sent` until it is `submitted`,
  and a link works only in `sent` before `expiresAt` (seven days,
  `INTAKE_LINK_TTL_DAYS`). The state changes are conditional writes
  (`updateMany … where status = 'sent'`), so a double submit or two reviewers
  accepting at once resolve to one winner in the database, not in a check that
  raced. Unknown, used, and expired tokens get the same `NOT_FOUND`, so a probe
  learns nothing.
- **The office is the person's choice, and the queue.** The intake form makes
  the office required (on the staff form it is optional); the submission
  lands in that office's Pending tab, served by an office-scoped, clerical
  procedure (ADR 22 plus ADR 28's clerical half).
- **The submission is stored normalized**, as the shape `createPatientInput`
  emits minus billing, in a JSON column parsed through the contract on every
  read. Accepting is the reviewer re-submitting the form — edits included —
  so the record is created from what the reviewer saw. There is no Billing
  tab on the person's form and none on review.
- **The public procedures are `publicProcedure`.** The person has no account;
  the token is the credential. They can open (learn the name and language the
  clinic entered, nothing more) and submit, once.
- **Messaging is a transport behind the context**, chosen from the
  environment at first use: Twilio's REST API when the three `TWILIO_*`
  variables are set, the server log otherwise. A partial configuration is
  refused by name. The development and dev-environment deployments run on the
  console transport until credentials exist.

## What was given up

- A link cannot be re-sent for the same request; the front desk sends a new
  one, which creates a new request. Simpler than a resend path, and the old
  link dies with its status.
- The person's form is English-only for now; the language chooses the text
  message's translation, not the form's.
- Sending to an existing patient (to update their record) is not modelled.
  The request has a `patientId` only after acceptance; a "bound to an
  existing patient" variant is a later addition, not a change to this one.
