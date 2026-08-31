# ADR 27 — One roster search input; the format decides the field

**Status:** accepted  
**Applies to:** `packages/contracts/src/patient.ts` · `packages/db/src/repositories/patient.ts` · `apps/web/src/app/(app)/patients/page.tsx`

The patient roster's search is a single text input for names and phone, plus a
separate date field for date of birth; the two combine as AND. What the user
typed into the text input decides which field it searches:

| Typed | Interpreted as |
| --- | --- |
| digits, with any phone punctuation (`(951) 555-0000`, `+1 951.555.0000`) | phone, by its ten digits |
| one word | a name — matches first **or** last |
| two words (`Ada Lovelace`, or the picker convention `Lovelace, Ada`) | a full name, checked in both orientations |
| a calendar date (`1985-12-10` or `12/10/1985`) | refused, with a pointer at the date field |

Date of birth got its own field (amended 2026-08-31, replacing the original
all-in-one design) because a date is the one query a native control types
better than free text — a date picker cannot produce February 30th — and
because name + birth day is the combination that actually narrows a common
name, which a single box could not express.

Match semantics per field are unchanged from the legacy queue (recorded in
`docs/legacy-data-mapping.md` § patients): names exact but case-insensitive,
DOB by calendar day, phone by exact digits, the two-character name minimum, the
100-row cap, and the recent-30 list as the empty-search default.

## Why one input

The legacy queue's four-field filter bar made the user route their own query:
front-desk staff answering a phone call have a name, a date of birth, or the
caller's number on the screen in front of them, and which box it belongs in is
overhead — worse, a value in the wrong box (a phone number in the name field)
silently finds nothing. One input removes the routing step; the format of what
was typed is unambiguous enough to route mechanically.

## Where the interpretation lives, and why

`interpretPatientSearch` in `@fastehr/contracts`, used three ways:

- the **input schema** (`searchPatientsInput`) runs it in a transform, so the
  procedure receives a *discriminated interpretation* (`{ kind: 'phone', … }`),
  never the raw string — the repository translates kinds to where-clauses and
  cannot re-guess;
- the **roster form** runs the same function before submitting, turning an
  uninterpretable query (a seven-digit phone, a one-letter name, February 30th)
  into an inline hint instead of a request — the docs/forms.md rule, applied to
  a search;
- an uninterpretable query that reaches the server anyway fails validation as
  an issue **code** (ADR 12) — the client owns the copy
  (`PROBLEM_COPY` on the roster page), so no message travels.

The failure this placement prevents: client and server each implementing "what
does this string mean" and drifting — the client hinting "phone" while the
server searches names, which no type checker would catch.

## Decisions inside the interpreter

- **Date-shaped input is refused, not interpreted** (`date_in_search`): the
  date field exists, so the text box never guesses at a date. The date check
  still runs before the phone check — an ISO date is digits and hyphens,
  which is also what a phone number with separators looks like — and the
  ordering is why the interpreter is one function rather than a set of
  independent patterns.
- **A digits-only string that is not a complete phone number is a refusal**
  (`phone_incomplete`), not a prefix search. Partial-number matching is a
  different feature with different index needs; guessing here would silently
  return wrong-feeling results.
- **An eleventh leading `1` is stripped** — a pasted `+1 …` is the same
  ten-digit number the column stores.
- **Both orientations of a two-word query are searched.** The comma form is
  explicit, the space form is a guess; exact matching makes the second arm
  free (a person named "Lovelace Ada" *and* "Ada Lovelace" colliding is not a
  real case), and it means the user never has to know which order the system
  prefers.

## What was given up

A query cannot combine a name *and* a phone number in one search. The legacy
bar technically allowed it; usage was overwhelmingly single-field, and either
one alone identifies a patient. Name + date of birth — the combination that
actually earns its keep — is expressible, via the separate date field.
