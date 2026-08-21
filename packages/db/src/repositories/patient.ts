import type { CreatePatientInput, Patient } from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toPatient } from '../mappers/patient.ts'

/**
 * Patient reads and writes. Seed surface — the real query set arrives with the
 * persistence ticket.
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
  create(input: CreatePatientInput): Promise<Patient>
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

    async create(input) {
      const row = await getClient().patient.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          // A date-only ISO string parses as UTC midnight, which is exactly
          // what a `@db.Date` column stores — the inverse of the mapper's
          // `toCalendarDate`, and like it, deliberately not local time.
          dateOfBirth: new Date(input.dateOfBirth),
          email: input.email ?? null,
          phone: input.phone ?? null,
        },
      })
      return toPatient(row)
    },
  }
}
