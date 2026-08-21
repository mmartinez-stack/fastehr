# Legacy document formats and relational decomposition

Companion to [`entity-inventory.md`](./entity-inventory.md). That document
catalogues *what fields exist*. This one answers the question that actually
governs the migration: **what shapes do the documents take, and what relational
structure do those shapes imply for PostgreSQL 17?**

Read-only analysis. Nothing was written to the legacy database.

> **Same caveat as the inventory.** The legacy application source is not in this
> repository and not on this machine (verified — see `entity-inventory.md` §
> "Read this before using the document"). Everything below is derived from the
> documents themselves. Where the *meaning* of a structure needs code to settle,
> it is marked `UNKNOWN`. Structural facts are all measured.

---

## 1. Method, and why shape count is the number that matters

A MongoDB collection is not a table. Two documents in one collection can have
entirely different key sets, and a field-presence list — the output of the
inventory pass — hides that. A field at 40% presence could mean:

- **one entity** where that attribute is simply optional → a nullable column; or
- **two entities** multiplexed into one collection → two tables, or a subtype.

Those produce completely different schemas. The way to tell them apart is to
group documents by their exact key signature and look at how the signatures
distribute.

Every document in every collection was scanned in full (no sampling) and grouped
by `Object.keys(doc).sort().join(',')`. For each object-valued and array-valued
path, the sub-document key signatures were collected the same way.

```js
// the core of it
coll.find({}).forEach(doc => {
  bump(rootSig, Object.keys(doc).sort().join(','));
  walk(doc, '', 0);            // recurses into objects and array elements
});
```

Then, for the collections with many shapes, exact pairwise co-occurrence of every
top-level key, so that perfectly correlated field groups fall out:

```js
// Jaccard over presence sets; == 1 means the fields always appear together
const jac = both / (countA + countB - both);
```

---

## 2. Shape census

| Collection | Documents | Distinct root shapes | Largest shape | Verdict |
| --- | --- | --- | --- | --- |
| `patients` | 15,613 | **1,829** | 8.40% | combinatorial optionality |
| `visits` | 197,441 | **927** | 12.30% | combinatorial optionality |
| `refillrequests` | 18,073 | 9 | 46.05% | one shape + optional block |
| `appointments` | 2,831 | 8 | 87.28% | one shape + optional block |
| `startmytreatments` | 1,123 | 4 | 65.18% | one shape |
| `surveys` | 9,041 | 4 | 34.16% | one shape, 2 optional fields |
| `texts` | 869,463 | 5 | 96.91% | one shape |
| `contactrequests` | 2,206 | 3 | 70.67% | one shape + optional block |
| `coupons` | 39,568 | 2 | 99.40% | one shape |
| `users` | 31 | 7 | 38.71% | one shape, flags-when-true |
| `basecoupons` | 4 | 1 | 100% | rigid |
| `excludehours` | 2 | 1 | 100% | rigid |
| `medicationtypes` | 7 | 1 | 100% | rigid |
| `prefrences` | 92 | 1 | 100% | rigid |
| `vials` | 6 | 1 | 100% | rigid |
| `appointmentintervals`, `doserecords`, `successstories` | 0 | — | — | empty |

### The two problem collections are not subtypes

`patients` has 1,829 shapes and `visits` has 927, which invites the conclusion
that each holds several different record types. **It does not.** The evidence:

| | `patients` | `visits` |
| --- | --- | --- |
| Top-level keys | 78 | 40 |
| Always present (100%) | 10 | 8 |
| Optional | 68 | 32 |
| Observed shapes | 1,829 | 927 |
| Shapes if the optional keys were independent | 2⁶⁸ | 2³² |

Observed shapes are a vanishing fraction of the independent-combination ceiling,
the largest shape is small (8.40% / 12.30%), and shape size varies continuously
(patients' top eight shapes have 17, 19, 20, 17, 45, 47, 43 and 21 keys). There
is no bimodal split and no discriminator field that partitions the collection.

**This is one entity with many independently-optional attributes, accumulated
over years** — not a union of record types. *That is the single most important
structural conclusion in this document*, because it means the target is one wide
table per collection plus extracted satellites, **not** a subtype hierarchy and
**not** a `jsonb` catch-all.

### What the optionality is actually made of

Exact co-occurrence analysis (Jaccard = 1) over `patients` finds twelve field
groups that are *perfectly* correlated — every field in the group appears in
exactly the same documents, never apart:

| Documents | % | Perfectly correlated group |
| --- | --- | --- |
| 15,613 | 100% | `_id`, `__v`, `firstName`, `lastName`, `dobStr`, `address`, `status`, `callLog`, `referrals`, `visits` |
| 7,618 | 48.79% | `treatmentConsentDateStr`, `treatmentConsentMsg`, `treatmentConsentSignature` |
| 5,107 | 32.71% | `cutoffDate`, `programPrice` |
| 3,173 | 20.32% | `liposhotConsent`, `liposhotConsentSignMessage`, `liposhotConsentSignature` |
| 2,960 | 18.96% | `lastVideoSent`, `videoOneSent` |
| 388 | 2.49% | `tirzepatideWaiverDate`, `tirzepatideWaiverMsg`, `tirzepatideWaiverSignature` |
| 276 | 1.77% | `semaglutideWaiverDate`, `semaglutideWaiverMsg`, `semaglutideWaiverSignature` |
| 210 | 1.35% | `botoxConsentMsg`, `botoxConsentSignDate`, `botoxConsentSignature` |
| 102 | 0.65% | `atHomeContractMsg`, `atHomeContractSignDate`, `atHomeContractSignature` |
| 43 | 0.28% | `testimonialConsentLetter`, `testimonialSignDate`, `testimonialSignature` |
| 38 | 0.24% | `atHomeGLP1WaiverDate`, `atHomeGLP1WaiverMsg`, `atHomeGLP1WaiverSignature` |
| 18 | 0.12% | `ozempicWaiverDate`, `ozempicWaiverMsg`, `ozempicWaiverSignature` |
| 1 | 0.01% | `cellumaWaiverDate`, `cellumaWaiverMsg`, `cellumaWaiverSignature` |

Ten of those twelve are the same three-field pattern — *(date, message,
signature)* — repeated once per consent type. **They are not twelve groups of
columns; they are one table with a `kind` discriminator and 11,867 rows.** The
sparseness that produced 1,829 shapes is almost entirely this one repeated
pattern plus the `creditCard*` block.

`visits` yields only four perfectly correlated groups, all small:
`noShow`+`welcomePackage` (73,866 — both dead, see the inventory §5.1),
`splitCash`+`splitCredit` (2,320), `reviewDigitalSignature`+`reviewSignature`
(1,945), and the 100% core of eight keys.

---

## 3. Per-entity document format

Notation: a redacted type skeleton. Names and types only, **never values**.
`A|B` = observed as either type. `n%` = presence. `[…]` = array with element
shape. Sub-object key-set counts are noted where more than one shape occurs.

### 3.1 `patients` — 15,613 docs, 1,829 shapes

```
{
  _id        : ObjectId            100%
  firstName  : string              100%      lastName : string  100%
  dobStr     : string              100%      // 4 formats; 122 are ISO datetimes
  dob        : Date|null            95.12%   // duplicate of dobStr, 2,357 disagree
  status     : string              100%      // active | inactive
  address    : { street, city, state : string   100%
                 zip                : string    99.99% }        2 shapes
  phone      : { number     : int|long|null      94.21%
                 permission : bool               82.70% }       2 shapes
  gender     : string               99.99%   language : string  96.65%
  office     : string               93.27%   height   : int|double|null  98.39%
  email      : string               46.38%   smsId    : string  42.27%
  hx         : string               71.29%   // free text, max 622 chars

  visits     : [ ObjectId ]         100%     // avg 12.67, max 344, 197,752 total
  callLog    : [ { _id, created, notes, resolution, user } ]  100%
                                             // 4 shapes, 15,868 elements, 9,761 empty
  referrals  : [ { _id, patient, used } ]    100%
                                             // 1 shape, 3,782 elements
  atHomeChargeDates : [ ]            7.82%   // 1,221 docs, ALL empty — dead

  creditCardNumber/ExpMonth/ExpYear/Zip : string   ~53.6%   // correlated block
  creditCardCVV                         : string    46.72%

  <consent>Date/Msg/Signature : string       // 10 groups, perfectly correlated
  <waiver>                    : bool         // flag, presence independent of the trio
  referringDoctor : { name, email, faxNumber, officeNumber }   0.04%  (6 docs)
}
```

**Relational decomposition**

| Target table | Rows | Source | Why |
| --- | --- | --- | --- |
| `patient` | 15,613 | root scalars + `address` + `phone` | `address`/`phone` are 100%-present fixed-shape sub-objects → flatten to columns, not tables |
| `patient_consent` | 11,867 | the 10 consent/waiver groups | one row per (patient, kind); collapses 30+ sparse columns |
| `patient_call_log` | 15,868 | `callLog[]` | has its own `_id` → idempotent |
| `stored_card` | ≤ 8,375 | `creditCard*` block | isolated so the §7 policy answer touches one table |
| — (dropped) | — | `visits[]` | duplicate of `visit.patient_id`, disagrees in 349 places |
| — (folded) | — | `referrals[]` | same edge as `referredByPt`; becomes `patient.referred_by_patient_id` |
| — (dropped) | — | `atHomeChargeDates` | 1,221 arrays, 0 elements |

### 3.2 `visits` — 197,441 docs, 927 shapes

```
{
  _id       : ObjectId   100%    patient : ObjectId  100%
  created   : Date       100%    // 12 docs < year 2000, 1 in year 2107
  deleted   : bool       100%    seen    : bool      100%
  digitalSignature : string 100% // fixed 169 chars

  medications : { <drugKey> : { amount    : int|double
                                price     : int|double
                                productId : string
                                rxNumber  : ObjectId } }   100%
                // 31 distinct drug keys, 301 distinct key-sets
                // 1,087,926 slots total; 4,777 empty objects; 3,885 null

  signature : { dea, firstName, lastName : string
                signed : Date
                ip     : string
                user   : ObjectId }        95.18%   // 2 shapes: with/without `user`
                                                    // 175,415 with user, 12,501 without
  bloodPressure : { systolic, diastolic : int|null }  79.28%   // 4 shapes
  weight/bmi/total/subtotal : int|double|null
  fee/discount/coupon/programFee : { amount, name }   // 2 shapes each

  addenda : [ { _id, digitalSignature, notes, signature } ]   93.67%
            // 2 shapes, 5,023 elements, 180,178 empty arrays
  creditPaymentDetails : [ { authRsp, cardType, fastehrTranType, mapCaid,
                             rspCode, rspCodeMsg, tranData,
                             extRspCode?, extRspCodeMsg?, additionalAmount? } ]
            // 10 shapes, 65,442 elements; NO element _id
            //   .authRsp  : 17 shapes  (undecoded codes)
            //   .tranData :  4 shapes
  additionalFiles : [ { _id, created, originalName, storageName, removed? } ]
            // 2 shapes, 164 elements
  syringes : [ { amount, medication, qty } ]   // 1 shape, 212 elements, NO _id
}
```

**The `medications` map is the central transform.** It is a map keyed by drug
name, which is why 301 key-sets exist — but the *value* shape is near-uniform: a
subset of `{amount, price, productId, rxNumber}`. That decomposes to rows
without loss.

The economics matter:

| Slot category | Count | Decision |
| --- | --- | --- |
| Slots carrying `amount` or `price` (a real dispensed line) | **228,754** | → `visit_medication` rows |
| Slots with only `productId`/`rxNumber` and no dosage | **818,027** | → **discard**; these are the five always-present drug stubs |
| Empty objects `{}` | 4,777 | → discard |
| Explicit `null` slots | 3,885 | → discard |
| Total slots | 1,087,926 | |

Migrating every slot produces a 1.09M-row table that is 75% padding. Filtering to
slots with a dosage or price gives **228,754 rows** — a 79% reduction — and loses
nothing a report would ask for. *This filter is a proposal: it assumes a slot
with no amount and no price records no dispensing event. The code would confirm;
marked as an inference.*

**Relational decomposition**

| Target table | Rows | Source |
| --- | --- | --- |
| `visit` | 197,441 | root scalars + `signature.*` + `bloodPressure.*` + `fee`/`discount` flattened |
| `visit_medication` | 228,754 | `medications` map → rows (filtered as above) |
| `visit_payment_attempt` | 65,442 | `creditPaymentDetails[]` |
| `visit_payment_amount` | 1,607 | `creditPaymentDetails[].additionalAmount[]` |
| `visit_addendum` | 5,023 | `addenda[]` |
| `visit_file` | 164 | `additionalFiles[]` |
| `visit_syringe` | 212 | `syringes[]` |

**Revision to the inventory's proposal.** `entity-inventory.md` §6.2 suggested
keeping `creditPaymentDetails[]` as a `Json` column. The shape data argues
against that at the top level: 63,817 of 65,442 elements (97.5%) share one key
set, and all ten shapes are subsets of a common superset. That is stable enough
for a table. The *sub-objects* are the irregular part — `authRsp` has 17 shapes
and its fields (`aci`, `avsRslt`, `secRslt`, `valCode`) have no decoder anywhere
in the data. So: **table for the element, `jsonb` for `authRsp` and `tranData`.**

### 3.3 `refillrequests` — 18,073 docs, 9 shapes

```
{
  _id, created, firstName, lastName, status, patient : ...      100%
  dob : string   100%     // 12 format shapes — NOT a Date, unlike patients.dob
  creditCardNumber/CVV/ExpMonth/ExpYear/Zip : string  100%      // all present, all rows
  qa : [ { _id, answer, question } ]   100%   // 1 shape, never empty, 71,930 elements
  address : { street, city, state, zip }  99.02%  ┐ perfectly correlated
  phone   : { number, permission }        99.02%  ┘ (one optional block)
  requestedMeds : [ { _id, medFreq, medName, supName } ]  12.37%  // 1 shape
  source, attachedPhoto, preferredContactTime : string   // independent optionals
}
```

Structurally the cleanest large collection: 14 keys always present, one perfectly
correlated optional block (`address`+`phone`), one uniform array. The `patient`
key is always *present* but null in 6,043 documents — a distinction the field
inventory could not show and shape analysis makes explicit.

| Target table | Rows |
| --- | --- |
| `refill_request` | 18,073 |
| `refill_request_answer` | 71,930 |
| `refill_request_med` | 2,236 |

### 3.4 `appointments` — 2,831 docs, 8 shapes

```
{
  _id, created, appointmentDate, confirmed : ...   100%
  patientBasicInfo : { firstName, lastName, email, phoneNumber   100%
                       dobStr, selectedProgram                    96.15% }   2 shapes
  patient    : ObjectId          93.32%
  assignedMA : { user : ObjectId }  93.25%   // 1 shape, single-key wrapper
  depositFee : { paid : bool                       91.10%
                 codeResult, transaction            3.81% }        2 shapes
  patientMedx : { hxCondition, lastPhExam, meds,
                  reportedHeight, reportedWeight }   2.90%   // 1 shape
  googleEventId, appointmentType : string
}
```

`assignedMA` is a one-key wrapper around an ObjectId — flatten to
`assigned_user_id`. `depositFee` splits cleanly into a `paid` boolean on the
parent plus an optional payment record.

| Target table | Rows |
| --- | --- |
| `appointment` | 2,831 |
| `appointment_deposit` | 108 |

### 3.5 `startmytreatments` — 1,123 docs, 4 shapes

```
{
  _id, created, status : ...                            100%
  basicDetails   : { fullName, email, phoneNumber, gender,
                     streetAddress, cityAddress, stateAddress, zipCode  100%
                     dobs, language                                      99.02% }  2 shapes
  medicalHistory : { breastfeeding, diabetes, glaucoma, heart, hypertension,
                     kidney, pregnant, thyroid : bool
                     hadSurgical : string("0"|"1")
                     explainSurgery : string }           100%   1 shape
  lifestyle      : { height, weight, weightToLose : string   // numbers as strings
                     lifestyle, usedDietPills, explainDietPills }  100%   1 shape
  personalHabits : { drinkWater, drinkWine, eatStress,
                     eatSweets, useDrugs, vegan : string("0"|"1"|"") }  100%  1 shape
  consent        : { readACK : bool, treatmentConsentDateStr/Msg/Signature }  100%
  appointment    : ObjectId    13.45%
  additionalInfo : string      25.56%
}
```

Every nested object is 100% present with exactly one key set — this is a **fixed
questionnaire**, and it flattens to columns without ceremony. The only irregular
part is the type encoding of the answers (bool vs `"0"`/`"1"` vs `""`), covered
in the inventory §4 #12.

| Target table | Rows |
| --- | --- |
| `intake_submission` | 1,123 |

### 3.6 Remaining collections

| Collection | Shape | Decomposition |
| --- | --- | --- |
| `texts` (869,463) | 5 shapes, 96.91% share one; 10 keys, flat, no nesting | one table, no children. Largest table in the target |
| `coupons` (39,568) | 2 shapes; only `rules:{medsOnly}` optional (236 docs) | one table; `rules.medsOnly` → boolean column |
| `contactrequests` (2,206) | 3 shapes; `additionalData[]` 2 shapes, 5,694 elements, **no element `_id`**; optional block `contactMessage`+`lastFollowUpDate`+`originIP` (2,142) | `contact_request` + `contact_request_note` |
| `surveys` (9,041) | 4 shapes; 5 keys always, `comments`/`smsId` optional; flat | one table |
| `users` (31) | 7 shapes; 10 keys always; `canPrescribe`/`reviewer`/`dea` present-only-when-set | one table; flags default false |
| `prefrences` (92) | 1 shape; `corrections[]` 1 shape, 1,380 elements, has `_id` | `user_preference_correction`, or `jsonb` — purpose `UNKNOWN` |
| `medicationtypes` (7) | 1 shape, rigid | `drug` catalogue rows |
| `vials` (6) | 1 shape, rigid | one table |
| `basecoupons` (4) | 1 shape, rigid | `coupon_template` |
| `excludehours` (2) | 1 shape; `exclude[]` 3 elements, **no element `_id`** | `jsonb` — 3 rows is not worth a table and the semantics are `UNKNOWN` |
| `appointmentintervals`, `doserecords`, `successstories` | 0 docs | not created; `doserecords`' indexes imply a shape but no data confirms types |

---

## 4. Cross-cutting structural findings

### 4.1 Four embedded arrays have no element `_id` — imports are not idempotent

`docs/legacy-data-mapping.md` makes `legacyId String @unique` a ground rule so
importers can upsert and re-run safely. That works only where the source element
carries a stable identifier. Mongoose gave most subdocuments an `_id`; four
arrays have none.

| Array | Elements | Element `_id` | Import key |
| --- | --- | --- | --- |
| `patients.callLog[]` | 15,868 | ✅ all unique | natural |
| `patients.referrals[]` | 3,782 | ✅ all unique | natural |
| `visits.addenda[]` | 5,023 | ✅ all unique | natural |
| `visits.additionalFiles[]` | 164 | ✅ all unique | natural |
| `refillrequests.qa[]` | 71,930 | ✅ all unique | natural |
| `refillrequests.requestedMeds[]` | 2,236 | ✅ all unique | natural |
| `prefrences.corrections[]` | 1,380 | ✅ all unique | natural |
| `visits.creditPaymentDetails[]` | **65,442** | ❌ none | **synthetic** |
| `contactrequests.additionalData[]` | **5,694** | ❌ none | **synthetic** |
| `visits.syringes[]` | **212** | ❌ none | **synthetic** |
| `excludehours.exclude[]` | **3** | ❌ none | **synthetic** |

For the four without ids, re-running an import duplicates rows unless the
importer deletes-then-reinserts children per parent, or synthesises a
deterministic key from `(parent_legacy_id, array_index)`. **The proposal is
`(parent_legacy_id, ordinal)` as the natural key**, which preserves array order —
something a relational child table otherwise loses. Array order may be
meaningful for `creditPaymentDetails` (a `Sale` followed by a `Void`), so the
ordinal is worth keeping regardless.

### 4.2 Numeric ranges will break naive column types

Choosing `smallint` for a blood pressure or `integer` for a weight looks obvious
and fails on this data:

| Column | Values present | Outside plausible range | Negative | Exceeds `int4` | Exceeds `int8` |
| --- | --- | --- | --- | --- | --- |
| `bloodPressure.systolic` | 59,764 | 51 (not 50–300) | 8 | **2** | **1** |
| `bloodPressure.diastolic` | 59,653 | 42 (not 20–200) | 5 | 0 | 0 |
| `weight` | 186,708 | 17 (not 50–1000) | 10 ≤ 0 | **1** | 0 |
| `bmi` | 179,712 | 218 (not 10–100) | — | **1** | 0 |
| `patients.height` | 15,312 | 40 (not 36–90) | — | 0 | 0 |

The maximum observed systolic is 1.03 × 10²⁰ — it does not fit `bigint`, let
alone `smallint`. Maximum weight is 8.9 × 10¹¹; maximum bmi 1.4 × 10¹¹.

Negative money is also present and is *not* obviously corrupt — it may be
refunds: `total` < 0 on 37 visits, `fee.amount` < 0 on 43, `discount.amount` < 0
on 33, medication `price` < 0 on 3. **Whether negatives are refunds or errors is
`UNKNOWN`** — the proposal does not add a non-negative CHECK to money columns for
that reason, but does add range CHECKs to the clinical columns.

### 4.3 Consent boilerplate is stored per patient

`patients.treatmentConsentMsg` averages 2,406 characters and is present on 7,618
documents — roughly 18 MB of legal text. Across those 7,618 documents there are
only **four distinct lengths** (2,372 × 4,949; 2,537 × 2,028; 2,227 × 514;
2,342 × 127). `startmytreatments.consent.treatmentConsentMsg` shows the same
pattern on 1,123 documents with two distinct lengths.

*Inference (length is a proxy for identity — a hash would confirm):* these are
four versions of one consent template, copied onto every patient. The target
models them as a `consent_template` table with a version per row, referenced by
`patient_consent.template_id`, preserving which version each patient signed while
storing the text once.

### 4.4 The `signature` sub-object has two shapes, and the difference matters

`visits.signature` occurs as `{dea, firstName, lastName, signed, ip, user}`
(175,415 docs) or `{dea, firstName, lastName, signed}` (12,501 docs). The second
shape has no `user` at all — so of the 22,026 visits lacking `signature.user`,
12,501 have a signature block that never recorded one and 9,525 have no signature
block at all. Combined with the 38,047 signatures pointing at deleted users
(inventory §4 #2), the attribution picture is:

| Signature state | Visits |
| --- | --- |
| `user` present and resolves to a live user | 137,368 |
| `user` present but the user is deleted | 38,047 |
| signature block present, `user` never recorded | 12,501 |
| no signature block at all | 9,525 |
| **Total** | **197,441** |

Only 69.6% of visits have resolvable signer attribution.

---

## 5. PostgreSQL 17 target schema — PROPOSAL

> **Proposal, not decided.** It follows from the structures measured above; it
> does not follow from knowledge of what the legacy application meant, which is
> unavailable. `entity-inventory.md` §6 gives the equivalent Prisma 7 model and
> the full list of rejected alternatives; this is the same design expressed as
> DDL, revised where shape analysis changed the answer (§3.2).

Conventions: `text` throughout rather than `varchar(n)` (no performance
difference in PostgreSQL, and no length limit to get wrong); `timestamptz` for
instants and `date` for calendar days; `numeric` for money; `identity` primary
keys with the source `_id` preserved as `legacy_id text unique` so imports upsert
idempotently.

```sql
-- ============================================================
-- Reference
-- ============================================================
CREATE TABLE office (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL UNIQUE,
    is_active   boolean NOT NULL DEFAULT true
);

CREATE TYPE user_group AS ENUM ('admin', 'clerk', 'csr', 'doc');

CREATE TABLE user_account (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id     text NOT NULL UNIQUE,
    email         text NOT NULL UNIQUE,
    first_name    text NOT NULL,
    last_name     text NOT NULL,
    "group"       user_group NOT NULL,
    is_active     boolean NOT NULL DEFAULT true,
    can_prescribe boolean NOT NULL DEFAULT false,  -- source: present only when true
    is_reviewer   boolean NOT NULL DEFAULT false,  -- source: present only when true
    has_remote    boolean NOT NULL DEFAULT false,  -- meaning UNKNOWN
    dea           text,
    is_tombstone  boolean NOT NULL DEFAULT false   -- see §4.4 / inventory §4 #2
);
COMMENT ON COLUMN user_account.is_tombstone IS
  'Reconstructed placeholder for one of the 22 deleted accounts referenced by '
  '38,047 visit signatures. Whether to create these is a stakeholder decision.';

CREATE TABLE drug (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id       text UNIQUE,          -- medicationtypes._id, where one exists
    key             text NOT NULL UNIQUE, -- the legacy medications map key (31 of them)
    name            text NOT NULL,
    mg_per_dose     numeric(6,2),
    doses_per_vial  integer,
    expiration_days integer,
    is_active       boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE drug IS
  'Unifies two disconnected vocabularies: the 31 map keys in visits.medications '
  'and the 7 medicationtypes rows. They share no identifier in the source; '
  'whether they describe the same products is UNKNOWN.';

CREATE TABLE consent_template (
    id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind      text NOT NULL,
    version   integer NOT NULL,
    body      text NOT NULL,
    body_hash text NOT NULL UNIQUE,       -- dedupes the ~18 MB of copied text
    UNIQUE (kind, version)
);

-- ============================================================
-- Patient
-- ============================================================
CREATE TYPE gender          AS ENUM ('female', 'male', 'undisclosed');
CREATE TYPE patient_language AS ENUM ('english', 'spanish');
CREATE TYPE patient_status  AS ENUM ('active', 'inactive');
CREATE TYPE contact_time    AS ENUM ('morning', 'afternoon', 'evening');

CREATE TABLE patient (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id     text NOT NULL UNIQUE,
    first_name    text NOT NULL,
    last_name     text NOT NULL,

    -- ONE date of birth. Source carries two disagreeing columns; the raw string
    -- is preserved until the 2,357 conflicts are adjudicated. See inventory §4 #4.
    date_of_birth   date,
    legacy_dob_raw  text,

    gender        gender,
    language      patient_language,
    status        patient_status NOT NULL DEFAULT 'active',

    -- address/phone were 100%-present fixed-shape sub-objects -> flattened
    street        text,
    city          text,
    state         text,
    zip           text,
    phone_number  text,          -- numeric in source; leading zeros already lost
    phone_consent boolean,
    email         text,
    preferred_contact_time contact_time,

    office_id     integer REFERENCES office(id),
    height_inches numeric(5,2),
    healthy_weight numeric(6,2),
    history_notes text,
    referral_source text,
    program_type  text,
    program_price numeric(10,2),
    cutoff_date   timestamptz,
    is_at_home    boolean NOT NULL DEFAULT false,
    sms_id        text,

    referred_by_patient_id bigint REFERENCES patient(id),

    registered_at   timestamptz,   -- only 30% populated, never backfilled
    recent_visit_at timestamptz,   -- cached aggregate; candidate for a view
    recent_text_at  timestamptz,

    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT patient_height_sane
        CHECK (height_inches IS NULL OR height_inches BETWEEN 36 AND 90)
);
CREATE INDEX ON patient (last_name, first_name, date_of_birth);
CREATE INDEX ON patient (sms_id) WHERE sms_id IS NOT NULL;
CREATE INDEX ON patient (office_id);

-- 30+ sparse columns in the source collapse into 11,867 rows here (§2)
CREATE TABLE patient_consent (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id  bigint NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
    kind        text NOT NULL,
    granted     boolean NOT NULL,
    signed_at   timestamptz,
    signature_text text,
    template_id integer REFERENCES consent_template(id),
    UNIQUE (patient_id, kind)
);

CREATE TABLE patient_call_log (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id  text NOT NULL UNIQUE,           -- subdocument _id: import is idempotent
    patient_id bigint NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    notes      text,
    resolution text,
    author_name text,                          -- free-text staff name in source
    author_id  integer REFERENCES user_account(id)
);
CREATE INDEX ON patient_call_log (patient_id, created_at DESC);

-- Isolated so the retention decision touches one table (inventory §7 Q1).
-- Deliberately NO cvv column.
CREATE TABLE stored_card (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id   bigint UNIQUE REFERENCES patient(id) ON DELETE CASCADE,
    pan_token    text NOT NULL,        -- token, never a PAN
    last4        text,
    expiry_month smallint,
    expiry_year  smallint,
    billing_zip  text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stored_card_expiry_month_range
        CHECK (expiry_month IS NULL OR expiry_month BETWEEN 1 AND 12)
);

-- ============================================================
-- Visit
-- ============================================================
CREATE TYPE payment_method AS ENUM ('cash', 'credit', 'split', 'terminal');

CREATE TABLE visit (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id   text NOT NULL UNIQUE,
    patient_id  bigint NOT NULL REFERENCES patient(id),
    office_id   integer REFERENCES office(id),

    occurred_at timestamptz NOT NULL,
    reported_at timestamptz,
    is_deleted  boolean NOT NULL DEFAULT false,
    is_seen     boolean NOT NULL DEFAULT false,
    is_phone_visit boolean NOT NULL DEFAULT false,

    -- numeric, not integer: see §4.2. Values up to 1.03e20 exist and must be
    -- quarantined by the importer rather than silently overflowing.
    weight_lbs numeric(8,2),
    bmi        numeric(6,2),
    systolic   smallint,
    diastolic  smallint,
    notes      text,

    subtotal   numeric(10,2),
    total      numeric(10,2),
    is_paid    boolean NOT NULL DEFAULT false,
    paid_at    timestamptz,
    payment_method payment_method,
    split_cash   numeric(10,2),
    split_credit numeric(10,2),

    fee_name        text,
    fee_amount      numeric(10,2),
    discount_name   text,
    discount_amount numeric(10,2),
    coupon_id       bigint,   -- FK added after coupon is created (see below)

    -- Nullable FK plus a preserved snapshot: for 38,047 visits the snapshot is
    -- the only surviving attribution (§4.4).
    signed_by_id     integer REFERENCES user_account(id),
    signed_at        timestamptz,
    signed_first_name text,
    signed_last_name  text,
    signed_dea        text,
    signed_ip         inet,
    signature_blob    text,

    reviewed_by_id   integer REFERENCES user_account(id),
    reviewed_at      timestamptz,
    tracking_number  text,

    CONSTRAINT visit_systolic_sane  CHECK (systolic  IS NULL OR systolic  BETWEEN 50 AND 300),
    CONSTRAINT visit_diastolic_sane CHECK (diastolic IS NULL OR diastolic BETWEEN 20 AND 200),
    CONSTRAINT visit_weight_sane    CHECK (weight_lbs IS NULL OR weight_lbs BETWEEN 50 AND 1000),
    CONSTRAINT visit_bmi_sane       CHECK (bmi IS NULL OR bmi BETWEEN 10 AND 100),
    CONSTRAINT visit_date_sane      CHECK (occurred_at >= '2000-01-01' AND occurred_at < '2100-01-01')
    -- No non-negative CHECK on money: negatives may be refunds (§4.2, UNKNOWN)
);
CREATE INDEX ON visit (patient_id, occurred_at DESC);
CREATE INDEX ON visit (occurred_at);
CREATE INDEX ON visit (signed_by_id);
CREATE INDEX ON visit (patient_id) WHERE is_deleted = false;

-- The map-to-rows transform. 228,754 rows, not 1,087,926 (§3.2).
CREATE TABLE visit_medication (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id    bigint NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
    drug_id     integer REFERENCES drug(id),
    drug_key    text NOT NULL,
    amount      numeric(10,3),      -- dosages include 0.25, 2.55, 10.2
    price       numeric(10,2),
    product_id  text,               -- NDC-style; needs leading-zero repair
    legacy_rx_id text UNIQUE,       -- source "rxNumber": an ObjectId referencing
                                    -- nothing (inventory §5.3). Opaque, not an FK.
    UNIQUE (visit_id, drug_key)
);
CREATE INDEX ON visit_medication (drug_key);
CREATE INDEX ON visit_medication (drug_id);

-- Element shape is stable (97.5% share one key set) -> a table, not jsonb.
-- The sub-objects are not stable and their codes are undecoded -> jsonb.
CREATE TABLE visit_payment_attempt (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id    bigint NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
    ordinal     smallint NOT NULL,      -- no element _id in source (§4.1)
    tran_type   text,                   -- Sale | Void
    card_type   text,                   -- 0|1|2|3, meaning UNKNOWN
    rsp_code    text,
    rsp_code_msg text,
    ext_rsp_code text,
    ext_rsp_code_msg text,
    merchant_id text,
    auth_rsp    jsonb,                  -- 17 shapes, undecoded codes
    tran_data   jsonb,                  -- 4 shapes
    UNIQUE (visit_id, ordinal)
);
CREATE INDEX ON visit_payment_attempt (rsp_code);
CREATE INDEX ON visit_payment_attempt USING gin (auth_rsp jsonb_path_ops);

CREATE TABLE visit_payment_amount (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_id bigint NOT NULL REFERENCES visit_payment_attempt(id) ON DELETE CASCADE,
    ordinal    smallint NOT NULL,
    account_type text,
    amount     numeric(12,2),
    amount_sign text,
    amount_type text,
    currency_code text,
    UNIQUE (attempt_id, ordinal)
);

CREATE TABLE visit_addendum (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id text NOT NULL UNIQUE,
    visit_id  bigint NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
    notes     text,
    signed_by_id integer REFERENCES user_account(id),
    signed_at timestamptz,
    signed_first_name text,
    signed_last_name  text,
    signed_dea text,
    signed_ip inet
);

CREATE TABLE visit_file (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id     text NOT NULL UNIQUE,
    visit_id      bigint NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
    original_name text NOT NULL,   -- contains patient names: identifying
    storage_name  text NOT NULL,
    is_removed    boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL
);

CREATE TABLE visit_syringe (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id   bigint NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
    ordinal    smallint NOT NULL,     -- no element _id in source
    medication text,
    amount     numeric(10,3),
    qty        integer,               -- string on 32 elements, int on 10
    UNIQUE (visit_id, ordinal)
);

-- ============================================================
-- Messaging, coupons, requests
-- ============================================================
CREATE TYPE text_direction AS ENUM ('inbound', 'outbound');

-- Partitioned by year so retention (inventory §7 Q2) can be applied by dropping
-- partitions. A partitioned table's PRIMARY KEY and UNIQUE constraints must
-- include the partition key, hence the composite forms below -- upsert on
-- (legacy_id, sent_at) still converges, because sent_at is fixed per record.
CREATE TABLE text_message (
    id          bigint GENERATED ALWAYS AS IDENTITY,
    legacy_id   text NOT NULL,
    patient_id  bigint REFERENCES patient(id),
    direction   text_direction NOT NULL,
    body        text NOT NULL,
    to_number   text NOT NULL,
    from_number text,
    is_read     boolean NOT NULL DEFAULT false,  -- meaningful for inbound only
    provider_id text,                            -- inbound only
    sent_at     timestamptz NOT NULL,
    PRIMARY KEY (id, sent_at),
    UNIQUE (legacy_id, sent_at)
) PARTITION BY RANGE (sent_at);

CREATE TABLE text_message_2016 PARTITION OF text_message
    FOR VALUES FROM ('2016-01-01') TO ('2017-01-01');
-- ... one per year ...
CREATE TABLE text_message_2026 PARTITION OF text_message
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE text_message_default PARTITION OF text_message DEFAULT;

CREATE INDEX ON text_message (patient_id, sent_at DESC);

CREATE TABLE coupon (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id   text NOT NULL UNIQUE,
    patient_id  bigint NOT NULL REFERENCES patient(id),
    description text NOT NULL,
    discount_amount numeric(10,2) NOT NULL,
    is_used     boolean NOT NULL DEFAULT false,
    meds_only   boolean NOT NULL DEFAULT false,
    valid_from  timestamptz NOT NULL,
    valid_to    timestamptz NOT NULL,
    issued_by_name text,                        -- free-text name/email in source
    issued_by_id   integer REFERENCES user_account(id)
);
CREATE INDEX ON coupon (patient_id);

-- deferred: visit is created before coupon
ALTER TABLE visit ADD CONSTRAINT visit_coupon_id_fkey
    FOREIGN KEY (coupon_id) REFERENCES coupon(id);

CREATE TYPE refill_status AS ENUM ('pending', 'checked');

CREATE TABLE refill_request (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id  text NOT NULL UNIQUE,
    patient_id bigint REFERENCES patient(id),   -- null on 6,043 source rows
    first_name text NOT NULL,
    last_name  text NOT NULL,
    dob_raw    text NOT NULL,                   -- 12 format shapes in source
    date_of_birth date,
    street text, city text, state text, zip text,
    phone_number text, phone_consent boolean,
    preferred_contact_time contact_time,
    status     refill_status NOT NULL,
    source     text,
    photo_key  text,
    created_at timestamptz NOT NULL
);
CREATE INDEX ON refill_request (last_name, first_name, date_of_birth);
CREATE INDEX ON refill_request (patient_id) WHERE patient_id IS NOT NULL;

CREATE TABLE refill_request_answer (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id  text NOT NULL UNIQUE,
    request_id bigint NOT NULL REFERENCES refill_request(id) ON DELETE CASCADE,
    question   text NOT NULL,     -- closed 8-value set; candidate for a lookup
    answer     text NOT NULL
);

CREATE TABLE refill_request_med (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id  text NOT NULL UNIQUE,
    request_id bigint NOT NULL REFERENCES refill_request(id) ON DELETE CASCADE,
    med_name   text,
    med_freq   text,
    sup_name   text
);

-- ============================================================
-- Scheduling, intake, leads
-- ============================================================
CREATE TYPE appointment_type AS ENUM
    ('initial', 'followup', 'glp1', 'botox', 'celluma', 'other');

CREATE TABLE appointment (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id     text NOT NULL UNIQUE,
    patient_id    bigint REFERENCES patient(id),
    scheduled_for timestamptz NOT NULL,
    type          appointment_type,
    is_confirmed  boolean NOT NULL DEFAULT false,
    assigned_to_id integer REFERENCES user_account(id),
    google_event_id text,
    deposit_paid  boolean NOT NULL DEFAULT false,

    booked_first_name text, booked_last_name text,
    booked_email text, booked_phone text, booked_dob text,
    selected_program text,

    reported_height numeric(5,2),
    reported_weight numeric(6,2),
    history_condition text, last_physical_exam text, current_meds text,

    created_at    timestamptz NOT NULL
);
CREATE INDEX ON appointment (scheduled_for);
CREATE INDEX ON appointment (patient_id);

CREATE TABLE appointment_deposit (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_id bigint NOT NULL UNIQUE REFERENCES appointment(id) ON DELETE CASCADE,
    code_result    text,
    transaction    jsonb
);

CREATE TYPE intake_status AS ENUM ('new', 'patient', 'removed');

CREATE TABLE intake_submission (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id  text NOT NULL UNIQUE,
    -- No patient link exists in the source, even where status = 'patient'
    patient_id bigint REFERENCES patient(id),
    appointment_id bigint UNIQUE REFERENCES appointment(id),
    status     intake_status NOT NULL,

    full_name text NOT NULL, email text NOT NULL, phone text NOT NULL,
    street text, city text, state text, zip text,
    date_of_birth date, gender gender, language patient_language,

    has_diabetes boolean, has_glaucoma boolean, has_heart_condition boolean,
    has_hypertension boolean, has_kidney_condition boolean,
    has_thyroid_condition boolean, is_pregnant boolean, is_breastfeeding boolean,
    had_surgery boolean, surgery_details text,

    lifestyle text,
    height_raw text, weight_raw text, weight_to_lose_raw text,
    used_diet_pills boolean, diet_pill_details text,

    drinks_water boolean, drinks_wine boolean, eats_under_stress boolean,
    eats_sweets boolean, uses_drugs boolean, is_vegan boolean,

    current_meds text, treatment_physician text, additional_info text,
    consent_signature text, consent_signed_at timestamptz,
    consent_template_id integer REFERENCES consent_template(id),
    created_at timestamptz NOT NULL
);
COMMENT ON COLUMN intake_submission.drinks_wine IS
  'Source is three-state ("", "0", "1"); whether "" means no, skipped or '
  'not-asked is UNKNOWN, so "" imports as NULL.';

CREATE TYPE contact_status AS ENUM
    ('new', 'viewed', 'contacted', 'scheduled', 'archived', 'dismissed');

CREATE TABLE contact_request (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id text NOT NULL UNIQUE,
    name      text NOT NULL, email text NOT NULL, phone text NOT NULL,
    message   text,
    status    contact_status NOT NULL,
    lead_stage text,
    city text, state text, source text,
    origin_ip inet,
    last_follow_up_at timestamptz,
    created_at timestamptz NOT NULL
);

CREATE TABLE contact_request_note (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id bigint NOT NULL REFERENCES contact_request(id) ON DELETE CASCADE,
    ordinal    smallint NOT NULL,       -- no element _id in source (§4.1)
    notes      text,
    author_name text,                   -- staff name or an automation marker
    note_date  text,                    -- a string in the source
    UNIQUE (request_id, ordinal)
);

CREATE TYPE survey_rating AS ENUM ('poor', 'good', 'great');

CREATE TABLE survey (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id  text NOT NULL UNIQUE,
    patient_id bigint REFERENCES patient(id),  -- unresolvable for 6,005 rows
    legacy_sms_id text,
    rating     survey_rating,
    comments   text,
    origin_ip  inet,
    created_at timestamptz NOT NULL
);

-- ============================================================
-- Inventory
-- ============================================================
CREATE TYPE vial_status AS ENUM ('unopened', 'opened', 'depleted', 'expired');

CREATE TABLE vial (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id       text NOT NULL UNIQUE,
    drug_id         integer NOT NULL REFERENCES drug(id),
    owner_patient_id bigint NOT NULL REFERENCES patient(id),
    registered_by_id integer NOT NULL REFERENCES user_account(id),
    lot_number      text NOT NULL,
    status          vial_status NOT NULL,
    remaining_doses integer NOT NULL,
    storage_location text NOT NULL,
    registered_at   timestamptz NOT NULL,
    expires_at      timestamptz          -- indexed but never populated in source
);
CREATE INDEX ON vial (owner_patient_id, status);

CREATE TABLE user_preference_correction (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id text NOT NULL UNIQUE,
    user_id   integer REFERENCES user_account(id),  -- 66.3% orphaned in source
    old_value text NOT NULL,
    new_value text NOT NULL
);

CREATE TABLE coupon_template (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id   text NOT NULL UNIQUE,
    description text NOT NULL,
    discount_amount numeric(10,2) NOT NULL,
    valid_timeframe integer NOT NULL,   -- unit UNKNOWN: days? weeks? months?
    created_at  timestamptz NOT NULL
);

CREATE TABLE schedule_exclusion (
    id      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_id text NOT NULL UNIQUE,
    name    text NOT NULL,
    -- 3 elements, no element _id, day-numbering and timezone UNKNOWN: jsonb
    -- until the semantics are known.
    windows jsonb NOT NULL DEFAULT '[]'::jsonb
);
```

### 5.1 Target row counts

| Table | Rows | From |
| --- | --- | --- |
| `text_message` | 869,463 | `texts` |
| `visit_medication` | **228,754** | `visits.medications` map (818,027 stub slots discarded) |
| `visit` | 197,441 | `visits` |
| `refill_request_answer` | 71,930 | `refillrequests.qa[]` |
| `visit_payment_attempt` | 65,442 | `visits.creditPaymentDetails[]` |
| `coupon` | 39,568 | `coupons` |
| `refill_request` | 18,073 | `refillrequests` |
| `patient_call_log` | 15,868 | `patients.callLog[]` |
| `patient` | 15,613 | `patients` |
| `patient_consent` | 11,867 | 10 correlated field groups |
| `survey` | 9,041 | `surveys` |
| `contact_request_note` | 5,694 | `contactrequests.additionalData[]` |
| `visit_addendum` | 5,023 | `visits.addenda[]` |
| `appointment` | 2,831 | `appointments` |
| `refill_request_med` | 2,236 | `refillrequests.requestedMeds[]` |
| `contact_request` | 2,206 | `contactrequests` |
| `visit_payment_amount` | 1,607 | nested `additionalAmount[]` |
| `user_preference_correction` | 1,380 | `prefrences.corrections[]` |
| `intake_submission` | 1,123 | `startmytreatments` |
| `visit_syringe` | 212 | `visits.syringes[]` |
| `visit_file` | 164 | `visits.additionalFiles[]` |
| `appointment_deposit` | 108 | `appointments.depositFee` |
| `stored_card` | ≤ 8,375 | pending the §7 policy answer |
| `drug`, `office`, `user_account`, `vial`, `coupon_template`, `consent_template`, `schedule_exclusion` | < 60 combined | reference data |
| **Total** | **≈ 1.57 M** | vs 1,155,501 source documents |

Row count rises because embedded arrays become rows, and falls because 818,027
medication stub slots and the duplicated `patients.visits[]` array are discarded.

### 5.2 BSON → PostgreSQL 17 type mapping

| BSON / source pattern | PostgreSQL 17 | Note |
| --- | --- | --- |
| `ObjectId` (identity) | `text` as `legacy_id` + `bigint` identity PK | keeps imports idempotent |
| `ObjectId` (reference) | `bigint` FK resolved via `legacy_id` | two-pass load |
| `Date` | `timestamptz` | source is UTC instants |
| date-as-string (`dobStr`, `dob`) | `date` + `text` raw | 12 formats in `refillrequests` |
| `int` \| `double` on one path | `numeric(p,s)` | never `float` for money |
| clinical ints with outliers | `smallint` + CHECK | outliers quarantined, not truncated (§4.2) |
| `bool` present-only-when-true | `boolean NOT NULL DEFAULT false` | absence means false |
| closed string set | `ENUM` | only where the set is closed *and* meaningful |
| open/dirty string set | `text` (+ lookup table) | `office`, `referralSource`, `programType` |
| map keyed by domain value | child table with a `key` column | `visits.medications` |
| fixed-shape 100% sub-object | flattened columns | `address`, `phone`, `basicDetails` |
| variable-shape sub-object, undecoded | `jsonb` (+ GIN) | `authRsp`, `tranData` |
| array of scalars | dropped or child table | `visits[]` dropped as duplicate |
| array of fixed-shape objects | child table | all seven such arrays |
| IP address string | `inet` | `signature.ip`, `originIP`, `surveys.ip` |

### 5.3 Load mechanics worth using in PostgreSQL 17

- **`COPY … WITH (ON_ERROR ignore, LOG_VERBOSITY verbose)`** — new in PostgreSQL
  17. Given the range corruption in §4.2 and the 12 format shapes of
  `refillrequests.dob`, a bulk load that skips and *logs* bad rows instead of
  aborting the whole COPY is directly useful. Quarantine what it rejects rather
  than loosening the CHECK constraints.
- **`MERGE … RETURNING`** — also new in 17; lets the importer upsert on
  `legacy_id` and report what it inserted versus updated in one statement, which
  is what makes a re-runnable import observable.
- **`JSON_TABLE()`** — new in 17; can project the NDJSON extract into relational
  form inside the database, which is an alternative to transforming in the
  importer. Worth a spike; the `medications` map still needs
  `jsonb_each` to become rows.
- Load order: `office`, `consent_template`, `drug`, `user_account` →
  `patient` → `visit`, `coupon`, `refill_request`, `appointment` → all children.
  Add FKs and CHECKs **after** the bulk load, so the constraint validation is one
  pass rather than per row.

### 5.4 The schema in this document was executed, not just written

The DDL above was applied to a real PostgreSQL 17.11 instance
(`postgres:17-alpine`) on a fresh database. It applies cleanly:

```
 tables | enums | fkeys | checks | indexes
--------+-------+-------+--------+---------
     33 |    13 |     41 |      7 |      93
```

The constraints were then tested against the actual corrupt values measured in
§4.2, using the real observed extremes:

| Test | Source volume | Result |
| --- | --- | --- |
| `systolic = 103108103211031100000` | 1 row (observed max) | rejected — `smallint out of range` |
| `systolic = -312075` | part of the 8 negatives | rejected — `smallint out of range` |
| `occurred_at = '0201-07-13'` | 12 rows | rejected — `visit_date_sane` |
| `total = -1611.00` | 37 rows | **accepted**, by design (may be refunds — §4.2) |
| `text_message` rows dated 2016-12 and 2026-04 | — | routed to `text_message_2016` / `text_message_2026` |

**A detail that matters for the importer:** the two extreme systolic values are
rejected by *type coercion*, not by the CHECK constraint — PostgreSQL raises
`smallint out of range` before the constraint is evaluated. In-range-but-
implausible values (diastolic reaches 9,091, which fits `smallint`) are the ones
the CHECK catches. An importer that only handles constraint violations will miss
the first class of failure, so it must handle both. This is also why
`COPY … ON_ERROR ignore` (§5.3) is the right loading tool: it captures both
without aborting the load.

---

## 6. What this analysis changed

| Earlier position (`entity-inventory.md` §6) | Revised here | Why |
| --- | --- | --- |
| `creditPaymentDetails[]` → `Json` | **Child table**, with `authRsp`/`tranData` as `jsonb` | 97.5% of 65,442 elements share one key set; only the sub-objects are irregular |
| `patients` consent fields → one table (asserted) | **Confirmed empirically** | co-occurrence proves 10 perfectly correlated triples, 11,867 rows |
| `visit_medication` sized implicitly | **228,754 rows, not 1,087,926** | 818,027 slots carry no dosage or price |
| Clinical columns typed by intuition | **CHECK constraints with measured bounds** | systolic reaches 1.03e20 and would overflow `bigint` |
| Consent text as a column | **`consent_template` + FK** | 7,618 copies, 4 distinct lengths, ~18 MB |
| Child tables keyed by `legacyId` uniformly | **Four arrays need synthetic `(parent, ordinal)` keys** | those elements have no `_id` |

---

## 7. Open questions this analysis raises

Additional to the stakeholder questions in `entity-inventory.md` §7.

1. **Is a medication slot with no `amount` and no `price` a non-event?** The
   proposal discards 818,027 such slots. If they carry meaning — a prescription
   written but not dispensed, say — the filter is wrong and the table is 1.09M
   rows. *Resolution: the legacy source.*
2. **Is array order meaningful?** `creditPaymentDetails[]` contains `Sale` and
   `Void` entries; if order encodes sequence, the `ordinal` column is data, not
   just a key. *Resolution: the legacy source.*
3. **Are negative money values refunds or corruption?** 37 negative visit totals,
   43 negative fees, 33 negative discounts, 3 negative medication prices. This
   determines whether money columns get a non-negative CHECK.
4. **Do the four `treatmentConsentMsg` length-variants correspond to four
   consent versions?** A content hash would confirm what length only suggests,
   but reading that text is a privacy decision, not an engineering one.
5. **Should the 22 deleted user accounts be reconstructed as tombstone rows?**
   The schema provides `user_account.is_tombstone` for it; whether to populate it
   is not an engineering call.
6. **Is `text_message` partitioning by year acceptable?** It presumes retention
   is applied by time. If retention is per-patient, the partition key is wrong.

---

## Appendix — reproducing this analysis

The profiler scripts (`shapes.js`, `cooc.js`, `sizing.js`, `ranges.js`) were
written for this task and kept **outside this repository**, per the rule in
`docs/legacy-data-mapping.md` that no MongoDB extraction code enters it. They
were copied into the container, run read-only, and removed. The queries backing
each claim are quoted inline above.

Every figure in §2, §3 and §4 comes from a **full-collection scan** — no
sampling — across all 1,155,501 documents.
