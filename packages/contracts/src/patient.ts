import { z } from 'zod'

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

/** The legacy system's office list, verbatim. */
export const PATIENT_OFFICES = [
  'Sylmar',
  'Montebello',
  'PennProgram',
  'Telemedicine',
  'At Home',
  'Israel',
  'Colonial Heights',
] as const
export const patientOfficeSchema = z.enum(PATIENT_OFFICES)
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
 * The roster search, with the legacy queue's semantics: names match exactly
 * but case-insensitively (the legacy UI anchored its regex on both ends), the
 * date of birth matches the calendar day, and the phone is reduced to digits
 * before an exact match. Every filter is optional; the caller decides what an
 * empty search means (the legacy UI fell back to the recent list).
 *
 * Name filters require two characters, as the legacy search did — a one-letter
 * exact match is always a typo.
 */
export const searchPatientsInput = z.object({
  firstName: blankAsAbsent(z.string().trim().min(2).max(50)),
  lastName: blankAsAbsent(z.string().trim().min(2).max(100)),
  dateOfBirth: blankAsAbsent(z.iso.date()),
  phone: blankAsAbsent(normalizedPhone),
})
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
