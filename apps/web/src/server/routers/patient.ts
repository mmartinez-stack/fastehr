import { patientSchema } from '@fastehr/contracts'
import { protectedProcedure } from '../procedures.ts'
import { router } from '../trpc.ts'

/**
 * Patient reads. The first router that touches data, and the shape the rest
 * follow.
 *
 * Two things it demonstrates as much as implements:
 *
 * - **Data arrives through `ctx.db`, never an import.** `@fastehr/db` is
 *   unreachable from here by lint rule and, more usefully, unnecessary: the
 *   repositories are on the context, so a caller decides which ones — the real
 *   ones, a transaction-scoped set, or fakes in a test.
 * - **The input schema comes from `@fastehr/contracts`.** `apps/web` has no Zod
 *   of its own (ADR 5), so a procedure cannot invent a shape the contract does
 *   not already describe.
 */
export const patientRouter = router({
  byId: protectedProcedure
    .input(patientSchema.pick({ id: true }))
    .query(({ ctx, input }) => ctx.db.patients.findById(input.id)),

  list: protectedProcedure.query(({ ctx }) => ctx.db.patients.listByLastName()),
})
