/**
 * One-time migration: legacy Mongo `visits` → Postgres `visits`, plus the
 * `patients.lastVisitAt` backfill.
 *
 * **Input is an NDJSON export, never a Mongo connection** (same rule as
 * migrate-patients.ts; docs/legacy-data-mapping.md ground rules). The export
 * runs against the container, outside the repo:
 *
 *   docker exec mongo mongoexport --quiet -u admin -p secret \
 *     --authenticationDatabase admin -d fastehr -c visits \
 *     --fields _id,patient,created,office,notes,signature \
 *     > visits.ndjson
 *
 * The field mapping is docs/legacy-data-mapping.md § visits. What this script
 * decides:
 *
 * - **A visit belongs to a patient or it is nothing.** `patient` resolves
 *   through `patients.legacyId`; a visit whose patient never migrated (the two
 *   records the patient import skipped) is skipped here too, reported by
 *   legacy id. Run migrate-patients first.
 * - **A signature keeps its name even when it loses its account.** The
 *   signer resolves through `users.legacyId`; the `npdoc` accounts the user
 *   migration refused resolve to nothing, so `signedById` is NULL and the
 *   legacy signature block's name snapshot carries the attribution
 *   (`signedByName`), noted in the report.
 * - **`lastVisitAt` is recomputed for every patient** after the rows are in,
 *   in one statement, the way the legacy visit hooks kept `recentVisit`:
 *   `max(dateOfService)` per patient, NULL where there is none.
 *
 * The report is PHI-free: legacy ids, field names, and reasons. Never a note
 * body, never a name.
 *
 * Idempotent: upserts are keyed on `legacyId`, so a re-run converges. Dry-run
 * by default; nothing is written without --apply.
 *
 * Usage (from packages/db):
 *   pnpm migrate-visits -- --input /path/to/visits.ndjson              # dry run
 *   pnpm migrate-visits -- --input /path/to/visits.ndjson --apply
 *   pnpm migrate-visits -- --input ... --report /path/to/report.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const { getPrismaClient } = await import('../src/client.ts')

interface ImportedVisit {
  legacyId: string
  patientLegacyId: string
  dateOfService: Date
  office: string | null
  notes: string | null
  signerLegacyId: string | null
  signedByName: string | null
  signedAt: Date | null
}

interface Skip {
  legacyId: string
  reason: string
}

/** A field-level cleanup — the row still migrates. Field names and reasons only. */
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

  if (input === undefined) throw new Error('--input <visits.ndjson> is required')
  return { input, apply, report: report ?? `${input}.report.json` }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asTrimmed(value: unknown): string | null {
  const trimmed = asString(value)?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/** mongoexport writes ObjectIds as `{"$oid": "..."}` (canonical Extended JSON). */
function parseObjectId(value: unknown): string | null {
  if (typeof value === 'string' && /^[0-9a-f]{24}$/.test(value)) return value
  if (typeof value === 'object' && value !== null && '$oid' in value) {
    return asString((value as { $oid: unknown }).$oid)
  }
  return null
}

/**
 * A date, whatever shape the export gave it: `{"$date": "<iso>"}`, the
 * relaxed `{"$date": {"$numberLong": "<ms>"}}`, or a bare ISO string.
 */
function parseDate(value: unknown): Date | null {
  let raw: unknown = value
  if (typeof raw === 'object' && raw !== null && '$date' in raw) raw = (raw as { $date: unknown }).$date
  if (typeof raw === 'object' && raw !== null && '$numberLong' in raw) {
    raw = Number((raw as { $numberLong: unknown }).$numberLong)
  }
  const date = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw) : null
  return date !== null && Number.isFinite(date.getTime()) ? date : null
}

const { input, apply, report: reportPath } = parseArgs(process.argv.slice(2))

const lines = readFileSync(input, 'utf8').split('\n').filter((line) => line.trim() !== '')

const parsed: ImportedVisit[] = []
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
  const note = (field: string, text: string) => fieldNotes.push({ legacyId, field, note: text })

  const patientLegacyId = parseObjectId(raw.patient)
  if (patientLegacyId === null) {
    skips.push({ legacyId, reason: 'missing or malformed patient reference' })
    continue
  }

  // `created` is the date of service — the legacy schema had no other. A
  // visit without one has no place on a timeline, so it skips.
  const dateOfService = parseDate(raw.created)
  if (dateOfService === null) {
    skips.push({ legacyId, reason: 'missing or invalid created date' })
    continue
  }
  // A date of service in the future is a legacy typo (a year mistyped), not
  // a fact — but it is the record's only date, so it imports as is and the
  // report names it. It will sort that patient to the top of the roster
  // until someone corrects the visit.
  if (dateOfService.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    note('dateOfService', 'in the future — imported as is, needs correction')
  } else if (dateOfService.getFullYear() < 1990) {
    note('dateOfService', 'before 1990 — imported as is, needs correction')
  }

  const signature = asObject(raw.signature)
  const signedAt = parseDate(signature.signed)
  if (signature.signed !== undefined && signature.signed !== null && signedAt === null) {
    note('signedAt', 'signature.signed not a date — imported as unsigned')
  }
  const signerLegacyId = signedAt === null ? null : parseObjectId(signature.user)
  const signerName = [asTrimmed(signature.firstName), asTrimmed(signature.lastName)]
    .filter((part): part is string => part !== null)
    .join(' ')

  parsed.push({
    legacyId,
    patientLegacyId,
    dateOfService,
    office: asTrimmed(raw.office),
    notes: asTrimmed(raw.notes),
    signerLegacyId,
    signedByName: signedAt === null || signerName === '' ? null : signerName,
    signedAt,
  })
}

const prisma = getPrismaClient()

// Both references resolve through the legacy id columns the earlier imports
// left behind. The whole patient map is loaded once: a visits export is many
// times the size of the patient table, and a query per row would be the cost.
const patientRows = await prisma.patient.findMany({
  where: { legacyId: { not: null } },
  select: { id: true, legacyId: true },
})
const patientIdByLegacyId = new Map(patientRows.map((row) => [row.legacyId ?? '', row.id]))

const userRows = await prisma.user.findMany({
  where: { legacyId: { not: null } },
  select: { id: true, legacyId: true },
})
const userIdByLegacyId = new Map(userRows.map((row) => [row.legacyId ?? '', row.id]))

const resolvable: (ImportedVisit & { patientId: string; signedById: string | null })[] = []
let signersUnresolved = 0
for (const visit of parsed) {
  const patientId = patientIdByLegacyId.get(visit.patientLegacyId)
  if (patientId === undefined) {
    skips.push({ legacyId: visit.legacyId, reason: 'patient never migrated' })
    continue
  }
  let signedById: string | null = null
  if (visit.signerLegacyId !== null) {
    signedById = userIdByLegacyId.get(visit.signerLegacyId) ?? null
    if (signedById === null) {
      fieldNotes.push({
        legacyId: visit.legacyId,
        field: 'signedById',
        note: 'signer never migrated — name snapshot kept, account reference null',
      })
      signersUnresolved += 1
    }
  }
  resolvable.push({ ...visit, patientId, signedById })
}

let written = 0
let patientsBackfilled = 0
if (apply) {
  await prisma.$transaction(
    async (tx) => {
      // New rows in bulk, existing rows one by one — a re-run is the rare
      // case, a first run is tens of thousands of inserts.
      const existing = await tx.visit.findMany({
        where: { legacyId: { in: resolvable.map((visit) => visit.legacyId) } },
        select: { id: true, legacyId: true },
      })
      const existingIdByLegacyId = new Map(existing.map((row) => [row.legacyId ?? '', row.id]))

      const toRow = (visit: (typeof resolvable)[number]) => ({
        patientId: visit.patientId,
        dateOfService: visit.dateOfService,
        office: visit.office,
        notes: visit.notes,
        signedById: visit.signedById,
        signedByName: visit.signedByName,
        signedAt: visit.signedAt,
      })

      const fresh = resolvable.filter((visit) => !existingIdByLegacyId.has(visit.legacyId))
      const CHUNK = 1000
      for (let start = 0; start < fresh.length; start += CHUNK) {
        const chunk = fresh.slice(start, start + CHUNK)
        await tx.visit.createMany({
          data: chunk.map((visit) => ({
            id: randomUUID(),
            legacyId: visit.legacyId,
            // Created when the legacy document was — the date of service is
            // the only creation instant the export carries.
            createdAt: visit.dateOfService,
            ...toRow(visit),
          })),
        })
        written += chunk.length
      }

      for (const visit of resolvable) {
        const id = existingIdByLegacyId.get(visit.legacyId)
        if (id === undefined) continue
        // The legacy system stays authoritative for its records until
        // cutover: a re-run refreshes every mapped field.
        await tx.visit.update({ where: { id }, data: toRow(visit) })
        written += 1
      }

      // The denormalized column, recomputed for the whole table in one
      // statement — cheaper and more certain than tracking which patients
      // this run touched.
      patientsBackfilled = await tx.$executeRaw`
        UPDATE "patients" AS p
        SET "lastVisitAt" = v."latest"
        FROM (
          SELECT "patientId", MAX("dateOfService") AS "latest"
          FROM "visits"
          GROUP BY "patientId"
        ) AS v
        WHERE v."patientId" = p."id"
          AND p."lastVisitAt" IS DISTINCT FROM v."latest"
      `
    },
    { timeout: 30 * 60_000 },
  )
}

const report = {
  ranAt: new Date().toISOString(),
  input,
  mode: apply ? 'apply' : 'dry-run',
  totalRead: lines.length,
  parsed: parsed.length,
  resolvable: resolvable.length,
  written,
  signed: resolvable.filter((visit) => visit.signedAt !== null).length,
  signersUnresolved,
  patientsBackfilled,
  // Field names, legacy ids, and reasons only — never a note or a name.
  fieldNotes,
  skipped: skips,
}

writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')

console.log(
  `${apply ? 'APPLY' : 'DRY RUN'}: read ${lines.length}, parsed ${parsed.length}, resolvable ${resolvable.length}, ` +
    `written ${written}, signers unresolved ${signersUnresolved}, patients backfilled ${patientsBackfilled}, ` +
    `field notes ${fieldNotes.length}, skipped ${skips.length}`,
)
console.log(`report: ${reportPath}`)
if (skips.length > 0) console.log('skips are listed in the report with reasons.')

await prisma.$disconnect()
