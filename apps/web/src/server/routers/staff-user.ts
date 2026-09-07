import {
  createStaffUserInput,
  deleteStaffUserInput,
  searchStaffUsersInput,
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
 * runbook path. `delete` is a hard delete behind an explicit confirmation in
 * the UI (legacy parity: DELETE /users/:id, admin-only); deactivation remains
 * the everyday removal, and the repository documents why delete must tighten
 * when clinical records arrive.
 */
export const staffUserRouter = router({
  list: adminProcedure.query(({ ctx }) => ctx.db.staffUsers.list()),

  /** The single-input search (ADR 27's pattern): `@` means email, else name. */
  search: adminProcedure
    .input(searchStaffUsersInput)
    .query(({ ctx, input }) => ctx.db.staffUsers.search(input)),

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

  delete: adminProcedure.input(deleteStaffUserInput).mutation(async ({ ctx, input }) => {
    if (input.id === ctx.actor.id) {
      // Same reasoning as setActive, with no way back at all: an admin must
      // not be able to remove themself, and the clinic must keep an admin.
      throw new TRPCError({ code: 'FORBIDDEN', message: 'cannot delete your own account' })
    }
    const deleted = await ctx.db.staffUsers.delete(input)
    if (deleted === null) throw new TRPCError({ code: 'NOT_FOUND' })
    return deleted
  }),
})
