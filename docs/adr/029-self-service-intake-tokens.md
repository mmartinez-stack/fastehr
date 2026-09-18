# ADR 29 — Self-service intake: a single-use token bound to a request, not a patient

**Status:** accepted, amended 2026-09-13  
**Applies to:** `packages/contracts/src/intake.ts` · `packages/contracts/src/intake-consent.ts` · `packages/db/src/repositories/intake.ts` · `apps/web/src/server/routers/intake.ts` · `apps/web/src/server/sms.ts` · `apps/web/src/app/intake/[token]`

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
  and a link works only in `sent` before `expiresAt` (48 hours,
  `INTAKE_LINK_TTL_HOURS`; a week originally, see the amendment). The state
  changes are conditional writes
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
- ~~The person's form is English-only for now; the language chooses the text
  message's translation, not the form's.~~ Superseded by the amendment
  below: the form is bilingual with a toggle.
- Sending to an existing patient (to update their record) is not modelled.
  The request has a `patientId` only after acceptance; a "bound to an
  existing patient" variant is a later addition, not a change to this one.

## Amendment, 2026-09-13: the design pass DIA-72 asked for

DIA-72 was written as a design spike: the build above had outrun it, and
four of its six questions were already answered here. This amendment
records the answers to the rest, and the decisions taken while reading the
legacy intake form itself (a separate patient-facing app the clinic hosts,
not the legacy server; read from its public deployment, never referenced
from code).

- **The link lives 48 hours, not seven days.** The form is meant to be
  filled before the visit the link was sent for, and a shorter window is a
  shorter time a leaked link is worth anything. The message says "48 hours".
- **The link is handed back when it could not be sent.** `send` answers
  `{ request, link }`, and `link` is non-null only when the transport
  *logged* the message rather than delivered it (the console transport, in
  an environment with no `TWILIO_*`). The send panel shows it with a copy
  button, so a tester opens the form without reading the server log. With
  messaging configured the answer carries no link and the stance above
  holds: the token is in the person's text and nowhere else. The transport
  reports which it did (`SmsOutcome`) rather than the router guessing from
  the environment.
- **The person's page is its own design surface.** The ticket's first
  bullet: patient-facing, not staff-facing. It is no longer the staff form
  with a tab hidden. One scrolling column for a phone, six numbered
  sections in the order the legacy form asked them (about you, how to reach
  you, address, visit, health, consent), plain second-person labels, large
  touch targets, and a send button pinned to the bottom edge. The checklist
  is the same fourteen conditions as Yes/No plus "since when"; who treats
  it and whether it is medicated are the reviewer's to add. The column is
  deliberately narrow (`max-w-xl`): the staff app's full-width rule is for
  a 1920-pixel staff screen, and this page is read on a phone.
- **Bilingual, with a toggle.** The page opens in the language the front
  desk chose for the text and the person can switch; every label, message,
  and the consent text come from one copy table per language. The
  vocabulary values (office names, referral sources) are the clinic's and
  are shown as they are. The submission's `language` is the language the
  form was filled in.
- **The device is a phone.** DIA-22 left open whether the intake implied a
  tablet target. The link is texted, so the device is the phone that
  received it; there is no tablet breakpoint and no kiosk mode.
- **The person signs the treatment consent, and it stays on the request.**
  The legacy text said "fill out *and sign*", and its form ended with the
  clinic's telehealth treatment consent: read to the bottom, acknowledge,
  type your name. Ported: the text lives in contracts under a version key
  (`INTAKE_CONSENT_VERSION`), the page shows the current version in the
  page's language, and `submitIntakeInput` refuses a submission unless the
  box is ticked, the version is current, and the typed signature is the
  person's own name as entered on the form (case, accents, and spacing
  folded). The request row records signature, time, version, and language
  in four columns; the reviewer sees them above the form. This is the
  minimum so a signed consent is never lost between now and the consent
  module (DIA-56), which takes these columns over and owns re-signing and
  waivers. The wording is the legacy text verbatim, in both languages,
  including its own name for the clinic; changing a word changes the
  version and is the clinic's call, not a developer's.
- **When to call is asked and kept with the submission.** The legacy queue
  showed "preferred contact time" next to each new person; the person's
  answer (`preferredContactTime`, morning, afternoon, or evening) is part
  of the submission JSON, shown in the Pending tab and on review, and not a
  patient-record field. Optional on read, so older submissions still parse.
- **Card details are not asked for.** The legacy intake form declared five
  card controls in its form model and rendered none of them; card inputs
  exist only on its refill and deposit forms. The no-Billing decision above
  stands, now with the legacy behaviour known rather than assumed.
- **Leads stay separate.** A request has no link to a website lead; DIA-57
  models leads as their own entity, and its "intake link" bullet is
  delivered by this flow. Conversion from a lead to an intake request is a
  DIA-57 addition, not a change here.

Not carried over from the legacy form: initial weight and the date of the
last physical exam (vitals belong to a visit; the reviewer records them at
the visit), the "explain" free text (the checklist's per-item "since when"
replaces it), and the legacy queue's "transfer into visit" action (an
appointment is scheduled from the record; DIA-55).
