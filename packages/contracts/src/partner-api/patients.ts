import { z } from 'zod'
import { locationSlugSchema } from '../location.ts'
import { blankAsAbsent } from '../patient.ts'

/**
 * Patient lookup and verification on the partner API (ADR 38).
 *
 * Both are `POST` with a body, so no identifier lands in a URL or an access
 * log. Both inputs are strict objects: a field the contract does not
 * describe is refused, so a vendor cannot send a card number or an address
 * and have it silently stored.
 *
 * The lookup response is the minimum the bot needs to disambiguate and no
 * more, and in particular **no date of birth in any form**: lookup must
 * never return a verification factor, or a caller holding a last name and a
 * phone could collect the date of birth and pass verify without the
 * patient proving anything.
 */

/** Candidates a lookup may return; past this the bot asks for more and looks up again. */
export const PATIENT_LOOKUP_LIMIT = 5

const name = (max: number) => blankAsAbsent(z.string().trim().min(1).max(max))

/**
 * Exactly ten digits, the way every phone is stored, from anything a person
 * reads out: punctuation goes, and so does a leading country code 1, which
 * a vendor's telephony hands over in E.164.
 */
const phone = z
  .string()
  .transform((value) => {
    const digits = value.replace(/\D/g, '')
    return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  })
  .pipe(z.string().regex(/^\d{10}$/))
  .meta({ description: 'Ten digits. Punctuation and a leading 1 are stripped.' })

const dateOfBirth = z.iso.date().meta({ description: 'YYYY-MM-DD' })

/**
 * Either the patient id alone, or the date of birth plus at least one of
 * the phone or the last name. A caller who cannot give a date of birth gets
 * a callback task, not a record. Names match exactly, case-insensitively;
 * this is not the roster's substring search.
 */
export const partnerPatientLookupInput = z
  .strictObject({
    patientId: z.uuid().optional(),
    dateOfBirth: dateOfBirth.optional(),
    phone: phone.optional(),
    lastName: name(100),
    firstName: name(50),
  })
  .superRefine((input, ctx) => {
    if (input.patientId !== undefined) {
      for (const field of ['dateOfBirth', 'phone', 'lastName', 'firstName'] as const) {
        if (input[field] !== undefined) ctx.addIssue({ code: 'custom', path: [field], message: 'not with patientId' })
      }
      return
    }
    if (input.dateOfBirth === undefined) {
      ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'required without patientId' })
    }
    if (input.phone === undefined && input.lastName === undefined) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'phone or lastName is required' })
    }
    if (input.firstName !== undefined && input.lastName === undefined) {
      ctx.addIssue({ code: 'custom', path: ['lastName'], message: 'required with firstName' })
    }
  })
  .meta({
    id: 'PatientLookupRequest',
    description:
      'Two valid shapes. Shape A: patientId alone, nothing else. Shape B: dateOfBirth is required, plus phone and/or lastName (at least one of the two); firstName is optional and only allowed together with lastName. dateOfBirth alone, phone alone, lastName alone, or firstName without lastName are refused.',
  })
export type PartnerPatientLookupInput = z.infer<typeof partnerPatientLookupInput>

/**
 * What the repository returns for a lookup, and what the verify step reads:
 * identity plus both verification factors. Server-side only; a partner sees
 * the candidate shape below, never this.
 */
export const patientLookupRowSchema = z.object({
  patientId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.iso.date(),
  phone: z.string().regex(/^\d{10}$/).nullable(),
  locationId: locationSlugSchema.nullable(),
})
export type PatientLookupRow = z.infer<typeof patientLookupRowSchema>

/** What the repository is asked for: the normalised identifiers plus the key's clinic restriction. */
export interface PatientLookupCriteria {
  patientId?: string
  dateOfBirth?: string
  phone?: string
  lastName?: string
  firstName?: string
  /** Empty means every clinic. */
  locationIds: readonly string[]
  limit: number
}

export const partnerPatientCandidateSchema = z
  .strictObject({
    patientId: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    /** The last four digits of the phone on file, for "the number ending in 1234?". */
    phoneLast4: z.string().regex(/^\d{4}$/).nullable(),
    locationId: locationSlugSchema.nullable(),
  })
  .meta({ id: 'PatientCandidate' })
export type PartnerPatientCandidate = z.infer<typeof partnerPatientCandidateSchema>

export const partnerPatientLookupOutput = z
  .strictObject({
    candidates: z.array(partnerPatientCandidateSchema).max(PATIENT_LOOKUP_LIMIT),
    /** More patients matched than the cap allows: ask the caller for another identifier and look up again. */
    truncated: z.boolean(),
  })
  .meta({ id: 'PatientLookupResponse' })
export type PartnerPatientLookupOutput = z.infer<typeof partnerPatientLookupOutput>

export const partnerPatientParams = z.strictObject({ patientId: z.uuid() })
export type PartnerPatientParams = z.infer<typeof partnerPatientParams>

export const partnerVerifyPatientInput = z
  .strictObject({
    dateOfBirth,
    phone,
  })
  .meta({ id: 'PatientVerifyRequest', description: 'Both factors, exactly as the patient states them.' })
export type PartnerVerifyPatientInput = z.infer<typeof partnerVerifyPatientInput>

export const partnerVerifyPatientOutput = z
  .strictObject({
    verified: z.literal(true),
    /** Present on every patient-specific call in the X-Patient-Verification header. Not stored by the server. */
    verificationToken: z.string().min(16),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: 'PatientVerifyResponse' })
export type PartnerVerifyPatientOutput = z.infer<typeof partnerVerifyPatientOutput>
