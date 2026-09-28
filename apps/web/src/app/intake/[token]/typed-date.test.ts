import { describe, expect, it } from "vitest"
import { isoDateFromTyped, maskTypedDate } from "./typed-date.ts"

/** Type a string one character at a time through the mask, as a keyboard would. */
function type(keys: string): string {
  let value = ""
  for (const key of keys) value = maskTypedDate(value + key, value)
  return value
}

describe("maskTypedDate", () => {
  it("adds the slashes as the digits arrive", () => {
    expect(type("0")).toBe("0")
    expect(type("03")).toBe("03/")
    expect(type("032")).toBe("03/2")
    expect(type("0321")).toBe("03/21/")
    expect(type("03211985")).toBe("03/21/1985")
  })

  it("ignores anything that is not a digit and stops at eight digits", () => {
    expect(type("03-21-1985")).toBe("03/21/1985")
    expect(type("032119859")).toBe("03/21/1985")
    expect(maskTypedDate("03/21/1985x", "03/21/1985")).toBe("03/21/1985")
  })

  it("accepts a pasted date in one keystroke", () => {
    expect(maskTypedDate("03211985", "")).toBe("03/21/1985")
    expect(maskTypedDate("3/21/1985", "")).toBe("32/11/985")
  })

  it("leaves a deletion alone so a slash can be backspaced over", () => {
    expect(maskTypedDate("03/21", "03/21/")).toBe("03/21")
    expect(maskTypedDate("03/2", "03/21")).toBe("03/2")
    expect(maskTypedDate("", "0")).toBe("")
  })

  it("resumes masking after a deletion", () => {
    expect(maskTypedDate("03/2", "03/")).toBe("03/2")
    expect(maskTypedDate("03/29", "03/2")).toBe("03/29/")
  })
})

describe("isoDateFromTyped", () => {
  it("turns the masked value into the ISO date the contract expects", () => {
    expect(isoDateFromTyped("03/21/1985")).toBe("1985-03-21")
    expect(isoDateFromTyped("3-1-1985")).toBe("1985-03-01")
  })

  it("passes an incomplete value through for the contract to refuse", () => {
    expect(isoDateFromTyped("03/21/")).toBe("03/21/")
    expect(isoDateFromTyped("")).toBe("")
  })
})
