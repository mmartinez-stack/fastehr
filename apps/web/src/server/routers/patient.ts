import {
  createPatientInput,
  patientBillingSchema,
  patientChartSchema,
  patientDemographicsSchema,
  patientSchema,
  searchPatientsByNameInput,
  searchPatientsInput,
  setPatientStatusInput,
  suggestPatientsInput,
  updatePatientBillingInput,
  updatePatientClinicalInput,
  updatePatientDemographicsInput,
  type PatientSummary,
} from '@fastehr/contracts'
import { TRPCError } from '@trpc/server'
import type { Actor } from '../context.ts'
import { isClerical } from '../middleware/auth.ts'
import { clericalProcedure, protectedProcedure } from '../procedures.ts'
import { router } from '../trpc.ts'

/**
 * Patient reads and writes, by section (ADR 28).
 *
 * The record is served in pieces because the pieces have different readers:
 * every role gets the header and the clinical half (`byId`), only the clerical
 * roles get demographics and billing, and each section has its own update so
 * a provider's save cannot carry a phone number. Redaction happens here, on
 * the server, by parsing the repository's full record through the section
 * schema — a Zod object strips what it does not declare — so a client cannot
 * ask for more than its role's section.
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

/**
 * The roster's phone column is clerical. Nulled before the rows leave the
 * server for a provider, so the redaction is not something the client decides.
 */
function forRoster(rows: PatientSummary[], actor: Actor): PatientSummary[] {
  return isClerical(actor) ? rows : rows.map((row) => ({ ...row, phone: null }))
}

export const patientRouter = router({
  /** The header plus the clinical half — what every role may read. */
  byId: protectedProcedure
    .input(patientSchema.pick({ id: true }))
    .query(async ({ ctx, input }) => {
      const patient = await ctx.db.patients.findById(input.id)
      return patient === null ? null : patientChartSchema.parse(patient)
    }),

  /** The clerical section: contact details, address, referral, program. */
  demographics: clericalProcedure
    .input(patientSchema.pick({ id: true }))
    .query(async ({ ctx, input }) => {
      const patient = await ctx.db.patients.findById(input.id)
      return patient === null ? null : patientDemographicsSchema.parse(patient)
    }),

  /** The billing section, isolated: the provisional card block, clerical only. */
  billing: clericalProcedure
    .input(patientSchema.pick({ id: true }))
    .query(async ({ ctx, input }) => {
      const patient = await ctx.db.patients.findById(input.id)
      return patient === null ? null : patientBillingSchema.parse(patient)
    }),

  /** The roster's default view — the legacy queue's "30 most recently seen". */
  recent: protectedProcedure.query(async ({ ctx }) =>
    forRoster(await ctx.db.patients.listRecent(), ctx.actor),
  ),

  /**
   * The roster search (legacy `/patients/find`, minus the raw Mongo query).
   * There is no unfiltered `list` (DIA-59): the input refuses an empty
   * search, and `recent` is capped, so the whole table is never served.
   */
  search: protectedProcedure
    .input(searchPatientsInput)
    .query(async ({ ctx, input }) => forRoster(await ctx.db.patients.search(input), ctx.actor)),

  /** The roster's type-ahead — a search, a few rows deep. */
  suggest: protectedProcedure
    .input(suggestPatientsInput)
    .query(async ({ ctx, input }) => forRoster(await ctx.db.patients.suggest(input), ctx.actor)),

  /** The referred-by-patient picker (legacy `/patients/search`). */
  searchByName: protectedProcedure
    .input(searchPatientsByNameInput)
    .query(async ({ ctx, input }) =>
      forRoster(await ctx.db.patients.searchByName(input), ctx.actor),
    ),

  /**
   * Creating a record is clerical: it needs the demographics a provider never
   * sees. The same `createPatientInput` the browser form validates with runs
   * again here — the client parse is courtesy, this one is the contract. A
   * failure leaves as issue codes through the errorFormatter (ADR 12).
   */
  create: clericalProcedure
    .input(createPatientInput)
    .mutation(async ({ ctx, input }) => patientChartSchema.parse(await ctx.db.patients.create(input))),

  updateDemographics: clericalProcedure
    .input(updatePatientDemographicsInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.patients.updateDemographics(input)
      if (updated === null) throw new TRPCError({ code: 'NOT_FOUND' })
      return patientChartSchema.parse(updated)
    }),

  /** The provider's section, open to every role. */
  updateClinical: protectedProcedure
    .input(updatePatientClinicalInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.patients.updateClinical(input)
      if (updated === null) throw new TRPCError({ code: 'NOT_FOUND' })
      return patientChartSchema.parse(updated)
    }),

  updateBilling: clericalProcedure
    .input(updatePatientBillingInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.patients.updateBilling(input)
      if (updated === null) throw new TRPCError({ code: 'NOT_FOUND' })
      return patientChartSchema.parse(updated)
    }),

  /**
   * Activate/deactivate, apart from the updates on purpose: the legacy UI
   * made status its own action. No screen calls it since DIA-50; it stays
   * because the column does. There is no delete — the legacy system disabled
   * patient deletion, and this one never grows it.
   */
  setStatus: protectedProcedure
    .input(setPatientStatusInput)
    .mutation(async ({ ctx, input }) =>
      patientChartSchema.parse(await ctx.db.patients.setStatus(input)),
    ),
})
