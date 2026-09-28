import { MEDICATION_FREQUENCIES } from "@fastehr/contracts"

/**
 * The frequency field is one stored string but two controls on the form: a
 * pick-list of `MEDICATION_FREQUENCIES` plus "Other", and a text box that
 * appears for "Other" (the Sep 27 decision on DIA-84). The form keeps the
 * two apart (`frequency` holds a list option or the sentinel, `frequencyOther`
 * the typed text) and composes them back into the contract's one field on
 * submit, so the contract, the wire, and the column know nothing of the
 * split. A stored value on the list selects it; any other text selects
 * "Other" with the text shown, so a row entered before the list existed
 * reads back as it was written.
 */

/** The select's value for "Other": not a frequency anyone would store. */
export const OTHER_FREQUENCY = "other"

export interface FrequencyFields {
  frequency: string
  frequencyOther: string
}

/** A stored frequency → the two controls. */
export function toFrequencyFields(stored: string | null | undefined): FrequencyFields {
  if (stored === null || stored === undefined || stored === "") return { frequency: "", frequencyOther: "" }
  if ((MEDICATION_FREQUENCIES as readonly string[]).includes(stored)) return { frequency: stored, frequencyOther: "" }
  return { frequency: OTHER_FREQUENCY, frequencyOther: stored }
}

/** The two controls → the one string the contract parses. */
export function composeFrequency({ frequency, frequencyOther }: FrequencyFields): string {
  return frequency === OTHER_FREQUENCY ? frequencyOther : frequency
}
