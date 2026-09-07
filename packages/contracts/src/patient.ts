import { z } from 'zod'
import { officeSchema } from './office.ts'

/**
 * Patient — the entity and its write inputs.
 *
 * The field set is the legacy patient form, reimplemented
 * (docs/legacy-data-mapping.md § patients) and restructured into sections at
 * the Aug 31 sync (DIA-52): demographics, vitals, medications, medical
 * history, allergies, primary care doctor, billing. Requiredness on the
 * inputs mirrors the legacy Angular form where a field existed there — the
 * legacy *backend* validated almost nothing, so the form's reactive
 * validators were the real contract and they are what these schemas encode.
 *
 * Sections are the unit of authorization (ADR 28): a provider reads and
 * writes the clinical sections and never sees demographics or billing; the
 * front desk and admins see everything. Hence one read schema per section
 * and one update input per section, rather than one record-wide update.
 *
 * `createPatientInput` is deliberately not `patientSchema.omit(…)`: an input
 * schema normalizes (trims names, lowercases email, strips phone formatting)
 * where the entity schema only describes what a stored record looks like.
 * Deriving one from the other couples the two jobs and the normalization is
 * the part that matters — it runs identically in the browser form and in the
 * tRPC mutation, because both import this object (docs/forms.md).
 *
 * The credit-card block (number, expiration, billing zip — the fields the
 * legacy form rendered; its CVV control existed in the form group but was
 * never shown, and CVV storage is forbidden outright by PCI DSS) is ported
 * **provisionally** (decision 2026-08-31): the clinic needs billing
 * continuity now, and the tokenized-processor design is still pending. When
 * that lands, these fields migrate to processor tokens and the raw values go.
 *
 * Vocabulary fields differ on purpose between the two schemas: `office`,
 * `referralSource`, and `programType` are **enums on the inputs** (the form
 * offers exactly the legacy options) but **plain strings on the entity**, so a
 * record imported with a historical value the pick-lists no longer offer still
 * reads back without failing the mapper's parse. `gender`, `language`, and
 * `status` were enums in the legacy schema itself, so they stay enums on both
 * sides.
 */

export const PATIENT_GENDERS = ['male', 'female'] as const
export const patientGenderSchema = z.enum(PATIENT_GENDERS)
export type PatientGender = z.infer<typeof patientGenderSchema>

export const PATIENT_LANGUAGES = ['english', 'spanish'] as const
export const patientLanguageSchema = z.enum(PATIENT_LANGUAGES)
export type PatientLanguage = z.infer<typeof patientLanguageSchema>

export const PATIENT_STATUSES = ['active', 'inactive'] as const
export const patientStatusSchema = z.enum(PATIENT_STATUSES)
export type PatientStatus = z.infer<typeof patientStatusSchema>

/**
 * The form's office pick-list is the site vocabulary itself (office.ts) — one
 * list for records and authorization scopes. The dead legacy sites the
 * vocabulary excludes (Israel, Colonial Heights) still read back through the
 * entity's plain-string `office`, but are not offered for new records.
 */
export const PATIENT_OFFICES = officeSchema.options
export const patientOfficeSchema = officeSchema
export type PatientOffice = z.infer<typeof patientOfficeSchema>

/**
 * The legacy system's referral-source list, minus its blank option — an
 * unfilled field is absent here, not an empty string.
 */
export const PATIENT_REFERRAL_SOURCES = [
  'direct marketing',
  'groupon',
  'previous office / restart',
  'yelp',
  'social media',
  'internet search',
  'word of mouth',
  'another patient',
  'El Aviso',
  'tiktok/StephanieR',
  'Gym TV',
] as const
export const patientReferralSourceSchema = z.enum(PATIENT_REFERRAL_SOURCES)
export type PatientReferralSource = z.infer<typeof patientReferralSourceSchema>

/**
 * The referral source that reveals the referred-by-patient picker — the legacy
 * form matched `/patient/` against the source text.
 */
export const REFERRED_BY_PATIENT_SOURCE = 'another patient'

/**
 * The legacy system's At Home program names, minus `None` — like the referral
 * source, "no program" is absence, not a sentinel string.
 */
export const PATIENT_PROGRAM_TYPES = [
  'Introductory Program',
  'Basic Program',
  'Professional Program',
  'Comprehensive Program',
] as const
export const patientProgramTypeSchema = z.enum(PATIENT_PROGRAM_TYPES)
export type PatientProgramType = z.infer<typeof patientProgramTypeSchema>

/**
 * The medical-history checklist. **A stub**: ten common conditions until the
 * final list arrives from the clinic's mockup, at which point this array is
 * the only thing that changes — the column stores the key as a plain string,
 * so rows answered under the stub vocabulary keep reading back.
 */
export const PATIENT_CONDITIONS = [
  'thyroid',
  'heart_disease',
  'diabetes',
  'kidney_disease',
  'hypertension',
  'high_cholesterol',
  'sleep_apnea',
  'depression_or_anxiety',
  'glaucoma',
  'pregnancy_or_breastfeeding',
] as const
export const patientConditionSchema = z.enum(PATIENT_CONDITIONS)
export type PatientCondition = z.infer<typeof patientConditionSchema>

/** The legacy expiration-month values, verbatim — unpadded month numbers. */
export const CREDIT_CARD_EXP_MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const
export const creditCardExpMonthSchema = z.enum(CREDIT_CARD_EXP_MONTHS)
export type CreditCardExpMonth = z.infer<typeof creditCardExpMonthSchema>

/** One line of the medication list, as stored. */
export const patientMedicationSchema = z.object({
  name: z.string().min(1),
  dose: z.string().nullable(),
  frequency: z.string().nullable(),
})
export type PatientMedication = z.infer<typeof patientMedicationSchema>

/** One medication allergy, as stored. */
export const patientAllergySchema = z.object({
  name: z.string().min(1),
  reaction: z.string().nullable(),
})
export type PatientAllergy = z.infer<typeof patientAllergySchema>

/**
 * One checklist item the patient answered "Yes" to, as stored. Absence is
 * "No". The key is a plain string on the entity (a row answered under an
 * older vocabulary still reads back); the input constrains it to the list.
 */
export const patientConditionEntrySchema = z.object({
  condition: z.string().min(1),
  onset: z.string().nullable(),
  treatedBy: z.string().nullable(),
  medicated: z.boolean(),
  medications: z.string().nullable(),
})
export type PatientConditionEntry = z.infer<typeof patientConditionEntrySchema>

export const patientSchema = z.object({
  id: z.uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.iso.date(),
  gender: patientGenderSchema.nullable(),
  language: patientLanguageSchema.nullable(),
  office: z.string().nullable(),
  email: z.email().nullable(),
  /** Ten digits, no formatting — presentation belongs to the client. */
  phone: z.string().regex(/^\d{10}$/).nullable(),
  /** Legacy `phone.permission` — whether follow-up contact is allowed. */
  phoneFollowUpAllowed: z.boolean(),
  addressStreet: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressState: z.string().nullable(),
  addressZip: z.string().nullable(),
  referralSource: z.string().nullable(),
  referredByPatientId: z.uuid().nullable(),
  programType: z.string().nullable(),
  // --- Clinical sections (DIA-52) ---
  /** Total inches, as the legacy form captured it; the form shows feet and inches. */
  heightInches: z.number().nullable(),
  medications: z.array(patientMedicationSchema),
  allergies: z.array(patientAllergySchema),
  conditions: z.array(patientConditionEntrySchema),
  /**
   * Medical history, "Other": free text after the checklist. Carries the
   * legacy `hx` ("current medications and pertinent history") verbatim for
   * migrated records.
   */
  historyOther: z.string().nullable(),
  pcpName: z.string().nullable(),
  pcpAddress: z.string().nullable(),
  pcpPhone: z.string().regex(/^\d{10}$/).nullable(),
  /**
   * Still on the entity, no longer on any screen: the Aug 31 sync replaced
   * the badge with the last-visit date (DIA-50). It stays so the stored value
   * keeps reading back; nothing filters or sorts on it.
   */
  status: patientStatusSchema,
  /**
   * When the patient was last seen — `max(visits.dateOfService)`, the legacy
   * `recentVisit`. Null for a patient with no visit on record. An instant
   * (ISO datetime), because the roster compares it against "a year ago".
   */
  lastVisitAt: z.iso.datetime().nullable(),
  // The provisional credit-card block (see the header comment). Plain strings
  // like the other vocabulary fields — historical values import as they are;
  // the inputs carry the legacy form's validators.
  creditCardNumber: z.string().nullable(),
  creditCardExpMonth: z.string().nullable(),
  creditCardExpYear: z.string().nullable(),
  creditCardZip: z.string().nullable(),
})

export type Patient = z.infer<typeof patientSchema>

/**
 * The sections a caller reads (ADR 28). `header` is what every role sees at
 * the top of the record and on the roster; `clinical` is the provider's
 * half; `demographics` and `billing` are clerical. The full entity above is
 * what the repository speaks; procedures hand out these.
 */
export const patientHeaderSchema = patientSchema.pick({
  id: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  office: true,
  lastVisitAt: true,
})
export type PatientHeader = z.infer<typeof patientHeaderSchema>

export const patientDemographicsSchema = patientSchema.pick({
  gender: true,
  language: true,
  office: true,
  email: true,
  phone: true,
  phoneFollowUpAllowed: true,
  addressStreet: true,
  addressCity: true,
  addressState: true,
  addressZip: true,
  referralSource: true,
  referredByPatientId: true,
  programType: true,
})
export type PatientDemographics = z.infer<typeof patientDemographicsSchema>

export const patientClinicalSchema = patientSchema.pick({
  heightInches: true,
  medications: true,
  allergies: true,
  conditions: true,
  historyOther: true,
  pcpName: true,
  pcpAddress: true,
  pcpPhone: true,
})
export type PatientClinical = z.infer<typeof patientClinicalSchema>

export const patientBillingSchema = patientSchema.pick({
  creditCardNumber: true,
  creditCardExpMonth: true,
  creditCardExpYear: true,
  creditCardZip: true,
})
export type PatientBilling = z.infer<typeof patientBillingSchema>

/** What `patient.byId` returns to every role: the header and the clinical half. */
export const patientChartSchema = patientHeaderSchema.extend(patientClinicalSchema.shape)
export type PatientChart = z.infer<typeof patientChartSchema>

/**
 * A roster row. `phone` is a clerical detail: the procedures null it for a
 * provider before it leaves the server, so the redaction is not a column the
 * client chooses to hide.
 */
export const patientSummarySchema = patientHeaderSchema.extend({ phone: patientSchema.shape.phone })
export type PatientSummary = z.infer<typeof patientSummarySchema>

export function toPatientSummary(patient: Patient): PatientSummary {
  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth,
    office: patient.office,
    lastVisitAt: patient.lastVisitAt,
    phone: patient.phone,
  }
}

/**
 * A blank string means the user left the field empty, and an empty optional
 * field is *absent*, not invalid. Without this, clearing the email field and
 * submitting would fail `z.email()` on `''` — an error for a field the user
 * never filled in.
 */
function blankAsAbsent<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  )
}

/** Trimmed and lowercased before validation — same normalization as staff emails. */
const normalizedEmail = z.string().trim().toLowerCase().pipe(z.email())

/**
 * Anything a person types — "(951) 555-0000", "951.555.0000" — reduced to
 * digits, then required to be exactly ten of them. The regex (issue code
 * `invalid_format`) rather than a refinement, so the failure keeps a specific
 * code for the client copy table.
 */
const normalizedPhone = z
  .string()
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{10}$/))

/**
 * A date of birth is a past calendar date. The comparison is lexicographic,
 * which is exact for `YYYY-MM-DD`, and "today" is UTC's today — at a day
 * boundary that errs lenient (accepts a date the server's clock has not
 * reached locally) rather than rejecting a birth date that is true where the
 * user is standing. Refinements carry issue code `custom`; the client copy
 * table keys on the field, so one message covers the whole plausibility check.
 */
const dateOfBirth = z.iso.date().pipe(
  // Piped rather than chained so the plausibility check only ever sees a
  // well-formed date — chained, a malformed string reaches the refinement and
  // the field reports two codes for one mistake.
  z.string().refine((value) => {
    const today = new Date().toISOString().slice(0, 10)
    return value <= today && value >= '1900-01-01'
  }),
)

/**
 * Height arrives as two form fields, feet and inches (DIA-52), and leaves as
 * the total inches the column has always stored — so migrated heights are
 * untouched and the edit form decomposes them for display. Feet allows 0 so a
 * migrated value under a foot (a legacy typo) can still be opened and fixed;
 * inches allows hundredths as the legacy pattern did. The regexes run before
 * the numeric conversion so a failure carries `invalid_format`, same as phone.
 */
const heightFeet = z.string().trim().regex(/^[0-8]$/)
const heightInchesPart = z.string().trim().regex(/^(\d|1[01])(\.\d{1,2})?$/)

/** Blank optional text → absent; present text → trimmed and length-capped. */
const optionalText = (max: number) => blankAsAbsent(z.string().trim().max(max))

/**
 * A list row the user left entirely blank is not a row: the form adds an
 * empty line to type into, and an untouched line must not fail `min(1)` on
 * its name. Rows with anything in them validate in full.
 */
const droppingBlankRows = <Row extends z.ZodType>(row: Row, max: number) =>
  z.preprocess(
    (value) =>
      Array.isArray(value)
        ? value.filter(
            (candidate) =>
              typeof candidate !== 'object' ||
              candidate === null ||
              Object.values(candidate as Record<string, unknown>).some(
                (field) => typeof field === 'string' && field.trim() !== '',
              ),
          )
        : value,
    z.array(row).max(max),
  )

const medicationRow = z.object({
  name: z.string().trim().min(1).max(100),
  dose: optionalText(50),
  frequency: optionalText(50),
})

const allergyRow = z.object({
  name: z.string().trim().min(1).max(100),
  reaction: optionalText(200),
})

/**
 * One checklist item as the form submits it: every item, with `present`
 * false by default. Only the present ones are stored, and the details are
 * dropped for an item answered "No" — a form that hides them keeps stale text
 * in state, and that text must not be written.
 */
const conditionRow = z.object({
  condition: patientConditionSchema,
  present: z.boolean(),
  onset: optionalText(100),
  treatedBy: optionalText(100),
  medicated: z.boolean(),
  medications: optionalText(200),
})

/** Two-letter state/territory code, as the legacy state dropdown stored it. */
const stateCode = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{2}$/))

/** Legacy zip validator, verbatim: three to eight digits. */
const zipCode = z.string().trim().regex(/^\d{3,8}$/)

/**
 * The legacy card-number validator (14–18 digits), applied after stripping
 * the spaces and dashes people type — same normalization stance as phone.
 */
const creditCardNumber = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{14,18}$/))

/** Legacy billing-zip validator, verbatim: four to six digits. */
const creditCardZip = z.string().trim().regex(/^\d{4,6}$/)

/** A four-digit year; the form's dropdown constrains to the offered range. */
const creditCardExpYear = z.string().trim().regex(/^\d{4}$/)

/**
 * The three input sections. Requiredness and lengths follow the legacy form's
 * reactive validators where the field existed there: names, gender, height,
 * the full address, and phone are required; email, language, office,
 * referral provenance, and program are optional. The new sections
 * (medications, checklist, allergies, primary care doctor) are optional
 * throughout — a patient with nothing to list has an empty list.
 *
 * `status` is not an input — a record is created active and changes state
 * only through `setPatientStatusInput`.
 */
/** Exported for the intake contract (intake.ts), which reuses the sections. */
export const demographicsFields = {
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(100),
  gender: patientGenderSchema,
  dateOfBirth,
  language: blankAsAbsent(patientLanguageSchema),
  office: blankAsAbsent(patientOfficeSchema),
  email: blankAsAbsent(normalizedEmail),
  addressStreet: z.string().trim().min(1).max(200),
  addressCity: z.string().trim().min(1).max(100),
  addressState: stateCode,
  addressZip: zipCode,
  phone: normalizedPhone,
  phoneFollowUpAllowed: z.boolean(),
  referralSource: blankAsAbsent(patientReferralSourceSchema),
  referredByPatientId: blankAsAbsent(z.uuid()),
  programType: blankAsAbsent(patientProgramTypeSchema),
}

export const clinicalFields = {
  heightFeet,
  heightInchesPart,
  medications: droppingBlankRows(medicationRow, 50),
  allergies: droppingBlankRows(allergyRow, 50),
  conditions: z
    .array(conditionRow)
    .max(PATIENT_CONDITIONS.length)
    .refine((rows) => new Set(rows.map((row) => row.condition)).size === rows.length),
  historyOther: optionalText(10000),
  pcpName: optionalText(100),
  pcpAddress: optionalText(200),
  pcpPhone: blankAsAbsent(normalizedPhone),
}

const billingFields = {
  creditCardNumber: blankAsAbsent(creditCardNumber),
  creditCardExpMonth: blankAsAbsent(creditCardExpMonthSchema),
  creditCardExpYear: blankAsAbsent(creditCardExpYear),
  creditCardZip: blankAsAbsent(creditCardZip),
}

/**
 * The clinical section's shape after parsing: feet and inches composed into
 * the stored total, the checklist reduced to the items answered "Yes".
 */
export function composeClinical<
  Fields extends {
    heightFeet: string
    heightInchesPart: string
    conditions: z.infer<typeof conditionRow>[]
  },
>({ heightFeet, heightInchesPart, conditions, ...rest }: Fields) {
  return {
    ...rest,
    // Two decimals at most survive the regex, so the sum is exact enough;
    // rounding keeps 5 ft 4.1 in from storing as 64.10000000000001.
    heightInches: Math.round((Number(heightFeet) * 12 + Number(heightInchesPart)) * 100) / 100,
    conditions: conditions
      .filter((row) => row.present)
      .map(({ present: _present, ...row }) => row),
  }
}

/**
 * The sections as standalone inputs, for a client validating only the tabs
 * its role renders (a provider's form has no demographics to check). The
 * update inputs below are these plus the record id.
 */
export const patientDemographicsInput = z.object(demographicsFields)
export const patientClinicalInput = z.object(clinicalFields).transform(composeClinical)
export const patientBillingInput = z.object(billingFields)

/** Create takes every section at once: the tabbed form submits as one record. */
export const createPatientInput = z
  .object({ ...demographicsFields, ...clinicalFields, ...billingFields })
  .transform(composeClinical)
export type CreatePatientInput = z.infer<typeof createPatientInput>

export const updatePatientDemographicsInput = z.object({ id: z.uuid(), ...demographicsFields })
export type UpdatePatientDemographicsInput = z.infer<typeof updatePatientDemographicsInput>

export const updatePatientClinicalInput = z
  .object({ id: z.uuid(), ...clinicalFields })
  .transform(composeClinical)
export type UpdatePatientClinicalInput = z.infer<typeof updatePatientClinicalInput>

export const updatePatientBillingInput = z.object({ id: z.uuid(), ...billingFields })
export type UpdatePatientBillingInput = z.infer<typeof updatePatientBillingInput>

export const setPatientStatusInput = z.object({
  id: z.uuid(),
  status: patientStatusSchema,
})
export type SetPatientStatusInput = z.infer<typeof setPatientStatusInput>

/**
 * The intake text — the legacy "Send Intake Form" side panel. No patient
 * record exists yet: the clinic texts a person a link to the self-service
 * intake page, and the person enters their own details from their phone. The
 * language picks which translation the text arrives in.
 *
 * Requiredness and lengths are the legacy panel's validators. The request
 * this creates, and what comes back through the link, are in intake.ts.
 */
export const sendPatientIntakeInput = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(100),
  phone: normalizedPhone,
  language: blankAsAbsent(patientLanguageSchema),
})
export type SendPatientIntakeInput = z.infer<typeof sendPatientIntakeInput>

/**
 * The roster search (ADR 27): one text input for names and phone — the
 * *format* of what was typed decides which field it searches — plus a
 * separate date field for date of birth. Digits (with any phone punctuation)
 * are a phone number; anything else is a name — one word matches first *or*
 * last name, two words are a full name ("First Last", or the picker's
 * "Last, First" convention). A date typed into the text box is refused with a
 * pointer at the date field, never guessed at.
 *
 * Match semantics per field: names by substring, case-insensitive, anywhere
 * in the name ("pe" finds Penn and Lopez alike — the Aug 31 sync, DIA-59,
 * replacing the legacy queue's exact match); DOB by calendar day; phone by
 * its ten digits, exact. The two-character name minimum stays — one letter
 * matches too much of a 50k-row table to mean anything. Query and dates
 * combine as AND, so a common name narrows by birth day.
 *
 * The interpreter is exported on its own so the roster form can classify as
 * the user types (to hint "needs all ten digits" before submit) with the same
 * logic the server parses by — the docs/forms.md rule, applied to a search.
 */
export type PatientSearchInterpretation =
  | { kind: 'phone'; phone: string }
  /** One word — matches either name field. */
  | { kind: 'name'; name: string }
  /**
   * Two words. Orientation is as typed ("First Last") or explicit ("Last,
   * First"), but exact matching makes checking both orientations harmless, and
   * the repository does.
   */
  | { kind: 'fullName'; firstName: string; lastName: string }

export type PatientSearchProblem =
  /** Digits-only input that is not a complete ten-digit phone number. */
  | 'phone_incomplete'
  /** A date typed into the text box — dates go in the date-of-birth field. */
  | 'date_in_search'
  /** A name part under the two-character minimum. */
  | 'name_too_short'

const ISO_DATE_QUERY = /^\d{4}-\d{2}-\d{2}$/
const US_DATE_QUERY = /^\d{1,2}\/\d{1,2}\/\d{4}$/
/** Only digits and phone punctuation — what a pasted phone number looks like. */
const PHONE_SHAPED = /^[\s()+.-]*\d[\d\s()+.-]*$/

export function interpretPatientSearch(
  raw: string,
): { ok: true; value: PatientSearchInterpretation } | { ok: false; problem: PatientSearchProblem } {
  const query = raw.trim()

  // Date-shaped input is refused, not interpreted — the date field exists so
  // the text box never has to guess. Checked before the phone shape because
  // an ISO date is digits and hyphens too.
  if (ISO_DATE_QUERY.test(query) || US_DATE_QUERY.test(query)) {
    return { ok: false, problem: 'date_in_search' }
  }

  if (PHONE_SHAPED.test(query)) {
    const digits = query.replace(/\D/g, '')
    // A pasted "+1 (951) 555-0000" is the same ten-digit number.
    const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
    return local.length === 10
      ? { ok: true, value: { kind: 'phone', phone: local } }
      : { ok: false, problem: 'phone_incomplete' }
  }

  const [beforeComma = '', afterComma = ''] = query.split(',').map((part) => part.trim())
  const parts =
    afterComma !== ''
      ? { firstName: afterComma, lastName: beforeComma } // "Last, First"
      : (() => {
          const spaceAt = beforeComma.indexOf(' ')
          if (spaceAt === -1) return null
          return {
            firstName: beforeComma.slice(0, spaceAt).trim(),
            lastName: beforeComma.slice(spaceAt + 1).trim(),
          } // "First Last"
        })()

  if (parts === null) {
    return beforeComma.length >= 2
      ? { ok: true, value: { kind: 'name', name: beforeComma } }
      : { ok: false, problem: 'name_too_short' }
  }
  return parts.firstName.length >= 2 && parts.lastName.length >= 2
    ? { ok: true, value: { kind: 'fullName', ...parts } }
    : { ok: false, problem: 'name_too_short' }
}

/**
 * The zone a calendar day on the roster is reckoned in. Visits are stored as
 * instants; "seen on Monday" means Monday where the clinic stands, and every
 * clinic site is in one zone. Named here, once, rather than left to whichever
 * server or browser happens to run the query (ADR 18's lesson, applied to
 * a search).
 */
export const CLINIC_TIME_ZONE = 'America/Los_Angeles'

/**
 * The text query, interpreted. The transform re-runs the interpreter
 * server-side, so an uninterpretable query fails validation (issue code
 * `custom`, per ADR 12 — the client owns the copy, keyed by the problem it
 * already computed locally).
 */
const interpretedQuery = z
  .string()
  .trim()
  .min(2)
  .max(150)
  .transform((value, ctx) => {
    const interpreted = interpretPatientSearch(value)
    if (!interpreted.ok) {
      ctx.addIssue({ code: 'custom', params: { problem: interpreted.problem } })
      return z.NEVER
    }
    return interpreted.value
  })

/**
 * The roster search. Three criteria, each optional, ANDed: the text query,
 * a date of birth, and a date of service ("patients seen on Monday" — any
 * visit on that clinic day, DIA-59). An entirely empty search is refused —
 * the caller shows the capped recent list instead of asking for everyone.
 * There is no status filter: status left the roster with DIA-50.
 */
export const searchPatientsInput = z
  .object({
    query: blankAsAbsent(interpretedQuery),
    dateOfBirth: blankAsAbsent(z.iso.date()),
    serviceDate: blankAsAbsent(z.iso.date()),
  })
  .refine(
    (value) =>
      value.query !== undefined || value.dateOfBirth !== undefined || value.serviceDate !== undefined,
  )
export type SearchPatientsInput = z.infer<typeof searchPatientsInput>

/**
 * The type-ahead behind the roster's search box: the same interpretation as
 * a search, a handful of rows back. The two-character minimum is the
 * interpreter's; the debounce is the client's.
 */
export const suggestPatientsInput = z.object({ query: interpretedQuery })
export type SuggestPatientsInput = z.infer<typeof suggestPatientsInput>

/**
 * The referred-by-patient picker's query (legacy `/patients/search`):
 * "Lastname" or "Lastname, Firstname", substring, case-insensitive. The
 * two-character minimum is the legacy guard against matching everyone.
 */
export const searchPatientsByNameInput = z.object({
  name: z.string().trim().min(2).max(150),
})
export type SearchPatientsByNameInput = z.infer<typeof searchPatientsByNameInput>
