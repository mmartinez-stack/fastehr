import {
  createStaffUserInput,
  setStaffUserActiveInput,
  updateStaffUserInput,
} from '@fastehr/contracts'
import { StaffUserEmailTakenError } from '@fastehr/db'
import { TRPCError } from '@trpc/server'
import { adminProcedure } from '../procedures.ts'
import { router } from '../trpc.ts'

/**
 * Staff account administration. Every procedure is admin-gated, and every
 * input shape comes from `@fastehr/contracts` — the screen cannot ask for
 * anything the contract does not describe (ADR 5).
 *
 * Credentials are absent on purpose: creating a user here creates an account
 * that cannot sign in until an admin issues a temporary password through the
 * runbook path. There is no delete — deactivation only — because the legacy
 * system's hard deletes orphaned 38,047 clinical signatures.
 */
export const staffUserRouter = router({
  list: adminProcedure.query(({ ctx }) => ctx.db.staffUsers.list()),

  create: adminProcedure.input(createStaffUserInput).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.staffUsers.create(input)
    } catch (error) {
      if (error instanceof StaffUserEmailTakenError) {
        throw new TRPCError({ code: 'CONFLICT', message: 'email already in use' })
      }
      throw error
    }
  }),

  update: adminProcedure.input(updateStaffUserInput).mutation(async ({ ctx, input }) => {
    const updated = await ctx.db.staffUsers.update(input)
    if (updated === null) throw new TRPCError({ code: 'NOT_FOUND' })
    return updated
  }),

  setActive: adminProcedure.input(setStaffUserActiveInput).mutation(async ({ ctx, input }) => {
    if (input.id === ctx.actor.id && !input.isActive) {
      // An admin locking themself out mid-session is never what was meant —
      // and a clinic must not end up with zero admins by one misclick.
      throw new TRPCError({ code: 'FORBIDDEN', message: 'cannot deactivate your own account' })
    }
    const updated = await ctx.db.staffUsers.setActive(input)
    if (updated === null) throw new TRPCError({ code: 'NOT_FOUND' })
    return updated
  }),
})
