import { patientSchema } from '@fastehr/contracts'
import { patientDisplayName } from '@fastehr/core'
import { protectedProcedure, publicProcedure } from '../procedures.ts'
import { router } from '../trpc.ts'
import { patientRouter } from './patient.ts'
import { staffUserRouter } from './staff-user.ts'

/**
 * Root router — framework-agnostic. It knows nothing about Next.js, HTTP
 * framing, or how the actor was authenticated; all of that arrives through
 * `Context`.
 *
 * Domain routers get their own file in this directory and are merged in here,
 * so this file stays a table of contents rather than a place procedures
 * accumulate.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),

  patient: patientRouter,

  staffUsers: staffUserRouter,

  patientDisplayName: protectedProcedure
    .input(patientSchema.pick({ firstName: true, lastName: true }))
    .query(({ input }) => patientDisplayName(input)),
})

/** Consumed by clients for end-to-end type inference. */
export type AppRouter = typeof appRouter
