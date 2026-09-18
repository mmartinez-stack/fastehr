import { protectedProcedure } from '../procedures.ts'
import { router } from '../trpc.ts'

/**
 * Locations (ADR 32): read-only, seeded rows. `listActive` is what the nav
 * selector offers; a report over history would list them all.
 */
export const locationRouter = router({
  /** Every clinic, inactive ones included: what a display name lookup over history needs. */
  list: protectedProcedure.query(({ ctx }) => ctx.db.locations.list()),
  listActive: protectedProcedure.query(({ ctx }) => ctx.db.locations.listActive()),
})
