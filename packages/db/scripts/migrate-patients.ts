/**
 * One-time migration: legacy Mongo `patients` → Postgres `patients`.
 *
 * **Input is an NDJSON export, never a Mongo connection.**
 * `docs/legacy-data-mapping.md` rules that no MongoDB driver or extraction
 * code enters this repository; the export command below runs against the
 * container, outside the repo:
 *
 *   docker exec mongo mongoexport --quiet -u admin -p secret \
 *     --authenticationDatabase admin -d fastehr -c patients \
 *     --fields _id,firstName,lastName,dobStr,gender,height,healthyWeight,language,office,email,phone,address,referralSource,referredByPt,hx,programType,status,creditCardNumber,creditCardExpMonth,creditCardExpYear,creditCardZip \
 *     > patients.ndjson
 *
 * The card fields ride along under the provisional billing-continuity decision
 * (contracts § patient header comment). `creditCardCVV` is deliberately NOT in
 * the export: PCI DSS forbids storing it, and the legacy form never rendered
 * it anyway.
 *
 * The field mapping is docs/legacy-data-mapping.md § patients, and this script
 * adds nothing to it. Two rules shape the cleanup decisions:
 *
 * - **A row written here must survive `toPatient` (the mapper parses, never
 *   casts).** So every candidate is validated through the contracts entity
 *   schema before any write, and a field the contract would reject — a
 *   malformed email, a phone that is not ten digits, an unknown gender —
 *   imports as NULL with a note in the report, because a record with a bad
 *   email is still a patient. Only fields the schema requires (names, date of
 *   birth) skip the whole record.
 * - **The report is PHI-free.** It names legacy ids, field names, and
 *   reasons — never a patient's name, date of birth, email, or phone. That is
 *   also why skip reasons carry Zod issue codes, not values (same logic as
 *   ADR 12).
 *
 * `referredByPt` resolves through patient `legacyId` in a second pass, after
 * every row exists — a referrer can appear later in the file than the referred.
 * A reference whose target never migrated resolves to NULL, noted; a re-run
 * after the target arrives converges (upserts are keyed on `legacyId`, so the
 * whole import is idempotent, like migrate-users.ts).
 *
 * Dry-run by default; nothing is written without --apply. Writes are a single
 * transaction — a half-migrated patient table cannot happen.
 *
 * Usage (from packages/db):
 *   pnpm migrate-patients -- --input /path/to/patients.ndjson              # dry run
 *   pnpm migrate-patients -- --input /path/to/patients.ndjson --apply
 *   pnpm migrate-patients -- --input ... --report /path/to/report.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import {
  patientGenderSchema,
  patientLanguageSchema,
  patientSchema,
  type PatientGender,
  type PatientLanguage,
  type PatientStatus,
} from '@fastehr/contracts'

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const { getPrismaClient } = await import('../src/client.ts')

/** Everything a `Patient` row needs, minus what the database generates. */
interface ImportedPatient {
  legacyId: string
  firstName: string
  lastName: string
  /** ISO `YYYY-MM-DD`, converted to a UTC-midnight Date at write time. */
  dateOfBirth: string
  gender: PatientGender | null
  heightInches: number | null
  healthyWeight: number | null
  language: PatientLanguage | null
  office: string | null
  email: string | null
  phone: string | null
  phoneFollowUpAllowed: boolean
  addressStreet: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null
  referralSource: string | null
  /** The referrer's legacy id, resolved to a row id in the second pass. */
  referredByLegacyId: string | null
  historyNotes: string | null
  programType: string | null
  status: PatientStatus
  creditCardNumber: string | null
  creditCardExpMonth: string | null
  creditCardExpYear: string | null
  creditCardZip: string | null
  createdAt: Date
}

interface Skip {
  legacyId: string
  reason: string
}

/** A field-level cleanup — the record still migrates. Field names and reasons only, never values. */
interface FieldNote {
  legacyId: string
  field: string
  note: string
}

function parseArgs(argv: readonly string[]): { input: string; apply: boolean; report: string } {
  let input: string | undefined
  let report: string | undefined
  let apply = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue
    else if (arg === '--input') { input = argv[i + 1]; i += 1 }
    else if (arg === '--report') { report = argv[i + 1]; i += 1 }
    else if (arg === '--apply') apply = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (input === undefined) throw new Error('--input <patients.ndjson> is required')
  return { input, apply, report: report ?? `${input}.report.json` }
}

/** Mongo ObjectIds carry their creation time in the first four bytes. */
function objectIdTimestamp(oid: string): Date {
  return new Date(parseInt(oid.slice(0, 8), 16) * 1000)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** A trimmed string, with blank collapsing to null — an unfilled field is absent. */
function asTrimmed(value: unknown): string | null {
  const trimmed = asString(value)?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/** mongoexport writes `_id` as `{"$oid": "..."}` (canonical Extended JSON). */
function parseObjectId(value: unknown): string | null {
  if (typeof value === 'string' && /^[0-9a-f]{24}$/.test(value)) return value
  if (typeof value === 'object' && value !== null && '$oid' in value) {
    return asString((value as { $oid: unknown }).$oid)
  }
  return null
}

/**
 * A numeric legacy field, whatever shape the export gave it: a plain JSON
 * number, a numeric string, or an Extended JSON wrapper (`$numberLong`,
 * `$numberInt`, `$numberDouble`).
 */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    return value.trim() !== '' && Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'object' && value !== null) {
    const wrapper = value as Record<string, unknown>
    return asNumber(wrapper.$numberLong ?? wrapper.$numberInt ?? wrapper.$numberDouble ?? null)
  }
  return null
}

const { input, apply, report: reportPath } = parseArgs(process.argv.slice(2))

const lines = readFileSync(input, 'utf8').split('\n').filter((line) => line.trim() !== '')

const parsed: ImportedPatient[] = []
const skips: Skip[] = []
const fieldNotes: FieldNote[] = []
const seenLegacyIds = new Set<string>()

for (const [index, line] of lines.entries()) {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(line) as Record<string, unknown>
  } catch {
    skips.push({ legacyId: `line ${index + 1}`, reason: 'unparseable JSON line' })
    continue
  }

  const legacyId = parseObjectId(raw._id)
  if (legacyId === null) {
    skips.push({ legacyId: `line ${index + 1}`, reason: 'missing or malformed _id' })
    continue
  }
  if (seenLegacyIds.has(legacyId)) {
    skips.push({ legacyId, reason: 'duplicate _id in export — first occurrence wins' })
    continue
  }
  seenLegacyIds.add(legacyId)

  // The three fields the schema requires: without them there is no row to write.
  const firstName = asTrimmed(raw.firstName)
  const lastName = asTrimmed(raw.lastName)
  if (firstName === null || lastName === null) {
    skips.push({ legacyId, reason: 'missing first or last name' })
    continue
  }
  const note = (field: string, text: string) => fieldNotes.push({ legacyId, field, note: text })

  // `dobStr` was the legacy source of truth, normally `YYYY-MM-DD`; the
  // derived `dob` timestamp is not in the export (docs/legacy-data-mapping.md).
  // Two malformed minorities reduce to a calendar date and are recovered,
  // noted: a full ISO timestamp (programmatically patched records) keeps its
  // date part, and a `M/D/YYYY` converts. A two-digit year cannot be guessed
  // at, so anything else still skips.
  let dobStr = asTrimmed(raw.dobStr)
  if (dobStr !== null && /^\d{4}-\d{2}-\d{2}T/.test(dobStr)) {
    dobStr = dobStr.slice(0, 10)
    note('dateOfBirth', 'timestamp-form dobStr — date part taken')
  } else if (dobStr !== null) {
    const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dobStr)
    if (usDate !== null) {
      const [, month = '', day = '', year = ''] = usDate
      dobStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      note('dateOfBirth', 'US-format dobStr — converted')
    }
  }
  const dateOfBirth = patientSchema.shape.dateOfBirth.safeParse(dobStr)
  if (!dateOfBirth.success) {
    skips.push({ legacyId, reason: 'missing or invalid date of birth' })
    continue
  }

  // From here down a bad value nulls the field and notes it — never a skip.

  const genderRaw = asTrimmed(raw.gender)
  const gender = patientGenderSchema.safeParse(genderRaw)
  if (genderRaw !== null && !gender.success) note('gender', 'not a known value — imported as null')

  const languageRaw = asTrimmed(raw.language)
  const language = patientLanguageSchema.safeParse(languageRaw)
  if (languageRaw !== null && !language.success) note('language', 'not a known value — imported as null')

  const heightInches = asNumber(raw.height)
  if (raw.height !== undefined && raw.height !== null && heightInches === null) {
    note('heightInches', 'not numeric — imported as null')
  }
  const healthyWeight = asNumber(raw.healthyWeight)
  if (raw.healthyWeight !== undefined && raw.healthyWeight !== null && healthyWeight === null) {
    note('healthyWeight', 'not numeric — imported as null')
  }

  const emailRaw = asTrimmed(raw.email)?.toLowerCase() ?? null
  const email = patientSchema.shape.email.safeParse(emailRaw)
  if (emailRaw !== null && !email.success) note('email', 'not a valid address — imported as null')

  // Legacy stored the number as a BSON Number; ten digits is the contract.
  // An eleventh leading 1 is country-code noise, anything else is not a
  // reachable phone number and imports as null.
  const phoneRaw = typeof raw.phone === 'object' && raw.phone !== null ? (raw.phone as Record<string, unknown>) : {}
  const phoneNumber = asNumber(phoneRaw.number)
  let phone: string | null = null
  if (phoneNumber !== null) {
    const digits = String(Math.trunc(phoneNumber))
    const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
    if (local.length === 10) phone = local
    else note('phone', `${digits.length} digits, not ten — imported as null`)
  } else if (phoneRaw.number !== undefined && phoneRaw.number !== null) {
    note('phone', 'not numeric — imported as null')
  }

  const address = typeof raw.address === 'object' && raw.address !== null ? (raw.address as Record<string, unknown>) : {}

  const statusRaw = asTrimmed(raw.status)
  const programType = asTrimmed(raw.programType)

  const candidate: ImportedPatient = {
    legacyId,
    firstName,
    lastName,
    dateOfBirth: dateOfBirth.data,
    gender: gender.success ? gender.data : null,
    heightInches,
    healthyWeight,
    language: language.success ? language.data : null,
    office: asTrimmed(raw.office),
    email: email.success ? email.data : null,
    phone,
    // Legacy `phone.permission` hydrated to true (the form default); only an
    // explicit false withdraws follow-up consent.
    phoneFollowUpAllowed: phoneRaw.permission !== false,
    addressStreet: asTrimmed(address.street),
    addressCity: asTrimmed(address.city),
    addressState: asTrimmed(address.state),
    addressZip: asTrimmed(address.zip),
    referralSource: asTrimmed(raw.referralSource),
    referredByLegacyId: parseObjectId(raw.referredByPt),
    historyNotes: asTrimmed(raw.hx),
    // The legacy pick-list's `None` is "no program", which is absence here.
    programType: programType === 'None' ? null : programType,
    // The legacy UI's own check: `inactive` is inactive, anything else is active.
    status: statusRaw === 'inactive' ? 'inactive' : 'active',
    // Loose strings on the entity, like office — historical values import as
    // they are. The exp month/year occasionally arrived as numbers.
    creditCardNumber: asTrimmed(raw.creditCardNumber),
    creditCardExpMonth: asTrimmed(raw.creditCardExpMonth) ?? (asNumber(raw.creditCardExpMonth)?.toString() ?? null),
    creditCardExpYear: asTrimmed(raw.creditCardExpYear) ?? (asNumber(raw.creditCardExpYear)?.toString() ?? null),
    creditCardZip: asTrimmed(raw.creditCardZip),
    createdAt: objectIdTimestamp(legacyId),
  }

  // The backstop the mapper relies on: this exact shape (id and the resolved
  // referral aside) is what `toPatient` will re-parse on every read. Failing
  // here, with paths and codes only, beats failing there with a live roster.
  const validated = patientSchema
    .omit({ id: true, referredByPatientId: true })
    .safeParse({ ...candidate, legacyId: undefined, referredByLegacyId: undefined, createdAt: undefined })
  if (!validated.success) {
    const fields = validated.error.issues.map((issue) => `${issue.path.join('.')}:${issue.code}`)
    skips.push({ legacyId, reason: `contract rejection — ${fields.join(', ')}` })
    continue
  }

  parsed.push(candidate)
}

const prisma = getPrismaClient()

// Referral targets resolve through legacyId: against this run's records first,
// then against rows an earlier run already wrote.
const referralTargets = [...new Set(parsed.flatMap((p) => (p.referredByLegacyId === null ? [] : [p.referredByLegacyId])))]
const inRun = new Set(parsed.map((p) => p.legacyId))
const missingFromRun = referralTargets.filter((target) => !inRun.has(target))
const existingRows = missingFromRun.length === 0
  ? []
  : await prisma.patient.findMany({
      where: { legacyId: { in: missingFromRun } },
      select: { legacyId: true },
    })
const resolvable = new Set([...inRun, ...existingRows.map((row) => row.legacyId ?? '')])

let unresolvedReferrals = 0
for (const patient of parsed) {
  if (patient.referredByLegacyId !== null && !resolvable.has(patient.referredByLegacyId)) {
    fieldNotes.push({
      legacyId: patient.legacyId,
      field: 'referredByPatientId',
      note: 'referrer never migrated — imported as null',
    })
    unresolvedReferrals += 1
  }
}

let written = 0
let referralsResolved = 0
if (apply) {
  await prisma.$transaction(
    async (tx) => {
      // Pass 1: every patient row, referral column deferred.
      const idByLegacyId = new Map<string, string>()
      for (const patient of parsed) {
        const { legacyId, referredByLegacyId: _deferred, dateOfBirth, createdAt, ...fields } = patient
        const mapped = { ...fields, dateOfBirth: new Date(dateOfBirth) }
        const row = await tx.patient.upsert({
          where: { legacyId },
          create: { id: randomUUID(), legacyId, createdAt, ...mapped },
          // A re-run refreshes every mapped field — the legacy system stays
          // authoritative for its records until cutover. Only `createdAt`
          // (derived once from the ObjectId) is create-only.
          update: mapped,
          select: { id: true },
        })
        idByLegacyId.set(legacyId, row.id)
        written += 1
      }

      // Pass 2: resolve referrals now that every target row exists.
      for (const patient of parsed) {
        const target = patient.referredByLegacyId
        let referredByPatientId: string | null = null
        if (target !== null) {
          referredByPatientId =
            idByLegacyId.get(target) ??
            (await tx.patient.findUnique({ where: { legacyId: target }, select: { id: true } }))?.id ??
            null
          if (referredByPatientId !== null) referralsResolved += 1
        }
        const current = idByLegacyId.get(patient.legacyId)
        if (current !== undefined) {
          await tx.patient.update({ where: { id: current }, data: { referredByPatientId } })
        }
      }
    },
    // The default interactive-transaction timeout is seconds; a full
    // collection import is not.
    { timeout: 10 * 60_000 },
  )
}

const report = {
  ranAt: new Date().toISOString(),
  input,
  mode: apply ? 'apply' : 'dry-run',
  totalRead: lines.length,
  parsed: parsed.length,
  written,
  referralsInInput: parsed.filter((p) => p.referredByLegacyId !== null).length,
  referralsResolved,
  referralsUnresolved: unresolvedReferrals,
  // Field names, legacy ids, and reasons only — never a patient value.
  fieldNotes,
  skipped: skips,
}

writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')

console.log(
  `${apply ? 'APPLY' : 'DRY RUN'}: read ${lines.length}, parsed ${parsed.length}, written ${written}, ` +
    `referrals resolved ${referralsResolved} (unresolved ${unresolvedReferrals}), ` +
    `field cleanups ${fieldNotes.length}, skipped ${skips.length}`,
)
console.log(`report: ${reportPath}`)
if (skips.length > 0) console.log('skips are listed in the report with reasons.')

await prisma.$disconnect()
