import { integrationProcedure } from '../procedures.ts'
import { router } from '../trpc.ts'

/**
 * The partner account's own view (ADR 36 as amended): the integration the
 * signed-in principal *is*, with its keys as the Users screen lists them,
 * never a key itself. The actor's id is the principal's row, so there is
 * nothing to look up by input and nothing another account could ask for.
 */
export const integrationRouter = router({
  mine: integrationProcedure.query(({ ctx }) => ctx.db.integrations.find(ctx.actor.id)),
})
