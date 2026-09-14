/**
 * Height is stored as total inches (the legacy column) and always shown and
 * captured as feet plus inches, because patients asked for a total type the
 * inches part alone: "64" meaning 5 ft 4 in is right by luck, and "74" for
 * 6 ft 2 in is right by luck too, but "5" meaning five feet is not. Two
 * numbers in, one number stored, two numbers out.
 */

/** Total inches → the two fields, hundredths kept ("64.5" → 5 ft, 4.5 in). */
export function splitHeight(total: number | null): { heightFeet: string; heightInchesPart: string } {
  if (total === null) return { heightFeet: "", heightInchesPart: "" }
  const feet = Math.floor(total / 12)
  const inches = Math.round((total - feet * 12) * 100) / 100
  return { heightFeet: String(feet), heightInchesPart: String(inches) }
}

/** Total inches → what a clinician reads: "5 ft 4 in", never "64" (the Sep 7 sync). */
export function formatHeight(total: number | null): string {
  if (total === null) return "-"
  const { heightFeet, heightInchesPart } = splitHeight(total)
  return `${heightFeet} ft ${heightInchesPart} in`
}
