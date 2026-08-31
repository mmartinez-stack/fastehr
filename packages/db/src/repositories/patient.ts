import type {
  CreatePatientInput,
  Patient,
  SearchPatientsByNameInput,
  SearchPatientsInput,
  SetPatientStatusInput,
  UpdatePatientInput,
} from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toPatient } from '../mappers/patient.ts'

/**
 * Patient reads and writes — the query set ported from the legacy patient
 * endpoints (docs/legacy-data-mapping.md § patients): list/search/save, no
 * delete (the legacy system disabled patient deletion, and so does this one).
 *
 * The interface is declared in terms of `@fastehr/contracts` types only: no
 * `Prisma.PatientWhereInput`, no `Decimal`, no `select` objects. A consumer
 * cannot express a query in Prisma's vocabulary through this API, which is what
 * stops persistence concepts from leaking upward one convenience argument at a
 * time.
 */
export interface PatientRepository {
  findById(id: string): Promise<Patient | null>
  listByLastName(): Promise<Patient[]>
  /** The default roster view — legacy `GET /patients` was the 30 most recent. */
  listRecent(): Promise<Patient[]>
  /** The single-input roster search (ADR 27): exact, case-insensitive, capped. */
  search(input: SearchPatientsInput): Promise<Patient[]>
  /** The referred-by picker — legacy `/patients/search`, substring on names. */
  searchByName(input: SearchPatientsByNameInput): Promise<Patient[]>
  create(input: CreatePatientInput): Promise<Patient>
  update(input: UpdatePatientInput): Promise<Patient>
  setStatus(input: SetPatientStatusInput): Promise<Patient>
}

/** The legacy list/search caps, kept: 30 rows for lists, 100 for a search. */
const LIST_LIMIT = 30
const SEARCH_LIMIT = 100

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
 * Takes a *getter* rather than a client so that building a `Db` stays free of
 * I/O and configuration. The client — and with it the DATABASE_URL check — is
 * resolved on the first query, not when the repository is constructed.
 */
export function createPatientRepository(getClient: () => PrismaClient): PatientRepository {
  return {
    async findById(id) {
      const row = await getClient().patient.findUnique({ where: { id } })
      return row === null ? null : toPatient(row)
    },

    async listByLastName() {
      const rows = await getClient().patient.findMany({
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
      return rows.map(toPatient)
    },

    async listRecent() {
      const rows = await getClient().patient.findMany({
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
      })
      return rows.map(toPatient)
    },

    async search(input) {
      // The contract already decided which field the query means (ADR 27);
      // this only translates each interpretation into a where clause, ANDed
      // with the separate date-of-birth filter when present.
      // Exact-but-case-insensitive name matching is the legacy behavior
      // (its UI anchored `^value$` with the `i` flag) — a roster search
      // finds "smith" for "Smith", not every name containing it.
      const query = input.query
      const insensitive = (value: string) => ({ equals: value, mode: 'insensitive' as const })
      const byQuery =
        query === undefined
          ? {}
          : query.kind === 'phone'
            ? { phone: query.phone }
            : query.kind === 'name'
              ? // One word — the searcher didn't say which name it is.
                { OR: [{ firstName: insensitive(query.name) }, { lastName: insensitive(query.name) }] }
              : // Both orientations: exact matching makes the extra arm free,
                // and "Lovelace Ada" typed without the comma still lands.
                {
                  OR: [
                    { firstName: insensitive(query.firstName), lastName: insensitive(query.lastName) },
                    { firstName: insensitive(query.lastName), lastName: insensitive(query.firstName) },
                  ],
                }
      const rows = await getClient().patient.findMany({
        where: {
          ...byQuery,
          ...(input.dateOfBirth === undefined ? {} : { dateOfBirth: new Date(input.dateOfBirth) }),
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: SEARCH_LIMIT,
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
        take: LIST_LIMIT,
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
      // activate/deactivate action changed status and nothing else.
      const row = await getClient().patient.update({
        where: { id: input.id },
        data: { status: input.status },
      })
      return toPatient(row)
    },
  }
}
