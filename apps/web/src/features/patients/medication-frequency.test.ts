import { MEDICATION_FREQUENCIES } from "@fastehr/contracts"
import { describe, expect, it } from "vitest"
import { composeFrequency, OTHER_FREQUENCY, toFrequencyFields } from "./medication-frequency.ts"

describe("medication frequency round trip", () => {
  it("a stored option selects itself", () => {
    expect(toFrequencyFields("Twice daily")).toEqual({ frequency: "Twice daily", frequencyOther: "" })
  })

  it("stored text off the list selects Other with the text shown", () => {
    expect(toFrequencyFields("Every Tuesday")).toEqual({ frequency: OTHER_FREQUENCY, frequencyOther: "Every Tuesday" })
  })

  it("nothing stored selects nothing", () => {
    expect(toFrequencyFields(null)).toEqual({ frequency: "", frequencyOther: "" })
    expect(toFrequencyFields(undefined)).toEqual({ frequency: "", frequencyOther: "" })
    expect(toFrequencyFields("")).toEqual({ frequency: "", frequencyOther: "" })
  })

  it("composes back to the one string, Other text only when Other is chosen", () => {
    expect(composeFrequency({ frequency: "Weekly", frequencyOther: "" })).toBe("Weekly")
    expect(composeFrequency({ frequency: OTHER_FREQUENCY, frequencyOther: "Every Tuesday" })).toBe("Every Tuesday")
    // Text typed under Other and then a list option chosen: the option wins, the stale text is dropped.
    expect(composeFrequency({ frequency: "Weekly", frequencyOther: "Every Tuesday" })).toBe("Weekly")
    expect(composeFrequency({ frequency: "", frequencyOther: "" })).toBe("")
  })

  it("the sentinel is not on the list, so a stored option can never read back as Other", () => {
    expect(MEDICATION_FREQUENCIES).not.toContain(OTHER_FREQUENCY)
    for (const option of MEDICATION_FREQUENCIES) {
      expect(composeFrequency(toFrequencyFields(option))).toBe(option)
    }
  })
})
