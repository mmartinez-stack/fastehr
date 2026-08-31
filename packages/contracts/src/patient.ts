import { z } from 'zod'
import { officeSchema } from './office.ts'

/**
 * Patient — the entity and its write inputs.
 *
 * The field set is the legacy patient form, reimplemented
 * (docs/legacy-data-mapping.md § patients): demographics, address, contact
 * permissions, referral provenance, and program enrolment. Requiredness on the
 * inputs mirrors the legacy Angular form — the legacy *backend* validated
 * almost nothing, so the form's reactive validators were the real contract and
 * they are what these schemas encode. The legacy credit-card block is
 * deliberately not ported.
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

/** The legacy expiration-month values, verbatim — unpadded month numbers. */
export const CREDIT_CARD_EXP_MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const
export const creditCardExpMonthSchema = z.enum(CREDIT_CARD_EXP_MONTHS)
export type CreditCardExpMonth = z.infer<typeof creditCardExpMonthSchema>

export const patientSchema = z.object({
  id: z.uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.iso.date(),
  gender: patientGenderSchema.nullable(),
  /** Inches, as the legacy form captured it. */
  heightInches: z.number().nullable(),
  healthyWeight: z.number().nullable(),
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
  /** Legacy `hx` — current medications and pertinent history, free text. */
  historyNotes: z.string().nullable(),
  programType: z.string().nullable(),
  status: patientStatusSchema,
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
 * Measurements arrive as form text and leave as numbers. The patterns are the
 * legacy form's, verbatim: height is two integer digits (inches, 10–99) and
 * weight two or three, each with optional hundredths. The regex runs before
 * the numeric conversion so a failure carries `invalid_format`, same as phone.
 */
const heightInches = z.string().trim().regex(/^\d{2}(\.\d{1,2})?$/).transform(Number)
const weightPounds = z.string().trim().regex(/^\d{2,3}(\.\d{1,2})?$/).transform(Number)

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
 * Requiredness and lengths follow the legacy form's reactive validators:
 * names, gender, height, the full address, and phone are required; email,
 * healthy weight, language, office, referral provenance, history, and program
 * are optional. `status` is not an input — a record is created active and
 * changes state only through `setPatientStatusInput`, mirroring the legacy
 * UI's separate activate/deactivate action.
 */
export const createPatientInput = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(100),
  gender: patientGenderSchema,
  heightInches,
  dateOfBirth,
  healthyWeight: blankAsAbsent(weightPounds),
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
  historyNotes: blankAsAbsent(z.string().trim().max(10000)),
  programType: blankAsAbsent(patientProgramTypeSchema),
  creditCardNumber: blankAsAbsent(creditCardNumber),
  creditCardExpMonth: blankAsAbsent(creditCardExpMonthSchema),
  creditCardExpYear: blankAsAbsent(creditCardExpYear),
  creditCardZip: blankAsAbsent(creditCardZip),
})

export type CreatePatientInput = z.infer<typeof createPatientInput>

export const updatePatientInput = createPatientInput.extend({ id: z.uuid() })
export type UpdatePatientInput = z.infer<typeof updatePatientInput>

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
 * Requiredness and lengths are the legacy panel's validators. The *send*
 * itself belongs to the messaging domain (not yet wired); this input is the
 * contract the form validates through today and the procedure will accept
 * when that domain lands.
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
 * Match semantics per field are unchanged from the legacy queue: names exact
 * but case-insensitive, DOB by calendar day, phone by its ten digits. The
 * two-character name minimum stays — a one-letter exact match is always a
 * typo. Query and date combine as AND, so a common name narrows by birth day.
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
 * The transform re-runs the interpreter server-side, so an uninterpretable
 * query fails validation (issue code `custom`, per ADR 12 — the client owns
 * the copy, keyed by the problem it already computed locally). Both filters
 * are optional individually, but an entirely empty search is refused — the
 * caller falls back to the recent list instead of asking for everyone.
 */
export const searchPatientsInput = z
  .object({
    query: blankAsAbsent(
      z
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
        }),
    ),
    dateOfBirth: blankAsAbsent(z.iso.date()),
    status: blankAsAbsent(patientStatusSchema),
  })
  .refine(
    (value) =>
      value.query !== undefined || value.dateOfBirth !== undefined || value.status !== undefined,
  )
export type SearchPatientsInput = z.infer<typeof searchPatientsInput>

/**
 * The referred-by-patient picker's query (legacy `/patients/search`):
 * "Lastname" or "Lastname, Firstname", substring, case-insensitive. The
 * two-character minimum is the legacy guard against matching everyone.
 */
export const searchPatientsByNameInput = z.object({
  name: z.string().trim().min(2).max(150),
})
export type SearchPatientsByNameInput = z.infer<typeof searchPatientsByNameInput>
