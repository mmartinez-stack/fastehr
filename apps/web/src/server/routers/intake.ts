import { createHash, randomBytes } from 'node:crypto'
import {
  acceptIntakeInput,
  INTAKE_LINK_TTL_DAYS,
  intakeByIdInput,
  intakeInviteSchema,
  openIntakeInput,
  patientChartSchema,
  sendPatientIntakeInput,
  submitIntakeInput,
  type IntakeRequest,
} from '@fastehr/contracts'
import { TRPCError } from '@trpc/server'
import {
  clericalOfficeScopedProcedure,
  clericalProcedure,
  publicProcedure,
} from '../procedures.ts'
import { router } from '../trpc.ts'

/**
 * Self-service intake (DIA-72, ADR 29).
 *
 * Three audiences, three procedure kinds. The front desk sends a link and
 * reviews what comes back (`clericalProcedure`, the office queue additionally
 * scoped to the actor's sites). The person with the link opens and submits
 * the form (`publicProcedure`: they have no account, and the token *is* the
 * credential — single-use, expiring, bound to one request). Nobody else has
 * a part.
 *
 * The token is 32 random bytes; the server stores its SHA-256 and compares
 * hashes, so a read of the table cannot produce a working link and the token
 * exists only in the text message and the URL.
 */

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * The text, in the language the front desk chose. Plain sentences and one
 * link; no patient detail beyond the person's own first name.
 */
function intakeMessage(firstName: string, language: 'english' | 'spanish', link: string): string {
  return language === 'spanish'
    ? `Hola ${firstName}, por favor complete su información de paciente en el siguiente enlace (válido por ${INTAKE_LINK_TTL_DAYS} días): ${link}`
    : `Hi ${firstName}, please fill out your patient information at the following link (valid for ${INTAKE_LINK_TTL_DAYS} days): ${link}`
}

/** A request the public page may still act on: sent, and not yet expired. */
function isOpen(request: IntakeRequest, now: Date): boolean {
  return request.status === 'sent' && new Date(request.expiresAt) > now
}

export const intakeRouter = router({
  /**
   * The legacy "Send Intake Form" panel, now sending. Creates the request,
   * texts the link, returns the request (never the token).
   */
  send: clericalProcedure.input(sendPatientIntakeInput).mutation(async ({ ctx, input }) => {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + INTAKE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000)
    const request = await ctx.db.intakes.create({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      language: input.language,
      tokenHash: hashToken(token),
      expiresAt,
      createdById: ctx.actor.id,
    })
    const link = `${ctx.appBaseUrl().replace(/\/$/, '')}/intake/${token}`
    await ctx.sms.send({
      to: input.phone,
      body: intakeMessage(input.firstName, input.language ?? 'english', link),
    })
    return request
  }),

  /** What the public page learns from a link: the person's name and language, or a refusal. */
  open: publicProcedure.input(openIntakeInput).query(async ({ ctx, input }) => {
    const request = await ctx.db.intakes.findByTokenHash(hashToken(input.token))
    // One answer for "no such token", "already used", and "expired": the
    // page tells the person to ask the clinic for a new link, and a probe
    // learns nothing about which it was.
    if (request === null || !isOpen(request, new Date())) throw new TRPCError({ code: 'NOT_FOUND' })
    return intakeInviteSchema.parse(request)
  }),

  /** The person's submission — one per link. */
  submit: publicProcedure.input(submitIntakeInput).mutation(async ({ ctx, input }) => {
    const { token, ...submission } = input
    const tokenHash = hashToken(token)
    const request = await ctx.db.intakes.findByTokenHash(tokenHash)
    if (request === null || !isOpen(request, new Date())) throw new TRPCError({ code: 'NOT_FOUND' })
    // The conditional write is the real guard: a second submit that raced
    // past the check above finds the status already moved and gets null.
    const submitted = await ctx.db.intakes.submit({ tokenHash, submission })
    if (submitted === null) throw new TRPCError({ code: 'NOT_FOUND' })
    return { status: submitted.status }
  }),

  /** The office's Pending queue — the front desk's, for the sites they hold. */
  listPending: clericalOfficeScopedProcedure.query(({ ctx, input }) =>
    ctx.db.intakes.listPending(input.office),
  ),

  byId: clericalProcedure.input(intakeByIdInput).query(async ({ ctx, input }) => {
    const request = await ctx.db.intakes.findById(input.id)
    if (request === null) throw new TRPCError({ code: 'NOT_FOUND' })
    if (!ctx.actor.offices.includes(request.office as (typeof ctx.actor.offices)[number])) {
      // A request that has an office belongs to that office's queue (ADR 22).
      throw new TRPCError({ code: 'FORBIDDEN' })
    }
    return request
  }),

  /** Accept: the reviewed form becomes a patient record, and the request leaves the queue. */
  accept: clericalProcedure.input(acceptIntakeInput).mutation(async ({ ctx, input }) => {
    const { id, ...patient } = input
    const outcome = await ctx.db.intakes.accept({
      id,
      patient: {
        ...patient,
        creditCardNumber: undefined,
        creditCardExpMonth: undefined,
        creditCardExpYear: undefined,
        creditCardZip: undefined,
      },
      reviewedById: ctx.actor.id,
    })
    if (outcome === null) {
      // Either no such request or one already reviewed — the queue moved on.
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'intake is not pending' })
    }
    return patientChartSchema.parse(outcome.patient)
  }),

  reject: clericalProcedure.input(intakeByIdInput).mutation(async ({ ctx, input }) => {
    const rejected = await ctx.db.intakes.reject({ id: input.id, reviewedById: ctx.actor.id })
    if (rejected === null) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'intake is not pending' })
    }
    return rejected
  }),
})
