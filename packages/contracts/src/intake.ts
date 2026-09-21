import { z } from 'zod'
import { INTAKE_CONSENT_VERSION, signatureMatchesName } from './intake-consent.ts'
import { locationOptionSchema, locationSlugSchema } from './location.ts'
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
 * Self-service intake (DIA-72, ADR 29 as amended).
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
 * the way the edit screen prefills from a record. Two things the person
 * gives are not patient-record fields and stay with the request: when they
 * would like to be called (`preferredContactTime`, kept in the submission
 * for the queue), and the treatment consent they signed (recorded on the
 * request row, for DIA-56 to take over).
 */

export const INTAKE_STATUSES = ['sent', 'submitted', 'accepted', 'rejected'] as const
export const intakeStatusSchema = z.enum(INTAKE_STATUSES)
export type IntakeStatus = z.infer<typeof intakeStatusSchema>

/**
 * How long a texted link works. One hour (the Sep 14 decision, down from
 * two days, and from a week before that): the person fills the form when
 * the text arrives, and a shorter window limits how long a leaked link is
 * worth anything. The front desk sends a fresh link when one lapses.
 */
export const INTAKE_LINK_TTL_HOURS = 1

/** When the person would like the clinic to call: the legacy intake's three options. */
export const INTAKE_CONTACT_TIMES = ['morning', 'afternoon', 'evening'] as const
export const intakeContactTimeSchema = z.enum(INTAKE_CONTACT_TIMES)
export type IntakeContactTime = z.infer<typeof intakeContactTimeSchema>

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
  /** Optional on read: a submission stored before the question was asked has no answer. */
  preferredContactTime: intakeContactTimeSchema.optional(),
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
        /** The person's own description of the condition (the Sep 14 review); optional on read. */
        details: optionalText,
      }),
    )
    .default([]),
  pcpName: optionalText,
  pcpAddress: optionalText,
  pcpPhone: optionalText,
  historyOther: optionalText,
})
export type IntakeSubmission = z.infer<typeof intakeSubmissionSchema>

/**
 * The consent as recorded on the request: who signed (the typed name), when
 * (server time, at submission), which text (its version key) and in which
 * language it was shown. The text itself is looked up by version.
 */
export const intakeConsentSchema = z.object({
  signature: z.string().min(1),
  signedAt: z.iso.datetime(),
  version: z.string().min(1),
  language: patientLanguageSchema,
})
export type IntakeConsent = z.infer<typeof intakeConsentSchema>

/** The request as the front desk sees it in the queue. The token hash never leaves the database. */
export const intakeRequestSchema = z.object({
  id: z.uuid(),
  /** What the front desk typed when sending; null when they gave only the phone (the Sep 14 decision). */
  firstName: z.string().min(1).nullable(),
  lastName: z.string().min(1).nullable(),
  phone: z.string().regex(/^\d{10}$/),
  language: patientLanguageSchema.nullable(),
  status: intakeStatusSchema,
  /** The office the person chose; null until they submit. */
  office: z.string().nullable(),
  /** The clinic that office names (ADR 32): the queue it waits in. Null until submitted. */
  locationId: locationSlugSchema.nullable(),
  expiresAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** The record the submission became, once accepted. */
  patientId: z.uuid().nullable(),
  submission: intakeSubmissionSchema.nullable(),
  /** Null until the person submits; a submission always carries one. */
  consent: intakeConsentSchema.nullable(),
})
export type IntakeRequest = z.infer<typeof intakeRequestSchema>

/**
 * What `intake.send` answers: the request, and the link **only when the
 * message was not delivered** — the console transport, in an environment
 * without text messaging — so a developer or tester can open it without
 * reading the server log. With messaging configured the link is null: the
 * token is in the person's text and nowhere else.
 */
export interface SendIntakeResult {
  request: IntakeRequest
  link: string | null
}

/**
 * What the public page learns from a valid token: whose form this is (the
 * person's own name, prefilled) and in which language. Nothing else — a
 * token is a capability to *fill in* one form, not to read anything.
 */
export const intakeInviteSchema = z.object({
  /** Prefilled from the request; empty when the front desk sent the link with only a phone. */
  firstName: z.string(),
  lastName: z.string(),
  language: patientLanguageSchema.nullable(),
  expiresAt: z.iso.datetime(),
  /** The clinics the person may choose to visit: the active locations, in order. */
  locations: z.array(locationOptionSchema),
})
export type IntakeInvite = z.infer<typeof intakeInviteSchema>

/** A token is opaque text; length-capped so a garbage URL is refused cheaply. */
const token = z.string().min(16).max(256)

export const openIntakeInput = z.object({ token })
export type OpenIntakeInput = z.infer<typeof openIntakeInput>

/**
 * The person's submission: every demographics and clinical field, with the
 * office **required** (it decides the queue) — on the staff form it is
 * optional — plus when to call them and the signed consent. No billing: the
 * self-service form has no Billing tab.
 *
 * The consent is three fields, all required: the acknowledgement box, the
 * version of the text the page showed (refused unless current, so a form
 * left open across a wording change cannot sign the old one), and the
 * typed signature, which must be the person's own name as entered above
 * (issue code `custom` on `consentSignature`).
 */
export const submitIntakeInput = z
  .object({
    token,
    ...demographicsFields,
    ...clinicalFields,
    office: officeSchema,
    preferredContactTime: intakeContactTimeSchema,
    consentAcknowledged: z.literal(true),
    consentVersion: z.literal(INTAKE_CONSENT_VERSION),
    consentSignature: z.string().trim().min(1).max(150),
  })
  .superRefine((value, ctx) => {
    // An empty signature already failed `min(1)`; one code per mistake.
    if (
      value.consentSignature !== '' &&
      !signatureMatchesName(value.consentSignature, value.firstName, value.lastName)
    ) {
      ctx.addIssue({ code: 'custom', path: ['consentSignature'] })
    }
    // A condition answered "Yes" needs the person's description (the Sep 14
    // review). Only here: the staff form leaves it optional, since a clinician
    // records the detail in the note.
    value.conditions.forEach((row, index) => {
      if (row.present && (row.details === undefined || row.details === '')) {
        ctx.addIssue({ code: 'custom', path: ['conditions', index, 'details'] })
      }
    })
  })
  .transform(composeClinical)
export type SubmitIntakeInput = z.infer<typeof submitIntakeInput>

export const intakeByIdInput = z.object({ id: z.uuid() })
export type IntakeByIdInput = z.infer<typeof intakeByIdInput>

/**
 * Accepting is the front desk re-submitting the reviewed form — edits
 * included — so the patient is created from what the reviewer saw, not from
 * what the person typed. Billing is absent here too; it is entered on the
 * record afterwards. The consent and contact time are not re-submitted:
 * they are the person's, recorded once, and stay on the request.
 */
export const acceptIntakeInput = z
  .object({ id: z.uuid(), ...demographicsFields, ...clinicalFields })
  .transform(composeClinical)
export type AcceptIntakeInput = z.infer<typeof acceptIntakeInput>
