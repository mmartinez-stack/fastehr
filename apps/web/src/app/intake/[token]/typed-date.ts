/**
 * The birthdate is typed, not picked (the Sep 14 review: patients found the
 * scrolling picker confusing), and the slashes are typed for them (the Sep
 * 28 request): the field reads "MM/DD/YYYY" and the person only enters the
 * digits. Both helpers are pure so the form stays a thin layer over them.
 */

/**
 * What the field shows after a keystroke: the digits typed so far with a
 * slash after the month and after the day, at most eight digits. Applied
 * only while the value grows. On a deletion the value is left as the
 * person made it, so backspacing over a slash removes it instead of having
 * it spring back, which would trap the caret in front of it.
 */
export function maskTypedDate(next: string, previous: string): string {
  if (next.length <= previous.length) return next
  const digits = next.replace(/\D/g, "").slice(0, 8)
  const month = digits.slice(0, 2)
  const day = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  if (digits.length < 2) return month
  if (digits.length < 4) return `${month}/${day}`
  return `${month}/${day}/${year}`
}

/**
 * Month/day/year with any separator becomes the ISO date the contract
 * expects; anything else passes through unchanged so the contract answers
 * with its `invalid_format` code and the copy explains.
 */
export function isoDateFromTyped(typed: string): string {
  const match = /^\s*(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})\s*$/.exec(typed)
  if (match === null) return typed.trim()
  const [, month, day, year] = match
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}
