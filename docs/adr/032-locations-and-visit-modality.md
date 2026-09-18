# ADR 32 — Locations: two active clinics as rows, remote care as a visit modality

**Status:** accepted 2026-09-13 (DIA-46, DIA-47)  
**Applies to:** `packages/contracts/src/location.ts` · `packages/db/prisma/schema.prisma` · `packages/db/prisma/migrations/20260913150000_locations_and_visit_modality` · `packages/db/src/repositories/location.ts` · `packages/db/src/repositories/patient.ts` · `packages/db/scripts/migrate-patients.ts` · `packages/db/scripts/migrate-visits.ts`

The Aug 21 sync rewrote the location tickets: **two locations only**, no
management UI, nobody logs into a location, and a location is a *filter*
(queues, reports) rather than a permission boundary. Telemedicine and
At-Home are not locations. This ADR records how the model gets there from
what the code and the migrated data hold today, and what the consolidation
of legacy values (DIA-47) actually is now that the data is already in
PostgreSQL.

## Current state

**In the code.** An office is a Zod enum of five strings in
`packages/contracts/src/office.ts` (Sylmar, Montebello, PennProgram,
Telemedicine, At Home): the legacy system's active site list, adopted on
Aug 31 once the migrated data showed the real distribution. Patients and
visits store the office as a free string, so historical values import
unchanged (docs/legacy-data-mapping.md). There is no location table, no
active flag, and no notion of *how* a visit happened. The office is part of
the actor (ADR 22): `permittedOffices()` grants every authenticated user all
five, and `officeScopedProcedure` refuses a request for any other. In
practice the office is already a filter, not a boundary. It is consumed by
the nav switcher, the (mock) queues page, and the roster's Pending intakes
tab; there is no "all locations" option.

**In the data** (the dev database, migrated 2026-09-06):

| Legacy `office` | Patients | Visits | Last visit | What it is |
| --- | ---: | ---: | --- | --- |
| Sylmar | 6,062 | 101,279 | Apr 2026 | A clinic. The legacy default office; DEA registration in Sylmar. |
| PennProgram | 6,230 | 56,037 | active | A clinic: "Doctor Penn Program", Canoga Park. Renamed **Kanoga** by the clinic. |
| Montebello | 1,132 | 13,136 | 4 visits since Jan 2025 | A clinic, effectively closed. |
| Telemedicine | 221 | 23,994 | Apr 2026 | A modality. The legacy accounting config books it under the Sylmar address. |
| At Home | 879 | 2,947 | May 2026 | A program (the At Home program; `programType` and the legacy `isAtHome` hang off it). |
| blank, `"null"`, Israel, Colonial Heights | 1,089 | 39 | 2018 to 2024 | Dead values. |

Whether a remote visit can be attributed to a clinic decides DIA-47's
"hard part". The legacy visit records only `office: "Telemedicine"`; the
legacy user has no home office; the legacy signature names a person, not a
site. The one proxy is the **patient's own office**:

| Remote visits | Patient's office is a clinic | Patient's office is remote or blank |
| --- | ---: | ---: |
| Telemedicine (23,994) | 22,031 (92%): Kanoga 11,626 · Sylmar 8,602 · Montebello 1,803 | 1,963 |
| At Home (2,947) | 329 | 2,618 |

Telemedicine is attributable; At Home is not, because it is a program
whose patients belong to it rather than to a clinic.

**The ticket's names.** "Silar" is Sylmar. "Kanoga" is Canoga Park, where
the legacy configuration places the Penn Program. "Filmore" appears nowhere
in the legacy code or data and is a transcription error. Montebello, a
third clinic with 13k visits, is missing from the two-location answer; it
is quiet, not absent.

## Decision

1. **A `locations` table, keyed by slug, seeded by migration, no CRUD.**
   Three rows: `sylmar` (Sylmar, active), `kanoga` (Kanoga, active,
   legacy name PennProgram), `montebello` (Montebello, **inactive**).
   `legacyName` is the mapping key from the legacy string; `active`
   decides whether a location is offered in filters; history stays intact
   either way. The slug is the primary key because it is the value the
   client will name in a filter and the seed must be identical in every
   environment. Adding a location is a migration, which is what "adding a
   location is a separate thing" means in practice.
2. **Remote care is a modality on the visit.** `visits.modality` is an enum,
   `in_person | telemedicine | at_home`, non-null, defaulting to in person.
   The legacy office string derives it: Telemedicine → telemedicine, At
   Home → at_home, anything else → in_person.
3. **`locationId` on patients and visits, backfilled, nullable.** A patient
   or visit whose office is a clinic points at that clinic. A remote visit
   is attributed to **its patient's clinic** (the 92% above). What cannot be
   attributed, remote visits of remote or blank patients and rows with a
   dead office value, is `NULL` with the modality set. NULL means "no
   clinic on record", and reporting must show it as such rather than fold
   it into a clinic. If the stakeholder confirms that telemedicine runs out
   of Sylmar (the accounting convention suggests so), the remaining
   telemedicine rows are one `UPDATE` away; that is deliberately not
   assumed here.
4. **The `office` strings stay, for now.** Both columns remain what the
   legacy wrote, so a pre-cutover re-import converges and nothing that
   reads them today breaks. `officeSchema` and `Actor.offices` are
   unchanged in this step. The step that replaces them, the location
   filter with a unified option, `permittedOffices()` returning active
   locations, and the queues and reports consuming it, is the next slice
   of DIA-46, not this one.
5. **New rows are consistent with the backfill.** The patient repository
   derives `locationId` from the office it writes, through the contract's
   mapping, on create and on demographics update. The import scripts do
   the same for patients and visits (and set the modality), so DIA-47 is a
   backfill migration plus an import-script mapping, not a Mongo export:
   the rows are already here with their `legacyId` bridges.
6. **Unknown office values fail the import; known-dead values do not.**
   Blank, `"null"`, Israel, and Colonial Heights map to no location, and
   the report counts them. Any other string is an error that stops the
   run, so a location is never invented by a typo.
7. **`Db.locations`** lists the rows (all, or active only), so the next
   slice has a repository to read and nothing reaches for the enum.

## The filter (the second slice, same day)

Decision 4's "next slice" is in: `Actor.locations` (every clinic, every
role), `locationFilteredProcedure` taking a clinic slug or `'all'` (ADR 22
as amended), a `location.listActive` procedure the app layout reads, a
`LocationProvider` with the choice remembered per browser and defaulting to
all locations, and the nav selector offering the active clinics plus "All
locations". The Pending intakes tab and the queues filter by it. An intake
request records the clinic its chosen office names (`locationId`, backfilled)
so the queue is a column, not a string comparison, and the person's form
offers only the active clinics by display name while the record keeps the
legacy office string. What is still the enum: the patient record's `office`,
which doubles as the At Home program marker and changes with the appointment
work, not here. Every place the app shows or picks an office goes through
one lookup (`nameForOffice` on the provider; the pick-lists built from the
active clinics plus the two non-clinic values) and matches by the legacy
equivalent underneath, so a record filed under PennProgram stays PennProgram
whatever label it shows. **The label is the legacy name for now** (decision
2026-09-13): the seeded display names ("Kanoga") are not shown until the
clinic confirms the final list; the switch is one line in the provider.

## Consolidation mapping (DIA-47)

| Legacy `office` | `locationId` | `modality` |
| --- | --- | --- |
| Sylmar | `sylmar` | in_person |
| PennProgram | `kanoga` | in_person |
| Montebello | `montebello` (inactive) | in_person |
| Telemedicine | the patient's clinic, else NULL | telemedicine |
| At Home | the patient's clinic, else NULL | at_home |
| blank, `"null"`, Israel, Colonial Heights | NULL | in_person |
| anything else | import refuses | |

Expected counts after the backfill, from the dev data (the migration's
verification query is the same `GROUP BY`):

| | sylmar | kanoga | montebello | NULL | total |
| --- | ---: | ---: | ---: | ---: | ---: |
| patients | 6,062 | 6,230 | 1,132 | 2,189 | 15,613 |
| visits | 110,096 | 67,751 | 14,965 | 4,620 | 197,432 |

and by modality: in person 170,491 · telemedicine 23,994 · at home 2,947.

## Rejected

- **Keeping Telemedicine and At Home as inactive locations** (DIA-47's
  option 2). Honest for At Home, wrong for the 22,031 telemedicine visits
  that belong to a clinic, and it makes "patients per hour at Kanoga"
  undercount every remote follow-up. The modality column carries what
  those rows meant.
- **Replacing the enum in the same change.** `Actor.offices`, the nav, the
  intake queue, and the patient forms all speak the enum. Swapping it for
  slugs is the filter work, and doing it here would couple a data
  migration to a UI change.
- **A uuid primary key.** The rows are vocabulary. A slug is stable across
  environments, readable in a URL, and needs no lookup to seed.

## Open with the stakeholder

- The display spellings ("Kanoga", "Sylmar") before anyone reads them daily.
- Whether Montebello is closed for good (inactive) or paused (active).
- Which clinic telemedicine counts against when the patient has none.

## Consequences

- Two new nullable columns and one enum; every existing read is untouched.
  The migration runs the backfill in the same transaction as the DDL.
- `migrate-visits` and `migrate-patients` gain the mapping and a hard
  failure on an unknown office; a run over the current export succeeds.
- Reports and queues can group by clinic and separate remote care from
  in-person care as soon as they read the new columns.
