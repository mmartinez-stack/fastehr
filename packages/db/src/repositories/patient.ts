import {
  CLINIC_TIME_ZONE,
  type CreatePatientInput,
  type Patient,
  type PatientLookupCriteria,
  type PatientLookupRow,
  type PatientSearchInterpretation,
  type PatientSummary,
  type SearchPatientsByNameInput,
  type SearchPatientsInput,
  type SetPatientStatusInput,
  type SuggestPatientsInput,
  type UpdatePatientBillingInput,
  type UpdatePatientClinicalInput,
  type UpdatePatientDemographicsInput,
  resolveLegacyOffice,
} from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toPatient, toPatientLookupRow, toPatientSummary } from '../mappers/patient.ts'

/**
 * Patient reads and writes — the query set ported from the legacy patient
 * endpoints (docs/legacy-data-mapping.md § patients): search/save, no delete
 * (the legacy system disabled patient deletion, and so does this one). The
 * only read that takes no criterion is `listRecent`, capped at the legacy 30:
 * the whole table is never served.
 *
 * Writes are per section since DIA-52 (ADR 28): demographics, clinical, and
 * billing each have their own update, because each is a different role's to
 * make. The repository does not check roles — the server layer does — but
 * the shape of the API is what makes a section-scoped procedure unable to
 * write outside its section by accident.
 *
 * The interface is declared in terms of `@fastehr/contracts` types only: no
 * `Prisma.PatientWhereInput`, no `Decimal`, no `select` objects. A consumer
 * cannot express a query in Prisma's vocabulary through this API, which is what
 * stops persistence concepts from leaking upward one convenience argument at a
 * time.
 */
export interface PatientRepository {
  /** The whole record, child lists included — one read, one patient. */
  findById(id: string): Promise<Patient | null>
  /** The roster's default view — legacy `GET /patients`: the 30 most recently seen. */
  listRecent(): Promise<PatientSummary[]>
  /** The roster search (ADR 27, amended): substring names, exact phone, two calendar days; capped. */
  search(input: SearchPatientsInput): Promise<PatientSummary[]>
  /** The roster's type-ahead: the same interpretation, a few rows deep. */
  suggest(input: SuggestPatientsInput): Promise<PatientSummary[]>
  /** The referred-by picker — legacy `/patients/search`, substring on names. */
  searchByName(input: SearchPatientsByNameInput): Promise<PatientSummary[]>
  create(input: CreatePatientInput): Promise<Patient>
  updateDemographics(input: UpdatePatientDemographicsInput): Promise<Patient | null>
  /**
   * Replaces the medication list and the checklist wholesale — the form
   * submits the whole section, the history text included (a cleared box
   * clears the column).
   */
  updateClinical(input: UpdatePatientClinicalInput): Promise<Patient | null>
  updateBilling(input: UpdatePatientBillingInput): Promise<Patient | null>
  setStatus(input: SetPatientStatusInput): Promise<Patient>
  /**
   * The partner lookup (ADR 37): exact, case-insensitive matches on the
   * identifiers given, restricted to the clinics the key may see. Not the
   * roster's substring search; a partner API is not a browse tool.
   */
  lookup(criteria: PatientLookupCriteria): Promise<PatientLookupRow[]>
}

/**
 * The legacy caps, kept: 30 rows for the default list and the picker, 100
 * for a search. The type-ahead shows a handful — it is for jumping to a
 * record, not reading a list.
 */
const LIST_LIMIT = 30
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

/** The child lists: medications in the order entered, the checklist by key. */
const RECORD_INCLUDE = {
  medications: { orderBy: { position: 'asc' as const } },
  conditions: { orderBy: { condition: 'asc' as const } },
}

/**
 * Section → columns, one definition per section shared by create and update
 * so the two writes cannot drift. Absent optional fields store NULL — an
 * update that clears a field really clears it.
 */
function demographicsData(input: Omit<UpdatePatientDemographicsInput, 'id'>) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    // A date-only ISO string parses as UTC midnight, which is exactly
    // what a `@db.Date` column stores — the inverse of the mapper's
    // `toCalendarDate`, and like it, deliberately not local time.
    dateOfBirth: new Date(input.dateOfBirth),
    gender: input.gender,
    language: input.language ?? null,
    office: input.office ?? null,
    // The clinic the office names, kept consistent with the backfill (ADR
    // 32); a remote pseudo-office or no office is no clinic.
    locationId: resolveLegacyOffice(input.office)?.locationSlug ?? null,
    email: input.email ?? null,
    addressStreet: input.addressStreet,
    addressCity: input.addressCity,
    addressState: input.addressState,
    addressZip: input.addressZip,
    phone: input.phone,
    phoneFollowUpAllowed: input.phoneFollowUpAllowed,
    referralSource: input.referralSource ?? null,
    referredByPatientId: input.referredByPatientId ?? null,
    programType: input.programType ?? null,
  }
}

function clinicalScalars(input: Omit<UpdatePatientClinicalInput, 'id'>) {
  return {
    heightInches: input.heightInches,
    pcpName: input.pcpName ?? null,
    pcpAddress: input.pcpAddress ?? null,
    pcpPhone: input.pcpPhone ?? null,
    historyOther: input.historyOther ?? null,
  }
}

/** The child lists as nested creates; `position` is the order the form had the medications in. */
function clinicalLists(input: Omit<UpdatePatientClinicalInput, 'id'>) {
  return {
    medications: input.medications.map((row, position) => ({
      name: row.name,
      dose: row.dose ?? null,
      frequency: row.frequency ?? null,
      position,
    })),
    conditions: input.conditions.map((row) => ({
      condition: row.condition,
      onset: row.onset ?? null,
      treatedBy: row.treatedBy ?? null,
      medicated: row.medicated,
      medications: row.medications ?? null,
    })),
  }
}

function billingData(input: Omit<UpdatePatientBillingInput, 'id'>) {
  return {
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

  async function exists(id: string): Promise<boolean> {
    return (await getClient().patient.count({ where: { id } })) > 0
  }

  return {
    async findById(id) {
      const row = await getClient().patient.findUnique({ where: { id }, include: RECORD_INCLUDE })
      return row === null ? null : toPatient(row)
    },

    async lookup(criteria) {
      const hasIdentifier =
        criteria.patientId !== undefined ||
        criteria.dateOfBirth !== undefined ||
        criteria.phone !== undefined ||
        criteria.lastName !== undefined
      // The contract refuses an empty lookup; this is the repository's own
      // refusal to ever run an unfiltered scan should a caller bypass it.
      if (!hasIdentifier) return []

      const exact = (value: string) => ({ equals: value, mode: 'insensitive' as const })
      const rows = await getClient().patient.findMany({
        where: {
          ...(criteria.patientId === undefined ? {} : { id: criteria.patientId }),
          ...(criteria.dateOfBirth === undefined ? {} : { dateOfBirth: new Date(criteria.dateOfBirth) }),
          ...(criteria.phone === undefined ? {} : { phone: criteria.phone }),
          ...(criteria.lastName === undefined ? {} : { lastName: exact(criteria.lastName) }),
          ...(criteria.firstName === undefined ? {} : { firstName: exact(criteria.firstName) }),
          ...(criteria.locationIds.length === 0 ? {} : { locationId: { in: [...criteria.locationIds] } }),
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take: criteria.limit,
      })
      return rows.map(toPatientLookupRow)
    },

    async listRecent() {
      // Legacy `GET /patients` sorted by `recentVisit` descending — the
      // patients most recently *seen*, which `lastVisitAt` carries.
      const rows = await getClient().patient.findMany({
        orderBy: ROSTER_ORDER,
        take: LIST_LIMIT,
      })
      return rows.map(toPatientSummary)
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
      return rows.map(toPatientSummary)
    },

    async suggest(input) {
      const rows = await getClient().patient.findMany({
        where: whereForQuery(input.query),
        orderBy: ROSTER_ORDER,
        take: SUGGEST_LIMIT,
      })
      return rows.map(toPatientSummary)
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
      return rows.map(toPatientSummary)
    },

    async create(input) {
      const lists = clinicalLists(input)
      const row = await getClient().patient.create({
        data: {
          ...demographicsData(input),
          ...clinicalScalars(input),
          ...billingData(input),
          medications: { create: lists.medications },
          conditions: { create: lists.conditions },
        },
        include: RECORD_INCLUDE,
      })
      return toPatient(row)
    },

    async updateDemographics(input) {
      const { id, ...rest } = input
      if (!(await exists(id))) return null
      const row = await getClient().patient.update({
        where: { id },
        data: demographicsData(rest),
        include: RECORD_INCLUDE,
      })
      return toPatient(row)
    },

    async updateClinical(input) {
      const { id, ...rest } = input
      if (!(await exists(id))) return null
      const lists = clinicalLists(rest)
      // One statement: the scalars and a delete-then-create of each list,
      // atomic under Prisma's nested write. A partially replaced medication
      // list is exactly the kind of record that cannot be allowed to exist.
      const row = await getClient().patient.update({
        where: { id },
        data: {
          ...clinicalScalars(rest),
          medications: { deleteMany: {}, create: lists.medications },
          conditions: { deleteMany: {}, create: lists.conditions },
        },
        include: RECORD_INCLUDE,
      })
      return toPatient(row)
    },

    async updateBilling(input) {
      const { id, ...rest } = input
      if (!(await exists(id))) return null
      const row = await getClient().patient.update({
        where: { id },
        data: billingData(rest),
        include: RECORD_INCLUDE,
      })
      return toPatient(row)
    },

    async setStatus(input) {
      // Deliberately its own write, not a variant of an update: the legacy
      // UI's activate/deactivate action changed status and nothing else. No
      // screen calls it since DIA-50; it stays because the column does.
      const row = await getClient().patient.update({
        where: { id: input.id },
        data: { status: input.status },
        include: RECORD_INCLUDE,
      })
      return toPatient(row)
    },
  }
}
