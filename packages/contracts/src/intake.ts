import { z } from 'zod'
import { officeSchema } from './office.ts'
import {
  clinicalFields,
  composeClinical,
  demographicsFields,
  patientGenderSchema,
  patientLanguageSchema,
  patientOfficeSchema,
} from './patient.ts'

/**
 * Self-service intake (DIA-72, ADR 29).
 *
 * The front desk texts a person a link; the person fills the patient form on
 * their phone and picks the office they will visit; the submission waits in
 * that office's Pending queue until the front desk reviews it and accepts it
 * into a patient record, or rejects it.
 *
 * The link carries a **single-use, expiring token bound to the request** —
 * never a patient id, because no patient exists yet. The token itself is
 * only ever in the text message and the URL; the server stores its hash.
 *
 * The submission is stored as the *normalized* form (the same shape
 * `createPatientInput` emits, minus billing), so accepting it is one patient
 * create with nothing to reinterpret, and the review screen prefills from it
 * the way the edit screen prefills from a record.
 */

export const INTAKE_STATUSES = ['sent', 'submitted', 'accepted', 'rejected'] as const
export const intakeStatusSchema = z.enum(INTAKE_STATUSES)
export type IntakeStatus = z.infer<typeof intakeStatusSchema>

/** How long a texted link works. A week covers "I'll do it at home tonight" with room to spare. */
export const INTAKE_LINK_TTL_DAYS = 7

const optionalText = z.string().optional()

/**
 * What a submission looks like once stored: the demographics and clinical
 * sections as the contract normalizes them (trimmed, phone as ten digits,
 * height as total inches), plus the office the person chose. Optional fields
 * are absent, not null — this is JSON written from a parsed input, and the
 * patient create takes the same shape back. A Zod object strips what it does
 * not declare, so a submission stored under an earlier cut of the form (with
 * an allergy list) still reads back.
 */
export const intakeSubmissionSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: patientGenderSchema,
  dateOfBirth: z.iso.date(),
  language: patientLanguageSchema.optional(),
  office: patientOfficeSchema,
  email: optionalText,
  addressStreet: z.string(),
  addressCity: z.string(),
  addressState: z.string(),
  addressZip: z.string(),
  phone: z.string().regex(/^\d{10}$/),
  phoneFollowUpAllowed: z.boolean(),
  referralSource: optionalText,
  referredByPatientId: optionalText,
  programType: optionalText,
  heightInches: z.number(),
  medications: z.array(z.object({ name: z.string(), dose: optionalText, frequency: optionalText })),
  // Defaulted: a submission stored before the checklist returned reads back as all "No".
  conditions: z
    .array(
      z.object({
        condition: z.string(),
        onset: optionalText,
        treatedBy: optionalText,
        medicated: z.boolean(),
        medications: optionalText,
      }),
    )
    .default([]),
  pcpName: optionalText,
  pcpAddress: optionalText,
  pcpPhone: optionalText,
})
export type IntakeSubmission = z.infer<typeof intakeSubmissionSchema>

/** The request as the front desk sees it in the queue. The token hash never leaves the database. */
export const intakeRequestSchema = z.object({
  id: z.uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().regex(/^\d{10}$/),
  language: patientLanguageSchema.nullable(),
  status: intakeStatusSchema,
  /** The office the person chose; null until they submit. */
  office: z.string().nullable(),
  expiresAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** The record the submission became, once accepted. */
  patientId: z.uuid().nullable(),
  submission: intakeSubmissionSchema.nullable(),
})
export type IntakeRequest = z.infer<typeof intakeRequestSchema>

/**
 * What the public page learns from a valid token: whose form this is (the
 * person's own name, prefilled) and in which language. Nothing else — a
 * token is a capability to *fill in* one form, not to read anything.
 */
export const intakeInviteSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  language: patientLanguageSchema.nullable(),
  expiresAt: z.iso.datetime(),
})
export type IntakeInvite = z.infer<typeof intakeInviteSchema>

/** A token is opaque text; length-capped so a garbage URL is refused cheaply. */
const token = z.string().min(16).max(256)

export const openIntakeInput = z.object({ token })
export type OpenIntakeInput = z.infer<typeof openIntakeInput>

/**
 * The person's submission: every demographics and clinical field, with the
 * office **required** (it decides the queue) — on the staff form it is
 * optional. No billing: the self-service form has no Billing tab.
 */
export const submitIntakeInput = z
  .object({ token, ...demographicsFields, ...clinicalFields, office: officeSchema })
  .transform(composeClinical)
export type SubmitIntakeInput = z.infer<typeof submitIntakeInput>

export const intakeByIdInput = z.object({ id: z.uuid() })
export type IntakeByIdInput = z.infer<typeof intakeByIdInput>

/**
 * Accepting is the front desk re-submitting the reviewed form — edits
 * included — so the patient is created from what the reviewer saw, not from
 * what the person typed. Billing is absent here too; it is entered on the
 * record afterwards.
 */
export const acceptIntakeInput = z
  .object({ id: z.uuid(), ...demographicsFields, ...clinicalFields })
  .transform(composeClinical)
export type AcceptIntakeInput = z.infer<typeof acceptIntakeInput>
