# Legacy SMS integration

What the legacy system does with text messages, read from its source, so that
the provider decision (DIA-67) and the SMS section (DIA-69) start from what
exists rather than from memory of it. Written for DIA-73. Legacy behaviour is
described, never its file layout; the source is analysis context only and is
not a dependency of anything here.

Where this document says "verbatim", the wording is copied exactly, typos
included, because staff and patients know that wording.

## Summary

- **Provider:** Twilio, one account, one sending number for every clinic. The
  new system already speaks to the same provider with the same three
  configuration names (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM_NUMBER`; ADR 29). An earlier Nexmo integration survives only as
  dead configuration and a field name.
- **Recommendation: keep the account and the number, replace the code.** The
  number is the one every patient has saved and replied to, the history is
  869,463 messages on it, and the new transport is already written against it.
  Reasons and conditions in § Recommendation.
- **Three sending paths:** synchronous on a staff action, fire-and-forget bulk
  inside the web process, and daily scheduled campaigns inside the same
  process. Nothing is queued durably; a restart loses in-flight bulk sends.
- **Failures are logged and dropped.** The API answers 200 whether or not
  Twilio accepted the message. No delivery-status callback, no retry, and the
  provider's message id is discarded for outbound messages.
- **History is stored per patient** for staff-triggered and campaign texts,
  but **not** for texts sent without a patient record (intake links, website
  leads, appointment confirmations), which leave no trace.
- **Consent is a single opt-out flag** defaulting to allowed, flipped by an
  inbound STOP. There is no record of when or how consent was given. Staff
  sends and anonymous sends ignore the flag; only campaigns and bulk honour
  it.
- **Inbound is a public, unsigned webhook.** Anyone who knows the URL can
  inject a message, including a STOP for another person's number, and an
  unknown number replying STOP crashes the handler.

## Provider and account

**Twilio**, through the official Node SDK, with a single client constructed
when the server starts. The credentials come from the environment:

| Variable | Meaning |
| --- | --- |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | the account |
| `TWILIO_FROM_NUMBER` | the one number every message is sent from, for all three clinics |
| `TWILIO_TO_DEV_NUMBER` | when `TWILIO_MODE` is `DEV`, every outbound message is redirected here, regardless of the patient's number |
| `TWILIO_MODE` | `DEV` or anything else |

The server cannot start without the account credentials: the client is built
at import time and the SDK refuses an undefined SID.

**Nexmo came first.** A Nexmo key, secret, and sending number are still
hard-coded in the server's configuration class, the inbound message record
still stores the provider's message id under a Nexmo-named field, and the
inbound handler's comment still describes Nexmo's query format. Inbound
records exist from December 2016. The Nexmo credentials in source should be
treated as leaked and retired at Nexmo's end; they are not needed by anything.

**What transfers.** The Twilio account, its number, and its message logs are
business assets held outside both codebases. Nothing in the legacy code ties
them to that code: the new system's transport uses the same three values.
Open questions for the account holder are listed at the end.

## How it is called

Three paths, all inside the single Express web process.

### Synchronous, on a staff action

Two endpoints, both awaiting Twilio before answering.

- **Send to a patient.** Takes a patient id and a body. The recipient number
  is read from the patient's record; the `to` the client sends is ignored. On
  provider success the message is stored against the patient and the
  patient's "last texted" date is updated. **The endpoint answers 200 even
  when Twilio refuses the message**, because the send function catches its own
  errors and resolves. If the patient id resolves to nothing, the endpoint
  answers 400.
- **Send without a patient.** Takes a bare number and a body. Nothing is
  stored. Used for intake links to people who are not yet patients, for
  website-lead follow-ups, and by two public website endpoints (below).

### Fire-and-forget bulk

A bulk endpoint takes an English template, a Spanish template, and a
MongoDB-style patient query built by the client. It answers immediately with
the count of matching patients, then sends in the background through a rate
limiter: one message at a time, one every 1.5 seconds. There is no job
record. A restart mid-run loses the remainder silently, and the only trace is
a log line with the count that succeeded. A preview endpoint renders a
template against a fixed example patient so staff can see the substitution.

### Scheduled, inside the web process

Each campaign is a scheduler module loaded when the server starts. Times are
server-local wall clock.

| Campaign | Schedule | Recipients | Status |
| --- | --- | --- | --- |
| Reminder | daily 14:08 | last visit 45 to 55 days ago; not texted in the last 2 weeks | active |
| Survey | daily 11:45 | had a visit yesterday | active |
| Video series | daily 12:55 | first video sent exactly 1, 2, 3, 4, or 5 weeks ago (one message per week) | active, with a bug: week 1 calls the wrong function and sends nothing |
| Call-back 36 | daily 11:10 | last visit between 6 and 36 months ago; not texted in 20 weeks; newest 100 | runs the query, **send is commented out** |
| Birthday | 1st of month 11:30 | birthday this month | module exists, **not loaded by the server**; whether a separate process runs it is an open question |

All campaign queries require: status not inactive, a phone number, and the
permission flag true. Recipients are limited by "not texted in N weeks",
which is the patient's "last texted" date, updated by every stored send.

One more automated send is event-driven: **saving a telemedicine visit** texts
the first coaching video to the patient if they have not had it, and stamps
the patient so the video series can pick them up weekly.

### Public website endpoints

Two routes under the public contact-request path send texts without any
sign-in:

- **Website lead form.** Saves a contact request and texts the "Touch 1"
  advisor message to the phone number the visitor typed. No captcha, no rate
  limit; the only guard is that four fields are present.
- **At-home appointment confirmation.** Texts a confirmation when the caller
  presents a shared key and the request's `Host` header matches localhost or
  two private-network prefixes. The key is a literal in the source.

## Message templates

Grouped by who triggers them. `{{firstName}}` is substituted. Every message
has an English and a Spanish variant chosen by the patient's language field;
anything other than `spanish` gets English.

### Automated campaigns

**Reminder** (with a $5 coupon record, valid 10 days, created per recipient)

> Hi {{firstName}}! Stay on track! It's been 45 days since your last visit. If you just need a refill by mail on your meds, you can get it here: https://healthystepsapp.com/en/refill. Need a bit more motivation? Here's a $5 off coupon good for a clinic visit OR a telemedicine refill. Hurry, this coupon will expire in 10 days!
> (reply "STOP" to unsubscribe)

> Hola {{firstName}}! Mantenga el paso! Han pasado 45 días desde su última visita. Si necesita un refill de medicamentos por correo puede solicitarlo aqui https://healthystepsapp.com/es/refill. Necesita motivarse? Ya tiene un descuento de $5 valido en una visita o consulta en linea. Apresurese, el cupon espira en 10 dias!
> (responda "STOP" para darse de baja)

**Survey**

> How was your Healthy Steps visit? What was great? What could we do better?
> http://bit.ly/HealthyStpsSurvey

> Cómo fue su visita? Que estuvo bien? Que podemos mejorar?
> http://bit.ly/PasosSaludables

**First video** (on saving a telemedicine visit)

> Thank you for using Healthy Steps telemedicine. The most important way to lose weight and to keep it off is not just by taking pills, but also to learn to eat differently. We have a series of short videos to remind you of how to do this. Here is the first one. It's only 3 minutes, and we think it will help you a lot! https://youtu.be/QxnWU46GAWc

> Gracias por usar Pasos Saludables telemedicina. Lo forma más importante para perder peso y no recuperarlo no solo es con tomar la pastillas, sino también aprender a comer diferente. Tenemos una serie de videos cortos para recordarle cómo hacer esto. ¡Son solo de 3 minutos, y creemos que te ayudaran mucho! https://youtu.be/bbl-Lu7sV3I

**Video series, weeks 1 to 5** (same sentence, a different link per week)

> Learn how to avoid unnecessary eating, and keep losing weight. Less than three minutes! `<link>`

> Aprender a como evitar comer innecesariamente y seguir perdiendo peso. ¡En menos de tres minutos! `<link>`

| Week | English | Spanish |
| --- | --- | --- |
| 1 | https://youtu.be/u3-kwac6Auo | https://youtu.be/uD0IIxoFvAI |
| 2 | https://youtu.be/KVwFVM7BNjM | https://youtu.be/HFy_aPFeRFM |
| 3 | https://youtu.be/qhABrkyKSQs | https://youtu.be/QZOCBR4YhhM |
| 4 | https://youtu.be/vFeLxrwkHC8 | https://youtu.be/RmeHkQ2j3hY |
| 5 | https://youtu.be/4g8IZNr3k0Y | https://youtu.be/eg4b_TTUR2Y |

**Call-back 36** (send disabled; $10 coupon, valid 14 days)

> Don't give up! Let us help you restart your weight loss goals NOW, and get $10 off your restart visit - in person or by telemedicine. Hurry! This coupon expires in 14 days. Call us, arrange an online telemedicine visit, or just walk in! www.healthystepsmd.com

> No te rindas! Permite que te ayudemos en tu meta de perder peso y obten $10 de descuento en tu reinicio - en persona o consulta remota. Apresurate! El descuento expira en 14 dias. Llamanos, agenda un consulta remota o solo acude a nuestras clinicas! www.healthystepsmd.com

**Birthday** (not scheduled by the server)

> Happy Birthday {{firstName}}! We want to help you celebrate! Come see us during the week of your birthday and get $5 off your visit!
> -Healthy Steps

> Feliz cumpleaños {{firstName}}! ¡Queremos ayudarte a celebrar! Venga a vernos durante la semana de su cumpleaños y obtenga $ 5 de descuento en su visita!
> -Healthy Steps

### Staff-triggered from a patient record

All sent through the patient-bound endpoint, so they are stored. Links go to
the public Healthy Steps web app; `<link>` below stands for that app's URL with
a language and a `rnd` query value that is the patient's first and last name
base64-encoded (or the patient id, for the older Lipoden form). None of these
check the permission flag.

| Trigger | English | Spanish |
| --- | --- | --- |
| New patient saved, "send consent form" | Please fill out and sign the Information Form on the following link: `<link>` | Por favor complete su Informacion en el siguiente enlace: `<link>` |
| Information update / treatment consent | Please fill out and sign the Information Form on the following link: `<link>` | Por favor actualice su Informacion en el siguiente enlace: `<link>` |
| Lipoden consent | Please fill out and sign the Lipoden Consent Form on the following link: `<link>` | Por favor complete y firme el Consentimiento para la inyeccion de Lipoden en el siguiente enlace: `<link>` |
| Ozempic consent | Please fill out and sign the Ozempic Consent Form on the following link: `<link>` | Por favor complete y firme el Consentimiento para uso de Ozempic en el siguiente enlace: `<link>` |
| Semaglutide consent | Please fill out and sign the Semaglutide Consent Form on the following link: `<link>` | Por favor complete y firme el Consentimiento para uso de Semaglutida en el siguiente enlace: `<link>` |
| Tirzepatide consent | Please fill out and sign the Tirzepatide Consent Form on the following link: `<link>` | Por favor complete y firme el Consentimiento para uso de Tirzepatida en el siguiente enlace: `<link>` |
| Botox consent | Please fill out and sign the Botox Consent Form on the following link: `<link>` | Por favor complete y firme el Consentimiento para uso de Botox en el siguiente enlace: `<link>` |
| At-home contract | Please fill out and sign the At-Home Contract Form on the following link: `<link>` | Por favor complete y firme el Contrato del Programa At-Home en el siguiente enlace: `<link>` |
| Testimonial consent | You've had such positive results that we'd like to use your pictures and quotes. If you agree please fill out and sign the consent form on the following link: `<link>` | Ha obtenido resultados tan positivos que nos gustaría utilizar sus fotografías y comentarios. Si está de acuerdo por favor complete y firme el formulario de consentimiento en el siguiente enlace: `<link>` |
| Welcome box shipped (tracking number substituted) | Thank you for registering with Healthy Steps! Your welcome box is on the way by mail, and you should have it soon. Tracking number for this package is `<tracking>` | Gracias por ser parte de Healthy Steps! Su kit de bienvenida ha sido enviado y podra recibirlo pronto. El numero de rastreo para su kit es `<tracking>` |

**Medication shipped** (from the visit, one of three variants chosen at
random, weighted toward the middle one):

> Hello {{firstName}}. Your USPS tracking number for your medication delivery is `<tracking>` - Healthy Steps MD
> Hi {{firstName}}. Your order is being packaged and your tracking number is `<tracking>` Healthy Steps MD
> Healthy Steps MD: Your order is being prepared. USPS tracking number `<tracking>`

> Hola {{firstName}}. Sus medicamentos han sido enviados el numero de rastreo USPS es `<tracking>` - Healthy Steps MD
> {{firstName}}. Su solicitud de refill esta empacada. Su numero de rastreo es `<tracking>` Healthy Steps MD
> Healthy Steps MD: Su envio de medicamentos esta listo. El numero de rastreo USPS es `<tracking>`

**Call list, no answer** (checkbox on the call log; also creates a $5 coupon
valid 10 days):

> We miss you! We called you today but got no answer. We really can help you reach your weight loss goals. If you just need a refill by mail on your meds, you can get it here: https://healthystepsmd.com. Need a bit more motivation? Here's a $5 off coupon good for a clinic visit OR a telemedicine refill. Hurry, this coupon will expire in 10 days!

> Te extrañamos! Intentamos llamarte pero no tuvimos respuesta. Seguimos listos para apoyarte en tu perdida de peso. Si solamente necesitas un refill de medicamentos puedes solicitarlo aqui: https://healthystepsmd.com Necesita motivarse? Ya tiene un descuento de $5 valido en una visita o consulta en linea. Apresurese, el cupon expira en 10 dias!

**No-show** (marking a visit no-show prefills the text box; the automatic
send is commented out, so staff must press Send):

> Hey! We missed you!
> I hope it was for something good! Please text or call Daisy at 818-403-5487 and we'll get you rescheduled!

> Hey! Te extrañamos!
> Espero que haya sido por algo importante! Por favor llamanos o envia un mensaje al 818-403-5487 para reagendar!

**At-home billing notice** (code present, call commented out):

> Thank you for joining Healthy Steps. Your welcome box is in process. You will receive confirmation and tracking number soon. You'll be billed $ `<price>` USD on your credit card monthly on this date.

> Gracias por ser parte de Healthy Steps. Su kit de bienvenida esta siendo procesado. Recibira el numero de rastreo y confirmacion de envio muy pronto. Se hara un cargo de $ `<price>` USD en su tarjeta el dia `<day>` de cada mes.

**Free-form.** A text box on the patient record, the conversation view, the
visit form, and the lead view. Up to 800 characters, with the user's saved
macros as autocomplete. On the visit form it is prefilled with:

> Hello {{firstName}}! Here's a review of what we talked about during our recent appointment:

### Sent without a patient record (not stored)

**Intake link** (the "auto-enroll" panel; the legacy flow ADR 29 replaced):

> Please fill out and sign the Information Form on the following link: `<intake form url>?lang=en`

> Por favor complete su Informacion en el siguiente enlace: `<intake form url>?lang=es`

**Website lead, automatic on form submit ("Touch 1"):**

> Thanks for your interest in Healthy Steps. My name is Vanessa, and I will be your online advisor  — MD-backed, clinically-proven weight loss for 40+ years. If you are in California, and want to get started with our At-Home, virtual program, click here:  https://healthystepsapp.com/at-home/join-now
> If you want to visit one of our clinics, click here: https://www.healthystepsmd.com/inclinic.php
> If you are outside of California,  text me back your state, and we should be able to accommodate you in the next couple of weeks.

**Website lead, staff "SMS Touch" buttons 1 to 6.** Each has an at-home and
an in-clinic variant; where they differ both are shown. English only.

| Touch | Message |
| --- | --- |
| 1 | Thanks for your interest in Healthy Steps — MD-backed, clinically-proven weight loss for 40+ years. Learn more about our approach: http://healthystepsmd.com/ |
| 2, at home | Healthy Steps At Home offers virtual coaching, nutrition plans, BMI tracking, meds and supplements — right at your home! https://healthystepsmd.com/athome.php |
| 2, in clinic | Healthy Steps offers coaching, nutrition plans, BMI tracking, meds and supplements — at our discreet SoCal clinics! https://healthystepsmd.com/inclinic.php |
| 3 | Healthy Steppers are raving about our weight loss program on Google and Yelp ⭐ ⭐ ⭐ ⭐ ⭐ We've helped 1000s reach their goals - REPLY for your free consult today! |
| 4 | "For the past 5 mos I have been working with Healthy Steps to prioritize my overall wellness & have lost 50 lbs." — Rachel REPLY to set up your free consult! |
| 5 | "I'm down 19 lbs in 2 mos thanks to Healthy Steps. I finally let go of some baby weight & I feel amazing!" — New mom Chelsi REPLY to set up your free consult |
| 6 | "In just 2 mos I have lost over 16 lbs. Healthy Steps has done wonders for my self image & confidence!" — Midlife Mom Romy REPLY to set up your free consult |

The lead view's free-form box is prefilled with "Hi `<lead name>` this is
`<staff name>` from HealthySteps ".

**At-home appointment confirmation** (public endpoint, key-gated):

> You're all set!
> Your Healthy Steps At Home appointment is `<date>` with Daisy.
> Please expect a call from number 818-403-5487. Thank you!

> Todo listo!
> Tu cita para Healthy Steps En Casa es `<date>`.
> Daisy le llamara del numero 818-403-5487. Gracias!

The scheduler screen has a similar confirmation ("You're all set! Daisy Moya
will call you on `<date>` from (818) 403-5487") whose send is commented out.
The appointment form offers an "sms" reminder preference, but no code reads
it: **there are no appointment reminders today.**

## Delivery status handling

- **Success** stores the message (patient-bound sends only) and stamps the
  patient's last-texted date. The provider's message id is discarded.
- **Failure** is logged with the provider error and otherwise dropped: not
  stored, not retried, not surfaced. The staff endpoint still answers 200, so
  the client shows "Text sent". Bulk and campaign runs skip the failure and
  continue.
- **One error is special-cased.** If the provider error mentions code 21610
  (recipient has opted out at the carrier level), the patient's permission
  flag is set false. That is the only feedback loop from the provider.
- **No status callback.** Twilio's delivery-status webhook is not configured
  in code; queued, undelivered, and failed states after acceptance are
  invisible.

For the rebuild this is a bug to fix, not behaviour to reproduce (DIA-67):
a refill approval that fails to send must be visible to the person who sent
it.

## Message history storage

One collection, `texts`, documented in the entity inventory
(`docs/discovery/entity-inventory.md` § `texts`; 869,463 documents, 26,823
inbound). The shape:

| Field | Meaning |
| --- | --- |
| `patient` | reference to the patient; absent when an inbound number matched no patient (194 documents) |
| `message` | body |
| `type` | `inbound` or `outbound` |
| `to`, `from` | E.164 numbers as the provider reported or as the sender formatted them (`+1` plus ten digits) |
| `nexmoId` | the provider's message id, inbound only (the Twilio message SID, despite the name) |
| `timestamp` | server receive time for inbound, send time for outbound |
| `read` | false until archived |

Index on patient and timestamp.

**What is not in it:** every message sent through the no-patient path (intake
links, website lead texts, the six Touch templates, appointment
confirmations) and every message Twilio refused. Lead follow-ups are recorded
only as a note on the lead ("SMS Touch1") to disable the button.

**How staff read it.**

- **Inbox and Sent**, one week at a time, showing only unarchived
  (`read: false`) messages of that direction. Archive marks the selected
  messages read; there is no other state.
- **Conversation** per patient, oldest first, with a reply box and an "archive
  conversation" action that marks the whole thread read.
- **Patient record**: a "View SMS Chat" link and an inline text form.
- **Real-time banner.** The inbound webhook emits every incoming message over
  a socket to **every signed-in client of every role**, which renders a
  dismissable banner with the sender's name (or bare number) and the body.
  DIA-69's ruling that providers get no SMS pop-ups is the opposite of this.
- **Bulk text screen**: office and last-visit-date filters, both templates
  side by side with a live preview, and the list of recipients.

The menu entry is visible to every role; the endpoints check only that the
caller is signed in.

## Consent and opt-out

**One boolean on the patient**, labelled "Allowed" / "Do not contact" on the
patient form, **defaulting to allowed**. It is an opt-out flag, not a record
of opt-in: there is no timestamp, no channel, no wording shown, no
per-purpose distinction between a clinical notice and a promotion. The new
schema already carries it as `phoneFollowUpAllowed` (legacy-data-mapping § patients).

**Who honours it.** Campaign and bulk queries filter on it. Staff-triggered
sends from the patient record do not, and the no-patient path has nothing to
check. A patient who replied STOP can still be texted a consent link by hand,
which Twilio will then refuse with the 21610 error above.

**STOP handling.** The inbound webhook, after storing the message, compares
the whole body lower-cased against two lists:

| Reply | Effect |
| --- | --- |
| `stop`, `end`, `cancel`, `unsubscribe`, `quit`, `stopall` | permission set false |
| `start`, `yes`, `unstop` | permission set true |

Two problems. `yes` re-enables marketing for a patient who was answering a
question. And when the number matches no patient the handler dereferences a
null record, so an unknown number texting STOP throws inside a database
callback (the message itself was already stored). Twilio applies the same
keywords at the carrier level independently of this code, which is why 21610
appears at all.

**Only one template tells the recipient how to stop** (the reminder). The
campaign and bulk texts are marketing to an opt-out list, which is a
compliance question to raise (TCPA requires prior express written consent for
marketing texts), not a behaviour to inherit.

## Inbound handling

- **Webhook:** `POST /sms`, form-encoded, on the unauthenticated path list.
  Twilio's request signature is **not validated**, so any client can post a
  fabricated inbound message, including a STOP for someone else's number.
- **Matching:** the `From` number has its first two characters removed
  (assumed `+1`) and is compared for equality against patients' stored
  ten-digit numbers; the first match wins, so two patients sharing a number
  (a household) are indistinguishable.
- **Order of effects:** emit to sockets, then save, then apply STOP/START.
  The response is an empty TwiML document, so no auto-reply.
- **Media** (MMS) is ignored; only the body is kept.

## Related data the texts touch

- **Coupons.** The reminder, call-back 36, and call-list texts each create a
  coupon record for the patient (amount, validity window, "cron" or the staff
  name as issuer). The coupon has no link to the message that announced it.
- **`smsId` on patients** is not an SMS identifier. It is a six-character key
  minted by the public web app and used in the testimonial-consent link; the
  legacy server neither reads nor writes it, and the survey collection joins
  on it (entity inventory § `surveys`). It belongs to the public-app domain,
  not to messaging.
- **Surveys** are the responses to the survey text's link, arriving through a
  separate public endpoint; two thirds cannot be attributed to a patient.

## Legacy against the new system's use cases

| Use case (DIA-73) | Legacy today | Gap |
| --- | --- | --- |
| Refill approved, patient told to await tracking (DIA-53) | No approval text. The nearest is "medication shipped" with a tracking number, pressed by staff from the visit. | New message and trigger; wording can borrow the shipped variants. |
| New-patient intake link (DIA-57, DIA-72) | Generic link, no token, not stored. | Done in the new system (ADR 29), with the message stored nowhere yet. |
| Front-desk conversation threads (DIA-69) | Inbox, Sent, per-patient conversation, archive. | Port. Replace "unread only" inbox with a proper thread state. |
| Provider replies via the chart only, no pop-ups (DIA-69) | Every role gets every inbound as a banner. | Route the banner to clerical roles only; reply from the record's clinical half. |
| Appointment notifications replacing email (DIA-69) | Confirmation exists only on a key-gated public endpoint; reminders not implemented. | New. |
| Referral link sharing (DIA-66) | None. | New. |

Legacy sends the new system does not plan for, to decide on explicitly:
consent-form links (nine templates), welcome-box and medication tracking,
call-list follow-up, the reminder, survey, and video campaigns, and lead
outreach. Each is either a feature to schedule or a message to retire; none
should disappear by omission.

## Recommendation

**Reuse the Twilio account and its sending number; replace every line of
integration code.**

Why keep the account:

- **The number is the relationship.** Every patient who has texted the clinic
  has this number saved, and 26,823 inbound messages prove they use it. A new
  number would be a visible change to every patient and would strand the
  carrier-level opt-out list that Twilio holds for the old one.
- **The new system already targets it.** ADR 29's transport is one REST call
  with the same three variables; the switch is configuration, not code.
- **Twilio is HIPAA-eligible** for Programmable Messaging and offers a BAA,
  which is the compliance condition in DIA-67. Whether a BAA is already signed
  for this account is an open question below; if not, signing one is cheaper
  than moving.

Why replace the code (none of this is Twilio's fault):

1. Validate the webhook signature and drop the socket broadcast.
2. Store every outbound message, with the provider's message id, and
   subscribe to status callbacks so a failed send is visible to its sender.
3. Record consent as events (who, when, how, for what), default new patients
   to no marketing until they opt in, and keep the STOP/START handling but
   with exact keyword lists, no `yes`, and no null dereference.
4. Send bulk and scheduled messages from a durable queue, not the web
   process's memory.
5. Retire the no-patient path: every text has a recipient row, even if that
   row is a lead or an intake request rather than a patient.
6. Retire the public lead and appointment endpoints in their current form;
   the new lead funnel (DIA-57) decides what replaces them.

The provider decision itself belongs in the DIA-67 ADR; this document is its
evidence.

## Migration plan for history and consent

Following the coexistence rules in DIA-33 and the ground rules in
`legacy-data-mapping.md` (NDJSON in, `legacyId` upsert, contract-validated).

**Message history.**

- One table, one row per legacy `texts` document: direction, body, the two
  numbers normalized to ten digits, provider message id, timestamp, read flag,
  `legacyId`. The patient link resolves through the patient's `legacyId`, as
  visits do; the 194 unlinked inbound rows import with a null patient and stay
  visible in the inbox under their number.
- Bodies are PHI: same handling as the patient import, and the audit trail
  covers reads through the procedure layer as for every other table.
- Idempotent re-runs, so the collection can be re-imported after cutover to
  pick up the tail.

**Consent.**

- The flag is already mapped (`phoneFollowUpAllowed`). At import, write one
  consent event per patient with source "legacy import", the flag's value, and
  no timestamp, so the record is honest about what is known.
- Until the new system asks patients for marketing consent, treat the imported
  flag as clinical-notice permission only; marketing sends wait for an opt-in
  event.

**Coexistence.**

- **Inbound can only go to one system.** Twilio posts each message to a single
  URL per number. Cut over when the front desk moves to the new SMS section,
  and re-import the legacy collection once more the same day. If the legacy
  inbox must keep working for a period, the new webhook can forward the raw
  form post to the legacy URL; that is a one-line proxy, not a design.
- **Outbound can come from both** during the overlap, but the legacy
  campaigns throttle on the patient's last-texted date, which the new
  system's sends will not update. Either pause the campaigns at cutover or
  accept that a patient may get a campaign text a day after a staff text.
- Both systems share the number's carrier-level opt-out list automatically.

## Open questions for the account holder

To ask Francisco or Joshua; none is answerable from the code.

1. Who owns the Twilio account and holds its credentials, and is a BAA signed
   for it?
2. Is the sending number registered for A2P 10DLC (or toll-free verified)?
   Unregistered traffic is being filtered by US carriers, and the answer
   affects deliverability of everything above.
3. Do the birthday and call-back 36 campaigns run anywhere, or has nobody
   noticed they do not?
4. Are the website lead form and at-home appointment endpoints still wired to
   a live site?
5. What timezone does the legacy server run in? The campaign times above are
   its wall clock.
6. Which of the staff-triggered messages are still used, and which consent
   forms are current? Nine consent links suggests some are not.
