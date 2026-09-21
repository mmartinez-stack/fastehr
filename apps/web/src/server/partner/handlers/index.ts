import type { PartnerOperationById, PartnerOperationId } from '@fastehr/contracts'
import type { OperationHandler } from '../chain.ts'
import { lookupPatients, verifyPatient } from './patients.ts'
import { queueCount } from './queue.ts'

/**
 * The handler table (ADR 38). The mapped type ties it to the registry both
 * ways: an operation registered without a handler, or a handler for an id
 * the registry does not know, fails typecheck rather than 404ing in
 * production.
 */
export type PartnerHandlers = {
  readonly [Id in PartnerOperationId]: OperationHandler<PartnerOperationById<Id>>
}

export const PARTNER_HANDLERS: PartnerHandlers = {
  'patients.lookup': lookupPatients,
  'patients.verify': verifyPatient,
  'queue.count': queueCount,
}
