import {
  CLINIC_TIME_ZONE,
  type CreatePatientInput,
  type Patient,
  type PatientSearchInterpretation,
  type SearchPatientsByNameInput,
  type SearchPatientsInput,
  type SetPatientStatusInput,
  type SuggestPatientsInput,
  type UpdatePatientInput,
} from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toPatient } from '../mappers/patient.ts'

/**
 * Patient reads and writes — the query set ported from the legacy patient
 * endpoints (docs/legacy-data-mapping.md § patients): search/save, no delete
 * (the legacy system disabled patient deletion, and so does this one), and
 * since DIA-59 no unfiltered list either: every read of more than one row
 * goes through `search`, whose input refuses to be empty.
 *
 * The interface is declared in terms of `@fastehr/contracts` types only: no
 * `Prisma.PatientWhereInput`, no `Decimal`, no `select` objects. A consumer
 * cannot express a query in Prisma's vocabulary through this API, which is what
 * stops persistence concepts from leaking upward one convenience argument at a
 * time.
 */
export interface PatientRepository {
  findById(id: string): Promise<Patient | null>
  /** The roster search (ADR 27, amended): substring names, exact phone, two calendar days; capped. */
  search(input: SearchPatientsInput): Promise<Patient[]>
  /** The roster's type-ahead: the same interpretation, a few rows deep. */
  suggest(input: SuggestPatientsInput): Promise<Patient[]>
  /** The referred-by picker — legacy `/patients/search`, substring on names. */
  searchByName(input: SearchPatientsByNameInput): Promise<Patient[]>
  create(input: CreatePatientInput): Promise<Patient>
  update(input: UpdatePatientInput): Promise<Patient>
  setStatus(input: SetPatientStatusInput): Promise<Patient>
}

/**
 * The legacy caps, kept: 100 rows for a search, 30 for the picker. The
 * type-ahead shows a handful — it is for jumping to a record, not reading a
 * list.
 */
const SEARCH_LIMIT = 100
const PICKER_LIMIT = 30
const SUGGEST_LIMIT = 8

/**
 * The roster's one order (DIA-50): most recently seen first, patients with no
 * visit on record last, names breaking ties so the no-visit tail is stable.
 */
const ROSTER_ORDER = [
  { lastVisitAt: { sort: 'desc' as const, nulls: 'last' as const } },
  { lastName: 'asc' as const },
  { firstName: 'asc' as const },
]

/**
 * One definition of "what the form said" → "what the row stores", shared by
 * create and update so the two writes cannot drift. Absent optional fields
 * store NULL — an update that clears a field really clears it.
 */
function toWriteData(input: CreatePatientInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    // A date-only ISO string parses as UTC midnight, which is exactly
    // what a `@db.Date` column stores — the inverse of the mapper's
    // `toCalendarDate`, and like it, deliberately not local time.
    dateOfBirth: new Date(input.dateOfBirth),
    gender: input.gender,
    heightInches: input.heightInches,
    healthyWeight: input.healthyWeight ?? null,
    language: input.language ?? null,
    office: input.office ?? null,
    email: input.email ?? null,
    addressStreet: input.addressStreet,
    addressCity: input.addressCity,
    addressState: input.addressState,
    addressZip: input.addressZip,
    phone: input.phone,
    phoneFollowUpAllowed: input.phoneFollowUpAllowed,
    referralSource: input.referralSource ?? null,
    referredByPatientId: input.referredByPatientId ?? null,
    historyNotes: input.historyNotes ?? null,
    programType: input.programType ?? null,
    creditCardNumber: input.creditCardNumber ?? null,
    creditCardExpMonth: input.creditCardExpMonth ?? null,
    creditCardExpYear: input.creditCardExpYear ?? null,
    creditCardZip: input.creditCardZip ?? null,
  }
}

/**
 * The text query as a where clause. The contract already decided which field
 * the query means (ADR 27); this only translates each interpretation.
 *
 * Names match by substring, case-insensitive, anywhere in the field (DIA-59:
 * "pe" finds Penn). Phone stays exact — a prefix search on digits is a
 * different feature with different index needs. A two-word query is checked
 * in both orientations, each part a substring of its field, so "Jo Pe" and
 * "Pe, Jo" both find Josh Penn.
 */
function whereForQuery(query: PatientSearchInterpretation | undefined) {
  if (query === undefined) return {}
  const within = (value: string) => ({ contains: value, mode: 'insensitive' as const })
  switch (query.kind) {
    case 'phone':
      return { phone: query.phone }
    case 'name':
      // One word — the searcher didn't say which name it is.
      return { OR: [{ firstName: within(query.name) }, { lastName: within(query.name) }] }
    case 'fullName':
      return {
        OR: [
          { firstName: within(query.firstName), lastName: within(query.lastName) },
          { firstName: within(query.lastName), lastName: within(query.firstName) },
        ],
      }
  }
}

/**
 * Takes a *getter* rather than a client so that building a `Db` stays free of
 * I/O and configuration. The client — and with it the DATABASE_URL check — is
 * resolved on the first query, not when the repository is constructed.
 */
export function createPatientRepository(getClient: () => PrismaClient): PatientRepository {
  /**
   * The patients with a visit on a clinic calendar day. Visits are instants;
   * the day boundary is the clinic's, not the server's, so the comparison
   * happens in SQL against the named zone rather than in JS against
   * whatever `TZ` the process runs under (ADR 18). The id list is small — a
   * day's worth of visits — and it lets the rest of the search stay a
   * single Prisma query.
   */
  async function patientIdsSeenOn(day: string): Promise<string[]> {
    // The column is `timestamp` without zone holding UTC instants (Prisma's
    // default), so it is first declared UTC and only then shifted into the
    // clinic's zone — a single AT TIME ZONE on a zoneless column would read
    // the stored value as already local and shift it the wrong way.
    const rows = await getClient().$queryRaw<{ patientId: string }[]>`
      SELECT DISTINCT "patientId"
      FROM "visits"
      WHERE (("dateOfService" AT TIME ZONE 'UTC') AT TIME ZONE ${CLINIC_TIME_ZONE})::date = ${day}::date
    `
    return rows.map((row) => row.patientId)
  }

  return {
    async findById(id) {
      const row = await getClient().patient.findUnique({ where: { id } })
      return row === null ? null : toPatient(row)
    },

    async search(input) {
      const seenOn = input.serviceDate === undefined ? undefined : await patientIdsSeenOn(input.serviceDate)
      const rows = await getClient().patient.findMany({
        where: {
          ...whereForQuery(input.query),
          ...(input.dateOfBirth === undefined ? {} : { dateOfBirth: new Date(input.dateOfBirth) }),
          ...(seenOn === undefined ? {} : { id: { in: seenOn } }),
        },
        orderBy: ROSTER_ORDER,
        take: SEARCH_LIMIT,
      })
      return rows.map(toPatient)
    },

    async suggest(input) {
      const rows = await getClient().patient.findMany({
        where: whereForQuery(input.query),
        orderBy: ROSTER_ORDER,
        take: SUGGEST_LIMIT,
      })
      return rows.map(toPatient)
    },

    async searchByName(input) {
      // "Lastname" or "Lastname, Firstname" — the legacy picker's convention.
      const [lastName = '', firstName = ''] = input.name.split(',').map((part) => part.trim())
      const rows = await getClient().patient.findMany({
        where: {
          lastName: { contains: lastName, mode: 'insensitive' },
          ...(firstName === '' ? {} : { firstName: { contains: firstName, mode: 'insensitive' } }),
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: PICKER_LIMIT,
      })
      return rows.map(toPatient)
    },

    async create(input) {
      const row = await getClient().patient.create({ data: toWriteData(input) })
      return toPatient(row)
    },

    async update(input) {
      const { id, ...rest } = input
      const row = await getClient().patient.update({ where: { id }, data: toWriteData(rest) })
      return toPatient(row)
    },

    async setStatus(input) {
      // Deliberately its own write, not a variant of `update`: the legacy UI's
      // activate/deactivate action changed status and nothing else. No screen
      // calls it since DIA-50; it stays because the column does.
      const row = await getClient().patient.update({
        where: { id: input.id },
        data: { status: input.status },
      })
      return toPatient(row)
    },
  }
}
