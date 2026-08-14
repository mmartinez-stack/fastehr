import { describeValidationFailure } from '@fastehr/contracts'
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import type { Context } from './context.ts'

/**
 * The tRPC instance: transformer, error shape, and the primitives everything
 * else is built from.
 *
 * This file holds *only* the initialisation. Middlewares import `t` from here,
 * and `procedures.ts` composes them into `protectedProcedure` — which is what
 * keeps the graph acyclic. Putting the chain assembly here instead would make
 * every middleware import the module that imports it.
 *
 * Nothing in `src/server/**` may import `next/*`; see ADR 9.
 */

/**
 * `transformer` is not optional here, and the reason is the same one behind
 * ADR 3.
 *
 * Plain JSON has no `Date`. Without a transformer a procedure typed as
 * returning one hands the client a string while the inferred type still says
 * `Date` — the value type-checks perfectly at every call site and is wrong at
 * runtime. That is precisely the `Decimal` hazard ADR 3 describes, moved from
 * the ORM boundary to the transport boundary, and in this domain it lands on
 * dates of birth, appointment times, and dose timestamps.
 *
 * Contracts currently keep dates as ISO strings (`z.iso.date()`), so nothing
 * relies on this today — it is the guarantee that the first `z.date()` or bare
 * `new Date()` in a procedure result behaves the way its type promises.
 *
 * **Any client must configure the same transformer**, and in tRPC v11 it goes
 * on the link (`httpBatchLink` / `httpBatchStreamLink`), not the client root.
 * A caller built with `createCaller` — an Electron main process, a test —
 * never serialises at all and is unaffected.
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,

  /**
   * Input validation failures leave as field paths and issue codes, and the
   * message is replaced with a constant.
   *
   * tRPC's default `message` for a `BAD_REQUEST` from a Zod parse is the
   * serialised issue array — unreadable for a client, and a channel for any
   * message text the schema author wrote. Zod's own defaults do not quote the
   * offending value, but a hand-written
   * `.refine(…, \`invalid MRN: ${value}\`)` would, and an error payload ends up
   * in browser consoles, proxy logs, and error trackers. Replacing the message
   * with a constant and reducing the detail to paths and codes closes that
   * channel once, rather than relying on every future refinement being written
   * carefully.
   *
   * `describeValidationFailure` lives in `@fastehr/contracts` because decision
   * 5 keeps Zod out of this package.
   */
  errorFormatter({ shape, error }) {
    // `stack` is dropped from every error, not only validation failures.
    // Outside production tRPC puts the stack in the response, and a TRPCError
    // raised from a Zod parse carries the entire serialised issue array in its
    // message — so the text this formatter removes above comes straight back
    // through the stack, alongside absolute server paths. Stacks belong in the
    // server log, which still has them.
    const { stack: _stack, ...data } = shape.data
    const validation = describeValidationFailure(error.cause)

    if (validation === null) return { ...shape, data }

    return {
      ...shape,
      message: 'Invalid input',
      data: { ...data, validation },
    }
  },
})

export { t }
export const router = t.router
export const publicProcedure = t.procedure
