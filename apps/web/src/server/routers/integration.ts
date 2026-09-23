import { rotateIntegrationKeyInput } from '@fastehr/contracts'
import { mintIntegrationKey, rotateOwnKey } from '../integration-keys.ts'
import { integrationProcedure } from '../procedures.ts'
import { router } from '../trpc.ts'

/**
 * The partner account's own view (ADR 36 as amended): the integration the
 * signed-in principal *is*, with its keys as the Users screen lists them,
 * and the one write it may make, replacing a key of its own. The actor's id
 * is the principal's row, so nothing is looked up by input that another
 * account could name.
 */
export const integrationRouter = router({
  mine: integrationProcedure.query(({ ctx }) => ctx.db.integrations.find(ctx.actor.id)),

  /** Replaces one of the account's keys with a copy; the new key is in the answer, once. */
  rotateKey: integrationProcedure
    .input(rotateIntegrationKeyInput)
    .mutation(({ ctx, input }) => rotateOwnKey(ctx.db, mintIntegrationKey, { integrationId: ctx.actor.id, keyId: input.keyId })),
})
