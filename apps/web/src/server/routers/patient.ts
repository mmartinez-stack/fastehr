import {
  createPatientInput,
  patientSchema,
  searchPatientsByNameInput,
  searchPatientsInput,
  setPatientStatusInput,
  suggestPatientsInput,
  updatePatientInput,
} from '@fastehr/contracts'
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

  /**
   * The roster search (legacy `/patients/find`, minus the raw Mongo query).
   * There is no unfiltered list and no "recent" default any more (DIA-59):
   * the input refuses an empty search, so the whole table is never served.
   */
  search: protectedProcedure
    .input(searchPatientsInput)
    .query(({ ctx, input }) => ctx.db.patients.search(input)),

  /** The roster's type-ahead — a search, a few rows deep. */
  suggest: protectedProcedure
    .input(suggestPatientsInput)
    .query(({ ctx, input }) => ctx.db.patients.suggest(input)),

  /** The referred-by-patient picker (legacy `/patients/search`). */
  searchByName: protectedProcedure
    .input(searchPatientsByNameInput)
    .query(({ ctx, input }) => ctx.db.patients.searchByName(input)),

  /**
   * The first write, and the reference for the rest (docs/forms.md). The same
   * `createPatientInput` the browser form validates with runs again here — the
   * client parse is courtesy, this one is the contract. A failure leaves as
   * issue codes through the errorFormatter, never as messages (ADR 12).
   */
  create: protectedProcedure
    .input(createPatientInput)
    .mutation(({ ctx, input }) => ctx.db.patients.create(input)),

  update: protectedProcedure
    .input(updatePatientInput)
    .mutation(({ ctx, input }) => ctx.db.patients.update(input)),

  /**
   * Activate/deactivate, apart from `update` on purpose: the legacy UI made
   * status its own action, and keeping it out of the form input means an edit
   * in one tab can never silently re-activate a record deactivated in another.
   * There is no delete — the legacy system disabled patient deletion, and this
   * one never grows it.
   */
  setStatus: protectedProcedure
    .input(setPatientStatusInput)
    .mutation(({ ctx, input }) => ctx.db.patients.setStatus(input)),
})
