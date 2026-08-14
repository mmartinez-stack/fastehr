import type { Patient } from '@fastehr/contracts'
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
}

export function createPatientRepository(prisma: PrismaClient): PatientRepository {
  return {
    async findById(id) {
      const row = await prisma.patient.findUnique({ where: { id } })
      return row === null ? null : toPatient(row)
    },

    async listByLastName() {
      const rows = await prisma.patient.findMany({
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
      return rows.map(toPatient)
    },
  }
}
